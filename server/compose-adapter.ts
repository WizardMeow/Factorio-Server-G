import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { ComposeAdapter, ContainerState } from './types.js';
import { redact } from './redact.js';

export class ComposeCommandError extends Error {}

export class DockerComposeAdapter implements ComposeAdapter {
  constructor(private readonly cwd: string, private readonly service = 'factorio', private readonly log: (fields: Record<string, unknown>, message: string) => void = () => {}) {}

  private run(args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      void this.environment().then(env => {
      const startedAt = Date.now();
      this.log({ service: this.service, composeArgs: args }, 'docker compose command started');
      const child = spawn('docker', ['compose', ...args], { cwd: this.cwd, env });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', chunk => { stdout += chunk; });
      child.stderr.on('data', chunk => { stderr += chunk; });
      child.once('error', error => { const sanitized = redact(error); this.log({ service: this.service, composeArgs: args, error: sanitized }, 'docker compose command failed'); reject(new ComposeCommandError(sanitized)); });
      child.once('close', code => { this.log({ service: this.service, composeArgs: args, exitCode: code, durationMs: Date.now() - startedAt }, code === 0 ? 'docker compose command completed' : 'docker compose command failed'); code === 0
        ? resolve(stdout.trim())
        : reject(new ComposeCommandError(redact(stderr || `docker compose exited ${code}`))); });
      }).catch(reject);
    });
  }

  private async environment() {
    try {
      const config = JSON.parse(await readFile(join(this.cwd, 'config', 'factorio.json'), 'utf8')) as { version?: string };
      return { ...process.env, FACTORIO_VERSION: config.version || 'latest' };
    } catch { return { ...process.env, FACTORIO_VERSION: 'latest' }; }
  }

  async inspect(): Promise<ContainerState> {
    const output = await this.run(['ps', '--format', 'json', this.service]);
    if (!output) return { status: 'stopped', running: false };
    const row = JSON.parse(output.split('\n')[0]) as { State?: string; Health?: string; Image?: string };
    const running = row.State === 'running';
    let ready = running && row.Health === 'healthy';
    if (running && !ready) {
      const logs = await this.recentLogs(120).catch(() => []);
      ready = logs.some(line => /Hosting game at|changing state from\(CreatingGame\) to\(InGame\)|game is ready/i.test(line));
    }
    return {
      status: ready ? 'ready' : running ? 'starting' : row.State === 'exited' ? 'stopped' : 'failed',
      running,
      health: row.Health || undefined,
      image: row.Image,
    };
  }

  async start() { await this.run(['up', '-d', '--no-deps', this.service]); }
  async stop() { await this.run(['stop', '-t', '120', this.service]); }
  async restart() { await this.run(['restart', '-t', '120', this.service]); }
  async pull() { await this.run(['pull', this.service]); }
  async recreate() { await this.run(['up', '-d', '--no-deps', '--force-recreate', this.service]); }
  async recentLogs(lines: number) { return (await this.run(['logs', '--no-color', '--tail', String(lines), this.service])).split('\n').filter(Boolean); }

  followLogs(onLine: (line: string) => void, signal: AbortSignal): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn('docker', ['compose', 'logs', '--no-color', '--follow', '--tail', '0', this.service], { cwd: this.cwd });
      this.log({ service: this.service }, 'docker compose log follower started');
      const lines = createInterface({ input: child.stdout });
      lines.on('line', onLine);
      signal.addEventListener('abort', () => { child.kill('SIGTERM'); this.log({ service: this.service }, 'docker compose log follower stopped'); resolve(); }, { once: true });
      child.once('error', reject);
      child.once('close', code => code === 0 || signal.aborted ? resolve() : reject(new Error(`log follower exited ${code}`)));
    });
  }
}
