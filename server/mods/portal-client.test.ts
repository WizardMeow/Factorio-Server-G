import { afterEach, describe, expect, rs, test } from '@rstest/core';
import { ModPortalClient } from './portal-client.js';

afterEach(() => rs.restoreAllMocks());
describe('ModPortalClient boundary validation', () => {
  test('rejects malformed external payloads through Zod', async () => {
    rs.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ name: 'broken', releases: [{ sha1: 'not-sha1' }] }), { status: 200 }));
    await expect(new ModPortalClient().getMod('broken')).rejects.toThrow();
  });
});
