/**
 * What happens when the player walks onto something that is not a monster.
 * Ports `increase-hp`, `add-item-to-inventory`, `uncover-item` and `finish-game`
 * from original/src/rogule/engine.cljs.
 *
 * Every encounter returns `[blocks, nextState]`, where `blocks` means the mover
 * does not advance into the square. The flags are easy to get backwards, so:
 * drinking and picking up return `false` **in both branches**, including their
 * no-ops; uncovering returns `true`, because revealing what is under a rock
 * costs the turn; the shrine returns `true` because the level is over anyway.
 */
import { castDraft, produce } from 'immer'
import type { Rng } from '../rng.ts'
import type { EntityId, GameState } from '../types.ts'
import { PLAYER_ID } from '../types.ts'
import { addEntity, removeEntity } from './state.ts'

/** How much a drink heals, capped at max HP (`engine.cljs:209`). */
export const HEALTH_PICKUP_HP = 3

/** Only the player drinks; a monster walking over a health potion ignores it. */
export function increaseHp(
  state: GameState,
  theirId: EntityId,
  itemId: EntityId,
  _rng: Rng,
): [boolean, GameState] {
  if (theirId !== PLAYER_ID) return [false, state]
  const hp = state.entities[theirId]?.stats?.hp
  // Already at full health: the potion is left on the floor for later.
  if (!hp || hp[0] >= hp[1]) return [false, state]

  return [
    false,
    produce(state, (draft) => {
      const stats = draft.entities[theirId]?.stats
      if (!stats) return
      stats.hp[0] = Math.min(stats.hp[0] + HEALTH_PICKUP_HP, stats.hp[1])
      removeEntity(draft, itemId)
    }),
  ]
}

/** Only the player has an inventory, so only the player picks things up. */
export function addItemToInventory(
  state: GameState,
  theirId: EntityId,
  itemId: EntityId,
  _rng: Rng,
): [boolean, GameState] {
  if (theirId !== PLAYER_ID) return [false, state]
  const item = state.entities[itemId]
  if (!item || !state.entities[theirId]?.inventory) return [false, state]

  return [
    false,
    produce(state, (draft) => {
      // The plain entity, not `draft.entities[itemId]` — pushing a draft that
      // the next line deletes leans on Immer finalizing a node reachable from
      // two places, one of them removed. `castDraft` states the intent instead.
      draft.entities[theirId]?.inventory?.push(castDraft(item))
      removeEntity(draft, itemId)
      draft.log.push({ type: 'item', name: item.name })
    }),
  ]
}

/**
 * Lifts a rock, plant or block of wood, revealing the smoke puff and whatever
 * was under it — which is often nothing; see `placeCoveredItem`.
 */
export function uncoverItem(
  state: GameState,
  theirId: EntityId,
  itemId: EntityId,
  _rng: Rng,
): [boolean, GameState] {
  if (theirId !== PLAYER_ID) return [false, state]
  const cover = state.entities[itemId]
  if (!cover) return [false, state]

  return [
    true,
    produce(state, (draft) => {
      removeEntity(draft, itemId)
      addEntity(draft, cover.juice)
      addEntity(draft, cover.drop)
    }),
  ]
}

/**
 * Reaching the shrine ends the level.
 *
 * Like the original this does not check that the mover is the player — nothing
 * else can reach the shrine, because it sits on the `occupy` layer and
 * `makeMonsterPassable` routes monsters around anything that occupies a square.
 *
 * Statistics are deliberately not touched here: they are run-scoped, and the run
 * layer reacts to `outcome`. See docs/port/05-engine.md.
 */
export function finishLevel(
  state: GameState,
  _theirId: EntityId,
  _itemId: EntityId,
  _rng: Rng,
): [boolean, GameState] {
  return [
    true,
    produce(state, (draft) => {
      draft.outcome = 'descended'
      draft.log.push({ type: 'outcome', outcome: 'descended', moves: draft.moves })
    }),
  ]
}
