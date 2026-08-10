# Phase 8 — Depth

**Outcome:** runs span multiple levels. The shrine becomes stairs, HP/inventory/XP carry between levels, difficulty ramps with depth, and death resets to depth 1.

**Status:** not started. Requires phases 6 and 7.

## The change in one line

`finishLevel` becomes `descend`: instead of setting `outcome: 'descended'` and ending, it increments `run.depth`, snapshots the player's carry state, and clears the current level so the next cycle generates a deeper one.

## Stairs replace the shrine

`placeShrine` (`src/game/generator/entities.ts`, ports `make-shrine`) places the shrine at the center of the furthest room by path length — which is already exactly where a down-staircase belongs. Keep the placement logic verbatim, change the sprite (`shinto-shrine` → `down-arrow` or similar; add it to `SPRITE_NAMES` and re-run `pnpm gen:sprites`) and change the behavior. Post-5.5 there is no encounter fn to swap: entity behavior is `entity.kind` resolved by exhaustive `switch`es, so rename the `'shrine'` member of `EntityKind` to `'stairs'` (or add `'stairs'` alongside, if the shrine survives as the "bank your run" option — open question below) and point its case at `descend`. The exhaustiveness check works *for* this phase — the compiler lists every dispatch site the new kind must handle. It is module-private, called from `makeEntities`; it stays private — nothing in this phase needs to widen the generator's surface.

The compiler cannot see the levels already sitting in localStorage, though: one saved before this rename carries `kind: 'shrine'`, which the new `switch` throws on. **Bump the persisted `schemaVersion`** in the same change — see "Version the save; never migrate it" in [07-pomodoro.md](07-pomodoro.md) — so those levels are discarded on load instead of crashing a turn.

## What carries between levels

```ts
type PlayerCarry = {
  stats: Stats            // hp { cur, max }, xp, and the regen counter all persist
  inventory: Entity[]     // there is no separate Item type — inventory entries are entities
}
```

**Carry is applied as a post-pass, never inside the base generator.** Carry is run history, and history is exactly what `LevelRequest` forbids (`types.ts` says so in as many words; see "Seeds control the world, not the story" in PLAN.md). Do not thread it into `placePlayer` — an earlier draft of this doc said to, and that would quietly break "two players on one seed share a dungeon" plus the generator's two-scalars-in determinism test. The seam already exists: `makeLevel` is currently just `makeBaseLevel`; this phase makes it

```ts
makeLevel(request, content, carry?) =
  carry ? applyCarry(makeBaseLevel(request, content), carry)
        : makeBaseLevel(request, content)
```

where `applyCarry` overwrites the freshly-placed player's `stats` and `inventory` and touches nothing else — position comes from the new level, no geometry changes, no RNG. `placePlayer` keeps building the fresh `hp: { cur: 10, max: 10 }`, `xp: 3` player unconditionally. (This is a miniature of the overlay pass PLAN.md describes; if a real overlay lands later, carry becomes its first tenant.)

Carried inventory entities keep a stale `pos` from the level where they were picked up. Nothing reads inventory positions — same as the original — so leave them alone rather than inventing a scrub step.

**Do not restore HP on descent.** Arriving at depth 4 with 3 HP and having to decide whether to fight or run is where the tension lives. The slow regeneration already in the engine (1 HP per 100 moves) is the recovery mechanism, and it means a cautious player can heal by exploring — which is a good use of a five-minute break.

## Difficulty ramp

Two knobs live in different places, deliberately — don't merge them:

- **What the tables contain** flows through `ContentProvider`, whose methods already take `LevelRequest` — a depth-themed provider can swap the monster/item mix per depth with zero generator changes. (This is also phase 9's path in.)
- **Where a spawn indexes into the table** is generator arithmetic — the floor-raising below.

`posToDifficulty` returns a value from path distance within the level, and monsters index the table by `difficulty * 0.75`. Depth needs to raise the floor:

```
effectiveDifficulty = clamp01(depthFloor(depth) + withinLevelDifficulty * (1 - depthFloor(depth)))
```

so depth sets a minimum and within-level distance still varies above it. Something like `depthFloor(d) = min(0.8, (d - 1) * 0.08)` reaches the top of the table around depth 11 while leaving headroom. **These numbers are guesses — they need playtesting**, and playtesting them at one level per 25 minutes is slow, so add a dev-only override that skips the gate (the original had a similar localhost-only backspace handler at `ui.cljs:328-329`).

Implementation notes, so these don't surprise mid-phase:

- `posToDifficulty` is **not** clamped and exceeds 1 for corridor tiles beyond the furthest room centre. Today `placeMonster` clamps its result and `placeCoveredItem` does not (both matching the original). Apply the depth floor to the raw within-level value and clamp once, at the end, in both call sites.
- Ramping monster *count* and the digger's `dugPercentage` means deriving what are currently module constants from the request: `ENTITY_COUNT`/`MONSTER_COUNT` (`generator/index.ts`) and `DIGGER_OPTIONS`, with `makeDiggerMap(seed, w, h)` growing an options argument. Three small signature changes, not tuning — budget for them. (The original has a commented-out `;:dugPercentage 0.15 ;TODO: increase this as you go deeper` in `make-digger-map`, so the author was thinking the same thing.)
- Depth reaches all of this through `LevelRequest.depth`, which the base pass already receives — no new inputs, so the determinism test keeps its "two scalars in, same level out" shape.

Watch the balance interaction: carried weapons stack additively (`getWeaponsDmg` sums all `dmg` in inventory) with no cap, and nothing is ever consumed. Across ten levels a player accumulates enough daggers and axes to trivialize everything. Options: cap equipped items, make weapons breakable, or stop generating low-tier weapons at depth. Pick one before the ramp is tuned, since it changes what the ramp has to compensate for.

## Death

Death ends the run: reset `depth` to 1, generate a new `runSeed`, clear the carry, and keep lifetime statistics (best depth, total runs, current streak). The tombstone from phase 6 becomes a run summary — deepest level reached, kills across the whole run — rather than a single-level summary.

`Statistics` already has `maxDepth` (plus `runs`, `deaths`, `levelsCleared`, `streak`, `maxStreak`) — nothing to add to the type; this phase starts *writing* them. `maxDepth` is the natural score for this game shape, and the original's win-percentage stat stops meaning much once a run spans levels.

## Open questions

- Does a run end at some maximum depth, or continue indefinitely? Indefinite with an escalating ramp is the simpler answer and gives a leaderboard-style "how deep did you get".
- Should the shrine still exist as a separate rare "ascend and bank your run" option? That would give a player a way to end a good run voluntarily rather than always ending on a death.
