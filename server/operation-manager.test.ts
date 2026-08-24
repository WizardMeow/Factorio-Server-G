import { describe, expect, test } from '@rstest/core';
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { OperationConflictError, OperationManager } from './operation-manager.js';

describe('OperationManager', () => {
  test('rejects overlapping operations and records completion', async () => {
    const root = await mkdtemp(join(tmpdir(), 'factorio-ops-'));
    const manager = new OperationManager(join(root, 'operations.json'));
    await manager.initialize();
    let release!: () => void;
    const gate = new Promise<void>(resolve => { release = resolve; });
    const first = await manager.run('start', 'starting', async setStage => { await gate; await setStage('ready'); });
    await expect(manager.run('backup', 'backing-up', async () => {})).rejects.toBeInstanceOf(OperationConflictError);
    release();
    await waitFor(() => !manager.snapshot.active);
    expect(manager.snapshot.history[0]).toMatchObject({ id: first.id, stage: 'completed', result: 'succeeded' });
  });

  test('marks an unfinished persisted operation as interrupted', async () => {
    const root = await mkdtemp(join(tmpdir(), 'factorio-ops-'));
    const path = join(root, 'operations.json');
    await writeFile(path, JSON.stringify([{ id: 'lost', kind: 'pull', stage: 'pulling', startedAt: 'x', updatedAt: 'x' }]));
    const manager = new OperationManager(path);
    await manager.initialize();
    expect(manager.snapshot.history[0].result).toBe('interrupted');
    expect(JSON.parse(await readFile(path, 'utf8'))[0].result).toBe('interrupted');
  });
});

async function waitFor(predicate: () => boolean) { for (let i = 0; i < 30; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); } throw new Error('timeout'); }
