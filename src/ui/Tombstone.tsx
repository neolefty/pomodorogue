/**
 * The end-of-level screen, for **both** ways a level can end. Ports
 * `component-tombstone` and `copy-text` from original/src/rogule/ui.cljs.
 *
 * Dropped per docs/port/06-ui.md: the social-media search links, the ad block,
 * and the feedback mailto. Kept: the share string, the share button, and the
 * statistics.
 *
 * Since phase 8 this is also where the run is steered. The screen is the only
 * moment the choice between going deeper and starting again is meaningful,
 * which is the whole argument against making it a setting — see "Two modes, and
 * no mode flag" in docs/port/08-depth.md. Nothing here decides *when* the choice
 * takes effect: it records what the player wants and the next break acts on it.
 *
 * Where the original counted down to tomorrow's rogule, `footer` holds the
 * pomodoro countdown — the point being that the next level is 25 minutes away,
 * not tomorrow.
 */
import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { levelsPlayed } from '../game/types.ts'
import type { GameState } from '../game/types.ts'
import type { Run, RunChoice } from '../pomodoro/persistence.ts'
import { Attribution } from './Attribution.tsx'
import { shareTiles, shareText } from './shareString.tsx'

interface TombstoneProps {
  state: GameState
  run: Run
  /** Rendered where the original put its countdown. */
  footer: ReactNode
  onChoose: (choice: RunChoice) => void
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
    <button disabled={label !== 'share'} onClick={copy}>
      {label}
    </button>
  )
}

/** What the screen says once a choice is pending, in the order it will happen. */
function pendingLabel(choice: RunChoice, depth: number): string {
  switch (choice) {
    case 'descend':
      return `Down you go — depth ${depth + 1} at the next break.`
    case 'restart':
      return 'Starting over at the next break.'
    case 'retry':
      return 'Same dungeon, from the top, at the next break.'
  }
}

interface Action {
  choice: RunChoice
  label: string
  /** Ask twice. Reserved for throwing away a run that still had somewhere to go. */
  confirm?: true
}

/**
 * The buttons, ordered primary first.
 *
 * **Cleared** leads with whichever of the two standing choices the player took
 * last (`run.preferred`). A preference that follows the last choice adapts in
 * one step and reverses the instant they change their mind, where prominence
 * driven by a history counter would make a button they cannot predict.
 *
 * **Died** flips the polarity regardless of preference, because you cannot
 * descend when you are dead. Retrying is offered second: the same seed fixes
 * every depth, so it is the same dungeon from the top, with the knowledge of
 * what killed you. Not a free pass — the death already took the carry and the
 * streak.
 */
function actionsFor(state: GameState, run: Run): Action[] {
  if (state.outcome === 'died') {
    return [
      { choice: 'restart', label: 'New run' },
      { choice: 'retry', label: 'Retry this dungeon' },
    ]
  }

  const descend: Action = { choice: 'descend', label: 'Descend' }
  // Confirmed only when there is a run to lose. At depth 1 there is no carry
  // and no progress, and this is the button a fixed-mode player presses every
  // twenty-five minutes — a confirm step there is pure friction, sixteen times
  // a day, protecting nothing.
  const restart: Action = {
    choice: 'restart',
    label: 'Start over',
    ...(run.depth > 1 ? { confirm: true as const } : {}),
  }
  return run.preferred === 'restart' ? [restart, descend] : [descend, restart]
}

export function Tombstone({ state, run, footer, onChoose }: TombstoneProps) {
  const { statistics } = run
  // Which action is mid-confirm, if any. Local and deliberately forgotten on
  // every re-render path that matters: it is a question being asked, not state
  // the run has any business remembering.
  const [confirming, setConfirming] = useState<RunChoice | null>(null)

  const played = levelsPlayed(statistics)
  const actions = actionsFor(state, run)

  const heading =
    state.outcome === 'died'
      ? 'Fin.'
      : state.depth > 1
        ? `Depth ${state.depth} cleared.`
        : 'Cleared.'

  const press = (action: Action) => {
    if (action.confirm && confirming !== action.choice) {
      setConfirming(action.choice)
      return
    }
    setConfirming(null)
    onChoose(action.choice)
  }

  return (
    <>
      <h3>{heading}</h3>
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
        <div className="choice">
          {actions.map((action, i) => (
            <button
              key={action.choice}
              // The primary action takes the focus the share button used to, so
              // Enter does the thing the screen is actually for.
              autoFocus={i === 0}
              className={[i > 0 ? 'secondary' : '', run.next === action.choice ? 'chosen' : '']
                .filter(Boolean)
                .join(' ')}
              aria-pressed={run.next === action.choice}
              onClick={() => press(action)}
            >
              {confirming === action.choice ? `${action.label}?` : action.label}
            </button>
          ))}
          {/*
            The choice is recorded, not acted on: the level generates when the
            next break opens. Saying so is what makes the delay read as a plan
            rather than as a button that did nothing. The buttons stay live, so
            changing your mind is one click and needs no undo.
          */}
          {run.next !== null && <p className="pending">{pendingLabel(run.next, run.depth)}</p>}
        </div>
        <hr />
        <div className="again">{footer}</div>
        <hr />
        <div id="stats">
          {/*
            "Plays" is levels, as it always was — one level was one run before a
            run could span several, and counting levels is what keeps the
            original's four numbers meaning what they meant. The two run-scoped
            lines appear only once a run has actually gone deeper than one
            level, which is the same test the share string uses and the reason
            fixed mode needs no flag to hide them.
          */}
          <p>Plays: {played}</p>
          <p>Cleared: {played > 0 ? Math.floor((statistics.levelsCleared / played) * 100) : 0}%</p>
          <p>Streak: {statistics.streak}</p>
          <p>Longest: {statistics.maxStreak}</p>
          {statistics.maxDepth > 1 && (
            <>
              <p>Deepest: {statistics.maxDepth}</p>
              <p>Runs: {statistics.runs}</p>
            </>
          )}
        </div>
      </div>
      <Attribution />
    </>
  )
}
