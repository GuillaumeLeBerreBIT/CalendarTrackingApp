import * as Sentry from '@sentry/react'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './index.css'
import App from './App.tsx'

// Register the service worker. With registerType: 'autoUpdate', this applies a
// waiting SW and reloads the open page when the new SW takes control — so a
// deploy reaches users without a manual hard-refresh or app reinstall.
registerSW({
  immediate: true,
  onRegisteredSW(_swUrl, r) {
    // Re-check for a new SW hourly so long-lived standalone PWAs (phone home
    // screen) pick up deploys without a full relaunch.
    if (r) setInterval(() => r.update(), 60 * 60 * 1000)
  },
})

Sentry.init({
  dsn: import.meta.env.VITE_SENTRY_DSN,
  enabled: !!import.meta.env.VITE_SENTRY_DSN,
  environment: import.meta.env.MODE,
  tracesSampleRate: 0.2,
  integrations: [Sentry.browserTracingIntegration()],
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
