# Pomodorogue — where things stand

**What it is:** [Rogule](https://github.com/chr15m/rogule.com) — a lovely once-a-day roguelike —
ported from ClojureScript to TypeScript/React and turned into the *break* half of a pomodoro cycle.
Work 25 minutes, earn 5 minutes of dungeon. A level that outlasts its break freezes and resumes in the
next one. When a level ends the player chooses: descend and carry their stuff deeper, or start over at
depth 1. Repeating that choice is what makes the game either a progressive dungeon crawl or the
original's one-shot Rogule. Death ends the run either way.

**Status: it works, and it is played daily.** The port is complete and the pomodoro design is built.
What is *not* solved is the thing the whole premise depends on — being interesting sixteen times a day
instead of once.

---

## The docs

| | |
|---|---|
| [docs/design.md](docs/design.md) | **How the game works and what the code must hold to.** The settled stuff. Start here. |
| [docs/threads.md](docs/threads.md) | **Everything unfinished**, ranked, one place. |
| [docs/progression/](docs/progression/README.md) | The one large open design area: making depth 2+ interesting. Findings, two idea pots, and the leading proposal. |
| [docs/shared-seeds.md](docs/shared-seeds.md) | Designed, not built: a share string that names a level, and a link that opens it. |
| [docs/server.md](docs/server.md) | Deferred: a content service. Only the seam exists; read this before adding anything remote. |
| [docs/deploy.md](docs/deploy.md) | How `main` reaches pomodorogue.com. |

The port's phase documents were deleted once the port was done — `git log -- docs/port/` has them if
you ever want the reasoning behind a particular line. Everything still true was folded into
`docs/design.md`.

---

## What is built

- **A faithful port.** Generation, combat, monster AI, fog of war, share string. The finished port
  is preserved in git at `f6b54bc`; depth 1 is *not* frozen to it (invariant 1 in
  [docs/design.md](docs/design.md)), because the level a fixed-mode player meets sixteen times a day
  is the one the game most needs to be free to improve.
- **The pomodoro gate.** 25 minutes of work earns a 5-minute break; breaks do not stack; the break
  clock starts on the player's first action, so working past the bell costs nothing.
- **Freeze and resume.** A level that outlasts its break persists exactly as it stands and continues in
  the next one. Everything survives a browser reload.
- **The rest of the break is yours.** Finishing early never costs you time, and a synthesized bell
  announces the return to work so the player can be away from the screen.
- **Depth.** A finished level offers a choice; HP, inventory and XP carry down the stairs; difficulty
  ramps; death ends the run and `maxDepth` is the score. Two ways to play and no mode flag anywhere in
  the code.

## What is next

**The goal is to make the game interesting, now.** Not balanced — the game is expected to change a
great deal before balance is worth optimizing — but interesting enough at depth 2 that going deeper is
the obvious thing to do. Decided 2026-09-07; the reasoning is in
[docs/progression/README.md](docs/progression/README.md#suggested-order).

1. **[The harness, as a failing test](docs/threads.md#the-deep-game-is-unlosable).** A headless bot
   over depths 1–25 with one assertion: a shield-collecting bot cannot die past depth 4 or so. It fails
   today. It prints the per-depth table as a side effect, to read rather than to tune toward.
2. **[Fusion](docs/progression/ingredients.md#fusion--the-stairs-melt-your-pack-down)**, in
   `applyCarry`. Makes the test pass, and is the first built instance of [the break matures your
   inventory](docs/progression/elements.md#the-pomodoro-native-mechanics) — the pattern the rest of the
   pomodoro-native mechanics share.
3. **The level plan.** `planFor(runSeed, depth) → LevelPlan`, one data record consumed by the whole
   generator. The framework a level-2 element switches on through.
4. **A real level 2.** One or two elements from the
   [shortlist](docs/progression/elements.md#a-shortlist-if-five-things-get-built), on from depth 2
   via the plan, played for a week.

Parked by decision: [shared seeds](docs/shared-seeds.md) and Ascend. Everything unfinished is in
[docs/threads.md](docs/threads.md); the two defects worth slipping in anywhere are the unmutable bell
and the help text that never mentions the pomodoro.
