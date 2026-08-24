import { describe, expect, test } from '@rstest/core';
import { classifyContainerLog } from './log-source.js';

describe('log source classification', () => {
  test('recognizes Factorio runtime lines', () => {
    expect(classifyContainerLog('factorio-1  |    3.561 Error ServerMultiplayerManager.cpp:743: Missing token').source).toBe('game');
    expect(classifyContainerLog('factorio-1  | 595.057 Info MainLoop.cpp:437: Saving map').source).toBe('game');
  });

  test('keeps entrypoint and compose output in the container channel', () => {
    expect(classifyContainerLog('factorio-1  | + SAVE_NAME=_autosave1').source).toBe('container');
    expect(classifyContainerLog('[compose] docker compose restart factorio started').source).toBe('container');
  });
});
