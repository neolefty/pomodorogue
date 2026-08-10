import { execFileSync } from 'node:child_process'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// A deploy is "cron noticed a commit and rebuilt", with nothing in the UI to
// say which commit that was. Stamping the build into the bundle is the cheapest
// way to answer "is what I'm looking at the thing I just pushed?" — see the
// build stamp in src/main.tsx.
const git = (...args: string[]): string => {
  try {
    return execFileSync('git', args, { encoding: 'utf8' }).trim()
  } catch {
    // Building outside a checkout (tarball, container without .git) is not a
    // reason to fail the build — the stamp just degrades to the date.
    return 'unknown'
  }
}

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUILD_COMMIT__: JSON.stringify(git('rev-parse', '--short', 'HEAD')),
    __BUILD_SUBJECT__: JSON.stringify(git('log', '-1', '--format=%s')),
  },
  test: {
    globals: true,
    // `src/game/` is deliberately DOM-free (see docs/port/03-core.md), so a node
    // environment is enough. Phase 6 will need jsdom for component tests.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
