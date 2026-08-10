/**
 * Keyboard input. Ports `install-arrow-key-handler` and `general-key-handler`
 * from original/src/rogule/engine.cljs and ui.cljs.
 *
 * Two departures from the original, both from docs/port/06-ui.md:
 *
 * - **`event.key`, not `keyCode`.** The original's `key-dir-map` is a table of
 *   numbers (37/39/38/40, and 72/76/75/74 for `hjkl`), and its on-screen arrows
 *   had to forge `KeyboardEvent`s carrying fake ones. Naming keys directly makes
 *   the table readable and lets the buttons call the move action outright.
 * - **A `useEffect` cleanup, not `window._game-key-handler`.** The original
 *   stashed its handler on `window` so it could find it again to remove it.
 *   React hands the same thing back from the effect.
 */
import { useEffect } from 'react'
import type { Dir } from '../game/engine/index.ts'

/** Arrow keys and vim keys, as in the original's `key-dir-map`. */
const KEY_DIRS: Record<string, Dir> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  h: 'left',
  l: 'right',
  k: 'up',
  j: 'down',
}

interface KeyboardActions {
  /** `null` rests — the `.` key, `key-dir-map`'s 190. */
  onMove: (dir: Dir | null) => void
  onToggleHelp: () => void
  onCloseHelp: () => void
}

export function useKeyboard({ onMove, onToggleHelp, onCloseHelp }: KeyboardActions): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      // A modifier means the key belongs to the browser — ⌘R is a reload, not a
      // rest. The original never checked, because keycodes hid the collision.
      if (event.metaKey || event.ctrlKey || event.altKey) return

      if (event.key === '?') {
        onToggleHelp()
      } else if (event.key === 'Escape') {
        onCloseHelp()
      } else if (event.key === '.') {
        onMove(null)
      } else {
        const dir = KEY_DIRS[event.key]
        if (!dir) return
        onMove(dir)
      }
      // Arrow keys scroll the page and `.` can land in a find-as-you-type bar.
      // Only reached for keys the game actually claimed.
      event.preventDefault()
    }

    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onMove, onToggleHelp, onCloseHelp])
}
