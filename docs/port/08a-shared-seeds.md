# Phase 8.5 — Shared seeds

**Outcome:** the share string names a level anyone can go and play, and a link opens it. "This one was brutal — two vampires and not a weapon in sight" becomes something you can hand to someone.

**Status:** not started. Requires phase 8, which is what makes depth worth naming.

## What identifies a level

Two numbers: **`runSeed` and `depth`**. Everything else about the base level derives from them — `levelSeed(request) = hashSeed(runSeed, depth)` (`src/game/rng.ts:52`), and `makeBaseLevel` reads nothing but the request and the content provider.

The level seed alone is not enough, which matters because it is what the share string prints today. `hashSeed` is one-way, so `#Pomodorogue 1809372812` names a level nobody can regenerate — the number is decorative. Print the pair instead:

```
#Pomodorogue 48213        (depth 1)
#Pomodorogue 48213/7      (depth 7)
```

and accept it back as `?seed=48213&depth=7`, with `depth` defaulting to 1. The original did the same thing more tersely, taking a bare valueless query key as the seed (`ui.cljs:342-346`); an explicit pair is worth the extra characters here because there are now two numbers and no daily default to fall back on.

## A visit is not a run

Opening someone's link starts a **visit**: that exact level, played with a standard fresh depth-1 player, scoring nothing. It does not touch the saved run — not its seed, not its depth, not its statistics, not the streak. When the visit ends, the choice screen offers one button: back to your run.

The reason is the same one that keeps carry out of the base generator. **A seed fixes the dungeon, not the run.** The depth-7 level that killed you killed you with the HP and inventory you happened to arrive with, and none of that is in the seed. Handing a visitor your carry would mean shipping a snapshot of your run, which is a different and much larger feature; handing them depth 7 with a fresh elf is honest about what a seed actually controls. They see the rooms you saw and the monsters you met. What happens next is theirs.

**The fights differ too, and that is deliberate.** Combat and monster AI draw from an entropy-seeded stream that is not derived from `runSeed` at all (see "Seeds control the world, not the story" in PLAN.md). Two people on one link walk the same dungeon and have different runs, and so does the same person twice. Nothing in this game repeats exactly, which is the intended shape — there is no leaderboard and nobody to compare against move for move. **Revisit if players ask for it**, and not before: a seeded combat stream is a small change to make and a large one to unmake once anyone relies on it.

## The gate, and the one hole to avoid

A visit is still play, so it still costs a break. Otherwise a player who wants unlimited play sends themselves sixteen links, and the scarcity the whole game rests on is gone.

**Recommended split, decided by whether there is a saved schedule:**

- **No saved schedule** — a newcomer arriving from someone's link. Play it immediately. There is no gate to bypass; the schedule starts when that level ends, exactly as `initialSchedule()` already arranges for a first visit (`schedule.ts:90`, playable immediately "because nobody should wait 25 minutes to find out what this is"). This is the case sharing exists for, and it is the case a 25-minute wall would kill outright.
- **A saved schedule** — an existing player. The visit is queued and plays at their next break, in place of the level that break would have generated. The landing screen says so and shows the countdown.

This closes the self-sharing hole while leaving the newcomer path wide open, and it needs no new rule — it is the schedule slot being absent, which already means "brand new here".

## Mechanics

A fourth localStorage slot, `visit: { runSeed, depth } | null`, with its own `schemaVersion` like the others:

- **Landing** on `?seed=…&depth=…` writes the slot. Do this at the edge, in the UI layer, alongside where `randomSeed` is minted — nothing under `src/game/` may read a URL any more than it may read a clock.
- **Playing** it: `advance`'s "nothing live to play" branch checks `visit` before it consults `run.next` (phase 8). If a visit is pending, generate `makeLevel({ runSeed, depth }, builtinContent)` with **no carry** and leave `run` completely alone.
- **Knowing you are in one**: the slot stays populated for the duration of the visit and is cleared when the visit level ends. `visit !== null` is the whole test, so `GameState` needs no new field and the level slot's shape does not change.
- **Scoring**: `recordOutcome` is skipped entirely while visiting. A visit that ends the break ends it the same way any level does (`endBreakAtDeadline`) — the break was spent either way.
- **A frozen level takes precedence.** The visit only ever lands in the branch that runs when nothing is live, so a run level frozen mid-break resumes first and the visit waits for the break after. Do not let a link interrupt a level in progress.

## Open questions

- Should the share string carry the *result* as well as the level — "I got to depth 7 and died here" — so a visitor knows what they are walking into? It is already most of the string; the question is whether spoiling the level is part of the fun or the end of it.
- Is there any reason to let a visit be descended from — a link as the start of a run rather than a one-off? It would need an answer for what carry a depth-7 start gets, which is the thing this phase deliberately does not have.
