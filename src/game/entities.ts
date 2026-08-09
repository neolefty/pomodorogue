/**
 * Entity indexing and queries. Ports the entity functions from
 * original/src/rogule/map.cljs.
 */
import type { PosKey } from './pos.ts'
import { keyOf } from './pos.ts'
import type { Entity, EntityId, GameState, Layer } from './types.ts'

export const LAYERS: readonly Layer[] = ['floor', 'between', 'occupy', 'above']

/** Entities at one position, bucketed by layer. */
export type CellEntities = Partial<Record<Layer, Entity[]>>

export type PosIndex = Map<PosKey, CellEntities>

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
 * The memo is why state updates go through Immer: structural sharing means an
 * update that doesn't touch entities leaves this cached, and the board re-renders
 * without rebuilding the index. A full clone per update would defeat it.
 */
export function entitiesByPos(entities: Record<EntityId, Entity>): PosIndex {
  const cached = indexCache.get(entities)
  if (cached) return cached
  const index = buildIndex(entities)
  indexCache.set(entities, index)
  return index
}

/** Entities occupying a position, in render order, corpses beneath the living. */
export function entitiesAt(index: PosIndex, key: PosKey): Entity[] {
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

export const getPlayer = (state: GameState): Entity | undefined => state.entities['player']

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
