/**
 * One blow, and everything that follows from it. Ports `combat`,
 * `get-weapons-dmg` and `get-armour-hp` from original/src/rogule/engine.cljs.
 *
 * Damage is one-directional: `theirId` hits `myId`. Retaliation is not modelled
 * here — it is simply the monster's own move, later in the same turn, bumping
 * back into the player.
 */
import type { Draft } from 'immer'
import { allocId } from '../entities.ts'
import { makeCollisionMarker } from '../generator/entities.ts'
import type { Pos } from '../pos.ts'
import type { Rng } from '../rng.ts'
import { SPRITES } from '../sprites.ts'
import type { Entity, EntityId, GameState } from '../types.ts'
import { PLAYER_ID } from '../types.ts'
import {
  addEntity,
  addKilledBy,
  addToCombatList,
  checkForEndgame,
  detach,
  summarize,
} from './state.ts'

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
  draft: Draft<GameState>,
  theirId: EntityId,
  myId: EntityId,
  rng: Rng,
): boolean {
  const them = draft.entities[theirId]
  const me = draft.entities[myId]
  // A target without stats has no hp to lose — without this guard the
  // `?? 0` fallbacks below would read it as killed by a zero-damage miss.
  if (!them || !me || !me.stats) return true

  const hit = rng.pick([0, 1, 1, 1, 1, 1])
  const hpHit = rng.int(them.stats?.xp ?? 0)
  const hpWeapons = getWeaponsDmg(them)
  const hpArmour = getArmourHp(me)
  const hpReduction = Math.max(0, (hpHit + hpWeapons - hpArmour) * hit)

  const updatedHp = Math.max(0, me.stats.hp.cur - hpReduction)
  const killed = updatedHp === 0

  // Both summaries are built here, before the death block below swaps the sprite
  // for a skull — otherwise every kill would be recorded as a skull
  // (`engine.cljs:269`). Only a fatal exchange records either, so a miss
  // allocates nothing, and the snapshot only runs on a kill.
  //
  // Reading straight off the draft is safe even though `me.sprite` is
  // reassigned a few lines down: `summarize` copies the two scalars it wants
  // into a fresh object here and now, so the later write cannot reach it.
  const fatal = killed ? { victim: summarize(me), killer: summarize(them) } : null

  // Values, captured before anything is written: the marker goes where the
  // victim stood, and the log wants the names the fight started with.
  const myPos: Pos = [me.pos[0], me.pos[1]]
  const theirName = them.name
  const myName = me.name

  me.stats.hp.cur = updatedHp

  if (fatal && theirId === PLAYER_ID) {
    const kills = (them.kills ??= [])
    kills.push(fatal.victim)
    if (kills.length % KILLS_PER_XP === 0 && them.stats) them.stats.xp += 1
  }

  if (fatal) {
    addKilledBy(draft, myId, fatal.killer)
  } else {
    // Only a survived exchange puts bars on screen; a fatal one records
    // nothing (`engine.cljs:277-283`). Both are offered, and the helper drops
    // the player.
    addToCombatList(draft, theirId)
    addToCombatList(draft, myId)
  }

  if (hpReduction > 0) {
    addEntity(draft, makeCollisionMarker(allocId(draft), myPos))
  }

  draft.log.push({
    type: 'combat',
    from: theirName,
    to: myName,
    damage: hpReduction,
    killed,
  })

  if (killed) {
    me.dead = true
    me.layer = 'floor'
    me.animation = null
    me.sprite = SPRITES['skull-and-crossbones']
    // The loot, whose pos followed the monster as it chased. Lifted out and the
    // slot cleared before it is re-homed, so it is never reachable from two
    // places at once — see `detach` in state.ts.
    //
    // Clearing it is a deliberate divergence from the original, which left
    // `drop` pointing at the now-live item: harmless there, but here it
    // double-counts in `countEntities` and doubles the object inside every
    // phase-7 snapshot.
    const drop = me.drop ? detach(me.drop) : null
    // `delete`, never `= undefined`: exactOptionalPropertyTypes rejects the
    // assignment, and an undefined value would not survive the JSON round-trip.
    delete me.drop
    addEntity(draft, drop)
    // Nothing strips behavior here any more. A corpse keeps its `kind` and is
    // skipped on `dead` instead, at the two places that used to read the names
    // this block deleted: `runEncounter`'s caller and `updateMonsters`.
    checkForEndgame(draft)
  }

  return true
}
