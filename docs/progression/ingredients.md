# Stew ingredients

**The idea pot.** Everything on the table for making depth 2+ interesting, whether or not it fits
together yet. This is an inbox, not a plan — an untested idea sitting here costs nothing, and the
worked-out synthesis lives in [arcs.md](arcs.md).

**To add one:** append it under the right heading with the four lines from the template at the bottom.
Do not rank it, do not reconcile it with anything, do not wait until it is good.

**Status vocabulary:** `leading` (the current answer unless something better turns up) · `promising`
(worth building, nothing blocking it) · `raw` (unexamined) · `declined` (recorded so it is not
reopened by accident).

**Two bars every ingredient has to clear** (from [README.md](README.md#two-things-to-hold-onto-while-brainstorming)):
choices are expressed as *where you walk*, and a five-minute break has no time to lend.

---

## Fixing the two findings

### Fusion — the stairs melt your pack down

`leading` · fixes the [armour finding](findings.md#armour-reaches-full-immunity-and-it-is-armour-not-weapons)
· small, one function · independent of everything else

**In `applyCarry` only** — which by construction never runs at depth 1 — the carried inventory
collapses into **one weapon and one shield**. Each keeps the sprite of its best contributor, and its
value is the diminishing sum: sort descending, weight `1, ½, ¼, ⅛, …`, so infinitely many daggers
converge on twice the best single one.

Four things fall out:

- **Armour is bounded.** A log curve cannot reach 10, so immunity stops being reachable.
- **The inventory strip stays two-to-four items forever** instead of growing to forty — "compress the
  displays", got for free rather than as display work.
- **Depth 1 is untouched**, by construction rather than by care.
- **The scaling is free art.** Render the fused sprite at `scale(1 + dmg/10)`: a big axe is a big axe.
  No new assets, no asset pipeline.

This is "carry only your best weapon and armour" with the sharp edge filed off. Pure best-only throws
away everything a careful player collected, which feels like punishment for playing well; diminishing
returns keeps collecting meaningful while capping where it goes.

### Reconcile the depth floor with the difficulty scale

`promising` · fixes the [ceiling finding](findings.md#the-ramp-compresses-variety-it-cannot-raise-the-ceiling)
· one line, real risk · the fallback if arcs never happen

Apply the depth floor *after* `MONSTER_DIFFICULTY_SCALE` rather than before, or raise the floor's cap
to `1 / 0.75`. Do not take it without reading the clamping note in `ramp.ts` — done carelessly it moves
item placement too, and depth 1 must not move. [Arcs](arcs.md) dissolve the problem instead, by giving
each theme its own table to index within.

### Partial reset at a boundary

`raw` · route 2 from [README.md](README.md#the-three-routes) · unknown cost

Carry a fraction of loot and XP rather than all of it. **Per level it is a tax the player feels
constantly and cannot plan around**; per *arc* it is a rhythm they can play toward, which is why arcs
give it a natural home. Fusion may already be enough of a squeeze — decide after
[measuring](findings.md#measure-before-tuning).

---

## Structure

### Arcs and beats

`leading` · the synthesis · see [arcs.md](arcs.md)

Depths 2 onward grouped into themed arcs of four levels with a fixed rhythm — intro, escalate, shop,
boss. Fixed rhythm, shuffled themes. It is the only idea here that addresses the actual problem rather
than tuning a curve that has no ceiling left.

### The shop, as a room you walk through

`promising` · the item sink · needs `ItemTemplate.price`

Items on the floor with a price above each one. **You walk onto what you can afford; that is the
purchase.** No menu, no new verb, no new input. Not everything is affordable, walking out without
buying is a legal move, and layout carries information — the expensive thing is at the back, and
walking to it costs turns. Full write-up in [arcs.md](arcs.md#the-shop).

The shop is the answer to *what do I do with all this treasure*: **nothing is ever consumed today**,
which is why the economy has no shape. A player who spends is weaker in materials and stronger in
equipment, which is a trade, which is a decision.

### Ascend — the third button

`promising` · unblocks deep playtesting · small

Retire voluntarily at a shrine: bank your depth, keep `maxDepth` as the score. Failure stays total; the
player chooses when to stop risking it. This is the cheap half of the fix for [dying deep costing three
hours](../threads.md#dying-deep-costs-three-hours), which is probably the reason nobody has played deep
enough to tune anything. **With arcs, the arc boundary is the obvious place to offer it** — you have
just beaten a boss, and "keep going or bank it?" is exactly the right question at exactly that moment.

### Bones

`promising` · the better half of the same fix · needs the overlay pass

You find your own skull from a previous run, with part of your old pack on it. Zero new player-facing
rules, softens death's cost without removing failure, and it is emotionally the best thing a permadeath
game can do. **This genuinely is history, so unlike arcs it belongs in the overlay pass** — it would be
its first real tenant.

---

## Pacing and the body

### The work interval is the heal

`promising` · thematically perfect · inert in fixed mode by construction

Regeneration is currently 1 HP per 100 **moves**, which rewards staying at the keyboard mashing arrow
keys — the exact opposite of what the break is for, in a game whose whole premise is that you should be
looking away.

**Completing a work interval restores HP.** You rest while you work. It removes the mash-to-heal
incentive, and a fixed-mode player already starts every level at full HP so nothing about depth 1
changes. Add it *alongside* the per-move regeneration rather than replacing it.

### Max HP should have a curve

`promising` · **HP is the variance knob** · needs a mechanism

Player max HP is hard-coded to 10 forever. This is the single biggest reason deep combat is swingy
rather than skillful: more max HP means more exchanges per fight, means play beats luck. A game that
wants patience to matter more than luck has to let the player buy rolls.

Two mechanisms, not exclusive:

- **Bread as +1 max HP** — rare, deep, capped around 20–25 so the endgame stays lethal.
- **Bread as a work-interval heal** — carrying bread converts the next 25 minutes into healing, and is
  consumed. **The more interesting of the two**, because it makes *"I am at 3 HP with no bread —
  descend anyway?"* the first genuinely difficult descend decision the game has, and because it
  consumes something.

If only one: the second. If arcs and a shop land, max HP is the natural premium purchase.

---

## Look and feel

### Transformation — you become what you defeated

`promising` · cosmetic · free art

`playerSpriteFor(...)` with depth 1 = elf, so the hash pin holds untouched. **With arcs there is a
better rule than a fixed gradient: beat an arc's boss, take its form for the next arc.** It is a
feedback loop, it makes the share string tell a story, and the sprites are already loaded.

It also solves its own worst problem: a player rendered as a dragon on a level full of dragons is a
legibility bug — but since consecutive arcs never repeat a theme, **you are never the same species as
the monsters around you.** The variety constraint pays for itself twice.

The straight gradient (elf → dwarf → orc → ogre → dragon → **lawnmower**) is the fallback if arcs do
not happen, and the joke is worth keeping either way — one break in an otherwise straight sequence is
where the humour lives.

**Keep it cosmetic.** The moment a mouse is fast-but-fragile, the player has a real choice with real
cognitive load, and the thing that made this cheap and delightful becomes a mechanic to balance.

### Curate more twemoji

`leading` · prerequisite for arcs · an afternoon

We use 32 of roughly 3,700 twemoji, 11 of them monsters. The pool can go to sixty entries by hand, in a
visual language that is already perfectly coherent — flat, chunky, readable at 24px. Themes assembled
entirely from real twemoji, to show the pool is deep enough:

| theme | drawn from |
|---|---|
| vermin | rat, bat, spider, scorpion, snake, bee, ant, cockroach, mosquito, fly |
| forest | boar, wolf, bear, deer, eagle, owl, hedgehog, badger |
| undead | ghost, zombie, vampire, skull, goblin, ogre, japanese-ogre, clown |
| deep sea | octopus, squid, shark, crab, lobster, jellyfish, blowfish, whale |
| dinosaurs | t-rex, sauropod, crocodile, lizard, turtle, dragon |
| machines | robot, alien-monster, flying-saucer, rocket, gear, hammer, wrench |

The lawnmower's natural home is the machines arc, which is also the funniest place for it.

### Generated sprites and monsters

`declined for now` · see [../server.md](../server.md) · a server and a budget

The two approaches scale on different axes, and that is the whole argument:

- **Pre-compiled scales with the size of the table.** A 60-entry table covers depth 1 through infinity,
  because depth *indexes into* a table. One-time cost, **curated output — which is the actual fix for
  "mixed results with AI sprites", since you throw away the bad 70% before anyone sees it** — plus
  HTTP-cached, offline, no server, no per-play cost, deterministic, shareable.
- **Runtime generation scales with plays**, which is the wrong axis: sixteen breaks per day per player,
  forever. It needs a server (keys cannot ship to the client), needs a `(runSeed, depth)` cache anyway
  to satisfy `ContentProvider`'s purity contract, needs the builtin fallback anyway, and cannot be
  curated because nobody sees the output before the player does. AGPL §13 means the server's source is
  offered too.

The one genuinely unusual argument for runtime generation: **there are 25 known-idle minutes before the
player needs the next level** — enough to generate, quality-filter, and silently fall back. Almost no
other game has that.

**Recommended order regardless:** expand and theme the tables by hand first. If novelty is still the
problem after arcs, fusion and transformation have landed, *then* the case for generation is a real one
made against evidence. The prior is that novelty per level does not need new art — it needs new
combinations.

---

## Raw — unexamined, added to the pot

Nobody has worked these through. They are here so they are not lost.

### The break has a shape across a day

`raw` · uses the one thing this game knows and Rogule did not

Sixteen breaks in a day is a *sequence*, and the game currently treats each as interchangeable. The
first break of the morning, the one after lunch and the last of the afternoon are different moments to
the player. Nothing needs to change mechanically for this to be interesting — a shorter level after
lunch, an arc that lands its boss at the end of a work morning — but note that anything reading the
wall clock lives in the UI layer, never in `src/game/`.

### A level with a different verb

`raw` · variety without new content

Every level is currently "reach the shrine". Occasionally it could be "get out before something
catches you", or "the shrine is guarded and you can leave without it". No new art and no new input —
the same four arrow keys — but a genuinely different five minutes. Watch the cognitive-overhead bar:
the player must be able to tell which kind of level it is *by looking at it*.

---

## See also

The other pot: [elements.md](elements.md) is the deck of *learnable elements* — terrain, monster
behaviours, room types, uses for loot, and the mechanics only a pomodoro game can have. Its shortlist
(feeding, the travelling garden pot, packs and sleepers, keys, two shrines) is the cheapest set of
decisions-per-mechanism anyone has proposed, and several entries there — the forge, two shrines, the
graveyard — are positional restatements of ingredients here.

---

## Template

```markdown
### Name

`raw` · what it fixes · rough cost · what it depends on

Two or three sentences. What it is, and the one thing that makes it worth trying.
```
