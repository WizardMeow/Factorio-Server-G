import { expect, test } from '@rstest/core';
import { redact } from './redact.js';

test('redacts command-line credentials from container logs', () => {
  expect(redact('factorio --rcon-password secret --start-server save')).toBe('factorio --rcon-password [REDACTED] --start-server save');
});
