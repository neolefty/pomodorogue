/**
 * Level generation, tied together. Ports `make-level` from
 * original/src/rogule/generator.cljs.
 *
 * See docs/port/04-generator.md, and "Seeds control the world, not the story" in
 * PLAN.md for why this is split into a base pass and a (not yet existing)
 * overlay pass.
 */
import { applyCarry } from '../carry.ts'
import { countEntities } from '../entities.ts'
import { levelSeed, makeRng } from '../rng.ts'
import type { ContentProvider } from '../content/types.ts'
import type { GameState, LevelRequest, PlayerCarry } from '../types.ts'
import { makeEntities } from './entities.ts'
import { makeDiggerMap } from './map.ts'
import { dugPercentageFor, entityCountFor, monsterCountFor } from './ramp.ts'

/** The original's `size` (ui.cljs:26). The entity counts live in `ramp.ts`. */
export const LEVEL_SIZE = 32

/** The collectibles the completion bars track. */
export const COUNTED_ITEMS = ['mushroom', 'chestnut', 'gem-stone'] as const

/**
 * Generates a level from a request and a content provider, and from nothing
 * else — no wall clock, no ambient randomness, no run state. Two calls with the
 * same `LevelRequest` produce deep-equal states, which is what
 * `generator.test.ts` pins down.
 *
 * **This is the base pass.** A history-driven overlay pass will one day compose
 * *around* this function rather than reaching inside it; see PLAN.md. When it
 * lands, two things here move: `counts` must be recomputed after the overlay, or
 * items it adds go untallied, and the overlay must keep allocating ids from
 * `nextEntityId` rather than restarting the counter.
 */
export function makeBaseLevel(request: LevelRequest, content: ContentProvider): GameState {
  const seed = levelSeed(request)
  // A stream distinct from the digger's, which is seeded separately inside
  // makeDiggerMap, and from the combat stream, which is derived in rng.ts.
  const rng = makeRng('entities', seed)

  const { map, roomTiles, corridorTiles, doorTiles } = makeDiggerMap(seed, LEVEL_SIZE, LEVEL_SIZE, {
    dugPercentage: dugPercentageFor(request.depth),
  })
  // Spawns go on floor only — never in a wall, and never in a doorway. The
  // doorways have to be subtracted explicitly: they are dug and outside every
  // room rect, so `corridorTiles` contains all of them. Leaving them in parks
  // monsters on the `occupy` layer in a room's only exit, which
  // `makeMonsterPassable` then treats as blocked for every other monster —
  // stranding whatever is behind it for the rest of the level.
  const spawnTiles = new Set([...roomTiles, ...corridorTiles])
  for (const index of doorTiles) spawnTiles.delete(index)

  const { entities, nextEntityId } = makeEntities(
    map,
    spawnTiles,
    request,
    content,
    rng,
    entityCountFor(request.depth),
    monsterCountFor(request.depth),
  )

  const counts: Record<string, number> = {}
  for (const name of COUNTED_ITEMS) {
    counts[name] = countEntities(Object.values(entities), name)
  }

  return {
    seed,
    depth: request.depth,
    map,
    entities,
    nextEntityId,
    moves: 0,
    combatants: {},
    outcome: null,
    counts,
    log: [{ type: 'start', seed, depth: request.depth }],
  }
}

/**
 * The level the player actually gets: the base pass, plus whatever the player
 * walked in with.
 *
 * The composition is the whole point. Carry is run history, so it may not reach
 * the base pass — but it has to reach the level, and this is the seam where the
 * two meet. A real overlay pass, when one lands, composes here in exactly the
 * same way and for exactly the same reason.
 *
 * Call this everywhere except in tests that specifically pin base-pass
 * determinism.
 */
export function makeLevel(
  request: LevelRequest,
  content: ContentProvider,
  carry: PlayerCarry | null = null,
): GameState {
  const base = makeBaseLevel(request, content)
  return carry ? applyCarry(base, carry) : base
}
