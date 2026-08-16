/**
 * Placing the player, the shrine, the covered items and the monsters. Ports
 * `make-player`, `make-shrine`, `make-covered-item`, `make-monster` and
 * `make-entities` from original/src/rogule/generator.cljs.
 *
 * Everything here is part of the **base pass**: it may read `LevelRequest` and
 * nothing else about the run. Randomness comes from the passed-in `Rng`;
 * monsters, items and covers come from the passed-in `ContentProvider`.
 *
 * The original threaded `[entities free-tiles]` pairs through each step. Here a
 * small mutable `Builder` carries the same two values plus the entity-id
 * counter, so each placement reads as one statement instead of a destructuring
 * dance. It never escapes this module — `makeEntities` returns plain data.
 */
import type { ContentProvider, ItemTemplate } from '../content/types.ts'
import { allocId } from '../entities.ts'
import type { PassableFn, RoomPath } from '../grid.ts'
import {
  canPassTile,
  findPath,
  posOfIndex,
  posToDifficulty,
  roomCenter,
  roomTileIndices,
  tileIndex,
} from '../grid.ts'
import type { Pos } from '../pos.ts'
import type { Rng } from '../rng.ts'
import { SPRITES } from '../sprites.ts'
import type { Entity, EntityId, GameMap, LevelRequest, Room } from '../types.ts'
import { PLAYER_ID } from '../types.ts'
import { difficultyAtDepth } from './ramp.ts'

/** The player's starting XP, which doubles as their maximum damage. */
export const PLAYER_XP = 3

/** Difficulty multipliers from the original — see docs/port/04-generator.md. */
const ITEM_DIFFICULTY_SCALE = 0.9
const MONSTER_DIFFICULTY_SCALE = 0.75
/** A monster carries loot on half of all rolls, regardless of difficulty. */
const MONSTER_DROP_CHANCE = 0.5

interface Builder {
  entities: Record<EntityId, Entity>
  /** Tile indices still free to stand on. See {@link takeFreeTile}. */
  freeTiles: Set<number>
  nextEntityId: number
  /** The map's dimensions, for converting an index back to a `Pos`. */
  size: Pos
}

/** Everything a placement function reads but never changes. */
interface Placement {
  request: LevelRequest
  content: ContentProvider
  rng: Rng
  passable: PassableFn
  /** Sorted nearest-first; the last entry is the furthest room and sets the difficulty scale. */
  roomPaths: RoomPath[]
  playerPos: Pos
}

/**
 * The puff of smoke revealed when a cover is removed.
 *
 * Generated up front and stored on the cover, as in the original, so the engine
 * only has to reveal it. Exported because phase 5 spawns the same effect.
 */
export function makeSmokeJuice(id: EntityId, pos: Pos): Entity {
  return {
    id,
    name: 'smoke',
    sprite: SPRITES.cloud,
    pos,
    layer: 'between',
    animation: { name: 'grow-and-fade', disposal: 'destroy' },
  }
}

/**
 * The starburst shown where a blow lands.
 *
 * Unlike the smoke puff this is spawned during play rather than at generation —
 * combat allocates its id from the live state — but it belongs here beside the
 * other sprite-carrying constructors rather than in the engine.
 */
export function makeCollisionMarker(id: EntityId, pos: Pos): Entity {
  return {
    id,
    name: 'collision',
    sprite: SPRITES.collision,
    pos,
    layer: 'above',
    animation: { name: 'grow-and-fade', disposal: 'destroy' },
  }
}

/**
 * Weighted pick over a template table, rarer items being less likely. Ports
 * `get-random-entity-by-value` from map.cljs, where the weight is `1 / value`.
 */
const pickByValue = (rng: Rng, items: readonly ItemTemplate[]): ItemTemplate =>
  rng.weighted(items, (item) => 1 / item.value)

function makeItemEntity(template: ItemTemplate, id: EntityId, pos: Pos): Entity {
  return {
    id,
    name: template.name,
    sprite: template.sprite,
    pos,
    layer: 'floor',
    kind: template.kind,
    value: template.value,
    ...(template.dmg !== undefined ? { dmg: template.dmg } : {}),
    ...(template.armour !== undefined ? { armour: template.armour } : {}),
  }
}

/**
 * Removes and returns one uniformly-chosen free tile index.
 *
 * A `Set` rather than an array: removing a *named* tile (the shrine's square,
 * each cover's) and the membership test in `freeTilesInRoom` are both O(1) on
 * it, where an array would need `indexOf`. Walking to a random offset ~22 times
 * per level is nothing against that. Set iteration follows insertion order and
 * deletes do not disturb it, so this stays reproducible.
 */
function takeFreeTile(b: Builder, rng: Rng): number {
  const n = rng.int(b.freeTiles.size)
  let i = 0
  for (const tile of b.freeTiles) {
    if (i++ === n) {
      b.freeTiles.delete(tile)
      return tile
    }
  }
  throw new Error('takeFreeTile: no free tiles left')
}

function placePlayer(b: Builder, rng: Rng): Entity {
  const pos = posOfIndex(b.size, takeFreeTile(b, rng))
  const player: Entity = {
    id: PLAYER_ID,
    name: 'you',
    sprite: SPRITES.elf,
    pos,
    layer: 'occupy',
    kind: 'player',
    stats: { hp: { cur: 10, max: 10 }, xp: PLAYER_XP, hpInc: 0 },
    inventory: [],
  }
  b.entities[PLAYER_ID] = player
  return player
}

/** The shrine sits in the furthest room, which is what makes it worth walking to. */
function placeShrine(b: Builder, g: Placement): void {
  const furthest = g.roomPaths[g.roomPaths.length - 1]
  if (!furthest) throw new Error('makeEntities: the map has no rooms to put the shrine in')
  const pos = furthest.centerPos
  b.entities['shrine'] = {
    id: 'shrine',
    name: 'shrine',
    sprite: SPRITES['shinto-shrine'],
    pos,
    layer: 'occupy',
    kind: 'shrine',
  }
  b.freeTiles.delete(tileIndex(b.size, pos[0], pos[1]))
}

const freeTilesInRoom = (room: Room, b: Builder): number[] =>
  roomTileIndices(room, b.size).filter((index) => b.freeTiles.has(index))

/**
 * An item hidden under a rock, plant or block of wood, somewhere in a room.
 *
 * The further from the player's start, the *less* likely the cover hides
 * anything: the roll is `rng.next() > difficulty`, so distant covers are often
 * empty. That is the original's behavior, and it is deliberate — the reward for
 * walking to the far end of the level is the shrine, not loot.
 */
function placeCoveredItem(b: Builder, g: Placement): void {
  // The original picked any room and would crash if the room happened to be
  // full. Only rooms with a free tile are considered here; the alternative is a
  // seed that can never produce a playable level.
  const candidates = g.roomPaths.filter((rp) => freeTilesInRoom(rp.room, b).length > 0)
  if (candidates.length === 0) return

  const { room } = g.rng.pick(candidates)
  const tile = g.rng.pick(freeTilesInRoom(room, b))
  const pos = posOfIndex(b.size, tile)
  // Deliberately unclamped, as the original had it: a difficulty above 1 means
  // this cover hides nothing at all. `difficultyAtDepth` is applied to the raw
  // value and cannot introduce a clamp, so depth 1 is untouched.
  const difficulty =
    difficultyAtDepth(
      posToDifficulty(g.playerPos, pos, g.roomPaths, g.passable),
      g.request.depth,
    ) * ITEM_DIFFICULTY_SCALE

  // The template is drawn whether or not the cover turns out to hide anything,
  // as in the original — keeping the stream position independent of the roll.
  const template = pickByValue(g.rng, g.content.forageItems(g.request))
  const item = g.rng.next() > difficulty ? makeItemEntity(template, allocId(b), pos) : null

  const cover = g.rng.pick(g.content.itemCovers(g.request))
  const juice = makeSmokeJuice(allocId(b), pos)
  const id = allocId(b)
  b.entities[id] = {
    id,
    name: cover.name,
    sprite: cover.sprite,
    pos,
    layer: 'floor',
    kind: 'cover',
    drop: item,
    juice,
  }
  b.freeTiles.delete(tile)
}

/**
 * Which monster to spawn at a given difficulty: the table entry that difficulty
 * points at, blurred by ±2 positions with weights 1/2/6/2/1.
 *
 * **Divergence from the original, deliberately.** The original built this
 * distribution as a map literal keyed by table index, and at the ends of the
 * table the clamped neighbours collide with the centre — ClojureScript resolves
 * duplicate keys last-wins, so at difficulty 0 the centre weight of 6 was
 * overwritten by a clamped 1, making the rat *rarer* than the bat right next to
 * the player's start. Offsets are accumulated here instead, so a clamped
 * neighbour reinforces the edge rather than replacing it. Total weight stays 12
 * at every difficulty.
 */
function pickMonsterIndex(rng: Rng, difficulty: number, tableSize: number): number {
  const maxIndex = tableSize - 1
  const center = Math.floor(difficulty * maxIndex)
  const weights = new Array<number>(tableSize).fill(0)
  for (const [offset, weight] of [
    [0, 6],
    [1, 2],
    [-1, 2],
    [2, 1],
    [-2, 1],
  ] as const) {
    const index = Math.min(Math.max(center + offset, 0), maxIndex)
    weights[index] = weights[index]! + weight
  }
  // Zero-weight indexes are fine to leave in: rng.weighted never picks them.
  const candidates = weights.map((_weight, index) => index)
  return rng.weighted(candidates, (index) => weights[index]!)
}

function placeMonster(b: Builder, g: Placement): void {
  // The original threw on a full map; skipping is divergence 2 in the port doc.
  if (b.freeTiles.size === 0) return
  const pos = posOfIndex(b.size, takeFreeTile(b, g.rng))
  // The clamp is `placeMonster`'s own and stays exactly where it was, *after*
  // the scale — `placeCoveredItem` has no equivalent, and moving either would
  // change depth-1 placement. Depth raises the floor under the raw value only.
  const difficulty = Math.min(
    difficultyAtDepth(
      posToDifficulty(g.playerPos, pos, g.roomPaths, g.passable),
      g.request.depth,
    ) * MONSTER_DIFFICULTY_SCALE,
    1,
  )

  const table = g.content.monsters(g.request)
  const template = table[pickMonsterIndex(g.rng, difficulty, table.length)]!

  const itemTemplate = pickByValue(g.rng, g.content.forageItems(g.request))
  const drop =
    g.rng.next() > MONSTER_DROP_CHANCE ? makeItemEntity(itemTemplate, allocId(b), pos) : null

  const id = allocId(b)
  b.entities[id] = {
    id,
    name: template.name,
    sprite: template.sprite,
    pos,
    layer: 'occupy',
    kind: 'monster',
    activation: template.activation,
    // A fresh Hp per monster; sharing the template's object would give every rat
    // on the level the same health.
    stats: {
      hp: { cur: template.stats.hp.cur, max: template.stats.hp.max },
      xp: template.stats.xp,
      hpInc: 0,
    },
    drop,
  }
}

/**
 * Orders rooms by how far the player must walk to reach them.
 *
 * Ties break on the path's coordinates so the order is total and therefore
 * reproducible — the original relied on ClojureScript's vector `compare` for the
 * same effect. Unreachable rooms have an empty path and sort first, which is
 * also what the original did.
 */
function comparePaths(a: Pos[], b: Pos[]): number {
  if (a.length !== b.length) return a.length - b.length
  for (let i = 0; i < a.length; i++) {
    const [ax, ay] = a[i]!
    const [bx, by] = b[i]!
    if (ax !== bx) return ax - bx
    if (ay !== by) return ay - by
  }
  return 0
}

export interface GeneratedEntities {
  entities: Record<EntityId, Entity>
  /** Where the id counter got to, so the engine keeps allocating from there. */
  nextEntityId: number
}

/**
 * Populates a map: player first (everything else is positioned relative to
 * them), then the shrine, the covered items, and finally the monsters.
 *
 * `spawnTiles` is where entities may stand — room and corridor floor, from
 * `makeDiggerMap`. It is a parameter rather than a field on `GameMap` because
 * play never reads it and phase 7 would otherwise persist it; see §2 of
 * docs/port/05a-simplify.md.
 */
export function makeEntities(
  map: GameMap,
  spawnTiles: ReadonlySet<number>,
  request: LevelRequest,
  content: ContentProvider,
  rng: Rng,
  entityCount: number,
  monsterCount: number,
): GeneratedEntities {
  const b: Builder = {
    entities: {},
    freeTiles: new Set(spawnTiles),
    nextEntityId: 0,
    size: map.size,
  }
  if (b.freeTiles.size === 0) {
    throw new Error('makeEntities: the map has no floor to stand on')
  }

  const player = placePlayer(b, rng)
  const passable: PassableFn = (x, y) => canPassTile(map, [x, y])
  const roomPaths: RoomPath[] = map.rooms
    .map((room) => {
      const centerPos = roomCenter(room)
      return { room, centerPos, path: findPath(player.pos, centerPos, passable) }
    })
    .sort((a, b2) => comparePaths(a.path, b2.path))

  const g: Placement = { request, content, rng, passable, roomPaths, playerPos: player.pos }

  placeShrine(b, g)
  for (let i = 0; i < entityCount; i++) placeCoveredItem(b, g)
  for (let i = 0; i < monsterCount; i++) placeMonster(b, g)

  return { entities: b.entities, nextEntityId: b.nextEntityId }
}
