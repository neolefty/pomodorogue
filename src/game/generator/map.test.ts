import { describe, expect, it } from 'vitest'
import { canPassTile, posOfIndex, tileAt, tileIndex } from '../grid.ts'
import type { Pos } from '../pos.ts'
import { TILE } from '../types.ts'
import { makeDiggerMap } from './map.ts'

const SIZE = 32

describe('makeDiggerMap', () => {
  const { map, roomTiles, corridorTiles, doorTiles } = makeDiggerMap(42, SIZE, SIZE)

  /** Every position on the map, in index order. */
  const everyTile = (): Pos[] => map.floorTiles.map((_tile, index) => posOfIndex(map.size, index))

  it('gives the same geometry for the same seed', () => {
    expect(makeDiggerMap(42, SIZE, SIZE)).toEqual({ map, roomTiles, corridorTiles, doorTiles })
  })

  // The set names are misleading otherwise: a door is dug, and sits outside the
  // room rect, so it lands in `corridorTiles`. `makeBaseLevel` subtracts it.
  it('counts doorways as corridor, and reports them separately', () => {
    expect(doorTiles.size).toBeGreaterThan(0)
    for (const index of doorTiles) {
      expect(tileAt(map, ...posOfIndex(map.size, index))).toBe(TILE.door)
      expect(corridorTiles.has(index)).toBe(true)
      expect(roomTiles.has(index)).toBe(false)
    }
  })

  it('gives different geometry for a different seed', () => {
    expect(makeDiggerMap(43, SIZE, SIZE).map.floorTiles).not.toEqual(map.floorTiles)
  })

  it('covers the whole grid, so there are no holes to index into', () => {
    expect(map.floorTiles).toHaveLength(SIZE * SIZE)
    expect(map.floorTiles.every((tile) => tile !== undefined)).toBe(true)
  })

  it('digs rooms, and every room tile is walkable', () => {
    expect(map.rooms.length).toBeGreaterThan(1)
    for (const index of roomTiles) {
      expect(map.floorTiles[index]).toBe(TILE.room)
    }
  })

  it('keeps rooms and corridors disjoint', () => {
    for (const index of corridorTiles) {
      expect(roomTiles.has(index)).toBe(false)
    }
  })

  it('walls the floor in, so no walkable tile sits on the map edge', () => {
    for (const [x, y] of everyTile()) {
      if (!canPassTile(map, [x, y])) continue
      expect(x).toBeGreaterThan(0)
      expect(y).toBeGreaterThan(0)
      expect(x).toBeLessThan(SIZE - 1)
      expect(y).toBeLessThan(SIZE - 1)
    }
  })

  it('surrounds every walkable tile with solid map rather than rock', () => {
    // A gap in the wall shell would let the renderer draw the void and let
    // path-finding wander off the map, so check the eight neighbours are real.
    for (const [x, y] of everyTile()) {
      if (!canPassTile(map, [x, y])) continue
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          expect(tileAt(map, x + ox, y + oy)).not.toBe(TILE.rock)
        }
      }
    }
  })

  it('marks doors as doors, on top of the corridor beneath them', () => {
    const doors = map.rooms.flatMap((room) => room.doors)
    expect(doors.length).toBeGreaterThan(0)
    for (const door of doors) {
      expect(map.floorTiles[tileIndex(map.size, door[0], door[1])]).toBe(TILE.door)
    }
  })

  it('reports its size', () => {
    expect(map.size).toEqual([SIZE, SIZE])
  })
})
