import { afterEach, describe, expect, test } from '@rstest/core';
import { mkdtemp, mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildApp } from './app.js';
import { FakeAdapter } from './test/fake-adapter.js';
import { zipSync } from 'fflate';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });

describe('core HTTP flows', () => {
  test('starts Factorio asynchronously and exposes operation progress', async () => {
    const { app, adapter } = await fixture();
    const response = await app.inject({ method: 'POST', url: '/api/server/start' });
    expect(response.statusCode).toBe(202);
    await waitFor(() => adapter.calls.includes('recreate'));
    expect(adapter.calls.slice(0, 2)).toEqual(['pull', 'recreate']);
    const overview = await app.inject({ method: 'GET', url: '/api/overview' });
    expect(overview.statusCode).toBe(200);
    expect(overview.json().server.status).toBe('ready');
  });

  test('requires a stopped server for version changes', async () => {
    const { app, adapter } = await fixture();
    adapter.state = { status: 'ready', running: true };
    const response = await app.inject({ method: 'PUT', url: '/api/config/version', payload: { version: '2.0.77', channel: 'stable' } });
    expect(response.statusCode).toBe(409);
    expect(adapter.calls).toEqual([]);
  });

  test('stages an exact version and compatible mod plan without downloading', async () => {
    const { app, adapter, root } = await fixture();
    const response = await app.inject({ method: 'PUT', url: '/api/config/version', payload: { version: '2.0.76' } });
    expect(response.statusCode).toBe(200);
    expect(adapter.calls).toEqual([]);
    expect(JSON.parse(await readFile(join(root, 'config/profiles/default/factorio.json'), 'utf8'))).toEqual({ version: '2.0.76' });
    expect(JSON.parse(await readFile(join(root, 'config/profiles/default/mods.pending.json'), 'utf8'))).toMatchObject({ factorioVersion: '2.0', selections: [] });
  });

  test('backs up an individual autosave and restores prior running state', async () => {
    const { app, adapter, root } = await fixture();
    adapter.state = { status: 'ready', running: true };
    await writeFile(join(root, 'runtime/factorio/saves/_autosave1.zip'), 'world');
    const response = await app.inject({ method: 'POST', url: '/api/saves/backup-entry', payload: { kind: 'autosaves', name: '_autosave1.zip' } });
    expect(response.statusCode).toBe(202);
    await waitFor(() => adapter.calls.includes('start'));
    expect(adapter.calls).toEqual(['stop', 'start']);
  });

  test('lists configured mods and plans update, disable, and removal without mutating immediately', async () => {
    const { app, root } = await fixture();
    await writeFile(join(root, 'config/profiles/default/mods.json'), JSON.stringify({ factorioVersion: '2.0', mods: [{ name: 'demo', enabled: true }] }));
    await writeFile(join(root, 'config/profiles/default/mods.lock.json'), JSON.stringify({ mods: [{ name: 'demo', version: '1.0.0', explicit: true, enabled: true }] }));
    const overview = await app.inject({ method: 'GET', url: '/api/overview' });
    expect(overview.json().mods).toMatchObject({ roots: [{ name: 'demo', enabled: true }], resolved: [{ name: 'demo', version: '1.0.0' }], installed: [], pending: false });

    const update = await app.inject({ method: 'POST', url: '/api/mods/change-plan', payload: { action: 'update', name: 'demo', version: '1.0.0' } });
    expect(update.statusCode).toBe(200);
    expect(update.json().selections).toHaveLength(1);
    const disable = await app.inject({ method: 'POST', url: '/api/mods/change-plan', payload: { action: 'set-enabled', name: 'demo', enabled: false } });
    expect(disable.json()).toMatchObject({ roots: [{ name: 'demo', enabled: false }], selections: [] });
    const remove = await app.inject({ method: 'POST', url: '/api/mods/change-plan', payload: { action: 'remove', name: 'demo' } });
    expect(remove.json()).toMatchObject({ roots: [], selections: [] });
  });

  test('selects an existing autosave for subsequent starts only while stopped', async () => {
    const { app, adapter, root } = await fixture();
    await writeFile(join(root, 'runtime/factorio/saves/_autosave2.zip'), 'world');
    const selected = await app.inject({ method: 'POST', url: '/api/saves/next-launch', payload: { kind: 'autosaves', name: '_autosave2.zip' } });
    expect(selected.statusCode).toBe(200);
    expect(JSON.parse(await readFile(join(root, 'runtime/webui/launch.json'), 'utf8'))).toEqual({ kind: 'autosaves', name: '_autosave2.zip', saveName: '_autosave2.zip' });
    adapter.state = { status: 'ready', running: true };
    const rejected = await app.inject({ method: 'POST', url: '/api/saves/next-launch', payload: { kind: 'autosaves', name: '_autosave1.zip' } });
    expect(rejected.statusCode).toBe(409);
  });

  test('one-click import stages exact save configuration without downloading', async () => {
    const { app, adapter, root } = await fixture();
    const archive = Buffer.from(zipSync({ 'imported/level-init.dat': levelInitFixture() }));
    const boundary = 'factorio-save-boundary';
    const payload = Buffer.concat([
      Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="world.zip"\r\nContent-Type: application/zip\r\n\r\n`),
      archive,
      Buffer.from(`\r\n--${boundary}--\r\n`),
    ]);
    const response = await app.inject({ method: 'POST', url: '/api/saves/import', headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, payload });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ name: 'world.zip', factorioVersion: '2.0.77', mods: [] });
    expect(adapter.calls).toEqual([]);
    expect(JSON.parse(await readFile(join(root, 'config/profiles/default/factorio.json'), 'utf8'))).toEqual({ version: '2.0.77' });
    expect(JSON.parse(await readFile(join(root, 'runtime/webui/launch.json'), 'utf8'))).toEqual({ kind: 'imports', name: 'world.zip', saveName: '_webui-selected.zip' });
  });

  test('creates an isolated profile with its own staged mods and saves', async () => {
    const { app, root } = await fixture();
    const response = await app.inject({ method: 'POST', url: '/api/profiles', payload: { name: 'Py Hard' } });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ id: 'py-hard', name: 'Py Hard' });
    expect(JSON.parse(await readFile(join(root, 'config/profiles/py-hard/factorio.json'), 'utf8'))).toMatchObject({ version: '2.0.77' });
    expect(JSON.parse(await readFile(join(root, 'config/profiles/py-hard/mods.pending.json'), 'utf8'))).toMatchObject({ selections: [] });
    expect((await app.inject({ method: 'POST', url: '/api/profiles/activate', payload: { id: 'py-hard' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/overview' })).json().profiles.activeId).toBe('py-hard');
  });
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'factorio-app-'));
  await mkdir(join(root, 'config'), { recursive: true });
  await writeFile(join(root, 'config/factorio.json'), JSON.stringify({ version: '2.0.77', channel: 'stable' }));
  await writeFile(join(root, 'config/mods.json'), JSON.stringify({ factorioVersion: '2.0', mods: [] }));
  await writeFile(join(root, 'config/mods.lock.json'), JSON.stringify({ factorioVersion: '2.0', mods: [] }));
  await writeFile(join(root, 'config/server-settings.json'), JSON.stringify({ visibility: { public: false, lan: false } }));
  const adapter = new FakeAdapter();
  const app = await buildApp({ projectRoot: root, adapter, modProvider: { async getMod(name) { return { name, title: name, summary: '', releases: [{ version: '1.0.0', download_url: `/download/${name}`, file_name: `${name}_1.0.0.zip`, released_at: '2026-01-01T00:00:00Z', sha1: '0'.repeat(40), info_json: { factorio_version: '2.0', dependencies: [] } }] }; } } });
  apps.push(app);
  return { app, adapter, root };
}
async function waitFor(predicate: () => boolean) { for (let i = 0; i < 50; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); } throw new Error('timeout'); }

function levelInitFixture() {
  const bytes: number[] = [];
  const u8 = (value: number) => bytes.push(value);
  const u16 = (value: number) => bytes.push(value & 255, value >> 8);
  const u32 = (value: number) => bytes.push(value & 255, value >> 8 & 255, value >> 16 & 255, value >> 24 & 255);
  const text = (value: string) => { const encoded = new TextEncoder().encode(value); u8(encoded.length); bytes.push(...encoded); };
  u16(2); u16(0); u16(77); u16(0); u8(0);
  text('freeplay'); text(''); text('base'); u8(0); u8(0); u8(0); text('');
  u8(1); u8(0); u8(0); u8(0); u8(2); u8(0); u8(77); u32(1); u8(2); bytes.push(0, 0, 160, 0);
  u8(1); text('base'); u8(2); u8(0); u8(77); u32(0);
  return Uint8Array.from(bytes);
}
