import { describe, expect, it } from 'vitest'
import { allocId, countEntities, entitiesAt, entitiesByPos } from './entities.ts'
import { posKey } from './pos.ts'
import { SPRITES } from './sprites.ts'
import type { Entity, EntityId } from './types.ts'

const entity = (id: string, over: Partial<Entity> = {}): Entity => ({
  id,
  name: id,
  sprite: SPRITES.rat,
  pos: [1, 1],
  layer: 'occupy',
  ...over,
})

describe('entitiesByPos', () => {
  it('buckets by position and layer', () => {
    const entities: Record<EntityId, Entity> = {
      a: entity('a', { pos: [1, 1], layer: 'occupy' }),
      b: entity('b', { pos: [1, 1], layer: 'floor' }),
      c: entity('c', { pos: [2, 2], layer: 'occupy' }),
    }
    const index = entitiesByPos(entities)
    expect(index.get(posKey(1, 1))?.occupy?.map((e) => e.id)).toEqual(['a'])
    expect(index.get(posKey(1, 1))?.floor?.map((e) => e.id)).toEqual(['b'])
    expect(index.get(posKey(2, 2))?.occupy?.map((e) => e.id)).toEqual(['c'])
    expect(index.get(posKey(9, 9))).toBeUndefined()
  })

  it('memoizes on the entity table identity', () => {
    const entities = { a: entity('a') }
    expect(entitiesByPos(entities)).toBe(entitiesByPos(entities))
    expect(entitiesByPos({ ...entities })).not.toBe(entitiesByPos(entities))
  })
})

describe('entitiesAt', () => {
  it('returns entities in layer render order', () => {
    const entities: Record<EntityId, Entity> = {
      above: entity('above', { layer: 'above' }),
      floor: entity('floor', { layer: 'floor' }),
      occupy: entity('occupy', { layer: 'occupy' }),
      between: entity('between', { layer: 'between' }),
    }
    const ids = entitiesAt(entitiesByPos(entities), posKey(1, 1)).map((e) => e.id)
    expect(ids).toEqual(['floor', 'between', 'occupy', 'above'])
  })

  it('sorts corpses below the living within a layer, so items stay visible', () => {
    const entities: Record<EntityId, Entity> = {
      item: entity('item', { layer: 'floor' }),
      corpse: entity('corpse', { layer: 'floor', dead: true }),
    }
    const ids = entitiesAt(entitiesByPos(entities), posKey(1, 1)).map((e) => e.id)
    expect(ids).toEqual(['corpse', 'item'])
  })

  it('is empty for a position with nothing on it', () => {
    expect(entitiesAt(entitiesByPos({}), posKey(0, 0))).toEqual([])
  })
})

describe('countEntities', () => {
  it('counts by name', () => {
    const list = [entity('a', { name: 'mushroom' }), entity('b', { name: 'rat' })]
    expect(countEntities(list, 'mushroom')).toBe(1)
  })

  it('counts loot that has not been dropped yet', () => {
    // A cover hiding a mushroom still means the level contains one.
    const cover = entity('cover', { name: 'rock', drop: entity('m', { name: 'mushroom' }) })
    expect(countEntities([cover], 'mushroom')).toBe(1)
  })
})

describe('allocId', () => {
  it('is deterministic and does not repeat', () => {
    const state = { nextEntityId: 0 }
    expect([allocId(state), allocId(state), allocId(state)]).toEqual(['e0', 'e1', 'e2'])
    expect(state.nextEntityId).toBe(3)
  })
})
