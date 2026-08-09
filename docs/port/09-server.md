# Phase 9 — Server (deferred)

**Outcome:** none yet. This phase is **not being built**. This document exists so the earlier phases leave the right seam, and so a future session knows what that seam was for.

## The intent

Open-ended content: a backend that calls an LLM to generate new monster and treasure descriptions, and an image model to generate new sprites for them, so a long run keeps introducing things the player has not seen. Deeper levels are the obvious place for it — the built-in table runs out around depth 11.

## What the earlier phases must guarantee

Three constraints, all already stated in their own docs. They are listed together here because this phase is the reason for all three:

1. **`src/game/` runs in bare Node** — no DOM, no React imports. ([03-core.md](03-core.md)) Lets the server generate and validate levels with the same code the client uses.
2. **`ContentProvider` is an interface, and placement code never imports the built-in tables directly.** ([04-generator.md](04-generator.md)) A remote provider then drops in without touching the generator.
3. **Templates and `GameState` are plain JSON-serializable data** — no functions, behavior referenced by name through the registry. ([05-engine.md](05-engine.md)) A monster invented by an LLM is a JSON object naming existing behaviors; it cannot introduce new code, which is both simpler and safer.

Sprites already being `{ url }` rather than inlined base64 ([02-sprites.md](02-sprites.md)) is the fourth piece — a generated sprite is the same shape as a built-in one.

## Sketch, when it happens

- Small Node/Hono service, nothing like the original's express/passport/sqlite stack — there are no user accounts here.
- Generate **ahead of time**, not on demand. A player descending should never wait on an image model. Generate the next depth's content during the 25-minute work interval, which is the one genuinely useful thing about having a long gap between levels.
- Cache generated content by `(runSeed, depth)` so a reload does not regenerate, and so determinism survives.
- Validate LLM output against the template schema before it reaches the generator, and fall back to the built-in table on any failure. A content service being down must never block play.

## Do not

Do not add the server "just in case" during phases 1–8. The seam is free; the service is not. Everything above works fully offline with `builtinContent`, and it should keep working that way even after the server exists.
