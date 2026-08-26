import { describe, expect, test } from '@rstest/core';
import { portalModSchema } from './schemas.js';

describe('Mod Portal response schema', () => {
  test('accepts an official relative thumbnail path', () => {
    const mod = portalModSchema.parse({
      name: 'mining-patch-planner',
      title: 'Mining Patch Planner',
      summary: 'Plan mining patches.',
      thumbnail: '/assets/9ed61059ffd9561316c025c905764eb3deecb061.thumb.png',
      releases: [{
        version: '1.0.0', download_url: '/download/mining-patch-planner', file_name: 'mining-patch-planner_1.0.0.zip', released_at: '2026-01-01T00:00:00Z', sha1: '0'.repeat(40), info_json: { factorio_version: '2.0' },
      }],
    });
    expect(mod.thumbnail).toBe('/assets/9ed61059ffd9561316c025c905764eb3deecb061.thumb.png');
  });
});
