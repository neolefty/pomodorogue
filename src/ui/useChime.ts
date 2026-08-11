/**
 * The bell that ends the break.
 *
 * This is the one piece of phase 7.5 that is not decoration. Telling someone to
 * step away from the screen is empty if the only thing that says the break is
 * over is on the screen; the sound is what makes leaving possible. See
 * docs/port/07a-break-payoff.md.
 *
 * Synthesized rather than played from a file. An `AudioContext` is needed
 * either way — a file would have to be created and unlocked through exactly the
 * same gesture dance below — so an asset would add a download, a license to
 * carry in NOTICE.md and a fetch that can fail, in exchange for a better
 * timbre. To swap one in later, replace `ring`'s body; nothing outside this
 * file knows which it is.
 */
import { useCallback, useEffect, useRef } from 'react'

/**
 * A struck bell's partials are inharmonic — not integer multiples — which is
 * most of what separates a bell from a beep. Three is enough to read as one.
 */
const PARTIALS = [
  { ratio: 1, gain: 0.4 },
  { ratio: 2, gain: 0.2 },
  { ratio: 2.97, gain: 0.1 },
]
const FUNDAMENTAL_HZ = 660
const DECAY_SECONDS = 1.5

/** Returns a function that rings once. Safe to call when audio is not allowed. */
export function useChime(): () => void {
  const ctxRef = useRef<AudioContext | null>(null)

  useEffect(() => {
    // Browsers refuse to start an `AudioContext` without a user gesture, and by
    // the time the break ends the player is — by design — not at the keyboard
    // to provide one. So the context is created on the first gesture of the
    // session and kept for the rest of it.
    //
    // Any gesture, not the first move of the break: a player who reloads the
    // tab while the tombstone is up never moves again, and the bell they most
    // need is the one that would then be silent.
    const unlock = () => {
      ctxRef.current ??= new AudioContext()
      // Fires even on the gesture that created it: a context can be born
      // suspended, and resuming an already-running one is a no-op.
      void ctxRef.current.resume()
    }
    // `once` per listener, and `unlock` is idempotent, so whichever kind of
    // gesture arrives first wins and the other simply never runs.
    document.addEventListener('pointerdown', unlock, { once: true })
    document.addEventListener('keydown', unlock, { once: true })
    return () => {
      document.removeEventListener('pointerdown', unlock)
      document.removeEventListener('keydown', unlock)
    }
  }, [])

  return useCallback(() => {
    const ctx = ctxRef.current
    // No gesture this session. The browser would refuse the sound anyway, so
    // silence is the honest outcome rather than a caught error.
    if (ctx === null) return

    // Unlocked once is not running forever: a context can be suspended again by
    // the machine sleeping or the tab being backgrounded, and a suspended one
    // has a frozen `currentTime`, so the partials below would be scheduled into
    // a clock that is not moving. Since the bell rings precisely when the player
    // has been left alone with neither, ask every time. Resuming a running
    // context is a no-op, and the promise is not worth waiting on — the
    // scheduling that follows is relative to the context's own clock either way.
    void ctx.resume()

    const startedAt = ctx.currentTime
    const out = ctx.createGain()
    out.gain.value = 0.3
    out.connect(ctx.destination)

    for (const { ratio, gain } of PARTIALS) {
      const osc = ctx.createOscillator()
      osc.frequency.value = FUNDAMENTAL_HZ * ratio
      const envelope = ctx.createGain()
      // Exponential, because that is what a struck object does and a linear
      // fade sounds like a switch being turned off. It cannot ramp to zero, so
      // it ramps to inaudible and the oscillator stops there.
      envelope.gain.setValueAtTime(gain, startedAt)
      envelope.gain.exponentialRampToValueAtTime(0.0001, startedAt + DECAY_SECONDS)
      osc.connect(envelope).connect(out)
      osc.start(startedAt)
      osc.stop(startedAt + DECAY_SECONDS)
    }
  }, [])
}
