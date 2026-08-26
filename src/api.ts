import type { z } from 'zod';
export { logEntrySchema, modDetailsSchema, modPlanSchema, operationSnapshotSchema, overviewSchema, profileQuickImportResultSchema, saveUploadResultSchema, versionOptionsSchema } from '../shared/contracts';
export type { ConfiguredModDto as ConfiguredMod, InstalledModDto as InstalledMod, LogEntryDto as LogEntry, ModDetailsDto as ModDetails, ModPlanDto as ModPlan, OperationDto as Operation, OverviewDto as Overview, ProfileQuickImportResultDto as ProfileQuickImportResult, SaveEntryDto as SaveEntry, SaveUploadResultDto as SaveUploadResult, VersionOptionsDto as VersionOptions } from '../shared/contracts';

export function request<T>(path: string, init: RequestInit | undefined, schema: z.ZodType<T>): Promise<T>;
export function request(path: string, init?: RequestInit): Promise<unknown>;
export async function request<T>(path: string, init?: RequestInit, schema?: z.ZodType<T>): Promise<T | unknown> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...init, headers });
  const payload: unknown = response.status === 204 ? undefined : await response.json();
  if (!response.ok) throw new Error(typeof payload === 'object' && payload && 'error' in payload ? String(payload.error) : response.statusText);
  return schema ? schema.parse(payload) : payload;
}
