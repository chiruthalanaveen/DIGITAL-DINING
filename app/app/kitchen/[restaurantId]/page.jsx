'use client'

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

const SESSION_STORAGE_KEY = 'digital-dine-staff-session'

const SOUND_MAP = {
  'kitchen-default': '/sounds/kitchen-default.mp3',
  'kitchen-1': '/sounds/kitchen-1.mp3',
  'kitchen-2': '/sounds/kitchen-2.mp3',
  'kitchen-3': '/sounds/kitchen-3.mp3',
  'kitchen-4': '/sounds/kitchen-4.mp3',
  'kitchen-5': '/sounds/kitchen-5.mp3',
  'kitchen-6': '/sounds/kitchen-6.mp3',
  'kitchen-7': '/sounds/kitchen-7.mp3',
  'kitchen-8': '/sounds/kitchen-8.mp3',
}

const money = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`

function kitchenStatus(status) {
  const value = String(status || '').trim().toLowerCase()

  if (
    ['paid', 'confirmed', 'placed', 'order_placed', 'new'].includes(value)
  ) {
    return 'pending'
  }

  if (
    ['completed', 'delivered', 'served', 'delivered_by_waiter'].includes(value)
  ) {
    return 'completed'
  }

  return value || 'pending'
}

function isFinished(status) {
  return [
    'completed',
    'delivered',
    'served',
    'delivered_by_waiter',
    'cancelled',
    'canceled',
  ].includes(String(status || '').trim().toLowerCase())
}

function orderNumber(order) {
  return (
    order?.order_number ??
    order?.daily_order_number ??
    order?.orderNo ??
    String(order?.id || '').slice(-6)
  )
}

export default function KitchenMobileApp({ params }) {
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

  const [orders, setOrders] = useState([])
  const [todayOrders, setTodayOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [updatingOrder, setUpdatingOrder] = useState(null)

  const [activeTab, setActiveTab] = useState('queue')
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [isConnected, setIsConnected] = useState(false)
  const [notice, setNotice] = useState('')
  const [currentTime, setCurrentTime] = useState(Date.now())

  const [alarmSoundUrl, setAlarmSoundUrl] = useState(
    SOUND_MAP['kitchen-default']
  )
  const [alarmEnabled, setAlarmEnabled] = useState(true)
  const [alarmVolume, setAlarmVolume] = useState(1)
  const [alarmUnlocked, setAlarmUnlocked] = useState(false)

  const sessionTokenRef = useRef('')
  const sessionModeRef = useRef(false)
  const restaurantCodeRef = useRef('')
  const userIdRef = useRef('')
  const passwordRef = useRef('')
  const audioRef = useRef(null)
  const knownOrderIdsRef = useRef(new Set())
  const firstSnapshotRef = useRef(true)

  const notify = useCallback((message) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3000)
  }, [])

  const clearSavedSession = useCallback(() => {
    if (typeof window === 'undefined') return

    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY)
      if (!raw) return

      const saved = JSON.parse(raw)

      if (
        String(saved?.role || '').toLowerCase() === 'kitchen' &&
        String(saved?.restaurantId || '') === String(restaurantId)
      ) {
        localStorage.removeItem(SESSION_STORAGE_KEY)
      }
    } catch {
      localStorage.removeItem(SESSION_STORAGE_KEY)
    }
  }, [restaurantId])

  const getAgeMinutes = useCallback(
    (createdAt) => {
      if (!createdAt) return 0

      const created = new Date(createdAt).getTime()
      if (!Number.isFinite(created)) return 0

      return Math.max(
        0,
        Math.floor((currentTime - created) / 60000)
      )
    },
    [currentTime]
  )

  const unlockAlarm = async () => {
    if (!alarmEnabled) {
      setAlarmUnlocked(true)
      return
    }

    try {
      const audio = new Audio(alarmSoundUrl)
      audio.preload = 'auto'
      audio.volume = Math.min(
        1,
        Math.max(0, Number(alarmVolume) || 0)
      )
      audio.muted = true

      await audio.play()

      audio.pause()
      audio.currentTime = 0
      audio.muted = false

      audioRef.current = audio
      setAlarmUnlocked(true)
      notify('Kitchen alarm enabled.')
    } catch (error) {
      console.warn('[KITCHEN MOBILE] Alarm unlock warning:', error)
      setAlarmUnlocked(true)
      notify('Alarm enabled. Phone audio rules may still apply.')
    }
  }

  const playAlarm = useCallback(async () => {
    if (!alarmEnabled || !alarmUnlocked) return

    try {
      let audio = audioRef.current

      if (!audio) {
        audio = new Audio(alarmSoundUrl)
        audio.preload = 'auto'
        audioRef.current = audio
      }

      audio.src = alarmSoundUrl
      audio.volume = Math.min(
        1,
        Math.max(0, Number(alarmVolume) || 0)
      )
      audio.currentTime = 0

      await audio.play()
    } catch (error) {
      console.warn('[KITCHEN MOBILE] Alarm playback blocked:', error)
    }
  }, [alarmEnabled, alarmUnlocked, alarmSoundUrl, alarmVolume])

  const applySnapshot = useCallback(
    (data, announceNew = true) => {
      const restaurant = data?.restaurant || {}

      if (restaurant?.name) {
        setRestaurantName(String(restaurant.name))
      }

      const soundKey =
        restaurant?.kitchen_alarm_sound || 'kitchen-default'

      setAlarmSoundUrl(
        SOUND_MAP[soundKey] || SOUND_MAP['kitchen-default']
      )
      setAlarmEnabled(
        restaurant?.kitchen_alarm_enabled ?? true
      )
      setAlarmVolume(
        Math.min(
          1,
          Math.max(
            0,
            Number(
              restaurant?.kitchen_alarm_volume ?? 1
            )
          )
        )
      )

      const allRows = Array.isArray(data?.orders)
        ? data.orders
        : []

      const sortedAll = [...allRows].sort(
        (a, b) =>
          new Date(b?.created_at || 0).getTime() -
          new Date(a?.created_at || 0).getTime()
      )

      const activeRows = sortedAll
        .filter((order) => !isFinished(order?.status))
        .sort(
          (a, b) =>
            new Date(a?.created_at || 0).getTime() -
            new Date(b?.created_at || 0).getTime()
        )

      const todayKey = new Date().toDateString()

      const todayRows = sortedAll.filter((order) => {
        if (!order?.created_at) return false
        const date = new Date(order.created_at)
        return (
          Number.isFinite(date.getTime()) &&
          date.toDateString() === todayKey
        )
      })

      if (announceNew && !firstSnapshotRef.current) {
        const newRows = activeRows.filter((order) => {
          const id = String(order?.id || '')
          return id && !knownOrderIdsRef.current.has(id)
        })

        if (newRows.length > 0) {
          const newest = newRows[newRows.length - 1]
          notify(
            `🔔 New order #${orderNumber(newest)} · ${
              newest?.table_number || 'Takeaway'
            }`
          )
          playAlarm()
        }
      }

      activeRows.forEach((order) => {
        const id = String(order?.id || '')
        if (id) knownOrderIdsRef.current.add(id)
      })

      firstSnapshotRef.current = false
      setOrders(activeRows)
      setTodayOrders(todayRows)
    },
    [notify, playAlarm]
  )

  const fetchKitchenData = useCallback(
    async ({ silent = false, announceNew = true } = {}) => {
      if (!restaurantId) return

      const usingSession = Boolean(
        sessionModeRef.current &&
          sessionTokenRef.current
      )

      const code = String(
        restaurantCodeRef.current || ''
      ).trim()

      const kitchenUser = String(
        userIdRef.current || ''
      )
        .trim()
        .toLowerCase()

      const kitchenPassword = String(
        passwordRef.current || ''
      ).trim()

      if (
        !usingSession &&
        (!code || !kitchenUser || !kitchenPassword)
      ) {
        return
      }

      if (!silent) setLoading(true)

      try {
        let response

        if (usingSession) {
          response = await supabase.rpc(
            'get_kitchen_portal_data_session',
            {
              p_session_token:
                sessionTokenRef.current,
            }
          )
        } else {
          response = await supabase.rpc(
            'get_kitchen_portal_data',
            {
              p_restaurant_id:
                String(restaurantId),
              p_restaurant_code: code,
              p_user_id: kitchenUser,
              p_password: kitchenPassword,
            }
          )
        }

        const { data, error } = response

        if (error) throw error

        if (!data?.success) {
          if (usingSession) {
            clearSavedSession()
            sessionTokenRef.current = ''
            sessionModeRef.current = false
            setSessionToken('')
            setSessionMode(false)
            setIsAuthenticated(false)
          }

          throw new Error(
            data?.message ||
              'Unable to load kitchen orders.'
          )
        }

        if (
          data?.restaurantId &&
          String(data.restaurantId) !==
            String(restaurantId)
        ) {
          throw new Error(
            'This kitchen session belongs to another restaurant.'
          )
        }

        applySnapshot(data, announceNew)
      } catch (error) {
        console.error(
          '[KITCHEN MOBILE] Snapshot error:',
          error
        )

        if (!silent) {
          setNotice(
            error?.message ||
              'Unable to refresh kitchen.'
          )
        }
      } finally {
        if (!silent) setLoading(false)
      }
    },
    [
      restaurantId,
      clearSavedSession,
      applySnapshot,
    ]
  )

  const handleLogin = async (event) => {
    event.preventDefault()

    if (
      !restaurantId ||
      !restaurantCode.trim() ||
      !userId.trim() ||
      !password.trim()
    ) {
      alert(
        'Enter the 5-digit Restaurant Code, Kitchen User ID, and password.'
      )
      return
    }

    setLoading(true)

    try {
      await unlockAlarm()

      const cleanCode =
        String(restaurantCode).trim()

      const cleanUser = String(userId)
        .trim()
        .toLowerCase()

      const cleanPassword =
        String(password).trim()

      const { data, error } = await supabase.rpc(
        'authenticate_staff_login',
        {
          p_restaurant_id:
            String(restaurantId),
          p_restaurant_code: cleanCode,
          p_user_id: cleanUser,
          p_password: cleanPassword,
          p_role: 'kitchen',
        }
      )

      if (error) throw error

      if (!data?.success) {
        throw new Error(
          data?.message ||
            'Invalid restaurant credentials.'
        )
      }

      if (
        String(data.restaurantId) !==
        String(restaurantId)
      ) {
        throw new Error(
          'These credentials do not belong to this restaurant.'
        )
      }

      sessionTokenRef.current = ''
      sessionModeRef.current = false
      restaurantCodeRef.current = String(
        data?.restaurantCode || cleanCode
      ).trim()
      userIdRef.current = cleanUser
      passwordRef.current = cleanPassword

      setSessionToken('')
      setSessionMode(false)
      setRestaurantCode(
        restaurantCodeRef.current
      )
      setUserId(cleanUser)
      setIsAuthenticated(true)

      await fetchKitchenData({
        announceNew: false,
      })
    } catch (error) {
      console.error(
        '[KITCHEN MOBILE] Login error:',
        error
      )
      setIsAuthenticated(false)
      alert(error?.message || 'Unable to sign in.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    let active = true

    const restoreSession = async () => {
      if (typeof window === 'undefined') return

      try {
        const raw = localStorage.getItem(
          SESSION_STORAGE_KEY
        )

        if (!raw) return

        let saved

        try {
          saved = JSON.parse(raw)
        } catch {
          clearSavedSession()
          return
        }

        const role = String(saved?.role || '')
          .trim()
          .toLowerCase()

        const savedRestaurantId = String(
          saved?.restaurantId || ''
        ).trim()

        const token = String(
          saved?.sessionToken || ''
        ).trim()

        if (
          role !== 'kitchen' ||
          savedRestaurantId !==
            String(restaurantId)
        ) {
          return
        }

        if (!token) {
          clearSavedSession()
          return
        }

        const { data, error } = await supabase.rpc(
          'validate_staff_app_session',
          {
            p_session_token: token,
            p_required_role: 'kitchen',
          }
        )

        if (error) throw error

        if (!data?.success) {
          throw new Error(
            data?.message ||
              'Kitchen session expired.'
          )
        }

        if (
          String(data.restaurantId) !==
          String(restaurantId)
        ) {
          throw new Error(
            'This kitchen session belongs to another restaurant.'
          )
        }

        if (!active) return

        const code = String(
          data?.restaurantCode ||
            saved?.restaurantCode ||
            ''
        ).trim()

        const restoredUser = String(
          data?.userId || saved?.userId || ''
        )
          .trim()
          .toLowerCase()

        sessionTokenRef.current = token
        sessionModeRef.current = true
        restaurantCodeRef.current = code
        userIdRef.current = restoredUser
        passwordRef.current = ''

        setSessionToken(token)
        setSessionMode(true)
        setRestaurantCode(code)
        setRestaurantName(
          String(saved?.restaurantName || '')
        )
        setUserId(restoredUser)
        setPassword('')
        setIsAuthenticated(true)

        await fetchKitchenData({
          announceNew: false,
        })
      } catch (error) {
        console.error(
          '[KITCHEN MOBILE] Session restore error:',
          error
        )

        clearSavedSession()
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
    clearSavedSession,
    fetchKitchenData,
  ])

  useEffect(() => {
    if (!isAuthenticated || !restaurantId) {
      return undefined
    }

    const channel = supabase
      .channel(
        `kitchen-mobile-${restaurantId}`
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => {
          fetchKitchenData({
            silent: true,
            announceNew: true,
          })
        }
      )
      .subscribe((status) => {
        setIsConnected(
          status === 'SUBSCRIBED'
        )
      })

    return () => {
      setIsConnected(false)
      supabase.removeChannel(channel)
    }
  }, [
    isAuthenticated,
    restaurantId,
    fetchKitchenData,
  ])

  useEffect(() => {
    if (!isAuthenticated) return undefined

    const refresh = () => {
      if (document.visibilityState === 'visible') {
        fetchKitchenData({
          silent: true,
          announceNew: true,
        })
      }
    }

    const intervalId =
      window.setInterval(refresh, 5000)

    window.addEventListener('online', refresh)
    document.addEventListener(
      'visibilitychange',
      refresh
    )

    return () => {
      window.clearInterval(intervalId)
      window.removeEventListener(
        'online',
        refresh
      )
      document.removeEventListener(
        'visibilitychange',
        refresh
      )
    }
  }, [isAuthenticated, fetchKitchenData])

  useEffect(() => {
    if (!isAuthenticated) return undefined

    const intervalId = window.setInterval(
      () => setCurrentTime(Date.now()),
      1000
    )

    return () =>
      window.clearInterval(intervalId)
  }, [isAuthenticated])

  const setOrderStatus = async (
    orderId,
    newStatus
  ) => {
    if (
      !orderId ||
      !newStatus ||
      updatingOrder
    ) {
      return
    }

    setUpdatingOrder(String(orderId))

    try {
      let response

      if (
        sessionModeRef.current &&
        sessionTokenRef.current
      ) {
        response = await supabase.rpc(
          'kitchen_update_order_status_session',
          {
            p_session_token:
              sessionTokenRef.current,
            p_order_id: String(orderId),
            p_new_status:
              String(newStatus),
          }
        )
      } else {
        response = await supabase.rpc(
          'staff_update_order_status',
          {
            p_restaurant_id:
              String(restaurantId),
            p_restaurant_code: String(
              restaurantCodeRef.current
            ).trim(),
            p_user_id: String(
              userIdRef.current
            )
              .trim()
              .toLowerCase(),
            p_password: String(
              passwordRef.current
            ).trim(),
            p_role: 'kitchen',
            p_order_id: String(orderId),
            p_new_status:
              String(newStatus),
          }
        )
      }

      const { data, error } = response

      if (error) throw error

      if (!data?.success) {
        throw new Error(
          data?.message ||
            'Unable to update order.'
        )
      }

      const updatedOrder =
        data?.order || null

      setOrders((current) =>
        current
          .map((order) =>
            String(order.id) ===
            String(orderId)
              ? updatedOrder || {
                  ...order,
                  status: newStatus,
                }
              : order
          )
          .filter(
            (order) =>
              !isFinished(order?.status)
          )
      )

      setTodayOrders((current) =>
        current.map((order) =>
          String(order.id) ===
          String(orderId)
            ? updatedOrder || {
                ...order,
                status: newStatus,
              }
            : order
        )
      )

      notify(
        newStatus === 'preparing'
          ? 'Order moved to preparing.'
          : newStatus === 'ready'
            ? 'Order marked ready for waiter.'
            : 'Order updated.'
      )
    } catch (error) {
      console.error(
        '[KITCHEN MOBILE] Status error:',
        error
      )

      alert(
        `Unable to update order: ${
          error?.message || 'Please try again.'
        }`
      )
    } finally {
      setUpdatingOrder(null)
    }
  }

  const handleLogout = () => {
    if (sessionModeRef.current) {
      clearSavedSession()
    }

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
    setOrders([])
    setTodayOrders([])
    setIsAuthenticated(false)
    setActiveTab('queue')
  }

  const filteredOrders = useMemo(() => {
    const term = search.trim().toLowerCase()

    return orders.filter((order) => {
      const status = kitchenStatus(
        order?.status
      )

      if (
        statusFilter !== 'all' &&
        status !== statusFilter
      ) {
        return false
      }

      if (!term) return true

      const itemText = Array.isArray(
        order?.items
      )
        ? order.items
            .map((item) =>
              [
                item?.name,
                item?.item_name,
                item?.notes,
                item?.note,
                item?.special_instructions,
              ]
                .filter(Boolean)
                .join(' ')
            )
            .join(' ')
            .toLowerCase()
        : ''

      return [
        order?.table_number,
        order?.id,
        orderNumber(order),
        itemText,
      ].some((value) =>
        String(value || '')
          .toLowerCase()
          .includes(term)
      )
    })
  }, [orders, search, statusFilter])

  const pendingCount = orders.filter(
    (order) =>
      kitchenStatus(order?.status) ===
      'pending'
  ).length

  const preparingCount = orders.filter(
    (order) =>
      kitchenStatus(order?.status) ===
      'preparing'
  ).length

  const readyCount = orders.filter(
    (order) =>
      kitchenStatus(order?.status) ===
      'ready'
  ).length

  const deliveredToday =
    todayOrders.filter((order) =>
      isFinished(order?.status)
    ).length

  if (sessionChecking) {
    return (
      <main className="flex min-h-[100dvh] w-full max-w-full items-center justify-center overflow-x-hidden bg-neutral-950 p-4 text-neutral-100">
        <div className="w-full max-w-sm rounded-[28px] border border-neutral-800 bg-neutral-900 p-7 text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-neutral-800 border-t-red-500" />
          <h1 className="mt-5 text-lg font-black">
            Opening Kitchen App
          </h1>
          <p className="mt-2 text-xs text-neutral-500">
            Checking your secure staff session...
          </p>
        </div>
      </main>
    )
  }

  if (!isAuthenticated) {
    return (
      <main className="flex min-h-[100dvh] w-full max-w-full items-center justify-center overflow-x-hidden bg-neutral-950 p-4 text-neutral-100">
        <form
          onSubmit={handleLogin}
          className="w-full max-w-sm space-y-4 rounded-[30px] border border-neutral-800 bg-neutral-900 p-6 shadow-2xl"
        >
          <div className="text-center">
            <div className="text-5xl">🍳</div>
            <p className="mt-4 text-[10px] font-black uppercase tracking-[0.2em] text-red-400">
              Digital Dine KDS
            </p>
            <h1 className="mt-2 text-2xl font-black">
              Kitchen Sign In
            </h1>
          </div>

          <input
            value={restaurantCode}
            onChange={(event) =>
              setRestaurantCode(
                event.target.value
                  .replace(/\D/g, '')
                  .slice(0, 5)
              )
            }
            inputMode="numeric"
            maxLength={5}
            placeholder="5-digit Restaurant Code"
            required
            className="w-full rounded-2xl border border-red-500/30 bg-neutral-950 px-4 py-3.5 text-sm font-mono tracking-widest outline-none focus:border-red-500"
          />

          <input
            value={userId}
            onChange={(event) =>
              setUserId(event.target.value)
            }
            placeholder="Kitchen User ID"
            autoComplete="username"
            required
            className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3.5 text-sm outline-none focus:border-red-500"
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
            className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3.5 text-sm outline-none focus:border-red-500"
          />

          <button
            disabled={loading}
            className="w-full rounded-2xl bg-red-600 py-3.5 text-sm font-black text-white disabled:opacity-50"
          >
            {loading
              ? 'Opening Kitchen...'
              : 'Open Kitchen App'}
          </button>
        </form>
      </main>
    )
  }

  return (
    <main className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-neutral-950 text-neutral-100">
      <div className="mx-auto min-h-[100dvh] w-full max-w-[480px] overflow-x-hidden bg-neutral-950 pb-[calc(6.75rem+env(safe-area-inset-bottom))]">
        <header className="sticky top-0 z-40 border-b border-neutral-800/90 bg-neutral-950/95 px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-[10px] font-black uppercase tracking-[0.18em] text-red-400">
                Digital Dine · Kitchen
              </p>
              <h1 className="mt-1 truncate text-lg font-black">
                {restaurantName ||
                  'Kitchen Display'}
              </h1>
              <div className="mt-1 flex items-center gap-2">
                <span
                  className={`h-2 w-2 rounded-full ${
                    isConnected
                      ? 'bg-emerald-400'
                      : 'bg-red-400'
                  }`}
                />
                <span className="text-[10px] font-bold text-neutral-500">
                  {isConnected
                    ? 'Live'
                    : 'Reconnect mode'}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() =>
                fetchKitchenData({
                  announceNew: false,
                })
              }
              disabled={loading}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-900 text-base"
            >
              {loading ? '…' : '↻'}
            </button>
          </div>

          <div className="mt-3 grid grid-cols-4 gap-2">
            <MiniStat
              label="Active"
              value={orders.length}
            />
            <MiniStat
              label="New"
              value={pendingCount}
              tone="yellow"
            />
            <MiniStat
              label="Cooking"
              value={preparingCount}
              tone="orange"
            />
            <MiniStat
              label="Ready"
              value={readyCount}
              tone="green"
            />
          </div>
        </header>

        {notice && (
          <div className="fixed left-1/2 top-[calc(env(safe-area-inset-top)+5rem)] z-[70] w-[calc(100svw-1rem)] max-w-[448px] -translate-x-1/2 rounded-2xl bg-red-600 px-4 py-3 text-center text-xs font-bold text-white shadow-2xl">
            {notice}
          </div>
        )}

        {!alarmUnlocked && alarmEnabled && (
          <div className="mx-3 mt-3 rounded-2xl border border-red-500/30 bg-red-500/10 p-3">
            <button
              type="button"
              onClick={unlockAlarm}
              className="w-full rounded-xl bg-red-600 py-3 text-xs font-black uppercase text-white"
            >
              🔔 Enable Kitchen Alarm
            </button>
          </div>
        )}

        <div className="min-w-0 space-y-4 px-3 py-4">
          {activeTab === 'queue' && (
            <>
              <section className="rounded-[26px] border border-neutral-800 bg-neutral-900 p-3">
                <input
                  type="search"
                  value={search}
                  onChange={(event) =>
                    setSearch(
                      event.target.value
                    )
                  }
                  placeholder="Search order, table or item..."
                  className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm outline-none focus:border-red-500"
                />

                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  {[
                    ['all', 'All'],
                    ['pending', 'New'],
                    [
                      'preparing',
                      'Preparing',
                    ],
                    ['ready', 'Ready'],
                  ].map(([value, label]) => (
                    <button
                      type="button"
                      key={value}
                      onClick={() =>
                        setStatusFilter(value)
                      }
                      className={`shrink-0 rounded-xl border px-4 py-2 text-[10px] font-black uppercase ${
                        statusFilter === value
                          ? 'border-red-600 bg-red-600 text-white'
                          : 'border-neutral-800 bg-neutral-950 text-neutral-400'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </section>

              {filteredOrders.length === 0 ? (
                <section className="rounded-[28px] border border-neutral-800 bg-neutral-900 p-8 text-center">
                  <div className="text-5xl">
                    🍽️
                  </div>
                  <h2 className="mt-4 font-black">
                    Kitchen queue is empty
                  </h2>
                  <p className="mt-2 text-xs text-neutral-500">
                    New orders appear here automatically.
                  </p>
                </section>
              ) : (
                <section className="space-y-3">
                  {filteredOrders.map(
                    (order) => (
                      <KitchenOrderCard
                        key={order.id}
                        order={order}
                        age={getAgeMinutes(
                          order?.created_at
                        )}
                        updating={
                          String(
                            updatingOrder
                          ) ===
                          String(order.id)
                        }
                        onStatus={
                          setOrderStatus
                        }
                      />
                    )
                  )}
                </section>
              )}
            </>
          )}

          {activeTab === 'today' && (
            <section className="space-y-4">
              <div className="rounded-[28px] border border-neutral-800 bg-neutral-900 p-5">
                <p className="text-[10px] font-black uppercase tracking-widest text-red-400">
                  Today's Kitchen
                </p>
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <HistoryStat
                    label="Total"
                    value={todayOrders.length}
                  />
                  <HistoryStat
                    label="Active"
                    value={
                      todayOrders.length -
                      deliveredToday
                    }
                    tone="orange"
                  />
                  <HistoryStat
                    label="Finished"
                    value={deliveredToday}
                    tone="green"
                  />
                </div>
              </div>

              {todayOrders.length === 0 ? (
                <div className="rounded-[28px] border border-neutral-800 bg-neutral-900 p-8 text-center text-sm text-neutral-500">
                  No orders received today.
                </div>
              ) : (
                todayOrders.map((order) => (
                  <HistoryOrder
                    key={`history-${order.id}`}
                    order={order}
                  />
                ))
              )}
            </section>
          )}

          {activeTab === 'profile' && (
            <section className="space-y-4">
              <div className="rounded-[28px] border border-neutral-800 bg-neutral-900 p-5">
                <div className="flex h-16 w-16 items-center justify-center rounded-3xl bg-red-500/10 text-3xl">
                  👨‍🍳
                </div>
                <p className="mt-4 text-[10px] font-black uppercase tracking-widest text-red-400">
                  Kitchen Profile
                </p>
                <h2 className="mt-1 text-xl font-black">
                  {userId || 'Kitchen'}
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
                    label="Session"
                    value={
                      sessionMode
                        ? 'Secure App Session'
                        : 'Manual Login'
                    }
                  />
                  <ProfileRow
                    label="Alarm"
                    value={
                      alarmEnabled
                        ? 'Enabled'
                        : 'Disabled by Owner'
                    }
                  />
                </div>

                <button
                  type="button"
                  onClick={() => {
                    unlockAlarm()
                    playAlarm()
                  }}
                  className="mt-4 w-full rounded-2xl border border-red-500/20 bg-red-500/10 py-3 text-xs font-black text-red-300"
                >
                  🔔 Test Alarm
                </button>
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

        <nav className="fixed bottom-0 left-1/2 z-50 w-[100svw] max-w-[480px] -translate-x-1/2 border-t border-neutral-800 bg-neutral-950/95 px-2 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
          <div className="grid grid-cols-3 gap-1">
            <NavButton
              active={activeTab === 'queue'}
              icon="🍳"
              label="Queue"
              badge={
                orders.length > 0
                  ? orders.length
                  : null
              }
              onClick={() =>
                setActiveTab('queue')
              }
            />
            <NavButton
              active={activeTab === 'today'}
              icon="📋"
              label="Today"
              onClick={() =>
                setActiveTab('today')
              }
            />
            <NavButton
              active={
                activeTab === 'profile'
              }
              icon="👤"
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

function MiniStat({
  label,
  value,
  tone = 'white',
}) {
  const toneClass = {
    white: 'text-white',
    yellow: 'text-yellow-400',
    orange: 'text-orange-400',
    green: 'text-emerald-400',
  }[tone]

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-2.5 text-center">
      <p
        className={`text-lg font-black ${toneClass}`}
      >
        {value}
      </p>
      <p className="mt-0.5 text-[8px] font-black uppercase text-neutral-500">
        {label}
      </p>
    </div>
  )
}

function KitchenOrderCard({
  order,
  age,
  updating,
  onStatus,
}) {
  const status = kitchenStatus(
    order?.status
  )

  const items = Array.isArray(order?.items)
    ? order.items
    : []

  const ageClass =
    age >= 30
      ? 'border-red-500/50 bg-red-500/10 text-red-300'
      : age >= 20
        ? 'border-orange-500/40 bg-orange-500/10 text-orange-300'
        : age >= 10
          ? 'border-yellow-500/30 bg-yellow-500/10 text-yellow-300'
          : 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'

  return (
    <article className="min-w-0 rounded-[28px] border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-widest text-red-400">
            Order #{orderNumber(order)}
          </p>
          <h3 className="mt-1 truncate text-lg font-black">
            {order?.table_number
              ? `Table ${order.table_number}`
              : 'Takeaway / Parcel'}
          </h3>
          <p className="mt-1 text-[10px] text-neutral-500">
            {order?.created_at
              ? new Date(
                  order.created_at
                ).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'Time unavailable'}
          </p>
        </div>

        <div
          className={`shrink-0 rounded-xl border px-2.5 py-2 text-center ${ageClass}`}
        >
          <p className="text-sm font-black">
            {age}m
          </p>
          <p className="text-[8px] font-black uppercase">
            waiting
          </p>
        </div>
      </div>

      <div className="mt-4 space-y-2">
        {items.map((item, index) => {
          const quantity =
            item?.qty ??
            item?.quantity ??
            1

          const note =
            item?.notes ||
            item?.note ||
            item?.special_instructions ||
            ''

          return (
            <div
              key={`${item?.id || item?.name || 'item'}-${index}`}
              className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3"
            >
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-8 min-w-8 shrink-0 items-center justify-center rounded-xl bg-red-500/10 px-2 text-xs font-black text-red-300">
                  ×{quantity}
                </span>

                <div className="min-w-0 flex-1">
                  <p className="break-words text-sm font-black text-white">
                    {item?.name ||
                      item?.item_name ||
                      'Item'}
                  </p>

                  {note && (
                    <p className="mt-1 break-words text-[10px] font-bold text-yellow-300">
                      📝 {note}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )
        })}
      </div>

      <div className="mt-4">
        {status === 'pending' && (
          <button
            type="button"
            disabled={updating}
            onClick={() =>
              onStatus(
                order.id,
                'preparing'
              )
            }
            className="w-full rounded-2xl bg-orange-500 py-3.5 text-xs font-black uppercase text-white disabled:opacity-50"
          >
            {updating
              ? 'Updating...'
              : 'Start Preparing'}
          </button>
        )}

        {status === 'preparing' && (
          <button
            type="button"
            disabled={updating}
            onClick={() =>
              onStatus(order.id, 'ready')
            }
            className="w-full rounded-2xl bg-emerald-600 py-3.5 text-xs font-black uppercase text-white disabled:opacity-50"
          >
            {updating
              ? 'Updating...'
              : 'Mark Ready'}
          </button>
        )}

        {status === 'ready' && (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 py-3 text-center text-xs font-black uppercase text-emerald-300">
            ✓ Ready for Waiter
          </div>
        )}
      </div>
    </article>
  )
}

function HistoryOrder({ order }) {
  const items = Array.isArray(order?.items)
    ? order.items
    : []

  return (
    <article className="rounded-[24px] border border-neutral-800 bg-neutral-900 p-4">
      <div className="flex min-w-0 items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-black text-white">
            #{orderNumber(order)} ·{' '}
            {order?.table_number
              ? `Table ${order.table_number}`
              : 'Takeaway'}
          </p>
          <p className="mt-1 text-[10px] text-neutral-500">
            {order?.created_at
              ? new Date(
                  order.created_at
                ).toLocaleString('en-IN')
              : ''}
          </p>
        </div>

        <span className="shrink-0 rounded-full border border-neutral-800 bg-neutral-950 px-2.5 py-1 text-[9px] font-black uppercase text-neutral-400">
          {kitchenStatus(order?.status)}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {items.slice(0, 6).map(
          (item, index) => (
            <span
              key={index}
              className="rounded-lg bg-neutral-950 px-2 py-1 text-[9px] text-neutral-400"
            >
              {item?.name ||
                item?.item_name ||
                'Item'}{' '}
              ×
              {item?.qty ||
                item?.quantity ||
                1}
            </span>
          )
        )}
      </div>

      <p className="mt-3 text-right text-sm font-black text-white">
        {money(
          order?.total_amount ??
            order?.grand_total ??
            order?.total
        )}
      </p>
    </article>
  )
}

function HistoryStat({
  label,
  value,
  tone = 'white',
}) {
  const toneClass = {
    white: 'text-white',
    orange: 'text-orange-400',
    green: 'text-emerald-400',
  }[tone]

  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3 text-center">
      <p
        className={`text-xl font-black ${toneClass}`}
      >
        {value}
      </p>
      <p className="mt-1 text-[8px] font-black uppercase text-neutral-500">
        {label}
      </p>
    </div>
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

function NavButton({
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
      className={`relative flex min-w-0 flex-col items-center justify-center rounded-2xl px-2 py-2.5 ${
        active
          ? 'bg-red-500/15 text-red-400'
          : 'text-neutral-500'
      }`}
    >
      <span className="text-lg leading-none">
        {icon}
      </span>
      <span className="mt-1 text-[9px] font-black uppercase">
        {label}
      </span>

      {badge !== null &&
        badge !== undefined && (
          <span className="absolute right-4 top-1 flex min-h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[8px] font-black text-white">
            {badge}
          </span>
        )}
    </button>
  )
}
