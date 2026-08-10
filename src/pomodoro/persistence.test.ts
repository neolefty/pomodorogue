import { describe, expect, it } from 'vitest'
import { builtinContent } from '../game/content/builtin.ts'
import { makeLevel } from '../game/generator/index.ts'
import { emptyStatistics } from '../game/types.ts'
import type { Run } from './persistence.ts'
import {
  loadLevel,
  loadRun,
  loadSchedule,
  saveLevel,
  saveRun,
  saveSchedule,
} from './persistence.ts'
import type { Schedule } from './schedule.ts'

/**
 * Storage is a parameter rather than a global here for the same reason `now` is
 * one in `schedule.ts`: a test should not need a DOM, and `src/` is otherwise
 * node-testable throughout.
 */
function memoryStorage(): Storage {
  const entries = new Map<string, string>()
  return {
    get length() {
      return entries.size
    },
    clear: () => entries.clear(),
    getItem: (key: string) => entries.get(key) ?? null,
    key: (index: number) => [...entries.keys()][index] ?? null,
    removeItem: (key: string) => {
      entries.delete(key)
    },
    setItem: (key: string, value: string) => {
      entries.set(key, value)
    },
  } as Storage
}

const SCHEDULE: Schedule = { nextPlayableAt: 1_700_000_000_000, breakStartedAt: null }
const RUN: Run = { runSeed: 12345, depth: 1, carry: null, statistics: emptyStatistics() }

describe('round trips', () => {
  it('restores a schedule', () => {
    const storage = memoryStorage()
    saveSchedule({ ...SCHEDULE, breakStartedAt: 1_700_000_060_000 }, storage)
    expect(loadSchedule(storage)).toEqual({
      nextPlayableAt: 1_700_000_000_000,
      breakStartedAt: 1_700_000_060_000,
    })
  })

  it('restores a run', () => {
    const storage = memoryStorage()
    saveRun(RUN, storage)
    expect(loadRun(storage)).toEqual(RUN)
  })

  it('restores a real generated level unchanged', () => {
    // The point of the JSON-round-trip constraint on `GameState`, exercised
    // against a generated level rather than a hand-built one.
    const storage = memoryStorage()
    const level = makeLevel({ runSeed: 42, depth: 1 }, builtinContent)
    saveLevel(level, storage)
    expect(loadLevel(storage)).toEqual(level)
  })

  it('keeps the three slots independent', () => {
    const storage = memoryStorage()
    saveSchedule(SCHEDULE, storage)
    saveRun(RUN, storage)
    saveLevel(null, storage)
    expect(loadSchedule(storage)).toEqual(SCHEDULE)
    expect(loadRun(storage)).toEqual(RUN)
    expect(loadLevel(storage)).toBeNull()
  })
})

describe('the load boundary', () => {
  it('reads an empty store as nothing saved', () => {
    const storage = memoryStorage()
    expect(loadSchedule(storage)).toBeNull()
    expect(loadRun(storage)).toBeNull()
    expect(loadLevel(storage)).toBeNull()
  })

  it('discards a slot written by a different schema version', () => {
    const storage = memoryStorage()
    const level = makeLevel({ runSeed: 42, depth: 1 }, builtinContent)
    // What a save from an older deploy looks like: intact JSON, stale meaning.
    // The version is the only thing that can catch a renamed entity kind or a
    // renumbered tile, and the answer is to discard, never to migrate.
    storage.setItem('pomodorogue.level', JSON.stringify({ schemaVersion: 0, data: level }))
    expect(loadLevel(storage)).toBeNull()
  })

  it('discards an unversioned blob', () => {
    const storage = memoryStorage()
    storage.setItem('pomodorogue.schedule', JSON.stringify(SCHEDULE))
    expect(loadSchedule(storage)).toBeNull()
  })

  it('discards truncated json rather than throwing', () => {
    const storage = memoryStorage()
    storage.setItem('pomodorogue.run', '{"schemaVersion":1,"data":{"runSe')
    expect(loadRun(storage)).toBeNull()
  })

  it('discards a slot of the right version but the wrong shape', () => {
    const storage = memoryStorage()
    const wrong = [
      ['pomodorogue.schedule', { breakStartedAt: null }],
      ['pomodorogue.run', { runSeed: 1, depth: 1, carry: null }],
      ['pomodorogue.level', { seed: 1, depth: 1, entities: {} }],
    ] as const
    for (const [key, data] of wrong) {
      storage.setItem(key, JSON.stringify({ schemaVersion: 1, data }))
    }
    expect(loadSchedule(storage)).toBeNull()
    expect(loadRun(storage)).toBeNull()
    expect(loadLevel(storage)).toBeNull()
  })

  it('discards a level with no outcome field', () => {
    // Not a missing decoration: `undefined` passes the `outcome !== null` test
    // every screen makes, so this blob would render a tombstone for a level
    // nobody finished.
    const storage = memoryStorage()
    const { outcome: _outcome, ...level } = makeLevel({ runSeed: 42, depth: 1 }, builtinContent)
    storage.setItem('pomodorogue.level', JSON.stringify({ schemaVersion: 1, data: level }))
    expect(loadLevel(storage)).toBeNull()
  })

  it('discards a level whose tile map does not match its size', () => {
    const storage = memoryStorage()
    const level = makeLevel({ runSeed: 42, depth: 1 }, builtinContent)
    const truncated = { ...level, map: { ...level.map, floorTiles: level.map.floorTiles.slice(1) } }
    storage.setItem('pomodorogue.level', JSON.stringify({ schemaVersion: 1, data: truncated }))
    expect(loadLevel(storage)).toBeNull()
  })
})

describe('storage the browser refuses', () => {
  const noStorage = null

  it('loads nothing and saves nothing without throwing', () => {
    expect(loadSchedule(noStorage)).toBeNull()
    expect(() => saveSchedule(SCHEDULE, noStorage)).not.toThrow()
  })

  it('swallows a full quota rather than losing the turn', () => {
    const full = {
      ...memoryStorage(),
      setItem: () => {
        throw new Error('QuotaExceededError')
      },
    } as Storage
    expect(() => saveLevel(null, full)).not.toThrow()
  })
})
