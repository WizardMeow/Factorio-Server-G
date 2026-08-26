import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { expect, test } from '@rstest/core';
import { ModPlanner } from '../../src/components/ModPlanner';

test('uses distinct semantic colors for lock, enable, and remove actions', () => {
  const html = renderToStaticMarkup(createElement(ModPlanner, {
    busy: false,
    running: false,
    onSaved: async () => {},
    mods: {
      roots: [
        { name: 'locked-mod', version: '1.0.0', enabled: true },
        { name: 'unlocked-mod', enabled: false },
      ],
      resolved: [{ name: 'locked-mod', version: '1.0.0', explicit: true, enabled: true }, { name: 'unlocked-mod', version: '2.0.0', explicit: true, enabled: false }],
      installed: [],
      pending: false,
    },
  }));

  expect(html).toContain('text-[#6ee7a0]');
  expect(html).toContain('text-[#fbbf24]');
  expect(html).toContain('text-[#94a3b8]');
  expect(html).toContain('text-[#fb7185]');
  expect(html).toContain('lucide-power');
});
