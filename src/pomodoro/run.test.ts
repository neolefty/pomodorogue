/**
 * The two ways the game plays, tested as what they actually are: one function,
 * three branches, no mode flag anywhere. See docs/port/08-depth.md.
 */
import { describe, expect, it } from 'vitest'
import { builtinContent } from '../game/content/builtin.ts'
import { makeLevel } from '../game/generator/index.ts'
import type { GameState, Outcome } from '../game/types.ts'
import { emptyStatistics, PLAYER_ID } from '../game/types.ts'
import type { Run } from './persistence.ts'
import { advanceRun, newRun } from './run.ts'

const run = (over: Partial<Run> = {}): Run => ({
  runSeed: 12345,
  depth: 1,
  carry: null,
  next: null,
  preferred: 'descend',
  statistics: emptyStatistics(),
  ...over,
})

/** A real generated level, finished, with the player left in a known state. */
function finished(outcome: Outcome, depth = 1): GameState {
  const level = makeLevel({ runSeed: 12345, depth }, builtinContent)
  const player = level.entities[PLAYER_ID]!
  return {
    ...level,
    outcome,
    entities: {
      ...level.entities,
      [PLAYER_ID]: {
        ...player,
        stats: { hp: { cur: 4, max: 10 }, xp: 8, hpInc: 30 },
        inventory: [{ ...player, id: 'e99', name: 'axe', kind: 'item', dmg: 2, inventory: [] }],
      },
    },
  }
}

describe('descending', () => {
  it('keeps the dungeon and goes one deeper', () => {
    const next = advanceRun(run({ depth: 3 }), 'descend', finished('cleared', 3))
    expect(next.runSeed).toBe(12345)
    expect(next.depth).toBe(4)
  })

  it('snapshots what the player finished with', () => {
    const next = advanceRun(run(), 'descend', finished('cleared'))
    expect(next.carry?.stats).toEqual({ hp: { cur: 4, max: 10 }, xp: 8, hpInc: 30 })
    expect(next.carry?.inventory.map((i) => i.name)).toEqual(['axe'])
  })

  it('marks the carry as carried, so the next level scores only itself', () => {
    const next = advanceRun(run(), 'descend', finished('cleared'))
    expect(next.carry?.inventory.every((i) => i.carried)).toBe(true)
  })

  it('takes a copy, so the finished level cannot be reached through it', () => {
    const level = finished('cleared')
    const next = advanceRun(run(), 'descend', level)
    expect(next.carry?.stats).not.toBe(level.entities[PLAYER_ID]!.stats)
    expect(next.carry?.inventory[0]).not.toBe(level.entities[PLAYER_ID]!.inventory![0])
  })

  it('consumes the pending choice and remembers the preference', () => {
    const next = advanceRun(run({ next: 'descend', preferred: 'restart' }), 'descend', finished('cleared'))
    expect(next.next).toBeNull()
    expect(next.preferred).toBe('descend')
  })

  it('keeps the carry it already had when the level was lost to a version bump', () => {
    // `advance` drops a pending choice in this case rather than reaching here,
    // but the branch is what makes `carry` mean one thing at all times.
    const existing = run({ depth: 2, carry: { stats: emptyStats(), inventory: [] } })
    expect(advanceRun(existing, 'descend', null).carry).toBe(existing.carry)
  })
})

const emptyStats = () => ({ hp: { cur: 10, max: 10 }, xp: 3, hpInc: 0 })

describe('starting over', () => {
  it('mints a new dungeon at depth 1 with nothing carried', () => {
    const next = advanceRun(run({ depth: 6, carry: { stats: emptyStats(), inventory: [] } }), 'restart', finished('cleared', 6))
    expect(next.depth).toBe(1)
    expect(next.carry).toBeNull()
    expect(next.runSeed).not.toBe(12345)
  })

  it('keeps lifetime statistics and records that a run ended', () => {
    const stats = { ...emptyStatistics(), levelsCleared: 4, maxDepth: 5, runs: 2 }
    const next = advanceRun(run({ statistics: stats }), 'restart', finished('cleared'))
    expect(next.statistics.levelsCleared).toBe(4)
    expect(next.statistics.maxDepth).toBe(5)
    expect(next.statistics.runs).toBe(3)
  })

  it('does not count a second run ending when the player already died', () => {
    // `recordOutcome` counts the run at the moment of death. Choosing "New run"
    // afterwards is getting on with the next one, not ending another.
    const stats = { ...emptyStatistics(), runs: 2 }
    const next = advanceRun(run({ statistics: stats }), 'restart', finished('died'))
    expect(next.statistics.runs).toBe(2)
  })

  it('is exactly what the game did before there was a choice', () => {
    // Fixed mode is this branch taken every time — the phase-6 game on a
    // pomodoro cadence, which is why it needs no special-casing to exist.
    const next = advanceRun(run(), 'restart', finished('cleared'))
    const fresh = newRun(next.statistics, 'restart')
    expect({ ...next, runSeed: 0 }).toEqual({ ...fresh, runSeed: 0 })
  })
})

describe('retrying', () => {
  it('replays the same dungeon from the top, with nothing carried', () => {
    const next = advanceRun(
      run({ depth: 5, carry: { stats: emptyStats(), inventory: [] } }),
      'retry',
      finished('died', 5),
    )
    expect(next.runSeed).toBe(12345)
    expect(next.depth).toBe(1)
    expect(next.carry).toBeNull()
  })

  it('leaves the standing preference alone', () => {
    // Retrying one bad death says nothing about how the player likes to play.
    for (const preferred of ['descend', 'restart'] as const) {
      expect(advanceRun(run({ preferred }), 'retry', finished('died')).preferred).toBe(preferred)
    }
  })
})

describe('a new run', () => {
  it('starts at depth 1 with nothing pending and nothing carried', () => {
    const fresh = newRun()
    expect(fresh).toMatchObject({ depth: 1, carry: null, next: null, preferred: 'descend' })
    expect(fresh.statistics).toEqual(emptyStatistics())
  })

  it('rerolls the seed, so the same dungeon does not arrive every 25 minutes', () => {
    const seeds = new Set(Array.from({ length: 20 }, () => newRun().runSeed))
    expect(seeds.size).toBeGreaterThan(1)
  })
})
