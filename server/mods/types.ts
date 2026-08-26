export type DependencyKind = 'required' | 'optional' | 'recommended' | 'hidden-optional' | 'no-order' | 'incompatible';
export interface Dependency { kind: DependencyKind; name: string; operator?: string; version?: string; raw: string }
import type { PortalRelease } from './schemas.js';
export type { PortalMod, PortalRelease } from './schemas.js';
export interface ModSelection { name: string; version: string; explicit: boolean; release: PortalRelease }
export interface ConfiguredMod { name: string; version?: string; enabled: boolean }
export interface ModPlan {
  id: string;
  factorioVersion: string;
  roots: ConfiguredMod[];
  selections: ModSelection[];
  optional: Array<{ from: string; dependency: Dependency }>;
  createdAt: string;
}
