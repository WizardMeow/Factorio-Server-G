import { z } from 'zod';

export const saveEntrySchema = z.object({ name: z.string(), size: z.number(), modifiedAt: z.string() });
export const configuredModSchema = z.object({ name: z.string(), version: z.string().optional(), enabled: z.boolean() });
export const installedModSchema = z.object({ name: z.string(), version: z.string(), explicit: z.boolean(), enabled: z.boolean() });
export const logEntrySchema = z.object({ source: z.enum(['game', 'container', 'startup']), line: z.string() });
export const saveCollectionSchema = z.enum(['autosaves', 'imports', 'backups']);
export const nextLaunchSaveSchema = z.object({ kind: saveCollectionSchema, name: z.string() });
export const operationSchema = z.object({ id: z.string(), kind: z.string(), stage: z.string(), result: z.string().optional(), error: z.string().optional(), startedAt: z.string(), updatedAt: z.string().optional(), finishedAt: z.string().optional() });
export const operationSnapshotSchema = z.object({ active: operationSchema.optional(), history: z.array(operationSchema) });
export const overviewSchema = z.object({
  server: z.object({ status: z.string(), running: z.boolean(), image: z.string().optional(), error: z.string().optional(), health: z.string().optional() }),
  operations: operationSnapshotSchema,
  saves: z.object({ selected: saveEntrySchema.nullable(), autosaves: z.array(saveEntrySchema), imports: z.array(saveEntrySchema), backups: z.array(saveEntrySchema), nextLaunch: nextLaunchSaveSchema }),
  mods: z.object({ roots: z.array(configuredModSchema), resolved: z.array(installedModSchema), installed: z.array(installedModSchema), pending: z.boolean() }),
  profiles: z.object({ activeId: z.string(), items: z.array(z.object({ id: z.string(), name: z.string() })) }),
  connection: z.object({ address: z.string().nullable(), configured: z.boolean() }),
  config: z.object({ version: z.string(), channel: z.enum(['latest', 'stable']).optional() }), settings: z.record(z.string(), z.unknown()).nullable(), modRollbackAvailable: z.boolean().optional(),
});
export const dependencySchema = z.object({ kind: z.enum(['required', 'optional', 'recommended', 'hidden-optional', 'no-order', 'incompatible']), name: z.string(), operator: z.string().optional(), version: z.string().optional(), raw: z.string() });
export const portalReleaseSchema = z.object({
  download_url: z.string(), file_name: z.string(), released_at: z.string(), version: z.string(), sha1: z.string().regex(/^[a-fA-F0-9]{40}$/),
  info_json: z.object({ factorio_version: z.string(), dependencies: z.array(z.string()).optional() }),
});
export const modPlanSchema = z.object({ id: z.string(), factorioVersion: z.string(), createdAt: z.string(), roots: z.array(configuredModSchema), selections: z.array(z.object({ name: z.string(), version: z.string(), explicit: z.boolean(), release: portalReleaseSchema })), optional: z.array(z.object({ from: z.string(), dependency: dependencySchema })) });
export const serverActionParamsSchema = z.object({ action: z.enum(['start', 'stop', 'restart']) });
export const exactVersionSchema = z.string().regex(/^\d+\.\d+\.\d+$/);
export const versionBodySchema = z.object({ version: exactVersionSchema, channel: z.enum(['latest', 'stable']).optional() });
export const versionOptionsSchema = z.object({ latest: exactVersionSchema, stable: exactVersionSchema });
export const saveNextLaunchBodySchema = z.object({ kind: saveCollectionSchema, name: z.string().endsWith('.zip') });
export const saveBackupBodySchema = z.object({ kind: saveCollectionSchema, name: z.string().endsWith('.zip') });
export const saveDeleteBodySchema = z.object({ kind: z.enum(['imports', 'backups']), name: z.string().endsWith('.zip') });
export const saveDownloadParamsSchema = z.object({ kind: saveCollectionSchema, name: z.string().endsWith('.zip') });
export const modPlanBodySchema = z.object({ input: z.string().min(1), version: z.string().optional(), optional: z.array(z.string()).optional() });
export const modPlanConfigBodySchema = z.object({ roots: z.array(configuredModSchema), optional: z.array(z.string()).optional() });
export const modDetailsSchema = z.array(z.object({ name: z.string(), title: z.string(), summary: z.string(), thumbnail: z.string().url().nullable() }));
export const modChangePlanBodySchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('update'), name: z.string().min(1), version: z.string().optional() }),
  z.object({ action: z.literal('remove'), name: z.string().min(1) }),
  z.object({ action: z.literal('set-enabled'), name: z.string().min(1), enabled: z.boolean() }),
]);
export const modApplyBodySchema = z.object({ planId: z.string().uuid() });
export const profileCreateBodySchema = z.object({}).strict().optional();
export const profileActivateBodySchema = z.object({ id: z.string().min(1) });
export const profileParamsSchema = z.object({ id: z.string().regex(/^p\d+$/) });
export const profileRenameBodySchema = z.object({ name: z.string().trim().min(1).max(64) });
export const saveUploadResultSchema = z.object({ name: z.string() });
export const profileQuickImportResultSchema = z.object({
  profile: z.object({ id: z.string(), name: z.string() }),
  save: saveUploadResultSchema,
  factorioVersion: exactVersionSchema,
  mods: z.array(z.object({ name: z.string(), version: z.string() })),
  warning: z.string(),
});

export type SaveEntryDto = z.infer<typeof saveEntrySchema>;
export type OperationDto = z.infer<typeof operationSchema>;
export type OverviewDto = z.infer<typeof overviewSchema>;
export type ModPlanDto = z.infer<typeof modPlanSchema>;
export type ModDetailsDto = z.infer<typeof modDetailsSchema>;
export type ConfiguredModDto = z.infer<typeof configuredModSchema>;
export type InstalledModDto = z.infer<typeof installedModSchema>;
export type LogEntryDto = z.infer<typeof logEntrySchema>;
export type VersionOptionsDto = z.infer<typeof versionOptionsSchema>;
export type SaveUploadResultDto = z.infer<typeof saveUploadResultSchema>;
export type ProfileQuickImportResultDto = z.infer<typeof profileQuickImportResultSchema>;
