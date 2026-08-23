# Progression — making a dungeon interesting sixteen times a day

**The problem in one sentence:** Rogule was designed to be played once a day, and Pomodorogue asks for
a level roughly sixteen times a day — so the thing that carries a player from break to break has to be
*structure*, not a number that goes up.

**Where it stands:** depth-as-a-number has run out. The ramp built for depth is arithmetically
incapable of making a level harder past a point, and a progressive player becomes literally unhittable
somewhere around depth 10. Both are verified against the code and written up in
[findings.md](findings.md). **Nothing about the replacement is decided.**

**Depth 1 is out of scope, permanently.** It is hash-pinned and byte-identical to the original, a
player who presses Start over every break gets exactly that game, and nothing designed here may reach
them.

---

## Operating facts

| | |
|---|---|
| Scope | Balance and progression from depth 2 onward |
| Status | Brainstorm and design sketch. Not scheduled, not started, nothing committed to. |
| Blocked on | [Measurement](findings.md#measure-before-tuning) — nobody has bot-played a deep run |
| Files this would touch | `src/game/generator/ramp.ts`, `src/game/content/`, `src/game/carry.ts`, `src/game/engine/combat.ts`, `scripts/gen-sprites.ts` |
| Files this must not change the behavior of | `src/game/generator/*` at `depth === 1` — `generator.test.ts` pins two depth-1 seeds by hash |

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

- **Route 1 is depth 1, kept literally as is.** Not approximated, not re-tuned: the same bytes, still
  hash-pinned. A player who presses Start over every break gets the original game.
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

---

## Suggested order, if the whole direction is taken

1. **Measure.** Bot-play depths 1–25. Everything below is tuned against these numbers.
2. **Fusion**, in `applyCarry`. Smallest change, fixes the armour finding, compresses the display.
   Independent of arcs.
3. **Ascend**, at the shrine. Unblocks deep playtesting by making a deep run bankable.
4. **Expand and theme the sprite tables.** Hand-curated, no generation. Prerequisite for arcs.
5. **Arcs and beats**, in the base pass via `ContentProvider` and a themed ramp.
6. **The shop**, as a room you walk through.
7. **The work-interval heal**, and bread as its currency.
8. **Transformation**, once themes exist to transform into.

**Steps 2 and 3 are worth doing whatever happens to the rest** — the first fixes a confirmed defect,
the second unblocks the measurement everything else needs.
