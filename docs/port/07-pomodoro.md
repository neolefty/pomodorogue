# Phase 7 — Pomodoro

**Outcome:** the game becomes the break half of a pomodoro cycle. One level per 25-minute work interval, ~5 minutes of play, everything surviving a browser reload.

**Status:** not started. **Do not start before phase 6 is playable** — this is the first phase that changes the design rather than porting it.

## Operating facts

| File | Purpose |
|---|---|
| `src/pomodoro/schedule.ts` | Pure gate logic. No React, no timers — takes `now` as an argument. |
| `src/pomodoro/usePomodoro.ts` | React binding: ticking clock, persistence. |
| `src/pomodoro/persistence.ts` | localStorage load/save, replaces `alandipert/storage-atom`. |
| `src/ui/Timer.tsx` | Countdown display; replaces `component-countdown`. |

Constants: `WORK_MS = 25 * 60_000`, `LEVEL_CAP_MS = 5 * 60_000`. Put them in `schedule.ts` and make them overridable for testing — a 25-minute wait is not something to sit through while debugging.

## What this replaces

The original's daily gate is spread across three places, all of which go away:

- `util.cljs` — `tomorrow`, `time-until`, `date-token`, `parse-date`, and the timezone-offset arithmetic. **Delete all of it.** These solved "when is midnight in the user's timezone", a question a 25-minute interval never asks. Do not port them; a relative-interval gate needs none of that complexity.
- `ui.cljs:229-243` — `component-countdown`, which counts down to tomorrow and offers a reload button.
- `ui.cljs:341-352` — `main!`, which derives the seed from today's date or a URL query param.

## State shape

Three separate concerns, persisted separately so a corrupt one doesn't take down the others:

```ts
type Schedule = { nextPlayableAt: number }        // epoch ms
type Run = { runSeed: number; depth: number; carry: PlayerCarry | null; statistics: Statistics }
type Level = GameState | null                     // the in-progress level, if any
```

`carry` is always `null` until phase 8, which defines `PlayerCarry`
([08-depth.md](08-depth.md)) — it is listed here so the persisted shape doesn't
change underneath phase 8.

`GameState` is already JSON-round-trippable (enforced by a test from phase 3), so `Level` persists directly. That is what lets an in-progress level survive a reload — which matters, because a 5-minute break is exactly long enough for someone to accidentally close the tab.

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
current value is dropped and the cycle starts fresh at the same depth, exactly
as the level-cap expiry path already does. `Schedule` and `Run` are versioned
too but survive: they are small, stable, and the expensive things to lose. A
level is five minutes of play and the run is hours, so throwing the level away
costs nearly nothing and buys never writing a migration.

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
entropy. Mildly save-scummable, same class as the walk-away exploit under "The
level cap" below, accepted for the same reason — there is no leaderboard and
nobody to cheat but yourself.

Reversal, if ever wanted, is a caller-side change only: the engine takes an
`Rng` parameter and does not know how it was seeded, so deriving it from the
seed again (plus persisting a draw count) touches level start and rehydrate,
nothing else.

## The gate

```ts
canPlay(schedule, now) => now >= schedule.nextPlayableAt
```

On level end — win, death, or timeout — set `nextPlayableAt = now + WORK_MS`. Deliberately *not* `previousNextPlayableAt + WORK_MS`: the interval starts when you stop playing, so a long level doesn't eat into the next work block.

**No banking.** If you skip three cycles you get one level, not three. `canPlay` is a boolean, not a count. (Open question 2 in PLAN.md — this is the default; revisit if it feels wrong in use.)

## The level cap

A level started at `t` must end by `t + LEVEL_CAP_MS`. Store `levelStartedAt` in the run state, not a JS timer, so the cap survives a reload and cannot be defeated by refreshing.

**On expiry** (open question 1 in PLAN.md, current default): the level is abandoned, the run survives, and the same depth is regenerated with a *new* level seed next cycle. Rationale: the alternative — timeout kills the run — means a meeting overrunning at work destroys hours of progress, which punishes the user for the exact thing the timer is supposed to be helping with. Death should come from playing badly, not from being interrupted.

Show a visible warning at 4 minutes. Do not silently kill the level.

Note this creates a mild exploit: a player losing badly can walk away and let the clock run out instead of dying. Accept it for now — the reward for cheating is *waiting 25 minutes*, which is self-limiting. Revisit only if it turns out to matter.

## Timer accuracy

Do not accumulate elapsed time by adding tick deltas. Store absolute epoch timestamps and compute remaining time as `deadline - Date.now()` on each tick. Background tabs throttle `setInterval` to once per minute or worse, and a laptop that sleeps for two hours will produce wildly wrong accumulated totals. With absolute timestamps, both cases are correct with no special handling.

Tick at 1s for display. The gate itself reads the clock directly, so a throttled tick delays the UI update, never the underlying eligibility.

Also recompute on `visibilitychange` so returning to the tab updates immediately rather than at the next throttled tick.

## Not in this phase

Notifications when the break becomes available are an obvious follow-on, but need a permission prompt and belong in their own change. Stairs and multi-level runs are phase 8 — at the end of phase 7 the shrine still ends the level, it just gates the next one on a timer instead of on tomorrow.
