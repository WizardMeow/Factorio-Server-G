import { describe, expect, test } from '@rstest/core';
import type { ModMetadataProvider } from './portal-client.js';
import { ModResolutionError, ModResolver } from './resolver.js';
import type { PortalMod, PortalRelease } from './types.js';
import { normalizeModName, parseDependency } from './versions.js';

describe('ModResolver', () => {
  test('accepts official URLs and rejects other hosts', () => {
    expect(normalizeModName('https://mods.factorio.com/mod/ParallelBeltBuilder?from=updated')).toBe('ParallelBeltBuilder');
    expect(() => normalizeModName('https://example.com/mod/nope')).toThrow('official Mod Portal');
  });

  test('parses required, optional, hidden and incompatible dependencies', () => {
    expect(parseDependency('library >= 1.2.0')).toMatchObject({ kind: 'required', name: 'library', operator: '>=', version: '1.2.0' });
    expect(parseDependency('? helper')).toMatchObject({ kind: 'optional', name: 'helper' });
    expect(parseDependency('(?) hidden')).toMatchObject({ kind: 'hidden-optional', name: 'hidden' });
    expect(parseDependency('! conflict < 2.0.0')).toMatchObject({ kind: 'incompatible', name: 'conflict' });
  });

  test('backtracks from newest dependency release to produce a complete graph', async () => {
    const provider = fixtureProvider({
      root: mod('root', [release('2.0.0', ['library >= 1.0.0', 'consumer'])]),
      consumer: mod('consumer', [release('1.0.0', ['library < 2.0.0'])]),
      library: mod('library', [release('2.0.0'), release('1.5.0')]),
    });
    const plan = await new ModResolver(provider).resolve('2.0.76', [{ name: 'root' }]);
    expect(plan.selections.map(item => `${item.name}@${item.version}`)).toEqual(['consumer@1.0.0', 'library@1.5.0', 'root@2.0.0']);
  });

  test('reports an unsatisfiable graph without returning a partial plan', async () => {
    const provider = fixtureProvider({ root: mod('root', [release('1.0.0', ['missing >= 2.0.0'])]), missing: mod('missing', [release('1.0.0')]) });
    await expect(new ModResolver(provider).resolve('2.0', [{ name: 'root' }])).rejects.toBeInstanceOf(ModResolutionError);
  });

  test('surfaces optional dependencies without silently selecting them', async () => {
    const provider = fixtureProvider({ root: mod('root', [release('1.0.0', ['? helper'])]) });
    const plan = await new ModResolver(provider).resolve('2.0', [{ name: 'root' }]);
    expect(plan.selections.map(item => item.name)).toEqual(['root']);
    expect(plan.optional[0]).toMatchObject({ from: 'root', dependency: { name: 'helper', kind: 'optional' } });
  });
});

function fixtureProvider(mods: Record<string, PortalMod>): ModMetadataProvider { return { async getMod(name) { const value = mods[name]; if (!value) throw new Error(`missing fixture ${name}`); return value; } }; }
function mod(name: string, releases: PortalRelease[]): PortalMod { return { name, title: name, summary: '', releases }; }
function release(version: string, dependencies: string[] = []): PortalRelease { return { version, download_url: `/download/x/${version}.zip`, file_name: `x_${version}.zip`, released_at: '2026-01-01T00:00:00Z', sha1: '0'.repeat(40), info_json: { factorio_version: '2.0', dependencies } }; }
