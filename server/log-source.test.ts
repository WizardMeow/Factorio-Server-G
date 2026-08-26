import { describe, expect, test } from '@rstest/core';
import { classifyContainerLog } from './log-source.js';

describe('log source classification', () => {
  test('recognizes Factorio runtime lines', () => {
    expect(classifyContainerLog('factorio-1  |    3.561 Error ServerMultiplayerManager.cpp:743: Missing token')).toMatchObject({ source: 'game', level: 'error' });
    expect(classifyContainerLog('factorio-1  | 595.057 Info MainLoop.cpp:437: Saving map')).toMatchObject({ source: 'game', level: 'info' });
  });

  test('keeps entrypoint and compose output in the container channel', () => {
    expect(classifyContainerLog('factorio-1  | + SAVE_NAME=_autosave1')).toMatchObject({ source: 'container', level: 'info' });
    expect(classifyContainerLog('[compose] docker compose restart factorio started')).toMatchObject({ source: 'container', level: 'success' });
  });
});
