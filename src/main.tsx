import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

const root = document.getElementById('app')
if (!root) throw new Error('no #app element')

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
  </StrictMode>,
)
