export type { ModPlanDto as ModPlan, OperationDto as Operation, OverviewDto as Overview, SaveEntryDto as SaveEntry } from '../shared/contracts';

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, headers: { 'content-type': 'application/json', ...init?.headers } });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || response.statusText);
  return payload as T;
}
