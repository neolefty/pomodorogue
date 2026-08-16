/**
 * Dungeon geometry. Ports `make-digger-map` from
 * original/src/rogule/generator.cljs.
 *
 * The output is deliberately more than one tile map: `floorTiles` is what play
 * reads, but generation needs `roomTiles` and `corridorTiles` separately to pick
 * spawn positions, and item placement needs to know which room a tile is in.
 * Those two ride alongside the `GameMap` rather than on it, because play never
 * reads them and phase 7 would otherwise persist a copy of each every cycle.
 */
import { Map as RotMap } from 'rot-js'
import { isAdjacentTile, roomTileIndices, tileIndex } from '../grid.ts'
import type { Pos } from '../pos.ts'
import { seedGlobalRotRng } from '../rng.ts'
import type { GameMap, Room, Tile } from '../types.ts'
import { TILE } from '../types.ts'

/** Matches the original's `{:corridorLength [1 5]}`; every other option is rot-js's default. */
const DIGGER_OPTIONS = { corridorLength: [1, 5] as [number, number] }

/**
 * The digger settings a caller may vary. Everything absent stays as
 * {@link DIGGER_OPTIONS} and rot-js's defaults leave it.
 *
 * Only `dugPercentage` so far, which phase 8 ramps with depth. Kept as a struct
 * rather than a bare number so the next knob is a field rather than a fourth
 * positional argument.
 */
export interface DiggerTuning {
  /** Fraction of the map to dig out. rot-js's own default is 0.2. */
  dugPercentage?: number
}

/** The map, plus the tile sets only generation needs. */
export interface DiggerMap {
  map: GameMap
  /** Spawn candidates, as tile indices: entities stand on room and corridor floor. */
  roomTiles: Set<number>
  /**
   * Everything dug that is not inside a room — which *includes the doorways*,
   * since a door is dug and sits outside the room rect. Callers picking spawn
   * tiles have to subtract {@link DiggerMap.doorTiles}; see `makeBaseLevel`.
   */
  corridorTiles: Set<number>
  /** The room doorways, so callers can keep chokepoints clear. */
  doorTiles: Set<number>
}

/**
 * Builds a dungeon from a seed. Same seed and size always give the same map.
 *
 * **The one sanctioned break in the explicit-RNG rule.** `ROT.Map.Digger` reads
 * from the global `ROT.RNG` and offers no way to inject a generator, so the
 * global is seeded here, immediately before the digger runs. It is confined to
 * this function on purpose — everything downstream of the digger (entity
 * placement, item rolls, monster selection) takes an explicit `Rng`. Do not let
 * this pattern spread. See docs/port/04-generator.md.
 *
 * The original derived the map seed from the globally-patched `Math.random`,
 * which is why its levels were not actually reproducible; here it comes from the
 * level seed.
 */
export function makeDiggerMap(
  seed: number,
  w: number,
  h: number,
  tuning: DiggerTuning = {},
): DiggerMap {
  seedGlobalRotRng('map', seed, w, h)
  const digger = new RotMap.Digger(w, h, { ...DIGGER_OPTIONS, ...tuning })
  const size: Pos = [w, h]

  // Every dug tile, room and corridor alike — the digger's own view of the map.
  const dug = new Set<number>()
  digger.create((x, y, value) => {
    if (value === 0) dug.add(tileIndex(size, x, y))
  })

  // The original reached into rot-js's private `_rooms`/`_x1`/`_doors` fields and
  // round-tripped them through JSON to get plain data. rot-js exposes public
  // accessors for all of it, so read those instead: same result, and a rot-js
  // upgrade can't silently change the shape underneath us.
  const rooms: Room[] = digger.getRooms().map((room) => {
    const doors: Pos[] = []
    room.getDoors((x, y) => doors.push([x, y]))
    return {
      x1: room.getLeft(),
      y1: room.getTop(),
      x2: room.getRight(),
      y2: room.getBottom(),
      doors,
    }
  })

  const roomTiles = new Set<number>()
  for (const room of rooms) {
    for (const index of roomTileIndices(room, size)) roomTiles.add(index)
  }

  const doorTiles = new Set<number>()
  for (const room of rooms) {
    for (const door of room.doors) doorTiles.add(tileIndex(size, door[0], door[1]))
  }

  // Anything dug that isn't inside a room is corridor.
  const corridorTiles = new Set<number>()
  for (const index of dug) {
    if (!roomTiles.has(index)) corridorTiles.add(index)
  }

  // Walls are the undug shell around rooms and corridors: adjacent to floor
  // (diagonals included), not themselves dug or floor.
  // (The original also excluded corridor tiles when walling corridors; they are
  // all dug by definition, so the `dug` check already covers it.)
  const wallsAround = (tiles: ReadonlySet<number>): Set<number> => {
    const walls = new Set<number>()
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        const index = tileIndex(size, x, y)
        if (dug.has(index) || roomTiles.has(index)) continue
        if (isAdjacentTile(size, x, y, tiles)) walls.add(index)
      }
    }
    return walls
  }
  const roomWallTiles = wallsAround(roomTiles)
  const corridorWallTiles = wallsAround(corridorTiles)

  // Paint order is the original's merge order, and it matters: doors are laid
  // over corridors, and floor over the walls that surround it. Everything not
  // painted stays rock, which is what the original expressed as an absent key.
  const floorTiles = new Array<Tile>(w * h).fill(TILE.rock)
  const paint = (tiles: ReadonlySet<number>, tile: Tile): void => {
    for (const index of tiles) floorTiles[index] = tile
  }
  paint(roomTiles, TILE.room)
  paint(roomWallTiles, TILE.wall)
  paint(corridorWallTiles, TILE.wall)
  paint(corridorTiles, TILE.corridor)
  paint(doorTiles, TILE.door)

  return { map: { floorTiles, rooms, size }, roomTiles, corridorTiles, doorTiles }
}
