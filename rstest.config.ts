import { defineConfig } from '@rstest/core';
import { withRsbuildConfig } from '@rstest/adapter-rsbuild';

export default defineConfig({
  extends: withRsbuildConfig(),
  include: ['server/**/*.test.ts'],
  testEnvironment: 'node',
  restoreMocks: true,
});
