import { describe, expect, it } from 'vitest'
import { djb2a, hashSeed, makeRng } from './rng.ts'

describe('djb2a', () => {
  it('matches the reference implementation the original depended on', () => {
    // Values from the `djb2a` npm package, which original/src/rogule/map.cljs used.
    expect(djb2a('')).toBe(5381)
    expect(djb2a('a')).toBe(177604)
    expect(djb2a('hello')).toBe(178056679)
  })

  it('is stable across calls', () => {
    expect(djb2a('map-42-32-32')).toBe(djb2a('map-42-32-32'))
  })
})

describe('hashSeed', () => {
  it('joins parts with a dash, like the original', () => {
    expect(hashSeed('map', 42)).toBe(djb2a('map-42'))
  })

  it('separates levels within a run', () => {
    expect(hashSeed(1234, 1)).not.toBe(hashSeed(1234, 2))
  })
})

describe('makeRng', () => {
  it('is reproducible from the same seed', () => {
    const a = makeRng('level', 7)
    const b = makeRng('level', 7)
    const draw = (r: ReturnType<typeof makeRng>) => Array.from({ length: 20 }, () => r.next())
    expect(draw(a)).toEqual(draw(b))
  })

  it('diverges on a different seed', () => {
    const seven = makeRng('level', 7)
    const eight = makeRng('level', 8)
    const a = Array.from({ length: 20 }, () => seven.next())
    const b = Array.from({ length: 20 }, () => eight.next())
    expect(a).not.toEqual(b)
  })

  it('clones an independent stream that does not disturb the original', () => {
    const base = makeRng('combat', 1)
    const clone = base.clone()
    const fromClone = Array.from({ length: 5 }, () => clone.next())
    const fromBase = Array.from({ length: 5 }, () => base.next())
    expect(fromClone).toEqual(fromBase)
  })

  it('int() stays in range and tolerates an empty range', () => {
    const rng = makeRng('x')
    for (let i = 0; i < 200; i++) {
      const n = rng.int(5)
      expect(n).toBeGreaterThanOrEqual(0)
      expect(n).toBeLessThan(5)
    }
    expect(rng.int(0)).toBe(0)
  })

  it('weighted() never returns a zero-weight item', () => {
    const rng = makeRng('w')
    const items = [
      { name: 'never', w: 0 },
      { name: 'sometimes', w: 1 },
      { name: 'often', w: 9 },
    ]
    const picks = Array.from({ length: 500 }, () => rng.weighted(items, (i) => i.w).name)
    expect(picks).not.toContain('never')
    expect(new Set(picks)).toEqual(new Set(['sometimes', 'often']))
  })

  it('weighted() respects relative frequency', () => {
    const rng = makeRng('freq')
    const items = [
      { name: 'rare', w: 1 },
      { name: 'common', w: 9 },
    ]
    const picks = Array.from({ length: 2000 }, () => rng.weighted(items, (i) => i.w).name)
    const common = picks.filter((p) => p === 'common').length
    expect(common / picks.length).toBeGreaterThan(0.8)
    expect(common / picks.length).toBeLessThan(0.97)
  })

  it('pick() and weighted() reject empty input rather than returning undefined', () => {
    const rng = makeRng('empty')
    expect(() => rng.pick([])).toThrow()
    expect(() => rng.weighted([], () => 1)).toThrow()
  })
})
