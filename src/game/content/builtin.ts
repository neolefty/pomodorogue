/**
 * The original game's tables, ported verbatim from the `forage-items`,
 * `item-covers` and `monster-table` defs in original/src/rogule/generator.cljs.
 *
 * Values are unchanged on purpose: through phase 6 the game is meant to play
 * exactly like the original. Depth scaling arrives in phase 8, as a provider
 * that reads `request.depth` — not as edits to these numbers.
 */
import { SPRITES } from '../sprites.ts'
import type { LevelRequest } from '../types.ts'
import type { ContentProvider, CoverTemplate, ItemTemplate, MonsterTemplate } from './types.ts'

export const FORAGE_ITEMS: readonly ItemTemplate[] = [
  { name: 'chestnut', sprite: SPRITES.chestnut, encounter: 'addItemToInventory', value: 1 },
  { name: 'mushroom', sprite: SPRITES.mushroom, encounter: 'addItemToInventory', value: 2 },
  { name: 'gem-stone', sprite: SPRITES['gem-stone'], encounter: 'addItemToInventory', value: 8 },
  { name: 'health', sprite: SPRITES['tumbler-glass'], encounter: 'increaseHp', value: 2 },
  { name: 'shield', sprite: SPRITES.shield, encounter: 'addItemToInventory', armour: 1, value: 3 },
  { name: 'dagger', sprite: SPRITES.dagger, encounter: 'addItemToInventory', dmg: 1, value: 3 },
  { name: 'axe', sprite: SPRITES.axe, encounter: 'addItemToInventory', dmg: 2, value: 4 },
]

export const ITEM_COVERS: readonly CoverTemplate[] = [
  { name: 'potted plant', sprite: SPRITES['potted-plant'] },
  { name: 'rock', sprite: SPRITES.rock },
  { name: 'wood block', sprite: SPRITES.wood },
]

/** Easiest first — see the ordering note on {@link ContentProvider.monsters}. */
export const MONSTER_TABLE: readonly MonsterTemplate[] = [
  { name: 'the rat', sprite: SPRITES.rat, activation: 3, stats: { xp: 1, hp: [2, 2] } },
  { name: 'the bat', sprite: SPRITES.bat, activation: 10, stats: { xp: 2, hp: [3, 3] } },
  { name: 'the ghost', sprite: SPRITES.ghost, activation: 10, stats: { xp: 3, hp: [3, 3] } },
  { name: 'the boar', sprite: SPRITES.boar, activation: 15, stats: { xp: 3, hp: [4, 4] } },
  { name: 'the wolf', sprite: SPRITES.wolf, activation: 20, stats: { xp: 4, hp: [5, 5] } },
  { name: 'the ogre', sprite: SPRITES.ogre, activation: 10, stats: { xp: 4, hp: [7, 7] } },
  { name: 'the zombie', sprite: SPRITES.zombie, activation: 5, stats: { xp: 5, hp: [9, 9] } },
  { name: 'the vampire', sprite: SPRITES.vampire, activation: 15, stats: { xp: 6, hp: [8, 8] } },
  { name: 'the genie', sprite: SPRITES.genie, activation: 20, stats: { xp: 6, hp: [10, 10] } },
  { name: 'the dragon', sprite: SPRITES.dragon, activation: 10, stats: { xp: 8, hp: [15, 15] } },
  { name: 'the t-rex', sprite: SPRITES['t-rex'], activation: 15, stats: { xp: 10, hp: [12, 12] } },
]

/**
 * The static tables. Ignores the request — depth means nothing to it yet, which
 * is exactly why taking the argument now costs nothing and adding it later would
 * cost every call site.
 */
export const builtinContent: ContentProvider = {
  monsters: (_request: LevelRequest) => MONSTER_TABLE,
  forageItems: (_request: LevelRequest) => FORAGE_ITEMS,
  itemCovers: (_request: LevelRequest) => ITEM_COVERS,
}
