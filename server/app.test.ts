import { afterEach, describe, expect, test } from '@rstest/core';
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildApp } from './app.js';
import { FakeAdapter } from './test/fake-adapter.js';

const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => { await Promise.all(apps.splice(0).map(app => app.close())); });

describe('core HTTP flows', () => {
  test('starts Factorio asynchronously and exposes operation progress', async () => {
    const { app, adapter } = await fixture();
    const response = await app.inject({ method: 'POST', url: '/api/server/start' });
    expect(response.statusCode).toBe(202);
    await waitFor(() => adapter.calls.includes('start'));
    const overview = await app.inject({ method: 'GET', url: '/api/overview' });
    expect(overview.statusCode).toBe(200);
    expect(overview.json().server.status).toBe('ready');
  });

  test('requires a stopped server for version changes', async () => {
    const { app, adapter } = await fixture();
    adapter.state = { status: 'ready', running: true };
    const response = await app.inject({ method: 'PUT', url: '/api/config/version', payload: { version: 'stable' } });
    expect(response.statusCode).toBe(409);
    expect(adapter.calls).toEqual([]);
  });

  test('stops, backs up, and restores prior running state', async () => {
    const { app, adapter, root } = await fixture();
    adapter.state = { status: 'ready', running: true };
    await writeFile(join(root, 'runtime/factorio/saves/_autosave1.zip'), 'world');
    const response = await app.inject({ method: 'POST', url: '/api/saves/backup' });
    expect(response.statusCode).toBe(202);
    await waitFor(() => adapter.calls.includes('start'));
    expect(adapter.calls).toEqual(['stop', 'start']);
  });

  test('lists configured mods and plans update, disable, and removal without mutating immediately', async () => {
    const { app, root } = await fixture();
    await writeFile(join(root, 'config/mods.json'), JSON.stringify({ factorioVersion: '2.0', mods: [{ name: 'demo', enabled: true }] }));
    await writeFile(join(root, 'config/mods.lock.json'), JSON.stringify({ mods: [{ name: 'demo', version: '1.0.0', explicit: true, enabled: true }] }));
    const overview = await app.inject({ method: 'GET', url: '/api/overview' });
    expect(overview.json().mods).toMatchObject({ roots: [{ name: 'demo', enabled: true }], installed: [{ name: 'demo', version: '1.0.0' }] });

    const update = await app.inject({ method: 'POST', url: '/api/mods/change-plan', payload: { action: 'update', name: 'demo', version: '1.0.0' } });
    expect(update.statusCode).toBe(200);
    expect(update.json().selections).toHaveLength(1);
    const disable = await app.inject({ method: 'POST', url: '/api/mods/change-plan', payload: { action: 'set-enabled', name: 'demo', enabled: false } });
    expect(disable.json()).toMatchObject({ roots: [{ name: 'demo', enabled: false }], selections: [] });
    const remove = await app.inject({ method: 'POST', url: '/api/mods/change-plan', payload: { action: 'remove', name: 'demo' } });
    expect(remove.json()).toMatchObject({ roots: [], selections: [] });
  });
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'factorio-app-'));
  await mkdir(join(root, 'config'), { recursive: true });
  await writeFile(join(root, 'config/factorio.json'), JSON.stringify({ version: 'latest' }));
  await writeFile(join(root, 'config/mods.json'), JSON.stringify({ factorioVersion: '2.0', mods: [] }));
  await writeFile(join(root, 'config/mods.lock.json'), JSON.stringify({ factorioVersion: '2.0', mods: [] }));
  await writeFile(join(root, 'config/server-settings.json'), JSON.stringify({ visibility: { public: false, lan: false } }));
  const adapter = new FakeAdapter();
  const app = await buildApp({ projectRoot: root, adapter, modProvider: { async getMod(name) { return { name, title: name, summary: '', releases: [{ version: '1.0.0', download_url: `/download/${name}`, file_name: `${name}_1.0.0.zip`, released_at: '2026-01-01T00:00:00Z', sha1: '0'.repeat(40), info_json: { factorio_version: '2.0', dependencies: [] } }] }; } } });
  apps.push(app);
  return { app, adapter, root };
}
async function waitFor(predicate: () => boolean) { for (let i = 0; i < 50; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); } throw new Error('timeout'); }
