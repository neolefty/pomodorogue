/**
 * The share string is the one part of the UI that is pure logic rather than
 * layout — a summary the player pastes elsewhere, where a wrong emoji is a
 * wrong claim about their run. The rest of phase 6 is checked by looking at it.
 *
 * Everything here goes through the text render target, which needs no DOM.
 */
import { describe, expect, it } from 'vitest'
import { SPRITES } from '../game/sprites.ts'
import type { Entity, GameState, Statistics } from '../game/types.ts'
import { emptyStatistics, PLAYER_ID, TILE } from '../game/types.ts'
import { shareText } from './shareString.tsx'

const player = (over: Partial<Entity> = {}): Entity => ({
  id: PLAYER_ID,
  name: 'you',
  sprite: SPRITES.elf,
  pos: [1, 1],
  layer: 'occupy',
  kind: 'player',
  stats: { hp: { cur: 10, max: 10 }, xp: 4, hpInc: 0 },
  inventory: [],
  ...over,
})

const item = (id: string, name: string, sprite = SPRITES.mushroom): Entity => ({
  id,
  name,
  sprite,
  pos: [1, 1],
  layer: 'floor',
  kind: 'item',
  value: 1,
})

function makeState(over: Partial<GameState> = {}): GameState {
  return {
    seed: 4242,
    depth: 1,
    map: { floorTiles: [TILE.room], rooms: [], size: [1, 1] },
    entities: { [PLAYER_ID]: player() },
    nextEntityId: 100,
    moves: 12,
    combatants: {},
    outcome: 'descended',
    counts: {},
    log: [],
    ...over,
  }
}

const stats = (over: Partial<Statistics> = {}): Statistics => ({
  ...emptyStatistics(),
  ...over,
})

describe('share string', () => {
  it('leads with the seed and the player line', () => {
    const text = shareText(makeState(), stats({ streak: 3 }))
    expect(text.split('\n')[0]).toBe('#Pomodorogue 4242')
    expect(text).toContain('🧝 4xp ')
    expect(text).toContain('12 👣')
    expect(text).toContain('streak: 3')
  })

  it('shows a shrine for a cleared level and a skull for a death', () => {
    expect(shareText(makeState(), stats())).toContain('⛩')
    expect(shareText(makeState({ outcome: 'died' }), stats())).toContain('☠')
  })

  // Only on a death: what killed you is the point of the line, and a cleared
  // level has no killer to name.
  it('names the killer, and only when the player died', () => {
    const killed = {
      entities: { [PLAYER_ID]: player({ killedBy: { name: 'the wolf', sprite: SPRITES.wolf } }) },
    }
    expect(shareText(makeState({ ...killed, outcome: 'died' }), stats())).toContain('🐺')
    expect(shareText(makeState({ ...killed, outcome: 'descended' }), stats())).not.toContain('🐺')
  })

  // Half resolution: one square per two points, so a long bar still fits a post.
  it('draws health at half resolution, filled then blank', () => {
    const wounded = {
      [PLAYER_ID]: player({ stats: { hp: { cur: 6, max: 10 }, xp: 4, hpInc: 0 } }),
    }
    const text = shareText(makeState({ entities: wounded }), stats())
    expect(text).toContain('🟩🟩🟩⬜⬜')
  })

  // The clipboard target only: the on-screen version renders where the reader
  // already is. The original did the same with rogule.com (`ui.cljs:226`).
  it('ends the clipboard text with a link back to the game', () => {
    const text = shareText(makeState(), stats())
    expect(text.split('\n').at(-1)).toBe('https://pomodorogue.com')
  })

  it('lists kills most recent first', () => {
    const slayer = {
      [PLAYER_ID]: player({
        kills: [
          { name: 'the rat', sprite: SPRITES.rat },
          { name: 'the bat', sprite: SPRITES.bat },
        ],
      }),
    }
    expect(shareText(makeState({ entities: slayer }), stats())).toContain('⚔ 🦇🐀')
  })

  describe('collectible bars', () => {
    const held = {
      [PLAYER_ID]: player({ inventory: [item('i1', 'mushroom'), item('i2', 'mushroom')] }),
    }

    it('fills one square per item held against the level total', () => {
      const text = shareText(makeState({ entities: held, counts: { mushroom: 4 } }), stats())
      expect(text).toContain('🍄🍄⬜⬜')
    })

    // A level that generated no gems should not show an empty gem row — the
    // original's `emoj-bar` emitted nothing for a zero count, and a row of
    // blanks would read as "you missed them all".
    it('omits a collectible the level never had', () => {
      const text = shareText(makeState({ entities: held, counts: { mushroom: 2 } }), stats())
      expect(text).not.toContain('💎')
      expect(text).not.toContain('🌰')
    })
  })
})
