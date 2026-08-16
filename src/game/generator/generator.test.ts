import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { SPRITES } from '../sprites.ts'
import { builtinContent } from '../content/builtin.ts'
import { canPassTile, findPath, tileAt } from '../grid.ts'
import { keyOf } from '../pos.ts'
import { makeRng } from '../rng.ts'
import type { Entity, GameState, LevelRequest, PlayerCarry } from '../types.ts'
import { PLAYER_ID, TILE } from '../types.ts'
import { makeBaseLevel, makeLevel } from './index.ts'
import {
  depthFloor,
  difficultyAtDepth,
  dugPercentageFor,
  entityCountFor,
  ENTITY_COUNT,
  monsterCountFor,
  MONSTER_COUNT,
} from './ramp.ts'

const request: LevelRequest = { runSeed: 12345, depth: 1 }
const level = (r: LevelRequest = request): GameState => makeLevel(r, builtinContent)

const monsters = (state: GameState): Entity[] =>
  Object.values(state.entities).filter((e) => e.kind === 'monster')
const covers = (state: GameState): Entity[] =>
  Object.values(state.entities).filter((e) => e.kind === 'cover')

describe('makeBaseLevel determinism', () => {
  // The broadest regression test the generator has: any accidental dependency
  // on ambient state — Math.random, the clock, a shared mutable table — fails
  // it. Bound to the base pass on purpose, so it keeps meaning "two scalars in,
  // same level out" once an overlay pass exists.
  it('gives deep-equal states for the same request', () => {
    expect(makeBaseLevel(request, builtinContent)).toEqual(makeBaseLevel(request, builtinContent))
  })

  it('gives a different map at a different depth', () => {
    expect(level({ runSeed: 12345, depth: 2 }).map.floorTiles).not.toEqual(level().map.floorTiles)
  })

  it('gives a different map for a different run seed', () => {
    expect(level({ runSeed: 999, depth: 1 }).map.floorTiles).not.toEqual(level().map.floorTiles)
  })

  it('is unaffected by draws from an unrelated stream', () => {
    // Guards the digger's use of the *global* rot-js instance: an Rng made for
    // the engine (combat, monster AI) must never share state with generation.
    const before = makeBaseLevel(request, builtinContent)
    const dice = makeRng('engine-entropy-stand-in', 42)
    for (let i = 0; i < 500; i++) dice.next()
    expect(makeBaseLevel(request, builtinContent)).toEqual(before)
  })

  it('hands out counter ids below nextEntityId, so the engine can keep allocating', () => {
    // Drops and smoke puffs are allocated ids too even though they live inside
    // their owner rather than in the entity table, so they are checked here:
    // an id at or above the counter would collide with the engine's next spawn.
    const state = level()
    const ids = Object.values(state.entities).flatMap((e) =>
      [e.id, e.drop?.id, e.juice?.id].filter((id) => id !== undefined),
    )
    const counted = ids.filter((id) => id !== PLAYER_ID && id !== 'shrine')
    expect(counted.length).toBeGreaterThan(0)
    for (const id of counted) {
      expect(id).toMatch(/^e\d+$/)
      expect(Number(id.slice(1))).toBeLessThan(state.nextEntityId)
    }
    expect(new Set(ids).size).toBe(ids.length)
  })
})

describe('generated levels are playable', () => {
  // Written against the composed makeLevel rather than the base pass: an overlay
  // can wall off a corridor with a new monster, and the level the player gets is
  // the one that has to be walkable.
  const seeds = [1, 2, 3, 7, 12345]

  it('starts the player on a walkable tile', () => {
    for (const runSeed of seeds) {
      const state = level({ runSeed, depth: 1 })
      const player = state.entities[PLAYER_ID]!
      expect(canPassTile(state.map, player.pos)).toBe(true)
    }
  })

  it('leaves the shrine reachable from the player', () => {
    for (const runSeed of seeds) {
      const state = level({ runSeed, depth: 1 })
      const player = state.entities[PLAYER_ID]!
      const shrine = state.entities['shrine']!
      const path = findPath(player.pos, shrine.pos, (x, y) =>
        canPassTile(state.map, [x, y]),
      )
      expect(path.length).toBeGreaterThan(0)
    }
  })

  it('never spawns two entities on the same tile', () => {
    for (const runSeed of seeds) {
      const state = level({ runSeed, depth: 1 })
      const keys = Object.values(state.entities).map((e) => keyOf(e.pos))
      expect(new Set(keys).size).toBe(keys.length)
    }
  })

  // A doorway is often a room's only exit, and an entity on the `occupy` layer
  // there reads as blocked to `makeMonsterPassable` — so a monster parked in one
  // strands everything behind it for the whole level. Swept wide rather than
  // over `seeds`: before the fix 13 of the first 40 seeds put something on a
  // door, and none of the five listed above was among them.
  it('never spawns an entity in a doorway', () => {
    for (let runSeed = 1; runSeed <= 40; runSeed++) {
      const state = level({ runSeed, depth: 1 })
      const inDoorway = Object.values(state.entities)
        .filter((e) => tileAt(state.map, e.pos[0], e.pos[1]) === TILE.door)
        .map((e) => `${e.name}@${e.pos.join(',')}`)
      expect(inDoorway, `runSeed ${runSeed}`).toEqual([])
    }
  })
})

describe('level contents', () => {
  const state = level()

  it('places the requested number of covers and monsters, plus player and shrine', () => {
    expect(covers(state)).toHaveLength(ENTITY_COUNT)
    expect(monsters(state)).toHaveLength(MONSTER_COUNT)
    expect(Object.keys(state.entities)).toHaveLength(ENTITY_COUNT + MONSTER_COUNT + 2)
  })

  it('counts collectibles including the ones still hidden under covers', () => {
    for (const name of ['mushroom', 'chestnut', 'gem-stone']) {
      const visible = Object.values(state.entities).filter(
        (e) => e.name === name || e.drop?.name === name,
      )
      expect(state.counts[name]).toBe(visible.length)
    }
  })

  it('gives each monster its own health pair rather than the template array', () => {
    // A fresh level, because this test mutates hp — the shared one stays pristine.
    const all = monsters(level())
    const first = all[0]!
    first.stats!.hp.cur = 0
    for (const other of all.slice(1)) {
      if (other.name === first.name) expect(other.stats!.hp.cur).toBeGreaterThan(0)
    }
  })

  it('gives every placed entity and every drop a kind, so none is silently inert', () => {
    // `kind` is optional on Entity so the smoke puff and collision marker can go
    // without one — they are decoration and have no behavior. The cost is that a
    // placement function that forgets a kind produces an entity the encounter
    // switch skips (`movement.ts`, `if (!occupant?.kind) continue`) with no
    // compile error to catch it. This is that catch.
    for (const entity of Object.values(state.entities)) {
      expect(entity.kind).toBeDefined()
      if (entity.drop) expect(entity.drop.kind).toBeDefined()
      // And the decoration stays kindless on purpose: give the smoke puff a kind
      // and uncovering an item would dispatch an encounter on the puff.
      if (entity.juice) expect(entity.juice.kind).toBeUndefined()
    }
  })

  it('puts drops and covers where their owner stands', () => {
    for (const entity of [...monsters(state), ...covers(state)]) {
      if (entity.drop) expect(entity.drop.pos).toEqual(entity.pos)
      if (entity.juice) expect(entity.juice.pos).toEqual(entity.pos)
    }
  })
})

describe('the depth ramp', () => {
  /**
   * **Depth 1 must generate exactly what it generated before the ramp existed.**
   *
   * Fixed mode is the phase-6 game — the faithful clone the whole port was
   * aiming at — so "did this work at phase 6?" has to stay an answerable
   * question for as long as a player can choose that branch. Every knob in
   * `ramp.ts` is written to be an identity at depth 1, and this is what says so.
   *
   * These hashes were taken from the build immediately before the ramp landed.
   * **A change here that moves them is a bug in the change, not in the test** —
   * do not update the constants without a deliberate decision to give fixed
   * mode up. The generator is fully deterministic, so they cannot flake.
   */
  const GOLDEN_DEPTH_1: Record<number, string> = {
    1: 'ca32280fde276b42',
    12345: '735f7cec0786d605',
  }

  it('generates depth 1 byte-identically to the pre-ramp build', () => {
    for (const [runSeed, golden] of Object.entries(GOLDEN_DEPTH_1)) {
      const state = makeBaseLevel({ runSeed: Number(runSeed), depth: 1 }, builtinContent)
      const hash = createHash('sha256').update(JSON.stringify(state)).digest('hex').slice(0, 16)
      expect(hash, `runSeed ${runSeed}`).toBe(golden)
    }
  })

  it('is the identity at depth 1, knob by knob', () => {
    // The hash above would catch any of these on its own, but it cannot say
    // *which*. This can, which is the difference between a failed build and a
    // diagnosed one.
    expect(depthFloor(1)).toBe(0)
    expect(difficultyAtDepth(0.42, 1)).toBe(0.42)
    expect(entityCountFor(1)).toBe(ENTITY_COUNT)
    expect(monsterCountFor(1)).toBe(MONSTER_COUNT)
    // rot-js's own default, so passing it explicitly changes nothing.
    expect(dugPercentageFor(1)).toBe(0.2)
  })

  it('raises difficulty with depth without ever reaching past 1', () => {
    let previous = difficultyAtDepth(0.5, 1)
    for (let depth = 2; depth <= 20; depth++) {
      const raised = difficultyAtDepth(0.5, depth)
      expect(raised).toBeGreaterThanOrEqual(previous)
      expect(raised).toBeLessThanOrEqual(1)
      previous = raised
    }
  })

  it('leaves distance meaning something at every depth', () => {
    // The floor is a floor, not a flattening: if depth ever swallowed the whole
    // range, walking to the far end of a deep level would stop mattering and
    // `posToDifficulty` would be dead weight.
    for (const depth of [1, 5, 11, 30]) {
      expect(difficultyAtDepth(1, depth)).toBeGreaterThan(difficultyAtDepth(0, depth))
    }
  })

  it('puts harder monsters at depth than at the top, on average', () => {
    const meanXp = (depth: number): number => {
      const xps: number[] = []
      for (let runSeed = 0; runSeed < 20; runSeed++) {
        for (const monster of monsters(level({ runSeed, depth }))) xps.push(monster.stats!.xp)
      }
      return xps.reduce((a, b) => a + b, 0) / xps.length
    }
    // Aggregated over seeds for the same reason the within-level gradient test
    // is: the ±2 table blur is wide enough to swamp any single level.
    expect(meanXp(8)).toBeGreaterThan(meanXp(1))
  })

  it('populates a deeper level more heavily, to a cap', () => {
    const deep = level({ runSeed: 12345, depth: 9 })
    expect(monsters(deep)).toHaveLength(monsterCountFor(9))
    expect(covers(deep)).toHaveLength(entityCountFor(9))
    expect(monsterCountFor(9)).toBeGreaterThan(MONSTER_COUNT)
    // Capped, so an endless run cannot eventually ask for more monsters than
    // there are tiles to stand on.
    expect(monsterCountFor(500)).toBe(monsterCountFor(6))
    expect(entityCountFor(500)).toBe(entityCountFor(6))
    expect(dugPercentageFor(500)).toBeCloseTo(0.3)
  })
})

describe('carry', () => {
  const carry = (over: Partial<PlayerCarry> = {}): PlayerCarry => ({
    stats: { hp: { cur: 3, max: 10 }, xp: 9, hpInc: 40 },
    inventory: [
      {
        id: 'e7',
        name: 'axe',
        sprite: SPRITES.axe,
        pos: [99, 99],
        layer: 'floor',
        kind: 'item',
        value: 4,
        dmg: 2,
        carried: true,
      },
    ],
    ...over,
  })

  it('arrives with the stats and pack it left with', () => {
    const state = makeLevel({ runSeed: 12345, depth: 2 }, builtinContent, carry())
    const player = state.entities[PLAYER_ID]!
    // Not restored on descent: arriving at depth with 3 HP and having to decide
    // whether to fight or run is the point of carrying anything at all.
    expect(player.stats).toEqual({ hp: { cur: 3, max: 10 }, xp: 9, hpInc: 40 })
    expect(player.inventory?.map((i) => i.name)).toEqual(['axe'])
  })

  it('changes nothing but the player', () => {
    // Carry is a post-pass, and the whole argument for keeping it out of the
    // base generator is that it must not be able to move a wall or a monster.
    const request: LevelRequest = { runSeed: 777, depth: 4 }
    const bare = makeLevel(request, builtinContent)
    const laden = makeLevel(request, builtinContent, carry())
    expect(laden.map).toEqual(bare.map)
    expect(laden.counts).toEqual(bare.counts)
    expect(laden.entities[PLAYER_ID]!.pos).toEqual(bare.entities[PLAYER_ID]!.pos)
    const others = (s: GameState) =>
      Object.values(s.entities)
        .filter((e) => e.id !== PLAYER_ID)
        .map((e) => `${e.name}@${e.pos.join(',')}`)
    expect(others(laden)).toEqual(others(bare))
  })

  it('re-issues carried ids from the new level, so nothing collides', () => {
    // A carried item keeps an id allocated against the *previous* level, and
    // the counter starts at zero every level — so an `e7` walked in and an `e7`
    // picked up here would be one React key for two items in the strip.
    const state = makeLevel({ runSeed: 12345, depth: 2 }, builtinContent, carry())
    const carried = state.entities[PLAYER_ID]!.inventory![0]!
    const levelIds = new Set(Object.values(state.entities).map((e) => e.id))
    expect(levelIds.has(carried.id)).toBe(false)
    expect(Number(carried.id.slice(1))).toBeLessThan(state.nextEntityId)
  })

  it('keeps the carried mark, so the completion bars still count this level', () => {
    const state = makeLevel({ runSeed: 12345, depth: 2 }, builtinContent, carry())
    expect(state.entities[PLAYER_ID]!.inventory![0]!.carried).toBe(true)
  })

  it('still round-trips through JSON', () => {
    const state = makeLevel({ runSeed: 12345, depth: 2 }, builtinContent, carry())
    expect(JSON.parse(JSON.stringify(state))).toEqual(state)
  })
})

describe('difficulty', () => {
  it('spawns easier monsters near the player than at the far end, on average', () => {
    // A single level is too small a sample — the ±2 spread is wide — so this
    // aggregates over many seeds. It guards the difficulty *gradient*, which is
    // the part that a broken posToDifficulty or a mis-clamped monster index
    // silently flattens.
    const xpNear: number[] = []
    const xpFar: number[] = []
    for (let runSeed = 0; runSeed < 40; runSeed++) {
      const state = level({ runSeed, depth: 1 })
      const player = state.entities[PLAYER_ID]!
      const passable = (x: number, y: number) => canPassTile(state.map, [x, y])
      const shrineDistance = findPath(player.pos, state.entities['shrine']!.pos, passable).length
      for (const monster of monsters(state)) {
        const distance = findPath(player.pos, monster.pos, passable).length
        ;(distance < shrineDistance / 2 ? xpNear : xpFar).push(monster.stats!.xp)
      }
    }
    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
    expect(xpNear.length).toBeGreaterThan(20)
    expect(xpFar.length).toBeGreaterThan(20)
    expect(mean(xpNear)).toBeLessThan(mean(xpFar))
  })
})

describe('state stays serializable', () => {
  it('round-trips through JSON unchanged', () => {
    const state = level()
    expect(JSON.parse(JSON.stringify(state))).toEqual(state)
  })
})
