/**
 * The turn loop. Ports the body of `process-arrow-key!` and
 * `restore-player-health` from original/src/rogule/engine.cljs.
 *
 * Input handling itself is not here — reading keys is the UI's job (phase 6).
 * What this file owns is the order things happen in once a direction is known.
 */
import { castDraft, produce } from 'immer'
import type { Draft } from 'immer'
import { getPlayer } from '../entities.ts'
import type { Rng } from '../rng.ts'
import type { EntityId, GameState } from '../types.ts'
import { PLAYER_ID } from '../types.ts'
import { updateMonsters } from './monsters.ts'
import type { Dir } from './movement.ts'
import { moveTo, posInDir } from './movement.ts'
import { removeEntity, resetCombatList } from './state.ts'

/** Moves per point of regenerated health. The original spells it `rejuvination-rate`. */
export const REJUVENATION_RATE = 100

/**
 * Ticks the regeneration counter, and spends it when it comes due.
 *
 * At full health the counter is *held at zero* rather than left where it was, so
 * healing up and taking a fresh wound restarts the climb (`engine.cljs:112-125`).
 */
function restoreHealth(draft: Draft<GameState>): void {
  const stats = draft.entities[PLAYER_ID]?.stats
  if (!stats) return
  if (stats.hp.cur >= stats.hp.max) {
    stats.hpInc = 0
    return
  }
  const hpInc = stats.hpInc + 1
  if (hpInc >= REJUVENATION_RATE) {
    stats.hpInc = 0
    stats.hp.cur += 1
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
 * false there, so the monsters never get their go — and step 1 is put back, so
 * a free action does not cost the player the health bars they are reading
 * either. The clear has to happen up front regardless, because step 2 is what
 * records *this* turn's fighters.
 *
 * The `Rng` is the caller's — created from ambient entropy when the level starts
 * and held for its lifetime, or a fixed-seed one in tests. Combat randomness is
 * deliberately not derived from the level seed; see "Seeds control the world,
 * not the story" in PLAN.md.
 *
 * **This is the turn path's only `produce`.** Everything below it mutates the
 * draft. The external contract is unchanged and is what the UI holds: frozen
 * state in, frozen state out. See §6 of docs/port/05a-simplify.md. The rule is
 * per entry point, not per codebase — {@link expireAnimation} is the other one.
 */
export function takeTurn(state: GameState, dir: Dir | null, rng: Rng): GameState {
  // Not in the original, which left the key handler live after death and relied
  // on the modal to cover the board. Phase 6 gates input too; this makes the
  // engine safe on its own.
  if (state.outcome) return state

  const player = getPlayer(state)
  if (!player) return state
  const newPos = dir ? posInDir(player.pos, dir) : null

  return produce(state, (draft) => {
    resetCombatList(draft)
    moveTo(draft, PLAYER_ID, newPos, rng)
    // `moved` is false on exactly one path — the final `else` of `moveTo`, where
    // the target is impassable and nothing there wanted interacting with. That
    // is the free action, so nothing about the turn happened, health bars
    // included.
    if (!draft.entities[PLAYER_ID]?.moved) {
      draft.combatants = castDraft(state.combatants)
      return
    }
    if (draft.outcome) return
    draft.moves += 1
    restoreHealth(draft)
    updateMonsters(draft, rng)
  })
}

/**
 * Drops an entity whose animation has finished playing.
 *
 * Smoke puffs and collision markers carry `disposal: 'destroy'`; the UI's
 * `onAnimationEnd` calls this to clear them. It is the engine's second entry
 * point — and the reason the "one `produce`" rule above is stated per entry
 * point. The UI does not get to reach for Immer or hand-spread state itself.
 *
 * Removing an id that is already gone is a no-op, which matters because an
 * `animationend` can arrive for an element the same turn something else removed
 * its entity.
 */
export const expireAnimation = (state: GameState, id: EntityId): GameState =>
  produce(state, (draft) => {
    removeEntity(draft, id)
  })
