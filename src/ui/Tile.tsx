/**
 * One drawn sprite. Ports `tile` from original/src/rogule/emoji.cljs.
 *
 * The original memoized this and restored a stalled CSS animation with a DOM
 * hack (`replay-pop-animation-on-change`): strip the class, read `offsetHeight`
 * to force reflow, re-add it — hung off the `<img>`'s `onload`. Sprites are
 * URL-referenced files now and a cached one may never fire `onload`, so the
 * replay is a `key` change at the call site instead. Remounting the element
 * restarts its animation, which is the same effect with none of the fragility.
 * `Animation.frame` exists to make those keys differ; see "Animations" in
 * docs/port/06-ui.md.
 */
import type { CSSProperties } from 'react'
import type { Sprite } from '../game/sprites.ts'

interface TileProps {
  sprite: Sprite
  /** Hover text. Falls back to the sprite's own name, as the original did. */
  title?: string | undefined
  className?: string | undefined
  style?: CSSProperties | undefined
  onAnimationEnd?: (() => void) | undefined
}

export function Tile({ sprite, title, className, style, onAnimationEnd }: TileProps) {
  return (
    <img
      className={className ? `tile ${className}` : 'tile'}
      src={sprite.url}
      // The emoji character itself: a screen reader says "dragon", and a
      // copy-paste of the board comes out as text.
      alt={sprite.char}
      title={title ?? sprite.name}
      style={style}
      onAnimationEnd={onAnimationEnd}
    />
  )
}
