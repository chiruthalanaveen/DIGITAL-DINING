'use client'

import {
  useEffect,
} from 'react'

export default function PwaRegister() {
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

    const register =
      async () => {
        try {
          const registration =
            await navigator
              .serviceWorker
              .register(
                '/sw.js',
                {
                  scope: '/',
                }
              )

          console.log(
            '[DIGITAL DINE PWA] Service worker registered:',
            registration.scope
          )
        } catch (error) {
          console.error(
            '[DIGITAL DINE PWA] Registration failed:',
            error
          )
        }
      }

    register()
  }, [])

  return null
}