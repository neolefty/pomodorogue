/**
 * Tile and path helpers. Ports the map functions from
 * original/src/rogule/map.cljs. Pure — no state, no randomness.
 */
import { Path } from 'rot-js'
import type { Pos, PosKey, PosMap } from './pos.ts'
import { posKey } from './pos.ts'
import type { Room, TileType } from './types.ts'
import { PASSABLE_TILES } from './types.ts'

/** Whether `pos` may be walked on, given the set of tile types that allow it. */
export const canPassTile = (
  floorTiles: PosMap<TileType>,
  pos: Pos,
  allowed: readonly TileType[] = PASSABLE_TILES,
): boolean => {
  const tile = floorTiles[posKey(pos[0], pos[1])]
  return tile !== undefined && allowed.includes(tile)
}

/** Whether any of the nine cells centred on `pos` appears in `tiles`. */
export const isAdjacentTile = <T>(pos: Pos, tiles: PosMap<T>): boolean => {
  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      if (tiles[posKey(pos[0] + ox, pos[1] + oy)] !== undefined) return true
    }
  }
  return false
}

/** Every tile inside a room, walls excluded. */
export const tilesForRoom = (room: Room): PosMap<TileType> => {
  const tiles: PosMap<TileType> = {}
  for (let x = room.x1; x <= room.x2; x++) {
    for (let y = room.y1; y <= room.y2; y++) {
      tiles[posKey(x, y)] = 'room'
    }
  }
  return tiles
}

export const roomCenter = (room: Room): Pos => [
  Math.floor((room.x1 + room.x2) / 2),
  Math.floor((room.y1 + room.y2) / 2),
]

export type PassableFn = (x: number, y: number) => boolean

/**
 * Shortest walkable path from `from` to `to`, inclusive of both ends. Empty if
 * unreachable, so `path[1]` is the next step and `undefined` when there is none.
 *
 * rot-js takes the destination in the constructor and the origin in `compute`,
 * walking backwards, so the result is reversed — same as the original did.
 */
export function findPath(from: Pos, to: Pos, passable: PassableFn): Pos[] {
  const astar = new Path.AStar(from[0], from[1], passable, { topology: 4 })
  const path: Pos[] = []
  astar.compute(to[0], to[1], (x, y) => path.push([x, y]))
  return path.reverse()
}

/** A room paired with its centre and the player's path to it. */
export interface RoomPath {
  room: Room
  centerPos: Pos
  path: Pos[]
}

/**
 * How far into the level `pos` is, as 0..1.
 *
 * This is *walking distance from the player's start*, normalized against the
 * furthest room — not straight-line distance. So a room close by as the crow
 * flies but reachable only the long way round counts as difficult.
 *
 * `roomPaths` must be sorted by path length ascending; the last entry is the
 * furthest room and sets the scale.
 */
export function posToDifficulty(
  playerPos: Pos,
  pos: Pos,
  roomPaths: readonly RoomPath[],
  passable: PassableFn,
): number {
  const furthest = roomPaths[roomPaths.length - 1]
  const scale = furthest ? furthest.path.length : 0
  if (scale === 0) return 0
  return findPath(playerPos, pos, passable).length / scale
}

/** Removes a key, returning a new map. Mirrors the original's `dissoc` on free tiles. */
export const withoutPos = <T>(m: PosMap<T>, key: PosKey): PosMap<T> => {
  const { [key]: _removed, ...rest } = m
  return rest as PosMap<T>
}
