export type { ConfiguredModDto as ConfiguredMod, InstalledModDto as InstalledMod, ModPlanDto as ModPlan, OperationDto as Operation, OverviewDto as Overview, SaveEntryDto as SaveEntry } from '../shared/contracts';

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('content-type')) headers.set('content-type', 'application/json');
  const response = await fetch(path, { ...init, headers });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || response.statusText);
  return payload as T;
}
