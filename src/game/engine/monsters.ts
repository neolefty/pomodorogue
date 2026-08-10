/**
 * Monster AI, such as it is. Ports `chase-player` and `update-monsters` from
 * original/src/rogule/engine.cljs.
 */
import { getPlayer } from '../entities.ts'
import { findPath } from '../grid.ts'
import type { Rng } from '../rng.ts'
import type { Entity, EntityId, GameState } from '../types.ts'
import { makeMonsterPassable, moveTo } from './movement.ts'
import { UPDATE_FNS } from './registry.ts'

/** Chance a woken monster actually moves on a given turn (`engine.cljs:353`). */
const CHASE_CHANCE = 0.9

/**
 * Walk one step towards the player, if they are close enough to have been
 * noticed and today is not the monster's day off.
 *
 * `activation` is measured in path steps, not straight-line distance, so a
 * monster two squares away through a wall stays asleep. The 10% dawdle keeps
 * pursuit from being perfectly predictable — and it is why an `UpdateFn` needs
 * the `Rng` at all.
 *
 * Note the short-circuit: the dawdle roll is only drawn when the monster is
 * awake, as in the original's `and`. Drawing it unconditionally would shift
 * every later roll in the stream.
 */
export function chasePlayer(
  state: GameState,
  monsterId: EntityId,
  monster: Entity,
  rng: Rng,
): GameState {
  const player = getPlayer(state)
  if (!player) return state

  const passable = makeMonsterPassable(state, monsterId, monster)
  const path = findPath(monster.pos, player.pos, passable)

  if (path.length < (monster.activation ?? 0) && rng.next() < CHASE_CHANCE) {
    // `path[0]` is where the monster already stands; step to the next square.
    // An empty path leaves this undefined, which `moveTo` reads as a rest.
    // The predicate rides along so `moveTo` need not rebuild it.
    return moveTo(state, monsterId, path[1] ?? null, rng, passable)
  }
  return state
}

/**
 * Runs every entity with an `update` behavior, once, in entity order.
 *
 * The original captured each entity alongside its id before the loop and passed
 * that stale copy in. Here the entity is re-read from the threaded state, which
 * is equivalent today — nothing kills a monster during its own turn — and stops
 * a future overlay entity from acting on a snapshot of itself.
 */
export function updateMonsters(state: GameState, rng: Rng): GameState {
  const ids = Object.keys(state.entities).filter((id) => state.entities[id]?.fns?.update)

  let next = state
  for (const id of ids) {
    const entity = next.entities[id]
    const updateName = entity?.fns?.update
    if (!entity || !updateName) continue
    next = UPDATE_FNS[updateName](next, id, entity, rng)
  }
  return next
}
