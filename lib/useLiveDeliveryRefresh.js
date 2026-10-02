'use client'

import {
  useEffect,
  useRef,
} from 'react'

export function useLiveDeliveryRefresh(
  callback,
  enabled = true,
  intervalMs = 1000
) {
  const callbackRef =
    useRef(callback)

  const busyRef =
    useRef(false)

  useEffect(() => {
    callbackRef.current =
      callback
  }, [callback])

  useEffect(() => {
    if (!enabled) {
      return undefined
    }

    let cancelled = false

    const runRefresh =
      async () => {
        if (
          cancelled ||
          busyRef.current
        ) {
          return
        }

        // Do not keep querying while
        // the app/browser is hidden.
        if (
          typeof document !==
            'undefined' &&
          document.hidden
        ) {
          return
        }

        busyRef.current = true

        try {
          await callbackRef.current?.()
        } catch (error) {
          console.error(
            '[DIGITAL DINE LIVE REFRESH]',
            error
          )
        } finally {
          busyRef.current = false
        }
      }

    // Refresh operational data
    // every second.
    const interval =
      window.setInterval(
        runRefresh,
        Math.max(
          1000,
          Number(
            intervalMs || 1000
          )
        )
      )

    // Immediately catch up when
    // the user returns to the app.
    const handleVisibility =
      () => {
        if (
          !document.hidden
        ) {
          runRefresh()
        }
      }

    const handleFocus =
      () => {
        runRefresh()
      }

    document.addEventListener(
      'visibilitychange',
      handleVisibility
    )

    window.addEventListener(
      'focus',
      handleFocus
    )

    return () => {
      cancelled = true

      window.clearInterval(
        interval
      )

      document.removeEventListener(
        'visibilitychange',
        handleVisibility
      )

      window.removeEventListener(
        'focus',
        handleFocus
      )
    }
  }, [
    enabled,
    intervalMs,
  ])
}