/**
 * Prints the per-depth table from a headless deep run, one table per run seed.
 *
 *   pnpm deep-run              # the default seeds, depths 1–25
 *   pnpm deep-run 7 8 9        # your own seeds
 *
 * A printout to read, not a target to tune toward — see the header of
 * src/game/bot/harness.ts and docs/progression/findings.md. The test in
 * src/game/bot/harness.test.ts prints the same table and does not depend on
 * this script; this exists so the table can be read without running the
 * suite.
 */
import { collector } from '../src/game/bot/collector.ts'
import { runDeep } from '../src/game/bot/harness.ts'
import { formatDepthTable } from '../src/game/bot/report.ts'

const seeds = process.argv.slice(2).map(Number).filter(Number.isFinite)
const runSeeds = seeds.length > 0 ? seeds : [1, 2, 3, 12345]

for (const runSeed of runSeeds) {
  const started = performance.now()
  const records = runDeep(collector, runSeed)
  const elapsed = (performance.now() - started).toFixed(0)
  console.log(formatDepthTable(`${collector.name}, runSeed ${runSeed} (${elapsed} ms)`, records))
  console.log()
}
