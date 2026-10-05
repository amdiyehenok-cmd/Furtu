import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Swaps jsdom's Blob and File for Node's complete ones. A suite that opts
    // into jsdom gets the DOM the OOXML operations need without losing the
    // arrayBuffer() method that every operation relies on.
    setupFiles: ['tests/setup.ts'],
    globals: false,
  },
});
