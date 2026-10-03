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

function isIos() {
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
  const [promptEvent, setPromptEvent] =
    useState(null)

  const [installed, setInstalled] =
    useState(false)

  const [helpOpen, setHelpOpen] =
    useState(false)

  const [installing, setInstalling] =
    useState(false)

  useEffect(() => {
    setInstalled(
      isStandalone()
    )

    // The early instrumentation listener stores the event here.
    if (
      window
        .__digitalDineInstallPrompt
    ) {
      setPromptEvent(
        window
          .__digitalDineInstallPrompt
      )
    }

    const onPrompt = (
      event
    ) => {
      event.preventDefault()

      window.__digitalDineInstallPrompt =
        event

      setPromptEvent(
        event
      )
    }

    const onReady = () => {
      if (
        window
          .__digitalDineInstallPrompt
      ) {
        setPromptEvent(
          window
            .__digitalDineInstallPrompt
        )
      }
    }

    const onInstalled =
      () => {
        window.__digitalDineInstallPrompt =
          null

        setPromptEvent(null)
        setInstalled(true)
        setHelpOpen(false)
      }

    window.addEventListener(
      'beforeinstallprompt',
      onPrompt
    )

    window.addEventListener(
      'digitaldine-install-ready',
      onReady
    )

    window.addEventListener(
      'appinstalled',
      onInstalled
    )

    window.addEventListener(
      'digitaldine-app-installed',
      onInstalled
    )

    const displayMode =
      window.matchMedia?.(
        '(display-mode: standalone)'
      )

    const onDisplayChange =
      () => {
        setInstalled(
          isStandalone()
        )
      }

    displayMode?.addEventListener?.(
      'change',
      onDisplayChange
    )

    return () => {
      window.removeEventListener(
        'beforeinstallprompt',
        onPrompt
      )

      window.removeEventListener(
        'digitaldine-install-ready',
        onReady
      )

      window.removeEventListener(
        'appinstalled',
        onInstalled
      )

      window.removeEventListener(
        'digitaldine-app-installed',
        onInstalled
      )

      displayMode?.removeEventListener?.(
        'change',
        onDisplayChange
      )
    }
  }, [])

  const install =
    async () => {
      if (installed) {
        return
      }

      const deferred =
        promptEvent ||
        window
          .__digitalDineInstallPrompt

      if (!deferred) {
        // Never disable the button just because Chromium did not
        // expose beforeinstallprompt. Give the user a valid manual path.
        setHelpOpen(true)
        return
      }

      setInstalling(true)

      try {
        await deferred.prompt()

        const result =
          await deferred.userChoice

        // A BeforeInstallPromptEvent can only be used once.
        window.__digitalDineInstallPrompt =
          null

        setPromptEvent(null)

        if (
          result?.outcome ===
          'accepted'
        ) {
          // The browser accepted the install request.
          // `appinstalled` / standalone display mode is authoritative
          // for showing the final Installed state.
          setHelpOpen(false)
          return
        }

        // If dismissed, keep the button useful and show manual install.
        setHelpOpen(true)
      } catch (error) {
        console.error(
          'PWA install prompt error:',
          error
        )

        setHelpOpen(true)
      } finally {
        setInstalling(false)
      }
    }

  return (
    <>
      <button
        type="button"
        onClick={install}
        disabled={
          installed ||
          installing
        }
        className={`inline-flex items-center justify-center gap-1.5 ${className}`}
        aria-label={
          installed
            ? 'App installed'
            : 'Install app'
        }
        title={
          installed
            ? 'App is installed'
            : 'Install Digital Dine-In'
        }
      >
        <span aria-hidden="true">
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

      {helpOpen && (
        <div className="fixed inset-0 z-[120] flex items-end justify-center bg-black/60 p-0 backdrop-blur-[3px] sm:items-center sm:p-4">
          <div className="w-full max-w-md rounded-t-[28px] border border-neutral-200 bg-white p-5 text-neutral-950 shadow-2xl sm:rounded-[28px]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-600">
                  Install Digital Dine-In
                </p>

                <h2 className="mt-1 text-xl font-black">
                  Add this site as an app
                </h2>
              </div>

              <button
                type="button"
                onClick={() =>
                  setHelpOpen(false)
                }
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-100 text-xs font-black"
              >
                ✕
              </button>
            </div>

            <div className="mt-4 rounded-2xl bg-neutral-50 p-4 text-xs leading-6 text-neutral-700">
              {isIos() ? (
                <>
                  Open this page in Safari, tap <b>Share</b>, then choose <b>Add to Home Screen</b>.
                </>
              ) : isAndroid() ? (
                <>
                  In Chrome, tap <b>⋮</b> at the top-right, then choose <b>Install app</b> or <b>Add to Home screen</b>.
                </>
              ) : (
                <>
                  In Chrome or Edge, open the browser menu and choose <b>Install Digital Dine-In</b> / <b>Install page as app</b>. You may also see an install icon at the right side of the address bar.
                </>
              )}
            </div>

            <p className="mt-3 text-[10px] leading-5 text-neutral-500">
              If Chrome previously dismissed the install prompt, it may temporarily stop showing the automatic prompt. The browser-menu method still works.
            </p>

            <button
              type="button"
              onClick={() =>
                setHelpOpen(false)
              }
              className="mt-4 w-full rounded-xl bg-neutral-950 px-4 py-3 text-xs font-black text-white"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  )
}
