import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The whole suite is pure functions — intent, path assembly, parsing, token math. Anything
    // needing Atlas or a provider belongs in the manual smoke checks in PLAN.md, not here.
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
