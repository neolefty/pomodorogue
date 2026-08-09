import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    // `src/game/` is deliberately DOM-free (see docs/port/03-core.md), so a node
    // environment is enough. Phase 6 will need jsdom for component tests.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
