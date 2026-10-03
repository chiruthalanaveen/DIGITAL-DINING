/**
 * Digital Dine-In PWA bootstrap.
 *
 * Website routes:
 *   /
 *   /manager/*
 *   /waiter/*
 *   /kitchen/*
 *   /delivery-driver/*
 *   ...
 *
 * Installed application routes:
 *   /app
 *   /app/owner/*
 *   /app/manager/*
 *   /app/waiter/*
 *   /app/kitchen/*
 *   /app/packer/*
 *   /app/driver/*
 *
 * The PWA service worker is intentionally scoped to /app/.
 */

try {
  window.__digitalDineInstallPrompt =
    window.__digitalDineInstallPrompt ||
    null

  window.addEventListener(
    'beforeinstallprompt',
    (event) => {
      event.preventDefault()

      window.__digitalDineInstallPrompt =
        event

      window.dispatchEvent(
        new CustomEvent(
          'digitaldine-install-ready'
        )
      )
    }
  )

  window.addEventListener(
    'appinstalled',
    () => {
      window.__digitalDineInstallPrompt =
        null

      window.dispatchEvent(
        new CustomEvent(
          'digitaldine-app-installed'
        )
      )
    }
  )

  if (
    'serviceWorker' in navigator
  ) {
    window.addEventListener(
      'load',
      () => {
        navigator.serviceWorker
          .register('/sw.js', {
            // Only app/app routes are controlled.
            scope: '/app/',
          })
          .catch((error) => {
            console.warn(
              '[Digital Dine-In] App service worker registration failed:',
              error
            )
          })
      },
      {
        once: true,
      }
    )
  }
} catch (error) {
  console.warn(
    '[Digital Dine-In] PWA initialization warning:',
    error
  )
}