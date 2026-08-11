# Pomodorogue — port plan

**Goal:** port [Rogule](https://github.com/chr15m/rogule.com) from ClojureScript to TypeScript/React, then turn it from a once-a-day single-level game into the *break* half of a pomodoro cycle: a five-minute break every 25 minutes, a level that freezes and resumes if it outlasts the break, descend via stairs, permadeath resets to depth 1.

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
- **level** — one generated dungeon at a given depth. A level usually fits in one break, but it may freeze at the break's end and resume in the next one.
- **depth** — 1-based level number within a run.
- **break** — the five minutes of play a cycle earns. Its clock starts on the player's first action, not when the break becomes available.
- **cycle** — one 25-minute work interval followed by one break.
- **seed** — `runSeed` is per-run; each level's seed is derived as `hashSeed(runSeed, depth)`.

`GameState` holds exactly one level. Run-scoped things — carried inventory, depth, lifetime statistics — live outside it, in the run state that phase 7 introduces.

**Tiles** are numeric codes (`TILE.room`, `TILE.wall`, …) in a flat row-major array on `GameMap.floorTiles`, addressed `y * w + x` and read through `tileAt`. **Entities** are bucketed by a `"x,y"` string key in a per-turn index. The two are deliberately independent; see §3 of [05a-simplify.md](docs/port/05a-simplify.md).

---

## Phases

Each phase is a doc in `docs/port/`. They are ordered by dependency; do them in order. Phases 1–6 are a straight port that reproduces the original game's behavior, with 5.5 a pause to shed structure the port carried over without need. Phases 7–8 are the new pomodoro design. Phase 9 is deferred.

| # | Phase | Doc | Outcome |
|---|---|---|---|
| 1 | Scaffold | [01-scaffold.md](docs/port/01-scaffold.md) | Vite/React/TS project boots, empty page |
| 2 | Sprites | [02-sprites.md](docs/port/02-sprites.md) | Typed twemoji sprite index, replaces the `load-sprite` macro |
| 3 | Core | [03-core.md](docs/port/03-core.md) | Types, RNG, map/tile/path helpers — pure, no React |
| 4 | Generator | [04-generator.md](docs/port/04-generator.md) | Deterministic level generation |
| 5 | Engine | [05-engine.md](docs/port/05-engine.md) | Movement, combat, encounters, monster AI |
| 5.5 | Simplification | [05a-simplify.md](docs/port/05a-simplify.md) | Shed ported structure that isn't earning its keep, before the UI is written against it |
| 6 | UI | [06-ui.md](docs/port/06-ui.md) | React components + CSS; **game is playable and matches the original** |
| 7 | Pomodoro | [07-pomodoro.md](docs/port/07-pomodoro.md) | 25-minute gate, 5-minute level cap, persistence across reloads |
| 7.5 | Break payoff | [07a-break-payoff.md](docs/port/07a-break-payoff.md) | Finishing early keeps the rest of the break, and a bell ends it |
| 8 | Depth | [08-depth.md](docs/port/08-depth.md) | Stairs instead of shrine, multi-level runs, difficulty ramp |
| 9 | Server (deferred) | [09-server.md](docs/port/09-server.md) | Optional backend for AI-generated content. Not built yet — only the seam is. |

**Milestone to aim for:** end of phase 6 is a faithful playable clone. Everything before that is a port with no design changes; everything after is new design. Do not mix the two — a bug found after phase 7 should be answerable with "did this work at phase 6?"

Phase 5.5 does not break that rule: it changes internal structure only, and its success condition is that no player-visible behavior changes at all. It sits before phase 6 rather than after because phase 6 is what multiplies the call sites — see "Why now" in [05a-simplify.md](docs/port/05a-simplify.md).

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

**Refined in phase 5.5, without weakening the rule.** Phase 5 implemented this as three per-entity behavior names (`fns.encounter`, `fns.update`, `fns.passable`) resolved through three registries. Those names turned out to be fully determined by what the entity *is* — every monster carries the same three — so 5.5 collapses them to a single `kind` discriminant resolved by an exhaustive `switch`. State is still JSON-serializable, behavior is still named by a string, and a bad name is still a compile error. What goes away is writing the name three times and a genuine import cycle that only the registry created. See §1 of [05a-simplify.md](docs/port/05a-simplify.md).

### Immer for state updates

The engine is written as pure `state -> state` reducers. Immer preserves that style nearly line-for-line from the Clojure, and it earns its keep on the nested writes — `draft.entities[id].stats.hp[0]`, `inventory.push(...)` — which are four levels deep and unpleasant to hand-spread. See [03-core.md](docs/port/03-core.md).

**Refined in phase 5.5, in two ways.** First, the boundary moves: phase 5 wrapped nearly every micro-edit in its own `produce`, which forced the `[blocks, state]` tuple returns and a mixed pure/draft style; 5.5 reduces the engine to exactly one `produce`, at `takeTurn`, with everything beneath it mutating the draft. The reducer shape survives where it is real — the `takeTurn` seam the UI holds — and stops being paid for per line. Second, the justification gets corrected: this decision originally credited Immer with keeping the memoized entity-position index alive via structural sharing. That reasoning is wrong — every turn moves the player, so `entities` changes and the index rebuilds every turn regardless. Immer and the memo are two independent wins, not one supporting the other. See §6 of [05a-simplify.md](docs/port/05a-simplify.md), which also fixes the same claim in the code comment at `entities.ts:33`.

### `src/game/` has no DOM or React dependency

Everything under `src/game/` must run in bare Node. This keeps generation testable, and it is what makes phase 9's server-side content generation possible without a rewrite. React lives only in `src/ui/`.

### Content comes from a provider, not a hardcoded table

Monster and item tables are reached through a `ContentProvider` interface even though phase 4 only implements the static built-in one. This is the seam that later lets AI-generated monsters and sprites arrive from a server. Placing it now costs nothing; retrofitting it later means touching every generator function.

---

## Open questions

Answer these when the phase that needs them comes up. Don't block earlier phases on them.

1. ~~**What happens when the 5-minute level timer expires mid-level?**~~ **Answered 2026-08-10: the level freezes and resumes next break.** None of the three options on the table — (a) it kills the run, (b) the level is abandoned and the depth regenerated, (c) no enforcement — were taken. The level persists exactly as it stands, the 25-minute work interval starts, and the next break resumes the same `GameState`: same monsters, same positions, same HP. Nothing is lost for a reason outside the game, and the walk-away exploit that (b) carried disappears, because walking away returns you to the same fight. A level is therefore no longer required to fit in one break. Paired with this: **the break clock starts on the player's first action**, not when the break becomes available, so working past the bell costs you nothing. See "The break clock" in [07-pomodoro.md](docs/port/07-pomodoro.md).
2. ~~**Can you bank breaks?**~~ **Answered 2026-08-10: no — breaks do not stack.** Skip three cycles and you get one break. But it is expressed as `maxBankedBreaks: 1` in a `PomodoroConfig` rather than as a hardcoded boolean, alongside `workMs` and `breakMs`. Tests need the durations injectable regardless, and a later feature — an account perk, a custom break length — should be a value change rather than a redesign. The config is not exposed in the UI. Raising the cap above 1 needs one further decision, deliberately deferred; see "The gate" in [07-pomodoro.md](docs/port/07-pomodoro.md).
3. **How does difficulty scale with depth?** The original scales within a level by path distance from the player's start (`pos-to-difficulty`). Depth needs to shift the monster table index too. Needed by phase 8.
4. **Does the run end at some depth, or go forever?** Needed by phase 8.
5. ~~**Do tile maps stay `PosMap` (`"x,y"`-keyed objects), or become flat arrays?**~~ **Answered 2026-08-10: flat arrays.** `GameMap.floorTiles` is a `Tile[]` of numeric codes indexed `y * w + x`; the branded `PosKey` and its helpers are gone, and the entity index keeps string keys. With §2 in the same pass this took a serialized `GameState` from 19,828 to 11,827 bytes. See the decision note at §3 of [05a-simplify.md](docs/port/05a-simplify.md), which also records the two things that turned out differently from the sketch.
6. **What does finishing a level early earn, and does it carry?** Raised by Bill on 2026-08-10 after playing phase 7, which gave a fast player nothing for it but a longer wait. **Half-answered 2026-08-11: the longer wait is gone, and no bonus is built.** Phase 7.5 fixed the wait — the work interval now starts when the break was always going to end — and Bill's call was to stop there: *getting to play at all is the bonus for having done the work*, so a second reward inside the break has to earn its place before it is built. The candidates, if it comes back, are a `PlayerCarry` bonus versus a mark on the share string; they pull in opposite directions on balance, so decide alongside phase 8's difficulty ramp. Not blocking anything. See [07a-break-payoff.md](docs/port/07a-break-payoff.md).
7. **What announces a transition, and how much of it does the player choose?** Raised by Bill on 2026-08-11, after phase 7.5 shipped an unconditional synthesized bell at break → work. Two halves are settled going in: **the end of the break should announce itself**, because that is what lets the player be away from the screen, and it is the only transition that needs a sound; and **the start of a break should not fire a fixed alarm**, because being summoned to play is an interruption rather than a service. Open is everything else — whether the announcement is a tone, a Web Notification, or either at the player's choice; what "pleasant" turns out to mean when heard sixteen times a day; and where settings live, given the game has no settings UI at all. Expect to experiment rather than to decide on paper. Two constraints for whoever picks it up: a Notification reaches a player who has switched applications, where audio from a backgrounded tab can be throttled or suspended outright; and there is currently no way to mute a sound the game plays unprompted, which is the minimum any answer has to fix. Not blocking anything. See "The bell" in [07a-break-payoff.md](docs/port/07a-break-payoff.md) for what is built today.

---

## To do

Decided work that no phase owns. Newest first. Anything here is small and unblocked — if it needs a decision first, it belongs in Open questions instead.

- **Give the rest-of-break timer a colour of its own.** `.timer.rest` and `.timer.break.warn` are both `#cc7722` in `src/ui/styles.css`, meaning opposite things: on the break timer it is urgency — "the break is ending, find a stopping point" — and on the tombstone it is leisure — "this time is still yours". A player learns the colour in one context and then meets it in the other, and the second reading undoes the first. Pick a second warm tone, or repaint the *warn* case, since that is the one carrying urgency and the one that should stand alone. Raised in review 2026-08-11.

---

## Status board

Update this as phases land.

- [x] Phase 1 — Scaffold
- [x] Phase 2 — Sprites
- [x] Phase 3 — Core
- [x] Phase 4 — Generator
- [x] Phase 5 — Engine
- [x] Phase 5.5 — Simplification
- [x] Phase 6 — UI — **the port is done; the game plays like the original**
- [x] Phase 7 — Pomodoro — **the game is a pomodoro timer; a run survives a reload**
- [x] Phase 7.5 — Break payoff — **finishing early keeps the rest of the break, and a bell ends it**
- [ ] Phase 8 — Depth ← **next**
- [ ] Phase 9 — Server (deferred)
