# Review notes — port through phase 3

> **Second pass (2026-08-09, after phase 4):** the phase 5–8 docs were
> re-checked against `src/game/` as built. Corrections were folded directly
> into `05`–`08`; the decisions are recorded at the bottom of this file under
> "Second pass". The first-pass notes below are unchanged and fully disposed.

Findings from a review of phases 1–3 against `~/source/rogule/original`
(2026-08-04). **Verdict: the foundation is sound and no fidelity errors were
found** — `rng`/`pos`/`grid`/`entities`/`sprites` were checked line-by-line
against `map.cljs`, `generator.cljs`, and `engine.cljs`. The items below are
amendments for the *upcoming* phases, not rework of the finished ones. Each
section names the phase it lands in; fold items 1 and 4 into their phase docs
before starting phase 4/5.

## Disposition (2026-08-09)

The prep pass is done — items 1–5 are folded into the docs and code, tree still
green at 34 tests. **Items 6 and 7 remain open by design.** Nothing here needs
re-reading before phase 4 except item 7.

**Update (phase 4 landed):** item 7 is discharged — the determinism test was
written first and is bound to `makeBaseLevel`. Only item 6 (post-port renames,
after phase 6) is still open. Phase 4 turned up three deliberate divergences from
the original; they are documented in [04-generator.md](04-generator.md) under
"Divergences", and the monster sub-table one is a genuine bug in the original
worth knowing about before reading `generator.cljs` side by side.

| # | Status |
|---|---|
| 1. `ContentProvider` takes `LevelRequest` | ✅ folded into `04-generator.md` |
| 2. Slim snapshots | ✅ **done in code** — landed early, see below |
| 3. Combat stream on reload | ✅ decided: rewind accepted, written into `07-pomodoro.md` |
| 4. Drop follows its monster | ✅ folded into `05-engine.md` + its test list |
| 5. Doc drift | ✅ all four fixed |
| 6. Post-port renames | ⏸ open, deferred to after phase 6 as intended |
| 7. Hold the phase-4 determinism test | ✅ held — written first, bound to `makeBaseLevel` |

Two corrections to the notes below, found while applying them:

- Item 2 lists `kills`/`killedBy` as `GameState` fields; they are actually on
  `Entity` (the player's own). Only `combatants` is on `GameState`. The concern
  was right and slightly understated — the player entity is exactly what phase 8
  carries across levels.
- Item 2 was applied **now rather than in phase 5**. Nothing writes these fields
  yet, so it was a free type change; deferring it would have meant writing
  combat against types we already knew were wrong.

Item 3's decision was pulled forward for the opposite reason: its escape hatch
is a *phase 5* code change, so it had to be settled before combat gets written.

## Operating facts

| | |
|---|---|
| Scope reviewed | phases 1–3 (`src/game/*`), all phase docs, PLAN.md |
| Reference | `~/source/rogule/original` — read-only |
| State at review | 34 tests, typecheck, lint all green |
| Highest-value items | #1 (ContentProvider signature, phase 4), #2 (snapshot fields, phase 5), #4 (drop-follows-monster, phase 5) |
| No action needed | explicit-Rng design, LevelRequest seam, registry design, run/level state split, deterministic entity ids — all confirmed good |

## 1. `ContentProvider` methods should take `LevelRequest` — phase 4

`04-generator.md` specs `monsters(): readonly MonsterTemplate[]` — no inputs.
But level themes (per-depth monster/item/cover mixes), phase 8's depth-shifted
monster table, and phase 9's per-`(runSeed, depth)` AI content all flow through
exactly this interface. Change the methods to take the request:

```ts
export interface ContentProvider {
  monsters(request: LevelRequest): readonly MonsterTemplate[]
  forageItems(request: LevelRequest): readonly ItemTemplate[]
  itemCovers(request: LevelRequest): readonly CoverTemplate[]
}
```

`builtinContent` ignores the argument, so this costs nothing now. Deferring it
means retrofitting the signature in phase 8 and touching every placement call
site — the exact retrofit the interface exists to avoid.

## 2. Don't persist full-entity snapshots — phase 5

`GameState` inherits the original's habit of storing entity *copies*:
`combatants: Record<EntityId, Entity>`, `kills: Entity[]`,
`killedBy: Entity | null`. Harmless in the original (one level, discarded
daily); a problem here because phase 7 JSON-persists state and phase 8
accumulates `kills` across a run — whole entities including their `drop`/
`inventory` subtrees. Also a staleness trap: combatant HP bars are only
correct because combat re-copies each round (two sources of truth for HP).

Fix when these fields first get written in phase 5:

- `combatants` → `Record<EntityId, true>`, resolved against `state.entities` at
  render. Keyed rather than an array so the same id cannot be recorded twice in
  one turn.
- `kills` and `killedBy` → a slim summary type (`EntitySummary`, a
  `Pick<Entity, 'name' | 'sprite'>`) — all the tombstone renders anyway.

Update `types.ts` and its serializability test accordingly.

## 3. Decide combat-stream behavior on reload — phase 7 (decision, then doc it)

The combat `Rng`'s stream position is mutable state that cannot live inside
`GameState` (state must round-trip JSON). So rehydrating a mid-level game
restarts `combatRng(request)` from the beginning of its stream: reloading
mid-fight rewinds your luck, and the "run reconstructible from seed + inputs"
future option in PLAN.md silently breaks. Probably acceptable — reproducibility
is a tool here, not a promise — but decide deliberately and write the decision
into `07-pomodoro.md`. Cheapest fix if wanted: keep a `combatRolls` counter in
`GameState` and fast-forward the stream on rehydrate.

## 4. Port trap: drops follow their monster — phase 5

In the original's `move-to`, a successful move also updates the mover's
`drop.pos` to the new position (`engine.cljs:88`). Miss that line and a killed
monster drops its loot at its *spawn* point — subtle enough that playtesting
won't reliably catch it. Add to `05-engine.md`'s test list alongside the
five-things-on-death check.

## 5. Doc drift — cleanup pass over `docs/port/`

These docs are the spec future sessions execute from, so drift is costlier
than usual:

- `08-depth.md` says "instead of setting `outcome: 'ascended'`" — `types.ts`
  already renamed it `'descended'`.
- `03-core.md` describes a "structuredClone-equality test"; the actual test is
  JSON round-trip (`types.test.ts`).
- `03-core.md`'s `Rng` sketch has `pickKey`; the implementation is `pickPos`.
- `allocId` (`src/game/entities.ts`) mutates its argument: fine inside an Immer
  draft or during generation, but it throws on frozen post-`produce` state.
  Add a doc comment saying it is draft/builder-only.

## 6. Post-port renames — after phase 6, when `docs/port/` is deleted

- `floorTiles` contains walls (naming inherited from the original; walls are
  looked up in it and rejected by the allowed-set check). Right call to keep
  during the port for side-by-side reading; rename to `tiles`/`tileMap` after.
  Still true after phase 5.5 §3 made it a flat `Tile[]` — the representation
  changed, the misleading name did not, and renaming it mid-port would still
  break side-by-side reading against the original.
- No `TILE` code → name table. Phase 5.5 §3 declined to add one on YAGNI
  grounds: `TILE.wall` reads fine at a call site, and nothing yet needs to print
  a tile. If phase 6's tile→class mapping or a debug overlay wants one, that is
  the moment to add it, not before.
- Phase 6: keep the tile-type→sprite mapping (floor/wall/door) in one visible
  place, not buried in cell JSX — level themes will eventually want tile
  sprites to come from level data.

## 7. Hold the line on the phase-4 determinism test

"Same `LevelRequest` → deep-equal `GameState`" is listed write-first in
`04-generator.md`. Keep it write-first: it is the one test that catches a stray
ambient dependency anywhere in the generator, and it only works because entity
ids come from the counter rather than random UUIDs.

---

# Second pass — phases 5–8 docs vs. the landed code (2026-08-09)

After phase 4, the upcoming-phase docs were re-checked against `src/game/` as
built. All corrections are folded directly into `05`–`08`; this section records
only the decisions, so future sessions know they were deliberate. Tree green at
56 tests before and after the pass.

1. **`takeTurn` takes the combat `Rng` as a parameter** —
   `takeTurn(state, dir, rng)`. `GameState` holds only the derived level seed,
   `runSeed` is not in it, and `hashSeed` is not invertible, so the engine
   cannot construct the stream itself; the caller owns it. `EncounterFn` and
   `UpdateFn` gain the same final parameter. (05)
2. **Combat randomness is entropy-seeded; `combatRng` is deleted.** The
   engine's `Rng` is created from fresh entropy at the edge and injected —
   nothing about it persists, so the whole rewind-vs-draw-counter question
   dissolves. (This moved twice in one day: rewind-accepted → persist a draw
   count → unseeded. The final step came from asking what seed-derived combat
   buys: deterministic tests come from injection, the seed feature is
   world-only, and "reconstructible from seed + inputs" had no consumer —
   PLAN.md's no-determinism-complexity razor cuts it. Injection, decision 1,
   is what makes this a caller-side choice, freely reversible later.)
   (PLAN.md, 03, 04, 05, 07, `rng.ts`)
3. **`message`, `eventModal`, and `Entity.modalSprites` are dropped** — both
   features are commented-out dead code in the original (`ui.cljs:165`,
   `engine.cljs:209,224`), and `state.log` records the same events. Applied in
   code during this pass (nothing wrote the fields yet — same free-type-change
   rationale as first-pass item 2). (05, 06, `types.ts`, `content/`,
   `generator/`)
4. **Phase 8's carry is a post-pass** — `applyCarry` over a finished
   `makeBaseLevel` output via the existing `makeLevel` seam, never a
   `placePlayer` parameter. Carry is run history, and history must not reach
   the base pass; the earlier draft of 08 would have broken the plan's own
   invariant. (08)
5. **Statistics updates move out of the engine** — `Statistics` is run-scoped,
   so `finishLevel`/death set `outcome` only and the run layer (phase 7) reacts
   to it; phase 6's share string takes statistics as an argument, with a
   transient in-memory record until phase 7 persists one. (05, 06)
6. **Drift fixed throughout**: registry unions are consumed *from* `types.ts`,
   not derived via `keyof typeof` (that sketch now creates an import cycle);
   `gameLog` → `state.log`, per-level by construction; animation tuple →
   `Animation` object; `PlayerCarry.inventory` is `Entity[]` (there is no
   `Item` type); `maxDepth` already exists on `Statistics`; Clojure names →
   ported names (`placeShrine`, `placePlayer`); plus fidelity notes folded into
   05 (kill-summary before skull swap, combatant recording rules, `moved`
   semantics, `delete` not `undefined`, corpse `drop` cleared as a deliberate
   divergence, Immer-draft rules for `entitiesByPos`).

---

# Third pass — review of the phase 5.5 diff (2026-08-10)

A review of the uncommitted 5.5 work turned up ten items. Three were fixed on
the spot, in the same commit as this note; the rest are triaged below so the
next session does not re-find them. Tree green at 103 tests.

## Fixed now

1. **Entities spawned in doorways.** `makeDiggerMap` builds `corridorTiles` as
   "everything dug that is not inside a room", which *includes every door* —
   so the spawn set was wrong despite a comment promising the opposite. 13 of
   the first 40 seeds put an entity on a door. This mattered for play, not just
   tidiness: an entity on the `occupy` layer in a room's only exit reads as
   blocked to `makeMonsterPassable`, so a monster parked there strands
   everything behind it for the level, silently flattening the difficulty
   curve. `DiggerMap` now returns `doorTiles` and `makeBaseLevel` subtracts it.
   Pinned by a 40-seed sweep in `generator.test.ts`.
2. **A free action cleared the health bars.** `resetCombatList` ran before
   `moveTo`, so bumping a wall — explicitly a non-turn — wiped the bars the
   player reads to decide fight-or-flee. The clear still has to happen up front
   (step 2 records *this* turn's fighters), so the previous list is restored
   when `moved` comes back false.
3. **`current()` on entities added mid-`produce`.** `detach` threw
   `[Immer] 'current' expects a draft` for any entity assigned into the draft
   during the same `produce`, because Immer only drafts what it read from the
   base. Latent — nothing gives the player two actions in one turn today — but
   the guard was accidental rather than stated. `detach` moved to `state.ts`
   with an `isDraft` guard; `combat.ts`'s two `summarize(current(…))` calls
   dropped the snapshot entirely (`summarize` copies two scalars on the spot),
   and its `current(me.drop)` now routes through `detach`.

## Open, with a home

4. **Monster pathfinding runs before the activation gate.** Specced as "Step 0"
   in [06-ui.md](06-ui.md) — it becomes visible when phase 6 puts `takeTurn`
   inside a keypress handler. Read that section before touching it: the obvious
   early-out is *not* a drop-in, because `findPath` returns `[]` for an
   unreachable monster and `0 < activation` passes the gate (~17% of
   monster-turns measured).
5. **`updateMonsters` keeps running after the player dies.** No `draft.outcome`
   check in the loop, so monsters later in the list still take their turn, and
   `moveTo`'s corpse guard lets them step onto the body. Only affects the
   frozen death frame — which is exactly what phase 6 renders, phase 7 persists
   and phase 8 screenshots, so fix it before the tombstone work.
6. **The shrine-reaching move is not counted.** `takeTurn` returns on
   `draft.outcome` before `draft.moves += 1`, so a cleared level reports one
   fewer move than a death does. Invisible until phase 8 builds the share
   string; fix it there, and check the two outcomes agree.
7. **Collision markers and smoke are never removed engine-side.** Removal lives
   only in phase 6's `animationend` handler, so a headless driver accumulates
   them (6 in 32 turns, measured) and every one is re-scanned by `moveTo` and
   `makeMonsterPassable` on each move. Fine in a foreground tab; a real leak for
   phase 9's server sim. Decide there whether the engine should expire them by
   age instead.

## Open, cosmetic

8. `engine/index.ts` re-exports `moveTo` / `updateMonsters`, which 5.5 §6 turned
   into draft mutators no caller can use — already scheduled as phase 6's first
   task.
9. `combat.ts` imports `makeCollisionMarker` from `generator/entities.ts`,
   coupling play-time code to generation. A leaf `src/game/effects.ts` holding
   it and `makeSmokeJuice` untangles it; worth doing before phase 9 splits the
   two.
10. The `(x, y) => canPassTile(map, [x, y])` closure is written out in seven
    places and allocates a throwaway tuple per A* probe. A `tilePassable(map)`
    helper in `grid.ts` removes both.
