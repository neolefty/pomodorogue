/**
 * The shapes the whole game is written against. Read this file first.
 *
 * Hard constraint: **`GameState` must round-trip through JSON.** No `Map`,
 * `Set`, `Date`, or function values anywhere inside it. Behavior is referenced
 * by name — an entity's {@link EntityKind} — and resolved by a `switch` in the
 * engine, the same trick the original used (`lookup-fn`), for the same reason.
 * Phase 7's persistence depends on this; `types.test.ts` guards it.
 *
 * Corollary: never assign `undefined` to a field. Either omit the key or use
 * `null`, because `JSON.stringify` drops keys whose value is `undefined` and
 * the round-trip would then differ. `exactOptionalPropertyTypes` in
 * tsconfig.json enforces this at compile time.
 */
import type { Pos } from './pos.ts'
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

/**
 * Current and maximum health.
 *
 * A record, not the original's `[current max]` pair: the pair was a Clojure-ism,
 * and `hp[0]` read worse than `hp.cur` at every one of its call sites. The
 * health bar and share string iterate a two-element range either way.
 */
export interface Hp {
  cur: number
  max: number
}

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
 * What an entity *is*, which is the whole of what it does.
 *
 * Behavior is named by this one string rather than held as a function
 * reference, so `GameState` survives `JSON.stringify` — the property phase 7's
 * persistence rests on. The engine resolves it with an exhaustive `switch`
 * (`engine/movement.ts`), so an unhandled kind is a compile error.
 *
 * Phase 5 spelled this out as three separate behavior names per entity
 * (`fns.encounter`, `fns.update`, `fns.passable`) resolved through three lookup
 * tables. They turned out to be fully determined by the kind — every monster
 * carried the same three — so 5.5 collapsed them. See §1 of
 * docs/port/05a-simplify.md.
 *
 * Declared here rather than in the engine so `types.ts` stays dependency-free;
 * `content/types.ts` and the generator both consume it.
 */
export type EntityKind =
  | 'player'
  | 'monster'
  | 'shrine'
  /** Hides an item until the player steps on it. */
  | 'cover'
  /** Goes into the inventory. */
  | 'item'
  /** Drunk on the spot. */
  | 'potion'

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

  /**
   * What this entity is, and so what it does. Absent on pure visual effects —
   * the smoke puff and the collision starburst — which have no behavior at all,
   * exactly as they carried no `fns` before 5.5.
   */
  kind?: EntityKind

  /** Present on the player and monsters; absent on items. */
  stats?: Stats
  /** Present on the player only. Weapons and armour in here apply automatically. */
  inventory?: Entity[]
  /**
   * Set on an inventory item the player brought down the stairs rather than
   * found here. Never set on anything in `entities` — only inside a carry.
   *
   * It exists for the completion bars. `collectedBar` counts held items against
   * *this level's* `counts`, so three carried chestnuts would fill a bar for two
   * the player never picked up — or, worse, report a level completed on the
   * strength of a previous one. The flag lets the bars ask "found here?", which
   * is the question they were always asking; it just had no way to be wrong
   * before a run spanned levels. Sticky across descents on purpose: an item
   * carried from depth 2 to depth 5 was not found at depth 5 either.
   */
  carried?: true

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
 * What occupies a tile. Walls are the shell dug around rooms and corridors.
 *
 * Numeric codes rather than strings because the tile map is a flat array that
 * phase 7 writes to localStorage every 25 minutes: `[0,0,1,1,2,...]` is about a
 * byte per tile where `{"3,4":"room",...}` was about fifteen, across ~1000
 * tiles. Read them through `TILE`, never as bare numbers.
 */
export const TILE = {
  /** Undug, and everything off the edge of the map. The absence of a tile. */
  rock: 0,
  room: 1,
  corridor: 2,
  door: 3,
  wall: 4,
} as const

export type Tile = (typeof TILE)[keyof typeof TILE]

/** Passable tiles — the set the original spelled out at each call site. */
export const PASSABLE_TILES: readonly Tile[] = [TILE.room, TILE.door, TILE.corridor]

/** A rectangular room, flattened out of rot-js's private digger fields. */
export interface Room {
  x1: number
  y1: number
  x2: number
  y2: number
  /** Door positions on this room's wall. */
  doors: Pos[]
}

/**
 * The map as play reads it, and as phase 7 persists it.
 *
 * Generation needs room and corridor tiles separately, to pick spawn points and
 * to wall the level in, but nothing in `engine/` ever looks at them — so they
 * come back from `makeDiggerMap` alongside this rather than sitting on it. On
 * it, they would be a near-complete second and third copy of the tile map in
 * every save, written every 25 minutes. See §2 of docs/port/05a-simplify.md.
 */
export interface GameMap {
  /**
   * Every tile, row-major, indexed `y * size[0] + x`. Length is always
   * `size[0] * size[1]`, so there are no holes — off-map is not representable.
   *
   * **Read it through `tileAt` (grid.ts), not by hand.** Raw `y * w + x` on an
   * out-of-range `x` silently lands on the neighbouring row.
   *
   * The name is inherited from the original and covers walls too; it is on the
   * post-port rename list in docs/port/00-review-notes.md §6.
   */
  floorTiles: Tile[]
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

/**
 * How a level ended — and deliberately not which way the player then went.
 *
 * The port said `'descended'` here where the original said `:ascended`, both of
 * which name a *direction*. Since phase 8 the direction is chosen on the screen
 * after the level, so neither word can be decided at the moment the shrine is
 * touched. `'cleared'` is what the shrine actually knows. See "The shrine stays
 * a shrine" in docs/port/08-depth.md.
 */
export type Outcome = 'died' | 'cleared'

/**
 * What the player takes down the stairs: their condition and their pack.
 *
 * Lives on `Run`, not on `GameState` — it is run history, and `GameState` holds
 * exactly one level. It reaches a new level through `applyCarry`, a post-pass
 * that runs *after* the base generator, never as an input to it: carry is
 * history, and history is what {@link LevelRequest} exists to keep out. See
 * "What carries between levels" in docs/port/08-depth.md.
 */
export interface PlayerCarry {
  stats: Stats
  /** There is no separate item type — inventory entries are entities. */
  inventory: Entity[]
}

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

/**
 * Levels that reached an ending, either one. Derived rather than stored — every
 * level ends cleared or died, and a level still frozen mid-break has not ended.
 *
 * This is what `runs` used to count, back when one level was one run. Since
 * phase 8 `runs` counts runs, so the screens that want "how many times have I
 * played this" ask for this instead.
 */
export const levelsPlayed = (stats: Statistics): number => stats.levelsCleared + stats.deaths

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
