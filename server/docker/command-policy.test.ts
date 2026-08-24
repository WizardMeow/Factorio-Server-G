import { describe, expect, test } from '@rstest/core';
import { authorizeComposeCommand } from './command-policy.js';

describe('Factorio Compose command policy', () => {
  test('allows only project-scoped Factorio observation and lifecycle commands', () => {
    const allowed = [
      ['ps', '--format', 'json', 'factorio'],
      ['config', '--format', 'json'],
      ['pull', 'factorio'],
      ['up', '-d', '--no-deps', 'factorio'],
      ['up', '-d', '--no-deps', '--force-recreate', 'factorio'],
      ['stop', '-t', '120', 'factorio'],
      ['restart', '-t', '120', 'factorio'],
      ['logs', '--no-color', '--tail', '500', 'factorio'],
      ['logs', '--no-color', '--since', '2026-08-24T12:00:00.000Z', 'factorio'],
      ['logs', '--no-color', '--follow', '--tail', '0', 'factorio'],
    ];

    for (const command of allowed) {
      expect(authorizeComposeCommand(command)).toEqual(['compose', '--project-name', 'factorio-server-g', ...command]);
    }
  });

  test('rejects other projects, services, subcommands, and extra arguments', () => {
    const denied = [
      ['--project-name', 'other-project', 'ps'],
      ['ps', '--format', 'json', 'webui'],
      ['exec', 'factorio', 'sh'],
      ['run', '--volume', '/:/host', 'factorio'],
      ['down'],
      ['rm', '-f', 'factorio'],
      ['up', '-d', '--no-deps', 'factorio', 'webui'],
      ['logs', '--no-color', '--tail', '-1', 'factorio'],
      ['logs', '--no-color', '--since', 'yesterday', 'factorio'],
    ];

    for (const command of denied) expect(() => authorizeComposeCommand(command)).toThrow('Docker Compose command denied');
  });
});
