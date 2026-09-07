# Findings — what is actually known about the deep game

**Two findings, both verified against the code on 2026-08-22, and they point the same way: the deep
player is too strong, and the ramp cannot get harder.** Neither is a mistake — the ramp's own docs
flagged its numbers as unplayed guesses. These are the specific shapes those guesses turned out to
have.

**Everything here is arithmetic, not measurement.** The shapes need no measurement; the *numbers* do.
See [Measure before tuning](#measure-before-tuning).

---

## The ramp compresses variety; it cannot raise the ceiling

`placeMonster` (`src/game/generator/entities.ts`) computes:

```
difficulty = min(difficultyAtDepth(posToDifficulty(...), depth) * 0.75, 1)
```

`posToDifficulty` (`src/game/grid.ts`) is a *ratio* — path length to this tile over path length to the
furthest room — so its practical maximum is about 1.0, at the far end of the level. `difficultyAtDepth`
maps that onto `[depthFloor, 1]`, and `depthFloor` caps at 0.8. So the input to the table index is at
most 1.0 — and then `MONSTER_DIFFICULTY_SCALE = 0.75` is applied *after* it, capping the index at
`floor(0.75 × 10) = 7`.

Index 7 is the vampire. Running the real arithmetic across depths:

| depth | nearest tile → | furthest tile → |
|---|---|---|
| 1 | 0 rat | 7 vampire |
| 3 | 1 bat | 7 vampire |
| 5 | 2 ghost | 7 vampire |
| 8 | 4 wolf | 7 vampire |
| 11 | 6 zombie | 7 vampire |
| 30 | 6 zombie | 7 vampire |

Three consequences, in descending order of how much they matter:

1. **The genie, dragon and t-rex are unreachable as intended spawns at every depth.** They appear only
   through `pickMonsterIndex`'s ±2 blur, at weight 1 or 2 out of 12. **The top 27% of the monster table
   is decorative.**
2. **Depth's actual effect is compression, not escalation.** At depth 1 a level spans rat-to-vampire;
   at depth 11+ it spans zombie-to-vampire. The ramp makes deep levels *more monotonous* while barely
   making them harder — the opposite of what a difficulty curve is for, and the reason "deeper levels
   should introduce things you have not seen" currently gets *less* true with depth.
3. **The two constants were never reconciled.** `depthFloor`'s 0.8 cap and `MONSTER_DIFFICULTY_SCALE`'s
   0.75 were written independently — the 0.75 is the original's, from a game that only ever had one
   depth. `ramp.ts`'s comment claims the ramp reaches "the top of the table around depth 11 with
   headroom left"; the 0.8 is the *floor's* cap, and the scale below it means the **ceiling never moves
   at all**.

**The one-line patch, if [arcs](arcs.md) never happen:** apply the depth floor *after* the scale rather
than before, or raise the floor's cap to `1 / 0.75`. Small change, real risk — it moves item placement
too if done carelessly, and depth 1 should not move as a side effect of it. Do not take it without
reading the clamping note in `ramp.ts`.

---

## Armour reaches full immunity, and it is armour, not weapons

The long-standing worry named *weapon* stacking as the hole. Weapons are the smaller half. From
`src/game/engine/combat.ts`:

```
hpHit       = rng.int(their xp)          // uniform 0 .. xp-1
hpWeapons   = getWeaponsDmg(them)
hpArmour    = getArmourHp(me)
hpReduction = max(0, (hpHit + hpWeapons - hpArmour) * hit)
```

When a monster attacks the player, `them` is the monster — and **only the player is ever given an
`inventory`** (`src/game/entities.ts`; `placeMonster` builds no inventory field at all). So
`getWeaponsDmg(monster)` is always 0, and incoming damage is exactly
`max(0, rng.int(monsterXp) - playerArmour)`.

`rng.int(xp)` returns `0 .. xp-1`, and the highest xp in the table is the t-rex's 10. Therefore:

- **Armour 6 makes the player immune to everything through the vampire** — which is, per the finding
  above, everything the ramp actually spawns.
- **Armour 10 makes the player immune to the entire monster table, at any depth, forever.**

Shields are ~11% of the forage pool (`pickByValue` weights by `1/value`; shield's value of 3 gives it
0.333 of a 3.042 total). Deep levels hand out more loot than shallow ones — `entityCountFor` adds
covers and the drop chance is a flat 0.5 against a rising monster count. **Estimated at roughly one
shield per level, immunity arrives around depth 10–12 — precisely where every ramp knob has finished
moving.**

**The failure mode is not a player who wins too often but a player who cannot lose**, against a monster
range that has stopped widening. There is currently no chance of failure in the deep game.

**This answers the diagnostic question** that hung over the depth ramp — *is the deep game too hard, or
is the deep player too strong?* The two look identical from one playthrough and want opposite
corrections. The answer is **too strong**, and not marginally.

The fix should prefer not to touch depth 1 (invariant 1 in [design.md](../design.md)), which counts
against capping the effect in combat — summing weapons is what the original does within a level too,
so a cap changes depth 1 as fallout of a depth-2+ problem. That favours `applyCarry`, which never runs
at depth 1, and the leading candidate there is
[fusion](ingredients.md#fusion--the-stairs-melt-your-pack-down).

---

## Measured 2026-09-07

The first run of the harness below, with its one reckless policy (`collector` in `src/game/bot/`:
nearest shield first, then any item, then any cover, then the shrine, walking into whatever is in the
way). Twenty seeds to depth 12, and four to depth 25. Numbers from `pnpm deep-run`; rerun it rather
than trusting these once anything under `src/game/` moves.

**The deep game is bimodal: die at depth 1 or 2, or never.** Ten of twenty seeds kill the bot at
depth 1 or 2 — it takes every fight with 10 HP, which is the coin flip `engine.test.ts` already notes
for a depth-1 player walked straight at the shrine. All ten that get past depth 2 reach depth 12, and
both that were run on reach depth 25. No run died between depths 3 and 25.

**Immunity arrives far earlier than the estimate above, and for a second reason it did not weigh.**
Armour covers the level's hardest possible blow (`max(xp) − 1`, usually 5 for a vampire) from depth 1
to 7 on the surviving seeds, median about 4 — not depth 10–12. The last depth on which *any* blow
landed was 6 or shallower on every survivor; on seed 2 nothing lands after depth 1 with armour still
at 1, because **weapons kill on the first bump and a dead monster never retaliates.** Weapon totals
reach 20–35 by depth 10 (the bot's XP itself reaches ~35, one point per two kills) against a table
whose toughest hit points are 15. The finding above calls weapons "the smaller half"; in play they are
the half that ends fights before the armour question is even asked.

**Gear accumulates at about 0.6 armour per level** (16 by depth 25), below the "roughly one shield per
level" guess, and it does not matter: the threshold it needs to cross is 5, not 10.

**A level takes 75–300 turns, typically about 150** — two and a half minutes at one move a second, so
a break fits a level with room to spare even for a bot that lifts every cover. The full 25-depth sweep
is about 3,800 turns, an hour of play at that pace. `dugPercentageFor` is not the knob to reach for.

**The compression finding holds empirically.** Depth 10 and below is ogres, vampires, zombies and
genies, with a dragon through the blur every few levels and one t-rex in fifty deep levels.

---

## Measure before tuning

The two load-bearing numbers above — *when does armour reach immunity* and *how long does a deep level
actually take* — were estimates until the section above. `src/game/` runs in bare Node with no DOM or
React (invariant 6, kept precisely for this kind of thing), so both are cheaply measurable.

**A script that generates depths 1–25 and drives a greedy bot through them** gives all of it in seconds
rather than the week of pomodoros that playing it would take. It needs no new infrastructure —
`takeTurn` takes an injected `Rng`, and generation takes `{ runSeed, depth }` and nothing else. **It
exists:** `pnpm deep-run [seeds…]` prints one table per seed from `src/game/bot/harness.ts`, and
`harness.test.ts` prints the same table on every `pnpm test`. The bot is one `Policy`; the seam is
built for the others this table wants next ("with and without a greedy bot").

What it produces:

| number | why |
|---|---|
| Gear accumulation per depth — armour and weapon totals | Turns "roughly one shield per level" into a fact, and dates the immunity threshold |
| Turns per level, and wall-clock at a human pace | A five-minute break has no time to lend; this is the knob nobody has checked |
| Monster mix actually spawned per depth | Confirms the compression finding empirically |
| Death rate per depth, with and without a greedy bot | Distinguishes "hard" from "unlosable" |

**Do this before moving any number in `ramp.ts`.** `ramp.ts`'s own tuning note is the thing to check
first: *if levels start taking too long before they start feeling too hard, flatten `dugPercentageFor`
first* — it is the only knob that spends the player's time rather than their HP.

Findings from a real measurement belong in this file, above this section, dated.
