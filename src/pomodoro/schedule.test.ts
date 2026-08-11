import { describe, expect, it } from 'vitest'
import type { PomodoroConfig, Schedule } from './schedule.ts'
import {
  breakDeadline,
  breakEnding,
  breakExpired,
  breakRemaining,
  breaksAvailable,
  canPlay,
  DEFAULT_CONFIG,
  endBreak,
  endBreakAtDeadline,
  formatDuration,
  initialSchedule,
  phaseAt,
  restRemaining,
  startBreakClock,
  timeUntilBreak,
  workJustStarted,
  workStartsAt,
} from './schedule.ts'

/**
 * Every test here passes both `now` and the config, which is the whole reason
 * `schedule.ts` takes them as arguments: a 25-minute work interval is exercised
 * by adding a number, not by waiting.
 */
const CONFIG = DEFAULT_CONFIG
const MINUTE = 60_000
const T0 = 1_700_000_000_000

const at = (schedule: Schedule, breakStartedAt: number | null): Schedule => ({
  ...schedule,
  breakStartedAt,
})

describe('breaksAvailable', () => {
  const schedule: Schedule = { nextPlayableAt: T0, breakStartedAt: null }

  it('owes nothing before the work interval is up', () => {
    expect(breaksAvailable(schedule, T0 - 1, CONFIG)).toBe(0)
    expect(canPlay(schedule, T0 - 1, CONFIG)).toBe(false)
  })

  it('owes a break the instant the interval ends', () => {
    expect(breaksAvailable(schedule, T0, CONFIG)).toBe(1)
    expect(canPlay(schedule, T0, CONFIG)).toBe(true)
  })

  it('does not stack: three skipped cycles are still one break', () => {
    expect(breaksAvailable(schedule, T0 + 3 * CONFIG.workMs, CONFIG)).toBe(1)
  })

  it('clamps to whatever the cap is, rather than hard-coding one', () => {
    const banking: PomodoroConfig = { ...CONFIG, maxBankedBreaks: 3 }
    expect(breaksAvailable(schedule, T0 + CONFIG.workMs, banking)).toBe(2)
    expect(breaksAvailable(schedule, T0 + 2 * CONFIG.workMs, banking)).toBe(3)
    expect(breaksAvailable(schedule, T0 + 9 * CONFIG.workMs, banking)).toBe(3)
  })

  it('gives a first-ever visit its break straight away', () => {
    expect(canPlay(initialSchedule(), T0, CONFIG)).toBe(true)
    expect(timeUntilBreak(initialSchedule(), T0)).toBe(0)
  })
})

describe('timeUntilBreak', () => {
  it('counts down to the gate and stops at zero', () => {
    const schedule: Schedule = { nextPlayableAt: T0 + 10 * MINUTE, breakStartedAt: null }
    expect(timeUntilBreak(schedule, T0)).toBe(10 * MINUTE)
    expect(timeUntilBreak(schedule, T0 + 10 * MINUTE)).toBe(0)
    expect(timeUntilBreak(schedule, T0 + 99 * MINUTE)).toBe(0)
  })
})

describe('the break clock', () => {
  const fresh: Schedule = { nextPlayableAt: T0, breakStartedAt: null }

  it('is not running until the player acts, however long they take to sit down', () => {
    const late = T0 + 40 * MINUTE
    expect(breakDeadline(fresh, CONFIG)).toBeNull()
    expect(breakExpired(fresh, late, CONFIG)).toBe(false)
    // The break is a credit, and opening the tab does not spend it.
    expect(breakRemaining(fresh, late, CONFIG)).toBe(CONFIG.breakMs)
    expect(breakEnding(fresh, late, CONFIG)).toBe(false)
  })

  it('starts on the first action and is untouched by every action after it', () => {
    const started = startBreakClock(fresh, T0 + 40 * MINUTE)
    expect(started.breakStartedAt).toBe(T0 + 40 * MINUTE)
    // Identity, not just equality: `update` uses it to decide what to persist.
    expect(startBreakClock(started, T0 + 41 * MINUTE)).toBe(started)
  })

  it('runs for a full break from that first action', () => {
    const started = at(fresh, T0)
    expect(breakDeadline(started, CONFIG)).toBe(T0 + CONFIG.breakMs)
    expect(breakRemaining(started, T0 + MINUTE, CONFIG)).toBe(4 * MINUTE)
    expect(breakExpired(started, T0 + CONFIG.breakMs - 1, CONFIG)).toBe(false)
    expect(breakExpired(started, T0 + CONFIG.breakMs, CONFIG)).toBe(true)
    // Wall clock from the first action, not five minutes of accumulated play.
    expect(breakRemaining(started, T0 + 99 * MINUTE, CONFIG)).toBe(0)
  })

  it('advises for the last minute and not before', () => {
    const started = at(fresh, T0)
    expect(breakEnding(started, T0 + 3 * MINUTE + 59_999, CONFIG)).toBe(false)
    expect(breakEnding(started, T0 + 4 * MINUTE, CONFIG)).toBe(true)
  })
})

describe('endBreak', () => {
  it('starts the work interval when you stop playing, not when the break opened', () => {
    // A break opened at T0 and the player did not sit down for forty minutes.
    // The next interval is 25 minutes from *now*, so a long break never eats
    // into the following work block.
    const next = endBreak(T0 + 40 * MINUTE, CONFIG)
    expect(next.nextPlayableAt).toBe(T0 + 40 * MINUTE + CONFIG.workMs)
    expect(next.breakStartedAt).toBeNull()
    expect(canPlay(next, T0 + 40 * MINUTE, CONFIG)).toBe(false)
  })

  it('puts a frozen level a full work interval away', () => {
    const frozen = endBreak(T0 + CONFIG.breakMs, CONFIG)
    expect(canPlay(frozen, T0 + CONFIG.breakMs + CONFIG.workMs - 1, CONFIG)).toBe(false)
    expect(canPlay(frozen, T0 + CONFIG.breakMs + CONFIG.workMs, CONFIG)).toBe(true)
  })
})

/**
 * A break in progress: it opened some time ago, and the player's first action
 * of it was at T0, so it runs to T0 + 5m. Every ending below is that same break
 * ending, which is the point — all three have to agree.
 */
const inProgress = at(initialSchedule(), T0)
const DEADLINE = T0 + CONFIG.breakMs

describe('endBreakAtDeadline', () => {
  it('gives a fast player exactly the wait a slow one gets, never a longer one', () => {
    // The phase-7 bug this phase exists to fix, and it was in the *caller*:
    // ending a break with `endBreak(now)` on a win put the next break 25
    // minutes from the win, so clearing at 1:30 meant waiting 3:30 longer than
    // someone who used the whole five minutes. Both of these must land on the
    // deadline; passing `now` through instead fails this.
    const clearedEarly = endBreakAtDeadline(inProgress, T0 + 90_000, CONFIG)
    const dawdled = endBreakAtDeadline(inProgress, T0 + 4 * MINUTE, CONFIG)
    expect(clearedEarly.nextPlayableAt).toBe(DEADLINE + CONFIG.workMs)
    expect(clearedEarly.nextPlayableAt).toBe(dawdled.nextPlayableAt)
  })

  it('does not charge a shut laptop twice for a break it never took', () => {
    // The freeze path, noticed four hours late. The work interval still ran
    // from the deadline, so by the time anyone looks it is long since over.
    const frozen = endBreakAtDeadline(inProgress, T0 + 4 * 60 * MINUTE, CONFIG)
    expect(frozen.nextPlayableAt).toBe(DEADLINE + CONFIG.workMs)
    expect(canPlay(frozen, T0 + 4 * 60 * MINUTE, CONFIG)).toBe(true)
  })

  it('falls back to now for a break whose clock never started', () => {
    const untouched = endBreakAtDeadline(initialSchedule(), T0, CONFIG)
    expect(untouched.nextPlayableAt).toBe(T0 + CONFIG.workMs)
  })

  it('clears the break clock, whichever way the break ended', () => {
    expect(endBreakAtDeadline(inProgress, T0 + 90_000, CONFIG).breakStartedAt).toBeNull()
  })
})

describe('the rest of the break', () => {
  // The player sat down at T0 and cleared the level in ninety seconds. The
  // break still ends at T0 + 5m, and the work interval still starts there.
  const clearedEarly = endBreakAtDeadline(inProgress, T0 + 90_000, CONFIG)

  it('does not start the work interval early just because the level ended', () => {
    expect(workStartsAt(clearedEarly, CONFIG)).toBe(DEADLINE)
    expect(restRemaining(clearedEarly, T0 + 90_000, CONFIG)).toBe(CONFIG.breakMs - 90_000)
  })

  it('recovers the break end without a third field on the schedule', () => {
    expect(Object.keys(clearedEarly).sort()).toEqual(['breakStartedAt', 'nextPlayableAt'])
    expect(clearedEarly.breakStartedAt).toBeNull()
  })

  it('runs out at the deadline and does not go negative', () => {
    expect(restRemaining(clearedEarly, DEADLINE - 1, CONFIG)).toBe(1)
    expect(restRemaining(clearedEarly, DEADLINE, CONFIG)).toBe(0)
    expect(restRemaining(clearedEarly, DEADLINE + MINUTE, CONFIG)).toBe(0)
  })
})

describe('phaseAt', () => {
  const cleared = endBreakAtDeadline(inProgress, T0 + 90_000, CONFIG)

  it('walks playing → resting → working → playing across one whole cycle', () => {
    expect(phaseAt(initialSchedule(), T0, CONFIG)).toBe('playing')
    expect(phaseAt(cleared, T0 + 90_000, CONFIG)).toBe('resting')
    expect(phaseAt(cleared, DEADLINE, CONFIG)).toBe('working')
    expect(phaseAt(cleared, DEADLINE + CONFIG.workMs, CONFIG)).toBe('playing')
  })

  it('has no resting phase when the level froze on the clock', () => {
    // Freezing is noticed at or after the deadline and always ends the break
    // *at* it, so there is no instant left over to rest in — not at the moment
    // the level froze, and not at the moment anyone noticed.
    const frozen = endBreakAtDeadline(inProgress, DEADLINE + 3 * MINUTE, CONFIG)
    expect(phaseAt(frozen, DEADLINE, CONFIG)).toBe('working')
    expect(phaseAt(frozen, DEADLINE + 3 * MINUTE, CONFIG)).toBe('working')
    expect(restRemaining(frozen, DEADLINE, CONFIG)).toBe(0)
  })

  it('never rests during a break that is still being played', () => {
    expect(phaseAt(inProgress, T0 + MINUTE, CONFIG)).toBe('playing')
  })
})

describe('workJustStarted', () => {
  const cleared = endBreakAtDeadline(inProgress, T0 + 90_000, CONFIG)

  it('is true for a transition just noticed, and stays true through a throttled tick', () => {
    expect(workJustStarted(cleared, DEADLINE, CONFIG)).toBe(true)
    // A hidden tab ticks about once a minute at worst.
    expect(workJustStarted(cleared, DEADLINE + MINUTE, CONFIG)).toBe(true)
  })

  it('is false once the news is stale, so a woken laptop rings no bell', () => {
    expect(workJustStarted(cleared, DEADLINE + CONFIG.bellWindowMs, CONFIG)).toBe(false)
    expect(workJustStarted(cleared, DEADLINE + 20 * MINUTE, CONFIG)).toBe(false)
  })

  it('is false while the break is still running, so the bell cannot ring early', () => {
    expect(workJustStarted(cleared, DEADLINE - 1, CONFIG)).toBe(false)
    expect(workJustStarted(cleared, T0 + 90_000, CONFIG)).toBe(false)
  })
})

describe('formatDuration', () => {
  it('rounds up, so the last second reads 0:01 rather than 0:00', () => {
    expect(formatDuration(1)).toBe('0:01')
    expect(formatDuration(1000)).toBe('0:01')
    expect(formatDuration(1001)).toBe('0:02')
  })

  it('pads seconds and does not pad minutes', () => {
    expect(formatDuration(5 * MINUTE)).toBe('5:00')
    expect(formatDuration(9 * MINUTE + 5000)).toBe('9:05')
    expect(formatDuration(25 * MINUTE)).toBe('25:00')
  })

  it('bottoms out at zero', () => {
    expect(formatDuration(0)).toBe('0:00')
    expect(formatDuration(-5000)).toBe('0:00')
  })
})
