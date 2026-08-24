import { describe, expect, test } from '@rstest/core';
import { inspectLevelInit } from './save-inspector.js';

test('reads exact Factorio and mod versions from a 2.x save header', () => {
  const bytes: number[] = [];
  const u8 = (value: number) => bytes.push(value);
  const u16 = (value: number) => bytes.push(value & 255, value >> 8);
  const u32 = (value: number) => bytes.push(value & 255, value >> 8 & 255, value >> 16 & 255, value >> 24 & 255);
  const text = (value: string) => { const encoded = new TextEncoder().encode(value); u8(encoded.length); bytes.push(...encoded); };
  u16(2); u16(0); u16(77); u16(1); u8(0);
  text('freeplay'); text(''); text('base'); u8(0); u8(0); u8(0); text('');
  u8(1); u8(0); u8(0); u8(0);
  u8(2); u8(0); u8(76); u32(12345); u8(2); bytes.push(0, 0, 160, 0);
  u8(2);
  text('base'); u8(2); u8(0); u8(77); u32(0);
  text('pycoalprocessing'); u8(3); u8(1); u8(9); u32(42);

  expect(inspectLevelInit(Uint8Array.from(bytes))).toMatchObject({
    factorioVersion: '2.0.77', loadedFromVersion: '2.0.76',
    mods: [{ name: 'base', version: '2.0.77' }, { name: 'pycoalprocessing', version: '3.1.9' }],
  });
});

test('parses a real Factorio 2.0 Space Age save header sample', () => {
  const sample = Buffer.from('AgAAAAgAAQAAAAhmcmVlcGxheQRiYXNlAQAAAAAAAAECAAg4NgEAAQAAoAALBGJhc2UCAAgXuiyeD2JlbHQtdmlzdWFsaXplcgIAAWA+ywIOZWxldmF0ZWQtcmFpbHMCAAiUg8FwDEZpbHRlckhlbHBlcgACA11IW3IEZmxpYgAPADeJOYUHcXVhbGl0eQIACJh0dt0FeWFmbGEAAQZi3vqHDkJvdHRsZW5lY2tMaXRlAQMADB6bEQ5mYWN0b3J5cGxhbm5lcgIAAa/UGKIPU21hcnRfSW5zZXJ0ZXJzAgAE70g1eQlzcGFjZS1hZ2UCAAiG6O3atljMuQUAGAAAAAAKYm5sLWVuYWJsZQUAAQAAAAAFdmFsdWUBAAEACGJubC1nbG93BQABAAAAAAV2YWx1ZQEAAQAZYm5sLWluY2x1ZGUtbWluaW5nLWRyaWxscwUAAQAAAAAFdmFsdWUBAAEAEmJubC1pbmRpY2F0b3Itc2l6ZQUAAQAAAAAFdmFsdWUFAAAFc21hbGwAEmJubC1jb2xvci1kaXNhYmxlZAUAAQAAAAAFdmFsdWUFAAQAAAAAAXICAAAAAAAAAPA/AAFnAgAAAAAAAAAAAAABYgIAAAAAAAAAAAAAAWECAAAAAAAAAPA/ABVibmwtY29sb3ItZnVsbF9vdXRwdXQFAAE=', 'base64');
  const result = inspectLevelInit(sample);
  expect(result.factorioVersion).toBe('2.0.8');
  expect(result.mods).toHaveLength(11);
  expect(result.mods).toContainEqual({ name: 'space-age', version: '2.0.8' });
  expect(result.mods).toContainEqual({ name: 'factoryplanner', version: '2.0.1' });
});
