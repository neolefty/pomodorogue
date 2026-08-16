/**
 * What survives the stairs: taking a snapshot of a finished player, and laying
 * it over a freshly generated level.
 *
 * The two halves live together because they are one round trip, and neither is
 * generation. {@link applyCarry} is a **post-pass** — it runs on a finished base
 * level and may not influence how that level was built. That is the same rule
 * the overlay pass will follow when it exists, and carry is deliberately its
 * first tenant: it adds nothing, moves nothing, and touches no geometry. It
 * overwrites two fields on one entity.
 *
 * The alternative — threading carry into `placePlayer` — was rejected and is
 * worth not re-litigating. It would put run history inside the base pass, which
 * breaks both "two players on one seed walk the same dungeon" and the
 * generator's two-scalars-in determinism test. See "What carries between
 * levels" in docs/port/08-depth.md.
 */
import { allocId, getPlayer } from './entities.ts'
import type { GameState, PlayerCarry } from './types.ts'

/**
 * The finished player, reduced to what goes down the stairs.
 *
 * Copied rather than referenced: the level it comes from is frozen by Immer,
 * and it is about to be stored in a slot that outlives that level. Copying is
 * also what makes the {@link PlayerCarry} in localStorage independent of the
 * level in localStorage, so discarding one on a version bump cannot corrupt the
 * other.
 *
 * Returns null for a player with no stats, which no real level produces — it is
 * the shape of the question, not a case that happens.
 */
export function snapshotCarry(state: GameState): PlayerCarry | null {
  const player = getPlayer(state)
  if (!player?.stats) return null
  return {
    stats: {
      hp: { cur: player.stats.hp.cur, max: player.stats.hp.max },
      xp: player.stats.xp,
      hpInc: player.stats.hpInc,
    },
    // `carried` is set here rather than at the far end so that an item stays
    // marked however many levels it goes on to survive. See the field's note in
    // types.ts for what the completion bars do with it.
    inventory: (player.inventory ?? []).map((item) => ({ ...item, carried: true as const })),
  }
}

/**
 * Overwrites the freshly-placed player's condition and pack with the carry.
 *
 * Everything else about the player comes from the new level — above all their
 * position, which is why `placePlayer` still builds a complete depth-1 elf
 * unconditionally and this only replaces two fields of it.
 *
 * **No HP is restored.** Arriving at depth 4 with 3 HP and having to decide
 * whether to fight or run is where the tension lives; the engine's slow
 * regeneration (1 HP per 100 moves) is the recovery mechanism, and it makes
 * cautious exploring a good use of a five-minute break.
 *
 * Mutates and returns the state it is given. That is safe exactly here: the
 * level has just been built by `makeBaseLevel` and nobody else holds a
 * reference to it yet.
 */
export function applyCarry(state: GameState, carry: PlayerCarry): GameState {
  const player = getPlayer(state)
  if (!player) return state

  player.stats = {
    hp: { cur: carry.stats.hp.cur, max: carry.stats.hp.max },
    xp: carry.stats.xp,
    hpInc: carry.stats.hpInc,
  }
  // Re-issued from *this* level's counter. Carried ids were allocated against
  // the previous level and start again at zero every time, so a carried `e12`
  // and a chestnut picked up here would collide — which the inventory strip
  // renders as one React key for two items. Nothing outside the inventory
  // refers to these ids, so reassigning them costs nothing.
  //
  // `pos` is left as it was, stale, pointing at wherever the item was picked
  // up. Nothing reads an inventory item's position — the same as the original.
  player.inventory = carry.inventory.map((item) => ({ ...item, id: allocId(state) }))

  return state
}
