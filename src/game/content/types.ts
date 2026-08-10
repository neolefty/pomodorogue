/**
 * The seam between level generation and *what* gets generated.
 *
 * Placement code never imports a table directly — it takes a `ContentProvider`.
 * Phase 4 ships exactly one implementation (`builtinContent`), but the interface
 * is what later lets per-depth themes, phase 8's depth-shifted monster table,
 * and phase 9's server-generated content arrive without touching any placement
 * function. See docs/port/04-generator.md.
 */
import type { Sprite } from '../sprites.ts'
import type { EncounterFnName, LevelRequest, Stats } from '../types.ts'

/**
 * Templates are plain JSON-serializable data — no functions — for the same
 * reason `GameState` is: they cross a network boundary in phase 9, and the
 * behavior they name is resolved through the engine registries.
 */

/** Stats as a template carries them; `hpInc` is a runtime counter, set at placement. */
export type TemplateStats = Omit<Stats, 'hpInc'>

export interface MonsterTemplate {
  name: string
  sprite: Sprite
  /** How close the player must get, in path steps, before it gives chase. */
  activation: number
  stats: TemplateStats
}

/** Items either go in the inventory or are drunk on the spot; nothing else. */
export type ItemEncounter = Extract<EncounterFnName, 'addItemToInventory' | 'increaseHp'>

export interface ItemTemplate {
  name: string
  sprite: Sprite
  /** Rarity: generation weights each item by `1 / value`, so higher is rarer. */
  value: number
  encounter: ItemEncounter
  /** Weapon damage, added to the player's total while carried. */
  dmg?: number
  /** Armour absorption, added to the player's total while carried. */
  armour?: number
}

/** The thing an item hides under. Its encounter behavior is always `uncoverItem`. */
export interface CoverTemplate {
  name: string
  sprite: Sprite
}

export interface ContentProvider {
  /**
   * **Order is load-bearing.** Monsters are indexed positionally by difficulty,
   * so the array must run easiest to hardest. A provider that returns them in
   * arbitrary order produces a nonsense difficulty curve rather than an error.
   */
  monsters(request: LevelRequest): readonly MonsterTemplate[]
  forageItems(request: LevelRequest): readonly ItemTemplate[]
  itemCovers(request: LevelRequest): readonly CoverTemplate[]
}
