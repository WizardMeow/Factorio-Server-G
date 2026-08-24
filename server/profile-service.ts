import { constants } from 'node:fs';
import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export interface ProfileSummary { id: string; name: string }
export interface ProfileContext extends ProfileSummary { configRoot: string; runtimeRoot: string }

export class ProfileService {
  constructor(private readonly projectRoot: string) {}

  async initialize() {
    const defaultConfig = join(this.projectRoot, 'config', 'profiles', 'default');
    await mkdir(defaultConfig, { recursive: true });
    await Promise.all(['factorio.json', 'mods.json', 'mods.lock.json'].map(async name => {
      try { await copyFile(join(this.projectRoot, 'config', name), join(defaultConfig, name), constants.COPYFILE_EXCL); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
    }));
    await writeIfMissing(join(defaultConfig, 'profile.json'), { name: 'Default' });
  }

  async list(): Promise<ProfileSummary[]> {
    await this.initialize();
    const root = join(this.projectRoot, 'config', 'profiles');
    const entries = await readdir(root, { withFileTypes: true });
    return Promise.all(entries.filter(entry => entry.isDirectory()).map(async entry => {
      const metadata = await readJson<{ name?: string }>(join(root, entry.name, 'profile.json')).catch((): { name?: string } => ({}));
      return { id: entry.name, name: metadata.name || entry.name };
    })).then(items => items.sort((left, right) => left.id === 'default' ? -1 : right.id === 'default' ? 1 : left.name.localeCompare(right.name)));
  }

  async activeId() {
    const value = await readJson<{ activeId?: string }>(join(this.projectRoot, 'runtime', 'webui', 'profile.json')).catch((): { activeId?: string } => ({}));
    const profiles = await this.list();
    return profiles.some(profile => profile.id === value.activeId) ? value.activeId! : 'default';
  }

  async context(id?: string): Promise<ProfileContext> {
    id ??= await this.activeId();
    const profile = (await this.list()).find(item => item.id === id);
    if (!profile) throw new Error(`Unknown profile: ${id}`);
    return {
      ...profile,
      configRoot: join(this.projectRoot, 'config', 'profiles', id),
      runtimeRoot: id === 'default' ? join(this.projectRoot, 'runtime') : join(this.projectRoot, 'runtime', 'profiles', id),
    };
  }

  async create(name: string) {
    const base = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'profile';
    const existing = new Set((await this.list()).map(profile => profile.id));
    let id = base;
    for (let suffix = 2; existing.has(id); suffix++) id = `${base}-${suffix}`;
    const source = await this.context();
    const target = join(this.projectRoot, 'config', 'profiles', id);
    await mkdir(target, { recursive: true });
    await Promise.all(['factorio.json', 'mods.json', 'mods.lock.json'].map(file => copyFile(join(source.configRoot, file), join(target, file))));
    await writeFile(join(target, 'profile.json'), `${JSON.stringify({ name: name.trim() }, null, 2)}\n`);
    return { id, name: name.trim() };
  }

  async activate(id: string) {
    await this.context(id);
    const path = join(this.projectRoot, 'runtime', 'webui', 'profile.json');
    await mkdir(join(this.projectRoot, 'runtime', 'webui'), { recursive: true });
    await writeFile(path, `${JSON.stringify({ activeId: id }, null, 2)}\n`);
  }
}

async function readJson<T>(path: string): Promise<T> { return JSON.parse(await readFile(path, 'utf8')) as T; }
async function writeIfMissing(path: string, value: unknown) {
  try { await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' }); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
}
