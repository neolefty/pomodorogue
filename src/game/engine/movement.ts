/**
 * Moving one entity onto one square, and the predicates that say where an
 * entity may walk. Ports `move-to`, `player-passable-fn` and
 * `make-monster-passable-fn` from original/src/rogule/engine.cljs.
 *
 * This is where a turn actually happens: `moveTo` runs the encounters of
 * everything standing on the target square, then advances, bumps, or refuses.
 */
import { produce } from 'immer'
import type { PassableFn } from '../grid.ts'
import { canPassTile } from '../grid.ts'
import type { Pos } from '../pos.ts'
import { keyOf, posKey } from '../pos.ts'
import type { Rng } from '../rng.ts'
import type { Entity, EntityId, GameState } from '../types.ts'
import { PLAYER_ID } from '../types.ts'
import { ENCOUNTER_FNS, PASSABLE_FNS } from './registry.ts'

/** The four directions. The UI maps keys to these, never to raw deltas. */
export type Dir = 'left' | 'right' | 'up' | 'down'

export const DIR_DELTAS: Record<Dir, Pos> = {
  left: [-1, 0],
  right: [1, 0],
  up: [0, -1],
  down: [0, 1],
}

export const posInDir = (pos: Pos, dir: Dir): Pos => {
  const delta = DIR_DELTAS[dir]
  return [pos[0] + delta[0], pos[1] + delta[1]]
}

/** Keyed by the move's delta, so a bump plays away from whatever was hit. */
const BUMP_ANIMATIONS: Record<string, string> = {
  [posKey(-1, 0)]: 'bump-left',
  [posKey(1, 0)]: 'bump-right',
  [posKey(0, -1)]: 'bump-up',
  [posKey(0, 1)]: 'bump-down',
}

/** The player walks on any passable tile; only entities stop them. */
export function makePlayerPassable(state: GameState, _id: EntityId, _entity: Entity): PassableFn {
  return (x, y) => canPassTile(state.map.floorTiles, [x, y])
}

/**
 * Monsters additionally avoid each other — but not the player, who is what they
 * are pathing towards.
 *
 * The blocked set is built by scanning `state.entities` directly rather than
 * through `entitiesByPos`. The original indexed a *filtered* entity map here,
 * which rebuilds the whole index on every call and caches it against a throwaway
 * object; the memo only pays off for the one long-lived table. See "Immer and
 * the entity index" in docs/port/05-engine.md.
 *
 * Dead entities sit on the `floor` layer, so corpses never block a path.
 */
export function makeMonsterPassable(
  state: GameState,
  monsterId: EntityId,
  _monster: Entity,
): PassableFn {
  const blocked = new Set<string>()
  for (const [id, entity] of Object.entries(state.entities)) {
    if (entity.layer === 'occupy' && id !== monsterId && id !== PLAYER_ID) {
      blocked.add(keyOf(entity.pos))
    }
  }
  return (x, y) => canPassTile(state.map.floorTiles, [x, y]) && !blocked.has(posKey(x, y))
}

/**
 * Moves `id` to `newPos`, or rests when `newPos` is null.
 *
 * Three outcomes, in the original's order of precedence (`engine.cljs:82-90`):
 *
 * - **blocked by an entity** — an encounter returned `blocks`. The mover stays
 *   put, plays a bump animation, and *does* spend the turn.
 * - **passable tile** — the mover advances, and its `drop` comes with it.
 * - **neither** — a wall. Nothing happens and no turn is spent.
 *
 * Only these branches set `moved`, which is what makes bumping a monster cost a
 * turn while walking into a wall does not.
 */
export function moveTo(
  state: GameState,
  id: EntityId,
  newPos: Pos | null,
  rng: Rng,
): GameState {
  // No direction, so rest is assumed — and resting is a kind of move.
  if (!newPos) {
    return produce(state, (draft) => {
      const entity = draft.entities[id]
      if (entity) entity.moved = true
    })
  }

  const entity = state.entities[id]
  if (!entity) return state
  const pos = entity.pos

  const passableName = entity.fns?.passable
  const passable = passableName ? PASSABLE_FNS[passableName](state, id, entity) : undefined
  const passableTile = passable ? passable(newPos[0], newPos[1]) : true

  // Snapshot who is standing there before any encounter runs, as the original
  // does: an encounter may remove an entity, and the list must not shift under
  // the loop. Scanning directly rather than via `entitiesByPos` keeps the
  // original's insertion order and avoids indexing a table we are about to
  // replace anyway.
  const occupants = Object.values(state.entities).filter(
    (e) => e.pos[0] === newPos[0] && e.pos[1] === newPos[1],
  )

  let blocks = false
  let next = state
  for (const occupant of occupants) {
    const encounterName = occupant.fns?.encounter
    if (!encounterName) continue
    const [occupantBlocks, afterEncounter] = ENCOUNTER_FNS[encounterName](
      next,
      id,
      occupant.id,
      rng,
    )
    blocks = blocks || occupantBlocks
    next = afterEncounter
  }

  const bump = BUMP_ANIMATIONS[posKey(newPos[0] - pos[0], newPos[1] - pos[1])] ?? 'bump'
  const moves = state.moves

  return produce(next, (draft) => {
    const mover = draft.entities[id]
    if (!mover) return
    if (blocks) {
      // `frame` forces a remount so a repeated bump in the same direction replays.
      mover.animation = { name: bump, frame: moves }
      mover.moved = true
    } else if (passableTile) {
      mover.animation = null
      mover.pos = [newPos[0], newPos[1]]
      mover.moved = true
      // A mover's loot follows it (`engine.cljs:88`), on this branch only. Miss
      // this and a monster killed after chasing you across the map drops its
      // item back at its spawn point.
      if (mover.drop) mover.drop.pos = [newPos[0], newPos[1]]
    } else {
      mover.animation = null
      mover.moved = false
    }
  })
}
