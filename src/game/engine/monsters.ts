/**
 * Monster AI, such as it is. Ports `chase-player` and `update-monsters` from
 * original/src/rogule/engine.cljs.
 */
import type { Draft } from 'immer'
import { getPlayer } from '../entities.ts'
import { findPath } from '../grid.ts'
import type { Rng } from '../rng.ts'
import type { Entity, EntityId, GameState } from '../types.ts'
import { makeMonsterPassable, moveTo } from './movement.ts'

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
  draft: Draft<GameState>,
  monsterId: EntityId,
  monster: Draft<Entity>,
  rng: Rng,
): void {
  const player = getPlayer(draft)
  if (!player) return

  const passable = makeMonsterPassable(draft, monsterId)
  const path = findPath(monster.pos, player.pos, passable)

  if (path.length < (monster.activation ?? 0) && rng.next() < CHASE_CHANCE) {
    // `path[0]` is where the monster already stands; step to the next square.
    // An empty path leaves this undefined, which `moveTo` reads as a rest.
    // The predicate rides along so `moveTo` need not rebuild it.
    moveTo(draft, monsterId, path[1] ?? null, rng, passable)
  }
}

/**
 * Gives every living monster its move, once, in entity order.
 *
 * Corpses are skipped on `dead` rather than by having had a behavior name
 * stripped off them at the kill site, which is how phase 5 stopped a corpse from
 * chasing; `dead` was already set one line earlier there. See §1 of
 * docs/port/05a-simplify.md.
 *
 * The original captured each entity alongside its id before the loop and passed
 * that stale copy in. Here the entity is re-read from the draft, which is
 * equivalent today — nothing kills a monster during its own turn — and stops a
 * future overlay entity from acting on a snapshot of itself.
 */
export function updateMonsters(draft: Draft<GameState>, rng: Rng): void {
  const ids = Object.keys(draft.entities).filter((id) => {
    const entity = draft.entities[id]
    return entity?.kind === 'monster' && !entity.dead
  })

  for (const id of ids) {
    const entity = draft.entities[id]
    if (!entity || entity.dead) continue
    chasePlayer(draft, id, entity, rng)
  }
}
