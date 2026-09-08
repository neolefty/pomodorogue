/**
 * The simplest policy that collects shields: walk to the nearest thing worth
 * having, armour first, and fight whatever is in the way.
 *
 * Priorities, nearest-first within a tier and the first non-empty tier wins:
 *
 * 1. a visible item with `armour` — the shield;
 * 2. any other visible item, and a potion if the player is hurt;
 * 3. an unlifted cover;
 * 4. the shrine.
 *
 * Nothing is avoided. A monster on the path is walked into, which is how
 * combat works (`moveTo` runs the encounter and the bump costs the turn), and
 * the bot keeps bumping until one of them is dead. That is the reckless end
 * of the spectrum, and it is what the unlosability question needs: a bot
 * that takes every fight and still cannot die is the strongest possible
 * statement of the defect in docs/threads.md.
 *
 * It does not peek under covers or at a monster's `drop` — only at what is on
 * the floor, which is what a human sees.
 */
import type { Dir } from '../engine/movement.ts'
import { DIR_DELTAS, makePlayerPassable, posInDir } from '../engine/movement.ts'
import { getPlayer } from '../entities.ts'
import { findPath, inBounds, tileIndex } from '../grid.ts'
import type { PassableFn } from '../grid.ts'
import type { Pos } from '../pos.ts'
import { posEquals } from '../pos.ts'
import type { Entity, GameState } from '../types.ts'
import type { Chooser, Policy } from './policy.ts'

const DIRS = Object.keys(DIR_DELTAS) as Dir[]

/** The direction that takes one step from `from` to the adjacent `to`, if any. */
export const dirToward = (from: Pos, to: Pos): Dir | null =>
  DIRS.find((dir) => posEquals(posInDir(from, dir), to)) ?? null

/**
 * Walking distance from `from` to every tile, as a flat array indexed like the
 * tile map; `-1` is unreachable. One breadth-first flood per turn answers
 * "which target is nearest?" for every candidate at once, where an A* per
 * candidate would be twenty searches to learn the same thing.
 */
export function floodDistances(state: GameState, from: Pos, passable: PassableFn): Int32Array {
  const size = state.map.size
  const dist = new Int32Array(size[0] * size[1]).fill(-1)
  const queue: Pos[] = [from]
  dist[tileIndex(size, from[0], from[1])] = 0
  for (let head = 0; head < queue.length; head++) {
    const here = queue[head]!
    const d = dist[tileIndex(size, here[0], here[1])]!
    for (const dir of DIRS) {
      const next = posInDir(here, dir)
      if (!inBounds(size, next[0], next[1]) || !passable(next[0], next[1])) continue
      const index = tileIndex(size, next[0], next[1])
      if (dist[index] !== -1) continue
      dist[index] = d + 1
      queue.push(next)
    }
  }
  return dist
}

/** Which tier an entity on the floor belongs to, or null for "not a target". */
function tierOf(entity: Entity, hurt: boolean): number | null {
  switch (entity.kind) {
    case 'item':
      return (entity.armour ?? 0) > 0 ? 1 : 2
    case 'potion':
      // At full health the potion is left where it lies (`increaseHp`), so
      // walking to it would be a wasted trip.
      return hurt ? 2 : null
    case 'cover':
      return 3
    case 'shrine':
      return 4
    default:
      return null
  }
}

function chooseTarget(state: GameState, dist: Int32Array, hurt: boolean): Pos | null {
  let best: { pos: Pos; tier: number; d: number } | null = null
  for (const entity of Object.values(state.entities)) {
    if (entity.dead) continue
    const tier = tierOf(entity, hurt)
    if (tier === null) continue
    const d = dist[tileIndex(state.map.size, entity.pos[0], entity.pos[1])] ?? -1
    if (d < 0) continue
    if (best === null || tier < best.tier || (tier === best.tier && d < best.d)) {
      best = { pos: entity.pos, tier, d }
    }
  }
  return best?.pos ?? null
}

export const collector: Policy = {
  name: 'collector',
  begin(): Chooser {
    return (state) => {
      const player = getPlayer(state)
      if (!player) return null
      const passable = makePlayerPassable(state)
      const hurt = player.stats !== undefined && player.stats.hp.cur < player.stats.hp.max
      const target = chooseTarget(state, floodDistances(state, player.pos, passable), hurt)
      if (!target) return null
      // The engine's own pathfinder for the step, so the bot walks the routes
      // the monsters do. Re-planned every turn: a bump leaves the player
      // where they were, and a fight rearranges what is in the way.
      const step = findPath(player.pos, target, passable)[1]
      return step ? dirToward(player.pos, step) : null
    }
  },
}
