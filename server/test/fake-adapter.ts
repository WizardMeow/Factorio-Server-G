import type { ComposeAdapter, ContainerState } from '../types.js';

export class FakeAdapter implements ComposeAdapter {
  state: ContainerState = { status: 'stopped', running: false };
  calls: string[] = [];
  logs: string[] = [];
  gate?: Promise<void>;
  private async act(name: string, next?: ContainerState) { this.calls.push(name); await this.gate; if (next) this.state = next; }
  inspect = async () => this.state;
  connectionAddress = async () => '100.64.0.1:34197';
  start = async () => this.act('start', { status: 'ready', running: true });
  stop = async () => this.act('stop', { status: 'stopped', running: false });
  restart = async () => this.act('restart', { status: 'ready', running: true });
  pull = async () => this.act('pull');
  recreate = async () => this.act('recreate', { status: 'ready', running: true });
  recentLogs = async (lines: number) => this.logs.slice(-lines);
  followLogs = async (_onLine: (line: string) => void, signal: AbortSignal) => new Promise<void>(resolve => signal.addEventListener('abort', () => resolve(), { once: true }));
}
