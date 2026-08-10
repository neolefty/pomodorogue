/**
 * Tile and path helpers. Ports the map functions from
 * original/src/rogule/map.cljs. Pure — no state, no randomness.
 *
 * Tiles live in a flat, row-major array (`GameMap.floorTiles`) addressed
 * `y * w + x`. Everything that converts between an index and a `Pos` is here, so
 * the arithmetic appears once. See §3 of docs/port/05a-simplify.md.
 */
import { Path } from 'rot-js'
import type { Pos } from './pos.ts'
import type { GameMap, Room, Tile } from './types.ts'
import { PASSABLE_TILES, TILE } from './types.ts'

/** Array index of `(x, y)`. No bounds check — callers that need one use `tileAt`. */
export const tileIndex = (size: Pos, x: number, y: number): number => y * size[0] + x

export const posOfIndex = (size: Pos, index: number): Pos => [
  index % size[0],
  Math.floor(index / size[0]),
]

/** Whether `(x, y)` is on the map at all. */
export const inBounds = (size: Pos, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < size[0] && y < size[1]

/**
 * The tile at `(x, y)`, or `TILE.rock` for anything off the map.
 *
 * **The bounds check is load-bearing, not defensive.** `y * w + x` maps
 * `(-1, y)` onto the last tile of row `y - 1`, so an unchecked read would let
 * the player step off the left edge and reappear on the right. The `"x,y"`-keyed
 * object this replaced returned undefined for such a key and could not wrap.
 */
export function tileAt(map: GameMap, x: number, y: number): Tile {
  if (!inBounds(map.size, x, y)) return TILE.rock
  return map.floorTiles[tileIndex(map.size, x, y)] ?? TILE.rock
}

/** Whether `pos` may be walked on, given the set of tiles that allow it. */
export const canPassTile = (
  map: GameMap,
  pos: Pos,
  allowed: readonly Tile[] = PASSABLE_TILES,
): boolean => allowed.includes(tileAt(map, pos[0], pos[1]))

/**
 * Whether any of the nine cells centred on `(x, y)` appears in `tiles`.
 *
 * Neighbours off the map are skipped rather than wrapped — the same hazard
 * `tileAt` guards, in the one other place raw index arithmetic happens.
 */
export function isAdjacentTile(
  size: Pos,
  x: number,
  y: number,
  tiles: ReadonlySet<number>,
): boolean {
  for (let ox = -1; ox <= 1; ox++) {
    for (let oy = -1; oy <= 1; oy++) {
      const nx = x + ox
      const ny = y + oy
      if (!inBounds(size, nx, ny)) continue
      if (tiles.has(tileIndex(size, nx, ny))) return true
    }
  }
  return false
}

/**
 * Every tile index inside a room, walls excluded.
 *
 * Column-major (`x` outer, `y` inner) because the original was, and a weighted
 * pick over the result has to see the same order to stay reproducible.
 */
export function roomTileIndices(room: Room, size: Pos): number[] {
  const tiles: number[] = []
  for (let x = room.x1; x <= room.x2; x++) {
    for (let y = room.y1; y <= room.y2; y++) {
      tiles.push(tileIndex(size, x, y))
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
