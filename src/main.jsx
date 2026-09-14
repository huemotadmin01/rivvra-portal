// Must run before any chunk that uses newer browser APIs (pdfjs-dist).
import './lib/polyfills.js'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Dev-only: pre-seed localStorage with a real auth token if VITE_DEV_AUTH_*
// env vars are set. Tree-shaken out of production builds via import.meta.env.DEV.
import './dev/devAuthBoot.js'
// Error monitoring — no-op unless VITE_SENTRY_DSN is set at build time.
import { initSentry } from './lib/sentry.js'
// GA4 + Google Ads — no-op unless VITE_GA_MEASUREMENT_ID / VITE_ADS_* are set.
import { initAnalytics } from './lib/analytics.js'
// First-touch UTM capture — must run before the router touches the URL.
import { captureAttribution } from './lib/attribution.js'
import App from './App.jsx'

initSentry()
captureAttribution()
initAnalytics()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
