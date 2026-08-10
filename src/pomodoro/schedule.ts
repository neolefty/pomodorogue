/**
 * The pomodoro gate: when a break is available, and how much of one is left.
 *
 * Pure functions only — no React, no timers, no `Date.now`. Every function here
 * takes `now` and a {@link PomodoroConfig} as arguments, which is what lets a
 * test drive a whole work interval in a millisecond instead of sitting through
 * twenty-five minutes of one.
 *
 * This replaces the original's daily gate wholesale. `util.cljs`'s `tomorrow`,
 * `time-until`, `date-token`, `parse-date` and the timezone-offset arithmetic
 * are deliberately not ported: they answered "when is midnight where the player
 * is", a question a relative interval never asks. See docs/port/07-pomodoro.md.
 */

/**
 * Every duration the gate knows about, threaded as an argument rather than
 * fixed in module constants.
 *
 * Not exposed in the UI. It exists so tests can pass `{ workMs: 2_000 }`, and so
 * that a later feature — an account perk, a user-chosen break length — is a
 * value change rather than a redesign. The defaults are the only values that
 * ship.
 */
export interface PomodoroConfig {
  /** How long the gate stays shut after a break ends. */
  workMs: number
  /** How long a break lasts, measured from the player's first action in it. */
  breakMs: number
  /**
   * The most breaks that can accumulate. **Leave this at 1.**
   *
   * Breaks do not stack: skip three cycles and you get one break, not three.
   * The rule is a number rather than a boolean so the function stays honest
   * about clamping, but raising it needs a decision that is deliberately not
   * being made yet — what consuming one banked break should do to
   * `nextPlayableAt`, given that `now + workMs` would silently wipe the rest of
   * the bank. At 1 the question cannot arise.
   */
  maxBankedBreaks: number
  /**
   * How long before the break's end the advisory appears.
   *
   * A duration, so it lives here with the others rather than as a constant that
   * a test with a two-second break would trip on every time.
   */
  warnMs: number
}

export const DEFAULT_CONFIG: PomodoroConfig = {
  workMs: 25 * 60_000,
  breakMs: 5 * 60_000,
  maxBankedBreaks: 1,
  warnMs: 60_000,
}

/**
 * The gate's whole state: two timestamps, no counters.
 *
 * `breakStartedAt` belongs to the break rather than to the run or the level,
 * because a single level can now span several breaks and gets a fresh clock in
 * each one. It is null until the first action of the current break.
 */
export interface Schedule {
  /** Epoch ms. A break is available once `now` reaches this. */
  nextPlayableAt: number
  /** Epoch ms, or null when the player has not yet acted in this break. */
  breakStartedAt: number | null
}

/**
 * The schedule a player with nothing saved starts on: playable immediately,
 * because nobody should wait 25 minutes to find out what this is.
 *
 * The epoch rather than `now` on purpose — it needs no clock, so a caller
 * cannot accidentally compare it against a `now` sampled a moment earlier and
 * conclude the gate is shut.
 */
export const initialSchedule = (): Schedule => ({
  nextPlayableAt: 0,
  breakStartedAt: null,
})

/**
 * How many breaks are owed, derived rather than stored.
 *
 * A stored counter would be a second source of truth able to drift out of sync
 * with the timestamp; this cannot. At the shipping `maxBankedBreaks` of 1 the
 * result is exactly the old boolean.
 */
export function breaksAvailable(
  schedule: Schedule,
  now: number,
  config: PomodoroConfig,
): number {
  if (now < schedule.nextPlayableAt) return 0
  const earned = Math.floor((now - schedule.nextPlayableAt) / config.workMs) + 1
  return Math.min(earned, config.maxBankedBreaks)
}

export const canPlay = (schedule: Schedule, now: number, config: PomodoroConfig): boolean =>
  breaksAvailable(schedule, now, config) > 0

/** How long until the gate opens. Zero once it is open. */
export const timeUntilBreak = (schedule: Schedule, now: number): number =>
  Math.max(0, schedule.nextPlayableAt - now)

/** When the current break runs out, or null while the player has yet to act. */
export const breakDeadline = (schedule: Schedule, config: PomodoroConfig): number | null =>
  schedule.breakStartedAt === null ? null : schedule.breakStartedAt + config.breakMs

/**
 * How much break is left. A break nobody has started yet is worth its full
 * length — the break is a credit the player spends, and opening the tab does
 * not spend it.
 */
export function breakRemaining(
  schedule: Schedule,
  now: number,
  config: PomodoroConfig,
): number {
  const deadline = breakDeadline(schedule, config)
  if (deadline === null) return config.breakMs
  return Math.max(0, deadline - now)
}

export function breakExpired(
  schedule: Schedule,
  now: number,
  config: PomodoroConfig,
): boolean {
  const deadline = breakDeadline(schedule, config)
  return deadline !== null && now >= deadline
}

/**
 * Whether to show the advisory. It tells the player to find a stopping point,
 * not to hurry: an expiring break freezes the level rather than taking it away,
 * so nothing is lost either way.
 */
export const breakEnding = (
  schedule: Schedule,
  now: number,
  config: PomodoroConfig,
): boolean =>
  schedule.breakStartedAt !== null && breakRemaining(schedule, now, config) <= config.warnMs

/**
 * Starts the break clock on the player's first action, and is a no-op on every
 * action after it — returning the same object, so a caller can tell whether
 * anything changed by identity.
 *
 * Someone who works forty minutes past the bell still gets a full five minutes
 * when they finally sit down. A player who never acts is never on the clock,
 * which is the intended state during a work interval.
 */
export const startBreakClock = (schedule: Schedule, now: number): Schedule =>
  schedule.breakStartedAt === null ? { ...schedule, breakStartedAt: now } : schedule

/**
 * Ends the break — on a win, a death, or the level freezing — and starts the
 * next work interval.
 *
 * Deliberately `now + workMs` rather than `previousNextPlayableAt + workMs`:
 * the interval starts when you stop playing, so a long break does not eat into
 * the next work block. It takes no previous `Schedule` because it needs
 * nothing from one; both fields are replaced outright.
 */
export const endBreak = (now: number, config: PomodoroConfig): Schedule => ({
  nextPlayableAt: now + config.workMs,
  breakStartedAt: null,
})

/**
 * `mm:ss` for a countdown.
 *
 * Rounded up, so a timer reads `0:01` for the whole of its last second and
 * `0:00` only once it has genuinely run out.
 */
export function formatDuration(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000)
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}
