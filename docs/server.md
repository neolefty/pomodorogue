# A content server (deferred)

**Outcome:** none yet. This is **not being built**. The document exists so the code keeps the right seam, and so a future session knows what that seam was for.

## The intent

Open-ended content: a backend that calls an LLM to generate new monster and treasure descriptions, and an image model to generate new sprites for them, so a long run keeps introducing things the player has not seen. Deeper levels are the obvious place for it — the built-in table runs out around depth 11.

**Read [progression/ingredients.md](progression/ingredients.md#generated-sprites-and-monsters) first.** It argues that the cheaper answer to novelty is curating more twemoji by hand, and that the case for generation should be made afterwards, against evidence. Nothing here is a commitment to build this.

## What the code must keep guaranteeing

Three invariants, all stated in [design.md](design.md). They are listed together here because this is the reason for all three:

1. **`src/game/` runs in bare Node** — no DOM, no React imports. ([invariant 6](design.md#6-srcgame-runs-in-bare-node)) Lets the server generate and validate levels with the same code the client uses.
2. **`ContentProvider` is an interface, and placement code never imports the built-in tables directly.** ([invariant 5](design.md#5-contentprovider-is-pure-with-respect-to-its-request)) A remote provider then drops in without touching the generator.
3. **Templates and `GameState` are plain JSON-serializable data** — no functions; behavior is selected by an `EntityKind` tag resolved in exhaustive `switch`es. ([invariant 7](design.md#7-gamestate-is-json-serializable-and-behavior-is-named-by-a-kind).) A monster invented by an LLM is data plus a kind from a closed union; it cannot name behavior that does not exist, let alone introduce new code — a stronger version of the original guarantee, with no invalid slot combinations left to validate. The narrowing is deliberate: templates can no longer mix and match behavior slots. If this ever wants behavioral variants (a monster that stands guard, a trapped item), express them as template data fields read by the existing switch cases — do not resurrect per-slot registries.

Sprites already being `{ url }` rather than inlined base64 ([design.md](design.md#sprites)) is the fourth piece — a generated sprite is the same shape as a built-in one.

## Sketch, when it happens

- Small Node/Hono service, nothing like the original's express/passport/sqlite stack — there are no user accounts here.
- Generate **ahead of time**, not on demand. A player descending should never wait on an image model. Generate the next depth's content during the 25-minute work interval, which is the one genuinely useful thing about having a long gap between levels.
- Cache generated content by `(runSeed, depth)` so a reload does not regenerate, and so determinism survives. This is not just an optimization: **a `ContentProvider` must be a pure function of its `LevelRequest`** (the rule and its rationale live in [design.md](design.md#3-seeds-control-the-world-not-the-story)), and caching per `(runSeed, depth)` is how a nondeterministic model is made to satisfy that contract. Content that genuinely cannot be pinned to a request belongs in the overlay pass instead.
- Validate LLM output against the template schema before it reaches the generator, and fall back to the built-in table on any failure. A content service being down must never block play.

## Do not

Do not add the server "just in case". The seam is free; the service is not. Everything above works fully offline with `builtinContent`, and it should keep working that way even after the server exists.
