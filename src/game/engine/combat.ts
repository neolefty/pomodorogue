/**
 * One blow, and everything that follows from it. Ports `combat`,
 * `get-weapons-dmg` and `get-armour-hp` from original/src/rogule/engine.cljs.
 *
 * Damage is one-directional: `theirId` hits `myId`. Retaliation is not modelled
 * here — it is simply the monster's own move, later in the same turn, bumping
 * back into the player.
 */
import { produce } from 'immer'
import { allocId } from '../entities.ts'
import { makeCollisionMarker } from '../generator/entities.ts'
import type { Rng } from '../rng.ts'
import { SPRITES } from '../sprites.ts'
import type { Entity, EntityId, GameState } from '../types.ts'
import { PLAYER_ID } from '../types.ts'
import { addEntity, addKilledBy, addToCombatList, checkForEndgame, summarize } from './state.ts'

/** Weapons and armour apply just by being carried; there is nothing to equip. */
export const getWeaponsDmg = (entity: Entity): number =>
  (entity.inventory ?? []).reduce((total, item) => total + (item.dmg ?? 0), 0)

export const getArmourHp = (entity: Entity): number =>
  (entity.inventory ?? []).reduce((total, item) => total + (item.armour ?? 0), 0)

/** The player gains one XP per this many kills (`engine.cljs:272`). */
const KILLS_PER_XP = 2

/**
 * `theirId` strikes `myId`. Always returns `blocks: true` — you do not walk
 * through something you just hit, alive or dead.
 *
 * The maths is ported literally from `engine.cljs:250-317`:
 *
 * ```
 * hit         = pick([0,1,1,1,1,1])   // 5 in 6 to connect
 * hpHit       = int(their xp)         // 0 .. xp-1
 * hpReduction = max(0, (hpHit + weapons - armour) * hit)
 * ```
 *
 * Note `hpHit` tops out at `xp - 1`, so a monster with `xp: 1` rolls 0 every
 * time and can only hurt you with a weapon. The rat really is harmless.
 */
export function combat(
  state: GameState,
  theirId: EntityId,
  myId: EntityId,
  rng: Rng,
): [boolean, GameState] {
  const them = state.entities[theirId]
  const me = state.entities[myId]
  if (!them || !me) return [true, state]

  const hit = rng.pick([0, 1, 1, 1, 1, 1])
  const hpHit = rng.int(them.stats?.xp ?? 0)
  const hpWeapons = getWeaponsDmg(them)
  const hpArmour = getArmourHp(me)
  const hpReduction = Math.max(0, (hpHit + hpWeapons - hpArmour) * hit)

  const myHp = me.stats?.hp[0] ?? 0
  const updatedHp = Math.max(0, myHp - hpReduction)
  const killed = updatedHp === 0

  // Built here, before the death block below swaps the sprite for a skull —
  // otherwise every kill would be recorded as a skull (`engine.cljs:269`).
  const victim = summarize(me)
  const killer = summarize(them)

  const next = produce(state, (draft) => {
    const meDraft = draft.entities[myId]
    if (meDraft?.stats) meDraft.stats.hp[0] = updatedHp

    if (killed && theirId === PLAYER_ID) {
      const player = draft.entities[theirId]
      if (player) {
        const kills = (player.kills ??= [])
        kills.push(victim)
        if (kills.length % KILLS_PER_XP === 0 && player.stats) player.stats.xp += 1
      }
    }

    if (killed) {
      addKilledBy(draft, myId, killer)
    } else {
      // Only a survived exchange puts bars on screen; a fatal one records
      // nothing (`engine.cljs:277-283`). Both are offered, and the helper drops
      // the player.
      addToCombatList(draft, theirId)
      addToCombatList(draft, myId)
    }

    if (hpReduction > 0) {
      // allocId mutates nextEntityId, so it has to happen in here — it throws on
      // the frozen post-produce state, by design.
      addEntity(draft, makeCollisionMarker(allocId(draft), me.pos))
    }

    draft.log.push({
      type: 'combat',
      from: them.name,
      to: me.name,
      damage: hpReduction,
      killed,
    })

    if (killed && meDraft) {
      meDraft.dead = true
      meDraft.layer = 'floor'
      meDraft.animation = null
      meDraft.sprite = SPRITES['skull-and-crossbones']
      // The pre-produce `drop`, whose pos followed the monster as it chased.
      addEntity(draft, me.drop)
      // Divergence from the original, deliberately: it left `drop` pointing at
      // the now-live item, harmless there but here it double-counts in
      // `countEntities` and doubles the object inside every phase-7 snapshot.
      delete meDraft.drop
      // `delete`, never `= undefined`: exactOptionalPropertyTypes rejects the
      // assignment, and an undefined value would not survive the JSON round-trip.
      if (meDraft.fns) {
        delete meDraft.fns.update
        delete meDraft.fns.encounter
      }
      checkForEndgame(draft)
    }
  })

  return [true, next]
}
