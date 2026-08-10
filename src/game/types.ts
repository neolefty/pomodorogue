/**
 * The shapes the whole game is written against. Read this file first.
 *
 * Hard constraint: **`GameState` must round-trip through JSON.** No `Map`,
 * `Set`, `Date`, or function values anywhere inside it. Behavior is referenced
 * by name and resolved through the registries in `engine/registry.ts` — the
 * same trick the original used (`lookup-fn`), for the same reason. Phase 7's
 * persistence depends on this; `types.test.ts` guards it.
 *
 * Corollary: never assign `undefined` to a field. Either omit the key or use
 * `null`, because `JSON.stringify` drops keys whose value is `undefined` and
 * the round-trip would then differ. `exactOptionalPropertyTypes` in
 * tsconfig.json enforces this at compile time.
 */
import type { Pos, PosMap } from './pos.ts'
import type { Sprite } from './sprites.ts'

// ***** entities ***** //

export type EntityId = string

/** The player's entity id is fixed, as in the original. */
export const PLAYER_ID = 'player'

/**
 * Render and collision layer. Within a cell these draw in this order, and only
 * `occupy` entities block movement.
 */
export type Layer = 'floor' | 'between' | 'occupy' | 'above'

/** `[current, max]`, kept as a pair because the health bar and share string both iterate it. */
export type Hp = [current: number, max: number]

export interface Stats {
  hp: Hp
  /** Doubles as a monster's maximum damage — it is the number shown above its head. */
  xp: number
  /** Regeneration counter; one HP is restored per `REJUVENATION_RATE` moves. */
  hpInc: number
}

/**
 * A dead entity reduced to what actually gets rendered for it: the tombstone
 * and share string read nothing but the sprite, and the log wants the name.
 *
 * The original stored whole `Entity` copies in `kills`/`killed-by`, which was
 * harmless there — one level, discarded daily. Here it is not: phase 7 persists
 * state as JSON and phase 8 carries the player across a whole run, so full
 * copies would drag every corpse's `drop`/`inventory` subtree along with them.
 */
export type EntitySummary = Pick<Entity, 'name' | 'sprite'>

export type AnimationDisposal = 'destroy'

export interface Animation {
  name: string
  /** `'destroy'` removes the entity when the CSS animation ends. */
  disposal?: AnimationDisposal
  /** Bumped to force a remount so a repeated animation replays. */
  frame?: number
}

/**
 * Names of behaviors, resolved through the registries in `engine/registry.ts`.
 * Declared here rather than in the engine so that `types.ts` stays dependency-
 * free; the registries assert exhaustiveness against these unions.
 */
export type EncounterFnName =
  | 'combat'
  | 'increaseHp'
  | 'addItemToInventory'
  | 'uncoverItem'
  | 'finishLevel'

export type UpdateFnName = 'chasePlayer'

export type PassableFnName = 'playerPassable' | 'monsterPassable'

export interface EntityFns {
  /** Runs when something moves onto this entity. */
  encounter?: EncounterFnName
  /** Runs once per turn, after the player moves. */
  update?: UpdateFnName
  /** Builds this entity's movement predicate. */
  passable?: PassableFnName
}

/**
 * One loose record covering the player, monsters, items and covers alike —
 * matching the original, which used a single untyped entity map for everything.
 * Most fields are optional because most entities use few of them.
 */
export interface Entity {
  id: EntityId
  name: string
  sprite: Sprite
  pos: Pos
  layer: Layer

  /** Present on the player and monsters; absent on items. */
  stats?: Stats
  /** Present on the player only. Weapons and armour in here apply automatically. */
  inventory?: Entity[]
  fns?: EntityFns

  /** Weapon damage, summed across inventory. */
  dmg?: number
  /** Armour absorption, summed across inventory. */
  armour?: number
  /** Rarity weight for generation; higher value means rarer. */
  value?: number
  /** How close the player must be, in path steps, before a monster gives chase. */
  activation?: number

  /** Revealed when this entity is removed — a monster's loot or a cover's item. */
  drop?: Entity | null
  /** A transient effect spawned alongside `drop`, e.g. the smoke puff. */
  juice?: Entity | null

  dead?: boolean
  /** Whether this entity's most recent move attempt consumed a turn. */
  moved?: boolean
  animation?: Animation | null
  /** Summaries, not entities — see {@link EntitySummary}. */
  killedBy?: EntitySummary | null
  kills?: EntitySummary[]
}

// ***** map ***** //

/**
 * What occupies a tile. `floorTiles` holds only these four; anything absent is
 * solid rock and impassable. Walls are the shell dug around rooms and corridors.
 */
export type TileType = 'room' | 'corridor' | 'door' | 'wall'

/** Passable tile types — the set the original spelled out at each call site. */
export const PASSABLE_TILES: readonly TileType[] = ['room', 'door', 'corridor']

/** A rectangular room, flattened out of rot-js's private digger fields. */
export interface Room {
  x1: number
  y1: number
  x2: number
  y2: number
  /** Door positions on this room's wall. */
  doors: Pos[]
}

export interface GameMap {
  /** The merged lookup used during play. */
  floorTiles: PosMap<TileType>
  /** Kept separately because generation picks spawn points from these two. */
  roomTiles: PosMap<TileType>
  corridorTiles: PosMap<TileType>
  rooms: Room[]
  size: Pos
}

// ***** level generation ***** //

/**
 * Everything the **base** level pass is allowed to depend on.
 *
 * Only fields on this type may influence base generation. That is the whole
 * rule, and it is what keeps "what does a seed control?" answerable at a glance:
 * the seed fixes the base level at every depth, for every player.
 *
 * **Do not add history fields here.** A boss that fled downstairs, loot the
 * player declined, bones from an earlier run — those belong to the overlay pass,
 * which runs on top of a finished base level with its own input struct and its
 * own RNG stream. Widening this type instead would make the base geometry
 * depend on how the run went, which is exactly what the two-pass split exists to
 * prevent. See "Seeds control the world, not the story" in PLAN.md.
 *
 * A struct rather than two loose parameters mostly so call sites read well.
 *
 * Note combat randomness takes the opposite path: it is *not* derived from
 * this request. The engine's `Rng` is entropy-seeded at the edge — only
 * generation repeats. See "Seeds control the world, not the story" in PLAN.md.
 */
export interface LevelRequest {
  /** Chosen once per run: user-supplied, or random entropy from the edge. */
  runSeed: number
  depth: number
}

// ***** game state ***** //

export type Outcome = 'died' | 'descended'

export interface Statistics {
  runs: number
  deaths: number
  levelsCleared: number
  maxDepth: number
  streak: number
  maxStreak: number
}

export const emptyStatistics = (): Statistics => ({
  runs: 0,
  deaths: 0,
  levelsCleared: 0,
  maxDepth: 0,
  streak: 0,
  maxStreak: 0,
})

export type LogEntry =
  | { type: 'start'; seed: number; depth: number }
  | { type: 'combat'; from: string; to: string; damage: number; killed: boolean }
  | { type: 'item'; name: string }
  | { type: 'outcome'; outcome: Outcome; moves: number }

/** One generated level plus everything that happens in it. */
export interface GameState {
  /** This level's seed, derived as `hashSeed(runSeed, depth)`. */
  seed: number
  depth: number
  map: GameMap
  entities: Record<EntityId, Entity>
  /**
   * Monotonic counter for entity ids. The original used a random UUID slice,
   * which made generated levels non-reproducible; a counter keeps state
   * deterministic and is easier to read while debugging.
   */
  nextEntityId: number
  moves: number
  /**
   * Ids of entities whose health bars are currently shown. Cleared each turn.
   *
   * Ids rather than entity copies: the original stored copies and kept their HP
   * correct only by re-copying every combat round, which is two sources of
   * truth for the same number. Resolve these against `entities` at render time.
   *
   * Keyed by id (a JSON-safe stand-in for a `Set`) so recording the same
   * combatant twice in one turn — a hit plus its retaliation — cannot produce a
   * duplicate health bar.
   */
  combatants: Record<EntityId, true>
  outcome: Outcome | null
  /** How many of each collectible the level contains, for the completion bars. */
  counts: Record<string, number>
  log: LogEntry[]
}
