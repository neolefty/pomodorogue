/**
 * The turn loop. Ports the body of `process-arrow-key!` and
 * `restore-player-health` from original/src/rogule/engine.cljs.
 *
 * Input handling itself is not here — reading keys is the UI's job (phase 6).
 * What this file owns is the order things happen in once a direction is known.
 */
import { produce } from 'immer'
import { getPlayer } from '../entities.ts'
import type { Rng } from '../rng.ts'
import type { GameState } from '../types.ts'
import { PLAYER_ID } from '../types.ts'
import { updateMonsters } from './monsters.ts'
import type { Dir } from './movement.ts'
import { moveTo, posInDir } from './movement.ts'
import { resetCombatList } from './state.ts'

/** Moves per point of regenerated health. The original spells it `rejuvination-rate`. */
export const REJUVENATION_RATE = 100

/**
 * Ticks the regeneration counter, and spends it when it comes due.
 *
 * At full health the counter is *held at zero* rather than left where it was, so
 * healing up and taking a fresh wound restarts the climb (`engine.cljs:112-125`).
 */
export function restorePlayerHealth(state: GameState): GameState {
  return produce(state, restoreHealth)
}

/** The draft-side body, so `takeTurn` can fold it into its own produce pass. */
function restoreHealth(draft: GameState): void {
  const stats = draft.entities[PLAYER_ID]?.stats
  if (!stats) return
  if (stats.hp[0] >= stats.hp[1]) {
    stats.hpInc = 0
    return
  }
  const hpInc = stats.hpInc + 1
  if (hpInc >= REJUVENATION_RATE) {
    stats.hpInc = 0
    stats.hp[0] += 1
  } else {
    stats.hpInc = hpInc
  }
}

/**
 * One player turn: move (or rest, when `dir` is null), then let the world react.
 *
 * The order is the original's, and it matters (`engine.cljs:386-397`):
 *
 * 1. clear last turn's health bars;
 * 2. move the player, which runs encounters and may end the game;
 * 3. if the game is still on **and** the player actually spent the turn, count
 *    the move, regenerate, and run the monsters.
 *
 * Step 3's guard is why walking into a wall is free: `moveTo` leaves `moved`
 * false there, so the monsters never get their go.
 *
 * The `Rng` is the caller's — created from ambient entropy when the level starts
 * and held for its lifetime, or a fixed-seed one in tests. Combat randomness is
 * deliberately not derived from the level seed; see "Seeds control the world,
 * not the story" in PLAN.md.
 */
export function takeTurn(state: GameState, dir: Dir | null, rng: Rng): GameState {
  // Not in the original, which left the key handler live after death and relied
  // on the modal to cover the board. Phase 6 gates input too; this makes the
  // engine safe on its own.
  if (state.outcome) return state

  const player = getPlayer(state)
  if (!player) return state
  const newPos = dir ? posInDir(player.pos, dir) : null

  let next = produce(state, resetCombatList)
  next = moveTo(next, PLAYER_ID, newPos, rng)

  if (next.outcome || !next.entities[PLAYER_ID]?.moved) return next

  // One produce pass for the whole between-moves bookkeeping.
  next = produce(next, (draft) => {
    draft.moves += 1
    restoreHealth(draft)
  })
  return updateMonsters(next, rng)
}
