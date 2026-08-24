import { z } from 'zod';

export const portalReleaseSchema = z.object({
  download_url: z.string(), file_name: z.string(), released_at: z.string(), version: z.string(), sha1: z.string().regex(/^[a-fA-F0-9]{40}$/),
  info_json: z.object({ factorio_version: z.string(), dependencies: z.array(z.string()).optional() }),
});
export const portalModSchema = z.object({ name: z.string(), title: z.string(), summary: z.string(), releases: z.array(portalReleaseSchema) });
export type PortalRelease = z.infer<typeof portalReleaseSchema>;
export type PortalMod = z.infer<typeof portalModSchema>;
