import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Dev-only: pre-seed localStorage with a real auth token if VITE_DEV_AUTH_*
// env vars are set. Tree-shaken out of production builds via import.meta.env.DEV.
import './dev/devAuthBoot.js'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
