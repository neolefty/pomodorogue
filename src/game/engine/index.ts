/**
 * The engine's public surface. Phase 6 should need nothing else from in here:
 * the UI maps a key to a `Dir`, calls `takeTurn`, and renders the result.
 *
 * See docs/port/05-engine.md.
 */
export { getArmourHp, getWeaponsDmg } from './combat.ts'
export { HEALTH_PICKUP_HP } from './encounters.ts'
export type { Dir } from './movement.ts'
export { DIR_DELTAS, moveTo, posInDir } from './movement.ts'
export { updateMonsters } from './monsters.ts'
export type { EncounterFn, MakePassableFn, UpdateFn } from './registry.ts'
export { ENCOUNTER_FNS, PASSABLE_FNS, UPDATE_FNS } from './registry.ts'
export { summarize } from './state.ts'
export { REJUVENATION_RATE, restorePlayerHealth, takeTurn } from './turn.ts'
