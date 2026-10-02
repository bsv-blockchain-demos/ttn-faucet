import { defineConfig } from 'vitest/config'
import { fileURLToPath } from 'node:url'

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('.', import.meta.url)) } },
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts', 'tests/**/*.test.ts', 'app/**/*.test.ts'],
    globals: true,
    // DB-backed test files share one SQLite database and assert on row counts (e.g. stats deltas),
    // so run files one at a time instead of racing each other.
    fileParallelism: false,
  },
})
