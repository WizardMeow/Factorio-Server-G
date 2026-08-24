import { describe, expect, test } from '@rstest/core';
import type { ChildProcessWithoutNullStreams, SpawnOptionsWithoutStdio } from 'node:child_process';
import { DockerCommandExecutor } from './command-executor.js';

describe('Docker command executor', () => {
  test('adds the fixed project scope before spawning Docker', () => {
    const calls: Array<{ file: string; args: readonly string[] }> = [];
    const child = {} as ChildProcessWithoutNullStreams;
    const spawn = (file: string, args: readonly string[], _options: SpawnOptionsWithoutStdio) => { calls.push({ file, args }); return child; };
    const executor = new DockerCommandExecutor(spawn);

    expect(executor.spawn(['stop', '-t', '120', 'factorio'], { cwd: '/project' })).toBe(child);
    expect(calls).toEqual([{ file: 'docker', args: ['compose', '--project-name', 'factorio-server-g', 'stop', '-t', '120', 'factorio'] }]);
  });

  test('rejects denied commands before starting a process', () => {
    let spawned = false;
    const executor = new DockerCommandExecutor(() => { spawned = true; return {} as ChildProcessWithoutNullStreams; });
    expect(() => executor.spawn(['exec', 'factorio', 'sh'], { cwd: '/project' })).toThrow('Docker Compose command denied');
    expect(spawned).toBe(false);
  });
});
