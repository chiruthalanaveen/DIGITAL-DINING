'use client'

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const SESSION_STORAGE_KEY = 'digital-dine-staff-session'

const SOUND_MAP = {
  'waiter-default': '/sounds/waiter-default.mp3',
  'waiter-1': '/sounds/waiter-1.mp3',
  'waiter-2': '/sounds/waiter-2.mp3',
  'waiter-3': '/sounds/waiter-3.mp3',
  'waiter-4': '/sounds/waiter-4.mp3',
  'waiter-5': '/sounds/waiter-5.mp3',
  'waiter-6': '/sounds/waiter-6.mp3',
  'waiter-7': '/sounds/waiter-7.mp3',
  'waiter-8': '/sounds/waiter-8.mp3',
  'waiter-9': '/sounds/waiter-9.mp3',
}

const money = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  })}`

export default function WaiterMobileApp({ params }) {
  const router = useRouter()
  const routeParams = use(params)

  const restaurantId = String(
    routeParams?.restaurantId ||
      routeParams?.restaurantid ||
      routeParams?.restaurant_id ||
      routeParams?.id ||
      ''
  ).trim()

  const [sessionChecking, setSessionChecking] = useState(true)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [sessionMode, setSessionMode] = useState(false)
  const [sessionToken, setSessionToken] = useState('')

  const [restaurantCode, setRestaurantCode] = useState('')
  const [restaurantName, setRestaurantName] = useState('')
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [waiterName, setWaiterName] = useState('')

  const [menuItems, setMenuItems] = useState([])
  const [readyOrders, setReadyOrders] = useState([])
  const [tableNumber, setTableNumber] = useState('Table 1')
  const [cart, setCart] = useState([])

  const [activeTab, setActiveTab] = useState('home')
  const [showCart, setShowCart] = useState(false)
  const [menuSearch, setMenuSearch] = useState('')
  const [loading, setLoading] = useState(false)
  const [placingOrder, setPlacingOrder] = useState(false)
  const [notice, setNotice] = useState('')

  const [soundEnabled, setSoundEnabled] = useState(false)
  const [alarmActive, setAlarmActive] = useState(false)
  const [alarmSoundUrl, setAlarmSoundUrl] = useState(
    SOUND_MAP['waiter-default']
  )
  const [alarmSettingEnabled, setAlarmSettingEnabled] = useState(true)
  const [alarmVolume, setAlarmVolume] = useState(1)

  const sessionTokenRef = useRef('')
  const sessionModeRef = useRef(false)
  const restaurantCodeRef = useRef('')
  const userIdRef = useRef('')
  const passwordRef = useRef('')

  const alarmAudioRef = useRef(null)
  const soundEnabledRef = useRef(false)
  const alarmActiveRef = useRef(false)

  const notify = useCallback((message) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3000)
  }, [])

  const clearSavedWaiterSession = useCallback(() => {
    if (typeof window === 'undefined') return

    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY)
      if (!raw) return

      const saved = JSON.parse(raw)

      if (
        String(saved?.role || '').toLowerCase() === 'waiter' &&
        String(saved?.restaurantId || '') === String(restaurantId)
      ) {
        localStorage.removeItem(SESSION_STORAGE_KEY)
      }
    } catch {
      localStorage.removeItem(SESSION_STORAGE_KEY)
    }
  }, [restaurantId])

  // =========================================================
  // ALARM
  // =========================================================

  const initializeAlarmAudio = useCallback(() => {
    if (typeof window === 'undefined') return null

    if (!alarmAudioRef.current) {
      const audio = new Audio(alarmSoundUrl)
      audio.preload = 'auto'
      audio.loop = true
      alarmAudioRef.current = audio
    }

    const audio = alarmAudioRef.current

    if (audio.src !== new URL(alarmSoundUrl, window.location.href).href) {
      try {
        audio.pause()
        audio.currentTime = 0
      } catch {}

      audio.src = alarmSoundUrl
      audio.load()
    }

    audio.volume = Math.min(
      1,
      Math.max(0, Number(alarmVolume) || 0)
    )

    return audio
  }, [alarmSoundUrl, alarmVolume])

  const stopAlarm = useCallback(() => {
    alarmActiveRef.current = false

    const audio = alarmAudioRef.current

    if (audio) {
      try {
        audio.pause()
        audio.currentTime = 0
      } catch {}
    }

    setAlarmActive(false)
  }, [])

  const startAlarm = useCallback(async () => {
    if (
      !alarmSettingEnabled ||
      !soundEnabledRef.current ||
      alarmActiveRef.current
    ) {
      return
    }

    const audio = initializeAlarmAudio()
    if (!audio) return

    try {
      audio.loop = true
      audio.volume = Math.min(
        1,
        Math.max(0, Number(alarmVolume) || 0)
      )
      audio.currentTime = 0
      await audio.play()

      alarmActiveRef.current = true
      setAlarmActive(true)
    } catch (error) {
      console.error('[WAITER MOBILE] Alarm could not start:', error)
      alarmActiveRef.current = false
      setAlarmActive(false)
    }
  }, [initializeAlarmAudio, alarmSettingEnabled, alarmVolume])

  const enableAlarmSound = async () => {
    if (!alarmSettingEnabled) {
      notify('Waiter alarm is disabled in Owner Alarm Settings.')
      return
    }

    const audio = initializeAlarmAudio()
    if (!audio) return

    try {
      audio.loop = false
      audio.currentTime = 0
      audio.volume = 0.01

      await audio.play()

      window.setTimeout(() => {
        try {
          audio.pause()
          audio.currentTime = 0
          audio.volume = Math.min(
            1,
            Math.max(0, Number(alarmVolume) || 0)
          )
          audio.loop = true
        } catch {}
      }, 150)

      soundEnabledRef.current = true
      setSoundEnabled(true)

      if (readyOrders.length > 0) {
        window.setTimeout(() => {
          startAlarm()
        }, 200)
      }

      notify('Order alarm enabled.')
    } catch (error) {
      console.error('[WAITER MOBILE] Unable to enable alarm:', error)
      alert(
        'The phone blocked audio playback. Tap Enable Alarm again and make sure media sound is enabled.'
      )
    }
  }

  // =========================================================
  // PORTAL DATA
  // =========================================================

  const fetchPortalData = useCallback(async ({ silent = false } = {}) => {
    if (!restaurantId) return

    const usingSession = Boolean(
      sessionModeRef.current && sessionTokenRef.current
    )

    const code = String(restaurantCodeRef.current || '').trim()
    const waiterUserId = String(userIdRef.current || '')
      .trim()
      .toLowerCase()
    const waiterPassword = String(passwordRef.current || '').trim()

    if (
      !usingSession &&
      (!code || !waiterUserId || !waiterPassword)
    ) {
      return
    }

    if (!silent) setLoading(true)

    try {
      let response

      if (usingSession) {
        response = await supabase.rpc(
          'get_waiter_portal_data_session',
          {
            p_session_token: sessionTokenRef.current,
          }
        )
      } else {
        response = await supabase.rpc('get_waiter_portal_data', {
          p_restaurant_id: String(restaurantId),
          p_restaurant_code: code,
          p_user_id: waiterUserId,
          p_password: waiterPassword,
        })
      }

      const { data, error } = response

      if (error) throw error

      if (!data?.success) {
        if (usingSession) {
          clearSavedWaiterSession()
          sessionTokenRef.current = ''
          sessionModeRef.current = false
          setSessionToken('')
          setSessionMode(false)
          setIsAuthenticated(false)
        }

        throw new Error(
          data?.message || 'Unable to load waiter portal.'
        )
      }

      if (
        data?.restaurantId &&
        String(data.restaurantId) !== String(restaurantId)
      ) {
        throw new Error(
          'This waiter session belongs to another restaurant.'
        )
      }

      const nextMenu = Array.isArray(data?.menuItems)
        ? data.menuItems
        : []

      const nextReadyOrders = Array.isArray(data?.readyOrders)
        ? data.readyOrders
        : []

      setMenuItems(nextMenu)
      setReadyOrders(nextReadyOrders)

      if (data?.restaurant?.name) {
        setRestaurantName(String(data.restaurant.name))
      }

      const waiterSoundKey =
        data?.restaurant?.waiter_alarm_sound || 'waiter-default'

      const nextAlarmUrl =
        SOUND_MAP[waiterSoundKey] || SOUND_MAP['waiter-default']

      const nextAlarmEnabled =
        data?.restaurant?.waiter_alarm_enabled ?? true

      const nextAlarmVolume = Math.min(
        1,
        Math.max(
          0,
          Number(data?.restaurant?.waiter_alarm_volume ?? 1)
        )
      )

      setAlarmSoundUrl(nextAlarmUrl)
      setAlarmSettingEnabled(nextAlarmEnabled)
      setAlarmVolume(nextAlarmVolume)

      if (!nextAlarmEnabled) {
        stopAlarm()
      } else if (
        nextReadyOrders.length > 0 &&
        soundEnabledRef.current
      ) {
        startAlarm()
      }

      if (nextReadyOrders.length === 0) {
        stopAlarm()
      }
    } catch (error) {
      console.error('[WAITER MOBILE] Portal loading error:', error)

      if (!silent) {
        setNotice(error?.message || 'Unable to refresh waiter data.')
      }
    } finally {
      if (!silent) setLoading(false)
    }
  }, [
    restaurantId,
    clearSavedWaiterSession,
    startAlarm,
    stopAlarm,
  ])

  // =========================================================
  // MANUAL LOGIN FALLBACK
  // =========================================================

  const handleLogin = async (event) => {
    event.preventDefault()

    if (
      !restaurantId ||
      !restaurantCode.trim() ||
      !userId.trim() ||
      !password.trim()
    ) {
      alert(
        'Enter the 5-digit Restaurant Code, Waiter User ID, and password.'
      )
      return
    }

    setLoading(true)

    try {
      const cleanCode = String(restaurantCode).trim()
      const cleanUserId = String(userId).trim().toLowerCase()
      const cleanPassword = String(password).trim()

      const { data, error } = await supabase.rpc(
        'authenticate_staff_login',
        {
          p_restaurant_id: String(restaurantId),
          p_restaurant_code: cleanCode,
          p_user_id: cleanUserId,
          p_password: cleanPassword,
          p_role: 'waiter',
        }
      )

      if (error) throw error

      if (!data?.success) {
        throw new Error(
          data?.message || 'Invalid restaurant credentials.'
        )
      }

      if (String(data.restaurantId) !== String(restaurantId)) {
        throw new Error(
          'These credentials do not belong to this restaurant.'
        )
      }

      sessionTokenRef.current = ''
      sessionModeRef.current = false
      restaurantCodeRef.current = String(
        data.restaurantCode || cleanCode
      ).trim()
      userIdRef.current = cleanUserId
      passwordRef.current = cleanPassword

      setSessionToken('')
      setSessionMode(false)
      setRestaurantCode(restaurantCodeRef.current)
      setUserId(cleanUserId)
      setWaiterName(
        data.staff?.name || data.staff?.user_id || cleanUserId
      )
      setIsAuthenticated(true)

      await fetchPortalData()
    } catch (error) {
      console.error('[WAITER MOBILE] Login error:', error)
      setIsAuthenticated(false)
      alert(error?.message || 'Unable to sign in.')
    } finally {
      setLoading(false)
    }
  }

  // =========================================================
  // RESTORE /APP SECURE SESSION
  // =========================================================

  useEffect(() => {
    let active = true

    const restoreSession = async () => {
      if (typeof window === 'undefined') return

      try {
        const rawSession = localStorage.getItem(
          SESSION_STORAGE_KEY
        )

        if (!rawSession) return

        let savedSession

        try {
          savedSession = JSON.parse(rawSession)
        } catch {
          clearSavedWaiterSession()
          return
        }

        const token = String(
          savedSession?.sessionToken || ''
        ).trim()

        const role = String(savedSession?.role || '')
          .trim()
          .toLowerCase()

        const savedRestaurantId = String(
          savedSession?.restaurantId || ''
        ).trim()

        if (
          role !== 'waiter' ||
          savedRestaurantId !== String(restaurantId)
        ) {
          return
        }

        if (!token) {
          clearSavedWaiterSession()
          return
        }

        const { data, error } = await supabase.rpc(
          'validate_staff_app_session',
          {
            p_session_token: token,
            p_required_role: 'waiter',
          }
        )

        if (error) throw error

        if (!data?.success) {
          throw new Error(
            data?.message || 'Waiter session expired.'
          )
        }

        if (
          String(data.restaurantId) !== String(restaurantId)
        ) {
          throw new Error(
            'This waiter session belongs to another restaurant.'
          )
        }

        if (!active) return

        const restoredCode = String(
          data.restaurantCode ||
            savedSession?.restaurantCode ||
            ''
        ).trim()

        const restoredUserId = String(
          data.userId || savedSession?.userId || ''
        )
          .trim()
          .toLowerCase()

        const restoredWaiter =
          savedSession?.staff || {
            user_id: restoredUserId,
            name: restoredUserId,
            role: 'waiter',
          }

        sessionTokenRef.current = token
        sessionModeRef.current = true
        restaurantCodeRef.current = restoredCode
        userIdRef.current = restoredUserId
        passwordRef.current = ''

        setSessionToken(token)
        setSessionMode(true)
        setRestaurantCode(restoredCode)
        setRestaurantName(
          String(savedSession?.restaurantName || '')
        )
        setUserId(restoredUserId)
        setPassword('')
        setWaiterName(
          String(
            restoredWaiter?.name ||
              restoredWaiter?.user_id ||
              restoredUserId
          )
        )
        setIsAuthenticated(true)

        await fetchPortalData()
      } catch (error) {
        console.error(
          '[WAITER MOBILE] Session restore error:',
          error
        )

        clearSavedWaiterSession()

        sessionTokenRef.current = ''
        sessionModeRef.current = false
        restaurantCodeRef.current = ''
        userIdRef.current = ''
        passwordRef.current = ''

        setSessionToken('')
        setSessionMode(false)
        setRestaurantCode('')
        setRestaurantName('')
        setUserId('')
        setPassword('')
        setWaiterName('')
        setIsAuthenticated(false)
      } finally {
        if (active) setSessionChecking(false)
      }
    }

    restoreSession()

    return () => {
      active = false
    }
  }, [
    restaurantId,
    clearSavedWaiterSession,
    fetchPortalData,
  ])

  // =========================================================
  // REALTIME + 5 SECOND REFRESH
  // =========================================================

  useEffect(() => {
    if (!isAuthenticated || !restaurantId) return undefined

    const channel = supabase
      .channel(`waiter-mobile-orders-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => {
          fetchPortalData({ silent: true })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isAuthenticated, restaurantId, fetchPortalData])

  useEffect(() => {
    if (!isAuthenticated) return undefined

    const refresh = () => {
      if (document.visibilityState === 'visible') {
        fetchPortalData({ silent: true })
      }
    }

    const intervalId = window.setInterval(refresh, 5000)

    window.addEventListener('online', refresh)
    document.addEventListener('visibilitychange', refresh)

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener('online', refresh)
      document.removeEventListener('visibilitychange', refresh)
    }
  }, [isAuthenticated, fetchPortalData])

  useEffect(() => {
    if (
      readyOrders.length > 0 &&
      soundEnabledRef.current
    ) {
      startAlarm()
    }

    if (readyOrders.length === 0) {
      stopAlarm()
    }
  }, [readyOrders.length, startAlarm, stopAlarm])

  useEffect(() => {
    const recoverAudio = () => {
      if (
        soundEnabledRef.current &&
        readyOrders.length > 0 &&
        !alarmActiveRef.current
      ) {
        startAlarm()
      }
    }

    window.addEventListener('focus', recoverAudio)
    document.addEventListener(
      'visibilitychange',
      recoverAudio
    )

    return () => {
      window.removeEventListener('focus', recoverAudio)
      document.removeEventListener(
        'visibilitychange',
        recoverAudio
      )
    }
  }, [readyOrders.length, startAlarm])

  useEffect(() => {
    return () => {
      if (alarmAudioRef.current) {
        try {
          alarmAudioRef.current.pause()
          alarmAudioRef.current.currentTime = 0
        } catch {}
      }
    }
  }, [])

  // =========================================================
  // HANDOVER
  // =========================================================

  const handleHandover = async (orderId) => {
    if (!orderId || !restaurantId) return

    try {
      let response

      if (
        sessionModeRef.current &&
        sessionTokenRef.current
      ) {
        response = await supabase.rpc(
          'waiter_update_order_status_session',
          {
            p_session_token: sessionTokenRef.current,
            p_order_id: String(orderId),
            p_new_status: 'completed',
          }
        )
      } else {
        response = await supabase.rpc(
          'staff_update_order_status',
          {
            p_restaurant_id: String(restaurantId),
            p_restaurant_code: String(
              restaurantCodeRef.current
            ).trim(),
            p_user_id: String(userIdRef.current)
              .trim()
              .toLowerCase(),
            p_password: String(
              passwordRef.current
            ).trim(),
            p_role: 'waiter',
            p_order_id: String(orderId),
            p_new_status: 'completed',
          }
        )
      }

      const { data, error } = response

      if (error) throw error

      if (!data?.success) {
        throw new Error(
          data?.message || 'Unable to record handover.'
        )
      }

      setReadyOrders((current) =>
        current.filter(
          (order) => String(order.id) !== String(orderId)
        )
      )

      if (readyOrders.length <= 1) {
        stopAlarm()
      }

      notify('Order handed over successfully.')
    } catch (error) {
      console.error(
        '[WAITER MOBILE] Handover error:',
        error
      )

      alert(
        `Unable to record handover: ${
          error?.message || 'Please try again.'
        }`
      )
    }
  }

  // =========================================================
  // CART / DIRECT ORDER
  // =========================================================

  const addToCart = (item) => {
    if (item?.is_available === false) return

    setCart((current) => {
      const existing = current.find(
        (cartItem) =>
          String(cartItem.id) === String(item.id)
      )

      if (existing) {
        return current.map((cartItem) =>
          String(cartItem.id) === String(item.id)
            ? {
                ...cartItem,
                qty: Number(cartItem.qty || 0) + 1,
              }
            : cartItem
        )
      }

      return [
        ...current,
        {
          ...item,
          qty: 1,
        },
      ]
    })
  }

  const changeCartQty = (itemId, delta) => {
    setCart((current) =>
      current
        .map((item) =>
          String(item.id) === String(itemId)
            ? {
                ...item,
                qty: Math.max(
                  0,
                  Number(item.qty || 0) + delta
                ),
              }
            : item
        )
        .filter((item) => Number(item.qty || 0) > 0)
    )
  }

  const cartCount = useMemo(
    () =>
      cart.reduce(
        (total, item) =>
          total + Number(item.qty || 0),
        0
      ),
    [cart]
  )

  const cartTotal = useMemo(
    () =>
      cart.reduce(
        (total, item) =>
          total +
          Number(item.price || 0) *
            Number(item.qty || 0),
        0
      ),
    [cart]
  )

  const handlePlaceOrder = async () => {
    if (!cart.length || placingOrder) return

    setPlacingOrder(true)

    try {
      let response

      if (
        sessionModeRef.current &&
        sessionTokenRef.current
      ) {
        response = await supabase.rpc(
          'waiter_place_direct_order_session',
          {
            p_session_token: sessionTokenRef.current,
            p_table_number: String(tableNumber),
            p_items: cart,
            p_total_amount: cartTotal,
          }
        )
      } else {
        response = await supabase.rpc(
          'waiter_place_direct_order',
          {
            p_restaurant_id: String(restaurantId),
            p_restaurant_code: String(
              restaurantCodeRef.current
            ).trim(),
            p_user_id: String(userIdRef.current)
              .trim()
              .toLowerCase(),
            p_password: String(
              passwordRef.current
            ).trim(),
            p_table_number: String(tableNumber),
            p_items: cart,
            p_total_amount: cartTotal,
          }
        )
      }

      const { data, error } = response

      if (error) throw error

      if (!data?.success) {
        throw new Error(
          data?.message ||
            'Unable to send order to kitchen.'
        )
      }

      setCart([])
      setShowCart(false)
      setActiveTab('home')

      notify('Order sent to kitchen.')
    } catch (error) {
      console.error(
        '[WAITER MOBILE] Direct order error:',
        error
      )

      alert(
        `Unable to send order to kitchen: ${
          error?.message || 'Please try again.'
        }`
      )
    } finally {
      setPlacingOrder(false)
    }
  }

  // =========================================================
  // LOGOUT
  // =========================================================

  const handleLogout = () => {
    stopAlarm()

    const returnRestaurantCode = String(
      restaurantCodeRef.current ||
        restaurantCode ||
        ''
    )
      .replace(/\D/g, '')
      .slice(0, 5)

    // Remove the secure staff session created by /app.
    clearSavedWaiterSession()

    sessionTokenRef.current = ''
    sessionModeRef.current = false
    restaurantCodeRef.current = ''
    userIdRef.current = ''
    passwordRef.current = ''

    soundEnabledRef.current = false

    setSessionToken('')
    setSessionMode(false)
    setSoundEnabled(false)
    setRestaurantCode('')
    setRestaurantName('')
    setUserId('')
    setPassword('')
    setWaiterName('')
    setMenuItems([])
    setReadyOrders([])
    setCart([])
    setShowCart(false)
    setActiveTab('home')
    setIsAuthenticated(false)

    // Return to /app and automatically reopen the same restaurant.
    router.replace(
      returnRestaurantCode
        ? `/app?code=${encodeURIComponent(
            returnRestaurantCode
          )}`
        : '/app'
    )
  }

  // =========================================================
  // FILTERED MENU
  // =========================================================

  const filteredMenuItems = useMemo(() => {
    const search = menuSearch.trim().toLowerCase()

    return menuItems.filter((item) => {
      if (item?.is_available === false) return false
      if (!search) return true

      return [
        item?.name,
        item?.category,
        item?.description,
      ].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(search)
      )
    })
  }, [menuItems, menuSearch])

  // =========================================================
  // SESSION CHECK
  // =========================================================

  if (sessionChecking) {
    return (
      <main className="flex min-h-[100dvh] w-full max-w-full items-center justify-center overflow-x-hidden bg-neutral-950 p-4 text-neutral-100">
        <div className="w-full max-w-sm rounded-[28px] border border-neutral-800 bg-neutral-900 p-7 text-center shadow-2xl">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-neutral-800 border-t-orange-500" />

          <h1 className="mt-5 text-lg font-black">
            Opening Waiter App
          </h1>

          <p className="mt-2 text-xs leading-relaxed text-neutral-500">
            Checking your Digital Dine staff session...
          </p>
        </div>
      </main>
    )
  }

  // =========================================================
  // MANUAL LOGIN
  // =========================================================

  if (!isAuthenticated) {
    return (
      <main className="flex min-h-[100dvh] w-full max-w-full items-center justify-center overflow-x-hidden bg-neutral-950 p-4 text-neutral-100">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm space-y-4 rounded-[30px] border border-neutral-800 bg-neutral-900 p-6 shadow-2xl"
        >
          <div className="pb-2 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-orange-500/10 text-3xl">
              🧑‍🍳
            </div>

            <p className="mt-4 text-[10px] font-black uppercase tracking-[0.22em] text-orange-400">
              Digital Dine Staff
            </p>

            <h1 className="mt-2 text-2xl font-black">
              Waiter Sign In
            </h1>

            <p className="mt-2 text-xs text-neutral-500">
              Use your restaurant staff credentials.
            </p>
          </div>

          <input
            type="text"
            inputMode="numeric"
            maxLength={5}
            value={restaurantCode}
            onChange={(event) =>
              setRestaurantCode(
                event.target.value
                  .replace(/\D/g, '')
                  .slice(0, 5)
              )
            }
            placeholder="5-digit Restaurant Code"
            required
            className="w-full rounded-2xl border border-orange-500/30 bg-neutral-950 px-4 py-3.5 text-sm font-mono tracking-widest text-white outline-none focus:border-orange-500"
          />

          <input
            type="text"
            value={userId}
            onChange={(event) =>
              setUserId(event.target.value)
            }
            placeholder="Waiter User ID"
            autoComplete="username"
            required
            className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3.5 text-sm text-white outline-none focus:border-orange-500"
          />

          <input
            type="password"
            value={password}
            onChange={(event) =>
              setPassword(event.target.value)
            }
            placeholder="Password / PIN"
            autoComplete="current-password"
            required
            className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3.5 text-sm text-white outline-none focus:border-orange-500"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl bg-orange-500 py-3.5 text-sm font-black text-white shadow-lg shadow-orange-500/20 disabled:opacity-50"
          >
            {loading
              ? 'Signing in...'
              : 'Open Waiter App'}
          </button>
        </form>
      </main>
    )
  }

  // =========================================================
  // MOBILE APP
  // =========================================================

  return (
    <main className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-neutral-950 text-neutral-100">
      <div className="mx-auto min-h-[100dvh] w-full max-w-[480px] overflow-x-hidden bg-neutral-950 pb-[calc(6.75rem+env(safe-area-inset-bottom))]">
        {/* HEADER */}
        <header className="sticky top-0 z-40 w-full border-b border-neutral-800/90 bg-neutral-950/95 px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl sm:px-4">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[10px] font-black uppercase tracking-[0.18em] text-orange-400">
                Digital Dine · Waiter
              </p>

              <h1 className="mt-1 truncate text-lg font-black text-white">
                {restaurantName ||
                  'Restaurant Service'}
              </h1>

              <p className="mt-0.5 truncate text-[11px] text-neutral-500">
                {waiterName || userId}
                {restaurantCode
                  ? ` · Code ${restaurantCode}`
                  : ''}
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                fetchPortalData()
              }
              disabled={loading}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-900 text-base disabled:opacity-50"
              aria-label="Refresh waiter app"
            >
              {loading ? '…' : '↻'}
            </button>
          </div>

          <div className="mt-3 flex min-w-0 items-center gap-2">
            {!alarmSettingEnabled ? (
              <div className="min-w-0 flex-1 rounded-2xl border border-neutral-700 bg-neutral-900 px-3 py-2.5 text-center text-[10px] font-black uppercase text-neutral-500">
                🔕 Alarm disabled by Owner
              </div>
            ) : !soundEnabled ? (
              <button
                type="button"
                onClick={enableAlarmSound}
                className="min-w-0 flex-1 rounded-2xl border border-orange-500/30 bg-orange-500/10 px-3 py-2.5 text-[10px] font-black uppercase text-orange-300"
              >
                🔊 Enable order alarm
              </button>
            ) : (
              <div
                className={`min-w-0 flex-1 rounded-2xl border px-3 py-2.5 text-center text-[10px] font-black uppercase ${
                  alarmActive
                    ? 'border-red-500/40 bg-red-500/15 text-red-300'
                    : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-300'
                }`}
              >
                {alarmActive
                  ? '🚨 Ready order alarm'
                  : '🔊 Alarm enabled'}
              </div>
            )}

            <div className="shrink-0 rounded-2xl border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-center">
              <p className="text-[9px] font-black uppercase text-neutral-500">
                Ready
              </p>
              <p className="text-sm font-black text-emerald-400">
                {readyOrders.length}
              </p>
            </div>
          </div>
        </header>

        {/* NOTICE */}
        {notice && (
          <div className="fixed left-1/2 top-[calc(env(safe-area-inset-top)+5.25rem)] z-[70] w-[calc(100svw-1rem)] max-w-[448px] -translate-x-1/2 rounded-2xl border border-emerald-500/20 bg-emerald-600 px-4 py-3 text-center text-xs font-bold text-white shadow-2xl">
            {notice}
          </div>
        )}

        {/* ALARM BANNER */}
        {alarmActive &&
          readyOrders.length > 0 && (
            <div className="mx-3 mt-3 rounded-3xl border-2 border-red-500 bg-red-950/50 p-4 text-center shadow-lg shadow-red-500/10">
              <p className="text-lg font-black text-red-300">
                🚨 ORDER READY
              </p>
              <p className="mt-1 text-[11px] text-red-200/80">
                Handover all ready orders to stop the alarm.
              </p>
            </div>
          )}

        <div className="min-w-0 space-y-4 px-3 py-4 sm:px-4">
          {/* HOME */}
          {activeTab === 'home' && (
            <>
              <section className="overflow-hidden rounded-[28px] border border-orange-500/20 bg-gradient-to-br from-orange-500/15 via-neutral-900 to-neutral-900 p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-400">
                  Service Dashboard
                </p>

                <h2 className="mt-2 text-2xl font-black text-white">
                  Good service starts here.
                </h2>

                <p className="mt-2 text-xs leading-relaxed text-neutral-400">
                  Take table orders, send them to kitchen, and hand over ready orders from one mobile screen.
                </p>

                <div className="mt-5 grid grid-cols-3 gap-2">
                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-3 text-center">
                    <p className="text-xl font-black text-white">
                      {menuItems.length}
                    </p>
                    <p className="mt-1 text-[9px] font-black uppercase text-neutral-500">
                      Menu
                    </p>
                  </div>

                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-3 text-center">
                    <p className="text-xl font-black text-orange-400">
                      {cartCount}
                    </p>
                    <p className="mt-1 text-[9px] font-black uppercase text-neutral-500">
                      Cart
                    </p>
                  </div>

                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950/80 p-3 text-center">
                    <p className="text-xl font-black text-emerald-400">
                      {readyOrders.length}
                    </p>
                    <p className="mt-1 text-[9px] font-black uppercase text-neutral-500">
                      Ready
                    </p>
                  </div>
                </div>
              </section>

              {readyOrders.length > 0 ? (
                <section className="space-y-3">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
                        Kitchen Ready
                      </p>
                      <h3 className="mt-1 text-lg font-black">
                        Orders to hand over
                      </h3>
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        setActiveTab('ready')
                      }
                      className="text-xs font-black text-orange-400"
                    >
                      View all →
                    </button>
                  </div>

                  {readyOrders
                    .slice(0, 2)
                    .map((order) => (
                      <ReadyOrderCard
                        key={order.id}
                        order={order}
                        onHandover={
                          handleHandover
                        }
                      />
                    ))}
                </section>
              ) : (
                <section className="rounded-[28px] border border-neutral-800 bg-neutral-900 p-6 text-center">
                  <div className="text-4xl">
                    ✅
                  </div>
                  <h3 className="mt-3 font-black">
                    No ready orders
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-neutral-500">
                    Kitchen-ready orders will appear here automatically.
                  </p>
                </section>
              )}

              <section className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() =>
                    setActiveTab('order')
                  }
                  className="rounded-[26px] border border-orange-500/20 bg-orange-500/10 p-5 text-left"
                >
                  <div className="text-3xl">
                    📝
                  </div>
                  <p className="mt-4 font-black text-white">
                    Take Order
                  </p>
                  <p className="mt-1 text-[10px] leading-relaxed text-neutral-500">
                    Select table and add menu items.
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    setActiveTab('ready')
                  }
                  className="rounded-[26px] border border-emerald-500/20 bg-emerald-500/10 p-5 text-left"
                >
                  <div className="text-3xl">
                    🍽️
                  </div>
                  <p className="mt-4 font-black text-white">
                    Ready Orders
                  </p>
                  <p className="mt-1 text-[10px] leading-relaxed text-neutral-500">
                    Approve and hand over kitchen orders.
                  </p>
                </button>
              </section>
            </>
          )}

          {/* TAKE ORDER */}
          {activeTab === 'order' && (
            <>
              <section className="rounded-[28px] border border-neutral-800 bg-neutral-900 p-4">
                <div className="flex min-w-0 items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-orange-400">
                      Direct Order
                    </p>
                    <h2 className="mt-1 truncate text-lg font-black">
                      Choose table & dishes
                    </h2>
                  </div>

                  <select
                    value={tableNumber}
                    onChange={(event) =>
                      setTableNumber(
                        event.target.value
                      )
                    }
                    className="max-w-[120px] shrink-0 rounded-2xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-xs font-black text-white outline-none"
                  >
                    {[...Array(15)].map(
                      (_, index) => (
                        <option
                          key={index + 1}
                          value={`Table ${
                            index + 1
                          }`}
                        >
                          Table {index + 1}
                        </option>
                      )
                    )}
                  </select>
                </div>

                <input
                  type="search"
                  value={menuSearch}
                  onChange={(event) =>
                    setMenuSearch(
                      event.target.value
                    )
                  }
                  placeholder="Search menu..."
                  className="mt-4 w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-orange-500"
                />
              </section>

              {filteredMenuItems.length === 0 ? (
                <div className="rounded-[28px] border border-neutral-800 bg-neutral-900 p-8 text-center">
                  <p className="text-3xl">🍽️</p>
                  <p className="mt-3 font-black">
                    No menu items found
                  </p>
                </div>
              ) : (
                <section className="grid grid-cols-2 gap-3">
                  {filteredMenuItems.map(
                    (item) => {
                      const inCart =
                        cart.find(
                          (cartItem) =>
                            String(
                              cartItem.id
                            ) ===
                            String(item.id)
                        )

                      return (
                        <button
                          type="button"
                          key={item.id}
                          onClick={() =>
                            addToCart(item)
                          }
                          className="min-w-0 overflow-hidden rounded-[24px] border border-neutral-800 bg-neutral-900 p-3 text-left active:scale-[0.98]"
                        >
                          {item.image_url ? (
                            <img
                              src={
                                item.image_url
                              }
                              alt={item.name}
                              className="h-24 w-full rounded-2xl object-cover"
                            />
                          ) : (
                            <div className="flex h-24 w-full items-center justify-center rounded-2xl bg-neutral-950 text-3xl">
                              🍴
                            </div>
                          )}

                          <div className="mt-3 min-w-0">
                            <p className="line-clamp-2 min-h-9 text-xs font-black text-white">
                              {item.name}
                            </p>

                            <div className="mt-2 flex items-center justify-between gap-2">
                              <p className="truncate text-xs font-black text-orange-400">
                                {money(
                                  item.price
                                )}
                              </p>

                              {inCart && (
                                <span className="shrink-0 rounded-full bg-orange-500 px-2 py-1 text-[9px] font-black text-white">
                                  ×
                                  {inCart.qty}
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      )
                    }
                  )}
                </section>
              )}

              {cartCount > 0 && (
                <button
                  type="button"
                  onClick={() =>
                    setShowCart(true)
                  }
                  className="sticky bottom-[calc(5.4rem+env(safe-area-inset-bottom))] z-30 flex w-full items-center justify-between gap-3 rounded-2xl bg-orange-500 px-4 py-3.5 text-white shadow-2xl shadow-orange-500/25"
                >
                  <div className="text-left">
                    <p className="text-xs font-black">
                      {cartCount}{' '}
                      {cartCount === 1
                        ? 'item'
                        : 'items'}
                    </p>
                    <p className="text-[10px] text-orange-100">
                      {tableNumber}
                    </p>
                  </div>

                  <p className="text-sm font-black">
                    View Cart ·{' '}
                    {money(cartTotal)}
                  </p>
                </button>
              )}
            </>
          )}

          {/* READY */}
          {activeTab === 'ready' && (
            <section className="space-y-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
                  Kitchen Handover
                </p>

                <h2 className="mt-1 text-xl font-black">
                  Ready Orders
                </h2>

                <p className="mt-1 text-xs text-neutral-500">
                  Tap handover after the food reaches the customer.
                </p>
              </div>

              {readyOrders.length === 0 ? (
                <div className="rounded-[28px] border border-neutral-800 bg-neutral-900 p-8 text-center">
                  <div className="text-4xl">
                    🍽️
                  </div>
                  <h3 className="mt-3 font-black">
                    Nothing waiting
                  </h3>
                  <p className="mt-2 text-xs text-neutral-500">
                    Ready kitchen orders will appear here automatically.
                  </p>
                </div>
              ) : (
                readyOrders.map((order) => (
                  <ReadyOrderCard
                    key={order.id}
                    order={order}
                    onHandover={
                      handleHandover
                    }
                  />
                ))
              )}
            </section>
          )}

          {/* PROFILE */}
          {activeTab === 'profile' && (
            <section className="space-y-4">
              <div className="rounded-[28px] border border-neutral-800 bg-neutral-900 p-5">
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-orange-500/10 text-3xl">
                  👤
                </div>

                <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-orange-400">
                  Waiter Profile
                </p>

                <h2 className="mt-1 text-xl font-black text-white">
                  {waiterName || 'Waiter'}
                </h2>

                <div className="mt-5 space-y-3">
                  <ProfileRow
                    label="Restaurant"
                    value={
                      restaurantName ||
                      'Restaurant'
                    }
                  />

                  <ProfileRow
                    label="Restaurant Code"
                    value={
                      restaurantCode ||
                      '-----'
                    }
                    mono
                  />

                  <ProfileRow
                    label="User ID"
                    value={userId || '—'}
                    mono
                  />

                  <ProfileRow
                    label="Role"
                    value="Waiter"
                  />

                  <ProfileRow
                    label="Login"
                    value={
                      sessionMode
                        ? 'Secure App Session'
                        : 'Manual Login'
                    }
                  />
                </div>

                <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-[10px] leading-relaxed text-neutral-500">
                  🔒 Your password is never displayed or stored by this profile screen.
                </div>
              </div>

              <button
                type="button"
                onClick={handleLogout}
                className="w-full rounded-2xl border border-red-500/20 bg-red-500/10 py-3.5 text-sm font-black text-red-400"
              >
                Log Out
              </button>
            </section>
          )}
        </div>

        {/* CART BOTTOM SHEET */}
        {showCart && (
          <div
            className="fixed inset-0 z-[90] flex min-h-[100dvh] w-full items-end justify-center overflow-x-hidden bg-black/75 backdrop-blur-sm"
            onClick={() =>
              setShowCart(false)
            }
          >
            <div
              className="max-h-[86dvh] w-full max-w-[480px] overflow-y-auto rounded-t-[32px] border border-neutral-800 bg-neutral-900 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-2xl"
              onClick={(event) =>
                event.stopPropagation()
              }
            >
              <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-neutral-700" />

              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-orange-400">
                    Active Ticket
                  </p>
                  <h2 className="mt-1 text-xl font-black">
                    {tableNumber}
                  </h2>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    setShowCart(false)
                  }
                  className="flex h-10 w-10 items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-950 text-neutral-400"
                >
                  ✕
                </button>
              </div>

              <div className="mt-5 space-y-3">
                {cart.map((item) => (
                  <div
                    key={item.id}
                    className="flex min-w-0 items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-neutral-950 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-black text-white">
                        {item.name}
                      </p>

                      <p className="mt-1 text-[10px] font-bold text-orange-400">
                        {money(item.price)} each
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          changeCartQty(
                            item.id,
                            -1
                          )
                        }
                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-800 bg-neutral-900 text-lg font-black"
                      >
                        −
                      </button>

                      <span className="w-5 text-center text-sm font-black">
                        {item.qty}
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          changeCartQty(
                            item.id,
                            1
                          )
                        }
                        className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500 text-lg font-black text-white"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-neutral-400">
                    Total
                  </span>
                  <span className="text-xl font-black text-white">
                    {money(cartTotal)}
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={handlePlaceOrder}
                disabled={
                  placingOrder ||
                  cart.length === 0
                }
                className="mt-4 w-full rounded-2xl bg-orange-500 py-4 text-sm font-black text-white shadow-lg shadow-orange-500/20 disabled:opacity-50"
              >
                {placingOrder
                  ? 'Sending to Kitchen...'
                  : 'Send to Kitchen 🍳'}
              </button>
            </div>
          </div>
        )}

        {/* BOTTOM NAVIGATION */}
        <nav className="fixed bottom-0 left-1/2 z-50 w-[100svw] max-w-[480px] -translate-x-1/2 border-t border-neutral-800 bg-neutral-950/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
          <div className="grid grid-cols-4 gap-1">
            <MobileNavButton
              active={activeTab === 'home'}
              icon="⌂"
              label="Home"
              onClick={() =>
                setActiveTab('home')
              }
            />

            <MobileNavButton
              active={activeTab === 'order'}
              icon="＋"
              label="Order"
              badge={
                cartCount > 0
                  ? cartCount
                  : null
              }
              onClick={() =>
                setActiveTab('order')
              }
            />

            <MobileNavButton
              active={activeTab === 'ready'}
              icon="✓"
              label="Ready"
              badge={
                readyOrders.length > 0
                  ? readyOrders.length
                  : null
              }
              onClick={() =>
                setActiveTab('ready')
              }
            />

            <MobileNavButton
              active={
                activeTab === 'profile'
              }
              icon="♙"
              label="Profile"
              onClick={() =>
                setActiveTab('profile')
              }
            />
          </div>
        </nav>
      </div>
    </main>
  )
}

function ReadyOrderCard({
  order,
  onHandover,
}) {
  const items = Array.isArray(order?.items)
    ? order.items
    : []

  return (
    <article className="min-w-0 overflow-hidden rounded-[26px] border border-emerald-500/25 bg-neutral-900 p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">
            Ready for Service
          </p>

          <h3 className="mt-1 truncate text-lg font-black text-white">
            {order?.table_number ||
              'Table Order'}
          </h3>

          <p className="mt-1 text-[10px] text-neutral-500">
            Order #
            {order?.order_number ||
              String(order?.id || '').slice(
                0,
                8
              )}
          </p>
        </div>

        <span className="shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[9px] font-black uppercase text-emerald-300">
          Ready
        </span>
      </div>

      <div className="mt-4 space-y-2 rounded-2xl border border-neutral-800 bg-neutral-950 p-3">
        {items.length === 0 ? (
          <p className="text-xs text-neutral-500">
            Order item details unavailable.
          </p>
        ) : (
          items.map((item, index) => (
            <div
              key={`${item?.id || item?.name || 'item'}-${index}`}
              className="flex min-w-0 items-start justify-between gap-3 text-xs"
            >
              <span className="min-w-0 flex-1 text-neutral-300">
                {item?.name || 'Item'}
              </span>

              <span className="shrink-0 font-black text-white">
                ×
                {item?.qty ||
                  item?.quantity ||
                  1}
              </span>
            </div>
          ))
        )}
      </div>

      <button
        type="button"
        onClick={() =>
          onHandover(order.id)
        }
        className="mt-4 w-full rounded-2xl bg-emerald-600 py-3.5 text-xs font-black uppercase tracking-wider text-white active:scale-[0.99]"
      >
        Approve & Handover
      </button>
    </article>
  )
}

function ProfileRow({
  label,
  value,
  mono = false,
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
      <p className="text-[9px] font-black uppercase tracking-widest text-neutral-500">
        {label}
      </p>

      <p
        className={`mt-1 break-all text-sm font-black text-white ${
          mono ? 'font-mono' : ''
        }`}
      >
        {value}
      </p>
    </div>
  )
}

function MobileNavButton({
  active,
  icon,
  label,
  badge,
  onClick,
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative flex min-w-0 flex-col items-center justify-center rounded-2xl px-2 py-2.5 transition ${
        active
          ? 'bg-orange-500/15 text-orange-400'
          : 'text-neutral-500'
      }`}
    >
      <span className="text-lg leading-none">
        {icon}
      </span>

      <span className="mt-1 text-[9px] font-black uppercase tracking-wide">
        {label}
      </span>

      {badge !== null &&
        badge !== undefined && (
          <span className="absolute right-2 top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-black text-white">
            {badge}
          </span>
        )}
    </button>
  )
}
