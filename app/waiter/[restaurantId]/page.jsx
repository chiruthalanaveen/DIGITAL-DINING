'use client'

import { useState, useEffect, use, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'

const ALARM_SOUND_URL =
  'https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3'

export default function WaiterPortal({ params }) {
  const unwrappedParams = use(params)
  const restaurantId = String(
    unwrappedParams?.restaurantid ||
    unwrappedParams?.restaurantId ||
    unwrappedParams?.restaurant_id ||
    unwrappedParams?.id ||
    ''
  ).trim()

  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [restaurantCode, setRestaurantCode] = useState('')
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [waiterName, setWaiterName] = useState('')

  const [menuItems, setMenuItems] = useState([])
  const [tableNumber, setTableNumber] = useState('Table 1')
  const [cart, setCart] = useState([])
  const [readyOrders, setReadyOrders] = useState([])

  const [soundEnabled, setSoundEnabled] = useState(false)
  const [alarmActive, setAlarmActive] = useState(false)

  const alarmAudioRef = useRef(null)
  const soundEnabledRef = useRef(false)
  const alarmActiveRef = useRef(false)

  /*
   * ---------------------------------------------------------
   * ALARM SOUND
   * ---------------------------------------------------------
   */

  const initializeAlarmAudio = useCallback(() => {
    if (typeof window === 'undefined') return null

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
    if (!soundEnabledRef.current) return

    const audio = initializeAlarmAudio()

    if (!audio) return

    if (alarmActiveRef.current) return

    try {
      audio.loop = true
      audio.currentTime = 0

      await audio.play()

      alarmActiveRef.current = true
      setAlarmActive(true)
    } catch (error) {
      console.error('Waiter alarm could not start:', error)

      setAlarmActive(false)
      alarmActiveRef.current = false
    }
  }, [initializeAlarmAudio])

  const enableAlarmSound = async () => {
    const audio = initializeAlarmAudio()

    if (!audio) return

    try {
      /*
       * This function is called directly from a button click.
       * That user gesture unlocks audio playback on mobile Chrome.
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
       * If ready orders already exist, start alarming immediately.
       */
      if (readyOrders.length > 0) {
        setTimeout(() => {
          startAlarm()
        }, 200)
      }
    } catch (error) {
      console.error('Unable to enable waiter alarm:', error)

      alert(
        'Chrome blocked the alarm sound. Please tap Enable Alarm again and make sure your phone is not in silent mode.'
      )
    }
  }

  /*
   * ---------------------------------------------------------
   * LOGIN
   * ---------------------------------------------------------
   */

  const handleLogin = async (e) => {
    e.preventDefault()

    if (!restaurantId || !restaurantCode.trim() || !userId.trim() || !password.trim()) {
      alert('Enter the 5-digit Restaurant Code, Waiter User ID, and password.')
      return
    }

    try {
      const { data, error } = await supabase.rpc('authenticate_staff_login', {
        p_restaurant_id: String(restaurantId),
        p_restaurant_code: String(restaurantCode).trim(),
        p_user_id: String(userId).trim().toLowerCase(),
        p_password: String(password).trim(),
        p_role: 'waiter',
      })

      if (error) throw error
      if (!data?.success) throw new Error(data?.message || 'Invalid restaurant credentials.')
      if (String(data.restaurantId) !== String(restaurantId)) {
        throw new Error('These credentials do not belong to this restaurant.')
      }

      setWaiterName(data.staff?.name || data.staff?.user_id || '')
      setRestaurantCode(String(data.restaurantCode || restaurantCode).trim())
      setIsAuthenticated(true)

      await fetchMenu()
      await fetchReadyOrders()
    } catch (err) {
      console.error('[WAITER] Login error:', err)
      setIsAuthenticated(false)
      alert(err.message || 'Unable to login.')
    }
  }

  /*
   * ---------------------------------------------------------
   * MENU
   * ---------------------------------------------------------
   */

  const fetchMenu = async () => {
    if (!restaurantId || !restaurantCode || !userId || !password) return

    const { data, error } = await supabase.rpc('get_waiter_portal_data', {
      p_restaurant_id: String(restaurantId),
      p_restaurant_code: String(restaurantCode).trim(),
      p_user_id: String(userId).trim().toLowerCase(),
      p_password: String(password).trim(),
    })

    if (error) {
      console.error('Waiter menu loading error:', error)
      return
    }

    if (!data?.success) {
      console.error('Waiter portal rejected:', data?.message)
      return
    }

    setMenuItems(Array.isArray(data.menuItems) ? data.menuItems : [])
  }

  /*
   * ---------------------------------------------------------
   * READY ORDERS
   * ---------------------------------------------------------
   */

  const fetchReadyOrders = async () => {
    if (!restaurantId || !restaurantCode || !userId || !password) {
      setReadyOrders([])
      return
    }

    const { data, error } = await supabase.rpc('get_waiter_portal_data', {
      p_restaurant_id: String(restaurantId),
      p_restaurant_code: String(restaurantCode).trim(),
      p_user_id: String(userId).trim().toLowerCase(),
      p_password: String(password).trim(),
    })

    if (error) {
      console.error('[WAITER] Ready orders fetch error:', error)
      return
    }

    if (!data?.success) {
      console.error('[WAITER] Ready orders rejected:', data?.message)
      return
    }

    const ordersData = Array.isArray(data.readyOrders) ? data.readyOrders : []
    setReadyOrders(ordersData)

    if (ordersData.length > 0 && soundEnabledRef.current) {
      startAlarm()
    }

    if (ordersData.length === 0) {
      stopAlarm()
    }
  }

  /*
   * ---------------------------------------------------------
   * REALTIME READY ORDERS
   * ---------------------------------------------------------
   */

  useEffect(() => {
    if (!isAuthenticated || !restaurantId) return undefined

    let mounted = true

    const channel = supabase
      .channel(`waiter-orders-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          if (!mounted) return

          const changedOrder = payload.new
          const changedOrderId = payload.old?.id || changedOrder?.id

          if (payload.eventType === 'DELETE') {
            setReadyOrders((current) =>
              current.filter(
                (order) => String(order.id) !== String(changedOrderId)
              )
            )
            return
          }

          if (!changedOrder?.id) return

          if (changedOrder.status === 'ready') {
            setReadyOrders((current) => {
              const exists = current.some(
                (order) => String(order.id) === String(changedOrder.id)
              )

              if (exists) {
                return current.map((order) =>
                  String(order.id) === String(changedOrder.id)
                    ? changedOrder
                    : order
                )
              }

              return [changedOrder, ...current]
            })

            if (soundEnabledRef.current) {
              startAlarm()
            }
          } else {
            // Remove orders that were handed over or changed away from READY.
            setReadyOrders((current) =>
              current.filter(
                (order) => String(order.id) !== String(changedOrder.id)
              )
            )
          }
        }
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
          console.error('Waiter realtime subscription error:', status)
        }
      })

    return () => {
      mounted = false
      supabase.removeChannel(channel)
    }
  }, [isAuthenticated, restaurantId, startAlarm])

  /*
   * ---------------------------------------------------------
   * DATABASE POLLING FALLBACK
   * ---------------------------------------------------------
   */

  useEffect(() => {
    if (!isAuthenticated || !restaurantId) return undefined

    let active = true

    const sync = async () => {
      if (!active || document.visibilityState === 'hidden') return
      await fetchReadyOrders()
    }

    const intervalId = window.setInterval(sync, 5000)
    const onVisible = () => {
      if (document.visibilityState === 'visible') sync()
    }
    const onOnline = () => sync()

    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)

    return () => {
      active = false
      window.clearInterval(intervalId)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [isAuthenticated, restaurantId, restaurantCode, userId, password])

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

    if (
      readyOrders.length > 0 &&
      soundEnabledRef.current
    ) {
      startAlarm()
    }

    if (readyOrders.length === 0) {
      stopAlarm()
    }
  }, [
    readyOrders,
    isAuthenticated,
    startAlarm,
    stopAlarm,
  ])

  /*
   * ---------------------------------------------------------
   * MOBILE CHROME AUDIO RECOVERY
   * ---------------------------------------------------------
   *
   * If Chrome temporarily suspends the audio session,
   * another user touch can resume it.
   */

  useEffect(() => {
    if (!isAuthenticated) return

    const recoverAudio = () => {
      if (
        soundEnabledRef.current &&
        readyOrders.length > 0
      ) {
        const audio = alarmAudioRef.current

        if (audio && audio.paused) {
          audio.play().catch(() => {})
        }
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
  }, [isAuthenticated, readyOrders.length])

  /*
   * ---------------------------------------------------------
   * CLEANUP
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
   * HANDOVER
   * ---------------------------------------------------------
   */

  const handleHandover = async (orderId) => {
    if (!orderId || !restaurantId) return

    try {
      const { data, error } = await supabase.rpc('staff_update_order_status', {
        p_restaurant_id: String(restaurantId),
        p_restaurant_code: String(restaurantCode).trim(),
        p_user_id: String(userId).trim().toLowerCase(),
        p_password: String(password).trim(),
        p_role: 'waiter',
        p_order_id: String(orderId),
        p_new_status: 'completed',
      })

      if (error) throw error
      if (!data?.success) throw new Error(data?.message || 'Unable to record handover.')

      setReadyOrders((current) =>
        current.filter((order) => String(order.id) !== String(orderId))
      )

      if (readyOrders.length <= 1) stopAlarm()
      alert('Handover recorded successfully! ✅')
    } catch (error) {
      console.error('Handover error:', error)
      alert(`Unable to record handover: ${error.message}`)
    }
  }

  /*
   * ---------------------------------------------------------
   * DIRECT ORDER
   * ---------------------------------------------------------
   */

  const handlePlaceOrder = async () => {
    if (cart.length === 0) return

    const total = cart.reduce(
      (sum, i) => sum + Number(i.price || 0) * Number(i.qty || 0),
      0
    )

    try {
      const { data, error } = await supabase.rpc('waiter_place_direct_order', {
        p_restaurant_id: String(restaurantId),
        p_restaurant_code: String(restaurantCode).trim(),
        p_user_id: String(userId).trim().toLowerCase(),
        p_password: String(password).trim(),
        p_table_number: String(tableNumber),
        p_items: cart,
        p_total_amount: total,
      })

      if (error) throw error
      if (!data?.success) throw new Error(data?.message || 'Unable to send order to kitchen.')

      alert('Order sent to kitchen! 🍳')
      setCart([])
    } catch (error) {
      console.error('Direct order error:', error)
      alert(`Unable to send order to kitchen: ${error.message}`)
    }
  }

  /*
   * ---------------------------------------------------------
   * LOGOUT
   * ---------------------------------------------------------
   */

  const handleLogout = () => {
    stopAlarm()

    soundEnabledRef.current = false

    setSoundEnabled(false)
    setRestaurantCode('')
    setIsAuthenticated(false)
    setReadyOrders([])
    setCart([])
    setMenuItems([])
    setUserId('')
    setPassword('')
  }

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
          className="bg-neutral-900 border border-neutral-800 p-8 rounded-3xl max-w-sm w-full space-y-4"
        >
          <div className="text-center mb-5">
            <div className="text-4xl mb-3">
              👨‍🍳
            </div>

            <h1 className="text-xl font-black">
              Waiter Sign In
            </h1>

            <p className="text-xs text-neutral-500 mt-1">
              Sign in to manage waiter orders
            </p>
          </div>

          <input
            type="text"
            placeholder="5-digit Restaurant Code"
            value={restaurantCode}
            onChange={(e) => setRestaurantCode(e.target.value.replace(/\D/g, '').slice(0, 5))}
            inputMode="numeric"
            maxLength={5}
            required
            className="w-full bg-neutral-950 border border-orange-500/30 p-3 rounded-xl text-xs font-mono tracking-widest"
          />

          <input
            type="text"
            placeholder="User ID"
            value={userId}
            onChange={(e) =>
              setUserId(e.target.value)
            }
            required
            autoComplete="username"
            className="w-full bg-neutral-950 border border-neutral-800 p-3 rounded-xl text-xs font-mono"
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
            className="w-full bg-neutral-950 border border-neutral-800 p-3 rounded-xl text-xs font-mono"
          />

          <button
            type="submit"
            className="w-full bg-orange-500 hover:bg-orange-600 font-bold p-3 rounded-xl text-xs uppercase"
          >
            Open Terminal ➔
          </button>
        </form>
      </div>
    )
  }

  /*
   * ---------------------------------------------------------
   * WAITER SCREEN
   * ---------------------------------------------------------
   */

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-4 sm:p-6 space-y-6">

      {/* HEADER */}

      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4 border-b border-neutral-800 pb-4">
        <div>
          <h1 className="text-xl font-black">
            Waiter Portal
          </h1>

          <p className="text-xs text-neutral-400 mt-1">
            Logged in:{' '}
            <strong className="text-orange-400">
              {waiterName}
            </strong>
          </p>
          <p className="inline-flex mt-2 rounded-lg border border-orange-500/20 bg-orange-500/10 px-3 py-1.5 text-[10px] font-black font-mono tracking-widest text-orange-300">
            Restaurant Code: {restaurantCode || '-----'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">

          {!soundEnabled && (
            <button
              onClick={enableAlarmSound}
              className="bg-orange-500 hover:bg-orange-600 border border-orange-400 text-white text-xs px-4 py-2.5 rounded-xl font-black shadow-lg animate-pulse"
            >
              🔊 ENABLE ALARM SOUND
            </button>
          )}

          {soundEnabled && (
            <div
              className={`text-xs px-4 py-2.5 rounded-xl font-black border ${
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
            onClick={handleLogout}
            className="bg-neutral-900 border border-neutral-800 text-xs px-4 py-2.5 rounded-xl text-red-400 font-bold"
          >
            Log Out ⎋
          </button>
        </div>
      </div>

      {/* SOUND INSTRUCTION */}

      {!soundEnabled && (
        <div className="bg-orange-950/30 border border-orange-500/30 rounded-2xl p-4 text-center">
          <p className="text-sm font-black text-orange-300">
            🔊 Enable Order Alarm
          </p>

          <p className="text-[10px] text-orange-200/70 mt-1">
            Tap “Enable Alarm Sound” once on this phone.
            The alarm will then continue until ready orders
            are handed over.
          </p>
        </div>
      )}

      {/* ACTIVE ALARM */}

      {alarmActive && readyOrders.length > 0 && (
        <div className="bg-red-950/60 border-2 border-red-500 rounded-2xl p-5 text-center animate-pulse">
          <p className="text-xl sm:text-2xl font-black text-red-300">
            🚨 ORDER READY 🚨
          </p>

          <p className="text-xs text-red-200 mt-1">
            Please accept / handover the order
          </p>

          <p className="text-[10px] text-red-200/60 mt-2">
            Alarm continues until all ready orders are handed over.
          </p>
        </div>
      )}

      {/* READY ORDERS */}

      {readyOrders.length > 0 && (
        <div className="bg-neutral-900 border-2 border-emerald-500/40 p-5 rounded-3xl space-y-3">
          <h2 className="text-sm font-black text-emerald-400 uppercase tracking-wider">
            🔔 Kitchen Orders Ready for Handover ({readyOrders.length})
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {readyOrders.map((order) => (
              <div
                key={order.id}
                className="bg-neutral-950 border border-neutral-800 p-4 rounded-2xl flex flex-col justify-between space-y-3"
              >
                <div>
                  <div className="flex justify-between items-center">
                    <span className="font-black text-white text-base">
                      {order.table_number}
                    </span>

                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-bold uppercase">
                      Ready
                    </span>
                  </div>

                  <div className="mt-2 text-xs space-y-1 text-neutral-300">
                    {order.items?.map((item, idx) => (
                      <p key={idx}>
                        • {item.name} ×
                        {item.qty || item.quantity}
                      </p>
                    ))}
                  </div>
                </div>

                <button
                  onClick={() =>
                    handleHandover(order.id)
                  }
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-3 rounded-xl text-xs uppercase tracking-wider transition"
                >
                  Approve & Handover 🚀
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MENU */}

      <div className="flex flex-col md:flex-row gap-6">

        <div className="flex-1 space-y-4">

          <div className="flex justify-between items-center">
            <h2 className="text-sm font-bold text-neutral-400 uppercase">
              Take Direct Order
            </h2>

            <select
              value={tableNumber}
              onChange={(e) =>
                setTableNumber(e.target.value)
              }
              className="bg-neutral-900 border border-neutral-800 text-xs font-bold p-2 rounded-xl text-white"
            >
              {[...Array(15)].map((_, i) => (
                <option
                  key={i + 1}
                  value={`Table ${i + 1}`}
                >
                  Table {i + 1}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {menuItems.map((item) => (
              <div
                key={item.id}
                onClick={() =>
                  setCart((prev) => {
                    const ex = prev.find(
                      (x) => x.id === item.id
                    )

                    return ex
                      ? prev.map((x) =>
                          x.id === item.id
                            ? {
                                ...x,
                                qty: x.qty + 1,
                              }
                            : x
                        )
                      : [
                          ...prev,
                          {
                            ...item,
                            qty: 1,
                          },
                        ]
                  })
                }
                className="bg-neutral-900 border border-neutral-800 p-3 rounded-2xl cursor-pointer hover:border-orange-500 space-y-1"
              >
                <p className="text-xs font-bold text-white">
                  {item.name}
                </p>

                <p className="text-xs font-mono text-orange-400 font-bold">
                  ₹{item.price}
                </p>
              </div>
            ))}
          </div>
        </div>

        {/* CART */}

        <div className="w-full md:w-80 bg-neutral-900 border border-neutral-800 p-5 rounded-3xl flex flex-col justify-between space-y-4">

          <div>
            <h2 className="text-xs font-bold text-white uppercase border-b border-neutral-800 pb-2">
              Active Ticket ({tableNumber})
            </h2>

            <div className="space-y-2 mt-3 max-h-60 overflow-y-auto">
              {cart.map((item) => (
                <div
                  key={item.id}
                  className="flex justify-between text-xs bg-neutral-950 p-2.5 rounded-xl"
                >
                  <span>
                    {item.name} ×{item.qty}
                  </span>

                  <span className="font-mono text-orange-400 font-bold">
                    ₹{item.price * item.qty}
                  </span>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handlePlaceOrder}
            disabled={cart.length === 0}
            className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-black py-3 rounded-xl text-xs uppercase"
          >
            Send to Kitchen 🍳
          </button>
        </div>
      </div>
    </div>
  )
}