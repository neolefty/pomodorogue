# Phase 2 — Sprites

**Outcome:** every emoji the game draws is available as a typed constant, with autocompletion and compile-time errors for names that don't exist. Replaces the original's Clojure macro.

**Status:** done.

## Operating facts

| | |
|---|---|
| Codegen script | `scripts/gen-sprites.ts` |
| Run it | `pnpm gen:sprites` |
| Generated index (committed) | `src/game/sprites.ts` |
| Generated SVGs (committed) | `public/sprites/*.svg` |
| Source data | `node_modules/emoji.json` (names → codepoints), `node_modules/twemoji-emojis/vendor/svg/` (the artwork) |

Both outputs are **committed to the repo** so a fresh clone runs without the codegen step. Re-run `pnpm gen:sprites` only when adding a new sprite to `SPRITE_NAMES`.

### `twemoji-emojis` is not installed by default

It is *not* in `devDependencies`. Its dependency chain (`download` → `decompress`, `got`) accounts for six advisories including two criticals, and since the generated output is committed it is needed only when the sprite list changes. Leaving it out keeps `pnpm audit` at zero on a public repo.

To add a sprite:

```sh
pnpm add -D twemoji-emojis     # temporarily
pnpm gen:sprites
pnpm remove twemoji-emojis
```

(`pnpm remove` needs no `-D`; it finds the package in whichever dependency block
holds it.)

`twemoji-emojis` ships no artwork — its `postinstall` downloads the SVGs into
`vendor/`. pnpm does not run dependency build scripts by default, so it is
listed in `pnpm.onlyBuiltDependencies` in `package.json` even though it is never
a normal dependency. Without that entry the install "succeeds", `vendor/` is
never created, and `gen:sprites` fails claiming the package is missing — when it
is in fact installed and empty. Do not drop it from that list.

The script checks for it and prints exactly this instruction if it is missing, so a future session hitting the error does not have to work it out.

`emoji.json` *is* a normal devDependency — it has no transitive dependencies at all.

## What the original did

`original/src/rogule/loader.clj` defines a `load-sprite` macro that, at compile time, looks up an emoji by name in `emoji.json`, reads the matching Twemoji SVG off disk, and base64-inlines it into the compiled output. Call sites look like `(load-sprite :dragon)`, and a typo becomes a compile error because the macro fails to find the file.

## What we do instead

A codegen script that reads the same two data sources and emits a TypeScript module:

```ts
export const SPRITES = {
  'dragon': { name: 'dragon', codes: '1F409', char: '🐉', url: '/sprites/1f409.svg' },
  // ...
} as const satisfies Record<string, Sprite>

export type SpriteName = keyof typeof SPRITES
```

`SpriteName` being a literal union preserves the macro's best property — `SPRITES.dragn` doesn't compile — while also giving editor autocompletion, which the macro never did.

The list of sprites to generate lives in `SPRITE_NAMES` at the top of the script. It was seeded by grepping every `load-sprite` call in the original, minus the ad and feedback sprites that went with those dropped sections; 32 sprites in total.

Note `Sprite.name` is typed `string`, not `SpriteName`. Typing it as the union creates a circular reference, since `SpriteName` is derived from `SPRITES`, which the interface constrains. Individual entries still carry their literal name type through `as const`.

## Why URLs instead of base64 inlining

The original inlines base64 into the JS bundle. We emit SVG files into `public/sprites/` and reference them by URL. Three reasons:

1. **Bundle size.** Inlining ~40 SVGs as base64 bloats the JS payload and forces re-download of all sprite data on every deploy.
2. **Caching.** Separate files get normal HTTP caching, independently of the JS bundle's hash.
3. **Phase 9.** AI-generated sprites will arrive from a server as URLs. If the sprite type is already `{ url: string }`, a generated dragon and a built-in dragon are the same shape and nothing downstream cares which is which.

The cost is that the game is no longer a single self-contained bundle. The original supported both forms anyway — see the `src` check in `original/src/rogule/emoji.cljs:35-38`, which already branched on whether the sprite source looked like a path or base64 data.

## The `char` field

`alt-from-codes` in the original reconstructs the literal emoji character from the codepoints, and uses it for the `alt` attribute and for building the shareable text summary. We precompute it in the codegen instead of at runtime — same result, less work per render.
