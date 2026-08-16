/**
 * What happens when the player walks onto something that is not a monster.
 * Ports `increase-hp`, `add-item-to-inventory`, `uncover-item` and `finish-game`
 * from original/src/rogule/engine.cljs.
 *
 * Each takes the turn's draft and returns whether the mover is blocked from
 * advancing into the square. The dispatch that picks between them, and the
 * convention `blocks` follows, both live at `runEncounter` in `movement.ts`.
 */
import { castDraft } from 'immer'
import type { Draft } from 'immer'
import type { EntityId, GameState } from '../types.ts'
import { PLAYER_ID } from '../types.ts'
import { addEntity, detach, removeEntity } from './state.ts'

/** How much a drink heals, capped at max HP (`engine.cljs:209`). */
export const HEALTH_PICKUP_HP = 3

/** Only the player drinks; a monster walking over a health potion ignores it. */
export function increaseHp(
  draft: Draft<GameState>,
  theirId: EntityId,
  itemId: EntityId,
): boolean {
  if (theirId !== PLAYER_ID) return false
  const stats = draft.entities[theirId]?.stats
  // Already at full health: the potion is left on the floor for later.
  if (!stats || stats.hp.cur >= stats.hp.max) return false

  stats.hp.cur = Math.min(stats.hp.cur + HEALTH_PICKUP_HP, stats.hp.max)
  removeEntity(draft, itemId)
  return false
}

/** Only the player has an inventory, so only the player picks things up. */
export function addItemToInventory(
  draft: Draft<GameState>,
  theirId: EntityId,
  itemId: EntityId,
): boolean {
  if (theirId !== PLAYER_ID) return false
  const held = draft.entities[itemId]
  const inventory = draft.entities[theirId]?.inventory
  if (!held || !inventory) return false

  const item = detach(held)
  removeEntity(draft, itemId)
  // `castDraft` for the same reason `addEntity` needs it: `Entity.pos` is a
  // readonly tuple and `Draft<T>` strips readonly, so a plain entity is not
  // assignable into the draft. The value genuinely is plain, so the cast is sound.
  inventory.push(castDraft(item))
  draft.log.push({ type: 'item', name: item.name })
  return false
}

/**
 * Lifts a rock, plant or block of wood, revealing the smoke puff and whatever
 * was under it — which is often nothing; see `placeCoveredItem`.
 */
export function uncoverItem(
  draft: Draft<GameState>,
  theirId: EntityId,
  itemId: EntityId,
): boolean {
  if (theirId !== PLAYER_ID) return false
  const cover = draft.entities[itemId]
  if (!cover) return false

  // Read out before the cover goes, since both hang off it.
  const juice = cover.juice ? detach(cover.juice) : null
  const drop = cover.drop ? detach(cover.drop) : null
  removeEntity(draft, itemId)
  addEntity(draft, juice)
  addEntity(draft, drop)
  return true
}

/**
 * Reaching the shrine ends the level — and says nothing about what happens
 * next.
 *
 * The shrine is touched *before* the player chooses whether to go deeper or
 * start again, so it cannot know whether it is a staircase down or a shrine to
 * walk away from. `'cleared'` is the one reading both agree on, which is why it
 * is not `'descended'` and why the entity is still a shrine. See "The shrine
 * stays a shrine" in docs/port/08-depth.md.
 *
 * Like the original this does not check that the mover is the player — nothing
 * else can reach the shrine, because it sits on the `occupy` layer and
 * `makeMonsterPassable` routes monsters around anything that occupies a square.
 *
 * Statistics are deliberately not touched here: they are run-scoped, and the run
 * layer reacts to `outcome`. See docs/port/05-engine.md.
 */
export function finishLevel(draft: Draft<GameState>): boolean {
  draft.outcome = 'cleared'
  draft.log.push({ type: 'outcome', outcome: 'cleared', moves: draft.moves })
  return true
}
