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

- **A faithful port.** Generation, combat, monster AI, fog of war, share string. **Depth 1 is
  byte-identical to the original and hash-pinned**, which is what keeps "did this work before the
  pomodoro changes?" a question anyone can still answer.
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

1. **[Measure the deep game](docs/threads.md#measure-the-deep-game).** A headless bot over depths 1–25.
   Nothing about depth 2+ should be tuned before it exists, and everything in `docs/progression/`
   currently rests on arithmetic rather than measurement.
2. **[Shared seeds](docs/shared-seeds.md).** Fully designed and ready to build — the next
   feature-sized thing.
3. **[Progression](docs/progression/README.md).** The big one, and nothing about it is decided. The
   depth ramp is arithmetically incapable of getting harder, and a progressive player becomes
   unhittable around depth 10. Brainstorming is open.

Two small things are worth doing whatever happens to the rest:
[fusion](docs/progression/ingredients.md#fusion--the-stairs-melt-your-pack-down), which fixes a
confirmed defect, and [ascend](docs/progression/ingredients.md#ascend--the-third-button), which makes a
deep run bankable and so unblocks the measurement everything else needs.
