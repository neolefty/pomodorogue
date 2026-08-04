# Phase 4 — Generator

**Outcome:** `makeLevel(seed, depth, content)` returns a complete `GameState` — dungeon map, player, shrine, monsters, covered items — deterministically. Ports `original/src/rogule/generator.cljs` (337 lines).

**Status:** not started.

## Operating facts

| File | Ports from |
|---|---|
| `src/game/generator/map.ts` | `make-digger-map` |
| `src/game/generator/entities.ts` | `make-player`, `make-shrine`, `make-covered-item`, `make-monster`, `make-entities` |
| `src/game/generator/index.ts` | `make-level` |
| `src/game/content/builtin.ts` | the `forage-items`, `item-covers`, `monster-table` tables |
| `src/game/content/types.ts` | the `ContentProvider` interface (new) |

Reference: `original/src/rogule/generator.cljs`. Read it alongside.

## Order of work

1. `content/` first — the tables are pure data and the rest depends on their types.
2. `generator/map.ts` — dungeon geometry. Testable in isolation: same seed → identical tile map.
3. `generator/entities.ts` — placement. Depends on both of the above.
4. `generator/index.ts` — the ~15 lines that tie them together.

## The digger handoff — the one leaky spot

`ROT.Map.Digger` reads from the global `ROT.RNG`, not from an injectable source. So `makeDiggerMap` must do:

```ts
ROT.RNG.setSeed(hashSeed('map', seed, w, h))
```

before constructing the digger. This is the one sanctioned exception to the "explicit RNG only" rule from [03-core.md](03-core.md). Isolate it to `generator/map.ts`, comment it, and do not let the pattern spread. Everything downstream of the digger — entity placement, item rolls, monster selection — takes an explicit `Rng`.

The original additionally called `(make-digger-map (js/Math.random) size size)`, deriving the map seed from the globally-patched `Math.random`. Replace that with the explicit level seed.

## Reading rooms out of the digger

The original reaches into rot-js private fields (`_rooms`, `_corridors`, `_doors`, `_x1`, `_y1`, `_x2`, `_y2`) and round-trips them through `JSON.stringify`/`JSON.parse` to convert them to plain data. Do the same, but declare a local interface for the room shape rather than casting to `any` — the private field names are the actual coupling risk here, and naming them in one place makes a rot-js upgrade a single-file fix.

Note `_doors` is keyed by the string `"x,y"` — which happens to be exactly our `PosKey` format, so those keys transfer directly.

## Tile classification

`make-digger-map` produces six tile collections: `raw`, `room`, `room-wall`, `corridor`, `corridor-wall`, `door`, then merges them into one `floorTiles` map. Only `floorTiles` is read during play (via `canPassTile` with the allowed set `['room','door','corridor']`); the individual collections are used during generation to find free tiles. Keep the split — the generator needs `room` and `corridor` separately to pick spawn positions.

## Difficulty within a level

`posToDifficulty` (already ported in phase 3, from `map.cljs`) returns *path length from the player's start position, normalized against the furthest room*. So difficulty is distance-from-start along walkable tiles, not straight-line distance. Two multipliers apply:

- Items: `difficulty * 0.9`, then the item is placed only if `rng.next() > difficulty` — so distant covers are frequently empty.
- Monsters: `difficulty * 0.75`, capped at 1, then used to index the monster table, with a weighted spread of ±2 table positions (weights 1/2/6/2/1).

Preserve these constants exactly in this phase. Depth scaling gets layered on in phase 8, not here — the goal at phase 6 is a level that plays identically to the original's.

## `ContentProvider`

Placement functions must not import `builtin.ts` directly. They take a provider:

```ts
export interface ContentProvider {
  monsters(): readonly MonsterTemplate[]
  forageItems(): readonly ItemTemplate[]
  itemCovers(): readonly CoverTemplate[]
}
```

Phase 4 implements exactly one, `builtinContent`, returning the static tables. The interface exists so phase 9 can add a provider that fetches AI-generated monsters and sprites without touching any placement code. Templates must stay plain JSON-serializable data — no functions — for the same reason `GameState` does.

Monster templates are ordered by difficulty in `monster-table` and indexed positionally, so **the array order is load-bearing**. A provider that returns monsters in arbitrary order will produce nonsense difficulty curves. Document that in the interface, and have `builtinContent` keep the original's ordering (rat → bat → ghost → boar → wolf → ogre → zombie → vampire → genie → dragon → t-rex).

## Tests to write

- Same seed + same depth → deep-equal `GameState`. This is the test that protects the whole determinism story; write it first.
- Different depth → different map.
- Player start position is walkable and the shrine is reachable from it. The original never checks this; it happens to hold because the shrine is placed at the end of a computed path. Assert it anyway — depth scaling in phase 8 could break it.
- Entity counts match the requested `entityCount`/`monsterCount` (15 and 5 in the original).
