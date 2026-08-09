import { describe, expect, it } from 'vitest'
import { posKey } from './pos.ts'
import { SPRITES } from './sprites.ts'
import type { GameState } from './types.ts'

/**
 * A hand-built state exercising every field shape in GameState — nested
 * entities, inventory, drops, tuples, nulls. Once the generator lands in phase 4
 * this should be supplemented with a real generated level, but the guard below
 * is worth having before then.
 */
function sampleState(): GameState {
  return {
    seed: 12345,
    depth: 1,
    map: {
      floorTiles: { [posKey(1, 1)]: 'room', [posKey(2, 1)]: 'door', [posKey(3, 1)]: 'wall' },
      roomTiles: { [posKey(1, 1)]: 'room' },
      corridorTiles: {},
      rooms: [{ x1: 1, y1: 1, x2: 4, y2: 4, doors: [[2, 1]] }],
      size: [32, 32],
    },
    entities: {
      player: {
        id: 'player',
        name: 'you',
        sprite: SPRITES.elf,
        pos: [1, 1],
        layer: 'occupy',
        stats: { hp: [7, 10], xp: 3, hpInc: 42 },
        inventory: [
          { id: 'e1', name: 'axe', sprite: SPRITES.axe, pos: [1, 1], layer: 'floor', dmg: 2 },
        ],
        fns: { encounter: 'combat', passable: 'playerPassable' },
        kills: [{ name: 'the bat', sprite: SPRITES.bat }],
        killedBy: null,
        animation: null,
      },
      e2: {
        id: 'e2',
        name: 'the rat',
        sprite: SPRITES.rat,
        pos: [2, 1],
        layer: 'occupy',
        stats: { hp: [2, 2], xp: 1, hpInc: 0 },
        activation: 3,
        fns: { encounter: 'combat', update: 'chasePlayer', passable: 'monsterPassable' },
        drop: {
          id: 'e3',
          name: 'mushroom',
          sprite: SPRITES.mushroom,
          pos: [2, 1],
          layer: 'floor',
          value: 2,
        },
      },
    },
    nextEntityId: 4,
    moves: 17,
    combatants: { e2: true },
    message: { text: 'the rat hit you', expires: 3 },
    eventModal: null,
    outcome: null,
    counts: { mushroom: 3, chestnut: 1 },
    log: [{ type: 'start', seed: 12345, depth: 1 }],
  }
}

describe('GameState serializability', () => {
  it('round-trips through JSON unchanged', () => {
    // Phase 7 persists in-progress levels to localStorage across the 25-minute
    // work interval, so any Map/Set/Date/function creeping into state is a bug.
    const state = sampleState()
    const roundTripped = JSON.parse(JSON.stringify(state)) as GameState
    expect(roundTripped).toEqual(state)
  })

  it('has no undefined-valued keys, which JSON would silently drop', () => {
    const seen = new Set<unknown>()
    const walk = (value: unknown, path: string): void => {
      if (value === null || typeof value !== 'object') return
      if (seen.has(value)) return
      seen.add(value)
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        expect(v, `${path}.${k} is undefined; omit the key or use null`).not.toBeUndefined()
        walk(v, `${path}.${k}`)
      }
    }
    walk(sampleState(), 'state')
  })

  it('holds no functions, so behavior must go through the name registries', () => {
    const walk = (value: unknown, path: string): void => {
      expect(typeof value, `${path} is a function`).not.toBe('function')
      if (value === null || typeof value !== 'object') return
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        walk(v, `${path}.${k}`)
      }
    }
    walk(sampleState(), 'state')
  })
})
