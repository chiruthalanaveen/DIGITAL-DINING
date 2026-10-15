'use client'

import { useEffect, useState } from 'react'

/** Browser-native PWA installation UI. Never claims to install silently. */
export default function DDAppInstall({ className = '', label = 'Install app', swPath = '', swScope = '' }) {
  const [promptEvent, setPromptEvent] = useState(null)
  const [installed, setInstalled] = useState(false)
  const [help, setHelp] = useState(false)

  useEffect(() => {
    if (swPath && swScope && typeof window !== 'undefined' && window.isSecureContext && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register(swPath, { scope: swScope }).catch(() => {
        // Installation should not interrupt authenticated user workflows.
      })
    }
    const checkInstalled = () => window.matchMedia?.('(display-mode: standalone)')?.matches || window.navigator.standalone === true
    setInstalled(Boolean(checkInstalled()))
    const beforeInstall = (event) => {
      event.preventDefault()
      setPromptEvent(event)
    }
    const afterInstall = () => {
      setInstalled(true)
      setPromptEvent(null)
      setHelp(false)
    }
    window.addEventListener('beforeinstallprompt', beforeInstall)
    window.addEventListener('appinstalled', afterInstall)
    return () => {
      window.removeEventListener('beforeinstallprompt', beforeInstall)
      window.removeEventListener('appinstalled', afterInstall)
    }
  }, [swPath, swScope])

  if (installed) return null

  async function install() {
    if (!promptEvent) {
      setHelp((wasOpen) => !wasOpen)
      return
    }
    try {
      await promptEvent.prompt()
      await promptEvent.userChoice
    } finally {
      setPromptEvent(null)
    }
  }

  return (
    <span className={`dd-install-wrap ${className}`}>
      <button type="button" className="dd-install-btn" onClick={install} aria-expanded={help}>
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v3h16v-3"/></svg>
        {label}
      </button>
      {help && (
        <span className="dd-install-tip" role="status">
          On iPhone: Safari → Share → Add to Home Screen. On Android: Chrome menu → Install app or Add to Home Screen. Use HTTPS for installation.
          <button type="button" onClick={() => setHelp(false)} aria-label="Close installation instructions">×</button>
        </span>
      )}
    </span>
  )
}
