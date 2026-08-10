import { describe, expect, it } from 'vitest'
import {
  canPassTile,
  findPath,
  inBounds,
  isAdjacentTile,
  posOfIndex,
  roomCenter,
  roomTileIndices,
  tileAt,
  tileIndex,
} from './grid.ts'
import type { Pos } from './pos.ts'
import type { GameMap, Room, Tile } from './types.ts'
import { TILE } from './types.ts'

/**
 * A 5x3 corridor of room tiles with a wall in the middle column except at y=0,
 * so paths must route around it:
 *
 *   . . . . .      y=0
 *   . . # . .      y=1
 *   . . # . .      y=2
 */
function testMap(): GameMap {
  const size: Pos = [5, 3]
  const floorTiles = new Array<Tile>(5 * 3).fill(TILE.rock)
  for (let x = 0; x < 5; x++) {
    for (let y = 0; y < 3; y++) {
      floorTiles[tileIndex(size, x, y)] = x === 2 && y > 0 ? TILE.wall : TILE.room
    }
  }
  return { floorTiles, rooms: [], size }
}

describe('tile addressing', () => {
  const size: Pos = [5, 3]

  it('round-trips an index through a position', () => {
    for (let i = 0; i < 15; i++) {
      const [x, y] = posOfIndex(size, i)
      expect(tileIndex(size, x, y)).toBe(i)
    }
  })

  it('lays tiles out row-major', () => {
    expect(tileIndex(size, 0, 0)).toBe(0)
    expect(tileIndex(size, 4, 0)).toBe(4)
    expect(tileIndex(size, 0, 1)).toBe(5)
  })

  it('rejects positions off the map', () => {
    expect(inBounds(size, 0, 0)).toBe(true)
    expect(inBounds(size, -1, 0)).toBe(false)
    expect(inBounds(size, 5, 0)).toBe(false)
    expect(inBounds(size, 0, 3)).toBe(false)
  })
})

describe('tileAt', () => {
  const map = testMap()

  it('reads the tile that was written', () => {
    expect(tileAt(map, 0, 0)).toBe(TILE.room)
    expect(tileAt(map, 2, 1)).toBe(TILE.wall)
  })

  it('reads off-map as rock rather than wrapping to the previous row', () => {
    // The flat layout is why this matters: `y * w + x` at x = -1 lands on the
    // last tile of the row above, which is a walkable room tile here. Without
    // the bounds check the player would walk off one edge onto the other.
    expect(tileAt(map, -1, 1)).toBe(TILE.rock)
    expect(tileAt(map, 5, 1)).toBe(TILE.rock)
    expect(tileAt(map, 0, -1)).toBe(TILE.rock)
    expect(tileAt(map, 0, 3)).toBe(TILE.rock)
  })
})

describe('canPassTile', () => {
  const map = testMap()

  it('allows room tiles and rejects walls', () => {
    expect(canPassTile(map, [0, 0])).toBe(true)
    expect(canPassTile(map, [2, 1])).toBe(false)
  })

  it('rejects positions off the map rather than throwing', () => {
    expect(canPassTile(map, [99, 99])).toBe(false)
    expect(canPassTile(map, [-1, 0])).toBe(false)
    // The wrap case again, through the predicate the engine actually calls.
    expect(canPassTile(map, [-1, 1])).toBe(false)
  })

  it('honours a restricted allowed set', () => {
    expect(canPassTile(map, [0, 0], [TILE.door])).toBe(false)
    expect(canPassTile(map, [0, 0], [TILE.room])).toBe(true)
  })
})

describe('isAdjacentTile', () => {
  const size: Pos = [9, 9]
  const tiles = new Set([tileIndex(size, 5, 5)])

  it('counts diagonals and the cell itself', () => {
    expect(isAdjacentTile(size, 4, 4, tiles)).toBe(true)
    expect(isAdjacentTile(size, 5, 5, tiles)).toBe(true)
    expect(isAdjacentTile(size, 6, 6, tiles)).toBe(true)
  })

  it('is false two cells away', () => {
    expect(isAdjacentTile(size, 7, 5, tiles)).toBe(false)
  })

  it('does not wrap across a row edge', () => {
    // Index 0 of row 1 neighbours index 8 of row 0 numerically, but not on the map.
    const edge = new Set([tileIndex(size, 8, 0)])
    expect(isAdjacentTile(size, 0, 1, edge)).toBe(false)
  })
})

describe('roomTileIndices / roomCenter', () => {
  const room: Room = { x1: 2, y1: 3, x2: 5, y2: 6, doors: [] }
  const size: Pos = [9, 9]

  it('covers the room inclusively', () => {
    const tiles = roomTileIndices(room, size)
    expect(tiles).toHaveLength(4 * 4)
    expect(tiles).toContain(tileIndex(size, 2, 3))
    expect(tiles).toContain(tileIndex(size, 5, 6))
    expect(tiles).not.toContain(tileIndex(size, 6, 6))
  })

  it('centres the room', () => {
    expect(roomCenter(room)).toEqual([3, 4])
  })
})

describe('findPath', () => {
  const map = testMap()
  const passable = (x: number, y: number) => canPassTile(map, [x, y])

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
    const size: Pos = [10, 10]
    const floorTiles = new Array<Tile>(100).fill(TILE.rock)
    floorTiles[tileIndex(size, 0, 0)] = TILE.room
    floorTiles[tileIndex(size, 9, 9)] = TILE.room
    const isolated: GameMap = { floorTiles, rooms: [], size }
    const path = findPath([0, 0], [9, 9], (x, y) => canPassTile(isolated, [x, y]))
    expect(path).toEqual([])
    expect(path[1]).toBeUndefined()
  })
})
