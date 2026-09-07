# Loose threads

**Everything unfinished, in one place.** Each item says what it is, why it is open, and what the next
concrete step would be. Nothing here is in progress.

**Where things live:** the roadmap is [PLAN.md](../PLAN.md); the rules that are *settled* are
[design.md](design.md); the one large open design area has its own room in
[progression/](progression/README.md). If an item here grows past a paragraph, it graduates into its
own doc and this file keeps a one-line pointer.

**The two that actually matter**, if you read no further: [progression](#progression--the-big-one)
and [the deep game is unlosable](#the-deep-game-is-unlosable). The short-term order of work is in
[PLAN.md](../PLAN.md#what-is-next).

---

## Known defects

### The deep game is unlosable

Past depth 4 or so, a player who survived and picked up a few shields cannot die: incoming damage is
`max(0, rng.int(monsterXp) - armour)`, armour stacks without a cap, and the ramp never spawns anything
past the vampire. Both halves are worked through in
[progression/findings.md](progression/findings.md); the fix for the armour half is
[fusion](progression/ingredients.md#fusion--the-stairs-melt-your-pack-down).

**Next step: write the failing test.** `src/game/` runs in bare Node with no DOM (invariant 6), and
`takeTurn` takes an injected `Rng`, so a script that generates depths 1–25 and drives a greedy bot
through them runs in seconds. Its one assertion is the characterization above — *a shield-collecting
bot cannot die past depth N* — and it should fail today and pass once fusion lands. The same run prints
the per-depth table [findings.md](progression/findings.md#measure-before-tuning) asks for, but that
table is a printout to read, not a target to tune toward: the game is expected to change a great deal
before balance is worth optimizing, and the harness exists to keep that change honest, not to steer it.

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

Both ends of the break are now settled, and settled the same way: **each announces itself with its own
sound.** The end of the break was never in doubt, because a bell is what lets the player be away from
the screen. The start of the break was for a while decided the other way — being summoned to play
looked like an interruption rather than a service — and Bill reversed that after living with it: with
no chime, the player is pulled out of the work every few minutes to check whether it is time yet, and
that checking is the interruption. A chime lets them stop polling the clock, so it is the less
distracting of the two options. What it must not do is sound like the bell; it is softer, lower and
rising, and reads as "you may stop" rather than "come here". Both can be muted from the button top
right, which closed the one part of this thread that was a defect. The reasoning and the two sounds
are in [design.md](design.md#finishing-early-keeps-the-rest-of-the-break).

Open is what lies beyond a tone. A Web Notification reaches a player who has switched applications,
where audio from a backgrounded tab can be throttled or suspended outright; whether to offer one, and
whether instead of or as well as the sound, has not been tried. And nobody yet knows what "pleasant"
means for a pair of sounds heard sixteen times a day — the current two are a first guess to live with,
not a decision. Expect to experiment rather than decide on paper; there is now one toggle to hang a
second setting next to, if a second one is ever needed.

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
sixteen links. Ready to build, and parked (see below) until the level-2 work has a verdict.

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
- **The post-port rename pass.** A list deferred since phase 3 "to after the port, when `docs/port/`
  is deleted". Both halves are now due. Found 2026-08-16 while reading for legibility; the first item
  is the worst of them.
    - **`entityCount` means covers.** `ENTITY_COUNT = 15`, `entityCountFor(depth)` and
      `makeEntities(…, entityCount, monsterCount)` all count *covered items*, in files where
      `entities`, `EntityId`, `GameState.entities` and `makeEntities` itself mean the ordinary thing.
      The doc comments say "cover" throughout, so only the names are wrong. Inherited from the
      original's `entity-count`, and the identifier most likely to mislead somebody reading cold.
      `coverCount` and friends.
    - **`floorTiles` covers walls too.** Still true after the flatten to `Tile[]`: the representation
      changed and the misleading name did not. The name was worth keeping for side-by-side reading
      with the original; the port is done, so the reason is gone. `tiles`.
    - **`Placement` is bound to `g` at every call site** in `generator/entities.ts`. `b` for
      `Builder` is at least mnemonic; `g` is not short for anything in the name it carries.
    - **"golden hash" now names nothing.** The constant is `DEPTH_1_HASHES`, renamed on 2026-08-16
      when the ratchet became a tripwire (invariant 1 in [design.md](design.md)), and the old term
      survives only in history. The connotation is backwards: *golden* is testing vocabulary for an
      expected output you do not touch, which is exactly the property that was dropped. Keep the old
      term where it reports history, and make each such mention name the current constant once, so
      the term has a landing place instead of dead-ending.
- **Cover growth is capped by the monster constant.** `entityCountFor` is
  `ENTITY_COUNT + Math.min(MONSTER_COUNT, depth - 1)`, so covers stop growing at depth 6 because
  *monsters* do. The two caps genuinely coincide today, which is what makes it a trap: tuning monsters
  silently retunes loot, and the comment explaining why covers grow at all ("deep covers are emptier,
  so loot would dry up on the schedule the monsters got worse on") is an argument for the two moving
  *together*, not for one reading the other's constant. Give the cover ramp its own cap, even if it
  starts equal. Found 2026-08-16.

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
- **Ascend, and softening death generally.** The docs used to argue that dying at depth 7 costs three
  hours of pomodoros, so nobody would go deep, so the deep game could not be tested, so a button to
  retire and bank `maxDepth` was needed. Bill's call on 2026-09-07: that is the wrong diagnosis.
  Nobody has gone deep because the game is not yet interesting and nobody has been told it exists. A
  deep death costing a few breaks' worth of play is fine, and what makes it fine is enough content that
  the next run is different. Failure stays total. The one place Ascend might return is an arc boundary
  — "you just beat the boss; keep going or bank it?" — and that waits on arcs.
- **Shared seeds.** Designed and ready to build, but it competes for attention with making the game
  interesting and does not inform that question. Parked 2026-09-07 until the level-2 work has produced
  a verdict.
