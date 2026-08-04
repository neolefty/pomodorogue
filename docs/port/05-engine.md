# Phase 5 — Engine

**Outcome:** turn resolution — movement, encounters, combat, monster AI, health regeneration, message expiry. Ports `original/src/rogule/engine.cljs` (422 lines), the densest file in the project.

**Status:** not started.

## Operating facts

| File | Ports from |
|---|---|
| `src/game/engine/registry.ts` | the `lookup-fn` mechanism (`engine.cljs:414-422`) |
| `src/game/engine/movement.ts` | `move-to`, `player-passable-fn`, `make-monster-passable-fn` |
| `src/game/engine/encounters.ts` | `increase-hp`, `add-item-to-inventory`, `uncover-item` |
| `src/game/engine/combat.ts` | `combat`, `get-weapons-dmg`, `get-armour-hp` |
| `src/game/engine/monsters.ts` | `chase-player`, `update-monsters` |
| `src/game/engine/turn.ts` | the turn sequence inside `process-arrow-key!` |

Input handling itself does **not** live here — it is UI, and goes in phase 6. `turn.ts` exports a pure `takeTurn(state, direction)`.

## The function registry

This is the piece to get right first, because everything else hangs off it.

Entities store behavior as *names*, not function references, so state stays serializable (see PLAN.md). The original resolves them with `ns-interns` at runtime, which is dynamic and unchecked. We use an explicit registry keyed by a string-literal union:

```ts
export type EncounterFn = (state: GameState, actorId: EntityId, targetId: EntityId) => [blocks: boolean, next: GameState]

export const ENCOUNTER_FNS = {
  combat,
  increaseHp,
  addItemToInventory,
  uncoverItem,
  finishGame,
} as const satisfies Record<string, EncounterFn>

export type EncounterFnName = keyof typeof ENCOUNTER_FNS
```

Then `Entity['fns']` is `{ encounter?: EncounterFnName; update?: UpdateFnName; passable?: PassableFnName }`. A template referencing a function that doesn't exist is now a compile error, which the original could not catch.

Three registries, one per slot: encounter, update, passable. Do not merge them — the signatures differ.

## The encounter return convention

Encounter functions return `[blocks, newState]`. `blocks` means "the mover does not advance into this square" — combat blocks, picking up an item does not, uncovering a cover blocks (you spend the turn revealing it). `move-to` reduces over every entity at the target position, ORing the `blocks` flags.

This tuple convention is easy to get wrong when translating. Note that `increaseHp` and `addItemToInventory` return `false` even in their no-op branches, while `combat` returns `true` unconditionally.

## Combat maths — port literally

From `engine.cljs:250-317`. Damage from `them` to `me`:

```
hit          = dice.pick([0,1,1,1,1,1])      // 5/6 chance to connect
hpHit        = dice.int(them.stats.xp)       // 0..xp-1
hpWeapons    = sum of dmg over them.inventory
hpArmour     = sum of armour over me.inventory
hpReduction  = max(0, (hpHit + hpWeapons - hpArmour) * hit)
```

Note `hpHit` is `0..xp-1`, so a monster with `xp: 1` always rolls 0 damage and can only hurt you via weapons — the rat is harmless on its own. That is the original's behavior; keep it.

XP gain: the player gains 1 xp for **every second kill** (`(mod kills 2) == 0`), not every kill.

Health regeneration: `restore-player-health` increments a counter each move and adds 1 HP once it reaches `rejuvination-rate` (100). So one HP per 100 moves, and the counter resets when at full health. Keep the original's spelling in a comment if you rename the constant.

Write the combat tests against a fixed-seed RNG before refactoring anything here.

## Turn sequence

From `process-arrow-key!` (`engine.cljs:365-401`). The order matters:

1. Clear the combatants list.
2. `moveTo(player, newPos)` — this runs encounters, which may end the game.
3. If the game did not end **and** the player actually moved: increment moves → restore health → update monsters → expire messages.

A blocked move still counts as a turn if `moved` is set (combat sets it), but a move into a wall does not. `moveTo` with a null position means "rest", which sets `moved` and costs a turn.

## Deliberate omissions

- **`add-game-log` / `post-game-log!`** — the original logs every combat and item pickup and POSTs it to `/share`. There is no server in phase 6, and the log's purpose was the shared-dungeon social feature that a personal pomodoro timer does not have. Drop the POST. **Keep** an in-memory `gameLog` array: it costs nothing, it is already serializable, and phase 8 will want a run history. Do not let it grow unbounded across a multi-level run — cap it or reset per level.
- **`serialize-item` / `serialize-character`** — only existed to trim entities for the game log. Skip unless the log needs them.
- **Held-key retrigger** — already disabled in the original with a comment saying it felt janky. Do not port the dead code.

## Tests to write

- Combat is deterministic under a fixed seed.
- Armour fully absorbing damage yields `hpReduction === 0` and no death.
- Killing an entity sets `dead`, moves it to the `floor` layer, swaps its sprite to the skull, drops its item, and strips its `update`/`encounter` fns — the original does all five in one place (`engine.cljs:307-316`) and missing one produces a corpse that still chases you.
- Player death sets `outcome: 'died'`.
- A full turn through `takeTurn` advances `moves` by exactly 1.
