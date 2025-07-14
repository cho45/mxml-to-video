import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test/setup.js'],
    testTimeout: 30000, // OSMD initialization can take time
  },
})