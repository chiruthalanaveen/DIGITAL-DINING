'use client'

import {
  useState,
  useEffect,
  use,
  useCallback,
  useRef,
} from 'react'

import { supabase } from '@/lib/supabase'

const ALARM_SOUND_URL =
  'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'

export default function KitchenPortal({ params }) {
  const unwrappedParams = use(params)
  const restaurantId = unwrappedParams.restaurantId

  const [isAuthenticated, setIsAuthenticated] =
    useState(false)

  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')

  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [updatingOrder, setUpdatingOrder] =
    useState(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] =
    useState('all')

  const [currentTime, setCurrentTime] =
    useState(Date.now())

  const [isFullscreen, setIsFullscreen] =
    useState(false)

  const [isConnected, setIsConnected] =
    useState(false)

  const [soundEnabled, setSoundEnabled] =
    useState(false)

  const [alarmActive, setAlarmActive] =
    useState(false)

  const alarmAudioRef = useRef(null)
  const soundEnabledRef = useRef(false)
  const alarmActiveRef = useRef(false)

  /*
   * ---------------------------------------------------------
   * ALARM SOUND
   * ---------------------------------------------------------
   */

  const initializeAlarmAudio = useCallback(() => {
    if (typeof window === 'undefined') {
      return null
    }

    if (!alarmAudioRef.current) {
      const audio = new Audio(ALARM_SOUND_URL)

      audio.preload = 'auto'
      audio.loop = true
      audio.volume = 1.0

      alarmAudioRef.current = audio
    }

    return alarmAudioRef.current
  }, [])

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
    if (!soundEnabledRef.current) {
      return
    }

    const audio = initializeAlarmAudio()

    if (!audio) {
      return
    }

    if (alarmActiveRef.current) {
      return
    }

    try {
      audio.loop = true
      audio.currentTime = 0

      await audio.play()

      alarmActiveRef.current = true
      setAlarmActive(true)
    } catch (error) {
      console.error(
        'Kitchen alarm could not start:',
        error
      )

      alarmActiveRef.current = false
      setAlarmActive(false)
    }
  }, [initializeAlarmAudio])

  const enableAlarmSound = async () => {
    const audio = initializeAlarmAudio()

    if (!audio) return

    try {
      /*
       * IMPORTANT:
       * This is called directly from the user's tap.
       * This unlocks audio playback on Android Chrome.
       */
      audio.loop = false
      audio.currentTime = 0
      audio.volume = 0.01

      await audio.play()

      setTimeout(() => {
        try {
          audio.pause()
          audio.currentTime = 0
          audio.volume = 1.0
          audio.loop = true
        } catch {}
      }, 150)

      soundEnabledRef.current = true
      setSoundEnabled(true)

      /*
       * If pending orders already exist,
       * start the alarm immediately.
       */
      if (
        orders.some(
          (order) => order.status === 'pending'
        )
      ) {
        setTimeout(() => {
          startAlarm()
        }, 200)
      }
    } catch (error) {
      console.error(
        'Unable to enable kitchen alarm:',
        error
      )

      alert(
        'Chrome blocked the alarm sound. Please tap Enable Alarm again and make sure your phone is not in silent mode.'
      )
    }
  }

  /*
   * ---------------------------------------------------------
   * ORDER HELPERS
   * ---------------------------------------------------------
   */

  const getOrderAgeMinutes = (createdAt) => {
    if (!createdAt) return 0

    const created =
      new Date(createdAt).getTime()

    if (Number.isNaN(created)) return 0

    return Math.max(
      0,
      Math.floor(
        (currentTime - created) / 60000
      )
    )
  }

  const formatTime = (createdAt) => {
    if (!createdAt) return '--:--'

    const date = new Date(createdAt)

    if (Number.isNaN(date.getTime())) {
      return '--:--'
    }

    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getTimerClass = (minutes) => {
    if (minutes >= 30) {
      return 'text-red-400 bg-red-500/10 border-red-500/30'
    }

    if (minutes >= 20) {
      return 'text-orange-400 bg-orange-500/10 border-orange-500/30'
    }

    if (minutes >= 10) {
      return 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30'
    }

    return 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
  }

  const getOrderBorder = (order) => {
    const age = getOrderAgeMinutes(
      order.created_at
    )

    if (order.status === 'ready') {
      return 'border-emerald-500/30'
    }

    if (age >= 30) {
      return 'border-red-500/70 shadow-lg shadow-red-950/30'
    }

    if (age >= 20) {
      return 'border-orange-500/50'
    }

    if (order.status === 'preparing') {
      return 'border-orange-500/30'
    }

    return 'border-neutral-800'
  }

  /*
   * ---------------------------------------------------------
   * FETCH ORDERS
   * ---------------------------------------------------------
   */

  const fetchActiveOrders = useCallback(
    async () => {
      setLoading(true)

      try {
        const { data, error } =
          await supabase
            .from('orders')
            .select('*')
            .eq(
              'restaurant_id',
              restaurantId
            )
            .neq('status', 'completed')
            .order('created_at', {
              ascending: true,
            })

        if (error) {
          console.error(
            'KDS order fetch error:',
            error
          )
          return
        }

        const ordersData = data || []

        setOrders(ordersData)

        const hasPendingOrders =
          ordersData.some(
            (order) =>
              order.status === 'pending'
          )

        if (
          hasPendingOrders &&
          soundEnabledRef.current
        ) {
          startAlarm()
        }

        /*
         * Once there are NO pending orders,
         * stop the continuous alarm.
         */
        if (!hasPendingOrders) {
          stopAlarm()
        }
      } finally {
        setLoading(false)
      }
    },
    [
      restaurantId,
      startAlarm,
      stopAlarm,
    ]
  )

  /*
   * ---------------------------------------------------------
   * LOGIN
   * ---------------------------------------------------------
   */

  const handleLogin = async (e) => {
    e.preventDefault()

    setLoading(true)

    try {
      const { data, error } =
        await supabase
          .from('staff_users')
          .select('*')
          .eq(
            'restaurant_id',
            restaurantId
          )
          .eq(
            'user_id',
            userId.trim().toLowerCase()
          )
          .eq(
            'password',
            password.trim()
          )
          .eq('role', 'kitchen')
          .single()

      if (error || !data) {
        throw new Error(
          'Invalid kitchen credentials.'
        )
      }

      setIsAuthenticated(true)

      await fetchActiveOrders()
    } catch (err) {
      alert(
        err.message ||
          'Unable to login.'
      )
    } finally {
      setLoading(false)
    }
  }

  /*
   * ---------------------------------------------------------
   * REALTIME ORDERS
   * ---------------------------------------------------------
   */

  useEffect(() => {
    if (!isAuthenticated) return

    let mounted = true

    const channel = supabase
      .channel(
        `kitchen-orders-${restaurantId}`
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        async (payload) => {
          if (!mounted) return

          const newOrder = payload.new

          /*
           * NEW PENDING ORDER
           *
           * Start continuous alarm.
           */
          if (
            payload.eventType === 'INSERT' &&
            newOrder &&
            newOrder.status === 'pending'
          ) {
            if (
              soundEnabledRef.current
            ) {
              startAlarm()
            }
          }

          /*
           * An existing order changed back
           * to pending.
           */
          if (
            payload.eventType === 'UPDATE' &&
            newOrder &&
            newOrder.status === 'pending'
          ) {
            if (
              soundEnabledRef.current
            ) {
              startAlarm()
            }
          }

          /*
           * Order accepted by kitchen.
           *
           * pending -> preparing
           *
           * fetchActiveOrders() below will see
           * that there may be no pending orders
           * and stop the alarm.
           */
          if (
            payload.eventType === 'UPDATE' &&
            newOrder &&
            newOrder.status !== 'pending'
          ) {
            setOrders((current) =>
              current.map((order) =>
                order.id === newOrder.id
                  ? newOrder
                  : order
              )
            )
          }

          await fetchActiveOrders()
        }
      )
      .subscribe((status) => {
        if (!mounted) return

        if (status === 'SUBSCRIBED') {
          setIsConnected(true)
        } else if (
          status === 'CHANNEL_ERROR' ||
          status === 'TIMED_OUT' ||
          status === 'CLOSED'
        ) {
          setIsConnected(false)
        }
      })

    return () => {
      mounted = false
      setIsConnected(false)

      supabase.removeChannel(
        channel
      )
    }
  }, [
    isAuthenticated,
    restaurantId,
    fetchActiveOrders,
    startAlarm,
  ])

  /*
   * ---------------------------------------------------------
   * KEEP ALARM IN SYNC
   * ---------------------------------------------------------
   */

  useEffect(() => {
    if (!isAuthenticated) {
      stopAlarm()
      return
    }

    const hasPendingOrders =
      orders.some(
        (order) =>
          order.status === 'pending'
      )

    if (
      hasPendingOrders &&
      soundEnabledRef.current
    ) {
      startAlarm()
    }

    if (!hasPendingOrders) {
      stopAlarm()
    }
  }, [
    orders,
    isAuthenticated,
    startAlarm,
    stopAlarm,
  ])

  /*
   * ---------------------------------------------------------
   * MOBILE CHROME AUDIO RECOVERY
   * ---------------------------------------------------------
   */

  useEffect(() => {
    if (!isAuthenticated) return

    const recoverAudio = () => {
      if (!soundEnabledRef.current) {
        return
      }

      const hasPendingOrders =
        orders.some(
          (order) =>
            order.status === 'pending'
        )

      if (!hasPendingOrders) {
        return
      }

      const audio =
        alarmAudioRef.current

      if (audio && audio.paused) {
        audio.play().catch(() => {})
      }
    }

    window.addEventListener(
      'pointerdown',
      recoverAudio,
      { passive: true }
    )

    window.addEventListener(
      'touchstart',
      recoverAudio,
      { passive: true }
    )

    return () => {
      window.removeEventListener(
        'pointerdown',
        recoverAudio
      )

      window.removeEventListener(
        'touchstart',
        recoverAudio
      )
    }
  }, [
    isAuthenticated,
    orders,
  ])

  /*
   * ---------------------------------------------------------
   * CLOCK
   * ---------------------------------------------------------
   */

  useEffect(() => {
    if (!isAuthenticated) return

    const interval = setInterval(() => {
      setCurrentTime(Date.now())
    }, 1000)

    return () =>
      clearInterval(interval)
  }, [isAuthenticated])

  /*
   * ---------------------------------------------------------
   * STATUS UPDATE
   * ---------------------------------------------------------
   */

  const setOrderStatus = async (
    orderId,
    newStatus
  ) => {
    if (updatingOrder) return

    setUpdatingOrder(orderId)

    try {
      const { error } =
        await supabase
          .from('orders')
          .update({
            status: newStatus,
          })
          .eq('id', orderId)
          .eq(
            'restaurant_id',
            restaurantId
          )

      if (error) {
        throw error
      }

      /*
       * Immediately update local state.
       */
      setOrders((current) =>
        current.map((order) =>
          order.id === orderId
            ? {
                ...order,
                status: newStatus,
              }
            : order
        )
      )

      /*
       * IMPORTANT:
       * If pending -> preparing,
       * alarm will stop when no other
       * pending orders remain.
       */
      await fetchActiveOrders()
    } catch (error) {
      console.error(
        'Status update error:',
        error
      )

      alert(
        'Unable to update order status.'
      )
    } finally {
      setUpdatingOrder(null)
    }
  }

  /*
   * ---------------------------------------------------------
   * FILTERING
   * ---------------------------------------------------------
   */

  const filteredOrders =
    orders.filter((order) => {
      const matchesStatus =
        statusFilter === 'all' ||
        order.status === statusFilter

      const searchText =
        search.trim().toLowerCase()

      if (!searchText) {
        return matchesStatus
      }

      const tableNumber =
        String(
          order.table_number || ''
        ).toLowerCase()

      const orderId =
        String(
          order.id || ''
        ).toLowerCase()

      const itemsText =
        Array.isArray(order.items)
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

      const matchesSearch =
        tableNumber.includes(
          searchText
        ) ||
        orderId.includes(
          searchText
        ) ||
        itemsText.includes(
          searchText
        )

      return (
        matchesStatus &&
        matchesSearch
      )
    })

  /*
   * ---------------------------------------------------------
   * SORTING
   * ---------------------------------------------------------
   */

  const sortedOrders =
    [...filteredOrders].sort(
      (a, b) => {
        const aTime = new Date(
          a.created_at || 0
        ).getTime()

        const bTime = new Date(
          b.created_at || 0
        ).getTime()

        return aTime - bTime
      }
    )

  /*
   * ---------------------------------------------------------
   * COUNTS
   * ---------------------------------------------------------
   */

  const pendingCount =
    orders.filter(
      (order) =>
        order.status === 'pending'
    ).length

  const preparingCount =
    orders.filter(
      (order) =>
        order.status === 'preparing'
    ).length

  const readyCount =
    orders.filter(
      (order) =>
        order.status === 'ready'
    ).length

  /*
   * ---------------------------------------------------------
   * FULLSCREEN
   * ---------------------------------------------------------
   */

  const toggleFullscreen =
    async () => {
      try {
        if (
          !document.fullscreenElement
        ) {
          await document.documentElement.requestFullscreen()
          setIsFullscreen(true)
        } else {
          await document.exitFullscreen()
          setIsFullscreen(false)
        }
      } catch (error) {
        console.error(
          'Fullscreen error:',
          error
        )
      }
    }

  useEffect(() => {
    const handleFullscreenChange =
      () => {
        setIsFullscreen(
          Boolean(
            document.fullscreenElement
          )
        )
      }

    document.addEventListener(
      'fullscreenchange',
      handleFullscreenChange
    )

    return () => {
      document.removeEventListener(
        'fullscreenchange',
        handleFullscreenChange
      )
    }
  }, [])

  /*
   * ---------------------------------------------------------
   * LOGOUT
   * ---------------------------------------------------------
   */

  const handleLogout = () => {
    stopAlarm()

    soundEnabledRef.current = false

    setSoundEnabled(false)
    setIsAuthenticated(false)
    setOrders([])
    setUserId('')
    setPassword('')
    setSearch('')
    setStatusFilter('all')
  }

  /*
   * ---------------------------------------------------------
   * AUDIO CLEANUP
   * ---------------------------------------------------------
   */

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

  /*
   * ---------------------------------------------------------
   * LOGIN SCREEN
   * ---------------------------------------------------------
   */

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4">
        <form
          onSubmit={handleLogin}
          className="bg-neutral-900 border border-neutral-800 p-8 rounded-3xl max-w-sm w-full space-y-4 shadow-2xl"
        >
          <div className="text-center mb-6">
            <div className="text-4xl mb-3">
              🍳
            </div>

            <h1 className="text-xl font-black">
              Kitchen Terminal
            </h1>

            <p className="text-neutral-500 text-xs mt-1">
              Sign in to manage kitchen orders
            </p>
          </div>

          <input
            type="text"
            placeholder="User ID"
            value={userId}
            onChange={(e) =>
              setUserId(e.target.value)
            }
            required
            autoComplete="username"
            className="w-full bg-neutral-950 border border-neutral-800 p-3 rounded-xl text-xs font-mono outline-none focus:border-red-500"
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) =>
              setPassword(e.target.value)
            }
            required
            autoComplete="current-password"
            className="w-full bg-neutral-950 border border-neutral-800 p-3 rounded-xl text-xs font-mono outline-none focus:border-red-500"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 font-bold p-3 rounded-xl text-xs uppercase transition"
          >
            {loading
              ? 'Opening Kitchen...'
              : 'Open Queue 🍳'}
          </button>
        </form>
      </div>
    )
  }

  /*
   * ---------------------------------------------------------
   * KDS SCREEN
   * ---------------------------------------------------------
   */

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-3 sm:p-6 space-y-5">

      {/* HEADER */}

      <div className="max-w-7xl mx-auto border-b border-neutral-800 pb-4">
        <div className="flex flex-col lg:flex-row lg:justify-between lg:items-center gap-4">

          <div>
            <div className="flex items-center gap-2 flex-wrap">

              <span className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-3 py-1 rounded-full uppercase font-bold">
                KDS Terminal
              </span>

              <span
                className={`text-[10px] px-3 py-1 rounded-full border font-bold uppercase ${
                  isConnected
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-red-500/10 text-red-400 border-red-500/20'
                }`}
              >
                {isConnected
                  ? '● Live'
                  : '● Offline'}
              </span>

            </div>

            <h1 className="text-2xl font-black mt-2">
              Live Kitchen Orders
            </h1>

            <p className="text-[11px] text-neutral-500 mt-1">
              Orders update automatically in real time
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">

            {!soundEnabled && (
              <button
                onClick={
                  enableAlarmSound
                }
                className="bg-orange-500 hover:bg-orange-600 border border-orange-400 px-4 py-2 rounded-xl text-xs font-black text-white shadow-lg animate-pulse"
              >
                🔊 ENABLE ALARM
              </button>
            )}

            {soundEnabled && (
              <div
                className={`px-4 py-2 rounded-xl text-xs font-black border ${
                  alarmActive
                    ? 'bg-red-600 border-red-500 text-white animate-pulse'
                    : 'bg-emerald-600/20 border-emerald-500/30 text-emerald-400'
                }`}
              >
                {alarmActive
                  ? '🚨 ALARM ACTIVE'
                  : '🔊 SOUND ENABLED'}
              </div>
            )}

            <button
              onClick={
                fetchActiveOrders
              }
              disabled={loading}
              className="bg-neutral-900 border border-neutral-800 hover:border-neutral-700 px-4 py-2 rounded-xl text-xs font-bold"
            >
              {loading
                ? 'Refreshing...'
                : '↻ Refresh'}
            </button>

            <button
              onClick={
                toggleFullscreen
              }
              className="bg-neutral-900 border border-neutral-800 hover:border-neutral-700 px-4 py-2 rounded-xl text-xs font-bold"
            >
              {isFullscreen
                ? '⛶ Exit Fullscreen'
                : '⛶ Fullscreen'}
            </button>

            <button
              onClick={handleLogout}
              className="bg-neutral-900 border border-neutral-800 text-red-400 hover:border-red-500/30 px-4 py-2 rounded-xl text-xs font-bold"
            >
              Log Out ⎋
            </button>

          </div>
        </div>
      </div>

      {/* SOUND INSTRUCTION */}

      {!soundEnabled && (
        <div className="max-w-7xl mx-auto bg-orange-950/30 border border-orange-500/30 rounded-2xl p-4 text-center">
          <p className="text-sm font-black text-orange-300">
            🔊 Enable KDS Order Alarm
          </p>

          <p className="text-[10px] text-orange-200/70 mt-1">
            On Android Chrome, tap “Enable Alarm” once.
            The alarm will then continue until new orders
            are accepted.
          </p>
        </div>
      )}

      {/* ACTIVE ALARM */}

      {alarmActive &&
        pendingCount > 0 && (
          <div className="max-w-7xl mx-auto bg-red-950/60 border-2 border-red-500 rounded-2xl p-5 text-center animate-pulse">
            <p className="text-xl sm:text-2xl font-black text-red-300">
              🚨 NEW ORDER 🚨
            </p>

            <p className="text-sm text-red-200 mt-1">
              ACCEPT / START PREPARING
            </p>

            <p className="text-[10px] text-red-200/60 mt-2">
              Alarm continues until all new orders
              are accepted.
            </p>
          </div>
        )}

      {/* STATISTICS */}

      <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-3">

        <div className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4">
          <p className="text-[10px] uppercase text-neutral-500 font-bold">
            Total Active
          </p>

          <p className="text-2xl font-black mt-1">
            {orders.length}
          </p>
        </div>

        <div className="bg-neutral-900 border border-yellow-500/20 rounded-2xl p-4">
          <p className="text-[10px] uppercase text-yellow-500 font-bold">
            New
          </p>

          <p className="text-2xl font-black text-yellow-400 mt-1">
            {pendingCount}
          </p>
        </div>

        <div className="bg-neutral-900 border border-orange-500/20 rounded-2xl p-4">
          <p className="text-[10px] uppercase text-orange-500 font-bold">
            Preparing
          </p>

          <p className="text-2xl font-black text-orange-400 mt-1">
            {preparingCount}
          </p>
        </div>

        <div className="bg-neutral-900 border border-emerald-500/20 rounded-2xl p-4">
          <p className="text-[10px] uppercase text-emerald-500 font-bold">
            Ready
          </p>

          <p className="text-2xl font-black text-emerald-400 mt-1">
            {readyCount}
          </p>
        </div>

      </div>

      {/* SEARCH */}

      <div className="max-w-7xl mx-auto bg-neutral-900 border border-neutral-800 rounded-2xl p-3">

        <div className="flex flex-col md:flex-row gap-3">

          <input
            type="search"
            placeholder="Search table, order ID, or item..."
            value={search}
            onChange={(e) =>
              setSearch(e.target.value)
            }
            className="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-xs outline-none focus:border-red-500"
          />

          <div className="flex gap-2 overflow-x-auto">
            {[
              ['all', 'All'],
              ['pending', 'New'],
              ['preparing', 'Preparing'],
              ['ready', 'Ready'],
            ].map(
              ([value, label]) => (
                <button
                  key={value}
                  onClick={() =>
                    setStatusFilter(
                      value
                    )
                  }
                  className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap border transition ${
                    statusFilter ===
                    value
                      ? 'bg-red-600 border-red-600 text-white'
                      : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white'
                  }`}
                >
                  {label}
                </button>
              )
            )}
          </div>

        </div>
      </div>

      {/* ORDER QUEUE */}

      <div className="max-w-7xl mx-auto">

        {sortedOrders.length ===
        0 ? (
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-12 text-center">
            <div className="text-5xl mb-4">
              🍽️
            </div>

            <h2 className="text-lg font-black">
              Kitchen Queue Is Empty
            </h2>

            <p className="text-xs text-neutral-500 mt-2">
              New orders will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">

            {sortedOrders.map(
              (order) => {
                const age =
                  getOrderAgeMinutes(
                    order.created_at
                  )

                const isOverdue =
                  age >= 30 &&
                  order.status !==
                    'ready'

                const isWarning =
                  age >= 20 &&
                  order.status !==
                    'ready'

                const items =
                  Array.isArray(
                    order.items
                  )
                    ? order.items
                    : []

                return (
                  <div
                    key={order.id}
                    className={`bg-neutral-900 border p-5 rounded-2xl flex flex-col justify-between space-y-4 transition ${getOrderBorder(
                      order
                    )}`}
                  >

                    <div>

                      <div className="flex justify-between items-start border-b border-neutral-800 pb-3">

                        <div>
                          <p className="text-[9px] uppercase tracking-wider text-neutral-500 font-bold">
                            Table
                          </p>

                          <span className="text-xl font-black text-white">
                            {order.table_number ||
                              'Takeaway'}
                          </span>
                        </div>

                        <div className="text-right">

                          <span
                            className={`text-[10px] uppercase font-bold px-2 py-1 rounded ${
                              order.status ===
                              'ready'
                                ? 'bg-emerald-500/20 text-emerald-400'
                                : order.status ===
                                  'preparing'
                                ? 'bg-orange-500/20 text-orange-400'
                                : 'bg-yellow-500/20 text-yellow-400'
                            }`}
                          >
                            {order.status}
                          </span>

                          <p className="text-[9px] text-neutral-600 mt-2 font-mono">
                            #
                            {String(
                              order.id
                            ).slice(
                              -6
                            )}
                          </p>

                        </div>
                      </div>

                      {/* TIMER */}

                      <div className="flex items-center justify-between mt-3">

                        <div>
                          <p className="text-[9px] uppercase text-neutral-600 font-bold">
                            Ordered
                          </p>

                          <p className="text-[11px] text-neutral-400">
                            {formatTime(
                              order.created_at
                            )}
                          </p>
                        </div>

                        <div
                          className={`border px-3 py-1.5 rounded-lg text-[11px] font-black ${getTimerClass(
                            age
                          )}`}
                        >
                          ⏱ {age} min
                        </div>

                      </div>

                      {/* WARNINGS */}

                      {isOverdue && (
                        <div className="mt-3 bg-red-950/40 border border-red-500/30 rounded-xl p-3">
                          <p className="text-[10px] text-red-400 font-black uppercase">
                            ⚠️ Preparation Overdue
                          </p>

                          <p className="text-[10px] text-red-300/70 mt-1">
                            This order has been waiting for more than 30 minutes.
                          </p>
                        </div>
                      )}

                      {isWarning &&
                        !isOverdue && (
                          <div className="mt-3 bg-orange-950/30 border border-orange-500/20 rounded-xl p-3">
                            <p className="text-[10px] text-orange-400 font-bold uppercase">
                              ⚠️ Long Waiting Order
                            </p>
                          </div>
                        )}

                      {/* ITEMS */}

                      <div className="space-y-2 mt-4">

                        {items.length ===
                        0 ? (
                          <p className="text-xs text-neutral-500">
                            No items found
                          </p>
                        ) : (
                          items.map(
                            (
                              item,
                              i
                            ) => {
                              const quantity =
                                item?.qty ??
                                item?.quantity ??
                                1

                              const itemName =
                                item?.name ||
                                item?.item_name ||
                                'Unnamed item'

                              const note =
                                item?.notes ||
                                item?.note ||
                                item?.special_instructions ||
                                ''

                              return (
                                <div
                                  key={`${order.id}-${i}`}
                                  className="bg-neutral-950/60 border border-neutral-800 rounded-xl p-3"
                                >

                                  <div className="flex items-start gap-3">

                                    <div className="min-w-8 h-8 px-2 rounded-lg bg-orange-500/10 text-orange-400 flex items-center justify-center text-xs font-black">
                                      ×
                                      {
                                        quantity
                                      }
                                    </div>

                                    <div className="flex-1 min-w-0">

                                      <p className="text-xs text-neutral-200 font-bold">
                                        {
                                          itemName
                                        }
                                      </p>

                                      {note && (
                                        <div className="mt-2 text-[10px] text-yellow-300 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-2 py-1.5">
                                          📝{' '}
                                          {
                                            note
                                          }
                                        </div>
                                      )}

                                    </div>

                                  </div>
                                </div>
                              )
                            }
                          )
                        )}

                      </div>

                    </div>

                    {/* ACTIONS */}

                    <div className="pt-2 border-t border-neutral-800">

                      {order.status ===
                        'pending' && (
                        <button
                          onClick={() =>
                            setOrderStatus(
                              order.id,
                              'preparing'
                            )
                          }
                          disabled={
                            updatingOrder ===
                            order.id
                          }
                          className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold p-3 rounded-xl text-xs transition"
                        >
                          {updatingOrder ===
                          order.id
                            ? 'Starting...'
                            : 'Start Preparing 🍳'}
                        </button>
                      )}

                      {order.status ===
                        'preparing' && (
                        <button
                          onClick={() =>
                            setOrderStatus(
                              order.id,
                              'ready'
                            )
                          }
                          disabled={
                            updatingOrder ===
                            order.id
                          }
                          className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-neutral-950 font-black p-3 rounded-xl text-xs transition"
                        >
                          {updatingOrder ===
                          order.id
                            ? 'Updating...'
                            : 'Mark Ready 🔔'}
                        </button>
                      )}

                      {order.status ===
                        'ready' && (
                        <div className="space-y-2">

                          <div className="w-full text-center text-[11px] font-bold text-emerald-400 py-3 bg-emerald-950/20 rounded-xl border border-emerald-500/20">
                            ✓ Ready — Waiting for Waiter
                          </div>

                          <button
                            onClick={() =>
                              setOrderStatus(
                                order.id,
                                'preparing'
                              )
                            }
                            disabled={
                              updatingOrder ===
                              order.id
                            }
                            className="w-full bg-neutral-950 border border-neutral-800 hover:border-orange-500/30 text-neutral-400 hover:text-orange-400 font-bold p-2 rounded-xl text-[10px] transition"
                          >
                            ↩ Reopen Order
                          </button>

                        </div>
                      )}

                    </div>

                  </div>
                )
              }
            )}

          </div>
        )}

      </div>

      {/* FOOTER */}

      <div className="max-w-7xl mx-auto text-center pt-2">
        <p className="text-[9px] text-neutral-700 uppercase tracking-widest">
          Digital Dining • Kitchen Display System
        </p>
      </div>

    </div>
  )
}