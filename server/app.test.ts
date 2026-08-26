import { afterEach, describe, expect, test } from '@rstest/core';
import { mkdtemp, mkdir, readFile, readdir, utimes, writeFile } from 'node:fs/promises';
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
    expect(JSON.parse(await readFile(join(root, 'config/profiles/p1/factorio.json'), 'utf8'))).toEqual({ version: '2.0.76' });
    expect(JSON.parse(await readFile(join(root, 'config/profiles/p1/mods.pending.json'), 'utf8'))).toMatchObject({ factorioVersion: '2.0', selections: [] });
  });

  test('backs up an individual autosave and restores prior running state', async () => {
    const { app, adapter, root } = await fixture();
    adapter.state = { status: 'ready', running: true };
    await writeFile(join(root, 'runtime/profiles/p1/factorio/saves/_autosave1.zip'), 'world');
    const response = await app.inject({ method: 'POST', url: '/api/saves/backup-entry', payload: { kind: 'autosaves', name: '_autosave1.zip' } });
    expect(response.statusCode).toBe(202);
    await waitFor(() => adapter.calls.includes('start'));
    expect(adapter.calls).toEqual(['stop', 'start']);
  });

  test('lists configured mods and plans update, disable, and removal without mutating immediately', async () => {
    const { app, root } = await fixture();
    await writeFile(join(root, 'config/profiles/p1/mods.json'), JSON.stringify({ factorioVersion: '2.0', mods: [{ name: 'demo', enabled: true }] }));
    await writeFile(join(root, 'config/profiles/p1/mods.lock.json'), JSON.stringify({ mods: [{ name: 'demo', version: '1.0.0', explicit: true, enabled: true }] }));
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

  test('resolves and saves an accumulated editable mod list for the next start', async () => {
    const { app, root } = await fixture();
    await writeFile(join(root, 'config/profiles/p1/mods.json'), JSON.stringify({ factorioVersion: '2.0', mods: [{ name: 'NanoBot3', version: '1.0.0', enabled: true }] }));

    const plan = await app.inject({ method: 'POST', url: '/api/mods/plan-config', payload: {
      roots: [{ name: 'AutoGhostBuilder', enabled: true }],
    } });
    expect(plan.statusCode).toBe(200);
    expect(plan.json()).toMatchObject({ roots: [{ name: 'AutoGhostBuilder', enabled: true }], selections: [{ name: 'AutoGhostBuilder', explicit: true }] });
    expect(JSON.parse(await readFile(join(root, 'config/profiles/p1/mods.json'), 'utf8'))).toMatchObject({ mods: [{ name: 'AutoGhostBuilder', enabled: true }] });
    expect(JSON.parse(await readFile(join(root, 'config/profiles/p1/mods.pending.json'), 'utf8'))).toMatchObject({ roots: [{ name: 'AutoGhostBuilder', enabled: true }] });
    expect((await app.inject({ method: 'GET', url: '/api/overview' })).json().mods).toMatchObject({ roots: [{ name: 'AutoGhostBuilder', enabled: true }], pending: true });

    const details = await app.inject({ method: 'GET', url: '/api/mods/details?names=AutoGhostBuilder' });
    expect(details.statusCode).toBe(200);
    expect(details.json()).toEqual([{ name: 'AutoGhostBuilder', title: 'AutoGhostBuilder', summary: '', thumbnail: null }]);
  });

  test('selects an existing autosave for subsequent starts only while stopped', async () => {
    const { app, adapter, root } = await fixture();
    await writeFile(join(root, 'runtime/profiles/p1/factorio/saves/_autosave2.zip'), 'world');
    const selected = await app.inject({ method: 'POST', url: '/api/saves/next-launch', payload: { kind: 'autosaves', name: '_autosave2.zip' } });
    expect(selected.statusCode).toBe(200);
    expect(JSON.parse(await readFile(join(root, 'runtime/profiles/p1/webui/launch.json'), 'utf8'))).toEqual({ kind: 'autosaves', name: '_autosave2.zip', saveName: '_autosave2.zip' });
    adapter.state = { status: 'ready', running: true };
    const rejected = await app.inject({ method: 'POST', url: '/api/saves/next-launch', payload: { kind: 'autosaves', name: '_autosave1.zip' } });
    expect(rejected.statusCode).toBe(409);
  });

  test('uses the newest autosave as the default next launch', async () => {
    const { app, root } = await fixture();
    const savesRoot = join(root, 'runtime/profiles/p1/factorio/saves');
    const older = join(savesRoot, '_autosave1.zip');
    const latest = join(savesRoot, '_autosave4.zip');
    await writeFile(older, 'older world');
    await writeFile(latest, 'latest world');
    await utimes(older, new Date('2026-01-01'), new Date('2026-01-01'));
    await utimes(latest, new Date('2026-01-02'), new Date('2026-01-02'));

    const overview = await app.inject({ method: 'GET', url: '/api/overview' });
    expect(overview.json().saves.nextLaunch).toEqual({ kind: 'autosaves', name: '_autosave4.zip' });
  });

  test('checks available mod updates and stages them on explicit upgrade', async () => {
    const { app, root } = await fixture();
    await writeFile(join(root, 'config/profiles/p1/mods.json'), JSON.stringify({ factorioVersion: '2.0', mods: [{ name: 'demo', enabled: true }] }));
    await writeFile(join(root, 'config/profiles/p1/mods.lock.json'), JSON.stringify({ mods: [{ name: 'demo', version: '0.9.0', explicit: true, enabled: true }] }));

    const checked = await app.inject({ method: 'GET', url: '/api/mods/updates' });
    expect(checked.statusCode).toBe(200);
    expect(checked.json()).toMatchObject({ factorioVersion: '2.0', updates: [{ name: 'demo', currentVersion: '0.9.0', latestVersion: '1.0.0' }] });

    const upgraded = await app.inject({ method: 'POST', url: '/api/mods/upgrade' });
    expect(upgraded.statusCode).toBe(200);
    expect(upgraded.json()).toMatchObject({ roots: [{ name: 'demo', enabled: true }], selections: [{ name: 'demo', version: '1.0.0', explicit: true }] });
    expect(JSON.parse(await readFile(join(root, 'config/profiles/p1/mods.lock.json'), 'utf8'))).toMatchObject({ mods: [{ name: 'demo', version: '1.0.0' }] });
  });

  test('backs up the latest autosave and clears a one-off next launch after starting', async () => {
    const { app, adapter, root } = await fixture();
    const savesRoot = join(root, 'runtime/profiles/p1/factorio/saves');
    const launchPath = join(root, 'runtime/profiles/p1/webui/launch.json');
    const older = join(savesRoot, '_autosave1.zip');
    const latest = join(savesRoot, '_autosave4.zip');
    await writeFile(older, 'older world');
    await writeFile(latest, 'latest world');
    await utimes(older, new Date('2026-01-01'), new Date('2026-01-01'));
    await utimes(latest, new Date('2026-01-02'), new Date('2026-01-02'));
    await writeFile(join(root, 'runtime/profiles/p1/imports', 'temporary.zip'), 'temporary world');
    expect((await app.inject({ method: 'POST', url: '/api/saves/next-launch', payload: { kind: 'imports', name: 'temporary.zip' } })).statusCode).toBe(200);

    expect((await app.inject({ method: 'POST', url: '/api/server/start' })).statusCode).toBe(202);
    await waitFor(() => adapter.calls.includes('recreate'));
    await expect(readFile(launchPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    const backups = await readdir(join(root, 'runtime/profiles/p1/backups'));
    const backup = backups.find(name => /^before-selected-launch-.+\.zip$/.test(name));
    expect(backup).toBeDefined();
    expect(await readFile(join(root, 'runtime/profiles/p1/backups', backup!), 'utf8')).toBe('latest world');
  });

  test('downloads autosave, import, and backup candidates', async () => {
    const { app, root } = await fixture();
    await writeFile(join(root, 'runtime/profiles/p1/factorio/saves/_autosave2.zip'), 'autosave');
    await writeFile(join(root, 'runtime/profiles/p1/imports/imported.zip'), 'import');
    await writeFile(join(root, 'runtime/profiles/p1/backups/backup.zip'), 'backup');
    for (const [kind, name, content] of [['autosaves', '_autosave2.zip', 'autosave'], ['imports', 'imported.zip', 'import'], ['backups', 'backup.zip', 'backup']] as const) {
      const response = await app.inject({ method: 'GET', url: `/api/saves/${kind}/${name}/download` });
      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('application/zip');
      expect(response.headers['content-disposition']).toBe(`attachment; filename="${name}"`);
      expect(response.rawPayload.toString()).toBe(content);
    }
  });

  test('ordinary import only adds a save candidate to the active profile', async () => {
    const { app, adapter, root } = await fixture();
    const response = await uploadSave(app, '/api/saves/import', 'ordinary.zip');
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ name: 'ordinary.zip' });
    expect(adapter.calls).toEqual([]);
    expect(JSON.parse(await readFile(join(root, 'config/profiles/p1/factorio.json'), 'utf8'))).toEqual({ version: '2.0.77', channel: 'stable' });
    await expect(readFile(join(root, 'runtime/profiles/p1/webui/launch.json'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    expect(await readFile(join(root, 'runtime/profiles/p1/imports/ordinary.zip'))).toEqual(expect.any(Buffer));
  });

  test('quick import creates and activates an isolated profile from save configuration', async () => {
    const { app, adapter, root } = await fixture();
    const response = await uploadSave(app, '/api/profiles/quick-import', 'world.zip');
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ profile: { id: 'p2', name: 'P2' }, save: { name: 'world.zip' }, factorioVersion: '2.0.77', mods: [] });
    expect(adapter.calls).toEqual([]);
    expect(JSON.parse(await readFile(join(root, 'config/profiles/p1/factorio.json'), 'utf8'))).toEqual({ version: '2.0.77', channel: 'stable' });
    expect(JSON.parse(await readFile(join(root, 'config/profiles/p2/factorio.json'), 'utf8'))).toEqual({ version: '2.0.77' });
    expect(JSON.parse(await readFile(join(root, 'runtime/profiles/p2/webui/launch.json'), 'utf8'))).toEqual({ kind: 'imports', name: 'world.zip', saveName: '_webui-selected.zip' });
    expect(JSON.parse(await readFile(join(root, 'runtime/webui/profile.json'), 'utf8'))).toEqual({ activeId: 'p2' });
  });

  test('quick import does not treat bundled recycler as a portal mod', async () => {
    const { app } = await fixture();
    const response = await uploadSave(app, '/api/profiles/quick-import', 'recycler.zip', ['base', 'recycler']);
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({ mods: [] });
  });

  test('creates, renames, activates, and deletes isolated profiles', async () => {
    const { app, root } = await fixture();
    const response = await app.inject({ method: 'POST', url: '/api/profiles' });
    expect(response.statusCode).toBe(201);
    expect(response.json()).toEqual({ id: 'p2', name: 'P2' });
    expect(JSON.parse(await readFile(join(root, 'config/profiles/p2/factorio.json'), 'utf8'))).toMatchObject({ version: '2.0.77' });
    expect(JSON.parse(await readFile(join(root, 'config/profiles/p2/mods.pending.json'), 'utf8'))).toMatchObject({ selections: [] });
    expect((await app.inject({ method: 'PATCH', url: '/api/profiles/p2', payload: { name: 'Py Hard' } })).json()).toEqual({ id: 'p2', name: 'Py Hard' });
    expect((await app.inject({ method: 'POST', url: '/api/profiles/activate', payload: { id: 'p2' } })).statusCode).toBe(200);
    expect((await app.inject({ method: 'DELETE', url: '/api/profiles/p2' })).statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/api/overview' })).json().profiles).toMatchObject({ activeId: 'p1', items: [{ id: 'p1', name: 'P1' }] });
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
async function waitFor(predicate: () => boolean | Promise<boolean>) { for (let i = 0; i < 50; i++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 10)); } throw new Error('timeout'); }

async function uploadSave(app: Awaited<ReturnType<typeof buildApp>>, url: string, filename: string, mods?: string[]) {
  const archive = Buffer.from(zipSync({ 'imported/level-init.dat': levelInitFixture(mods) }));
  const boundary = 'factorio-save-boundary';
  const payload = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: application/zip\r\n\r\n`),
    archive,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  return app.inject({ method: 'POST', url, headers: { 'content-type': `multipart/form-data; boundary=${boundary}` }, payload });
}

function levelInitFixture(mods = ['base']) {
  const bytes: number[] = [];
  const u8 = (value: number) => bytes.push(value);
  const u16 = (value: number) => bytes.push(value & 255, value >> 8);
  const u32 = (value: number) => bytes.push(value & 255, value >> 8 & 255, value >> 16 & 255, value >> 24 & 255);
  const text = (value: string) => { const encoded = new TextEncoder().encode(value); u8(encoded.length); bytes.push(...encoded); };
  u16(2); u16(0); u16(77); u16(0); u8(0);
  text('freeplay'); text(''); text('base'); u8(0); u8(0); u8(0); text('');
  u8(1); u8(0); u8(0); u8(0); u8(2); u8(0); u8(77); u32(1); u8(2); bytes.push(0, 0, 160, 0);
  u8(mods.length);
  for (const mod of mods) { text(mod); u8(2); u8(0); u8(77); u32(0); }
  return Uint8Array.from(bytes);
}
