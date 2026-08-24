import { copyFile, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';

export interface SaveEntry { name: string; size: number; modifiedAt: string }
export const MAIN_SAVE_NAME = '_autosave1.zip';

export class SaveService {
  readonly savesDir: string;
  readonly importsDir: string;
  readonly backupsDir: string;
  constructor(runtimeRoot: string) {
    this.savesDir = join(runtimeRoot, 'factorio', 'saves');
    this.importsDir = join(runtimeRoot, 'imports');
    this.backupsDir = join(runtimeRoot, 'backups');
  }
  async initialize() { await Promise.all([this.savesDir, this.importsDir, this.backupsDir].map(path => mkdir(path, { recursive: true }))); }
  async list() {
    return { main: await this.info(join(this.savesDir, MAIN_SAVE_NAME)), autosaves: await this.entries(this.savesDir, /^_autosave.*\.zip$/), imports: await this.entries(this.importsDir), backups: await this.entries(this.backupsDir) };
  }
  async backup(sourceName = MAIN_SAVE_NAME, prefix = 'manual') {
    this.validateName(sourceName);
    const name = `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
    await copyFile(join(this.savesDir, sourceName), join(this.backupsDir, name));
    return name;
  }
  async backupEntry(kind: 'autosaves' | 'imports' | 'backups', name: string) {
    this.validateName(name);
    const backupName = `backup-${kind}-${name.replace(/\.zip$/, '')}-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
    await copyFile(this.pathFor(kind, name), join(this.backupsDir, backupName));
    return backupName;
  }
  async deleteEntry(kind: 'imports' | 'backups', name: string) { this.validateName(name); await rm(this.pathFor(kind, name)); }
  async materialize(kind: 'autosaves' | 'imports' | 'backups', name: string) {
    this.validateName(name);
    if (kind === 'autosaves') return name;
    const target = '_webui-selected.zip';
    await copyFile(join(kind === 'imports' ? this.importsDir : this.backupsDir, name), join(this.savesDir, target));
    return target;
  }
  private validateName(name: string) { if (basename(name) !== name || !name.endsWith('.zip')) throw new Error('Invalid save name'); }
  private pathFor(kind: 'autosaves' | 'imports' | 'backups', name: string) { return join(kind === 'autosaves' ? this.savesDir : kind === 'imports' ? this.importsDir : this.backupsDir, name); }
  private async entries(dir: string, pattern = /\.zip$/): Promise<SaveEntry[]> {
    const entries = await Promise.all((await readdir(dir)).filter(name => pattern.test(name)).map(name => this.info(join(dir, name))));
    return entries.filter((entry): entry is SaveEntry => Boolean(entry)).sort((left, right) => Date.parse(right.modifiedAt) - Date.parse(left.modifiedAt) || left.name.localeCompare(right.name));
  }
  private async info(path: string): Promise<SaveEntry | null> {
    try { const value = await stat(path); return { name: basename(path), size: value.size, modifiedAt: value.mtime.toISOString() }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  }
}
