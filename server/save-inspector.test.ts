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
