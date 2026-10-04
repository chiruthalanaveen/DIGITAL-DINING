'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

/*
 * Foreground portal alarm.
 *
 * Browser audio requires a user gesture. Therefore each portal exposes an
 * explicit Enable Alarm button which calls enable().
 *
 * When enabled && active:
 *   - play immediately
 *   - repeat until active becomes false
 *
 * This is intentionally client-only and does not modify order/database state.
 */
export function usePersistentPortalAlarm({
  active = false,
  repeatMs = 1800,
  notificationTitle = 'Digital Dine-In',
  notificationBody = 'Action required.',
} = {}) {
  const [
    enabled,
    setEnabled,
  ] =
    useState(false)

  const audioContextRef =
    useRef(null)

  const intervalRef =
    useRef(null)

  const previousActiveRef =
    useRef(false)

  const clearTimer =
    useCallback(() => {
      if (
        intervalRef.current
      ) {
        window.clearInterval(
          intervalRef.current
        )

        intervalRef.current =
          null
      }
    }, [])

  const ensureContext =
    useCallback(async () => {
      if (
        typeof window ===
        'undefined'
      ) {
        return null
      }

      const AudioContextClass =
        window.AudioContext ||
        window.webkitAudioContext

      if (!AudioContextClass) {
        return null
      }

      if (
        !audioContextRef.current
      ) {
        audioContextRef.current =
          new AudioContextClass()
      }

      const context =
        audioContextRef.current

      if (
        context.state ===
        'suspended'
      ) {
        try {
          await context.resume()
        } catch {
          // Browser may require another direct user gesture.
        }
      }

      return context
    }, [])

  const play =
    useCallback(async () => {
      try {
        const context =
          await ensureContext()

        if (
          !context ||
          context.state !==
            'running'
        ) {
          return
        }

        const now =
          context.currentTime

        /*
         * Strong but short triple-beep pattern.
         * It repeats via the interval while action is still required.
         */
        const notes = [
          [0, 920],
          [0.20, 1120],
          [0.40, 920],
        ]

        notes.forEach(
          ([
            offset,
            frequency,
          ]) => {
            const oscillator =
              context.createOscillator()

            const gain =
              context.createGain()

            oscillator.type =
              'square'

            oscillator.frequency
              .setValueAtTime(
                frequency,
                now + offset
              )

            gain.gain
              .setValueAtTime(
                0.0001,
                now + offset
              )

            gain.gain
              .exponentialRampToValueAtTime(
                0.16,
                now +
                  offset +
                  0.02
              )

            gain.gain
              .exponentialRampToValueAtTime(
                0.0001,
                now +
                  offset +
                  0.15
              )

            oscillator.connect(
              gain
            )

            gain.connect(
              context.destination
            )

            oscillator.start(
              now + offset
            )

            oscillator.stop(
              now +
                offset +
                0.17
            )
          }
        )
      } catch (error) {
        console.warn(
          'Portal alarm audio warning:',
          error
        )
      }
    }, [ensureContext])

  const notify =
    useCallback(() => {
      if (
        typeof window ===
          'undefined' ||
        !(
          'Notification' in
          window
        ) ||
        Notification.permission !==
          'granted'
      ) {
        return
      }

      try {
        new Notification(
          notificationTitle,
          {
            body:
              notificationBody,
          }
        )
      } catch {
        // Notification is best-effort only.
      }
    }, [
      notificationTitle,
      notificationBody,
    ])

  const enable =
    useCallback(async () => {
      await ensureContext()

      if (
        typeof window !==
          'undefined' &&
        'Notification' in
          window &&
        Notification.permission ===
          'default'
      ) {
        try {
          await Notification
            .requestPermission()
        } catch {
          // Alarm audio can still work without notifications.
        }
      }

      setEnabled(true)

      // Confirmation beep from the user's click gesture.
      await play()
    }, [
      ensureContext,
      play,
    ])

  const disable =
    useCallback(() => {
      clearTimer()
      setEnabled(false)
    }, [clearTimer])

  useEffect(() => {
    clearTimer()

    if (
      !enabled ||
      !active
    ) {
      previousActiveRef.current =
        false
      return undefined
    }

    play()

    if (
      !previousActiveRef.current
    ) {
      notify()
    }

    previousActiveRef.current =
      true

    intervalRef.current =
      window.setInterval(
        () => {
          play()
        },
        Math.max(
          1000,
          Number(
            repeatMs || 1800
          )
        )
      )

    return clearTimer
  }, [
    enabled,
    active,
    repeatMs,
    play,
    notify,
    clearTimer,
  ])

  useEffect(() => {
    const onVisibility =
      () => {
        if (
          document.visibilityState ===
            'visible' &&
          enabled &&
          active
        ) {
          play()
        }
      }

    document.addEventListener(
      'visibilitychange',
      onVisibility
    )

    return () => {
      document.removeEventListener(
        'visibilitychange',
        onVisibility
      )
    }
  }, [
    enabled,
    active,
    play,
  ])

  useEffect(
    () => () => {
      clearTimer()

      const context =
        audioContextRef.current

      if (
        context &&
        context.state !==
          'closed'
      ) {
        context.close().catch(
          () => {}
        )
      }
    },
    [clearTimer]
  )

  return {
    enabled,
    active:
      Boolean(
        enabled &&
        active
      ),
    enable,
    disable,
    play,
  }
}
