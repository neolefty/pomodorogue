/**
 * The two sounds the pomodoro makes: a bell when the break ends, and a softer
 * chime when one begins.
 *
 * The bell is the one piece of phase 7.5 that is not decoration. Telling
 * someone to step away from the screen is empty if the only thing that says
 * the break is over is on the screen; the sound is what makes leaving possible.
 * The chime is the same argument from the other side: without it the player
 * keeps glancing at the clock to see whether it is time yet, and the glancing
 * is the distraction. See docs/design.md.
 *
 * Synthesized rather than played from a file. An `AudioContext` is needed
 * either way — a file would have to be created and unlocked through exactly the
 * same gesture dance below — so an asset would add a download, a license to
 * carry in NOTICE.md and a fetch that can fail, in exchange for a better
 * timbre. To swap one in later, replace {@link play}'s body; nothing outside
 * this file knows which it is.
 */
import { useCallback, useEffect, useMemo, useRef } from 'react'

interface Partial {
  /** Multiple of the note's fundamental. */
  ratio: number
  gain: number
}

interface Note {
  /** Seconds after the sound starts. */
  at: number
  hz: number
  partials: Partial[]
  /**
   * Seconds from silence to full. Zero is a struck object; anything more is a
   * blown or bowed one, and is most of what makes a sound read as gentle.
   */
  attack: number
  /** Seconds from the start of the note to inaudible. */
  decay: number
}

interface Sound {
  /** Master level. */
  gain: number
  notes: Note[]
}

/**
 * A struck bell's partials are inharmonic — not integer multiples — which is
 * most of what separates a bell from a beep. Three is enough to read as one.
 */
const BELL_PARTIALS: Partial[] = [
  { ratio: 1, gain: 0.4 },
  { ratio: 2, gain: 0.2 },
  { ratio: 2.97, gain: 0.1 },
]

/**
 * Harmonic and nearly pure: an octave at a whisper is just enough body to
 * keep a sine from sounding like a test tone, and nothing that could clang.
 */
const CHIME_PARTIALS: Partial[] = [
  { ratio: 1, gain: 0.5 },
  { ratio: 2, gain: 0.08 },
]

/**
 * The summons back to work: one strike, bright and long enough to carry
 * across a room.
 */
const WORK_BELL: Sound = {
  gain: 0.3,
  notes: [{ at: 0, hz: 660, partials: BELL_PARTIALS, attack: 0, decay: 1.5 }],
}

/**
 * Permission to stop: two soft notes rising a fourth, an octave below the bell
 * and at roughly half its volume. A rising figure reads as an opening rather
 * than an alarm, and the whole thing is quiet enough to be missed by someone
 * mid-sentence, which is fine — the break will still be there.
 */
const BREAK_CHIME: Sound = {
  gain: 0.18,
  notes: [
    { at: 0, hz: 330, partials: CHIME_PARTIALS, attack: 0.04, decay: 1.2 },
    { at: 0.35, hz: 440, partials: CHIME_PARTIALS, attack: 0.04, decay: 1.4 },
  ],
}

/** An exponential ramp cannot reach zero, so it reaches this and stops. */
const SILENCE = 0.0001

function play(ctx: AudioContext, sound: Sound): void {
  // Unlocked once is not running forever: a context can be suspended again by
  // the machine sleeping or the tab being backgrounded, and a suspended one
  // has a frozen `currentTime`, so the notes below would be scheduled into a
  // clock that is not moving. Since the bell rings precisely when the player
  // has been left alone with neither, ask every time. Resuming a running
  // context is a no-op, and the promise is not worth waiting on — the
  // scheduling that follows is relative to the context's own clock either way.
  void ctx.resume()

  const startedAt = ctx.currentTime
  const out = ctx.createGain()
  out.gain.value = sound.gain
  out.connect(ctx.destination)

  for (const note of sound.notes) {
    const from = startedAt + note.at
    const until = from + note.decay
    for (const { ratio, gain } of note.partials) {
      const osc = ctx.createOscillator()
      osc.frequency.value = note.hz * ratio
      const envelope = ctx.createGain()
      // Exponential both ways, because that is what a vibrating object does
      // and a linear fade sounds like a switch being turned off.
      if (note.attack === 0) {
        envelope.gain.setValueAtTime(gain, from)
      } else {
        envelope.gain.setValueAtTime(SILENCE, from)
        envelope.gain.exponentialRampToValueAtTime(gain, from + note.attack)
      }
      envelope.gain.exponentialRampToValueAtTime(SILENCE, until)
      osc.connect(envelope).connect(out)
      osc.start(from)
      osc.stop(until)
    }
  }
}

export interface Chimes {
  /** The break is over. */
  ringWork: () => void
  /** The break has opened. */
  ringBreak: () => void
}

/**
 * Returns the two sounds, each safe to call when audio is not allowed.
 *
 * `muted` silences both. It is checked at the moment of ringing rather than by
 * skipping the unlock below, so that unmuting mid-session — which is itself a
 * gesture — leaves a context ready to use.
 */
export function useChime(muted: boolean): Chimes {
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

  const ring = useCallback(
    (sound: Sound) => {
      if (muted) return
      const ctx = ctxRef.current
      // No gesture this session. The browser would refuse the sound anyway, so
      // silence is the honest outcome rather than a caught error.
      if (ctx === null) return
      play(ctx, sound)
    },
    [muted],
  )

  return useMemo(
    () => ({ ringWork: () => ring(WORK_BELL), ringBreak: () => ring(BREAK_CHIME) }),
    [ring],
  )
}
