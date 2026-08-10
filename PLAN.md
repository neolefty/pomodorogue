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
| Package manager | **pnpm** — `pnpm-lock.yaml` is the lockfile; there is no `package-lock.json` |
| Dev server | `pnpm dev` |
| Typecheck | `pnpm typecheck` |
| Tests | `pnpm test` |
| Lint | `pnpm lint` |
| Regenerate sprite index | `pnpm add -D twemoji-emojis && pnpm gen:sprites && pnpm remove twemoji-emojis` — see [02-sprites.md](docs/port/02-sprites.md) |
| License | **AGPL-3.0** — inherited from the original, not optional. See `NOTICE.md`. |
| Attribution | Original game by Chris McCormick. `README.md` and `NOTICE.md` carry it; phase 6 must also put a source link in the UI (AGPL §13). |

**Terminology** (used consistently across these docs and the code):

- **run** — one permadeath lifetime. Starts at depth 1, ends when the player dies. Carries HP, inventory, and XP across levels.
- **level** — one generated dungeon at a given depth. One level ≈ one pomodoro break.
- **depth** — 1-based level number within a run.
- **cycle** — one 25-minute work interval followed by one level.
- **seed** — `runSeed` is per-run; each level's seed is derived as `hashSeed(runSeed, depth)`.

`GameState` holds exactly one level. Run-scoped things — carried inventory, depth, lifetime statistics — live outside it, in the run state that phase 7 introduces.

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

The original seeds `Math.random` globally via `seedrandom(..., {global: true})` (`original/src/rogule/ui.cljs:312`), and the generator then calls bare `Math.random`/`rand-nth`. That works for one level per day but breaks the moment a run has several levels that each need independent streams.

Instead: an explicit `Rng` object threaded through generation (`src/game/rng.ts`). Nothing in `src/game/` may call `Math.random` directly — there is a lint rule for this. See [03-core.md](docs/port/03-core.md).

**Reproducibility is a tool here, not a product promise.** Rogule needed exact replays because everyone played the same daily dungeon and compared results. Pomodorogue has no such requirement — nobody is comparing runs. Seeded generation is kept for two reasons only:

1. It is the cheapest possible regression test for the generator ("same request → same level").
2. It leaves the door open to an optional seed feature. See below.

Do not add complexity in the name of determinism beyond what those two justify.

### Seeds control the world, not the story

A future "play seed 12345" feature is allowed for, not built. What such a seed would and would not fix:

- **Fixed by the seed:** the layout, item placement, and monster placement of *every* level in the run — not just the first. Level seeds derive as `hashSeed(runSeed, depth)`, so depth 7 is as determined as depth 1.
- **Not fixed by the seed:** anything the player does. Combat and monster-AI rolls come from an entropy-seeded `Rng` created at the edge and injected into the engine — not merely a *separate* stream from generation's, but deliberately not derived from the seed at all. Independence also means consuming rolls at a player-determined rate cannot shift what the generator produces.

So two players on the same seed walk the same dungeon and have different runs. That is the right split, and it is the reason the two streams are kept apart.

**The seam for history-dependent generation is a second pass, not a wider request.** Generation is specified as two stages:

1. **Base pass** — `makeBaseLevel(request, content)`, a pure function of `LevelRequest` (`{ runSeed, depth }`) and nothing else. Map geometry, base monster placement, base loot, depth difficulty scaling. This is the whole of phase 4.
2. **Overlay pass** — applied on top of a finished base level, driven by what has happened: a boss that fled downstairs, a shopkeeper you double-crossed, bones left by a previous run, AI-generated content from phase 9.

The tempting alternative — grow `LevelRequest` with history fields and let one pass read all of it — was considered and rejected. It contaminates the base: the moment history reaches `levelSeed`, two players on the same seed no longer share *any* geometry, and the generator's determinism test degrades from "two scalars in, same level out" to "same history fixture in, same level out," which is a far weaker regression net for a far higher setup cost.

Keeping the passes apart preserves a crisper answer to "what does a seed control?":

- **The seed alone fixes the base level at every depth.** Two players on seed 12345 walk the same rooms and meet the same base monsters at depth 7, whatever they each did on the way down.
- **History controls only what is layered on top**, and the overlay is where the run's story shows up.
- **Runs are not reconstructible, and that is deliberate** (decided 2026-08-09). Combat randomness being entropy-seeded means no record short of a full input-and-roll log could replay a run — and nothing wants to: there is no leaderboard, no shared run, no bug-replay pipeline reading one. The overlay stream, when it exists, is still seeded from `hashSeed(runSeed, depth, historyDigest)` — overlays are *world content*, and world content stays seed-derived; only the play itself is entropy. Genuinely external inputs (bones files from other runs, a server's AI content) are inputs, not randomness, and are not expected to reproduce.

Three invariants make the split hold. Write them into the overlay when it is built:

- **The overlay may add entities and change entity properties. It may not change map geometry.** Geometry is what makes two players' dungeons recognizably the same, and it is what the phase-4 regression test actually guards. If some feature eventually must collapse a corridor, that is a deliberate exception, not a convenience.
- **Validity assertions run after the overlay, not after the base.** An overlay boss dropped into the only corridor can make the exit unreachable. The base pass being provably fine is not the property that matters — the level the player gets is.
- **`ContentProvider` must be pure with respect to its request.** The base pass calls it, so a provider that returns different content for the same `LevelRequest` breaks base determinism from the outside. Phase 9's AI provider satisfies this by caching per `(runSeed, depth)`; see [09-server.md](docs/port/09-server.md).

Phase 4 builds the base pass only. The overlay is a named seam with no implementation — `makeLevel` is just `makeBaseLevel` until the first history feature needs it.

### Entropy is injected at the edge

`Math.random` and `Date.now` are both banned inside `src/game/` by the same lint rule. A new run's seed is therefore chosen by the caller — from user input if a seed was typed, otherwise from ambient entropy in the UI layer — and passed in as `LevelRequest.runSeed`. Same discipline as passing `now` into the pomodoro schedule.

The engine's combat/AI stream follows the same pattern with the opposite intent: the UI creates it from ambient entropy at level start (`makeRng(randomSeed)`) and passes it into `takeTurn`. It is *not* derived from `runSeed` — only generation is repeatable, per "Seeds control the world, not the story" above. Tests inject a fixed-seed `Rng` through the same parameter, which is all the determinism combat ever needs.

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
- [x] Phase 4 — Generator
- [x] Phase 5 — Engine
- [ ] Phase 6 — UI
- [ ] Phase 7 — Pomodoro
- [ ] Phase 8 — Depth
- [ ] Phase 9 — Server (deferred)
