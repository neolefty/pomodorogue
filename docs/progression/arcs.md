# Arcs — depth as a structure

**The proposal:** depths 2 onward are grouped into **arcs** of four levels with a fixed beat structure
and a per-run theme. **Nothing here is decided**, and no code has been written against it.

**Why it beats tuning the ramp:** the [findings](findings.md) are that the difficulty curve has no
ceiling left to raise and that depth currently *narrows* the monster range rather than widening it.
Arcs replace the number with a structure — each theme brings its own table, sized and ordered for its
own arc, so deeper means *a new collection* rather than a thinner slice of an old one.

**Depth 1 belongs to no arc, and the first real arc starts at depth 2.** Depth 1 was balanced as a
standalone puzzle and is hash-pinned; making it the intro beat of arc 1 would mean either re-tuning it
or accepting a beat that does not fit its own rhythm.

---

## Terms

None of these exist in the code.

- **arc** — a themed group of consecutive levels, proposed as 4, with a fixed beat structure. Depths
  2–5 are arc 1, 6–9 arc 2, and so on.
- **beat** — a level's role within its arc: `intro`, `escalate`, `shop`, `boss`.
- **theme** — the monster and item tables an arc draws from. Themes are picked per run; beats are
  fixed.
- **curriculum** — the order new elements are introduced across a run's depths (the elements
  themselves are catalogued in [elements.md](elements.md)). Drawn per run, like themes; see
  [The curriculum](#the-curriculum--which-element-arrives-when).

```
depth  1  │ 2      3         4      5     │ 6      7         8      9     │ ...
          │ intro  escalate  shop   boss  │ intro  escalate  shop   boss  │
arc       │ ─────────── arc 1 ─────────── │ ─────────── arc 2 ─────────── │
theme     │ (picked per run from runSeed)  │ (picked per run)              │
```

## The beats

| beat | depth mod 4 | what it is |
|---|---|---|
| `intro` | 2 | The theme's easy end. Two or three species, small counts, generous cover. Teaches what this arc's monsters do. |
| `escalate` | 3 | Same collection, bigger members, plus one or two species not yet seen. Counts up, cover down. |
| `shop` | 0 | A room of purchasable items. Currency is what you have foraged. See [The shop](#the-shop). |
| `boss` | 1 | One large themed monster, placed deliberately rather than by difficulty roll, near the shrine. Clearing it ends the arc. |

**Four levels per arc is the better default.** It makes an arc one work morning, it gives the shop a
level where spending is the whole point rather than a distraction from a boss fight, and it means a
player who banks nothing still meets a shop every two hours. Three is tighter but collides the shop and
the boss — worth trying if arcs feel long, but note that a level can freeze and span two breaks, so an
arc's *minimum* wall-clock is already its floor rather than its typical.

## Rhythm is fixed, content is shuffled

**The beat structure is the same in every arc; the theme is drawn per run.** That split is
load-bearing:

- **Fixed rhythm** means the player always knows a shop is two levels away and a boss is at the end.
  That is what makes planning possible — and planning is what turns accumulated treasure from clutter
  into a decision.
- **Shuffled themes** mean two runs are not the same run, which is what the game needs to survive being
  played sixteen times a day.

`themeFor(runSeed, arcIndex)` is a pure function of two scalars, which keeps everything below in the
base pass. **Consecutive arcs must not repeat a theme** — partly for variety, and partly because it
makes [transformation](ingredients.md#transformation--you-become-what-you-defeated) work for free.

"Oops, all dinosaurs" is exactly a theme, and worth having in the pool as the joke it is.

## The curriculum — which element arrives when

[elements.md](elements.md) sets the working rule — one new element per level, introduced alone before
it composes — and the beats give it a rhythm: the intro beat teaches, the escalate beat composes. What
that leaves open is *which* element arrives at each depth, and the answer is the same split as themes:
**cadence is fixed, order is drawn per run.**

- **Cadence is a property of the beat.** One new element on `intro` and one on `escalate`; none on
  `shop` or `boss`. A fixed cadence is what keeps difficulty tunable and the player never learning two
  things at once.
- **Order is a per-run sample of a prerequisite DAG.** Elements declare prerequisites as plain data —
  dough needs flour, flour needs wheat — and the curriculum is a seeded topological sample: drawn once
  from `runSeed`, indexed by depth. A pure function of the two scalars, so it is base-pass content
  like everything else in this document.
- **Same seed, same curriculum.** Two runs differ; two players on one seed do not. The recipient of
  `#Pomodorogue 48213/5` meets the same wheat field, which is what keeps a shared level naming one
  level.

**Prerequisites are over the curriculum, never over the player's history.** This is this section's
version of the boss-feels-like-overlay mistake. "Dough comes after wheat" means wheat was *scheduled*
shallower in this run — not that the player picked any up. Gating on possession would drag generation
into the overlay, break seed-sharing (the recipient's run went differently), and stall the curriculum
for a player who walked past the wheat field, with no way to show them why. Missing a prerequisite is
ordinary roguelike consequence: the dough level arrives and you have nothing to proof. If an element
is genuinely useless without its prerequisite *item*, the fix is making the item obtainable again —
the shop restocks flour — not gating generation on inventory.

Two boundary notes. **Depth 1 sits outside the curriculum**, the same way it sits outside the arcs.
And **element ids are a closed union**, the same doctrine as `EntityKind`
([design.md](../design.md#7-gamestate-is-json-serializable-and-behavior-is-named-by-a-kind)): a
curriculum can only schedule behavior the engine implements, so externally-supplied content cannot
name an element that does not exist.

One measurable bonus: a curriculum that is a pure function of `runSeed` is sweepable. The
[measurement harness](findings.md#measure-before-tuning) can enumerate thousands of orderings and flag
any that spike — kettle-before-fire problems — before a human plays one.

## Arcs belong in the base pass, not the overlay

**This is the thing most likely to be got wrong by whoever implements it.** A boss and a shop feel like
"special content" and therefore feel like overlay-pass material. They are not.

The overlay exists for **history** — what this run did. A boss at depth 5 is a function of `depth`
alone; a theme is a function of `(runSeed, arcIndex)`, and `arcIndex` derives from `depth`. Both are
pure functions of the `LevelRequest` the base pass already receives, so both are base-pass content, and
putting them there costs nothing and buys a lot:

- **No overlay pass is needed for any of this**, so it stays a named seam with no implementation.
- **The generator's determinism test keeps its "two scalars in, same level out" shape.**
- **Shared levels keep working**: `#Pomodorogue 48213/5` names somebody's boss level, and the recipient
  meets the same boss.

The rule to hold: *if it can be computed from `{ runSeed, depth }`, it is base-pass content, however
special it feels.* See [design.md](../design.md#4-generation-is-a-base-pass-with-a-named-overlay-seam).

## What arcs do to the two findings

- **The ceiling problem dissolves.** A spawn indexes within a theme rather than within one 11-entry
  global list, and the boss is placed explicitly rather than reached by difficulty index — so the
  strongest thing in an arc is never something the arithmetic has to be able to reach.
- **The compression problem inverts.** Deeper means a new collection, not a narrower slice of an old
  one. This is the same goal a content server wanted a language model for, met with curation instead.
- **The armour problem gets a sink but not a fix.** The shop drains currency; it does not drain
  shields. Armour still needs [fusion](ingredients.md#fusion--the-stairs-melt-your-pack-down), and that
  is independent of whether arcs happen.

---

## The shop

**Every choice in this game is expressed as a position on the map** — that is the constraint the shop
has to satisfy, and it is what keeps the original's low cognitive overhead while adding real depth. The
player's entire input vocabulary is four arrow keys; a shop with a modal, a list and a confirm button
is a different game.

**So: the shop is a room with items on the floor and a price above each one. You walk onto what you can
afford; that is the purchase.** No menu, no new input, no new verb. The choice is which way you walk,
which is the only choice the game has ever asked for.

Consequences worth having:

- **Not everything is affordable**, so the room is a genuine decision rather than a pickup.
- **Walking out without buying is a legal move**, and sometimes right.
- **Layout carries information** — the expensive thing is at the back, and walking to it costs turns.

### Currency

`ItemTemplate.value` already exists, but it means *rarity* — `pickByValue` weights by `1/value`. Rarity
and price correlate naturally (chestnut 1, mushroom 2, gem-stone 8 is a plausible price ladder as it
stands), which makes reusing the field tempting.

**Add a separate `price` field anyway, defaulting to `value`.** The overload works right up until the
first item that should be cheap and rare, or common and dear, and by then the two meanings are wired
through every call site. The default keeps the initial change a no-op.

---

## Open questions

- **Three levels per arc or four?** Four is the recommended default. Three is tighter but collides the
  shop and the boss.
- **What does the boss actually do differently?** "One big themed monster" is a placeholder. It could
  simply be a high-xp, high-hp table entry placed near the shrine — which needs no new mechanism at all
  — or it could have behavior, which needs a new `EntityKind` and is a much larger change. **Prefer the
  first until it is proven boring.**
- **Does the arc boundary reset anything beyond fusion?** [Partial
  reset](ingredients.md#partial-reset-at-a-boundary) has a natural home here, but fusion may already be
  enough of a squeeze. Decide after [measuring](findings.md#measure-before-tuning).
- **What happens after the last theme?** With six themes an arc pool runs out around depth 25. Recycle
  with higher counts, or let this be where generated content earns its place.
- **Does depth 1 stay reachable in a long run?** Today "Start over" is the only way back, and it
  discards the run. A player who wants the original game every break still has that button — worth
  confirming that stays true after the choice screen learns about arcs.
