import type { Dependency } from './types.js';

export function compareVersions(a: string, b: string) {
  const left = a.split('.').map(Number); const right = b.split('.').map(Number);
  for (let index = 0; index < Math.max(left.length, right.length); index++) {
    const difference = (left[index] || 0) - (right[index] || 0);
    if (difference) return difference;
  }
  return 0;
}

export function satisfies(version: string, operator?: string, required?: string) {
  if (!operator || !required) return true;
  const value = compareVersions(version, required);
  return operator === '=' ? value === 0 : operator === '>' ? value > 0 : operator === '>=' ? value >= 0 : operator === '<' ? value < 0 : operator === '<=' ? value <= 0 : false;
}

export function parseDependency(raw: string): Dependency {
  const trimmed = raw.trim();
  let kind: Dependency['kind'] = 'required';
  let rest = trimmed;
  if (rest.startsWith('(?)')) { kind = 'hidden-optional'; rest = rest.slice(3).trim(); }
  else if (rest.startsWith('?')) { kind = 'optional'; rest = rest.slice(1).trim(); }
  else if (rest.startsWith('+')) { kind = 'recommended'; rest = rest.slice(1).trim(); }
  else if (rest.startsWith('~')) { kind = 'no-order'; rest = rest.slice(1).trim(); }
  else if (rest.startsWith('!')) { kind = 'incompatible'; rest = rest.slice(1).trim(); }
  const match = rest.match(/^(.+?)(?:\s*(>=|<=|=|>|<)\s*([0-9][0-9.]*))?$/);
  const name = match?.[1]?.trim();
  if (!match || !name || /[<>=]/.test(name)) throw new Error(`Unsupported dependency declaration: ${raw}`);
  return { kind, name, operator: match[2], version: match[3], raw };
}

export function normalizeModName(input: string) {
  const value = input.trim();
  if (!value) throw new Error('Mod name or URL is required');
  if (!value.includes('://')) {
    if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error('Invalid mod name');
    return value;
  }
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.hostname !== 'mods.factorio.com') throw new Error('Only official Mod Portal URLs are accepted');
  const match = url.pathname.match(/^\/mod\/([^/]+)\/?$/);
  if (!match) throw new Error('Invalid Mod Portal URL');
  return decodeURIComponent(match[1]);
}
