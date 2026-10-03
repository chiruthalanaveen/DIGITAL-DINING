try {
  window.__digitalDineInstallPrompt =
    window.__digitalDineInstallPrompt ||
    null

  window.addEventListener(
    'beforeinstallprompt',
    (event) => {
      console.log(
        '[PWA] Captured beforeinstallprompt early'
      )

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
      console.log(
        '[PWA] Installed successfully'
      )

      window.__digitalDineInstallPrompt =
        null
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
            scope: '/',
          })
          .then(
            (registration) => {
              console.log(
                '[PWA] Service worker registered:',
                registration.scope
              )
            }
          )
          .catch(
            (error) => {
              console.error(
                '[PWA] Service worker failed:',
                error
              )
            }
          )
      },
      {
        once: true,
      }
    )
  }
} catch (error) {
  console.error(
    '[PWA] Initialization error:',
    error
  )
}