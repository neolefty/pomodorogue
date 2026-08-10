import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './ui/App.tsx'
import './ui/styles.css'

const root = document.getElementById('app')
if (!root) throw new Error('no #app element')

// The source link and build stamp that used to live here now render inside the
// UI, in the help modal and on the tombstone — see src/ui/Attribution.tsx. The
// link is an AGPL-3.0 §13 obligation, not decoration.
createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
