import { readFile } from 'node:fs/promises';
import { unzipSync } from 'fflate';
import { z } from 'zod';

export const saveDependencySchema = z.object({ name: z.string(), version: z.string() });
export const saveInspectionSchema = z.object({
  factorioVersion: z.string(),
  loadedFromVersion: z.string(),
  mods: z.array(saveDependencySchema),
  warning: z.string(),
});
export type SaveInspection = z.infer<typeof saveInspectionSchema>;

export async function inspectFactorioSave(path: string): Promise<SaveInspection> {
  const archive = unzipSync(new Uint8Array(await readFile(path)));
  const entry = Object.entries(archive).find(([name]) => name.endsWith('/level-init.dat'))?.[1];
  if (!entry) throw new Error('Save does not contain level-init.dat');
  return inspectLevelInit(entry);
}

export function inspectLevelInit(bytes: Uint8Array): SaveInspection {
  const reader = new Reader(bytes);
  const factorioVersion = reader.version64();
  reader.bool();
  reader.string(); reader.string(); reader.string();
  reader.u8(); reader.bool(); reader.bool(); reader.string();
  reader.bool(); reader.bool(); reader.bool(); reader.bool();
  const loadedFromVersion = reader.version48();
  factorioVersion.major >= 2 ? reader.u32() : reader.u16();
  reader.bool();
  if (factorioVersion.major >= 2) reader.skip(4);
  const count = reader.optimU32();
  if (count > 100_000) throw new Error('Save mod list is invalid');
  const mods = Array.from({ length: count }, () => {
    const name = reader.string();
    const version = reader.version48();
    reader.u32();
    return { name, version: formatVersion(version) };
  });
  return saveInspectionSchema.parse({
    factorioVersion: formatVersion(factorioVersion),
    loadedFromVersion: formatVersion(loadedFromVersion),
    mods,
    warning: 'level-init.dat records the save initialization metadata and may be older than the mods used most recently.',
  });
}

interface Version { major: number; minor: number; patch: number }
function formatVersion(value: Version) { return `${value.major}.${value.minor}.${value.patch}`; }

class Reader {
  private offset = 0;
  constructor(private readonly bytes: Uint8Array) {}
  private ensure(length: number) { if (this.offset + length > this.bytes.length) throw new Error('Unexpected end of level-init.dat'); }
  skip(length: number) { this.ensure(length); this.offset += length; }
  u8() { this.ensure(1); return this.bytes[this.offset++]; }
  u16() { this.ensure(2); const value = this.bytes[this.offset] | this.bytes[this.offset + 1] << 8; this.offset += 2; return value; }
  u32() { this.ensure(4); const view = new DataView(this.bytes.buffer, this.bytes.byteOffset + this.offset, 4); const value = view.getUint32(0, true); this.offset += 4; return value; }
  optimU16() { const first = this.u8(); return first === 0xff ? this.u16() : first; }
  optimU32() { const first = this.u8(); return first === 0xff ? this.u32() : first; }
  bool() { return this.u8() !== 0; }
  string() { const length = this.optimU32(); this.ensure(length); const value = new TextDecoder('utf-8', { fatal: true }).decode(this.bytes.subarray(this.offset, this.offset + length)); this.offset += length; return value; }
  version48(): Version { return { major: this.optimU16(), minor: this.optimU16(), patch: this.optimU16() }; }
  version64(): Version { const major = this.u16(); const minor = this.u16(); const patch = this.u16(); this.u16(); return { major, minor, patch }; }
}
