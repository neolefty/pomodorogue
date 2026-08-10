# Phase 7.5 — The rest of the break

**Outcome:** finishing a level early no longer sends you back to work early. The
break runs its full five minutes, clearing fast earns something, and the
hand-off to the work interval announces itself so the player can be away from
the screen when it happens.

**Status:** not started. Recommended by Bill on 2026-08-10 after playing phase 7.

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
3. **Finishing early pays.** See the open questions below for what the bonus is.
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

## Deliberately deferred

**A manual "start my work interval now" control.** Bill's call on 2026-08-10:
keep it automatic and as simple as possible for now. Worth recording how cheap
it will be when it is wanted — `endBreak(now, config)` is exactly that behavior
and already exists, so the manual path is phase 7's function gaining a button as
a caller, while the automatic path becomes the deadline arithmetic above.
Neither replaces the other.

## Open questions

1. **What is the bonus?** Two shapes, and they are not exclusive:
   (a) it feeds phase 8's `PlayerCarry` — HP, or an item, carried down the
   stairs; (b) it is a mark on the share string and a counter in `Statistics`.
   (a) makes finishing early a strategy and needs to be balanced against the
   monster ramp; (b) costs almost nothing and cannot unbalance anything. Decide
   with [08-depth.md](08-depth.md) rather than before it.
2. **Threshold or scale?** A flat bonus for clearing under some time is legible;
   one that scales with seconds left invites rushing, which is the opposite of
   what a break is for. Leaning threshold, or nothing time-based at all — a
   bonus for *clearing* rather than for clearing *fast* still rewards the good
   outcome without turning a break into a speedrun.
3. **Does a death get the countdown too?** The break is the break, so probably
   yes for the countdown and obviously no for the bonus.
4. **Where does the sound come from, and when is it unlocked?** Browsers block
   audio until a user gesture. The player has by definition acted — they
   finished a level — so create and unlock the `AudioContext` on the first
   action of the break, not at the transition, or the first one of the session
   will be silent. One short asset, self-hosted like everything else.
