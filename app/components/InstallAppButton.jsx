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
    deferredPrompt,
    setDeferredPrompt,
  ] = useState(null)

  const [
    installed,
    setInstalled,
  ] = useState(false)

  useEffect(() => {
    if (
      typeof window ===
      'undefined'
    ) {
      return undefined
    }

    const displayModeStandalone =
      window.matchMedia(
        '(display-mode: standalone)'
      ).matches

    const iosStandalone =
      window.navigator
        .standalone === true

    if (
      displayModeStandalone ||
      iosStandalone
    ) {
      setInstalled(true)
    }

    const handleBeforeInstallPrompt = (
      event
    ) => {
      // Prevent Chrome from immediately
      // showing its own mini-infobar.
      event.preventDefault()

      setDeferredPrompt(
        event
      )
    }

    const handleAppInstalled =
      () => {
        setInstalled(true)

        setDeferredPrompt(
          null
        )
      }

    window.addEventListener(
      'beforeinstallprompt',
      handleBeforeInstallPrompt
    )

    window.addEventListener(
      'appinstalled',
      handleAppInstalled
    )

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleBeforeInstallPrompt
      )

      window.removeEventListener(
        'appinstalled',
        handleAppInstalled
      )
    }
  }, [])

  const isIOSDevice = () => {
    if (
      typeof navigator ===
      'undefined'
    ) {
      return false
    }

    return /iphone|ipad|ipod/i.test(
      navigator.userAgent
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

      /*
       * Android Chrome / Edge:
       * Opens the real browser PWA
       * installation confirmation.
       */
      if (deferredPrompt) {
        try {
          await deferredPrompt
            .prompt()

          const result =
            await deferredPrompt
              .userChoice

          if (
            result?.outcome ===
            'accepted'
          ) {
            setInstalled(true)
          }

          setDeferredPrompt(
            null
          )

          return
        } catch (error) {
          console.error(
            '[DIGITAL DINE] App install error:',
            error
          )
        }
      }

      /*
       * iPhone/iPad:
       * Safari doesn't expose the same
       * beforeinstallprompt API.
       */
      if (isIOSDevice()) {
        await appNotice(
          'To install Digital Dine on iPhone or iPad: open this page in Safari, tap the Share button, then choose “Add to Home Screen”.'
        )

        return
      }

      /*
       * The browser will not provide an
       * install prompt until the website
       * satisfies PWA requirements.
       */
      await appNotice(
        'Install App is not available yet. Open this website in Chrome or Edge after the Digital Dine web app has been installed as a PWA.'
      )
    }

  if (installed) {
    return (
      <div
        className={`
          inline-flex
          min-h-12
          items-center
          justify-center
          gap-2
          rounded-xl
          border
          border-emerald-200
          bg-emerald-50
          px-4
          text-[10px]
          font-black
          text-emerald-700
          ${className}
        `}
      >
        <span
          aria-hidden="true"
        >
          ✓
        </span>

        Installed
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={
        handleInstall
      }
      className={`
        inline-flex
        min-h-12
        items-center
        justify-center
        gap-1.5
        rounded-xl
        border
        border-neutral-200
        bg-white
        px-4
        text-[10px]
        font-black
        text-neutral-900
        shadow-sm
        transition
        hover:bg-neutral-50
        active:scale-[0.97]
        ${className}
      `}
      aria-label="Install Digital Dine app"
    >
      <span
        aria-hidden="true"
        className="text-sm"
      >
        ↓
      </span>

      {label}
    </button>
  )
}