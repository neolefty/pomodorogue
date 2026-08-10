/**
 * The top of the UI. Ports `component-main`, `reset-game!` and `main!` from
 * original/src/rogule/ui.cljs.
 *
 * Since phase 7 this is also the pomodoro state machine. Three saved slots — a
 * schedule, a run, a level — live in `usePomodoro`; everything that decides
 * what to do with them is `advance` and `move` below, and both are driven by
 * the wall clock rather than by React's own dependency tracking.
 *
 * Entropy still enters at the edge: nothing under `src/game/` may call
 * `Math.random` or `Date.now` — there is a lint rule — so the run seed is
 * minted in `newRun` and the combat seed here. `runSeed` fixes the dungeon, and
 * a separate, deliberately *underived* seed drives combat and monster AI. Two
 * players on one run seed walk the same rooms and have different fights. See
 * "Seeds control the world, not the story" in PLAN.md.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { builtinContent } from '../game/content/builtin.ts'
import type { Dir } from '../game/engine/index.ts'
import { expireAnimation, takeTurn } from '../game/engine/index.ts'
import { getPlayer } from '../game/entities.ts'
import { makeLevel } from '../game/generator/index.ts'
import type { Rng } from '../game/rng.ts'
import { makeRng } from '../game/rng.ts'
import type { EntityId, GameState, Statistics } from '../game/types.ts'
import type { PomodoroConfig, Schedule } from '../pomodoro/schedule.ts'
import {
  breakDeadline,
  breakEnding,
  breakExpired,
  breakRemaining,
  canPlay,
  DEFAULT_CONFIG,
  endBreak,
  startBreakClock,
  timeUntilBreak,
} from '../pomodoro/schedule.ts'
import { newRun, randomSeed, usePomodoro } from '../pomodoro/usePomodoro.ts'
import { ArrowButtons } from './ArrowButtons.tsx'
import { Board } from './Board.tsx'
import { HealthBars } from './HealthBars.tsx'
import { Help } from './Help.tsx'
import { Inventory } from './Inventory.tsx'
import { Timer } from './Timer.tsx'
import { Tombstone } from './Tombstone.tsx'
import { useKeyboard } from './useKeyboard.ts'

/**
 * Folds a finished level into the run's running totals.
 *
 * Phase 8 gives a run more than one level, at which point `runs` stops meaning
 * "levels played". Until then one level is one run.
 */
function recordOutcome(stats: Statistics, state: GameState): Statistics {
  const won = state.outcome === 'descended'
  const streak = won ? stats.streak + 1 : 0
  return {
    runs: stats.runs + 1,
    deaths: won ? stats.deaths : stats.deaths + 1,
    levelsCleared: won ? stats.levelsCleared + 1 : stats.levelsCleared,
    maxDepth: Math.max(stats.maxDepth, state.depth),
    streak,
    maxStreak: Math.max(stats.maxStreak, streak),
  }
}

interface AppProps {
  /**
   * Threaded from here rather than read from a module constant, so a test can
   * drive a whole 25-minute cycle in milliseconds. Nothing in this phase sets
   * it to anything but the default.
   */
  config?: PomodoroConfig
}

export function App({ config = DEFAULT_CONFIG }: AppProps) {
  const { now, saved, read, update } = usePomodoro()
  const { schedule, run, level } = saved
  const [helpOpen, setHelpOpen] = useState(false)

  /**
   * The combat and monster-AI stream.
   *
   * A ref rather than state: drawing from it mutates it, and nothing renders
   * from it. It is minted on first use and dropped at every break boundary, so
   * a stream can never outlive the break it was made in. Nothing about it is
   * saved — combat randomness is entropy-seeded, so there is no stream position
   * to persist, and a rehydrated level gets a fresh one exactly as a new level
   * does. The consequence is that reloading (or letting a break expire) rerolls
   * your upcoming luck; accepted, because there is no leaderboard and nobody to
   * cheat but yourself. See "The combat stream does not persist" in
   * docs/port/07-pomodoro.md.
   */
  const rngRef = useRef<Rng | null>(null)

  /**
   * Freezes the level when its break runs out, and starts the work interval.
   *
   * The interval runs from the *deadline*, not from the moment the expiry was
   * noticed. With the tab open those are a second apart; with it shut they are
   * however long the player was away, and charging that time to the work
   * interval would charge it twice — once against the break they were not
   * taking, and again against the wait for the next one. Someone who closes the
   * laptop mid-break and opens it four hours later has done the work.
   *
   * `at` is only the fallback for a break with no clock running, which the
   * `breakExpired` guard at both call sites has already ruled out.
   */
  const finishBreak = useCallback(
    (schedule: Schedule, at: number) => {
      rngRef.current = null
      update({ schedule: endBreak(breakDeadline(schedule, config) ?? at, config) })
    },
    [config, update],
  )

  /**
   * Everything the passage of time alone can cause.
   *
   * Written to be idempotent: it reads and writes through `read`/`update`,
   * which are ref-backed and synchronous, so calling it twice in a tick — which
   * StrictMode's deliberate double-invoke does on mount — sees its own first
   * pass and does nothing the second time. That is what keeps a new run from
   * minting two seeds.
   */
  const advance = useCallback(
    (at: number) => {
      const current = read()
      if (!canPlay(current.schedule, at, config)) return

      if (breakExpired(current.schedule, at, config)) {
        // The break is up, so the level freezes: it is left exactly as it
        // stands — same monsters, same positions, same HP — and the next break
        // resumes it. A level is not required to fit in one break. Freezing
        // costs no new machinery, since the level was already being persisted
        // for reloads, and it removes the walk-away exploit: a player losing a
        // fight has nothing to gain by letting the clock run out.
        finishBreak(current.schedule, at)
        return
      }

      // A live level plays on, across break boundaries and reloads alike.
      if (current.level !== null && current.level.outcome === null) return

      // Nothing live to play. Either the last level ended — a new run, and so a
      // new dungeon — or there is no level at all: a first visit, or one whose
      // saved version no longer matched and was discarded on load, which
      // regenerates at the same depth.
      const nextRun = current.level === null ? current.run : newRun(current.run.statistics)
      rngRef.current = null
      // Help can be toggled on from the tombstone, where nothing renders it —
      // left set, it would cover the new level's first frame, and `useKeyboard`
      // swallows the movement keys while it is open.
      setHelpOpen(false)
      update({
        run: nextRun,
        level: makeLevel({ runSeed: nextRun.runSeed, depth: nextRun.depth }, builtinContent),
      })
    },
    [config, finishBreak, read, update],
  )

  // The clock drives the machine. `now` ticks once a second and on every return
  // to the tab, and each tick is a chance for a break to open or expire.
  useEffect(() => {
    advance(now)
  }, [advance, now])

  const move = useCallback(
    (dir: Dir | null) => {
      // Read straight from the wall clock, not from the ticked `now`: the
      // deadline is checked *before* an input is accepted, never in the middle
      // of one. Turns are discrete and synchronous, so refusing the input is
      // the whole of the enforcement — there is no half-executed turn to unwind.
      const at = Date.now()
      const current = read()
      if (current.level === null || current.level.outcome !== null) return
      if (!canPlay(current.schedule, at, config)) return
      if (breakExpired(current.schedule, at, config)) {
        finishBreak(current.schedule, at)
        return
      }

      const rng = (rngRef.current ??= makeRng('combat', randomSeed()))
      const next = takeTurn(current.level, dir, rng)
      // A refused move is not an action, and so does not start the break clock.
      if (next === current.level) return

      if (next.outcome) {
        // A win or a death ends the break as surely as the clock does. Scored
        // here rather than in an effect: this is a fact about a transition, and
        // the guard above is what keeps it to once per level.
        rngRef.current = null
        update({
          level: next,
          run: { ...current.run, statistics: recordOutcome(current.run.statistics, next) },
          schedule: endBreak(at, config),
        })
        return
      }

      // The break clock starts on the player's first action of the break, not
      // when the break became available — working past the bell costs nothing.
      // `startBreakClock` hands back the same object on every action after the
      // first, and `update` persists only what changed.
      update({ level: next, schedule: startBreakClock(current.schedule, at) })
    },
    [config, finishBreak, read, update],
  )

  const toggleHelp = useCallback(() => setHelpOpen((open) => !open), [])
  const closeHelp = useCallback(() => setHelpOpen(false), [])

  useKeyboard({ helpOpen, onMove: move, onToggleHelp: toggleHelp, onCloseHelp: closeHelp })

  // Spent smoke puffs and collision markers clear themselves as their
  // animations end — the engine's second entry point, so that this never has to
  // reach for Immer. See "Animations" in docs/port/06-ui.md.
  const clearEffect = useCallback(
    (id: EntityId) => {
      const current = read()
      if (current.level === null) return
      update({ level: expireAnimation(current.level, id) })
    },
    [read, update],
  )

  const playable = canPlay(schedule, now, config)

  if (level !== null && level.outcome !== null) {
    return (
      <Tombstone
        state={level}
        statistics={run.statistics}
        footer={
          <Timer
            className="timer next"
            label="next break in"
            remainingMs={timeUntilBreak(schedule, now)}
          />
        }
      />
    )
  }

  const player = level === null ? undefined : getPlayer(level)
  // The advisory, shown for the last minute of the break. It says "find a
  // stopping point", not "hurry": an expiring break freezes the level rather
  // than taking it away, so nothing is lost either way.
  const ending = breakEnding(schedule, now, config)

  return (
    <>
      {/*
        During a work interval the board stays on screen behind the countdown,
        dimmed and inert. Hiding it would read as "the level is gone", which is
        the impression the freeze exists to avoid. `move` refuses input on its
        own; the class is what stops a click from looking like it landed.
      */}
      <span id="game" className={playable ? undefined : 'frozen'}>
        {level !== null && <Board state={level} onAnimationEnd={clearEffect} />}
        {level !== null && <HealthBars state={level} />}
        <ArrowButtons onMove={move} />
        <Inventory items={player?.inventory ?? []} />
      </span>
      {playable ? (
        <Timer
          className={ending ? 'timer break warn' : 'timer break'}
          label={ending ? 'find a stopping point' : 'break'}
          remainingMs={breakRemaining(schedule, now, config)}
        />
      ) : (
        <Timer
          className="timer work"
          label="back to work"
          remainingMs={timeUntilBreak(schedule, now)}
        />
      )}
      <Help open={helpOpen} onToggle={toggleHelp} />
    </>
  )
}
