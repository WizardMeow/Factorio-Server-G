export type DependencyKind = 'required' | 'optional' | 'hidden-optional' | 'incompatible';
export interface Dependency { kind: DependencyKind; name: string; operator?: string; version?: string; raw: string }
import type { PortalRelease } from './schemas.js';
export type { PortalMod, PortalRelease } from './schemas.js';
export interface ModSelection { name: string; version: string; explicit: boolean; release: PortalRelease }
export interface ModPlan {
  id: string;
  factorioVersion: string;
  roots: Array<{ name: string; version?: string }>;
  selections: ModSelection[];
  optional: Array<{ from: string; dependency: Dependency }>;
  createdAt: string;
}
