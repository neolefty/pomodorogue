# Loose threads

**Everything unfinished, in one place.** Each item says what it is, why it is open, and what the next
concrete step would be. Nothing here is in progress.

**Where things live:** the roadmap is [PLAN.md](../PLAN.md); the rules that are *settled* are
[design.md](design.md); the one large open design area has its own room in
[progression/](progression/README.md). If an item here grows past a paragraph, it graduates into its
own doc and this file keeps a one-line pointer.

**The four that actually matter**, if you read no further: [measure the deep
game](#measure-the-deep-game), [progression](#progression--the-big-one), [shared
seeds](#shared-seeds), and [there is no way to mute the bell](#what-announces-a-transition).

---

## Blocking other work

### Measure the deep game

**Nothing about depth 2+ should be tuned until this exists.** `src/game/` runs in bare Node with no
DOM (invariant 6), so a script that generates depths 1–25 and drives a greedy bot through them gives
the real gear-accumulation curve, the real time-per-level and the real monster mix in seconds, instead
of the week of pomodoros that playing it would take. `takeTurn` already takes an injected `Rng`.

Everything in [progression/](progression/README.md) currently rests on arithmetic rather than
measurement. **Next step:** write the harness. See
[progression/findings.md](progression/findings.md#measure-before-tuning) for exactly which numbers it
needs to produce.

### Dying deep costs three hours

`advanceRun`'s retry branch sends the player back to depth 1 with the same seed. At depth 1 that reads
correctly as "the same level again". At depth 7 it costs about three hours of pomodoros, which makes
Descend a no-brainer to avoid for any cautious player — **so nobody goes deep enough to test the deep
game.** This is the most likely single reason the ramp is unmeasured.

Softening death is the wrong fix; failure should stay total. The two candidates are **Ascend** (retire
voluntarily at a shrine and bank `maxDepth`) and **bones** (find your own skull from a previous run).
See [progression/ingredients.md](progression/ingredients.md). Ascend is the smaller change and the one
that unblocks measurement.

---

## Open questions

Answer these when something needs them; none block anything today.

### What does finishing a level early earn?

Raised after playing the first pomodoro build. **Half answered:** the penalty is gone — finishing early
no longer hands you a longer wait — and Bill's call was to stop there, because *getting to play at all
is the bonus for having done the work.* A second reward inside the break has to earn its place.

Three candidates if it comes back, and they pull in different directions:

1. A `PlayerCarry` bonus — makes finishing early a strategy, and has to be balanced against the ramp.
2. A mark on the share string and a counter in `Statistics` — costs nothing, cannot unbalance anything.
3. Letting Descend start the next level *inside* the remaining break — deliberately declined, because
   two or three levels in five minutes makes the depth ramp much harder to tune. **This is the first
   one to revisit**, and that reason is the thing to weigh.

Whatever lands should reward *clearing*, not clearing *fast* — a bonus that scales with seconds left
turns a break into a speedrun, which is the opposite of what a break is for.

### What announces a transition?

Two halves are settled: **the end of the break should announce itself**, because that is what lets the
player be away from the screen, and **the start of a break should not fire a fixed alarm**, because
being summoned to play is an interruption rather than a service.

Open is everything else — a tone, a Web Notification, or either at the player's choice; what "pleasant"
means when heard sixteen times a day; and where settings live, given the game has no settings UI at
all. Expect to experiment rather than decide on paper.

Two constraints for whoever picks it up. A Notification reaches a player who has switched applications,
where audio from a backgrounded tab can be throttled or suspended outright. And **there is currently no
way to mute a sound the game plays unprompted** — that is the minimum any answer has to fix, and it is
the one part of this thread that is a defect rather than a design question.

### Should a shared level say how it went?

The share string could carry the result as well as the level — "I got to depth 7 and died here". It is
already most of the string. The question is whether spoiling the level is part of the fun or the end of
it. See [shared-seeds.md](shared-seeds.md).

### Can a visit be descended from?

A shared link as the start of a run rather than a one-off. It needs an answer for what carry a depth-7
start gets, which is the thing [shared-seeds.md](shared-seeds.md) deliberately does not have.

---

## Designed, not built

### Shared seeds

The share string names a level anyone can go and play, and a link opens it. Fully designed in
[shared-seeds.md](shared-seeds.md), including the gate rule that keeps a player from sending themselves
sixteen links. **This is the next feature-sized thing that is ready to build.**

### Progression — the big one

Depth-as-a-number has run out: the ramp cannot raise its own ceiling, and a progressive player becomes
literally unhittable somewhere around depth 10. The proposed replacement is depth-as-a-structure —
themed arcs with a fixed beat rhythm. **Nothing is decided.** See
[progression/README.md](progression/README.md).

### A content server

Deferred, and deliberately unbuilt — only the seam exists. Read [server.md](server.md) before adding
anything that looks like remote content, because the seam has rules. Note that
[progression/ingredients.md](progression/ingredients.md) argues the cheaper answer to "novelty" is
curating more twemoji by hand, and that the case for generation should be made *after* that, against
evidence.

---

## Chores

Small, unblocked, and owned by nobody.

- **Tell the timer states apart at a glance.** The five timer states differ in size, position and one
  colour on the digits — enough to *read*, not enough to *notice*. The player is meant to be looking
  away, so the state has to be legible from across the room and out of the corner of an eye. Leading
  candidate, Bill's: a big red tomato behind the work timer, so "back to work" is a shape rather than a
  word. Cosmetic only; nothing about the schedule changes.
- **Say what the pomodoro is, in the help.** `Help.tsx` is still the port of the original's help —
  arrows, monsters, shrine. Nothing in it mentions the gate, the break, the choice at the end of a
  level, or the bell that is about to ring. A newcomer clears their first level and meets a 25-minute
  countdown with no explanation of why.
- **A favicon, and a manifest to go with it.** `public/` is sprites only, so the tab is blank — sixteen
  times a day, for a game whose whole premise is that its tab is one of the ones you keep. `index.html`
  also claims `mobile-web-app-capable` with no manifest behind it.
- **`floorTiles` covers walls too.** The name is inherited from the original, where it was worth
  keeping for side-by-side reading. The port is done, so the reason is gone. Renaming is mechanical.

---

## Parked by decision

Not open — recorded so nobody reopens them by accident.

- **Raising `maxBankedBreaks` above 1** needs one further decision that is deliberately not being made:
  what consuming a banked break does to `nextPlayableAt`, given that `now + workMs` would silently wipe
  the rest of the bank. At a cap of 1 the question cannot arise. See [design.md](design.md#the-pomodoro-gate).
- **A manual "start my work interval now" button.** Kept automatic for simplicity. Cheap when wanted:
  `endBreak(now, config)` is exactly that behavior and already exists.
- **A seeded combat stream.** Nothing repeats exactly for anyone, including you, and that is the
  intended shape — there is no leaderboard. Small to add, large to unmake once anyone relies on it.
  **Revisit only if players ask for it.**
