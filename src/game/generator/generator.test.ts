import { describe, expect, it } from 'vitest'
import { builtinContent } from '../content/builtin.ts'
import { canPassTile, findPath } from '../grid.ts'
import { keyOf } from '../pos.ts'
import { makeRng } from '../rng.ts'
import type { Entity, GameState, LevelRequest } from '../types.ts'
import { PLAYER_ID } from '../types.ts'
import { ENTITY_COUNT, MONSTER_COUNT, makeBaseLevel, makeLevel } from './index.ts'

const request: LevelRequest = { runSeed: 12345, depth: 1 }
const level = (r: LevelRequest = request): GameState => makeLevel(r, builtinContent)

const monsters = (state: GameState): Entity[] =>
  Object.values(state.entities).filter((e) => e.fns?.update === 'chasePlayer')
const covers = (state: GameState): Entity[] =>
  Object.values(state.entities).filter((e) => e.fns?.encounter === 'uncoverItem')

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
      expect(canPassTile(state.map.floorTiles, player.pos)).toBe(true)
    }
  })

  it('leaves the shrine reachable from the player', () => {
    for (const runSeed of seeds) {
      const state = level({ runSeed, depth: 1 })
      const player = state.entities[PLAYER_ID]!
      const shrine = state.entities['shrine']!
      const path = findPath(player.pos, shrine.pos, (x, y) =>
        canPassTile(state.map.floorTiles, [x, y]),
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
    first.stats!.hp[0] = 0
    for (const other of all.slice(1)) {
      if (other.name === first.name) expect(other.stats!.hp[0]).toBeGreaterThan(0)
    }
  })

  it('puts drops and covers where their owner stands', () => {
    for (const entity of [...monsters(state), ...covers(state)]) {
      if (entity.drop) expect(entity.drop.pos).toEqual(entity.pos)
      if (entity.juice) expect(entity.juice.pos).toEqual(entity.pos)
    }
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
      const passable = (x: number, y: number) => canPassTile(state.map.floorTiles, [x, y])
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
