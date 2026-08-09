# Phase 1 — Scaffold

**Outcome:** `pnpm dev` serves a blank page from a Vite + React + TypeScript project. `pnpm typecheck` and `pnpm test` both pass with nothing to check.

**Status:** done.

## What was set up

| File | Purpose |
|---|---|
| `package.json` | Deps and scripts. Runtime deps are deliberately few: `react`, `react-dom`, `rot-js`, `immer`. |
| `tsconfig.json` | Strict mode on, including `noUncheckedIndexedAccess` — see below. |
| `vite.config.ts` | React plugin, Vitest config. |
| `index.html` | Entry point. Ported from `original/public/game.html` minus the Rogule branding, PWA manifest, and service worker. |
| `src/main.tsx` | Mounts `<App/>`. |
| `eslint.config.js` | Includes the no-`Math.random`-in-`src/game` rule from PLAN.md. |

## Dependencies kept from the original

- **`rot-js`** — the dungeon generator (`ROT.Map.Digger`), A\* pathfinding (`ROT.Path.AStar`), and weighted random selection (`ROT.RNG.getWeightedValue`). This is the one substantial third-party dependency and it is plain JS, so it ports over unchanged. Ships its own type definitions.
- **`immer`** — new; replaces Clojure's immutable maps. See [03-core.md](03-core.md).

## Dependencies dropped from the original

Everything server-side (`express`, `sitefox`, `passport`, `sqlite3`, `keyv`, `nodemailer`, `csurf`, …) — those existed only to back the `/share` endpoint that posted game logs. About 30 packages. Phase 9 will reintroduce a much smaller server if and when it happens.

Also dropped: `reagent` (replaced by React directly), `seedrandom` (replaced by our own seeded RNG — see [03-core.md](03-core.md)), `alandipert/storage-atom` (replaced by a small localStorage hook in phase 7), `shadow-cljs` and the whole JVM toolchain.

`emoji.json` and `twemoji-emojis` stay, but as **devDependencies** — they are only read by the sprite codegen script, never at runtime. See [02-sprites.md](02-sprites.md).

## `noUncheckedIndexedAccess`

This is on, and it is not merely pedantry here. The original indexes into maps constantly (`(get floor-tiles [x y])`, `(get entities id)`) and relies on Clojure's `nil`-punning, where a missing key silently yields `nil` and most operations tolerate it. TypeScript without this flag would type those lookups as non-optional and hide exactly the class of bug the port is most likely to introduce. With it on, every map lookup forces an explicit decision about the missing case.

Expect this to be mildly annoying in the generator. It is worth it.

## Not done here

No CSS yet — `original/public/css/style.css` (544 lines) gets ported in phase 6, where there is something to style.
