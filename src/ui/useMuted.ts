/**
 * Whether the bell and chime are muted, kept across reloads.
 *
 * The only preference the game has, and the only setting the UI shows. It is
 * not part of the pomodoro's saved slots because nothing about the schedule
 * depends on it; it shares their storage envelope in `persistence.ts` and
 * nothing else. Read once on mount and written on every toggle, so a reload
 * mid-session comes back the way it was left.
 */
import { useCallback, useState } from 'react'
import { loadMuted, saveMuted } from '../pomodoro/persistence.ts'

export function useMuted(): [muted: boolean, toggle: () => void] {
  // Unmuted unless the player has said otherwise: the bell is the feature, and
  // silence is the exception the player opts into.
  const [muted, setMuted] = useState(() => loadMuted() ?? false)
  const toggle = useCallback(() => {
    const next = !muted
    saveMuted(next)
    setMuted(next)
  }, [muted])
  return [muted, toggle]
}
