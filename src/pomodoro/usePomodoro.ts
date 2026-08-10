/**
 * The React binding for the pomodoro: a ticking clock, and the three saved
 * slots kept in sync with localStorage.
 *
 * Deliberately knows nothing about the game. It holds the level as opaque
 * `GameState`, never generates or advances one — that is App's job, because
 * only App has the content provider and the combat stream.
 *
 * This is also where entropy enters the run: `randomSeed` is the edge's job,
 * never the engine's. Nothing under `src/game/` may call `Math.random` or
 * `Date.now`, and there is a lint rule saying so.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import type { Statistics } from '../game/types.ts'
import { emptyStatistics } from '../game/types.ts'
import type { Run, Saved } from './persistence.ts'
import { loadLevel, loadRun, loadSchedule, saveLevel, saveRun, saveSchedule } from './persistence.ts'
import { initialSchedule } from './schedule.ts'

/** A fresh seed from ambient entropy. */
export const randomSeed = (): number => Math.floor(Math.random() * 2 ** 31)

/**
 * A new run at depth 1, carrying the player's totals forward but nothing else.
 *
 * The seed is rerolled per run on purpose: one level is one run until phase 8,
 * and a fixed seed would hand the player the same dungeon every twenty-five
 * minutes.
 */
export const newRun = (statistics: Statistics = emptyStatistics()): Run => ({
  runSeed: randomSeed(),
  depth: 1,
  carry: null,
  statistics,
})

export interface PomodoroStore {
  /** Wall clock, refreshed once a second and on every return to the tab. */
  now: number
  /** The render snapshot. */
  saved: Saved
  /**
   * The slots as they stand *now*, not as the last render saw them.
   *
   * Event handlers must read through this rather than close over `saved`: a
   * turn is impure (it draws from the combat stream), so it is computed in the
   * handler and handed to React finished, exactly as phase 6 did with the
   * level. Two updates in one tick would otherwise both build on a stale base.
   */
  read: () => Saved
  /** Replaces the named slots and persists the ones that actually changed. */
  update: (patch: Partial<Saved>) => void
}

function loadSaved(): Saved {
  return {
    schedule: loadSchedule() ?? initialSchedule(),
    run: loadRun() ?? newRun(),
    // A level whose version no longer matches is dropped here and regenerated
    // at the same depth when the next break starts.
    level: loadLevel(),
  }
}

export function usePomodoro(): PomodoroStore {
  const [now, setNow] = useState(() => Date.now())
  const [saved, setSaved] = useState<Saved>(loadSaved)

  const savedRef = useRef(saved)
  const update = useCallback((patch: Partial<Saved>) => {
    const prev = savedRef.current
    const next = { ...prev, ...patch }
    // Slot identity is the change signal, which is why the schedule helpers
    // return the same object when they decide nothing happened.
    const changed =
      next.schedule !== prev.schedule || next.run !== prev.run || next.level !== prev.level
    if (!changed) return
    savedRef.current = next
    setSaved(next)
    if (next.schedule !== prev.schedule) saveSchedule(next.schedule)
    if (next.run !== prev.run) saveRun(next.run)
    if (next.level !== prev.level) saveLevel(next.level)
  }, [])

  const read = useCallback(() => savedRef.current, [])

  useEffect(() => {
    // Whatever `loadSaved` had to invent gets written back once, on mount.
    //
    // The run is the one that matters: its seed is minted from entropy, so a
    // first visit that generated a level but never saved the run would, on the
    // next reload, mint a *different* seed and pair it with the saved level.
    // Re-reading is how "was this slot defaulted?" is asked without threading
    // the answer out of a `useState` initializer that StrictMode double-invokes
    // — and it is what makes the write idempotent when it does.
    const { schedule, run } = savedRef.current
    if (loadRun() === null) saveRun(run)
    if (loadSchedule() === null) saveSchedule(schedule)
  }, [])

  useEffect(() => {
    // Absolute timestamps, never accumulated deltas. A background tab throttles
    // this interval to once a minute or worse and a sleeping laptop stops it
    // for hours; recomputing from the wall clock is correct through both with
    // no special handling, where a running total would be wildly wrong.
    const tick = () => setNow(Date.now())
    const timer = setInterval(tick, 1000)
    // Returning to a throttled tab should update the display immediately rather
    // than at whatever the next delayed tick turns out to be.
    const onVisibility = () => {
      if (!document.hidden) tick()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return { now, saved, read, update }
}
