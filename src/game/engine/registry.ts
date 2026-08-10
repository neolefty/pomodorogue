/**
 * Behavior tables. Ports the `lookup-fn` hack at original/src/rogule/engine.cljs:414.
 *
 * Entities name their behavior with a string instead of holding a function
 * reference, so `GameState` stays JSON-serializable — the property phase 7's
 * persistence rests on. The original resolved those names through `ns-interns`,
 * which is dynamic and unchecked; here the tables are `satisfies
 * Record<Name, Fn>` against the unions in `types.ts`, so a missing entry or a
 * mistyped name is a compile error.
 *
 * The unions are imported *from* `types.ts` rather than derived here with
 * `keyof typeof`: `content/types.ts` and the generator already consume them, and
 * deriving them from these tables would invert that into an import cycle.
 *
 * ## Two constraints on this file
 *
 * **Registered functions must be `function` declarations, not `const` arrows.**
 * `movement.ts` imports these tables and `monsters.ts` imports `movement.ts`, so
 * the module graph is genuinely cyclic. It stays safe because function
 * declarations are initialized at instantiation time, before any module body
 * runs, and because every consumer reads the tables from inside a function body
 * rather than at the top level. A `const` arrow would turn that cycle into a
 * temporal-dead-zone crash that depends on which module was imported first.
 *
 * **Three tables, not one.** The signatures differ, and the passable slot holds
 * factories rather than predicates.
 */
import type { PassableFn } from '../grid.ts'
import type { Rng } from '../rng.ts'
import type {
  EncounterFnName,
  Entity,
  EntityId,
  GameState,
  PassableFnName,
  UpdateFnName,
} from '../types.ts'
import { combat } from './combat.ts'
import { addItemToInventory, finishLevel, increaseHp, uncoverItem } from './encounters.ts'
import { chasePlayer } from './monsters.ts'
import { makeMonsterPassable, makePlayerPassable } from './movement.ts'

/**
 * Runs when `actorId` moves onto `targetId`.
 *
 * `blocks` means the actor does not advance into the square — see the note at
 * the top of `encounters.ts`.
 */
export type EncounterFn = (
  state: GameState,
  actorId: EntityId,
  targetId: EntityId,
  rng: Rng,
) => [blocks: boolean, next: GameState]

/** Runs once per turn, after the player has moved. */
export type UpdateFn = (
  state: GameState,
  id: EntityId,
  entity: Entity,
  rng: Rng,
) => GameState

/** Builds one entity's movement predicate; it closes over the mover. */
export type MakePassableFn = (state: GameState, id: EntityId, entity: Entity) => PassableFn

export const ENCOUNTER_FNS = {
  combat,
  increaseHp,
  addItemToInventory,
  uncoverItem,
  finishLevel,
} satisfies Record<EncounterFnName, EncounterFn>

export const UPDATE_FNS = {
  chasePlayer,
} satisfies Record<UpdateFnName, UpdateFn>

export const PASSABLE_FNS = {
  playerPassable: makePlayerPassable,
  monsterPassable: makeMonsterPassable,
} satisfies Record<PassableFnName, MakePassableFn>
