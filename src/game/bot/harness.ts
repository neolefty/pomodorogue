/**
 * The headless deep run: a policy driven from depth 1 downward until it dies,
 * stalls, or reaches `maxDepth`.
 *
 * This is the run loop `App.tsx` performs across a day of breaks, with the
 * clock taken out: generate the level with the run's carry, play turns until
 * the level ends, snapshot the carry, generate the next depth. A run that
 * takes a week of pomodoros to play takes milliseconds here, which is the
 * whole reason `src/game/` keeps itself free of the DOM (invariant 6 in
 * docs/design.md).
 *
 * **The table this produces is a printout to read, not a target to tune
 * toward.** The game is expected to change a great deal before balance is
 * worth optimizing; the harness exists to keep that change honest, not to
 * steer it. See docs/progression/findings.md, "Measure before tuning".
 *
 * Deterministic per run seed. In the real game the combat stream is
 * entropy-seeded and deliberately *not* derived from the run seed (invariant
 * 3). Here it is derived — `makeRng('bot-combat', runSeed, depth)` — because
 * a measurement that cannot be repeated cannot be compared, and this is the
 * caller-side choice invariant 3 says such a reversal would be.
 */
import { snapshotCarry } from '../carry.ts'
import { builtinContent } from '../content/builtin.ts'
import type { ContentProvider } from '../content/types.ts'
import { getArmourHp, getWeaponsDmg } from '../engine/combat.ts'
import { takeTurn } from '../engine/turn.ts'
import { getPlayer } from '../entities.ts'
import { makeLevel } from '../generator/index.ts'
import { makeRng } from '../rng.ts'
import type { GameState, PlayerCarry } from '../types.ts'
import type { Policy } from './policy.ts'

/**
 * Turns a level may take before the harness gives up on it.
 *
 * A human at a brisk one move a second spends about 300 turns in a five-minute
 * break, and a level that outlasts its break freezes and resumes in the next
 * (docs/design.md), so a slow level is not a failed one. The budget is set at
 * roughly three breaks' worth: comfortably above anything a working bot needs
 * on a 32×32 map, so that hitting it means the bot is *stuck* — oscillating
 * between two targets, say — rather than merely thorough. A stalled level ends
 * the run with outcome `'stalled'`, so it shows in the table instead of
 * hiding inside a survival.
 */
export const TURN_BUDGET = 1000

export const DEFAULT_MAX_DEPTH = 25

export type DepthOutcome = 'cleared' | 'died' | 'stalled'

/** One row of the per-depth table findings.md asks for. */
export interface DepthRecord {
  depth: number
  outcome: DepthOutcome
  /** `state.moves`: steps, rests and bumps alike. */
  turns: number
  hpStart: number
  hpEnd: number
  hpMax: number
  /** HP lost to blows this level, before regeneration and potions. */
  damageTaken: number
  /** Blows that landed for more than zero. Zero with monsters fought is immunity. */
  hitsTaken: number
  /** Inventory totals at the end of the level — the gear-accumulation columns. */
  armour: number
  weapons: number
  xp: number
  /** Monsters the player killed on this level. */
  kills: number
  /** Inventory size at the end of the level. */
  items: number
  /** Every monster the level spawned, by name, in table order — the mix column. */
  monsters: string[]
  /** The hardest hit the level could land: `max(xp) - 1`, since `rng.int(xp)` tops out there. */
  maxHit: number
}

export interface DeepRunOptions {
  maxDepth?: number
  turnBudget?: number
  content?: ContentProvider
}

const monsterNames = (state: GameState): string[] =>
  Object.values(state.entities)
    .filter((e) => e.kind === 'monster')
    .map((e) => e.name.replace(/^the /, ''))
    .sort()

/**
 * Plays one level to its end under the policy, and reports on it.
 *
 * Damage is measured by watching the player's HP fall between turns rather
 * than by instrumenting combat: the engine is not touched, and a fall in HP
 * is the only thing a blow does that the player can feel.
 */
function playLevel(
  policy: Policy,
  state: GameState,
  runSeed: number,
  turnBudget: number,
): { record: DepthRecord; final: GameState } {
  const dice = makeRng('bot-combat', runSeed, state.depth)
  const choose = policy.begin(state)
  const opening = getPlayer(state)
  const hpStart = opening?.stats?.hp.cur ?? 0
  const monsters = monsterNames(state)
  const maxHit = Math.max(
    0,
    ...Object.values(state.entities)
      .filter((e) => e.kind === 'monster')
      .map((e) => (e.stats?.xp ?? 1) - 1),
  )

  let damageTaken = 0
  let hitsTaken = 0
  let current = state
  let stalled = false
  for (;;) {
    if (current.outcome) break
    if (current.moves >= turnBudget) {
      stalled = true
      break
    }
    const before = getPlayer(current)?.stats?.hp.cur ?? 0
    const next = takeTurn(current, choose(current), dice)
    // A refused move (a wall) is not a turn and does not advance `moves`, so
    // a policy that keeps choosing a wall would spin forever. Count it
    // against the budget by resting instead, which is what a stuck human does.
    current = next === current ? takeTurn(current, null, dice) : next
    const after = getPlayer(current)?.stats?.hp.cur ?? 0
    if (after < before) {
      damageTaken += before - after
      hitsTaken += 1
    }
  }

  const player = getPlayer(current)
  const record: DepthRecord = {
    depth: current.depth,
    outcome: stalled ? 'stalled' : (current.outcome ?? 'stalled'),
    turns: current.moves,
    hpStart,
    hpEnd: player?.stats?.hp.cur ?? 0,
    hpMax: player?.stats?.hp.max ?? 0,
    damageTaken,
    hitsTaken,
    armour: player ? getArmourHp(player) : 0,
    weapons: player ? getWeaponsDmg(player) : 0,
    xp: player?.stats?.xp ?? 0,
    kills: player?.kills?.length ?? 0,
    items: player?.inventory?.length ?? 0,
    monsters,
    maxHit,
  }
  return { record, final: current }
}

/**
 * Drives `policy` from depth 1 to `maxDepth`, or until it dies or stalls.
 *
 * Returns one record per level played. The last record's `outcome` says how
 * the run ended: `'cleared'` at `maxDepth` means the bot survived the whole
 * sweep, which today it does — that is the defect the harness documents.
 */
export function runDeep(policy: Policy, runSeed: number, options: DeepRunOptions = {}): DepthRecord[] {
  const maxDepth = options.maxDepth ?? DEFAULT_MAX_DEPTH
  const turnBudget = options.turnBudget ?? TURN_BUDGET
  const content = options.content ?? builtinContent

  const records: DepthRecord[] = []
  let carry: PlayerCarry | null = null
  for (let depth = 1; depth <= maxDepth; depth++) {
    // Exactly `App.tsx`'s sequence: base level, then the carry laid over it.
    const level = makeLevel({ runSeed, depth }, content, carry)
    const { record, final } = playLevel(policy, level, runSeed, turnBudget)
    records.push(record)
    if (record.outcome !== 'cleared') break
    // What `advanceRun`'s 'descend' branch does at the next break.
    carry = snapshotCarry(final)
  }
  return records
}

/** The depth the run ended on and how, for a one-line summary. */
export function runEnding(records: DepthRecord[]): { depth: number; outcome: DepthOutcome } {
  const last = records[records.length - 1]
  return last ? { depth: last.depth, outcome: last.outcome } : { depth: 0, outcome: 'stalled' }
}
