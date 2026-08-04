# Notices and attribution

Pomodorogue is licensed under the GNU Affero General Public License v3.0. See
[LICENSE.md](LICENSE.md) for the full text.

Copyright (C) 2026 Beecher Baker (neolefty)

## Derived from Rogule

Pomodorogue is a derivative work of **Rogule**, copyright (C) Chris McCormick,
licensed under AGPL-3.0.

- Original game: <https://rogule.com>
- Original source: <https://github.com/chr15m/rogule.com>

Pomodorogue began as a port of Rogule from ClojureScript to TypeScript/React in
August 2026. As a translation and adaptation of the original source, it is a
modified version under AGPL-3.0 §0 and remains licensed under the AGPL-3.0.

Changes made in Pomodorogue, all beginning August 2026:

- Rewritten from ClojureScript to TypeScript/React.
- Level generation, engine, and UI restructured; random number generation made
  explicit rather than globally seeded, so a run can generate multiple
  independent levels reproducibly.
- Game reframed from one dungeon per day into the break half of a pomodoro
  cycle: one level roughly every 25 minutes, capped at about 5 minutes of play.
- Multi-level runs with descent by depth, replacing the original's single-level
  shrine ending.
- Monster and item content reached through a provider interface to allow
  alternative content sources.

## Third-party assets

**Twemoji** — the emoji artwork used for all game sprites.
Copyright Twitter, Inc and other contributors. Graphics licensed under
[CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/). Consumed via the
[`twemoji-emojis`](https://github.com/jakejarvis/twemoji-emojis) npm package.

**emoji.json** — emoji name and codepoint data, used to resolve sprite names at
build time. Copyright Amio, licensed under the MIT License.
<https://github.com/amio/emoji.json>

## Source code offer (AGPL-3.0 §13)

Any hosted instance of Pomodorogue must offer its complete corresponding source
to users. The deployed game links to <https://github.com/neolefty/pomodorogue>
from its interface for this purpose. If you fork and host this game, update that
link to point at your own source.
