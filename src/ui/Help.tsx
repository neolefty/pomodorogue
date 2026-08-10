/**
 * The help overlay. Ports `component-help` from original/src/rogule/ui.cljs.
 *
 * Open/closed is UI-local state in `App`, not part of `GameState`. The original
 * kept `:modal` in its one persisted atom (`ui.cljs:326-327`), which meant a
 * help screen left open survived a reload — harmless there, actively wrong here,
 * where phase 7 persists across a 25-minute gap.
 */
import { SPRITES } from '../game/sprites.ts'
import { Attribution } from './Attribution.tsx'
import { Tile } from './Tile.tsx'

interface HelpProps {
  open: boolean
  onToggle: () => void
}

export function Help({ open, onToggle }: HelpProps) {
  if (!open) {
    return (
      <button id="help" className="key" onClick={onToggle} aria-label="help">
        ?
      </button>
    )
  }

  return (
    <div className="modal">
      <button id="help" className="key" onClick={onToggle}>
        esc
      </button>
      <h2>Pomodorogue</h2>
      <p>
        Use the arrow keys to move. Press the <button className="key">.</button> key to rest.
      </p>
      <p>
        Move onto items and <Tile sprite={SPRITES.ghost} /> monsters to interact.
      </p>
      <p>The number above each monster&apos;s head is the maximum damage they can deal to you.</p>
      <p>Health bars show up at the top of the screen during combat.</p>
      <p>
        Collect all the <Tile sprite={SPRITES.mushroom} /> items.
      </p>
      <p>
        Shields <Tile sprite={SPRITES.shield} /> give you protection.
      </p>
      <p>
        Weapons <Tile sprite={SPRITES.dagger} /> add to your hits.
      </p>
      <p>
        Get to the shrine <Tile sprite={SPRITES['shinto-shrine']} title="shrine" /> to descend.
      </p>
      <Attribution />
    </div>
  )
}
