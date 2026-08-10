/**
 * Entity indexing and queries. Ports the entity functions from
 * original/src/rogule/map.cljs.
 */
import { keyOf } from './pos.ts'
import type { Entity, EntityId, GameState, Layer } from './types.ts'
import { PLAYER_ID } from './types.ts'

export const LAYERS: readonly Layer[] = ['floor', 'between', 'occupy', 'above']

/** Entities at one position, bucketed by layer. */
export type CellEntities = Partial<Record<Layer, Entity[]>>

export type PosIndex = Map<string, CellEntities>

function buildIndex(entities: Record<EntityId, Entity>): PosIndex {
  const index: PosIndex = new Map()
  for (const entity of Object.values(entities)) {
    const key = keyOf(entity.pos)
    let cell = index.get(key)
    if (!cell) {
      cell = {}
      index.set(key, cell)
    }
    ;(cell[entity.layer] ??= []).push(entity)
  }
  return index
}

const indexCache = new WeakMap<Record<EntityId, Entity>, PosIndex>()

/**
 * Position-keyed view of the entity table, memoized on the table's identity.
 *
 * Keyed by `"x,y"` strings, independently of how tiles are addressed — tiles are
 * a flat array indexed `y * w + x`. This index is rebuilt per state and never
 * persisted, so there is nothing to gain by packing it.
 *
 * The memo makes a *re-render* of an unchanged state free; it does not make
 * updates cheap. Every turn moves the player, so `entities` changes and this
 * rebuilds every turn regardless of Immer's structural sharing. Rebuilding a
 * ~40-entry index is microseconds. Immer earns its place separately, on the
 * nested writes and the single frozen boundary at `takeTurn` — two independent
 * wins, neither resting on the other. See §6 of docs/port/05a-simplify.md.
 */
export function entitiesByPos(entities: Record<EntityId, Entity>): PosIndex {
  const cached = indexCache.get(entities)
  if (cached) return cached
  const index = buildIndex(entities)
  indexCache.set(entities, index)
  return index
}

/** Entities occupying a position, in render order, corpses beneath the living. */
export function entitiesAt(index: PosIndex, key: string): Entity[] {
  const cell = index.get(key)
  if (!cell) return []
  const out: Entity[] = []
  for (const layer of LAYERS) {
    const inLayer = cell[layer]
    if (inLayer) out.push(...[...inLayer].sort((a, b) => Number(!!b.dead) - Number(!!a.dead)))
  }
  return out
}

/**
 * How many entities are named `name`, counting an entity's undropped loot too.
 * Used for the "you found 3 of 5 mushrooms" bars.
 */
export function countEntities(entities: Iterable<Entity>, name: string): number {
  let n = 0
  for (const e of entities) {
    if (e.name === name || e.drop?.name === name) n++
  }
  return n
}

export const getPlayer = (state: GameState): Entity | undefined => state.entities[PLAYER_ID]

/**
 * Allocates the next entity id. Deterministic, unlike the original's random UUIDs.
 *
 * **Draft/builder-only:** this mutates `state.nextEntityId`, so it is valid only
 * inside an Immer `produce` draft or on a state still under construction during
 * generation. The guard makes a violation fail loudly by name, rather than as a
 * bare readonly-property TypeError — or, if Immer's auto-freeze were ever
 * disabled, as a silent duplicate id.
 */
export function allocId(state: { nextEntityId: number }): EntityId {
  if (Object.isFrozen(state)) {
    throw new Error('allocId: state is frozen; call it inside produce() or during generation')
  }
  return `e${state.nextEntityId++}`
}
