import { beforeAll, describe, expect, it } from 'vitest'
import { collector } from './collector.ts'
import type { DepthRecord } from './harness.ts'
import { DEFAULT_MAX_DEPTH, runDeep, runEnding } from './harness.ts'
import { formatDepthTable } from './report.ts'

/**
 * "Past depth 4 or so, a player who survived and picked up a few shields
 * cannot die" — docs/threads.md, "The deep game is unlosable". A death at or
 * above this depth is what the game currently cannot produce.
 */
const UNLOSABLE_DEPTH = 4

/**
 * Three of the seeds `engine.test.ts` plays its random walks on. About half
 * of all seeds kill this bot at depth 1 or 2 — it takes every fight with 10
 * HP — and those runs cost nothing; a seed that gets past depth 2 costs about
 * two seconds to play to the bottom, and seed 2 is the one here. Seed 3 also
 * survives and is left to `pnpm deep-run`, which has no time budget; add it
 * back if the assertion below needs a second survivor once it is meant to pass.
 */
const RUN_SEEDS = [1, 2, 12345]

describe('the deep-run harness', () => {
  it('is deterministic per run seed', () => {
    const once = runDeep(collector, 2, { maxDepth: 3 })
    const twice = runDeep(collector, 2, { maxDepth: 3 })
    expect(once).toEqual(twice)
    expect(once.length).toBeGreaterThan(0)
  })

  it('reports every level played, and only the last one can be fatal', () => {
    const records = runDeep(collector, 2, { maxDepth: 3 })
    expect(records.map((r) => r.depth)).toEqual(records.map((_r, i) => i + 1))
    for (const record of records.slice(0, -1)) expect(record.outcome).toBe('cleared')
  })
})

describe('the deep game', () => {
  // Played once for both tests below; each surviving seed is a couple of
  // seconds, and the table is printed from the same run the assertion reads.
  const runs = new Map<number, DepthRecord[]>()
  beforeAll(() => {
    for (const runSeed of RUN_SEEDS) runs.set(runSeed, runDeep(collector, runSeed))
    // The per-depth table docs/progression/findings.md asks for, as a side
    // effect. **A printout to read, not a target to tune toward** — the game
    // is expected to change a great deal before balance is worth optimizing.
    // `pnpm deep-run` prints the same thing without running the suite.
    for (const [runSeed, records] of runs) {
      console.log(formatDepthTable(`${collector.name}, runSeed ${runSeed}`, records) + '\n')
    }
  })

  const pastThreshold = (): DepthRecord[][] =>
    [...runs.values()].filter((r) => runEnding(r).depth > UNLOSABLE_DEPTH)

  it('lets a shield-collecting bot get past the threshold at all', () => {
    // A sanity check on the bot, not on the game: if nothing gets deep the
    // test below would pass for the wrong reason. Seed 2 does today.
    expect(pastThreshold().length).toBeGreaterThan(0)
  })

  // **Expected to fail today, and `it.fails` says so.** Every run that gets
  // past the threshold reaches depth 25 without dying — most of them without
  // being hit after depth 2. Flip this to a plain `it` when fusion lands
  // (step 2 in PLAN.md), which is the change that should make the deep game
  // losable. Verified 2026-09-07 that the plain `it` does fail.
  it.fails(`lets a shield-collecting bot die past depth ${UNLOSABLE_DEPTH}`, () => {
    const deaths = pastThreshold().filter((r) => runEnding(r).outcome === 'died')
    expect(
      deaths.length,
      `no run that got past depth ${UNLOSABLE_DEPTH} died before depth ${DEFAULT_MAX_DEPTH}`,
    ).toBeGreaterThan(0)
  })
})
