import { z } from 'zod';
import { versionOptionsSchema, type VersionOptionsDto } from '../shared/contracts.js';

const releasesResponseSchema = z.object({
  experimental: z.object({ headless: z.string() }),
  stable: z.object({ headless: z.string() }),
});

export async function fetchFactorioVersions(): Promise<VersionOptionsDto> {
  const response = await fetch('https://factorio.com/api/latest-releases');
  if (!response.ok) throw new Error(`Factorio release lookup failed (${response.status})`);
  const releases = releasesResponseSchema.parse(await response.json());
  return versionOptionsSchema.parse({ latest: releases.experimental.headless, stable: releases.stable.headless });
}
