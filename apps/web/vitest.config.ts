import { defineConfig } from 'vitest/config';

// The web tests cover plain TypeScript (API client, navigation rules, mock API); they need no DOM.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
  },
});
