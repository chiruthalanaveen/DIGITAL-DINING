'use client'

import {
  useEffect,
  useState,
} from 'react'

function isStandalone() {
  if (
    typeof window ===
    'undefined'
  ) {
    return false
  }

  return Boolean(
    window.matchMedia?.(
      '(display-mode: standalone)'
    )?.matches ||
      window.navigator
        ?.standalone === true
  )
}

function isIOS() {
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

function isAndroid() {
  if (
    typeof navigator ===
    'undefined'
  ) {
    return false
  }

  return /android/i.test(
    navigator.userAgent
  )
}

export default function InstallAppButton({
  label = 'Install App',
  className = '',
}) {
  const [
    deferredPrompt,
    setDeferredPrompt,
  ] = useState(null)

  const [
    installed,
    setInstalled,
  ] = useState(false)

  const [
    installing,
    setInstalling,
  ] = useState(false)

  const [
    showHelp,
    setShowHelp,
  ] = useState(false)

  useEffect(() => {
    setInstalled(
      isStandalone()
    )

    /*
     * Check whether instrumentation-client.js
     * already captured the event before React loaded.
     */
    if (
      window
        .__digitalDineInstallPrompt
    ) {
      setDeferredPrompt(
        window
          .__digitalDineInstallPrompt
      )
    }

    const handleInstallPrompt = (
      event
    ) => {
      console.log(
        '[PWA] beforeinstallprompt received'
      )

      event.preventDefault()

      window.__digitalDineInstallPrompt =
        event

      setDeferredPrompt(
        event
      )
    }

    const handleInstallReady =
      () => {
        const saved =
          window
            .__digitalDineInstallPrompt

        if (saved) {
          setDeferredPrompt(
            saved
          )
        }
      }

    const handleInstalled =
      () => {
        console.log(
          '[PWA] appinstalled'
        )

        window.__digitalDineInstallPrompt =
          null

        setDeferredPrompt(null)
        setInstalled(true)
        setInstalling(false)
        setShowHelp(false)
      }

    window.addEventListener(
      'beforeinstallprompt',
      handleInstallPrompt
    )

    window.addEventListener(
      'digitaldine-install-ready',
      handleInstallReady
    )

    window.addEventListener(
      'appinstalled',
      handleInstalled
    )

    const media =
      window.matchMedia?.(
        '(display-mode: standalone)'
      )

    const checkDisplayMode =
      () => {
        setInstalled(
          isStandalone()
        )
      }

    media?.addEventListener?.(
      'change',
      checkDisplayMode
    )

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        handleInstallPrompt
      )

      window.removeEventListener(
        'digitaldine-install-ready',
        handleInstallReady
      )

      window.removeEventListener(
        'appinstalled',
        handleInstalled
      )

      media?.removeEventListener?.(
        'change',
        checkDisplayMode
      )
    }
  }, [])

  const handleInstall =
    async () => {
      if (installed) {
        return
      }

      const prompt =
        deferredPrompt ||
        window
          .__digitalDineInstallPrompt

      /*
       * Chrome did not supply its native
       * install event.
       *
       * DO NOT disable the button.
       * Give the browser-specific manual
       * installation instructions instead.
       */
      if (!prompt) {
        console.warn(
          '[PWA] No beforeinstallprompt event available.'
        )

        setShowHelp(true)
        return
      }

      setInstalling(true)

      try {
        await prompt.prompt()

        const choice =
          await prompt.userChoice

        console.log(
          '[PWA] install result:',
          choice?.outcome
        )

        /*
         * One prompt event can only
         * be used once.
         */
        window.__digitalDineInstallPrompt =
          null

        setDeferredPrompt(null)

        if (
          choice?.outcome ===
          'accepted'
        ) {
          setInstalled(true)
          setShowHelp(false)
        } else {
          setShowHelp(true)
        }
      } catch (error) {
        console.error(
          '[PWA] install error:',
          error
        )

        setShowHelp(true)
      } finally {
        setInstalling(false)
      }
    }

  return (
    <>
      <button
        type="button"
        onClick={
          handleInstall
        }
        disabled={
          installed ||
          installing
        }
        className={`inline-flex items-center justify-center gap-1.5 ${className}`}
      >
        <span>
          {installed
            ? '✓'
            : '⬇'}
        </span>

        <span>
          {installed
            ? 'Installed'
            : installing
              ? 'Installing...'
              : label}
        </span>
      </button>

      {showHelp && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-[28px] bg-white p-5 text-neutral-950 shadow-2xl sm:rounded-[28px]">

            <div className="flex items-start justify-between gap-4">

              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-600">
                  Digital Dine-In
                </p>

                <h2 className="mt-1 text-xl font-black">
                  Install App
                </h2>
              </div>

              <button
                type="button"
                onClick={() =>
                  setShowHelp(false)
                }
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-100 text-xs font-black"
              >
                ✕
              </button>

            </div>

            <div className="mt-4 rounded-2xl bg-neutral-50 p-4 text-xs leading-6 text-neutral-700">

              {isIOS() ? (
                <>
                  <b>iPhone / iPad</b>
                  <br />
                  Open this website in Safari.
                  <br />
                  Tap <b>Share</b>.
                  <br />
                  Choose <b>Add to Home Screen</b>.
                  <br />
                  Tap <b>Add</b>.
                </>
              ) : isAndroid() ? (
                <>
                  <b>Android Chrome</b>
                  <br />
                  Tap the <b>⋮</b> menu in Chrome.
                  <br />
                  Choose <b>Install app</b> or <b>Add to Home screen</b>.
                  <br />
                  Then confirm installation.
                </>
              ) : (
                <>
                  <b>Chrome / Edge Desktop</b>
                  <br />
                  Open the browser menu.
                  <br />
                  Choose <b>Install Digital Dine-In</b>,
                  <b> Install page as app</b>, or the install icon in the address bar.
                </>
              )}

            </div>

            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">

              <p className="text-[10px] font-bold leading-5 text-amber-800">
                Chrome has not supplied the automatic install prompt yet.
                This can happen when the app was previously dismissed,
                is already installed, or Chrome has not yet considered
                this page installable.
              </p>

            </div>

            <button
              type="button"
              onClick={() =>
                window.location.reload()
              }
              className="mt-4 w-full rounded-xl bg-violet-600 px-4 py-3 text-xs font-black text-white"
            >
              ↻ Reload & Check Again
            </button>

            <button
              type="button"
              onClick={() =>
                setShowHelp(false)
              }
              className="mt-2 w-full rounded-xl bg-neutral-950 px-4 py-3 text-xs font-black text-white"
            >
              Close
            </button>

          </div>
        </div>
      )}
    </>
  )
}