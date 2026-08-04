# Phase 3 — Core

**Outcome:** the shared vocabulary of the game — types, seeded RNG, position keys, tile and path helpers — as pure TypeScript with no React and no DOM. Ports `original/src/rogule/map.cljs` plus the RNG pieces scattered through the original.

**Status:** done.

## Operating facts

| File | Ports from |
|---|---|
| `src/game/types.ts` | (new — the original is untyped) |
| `src/game/pos.ts` | the `[x y]` vector-as-map-key idiom, used everywhere |
| `src/game/rng.ts` | `hash-seed`/`make-rng` in `map.cljs`, `combat-dice` in `engine.cljs`, `seedrandom` in `ui.cljs` |
| `src/game/grid.ts` | tile and path fns from `map.cljs` |
| `src/game/entities.ts` | entity fns from `map.cljs` |

Tests: `src/game/*.test.ts`. Run with `npm test`.

## Position keys — the main structural difference

Clojure uses `[x y]` vectors directly as map keys, relying on value equality. JavaScript `Map` uses reference identity, so `[1,2] !== [1,2]` and the idiom does not survive translation.

We use string keys, `"x,y"`:

```ts
export type PosKey = string & { readonly __brand: 'PosKey' }
export const posKey = (x: number, y: number): PosKey => `${x},${y}` as PosKey
export const parsePos = (k: PosKey): Pos => { ... }
```

The brand stops a plain string being passed where a position key is expected — worth it, because `Map<string, X>` lookups that silently miss are otherwise invisible.

`Pos` itself stays a tuple `readonly [number, number]` for arithmetic. The rule: **`Pos` for math, `PosKey` for lookup.** Every map keyed by location is `Map<PosKey, T>`.

An alternative was a flat `Uint8Array` indexed `y * width + x`. Faster, but the maps here are sparse (only dug tiles exist) and the game is turn-based at 32×32 — there is no performance problem to solve, and the sparse map matches the original's structure so the port stays readable against the reference.

## RNG

The original's approach is three overlapping mechanisms:

1. `ROT.RNG.setSeed(hashSeed(...))` before map generation.
2. `seedrandom("Rogule-" + seed, {global: true})` monkey-patching global `Math.random`, so the generator's bare `Math.random` and `rand-nth` calls become deterministic.
3. `combat-dice`, a *clone* of `ROT.RNG`, kept separate so combat rolls don't disturb the generation stream.

Mechanism 2 is the one we drop. Global patching is invisible at the call site, and with several levels per run each needing its own reproducible stream, "which global seed is installed right now" becomes a real source of bugs.

`src/game/rng.ts` exports an `Rng` interface, threaded explicitly:

```ts
export interface Rng {
  next(): number                              // [0, 1)
  int(maxExclusive: number): number
  pick<T>(items: readonly T[]): T
  pickKey<K extends string>(m: Map<PosKey, unknown>): PosKey
  weighted<T>(items: readonly T[], weight: (item: T) => number): T
  clone(): Rng
}
export function makeRng(...seedParts: (string | number)[]): Rng
export function hashSeed(...parts: (string | number)[]): number
```

`hashSeed` is the djb2a hash the original used (`djb2a` npm package). We inline it — it is nine lines — rather than take a dependency.

**The invariant:** nothing under `src/game/` calls `Math.random`. There is an ESLint rule enforcing it. Every function that needs randomness takes an `Rng` parameter. This is the single most important thing to preserve during phases 4 and 5, because a stray `Math.random` produces a level that looks fine and is silently non-reproducible — the worst kind of bug to find later.

**Seed derivation:** `runSeed` is generated once per run. Level seeds are `hashSeed(runSeed, depth)`. Combat gets its own stream from `rng.clone()` at level start, so that combat rolls and generation cannot interfere.

`ROT.RNG` is still used internally, since `ROT.Map.Digger` and `getWeightedValue` read from it. `makeRng` wraps a cloned `ROT.RNG` instance, and the generator sets `ROT.RNG`'s seed explicitly before calling into the digger — see [04-generator.md](04-generator.md) for that handoff, which is the one place the abstraction leaks.

## State updates with Immer

The engine is a set of pure `(state, ...args) => state` functions, exactly as in the original where they are `swap!`-compatible reducers. Immer keeps that shape:

```ts
// Clojure: (update-in *state [:entities id] assoc :pos new-pos :moved true)
export const moveTo = (state: GameState, id: EntityId, pos: Pos): GameState =>
  produce(state, draft => {
    const e = draft.entities[id]
    if (!e) return
    e.pos = pos
    e.moved = true
  })
```

Beyond ergonomics, Immer gives structural sharing, which two things depend on:

- **Memoized position indexing.** `entitiesByPos` is memoized on the identity of the entities object (the original does the same with `memoize`). If every update cloned the whole state, the memo would never hit.
- **React re-render granularity.** Unchanged subtrees keep identity, so `React.memo` on board cells works without hand-written comparators.

## Types worth knowing about

`src/game/types.ts` is the file to read first in any later session. The shapes that matter:

- `Entity` — a discriminated-ish record covering the player, monsters, items, and covers alike, matching the original's approach of one loose entity map for everything. Fields are mostly optional because the original's are.
- `Layer` — `'floor' | 'between' | 'occupy' | 'above'`, the render/collision layering from `component-cell`.
- `Stats` — `{ hp: [current, max], xp: number, hpInc: number }`. The `hp` pair is kept as a tuple to match the original rather than split into two fields; the share-string rendering and the health bar both iterate it as a pair.
- `GameState` — entities, map, moves, message, combatants, outcome, statistics.

`GameState` must stay JSON-round-trippable. No `Map`, `Set`, `Date`, or function values anywhere in it. Position-keyed maps inside state are plain `Record<PosKey, T>` objects; the `Map` type is used only in transient computation. This is a hard constraint from PLAN.md, and phase 7's persistence depends on it — there is a `structuredClone`-equality test in `src/game/types.test.ts` guarding it.
