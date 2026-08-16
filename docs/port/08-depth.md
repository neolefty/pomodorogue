# Phase 8 — Depth

**Outcome:** a finished level offers a choice — descend, or start over at depth 1 — and that one choice, repeated, is what makes the game either a progressive dungeon crawl or the original's one-shot Rogule. HP/inventory/XP carry down the stairs, difficulty ramps with depth, and death ends the run.

**Status:** landed 2026-08-12. Four things turned out differently from this spec; each is recorded where it belongs below, and collected here:

1. **Carry is the whole inventory, uncapped** — Bill's call, taking the fourth option under "Settle the weapon-stacking question". The hole stays open deliberately; see "Difficulty ramp".
2. **Carried items had to be marked**, which this doc did not anticipate. `Entity.carried` exists so the completion bars keep counting *this* level. See "What carries between levels".
3. **Carried ids are re-issued** from the new level's counter. Two levels both allocate from zero, so a carried `e12` and a found `e12` were one React key for two items.
4. **The confirm step on Start over only appears below depth 1.** Fixed mode is that button pressed every twenty-five minutes, and a confirm there is friction sixteen times a day protecting nothing.

The ramp knobs are guesses and have not been played. `depthFloor`, `monsterCountFor`, `entityCountFor` and `dugPercentageFor` all live in `src/game/generator/ramp.ts` so that tuning is one file; the dev-only Backspace gate skip in `App.tsx` is what makes tuning possible at all.

## The change in one line

The tombstone stops being a dead end and becomes a choice, and `Run` learns to advance rather than always being reminted.

## Two modes, and no mode flag

The design calls for two ways to play: **progressive** (descend, carry your stuff, see how deep you get) and **fixed** (a fresh depth-1 elf every break, like the original). Neither is a mode, and neither is stored.

`Run` already holds `{ runSeed, depth, carry, statistics }`. The two branches are:

- **Descend** → same `runSeed`, `depth + 1`, carry snapshotted from the finished level.
- **Start over** → `newRun(statistics)` — fresh `runSeed`, depth 1, no carry.

Fixed mode is what you get by taking the second branch every time. **That is what the game does today, unconditionally** (`src/ui/App.tsx:161`: `current.level === null ? current.run : newRun(...)`). Phase 8 is not adding a mode; it is adding the other button and letting the player pick.

Three things fall out of this for free, and they are the reason to build it this way rather than as a setting:

- **The first level of a session is identical either way** — depth 1, no carry, both branches.
- **Fixed mode needs no special-casing anywhere.** The depth ramp is inert at depth 1, `applyCarry` is skipped when carry is null, and the share string shows a depth only when there is one to show.
- **Neither mode needs a name in the UI.** The buttons say "Descend" and "Start over"; the words "progressive" and "fixed" appear only in these docs.

The alternative — a toggle in a settings screen — was rejected. It asks the player to commit before they know what they want, it needs a settings UI the game does not have, and the decision is only ever meaningful at exactly one moment: the moment a level ends. Put the choice there.

## The choice screen

`Tombstone` becomes the end-of-level screen for **both** outcomes rather than a placeholder for death (its header comment currently says phase 8 will do the opposite — update it). What it offers depends on how the level ended.

**Cleared:**

| | |
|---|---|
| Primary | **Descend** → same `runSeed`, `depth + 1`, carry |
| Secondary, with a confirm step | **Start over** → `newRun(statistics)` |

**Died** — the polarity flips, because you cannot descend when you are dead:

| | |
|---|---|
| Primary | **New run** → `newRun(statistics)` |
| Secondary | **Retry this dungeon** → same `runSeed`, depth 1, no carry |

"Retry this dungeon" means the same *run*, from the top: the seed fixes every depth, so you get the same depth-1 level, and the same depth-2 level after it, with the knowledge of what killed you. In fixed mode, where you only ever died at depth 1, that is simply "the same level again". One rule, and it reads correctly in both modes. It is not a free pass — death has already reset your streak and taken your carry.

**The primary button is whichever the player chose last**, remembered as `Run.preferred` and carried forward across runs the way `statistics` is (default `'descend'`). This replaces the idea of de-emphasizing Descend after a few consecutive restarts. Prominence that shifts on a history counter makes a button the player cannot predict; a preference that follows the last choice adapts in one step, is one string instead of a counter, and reverses the instant they change their mind. `'retry'` deliberately does not write it — retrying one bad death says nothing about how the player likes to play.

**The confirm step is only asked below depth 1**, which this spec did not qualify. Fixed mode *is* "Start over" pressed every twenty-five minutes, so a confirm at depth 1 would be friction sixteen times a day guarding a run with no carry and no progress to lose. Derived from `run.depth`, not from a mode flag — the same trick as everything else here.

## The choice takes effect at the next break

**Decided 2026-08-11.** Pressing Descend does not start the next level immediately, even when minutes of break remain. It records the choice; the level generates when the next break opens.

The reason is phase 7.5: what finishing early earns is the rest of the break, spent away from the screen, and there is still no other reward for it (open question 6 in PLAN.md). Letting Descend start a second level inside the same break would answer that question by accident, and would let a fast player clear three levels in five minutes, which makes the depth ramp far harder to tune. If a reward for finishing early does eventually land, this is the decision to revisit first.

The mechanics need almost nothing new, because `advance` already refuses to do anything until `canPlay`:

- The choice writes `Run.next: 'descend' | 'restart' | 'retry' | null` and returns. The tombstone stays on screen through the rest of the break.
- `advance`'s "nothing live to play" branch stops deciding for itself. Instead of always calling `newRun`, it reads `run.next`: null means the player has not chosen, so do nothing and keep the tombstone up; otherwise apply that branch, clear `next`, and generate.
- A player who walks away — which is what the rest of the break is *for* — chooses nothing, and the next break opens on the same choice screen. Nothing is lost and no default fires behind their back. The break clock still starts on the first move (`startBreakClock`), so deliberating costs no play time.

`next` and `preferred` are two fields that look similar and are not: `next` is a pending action on this run, consumed once; `preferred` is a standing preference that outlives runs.

## The shrine stays a shrine

**Do not rename `'shrine'` to `'stairs'`, and do not add a stairs sprite.** An earlier draft of this doc said to do both. It cannot work now: the entity is touched *before* the player chooses, so it has no way to know whether it is a staircase down or a shrine to ascend from. Its behavior is the one thing both readings agree on — **the level ends** — so that is all it should mean.

Concretely, `placeShrine` (`src/game/generator/entities.ts:156`) keeps its placement logic, its name, its ⛩ sprite, and its `kind: 'shrine'`; `movement.ts:119` and `encounters.ts:79-90` keep their cases. This also deletes a `pnpm gen:sprites` round-trip from the phase.

What does change is the **outcome name**. `Outcome` is currently `'died' | 'descended'` (`src/game/types.ts:236`) — the one place the port pre-committed to progressive semantics, where the original said `:ascended`. Neither word is right when the direction is chosen afterwards, so it becomes:

```ts
export type Outcome = 'died' | 'cleared'
```

The screen supplies the direction: "Down you go" after a descend, the original's "Fin." after a death. Call sites are `App.tsx:74`, `Tombstone.tsx:72`, `shareString.tsx:62`, and `encounters.ts:89-90`. While there, `Help.tsx:51` says "to descend" and should go back to the original's wording — reaching the shrine ends the level; what happens next is the player's call.

**Bump `LEVEL_SLOT.schemaVersion`** (`src/pomodoro/persistence.ts:63`) in the same change: `outcome: 'descended'` is a persisted string whose meaning is changing, and a level saved by the old build would show a tombstone whose branches all read false. **Bump `RUN_SLOT.schemaVersion`** too — `Run` gains `next` and `preferred`, and `carry` stops being `null`, which `isRun` currently asserts outright (`persistence.ts:147`).

## What carries between levels

```ts
type PlayerCarry = {
  stats: Stats            // hp { cur, max }, xp, and the regen counter all persist
  inventory: Entity[]     // there is no separate Item type — inventory entries are entities
}
```

Snapshotted from the finished level's player at the moment Descend is pressed — the level is still saved, so there is nothing to capture early.

**Carry is applied as a post-pass, never inside the base generator.** Carry is run history, and history is exactly what `LevelRequest` forbids (`types.ts` says so in as many words; see "Seeds control the world, not the story" in PLAN.md). Do not thread it into `placePlayer` — an earlier draft said to, and that would quietly break "two players on one seed share a dungeon" plus the generator's two-scalars-in determinism test. The seam already exists: `makeLevel` is currently just `makeBaseLevel` (`generator/index.ts:86`); this phase makes it

```ts
makeLevel(request, content, carry?) =
  carry ? applyCarry(makeBaseLevel(request, content), carry)
        : makeBaseLevel(request, content)
```

where `applyCarry` overwrites the freshly-placed player's `stats` and `inventory` and touches nothing else — position comes from the new level, no geometry changes, no RNG. `placePlayer` keeps building the fresh `hp: { cur: 10, max: 10 }`, `xp: 3` player unconditionally. (This is a miniature of the overlay pass PLAN.md describes; if a real overlay lands later, carry becomes its first tenant.)

Carried inventory entities keep a stale `pos` from the level where they were picked up. Nothing reads inventory positions — same as the original — so leave them alone rather than inventing a scrub step.

**Their `id`s are a different matter, and this doc missed it.** Every level allocates ids from its own counter starting at zero, so a carried `e12` and a chestnut picked up at the new depth are one React key for two items in the inventory strip. `applyCarry` re-issues each carried id from the new level's `nextEntityId`; nothing outside the inventory refers to them, so it costs nothing.

**Carried items are marked `carried: true`, which this doc also missed.** The completion bars in the share string count held items against *this level's* `counts` — so three carried chestnuts fill a bar for the two this level had, and report a level completed on the strength of a previous one. The flag lets `collectedBar` ask "found here?", which is the question it was always asking; it simply could not be wrong until an inventory could outlive a level. The mark is sticky across descents, because an item carried from depth 2 to depth 5 was not found at depth 5 either.

**Do not restore HP on descent.** Arriving at depth 4 with 3 HP and having to decide whether to fight or run is where the tension lives. The slow regeneration already in the engine (1 HP per 100 moves) is the recovery mechanism, and it means a cautious player can heal by exploring — which is a good use of a five-minute break.

## Difficulty ramp

**The correctness property to hold onto: at depth 1 the generator must produce byte-identical levels to phase 6.** That is what keeps fixed mode a faithful clone rather than an approximation of one, and it is a cheap test — pin a depth-1 level before the ramp lands and compare after.

Two knobs live in different places, deliberately — don't merge them:

- **What the tables contain** flows through `ContentProvider`, whose methods already take `LevelRequest` — a depth-themed provider can swap the monster/item mix per depth with zero generator changes. (This is also phase 9's path in.)
- **Where a spawn indexes into the table** is generator arithmetic — the floor-raising below.

`posToDifficulty` returns a value from path distance within the level, and monsters index the table by `difficulty * MONSTER_DIFFICULTY_SCALE`. Depth raises the floor:

```
effective = depthFloor(depth) + within * (1 - depthFloor(depth))
depthFloor(d) = min(0.8, (d - 1) * 0.08)
```

so depth sets a minimum and within-level distance still varies above it, reaching the top of the table around depth 11 with headroom left. **These numbers are guesses — they need playtesting**, and playtesting at one level per 25 minutes is slow, so add a dev-only override that skips the gate (the original had a localhost-only backspace handler at `ui.cljs:328-329`).

Implementation notes, so these don't surprise mid-phase:

- **Do not add a clamp.** `posToDifficulty` is not clamped and exceeds 1 for corridor tiles beyond the furthest room centre. `placeMonster` clamps its own result (`entities.ts:252`) and `placeCoveredItem` deliberately does not (`entities.ts:192`) — both matching the original, where an over-1 item difficulty means "no item here". An earlier draft said to clamp once at the end in both call sites; that would change depth-1 item placement and break the identical-at-depth-1 property above. Apply the floor to the raw within-level value and leave each call site's clamping exactly as it is. At `depthFloor(1) = 0` the formula reduces to `within` arithmetically, which is what makes depth 1 untouched.
- Ramping monster *count* and the digger's `dugPercentage` means deriving what are currently module constants from the request: `ENTITY_COUNT`/`MONSTER_COUNT` (`generator/index.ts:18-19`) and `DIGGER_OPTIONS` (`generator/map.ts:19`), with `makeDiggerMap(seed, w, h)` growing an options argument. Three small signature changes, not tuning — budget for them, and make each an identity at depth 1. (The original has a commented-out `;:dugPercentage 0.15 ;TODO: increase this as you go deeper` in `make-digger-map`, so the author was thinking the same thing.)
- Depth reaches all of this through `LevelRequest.depth`, which the base pass already receives — no new inputs, so the determinism test keeps its "two scalars in, same level out" shape.

**The weapon-stacking question was asked and deliberately left open. Decided 2026-08-12: carry everything, uncapped, for now.** Carried weapons stack additively (`getWeaponsDmg` sums every `dmg` in inventory) with no cap, and nothing is ever consumed, so across ten levels a player accumulates enough daggers and axes to trivialize everything. Four options were on the table — carry only the best weapon and armour, cap the effect in combat, make weapons breakable, or leave it — and Bill took the last: play it and see how bad it actually gets before paying for a fix.

That makes the ramp's job ambiguous on purpose, and it is the first thing to revisit when the numbers get tuned: **is the deep game too hard, or is the deep player too strong?** The two look identical from a single playthrough and want opposite corrections. Note this remains a *progressive-mode-only* problem — fixed mode carries nothing — so whatever eventually fixes it must not change depth-1 behavior. Of the four, "carry only your best weapon and armour" is the one that satisfies that constraint by construction, since it lives entirely inside `applyCarry`; the combat cap does not, because summing is what the original does within a level too.

## Death

Death ends the run. The next run resets `depth` to 1, mints a new `runSeed` (or reuses it, on Retry), clears the carry, and keeps lifetime statistics.

`Statistics` already has every field this needs — `runs`, `deaths`, `levelsCleared`, `maxDepth`, `streak`, `maxStreak` — so nothing is added to the type; this phase starts *writing* them correctly. Two things change in `recordOutcome` (`App.tsx:73`), whose own comment flags the first:

- **`runs` stops meaning "levels played".** Increment it once per run — on death, or when Start over is chosen — not once per level. `levelsCleared` is the per-level counter.
- **`maxDepth` becomes the score.** It is the natural one for this shape, and the original's win-percentage stops meaning much once a run spans levels.

That makes the tombstone's stat block mode-sensitive, which is the one place the emergent-mode design costs something. Fixed mode wants the original's Plays / Cleared % / Streak / Longest; progressive mode wants deepest-reached and kills across the whole run. Derive rather than branch on a flag: show the depth line only when `maxDepth > 1`, the same test the share string uses.

## Open questions

- ~~Does a run end at some maximum depth, or continue indefinitely?~~ **Answered 2026-08-12: indefinite.** It is the simpler answer, it gives a leaderboard-style "how deep did you get", and it took no code — a cap would have been the thing that needed writing. The ramp is built for it: every knob in `ramp.ts` caps out (around depth 6 for the counts, depth 11 for difficulty), so depth 400 is hard and finite rather than arithmetically absurd, and `monsterCountFor` can never ask for more monsters than there are tiles. What depth 30 actually *feels* like is unknown and needs the same playtesting the ramp does. (PLAN.md open question 4.)
- **How is the deep game meant to be balanced, given the player gets stronger for free?** New, and the direct consequence of leaving weapon stacking uncapped — see "Difficulty ramp". Blocking nothing, but it is the question the first real playtest has to answer before the ramp numbers can be moved with any confidence.
- Should the shrine also, rarely, offer to *ascend* — end a good run voluntarily and bank it, rather than always ending on a death? Now that the level's end is already a choice screen, this is a third button rather than a new mechanism. Still open.
