import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { factorioConfigSchema, launchSaveSchema, modConfigSchema, modLockViewSchema, partialLaunchSaveSchema, serverSettingsSchema, type LaunchSave } from './persistence-schemas.js';

interface FileSnapshot { path: string; content: Buffer | null }

export class ProfileDataStore {
  constructor(readonly configRoot: string, readonly runtimeRoot: string) {}

  readFactorioConfig() { return this.readJson('config', 'factorio.json', factorioConfigSchema); }
  readModConfig() { return this.readJson('config', 'mods.json', modConfigSchema); }
  async readModLock() {
    try { return await this.readJson('config', 'mods.lock.json', modLockViewSchema); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { mods: [] }; throw error; }
  }
  async readSettings() {
    try {
      const value = await this.readJson('runtime', join('factorio', 'config', 'server-settings.json'), serverSettingsSchema);
      return Object.fromEntries(Object.entries(value).filter(([key]) => !/password|token|credential/i.test(key)));
    } catch { return null; }
  }
  async readNextLaunch(): Promise<LaunchSave> {
    try {
      const value = await this.readJson('runtime', join('webui', 'launch.json'), partialLaunchSaveSchema);
      return value.kind && value.name && value.saveName ? launchSaveSchema.parse(value) : defaultLaunch();
    } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return defaultLaunch(); throw error; }
  }
  writeFactorioConfig(value: unknown) { return this.writeJson(join(this.configRoot, 'factorio.json'), factorioConfigSchema.parse(value)); }
  writeNextLaunch(value: unknown) { return this.writeJson(join(this.runtimeRoot, 'webui', 'launch.json'), launchSaveSchema.parse(value)); }

  async withFileRollback<T>(paths: string[], work: () => Promise<T>): Promise<T> {
    const snapshots = await Promise.all(paths.map(path => this.snapshot(path)));
    try { return await work(); }
    catch (error) { await Promise.all(snapshots.map(snapshot => this.restore(snapshot))); throw error; }
  }

  private async readJson<T>(root: 'config' | 'runtime', path: string, schema: { parse(value: unknown): T }): Promise<T> {
    return schema.parse(JSON.parse(await readFile(join(root === 'config' ? this.configRoot : this.runtimeRoot, path), 'utf8')));
  }
  private async writeJson(path: string, value: unknown) {
    await mkdir(resolve(path, '..'), { recursive: true });
    const temp = `${path}.tmp`;
    await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`);
    await rename(temp, path);
  }
  private async snapshot(path: string): Promise<FileSnapshot> {
    try { return { path, content: await readFile(path) }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return { path, content: null }; throw error; }
  }
  private async restore(snapshot: FileSnapshot) {
    if (snapshot.content === null) await rm(snapshot.path, { force: true });
    else { await mkdir(resolve(snapshot.path, '..'), { recursive: true }); await writeFile(snapshot.path, snapshot.content); }
  }
}

function defaultLaunch(): LaunchSave { return { kind: 'autosaves', name: '_autosave1.zip', saveName: '_autosave1.zip' }; }
