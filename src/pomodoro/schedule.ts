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
  /**
   * How late the work interval's start may be *noticed* and still be worth
   * announcing. See {@link workJustStarted}.
   *
   * Two minutes is picked to sit above every legitimate delay and below every
   * illegitimate one. A visible tab notices within a second; a hidden one is
   * throttled to a tick a second, and to a tick a minute only after five
   * minutes hidden, which a five-minute break cannot outlast. A closed laptop,
   * by contrast, notices hours late.
   */
  bellWindowMs: number
}

export const DEFAULT_CONFIG: PomodoroConfig = {
  workMs: 25 * 60_000,
  breakMs: 5 * 60_000,
  maxBankedBreaks: 1,
  warnMs: 60_000,
  bellWindowMs: 2 * 60_000,
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

/**
 * Milliseconds from `now` to `target`, floored at zero.
 *
 * Every countdown in this module is this shape — a moment the schedule already
 * knows, minus the clock, never negative — so the clamp lives here rather than
 * three times over. The three differ only in which moment they measure to.
 */
const until = (target: number, now: number): number => Math.max(0, target - now)

/** How long until the gate opens. Zero once it is open. */
export const timeUntilBreak = (schedule: Schedule, now: number): number =>
  until(schedule.nextPlayableAt, now)

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
  return until(deadline, now)
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
 * Ends the break at `endsAt` and starts the work interval there.
 *
 * The argument is the moment the *break* ends, which is not always the moment
 * this is called. A level that freezes on the deadline ends its break at the
 * deadline however much later the expiry was noticed; a level won with two
 * minutes left ends its break two minutes later. Only a break with no clock
 * running — nobody ever acted — ends where it is told to.
 *
 * Deliberately relative to that moment rather than to the previous
 * `nextPlayableAt`: the work interval starts when the break ends, so a break
 * taken late does not eat into the next work block. It takes no previous
 * `Schedule` because it needs nothing from one; both fields are replaced.
 */
export const endBreak = (endsAt: number, config: PomodoroConfig): Schedule => ({
  nextPlayableAt: endsAt + config.workMs,
  breakStartedAt: null,
})

/**
 * The schedule that follows the break, for all three ways a break can end — a
 * win, a death, or the level freezing on the clock.
 *
 * All three are one expression, which is the whole of phase 7.5: the work
 * interval starts when the break was always going to end, at the *deadline*,
 * never at the moment the ending happened to be noticed.
 *
 * - **Frozen on the clock.** With the tab open the deadline and the noticing
 *   are a second apart; with it shut they are however long the player was away,
 *   and charging that time to the work interval would charge it twice — once
 *   against the break they were not taking, and again against the wait for the
 *   next one. Someone who closes the laptop mid-break and opens it four hours
 *   later has done the work.
 * - **Won or died.** Phase 7 used `now` here, which handed a player who cleared
 *   a level in ninety seconds a *longer* wait than one who dawdled. The five
 *   minutes are the player's: finishing early neither forfeits the rest of them
 *   nor buys a shorter work interval.
 *
 * `now` is only the fallback for a break whose clock never started, which no
 * caller can currently reach — the freeze path is guarded by `breakExpired`,
 * and the outcome path starts the clock before it gets here. Kept because "no
 * clock ever ran" has no better answer than "now".
 */
export const endBreakAtDeadline = (
  schedule: Schedule,
  now: number,
  config: PomodoroConfig,
): Schedule => endBreak(breakDeadline(schedule, config) ?? now, config)

/**
 * When the work interval begins — equivalently, when the break ends or ended.
 *
 * Derived, not stored. `endBreak` puts the break's end plus a work interval
 * into `nextPlayableAt`, so subtracting the interval recovers it exactly, and
 * `Schedule` keeps its two fields and its schema version. `breakStartedAt` is
 * no use for this: it goes to null on the outcome, because the break clock is
 * not what is being counted any more.
 *
 * Meaningless before the first break has ever ended, where it reads as a time
 * long past — which is the right answer anyway, since nothing is resting.
 */
export const workStartsAt = (schedule: Schedule, config: PomodoroConfig): number =>
  schedule.nextPlayableAt - config.workMs

/**
 * How much break is left *after* the level ended. Zero once the work interval
 * has started.
 *
 * The counterpart to {@link breakRemaining}, which measures the same five
 * minutes from the other end and only while the break clock is running.
 */
export const restRemaining = (
  schedule: Schedule,
  now: number,
  config: PomodoroConfig,
): number => until(workStartsAt(schedule, config), now)

/**
 * Whether the work interval started recently enough that saying so out loud is
 * news rather than history.
 *
 * The phase below is derived from a clock that only advances while someone is
 * watching, so `working` is entered when the transition is *noticed*, which is
 * not always when it happened. Sleep through a break and the tab wakes to a
 * work interval that began twenty minutes ago; ringing a bell for it announces
 * the past, at the one moment the player is certainly at the screen. Within
 * `bellWindowMs` the news is fresh and the player may well be across the room,
 * which is the case the bell exists for.
 */
export const workJustStarted = (
  schedule: Schedule,
  now: number,
  config: PomodoroConfig,
): boolean => {
  const since = now - workStartsAt(schedule, config)
  return since >= 0 && since < config.bellWindowMs
}

/**
 * Which of the cycle's three moments it is.
 *
 * `resting` is the one phase 7 had no name for and phase 7.5 exists to add: the
 * level is over — won, lost, or frozen — but the break the player earned is
 * not, and the work interval has no business starting early. It is a phase of
 * the *break*, not of the work interval, which is why finishing early can never
 * shorten or lengthen the wait for the next one.
 */
export type Phase = 'playing' | 'resting' | 'working'

export const phaseAt = (schedule: Schedule, now: number, config: PomodoroConfig): Phase => {
  if (canPlay(schedule, now, config)) return 'playing'
  return now < workStartsAt(schedule, config) ? 'resting' : 'working'
}

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
