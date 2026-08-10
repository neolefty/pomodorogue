import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

const root = document.getElementById('app')
if (!root) throw new Error('no #app element')

// Deploys happen on a cron tick with no other signal that they landed, so the
// build stamps itself into the page: commit, subject line, and build time in
// the reader's own timezone. Not user-facing content — it's the "did my push
// reach the site?" check, and Phase 6 can drop it behind a debug corner.
const buildStamp = `${__BUILD_COMMIT__} · ${__BUILD_SUBJECT__} · built ${new Date(
  __BUILD_TIME__,
).toLocaleString()}`

createRoot(root).render(
  <StrictMode>
    <p>Pomodorogue — port in progress. See PLAN.md.</p>
    {/*
      AGPL-3.0 §13: a hosted instance must offer its source to its users. Phase 6
      gives this a proper home in the UI; until then it lives here, because the
      obligation starts the moment the site is public. See docs/deploy.md.
    */}
    <footer>
      <a href="https://github.com/neolefty/pomodorogue">Source</a> (AGPL-3.0) —
      a port of <a href="https://rogule.com">Rogule</a> by Chris McCormick.
    </footer>
    <p style={{ fontSize: '0.75rem', opacity: 0.6, fontFamily: 'monospace' }}>
      {buildStamp}
    </p>
  </StrictMode>,
)
