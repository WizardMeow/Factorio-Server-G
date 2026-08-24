import Fastify from 'fastify';
import multipart from '@fastify/multipart';
import staticPlugin from '@fastify/static';
import { constants, createReadStream, createWriteStream } from 'node:fs';
import { copyFile, mkdir, rename, rm } from 'node:fs/promises';
import { pipeline } from 'node:stream/promises';
import { basename, join, resolve } from 'node:path';
import type { ComposeAdapter } from './types.js';
import { OperationConflictError, OperationManager } from './operation-manager.js';
import { SaveService } from './save-service.js';
import { redact } from './redact.js';
import { classifyContainerLog } from './log-source.js';
import { ProfileService } from './profile-service.js';
import { ModPortalClient, type ModMetadataProvider } from './mods/portal-client.js';
import { ModResolver } from './mods/resolver.js';
import { ModInstaller } from './mods/installer.js';
import { normalizeModName } from './mods/versions.js';
import type { ConfiguredMod, ModPlan } from './mods/types.js';
import { inspectFactorioSave } from './save-inspector.js';
import { fetchFactorioVersions } from './factorio-versions.js';
import { ProfileDataStore } from './profile-data-store.js';
import { ServerOperations } from './server-operations.js';
import { modApplyBodySchema, modChangePlanBodySchema, modPlanBodySchema, profileActivateBodySchema, profileCreateBodySchema, saveBackupBodySchema, saveDeleteBodySchema, saveDownloadParamsSchema, saveImportResultSchema, saveNextLaunchBodySchema, serverActionParamsSchema, versionBodySchema } from '../shared/contracts.js';

interface AppOptions { projectRoot: string; adapter: ComposeAdapter; serveFrontend?: boolean; modProvider?: ModMetadataProvider }
const BUILT_IN_MODS = new Set(['base', 'core', 'elevated-rails', 'quality', 'space-age']);

export async function buildApp(options: AppOptions) {
  const app = Fastify({ logger: true });
  const runtimeRoot = resolve(options.projectRoot, 'runtime');
  const operations = new OperationManager(join(runtimeRoot, 'webui', 'operations.json'), (fields, message) => app.log.info(fields, message));
  const profiles = new ProfileService(options.projectRoot);
  const resolver = new ModResolver(options.modProvider ?? new ModPortalClient(), (fields, message) => app.log.info(fields, message));
  const plans = new Map<string, { profileId: string; plan: ModPlan }>();
  await profiles.initialize();
  await operations.initialize();
  await activeServices();
  await app.register(multipart, { limits: { fileSize: 1024 * 1024 * 1024, files: 1 } });

  async function activeServices() {
    const profile = await profiles.context();
    const saves = new SaveService(profile.runtimeRoot);
    await Promise.all([saves.initialize(), ensureDefaultServerSettings(options.projectRoot, profile.runtimeRoot)]);
    const installer = new ModInstaller(profile.configRoot, profile.runtimeRoot, process.env.FACTORIO_USERNAME, process.env.FACTORIO_TOKEN, (fields, message) => app.log.info({ profileId: profile.id, ...fields }, message));
    return { profile, saves, installer, data: new ProfileDataStore(profile.configRoot, profile.runtimeRoot) };
  }
  const serverOperations = new ServerOperations(options.adapter, operations, activeServices);

  app.setErrorHandler((error, request, reply) => {
    const conflict = error instanceof OperationConflictError;
    request.log.error({ err: redact(error), operationId: operations.snapshot.active?.id }, 'request failed');
    reply.code(conflict ? 409 : 500).send({ error: redact(error) });
  });

  app.get('/api/overview', async request => {
    const { profile, saves, installer, data } = await activeServices();
    const [modConfig, modLock] = await Promise.all([data.readModConfig(), data.readModLock()]);
    const saveList = await saves.list();
    const launch = await data.readNextLaunch();
    const selectedSave = saveList[launch.kind].find(entry => entry.name === launch.name) ?? null;
    return {
      server: await options.adapter.inspect(), operations: operations.snapshot,
      saves: { autosaves: saveList.autosaves, imports: saveList.imports, backups: saveList.backups, selected: selectedSave, nextLaunch: { kind: launch.kind, name: launch.name } }, config: await data.readFactorioConfig(),
      mods: {
        roots: normalizeConfiguredMods(modConfig.mods),
        resolved: modLock.mods.map(mod => ({ name: mod.name, version: mod.version, explicit: mod.explicit, enabled: mod.enabled ?? true })),
        installed: await installer.installedMods(), pending: await installer.hasPending(),
      },
      profiles: { activeId: profile.id, items: await profiles.list() },
      connection: process.env.FACTORIO_ADDRESS
        ? { address: `${process.env.FACTORIO_ADDRESS}:${process.env.FACTORIO_PORT || '34197'}`, configured: true }
        : { address: null, configured: false },
      settings: await data.readSettings(), modRollbackAvailable: Boolean(await installer.findRollbackCandidate()),
    };
  });
  app.get('/api/operations', async () => operations.snapshot);
  app.get('/api/config/version-options', async () => fetchFactorioVersions());

  app.post('/api/profiles', async (request, reply) => {
    const parsed = profileCreateBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Profile name is required' });
    if (operations.snapshot.active) return reply.code(409).send({ error: 'Another operation is active' });
    const profile = await operations.runExclusive('create-profile', 'recreating', async () => {
      const created = await profiles.create(parsed.data.name);
      const context = await profiles.context(created.id);
      const profileInstaller = new ModInstaller(context.configRoot, context.runtimeRoot, process.env.FACTORIO_USERNAME, process.env.FACTORIO_TOKEN, (fields, message) => app.log.info({ profileId: created.id, ...fields }, message));
      await Promise.all([new SaveService(context.runtimeRoot).initialize(), ensureDefaultServerSettings(options.projectRoot, context.runtimeRoot), profileInstaller.stageFromCurrentConfig()]);
      return created;
    });
    request.log.info({ profileId: profile.id }, 'profile created');
    return reply.code(201).send(profile);
  });

  app.post('/api/profiles/activate', async (request, reply) => {
    const parsed = profileActivateBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Profile id is required' });
    if (operations.snapshot.active) return reply.code(409).send({ error: 'Another operation is active' });
    if ((await options.adapter.inspect()).running) return reply.code(409).send({ error: 'Factorio must be stopped before switching profiles' });
    await operations.runExclusive('activate-profile', 'recreating', async () => { await profiles.activate(parsed.data.id); await activeServices(); });
    request.log.info({ profileId: parsed.data.id }, 'profile activated');
    return reply.send({ id: parsed.data.id });
  });

  app.post('/api/mods/plan', async (request, reply) => {
    const parsed = modPlanBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'input is required' });
    if (operations.snapshot.active) return reply.code(409).send({ error: 'Another operation is active' });
    if ((await options.adapter.inspect()).running) return reply.code(409).send({ error: 'Factorio must be stopped before planning mods' });
    const input = parsed.data.input;
    const { profile, data } = await activeServices();
    const config = await data.readModConfig();
    const root = { name: normalizeModName(input), version: parsed.data.version || undefined };
    const existing = normalizeConfiguredMods(config.mods).filter(item => item.name !== root.name);
    const optional = (parsed.data.optional ?? []).map(name => ({ name: normalizeModName(name) }));
    const nextRoots: ConfiguredMod[] = [...existing, { ...root, enabled: true }];
    const plan = await operations.runExclusive('plan-mods', 'recreating', () => resolveConfiguredPlan(resolver, config.factorioVersion, nextRoots, optional));
    plans.set(plan.id, { profileId: profile.id, plan });
    request.log.info({ planId: plan.id, roots: plan.roots.map(item => item.name), resolvedCount: plan.selections.length }, 'mod plan resolved');
    return reply.send(plan);
  });

  app.post('/api/mods/change-plan', async (request, reply) => {
    const parsed = modChangePlanBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid mod change' });
    if (operations.snapshot.active) return reply.code(409).send({ error: 'Another operation is active' });
    if ((await options.adapter.inspect()).running) return reply.code(409).send({ error: 'Factorio must be stopped before planning mods' });
    const { profile, data } = await activeServices();
    const config = await data.readModConfig();
    const roots = normalizeConfiguredMods(config.mods);
    const name = normalizeModName(parsed.data.name);
    const existing = roots.find(root => root.name === name);
    if (!existing) return reply.code(404).send({ error: `Configured mod not found: ${name}` });
    let nextRoots: ConfiguredMod[];
    if (parsed.data.action === 'remove') nextRoots = roots.filter(root => root.name !== name);
    else if (parsed.data.action === 'update') {
      const version = parsed.data.version || undefined;
      nextRoots = roots.map(root => root.name === name ? { ...root, version } : root);
    } else {
      const enabled = parsed.data.enabled;
      nextRoots = roots.map(root => root.name === name ? { ...root, enabled } : root);
    }
    const plan = await operations.runExclusive('plan-mod-change', 'recreating', () => resolveConfiguredPlan(resolver, config.factorioVersion, nextRoots));
    plans.set(plan.id, { profileId: profile.id, plan });
    request.log.info({ planId: plan.id, action: parsed.data.action, modName: name, resolvedCount: plan.selections.length }, 'mod change plan resolved');
    return reply.send(plan);
  });

  app.post('/api/mods/apply', async (request, reply) => {
    const parsed = modApplyBodySchema.safeParse(request.body);
    const planned = parsed.success ? plans.get(parsed.data.planId) : undefined;
    const { profile, installer } = await activeServices();
    if (!planned || planned.profileId !== profile.id) return reply.code(404).send({ error: 'Plan not found, expired, or belongs to another profile' });
    if (operations.snapshot.active) return reply.code(409).send({ error: 'Another operation is active' });
    const plan = planned.plan;
    if ((await options.adapter.inspect()).running) return reply.code(409).send({ error: 'Factorio must be stopped before installing mods' });
    await operations.runExclusive('stage-mods', 'recreating', async () => { await installer.stage(plan); plans.delete(plan.id); });
    request.log.info({ profileId: profile.id, planId: plan.id }, 'mod plan saved for next start');
    return reply.send({ staged: true, planId: plan.id });
  });

  app.post('/api/mods/rollback', async (_request, reply) => {
    const { installer } = await activeServices();
    const rollbackPath = await installer.findRollbackCandidate();
    if (!rollbackPath) return reply.code(409).send({ error: 'No previous mod generation is available' });
    if ((await options.adapter.inspect()).running) return reply.code(409).send({ error: 'Factorio must be stopped before rolling back mods' });
    const previous = rollbackPath;
    const operation = await serverOperations.rollbackMods(previous);
    return reply.code(202).send(operation);
  });

  app.post('/api/server/:action', async (request, reply) => {
    const parsed = serverActionParamsSchema.safeParse(request.params);
    if (!parsed.success) return reply.code(404).send({ error: 'Unknown action' });
    const action = parsed.data.action;
    const operation = await serverOperations.lifecycle(action);
    return reply.code(202).send(operation);
  });

  app.put('/api/config/version', async (request, reply) => {
    const parsed = versionBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid Factorio version' });
    if (operations.snapshot.active) return reply.code(409).send({ error: 'Another operation is active' });
    const version = parsed.data.version;
    const current = await options.adapter.inspect();
    if (current.running) return reply.code(409).send({ error: 'Factorio must be stopped before changing version' });
    const { profile, installer, data } = await activeServices();
    const configPath = join(profile.configRoot, 'factorio.json');
    await operations.runExclusive('stage-version', 'recreating', async () => {
      const modConfig = await data.readModConfig();
      const plan = await resolveConfiguredPlan(resolver, version, normalizeConfiguredMods(modConfig.mods));
      await data.withFileRollback([configPath, join(profile.configRoot, 'mods.json'), join(profile.configRoot, 'mods.lock.json'), join(profile.configRoot, 'mods.pending.json')], async () => {
        await installer.stage(plan); await data.writeFactorioConfig({ version, channel: parsed.data.channel });
      });
    });
    request.log.info({ profileId: profile.id, factorioVersion: version, channel: parsed.data.channel }, 'Factorio version staged for next start');
    return reply.send({ version, channel: parsed.data.channel });
  });

  app.post('/api/saves/import', async (request, reply) => {
    const { profile, saves, installer, data } = await activeServices();
    if (operations.snapshot.active) return reply.code(409).send({ error: 'Another operation is active' });
    if ((await options.adapter.inspect()).running) return reply.code(409).send({ error: 'Factorio must be stopped before importing a startup save' });
    const file = await request.file();
    if (!file || !file.filename.endsWith('.zip')) return reply.code(400).send({ error: 'A .zip save is required' });
    const safeName = basename(file.filename);
    const temp = join(saves.importsDir, `${safeName}.uploading`);
    const destination = join(saves.importsDir, safeName);
    try {
      const result = await operations.runExclusive('import-save', 'recreating', async () => {
        await pipeline(file.file, createWriteStream(temp));
        const inspection = await inspectFactorioSave(temp);
        const roots = inspection.mods.filter(mod => !BUILT_IN_MODS.has(mod.name)).map(mod => ({ ...mod, enabled: true }));
        const plan = await resolveConfiguredPlan(resolver, inspection.factorioVersion, roots);
        const trackedPaths = [
          destination,
          join(profile.configRoot, 'factorio.json'), join(profile.configRoot, 'mods.json'), join(profile.configRoot, 'mods.lock.json'), join(profile.configRoot, 'mods.pending.json'),
          join(profile.runtimeRoot, 'factorio', 'saves', '_webui-selected.zip'), join(profile.runtimeRoot, 'webui', 'launch.json'),
        ];
        return data.withFileRollback(trackedPaths, async () => {
          await rename(temp, destination);
          await installer.stage(plan);
          await data.writeFactorioConfig({ version: inspection.factorioVersion });
          const materialized = await saves.materialize('imports', safeName);
          await data.writeNextLaunch({ kind: 'imports', name: safeName, saveName: materialized });
          return { inspection, roots, plan, materialized };
        });
      });
      request.log.info({ profileId: profile.id, saveName: safeName, runtimeSaveName: result.materialized, factorioVersion: result.inspection.factorioVersion, modCount: result.roots.length, planId: result.plan.id }, 'save imported and startup configuration staged');
      return reply.code(201).send(saveImportResultSchema.parse({ name: safeName, factorioVersion: result.inspection.factorioVersion, mods: result.roots.map(({ name, version }) => ({ name, version: version! })), warning: result.inspection.warning }));
    } catch (error) {
      await rm(temp, { force: true });
      request.log.error({ saveName: safeName, error: redact(error) }, 'save import configuration failed');
      throw error;
    }
  });

  app.post('/api/saves/backup-entry', async (request, reply) => {
    const parsed = saveBackupBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A save candidate is required' });
    const operation = await serverOperations.backup(parsed.data.kind, parsed.data.name);
    return reply.code(202).send(operation);
  });

  app.post('/api/saves/delete', async (request, reply) => {
    const parsed = saveDeleteBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'An import or backup candidate is required' });
    if (operations.snapshot.active) return reply.code(409).send({ error: 'Another operation is active' });
    const { saves, data } = await activeServices();
    await operations.runExclusive('delete-save', 'recreating', async () => {
      const launch = await data.readNextLaunch();
      if (launch.kind === parsed.data.kind && launch.name === parsed.data.name) throw new OperationConflictError('Cannot delete the selected startup save');
      await saves.deleteEntry(parsed.data.kind, parsed.data.name);
    });
    request.log.info({ saveKind: parsed.data.kind, saveName: parsed.data.name }, 'save candidate deleted');
    return reply.code(204).send();
  });

  app.post('/api/saves/next-launch', async (request, reply) => {
    const { saves, data } = await activeServices();
    const parsed = saveNextLaunchBodySchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'A .zip save name is required' });
    if (operations.snapshot.active) return reply.code(409).send({ error: 'Another operation is active' });
    if ((await options.adapter.inspect()).running) return reply.code(409).send({ error: 'Factorio must be stopped before selecting a startup save' });
    if (!(await saves.list())[parsed.data.kind].some(entry => entry.name === parsed.data.name)) return reply.code(404).send({ error: 'Save does not exist in the Factorio saves directory' });
    const saveName = await operations.runExclusive('select-save', 'recreating', async () => {
      if ((await options.adapter.inspect()).running) throw new OperationConflictError('Factorio must be stopped before selecting a startup save');
      const available = (await saves.list())[parsed.data.kind];
      if (!available.some(entry => entry.name === parsed.data.name)) throw new Error('Save does not exist in the Factorio saves directory');
      const materialized = await saves.materialize(parsed.data.kind, parsed.data.name);
      await data.writeNextLaunch({ kind: parsed.data.kind, name: parsed.data.name, saveName: materialized });
      return materialized;
    });
    request.log.info({ saveKind: parsed.data.kind, saveName: parsed.data.name, runtimeSaveName: saveName }, 'next launch save selected');
    return reply.send({ kind: parsed.data.kind, name: parsed.data.name });
  });

  app.get('/api/saves/backups/:name', async (request, reply) => {
    const { saves } = await activeServices();
    const parsed = saveDownloadParamsSchema.safeParse(request.params);
    if (!parsed.success) return reply.code(400).send({ error: 'Invalid save name' });
    const name = basename(parsed.data.name);
    if (name !== parsed.data.name) return reply.code(400).send({ error: 'Invalid save name' });
    return reply.type('application/zip').header('content-disposition', `attachment; filename="${name}"`).send(createReadStream(join(saves.backupsDir, name)));
  });

  app.get('/api/events', async (request, reply) => {
    reply.hijack();
    reply.raw.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache, no-transform', connection: 'keep-alive', 'x-accel-buffering': 'no' });
    reply.raw.flushHeaders();
    let closed = false;
    const send = (event: string, data: unknown) => !closed && reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const onOperation = (snapshot: unknown) => send('operation', snapshot);
    operations.on('change', onOperation);
    send('connected', { connectedAt: new Date().toISOString() });
    const recentLogs = await options.adapter.recentLogs(500).catch(() => []);
    for (const line of await options.adapter.recentManagementLogs?.() ?? []) send('log', { source: 'container', line });
    for (const line of recentLogs) {
      const entry = classifyContainerLog(redact(line));
      if (entry.source === 'game') send('log', entry);
    }
    send('history-complete', { count: recentLogs.length });
    const controller = new AbortController();
    const stopManagementLogs = options.adapter.onManagementLog?.(line => send('log', { source: 'container', line }));
    const heartbeat = setInterval(() => { if (!closed) reply.raw.write(': keepalive\n\n'); }, 15_000);
    request.log.info('log event stream connected');
    void options.adapter.followLogs(line => {
      const entry = classifyContainerLog(redact(line));
      if (entry.source === 'game') send('log', entry);
    }, controller.signal).catch(error => send('error', { error: redact(error) }));
    request.raw.once('close', () => {
      closed = true;
      clearInterval(heartbeat);
      operations.off('change', onOperation);
      controller.abort();
      stopManagementLogs?.();
      request.log.info('log event stream disconnected');
    });
  });

  if (options.serveFrontend) {
    await app.register(staticPlugin, { root: process.env.FRONTEND_ROOT || join(options.projectRoot, 'dist'), wildcard: false });
    app.setNotFoundHandler((_request, reply) => reply.sendFile('index.html'));
  }
  return app;
}

async function ensureDefaultServerSettings(projectRoot: string, runtimeRoot: string) {
  const destination = join(runtimeRoot, 'factorio', 'config', 'server-settings.json');
  await mkdir(resolve(destination, '..'), { recursive: true });
  try { await copyFile(join(projectRoot, 'config', 'server-settings.json'), destination, constants.COPYFILE_EXCL); }
  catch (error) { if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error; }
}

function normalizeConfiguredMods(mods: Array<{ name: string; version?: string; enabled?: boolean }>): ConfiguredMod[] {
  return mods.map(mod => ({ name: mod.name, version: mod.version, enabled: mod.enabled ?? true }));
}

async function resolveConfiguredPlan(resolver: ModResolver, factorioVersion: string, roots: ConfiguredMod[], extra: Array<{ name: string; version?: string }> = []) {
  const configured = [...roots, ...extra.filter(candidate => !roots.some(root => root.name === candidate.name)).map(root => ({ ...root, enabled: true }))];
  const plan = await resolver.resolve(factorioVersion, configured.filter(root => root.enabled));
  plan.roots = configured;
  return plan;
}
