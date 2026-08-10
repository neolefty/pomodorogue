/**
 * The end-of-level screen. Ports `component-tombstone` and `copy-text` from
 * original/src/rogule/ui.cljs.
 *
 * Dropped per docs/port/06-ui.md: the social-media search links, the ad block,
 * and the feedback mailto. Kept: the share string, the share button, and the
 * statistics.
 *
 * Where the original counted down to tomorrow's rogule, `footer` holds the
 * pomodoro countdown to the next break — the whole point being that the next
 * level is 25 minutes away, not tomorrow. Nothing here decides when that is;
 * the screen is replaced on its own when the break arrives, so there is no
 * "play again" button to press and none of the original's reload button either.
 *
 * One placeholder is left: this appears on *every* outcome. Phase 8 makes a
 * cleared level roll straight on to the next depth, and leaves the tombstone
 * for death alone.
 */
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import type { GameState, Statistics } from '../game/types.ts'
import { Attribution } from './Attribution.tsx'
import { shareTiles, shareText } from './shareString.tsx'

interface TombstoneProps {
  state: GameState
  statistics: Statistics
  /** Rendered where the original put its countdown. */
  footer: ReactNode
}

/**
 * The share button, which confirms in place for a second after copying.
 *
 * `navigator.clipboard` is unavailable on an insecure origin and can be denied
 * outright, so the failure path says so rather than looking like a dud button.
 */
function ShareButton({ text }: { text: string }) {
  const [label, setLabel] = useState('share')

  useEffect(() => {
    if (label === 'share') return
    const timer = setTimeout(() => setLabel('share'), 1000)
    return () => clearTimeout(timer)
  }, [label])

  const copy = () => {
    // On an insecure origin the API is absent, not rejecting — same message.
    if (!navigator.clipboard) {
      setLabel('Copy failed')
      return
    }
    navigator.clipboard.writeText(text).then(
      () => setLabel('Copied!'),
      () => setLabel('Copy failed'),
    )
  }

  return (
    <button autoFocus disabled={label !== 'share'} onClick={copy}>
      {label}
    </button>
  )
}

export function Tombstone({ state, statistics, footer }: TombstoneProps) {
  const cleared = statistics.levelsCleared
  const plays = statistics.runs

  return (
    <>
      <h3>{state.outcome === 'descended' ? 'Down you go.' : 'Fin.'}</h3>
      <div className="tombstone pop">
        <div>
          {shareTiles(state, statistics).map((token, i) => (
            // Index keys: the share string is a flat token list rebuilt whole
            // for a state that never changes while it is on screen.
            <span key={i}>{token}</span>
          ))}
        </div>
        <ShareButton text={shareText(state, statistics)} />
        <hr />
        <div className="again">{footer}</div>
        <hr />
        <div id="stats">
          <p>Plays: {plays}</p>
          <p>Cleared: {plays > 0 ? Math.floor((cleared / plays) * 100) : 0}%</p>
          <p>Streak: {statistics.streak}</p>
          <p>Longest: {statistics.maxStreak}</p>
        </div>
      </div>
      <Attribution />
    </>
  )
}
