import { describe, expect, it } from 'vitest'
import { canPassTile } from '../grid.ts'
import { keyOf, posKeys } from '../pos.ts'
import { makeDiggerMap } from './map.ts'

const SIZE = 32

describe('makeDiggerMap', () => {
  const map = makeDiggerMap(42, SIZE, SIZE)

  it('gives the same geometry for the same seed', () => {
    expect(makeDiggerMap(42, SIZE, SIZE)).toEqual(map)
  })

  it('gives different geometry for a different seed', () => {
    expect(makeDiggerMap(43, SIZE, SIZE).floorTiles).not.toEqual(map.floorTiles)
  })

  it('digs rooms, and every room tile is walkable', () => {
    expect(map.rooms.length).toBeGreaterThan(1)
    for (const key of posKeys(map.roomTiles)) {
      expect(map.floorTiles[key]).toBe('room')
    }
  })

  it('keeps rooms and corridors disjoint', () => {
    for (const key of posKeys(map.corridorTiles)) {
      expect(map.roomTiles[key]).toBeUndefined()
    }
  })

  it('walls the floor in, so no walkable tile sits on the map edge', () => {
    for (const key of posKeys(map.floorTiles)) {
      const [x, y] = key.split(',').map(Number) as [number, number]
      if (!canPassTile(map.floorTiles, [x, y])) continue
      expect(x).toBeGreaterThan(0)
      expect(y).toBeGreaterThan(0)
      expect(x).toBeLessThan(SIZE - 1)
      expect(y).toBeLessThan(SIZE - 1)
    }
  })

  it('surrounds every walkable tile with map data rather than holes', () => {
    // A gap in the wall shell would let the renderer draw the void and let
    // path-finding wander off the map, so check the eight neighbours exist.
    for (const key of posKeys(map.floorTiles)) {
      const [x, y] = key.split(',').map(Number) as [number, number]
      if (!canPassTile(map.floorTiles, [x, y])) continue
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          expect(map.floorTiles[keyOf([x + ox, y + oy])]).toBeDefined()
        }
      }
    }
  })

  it('marks doors as doors, on top of the corridor beneath them', () => {
    const doors = map.rooms.flatMap((room) => room.doors)
    expect(doors.length).toBeGreaterThan(0)
    for (const door of doors) {
      expect(map.floorTiles[keyOf(door)]).toBe('door')
    }
  })

  it('reports its size', () => {
    expect(map.size).toEqual([SIZE, SIZE])
  })
})
