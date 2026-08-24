import type { z } from 'zod';
export { overviewSchema, saveImportResultSchema, versionOptionsSchema } from '../shared/contracts';
export type { ConfiguredModDto as ConfiguredMod, InstalledModDto as InstalledMod, LogEntryDto as LogEntry, ModPlanDto as ModPlan, OperationDto as Operation, OverviewDto as Overview, SaveEntryDto as SaveEntry, SaveImportResultDto as SaveImportResult, VersionOptionsDto as VersionOptions } from '../shared/contracts';

export async function request<T>(path: string, init?: RequestInit, schema?: z.ZodType<T>): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...init, headers });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || response.statusText);
  return schema ? schema.parse(payload) : payload as T;
}
