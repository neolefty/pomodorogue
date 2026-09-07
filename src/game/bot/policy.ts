/**
 * The seam between *how a bot plays* and *what a bot is driven through*.
 *
 * A `Policy` chooses moves; the harness in `harness.ts` owns the level loop
 * and knows nothing about how a move was chosen. The split exists so that
 * several play styles can be measured against the same run seeds — the
 * question "is the deep game losable?" has a different answer for a player who
 * hoards shields than for one who sprints to the stairs, and both answers are
 * wanted. See docs/progression/findings.md, "Measure before tuning".
 *
 * **Intended styles, none built yet but this is where they go**, one file each
 * beside `collector.ts`:
 *
 * - **prefer-descending** — straight to the shrine, fighting only what stands
 *   in the corridor. The lower bound on how much gear a run accumulates.
 * - **completionist** — every cover lifted, every monster fought, then the
 *   shrine. The upper bound, and what `collector` approximates today.
 * - **conservative** — rests when hurt and nothing is near, walks around
 *   monsters above its weight. The closest thing to a careful human.
 *
 * Deliberately minimal: a policy sees the whole `GameState` and answers with a
 * `Dir` or `null` (rest), exactly what `takeTurn` accepts, so a policy can be
 * played by the UI one day with no adapter. A policy may cheat by reading
 * things the fog hides — nothing stops it — but the built-in one does not,
 * because a bot that knows what is under every rock measures a game nobody
 * plays.
 */
import type { Dir } from '../engine/movement.ts'
import type { GameState } from '../types.ts'

/**
 * A move chooser bound to one level. Whatever memory a style needs — a target
 * it is committed to, tiles it has given up on — lives in the closure, so the
 * harness never learns its shape.
 */
export type Chooser = (state: GameState) => Dir | null

export interface Policy {
  /** Names the style in the printed table. */
  readonly name: string
  /**
   * Called once per level with its opening state. Per-level rather than
   * per-run on purpose: a level is what a human starts fresh at every break,
   * and cross-level memory is exactly what carry already represents.
   */
  begin(state: GameState): Chooser
}
