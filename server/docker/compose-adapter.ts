import { createInterface } from 'node:readline';
import { appendFile, mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ComposeAdapter, ContainerState } from '../types.js';
import { redact } from '../redact.js';
import { composeContainerSchema, composeProjectSchema, factorioConfigSchema, partialLaunchSaveSchema, profileStateSchema } from '../persistence-schemas.js';
import { DockerCommandExecutor } from './command-executor.js';

export class ComposeCommandError extends Error {}

export class DockerComposeAdapter implements ComposeAdapter {
  private static readonly service = 'factorio';
  private readonly managementHistory: string[] = [];
  private readonly managementListeners = new Set<(line: string) => void>();
  private readinessSince?: string;
  private managementPersistence = Promise.resolve();
  constructor(private readonly cwd: string, private readonly log: (fields: Record<string, unknown>, message: string) => void = () => {}, private readonly commands = new DockerCommandExecutor()) {}

  private run(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      void this.environment().then(env => {
      const startedAt = Date.now();
      const management = !['ps', 'logs', 'config'].includes(args[0] ?? '');
      this.log({ service: DockerComposeAdapter.service, composeArgs: args }, 'docker compose command started');
      if (management) this.emitManagement(`docker compose ${args.join(' ')} started`);
      const child = this.commands.spawn(args, { cwd: this.cwd, env });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', chunk => { stdout += chunk; });
      child.stderr.on('data', chunk => { stderr += chunk; });
      if (management) {
        createInterface({ input: child.stdout }).on('line', line => { if (line) this.emitManagement(`[stdout] ${redact(line)}`); });
        createInterface({ input: child.stderr }).on('line', line => { if (line) this.emitManagement(`[stderr] ${redact(line)}`); });
      }
      child.once('error', error => { const sanitized = redact(error); this.log({ service: DockerComposeAdapter.service, composeArgs: args, error: sanitized }, 'docker compose command failed'); if (management) this.emitManagement(`docker compose ${args.join(' ')} failed: ${sanitized}`); reject(new ComposeCommandError(sanitized)); });
      child.once('close', code => { const durationMs = Date.now() - startedAt; this.log({ service: DockerComposeAdapter.service, composeArgs: args, exitCode: code, durationMs }, code === 0 ? 'docker compose command completed' : 'docker compose command failed'); if (management) this.emitManagement(`docker compose ${args.join(' ')} ${code === 0 ? 'completed' : `failed (${code})`} in ${durationMs}ms`); code === 0
        ? resolve(stdout.trim())
        : reject(new ComposeCommandError(redact(stderr || `docker compose exited ${code}`))); });
      }).catch(reject);
    });
  }

  private async environment() {
    try {
      const active = await readFile(join(this.cwd, 'runtime', 'webui', 'profile.json'), 'utf8').then(value => profileStateSchema.parse(JSON.parse(value))).catch(() => profileStateSchema.parse({}));
      const profileId = active.activeId || 'p1';
      const profileRuntime = join(this.cwd, 'runtime', 'profiles', profileId);
      const config = factorioConfigSchema.parse(JSON.parse(await readFile(join(this.cwd, 'config', 'profiles', profileId, 'factorio.json'), 'utf8')));
      const launch = await readFile(join(profileRuntime, 'webui', 'launch.json'), 'utf8').then(value => partialLaunchSaveSchema.parse(JSON.parse(value))).catch(() => partialLaunchSaveSchema.parse({}));
      const hostRoot = process.env.HOST_PROJECT_ROOT || this.cwd;
      const dataPath = join(hostRoot, 'runtime', 'profiles', profileId, 'factorio');
      return { ...process.env, FACTORIO_VERSION: config.version || '2.0.77', FACTORIO_SAVE_NAME: (launch.saveName || '_autosave1.zip').replace(/\.zip$/, ''), FACTORIO_DATA_PATH: dataPath };
    } catch { return { ...process.env, FACTORIO_VERSION: '2.0.77', FACTORIO_SAVE_NAME: '_autosave1', FACTORIO_DATA_PATH: join(process.env.HOST_PROJECT_ROOT || this.cwd, 'runtime', 'profiles', 'p1', 'factorio') }; }
  }

  async inspect(): Promise<ContainerState> {
    const output = await this.run(['ps', '--format', 'json', DockerComposeAdapter.service]);
    if (!output) return { status: 'stopped', running: false };
    const row = composeContainerSchema.parse(JSON.parse(output.split('\n')[0]));
    const running = row.State === 'running';
    let ready = running && row.Health === 'healthy';
    if (running && !ready && this.readinessSince) {
      const logs = await this.logsSince(this.readinessSince).catch(() => []);
      ready = logs.some(line => /Hosting game at|changing state from\(CreatingGame\) to\(InGame\)|game is ready/i.test(line));
    }
    return {
      status: ready ? 'ready' : running ? 'starting' : row.State === 'exited' ? 'stopped' : 'failed',
      running,
      health: row.Health || undefined,
      image: row.Image,
    };
  }

  async connectionAddress() {
    const project = composeProjectSchema.parse(JSON.parse(await this.run(['config', '--format', 'json'])));
    const binding = project.services[DockerComposeAdapter.service]?.ports?.find(port => String(port.target) === '34197' && (port.protocol ?? 'tcp') === 'udp');
    const host = binding?.host_ip;
    return host && host !== '0.0.0.0' && host !== '::' && binding.published ? `${host}:${binding.published}` : null;
  }

  async start() { this.readinessSince = new Date().toISOString(); await this.run(['up', '-d', '--no-deps', DockerComposeAdapter.service]); }
  async stop() { await this.run(['stop', '-t', '120', DockerComposeAdapter.service]); this.readinessSince = undefined; }
  async restart() { this.readinessSince = new Date().toISOString(); await this.run(['restart', '-t', '120', DockerComposeAdapter.service]); }
  async pull() { await this.run(['pull', DockerComposeAdapter.service]); }
  async recreate() { this.readinessSince = new Date().toISOString(); await this.run(['up', '-d', '--no-deps', '--force-recreate', DockerComposeAdapter.service]); }
  async recentLogs(lines: number) { return (await this.run(['logs', '--no-color', '--tail', String(lines), DockerComposeAdapter.service])).split('\n').filter(Boolean); }
  private async logsSince(since: string) { return (await this.run(['logs', '--no-color', '--since', since, DockerComposeAdapter.service])).split('\n').filter(Boolean); }

  followLogs(onLine: (line: string) => void, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = this.commands.spawn(['logs', '--no-color', '--follow', '--tail', '0', DockerComposeAdapter.service], { cwd: this.cwd });
      this.log({ service: DockerComposeAdapter.service }, 'docker compose log follower started');
      const lines = createInterface({ input: child.stdout });
      lines.on('line', onLine);
      signal.addEventListener('abort', () => { child.kill('SIGTERM'); this.log({ service: DockerComposeAdapter.service }, 'docker compose log follower stopped'); resolve(); }, { once: true });
      child.once('error', reject);
      child.once('close', code => code === 0 || signal.aborted ? resolve() : reject(new Error(`log follower exited ${code}`)));
    });
  }

  async recentManagementLogs() {
    try { return (await readFile(join(this.cwd, 'runtime', 'webui', 'container-management.log'), 'utf8')).split('\n').filter(Boolean).slice(-500); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [...this.managementHistory]; throw error; }
  }
  onManagementLog(listener: (line: string) => void) { this.managementListeners.add(listener); return () => this.managementListeners.delete(listener); }
  private emitManagement(message: string) {
    const line = `[compose] ${new Date().toISOString()} ${message}`;
    this.managementHistory.push(line);
    if (this.managementHistory.length > 500) this.managementHistory.shift();
    for (const listener of this.managementListeners) listener(line);
    this.managementPersistence = this.managementPersistence.then(() => this.persistManagement(line));
  }
  private async persistManagement(line: string) {
    const directory = join(this.cwd, 'runtime', 'webui');
    try { await mkdir(directory, { recursive: true }); await appendFile(join(directory, 'container-management.log'), `${line}\n`); }
    catch (error) { this.log({ error: redact(error) }, 'container management log persistence failed'); }
  }
}
