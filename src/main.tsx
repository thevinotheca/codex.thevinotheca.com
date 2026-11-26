import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import './styles/vinotheca.css'
import './index.css'
import App from './App.tsx'
import { startSynchronisation } from './backend/runtime.ts'

startSynchronisation()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
