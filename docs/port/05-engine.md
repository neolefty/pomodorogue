# Phase 5 — Engine

**Outcome:** turn resolution — movement, encounters, combat, monster AI, health regeneration. Ports `original/src/rogule/engine.cljs` (422 lines), the densest file in the project.

**Status:** done (2026-08-10). Landed as specced; the spec below stands as written, and "As built" at the bottom records the handful of decisions it left open.

## Operating facts

| File | Ports from |
|---|---|
| `src/game/engine/registry.ts` | the `lookup-fn` mechanism (`engine.cljs:414-422`) |
| `src/game/engine/state.ts` | `add-entity`, `remove-entity`, `reset-combat-list`, `add-to-combat-list`, `add-killed-by`, `check-for-endgame` |
| `src/game/engine/movement.ts` | `move-to`, `player-passable-fn`, `make-monster-passable-fn`; also home of `Dir` and its delta table |
| `src/game/engine/encounters.ts` | `increase-hp`, `add-item-to-inventory`, `uncover-item`, `finish-level` |
| `src/game/engine/combat.ts` | `combat`, `get-weapons-dmg`, `get-armour-hp` |
| `src/game/engine/monsters.ts` | `chase-player`, `update-monsters` |
| `src/game/engine/turn.ts` | the turn sequence inside `process-arrow-key!`, `restore-player-health` |

Input handling itself does **not** live here — it is UI, and goes in phase 6. `turn.ts` exports a pure `takeTurn(state, dir, rng)` — see "The RNG is injected" for why it takes three arguments.

## The function registry

> **Superseded by phase 5.5.** This section describes the mechanism as built and as it stands today, and it is accurate as a record of phase 5. But the three registries collapse to a single `kind` discriminant in §1 of [05a-simplify.md](05a-simplify.md) — including the import-cycle constraint below, which exists *because* of the registry and goes away with it. Read this for what landed; read 05a for what to build on. Nothing here is being retracted as wrong.

This is the piece to get right first, because everything else hangs off it.

Entities store behavior as *names*, not function references, so state stays serializable (see PLAN.md). The original resolves them with `ns-interns` at runtime, which is dynamic and unchecked. The name unions — `EncounterFnName`, `UpdateFnName`, `PassableFnName` — **already exist in `types.ts`**, declared there so `types.ts` stays dependency-free, and already consumed by `content/` and the generator's entity templates. The registries assert exhaustiveness *against* those unions:

```ts
export type EncounterFn = (
  state: GameState,
  actorId: EntityId,
  targetId: EntityId,
  rng: Rng,
) => [blocks: boolean, next: GameState]

export const ENCOUNTER_FNS = {
  combat,
  increaseHp,
  addItemToInventory,
  uncoverItem,
  finishLevel,
} satisfies Record<EncounterFnName, EncounterFn>
```

Do not flip this around to `type EncounterFnName = keyof typeof ENCOUNTER_FNS` — an earlier draft of this doc did, but the union now lives in `types.ts` and is imported by `content/types.ts` (via `Extract`) and the generator, so deriving it from the registry would create an import cycle and move the type out of the file everything already imports it from. A template referencing a function that doesn't exist is still a compile error either way.

`Entity['fns']` (`EntityFns`) also already exists in `types.ts` — nothing to add there.

Three registries, one per slot: encounter, update, passable. Do not merge them — the signatures differ. The passable slot holds *factories*, not predicates: `(state: GameState, id: EntityId, entity: Entity) => PassableFn`, where `PassableFn` is the `(x, y) => boolean` alias already in `grid.ts`. (`make-monster-passable-fn` closes over the mover — `engine.cljs:328-341`.)

## The RNG is injected

Combat and monster AI draw from an `Rng` passed in by the caller. The engine has no way to build one itself even if it wanted to — `GameState` stores only the *derived* level seed, and `Math.random` is banned in `src/game/` — and it should not want to: combat randomness is **entropy-seeded, not seed-derived**. Only generation repeats; see "Seeds control the world, not the story" in PLAN.md.

- `turn.ts` exports `takeTurn(state: GameState, dir: Dir | null, rng: Rng): GameState` — `null` means rest.
- `EncounterFn` and `UpdateFn` take `rng` as their final parameter. Passable fns don't need it.
- The UI creates the stream with `makeRng(randomSeed)` when a level starts (entropy from the edge, per PLAN.md) and holds it in a ref for the level's lifetime. Nothing about it persists — a reload gets a fresh stream; see "The combat stream does not persist" in [07-pomodoro.md](07-pomodoro.md).
- Tests inject `makeRng('test', n)` instead. The engine can't tell the difference, which is the point — repeatable-when-injected is all the determinism combat needs.

Note `chase-player` draws from this same stream — one roll per active monster per turn, for the 10% chance to stand still (`engine.cljs:343-352`) — which is why `UpdateFn` needs the parameter too.

`Dir` is `'left' | 'right' | 'up' | 'down'`; it and its delta table go in `movement.ts`. The UI maps keys to `Dir`, never to raw deltas.

## The encounter return convention

> **Superseded by phase 5.5.** Accurate as a record of phase 5, but §6 of [05a-simplify.md](05a-simplify.md) removes the tuple: encounters become draft mutators returning a bare `blocks: boolean`, so there is no pair left to get backwards. The *meaning* of `blocks` below is unchanged and still applies.

Encounter functions return `[blocks, newState]`. `blocks` means "the mover does not advance into this square" — combat blocks, picking up an item does not, uncovering a cover blocks (you spend the turn revealing it). `move-to` reduces over every entity at the target position, ORing the `blocks` flags.

This tuple convention is easy to get wrong when translating. Note that `increaseHp` and `addItemToInventory` return `false` even in their no-op branches, while `combat` returns `true` unconditionally.

`increaseHp` heals **+3, capped at max** (`engine.cljs:205-212`) — as much a balance constant as the combat maths below, so name it (`HEALTH_PICKUP_HP = 3`).

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

Health regeneration: `restore-player-health` bumps `stats.hpInc` each turn *while HP is below max* and adds 1 HP when the counter reaches `REJUVENATION_RATE` (100). At full health the counter does not accumulate — it is held at 0 (`engine.cljs:112-125`). The constant does not exist in code yet; `types.ts` already names it `REJUVENATION_RATE` in the `hpInc` doc comment, so define it under that name here and note the original's spelling (`rejuvination-rate`) in a comment.

Write the combat tests against a fixed-seed RNG (`makeRng('test', n)`) before refactoring anything here — injection makes this trivial.

## Turn sequence

From `process-arrow-key!` (`engine.cljs:365-401`). The order matters:

1. Clear the combatants list.
2. `moveTo(player, newPos)` — this runs encounters, which may end the game.
3. If the game did not end **and** `moved` is set: increment moves → restore health → update monsters.

(The original has a fourth step, expiring messages — dropped, see "Deliberate omissions".)

Who sets `moved`: `move-to` itself, in two branches — the successful advance, and the blocked-by-entity branch, alongside the bump animation (`engine.cljs:83-84`). So bumping into a monster costs a turn; walking into a wall does not (neither branch is reached). Combat sets nothing here — an earlier draft of this doc claimed it did; it does not. `moveTo` with a null position means "rest", which sets `moved` and costs a turn.

## Port trap: a mover's drop follows it

In `move-to`, a successful move also reassigns the mover's `drop.pos` to the new
position (`engine.cljs:88`):

```clojure
(update-in [:entities id :drop] #(when % (assoc % :pos new-pos)))
```

Note it sits on the `passable-tile?` branch only — the drop follows on an actual
advance, not on a blocked move or a rest. Miss the line and a monster killed
after it has chased you across the map drops its loot back at its *spawn* point.
Playtesting will not reliably catch that; the test below will.

## The kill site

Death does five things in one place in the original (`engine.cljs:307-316`): set `dead`, move the entity to the `floor` layer, swap its sprite to the skull, drop its item, strip its `update`/`encounter` fns. Missing one produces a corpse that still chases you. Mechanics that matter around it:

- Build the victim's `EntitySummary` **before** the sprite swap — the original records the kill at `engine.cljs:269`, before the death block — or every kill renders as a skull.
- Strip fns by **`delete`ing the keys**, never by assigning `undefined`. `exactOptionalPropertyTypes` makes the assignment a compile error, and an `undefined` value would break the JSON round-trip anyway.
- **Clear `drop` on the corpse after dropping it.** Deliberate divergence: the original leaves `corpse.drop` pointing at the now-live item (`engine.cljs:307-312`), harmless there, but here it double-counts in `countEntities` and doubles the object inside every phase-7 snapshot.
- The dropped item and its `juice` already carry ids allocated at generation — `addEntity` is just `entities[e.id] = e`. (The original stripped `:id` on add because its ids were map keys; ours live on the entity.)
- Entities spawned *during* play — collision markers (`engine.cljs:286-293`) — need `allocId(state)`, which mutates `nextEntityId` and therefore must run inside the `produce` callback (it throws on frozen state, by design). `makeSmokeJuice` is exported from the generator for reuse; there is no collision-marker helper yet, so add one beside it.

## Recording kills and combatants

`types.ts` already departs from the original here, so port these by intent rather than line-for-line:

- `state.combatants` is `Record<EntityId, true>` — set `combatants[id] = true` and let the UI resolve ids against `state.entities` at render. The original re-copied each combatant every round to keep its HP bar honest; with ids there is one source of truth and nothing to refresh. Keying by id also means a hit and its retaliation in one turn record the monster once. Two rules from the original that are easy to miss: combatants are recorded **only when the exchange leaves both parties alive** (`engine.cljs:127-135`, `280-282`), and **the player is never recorded** — the player's bar renders separately. The render lookup must tolerate a miss: an id can outlive its entity within a turn, so skip ids that no longer resolve.
- `entity.kills` and `entity.killedBy` hold `EntitySummary` (`{ name, sprite }`), not whole entities. Build the summary at the kill site (before the skull swap — see above). Everything downstream reads only the sprite, plus `kills.length` for the every-second-kill XP rule.

## Immer and the entity index

> **Mostly superseded by phase 5.5.** §6 of [05a-simplify.md](05a-simplify.md) reduces the engine to a single `produce` at `takeTurn`, after which the first rule below collapses to "index the state you passed to `produce`". The second rule (never index a freshly built object) survives unchanged.

`entitiesByPos` memoizes per entities-object identity in a module-level `WeakMap`. Two ways to defeat it accidentally:

- **Never call it on an Immer draft** — that memoizes against the draft proxy and reads entities through proxies. Inside a reducer, index the *pre-produce* state (fine — the index describes positions before the move) or scan `state.entities` directly.
- **Never call it on a freshly built object.** The original's monster-passable predicate indexes a *filtered* entity map (`engine.cljs:328-341`); a port that filters then indexes rebuilds the whole index on every call and caches garbage. For the passable factory, scan directly.

## Deliberate omissions

- **`add-message` / `expire-messages` / `show-modal-sprites`** — the message line and the pickup modal are both dead code in the original: `component-messages` is commented out of the tree (`ui.cljs:165`) and both `show-modal-sprites` call sites are commented out (`engine.cljs:209`, `224`). Rather than port writes that nothing reads, the fields were dropped from the types entirely (`message`, `eventModal`, `Entity.modalSprites` — removed 2026-08-09). `state.log` records the same events; a message UI, if ever wanted, derives from it.
- **`update-statistics`** — the original updates statistics inline in `finish-game`/`check-for-endgame` (`engine.cljs:174-192`). `Statistics` is run-scoped now, and the run layer doesn't exist until phase 7 — so the engine only ever sets `outcome`, and whoever owns the run reacts to it. (Phase 6's share string takes statistics as a separate argument for the same reason.)
- **The game-log POST** — the original logs combat and pickups and POSTs to `/share`; that served the shared-daily-dungeon social feature, and there is no server (the optional server is phase 9). Keep the log itself: `GameState.log` already exists with a typed `LogEntry` union, seeded with a `start` entry by the generator. Combat appends `{type: 'combat', from, to, damage, killed}` at the damage site, pickups append `{type: 'item', name}`, the endgame appends `{type: 'outcome', …}`. The log lives on `GameState`, so it is per-level by construction — no growth cap needed. Entries carry no timestamps; `Date.now` is banned in `src/game/`.
- **`serialize-item` / `serialize-character`** — only existed to trim entities for the POST. Skip.
- **Held-key retrigger** — already disabled in the original with a comment saying it felt janky. Do not port the dead code.

## Tests to write

- Combat is deterministic under a fixed injected seed.
- Armour fully absorbing damage yields `hpReduction === 0` and no death.
- Killing an entity does all five kill-site things — and additionally: the corpse's `drop` is cleared, and the recorded `EntitySummary` carries the victim's live sprite, not the skull.
- A monster that moves several tiles and is then killed drops its loot **where it died**, not where it spawned (the `move-to` trap above).
- Combatants: a survived exchange records the monster exactly once (hit plus retaliation, one key) and never the player; a fatal exchange records nothing.
- Stripped fns are *absent keys*, not `undefined` values — the round-trip test would catch it eventually; assert it directly at the kill site.
- Player death sets `outcome: 'died'`; the shrine sets `outcome: 'descended'` — renamed to `'cleared'` in phase 8, when the direction became the player's to choose afterwards.
- A rest (`dir = null`) and a bump into a monster each advance `moves` by exactly 1; a walk into a wall advances it by 0.

All of the above are in `src/game/engine/engine.test.ts`, plus a fuzz block that
plays real generated levels rather than the hand-built fixtures — 400 random
turns per seed, asserting the player stays on walkable ground, entity keys match
their own ids, corpses never keep an `update` fn, and the state still round-trips
JSON at the end. The five fidelity traps above were each checked by breaking the
line and confirming the intended test — and only that test — went red.

## As built

Five decisions this doc left open, settled during implementation:

1. **`moveTo` takes the `Rng` too** — `moveTo(state, id, newPos, rng)`. It runs
   encounters, and encounters draw; only `takeTurn`'s signature was specced.
2. **`state.ts` helpers are draft mutators**, `(draft, …) => void`, not
   `state -> state` like their Clojure originals. Their callers are already
   inside a `produce`, and the pure form would mean one `produce` per line of a
   kill site the original wrote as a single threaded expression. Assignments of
   plain entities into a draft go through Immer's `castDraft`, because `Draft<T>`
   strips the `readonly` off `Pos` and a plain `Entity` is then not assignable.
   *(Phase 5.5 §6 generalizes this: the draft-mutator style becomes the rule for
   the whole engine below `takeTurn`, not the documented exception.)*
3. **`takeTurn` is a no-op once `outcome` is set.** Not in the original, which
   left its key handler live after death and relied on the modal to cover the
   board. Phase 6 will gate input as well; this makes the engine safe alone.
4. **`updateMonsters` re-reads each entity from the threaded state** instead of
   passing the pre-loop snapshot the original captured. Equivalent today —
   nothing kills a monster during its own turn — and it stops a future overlay
   entity from acting on a stale copy of itself.
5. **The registry cycle is real and is load-bearing on function declarations.**
   `movement.ts` imports the tables, `monsters.ts` imports `movement.ts`, so the
   graph is cyclic. It is safe because function *declarations* are initialized at
   instantiation, before any module body runs, and because every consumer reads
   the tables from inside a function body. Switching a registered function to a
   `const` arrow turns this into a temporal-dead-zone crash whose occurrence
   depends on which module got imported first. Verified by importing each engine
   module as the entry point; the note is repeated at the top of `registry.ts`.
   *(Gone in phase 5.5 §1, along with `registry.ts` itself. The cycle existed
   only because the tables were a hub between `movement.ts` and `monsters.ts`;
   with the `kind` switch the graph is acyclic, so there is no ordering
   constraint left to observe and no way to reintroduce the crash.)*
