# Pomodorogue — port plan

**Goal:** port [Rogule](https://github.com/chr15m/rogule.com) from ClojureScript to TypeScript/React, then turn it from a once-a-day single-level game into the *break* half of a pomodoro cycle: play one dungeon level every 25 minutes, ~5 minutes of gameplay, descend via stairs, permadeath resets to level 1.

**Status:** port in progress. See the status board at the bottom.

These are working documents for the port, not long-term reference. Delete `docs/port/` when the port is done.

---

## Operating facts

| | |
|---|---|
| Working repo | `~/source/rogule/pomodorogue` |
| Reference source (ClojureScript) | `~/source/rogule/original` — read-only, never edit |
| Stack | Vite + React 19 + TypeScript, Vitest for tests |
| Dev server | `npm run dev` |
| Typecheck | `npm run typecheck` |
| Tests | `npm test` |
| Regenerate sprite index | `npm run gen:sprites` |
| License | **AGPL-3.0** — inherited from the original, not optional |
| Attribution | Original game by Chris McCormick. Keep the credit in `README.md` and `LICENSE`. |

**Terminology** (used consistently across these docs and the code):

- **run** — one permadeath lifetime. Starts at depth 1, ends when the player dies. Carries HP, inventory, and XP across levels.
- **level** — one generated dungeon at a given depth. One level ≈ one pomodoro break.
- **depth** — 1-based level number within a run.
- **cycle** — one 25-minute work interval followed by one level.
- **seed** — `runSeed` is per-run; each level's seed is derived as `hashSeed(runSeed, depth)`.

---

## Phases

Each phase is a doc in `docs/port/`. They are ordered by dependency; do them in order. Phases 1–5 are a straight port that reproduces the original game's behavior. Phases 6–7 are the new pomodoro design. Phase 8 is deferred.

| # | Phase | Doc | Outcome |
|---|---|---|---|
| 1 | Scaffold | [01-scaffold.md](docs/port/01-scaffold.md) | Vite/React/TS project boots, empty page |
| 2 | Sprites | [02-sprites.md](docs/port/02-sprites.md) | Typed twemoji sprite index, replaces the `load-sprite` macro |
| 3 | Core | [03-core.md](docs/port/03-core.md) | Types, RNG, map/tile/path helpers — pure, no React |
| 4 | Generator | [04-generator.md](docs/port/04-generator.md) | Deterministic level generation |
| 5 | Engine | [05-engine.md](docs/port/05-engine.md) | Movement, combat, encounters, monster AI |
| 6 | UI | [06-ui.md](docs/port/06-ui.md) | React components + CSS; **game is playable and matches the original** |
| 7 | Pomodoro | [07-pomodoro.md](docs/port/07-pomodoro.md) | 25-minute gate, 5-minute level cap, persistence across reloads |
| 8 | Depth | [08-depth.md](docs/port/08-depth.md) | Stairs instead of shrine, multi-level runs, difficulty ramp |
| 9 | Server (deferred) | [09-server.md](docs/port/09-server.md) | Optional backend for AI-generated content. Not built yet — only the seam is. |

**Milestone to aim for:** end of phase 6 is a faithful playable clone. Everything before that is a port with no design changes; everything after is new design. Do not mix the two — a bug found after phase 7 should be answerable with "did this work at phase 6?"

---

## Design decisions

These were settled before the port started. Change them deliberately, not incidentally.

### Explicit RNG, no global `Math.random` patching

The original seeds `Math.random` globally via `seedrandom(..., {global: true})` (`original/src/rogule/ui.cljs:312`), and the generator then calls bare `Math.random`/`rand-nth`. That works for one level per day but breaks the moment a run has several levels that each need independent, reproducible streams.

Instead: an explicit `Rng` object threaded through generation (`src/game/rng.ts`). Nothing in `src/game/` may call `Math.random` directly — there is a lint rule for this. See [03-core.md](docs/port/03-core.md).

### Game state stays JSON-serializable

The original stores function references as keywords and looks them up in a registry (`lookup-fn`, `original/src/rogule/engine.cljs:414-422`) purely so state can be persisted. **Keep this.** It matters more here than in the original: pomodoro state has to survive a browser reload across a 25-minute gap, and a run has to survive across hours.

In TypeScript this gets *better* than the original — the function names become a string-literal union, so a typo is a compile error rather than a silent no-op. See [05-engine.md](docs/port/05-engine.md).

### Immer for state updates

The engine is written as pure `state -> state` reducers. Immer preserves that style nearly line-for-line from the Clojure and keeps structural sharing, which matters because entity-position indexing is memoized on object identity. See [03-core.md](docs/port/03-core.md).

### `src/game/` has no DOM or React dependency

Everything under `src/game/` must run in bare Node. This keeps generation testable, and it is what makes phase 9's server-side content generation possible without a rewrite. React lives only in `src/ui/`.

### Content comes from a provider, not a hardcoded table

Monster and item tables are reached through a `ContentProvider` interface even though phase 4 only implements the static built-in one. This is the seam that later lets AI-generated monsters and sprites arrive from a server. Placing it now costs nothing; retrofitting it later means touching every generator function.

---

## Open questions

Answer these when the phase that needs them comes up. Don't block earlier phases on them.

1. **What happens when the 5-minute level timer expires mid-level?** Options: (a) hard stop, counts as a death and ends the run; (b) hard stop, level abandoned, run survives, retry the same depth next cycle; (c) soft — just a visual warning, no enforcement. Current default in the plan is **(b)**, as (a) makes an interruption at work destroy an hour of progress. Needed by phase 7.
2. **Can you bank breaks?** If you skip two cycles, do you get two levels? Default: **no**, the gate is simply "is now past `nextPlayableAt`". Needed by phase 7.
3. **How does difficulty scale with depth?** The original scales within a level by path distance from the player's start (`pos-to-difficulty`). Depth needs to shift the monster table index too. Needed by phase 8.
4. **Does the run end at some depth, or go forever?** Needed by phase 8.

---

## Status board

Update this as phases land.

- [x] Phase 1 — Scaffold
- [x] Phase 2 — Sprites
- [x] Phase 3 — Core
- [ ] Phase 4 — Generator
- [ ] Phase 5 — Engine
- [ ] Phase 6 — UI
- [ ] Phase 7 — Pomodoro
- [ ] Phase 8 — Depth
- [ ] Phase 9 — Server (deferred)
