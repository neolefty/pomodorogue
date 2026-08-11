# Phase 7.5 — The rest of the break

**Outcome:** finishing a level early no longer sends you back to work early. The
break runs its full five minutes however the level ended, and the hand-off to
the work interval announces itself so the player can be away from the screen
when it happens.

**Status:** landed 2026-08-11, except the bonus, which was decided against for
now — see "The bonus is not built" below. Recommended by Bill on 2026-08-10
after playing phase 7; built on 2026-08-10, reviewed and corrected on
2026-08-11 (see "Fixed in review").

## The problem with what phase 7 shipped

Phase 7 ends the break on a win, a death, or the clock — all three set
`nextPlayableAt = now + workMs`. For the clock that is right. For a win it is
backwards: clear a level in ninety seconds and phase 7 hands you a *longer* wait
than someone who dawdled, and it does it at the moment the player has most
earned a rest. The five minutes are the player's; finishing early should not
forfeit the remainder of them.

It also makes the game the point. A pomodoro break is supposed to get you off
the screen — classic pomodoro would not put a video game here at all — and phase
7 gives a fast player nothing to do but stare at a 25-minute countdown.

## What changes

1. **A win or a death ends the *level*, not the *break*.** The work interval
   starts when the break was always going to end. On an outcome, set
   `nextPlayableAt = breakStartedAt + breakMs + workMs` rather than
   `now + workMs`. The freeze path is untouched — it already ends at the
   deadline, which is the same arithmetic.
2. **The tombstone shows two countdowns in sequence:** the rest of the break
   first, then the work interval. It already takes its footer as a node
   (`Tombstone`'s `footer` prop), so this is a change in App, not in Tombstone.
3. ~~**Finishing early pays.**~~ Not built. See "The bonus is not built" below.
4. **A sound at the break → work transition**, which is the whole point of the
   encouragement: telling someone to step away from the screen is empty if the
   only thing that tells them the break is over is on the screen. The sound is
   what makes leaving possible, not decoration.
5. **Encouragement to actually leave**, shown on the tombstone alongside the
   remaining-break countdown.

### The schedule needs no new field

The break's end is already recoverable: it is `nextPlayableAt - workMs`. So the
tombstone can show the rest of the break while `now < nextPlayableAt - workMs`
and the work countdown after, without adding to `Schedule` and without a
`schemaVersion` bump. Do it that way. `breakStartedAt` still goes to null on the
outcome, because the break clock is not what is being counted any more.

**Built as `workStartsAt` plus a three-way `phaseAt`** in `src/pomodoro/schedule.ts`:
`playing` (a break is available), `resting` (the level is over, the break is
not), `working`. The phase is derived from the clock on every tick rather than
signalled at the transition, which is what makes the two paths into `working`
— a level frozen on the deadline, and a level finished early whose break then
ran out — need no separate handling in `App`. It is also what makes the bell one
effect instead of two call sites. `resting` is the moment phase 7 had no name
for, and adding the name is most of the phase.

**One arithmetic for all three endings**, and it is `endBreakAtDeadline` in
`schedule.ts`: `endBreak(breakDeadline(schedule, config) ?? now, config)`. The
freeze path already computed exactly that, and phase 7's bug was that the
outcome path used `endBreak(now, config)` instead — a bug in the *caller*, which
is why it lives in the schedule module now rather than in `App`, where a pure
expression could not be tested. The fix is the two paths sharing one function
rather than growing a branch. `move` also runs `startBreakClock` *before* the
outcome branch so that a level cleared on the very first move of a break still
has a deadline to end at, instead of falling through to `now` and forfeiting the
five minutes in the one case that most obviously earned them.

## Deliberately deferred

**A manual "start my work interval now" control.** Bill's call on 2026-08-10:
keep it automatic and as simple as possible for now. Worth recording how cheap
it will be when it is wanted — `endBreak(now, config)` is exactly that behavior
and already exists, so the manual path is phase 7's function gaining a button as
a caller, while the automatic path becomes the deadline arithmetic above.
Neither replaces the other.

## The bonus is not built

**Bill's call, 2026-08-10: ship the timers, leave the bonus until there is a
shape worth having.** The reframing that settles it — *getting to play at all is
already the bonus for having done the work.* The break is the reward the work
interval buys; a second reward layered inside it is not obviously earning
anything, and phase 7.5's actual complaint (finishing early costs you time) is
fixed by the timers alone.

So item 3 above is not implemented, and neither the share string nor
`Statistics` gains a field for it. What the two candidate shapes were, if it
comes back: (a) feed phase 8's `PlayerCarry` — HP or an item carried down the
stairs, which makes finishing early a strategy and has to be balanced against
the monster ramp; (b) a mark on the share string and a counter in `Statistics`,
which costs almost nothing and cannot unbalance anything. Revisit alongside
[08-depth.md](08-depth.md), not before.

**If it does come back, it should probably not be time-based at all.** A bonus
that scales with seconds left invites rushing, which is the opposite of what a
break is for; even a flat under-the-threshold bonus rewards hurrying. A bonus
for *clearing* rather than for clearing *fast* gets the good outcome without
turning a break into a speedrun.

## Settled while building

**A death gets the countdown, and would not have got the bonus.** The break is
the break — it is not a reward for winning, it is the five minutes the work
interval bought, and dying does not hand them back. Both outcomes take the same
path in `App`, which is why there is no branch on `outcome` anywhere in the
schedule arithmetic.

**The sound is synthesized, not an asset.** Three decaying sine partials at
bell-ish inharmonic ratios, about a second and a half, in `src/ui/useChime.ts`.
An `AudioContext` was needed regardless — for a file it would have to be created
and unlocked exactly the same way — so a file would have added a download, a
license to track in `NOTICE.md`, and a fetch that can fail, in exchange for a
nicer timbre. Swap it for an asset later by replacing one function; nothing
outside the hook knows which it is.

**Unlocked on the first user gesture of the session, not the first move.** The
spec suggested the first action of the break, reasoning that finishing a level
proves the player acted. True, but too narrow: a player who reloads the tab
while the tombstone is up never acts again, and the bell they most need — the
one that lets them walk away — is the one that would be silent. So the hook
listens once for `pointerdown` or `keydown` anywhere and keeps the context. When
there has genuinely been no gesture, `ring()` is a no-op; the browser would have
refused the sound anyway, and silence beats a console error.

**No sound at the work → break transition,** though the hook is already there to
ring it. Out of scope here, and on 2026-08-11 it stopped being merely deferred:
being summoned to play is an interruption rather than a service, so if that
transition ever announces itself it will not be with a fixed alarm. See open
question 7 in [PLAN.md](../../PLAN.md), which also carries the unanswered half —
what the break → work announcement should sound like, whether it should be a Web
Notification instead, and how the player turns it off.

## Fixed in review

Three things a read-through on 2026-08-11 turned up, all now fixed.

**The bell no longer rings for news that is hours old.** `phaseAt` is derived
from a clock that only advances while someone is watching, so `working` is
entered when the transition is *noticed*, not when it happened. A laptop shut
through the end of a break crosses the edge on whatever ticks first after it
wakes — and rang a bell announcing a work interval that started twenty minutes
ago, to a player visibly back at their desk. `workJustStarted` now gates it on
`bellWindowMs`, a new `PomodoroConfig` duration at two minutes: above every
legitimate delay (a hidden tab ticks about once a second, and drops to once a
minute only after five minutes hidden, which a five-minute break cannot outlast)
and far below an illegitimate one.

**The bell also asks for the audio context back before using it.** Unlocking
once is not running forever — sleep or a backgrounded tab can suspend a context,
and a suspended one has a frozen `currentTime`, so the partials were being
scheduled against a clock that was not moving. `ring` now calls `resume()` every
time. It is a no-op on a running context, and this is precisely the feature whose
whole premise is that the player has been away.

**The test that named phase 7's bug could not have caught it.** It compared two
identical `endBreak(deadline)` calls, so it held under phase 7 too — the bug was
never in `endBreak` but in what `App` passed it, and `App` has no tests.
Extracting `endBreakAtDeadline` (above) made the real arithmetic a pure function,
and the rewritten cases drive it from a break in progress: cleared at 1:30 and
dawdled to 4:00 must land on the same `nextPlayableAt`, and a freeze noticed four
hours late must still start the work interval at the deadline. Passing `now`
through instead of the deadline now fails eight tests.

## Fixed in passing: the second player on a frozen board

Bill, playing on 2026-08-11, saw a stray player sprite appear near the top-left
corner for the length of a work interval and vanish when play resumed. Phase 7's
`#game.frozen` rule carried `filter: grayscale(0.8)`, and a non-`none` filter
makes its element a containing block for every absolutely-positioned
descendant. `#game` is not otherwise positioned, so `#health-bars`, `#inventory
ul` and `#arrow-buttons` resolved against the viewport while playing and against
`#game` while frozen — and moved on every freeze. The visible one was the
player's own face at the head of the health bar, which is why it read as a
second player rather than as a layout shift.

Fixed by dropping the filter. `opacity` makes a stacking context but not a
containing block, so the dimmed-and-inert reading survives with nothing moving.
Anything that wants the grayscale back has to filter a wrapper around the grid
alone, clear of those three.

## Open questions

None owned by this phase. The bonus is deferred by decision rather than open —
see above. Two things this phase started are parked in [PLAN.md](../../PLAN.md)
instead, because neither is phase 7.5's to finish: open question 7, on what a
transition should announce and how much of it the player chooses; and a to-do to
stop `.timer.rest` and `.timer.break.warn` sharing `#cc7722`, which currently has
the same colour meaning "hurry" in one place and "relax" in the other.
