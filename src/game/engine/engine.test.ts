import { produce } from 'immer'
import { describe, expect, it } from 'vitest'
import { builtinContent } from '../content/builtin.ts'
import { makeLevel } from '../generator/index.ts'
import { canPassTile, findPath, tileIndex } from '../grid.ts'
import type { Pos } from '../pos.ts'
import { posEquals } from '../pos.ts'
import type { Rng } from '../rng.ts'
import { makeRng } from '../rng.ts'
import { SPRITES } from '../sprites.ts'
import type { Entity, EntityId, GameMap, GameState, Tile } from '../types.ts'
import { PLAYER_ID, TILE } from '../types.ts'
import { combat, getArmourHp, getWeaponsDmg } from './combat.ts'
import { addItemToInventory, uncoverItem } from './encounters.ts'
import type { Dir } from './movement.ts'
import { DIR_DELTAS, moveTo, posInDir } from './movement.ts'
import { addEntity } from './state.ts'
import { expireAnimation, REJUVENATION_RATE, takeTurn } from './turn.ts'

// ***** fixtures ***** //

// One open room with a wall around it. Small enough to reason about, big enough
// that a monster can chase across it.
const SIZE = 9

function makeTestMap(): GameMap {
  const size: Pos = [SIZE, SIZE]
  const floorTiles = new Array<Tile>(SIZE * SIZE).fill(TILE.rock)
  for (let x = 0; x < SIZE; x++) {
    for (let y = 0; y < SIZE; y++) {
      const isWall = x === 0 || y === 0 || x === SIZE - 1 || y === SIZE - 1
      floorTiles[tileIndex(size, x, y)] = isWall ? TILE.wall : TILE.room
    }
  }
  return {
    floorTiles,
    rooms: [{ x1: 1, y1: 1, x2: SIZE - 2, y2: SIZE - 2, doors: [] }],
    size,
  }
}

function makeTestState(entities: Entity[]): GameState {
  return {
    seed: 1,
    depth: 1,
    map: makeTestMap(),
    entities: Object.fromEntries(entities.map((e) => [e.id, e])),
    // Well above the fixtures' own ids, so a spawn during play cannot collide.
    nextEntityId: 100,
    moves: 0,
    combatants: {},
    outcome: null,
    counts: {},
    log: [{ type: 'start', seed: 1, depth: 1 }],
  }
}

const player = (pos: Pos, over: Partial<Entity> = {}): Entity => ({
  id: PLAYER_ID,
  name: 'you',
  sprite: SPRITES.elf,
  pos,
  layer: 'occupy',
  kind: 'player',
  stats: { hp: { cur: 10, max: 10 }, xp: 3, hpInc: 0 },
  inventory: [],
  ...over,
})

const monster = (id: EntityId, pos: Pos, over: Partial<Entity> = {}): Entity => ({
  id,
  name: 'the rat',
  sprite: SPRITES.rat,
  pos,
  layer: 'occupy',
  kind: 'monster',
  activation: 20,
  stats: { hp: { cur: 3, max: 3 }, xp: 2, hpInc: 0 },
  ...over,
})

const item = (id: EntityId, pos: Pos, over: Partial<Entity> = {}): Entity => ({
  id,
  name: 'chestnut',
  sprite: SPRITES.chestnut,
  pos,
  layer: 'floor',
  kind: 'item',
  value: 1,
  ...over,
})

const axe = (id: EntityId, pos: Pos): Entity =>
  item(id, pos, { name: 'axe', sprite: SPRITES.axe, dmg: 10 })

/**
 * Runs one draft mutator the way `takeTurn` does.
 *
 * The engine opens exactly one `produce`, at `takeTurn` (§6 of
 * docs/port/05a-simplify.md), so a test that reaches past it for a single
 * function has to supply the boundary itself.
 */
const fight = (state: GameState, theirId: EntityId, myId: EntityId, r: Rng): GameState =>
  produce(state, (draft) => {
    combat(draft, theirId, myId, r)
  })

const step = (state: GameState, id: EntityId, to: Pos, r: Rng): GameState =>
  produce(state, (draft) => {
    moveTo(draft, id, to, r)
  })

/**
 * The first outcome over a fixed sweep of seeds that satisfies `predicate`.
 *
 * Combat connects on 5 rolls in 6, so "this blow lands" is not a property any
 * single seed guarantees. Searching a deterministic seed range keeps the test
 * reproducible without reaching for a loaded die.
 */
function firstRollWhere(
  run: (rng: Rng) => GameState,
  predicate: (state: GameState) => boolean,
): GameState {
  for (let n = 0; n < 100; n++) {
    const result = run(makeRng('test', n))
    if (predicate(result)) return result
  }
  throw new Error('firstRollWhere: no seed in 0..99 produced the required outcome')
}

const rng = (n = 1): Rng => makeRng('test', n)

/**
 * An `Rng` that counts how often it was drawn from.
 *
 * Some engine behavior is only observable in the stream. A monster that fails
 * its activation gate and one that passes it and then dawdles both end the turn
 * standing still — the difference is that the first never rolled, and every
 * later roll in the turn is offset by whether it did.
 */
function countingRng(inner: Rng): Rng & { readonly draws: number } {
  let draws = 0
  const tally = <T>(draw: () => T): T => {
    draws += 1
    return draw()
  }
  return {
    get draws() {
      return draws
    },
    next: () => tally(() => inner.next()),
    int: (max) => tally(() => inner.int(max)),
    range: (lo, hi) => tally(() => inner.range(lo, hi)),
    pick: (items) => tally(() => inner.pick(items)),
    weighted: (items, weight) => tally(() => inner.weighted(items, weight)),
  }
}

// ***** tests ***** //

describe('combat', () => {
  it('is deterministic under a fixed injected seed', () => {
    const state = makeTestState([player([2, 2]), monster('m1', [3, 2])])
    const once = fight(state, PLAYER_ID, 'm1', rng(7))
    const twice = fight(state, PLAYER_ID, 'm1', rng(7))
    expect(once).toEqual(twice)
  })

  it('sums weapons and armour across the whole inventory', () => {
    const carrier = player([2, 2], {
      inventory: [
        item('i1', [2, 2], { dmg: 2 }),
        item('i2', [2, 2], { dmg: 1, armour: 3 }),
        item('i3', [2, 2], { armour: 1 }),
      ],
    })
    expect(getWeaponsDmg(carrier)).toBe(3)
    expect(getArmourHp(carrier)).toBe(4)
    expect(getWeaponsDmg(monster('m1', [1, 1]))).toBe(0)
  })

  it('lets armour absorb the blow entirely, leaving no damage and no death', () => {
    // The rat's xp of 2 caps its roll at 1, and it carries no weapon, so two
    // points of armour can never be beaten.
    const armoured = player([2, 2], {
      stats: { hp: { cur: 4, max: 10 }, xp: 3, hpInc: 0 },
      inventory: [item('shield', [2, 2], { name: 'shield', sprite: SPRITES.shield, armour: 2 })],
    })
    const state = makeTestState([armoured, monster('m1', [3, 2])])

    for (let n = 0; n < 30; n++) {
      const next = fight(state, 'm1', PLAYER_ID, rng(n))
      const hit = next.entities[PLAYER_ID]!
      expect(hit.stats!.hp.cur).toBe(4)
      expect(hit.dead).toBeUndefined()
      expect(next.log.at(-1)).toMatchObject({ type: 'combat', damage: 0, killed: false })
    }
  })

  it('grants the player one xp for every second kill, not every kill', () => {
    let state = makeTestState([
      player([2, 2], { inventory: [axe('axe', [2, 2])] }),
      monster('m1', [3, 2]),
      monster('m2', [2, 3]),
    ])
    state = firstRollWhere(
      (r) => fight(state, PLAYER_ID, 'm1', r),
      (s) => s.entities['m1']!.dead === true,
    )
    expect(state.entities[PLAYER_ID]!.stats!.xp).toBe(3)

    state = firstRollWhere(
      (r) => fight(state, PLAYER_ID, 'm2', r),
      (s) => s.entities['m2']!.dead === true,
    )
    expect(state.entities[PLAYER_ID]!.stats!.xp).toBe(4)
    expect(state.entities[PLAYER_ID]!.kills).toHaveLength(2)
  })
})

describe('the kill site', () => {
  const killed = (): GameState => {
    const state = makeTestState([
      player([2, 2], { inventory: [axe('axe', [2, 2])] }),
      monster('m1', [3, 2], { drop: item('loot', [3, 2]) }),
    ])
    return firstRollWhere(
      (r) => fight(state, PLAYER_ID, 'm1', r),
      (s) => s.entities['m1']!.dead === true,
    )
  }

  it('marks the corpse dead, sinks it to the floor and swaps in the skull', () => {
    const corpse = killed().entities['m1']!
    expect(corpse.dead).toBe(true)
    expect(corpse.layer).toBe('floor')
    expect(corpse.sprite).toEqual(SPRITES['skull-and-crossbones'])
    expect(corpse.animation).toBeNull()
  })

  it('drops the loot into the world and clears it from the corpse', () => {
    const state = killed()
    expect(state.entities['loot']).toMatchObject({ name: 'chestnut', pos: [3, 2] })
    // Divergence from the original, which left the corpse pointing at the
    // now-live item: here it would double-count in countEntities.
    expect('drop' in state.entities['m1']!).toBe(false)
  })

  it('leaves the corpse inert — no fight, and the player walks straight over it', () => {
    // Phase 5 made a corpse inert by deleting its behavior names. The kind stays
    // on the corpse now, so `dead` is the only thing carrying that fact — which
    // makes this the test guarding it. Get it wrong and walking onto a corpse
    // re-fights it and blocks the player forever.
    const state = killed()
    const combatBefore = state.log.filter((e) => e.type === 'combat').length
    const hpBefore = state.entities[PLAYER_ID]!.stats!.hp.cur

    const next = takeTurn(state, 'right', rng())

    expect(next.entities[PLAYER_ID]!.pos).toEqual([3, 2])
    expect(next.entities[PLAYER_ID]!.stats!.hp.cur).toBe(hpBefore)
    expect(next.log.filter((e) => e.type === 'combat')).toHaveLength(combatBefore)
    expect(next.entities[PLAYER_ID]!.kills).toHaveLength(1)
  })

  it('stops the corpse taking a turn', () => {
    // The other half of what `dead` replaced: `updateMonsters` used to filter on
    // the update name this block deleted.
    const state = killed()
    const next = takeTurn(state, 'up', rng())
    expect(next.entities['m1']!.pos).toEqual([3, 2])
  })

  it('records the victim with its living sprite, not the skull', () => {
    const kills = killed().entities[PLAYER_ID]!.kills!
    expect(kills).toEqual([{ name: 'the rat', sprite: SPRITES.rat }])
  })

  it('records who did the killing', () => {
    expect(killed().entities['m1']!.killedBy).toEqual({ name: 'you', sprite: SPRITES.elf })
  })

  it('drops loot where the monster died, not where it spawned', () => {
    // The port trap at engine.cljs:88 — the drop's pos has to follow the mover.
    let state = makeTestState([
      player([6, 6], { inventory: [axe('axe', [6, 6])] }),
      monster('m1', [1, 1], { drop: item('loot', [1, 1]) }),
    ])
    state = step(state, 'm1', [2, 1], rng())
    state = step(state, 'm1', [3, 1], rng())
    state = step(state, 'm1', [3, 2], rng())
    expect(state.entities['m1']!.pos).toEqual([3, 2])

    state = firstRollWhere(
      (r) => fight(state, PLAYER_ID, 'm1', r),
      (s) => s.entities['m1']!.dead === true,
    )
    expect(state.entities['loot']!.pos).toEqual([3, 2])
  })
})

describe('combatants', () => {
  it('records the monster exactly once for a survived exchange, and never the player', () => {
    // The player bumps the monster, then the monster retaliates on its own turn.
    // Two hits, one key — which is the point of keying by id.
    const state = makeTestState([
      player([2, 2]),
      monster('m1', [3, 2], { stats: { hp: { cur: 9, max: 9 }, xp: 2, hpInc: 0 } }),
    ])
    const next = takeTurn(state, 'right', rng(3))
    expect(next.entities['m1']!.dead).toBeUndefined()
    expect(next.entities[PLAYER_ID]!.dead).toBeUndefined()
    expect(Object.keys(next.combatants)).toEqual(['m1'])
  })

  it('records nothing at all for a fatal exchange', () => {
    const state = makeTestState([
      player([2, 2], { inventory: [axe('axe', [2, 2])] }),
      monster('m1', [3, 2]),
    ])
    const next = firstRollWhere(
      (r) => fight(state, PLAYER_ID, 'm1', r),
      (s) => s.entities['m1']!.dead === true,
    )
    expect(next.combatants).toEqual({})
  })

  it('is cleared at the start of each turn', () => {
    const state = makeTestState([player([2, 2]), monster('m1', [6, 6], { activation: 1 })])
    const next = takeTurn({ ...state, combatants: { m1: true } }, 'left', rng())
    expect(next.combatants).toEqual({})
  })

  // The bars are what the player reads to decide fight-or-flee, and bumping a
  // wall is something they do constantly. A free action must not cost them.
  it('survives a wall bump, which costs no turn', () => {
    const state = makeTestState([player([1, 1]), monster('m1', [6, 6], { activation: 1 })])
    const next = takeTurn({ ...state, combatants: { m1: true } }, 'left', rng())
    expect(next.entities[PLAYER_ID]!.pos).toEqual([1, 1])
    expect(next.moves).toBe(0)
    expect(next.combatants).toEqual({ m1: true })
  })
})

describe('outcomes', () => {
  it('sets died when the player is killed', () => {
    const state = makeTestState([
      player([2, 2], { stats: { hp: { cur: 1, max: 1 }, xp: 3, hpInc: 0 } }),
      monster('m1', [3, 2], { inventory: [axe('m1-axe', [3, 2])] }),
    ])
    const next = firstRollWhere(
      (r) => fight(state, 'm1', PLAYER_ID, r),
      (s) => s.entities[PLAYER_ID]!.dead === true,
    )
    expect(next.outcome).toBe('died')
    expect(next.log.at(-1)).toMatchObject({ type: 'outcome', outcome: 'died' })
  })

  it('sets descended when the player reaches the shrine', () => {
    const shrine: Entity = {
      id: 'shrine',
      name: 'shrine',
      sprite: SPRITES['shinto-shrine'],
      pos: [3, 2],
      layer: 'occupy',
      kind: 'shrine',
    }
    const next = takeTurn(makeTestState([player([2, 2]), shrine]), 'right', rng())
    expect(next.outcome).toBe('descended')
    // The shrine blocks, so the player never actually steps onto the tile.
    expect(next.entities[PLAYER_ID]!.pos).toEqual([2, 2])
  })

  // The death frame is not a throwaway: it is what the UI leaves on screen and
  // what the tombstone reports on. Without a guard inside the monster loop,
  // whether a monster got a free go over the body came down to where it sat in
  // the entity table. See note 5 in docs/port/00-review-notes.md.
  it('ends the turn on the killing blow, leaving later monsters where they were', () => {
    // m1 is adjacent and armed; m2 is well inside its activation range and
    // would close in on any turn it were given.
    const state = makeTestState([
      player([4, 4], { stats: { hp: { cur: 1, max: 1 }, xp: 3, hpInc: 0 } }),
      monster('m1', [5, 4], { inventory: [axe('m1-axe', [5, 4])] }),
      monster('m2', [4, 7], { activation: 20 }),
    ])
    const next = firstRollWhere(
      (r) => takeTurn(state, null, r),
      (s) => s.outcome === 'died',
    )
    expect(next.entities['m2']!.pos).toEqual([4, 7])
  })

  it('ignores further turns once the game is over', () => {
    const state = { ...makeTestState([player([2, 2])]), outcome: 'died' as const }
    expect(takeTurn(state, 'right', rng())).toBe(state)
  })
})

describe('what costs a turn', () => {
  it('counts a rest', () => {
    const next = takeTurn(makeTestState([player([2, 2])]), null, rng())
    expect(next.moves).toBe(1)
    expect(next.entities[PLAYER_ID]!.pos).toEqual([2, 2])
  })

  it('counts a bump into a monster', () => {
    const state = makeTestState([
      player([2, 2]),
      monster('m1', [3, 2], { stats: { hp: { cur: 9, max: 9 }, xp: 2, hpInc: 0 } }),
    ])
    const next = takeTurn(state, 'right', rng())
    expect(next.moves).toBe(1)
    expect(next.entities[PLAYER_ID]!.pos).toEqual([2, 2])
    expect(next.entities[PLAYER_ID]!.animation).toMatchObject({ name: 'bump-right' })
  })

  it('does not count a walk into a wall', () => {
    const next = takeTurn(makeTestState([player([1, 1])]), 'left', rng())
    expect(next.moves).toBe(0)
    expect(next.entities[PLAYER_ID]!.pos).toEqual([1, 1])
    expect(next.entities[PLAYER_ID]!.moved).toBe(false)
  })

  it('counts an ordinary step', () => {
    const next = takeTurn(makeTestState([player([2, 2])]), 'down', rng())
    expect(next.moves).toBe(1)
    expect(next.entities[PLAYER_ID]!.pos).toEqual([2, 3])
  })
})

describe('item encounters', () => {
  it('picks an item up without blocking, and logs it', () => {
    const state = makeTestState([player([2, 2]), item('i1', [3, 2])])
    const next = takeTurn(state, 'right', rng())
    expect(next.entities['i1']).toBeUndefined()
    expect(next.entities[PLAYER_ID]!.inventory).toHaveLength(1)
    expect(next.entities[PLAYER_ID]!.pos).toEqual([3, 2])
    expect(next.log.at(-1)).toEqual({ type: 'item', name: 'chestnut' })
  })

  it('heals by three, capped at max', () => {
    const wounded = player([2, 2], { stats: { hp: { cur: 8, max: 10 }, xp: 3, hpInc: 0 } })
    const potion = item('p1', [3, 2], { name: 'health', kind: 'potion' })
    const next = takeTurn(makeTestState([wounded, potion]), 'right', rng())
    expect(next.entities[PLAYER_ID]!.stats!.hp.cur).toBe(10)
    expect(next.entities['p1']).toBeUndefined()
  })

  it('leaves the potion on the floor at full health', () => {
    const potion = item('p1', [3, 2], { name: 'health', kind: 'potion' })
    const next = takeTurn(makeTestState([player([2, 2]), potion]), 'right', rng())
    expect(next.entities['p1']).toBeDefined()
    expect(next.entities[PLAYER_ID]!.pos).toEqual([3, 2])
  })

  it('uncovers a cover, revealing the drop and the smoke, and blocks the move', () => {
    const cover = item('c1', [3, 2], {
      name: 'rock',
      sprite: SPRITES.rock,
      kind: 'cover',
      drop: item('hidden', [3, 2]),
      juice: item('smoke', [3, 2], { name: 'smoke', sprite: SPRITES.cloud, layer: 'between' }),
    })
    const next = takeTurn(makeTestState([player([2, 2]), cover]), 'right', rng())
    expect(next.entities['c1']).toBeUndefined()
    expect(next.entities['hidden']).toBeDefined()
    expect(next.entities['smoke']).toBeDefined()
    // Revealing costs the turn: the player stays put but the move counts.
    expect(next.entities[PLAYER_ID]!.pos).toEqual([2, 2])
    expect(next.moves).toBe(1)
  })

  it('lets a monster walk over items without consuming them', () => {
    const state = makeTestState([player([2, 2]), monster('m1', [4, 2]), item('i1', [3, 2])])
    const next = takeTurn(state, 'up', rng(5))
    expect(next.entities['i1']).toBeDefined()
  })

  // Nothing today adds an entity and re-homes it inside one `produce` — the
  // player gets a single action per turn. These pin `detach` down anyway,
  // because the failure is not a wrong answer but a thrown `[Immer] 'current'
  // expects a draft`: Immer only drafts what it read from the base state, so an
  // entity added mid-produce comes back raw and bare `current()` rejects it.
  it('picks up an item that was added during the same produce', () => {
    const next = produce(makeTestState([player([2, 2])]), (draft) => {
      addEntity(draft, item('fresh', [2, 2]))
      addItemToInventory(draft, PLAYER_ID, 'fresh')
    })
    expect(next.entities['fresh']).toBeUndefined()
    expect(next.entities[PLAYER_ID]!.inventory).toHaveLength(1)
  })

  it('uncovers a cover that was added during the same produce', () => {
    const next = produce(makeTestState([player([2, 2])]), (draft) => {
      addEntity(
        draft,
        item('c1', [3, 2], {
          kind: 'cover',
          drop: item('hidden', [3, 2]),
          juice: item('smoke', [3, 2], { layer: 'between' }),
        }),
      )
      uncoverItem(draft, PLAYER_ID, 'c1')
    })
    expect(next.entities['c1']).toBeUndefined()
    expect(next.entities['hidden']).toBeDefined()
    expect(next.entities['smoke']).toBeDefined()
  })
})

describe('expireAnimation', () => {
  // The engine's second entry point, and the only one the UI calls outside the
  // turn loop: transient effects carry `disposal: 'destroy'` and are cleared
  // when their animation ends. It exists so the UI never has to open a
  // `produce` of its own. See "Animations" in docs/port/06-ui.md.
  it('removes the entity whose animation finished, and nothing else', () => {
    const smoke = item('smoke', [3, 2], {
      layer: 'between',
      animation: { name: 'fade', disposal: 'destroy' },
    })
    const state = makeTestState([player([2, 2]), smoke])
    const next = expireAnimation(state, 'smoke')
    expect(next.entities['smoke']).toBeUndefined()
    expect(next.entities[PLAYER_ID]).toBeDefined()
  })

  // An `animationend` can arrive for an element whose entity something else
  // already removed this turn, so the no-op case is a real path, not paranoia.
  it('is a no-op for an id that is already gone', () => {
    const state = makeTestState([player([2, 2])])
    expect(expireAnimation(state, 'never-existed')).toBe(state)
  })
})

describe('health regeneration', () => {
  it('adds one hp when the counter comes due, and resets it', () => {
    const wounded = player([2, 2], {
      stats: { hp: { cur: 5, max: 10 }, xp: 3, hpInc: REJUVENATION_RATE - 1 },
    })
    const next = takeTurn(makeTestState([wounded]), null, rng())
    expect(next.entities[PLAYER_ID]!.stats).toMatchObject({ hp: { cur: 6, max: 10 }, hpInc: 0 })
  })

  it('accumulates while below max', () => {
    const wounded = player([2, 2], { stats: { hp: { cur: 5, max: 10 }, xp: 3, hpInc: 0 } })
    const next = takeTurn(makeTestState([wounded]), null, rng())
    expect(next.entities[PLAYER_ID]!.stats).toMatchObject({ hp: { cur: 5, max: 10 }, hpInc: 1 })
  })

  it('holds the counter at zero at full health', () => {
    const healthy = player([2, 2], { stats: { hp: { cur: 10, max: 10 }, xp: 3, hpInc: 50 } })
    const next = takeTurn(makeTestState([healthy]), null, rng())
    expect(next.entities[PLAYER_ID]!.stats!.hpInc).toBe(0)
  })
})

describe('monsters', () => {
  it('stays asleep until the player is within its activation range', () => {
    const sleeper = monster('m1', [6, 6], { activation: 2 })
    const next = takeTurn(makeTestState([player([2, 2]), sleeper]), 'down', rng())
    expect(next.entities['m1']!.pos).toEqual([6, 6])
  })

  it('closes the distance once woken', () => {
    const state = makeTestState([player([2, 2]), monster('m1', [6, 2], { activation: 20 })])
    let next = state
    for (let i = 0; i < 3; i++) next = takeTurn(next, null, rng(i))
    expect(next.entities['m1']!.pos[0]).toBeLessThan(6)
  })

  // The activation gate is measured in path steps, inclusive of both ends, so a
  // monster three tiles along the path has `path.length === 4`. These two pin
  // the boundary from either side against one fixed seed.
  it('wakes at one step inside its activation range and not at one step outside', () => {
    const near = makeTestState([player([2, 2]), monster('m1', [5, 2], { activation: 5 })])
    expect(takeTurn(near, null, rng()).entities['m1']!.pos).not.toEqual([5, 2])

    const far = makeTestState([player([2, 2]), monster('m1', [5, 2], { activation: 4 })])
    expect(takeTurn(far, null, rng()).entities['m1']!.pos).toEqual([5, 2])
  })

  // A monster with no route at all used to be maximally awake, which is the
  // opposite of what `activation` means: `findPath` returns `[]` for
  // unreachable, and `[].length < activation` passes the gate. Not a corner
  // case — `makeMonsterPassable` blocks on every occupied square, so monsters
  // wall each other off routinely. See "Step 0" in docs/port/06-ui.md.
  //
  // The assertion is on the *stream*, not the position: passing the gate with
  // an empty path fed `moveTo` a null and rested, so the monster held still
  // either way. The whole visible effect was one wasted roll, which offset
  // every later roll in the turn.
  it('does not even roll when walled off from the player entirely', () => {
    const state = makeTestState([player([4, 4]), monster('m1', [1, 1], { activation: 20 })])
    // Seal m1 into its corner: these are the three tiles joining it to the room.
    for (const [x, y] of [
      [2, 1],
      [1, 2],
      [2, 2],
    ] as Pos[]) {
      state.map.floorTiles[tileIndex(state.map.size, x, y)] = TILE.wall
    }
    expect(findPath([1, 1], [4, 4], (x, y) => canPassTile(state.map, [x, y]))).toEqual([])

    const dice = countingRng(rng())
    const next = takeTurn(state, null, dice)
    expect(next.entities['m1']!.pos).toEqual([1, 1])
    expect(dice.draws).toBe(0)
  })

  it('routes around another monster rather than through it', () => {
    // m2 sits between m1 and the player; m1 must not end up on m2's square.
    const state = makeTestState([
      player([2, 2]),
      monster('m1', [4, 2]),
      monster('m2', [3, 2]),
    ])
    const next = takeTurn(state, 'up', rng(2))
    expect(next.entities['m1']!.pos).not.toEqual([3, 2])
  })
})

describe('against a generated level', () => {
  // The fixtures above are hand-built and tidy. This plays real levels, which
  // have covers hiding nothing, monsters with real activation ranges, and loot
  // inside loot — the shapes a synthetic fixture quietly omits.
  const DIRS = ['left', 'right', 'up', 'down', null] as const

  it('survives a long random walk with its invariants intact', () => {
    for (const runSeed of [1, 2, 3, 12345]) {
      let state = makeLevel({ runSeed, depth: 1 }, builtinContent)
      const walk = makeRng('walk', runSeed)
      const dice = makeRng('dice', runSeed)

      for (let turn = 0; turn < 400 && !state.outcome; turn++) {
        state = takeTurn(state, walk.pick(DIRS), dice)

        const self = state.entities[PLAYER_ID]!
        expect(canPassTile(state.map, self.pos)).toBe(true)

        for (const [id, entity] of Object.entries(state.entities)) {
          // The table key and the entity's own id are two copies of one fact;
          // an engine that spawns via the wrong one desynchronizes them.
          expect(entity.id).toBe(id)
          // A corpse keeps its kind, so `dead` and the floor layer are the two
          // things making it inert: one stops it acting and being acted on, the
          // other stops it blocking a path.
          if (entity.dead) expect(entity.layer).toBe('floor')
        }
      }

      expect(state.moves).toBeGreaterThan(0)
      expect(JSON.parse(JSON.stringify(state))).toEqual(state)
    }
  })

  it('keeps allocating ids past the ones generation handed out', () => {
    // Seed-dependent: the id only advances if the random walk actually bumps a
    // monster, which it does on 28 of the first 30 seeds. Any change to spawn
    // placement reshuffles which ones, so if this starts failing, check that
    // combat still happens broadly before reaching for a different seed.
    const SEED = 3
    let state = makeLevel({ runSeed: SEED, depth: 1 }, builtinContent)
    const startingId = state.nextEntityId
    const walk = makeRng('walk', SEED)
    const dice = makeRng('dice', SEED)
    for (let turn = 0; turn < 200 && !state.outcome; turn++) {
      state = takeTurn(state, walk.pick(DIRS), dice)
    }
    // Some blow landed over 200 turns, so at least one collision marker spawned.
    expect(state.nextEntityId).toBeGreaterThan(startingId)
    const numeric = Object.keys(state.entities)
      .filter((id) => /^e\d+$/.test(id))
      .map((id) => Number(id.slice(1)))
    expect(Math.max(...numeric)).toBeLessThan(state.nextEntityId)
  })

  it('reaches the shrine when walked straight to it', () => {
    // Pathing to the shrine and following the path exercises movement against
    // real geometry, rather than the open box the fixtures use.
    //
    // The player is given hp headroom because this is a test about geometry,
    // not about winning fights. A level-1 player walked straight down the path
    // with no tactics is a coin flip on the dice seed — 5 of the first 10 died
    // en route — which made the assertion below hostage to any change that
    // shifts the roll stream. With headroom it descends on all 48 (runSeed,
    // diceSeed) pairs surveyed. Combat has its own tests; this one is movement.
    const generated = makeLevel({ runSeed: 12345, depth: 1 }, builtinContent)
    const state = produce(generated, (draft) => {
      draft.entities[PLAYER_ID]!.stats!.hp = { cur: 200, max: 200 }
    })
    const dice = makeRng('dice', 1)
    let walked = state
    let path = findPath(walked.entities[PLAYER_ID]!.pos, state.entities['shrine']!.pos, (x, y) =>
      canPassTile(state.map, [x, y]),
    )
    expect(path.length).toBeGreaterThan(1)

    for (let step = 0; step < 400 && !walked.outcome; step++) {
      const from = walked.entities[PLAYER_ID]!.pos
      // Re-path each step: a monster bump leaves the player where they were, and
      // a fight can rearrange what is in the way.
      path = findPath(from, state.entities['shrine']!.pos, (x, y) =>
        canPassTile(state.map, [x, y]),
      )
      const nextStep = path[1]
      if (!nextStep) break
      const dir = (Object.keys(DIR_DELTAS) as Dir[]).find((d) =>
        posEquals(posInDir(from, d), nextStep),
      )
      walked = takeTurn(walked, dir ?? null, dice)
    }
    expect(walked.outcome).toBe('descended')
  })
})

describe('state stays serializable', () => {
  it('round-trips through JSON after a run of turns', () => {
    let state = makeTestState([
      player([2, 2], { inventory: [axe('axe', [2, 2])] }),
      monster('m1', [5, 2], { drop: item('loot', [5, 2]) }),
      item('i1', [2, 3]),
    ])
    const dirs = ['down', 'right', 'right', null, 'right'] as const
    dirs.forEach((dir, i) => {
      state = takeTurn(state, dir, rng(i))
    })
    expect(JSON.parse(JSON.stringify(state))).toEqual(state)
  })
})
