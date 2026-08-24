import { copyFile, mkdir, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { profileMetadataSchema, profileStateSchema } from './persistence-schemas.js';

export interface ProfileSummary { id: string; name: string }
export interface ProfileContext extends ProfileSummary { configRoot: string; runtimeRoot: string }

export class ProfileService {
  constructor(private readonly projectRoot: string) {}

  async initialize() {
    const profilesRoot = join(this.projectRoot, 'config', 'profiles');
    await mkdir(profilesRoot, { recursive: true });
    const existing = await readdir(profilesRoot, { withFileTypes: true });
    if (existing.some(entry => entry.isDirectory() && /^p\d+$/.test(entry.name))) return;
    const defaultConfig = join(profilesRoot, 'p1');
    await mkdir(defaultConfig, { recursive: true });
    await Promise.all([
      writeIfMissing(join(defaultConfig, 'factorio.json'), { version: '2.0.77', channel: 'stable' }),
      writeIfMissing(join(defaultConfig, 'mods.json'), { factorioVersion: '2.0', mods: [] }),
      writeIfMissing(join(defaultConfig, 'mods.lock.json'), { factorioVersion: '2.0', generatedAt: null, mods: [] }),
    ]);
    await writeIfMissing(join(defaultConfig, 'profile.json'), { name: 'P1' });
  }

  async list(): Promise<ProfileSummary[]> {
    await this.initialize();
    const root = join(this.projectRoot, 'config', 'profiles');
    const entries = await readdir(root, { withFileTypes: true });
    return Promise.all(entries.filter(entry => entry.isDirectory()).map(async entry => {
      const metadata = await readJson(join(root, entry.name, 'profile.json'), profileMetadataSchema).catch(() => profileMetadataSchema.parse({}));
      return { id: entry.name, name: metadata.name || entry.name };
    })).then(items => items.sort((left, right) => profileNumber(left.id) - profileNumber(right.id)));
  }

  async activeId() {
    const value = await readJson(join(this.projectRoot, 'runtime', 'webui', 'profile.json'), profileStateSchema).catch(() => profileStateSchema.parse({}));
    const profiles = await this.list();
    return profiles.some(profile => profile.id === value.activeId) ? value.activeId! : profiles[0]!.id;
  }

  async context(id?: string): Promise<ProfileContext> {
    const profileId = id ?? await this.activeId();
    const profile = (await this.list()).find(item => item.id === profileId);
    if (!profile) throw new Error(`Unknown profile: ${profileId}`);
    return {
      ...profile,
      configRoot: join(this.projectRoot, 'config', 'profiles', profileId),
      runtimeRoot: join(this.projectRoot, 'runtime', 'profiles', profileId),
    };
  }

  async create() {
    const profiles = await this.list();
    const nextNumber = Math.max(0, ...profiles.map(profile => profileNumber(profile.id))) + 1;
    const name = `P${nextNumber}`;
    const id = `p${nextNumber}`;
    const source = await this.context();
    const target = join(this.projectRoot, 'config', 'profiles', id);
    const staging = `${target}.creating`;
    await mkdir(staging, { recursive: true });
    try {
      await Promise.all(['factorio.json', 'mods.json', 'mods.lock.json'].map(file => copyFile(join(source.configRoot, file), join(staging, file))));
      await writeFile(join(staging, 'profile.json'), `${JSON.stringify({ name }, null, 2)}\n`);
      await rename(staging, target);
    } catch (error) { await rm(staging, { recursive: true, force: true }); throw error; }
    return { id, name };
  }

  async activate(id: string) {
    await this.context(id);
    const path = join(this.projectRoot, 'runtime', 'webui', 'profile.json');
    await mkdir(join(this.projectRoot, 'runtime', 'webui'), { recursive: true });
    await writeFile(path, `${JSON.stringify({ activeId: id }, null, 2)}\n`);
  }

  async remove(id: string) {
    await this.context(id);
    await rm(join(this.projectRoot, 'config', 'profiles', id), { recursive: true, force: true });
    await rm(join(this.projectRoot, 'runtime', 'profiles', id), { recursive: true, force: true });
  }

  async rename(id: string, name: string) {
    const profile = await this.context(id);
    await writeFile(join(profile.configRoot, 'profile.json'), `${JSON.stringify({ name: name.trim() }, null, 2)}\n`);
    return { id, name: name.trim() };
  }
}

function profileNumber(id: string) { return Number(/^p(\d+)$/.exec(id)?.[1] ?? Number.MAX_SAFE_INTEGER); }

async function readJson<T>(path: string, schema: { parse(value: unknown): T }): Promise<T> { return schema.parse(JSON.parse(await readFile(path, 'utf8'))); }
async function writeIfMissing(path: string, value: unknown) {
  try { await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
}
