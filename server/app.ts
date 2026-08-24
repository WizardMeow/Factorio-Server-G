import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { basename, join, resolve } from 'node:path';
import type { ComposeAdapter } from './types.js';
import { OperationConflictError, OperationManager } from './operation-manager.js';
import { SaveService } from './save-service.js';
import { redact } from './redact.js';
import { ModPortalClient, type ModMetadataProvider } from './mods/portal-client.js';
import { ModResolver } from './mods/resolver.js';
import { ModInstaller } from './mods/installer.js';
import { normalizeModName } from './mods/versions.js';
import type { ModPlan } from './mods/types.js';
import { modApplyBodySchema, modPlanBodySchema, savePromoteBodySchema, serverActionParamsSchema, versionBodySchema } from '../shared/contracts.js';

interface AppOptions { projectRoot: string; adapter: ComposeAdapter; serveFrontend?: boolean; modProvider?: ModMetadataProvider; modInstaller?: ModInstaller }

export async function buildApp(options: AppOptions) {
  const app = Fastify({ logger: true });
  const runtimeRoot = resolve(options.projectRoot, 'runtime');
  const operations = new OperationManager(join(runtimeRoot, 'webui', 'operations.json'), (fields, message) => app.log.info(fields, message));
  const saves = new SaveService(runtimeRoot);
  const resolver = new ModResolver(options.modProvider ?? new ModPortalClient(), (fields, message) => app.log.info(fields, message));
  const installer = options.modInstaller ?? new ModInstaller(options.projectRoot, process.env.FACTORIO_USERNAME, process.env.FACTORIO_TOKEN, (fields, message) => app.log.info(fields, message));
  const plans = new Map<string, ModPlan>();
  let rollbackPath: string | null = await installer.findRollbackCandidate();
  await Promise.all([operations.initialize(), saves.initialize()]);
  await app.register(multipart, { limits: { fileSize: 1024 * 1024 * 1024, files: 1 } });

  app.setErrorHandler((error, request, reply) => {
    const conflict = error instanceof OperationConflictError;
    request.log.error({ err: redact(error), operationId: operations.snapshot.active?.id }, 'request failed');
    reply.code(conflict ? 409 : 500).send({ error: redact(error) });
  });

  app.get('/api/overview', async () => ({
    server: await options.adapter.inspect(), operations: operations.snapshot,
    saves: await saves.list(), config: await readConfig(options.projectRoot),
    settings: await readSettings(runtimeRoot), modRollbackAvailable: Boolean(rollbackPath),
  }));
  app.get('/api/operations', async () => operations.snapshot);

  app.post<{ Body: { input?: string; version?: string; optional?: string[] } }>('/api/mods/plan', async (request, reply) => {
    const parsed = modPlanBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'input is required' });
    const input = parsed.data.input;
    const config = await readModConfig(options.projectRoot);
    const root = { name: normalizeModName(input), version: parsed.data.version || undefined };
    const existing = config.mods.filter(item => item.name !== root.name);
    const optional = (parsed.data.optional ?? []).map(name => ({ name: normalizeModName(name) }));
    const plan = await resolver.resolve(config.factorioVersion, [...existing, root, ...optional]);
    plans.set(plan.id, plan);
    request.log.info({ planId: plan.id, roots: plan.roots.map(item => item.name), resolvedCount: plan.selections.length }, 'mod plan resolved');
    return reply.send(plan);
  });

  app.post<{ Body: { planId?: string } }>('/api/mods/apply', async (request, reply) => {
    const parsed = modApplyBodySchema.safeParse(request.body);
    const plan = parsed.success ? plans.get(parsed.data.planId) : undefined;
    if (!plan) return reply.code(404).send({ error: 'Plan not found or expired' });
    if ((await options.adapter.inspect()).running) return reply.code(409).send({ error: 'Factorio must be stopped before installing mods' });
    const operation = await operations.run('install-mods', 'recreating', async setStage => {
      const applied = await installer.apply(plan);
      rollbackPath = applied.previous;
      await setStage('starting');
      await options.adapter.start();
      await waitUntilRunning(options.adapter, setStage);
    });
    return reply.code(202).send(operation);
  });

  app.post('/api/mods/rollback', async (_request, reply) => {
    if (!rollbackPath) return reply.code(409).send({ error: 'No previous mod generation is available' });
    if ((await options.adapter.inspect()).running) return reply.code(409).send({ error: 'Factorio must be stopped before rolling back mods' });
    const previous = rollbackPath;
    const operation = await operations.run('rollback-mods', 'recreating', async setStage => {
      await installer.rollback(previous);
      rollbackPath = null;
      await setStage('starting');
      await options.adapter.start();
      await waitUntilRunning(options.adapter, setStage);
    });
    return reply.code(202).send(operation);
  });

  app.post<{ Params: { action: string } }>('/api/server/:action', async (request, reply) => {
    const parsed = serverActionParamsSchema.safeParse(request.params);
    if (!parsed.success) return reply.code(404).send({ error: 'Unknown action' });
    const action = parsed.data.action;
    const stage = action === 'stop' ? 'stopping' : 'starting';
    const operation = await operations.run(action, stage, async setStage => {
      if (action === 'start') await options.adapter.start();
      if (action === 'stop') await options.adapter.stop();
      if (action === 'restart') await options.adapter.restart();
      if (action !== 'stop') await waitUntilRunning(options.adapter, setStage);
    });
    return reply.code(202).send(operation);
  });

  app.put<{ Body: { version?: string } }>('/api/config/version', async (request, reply) => {
    const parsed = versionBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid Factorio version' });
    const version = parsed.data.version.trim();
    const current = await options.adapter.inspect();
    if (current.running) return reply.code(409).send({ error: 'Factorio must be stopped before changing version' });
    const previous = await readConfig(options.projectRoot);
    const configPath = join(options.projectRoot, 'config', 'factorio.json');
    const operation = await operations.run('change-version', 'pulling', async setStage => {
      await writeJsonAtomic(configPath, { version });
      try {
        await options.adapter.pull();
        await setStage('recreating');
        await options.adapter.recreate();
        await setStage('starting');
        await waitUntilRunning(options.adapter, setStage);
      } catch (error) {
        await writeJsonAtomic(configPath, previous);
        throw error;
      }
    });
    return reply.code(202).send(operation);
  });

  app.post('/api/saves/import', async (request, reply) => {
    if (operations.snapshot.active) return reply.code(409).send({ error: 'Another operation is active' });
    const file = await request.file();
    if (!file || !file.filename.endsWith('.zip')) return reply.code(400).send({ error: 'A .zip save is required' });
    const safeName = basename(file.filename);
    const temp = join(saves.importsDir, `${safeName}.uploading`);
    await pipeline(file.file, createWriteStream(temp));
    await rename(temp, join(saves.importsDir, safeName));
    return reply.code(201).send({ name: safeName });
  });

  app.post('/api/saves/backup', async (_request, reply) => {
    const before = await options.adapter.inspect();
    const operation = await operations.run('backup', 'backing-up', async setStage => {
      if (before.running) { await setStage('stopping'); await options.adapter.stop(); }
      await setStage('backing-up');
      await saves.backup();
      if (before.running) { await setStage('starting'); await options.adapter.start(); await waitUntilRunning(options.adapter, setStage); }
    });
    return reply.code(202).send(operation);
  });

  app.post<{ Body: { kind?: 'imports' | 'backups'; name?: string } }>('/api/saves/promote', async (request, reply) => {
    const parsed = savePromoteBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'kind and a .zip name are required' });
    const { kind, name } = parsed.data;
    if ((await options.adapter.inspect()).running) return reply.code(409).send({ error: 'Factorio must be stopped before replacing save.zip' });
    const operation = await operations.run('restore-save', 'restoring', async () => saves.promote(kind, name));
    return reply.code(202).send(operation);
  });

  app.get<{ Params: { name: string } }>('/api/saves/backups/:name', async (request, reply) => {
    const name = basename(request.params.name);
    if (name !== request.params.name || !name.endsWith('.zip')) return reply.code(400).send({ error: 'Invalid save name' });
    return reply.type('application/zip').header('content-disposition', `attachment; filename="${name}"`).send(createReadStream(join(saves.backupsDir, name)));
  });

  app.get('/api/events', async (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
    const send = (event: string, data: unknown) => reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const onOperation = (snapshot: unknown) => send('operation', snapshot);
    operations.on('change', onOperation);
    for (const line of await options.adapter.recentLogs(500).catch(() => [])) send('log', { line });
    const controller = new AbortController();
    void options.adapter.followLogs(line => send('log', { line: redact(line) }), controller.signal).catch(error => send('error', { error: redact(error) }));
    request.raw.on('close', () => { operations.off('change', onOperation); controller.abort(); });
  });

  if (options.serveFrontend) {
    await app.register(staticPlugin, { root: process.env.FRONTEND_ROOT || join(options.projectRoot, 'dist'), wildcard: false });
    app.setNotFoundHandler((_request, reply) => reply.sendFile('index.html'));
  }
  return app;
}

async function waitUntilRunning(adapter: ComposeAdapter, setStage: (stage: 'ready' | 'failed') => Promise<void>) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const state = await adapter.inspect();
    if (state.status === 'ready') { await setStage('ready'); return; }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  throw new Error('Factorio did not become ready before timeout');
}

async function readConfig(root: string) {
  return JSON.parse(await readFile(join(root, 'config', 'factorio.json'), 'utf8')) as { version: string };
}
async function readModConfig(root: string) {
  return JSON.parse(await readFile(join(root, 'config', 'mods.json'), 'utf8')) as { factorioVersion: string; mods: Array<{ name: string; version?: string }> };
}
async function readSettings(runtimeRoot: string) {
  try {
    const value = JSON.parse(await readFile(join(runtimeRoot, 'factorio', 'config', 'server-settings.json'), 'utf8')) as Record<string, unknown>;
    return Object.fromEntries(Object.entries(value).filter(([key]) => !/password|token|credential/i.test(key)));
  } catch { return null; }
}
async function writeJsonAtomic(path: string, value: unknown) { await mkdir(resolve(path, '..'), { recursive: true }); const temp = `${path}.tmp`; await writeFile(temp, `${JSON.stringify(value, null, 2)}\n`); await rename(temp, path); }
