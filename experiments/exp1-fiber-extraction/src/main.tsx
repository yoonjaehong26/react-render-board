import { startFiberInspector } from './fiber-inspector.ts'
import { startSourceSpike } from './source-spike.ts'

startFiberInspector()
startSourceSpike()

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
