import { copyFile, mkdir, readdir, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';

export interface SaveEntry { name: string; size: number; modifiedAt: string }

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
    return { main: await this.info(join(this.savesDir, 'save.zip')), autosaves: await this.entries(this.savesDir, /^_autosave.*\.zip$/), imports: await this.entries(this.importsDir), backups: await this.entries(this.backupsDir) };
  }
  async backup(prefix = 'manual') {
    const name = `${prefix}-${new Date().toISOString().replace(/[:.]/g, '-')}.zip`;
    await copyFile(join(this.savesDir, 'save.zip'), join(this.backupsDir, name));
    return name;
  }
  async promote(kind: 'imports' | 'backups', name: string) {
    this.validateName(name);
    const current = await this.info(join(this.savesDir, 'save.zip'));
    if (current) await this.backup('protected');
    await copyFile(join(kind === 'imports' ? this.importsDir : this.backupsDir, name), join(this.savesDir, 'save.zip'));
  }
  private validateName(name: string) { if (basename(name) !== name || !name.endsWith('.zip')) throw new Error('Invalid save name'); }
  private async entries(dir: string, pattern = /\.zip$/): Promise<SaveEntry[]> {
    return (await readdir(dir)).filter(name => pattern.test(name)).map(name => join(dir, name)).reduce(async (promise, path) => [...await promise, (await this.info(path))!], Promise.resolve([] as SaveEntry[]));
  }
  private async info(path: string): Promise<SaveEntry | null> {
    try { const value = await stat(path); return { name: basename(path), size: value.size, modifiedAt: value.mtime.toISOString() }; }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
  }
}
