/**
 * Small state edits shared by the movement, encounter and combat code. Ports
 * `add-entity`, `remove-entity`, `reset-combat-list`, `add-to-combat-list`,
 * `add-killed-by` and `check-for-endgame` from original/src/rogule/engine.cljs.
 *
 * These take an Immer draft and mutate it, rather than being `state -> state`
 * like their Clojure originals. Their callers are already inside a `produce`,
 * and the pure form would mean one `produce` per line of a kill site that the
 * original wrote as a single threaded expression.
 */
import type { Draft } from 'immer'
import { castDraft } from 'immer'
import type { Entity, EntityId, EntitySummary, GameState } from '../types.ts'
import { PLAYER_ID } from '../types.ts'

/** The slim record kept in `kills`/`killedBy` — see {@link EntitySummary}. */
export const summarize = (entity: Entity): EntitySummary => ({
  name: entity.name,
  sprite: entity.sprite,
})

/**
 * Adds an entity, ignoring null. Both `drop` and `juice` are nullable, and every
 * call site would otherwise repeat the check — as the original's `add-entity`
 * observed by taking the same shortcut.
 *
 * The entity keeps the id it already carries. (The original stripped `:id` here
 * because its ids were the map keys; ours live on the entity itself.)
 *
 * `castDraft` is needed because `Entity.pos` is a readonly tuple and Immer's
 * `Draft<T>` strips readonly, so a plain `Entity` is not assignable to a
 * `Draft<Entity>`. The value genuinely is plain, so the cast is sound.
 */
export function addEntity(draft: Draft<GameState>, entity: Entity | null | undefined): void {
  if (!entity) return
  draft.entities[entity.id] = castDraft(entity)
}

export function removeEntity(draft: Draft<GameState>, id: EntityId): void {
  delete draft.entities[id]
}

/** Health bars last one turn; the turn loop clears the list before the player moves. */
export function resetCombatList(draft: Draft<GameState>): void {
  draft.combatants = {}
}

/**
 * Records a fighter so the UI draws its health bar this turn.
 *
 * The player is never recorded — their bar renders separately (`engine.cljs:133`).
 * Keying by id means a hit and its retaliation in the same turn record the
 * monster once.
 */
export function addToCombatList(draft: Draft<GameState>, id: EntityId): void {
  if (id === PLAYER_ID) return
  draft.combatants[id] = true
}

export function addKilledBy(draft: Draft<GameState>, id: EntityId, by: EntitySummary): void {
  const entity = draft.entities[id]
  if (entity) entity.killedBy = by
}

/**
 * Ends the run if the player is dead.
 *
 * The original also updated statistics here; those are run-scoped now, so the
 * engine only sets `outcome` and the run layer reacts to it. See "Deliberate
 * omissions" in docs/port/05-engine.md.
 */
export function checkForEndgame(draft: Draft<GameState>): void {
  if (draft.outcome) return
  if (!draft.entities[PLAYER_ID]?.dead) return
  draft.outcome = 'died'
  draft.log.push({ type: 'outcome', outcome: 'died', moves: draft.moves })
}
