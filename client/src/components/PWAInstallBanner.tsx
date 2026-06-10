import { useState, useEffect } from 'react'
import Button from '@/components/ui/Button'
import Icon from '@/components/ui/Icon'

const DISMISSED_KEY = 'pwa-banner-dismissed'

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

export default function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null)
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (localStorage.getItem(DISMISSED_KEY)) return
    // Already running as installed PWA — no banner needed
    if (window.matchMedia('(display-mode: standalone)').matches) return

    const handler = (e: Event) => {
      e.preventDefault()
      setDeferredPrompt(e as BeforeInstallPromptEvent)
      setVisible(true)
    }
    window.addEventListener('beforeinstallprompt', handler)
    return () => window.removeEventListener('beforeinstallprompt', handler)
  }, [])

  async function install() {
    if (!deferredPrompt) return
    await deferredPrompt.prompt()
    const { outcome } = await deferredPrompt.userChoice
    if (outcome === 'accepted') setVisible(false)
    setDeferredPrompt(null)
  }

  function dismiss() {
    setVisible(false)
    localStorage.setItem(DISMISSED_KEY, '1')
  }

  if (!visible) return null

  return (
    <div style={{
      position: 'fixed',
      bottom: 'calc(58px + env(safe-area-inset-bottom, 0px))',
      left: 12,
      right: 12,
      zIndex: 200,
      display: 'flex',
      alignItems: 'center',
      gap: 12,
      padding: '12px 14px',
      background: 'var(--surface)',
      border: '1px solid var(--border-2)',
      borderRadius: 'var(--r-lg)',
      boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
    }}>
      <div style={{
        width: 40,
        height: 40,
        borderRadius: 10,
        background: 'var(--accent)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}>
        <Icon name="calendar" size={20} sw={2} style={{ color: '#fff' }} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-1)', margin: 0, lineHeight: 1.2 }}>
          Add to Home Screen
        </p>
        <p style={{ fontSize: 12, color: 'var(--text-3)', margin: '2px 0 0' }}>
          Use Eventli as an app
        </p>
      </div>

      <Button variant="primary" size="sm" onClick={install}>Install</Button>

      <button
        onClick={dismiss}
        aria-label="Dismiss"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-3)',
          padding: 4,
          display: 'flex',
          flexShrink: 0,
        }}
      >
        <Icon name="close" size={16} sw={2} />
      </button>
    </div>
  )
}
