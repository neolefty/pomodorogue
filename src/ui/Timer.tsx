/**
 * A countdown. Replaces `component-countdown` from
 * original/src/rogule/ui.cljs, which counted down to tomorrow and offered a
 * reload button.
 *
 * Deliberately dumb: it is given a label, a number of milliseconds and a class,
 * and it renders them. The three places it appears — the break counter, the
 * overlay over a frozen board, and the tombstone's footer — differ only in CSS.
 * Nothing here reads the clock; `remainingMs` arrives already computed from
 * absolute timestamps, so a throttled tab delays this display and never the
 * eligibility behind it.
 */
import { formatDuration } from '../pomodoro/schedule.ts'

interface TimerProps {
  className: string
  label: string
  remainingMs: number
}

export function Timer({ className, label, remainingMs }: TimerProps) {
  return (
    // `aria-live` off on purpose: a value that changes every second is noise to
    // a screen reader, and `role="timer"` already says what this is.
    <div className={className} role="timer" aria-live="off">
      <span className="timer-label">{label}</span>
      <span className="timer-clock">{formatDuration(remainingMs)}</span>
    </div>
  )
}
