/**
 * The engine's public surface. Phase 6 should need nothing else from in here:
 * the UI maps a key to a `Dir`, calls `takeTurn`, and renders the result.
 *
 * Two entry points take state and hand it back — `takeTurn` and
 * `expireAnimation`. Everything else below this directory is a draft mutator
 * running inside one of them, which is why `moveTo` and `updateMonsters` are
 * not re-exported: they were, until 5.5 §6 changed their signatures and left
 * the exports behind advertising something no caller can use.
 *
 * See docs/port/05-engine.md.
 */
export { getArmourHp, getWeaponsDmg } from './combat.ts'
export { HEALTH_PICKUP_HP } from './encounters.ts'
export type { Dir } from './movement.ts'
export { DIR_DELTAS, posInDir } from './movement.ts'
export { summarize } from './state.ts'
export { expireAnimation, REJUVENATION_RATE, takeTurn } from './turn.ts'
