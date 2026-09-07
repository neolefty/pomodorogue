/**
 * How depth makes a level harder. Four knobs, kept in one file because they are
 * tuned as a set and because both `index.ts` and `entities.ts` need them — the
 * shared home is what keeps the arrows pointing one way.
 *
 * **Depth 1 is the baseline**: every knob reduces to the module constant named
 * beside it, so `ENTITY_COUNT` and friends mean what they say at the shallow
 * end. That is a property of the current tuning, not a promise — it was one,
 * until 2026-08-16 (invariant 1 in docs/design.md), and the two hashes
 * in `generator.test.ts` are now a tripwire you may re-bless rather than a
 * constraint you may not move.
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
 * trying to plug. See docs/progression/findings.md.
 */

/** The original's `entity-count` and `monster-count` (generator.cljs:326). */
export const ENTITY_COUNT = 15
export const MONSTER_COUNT = 5

/**
 * How much of the map a depth-1 level digs. Named here rather than left as a
 * bare 0.2 in {@link dugPercentageFor} so that it is a knob with a home, and so
 * the depth-1 baseline test has something to name.
 */
export const DUG_PERCENTAGE = 0.2

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
 * clamping.** That is where it belongs on the merits: the floor is expressed in
 * the same units as `posToDifficulty` — fraction of the way to the furthest
 * room — so "depth 5 starts you 32% of the way out" means one thing here and at
 * both call sites. Applying it after each caller's own multiplier would make the
 * floor mean something slightly different for items than for monsters.
 *
 * At depth 1 the floor is 0 and this reduces to `within` arithmetically, with no
 * special case in the code.
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
 * How much of the map gets dug. The 0.2 baseline is inherited — it is rot-js's
 * own default, which is what every level through phase 7 got by not passing the
 * option at all. Inherited is not chosen: this is the first knob to move if
 * levels start taking too long, and nothing depends on the baseline any more.
 *
 * The original was eyeing the same knob: `make-digger-map` carries a
 * commented-out `:dugPercentage 0.15` with `;TODO: increase this as you go
 * deeper` beside it.
 */
export const dugPercentageFor = (depth: number): number =>
  DUG_PERCENTAGE + Math.min(0.1, (depth - 1) * 0.01)
