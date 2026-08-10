/**
 * Dungeon geometry. Ports `make-digger-map` from
 * original/src/rogule/generator.cljs.
 *
 * The output is deliberately more than one tile map: `floorTiles` is what play
 * reads, but generation needs `roomTiles` and `corridorTiles` separately to pick
 * spawn positions, and item placement needs to know which room a tile is in.
 */
import { Map as RotMap } from 'rot-js'
import { isAdjacentTile, tilesForRoom } from '../grid.ts'
import type { Pos, PosMap } from '../pos.ts'
import { emptyPosMap, posKey, posKeys } from '../pos.ts'
import { seedGlobalRotRng } from '../rng.ts'
import type { GameMap, Room, TileType } from '../types.ts'

/** Matches the original's `{:corridorLength [1 5]}`; every other option is rot-js's default. */
const DIGGER_OPTIONS = { corridorLength: [1, 5] as [number, number] }

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
export function makeDiggerMap(seed: number, w: number, h: number): GameMap {
  seedGlobalRotRng('map', seed, w, h)
  const digger = new RotMap.Digger(w, h, DIGGER_OPTIONS)

  // Every dug tile, room and corridor alike — the digger's own view of the map.
  const dug = emptyPosMap<true>()
  digger.create((x, y, value) => {
    if (value === 0) dug[posKey(x, y)] = true
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

  const roomTiles = emptyPosMap<TileType>()
  for (const room of rooms) Object.assign(roomTiles, tilesForRoom(room))

  const doorTiles = emptyPosMap<TileType>()
  for (const room of rooms) {
    for (const door of room.doors) doorTiles[posKey(door[0], door[1])] = 'door'
  }

  // Anything dug that isn't inside a room is corridor.
  const corridorTiles = emptyPosMap<TileType>()
  for (const key of posKeys(dug)) {
    if (roomTiles[key] === undefined) corridorTiles[key] = 'corridor'
  }

  // Walls are the undug shell around rooms and corridors: adjacent to floor
  // (diagonals included), not themselves dug or floor. They live in `floorTiles`
  // and are rejected by the passable check — the naming is inherited from the
  // original and is on the post-port rename list.
  // (The original also excluded corridor tiles when walling corridors; they are
  // all dug by definition, so the `dug` check already covers it.)
  const wallsAround = (tiles: PosMap<TileType>) => {
    const walls = emptyPosMap<TileType>()
    for (let x = 0; x < w; x++) {
      for (let y = 0; y < h; y++) {
        const key = posKey(x, y)
        if (dug[key] !== undefined || roomTiles[key] !== undefined) continue
        if (isAdjacentTile([x, y], tiles)) walls[key] = 'wall'
      }
    }
    return walls
  }
  const roomWallTiles = wallsAround(roomTiles)
  const corridorWallTiles = wallsAround(corridorTiles)

  return {
    // Merge order is the original's, and it matters: doors are laid over
    // corridors, and floor over the walls that surround it.
    floorTiles: {
      ...roomTiles,
      ...roomWallTiles,
      ...corridorWallTiles,
      ...corridorTiles,
      ...doorTiles,
    },
    roomTiles,
    corridorTiles,
    rooms,
    size: [w, h],
  }
}
