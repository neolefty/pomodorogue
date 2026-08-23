# Pomodorogue

A roguelike that is also a pomodoro timer: 25 minutes of work earns a five-minute dungeon level. A
port of [Rogule](https://github.com/chr15m/rogule.com) from ClojureScript, extended into multi-level
runs.

## Read first

- **[docs/design.md](docs/design.md)** — how the game works and the thirteen invariants the code holds
  to. Read the invariants before changing anything under `src/game/`.
- **[docs/threads.md](docs/threads.md)** — everything unfinished, and what is parked by decision.
- **[docs/progression/](docs/progression/README.md)** — the one large open design area.

## Commands

```
pnpm dev          pnpm typecheck
pnpm test         pnpm lint
```

pnpm, not npm — `pnpm-lock.yaml` is the lockfile. Regenerating sprites is *not* a plain
`pnpm gen:sprites`; see [docs/design.md](docs/design.md#sprites).

## The three rules most easily broken

1. **Depth 1 must stay byte-identical to the original.** `generator.test.ts` pins two depth-1 seeds by
   hash. Every depth knob in `ramp.ts` is an identity at depth 1, and any balance fix must live
   somewhere depth 1 never reaches (`applyCarry`, not combat).
2. **`src/game/` is pure.** No DOM, no React, no URL, no `Math.random`, no `Date.now` — there is a lint
   rule. Entropy and clocks are injected at the edge, in `src/ui/`.
3. **`GameState` round-trips through JSON**, because it is persisted across a 25-minute gap. Behavior is
   named by an `EntityKind` string resolved in exhaustive `switch`es — never a function on state. When
   its shape changes, bump `LEVEL_SLOT.schemaVersion`; **discard on mismatch, never migrate.**

## License

AGPL-3.0, inherited from Rogule. The in-game source link satisfies §13 and is not optional.
