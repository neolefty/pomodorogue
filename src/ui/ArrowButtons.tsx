/**
 * On-screen movement controls. Ports `component-arrow` and
 * `component-arrow-buttons` from original/src/rogule/ui.cljs.
 *
 * The original's buttons synthesized `KeyboardEvent`s with fake keycodes and
 * dispatched them at the window (`trigger-key`), so that the real key handler
 * would pick them up. That is the ugliest corner of the original UI and it goes
 * away here: the buttons call the same `onMove` the keyboard handler calls, and
 * neither knows the other exists. See "Keyboard input" in docs/port/06-ui.md.
 *
 * The arrow glyphs are inline SVG rather than the original's build-time
 * `rc/inline` of files that are not in its repository. Four paths, no assets.
 */
import type { ReactNode } from 'react'
import type { Dir } from '../game/engine/index.ts'

const ARROWS: Record<Dir, ReactNode> = {
  up: <path d="M12 5l0 14M12 5l-6 6M12 5l6 6" />,
  down: <path d="M12 19l0 -14M12 19l6 -6M12 19l-6 -6" />,
  left: <path d="M5 12l14 0M5 12l6 6M5 12l6 -6" />,
  right: <path d="M19 12l-14 0M19 12l-6 6M19 12l-6 -6" />,
}

const REST = <circle cx="12" cy="12" r="3" />

/**
 * `stroke` rather than `fill`, so the arrows read as strokes at 16px on a
 * phone. `button.key svg path { fill: #555 }` in the stylesheet is the
 * original's rule for filled glyphs; these set their own colour instead.
 */
function Glyph({ children }: { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="#555"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

interface ArrowButtonsProps {
  /** `null` rests, matching `takeTurn`'s own signature. */
  onMove: (dir: Dir | null) => void
}

function ArrowButton({
  label,
  dir,
  onMove,
}: {
  label: string
  dir: Dir | null
  onMove: (dir: Dir | null) => void
}) {
  return (
    <button className="key" aria-label={label} onClick={() => onMove(dir)}>
      <span>
        <Glyph>{dir ? ARROWS[dir] : REST}</Glyph>
      </span>
    </button>
  )
}

export function ArrowButtons({ onMove }: ArrowButtonsProps) {
  return (
    <div id="arrow-buttons">
      <div>
        <ArrowButton label="move up" dir="up" onMove={onMove} />
      </div>
      <div>
        <ArrowButton label="move left" dir="left" onMove={onMove} />
        <ArrowButton label="rest" dir={null} onMove={onMove} />
        <ArrowButton label="move right" dir="right" onMove={onMove} />
      </div>
      <div>
        <ArrowButton label="move down" dir="down" onMove={onMove} />
      </div>
    </div>
  )
}
