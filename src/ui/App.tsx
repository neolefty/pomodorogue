/**
 * The top of the UI. Ports `component-main`, `reset-game!` and `main!` from
 * original/src/rogule/ui.cljs.
 *
 * This is also where entropy enters. Nothing under `src/game/` may call
 * `Math.random` or `Date.now` — there is a lint rule — so the two seeds are
 * chosen here and injected: `runSeed` fixes the dungeon, and a separate,
 * deliberately *underived* seed drives combat and monster AI. Two players on
 * one run seed walk the same rooms and have different fights. See "Seeds
 * control the world, not the story" in PLAN.md.
 */
import { useCallback, useRef, useState } from 'react'
import { builtinContent } from '../game/content/builtin.ts'
import type { Dir } from '../game/engine/index.ts'
import { expireAnimation, takeTurn } from '../game/engine/index.ts'
import { makeLevel } from '../game/generator/index.ts'
import type { Rng } from '../game/rng.ts'
import { makeRng } from '../game/rng.ts'
import type { EntityId, GameState, Statistics } from '../game/types.ts'
import { emptyStatistics, PLAYER_ID } from '../game/types.ts'
import { ArrowButtons } from './ArrowButtons.tsx'
import { Board } from './Board.tsx'
import { HealthBars } from './HealthBars.tsx'
import { Help } from './Help.tsx'
import { Inventory } from './Inventory.tsx'
import { Tombstone } from './Tombstone.tsx'
import { useKeyboard } from './useKeyboard.ts'

/** A fresh seed from ambient entropy — the edge's job, never the engine's. */
const randomSeed = (): number => Math.floor(Math.random() * 2 ** 31)

interface Level {
  state: GameState
  /**
   * The combat/AI stream, made once per level and held for its lifetime.
   *
   * A ref rather than state: drawing from it mutates it, and nothing renders
   * from it. Bundled with the state it belongs to so that starting a level
   * cannot leave the previous level's stream attached.
   */
  rng: Rng
}

const newLevel = (): Level => ({
  state: makeLevel({ runSeed: randomSeed(), depth: 1 }, builtinContent),
  rng: makeRng('combat', randomSeed()),
})

/**
 * Folds a finished level into the running totals.
 *
 * A transient stand-in for the run layer: phase 7 persists this across reloads
 * and phase 8 gives a run more than one level, at which point `runs` stops
 * meaning "levels played". Until then one level is one run, and a reload wipes
 * the board — which is fine for the phase 6 milestone and stated in
 * docs/port/06-ui.md.
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

export function App() {
  const [level, setLevel] = useState<Level>(newLevel)
  const [statistics, setStatistics] = useState<Statistics>(emptyStatistics)
  const [helpOpen, setHelpOpen] = useState(false)

  // The outcome is recorded once, on the turn it appears. A ref rather than an
  // effect: an effect keyed on `outcome` would double-count under StrictMode's
  // deliberate double-invoke, and this is a fact about a transition, not a
  // synchronization with anything outside React.
  const scored = useRef(false)

  const move = useCallback(
    (dir: Dir | null) => {
      // The help overlay covers the board, so a keypress under it is meant for
      // the overlay. The original left the board live behind its modal.
      if (helpOpen) return
      setLevel((current) => {
        const next = takeTurn(current.state, dir, current.rng)
        if (next === current.state) return current
        if (next.outcome && !scored.current) {
          scored.current = true
          setStatistics((stats) => recordOutcome(stats, next))
        }
        return { ...current, state: next }
      })
    },
    [helpOpen],
  )

  const playAgain = useCallback(() => {
    scored.current = false
    setLevel(newLevel())
  }, [])

  const toggleHelp = useCallback(() => setHelpOpen((open) => !open), [])
  const closeHelp = useCallback(() => setHelpOpen(false), [])

  useKeyboard({ onMove: move, onToggleHelp: toggleHelp, onCloseHelp: closeHelp })

  // Spent smoke puffs and collision markers clear themselves as their
  // animations end — the engine's second entry point, so that this never has to
  // reach for Immer. See "Animations" in docs/port/06-ui.md.
  const clearEffect = useCallback((id: EntityId) => {
    setLevel((current) => ({ ...current, state: expireAnimation(current.state, id) }))
  }, [])

  const { state } = level
  if (state.outcome) {
    return <Tombstone state={state} statistics={statistics} onPlayAgain={playAgain} />
  }

  const player = state.entities[PLAYER_ID]

  return (
    <span id="game">
      <Board state={state} onAnimationEnd={clearEffect} />
      <HealthBars state={state} />
      <ArrowButtons onMove={move} />
      <Inventory items={player?.inventory ?? []} />
      <Help open={helpOpen} onToggle={toggleHelp} />
    </span>
  )
}
