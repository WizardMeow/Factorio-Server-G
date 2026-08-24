import { describe, expect, test } from '@rstest/core';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MAIN_SAVE_NAME, SaveService } from './save-service.js';

describe('SaveService', () => {
  test('protects the current main save before promoting an import', async () => {
    const root = await mkdtemp(join(tmpdir(), 'factorio-saves-'));
    const saves = new SaveService(root);
    await saves.initialize();
    await writeFile(join(saves.savesDir, MAIN_SAVE_NAME), 'old world');
    await writeFile(join(saves.importsDir, 'new.zip'), 'new world');
    await saves.promote('imports', 'new.zip');
    expect(await readFile(join(saves.savesDir, MAIN_SAVE_NAME), 'utf8')).toBe('new world');
    const listing = await saves.list();
    expect(listing.backups).toHaveLength(1);
    expect(await readFile(join(saves.backupsDir, listing.backups[0].name), 'utf8')).toBe('old world');
  });

  test('rejects path traversal save names', async () => {
    const root = await mkdtemp(join(tmpdir(), 'factorio-saves-'));
    const saves = new SaveService(root);
    await saves.initialize();
    await expect(saves.promote('imports', '../save.zip')).rejects.toThrow('Invalid save name');
  });
});
