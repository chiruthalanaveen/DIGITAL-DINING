'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { Capacitor } from '@capacitor/core'
import { PushNotifications } from '@capacitor/push-notifications'
import { supabase } from '@/lib/supabase'

const CHANNEL_ID = 'delivery_orders'

export default function NativeDeliveryPush({
  restaurantId,
  role = 'owner',
  managerSessionToken = '',
  managerCredentials = null,
  dashboardPath = '',
  enabled = true,
}) {
  const isAndroid =
    typeof window !== 'undefined' &&
    Capacitor.isNativePlatform() &&
    Capacitor.getPlatform() === 'android'

  const storageKey =
    restaurantId && role
      ? `digitaldining_native_delivery_push_${role}_${restaurantId}`
      : ''

  const [status, setStatus] =
    useState('idle')
  const [message, setMessage] =
    useState('')
  const [currentToken, setCurrentToken] =
    useState('')

  const listenerHandlesRef =
    useRef([])

  const getHeaders = useCallback(async () => {
    const headers = {
      'Content-Type':
        'application/json',
    }

    if (role === 'owner') {
      const {
        data,
        error,
      } =
        await supabase.auth.getSession()

      if (error) throw error

      const accessToken =
        data?.session?.access_token

      if (!accessToken) {
        throw new Error(
          'Owner login session has expired.'
        )
      }

      headers.Authorization =
        `Bearer ${accessToken}`
    } else if (
      managerSessionToken
    ) {
      headers['x-manager-session'] =
        managerSessionToken
    }

    return headers
  }, [
    role,
    managerSessionToken,
  ])

  const buildBody = useCallback(
    (pushToken) => ({
      restaurantId:
        String(restaurantId || ''),
      role,
      platform: 'android',
      pushToken,
      managerCredentials:
        role === 'manager'
          ? {
              restaurantCode:
                String(
                  managerCredentials
                    ?.restaurantCode ||
                    ''
                ).trim(),
              userId:
                String(
                  managerCredentials
                    ?.userId || ''
                )
                  .trim()
                  .toLowerCase(),
              password:
                String(
                  managerCredentials
                    ?.password || ''
                ),
            }
          : undefined,
    }),
    [
      restaurantId,
      role,
      managerCredentials,
    ]
  )

  const saveTokenOnServer =
    useCallback(
      async (pushToken) => {
        if (!pushToken) return

        const headers =
          await getHeaders()

        const response =
          await fetch(
            '/api/push/register',
            {
              method: 'POST',
              headers,
              body: JSON.stringify(
                buildBody(
                  pushToken
                )
              ),
            }
          )

        const data =
          await response
            .json()
            .catch(() => ({}))

        if (
          !response.ok ||
          !data?.success
        ) {
          throw new Error(
            data?.message ||
              'Unable to register this device for Delivery notifications.'
          )
        }

        setCurrentToken(
          pushToken
        )

        setStatus('enabled')

        setMessage(
          'Native Delivery alerts are enabled on this Android device.'
        )

        if (storageKey) {
          try {
            localStorage.setItem(
              storageKey,
              'enabled'
            )
          } catch {
            // Local storage can be unavailable in strict privacy modes.
          }
        }
      },
      [
        getHeaders,
        buildBody,
        storageKey,
      ]
    )

  const openDeliveryFromNotification =
    useCallback(
      (notification) => {
        const data =
          notification?.notification
            ?.data ||
          notification?.data ||
          {}

        if (
          String(data?.type || '') !==
          'delivery_order'
        ) {
          return
        }

        const orderCode =
          String(
            data?.orderCode || ''
          ).trim()

        let target =
          dashboardPath ||
          window.location.pathname

        const separator =
          target.includes('?')
            ? '&'
            : '?'

        if (
          !target.includes(
            'module=delivery'
          )
        ) {
          target +=
            `${separator}module=delivery`
        }

        if (orderCode) {
          target +=
            `${target.includes('?') ? '&' : '?'}order=${encodeURIComponent(
              orderCode
            )}`
        }

        window.location.href =
          target
      },
      [dashboardPath]
    )

  const installListeners =
    useCallback(async () => {
      if (
        !isAndroid ||
        listenerHandlesRef.current
          .length > 0
      ) {
        return
      }

      const registration =
        await PushNotifications.addListener(
          'registration',
          async (token) => {
            try {
              await saveTokenOnServer(
                token.value
              )
            } catch (error) {
              console.error(
                'Native push token save error:',
                error
              )

              setStatus('error')
              setMessage(
                error?.message ||
                  'Unable to register native Delivery notifications.'
              )
            }
          }
        )

      const registrationError =
        await PushNotifications.addListener(
          'registrationError',
          (error) => {
            console.error(
              'Native push registration error:',
              error
            )

            setStatus('error')
            setMessage(
              error?.error ||
                'Android push registration failed.'
            )
          }
        )

      const received =
        await PushNotifications.addListener(
          'pushNotificationReceived',
          (notification) => {
            const orderCode =
              String(
                notification?.data
                  ?.orderCode || ''
              ).trim()

            setMessage(
              orderCode
                ? `New Delivery order ${orderCode} received.`
                : 'A new Delivery notification was received.'
            )
          }
        )

      const performed =
        await PushNotifications.addListener(
          'pushNotificationActionPerformed',
          openDeliveryFromNotification
        )

      listenerHandlesRef.current =
        [
          registration,
          registrationError,
          received,
          performed,
        ]
    }, [
      isAndroid,
      saveTokenOnServer,
      openDeliveryFromNotification,
    ])

  const createAndroidChannel =
    useCallback(async () => {
      if (!isAndroid) return

      await PushNotifications.createChannel(
        {
          id: CHANNEL_ID,
          name: 'Delivery Orders',
          description:
            'High-priority notifications for new customer Delivery orders.',
          importance: 5,
          visibility: 1,
          vibration: true,
        }
      )
    }, [isAndroid])

  const registerNativePush =
    useCallback(
      async ({
        promptIfNeeded = true,
      } = {}) => {
        if (
          !enabled ||
          !isAndroid ||
          !restaurantId
        ) {
          return
        }

        setStatus('working')
        setMessage('')

        try {
          await installListeners()
          await createAndroidChannel()

          let permissions =
            await PushNotifications.checkPermissions()

          if (
            permissions.receive !==
              'granted' &&
            promptIfNeeded
          ) {
            permissions =
              await PushNotifications.requestPermissions()
          }

          if (
            permissions.receive !==
            'granted'
          ) {
            setStatus('denied')
            setMessage(
              'Android notification permission is not enabled for this app.'
            )
            return
          }

          await PushNotifications.register()
        } catch (error) {
          console.error(
            'Native Delivery push setup error:',
            error
          )

          setStatus('error')
          setMessage(
            error?.message ||
              'Unable to enable native Delivery notifications.'
          )
        }
      },
      [
        enabled,
        isAndroid,
        restaurantId,
        installListeners,
        createAndroidChannel,
      ]
    )

  const disableNativePush =
    async () => {
      setStatus('working')

      try {
        if (currentToken) {
          const headers =
            await getHeaders()

          await fetch(
            '/api/push/register',
            {
              method: 'DELETE',
              headers,
              body: JSON.stringify(
                buildBody(
                  currentToken
                )
              ),
            }
          )
        }

        await PushNotifications.unregister()

        if (storageKey) {
          try {
            localStorage.removeItem(
              storageKey
            )
          } catch {
            // Ignore.
          }
        }

        setCurrentToken('')
        setStatus('idle')
        setMessage(
          'Native Delivery alerts are disabled on this device.'
        )
      } catch (error) {
        console.error(
          'Native push disable error:',
          error
        )

        setStatus('error')
        setMessage(
          error?.message ||
            'Unable to disable native Delivery notifications.'
        )
      }
    }

  useEffect(() => {
    if (
      !isAndroid ||
      !enabled ||
      !restaurantId
    ) {
      return undefined
    }

    let shouldRestore = false

    if (storageKey) {
      try {
        shouldRestore =
          localStorage.getItem(
            storageKey
          ) === 'enabled'
      } catch {
        shouldRestore = false
      }
    }

    installListeners()

    if (shouldRestore) {
      registerNativePush({
        promptIfNeeded: false,
      })
    }

    return () => {
      const handles = [
        ...listenerHandlesRef.current,
      ]

      listenerHandlesRef.current =
        []

      handles.forEach(
        (handle) => {
          handle
            ?.remove?.()
            ?.catch?.(() => {})
        }
      )
    }
  }, [
    isAndroid,
    enabled,
    restaurantId,
    storageKey,
    installListeners,
    registerNativePush,
  ])

  if (
    !enabled ||
    !isAndroid
  ) {
    return null
  }

  const active =
    status === 'enabled'

  return (
    <section className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-400">
            Native Android Alerts
          </p>

          <p className="mt-1 text-xs font-bold text-white">
            {active
              ? 'Delivery push notifications are ON'
              : 'Receive Delivery orders even when this screen is closed'}
          </p>

          {message && (
            <p className="mt-1 text-[10px] leading-5 text-neutral-400">
              {message}
            </p>
          )}
        </div>

        <button
          type="button"
          disabled={
            status === 'working'
          }
          onClick={
            active
              ? disableNativePush
              : () =>
                  registerNativePush({
                    promptIfNeeded:
                      true,
                  })
          }
          className={`rounded-xl px-4 py-3 text-xs font-black text-white disabled:opacity-50 ${
            active
              ? 'bg-neutral-800'
              : 'bg-emerald-600'
          }`}
        >
          {status === 'working'
            ? 'Working...'
            : active
              ? 'Disable Native Alerts'
              : 'Enable Native Alerts'}
        </button>
      </div>
    </section>
  )
}
