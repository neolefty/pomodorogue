# Phase 5.5 — Simplification

**Outcome:** remove structure that was carried over from the ClojureScript original as *shape* rather than as *style*, before phase 6 writes a UI against it. No behavior changes the player can see. Ports nothing — this is the first phase that deletes rather than adds.

**Status:** not started.

Numbered `5.5` on purpose. Phases 6–9 are referenced by number in dozens of doc paragraphs and code comments; renumbering them to slot this in would be a far larger diff than the work itself.

## Why now

Most of these items are cheap at any time. One — the `PosMap` decision in §3 — is cheap *now* and expensive after phase 6, because phase 6 writes `Board.tsx`, `entitiesAt` call sites, and the tile→sprite mapping directly against the current representation. It is a now-or-never item, and "never" is an acceptable answer; see the decision note in that section.

The rest is worth doing before phase 6 for a smaller reason: phase 6 is the milestone that closes the port and lets `docs/port/` be deleted. Every simplification landed before then is one less thing to carry through that deletion with its justification intact.

## Operating facts

| | |
|---|---|
| Baseline | 91 tests, typecheck, lint all green |
| Success condition | still 91-ish tests green, all passing, no player-visible behavior change |
| Reference source | still `~/source/rogule/original`, read-only — but this phase deliberately *diverges* from it |
| Sequencing | §1 + §6 together first, as one engine pass; §2 / §4 / §5 after it, in any order; §3 last if taken at all |

The generator determinism test (`generator.test.ts:23`) is self-comparison — it generates twice and compares — not a golden fixture, and there are no snapshot files anywhere in the tree. So changing the *shape* of `GameState` does not require re-blessing any expected output. That is what makes this phase safe to do quickly. **Do not add a golden fixture to make these changes feel safer** — it would convert every future refactor into a re-blessing exercise, which is exactly the property phase 4 chose against.

---

## 1. Collapse the three function registries into one `kind` discriminant

**Delete:** `src/game/engine/registry.ts`, the `EntityFns` interface, and the `EncounterFnName` / `UpdateFnName` / `PassableFnName` unions in `types.ts`.

**Add:** a single `kind` field on `Entity`, a string-literal union, resolved with a `switch`.

Execute together with §6 as **one engine pass** — both rewrite the dispatch site in `movement.ts` and the same five files, and landing them separately churns every call site twice. See the sequencing note there.

### The problem

`Entity.fns` stores three behavior names, and they are fully determined by what the entity *is*:

| Entity | `fns` as generated today |
|---|---|
| monster | `{encounter: 'combat', update: 'chasePlayer', passable: 'monsterPassable'}` |
| cover | `{encounter: 'uncoverItem'}` |
| shrine | `{encounter: 'finishLevel'}` |
| player | `{encounter: 'combat', passable: 'playerPassable'}` |
| item | `{encounter: <one of two, from the template>}` |

Only the item row varies, and it varies over two values. Everything else is a constant written out three times per entity and then persisted three times per entity in phase 7's save file.

`passable` is the clearest case: it is the **mover's** pathing rule, not a property of the entity being stood on, and it selects between exactly two functions on `id === PLAYER_ID`. `movement.ts:136` looks it up off `entity.fns.passable`, which is a long way round to a ternary.

`update` has exactly one possible value. `combat.ts:120` deletes it on death to stop a corpse from chasing — but `meDraft.dead = true` is set eleven lines earlier in the same block, so the `dead` flag already carries that information.

### What this buys beyond line count

`registry.ts:15-23` documents a live footgun:

> **Registered functions must be `function` declarations, not `const` arrows.** … A `const` arrow would turn that cycle into a temporal-dead-zone crash that depends on which module was imported first.

**That cycle is created by the registry itself.** `movement.ts` imports the tables; the tables import `monsters.ts`; `monsters.ts` imports `movement.ts`. Remove the hub and the graph is `turn → monsters → movement → {combat, encounters} → state` — acyclic, with no ordering constraint to document and no way to reintroduce the crash by writing an arrow function. This is deleting a landmine, not annotating one.

### The design constraint this must preserve

PLAN.md's "Game state stays JSON-serializable" is **not** weakened by this change and must not be. Behavior is still named by a string that survives `JSON.stringify`; a `kind` tag is exactly as serializable as three `fns` names. The only thing that changes is that the name is written once per entity instead of three times, and resolved by a `switch` instead of by three lookup tables.

The compile-time-checking property is preserved too, and improves slightly: a `switch` over a string-literal union with `noFallthroughCasesInSwitch` and an exhaustiveness check (`const _never: never = kind`) fails to compile on an unhandled case, the same way `satisfies Record<Name, Fn>` does today.

### Sketch

```ts
// types.ts
export type EntityKind =
  | 'player'
  | 'monster'
  | 'shrine'
  | 'cover'
  | 'item'      // encounter: addItemToInventory
  | 'potion'    // encounter: increaseHp
```

- **Encounters** (`movement.ts:119`): `switch (occupant.kind)` dispatching to the five existing functions in `encounters.ts` / `combat.ts`. The function bodies do not change here — §6, in the same pass, changes their *signatures* to draft mutators.
- **Passable** (`movement.ts:136`): `id === PLAYER_ID ? makePlayerPassable(...) : makeMonsterPassable(...)`. Keep both functions where they are; delete only the indirection.
- **Update** (`monsters.ts:58`): filter to `e.kind === 'monster' && !e.dead`. Delete the `fns.update` deletion in `combat.ts:120-122` — `dead` covers it.
- **`ContentProvider`** (`content/types.ts:31`): `ItemEncounter` is currently `Extract<EncounterFnName, ...>`. It becomes the two-member kind union (`'item' | 'potion'`), and `ItemTemplate.encounter` becomes `ItemTemplate.kind`.

### Watch for

- `generator.test.ts:13-16` selects monsters and covers with `e.fns?.update === 'chasePlayer'` and `e.fns?.encounter === 'uncoverItem'`. These become `e.kind === 'monster'` / `e.kind === 'cover'` — which is the point: the test helper gets to say what it means.
- `05-engine.md`'s "The function registry" section describes the mechanism being removed. Phase 5 is done, so that doc is a historical record — leave the section but note at its head that 5.5 supersedes it. Do not silently rewrite finished-phase specs.
- Do **not** also collapse `EncounterFn`'s callers into the switch body. The five encounter functions stay in their own files as named, separately testable functions; only the dispatch table goes. (Their signatures do change — that is §6's half of the pass, not this one's.)

---

## 2. Stop persisting map fields that play never reads

`GameMap.roomTiles` and `GameMap.corridorTiles` exist for exactly two consumers, both at generation time:

- `generator/entities.ts:296` — building `freeTiles` as `{...map.roomTiles, ...map.corridorTiles}`
- `generator/map.ts:90-91` — computing the wall shell

Nothing in `src/game/engine/` touches either. But they sit on `GameState.map`, so phase 7 will serialize a near-complete second and third copy of the tile map into every save, on a 25-minute cycle, in localStorage.

**Change:** `makeDiggerMap` returns `{ map, roomTiles, corridorTiles }` (or `makeEntities` takes the spawn tiles as a parameter — either is fine), and `GameMap` keeps only `floorTiles`, `rooms`, `size`.

Watch for: `engine.test.ts:35-36` and `types.test.ts:18-19` both build `GameMap` fixtures with these fields; `map.test.ts:21-28` asserts on them and will need to read them from the generator's return value instead.

---

## 3. `PosMap` → flat array — decide, then do it or close it

**This is the judgment call of the phase.** Take the decision deliberately and record it here either way; do not leave it open for phase 6 to trip over.

### The case for

`"x,y"` string keys are the right answer to "ClojureScript has value equality on `[x y]` vectors and JavaScript does not." But the thing being keyed is a fixed 32×32 grid, and a flat array indexed `y * w + x` is *also* JSON-serializable — while needing none of the surrounding apparatus.

The apparatus is a branded `PosKey` type plus seven helpers, of which three have **zero call sites outside their own definitions** (`asPosKey`, `posEntries`, `distance` — see §4). Most of the rest (`emptyPosMap`, `posKeys`, `parsePos`) exist to launder the brand back and forth across the type boundary. That is a type-safety trick whose support cost has grown past the bugs it prevents.

Two concrete knock-ons:

- **Save size.** `floorTiles` serializes as `{"3,4":"room","3,5":"room",...}` — roughly 15 bytes per tile across ~600 tiles. Row strings or a code array are ~1 byte per tile. This lands on phase 7's localStorage budget directly.
- **`freeTiles`.** `withoutPos` (`grid.ts:93`) does an object rest-spread to delete one key, ~22 times per level. The cost is trivial in absolute terms — **do not sell this change on speed** — but a free-tile array with swap-remove is simply clearer, and it removes `pickPos` from the `Rng` interface entirely.

### The case against

It touches `grid.ts`, `pos.ts`, both generator files, `movement.ts`'s passable predicates, and every test fixture that builds a map. It is the largest diff in this phase by a wide margin, and it buys clarity plus save size rather than any capability. Declining it is defensible. Declining it *after* phase 6 is not available, because phase 6 doubles the call sites.

### If taken: the one thing that must be written down

`rng.pickPos` picks by `Object.keys(freeTiles)` order. Switching `freeTiles` to an array changes which index a given roll maps to, so **every seed generates a different level after this change.** Nothing is broken by that — PLAN.md is explicit that reproducibility is a regression-testing tool, not a product promise, and there are no golden fixtures to re-bless — but the executing session will see "the levels all changed" and must not treat it as a bug to chase. The determinism test still passes because it compares two fresh generations, not a stored one.

`06-ui.md`'s "Rendering model" section describes `entitiesByPos` as a `PosKey → Layer → Entity[]` index. If §3 is taken, update that paragraph in the same change — the entity index is keyed independently of the tile representation and can keep string keys, but the doc should say so explicitly rather than leaving a reader to guess.

---

## 4. Dead code sweep

All verified as having no callers outside their own definition or a test that exists only to cover them:

| Symbol | Where | Note |
|---|---|---|
| `asPosKey` | `pos.ts:36` | no callers |
| `posEntries` | `pos.ts:50` | no callers |
| `distance` | `pos.ts:43` | no callers; `distanceSq` only feeds it |
| `restorePlayerHealth` | `turn.ts:27`, re-exported `engine/index.ts:15` | never called — `takeTurn` folds `restoreHealth` into its own produce pass. §6's restructure deletes the wrapper in passing; this row just says don't re-export a new one |
| `Rng.clone()` | `rng.ts:31,88` | only caller is `rng.test.ts:45`, which exists to test it. Its docstring implies the overlay pass will want it, but the overlay gets independent streams from `makeRng` salting, not from `clone` — confirm PLAN.md's overlay sketch agrees, then delete |

`emptyStatistics` / `Statistics` (`types.ts:192-208`) are unused too, but they are phase 7's and specced in `07-pomodoro.md`. **Leave them.** They are the one case here where "unused" means "not yet reached" rather than "not needed."

Delete the tests that exist solely to cover deleted symbols. Do not delete `distanceSq` if §3 keeps `pos.ts` around and something in phase 6 wants it for the fog-of-war radius — check `06-ui.md` first.

---

## 5. Free ergonomics, no downside

**Encounter returns** were this section's first item — renaming the `[blocks, state]` tuple to `{ blocks, state }` so the flags can't be gotten backwards. Superseded by §6, which removes state from the return entirely: encounters take the draft and return a bare `blocks: boolean`, so there is no pair left to mislabel. Do not do the rename first "to be safe" — it churns the same five call sites §6 rewrites.

**`Hp = [current, max]`** (`types.ts:32`). A Clojure-ism. The stated justification — "the health bar and share string both iterate it" — is thin, and `hp[0]` / `hp[1]` reads worse than `hp.cur` / `hp.max` at every one of its ~15 use sites. Optional; take it if §1 is already touching the entity types, skip it otherwise.

---

## 6. One immutability boundary per turn

**Change:** `takeTurn` becomes the engine's only `produce`. Everything beneath it — `moveTo`, `combat`, the encounters, `chasePlayer` / `updateMonsters` — becomes a draft mutator; encounters return a bare `blocks: boolean` and state travels as the draft. `takeTurn`'s external contract is untouched: frozen state in, frozen state out, so phases 6 and 7 see nothing.

Executes together with §1 as one engine pass — see sequencing in "Operating facts" and the note at §1.

### The problem

Phase 5 straddles two styles, and the straddle is where its accidental complexity lives:

- One keystroke runs eight to twelve `produce` passes: `resetCombatList`, each encounter's own, `moveTo`'s, the between-moves bookkeeping, then one or two more per monster.
- `state.ts`'s header spends a paragraph apologizing for its helpers being draft mutators while everything above them is `state -> state`.
- The `[blocks, state]` tuple return exists only because state must travel back out of each pure function, and `05-engine.md` spends a section warning that its flags are easy to get backwards.
- `castDraft` appears twice with paragraph-long comments, `allocId` carries a frozen-state guard, and `05-engine.md`'s "Immer and the entity index" is a rulebook about which states may be indexed.

Each of those is a symptom of the same split. With one boundary, most of them are not better-documented — they are gone. This keeps the "pure reducers, Clojure `swap!` shape" property where it is real (the `takeTurn` seam the UI holds) and stops paying for it at every micro-edit, where it was ceremony.

### The shape after

```ts
// turn.ts — the only produce in the engine
export function takeTurn(state: GameState, dir: Dir | null, rng: Rng): GameState {
  if (state.outcome) return state
  const player = getPlayer(state)
  if (!player) return state
  const newPos = dir ? posInDir(player.pos, dir) : null
  return produce(state, (draft) => {
    resetCombatList(draft)
    moveTo(draft, PLAYER_ID, newPos, rng)          // draft in, nothing out
    if (draft.outcome || !draft.entities[PLAYER_ID]?.moved) return
    draft.moves += 1
    restoreHealth(draft)
    updateMonsters(draft, rng)
  })
}
```

- Encounters become `(draft, actorId, targetId, rng) => boolean`. Bodies stay put; the `produce` wrapper and tuple packaging come off.
- `state.ts`'s helpers were draft mutators all along — they turn out to have been the *right* style, not the exception. Delete the apology in their header.
- `combat.ts`, `encounters.ts`, and `movement.ts` lose their `produce` imports entirely.

### The two places that read pre-encounter state

`moveTo` deliberately snapshots the target square's occupants before any encounter runs, and builds the passable predicate against pre-encounter positions. Under a single draft there is no old state lying around, so both become explicit captures taken before dispatch — arguably clearer than the current implicit reliance on a stale value, but they must be *values*, never draft references:

- **Occupants:** capture the ids (plain strings) before the loop; re-resolve each from the draft and skip any an earlier encounter removed.
- **Blocked set:** `makeMonsterPassable` already copies positions into a `Set` of keys; build it before dispatching encounters and it is immune to whatever they do after.

A held draft *object* reference mutates underneath you — that is the one new mistake this design makes possible, and the capture-values rule is the whole defense. Say it in a comment at the occupant snapshot.

### Watch for

- `combat.ts` builds the fatal `EntitySummary` before the skull swap. That ordering lives inside one block and survives as-is; keep its comment.
- `encounters.ts:58-61`'s `castDraft` push disappears, but its worry does not: moving `entities[itemId]` into the inventory while deleting its table slot is a draft *node move*. Immer supports relocating a node, but state that at the site — or push a plain copy — rather than leaving the next reader to re-derive the original comment's concern.
- `addEntity`'s `castDraft` (`state.ts:36`) **stays**. It is a type-level cast for `readonly Pos` vs `Draft`, still needed when a plain entity (the collision marker) is assigned into the draft.
- The `allocId` frozen guard **stays** — one guard for one boundary, and it still catches a call from outside it.
- The bulk of the diff is `engine.test.ts`: tests that call `combat` or an encounter directly need a `produce` wrapper (or to assert through `takeTurn`). The fuzz block and everything `takeTurn`-level is untouched.
- `05-engine.md` doc knock-ons: "The encounter return convention" and most of "Immer and the entity index" are superseded (head-notes already added, same treatment §1 gave the registry section), plus as-built note 2.

### And correct the Immer justification

`entities.ts:33-39` says:

> The memo is why state updates go through Immer: structural sharing means an update that doesn't touch entities leaves this cached, and the board re-renders without rebuilding the index. A full clone per update would defeat it.

This does not hold, and a future reader will treat it as load-bearing and be afraid to touch the memo. Every turn moves the player, so `entities` changes every turn and the index is rebuilt every turn regardless of Immer. Rebuilding a ~40-entry index is microseconds.

**Verdict: keep Immer, keep the memo, fix the comment.** Immer earns its place on the nested writes — `draft.entities[id].stats.hp[0]`, `inventory.push(...)` — four levels deep and unpleasant to hand-spread, plus the frozen boundary this section reduces to exactly one. The memo earns its place by making React re-renders of an unchanged state free. Two independent wins; the comment should say that instead of making one the reason for the other. The restructure above makes the honest version even shorter: one boundary, stated once.

Update PLAN.md's "Immer for state updates" decision to match, since it carries the same claim.

---

## What not to change

Listed so a session executing this phase does not keep pulling threads:

- **`ContentProvider` taking `LevelRequest`** when `builtinContent` ignores it. The retrofit argument in `00-review-notes.md` §1 is sound and the cost today is zero.
- **The explicit-`Rng` discipline and its lint rule**, the entropy-vs-seeded split, and confining the global rot-js RNG hack to `makeDiggerMap`. All correct, all load-bearing.
- **`EntitySummary`** and the slim-snapshot decision from `00-review-notes.md` §2.
- **`combatants: Record<EntityId, true>`** as a JSON-safe `Set` stand-in. Small, and the keying genuinely prevents a duplicate health bar.
- **The inline djb2a**, per its own comment.
- **`floorTiles` containing walls.** Still on the post-port rename list in `00-review-notes.md` §6, still correctly deferred to after phase 6 — renaming it now would break side-by-side reading against the original while phase 6 is being written.

## Doc debt this phase creates

`00-review-notes.md` §6 tracks post-port renames for after phase 6. Add to it there, not here, anything this phase surfaces but declines.

If §3 is declined, say so in this file under that section with the date and the reason, and remove it from the status board. A future session finding an open decision in a finished phase will reopen it.
