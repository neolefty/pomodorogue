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

/**
 * Arrow keys and vim keys, as in the original's `key-dir-map`. Both cases of
 * the vim keys: CapsLock delivers `H` with no modifier flag set, and the
 * original's keycode table (72/74/75/76) never saw the difference.
 */
const KEY_DIRS: Record<string, Dir> = {
  ArrowLeft: 'left',
  ArrowRight: 'right',
  ArrowUp: 'up',
  ArrowDown: 'down',
  h: 'left',
  l: 'right',
  k: 'up',
  j: 'down',
  H: 'left',
  L: 'right',
  K: 'up',
  J: 'down',
}

interface KeyboardActions {
  /**
   * While the help overlay is open it owns the keyboard: `?` and Escape still
   * work, but movement keys go back to the browser so arrows can scroll it.
   */
  helpOpen: boolean
  /** `null` rests — the `.` key, `key-dir-map`'s 190. */
  onMove: (dir: Dir | null) => void
  onToggleHelp: () => void
  onCloseHelp: () => void
  /**
   * Backspace opens the pomodoro gate on the spot, for tuning the depth ramp
   * without living through a level every twenty-five minutes.
   *
   * `null` in production, where the caller must not pass a function at all —
   * which is the point of the type: there is no flag to get wrong at this end,
   * only a callback that either exists or does not. The original gated the same
   * key on `localhost` (`ui.cljs:328-329`).
   */
  onSkipGate: (() => void) | null
}

export function useKeyboard({
  helpOpen,
  onMove,
  onToggleHelp,
  onCloseHelp,
  onSkipGate,
}: KeyboardActions): void {
  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      // A modifier means the key belongs to the browser — ⌘R is a reload, not a
      // rest. The original never checked, because keycodes hid the collision.
      if (event.metaKey || event.ctrlKey || event.altKey) return

      if (event.key === '?') {
        onToggleHelp()
      } else if (event.key === 'Escape') {
        onCloseHelp()
      } else if (helpOpen) {
        return
      } else if (event.key === 'Backspace' && onSkipGate) {
        onSkipGate()
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
  }, [helpOpen, onMove, onToggleHelp, onCloseHelp, onSkipGate])
}
