import { createHash, randomUUID } from 'node:crypto';
import { copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ModPlan } from './types.js';
import { redact } from '../redact.js';
import { z } from 'zod';
import { portalReleaseSchema } from './schemas.js';

const pendingPlanSchema = z.object({
  id: z.string(), factorioVersion: z.string(), createdAt: z.string(),
  roots: z.array(z.object({ name: z.string(), version: z.string().optional(), enabled: z.boolean() })),
  selections: z.array(z.object({ name: z.string(), version: z.string(), explicit: z.boolean(), release: portalReleaseSchema })),
  optional: z.array(z.object({ from: z.string(), dependency: z.object({ kind: z.enum(['required', 'optional', 'recommended', 'hidden-optional', 'no-order', 'incompatible']), name: z.string(), operator: z.string().optional(), version: z.string().optional(), raw: z.string() }) })),
});
const trackedConfigSchema = z.object({ factorioVersion: z.string(), mods: z.array(z.object({ name: z.string(), version: z.string().optional(), enabled: z.boolean().optional() })) });
const trackedLockSchema = z.object({
  factorioVersion: z.string(),
  mods: z.array(z.object({ name: z.string(), version: z.string(), sha1: z.string(), fileName: z.string(), downloadUrl: z.string(), enabled: z.boolean().optional(), explicit: z.boolean() })),
});
const generationSchema = z.object({ id: z.string(), planId: z.string(), createdAt: z.string(), mods: z.array(z.object({ name: z.string(), version: z.string(), explicit: z.boolean(), enabled: z.boolean() })).default([]), plan: pendingPlanSchema.optional() });

export class ModInstaller {
  constructor(private readonly configRoot: string, private readonly runtimeRoot: string, private readonly username?: string, private readonly token?: string, private readonly log: (fields: Record<string, unknown>, message: string) => void = () => {}, private readonly cacheRoot = join(runtimeRoot, 'webui', 'mod-cache')) {}

  async stage(plan: ModPlan) {
    await mkdir(this.configRoot, { recursive: true });
    await this.writeTrackedConfig(plan);
    await atomicJson(join(this.configRoot, 'mods.pending.json'), plan);
    this.log({ planId: plan.id, modCount: plan.selections.length }, 'mod plan staged for next server start');
  }

  async stageFromCurrentConfig() {
    const config = trackedConfigSchema.parse(JSON.parse(await readFile(join(this.configRoot, 'mods.json'), 'utf8')));
    const lock = trackedLockSchema.parse(JSON.parse(await readFile(join(this.configRoot, 'mods.lock.json'), 'utf8')));
    const plan: ModPlan = {
      id: randomUUID(), factorioVersion: config.factorioVersion, createdAt: new Date().toISOString(), optional: [],
      roots: config.mods.map(mod => ({ ...mod, enabled: mod.enabled ?? true })),
      selections: lock.mods.filter(mod => mod.enabled ?? true).map(mod => ({
        name: mod.name, version: mod.version, explicit: mod.explicit,
        release: { download_url: mod.downloadUrl, file_name: mod.fileName, released_at: '', version: mod.version, sha1: mod.sha1, info_json: { factorio_version: lock.factorioVersion } },
      })),
    };
    await atomicJson(join(this.configRoot, 'mods.pending.json'), plan);
    this.log({ planId: plan.id, modCount: plan.selections.length }, 'existing mod lock staged for isolated profile start');
  }

  async installedMods() {
    try {
      const generation = generationSchema.parse(JSON.parse(await readFile(join(this.runtimeRoot, 'factorio', 'mods', '.generation.json'), 'utf8')));
      return generation.mods;
    } catch { return []; }
  }

  async hasPending() { try { await readFile(join(this.configRoot, 'mods.pending.json')); return true; } catch { return false; } }

  async applyPending() {
    const path = join(this.configRoot, 'mods.pending.json');
    let plan: ModPlan;
    try { plan = pendingPlanSchema.parse(JSON.parse(await readFile(path, 'utf8'))); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    const result = await this.apply(plan);
    await rm(path, { force: true });
    return result;
  }

  async apply(plan: ModPlan) {
    if (plan.selections.length > 0 && (!this.username || !this.token)) throw new Error('FACTORIO_USERNAME and FACTORIO_TOKEN are required to download mods');
    const username = this.username ?? '';
    const token = this.token ?? '';
    const generationId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
    const generations = join(this.runtimeRoot, 'webui', 'mod-generations');
    const staged = join(generations, `${generationId}.staging`);
    const activeMods = join(this.runtimeRoot, 'factorio', 'mods');
    let previous: string | null = null;
    let activated = false;
    await mkdir(staged, { recursive: true });
    this.log({ planId: plan.id, generationId, archiveCount: plan.selections.length }, 'mod generation staging started');
    try {
      for (const [index, selection] of plan.selections.entries()) {
        const progress = { planId: plan.id, generationId, modName: selection.name, modVersion: selection.version, modIndex: index + 1, modTotal: plan.selections.length };
        const archive = join(this.cacheRoot, `${selection.release.sha1.toLowerCase()}.zip`);
        const destination = join(staged, selection.release.file_name);
        if (!await exists(archive)) {
          const activeArchive = join(activeMods, selection.release.file_name);
          try {
            const activeBytes = await readFile(activeArchive);
            if (createHash('sha1').update(activeBytes).digest('hex') === selection.release.sha1) {
              await this.cacheArchive(archive, activeBytes);
              this.log(progress, 'seeded mod cache from active generation');
            }
          } catch { /* The exact archive is not part of the active generation. */ }
        }
        if (await exists(archive)) {
          await copyFile(archive, destination);
          this.log(progress, 'reusing cached mod archive');
          continue;
        }
        this.log(progress, 'downloading mod archive');
        const url = new URL(selection.release.download_url, 'https://mods.factorio.com');
        url.searchParams.set('username', username); url.searchParams.set('token', token);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Download failed for ${selection.name} (${response.status})`);
        const bytes = Buffer.from(await response.arrayBuffer());
        const actual = createHash('sha1').update(bytes).digest('hex');
        if (actual !== selection.release.sha1) throw new Error(`SHA1 mismatch for ${selection.name}@${selection.version}`);
        this.log({ ...progress, sha1: actual }, 'mod archive verified');
        await this.cacheArchive(archive, bytes);
        await copyFile(archive, destination);
      }
      await writeFile(join(staged, 'mod-list.json'), `${JSON.stringify({ mods: [{ name: 'base', enabled: true }, ...plan.selections.map(item => ({ name: item.name, enabled: true }))] }, null, 2)}\n`);
      await writeFile(join(staged, '.generation.json'), `${JSON.stringify({ id: generationId, planId: plan.id, createdAt: new Date().toISOString(), mods: plan.selections.map(item => ({ name: item.name, version: item.version, explicit: item.explicit, enabled: true })), plan }, null, 2)}\n`);
      await mkdir(join(this.runtimeRoot, 'factorio'), { recursive: true });
      previous = join(generations, `${generationId}.previous`);
      if (await exists(activeMods)) await rename(activeMods, previous);
      await rename(staged, activeMods);
      activated = true;
      this.log({ planId: plan.id, generationId, hasPreviousGeneration: await exists(previous) }, 'mod generation activated');
      return { generationId, previous: await exists(previous) ? previous : null };
    } catch (error) {
      this.log({ planId: plan.id, generationId, error: redact(error) }, 'mod generation staging failed');
      if (activated && previous && await exists(previous)) { await rename(activeMods, staged); await rename(previous, activeMods); }
      await rm(staged, { recursive: true, force: true });
      throw error;
    }
  }

  async rollback(previousPath: string) {
    const generation = generationSchema.parse(JSON.parse(await readFile(join(previousPath, '.generation.json'), 'utf8')));
    if (!generation.plan) throw new Error('Previous mod generation does not contain a restorable lock');
    const active = join(this.runtimeRoot, 'factorio', 'mods');
    const failed = join(this.runtimeRoot, 'webui', 'mod-generations', `failed-${Date.now()}`);
    if (await exists(active)) await rename(active, failed);
    await rename(previousPath, active);
    await this.writeTrackedConfig(generation.plan);
    await rm(join(this.configRoot, 'mods.pending.json'), { force: true });
    this.log({ previousPath, failedPath: failed }, 'mod generation rolled back');
  }

  async findRollbackCandidate() {
    const generations = join(this.runtimeRoot, 'webui', 'mod-generations');
    try {
      const names = (await readdir(generations)).filter(name => name.endsWith('.previous')).sort().reverse();
      for (const name of names) {
        const path = join(generations, name);
        try { if (generationSchema.parse(JSON.parse(await readFile(join(path, '.generation.json'), 'utf8'))).plan) return path; } catch { /* Ignore legacy/incomplete generations. */ }
      }
      return null;
    } catch { return null; }
  }

  private async writeTrackedConfig(plan: ModPlan) {
    await mkdir(this.configRoot, { recursive: true });
    await atomicJson(join(this.configRoot, 'mods.json'), { factorioVersion: plan.factorioVersion, mods: plan.roots });
    await atomicJson(join(this.configRoot, 'mods.lock.json'), { factorioVersion: plan.factorioVersion, generatedAt: new Date().toISOString(), mods: plan.selections.map(item => ({ name: item.name, version: item.version, sha1: item.release.sha1, fileName: item.release.file_name, downloadUrl: item.release.download_url, enabled: true, source: 'mod-portal', explicit: item.explicit })) });
  }

  private async cacheArchive(path: string, bytes: Buffer) {
    await mkdir(this.cacheRoot, { recursive: true });
    if (await exists(path)) return;
    const temp = `${path}.${randomUUID()}.tmp`;
    await writeFile(temp, bytes);
    await rename(temp, path);
  }
}
async function exists(path: string) { try { await readdir(path); return true; } catch { try { await readFile(path); return true; } catch { return false; } } }
async function atomicJson(path: string, value: unknown) { const temp = `${path}.tmp`; await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`); await rename(temp, path); }
