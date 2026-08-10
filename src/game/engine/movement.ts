/**
 * Moving one entity onto one square, and the predicates that say where an
 * entity may walk. Ports `move-to`, `player-passable-fn` and
 * `make-monster-passable-fn` from original/src/rogule/engine.cljs.
 *
 * This is where a turn actually happens: `moveTo` runs the encounters of
 * everything standing on the target square, then advances, bumps, or refuses.
 *
 * Everything here mutates an Immer draft. The engine opens exactly one
 * `produce`, in `takeTurn`; see §6 of docs/port/05a-simplify.md.
 */
import type { Draft } from 'immer'
import type { PassableFn } from '../grid.ts'
import { canPassTile } from '../grid.ts'
import type { Pos } from '../pos.ts'
import { keyOf, posEquals, posKey } from '../pos.ts'
import type { Rng } from '../rng.ts'
import type { EntityId, EntityKind, GameState } from '../types.ts'
import { PLAYER_ID } from '../types.ts'
import { combat } from './combat.ts'
import { addItemToInventory, finishLevel, increaseHp, uncoverItem } from './encounters.ts'

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
const BUMP_ANIMATIONS: Record<string, string> = Object.fromEntries(
  (Object.entries(DIR_DELTAS) as [Dir, Pos][]).map(([dir, [dx, dy]]) => [
    posKey(dx, dy),
    `bump-${dir}`,
  ]),
)

/** The player walks on any passable tile; only entities stop them. */
export function makePlayerPassable(state: GameState): PassableFn {
  const map = state.map
  return (x, y) => canPassTile(map, [x, y])
}

/**
 * Monsters additionally avoid each other — but not the player, who is what they
 * are pathing towards.
 *
 * The blocked set is built by scanning `state.entities` directly rather than
 * through `entitiesByPos`. The original indexed a *filtered* entity map here,
 * which rebuilds the whole index on every call and caches it against a throwaway
 * object; the memo only pays off for the one long-lived table.
 *
 * Positions are copied into the set as string keys, so the predicate is a
 * snapshot: it goes on answering about where things stood when it was built,
 * whatever the encounters do afterwards. That is what lets `moveTo` build it up
 * front and still get the original's pre-encounter answer.
 *
 * Dead entities sit on the `floor` layer, so corpses never block a path.
 */
export function makeMonsterPassable(state: GameState, monsterId: EntityId): PassableFn {
  const map = state.map
  const blocked = new Set<string>()
  for (const [id, entity] of Object.entries(state.entities)) {
    if (entity.layer === 'occupy' && id !== monsterId && id !== PLAYER_ID) {
      blocked.add(keyOf(entity.pos))
    }
  }
  return (x, y) => canPassTile(map, [x, y]) && !blocked.has(posKey(x, y))
}

/**
 * The mover's pathing rule. It belongs to whoever is moving, not to whatever is
 * being stood on — which is why phase 5's per-entity `passable` behavior name
 * was a long way round to this ternary.
 */
const makePassable = (state: GameState, id: EntityId): PassableFn =>
  id === PLAYER_ID ? makePlayerPassable(state) : makeMonsterPassable(state, id)

/**
 * Runs the encounter for one occupant of the square being moved onto, and
 * reports whether it blocks the mover from advancing.
 *
 * `blocks` is easy to get backwards, so: drinking and picking up return `false`
 * in every branch, including their no-ops; uncovering returns `true`, because
 * revealing what is under a rock costs the turn; the shrine returns `true`
 * because the level is over anyway; combat always returns `true`, because you do
 * not walk through something you just hit.
 *
 * This exhaustive `switch` replaced phase 5's `ENCOUNTER_FNS` table. It
 * type-checks the same way `satisfies Record<Name, Fn>` did — an unhandled kind
 * fails to compile on the `never` assignment — while removing the module cycle
 * that only the lookup table created.
 */
function runEncounter(
  draft: Draft<GameState>,
  kind: EntityKind,
  occupantId: EntityId,
  moverId: EntityId,
  rng: Rng,
): boolean {
  switch (kind) {
    case 'player':
    case 'monster':
      return combat(draft, moverId, occupantId, rng)
    case 'potion':
      return increaseHp(draft, moverId, occupantId)
    case 'item':
      return addItemToInventory(draft, moverId, occupantId)
    case 'cover':
      return uncoverItem(draft, moverId, occupantId)
    case 'shrine':
      return finishLevel(draft)
    default: {
      const unhandled: never = kind
      throw new Error(`runEncounter: unhandled entity kind ${String(unhandled)}`)
    }
  }
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
 *
 * `passable` lets a caller that has already built the mover's predicate (as
 * `chasePlayer` does for pathfinding) pass it in, instead of paying for the
 * entity-table scan a second time.
 */
export function moveTo(
  draft: Draft<GameState>,
  id: EntityId,
  newPos: Pos | null,
  rng: Rng,
  passable?: PassableFn,
): void {
  const entity = draft.entities[id]
  if (!entity) return

  // No direction, so rest is assumed — and resting is a kind of move.
  if (!newPos) {
    entity.moved = true
    return
  }

  // Everything read across the encounter loop is captured as a *value* first.
  // With one draft there is no pre-encounter state to fall back on, and a held
  // draft *object* would mutate underneath us — copying out is the whole
  // defense. See "The two places that read pre-encounter state" in
  // docs/port/05a-simplify.md.
  const from: Pos = [entity.pos[0], entity.pos[1]]
  const moves = draft.moves
  // Ids, not entities: an encounter may remove one, and each is re-resolved
  // below. Scanning directly rather than via `entitiesByPos` keeps the
  // original's insertion order.
  const occupantIds = Object.values(draft.entities)
    .filter((e) => posEquals(e.pos, newPos))
    .map((e) => e.id)
  // Built before any encounter runs, so it answers about pre-encounter
  // positions — as it always did, back when it was built against the old state.
  const canWalk = passable ?? makePassable(draft, id)

  let blocks = false
  for (const occupantId of occupantIds) {
    const occupant = draft.entities[occupantId]
    // Gone already — an earlier encounter on this same square removed it.
    if (!occupant?.kind) continue
    // A corpse has no behavior left. Phase 5 said this by deleting the encounter
    // name on death; `dead` was already carrying the same fact one line earlier.
    // Drop this and walking onto a corpse re-fights it, and blocks forever.
    if (occupant.dead) continue
    if (runEncounter(draft, occupant.kind, occupantId, id, rng)) blocks = true
  }

  const mover = draft.entities[id]
  if (!mover) return
  if (blocks) {
    const bump = BUMP_ANIMATIONS[posKey(newPos[0] - from[0], newPos[1] - from[1])] ?? 'bump'
    // `frame` forces a remount so a repeated bump in the same direction replays.
    mover.animation = { name: bump, frame: moves }
    mover.moved = true
  } else if (canWalk(newPos[0], newPos[1])) {
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
}
