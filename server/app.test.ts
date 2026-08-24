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
    await writeFile(join(root, 'runtime/factorio/saves/save.zip'), 'world');
    const response = await app.inject({ method: 'POST', url: '/api/saves/backup' });
    expect(response.statusCode).toBe(202);
    await waitFor(() => adapter.calls.includes('start'));
    expect(adapter.calls).toEqual(['stop', 'start']);
  });
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'factorio-app-'));
  await mkdir(join(root, 'config'), { recursive: true });
  await writeFile(join(root, 'config/factorio.json'), JSON.stringify({ version: 'latest' }));
  const adapter = new FakeAdapter();
  const app = await buildApp({ projectRoot: root, adapter });
  apps.push(app);
  return { app, adapter, root };
}
async function waitFor(predicate: () => boolean) { for (let i = 0; i < 50; i++) { if (predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); } throw new Error('timeout'); }
