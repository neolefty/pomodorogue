/**
 * Level generation, tied together. Ports `make-level` from
 * original/src/rogule/generator.cljs.
 *
 * See docs/port/04-generator.md, and "Seeds control the world, not the story" in
 * PLAN.md for why this is split into a base pass and a (not yet existing)
 * overlay pass.
 */
import { countEntities } from '../entities.ts'
import { levelSeed, makeRng } from '../rng.ts'
import type { ContentProvider } from '../content/types.ts'
import type { GameState, LevelRequest } from '../types.ts'
import { makeEntities } from './entities.ts'
import { makeDiggerMap } from './map.ts'

/** The original's `size`, `entity-count` and `monster-count` (ui.cljs:26, generator.cljs:326). */
export const LEVEL_SIZE = 32
export const ENTITY_COUNT = 15
export const MONSTER_COUNT = 5

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

  const map = makeDiggerMap(seed, LEVEL_SIZE, LEVEL_SIZE)
  const { entities, nextEntityId } = makeEntities(
    map,
    request,
    content,
    rng,
    ENTITY_COUNT,
    MONSTER_COUNT,
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
    message: null,
    eventModal: null,
    outcome: null,
    counts,
    log: [{ type: 'start', seed, depth: request.depth }],
  }
}

/**
 * The level the player actually gets. Identical to the base pass until an
 * overlay exists — call this everywhere except in tests that specifically pin
 * base-pass determinism.
 */
export const makeLevel = makeBaseLevel
