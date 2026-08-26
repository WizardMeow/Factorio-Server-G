import { expect, test } from '@rstest/core';
import { readFile } from 'node:fs/promises';

test('keeps direct SVG action icons at a readable minimum size', async () => {
  const css = await readFile(new URL('../src/styles/base.css', import.meta.url), 'utf8');
  expect(css).toMatch(/button\s*>\s*svg\s*\{[^}]*width:\s*18px;[^}]*height:\s*18px;/s);
});
