import { z } from 'zod';
import { portalReleaseSchema } from '../../shared/contracts.js';

export { portalReleaseSchema };
export const portalModSchema = z.object({ name: z.string(), title: z.string(), summary: z.string(), releases: z.array(portalReleaseSchema) });
export type PortalRelease = z.infer<typeof portalReleaseSchema>;
export type PortalMod = z.infer<typeof portalModSchema>;
