# Pomodorogue

A roguelike that is also a pomodoro timer. Work for 25 minutes, earn a dungeon
level. Play it in about 5 minutes, take the stairs down, get back to work.
Die and the run resets to depth 1.

A dungeon a day keeps the Balrog away — but a dungeon an hour keeps the
deadline away.

**Status:** early. Pomodorogue starts as a port of
[Rogule](https://rogule.com) from ClojureScript to TypeScript/React, then
extends it into multi-level runs on a pomodoro cycle. See [PLAN.md](PLAN.md)
for the phase plan and current status board.

## Development

Stack: Vite + React 19 + TypeScript, Vitest for tests.

```
npm install
npm run dev        # dev server
npm run typecheck
npm test
```

## Credits

Pomodorogue is a derivative work of **Rogule** by
[Chris McCormick](https://github.com/chr15m) — the original game is at
<https://rogule.com>, source at
<https://github.com/chr15m/rogule.com>. Rogule is a genuinely lovely little
game and you should go play it.

Sprites are [Twemoji](https://github.com/jdecked/twemoji), licensed
[CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/).

## License

[AGPL-3.0](LICENSE.md), inherited from Rogule. If you host this game, you must
offer its complete source to your players — see [NOTICE.md](NOTICE.md) for the
full attribution and the §13 source offer.
