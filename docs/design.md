# Design and invariants

**What this is:** the rules that outlive any one change — how the game works today, and the constraints
the code holds to. Everything here was decided deliberately and should be changed the same way.

**What this is not:** a roadmap ([PLAN.md](../PLAN.md)), a list of open questions
([threads.md](threads.md)), or a design sketch ([progression/](progression/)).

The port from ClojureScript is finished and its phase documents are gone; `git log -- docs/port/`
has them if you ever need the reasoning behind a specific line.

---

## Operating facts

| | |
|---|---|
| Working repo | `~/source/rogule/pomodorogue` |
| Reference source (ClojureScript) | `~/source/rogule/original` — read-only, never edit |
| Stack | Vite + React 19 + TypeScript, Vitest |
| Package manager | **pnpm** — `pnpm-lock.yaml` is the lockfile; there is no `package-lock.json` |
| Dev server | `pnpm dev` |
| Typecheck / test / lint | `pnpm typecheck`, `pnpm test`, `pnpm lint` |
| Regenerate sprites | see [Sprites](#sprites) — it is not a plain `pnpm gen:sprites` |
| Deploy | pull-based GitOps from `main`; see [deploy.md](deploy.md) |
| License | **AGPL-3.0**, inherited from the original. Not optional. See `NOTICE.md`. |
| Attribution | Original game by Chris McCormick. `README.md`, `NOTICE.md`, and the in-game source link (AGPL §13). |

### Terminology

Used consistently in these docs and in the code.

- **run** — one permadeath lifetime. Starts at depth 1, ends when the player dies. Carries HP, inventory and XP across levels.
- **level** — one generated dungeon at a given depth. Usually fits in one break; may freeze at the break's end and resume in the next.
- **depth** — 1-based level number within a run.
- **break** — the five minutes of play a cycle earns. Its clock starts on the player's first action.
- **cycle** — one 25-minute work interval followed by one break.
- **seed** — `runSeed` is per-run; a level's seed derives as `hashSeed(runSeed, depth)`.
- **carry** — the stats and inventory snapshotted at Descend and applied to the next level.
- **progressive** / **fixed** — the two ways the game plays. Neither is a stored mode; see [Two modes, and no mode flag](#two-modes-and-no-mode-flag). The words appear in docs and never in the UI or in `src/`.

---

## The game as it works today

### The pomodoro gate

Twenty-five minutes of work earns five minutes of play. `src/pomodoro/schedule.ts` is pure — every
function takes `now` and a `PomodoroConfig`, so a test drives a whole cycle in milliseconds.

```ts
type PomodoroConfig = {
  workMs: number           // 25 * 60_000
  breakMs: number          // 5 * 60_000
  maxBankedBreaks: number  // 1
  warnMs: number           // 60_000 — how long before the deadline the advisory shows
  bellWindowMs: number     // 120_000 — how stale a transition may be and still ring
}
```

**Breaks do not stack.** Skip three cycles and you get one break. The rule is `maxBankedBreaks: 1`
rather than a boolean, because tests need durations injectable anyway and a later perk should be a
value change. `breaksAvailable` *derives* its count from `nextPlayableAt` and `now` and clamps —
there is no stored counter to drift.

**Raising the cap above 1 needs one decision that has not been made:** what consuming a banked break
does to `nextPlayableAt`, given that `now + workMs` would silently wipe the rest of the bank. At a cap
of 1 the question cannot arise. Do not write the consumption rule until something wants it.

The config is not exposed in the UI. Thread it as an argument like `now`; a module-level constant is
the first thing to rot.

### The break clock starts on the player's first action

`breakStartedAt` is null when a break becomes available and is set by the first input that produces a
turn. The deadline is `breakStartedAt + breakMs`. Work forty minutes past the bell and you still get a
full five when you sit down — **the break is a credit the player spends, and opening the tab does not
spend it.**

It is wall-clock from that first action, not five minutes of accumulated activity. Accumulated play
would need idle detection and would make the countdown stall without explanation. Store the timestamp,
never a JS timer, so the deadline survives a reload and cannot be reset by refreshing.

### A level that outlasts its break freezes

On expiry the level persists exactly as it stands — same monsters, same positions, same HP —
`nextPlayableAt` moves on, and the next break rehydrates the same `GameState` with `breakStartedAt`
back to null. **A level is not required to fit in one break.** "One level per cycle" is really "one
break per cycle: five minutes, or the end of the level, whichever comes first."

Freezing costs no new machinery — the level was already persisted for reloads. It asks nothing of a
player who is doing the thing the timer exists to encourage, and it closes the walk-away exploit:
under abandon-and-regenerate, a player losing a fight could let the clock run out to escape it.

The deadline is checked *before* an input is accepted, never mid-turn. Turns are discrete and
synchronous, so refusing the input is the whole of the enforcement.

During the work interval the frozen board stays on screen, dimmed and non-interactive. Hiding it would
read as "the level is gone", which is the impression this design exists to avoid.

### Finishing early keeps the rest of the break

A win or a death ends the *level*, not the *break*. All three endings go through
`endBreakAtDeadline` — `endBreak(breakDeadline(schedule, config) ?? now, config)` — so clearing a
level in ninety seconds never hands you a longer wait than dawdling did.

`phaseAt` derives three phases from the clock on every tick rather than signalling at the transition:

| phase | meaning |
|---|---|
| `playing` | a break is available |
| `resting` | the level is over, the break is not |
| `working` | the 25 minutes |

Deriving is what lets the two paths into `working` — a level frozen on the deadline, and a level
finished early whose break then ran out — need no separate handling, and what makes the bell one
effect instead of two call sites.

**The bell rings at break → work only.** That transition is what lets the player be away from the
screen. The start of a break deliberately does *not* fire an alarm: being summoned to play is an
interruption rather than a service. The sound is synthesized in `src/ui/useChime.ts` (three decaying
sine partials, ~1.5s) — an `AudioContext` was needed either way, so a file would only have added a
download, a license to track, and a fetch that can fail.

Two things the hook has to keep doing: unlock on the **first user gesture of the session**, not the
first move of the break (a player who reloads while the tombstone is up never acts again, and that is
exactly the player who needs the bell); and call `resume()` on every ring, because sleep or a
backgrounded tab can suspend the context and a suspended context has a frozen `currentTime`.

There is currently **no way to mute it**. See [threads.md](threads.md).

### The choice at the end of a level

`Tombstone` is the end-of-level screen for both outcomes. What it offers depends on how the level
ended:

| ended | primary | secondary |
|---|---|---|
| cleared | **Descend** — same `runSeed`, `depth + 1`, carry | **Start over** — `newRun(statistics)`, with a confirm below depth 1 |
| died | **New run** — `newRun(statistics)` | **Retry this dungeon** — same `runSeed`, depth 1, no carry |

"Retry this dungeon" means the same *run* from the top: the seed fixes every depth, so you get the
same depth-1 level and the same depth-2 level after it, knowing what killed you. It is not a free
pass — death has already reset the streak and taken the carry.

**The primary button is whichever the player chose last** (`Run.preferred`, default `'descend'`,
carried across runs like `statistics`). `'retry'` deliberately does not write it: retrying one bad
death says nothing about how you like to play.

**The confirm on Start over is only asked below depth 1** — fixed mode *is* that button pressed every
twenty-five minutes, and a confirm there is friction sixteen times a day guarding nothing.

**The choice takes effect at the next break, not immediately.** It writes
`Run.next: 'descend' | 'restart' | 'retry' | null`; `advance`'s nothing-live-to-play branch reads it
instead of deciding for itself. A player who walks away chooses nothing and the next break opens on
the same screen — nothing is lost and no default fires behind their back. Descending inside the
remaining break would hand a fast player two or three levels in five minutes and make the depth ramp
much harder to tune.

**The shrine stays a shrine.** The entity is touched *before* the player chooses, so it cannot know
whether it is a staircase down or a shrine to ascend from. Its behavior is the one thing both readings
agree on — **the level ends** — so that is all it means: `placeShrine` keeps its name, its ⛩ sprite and
its `kind: 'shrine'`. For the same reason `Outcome` is `'died' | 'cleared'` rather than the original's
`'ascended'` or the port's first `'descended'`; the screen supplies the direction.

`next` and `preferred` look similar and are not: `next` is a pending action on this run, consumed
once; `preferred` is a standing preference that outlives runs.

### Two modes, and no mode flag

The game plays two ways — **progressive** (descend, carry, see how deep you get) and **fixed** (a
fresh depth-1 elf every break, like the original). Neither is a mode, neither is stored, and there is
no toggle. Both are branches of the choice above, and all three branches are one `switch` in
`src/pomodoro/run.ts`.

Three properties fall out, and they are why this beats a setting:

- **The first level is identical either way** — depth 1, no carry, both branches.
- **Fixed mode needs no special-casing.** The depth ramp reduces to its baseline at depth 1,
  `applyCarry` is skipped when carry is null, the share string shows a depth only when there is one.
  Fixed mode *is* the Start-over branch — "a fresh depth-1 elf every break" — and not a promise about
  what that level contains. Depth 1 may change, deliberately; see invariant 1.
- **Neither mode needs a name in the UI.** The buttons say "Descend" and "Start over".

A settings toggle was rejected: it asks the player to commit before they know what they want, it needs
a settings screen the game does not have, and the decision is only ever meaningful at one moment — the
moment a level ends.

### What carries down the stairs

```ts
type PlayerCarry = { stats: Stats; inventory: Entity[] }
```

Snapshotted from the finished level's player when Descend is pressed, and applied as a **post-pass**:

```ts
makeLevel(request, content, carry?) =
  carry ? applyCarry(makeBaseLevel(request, content), carry) : makeBaseLevel(request, content)
```

Carry is run history, and history is what `LevelRequest` forbids — threading it into `placePlayer`
would break "two players on one seed share a dungeon" and the generator's two-scalars-in determinism
test. `applyCarry` overwrites the freshly-placed player's `stats` and `inventory` and touches nothing
else: position comes from the new level, no geometry changes, no RNG.

Three details that are easy to get wrong:

- **Carried ids are re-issued** from the new level's counter. Every level allocates from zero, so a
  carried `e12` and a chestnut found at the new depth are one React key for two items.
- **Carried items are marked `carried: true`.** The share string's completion bars count held items
  against *this level's* counts, so three carried chestnuts would otherwise fill a bar for the two
  this level had. The mark is sticky across descents.
- **HP is not restored on descent.** Arriving at depth 4 with 3 HP and having to decide whether to
  fight or run is where the tension lives. The engine's slow regeneration is the recovery mechanism.

**Carry is currently the whole inventory, uncapped, and that is a known hole** — see
[progression/findings.md](progression/findings.md).

### Depth and death

Depth is indefinite. Every ramp knob in `src/game/generator/ramp.ts` caps out (counts around depth 6,
difficulty around depth 11), so a long run gets hard and then stays hard rather than escalating
arithmetically into nonsense. A maximum depth would have been the thing needing code.

Death ends the run: depth back to 1, a new `runSeed` (or the same one, on Retry), carry cleared,
lifetime `Statistics` kept. `runs` counts runs, not levels; `levelsCleared` is the per-level counter;
**`maxDepth` is the score.** The tombstone shows the depth line only when `maxDepth > 1`, which is the
same test the share string uses — derived, not branched on a flag.

---

## Invariants

Breaking one of these is a design decision, not a refactor.

### 1. Depth 1 changes on purpose, never as fallout

`generator.test.ts` pins two depth-1 seeds by hash, and the hashes are a **tripwire, not a ratchet**.
They say "depth-1 generation changed"; they do not say it was wrong. A change that moves them is
re-blessed in the same commit, and that commit says what moved and why. Every knob in `ramp.ts`
reduces to its module constant at depth 1, which is where the current tuning starts, not a property
anything may rely on.

The rule this replaced, from 2026-08-12 to 2026-08-16, was that depth 1 stays byte-identical to the
original forever, so that fixed mode was the faithful clone and "did this work before the pomodoro
changes?" stayed answerable. It went for four reasons, recorded here because the wording above is
easy to re-tighten by accident:

- **The port is preserved in git**, at `f6b54bc`, checkoutable and playable. The hash was only ever a
  forward promise that new code keeps reproducing that build; dropping the promise does not drop the
  artifact.
- **It was a narrow guarantee sold as a broad one.** Two seeds of the base pass at one depth. Nothing
  about the engine, the UI or combat, which is where a post-port bug actually lives, so the question it
  claimed to keep answerable was never answered by it.
- **It forbade the change the game most needs.** Depth 1 is what a fixed-mode player sees sixteen
  times a day, and it is not yet interesting enough to bear that. Making it more interesting *is* a
  depth-1 generation change.
- **It taxed shape changes twice.** Invariant 8 answers a `GameState` shape change with a version
  bump. The ratchet answered the same event with a prove-it-was-a-no-op ritual. Only one of them
  scaled.

What survives is the preference, and it is the part worth keeping: **a fix aimed at depth 2+ should
not reach depth 1 as a side effect.** `applyCarry` is the natural home for progressive-mode balance
because it never runs at depth 1; the combat maths is not, because summing weapons is what the
original does within a level too. When depth 1 does change it is because somebody decided depth 1
should play differently, and the commit says so.

Two things the hashes cannot see, so do not lean on them for these: the ramp's curve above depth 1
(every knob is at its baseline at the only depth they hash, so a curve change needs its own
assertion) and anything the overlay pass (invariant 4) will one day add.

### 2. Explicit RNG, no global patching

The original seeds `Math.random` globally. That works for one level per day and breaks the moment a
run has several levels needing independent streams. Instead: an explicit `Rng` threaded through
generation (`src/game/rng.ts`). **`Math.random` and `Date.now` are both banned inside `src/game/` by a
lint rule.** Entropy and clocks are injected at the edge.

### 3. Seeds control the world, not the story

**Reproducibility is a tool here, not a product promise.** Nobody is comparing runs. Seeded generation
is kept for exactly two reasons: it is the cheapest possible regression test for the generator, and it
leaves the door open to shareable levels. Do not add complexity in the name of determinism beyond
what those two justify.

- **Fixed by the seed:** layout, item placement and monster placement of *every* level in the run —
  depth 7 is as determined as depth 1.
- **Not fixed by the seed:** anything the player does. Combat and monster-AI rolls come from an
  entropy-seeded `Rng` created at the edge and injected into `takeTurn` — not merely a separate stream
  but deliberately not derived from the seed at all. Independence also means consuming rolls at a
  player-determined rate cannot shift what the generator produces.

So two players on the same seed walk the same dungeon and have different runs. A reload mid-fight
rerolls your upcoming luck; every break boundary rehydrates and so reseeds. Accepted — there is no
leaderboard and nobody to cheat but yourself, and the price of a reroll is waiting 25 minutes.

Reversal, if ever wanted, is a caller-side change: the engine takes an `Rng` and does not know how it
was seeded.

**Runs are not reconstructible, and that is deliberate.** No record short of a full input-and-roll log
could replay one, and nothing wants to.

### 4. Generation is a base pass, with a named overlay seam

1. **Base pass** — `makeBaseLevel(request, content)`, pure in `LevelRequest` (`{ runSeed, depth }`) and
   nothing else: geometry, base monsters, base loot, depth scaling.
2. **Overlay pass** — applied on top of a finished base level, driven by what has happened: a boss that
   fled downstairs, bones from a previous run, generated content. **Not built.** `makeLevel` is
   `makeBaseLevel` plus `applyCarry`, which is the overlay's miniature.

Growing `LevelRequest` with history fields was considered and rejected: the moment history reaches
`levelSeed`, two players on one seed no longer share any geometry, and the determinism test degrades
from "two scalars in, same level out" to "same history fixture in, same level out".

Three rules to write into the overlay when it is built:

- **It may add entities and change entity properties. It may not change map geometry.** Geometry is
  what makes two players' dungeons recognizably the same.
- **Validity assertions run after the overlay, not after the base.** An overlay boss in the only
  corridor can make the exit unreachable.
- **The overlay stream is still seed-derived** — `hashSeed(runSeed, depth, historyDigest)`. Overlays
  are world content, and world content stays seed-derived; only play is entropy. Genuinely external
  inputs (a bones file, a server's content) are inputs, not randomness.

**The rule that decides where something goes: if it can be computed from `{ runSeed, depth }`, it is
base-pass content, however special it feels.** A boss at a fixed depth is base-pass. A boss that fled
from *your* depth 4 is overlay.

### 5. `ContentProvider` is pure with respect to its request

Monster and item tables are reached through an interface; placement code never imports the built-in
tables directly. A provider that returns different content for the same `LevelRequest` breaks base
determinism from the outside. A future generating provider satisfies this by caching per
`(runSeed, depth)`; content that genuinely cannot be pinned to a request belongs in the overlay
instead.

### 6. `src/game/` runs in bare Node

No DOM, no React, no URL reading, no clock. This keeps generation testable, makes headless
bot-measurement possible ([progression/findings.md](progression/findings.md)), and is what would let a
server generate levels with the same code. React lives only in `src/ui/`.

### 7. `GameState` is JSON-serializable, and behavior is named by a `kind`

Pomodoro state has to survive a reload across a 25-minute gap and a run has to survive hours, so no
function may be reachable from state. Entity behavior is a single `kind` discriminant
(`'player' | 'monster' | 'shrine' | 'cover' | 'item' | 'potion'`) resolved by exhaustive `switch`es —
a bad name is a compile error.

Templates are plain data plus a kind from a closed union, which means externally-supplied content
cannot name behavior that does not exist. **Do not resurrect per-slot function registries.** If a
behavioral variant is wanted (a monster that stands guard, a trapped item), express it as a template
data field read by the existing switch cases. And when one kind's case grows conditionals on several
optional fields, split the kind rather than generalize the dispatch — flag soup and a registry are the
same disease at different ages.

### 8. Version the save; discard on mismatch, never migrate

Round-trippable is not the same property as compatible-with-yesterday's-build. Three ways a stale save
goes wrong: an unknown entity kind throws inside `takeTurn`; renumbered `TILE` codes silently
reinterpret every tile; a changed `Stats` shape renders `NaN`.

So `Level`, `Run` and `Schedule` each carry a `schemaVersion` and are persisted separately (a corrupt
one must not take down the others). On mismatch the **level** is discarded and the next break starts
fresh at the same depth; `Run` and `Schedule` are small, stable, and the expensive things to lose.
Throwing the level away buys never writing a migration — and the cost is bounded by one level, which
may be more than one break's play since a level can span breaks.

**Bump `LEVEL_SLOT.schemaVersion` when entity kinds change, when `TILE` codes change, or when
`GameState`'s shape changes.**

Leave the `throw` in `runEncounter`'s `default` alone. Tolerance belongs at the load boundary, where
the input is genuinely untrusted, not in the middle of a turn.

### 9. One immutability boundary per turn

The engine is written as pure `state -> state` reducers, but there is exactly one `produce` — at
`takeTurn` — with everything beneath it mutating the draft. **`takeTurn` is the only `state -> state`
entry point the UI holds** (plus `expireAnimation`). Immer earns its keep on the nested writes; it is
*not* what keeps the memoized entity index alive, since every turn moves the player and the index
rebuilds regardless.

**A reducer that changed nothing returns the same object.** Callers use reference identity to decide
whether the player acted — the break clock starts on that signal — so a refused move must not hand back
a fresh state. Immer will not do this for you: a draft written before the refusal is discovered counts
as modified whatever the outcome, so return the original explicitly, as `startBreakClock` does.

### 10. Tiles are a flat array; entities are a per-turn index

`GameMap.floorTiles` is a `Tile[]` of numeric codes indexed `y * w + x`, read through `tileAt`, which
returns `TILE.rock` off the map. **Do not index it by hand** — a raw `y * w + x` on a negative `x`
lands on the previous row. Entities are bucketed by a `"x,y"` string key in a per-turn index. The two
representations are deliberately independent.

### 11. Every choice is a position on the map

The player's entire input vocabulary is four arrow keys, and that is most of why the game has such low
cognitive overhead. A feature that needs a modal, a list and a confirm button is a different game.
Express choices as *where you walk*.

### 12. Timers use absolute timestamps

Never accumulate elapsed time by adding tick deltas. Store epoch timestamps and compute
`deadline - Date.now()` on each tick: background tabs throttle to once a minute or worse, and a laptop
that sleeps for two hours produces wildly wrong totals. Tick at 1s for display, recompute on
`visibilitychange`, and let the gate read the clock directly so a throttled tick delays the UI and
never the eligibility.

### 13. The source link stays in the interface

AGPL §13: hosting this game obliges an offer of its complete source to players. `src/ui/Attribution.tsx`
is that offer, alongside the credit to Rogule. Do not quietly drop it in a layout change.

---

## The UI

React lives only in `src/ui/`. `App.tsx` is the only place that mints entropy or reads the clock.

### Rendering model

The board renders a `2 * visibleDist` window centred on the player (`visibleDist` 9, so 18×18 cells),
not the whole 32×32 map. Cells outside `clearDist` (7) render at 0.75 opacity, outside `visibleDist` at
0 — **that opacity gradient is the fog of war**, and there is no separate visibility computation. The
fog opacity is applied once, on the cell; the original compounded it on the entity tile as well.

Re-rendering the whole window every keypress is fine: turn-based, ~324 cells. **Do not add
virtualization.**

A cell reads its contents from `entitiesAt(index, posKey(x, y))` and its floor from `tileAt(map, x, y)`.
`entitiesByPos` memoizes the index per `entities` object identity in a `WeakMap`, and `entitiesAt`
flattens a cell in layer order `floor, between, occupy, above` with dead entities below living ones, so
corpses appear under items. **Don't re-derive that ordering in JSX.** The memo makes re-renders of an
unchanged state free; it does not make updates cheap, since every turn moves the player.

**Dark cells render nothing** — opacity 0 hides pixels but not `title`/`alt` text, so a hovered dark
cell used to name the monster the fog was hiding. Effects beyond the lit ring run their animations to
completion in the Board's `visibility: hidden` pen, because a cell that leaves the window unmounts
mid-animation and leaks the effect into state.

### Keyboard input

A `useEffect` with a cleanup return, reading `event.key` rather than the deprecated `keyCode` the
original used. Arrows and vim keys (`hjkl`) move, `.` rests, `?` toggles help, `Esc` closes it. The
on-screen arrow buttons call the same action rather than synthesizing `KeyboardEvent`s.

The handler skips anything carrying a modifier (⌘R is a reload, not a rest), calls `preventDefault`
only for keys the game actually claimed, and stops claiming movement keys while help is open so arrows
scroll the overlay. The help-open flag is UI-local `useState`, not `GameState` — a help overlay has no
business surviving a reload.

The combat `Rng` is created once per level from ambient entropy and held in a ref, not state.

### Animations

Entities carry `animation: { name, disposal?, frame? }`. Two mechanisms:

- **Bump** — set when a move is blocked; pure CSS, keyed off a class.
- **Destroy-on-end** — smoke puffs and collision markers carry `disposal: 'destroy'`, and
  `onAnimationEnd` removes the entity through `expireAnimation(state, id)`, the engine's second entry
  point. The one-`produce` rule is per entry point, not per codebase: **do not import Immer in the UI**
  or hand-spread the state instead.

Restarting a CSS animation is a React `key` change (include `Animation.frame` in the key), not the
original's remove-class-force-reflow-re-add DOM hack, which relied on an `<img>` `onload` that
URL-referenced cached sprites do not reliably give.

### Health bars

`state.combatants` holds stable ids while HP changes underneath, so a `React.memo` keyed on the id
alone renders stale bars forever — and the bar's replay animation needs `hp.cur` in its React key to
remount at all. The original got both for free because combat re-copied its combatants every round.
Skip combatant ids that no longer resolve in `state.entities`.

### The share string

One generic function builds the emoji summary for both targets — text characters for the clipboard,
image elements for display. The clipboard version appends `https://pomodorogue.com`; the on-screen one
omits it, because the reader is already there. It takes `(state, statistics)`, since statistics are
run-scoped rather than level-scoped.

---

## Code map

| Path | What lives there |
|---|---|
| `src/game/` | Pure game logic. No DOM, no React, no clock, no `Math.random`. |
| `src/game/rng.ts` | `makeRng`, `hashSeed`, `levelSeed` |
| `src/game/grid.ts`, `pos.ts` | Tile and path helpers, `posToDifficulty` |
| `src/game/entities.ts` | Entity construction and the position index |
| `src/game/generator/` | `makeBaseLevel`, map digging, entity placement, `ramp.ts` (every depth knob) |
| `src/game/content/` | `ContentProvider` interface and the built-in monster/item tables |
| `src/game/engine/` | `takeTurn` and everything under it: movement, encounters, combat, monster AI |
| `src/game/carry.ts` | `applyCarry` — the one post-pass over a base level |
| `src/game/bot/` | Headless play. `runDeep` is `App.tsx`'s level loop without the clock; `Policy` is the seam a play style plugs into, so the same seeds can be measured under several. One style exists. |
| `src/pomodoro/schedule.ts` | Pure gate logic. Takes `now` and `PomodoroConfig`. |
| `src/pomodoro/run.ts` | `newRun`, `advanceRun` — the three-branch choice |
| `src/pomodoro/persistence.ts` | Three versioned localStorage slots |
| `src/pomodoro/usePomodoro.ts` | React binding: ticking clock, persistence |
| `src/ui/` | React. `App.tsx` is the only place that mints entropy or reads the clock. |
| `scripts/gen-sprites.ts` | Codegen for the sprite index and the SVGs |

---

## Sprites

Both outputs are **committed** — `src/game/sprites.ts` and `public/sprites/*.svg` — so a fresh clone
runs without the codegen step. Sprites are `{ url }` records rather than inlined base64, which is also
what would let a generated sprite be the same shape as a built-in one.

**`twemoji-emojis` is deliberately not in `devDependencies.`** Its dependency chain accounts for six
advisories including two criticals, and since the output is committed it is needed only when the sprite
list changes. Leaving it out keeps `pnpm audit` at zero on a public repo. `emoji.json` *is* a normal
devDependency — it has no transitive dependencies at all.

To add a sprite:

```sh
pnpm add -D twemoji-emojis     # temporarily
pnpm gen:sprites
pnpm remove twemoji-emojis
```

`twemoji-emojis` ships no artwork — its `postinstall` downloads the SVGs into `vendor/`. pnpm does not
run dependency build scripts by default, so it is listed in `pnpm.onlyBuiltDependencies` even though it
is never a normal dependency. **Do not drop it from that list**: without it the install "succeeds",
`vendor/` is never created, and `gen:sprites` fails claiming the package is missing when it is in fact
installed and empty.

We currently use 32 of roughly 3,700 twemoji, 11 of them monsters. Expanding that table by hand is the
cheapest content lever the game has — see [progression/ingredients.md](progression/ingredients.md).
