/**
 * Positions and position-keyed maps.
 *
 * ClojureScript uses `[x y]` vectors directly as map keys because it has value
 * equality. JavaScript does not, so every map keyed by location uses a string
 * `"x,y"` key instead. See docs/port/03-core.md.
 *
 * The rule: `Pos` for arithmetic, `PosKey` for lookup.
 */

declare const posKeyBrand: unique symbol

/** A location key, `"x,y"`. Branded so a bare string can't be passed by mistake. */
export type PosKey = string & { readonly [posKeyBrand]: true }

/** A location. Kept as a tuple to match the original's `[x y]` vectors. */
export type Pos = readonly [x: number, y: number]

/**
 * A map keyed by location. A plain object rather than a `Map` so it survives
 * `JSON.stringify` — game state has to persist to localStorage across the
 * pomodoro interval.
 */
export type PosMap<T> = Record<PosKey, T>

export const posKey = (x: number, y: number): PosKey => `${x},${y}` as PosKey

export const keyOf = (pos: Pos): PosKey => posKey(pos[0], pos[1])

export const parsePos = (key: PosKey): Pos => {
  const comma = key.indexOf(',')
  return [Number(key.slice(0, comma)), Number(key.slice(comma + 1))]
}

/** rot-js reports room doors keyed as `"x,y"` already, which is our format. */
export const asPosKey = (raw: string): PosKey => raw as PosKey

export const posEquals = (a: Pos, b: Pos): boolean => a[0] === b[0] && a[1] === b[1]

export const distanceSq = (a: Pos, b: Pos): number =>
  (b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2

export const distance = (a: Pos, b: Pos): number => Math.sqrt(distanceSq(a, b))

/** Empty `PosMap`. Typed helper so callers don't repeat the cast. */
export const emptyPosMap = <T>(): PosMap<T> => ({}) as PosMap<T>

export const posKeys = <T>(m: PosMap<T>): PosKey[] => Object.keys(m) as PosKey[]

export const posEntries = <T>(m: PosMap<T>): [PosKey, T][] =>
  Object.entries(m) as [PosKey, T][]
