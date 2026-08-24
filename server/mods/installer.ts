import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ModPlan } from './types.js';
import { redact } from '../redact.js';

export class ModInstaller {
  constructor(private readonly projectRoot: string, private readonly username?: string, private readonly token?: string, private readonly log: (fields: Record<string, unknown>, message: string) => void = () => {}) {}

  async apply(plan: ModPlan) {
    if (!this.username || !this.token) throw new Error('FACTORIO_USERNAME and FACTORIO_TOKEN are required to download mods');
    const generationId = `${new Date().toISOString().replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}`;
    const runtimeRoot = join(this.projectRoot, 'runtime');
    const generations = join(runtimeRoot, 'webui', 'mod-generations');
    const staged = join(generations, `${generationId}.staging`);
    const activeMods = join(runtimeRoot, 'factorio', 'mods');
    let previous: string | null = null;
    let activated = false;
    await mkdir(staged, { recursive: true });
    this.log({ planId: plan.id, generationId, archiveCount: plan.selections.length }, 'mod generation staging started');
    try {
      for (const selection of plan.selections) {
        this.log({ planId: plan.id, generationId, modName: selection.name, modVersion: selection.version }, 'downloading mod archive');
        const url = new URL(selection.release.download_url, 'https://mods.factorio.com');
        url.searchParams.set('username', this.username); url.searchParams.set('token', this.token);
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Download failed for ${selection.name} (${response.status})`);
        const bytes = Buffer.from(await response.arrayBuffer());
        const actual = createHash('sha1').update(bytes).digest('hex');
        if (actual !== selection.release.sha1) throw new Error(`SHA1 mismatch for ${selection.name}@${selection.version}`);
        this.log({ planId: plan.id, generationId, modName: selection.name, sha1: actual }, 'mod archive verified');
        await writeFile(join(staged, selection.release.file_name), bytes);
      }
      await writeFile(join(staged, 'mod-list.json'), `${JSON.stringify({ mods: [{ name: 'base', enabled: true }, ...plan.selections.map(item => ({ name: item.name, enabled: true }))] }, null, 2)}\n`);
      await writeFile(join(staged, '.generation.json'), `${JSON.stringify({ id: generationId, planId: plan.id, createdAt: new Date().toISOString() }, null, 2)}\n`);
      await mkdir(join(runtimeRoot, 'factorio'), { recursive: true });
      previous = join(generations, `${generationId}.previous`);
      if (await exists(activeMods)) await rename(activeMods, previous);
      await rename(staged, activeMods);
      activated = true;
      await this.writeTrackedConfig(plan);
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
    const runtimeRoot = join(this.projectRoot, 'runtime');
    const active = join(runtimeRoot, 'factorio', 'mods');
    const failed = join(runtimeRoot, 'webui', 'mod-generations', `failed-${Date.now()}`);
    if (await exists(active)) await rename(active, failed);
    await rename(previousPath, active);
    this.log({ previousPath, failedPath: failed }, 'mod generation rolled back');
  }

  async findRollbackCandidate() {
    const generations = join(this.projectRoot, 'runtime', 'webui', 'mod-generations');
    try {
      const names = (await readdir(generations)).filter(name => name.endsWith('.previous')).sort().reverse();
      return names[0] ? join(generations, names[0]) : null;
    } catch { return null; }
  }

  private async writeTrackedConfig(plan: ModPlan) {
    const configDir = join(this.projectRoot, 'config');
    await mkdir(configDir, { recursive: true });
    await atomicJson(join(configDir, 'mods.json'), { factorioVersion: plan.factorioVersion, mods: plan.roots });
    await atomicJson(join(configDir, 'mods.lock.json'), { factorioVersion: plan.factorioVersion, generatedAt: new Date().toISOString(), mods: plan.selections.map(item => ({ name: item.name, version: item.version, sha1: item.release.sha1, fileName: item.release.file_name, downloadUrl: item.release.download_url, enabled: true, source: 'mod-portal', explicit: item.explicit })) });
  }
}
async function exists(path: string) { try { await readdir(path); return true; } catch { try { await readFile(path); return true; } catch { return false; } } }
async function atomicJson(path: string, value: unknown) { const temp = `${path}.tmp`; await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`); await rename(temp, path); }
