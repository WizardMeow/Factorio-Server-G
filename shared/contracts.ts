import { z } from 'zod';

export const saveEntrySchema = z.object({ name: z.string(), size: z.number(), modifiedAt: z.string() });
export const operationSchema = z.object({ id: z.string(), kind: z.string(), stage: z.string(), result: z.string().optional(), error: z.string().optional(), startedAt: z.string(), updatedAt: z.string().optional(), finishedAt: z.string().optional() });
export const overviewSchema = z.object({
  server: z.object({ status: z.string(), running: z.boolean(), image: z.string().optional(), error: z.string().optional(), health: z.string().optional() }),
  operations: z.object({ active: operationSchema.optional(), history: z.array(operationSchema) }),
  saves: z.object({ main: saveEntrySchema.nullable(), autosaves: z.array(saveEntrySchema), imports: z.array(saveEntrySchema), backups: z.array(saveEntrySchema) }),
  config: z.object({ version: z.string() }), settings: z.record(z.string(), z.unknown()).nullable(), modRollbackAvailable: z.boolean().optional(),
});
export const dependencySchema = z.object({ kind: z.enum(['required', 'optional', 'hidden-optional', 'incompatible']), name: z.string(), operator: z.string().optional(), version: z.string().optional(), raw: z.string() });
export const modPlanSchema = z.object({ id: z.string(), factorioVersion: z.string(), createdAt: z.string(), roots: z.array(z.object({ name: z.string(), version: z.string().optional() })), selections: z.array(z.object({ name: z.string(), version: z.string(), explicit: z.boolean(), release: z.unknown() })), optional: z.array(z.object({ from: z.string(), dependency: dependencySchema })) });
export const serverActionParamsSchema = z.object({ action: z.enum(['start', 'stop', 'restart']) });
export const versionBodySchema = z.object({ version: z.string().regex(/^(latest|stable|\d+\.\d+(?:\.\d+)?)$/) });
export const savePromoteBodySchema = z.object({ kind: z.enum(['imports', 'backups']), name: z.string().endsWith('.zip') });
export const modPlanBodySchema = z.object({ input: z.string().min(1), version: z.string().optional(), optional: z.array(z.string()).optional() });
export const modApplyBodySchema = z.object({ planId: z.string().uuid() });

export type SaveEntryDto = z.infer<typeof saveEntrySchema>;
export type OperationDto = z.infer<typeof operationSchema>;
export type OverviewDto = z.infer<typeof overviewSchema>;
export type ModPlanDto = z.infer<typeof modPlanSchema>;
