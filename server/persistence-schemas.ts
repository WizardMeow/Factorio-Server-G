import { z } from 'zod';
import { exactVersionSchema } from '../shared/contracts.js';

export const profileStateSchema = z.object({ activeId: z.string().optional() });
export const profileMetadataSchema = z.object({ name: z.string().optional() });
export const factorioConfigSchema = z.object({ version: exactVersionSchema, channel: z.enum(['latest', 'stable']).optional() });
export const modConfigSchema = z.object({ factorioVersion: z.string(), mods: z.array(z.object({ name: z.string(), version: z.string().optional(), enabled: z.boolean().optional() })) });
export const modLockViewSchema = z.object({ mods: z.array(z.object({ name: z.string(), version: z.string(), explicit: z.boolean(), enabled: z.boolean().optional() })) });
export const launchSaveSchema = z.object({ kind: z.enum(['autosaves', 'imports', 'backups']), name: z.string(), saveName: z.string() });
export const partialLaunchSaveSchema = launchSaveSchema.partial();
export const serverSettingsSchema = z.record(z.string(), z.unknown());
export const composeContainerSchema = z.object({ State: z.string().optional(), Health: z.string().optional(), Image: z.string().optional() }).passthrough();
export const operationRecordSchema = z.object({
  id: z.string(), kind: z.string(),
  stage: z.enum(['stopped', 'pulling', 'recreating', 'starting', 'ready', 'stopping', 'failed', 'backing-up', 'restoring', 'completed']),
  startedAt: z.string(), updatedAt: z.string(), finishedAt: z.string().optional(),
  result: z.enum(['succeeded', 'failed', 'interrupted']).optional(), error: z.string().optional(),
});
export const operationJournalSchema = z.array(operationRecordSchema);

export type FactorioConfig = z.infer<typeof factorioConfigSchema>;
export type ModConfig = z.infer<typeof modConfigSchema>;
export type LaunchSave = z.infer<typeof launchSaveSchema>;
