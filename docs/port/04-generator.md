# Phase 4 — Generator

**Outcome:** `makeLevel(request, content)` returns a complete `GameState` — dungeon map, player, shrine, monsters, covered items. Ports `original/src/rogule/generator.cljs` (337 lines).

`request` is a `LevelRequest` (`src/game/types.ts`), permanently `{ runSeed, depth }`. **Generation may depend on that struct and nothing else** — no wall clock, no ambient randomness, no reaching into run state. That single rule is what keeps a future seed feature possible and what makes the generator testable; it is not a demand for exact replayability, which this game does not need.

## This phase builds the base pass

Generation is two stages: a **base pass** pure in `LevelRequest`, and a
history-driven **overlay pass** layered on top of it (not built, and not
designed until a feature needs it). The design, the rejected wider-request
alternative, and the invariants that keep the split honest live in **"Seeds
control the world, not the story" in PLAN.md — that section is normative**;
this doc adds only the phase-4 mechanics. **All of phase 4 is the base pass:**
geometry, base monsters, base loot, and later phase 8's depth scaling.

Phase 4 should therefore name the base pass explicitly:

```ts
export function makeBaseLevel(request: LevelRequest, content: ContentProvider): GameState
export const makeLevel = makeBaseLevel   // until an overlay exists
```

Keeping the base name from day one means the overlay arrives as a new function composed around this one, rather than as edits inside it.

When the overlay does land, two sequencing details will matter and are easy to miss: `state.counts` must be computed *after* it, or the "3 of 5 mushrooms" bars will not count overlay items; and overlay entities keep allocating from `nextEntityId`, so they stay deterministic as long as the overlay runs after the base pass, never interleaved with it.

**Status:** done. `makeBaseLevel` generates playable levels; 22 tests in
`src/game/generator/`. Three deliberate divergences from the original are
recorded under "Divergences" at the bottom — read those before comparing side by
side with `generator.cljs`.

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

The original reaches into rot-js private fields (`_rooms`, `_doors`, `_x1`, `_y1`, `_x2`, `_y2`) and round-trips them through `JSON.stringify`/`JSON.parse` to convert them to plain data. It needed to: ClojureScript wanted plain maps.

**We do not**, because rot-js turns out to expose the whole lot publicly — `getRooms()`, and `getLeft()`/`getTop()`/`getRight()`/`getBottom()`/`getDoors(cb)` on each room. `generator/map.ts` uses those. Same result, no coupling to private names, and a rot-js upgrade breaks the build rather than the map.

(`_doors` was keyed by the string `"x,y"`, exactly our `PosKey` format. `getDoors` hands back `x, y` as numbers instead, so nothing needs parsing.)

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
  monsters(request: LevelRequest): readonly MonsterTemplate[]
  forageItems(request: LevelRequest): readonly ItemTemplate[]
  itemCovers(request: LevelRequest): readonly CoverTemplate[]
}
```

**Every method takes the `LevelRequest`, even though nothing needs it yet.**
Level themes (per-depth monster/item/cover mixes), phase 8's depth-shifted
monster table, and phase 9's per-`(runSeed, depth)` AI content all want exactly
this input, and they all arrive through this interface. `builtinContent` ignores
the argument, so adding it now costs nothing; adding it later means changing the
signature and every placement call site — precisely the retrofit this interface
exists to prevent.

Phase 4 implements exactly one, `builtinContent`, returning the static tables. The interface exists so phase 9 can add a provider that fetches AI-generated monsters and sprites without touching any placement code. Templates must stay plain JSON-serializable data — no functions — for the same reason `GameState` does.

Monster templates are ordered by difficulty in `monster-table` and indexed positionally, so **the array order is load-bearing**. A provider that returns monsters in arbitrary order will produce nonsense difficulty curves. Document that in the interface, and have `builtinContent` keep the original's ordering (rat → bat → ghost → boar → wolf → ogre → zombie → vampire → genie → dragon → t-rex).

## Entity ids must not be random

The original's `make-id` slices a random UUID, so its generated levels are *not* actually reproducible even given a fixed seed. Since determinism is the whole point of the RNG work in phase 3, this is replaced: `GameState.nextEntityId` is a counter and `allocId(state)` (in `src/game/entities.ts`) hands out `e0`, `e1`, … Deterministic, serializable, and easier to read in a debugger.

Do not reintroduce `crypto.randomUUID` here or in the engine — the same counter serves runtime-spawned entities like collision markers and smoke puffs.

## Tests to write

- Same `LevelRequest` → deep-equal `GameState`. Write it first. It is the cheapest broad regression test the generator will have — any accidental dependency on ambient state fails it — and it only passes because entity ids come from the counter above. **Bind it to `makeBaseLevel`, not to `makeLevel`**, so that it keeps testing "two scalars in, same level out" after an overlay exists.
- Different depth → different map. Same depth, different `runSeed` → different map.
- Generation is unaffected by draws from an unrelated `Rng` (a stand-in for the engine's entropy-seeded stream) — guards the digger's use of the global rot-js instance.
- Player start position is walkable and the shrine is reachable from it. The original never checks this; it happens to hold because the shrine is placed at the end of a computed path. Assert it anyway — depth scaling in phase 8 could break it. Write it against the *composed* `makeLevel`, not the base pass: when an overlay exists it can wall off a corridor with a new monster, and the level the player actually gets is the one that has to be playable.
- Entity counts match the requested `entityCount`/`monsterCount` (15 and 5 in the original).

All of the above are in `src/game/generator/generator.test.ts`, plus geometry
tests in `map.test.ts` (walls fully enclose the floor; rooms and corridors stay
disjoint; doors sit on top of the corridor beneath them) and two that guard traps
this port could plausibly fall into: every monster gets its own `hp` pair rather
than an alias of the template's array, and generated ids all sit below
`nextEntityId` so the engine's next spawn cannot collide with one.

There is also an aggregate difficulty test — mean monster XP near the player's
start versus far from it, over 40 seeds. A single level is too small a sample
given the ±2 spread, but a broken `posToDifficulty` or a mis-clamped monster
index flattens the gradient silently, and nothing else would catch it.

## Divergences from the original

Three, all deliberate. Everything else is a faithful port.

**1. The monster sub-table accumulates at the ends instead of colliding.** The original builds the ±2 spread as a map literal keyed by table index:

```clojure
{monster-difficulty-index 6
 (min (+ i 1) max-index) 2, (max (- i 1) 0) 2
 (min (+ i 2) max-index) 1, (max (- i 2) 0) 1}
```

At the ends of the table the clamped neighbours land *on* the centre, and ClojureScript resolves duplicate keys last-wins (confirmed against the compiled `build/public/js/main.js`, which routes through `createAsIfByAssoc`). So at difficulty 0 the centre's weight of 6 is overwritten by a clamped 1, and the final weights are `{rat 1, bat 2, ghost 1}` — the rat is the *rarest* monster next to the player's start, which is plainly not what the table intends. Indices 0, 1, 9 and 10 are affected, and index 0 is the common case.

`pickMonsterIndex` sums the offsets instead, so a clamped neighbour reinforces the edge. Total weight is 12 at every difficulty. This is the one place the port fixes a bug rather than reproducing it; it is called out here because it makes low-difficulty monster mixes differ from the original's, which would otherwise look like a port error.

**2. Placement skips a full map rather than crashing.** `make-covered-item` picks any room and calls `rand-nth` on its free tiles, which throws if the room is full; `make-monster` likewise `rand-nth`s the free-tile list and throws when it's empty. Rare at 20 spawns on a 32×32 map, but deterministic generation turns "rare crash" into "this seed is permanently unplayable". So: rooms with no free tile are filtered out before placing a covered item, and if every room is full the item is skipped; a monster whose turn comes when no free tile remains is skipped the same way.

**3. Room data comes from rot-js's public accessors** — see "Reading rooms out of the digger" above.
