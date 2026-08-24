import { afterEach, describe, expect, rs, test } from '@rstest/core';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { ModInstaller } from './installer.js';
import type { ModPlan } from './types.js';

afterEach(() => rs.restoreAllMocks());
describe('ModInstaller', () => {
  test('verifies downloads and atomically activates a generation', async () => {
    const root = await mkdtemp(join(tmpdir(), 'factorio-mods-'));
    await mkdir(join(root, 'runtime/factorio/mods'), { recursive: true });
    await writeFile(join(root, 'runtime/factorio/mods/old.zip'), 'old');
    const bytes = Buffer.from('archive');
    rs.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(bytes));
    const plan = fixturePlan(createHash('sha1').update(bytes).digest('hex'));
    const result = await new ModInstaller(root, 'user', 'secret').apply(plan);
    expect(await readFile(join(root, 'runtime/factorio/mods/demo_1.0.0.zip'), 'utf8')).toBe('archive');
    expect(JSON.parse(await readFile(join(root, 'config/mods.lock.json'), 'utf8')).mods[0]).toMatchObject({ name: 'demo', version: '1.0.0', explicit: true });
    expect(result.previous).not.toBeNull();
    expect(await readFile(join(result.previous!, 'old.zip'), 'utf8')).toBe('old');
  });

  test('does not replace active mods when SHA1 validation fails', async () => {
    const root = await mkdtemp(join(tmpdir(), 'factorio-mods-'));
    await mkdir(join(root, 'runtime/factorio/mods'), { recursive: true });
    await writeFile(join(root, 'runtime/factorio/mods/old.zip'), 'old');
    rs.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('corrupt'));
    await expect(new ModInstaller(root, 'user', 'secret').apply(fixturePlan('0'.repeat(40)))).rejects.toThrow('SHA1 mismatch');
    expect(await readFile(join(root, 'runtime/factorio/mods/old.zip'), 'utf8')).toBe('old');
  });
});

function fixturePlan(sha1: string): ModPlan { return { id: '00000000-0000-4000-8000-000000000001', factorioVersion: '2.0', roots: [{ name: 'demo' }], optional: [], createdAt: '2026-01-01T00:00:00Z', selections: [{ name: 'demo', version: '1.0.0', explicit: true, release: { download_url: '/download/demo', file_name: 'demo_1.0.0.zip', released_at: '2026-01-01T00:00:00Z', version: '1.0.0', sha1, info_json: { factorio_version: '2.0' } } }] }; }
