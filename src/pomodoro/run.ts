/**
 * The run: starting one, and moving it on when the player chooses.
 *
 * Pure except for the seed, which is minted from ambient entropy — the edge's
 * job, never the engine's. Nothing under `src/game/` may call `Math.random` or
 * `Date.now`, and there is a lint rule saying so.
 *
 * This file is where "two modes, and no mode flag" actually lives. There is no
 * setting and no stored mode: *progressive* is what you get by taking
 * {@link advanceRun}'s `'descend'` branch, *fixed* is what you get by taking
 * `'restart'` every time — which is what the game did unconditionally before
 * phase 8. The words appear in the docs and never in the UI. See
 * docs/port/08-depth.md.
 */
import { snapshotCarry } from '../game/carry.ts'
import type { GameState, Statistics } from '../game/types.ts'
import { emptyStatistics } from '../game/types.ts'
import type { Run, RunChoice } from './persistence.ts'

/** A fresh seed from ambient entropy. */
export const randomSeed = (): number => Math.floor(Math.random() * 2 ** 31)

/**
 * A new run at depth 1, carrying the player's totals and their standing
 * preference forward, and nothing else.
 *
 * The seed is rerolled per run on purpose: a fixed one would hand the player
 * the same dungeon every twenty-five minutes.
 */
export const newRun = (
  statistics: Statistics = emptyStatistics(),
  preferred: Run['preferred'] = 'descend',
): Run => ({
  runSeed: randomSeed(),
  depth: 1,
  carry: null,
  next: null,
  preferred,
  statistics,
})

/**
 * Applies the choice the player made on the end-of-level screen, producing the
 * run the next break will play.
 *
 * `finished` is the level that just ended, still in its slot — which is what
 * makes descending able to snapshot the carry *here*, at the moment it is
 * needed, rather than at the moment the button was pressed. Doing it late is
 * what keeps `carry` meaning one thing at all times: what the player brought
 * into `depth`. It is null only when the saved level was discarded on load,
 * where there is nothing to snapshot and the run keeps what it already had.
 *
 * **`runs` counts runs that have *ended*, not levels played** — the counter's
 * old meaning, back when one level was one run. A run ends two ways: the player
 * dies, which `recordOutcome` counts at the moment of death, or the player
 * walks away from a live run by starting over, which is counted here. Hence the
 * `cleared` test: a `'restart'` chosen after a death is the player getting on
 * with the next run, not ending a second one.
 */
export function advanceRun(run: Run, choice: RunChoice, finished: GameState | null): Run {
  switch (choice) {
    case 'descend':
      return {
        ...run,
        depth: run.depth + 1,
        carry: finished ? snapshotCarry(finished) : run.carry,
        next: null,
        preferred: 'descend',
      }

    case 'restart': {
      const abandoned = finished?.outcome === 'cleared'
      const statistics = abandoned
        ? { ...run.statistics, runs: run.statistics.runs + 1 }
        : run.statistics
      return newRun(statistics, 'restart')
    }

    // The same dungeon from the top: same seed, so the same depth-1 level and
    // the same depth-2 level after it. Not a free pass — the death has already
    // taken the carry and reset the streak. `preferred` is left alone; retrying
    // one bad death says nothing about how the player likes to play.
    case 'retry':
      return { ...run, depth: 1, carry: null, next: null }
  }
}
