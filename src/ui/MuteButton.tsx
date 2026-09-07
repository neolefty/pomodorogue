/**
 * The one setting the game has: whether the bell and chime are muted.
 *
 * A key-styled button in the corner rather than a settings screen, because
 * there is nothing else to put on one. It sits top right in every state — next
 * to the break countdown while playing, and still there over the frozen board
 * and the tombstone — so the player finds it where they left it, at the moment
 * a sound has just annoyed them.
 *
 * The glyph is inline SVG in the same stroke style as the arrow buttons: a bell,
 * struck through when muted. No assets.
 */

interface MuteButtonProps {
  muted: boolean
  onToggle: () => void
}

export function MuteButton({ muted, onToggle }: MuteButtonProps) {
  return (
    <button
      id="mute"
      className="key"
      aria-label={muted ? 'unmute the bell' : 'mute the bell'}
      aria-pressed={muted}
      onClick={onToggle}
    >
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="#555"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 17V11a6 6 0 0 1 12 0v6l2 2H4z" />
        <path d="M10 21a2 2 0 0 0 4 0" />
        {muted && <path d="M4 4l16 16" />}
      </svg>
    </button>
  )
}
