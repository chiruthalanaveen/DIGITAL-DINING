'use client'

import { useEffect } from 'react'

export default function PWARegister() {
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !('serviceWorker' in navigator)
    ) {
      return
    }

    const registerServiceWorker = async () => {
      try {
        const registration =
          await navigator.serviceWorker.register('/sw.js', {
            scope: '/',
          })

        console.log(
          '[Digital Dine] Service Worker registered:',
          registration.scope
        )
      } catch (error) {
        console.error(
          '[Digital Dine] Service Worker registration failed:',
          error
        )
      }
    }

    if (document.readyState === 'complete') {
      registerServiceWorker()
    } else {
      window.addEventListener(
        'load',
        registerServiceWorker,
        { once: true }
      )
    }

    return () => {
      window.removeEventListener(
        'load',
        registerServiceWorker
      )
    }
  }, [])

  return null
}