import { describe, expect, test } from '@rstest/core';
import { mkdtemp, readFile, utimes, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MAIN_SAVE_NAME, SaveService } from './save-service.js';

describe('SaveService', () => {
  test('materializes an import as a startup candidate without overwriting autosaves', async () => {
    const root = await mkdtemp(join(tmpdir(), 'factorio-saves-'));
    const saves = new SaveService(root);
    await saves.initialize();
    await writeFile(join(saves.savesDir, MAIN_SAVE_NAME), 'old world');
    await writeFile(join(saves.importsDir, 'new.zip'), 'new world');
    expect(await saves.materialize('imports', 'new.zip')).toBe('_webui-selected.zip');
    expect(await readFile(join(saves.savesDir, MAIN_SAVE_NAME), 'utf8')).toBe('old world');
    expect(await readFile(join(saves.savesDir, '_webui-selected.zip'), 'utf8')).toBe('new world');
  });

  test('rejects path traversal save names', async () => {
    const root = await mkdtemp(join(tmpdir(), 'factorio-saves-'));
    const saves = new SaveService(root);
    await saves.initialize();
    await expect(saves.materialize('imports', '../save.zip')).rejects.toThrow('Invalid save name');
  });

  test('lists _autosave1 as both the loaded save and a rotating autosave slot', async () => {
    const root = await mkdtemp(join(tmpdir(), 'factorio-saves-'));
    const saves = new SaveService(root);
    await saves.initialize();
    await writeFile(join(saves.savesDir, MAIN_SAVE_NAME), 'current world');
    const listing = await saves.list();
    expect(listing.main?.name).toBe(MAIN_SAVE_NAME);
    expect(listing.autosaves.map(item => item.name)).toContain(MAIN_SAVE_NAME);
  });

  test('sorts save collections by modification time newest first', async () => {
    const root = await mkdtemp(join(tmpdir(), 'factorio-saves-'));
    const saves = new SaveService(root);
    await saves.initialize();
    const older = join(saves.backupsDir, 'older.zip');
    const newer = join(saves.backupsDir, 'newer.zip');
    await writeFile(older, 'old'); await writeFile(newer, 'new');
    await utimes(older, new Date('2026-01-01'), new Date('2026-01-01'));
    await utimes(newer, new Date('2026-02-01'), new Date('2026-02-01'));
    const listing = await saves.list();
    expect(listing.backups.map(item => item.name)).toEqual(['newer.zip', 'older.zip']);
    expect(listing.backups[0]).toMatchObject({ size: 3, modifiedAt: new Date('2026-02-01').toISOString() });
  });
});
