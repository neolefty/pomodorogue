# Review notes — port through phase 3

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
- Phase 6: keep the tile-type→sprite mapping (floor/wall/door) in one visible
  place, not buried in cell JSX — level themes will eventually want tile
  sprites to come from level data.

## 7. Hold the line on the phase-4 determinism test

"Same `LevelRequest` → deep-equal `GameState`" is listed write-first in
`04-generator.md`. Keep it write-first: it is the one test that catches a stray
ambient dependency anywhere in the generator, and it only works because entity
ids come from the counter rather than random UUIDs.
