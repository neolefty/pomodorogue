# Phase 8 — Depth

**Outcome:** runs span multiple levels. The shrine becomes stairs, HP/inventory/XP carry between levels, difficulty ramps with depth, and death resets to depth 1.

**Status:** not started. Requires phases 6 and 7.

## The change in one line

`finishLevel` becomes `descend`: instead of setting `outcome: 'descended'` and ending, it increments `run.depth`, snapshots the player's carry state, and clears the current level so the next cycle generates a deeper one.

## Stairs replace the shrine

`make-shrine` in the generator places the shrine at the center of the furthest room by path length (`(last paths-to-rooms)`) — which is already exactly where a down-staircase belongs. Keep the placement logic verbatim, change the sprite (`shinto-shrine` → `down-arrow` or similar; add it to `SPRITE_NAMES` and re-run `npm run gen:sprites`) and swap the encounter fn.

## What carries between levels

```ts
type PlayerCarry = {
  stats: Stats          // hp [current, max] and xp both persist
  inventory: Item[]
}
```

Generation currently builds the player fresh in `make-player` with `hp: [10,10]` and `xp: 3`. Change it to accept an optional carry and apply it after placement — position always comes from the new level, everything else from the carry when present.

**Do not restore HP on descent.** Arriving at depth 4 with 3 HP and having to decide whether to fight or run is where the tension lives. The slow regeneration already in the engine (1 HP per 100 moves) is the recovery mechanism, and it means a cautious player can heal by exploring — which is a good use of a five-minute break.

## Difficulty ramp

Currently `posToDifficulty` returns a 0..1 value from path distance within the level, and monsters index the table by `difficulty * 0.75`. Depth needs to raise the floor:

```
effectiveDifficulty = clamp01(depthFloor(depth) + withinLevelDifficulty * (1 - depthFloor(depth)))
```

so depth sets a minimum and within-level distance still varies above it. Something like `depthFloor(d) = min(0.8, (d - 1) * 0.08)` reaches the top of the table around depth 11 while leaving headroom. **These numbers are guesses — they need playtesting**, and playtesting them at one level per 25 minutes is slow, so add a dev-only override that skips the gate (the original had a similar localhost-only backspace handler at `ui.cljs:328-329`).

Also consider ramping monster *count* and the digger's `dugPercentage` with depth — the original has a commented-out `;:dugPercentage 0.15 ;TODO: increase this as you go deeper` in `make-digger-map`, so the author was thinking the same thing.

Watch the balance interaction: carried weapons stack additively (`getWeaponsDmg` sums all `dmg` in inventory) with no cap, and nothing is ever consumed. Across ten levels a player accumulates enough daggers and axes to trivialize everything. Options: cap equipped items, make weapons breakable, or stop generating low-tier weapons at depth. Pick one before the ramp is tuned, since it changes what the ramp has to compensate for.

## Death

Death ends the run: reset `depth` to 1, generate a new `runSeed`, clear the carry, and keep lifetime statistics (best depth, total runs, current streak). The tombstone from phase 6 becomes a run summary — deepest level reached, kills across the whole run — rather than a single-level summary.

Add `maxDepth` to the statistics record. It is the natural score for this game shape, and the original's win-percentage stat stops meaning much once a run spans levels.

## Open questions

- Does a run end at some maximum depth, or continue indefinitely? Indefinite with an escalating ramp is the simpler answer and gives a leaderboard-style "how deep did you get".
- Should the shrine still exist as a separate rare "ascend and bank your run" option? That would give a player a way to end a good run voluntarily rather than always ending on a death.
