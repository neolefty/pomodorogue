/**
 * How depth makes a level harder. Four knobs, kept in one file because they are
 * tuned as a set and because both `index.ts` and `entities.ts` need them — the
 * shared home is what keeps the arrows pointing one way.
 *
 * **Every knob is an identity at depth 1**, and that is the phase's correctness
 * property rather than a nicety. Fixed mode *is* the phase-6 game, so a depth-1
 * level must stay byte-identical to what the port produced before any of this
 * existed; `generator.test.ts` pins two seeds by hash. Any change here that
 * moves those hashes is a bug in the change, not in the test.
 *
 * **These numbers are guesses.** They were picked to be legible rather than
 * balanced, and they have not been played: at one level per twenty-five minutes
 * a ramp takes a week to playtest, which is what the dev-only gate skip in
 * `App.tsx` exists to shorten. Expect to move them.
 *
 * Two notes for whoever tunes them. If levels start taking too *long* before
 * they start feeling too *hard*, flatten {@link dugPercentageFor} first — it is
 * the only knob here that spends the player's time rather than their HP, and a
 * five-minute break has none to lend. And weapons currently stack additively
 * with no cap and are never consumed (`getWeaponsDmg`), so a deep progressive
 * player's damage climbs on its own; that is a known hole this ramp is not
 * trying to plug. See "Difficulty ramp" in docs/port/08-depth.md.
 */

/** The original's `entity-count` and `monster-count` (generator.cljs:326). */
export const ENTITY_COUNT = 15
export const MONSTER_COUNT = 5

/**
 * The minimum difficulty depth imposes. Caps at 0.8 around depth 11, leaving
 * headroom above it for within-level distance to still mean something.
 */
export const depthFloor = (depth: number): number => Math.min(0.8, (depth - 1) * 0.08)

/**
 * Raises a raw within-level difficulty onto depth's floor, keeping the whole
 * `[floor, 1]` range available to distance: `floor + within * (1 - floor)`.
 *
 * **Takes the raw `posToDifficulty` value, before the caller's own scaling and
 * clamping**, and each caller's clamping is then left exactly as it was.
 * `posToDifficulty` is unclamped and exceeds 1 beyond the furthest room, which
 * `placeMonster` clamps and `placeCoveredItem` deliberately does not — an
 * over-1 item difficulty is how the original says "nothing under this one".
 * Normalising that away would change depth-1 item placement, which is the one
 * thing this file may not do.
 *
 * At depth 1 the floor is 0 and this reduces to `within` arithmetically. That is
 * not a special case in the code, which is exactly why it is trustworthy.
 */
export function difficultyAtDepth(within: number, depth: number): number {
  const floor = depthFloor(depth)
  return floor + within * (1 - floor)
}

/** One more monster per depth, up to twice the original's five. */
export const monsterCountFor = (depth: number): number =>
  MONSTER_COUNT + Math.min(MONSTER_COUNT, depth - 1)

/**
 * One more cover per depth, to the same cap.
 *
 * Not generosity. A cover hides an item on a roll against difficulty, so
 * {@link depthFloor} makes deep covers *emptier* — without this, loot would dry
 * up on precisely the schedule the monsters got worse on, and the two together
 * would outrun any player.
 */
export const entityCountFor = (depth: number): number =>
  ENTITY_COUNT + Math.min(MONSTER_COUNT, depth - 1)

/**
 * How much of the map gets dug. 0.2 is rot-js's own default and what every level
 * through phase 7 used, so depth 1 passes it explicitly to no effect.
 *
 * The original was eyeing the same knob: `make-digger-map` carries a
 * commented-out `:dugPercentage 0.15` with `;TODO: increase this as you go
 * deeper` beside it.
 */
export const dugPercentageFor = (depth: number): number =>
  0.2 + Math.min(0.1, (depth - 1) * 0.01)
