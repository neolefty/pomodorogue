import { describe, expect, it } from 'vitest'
import { tileIndex } from './grid.ts'
import type { Pos } from './pos.ts'
import { SPRITES } from './sprites.ts'
import type { GameState, Tile } from './types.ts'
import { TILE } from './types.ts'

/**
 * A hand-built state exercising every field shape in GameState — nested
 * entities, inventory, drops, tuples, nulls. Once the generator lands in phase 4
 * this should be supplemented with a real generated level, but the guard below
 * is worth having before then.
 */
const MAP_SIZE: Pos = [32, 32]

function sampleFloorTiles(): Tile[] {
  const tiles = new Array<Tile>(MAP_SIZE[0] * MAP_SIZE[1]).fill(TILE.rock)
  tiles[tileIndex(MAP_SIZE, 1, 1)] = TILE.room
  tiles[tileIndex(MAP_SIZE, 2, 1)] = TILE.door
  tiles[tileIndex(MAP_SIZE, 3, 1)] = TILE.wall
  return tiles
}

function sampleState(): GameState {
  return {
    seed: 12345,
    depth: 1,
    map: {
      floorTiles: sampleFloorTiles(),
      rooms: [{ x1: 1, y1: 1, x2: 4, y2: 4, doors: [[2, 1]] }],
      size: MAP_SIZE,
    },
    entities: {
      player: {
        id: 'player',
        name: 'you',
        sprite: SPRITES.elf,
        pos: [1, 1],
        layer: 'occupy',
        stats: { hp: { cur: 7, max: 10 }, xp: 3, hpInc: 42 },
        inventory: [
          { id: 'e1', name: 'axe', sprite: SPRITES.axe, pos: [1, 1], layer: 'floor', dmg: 2 },
        ],
        kind: 'player',
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
        stats: { hp: { cur: 2, max: 2 }, xp: 1, hpInc: 0 },
        activation: 3,
        kind: 'monster',
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

  it('holds no functions, so behavior must be named by a `kind`', () => {
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
