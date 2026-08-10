/**
 * What survives a reload, and how. Replaces `alandipert/storage-atom`.
 *
 * Three concerns in three localStorage keys, each with its own version, so a
 * corrupt or outdated one cannot take down the others. This matters most for
 * the level: it is the slot whose shape changes, and it is the one we are
 * willing to throw away.
 *
 * **On a version mismatch the response is to discard, never to migrate.**
 * Round-trippable through JSON is not the same property as
 * compatible-with-yesterday's-build, and phase 5.5 sharpened the difference:
 * entity kinds are persisted strings that the engine's exhaustive `switch`
 * throws on, `TILE` codes are numbers whose meaning is positional, and
 * `Stats.hp` has already changed shape once. A saved level from an older build
 * does not fail at load, it fails mid-turn or renders `NaN`. Discarding costs a
 * level — possibly a level that spanned more than one break — where a migration
 * costs a migration for every future deploy. See "Version the save; never
 * migrate it" in docs/port/07-pomodoro.md.
 *
 * Tolerance belongs here, at the load boundary, where the input is genuinely
 * untrusted. It does not belong in the middle of a turn: the `throw` in
 * `runEncounter` exists to catch real bugs during development and stays as it
 * is.
 */
import type { GameState, Statistics } from '../game/types.ts'
import { PLAYER_ID } from '../game/types.ts'
import type { Schedule } from './schedule.ts'

/**
 * A run: the seed that fixes its dungeon, how deep it has got, and its totals.
 *
 * `carry` is what the player takes down the stairs. It is always null until
 * phase 8 defines `PlayerCarry` ([docs/port/08-depth.md]) and widens the type;
 * it is here now so the persisted shape does not change underneath that phase.
 */
export interface Run {
  runSeed: number
  depth: number
  carry: null
  statistics: Statistics
}

/** The three slots together, as the app holds them. */
export interface Saved {
  schedule: Schedule
  run: Run
  /** The in-progress level, frozen or live. Null between levels. */
  level: GameState | null
}

interface Slot {
  key: string
  /**
   * Bump when the slot's shape changes. For `level` that means: entity kinds
   * change, `TILE` codes change, or `GameState` gains, loses or reshapes a
   * field. Phase 8 bumps it for the `'shrine'` → `'stairs'` rename.
   */
  schemaVersion: number
}

const SCHEDULE_SLOT: Slot = { key: 'pomodorogue.schedule', schemaVersion: 1 }
const RUN_SLOT: Slot = { key: 'pomodorogue.run', schemaVersion: 1 }
const LEVEL_SLOT: Slot = { key: 'pomodorogue.level', schemaVersion: 1 }

/**
 * localStorage, or null where the browser refuses it — Safari's private mode
 * throws on write, and a sandboxed iframe throws on the property access itself.
 * The game stays playable without it; it just forgets.
 */
function defaultStorage(): Storage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    return null
  }
}

function read<T>(
  slot: Slot,
  isValid: (value: unknown) => boolean,
  storage: Storage | null,
): T | null {
  if (!storage) return null
  let raw: string | null
  try {
    raw = storage.getItem(slot.key)
  } catch {
    return null
  }
  if (raw === null) return null

  try {
    const envelope: unknown = JSON.parse(raw)
    if (!isObject(envelope)) return null
    if (envelope.schemaVersion !== slot.schemaVersion) return null
    if (!isValid(envelope.data)) return null
    return envelope.data as T
  } catch {
    // Truncated or hand-edited JSON. Same answer as a version mismatch.
    return null
  }
}

function write<T>(slot: Slot, data: T, storage: Storage | null): void {
  if (!storage) return
  try {
    storage.setItem(slot.key, JSON.stringify({ schemaVersion: slot.schemaVersion, data }))
  } catch {
    // A full or disabled quota is not a reason to lose the player's turn.
  }
}

// ***** validators ***** //

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

const isNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value)

function isSchedule(value: unknown): boolean {
  return (
    isObject(value) &&
    isNumber(value.nextPlayableAt) &&
    (value.breakStartedAt === null || isNumber(value.breakStartedAt))
  )
}

const STATISTIC_FIELDS = [
  'runs',
  'deaths',
  'levelsCleared',
  'maxDepth',
  'streak',
  'maxStreak',
] as const

function isStatistics(value: unknown): boolean {
  return isObject(value) && STATISTIC_FIELDS.every((field) => isNumber(value[field]))
}

function isRun(value: unknown): boolean {
  return (
    isObject(value) &&
    isNumber(value.runSeed) &&
    isNumber(value.depth) &&
    value.carry === null &&
    isStatistics(value.statistics)
  )
}

/**
 * A shape check, not a full validation of `GameState`.
 *
 * The version does the real work — it is what catches a level whose *fields*
 * are all present and whose *meaning* has changed. This catches the rest: a
 * truncated write, a key from a different app, a hand-edited blob. It insists
 * on the player and on `outcome` because those are what every screen resolves
 * first — a missing `outcome` is `undefined`, which passes the `!== null` test
 * each branch makes and shows a tombstone for a level nobody finished.
 */
function isLevel(value: unknown): boolean {
  if (value === null) return true
  if (!isObject(value)) return false
  const map: unknown = value.map
  return (
    isNumber(value.seed) &&
    isNumber(value.depth) &&
    (value.outcome === null || typeof value.outcome === 'string') &&
    isObject(map) &&
    Array.isArray(map.floorTiles) &&
    Array.isArray(map.rooms) &&
    Array.isArray(map.size) &&
    map.size.length === 2 &&
    map.floorTiles.length === map.size[0] * map.size[1] &&
    isObject(value.entities) &&
    isObject(value.entities[PLAYER_ID])
  )
}

// ***** the slots ***** //

export const loadSchedule = (storage: Storage | null = defaultStorage()): Schedule | null =>
  read<Schedule>(SCHEDULE_SLOT, isSchedule, storage)

export const saveSchedule = (
  schedule: Schedule,
  storage: Storage | null = defaultStorage(),
): void => write(SCHEDULE_SLOT, schedule, storage)

export const loadRun = (storage: Storage | null = defaultStorage()): Run | null =>
  read<Run>(RUN_SLOT, isRun, storage)

export const saveRun = (run: Run, storage: Storage | null = defaultStorage()): void =>
  write(RUN_SLOT, run, storage)

export const loadLevel = (storage: Storage | null = defaultStorage()): GameState | null =>
  read<GameState>(LEVEL_SLOT, isLevel, storage)

export const saveLevel = (
  level: GameState | null,
  storage: Storage | null = defaultStorage(),
): void => write(LEVEL_SLOT, level, storage)
