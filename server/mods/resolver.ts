import { randomUUID } from 'node:crypto';
import type { ModMetadataProvider } from './portal-client.js';
import type { Dependency, ModPlan, ModSelection, PortalRelease } from './types.js';
import { compareVersions, parseDependency, satisfies } from './versions.js';

const BUILT_INS = new Set(['base', 'core', 'elevated-rails', 'quality', 'recycler', 'space-age']);
interface Constraint { from: string; operator?: string; version?: string }

export class ModResolutionError extends Error {}

export class ModResolver {
  private cache = new Map<string, Awaited<ReturnType<ModMetadataProvider['getMod']>>>();
  constructor(private readonly provider: ModMetadataProvider, private readonly log: (fields: Record<string, unknown>, message: string) => void = () => {}) {}

  async resolve(factorioVersion: string, roots: Array<{ name: string; version?: string; enabled?: boolean }>): Promise<ModPlan> {
    this.log({ factorioVersion, roots: roots.map(root => root.name) }, 'mod dependency resolution started');
    const normalizedFactorio = factorioVersion.match(/^\d+\.\d+/)?.[0];
    if (!normalizedFactorio) throw new ModResolutionError(`An exact Factorio major.minor is required, received ${factorioVersion}`);
    const constraints = new Map<string, Constraint[]>();
    for (const root of roots) constraints.set(root.name, [{ from: 'root', operator: root.version ? '=' : undefined, version: root.version }]);
    const result = await this.search(normalizedFactorio, constraints, new Map(), [], new Set(roots.map(root => root.name)));
    if (!result) throw new ModResolutionError('No compatible dependency graph could be resolved');
    const plan = { id: randomUUID(), factorioVersion: normalizedFactorio, roots: roots.map(root => ({ ...root, enabled: root.enabled ?? true })), selections: [...result.selected.values()].sort((a, b) => a.name.localeCompare(b.name)), optional: result.optional, createdAt: new Date().toISOString() };
    this.log({ planId: plan.id, selectionCount: plan.selections.length, optionalCount: plan.optional.length }, 'mod dependency resolution completed');
    return plan;
  }

  async details(name: string) {
    const mod = await this.load(name);
    return { name: mod.name, title: mod.title, summary: mod.summary, thumbnail: officialThumbnail(mod.thumbnail) };
  }

  private async search(factorioVersion: string, constraints: Map<string, Constraint[]>, selected: Map<string, ModSelection>, optional: ModPlan['optional'], explicit: Set<string>): Promise<{ selected: Map<string, ModSelection>; optional: ModPlan['optional'] } | null> {
    for (const [name, selection] of selected) if (!(constraints.get(name) ?? []).every(value => satisfies(selection.version, value.operator, value.version))) return null;
    const pending = [...constraints.keys()].find(name => !selected.has(name) && !BUILT_INS.has(name));
    if (!pending) return this.hasConflict(selected) ? null : { selected, optional: uniqueOptional(optional) };
    const mod = await this.load(pending);
    const candidates = mod.releases.filter(release => release.info_json.factorio_version === factorioVersion && (constraints.get(pending) ?? []).every(value => satisfies(release.version, value.operator, value.version))).sort((a, b) => compareVersions(b.version, a.version));
    for (const release of candidates) {
      const nextSelected = new Map(selected).set(pending, { name: pending, version: release.version, explicit: explicit.has(pending), release });
      const nextConstraints = cloneConstraints(constraints);
      const nextOptional = [...optional];
      let invalid = false;
      for (const raw of release.info_json.dependencies ?? []) {
        const dependency = parseDependency(raw);
        if (BUILT_INS.has(dependency.name)) continue;
        if (dependency.kind === 'required' || dependency.kind === 'no-order') nextConstraints.set(dependency.name, [...nextConstraints.get(dependency.name) ?? [], { from: pending, operator: dependency.operator, version: dependency.version }]);
        else if (dependency.kind === 'incompatible') {
          const installed = nextSelected.get(dependency.name);
          if (installed && satisfies(installed.version, dependency.operator, dependency.version)) invalid = true;
        } else nextOptional.push({ from: pending, dependency });
      }
      if (invalid) continue;
      const answer = await this.search(factorioVersion, nextConstraints, nextSelected, nextOptional, explicit);
      if (answer) return answer;
    }
    return null;
  }

  private hasConflict(selected: Map<string, ModSelection>) {
    for (const selection of selected.values()) for (const raw of selection.release.info_json.dependencies ?? []) {
      const dependency = parseDependency(raw);
      const installed = selected.get(dependency.name);
      if (dependency.kind === 'incompatible' && installed && satisfies(installed.version, dependency.operator, dependency.version)) return true;
    }
    return false;
  }
  private async load(name: string) { const cached = this.cache.get(name); if (cached) return cached; this.log({ modName: name }, 'fetching Mod Portal metadata'); const mod = await this.provider.getMod(name); this.cache.set(name, mod); return mod; }
}

function officialThumbnail(value: string | null | undefined) {
  if (!value) return null;
  try {
    const url = new URL(value, 'https://mods.factorio.com');
    return ['mods.factorio.com', 'assets-mod.factorio.com', 'mods-data.factorio.com'].includes(url.hostname) ? url.toString() : null;
  } catch { return null; }
}

function cloneConstraints(value: Map<string, Constraint[]>) { return new Map([...value].map(([name, constraints]) => [name, [...constraints]])); }
function uniqueOptional(value: Array<{ from: string; dependency: Dependency }>) { const seen = new Set<string>(); return value.filter(item => { const key = `${item.from}:${item.dependency.raw}`; if (seen.has(key)) return false; seen.add(key); return true; }); }
