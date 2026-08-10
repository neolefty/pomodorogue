# Phase 7 — Pomodoro

**Outcome:** the game becomes the break half of a pomodoro cycle. A five-minute break per 25-minute work interval, a level that freezes and resumes if it outlasts its break, everything surviving a browser reload.

**Status:** landed 2026-08-10, built as specified. Both of this phase's open questions were settled the same day (see "The gate" and "The break clock"). This is the first phase that changes the design rather than porting it.

One thing was added that this doc did not call for: `PomodoroConfig` has a
fourth field, `warnMs`, for how long before the end the advisory appears. The
doc asked for a warning "at 4 minutes" and asked durations to live in the config
so a test never waits — a hard-coded minute would have fired continuously under
a test config with a two-second break, which is the rot the config exists to
prevent. Everything else below is as written.

Phase 7.5 revisits one decision here — a win or a death should not start the
work interval early. See [07a-break-payoff.md](07a-break-payoff.md).

## Operating facts

| File | Purpose |
|---|---|
| `src/pomodoro/schedule.ts` | Pure gate logic. No React, no timers — takes `now` and a `PomodoroConfig` as arguments. |
| `src/pomodoro/usePomodoro.ts` | React binding: ticking clock, persistence. |
| `src/pomodoro/persistence.ts` | localStorage load/save, replaces `alandipert/storage-atom`. |
| `src/ui/Timer.tsx` | Countdown display; replaces `component-countdown`. |

Durations live in a `PomodoroConfig` defined in `schedule.ts`, not in module-level constants — see "The gate" below. Every function in `schedule.ts` takes it as an argument, the same discipline as `now`, so a test never sits through a 25-minute wait.

## What this replaces

The original's daily gate is spread across three places, all of which go away:

- `util.cljs` — `tomorrow`, `time-until`, `date-token`, `parse-date`, and the timezone-offset arithmetic. **Delete all of it.** These solved "when is midnight in the user's timezone", a question a 25-minute interval never asks. Do not port them; a relative-interval gate needs none of that complexity.
- `ui.cljs:229-243` — `component-countdown`, which counts down to tomorrow and offers a reload button.
- `ui.cljs:341-352` — `main!`, which derives the seed from today's date or a URL query param.

## State shape

Three separate concerns, persisted separately so a corrupt one doesn't take down the others:

```ts
type Schedule = {
  nextPlayableAt: number        // epoch ms
  breakStartedAt: number | null // null until the player's first action of this break
}
type Run = { runSeed: number; depth: number; carry: PlayerCarry | null; statistics: Statistics }
type Level = GameState | null   // the in-progress level, frozen or live
```

`breakStartedAt` sits on `Schedule` rather than on `Run` or `Level` because it
belongs to the break, not to either of them: a single level can now span
several breaks, and it gets a fresh clock in each one.

`carry` is always `null` until phase 8, which defines `PlayerCarry`
([08-depth.md](08-depth.md)) — it is listed here so the persisted shape doesn't
change underneath phase 8.

`GameState` is already JSON-round-trippable (enforced by a test from phase 3), so `Level` persists directly. That is what lets an in-progress level survive a reload — which matters, because a 5-minute break is exactly long enough for someone to accidentally close the tab. It is also the entire implementation of the freeze: a level that outlasts its break is persisted by the mechanism that was already there, and the next break rehydrates it. Freezing costs no new machinery.

## Version the save; never migrate it

*(Added 2026-08-10 in the cross-phase review after 5.5 landed.)* Round-trippable
is not the same property as compatible-with-yesterday's-build, and the sentence
above is easy to read as if it were. A `Level` written by one deploy and read by
the next is a different problem, and phase 5.5 sharpened it in three ways at
once:

- **Entity kinds are persisted strings, and an unknown one throws.**
  `runEncounter`'s `default` branch (`engine/movement.ts`) is a `never`
  assignment plus a `throw` — exhaustive at compile time, which says nothing
  about JSON from an older build. [08-depth.md](08-depth.md) now commits to
  renaming `'shrine'` → `'stairs'`, so a level saved before that deploy and
  rehydrated after throws the moment the player steps on it — inside `takeTurn`,
  the reducer the whole UI hangs off.
- **Tile codes are numbers now** (`TILE` in `types.ts`). Renumbering them, or
  inserting a code in the middle, silently reinterprets every saved tile: a wall
  becomes a door and the level is quietly wrong. The old string tiles at least
  failed loudly.
- **`Stats.hp` changed shape**, `[cur, max]` → `{ cur, max }` (5.5 §5). An old
  save's `hp: [10, 10]` deserializes to an object whose `cur` is `undefined`,
  and the health bar renders `NaN` rather than erroring.

**The fix is a version, and the response to a mismatch is to discard — never to
migrate.** `Level` carries a `schemaVersion`; on load, anything that isn't the
current value is dropped and the next break starts a fresh level at the same
depth. `Schedule` and `Run` are versioned too but survive: they are small,
stable, and the expensive things to lose. Throwing the level away buys never
writing a migration.

*(Amended 2026-08-10.)* Two things changed when the level-cap expiry became a
freeze rather than an abandon. First, this is now the **only** path that
discards a level — expiry no longer does, so there is no longer a
already-happens-anyway precedent to lean on. Second, the cost is no longer the
"five minutes of play" this paragraph originally claimed: a level may span
several breaks, so a discard can cost more than one. It is still bounded by a
single level where the run is bounded by nothing, and deploys that bump the
version are rare, so discard stays the right call — but say the real number,
not the flattering one.

Bump `schemaVersion` when entity kinds change, when `TILE` codes change, or when
`GameState`'s shape changes. Phase 8 will bump it for the stairs rename; say so
there when it does.

Leave the `throw` in `runEncounter` alone. Making it tolerant would hide a real
bug during development, which is the case it exists for. The tolerance belongs
at the load boundary, where the input is genuinely untrusted, not in the middle
of a turn.

## The combat stream does not persist

**Decision (final, 2026-08-09): combat randomness is entropy-seeded, so there
is no stream position to save.** Rehydrating a mid-level game creates a fresh
`Rng` from fresh entropy, exactly as starting a level does.

This settled in two steps. The stream was originally seed-derived
(`combatRng(request)`), which forced a choice on reload: accept that the stream
rewinds, or persist a draw counter and fast-forward. Both were designed before
the real question got asked — *what does seed-derived combat buy?* — and the
answer is nothing this game uses. Deterministic tests come from injecting a
fixed-seed `Rng` (see 05), the "play seed 12345" feature was always
world-only, and "run reconstructible from seed plus inputs" had no consumer.
PLAN.md's own razor — no complexity in the name of determinism beyond what the
generator test and the seed feature justify — cuts it.

One consequence: reloading mid-fight rerolls your upcoming luck with fresh
entropy. Mildly save-scummable, accepted because there is no leaderboard and
nobody to cheat but yourself. The freeze decision makes this routine rather than
incidental — every break boundary rehydrates the level and so reseeds the
stream. See "The break clock" below, which weighs that against the exploit the
freeze removes.

Reversal, if ever wanted, is a caller-side change only: the engine takes an
`Rng` parameter and does not know how it was seeded, so deriving it from the
seed again (plus persisting a draw count) touches level start and rehydrate,
nothing else.

## The gate

```ts
canPlay(schedule, now, config) => breaksAvailable(schedule, now, config) > 0
```

On break end — win, death, or freeze — set `nextPlayableAt = now + config.workMs`. *(Phase 7.5 narrows this to the freeze: a win or a death should let the rest of the break run rather than starting the work interval early. See [07a-break-payoff.md](07a-break-payoff.md).)* Deliberately *not* `previousNextPlayableAt + workMs`: the interval starts when you stop playing, so a long break doesn't eat into the next work block. Note this fires on freeze too, which is what puts a frozen level's next break a full work interval away rather than immediately.

### No banking, expressed as a cap

*(Open question 2, answered 2026-08-10.)* Breaks do not stack: skip three cycles and you get one break, not three. But the rule is a number in the config, not a boolean in the code.

```ts
type PomodoroConfig = {
  workMs: number           // 25 * 60_000
  breakMs: number          // 5 * 60_000
  maxBankedBreaks: number  // 1
  warnMs: number           // 60_000 — added when built; see the status note
}
```

`breaksAvailable` derives its count from `nextPlayableAt` and `now` — roughly `floor((now - nextPlayableAt) / workMs) + 1` once `now` has passed it — and clamps to `maxBankedBreaks`. Deriving it means there is no stored counter that can drift out of sync with the timestamp, and at the shipping value of `1` the function is exactly the old boolean.

Raising the cap above 1 needs one further decision that is deliberately **not** being made now: what consuming one banked break should do to `nextPlayableAt`, given that `now + workMs` would silently wipe the rest of the bank. At a cap of 1 the question cannot arise. Leave the knob at 1, keep the function honest about clamping, and do not write the consumption rule until something actually wants it.

The config is not exposed in the UI. It exists so tests can pass `{ workMs: 2_000, breakMs: 1_000 }` and so a later feature — an account perk, a user-chosen break length — is a value change rather than a redesign. Thread it as an argument like `now`; do not reach for a module-level constant, or the testing hook is the first thing to rot.

## The break clock

*(Open question 1, answered 2026-08-10. Two rules, and both are about the break rather than the level.)*

### The clock starts on the player's first action

`breakStartedAt` is null when a break becomes available and is set by the first input that produces a turn. The deadline is `breakStartedAt + config.breakMs`. Someone who works forty minutes past the bell still gets a full five minutes when they finally sit down; the break is a credit the player spends, and opening the tab does not spend it.

It is wall-clock from that first action, **not** five minutes of accumulated activity. Accumulated play would need idle detection and a definition of "active", and it would make the remaining time unpredictable to the player — the countdown could stall without explanation. A player who takes one step and then wanders off for four minutes has spent their break. That is the correct and legible behavior.

Store the timestamp, not a JS timer, so the deadline survives a reload and cannot be reset by refreshing. Note that a player who never acts is never on the clock, which is fine: they are not playing, and during a work interval that is the intended state.

### On expiry the level freezes; it is not abandoned

The level persists exactly as it stands — same monsters, same positions, same HP — `nextPlayableAt` moves to `now + workMs`, and the next break rehydrates the same `GameState` with `breakStartedAt` back to null. A level is not required to fit in one break. "One level per cycle" becomes "one break per cycle: five minutes, or the end of the level, whichever comes first."

The deadline is checked *before* an input is accepted, never in the middle of one. Turns are discrete and synchronous, so refusing the input is the whole of the enforcement — no half-executed turn, nothing to unwind.

Why freeze rather than the earlier default of abandon-and-regenerate: abandoning discards the player's work for a reason outside the game, and does it precisely when they were doing the thing the timer exists to encourage — going back to work. Freezing asks nothing of them and costs nothing to build, since the level was already being persisted for reloads.

Two consequences, one of them a straight win:

- **The walk-away exploit is gone.** Under abandon, a player losing a fight could let the clock run out to escape it. Freezing returns them to the same fight, the same adjacent monster, and the same HP. There is nothing to gain by leaving.
- **Every break boundary is now a rehydrate**, so the fresh-entropy reroll under "The combat stream does not persist" happens routinely rather than only when someone reloads. A player mid-fight can let the break expire to reroll their upcoming luck. That is the same class as reloading to reroll it, already accepted for the same reason, and the price is still waiting 25 minutes.

Show a visible warning at 4 minutes. Unlike under the abandon design, the warning is telling the player to find a stopping point, not to hurry — nothing is lost either way, so it should read as an advisory and not an alarm.

During the work interval the frozen board stays on screen behind the countdown, dimmed and non-interactive. Hiding it would read as "the level is gone", which is exactly the impression this design exists to avoid. If a visible dungeon turns out to be a distraction during work, collapsing it to a small summary is a UI change and not a design one.

## Timer accuracy

Do not accumulate elapsed time by adding tick deltas. Store absolute epoch timestamps and compute remaining time as `deadline - Date.now()` on each tick. Background tabs throttle `setInterval` to once per minute or worse, and a laptop that sleeps for two hours will produce wildly wrong accumulated totals. With absolute timestamps, both cases are correct with no special handling.

Tick at 1s for display. The gate itself reads the clock directly, so a throttled tick delays the UI update, never the underlying eligibility.

Also recompute on `visibilitychange` so returning to the tab updates immediately rather than at the next throttled tick.

## Not in this phase

Everything under [07a-break-payoff.md](07a-break-payoff.md) — keeping the rest of the break after an early finish, a bonus for finishing early, a sound at the hand-off back to work, and a manual "start my work interval now" control. Raised after playing what this phase shipped.

Notifications when the break becomes available are an obvious follow-on, but need a permission prompt and belong in their own change. Stairs and multi-level runs are phase 8 — at the end of phase 7 the shrine still ends the level, it just gates the next one on a timer instead of on tomorrow.

Any UI for `PomodoroConfig` is also out of scope. The type exists so the values are injectable and a later feature is a value change; nothing in this phase reads a user-set duration, and the defaults are the only values that ship.
