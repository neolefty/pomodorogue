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
  breakEnding,
  breakExpired,
  breakRemaining,
  canPlay,
  DEFAULT_CONFIG,
  endBreakAtDeadline,
  phaseAt,
  restRemaining,
  startBreakClock,
  timeUntilBreak,
  workJustStarted,
} from '../pomodoro/schedule.ts'
import { newRun, randomSeed, usePomodoro } from '../pomodoro/usePomodoro.ts'
import { ArrowButtons } from './ArrowButtons.tsx'
import { Board } from './Board.tsx'
import { HealthBars } from './HealthBars.tsx'
import { Help } from './Help.tsx'
import { Inventory } from './Inventory.tsx'
import { Timer } from './Timer.tsx'
import { Tombstone } from './Tombstone.tsx'
import { useChime } from './useChime.ts'
import { useKeyboard } from './useKeyboard.ts'

/**
 * Shown under the rest-of-the-break countdown. The point of the phase is to get
 * the player off the screen, so this is the one place the game argues against
 * itself.
 *
 * Picked by play count rather than at random — no entropy needed, and a player
 * doing this sixteen times a day sees a different line each time rather than
 * the same one until it stops registering.
 */
const ENCOURAGEMENT = [
  'Rest your eyes on something further away than this.',
  'Stand up. The bell will tell you when work starts.',
  'Get a glass of water — you have time.',
  'Look out of a window until the bell rings.',
]

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
   * The arithmetic — and the reason a win, a death and a freeze all share it —
   * is `endBreakAtDeadline`, in `schedule.ts` with the rest of the clock.
   */
  const finishBreak = useCallback(
    (schedule: Schedule, at: number) => {
      rngRef.current = null
      update({ schedule: endBreakAtDeadline(schedule, at, config) })
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

      // The break clock starts on the player's first action of the break, not
      // when the break became available — working past the bell costs nothing.
      // `startBreakClock` hands back the same object on every action after the
      // first, and `update` persists only what changed.
      //
      // Done before the outcome branch, not inside the plain-move one, so that
      // `endBreakAtDeadline` always has a deadline to work from. A level cleared
      // on the very first move of a break would otherwise have no clock running
      // and fall back to `at`, quietly forfeiting the five minutes in the one
      // case the player most obviously earned them.
      const started = startBreakClock(current.schedule, at)

      if (next.outcome) {
        // A win or a death ends the *level*. The break runs on without it —
        // `endBreakAtDeadline` puts the work interval at the deadline either
        // way — and the tombstone counts down what is left of it. Scored here
        // rather than in an effect: this is a fact about a transition, and the
        // guard above is what keeps it to once per level.
        rngRef.current = null
        update({
          level: next,
          run: { ...current.run, statistics: recordOutcome(current.run.statistics, next) },
          schedule: endBreakAtDeadline(started, at, config),
        })
        return
      }

      update({ level: next, schedule: started })
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

  const phase = phaseAt(schedule, now, config)
  const playable = phase === 'playing'

  // The bell, rung on the break → work edge and nowhere else. It is what lets
  // the player be away from the screen when the break ends, which is the whole
  // reason the rest of the break is worth having.
  //
  // Both endings arrive here: a frozen level enters `working` the moment
  // `advance` notices the deadline, and a finished one when the rest of the
  // break runs out with the tombstone up. Neither needs a special case, because
  // the phase is derived from the clock rather than signalled by the transition.
  //
  // Which is also why `workJustStarted` has to be asked. Derived from the clock
  // means noticed only when watched: a laptop shut through the end of a break
  // crosses into `working` on the *next* thing that ticks, and a bell then is
  // an announcement about twenty minutes ago, delivered to someone visibly at
  // their desk. The edge is real, the news is stale, and only the second one
  // deserves a sound.
  const ring = useChime()
  const rungFor = useRef(phase)
  useEffect(() => {
    if (rungFor.current === phase) return
    const previous = rungFor.current
    rungFor.current = phase
    // Not on the first phase seen: a tab opened mid-work-interval has not just
    // been sent back to work, it was already there.
    if (phase === 'working' && previous !== 'working' && workJustStarted(schedule, now, config)) {
      ring()
    }
  }, [config, now, phase, ring, schedule])

  if (level !== null && level.outcome !== null) {
    return (
      <Tombstone
        state={level}
        statistics={run.statistics}
        footer={
          phase === 'resting' ? (
            // The level is over and the break is not. Phase 7 sent the player
            // straight to a 25-minute countdown here, which punished finishing
            // early; what is left of the break is theirs.
            <>
              <Timer
                className="timer rest"
                label="rest of your break"
                remainingMs={restRemaining(schedule, now, config)}
              />
              <p className="away">{ENCOURAGEMENT[run.statistics.runs % ENCOURAGEMENT.length]}</p>
            </>
          ) : (
            <Timer
              className="timer next"
              label="next break in"
              remainingMs={timeUntilBreak(schedule, now)}
            />
          )
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
