'use client'

import {
  useEffect,
} from 'react'

export default function PwaRegistration() {
  useEffect(() => {
    if (
      typeof window ===
        'undefined' ||
      !(
        'serviceWorker' in
        navigator
      )
    ) {
      return
    }

    const registerWorker =
      async () => {
        try {
          await navigator
            .serviceWorker
            .register(
              '/sw.js',
              {
                scope: '/',
              }
            )
        } catch (error) {
          console.error(
            'Digital Dine PWA registration failed:',
            error
          )
        }
      }

    registerWorker()
  }, [])

  return null
}