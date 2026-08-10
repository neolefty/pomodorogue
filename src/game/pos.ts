/**
 * Positions, and the string key used to bucket entities by one.
 *
 * ClojureScript uses `[x y]` vectors directly as map keys because it has value
 * equality. JavaScript does not, so the entity index keys by a `"x,y"` string
 * instead. See docs/port/03-core.md.
 *
 * **Tiles are not keyed this way.** The tile map is a flat array indexed
 * `y * w + x`; see `GameMap` and `tileAt` in grid.ts. The two representations
 * are deliberately independent — the entity index is short-lived and rebuilt per
 * turn, while the tile map is persisted, and only the latter is worth packing.
 * See §3 of docs/port/05a-simplify.md.
 */

/** A location. Kept as a tuple to match the original's `[x y]` vectors. */
export type Pos = readonly [x: number, y: number]

/** Bucket key for the entity index. Not a tile address — see the note above. */
export const posKey = (x: number, y: number): string => `${x},${y}`

export const keyOf = (pos: Pos): string => posKey(pos[0], pos[1])

export const posEquals = (a: Pos, b: Pos): boolean => a[0] === b[0] && a[1] === b[1]

/**
 * Squared distance — no `sqrt`, because nothing needs the real length.
 *
 * Phase 6's fog of war compares against squared radii (`clearDist ** 2`,
 * `visibleDist ** 2`), exactly as the original does at `ui.cljs:153`.
 */
export const distanceSq = (a: Pos, b: Pos): number => (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2
