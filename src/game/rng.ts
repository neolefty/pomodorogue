/**
 * Seeded randomness.
 *
 * The original patched global `Math.random` via seedrandom and then called it
 * implicitly from all over the generator. That works for one level a day but
 * not for a run of many levels, each needing its own reproducible stream, so
 * here the generator is an explicit parameter instead. Nothing under
 * `src/game/` may call `Math.random` — there is an ESLint rule enforcing it.
 *
 * See docs/port/03-core.md.
 */
import { RNG as RotRng } from 'rot-js'
import type { PosKey, PosMap } from './pos.ts'
import { posKeys } from './pos.ts'
import type { LevelRequest } from './types.ts'

export interface Rng {
  /** Uniform in [0, 1). */
  next(): number
  /** Uniform integer in [0, maxExclusive). Returns 0 when the range is empty. */
  int(maxExclusive: number): number
  /** Uniform integer in [lo, hi], inclusive both ends. */
  range(lo: number, hi: number): number
  /** Uniform choice. Throws on an empty array — an empty pick is always a bug. */
  pick<T>(items: readonly T[]): T
  /** Uniform choice among the keys of a position map. */
  pickPos<T>(m: PosMap<T>): PosKey
  /** Choice weighted by `weight(item)`. Items with weight <= 0 are never picked. */
  weighted<T>(items: readonly T[], weight: (item: T) => number): T
  /** An independent stream at the current state, so consuming one can't disturb the other. */
  clone(): Rng
}

/**
 * djb2a (xor variant) — the hash the original used for seed derivation, via the
 * `djb2a` npm package. Inlined rather than taking a dependency for nine lines.
 */
export function djb2a(str: string): number {
  let hash = 5381
  for (let i = 0; i < str.length; i++) {
    hash = ((hash * 33) ^ str.charCodeAt(i)) >>> 0
  }
  return hash
}

/** Derives a numeric seed from any set of parts, e.g. `hashSeed(runSeed, depth)`. */
export const hashSeed = (...parts: (string | number)[]): number => djb2a(parts.join('-'))

/**
 * The seed for one level. Derived from the run seed and depth, so a run seed
 * fixes the layout of *every* level in the run, not only the first.
 *
 * **Run history must never be folded in here.** History-dependent content is a
 * separate overlay pass with its own stream; the base level stays a function of
 * the run seed and depth alone, so two players on one seed share a dungeon.
 * See "Seeds control the world, not the story" in PLAN.md.
 */
export const levelSeed = (request: LevelRequest): number =>
  hashSeed(request.runSeed, request.depth)

/**
 * The combat stream for a level, independent of the generation stream.
 *
 * Separate so that consuming combat rolls — which happens at a rate set by how
 * the player plays — cannot shift what the generator produces. Without this, a
 * run seed would stop meaning anything the moment the player threw a punch.
 */
export const combatRng = (request: LevelRequest): Rng =>
  makeRng('combat', request.runSeed, request.depth)

function wrap(rot: ReturnType<typeof RotRng.clone>): Rng {
  return {
    next: () => rot.getUniform(),
    int: (maxExclusive) =>
      maxExclusive <= 0 ? 0 : Math.floor(rot.getUniform() * maxExclusive),
    range: (lo, hi) => rot.getUniformInt(lo, hi),
    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('rng.pick: empty array')
      return items[Math.floor(rot.getUniform() * items.length)]!
    },
    pickPos<T>(m: PosMap<T>): PosKey {
      const keys = posKeys(m)
      if (keys.length === 0) throw new Error('rng.pickPos: empty map')
      return keys[Math.floor(rot.getUniform() * keys.length)]!
    },
    weighted<T>(items: readonly T[], weight: (item: T) => number): T {
      if (items.length === 0) throw new Error('rng.weighted: empty array')
      const weights = items.map((i) => Math.max(0, weight(i)))
      const total = weights.reduce((a, b) => a + b, 0)
      if (total <= 0) throw new Error('rng.weighted: all weights are zero')
      let roll = rot.getUniform() * total
      for (let i = 0; i < items.length; i++) {
        roll -= weights[i]!
        if (roll < 0) return items[i]!
      }
      return items[items.length - 1]!
    },
    clone: () => wrap(rot.clone()),
  }
}

/** A generator seeded from the given parts. Same parts always give the same stream. */
export function makeRng(...seedParts: (string | number)[]): Rng {
  return wrap(RotRng.clone().setSeed(hashSeed(...seedParts)))
}

/**
 * Seeds the *global* rot-js generator.
 *
 * Only for `ROT.Map.Digger`, which reads from the global instance and offers no
 * way to inject one. Confined to the map generator; see docs/port/04-generator.md.
 * Everything else takes an `Rng`.
 */
export function seedGlobalRotRng(...seedParts: (string | number)[]): void {
  RotRng.setSeed(hashSeed(...seedParts))
}
