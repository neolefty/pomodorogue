import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

const root = document.getElementById('app')
if (!root) throw new Error('no #app element')

createRoot(root).render(
  <StrictMode>
    <p>Pomodorogue — port in progress. See PLAN.md.</p>
  </StrictMode>,
)
