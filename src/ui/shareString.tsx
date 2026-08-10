/**
 * The emoji summary of a finished level. Ports `make-share-string` and
 * `emoj-bar` from original/src/rogule/ui.cljs.
 *
 * The original builds this two ways from one function, passing either `emoj`
 * (text characters, for the clipboard) or `tile-mem` (image elements, for the
 * screen), with `"\n"` or `<br/>` as the separator. That factoring is worth
 * keeping, so here it is a generic over the render target: {@link ShareRender}
 * is the whole of what the builder may do, and the two implementations below
 * are the only ones.
 *
 * Statistics are run-scoped now rather than living in game state, so this takes
 * them as a second argument (`ui.cljs:193` read them off the state).
 */
import { countEntities } from '../game/entities.ts'
import type { Sprite } from '../game/sprites.ts'
import { SPRITES } from '../game/sprites.ts'
import type { Entity, GameState, Statistics } from '../game/types.ts'
import { PLAYER_ID } from '../game/types.ts'
import { Tile } from './Tile.tsx'

/** How a share string turns its three kinds of token into the target type. */
export interface ShareRender<T> {
  sprite: (sprite: Sprite) => T
  text: (text: string) => T
  /** Line separator: `"\n"` for the clipboard, a `<br/>` for the screen. */
  br: T
}

/**
 * One "3 of 5 mushrooms" row: a filled sprite per item held, a blank per item
 * still out there. Emits nothing at all when the level had none of them.
 */
function collectedBar<T>(
  render: ShareRender<T>,
  inventory: readonly Entity[],
  counts: Record<string, number>,
  name: string,
  sprite: Sprite,
): T[] {
  const total = counts[name] ?? 0
  if (total === 0) return []
  const held = countEntities(inventory, name)
  return Array.from({ length: total }, (_, i) =>
    render.sprite(i >= held ? SPRITES['white-large-square'] : sprite),
  )
}

export function makeShareString<T>(
  render: ShareRender<T>,
  state: GameState,
  statistics: Statistics,
): T[] {
  const player = state.entities[PLAYER_ID]
  const stats = player?.stats
  const inventory = player?.inventory ?? []
  const won = state.outcome === 'descended'

  const out: T[] = [
    render.text(`#Pomodorogue ${state.seed}`),
    render.br,

    render.sprite(SPRITES.elf),
    render.text(` ${stats?.xp ?? 0}xp `),

    // Shrine if they made it down, skull if they did not — and in that case the
    // face of whatever did it.
    render.sprite(won ? SPRITES['shinto-shrine'] : SPRITES['skull-and-crossbones']),
    ...(!won && player?.killedBy ? [render.sprite(player.killedBy.sprite)] : []),
    render.text(` ${state.moves} `),
    render.sprite(SPRITES.footprints),
    render.br,

    render.text(`streak: ${statistics.streak}`),
    render.br,
  ]

  // Health, at half resolution: one square per two points, so a ten-point bar
  // does not run off the side of a post.
  if (stats) {
    const held = stats.hp.cur / 2
    for (let i = 0; i < stats.hp.max / 2; i++) {
      out.push(render.sprite(i >= held ? SPRITES['white-large-square'] : SPRITES['green-square']))
    }
    out.push(render.br)
  }

  out.push(render.sprite(SPRITES['crossed-swords']), render.text(' '))
  // Reversed: most recent kill first, as the original had it.
  for (const kill of [...(player?.kills ?? [])].reverse()) {
    out.push(render.sprite(kill.sprite))
  }
  out.push(render.br)

  const bars = [
    collectedBar(render, inventory, state.counts, 'chestnut', SPRITES.chestnut),
    collectedBar(render, inventory, state.counts, 'mushroom', SPRITES.mushroom),
    collectedBar(render, inventory, state.counts, 'gem-stone', SPRITES['gem-stone']),
  ].filter((bar) => bar.length > 0)
  for (const bar of bars) out.push(...bar)
  if (bars.length > 0) out.push(render.br)

  return out
}

/** Renders to plain text, for the clipboard. */
export const shareText = (state: GameState, statistics: Statistics): string =>
  makeShareString<string>(
    { sprite: (s) => s.char, text: (t) => t, br: '\n' },
    state,
    statistics,
  ).join('')

/** Renders to elements, for the tombstone. */
export const shareTiles = (state: GameState, statistics: Statistics) =>
  makeShareString(
    {
      sprite: (s) => <Tile sprite={s} />,
      text: (t) => <>{t}</>,
      br: <br />,
    },
    state,
    statistics,
  )
