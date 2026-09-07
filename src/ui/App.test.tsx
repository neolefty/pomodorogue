/**
 * The pomodoro state machine, driven through the UI that owns it.
 *
 * @vitest-environment jsdom
 *
 * Everything under `src/game/` is DOM-free and tested in a node environment;
 * this is the one file that needs a document, which is why the environment is
 * named here rather than in `vite.config.ts`.
 *
 * **What this covers that the unit tests cannot.** `schedule.ts`, `run.ts` and
 * `persistence.ts` are pure and well covered on their own, but the decisions
 * that matter — when a break is spent, what a break's end does to a level in
 * progress, when a recorded choice takes effect — are none of theirs. They live
 * in `advance` and `move` in `App.tsx`, and until now nothing exercised them.
 * `AppProps.config` was built in phase 7 for exactly this and had no callers.
 *
 * Three conventions hold throughout:
 *
 * - **Time only moves when a test moves it.** `vi.useFakeTimers` freezes
 *   `Date.now`, which is what `move` reads, so any number of turns can be taken
 *   at one instant and a break expires only when {@link tick} says so.
 * - **Assertions read the saved slots, not the DOM.** The three slots *are* this
 *   machine's output — they are what survives the reload the whole phase exists
 *   for — and they are read back through `persistence.ts` so no test has to know
 *   what a storage envelope looks like. The DOM is asserted only where the
 *   player-visible claim is about the screen.
 * - **`StrictMode` is always on.** `advance` is written to be idempotent under
 *   its deliberate double-invoke; running without it would hide the bug that
 *   care prevents, which is a first visit minting two run seeds.
 */
import { StrictMode } from 'react'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { builtinContent } from '../game/content/builtin.ts'
import { makeLevel } from '../game/generator/index.ts'
import { hashSeed } from '../game/rng.ts'
import type { Pos } from '../game/pos.ts'
import type { GameState } from '../game/types.ts'
import { PLAYER_ID, TILE } from '../game/types.ts'
import { tileIndex } from '../game/grid.ts'
import { loadLevel, loadRun, loadSchedule, saveLevel, saveRun } from '../pomodoro/persistence.ts'
import type { PomodoroConfig } from '../pomodoro/schedule.ts'
import { newRun } from '../pomodoro/run.ts'
import { App } from './App.tsx'

/**
 * The real cycle at a thousandth of the scale, with every proportion kept — a
 * break is a fifth of the work interval, the advisory is the last fifth of the
 * break. Tuning against `DEFAULT_CONFIG`'s real minutes would make each test
 * advance millions of milliseconds of fake time for no extra coverage.
 */
const CONFIG: PomodoroConfig = {
  workMs: 25_000,
  breakMs: 5_000,
  maxBankedBreaks: 1,
  warnMs: 1_000,
  bellWindowMs: 2_000,
}

/** A fixed epoch. Nothing here may read the real clock, tests included. */
const T0 = 1_760_000_000_000

// ***** the bell *****

let oscillators = 0

/**
 * Enough of the Web Audio API for `useChime`, which jsdom does not implement.
 *
 * Counting oscillators rather than mocking `ring` itself keeps the assertion on
 * the real question — was a sound made — through the real code, including the
 * gesture-unlock dance that decides whether one *can* be.
 */
class FakeAudioContext {
  currentTime = 0
  destination = {}
  resume = () => Promise.resolve()
  createGain = () => ({
    gain: { value: 0, setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
    connect: <T,>(node: T) => node,
  })
  createOscillator = () => {
    oscillators += 1
    return { frequency: { value: 0 }, connect: <T,>(node: T) => node, start: () => {}, stop: () => {} }
  }
}

const rang = (): boolean => oscillators > 0

// ***** storage *****

/**
 * The saved slots, in memory.
 *
 * Supplied rather than borrowed: `globalThis.localStorage` under Node 25 is
 * Node's own, which is inert without a `--localstorage-file` and shadows
 * jsdom's inside the test process. Since `persistence.ts` reads the global —
 * correct in a browser — the fix belongs at the global, and a storage the test
 * owns outright is better than one it has to reach for and hope about.
 *
 * A real `Storage` in every way `persistence.ts` uses one, so its JSON
 * envelopes, its version checks and its validators all run for real.
 */
class MemoryStorage implements Storage {
  private items = new Map<string, string>()
  get length() {
    return this.items.size
  }
  key = (index: number): string | null => [...this.items.keys()][index] ?? null
  getItem = (key: string): string | null => this.items.get(key) ?? null
  setItem = (key: string, value: string): void => void this.items.set(key, String(value))
  removeItem = (key: string): void => void this.items.delete(key)
  clear = (): void => this.items.clear()
}

// ***** driving it *****

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage())
  oscillators = 0
  vi.stubGlobal('AudioContext', FakeAudioContext)
  vi.useFakeTimers()
  vi.setSystemTime(T0)
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const mount = (config: PomodoroConfig = CONFIG) =>
  render(
    <StrictMode>
      <App config={config} />
    </StrictMode>,
  )

/** Moves the clock, letting every interval tick and effect in between run. */
async function tick(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms)
  })
}

/**
 * Wakes the tab up at a later time without living through the interval — a
 * closed laptop, where the tick that would have noticed the break ending never
 * fired. Jumping the system clock and then allowing one tick is the difference
 * between "twenty minutes passed" and "twenty minutes passed unobserved", which
 * is precisely what the bell has to tell apart.
 */
async function wakeAt(at: number): Promise<void> {
  vi.setSystemTime(at)
  await tick(1_000)
}

/**
 * A keypress, dispatched at the body so it reaches both listeners that matter:
 * `useKeyboard`'s, on `window`, and `useChime`'s one-shot audio unlock, on
 * `document`. A real keystroke targets the focused element and bubbles to both.
 */
const press = (key: string) => fireEvent.keyDown(document.body, { key })

/**
 * Rest, `n` times. The one action guaranteed to spend a turn: `moveTo` treats a
 * null direction as a move unconditionally, where a direction can meet a wall
 * and cost nothing. Tests that want a *refused* move ask for one by name.
 */
const rest = (n = 1) => {
  for (let i = 0; i < n; i++) press('.')
}

const playerPos = (state: GameState): Pos => state.entities[PLAYER_ID]!.pos

// ***** crafted levels *****

const SEED = 4242

/**
 * A real generated level, adjusted, and saved as if the player were mid-break
 * with it. Reaching a shrine or dying by walking is not something a test can do
 * by pressing arrow keys — so the level is placed into the situation instead,
 * and the *transition* is what gets driven through the UI.
 *
 * The run is saved alongside it so the pair agrees; a mismatched run would be
 * invented on load and the depth-1 assertions would be about a different seed.
 */
function saveCrafted(mutate: (state: GameState) => void, depth = 1): GameState {
  const run = { ...newRun(), runSeed: SEED, depth }
  const state = JSON.parse(
    JSON.stringify(makeLevel({ runSeed: SEED, depth }, builtinContent)),
  ) as GameState
  mutate(state)
  saveRun(run)
  saveLevel(state)
  return state
}

/**
 * Puts an existing entity next to the player, so one keypress reaches it — and
 * clears whatever else was on that square, since `moveTo` runs an encounter for
 * every occupant and a monster sharing the shrine's tile would make the test
 * about a fight.
 */
function moveBesidePlayer(state: GameState, id: string): void {
  const [x, y] = playerPos(state)
  const at: Pos = [x + 1, y]
  clearSquare(state, at)
  state.entities[id]!.pos = at
}

/** Removes every entity but the player from a square. */
function clearSquare(state: GameState, at: Pos): void {
  for (const entity of Object.values(state.entities)) {
    if (entity.id !== PLAYER_ID && entity.pos[0] === at[0] && entity.pos[1] === at[1]) {
      delete state.entities[entity.id]
    }
  }
}

/** Walls the player in, so every direction is a refused move. */
function encloseThePlayer(state: GameState): void {
  const [x, y] = playerPos(state)
  const neighbours: Pos[] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]
  for (const [dx, dy] of neighbours) {
    const at: Pos = [x + dx, y + dy]
    clearSquare(state, at)
    state.map.floorTiles[tileIndex(state.map.size, at[0], at[1])] = TILE.rock
  }
}

// ***** the tests *****

describe('the first visit', () => {
  it('is playable immediately, and saves the run it had to invent', async () => {
    mount()

    const level = loadLevel()
    const run = loadRun()
    expect(level).not.toBeNull()
    expect(level!.depth).toBe(1)
    expect(run!.depth).toBe(1)
    expect(run!.carry).toBeNull()
    expect(loadSchedule()).toEqual({ nextPlayableAt: 0, breakStartedAt: null })
  })

  it('mints exactly one run seed under StrictMode', () => {
    mount()

    // The level's seed derives from the run's. Two passes of `advance` would
    // mint a second run seed and generate against it, leaving a saved level
    // that no longer belongs to the saved run — and this is what says so.
    expect(loadLevel()!.seed).toBe(hashSeed(loadRun()!.runSeed, 1))
  })
})

describe('the break clock', () => {
  it('starts on the first action, not when the break opens', async () => {
    mount()
    await tick(3_000)
    expect(loadSchedule()!.breakStartedAt).toBeNull()

    rest()

    // Three seconds of the break went by before the player touched a key, and
    // none of them were charged: working past the bell costs nothing.
    expect(loadSchedule()!.breakStartedAt).toBe(T0 + 3_000)
  })

  it('is not started by a move the level refuses', () => {
    saveCrafted(encloseThePlayer)
    mount()

    press('ArrowRight')

    expect(loadSchedule()!.breakStartedAt).toBeNull()
    expect(loadLevel()!.moves).toBe(0)
  })
})

describe('a break running out mid-level', () => {
  it('freezes the level rather than taking it away', async () => {
    saveCrafted(() => {})
    mount()
    rest(3)
    const frozen = loadLevel()!

    await tick(CONFIG.breakMs + 1_000)

    const after = loadLevel()!
    expect(after.outcome).toBeNull()
    expect(after.moves).toBe(frozen.moves)
    expect(playerPos(after)).toEqual(playerPos(frozen))
    expect(screen.getByText('back to work')).toBeDefined()
  })

  it('refuses input once the break is over', async () => {
    mount()
    rest()
    await tick(CONFIG.breakMs + 1_000)
    const frozen = loadLevel()!

    rest(5)

    expect(loadLevel()!.moves).toBe(frozen.moves)
  })

  it('starts the work interval at the deadline, however late the expiry is noticed', async () => {
    mount()
    rest()
    const deadline = T0 + CONFIG.breakMs

    // The laptop was shut for four hours over the end of the break.
    await wakeAt(deadline + 4 * 60 * 60_000)

    // Charged to the break that was not being taken, and not a second time to
    // the wait for the next one.
    expect(loadSchedule()!.nextPlayableAt).toBe(deadline + CONFIG.workMs)
  })

  it('resumes the same level in the next break rather than generating one', async () => {
    mount()
    rest(2)
    const frozen = loadLevel()!

    await tick(CONFIG.breakMs + CONFIG.workMs + 1_000)

    const resumed = loadLevel()!
    expect(resumed.seed).toBe(frozen.seed)
    expect(resumed.moves).toBe(frozen.moves)
    expect(playerPos(resumed)).toEqual(playerPos(frozen))
    // A fresh clock for the new break: a level may span as many as it needs.
    expect(loadSchedule()!.breakStartedAt).toBeNull()
  })
})

describe('finishing a level early', () => {
  const clearIt = async () => {
    saveCrafted((state) => moveBesidePlayer(state, 'shrine'))
    mount()
    await tick(0)
    press('ArrowRight')
  }

  it('keeps the rest of the break, and does not shorten the next work interval', async () => {
    await clearIt()

    expect(loadLevel()!.outcome).toBe('cleared')
    expect(loadRun()!.statistics).toMatchObject({ levelsCleared: 1, streak: 1, deaths: 0 })
    // The five minutes are the player's however fast they were: the work
    // interval starts where the break was always going to end.
    expect(loadSchedule()!.nextPlayableAt).toBe(T0 + CONFIG.breakMs + CONFIG.workMs)
    expect(screen.getByText('rest of your break')).toBeDefined()
  })

  it('records the choice without acting on it', async () => {
    await clearIt()
    const finished = loadLevel()!

    fireEvent.click(screen.getByRole('button', { name: 'Descend' }))

    expect(loadRun()!.next).toBe('descend')
    // Still on the tombstone, and still the level that just ended: pressing
    // Descend inside the remaining break must not start a second level.
    expect(loadLevel()!.seed).toBe(finished.seed)
    expect(loadRun()!.depth).toBe(1)
  })

  it('acts on it when the next break opens', async () => {
    await clearIt()
    fireEvent.click(screen.getByRole('button', { name: 'Descend' }))

    await tick(CONFIG.breakMs + CONFIG.workMs + 1_000)

    const run = loadRun()!
    expect(run.depth).toBe(2)
    expect(run.next).toBeNull()
    expect(run.runSeed).toBe(SEED)
    expect(run.carry).not.toBeNull()
    expect(loadLevel()!.depth).toBe(2)
    expect(loadLevel()!.seed).toBe(hashSeed(SEED, 2))
  })

  it('starts over on a new seed at depth 1, carrying nothing', async () => {
    await clearIt()
    fireEvent.click(screen.getByRole('button', { name: 'Start over' }))

    await tick(CONFIG.breakMs + CONFIG.workMs + 1_000)

    const run = loadRun()!
    expect(run.depth).toBe(1)
    expect(run.carry).toBeNull()
    expect(run.runSeed).not.toBe(SEED)
    // Statistics outlive the run they were earned in.
    expect(run.statistics.levelsCleared).toBe(1)
  })
})

describe('the bell', () => {
  it('rings when the work interval starts under the player’s nose', async () => {
    mount()
    rest()

    await tick(CONFIG.breakMs + 1_000)

    expect(rang()).toBe(true)
  })

  it('stays silent for a transition noticed hours late', async () => {
    mount()
    rest()

    await wakeAt(T0 + CONFIG.breakMs + CONFIG.bellWindowMs + 60_000)

    // The player is demonstrably at their desk — they just woke the tab — and
    // the news is old. A bell here announces the past.
    expect(rang()).toBe(false)
  })

  it('does not ring for a tab opened mid-work-interval', async () => {
    saveRun(newRun())
    // A work interval already running, with its break long since ended.
    localStorage.setItem(
      'pomodorogue.schedule',
      JSON.stringify({ schemaVersion: 1, data: { nextPlayableAt: T0 + 1_000, breakStartedAt: null } }),
    )
    mount()

    await tick(500)

    expect(rang()).toBe(false)
  })
})

describe('across a reload', () => {
  it('comes back to the same level, mid-break', () => {
    const view = mount()
    rest(4)
    const before = loadLevel()!

    // A reload: everything in memory goes, localStorage stays.
    view.unmount()
    mount()

    const after = loadLevel()!
    expect(after.seed).toBe(before.seed)
    expect(after.moves).toBe(4)
    expect(playerPos(after)).toEqual(playerPos(before))
    // The break clock survives too, so a reload cannot be used to buy time.
    expect(loadSchedule()!.breakStartedAt).toBe(T0)
  })
})
