import { describe, expect, it } from 'vitest'
import { canPassTile, findPath, isAdjacentTile, roomCenter, tilesForRoom, withoutPos } from './grid.ts'
import { posKey } from './pos.ts'
import type { PosMap } from './pos.ts'
import type { Room, TileType } from './types.ts'

/**
 * A 5x3 corridor of room tiles with a wall in the middle column except at y=0,
 * so paths must route around it:
 *
 *   . . . . .      y=0
 *   . . # . .      y=1
 *   . . # . .      y=2
 */
function testTiles(): PosMap<TileType> {
  const tiles: PosMap<TileType> = {}
  for (let x = 0; x < 5; x++) {
    for (let y = 0; y < 3; y++) {
      tiles[posKey(x, y)] = x === 2 && y > 0 ? 'wall' : 'room'
    }
  }
  return tiles
}

describe('canPassTile', () => {
  const tiles = testTiles()

  it('allows room tiles and rejects walls', () => {
    expect(canPassTile(tiles, [0, 0])).toBe(true)
    expect(canPassTile(tiles, [2, 1])).toBe(false)
  })

  it('rejects positions off the map rather than throwing', () => {
    expect(canPassTile(tiles, [99, 99])).toBe(false)
    expect(canPassTile(tiles, [-1, 0])).toBe(false)
  })

  it('honours a restricted allowed set', () => {
    expect(canPassTile(tiles, [0, 0], ['door'])).toBe(false)
    expect(canPassTile(tiles, [0, 0], ['room'])).toBe(true)
  })
})

describe('isAdjacentTile', () => {
  const tiles: PosMap<TileType> = { [posKey(5, 5)]: 'room' }

  it('counts diagonals and the cell itself', () => {
    expect(isAdjacentTile([4, 4], tiles)).toBe(true)
    expect(isAdjacentTile([5, 5], tiles)).toBe(true)
    expect(isAdjacentTile([6, 6], tiles)).toBe(true)
  })

  it('is false two cells away', () => {
    expect(isAdjacentTile([7, 5], tiles)).toBe(false)
  })
})

describe('tilesForRoom / roomCenter', () => {
  const room: Room = { x1: 2, y1: 3, x2: 5, y2: 6, doors: [] }

  it('covers the room inclusively', () => {
    const tiles = tilesForRoom(room)
    expect(Object.keys(tiles)).toHaveLength(4 * 4)
    expect(tiles[posKey(2, 3)]).toBe('room')
    expect(tiles[posKey(5, 6)]).toBe('room')
    expect(tiles[posKey(6, 6)]).toBeUndefined()
  })

  it('centres the room', () => {
    expect(roomCenter(room)).toEqual([3, 4])
  })
})

describe('findPath', () => {
  const tiles = testTiles()
  const passable = (x: number, y: number) => canPassTile(tiles, [x, y])

  it('includes both endpoints, in order from start to finish', () => {
    const path = findPath([0, 0], [4, 0], passable)
    expect(path[0]).toEqual([0, 0])
    expect(path[path.length - 1]).toEqual([4, 0])
  })

  it('routes around walls rather than through them', () => {
    const path = findPath([0, 2], [4, 2], passable)
    expect(path.length).toBeGreaterThan(0)
    expect(path).not.toContainEqual([2, 1])
    expect(path).not.toContainEqual([2, 2])
    // Must detour via the open row at y=0.
    expect(path).toContainEqual([2, 0])
  })

  it('moves orthogonally only, since the game uses 4-way topology', () => {
    const path = findPath([0, 2], [4, 2], passable)
    for (let i = 1; i < path.length; i++) {
      const [px, py] = path[i - 1]!
      const [x, y] = path[i]!
      expect(Math.abs(x - px) + Math.abs(y - py)).toBe(1)
    }
  })

  it('returns empty when unreachable, so `path[1]` is undefined', () => {
    const isolated: PosMap<TileType> = { [posKey(0, 0)]: 'room', [posKey(9, 9)]: 'room' }
    const path = findPath([0, 0], [9, 9], (x, y) => canPassTile(isolated, [x, y]))
    expect(path).toEqual([])
    expect(path[1]).toBeUndefined()
  })
})

describe('withoutPos', () => {
  it('returns a new map without mutating the original', () => {
    const tiles = testTiles()
    const before = Object.keys(tiles).length
    const next = withoutPos(tiles, posKey(0, 0))
    expect(Object.keys(next)).toHaveLength(before - 1)
    expect(Object.keys(tiles)).toHaveLength(before)
    expect(next[posKey(0, 0)]).toBeUndefined()
  })
})
