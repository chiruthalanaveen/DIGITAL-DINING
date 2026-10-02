'use client'

import {
  useEffect,
  useState,
} from 'react'

import {
  appNotice,
} from '@/lib/appDialog'

export default function InstallAppButton({
  className = '',
  label = 'Add App',
}) {
  const [
    installPrompt,
    setInstallPrompt,
  ] = useState(null)

  const [
    installed,
    setInstalled,
  ] = useState(false)

  const [
    supported,
    setSupported,
  ] = useState(true)

  useEffect(() => {
    if (
      typeof window ===
      'undefined'
    ) {
      return
    }

    const standalone =
      window.matchMedia(
        '(display-mode: standalone)'
      ).matches ||
      window.navigator
        .standalone === true

    if (standalone) {
      setInstalled(true)
    }

    const handleInstallPrompt = (
      event
    ) => {
      event.preventDefault()

      setInstallPrompt(
        event
      )

      setSupported(true)
    }

    const handleInstalled =
      () => {
        setInstalled(true)
        setInstallPrompt(null)
      }

    window.addEventListener(
      'beforeinstallprompt',
      handleInstallPrompt
    )

    window.addEventListener(
      'appinstalled',
      handleInstalled
    )

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleInstallPrompt
      )

      window.removeEventListener(
        'appinstalled',
        handleInstalled
      )
    }
  }, [])

  const isIOS = () => {
    if (
      typeof navigator ===
      'undefined'
    ) {
      return false
    }

    return (
      /iphone|ipad|ipod/i.test(
        navigator.userAgent
      ) &&
      !window.MSStream
    )
  }

  const handleInstall =
    async () => {
      if (installed) {
        await appNotice(
          'Digital Dine is already installed on this device.'
        )

        return
      }

      if (
        installPrompt
      ) {
        try {
          await installPrompt.prompt()

          const result =
            await installPrompt
              .userChoice

          if (
            result?.outcome ===
            'accepted'
          ) {
            setInstalled(true)
          }

          setInstallPrompt(null)

          return
        } catch (error) {
          console.error(
            'App installation error:',
            error
          )
        }
      }

      if (isIOS()) {
        await appNotice(
          'To install Digital Dine on iPhone: open this page in Safari, tap the Share button, then choose “Add to Home Screen”.'
        )

        return
      }

      await appNotice(
        'App installation is not available yet. Open this page in Chrome or Edge and use the browser Install App / Add to Home Screen option.'
      )
    }

  if (installed) {
    return (
      <div
        className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-5 text-xs font-black text-emerald-400 ${className}`}
      >
        <span>✓</span>
        App Installed
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={
        handleInstall
      }
      className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-white px-5 text-xs font-black text-neutral-950 transition hover:bg-neutral-200 active:scale-[0.98] ${className}`}
    >
      <span className="text-base">
        ↓
      </span>

      {label}
    </button>
  )
}