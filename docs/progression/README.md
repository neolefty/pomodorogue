# Progression — making a dungeon interesting sixteen times a day

**The problem in one sentence:** Rogule was designed to be played once a day, and Pomodorogue asks for
a level roughly sixteen times a day — so the thing that carries a player from break to break has to be
*structure*, not a number that goes up.

**Where it stands:** depth-as-a-number has run out. The ramp built for depth is arithmetically
incapable of making a level harder past a point, and a progressive player becomes literally unhittable
somewhere around depth 10. Both are verified against the code and written up in
[findings.md](findings.md). **Nothing about the replacement is decided.**

**Depth 1 is in scope, but only on purpose.** It is hash-pinned as a tripwire, not frozen (invariant
1 in [design.md](../design.md)): a balance fix aimed at depth 2+ must not move depth 1 as fallout, and
an idea that *wants* to change the level a Start-over player meets every break says so, and argues
for it on its own. Since 2026-08-16 that argument is allowed to win.

---

## Operating facts

| | |
|---|---|
| Scope | Balance and progression from depth 2 onward |
| Status | Brainstorm and design sketch. The short-term order is in [PLAN.md](../PLAN.md#what-is-next): harness, fusion, the level plan, then a real level 2. |
| Blocked on | Nothing. Balance is deliberately *not* being optimized yet — the game is expected to change a lot first — but structure and elements are open. |
| Files this would touch | `src/game/generator/ramp.ts`, `src/game/content/`, `src/game/carry.ts`, `src/game/engine/combat.ts`, `scripts/gen-sprites.ts` |
| Files this must not change the behavior of *by accident* | `src/game/generator/*` at `depth === 1` — `generator.test.ts` pins two depth-1 seeds by hash. Moving them is allowed; the commit says why. |

## The five documents

| | |
|---|---|
| **README.md** (this) | The problem, the direction, and how to use this folder |
| [findings.md](findings.md) | What is *known*: the two arithmetic findings, and the measurement nobody has taken |
| [ingredients.md](ingredients.md) | The stew pot — the balance, economy and structure levers, tagged and cheap to add to |
| [elements.md](elements.md) | The deck of *learnable elements* — terrain, monster behaviours, room types, uses for loot, and the mechanics only a pomodoro game can have |
| [arcs.md](arcs.md) | The leading synthesis: themed arcs with a fixed beat rhythm |

**Two pots, deliberately.** [ingredients.md](ingredients.md) holds the levers that change *how the
numbers work* — fusion, the shop, ascend, the heal. [elements.md](elements.md) holds the things a
player *learns by walking into them* — ice, packs, keys, the garden. An idea belongs in whichever pot
you reach for first; nobody should spend time deciding.

**Add raw ideas freely** — these are inboxes, not plans, and an untested idea sitting in one costs
nothing. An idea graduates into [arcs.md](arcs.md) or its own doc when somebody has worked out how it
interacts with everything else.

---

## The three routes

Bill's framing from the 2026-08-22 brainstorm, and the reason this folder exists:

1. **Extrapolate from depth 1** — keep the standalone design and push the numbers: harder monsters,
   compressed displays, some way to spend items between levels.
2. **Partially reset each level** — carry a fraction of loot and XP rather than all of it.
3. **Depart from the depth-1 design** into something built to be interesting sixteen times a day
   rather than once.

Bill leans to 3, while wanting to keep 1 "as is, somehow."

**They are not exclusive, and [arcs](arcs.md) is the structure that makes all three true at different
scales** — which is the main argument for it:

- **Route 1 is depth 1, kept as the standalone game.** A player who presses Start over every break
  gets a self-contained level that owes nothing to the arcs. That is "as is" in shape, not in bytes:
  depth 1 may still be re-tuned for its own sake, which is the one change the old hash ratchet
  forbade and the reason it was retired.
- **Route 2 becomes the arc boundary**, which is a far more legible place for a reset than every level.
  A per-level fraction is a tax the player feels constantly and cannot plan around; a per-arc squeeze
  is a rhythm they can play toward.
- **Route 3 is the arc itself**, and it is the only one of the three that addresses the actual problem.
  Routes 1 and 2 both tune a curve; the finding is that the curve has no ceiling left to tune against.

## Two things to hold onto while brainstorming

**Every choice is a position on the map.** The player's entire input vocabulary is four arrow keys, and
that is most of why the game has such low cognitive overhead. An idea that needs a modal, a list and a
confirm button is a different game. The shop passes this test by being *a room you walk through*; that
is the bar.

**A five-minute break has no time to lend.** Anything that spends the player's turns rather than their
HP is spending the scarcest resource in the design. `ramp.ts`'s own tuning note says it: if levels
start taking too long before they start feeling too hard, flatten the dug-percentage knob first.

## Where an idea lands in code

The two pots sort ideas for *brainstorming*; these four bins sort them for *implementation*. Every
idea in this folder falls into one:

| bin | what it holds | home |
|---|---|---|
| **Data** | new monsters, items, themes, prices | `ContentProvider` tables (`src/game/content/`) |
| **Pure function of `(runSeed, depth)`** | arcs, beats, curricula, counts, boss placement | `ramp.ts` today; the level plan (step 5 below) |
| **Post-pass over a finished level** | carry, fusion, the work-interval heal, bones | `applyCarry` today; the overlay seam once history arrives |
| **Behavior** | new verbs — ice, keys, feeding | the `kind` switches — deliberately the expensive bin |

**Classify before coding, and prefer the cheapest bin that can express the idea.** The shop is the
model case: it feels like new behavior and is actually a data field (`price`), a placement rule, and a
tweak to the existing pickup encounter. The [cost taxonomy](elements.md#cost-taxonomy) in elements.md
is this table at finer grain, and the base-pass rule in
[design.md](../design.md#4-generation-is-a-base-pass-with-a-named-overlay-seam) is the classifier for
bin two. The health metric is mechanisms-per-idea: a good week adds ten table rows, two plan fields,
and zero new kinds.

---

## Suggested order

The first four are the short-term plan as of 2026-09-07 and are repeated in
[PLAN.md](../PLAN.md#what-is-next); the rest is the longer direction, if it is taken.

1. **The harness, as a failing test.** Built 2026-09-07: `src/game/bot/` bot-plays depths 1–25 and
   `harness.test.ts` asserts, under `it.fails`, the one thing already known — a shield-collecting bot
   cannot die past depth 4 or so. It prints the per-depth table from
   [findings.md](findings.md#measure-before-tuning) as a side effect, and `pnpm deep-run` prints it
   on its own; what it shows today is [recorded there](findings.md#measured-2026-09-07). **Not a
   tuning target** — the game is expected to change a lot before balance is worth optimizing, and the
   harness is there to keep that change honest. Flip the test to a plain `it` in step 2.
2. **Fusion**, in `applyCarry`. Smallest change, fixes the armour finding, makes the test pass,
   compresses the display. Independent of arcs, and the first built instance of
   [the break matures your inventory](elements.md#the-pomodoro-native-mechanics).
3. **One level plan.** Consolidate `ramp.ts` into a single `planFor(runSeed, depth) → LevelPlan` —
   plain data (beat, theme, curriculum entry, counts, knobs, which elements are switched on) computed
   once at the top of `makeBaseLevel` and consumed by the generator, instead of call sites pulling
   knobs independently. The depth-1 identity property becomes one assertion (`planFor(seed, 1)`
   equals the original's constants), the determinism test keeps its two-scalars shape, and the harness
   can sweep plans without generating levels. **This is the framework a level-2 element fits into**:
   "packs from depth 2", "a locked door on this level", "theme: deep sea" are all plan fields, and
   without the plan each one grows its own `if (depth >= n)` inside the generator. Do it before the
   elements, not during.
4. **A real level 2.** One or two elements from the [shortlist](elements.md#a-shortlist-if-five-things-get-built)
   that live in the cheap bins — feeding is a table column and a flag; packs and sleepers are two
   AI flags on the existing monster table — switched on by the plan at depth 2 and up, then played
   for a week. The point is to learn what an element *feels* like sixteen times a day, which no
   arithmetic can tell you, and to see how it fits the plan before more are added.
5. **Expand and theme the sprite tables.** Hand-curated, no generation. Prerequisite for arcs.
6. **Arcs and beats**, in the base pass via `ContentProvider` and the plan.
7. **The shop**, as a room you walk through.
8. **The work-interval heal**, and bread as its currency.
9. **Transformation**, once themes exist to transform into.

Parked, by decision: Ascend and shared seeds. See
[threads.md](../threads.md#parked-by-decision) for why.
