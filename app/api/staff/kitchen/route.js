'use client'

import { useState, useEffect, use, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'

export default function KitchenPortal({ params }) {
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
  const [showProfile, setShowProfile] = useState(false)

  const [orders, setOrders] = useState([])
  const [todayOrders, setTodayOrders] = useState([])
  const [loading, setLoading] = useState(false)
  const [todayOrdersLoading, setTodayOrdersLoading] = useState(false)
  const [updatingOrder, setUpdatingOrder] = useState(null)
  const [lastOrdersRefresh, setLastOrdersRefresh] = useState(null)
  const [lastTodayRefresh, setLastTodayRefresh] = useState(null)

  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  const [currentTime, setCurrentTime] = useState(Date.now())
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isConnected, setIsConnected] = useState(false)
  const [newOrderAlert, setNewOrderAlert] = useState(null)

  const audioRef = useRef(null)
  const audioContextRef = useRef(null)
  const alarmUnlockedRef = useRef(false)
  const knownOrderIdsRef = useRef(new Set())
  const syncInProgressRef = useRef(false)
  const newOrderAlertTimerRef = useRef(null)

  const [alarmSoundUrl, setAlarmSoundUrl] = useState('/sounds/kitchen-default.mp3')
  const [alarmEnabled, setAlarmEnabled] = useState(true)
  const [alarmVolume, setAlarmVolume] = useState(1)

  /*
   * ---------------------------------------------------------
   * HELPERS
   * ---------------------------------------------------------
   */

  const getOrderAgeMinutes = (createdAt) => {
    if (!createdAt) return 0

    const created = new Date(createdAt).getTime()

    if (Number.isNaN(created)) return 0

    return Math.max(0, Math.floor((currentTime - created) / 60000))
  }

  // Normalize all customer-facing initial order states to the kitchen's
  // internal \"pending\" state. Online orders are inserted as \"paid\", so
  // without this mapping they would not show the Start Preparing button.
  const getKitchenStatus = (status) => {
    const value = String(status || '').trim().toLowerCase()

    if (
      value === 'paid' ||
      value === 'confirmed' ||
      value === 'placed' ||
      value === 'order_placed' ||
      value === 'new'
    ) {
      return 'pending'
    }

    if (
      value === 'delivered' ||
      value === 'served' ||
      value === 'completed' ||
      value === 'delivered_by_waiter'
    ) {
      return 'completed'
    }

    return value || 'pending'
  }

  const isFinishedStatus = (status) => {
    const value = String(status || '').trim().toLowerCase()

    return [
      'completed',
      'delivered',
      'served',
      'delivered_by_waiter',
      'cancelled',
      'canceled',
    ].includes(value)
  }

  const formatTime = (createdAt) => {
    if (!createdAt) return '--:--'

    const date = new Date(createdAt)

    if (Number.isNaN(date.getTime())) return '--:--'

    return date.toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const formatDateTime = (createdAt) => {
    if (!createdAt) return '--'

    const date = new Date(createdAt)

    if (Number.isNaN(date.getTime())) return '--'

    return date.toLocaleString([], {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  }

  const getOrderNumber = (order) => {
    return (
      order?.order_number ??
      order?.daily_order_number ??
      order?.orderNo ??
      String(order?.id || '').slice(-6)
    )
  }

  const getOrderAmount = (order) => {
    const raw =
      order?.total_amount ??
      order?.grand_total ??
      order?.total ??
      order?.amount ??
      0

    const value = Number(raw)

    return Number.isFinite(value) ? value : 0
  }

  const formatCurrency = (value) => {
    return `₹${Number(value || 0).toFixed(2)}`
  }

  const getHistoryStatus = (status) => {
    const value = String(status || '').trim().toLowerCase()

    if (value === 'completed') return 'Delivered / Completed'
    if (value === 'delivered') return 'Delivered'
    if (value === 'served') return 'Served'
    if (value === 'delivered_by_waiter') return 'Delivered by Waiter'
    if (value === 'cancelled' || value === 'canceled') return 'Cancelled'
    if (value === 'ready') return 'Ready'
    if (value === 'preparing') return 'Preparing'
    if (value === 'paid') return 'Paid / New'
    if (!value) return 'Pending'

    return value.replace(/_/g, ' ')
  }

  const getHistoryStatusClass = (status) => {
    const value = String(status || '').trim().toLowerCase()

    if (['completed', 'delivered', 'served', 'delivered_by_waiter'].includes(value)) {
      return 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20'
    }

    if (value === 'ready') {
      return 'bg-cyan-500/15 text-cyan-300 border-cyan-500/20'
    }

    if (value === 'preparing') {
      return 'bg-orange-500/15 text-orange-300 border-orange-500/20'
    }

    if (value === 'cancelled' || value === 'canceled') {
      return 'bg-red-500/15 text-red-300 border-red-500/20'
    }

    return 'bg-yellow-500/15 text-yellow-300 border-yellow-500/20'
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
    const age = getOrderAgeMinutes(order.created_at)

    if (getKitchenStatus(order.status) === 'ready') {
      return 'border-emerald-500/30'
    }

    if (age >= 30) {
      return 'border-red-500/70 shadow-lg shadow-red-950/30'
    }

    if (age >= 20) {
      return 'border-orange-500/50'
    }

    if (getKitchenStatus(order.status) === 'preparing') {
      return 'border-orange-500/30'
    }

    return 'border-neutral-800'
  }

  const getTodayBounds = () => {
    const now = new Date()
    const start = new Date(now)
    start.setHours(0, 0, 0, 0)

    const end = new Date(start)
    end.setDate(end.getDate() + 1)

    return { start: start.toISOString(), end: end.toISOString() }
  }

  const clearNewOrderAlert = () => {
    setNewOrderAlert(null)

    if (newOrderAlertTimerRef.current) {
      window.clearTimeout(newOrderAlertTimerRef.current)
      newOrderAlertTimerRef.current = null
    }
  }

  /*
   * ---------------------------------------------------------
   * KITCHEN ALARM
   * ---------------------------------------------------------
   */

  const ensureAudioContext = useCallback(() => {
    if (typeof window === 'undefined') return null

    const AudioContextClass =
      window.AudioContext || window.webkitAudioContext

    if (!AudioContextClass) return null

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass()
    }

    return audioContextRef.current
  }, [])

  const unlockAlarmAudio = useCallback(async () => {
    if (typeof window === 'undefined') return

    try {
      const context = ensureAudioContext()

      if (context && context.state === 'suspended') {
        await context.resume()
      }

      if (!audioRef.current) {
        const audio = new Audio(alarmSoundUrl)
        audio.preload = 'auto'
        audio.volume = Math.min(1, Math.max(0, Number(alarmVolume) || 0))
        audioRef.current = audio
      } else if (audioRef.current.src !== new URL(alarmSoundUrl, window.location.origin).href) {
        const audio = new Audio(alarmSoundUrl)
        audio.preload = 'auto'
        audio.volume = Math.min(1, Math.max(0, Number(alarmVolume) || 0))
        audioRef.current = audio
      }

      // The login button is a user gesture, which gives the browser a
      // valid opportunity to unlock sound for later realtime events.
      const audio = audioRef.current
      audio.muted = true
      audio.currentTime = 0
      await audio.play()
      audio.pause()
      audio.currentTime = 0
      audio.muted = false

      alarmUnlockedRef.current = true
    } catch (error) {
      // MP3 playback may be blocked or the file may not exist. The Web Audio
      // fallback below will still provide a kitchen alarm after login.
      console.warn('[KITCHEN] Alarm audio unlock warning:', error)
      try {
        const context = ensureAudioContext()
        if (context && context.state === 'suspended') {
          await context.resume()
        }
        alarmUnlockedRef.current = Boolean(context)
      } catch {
        // Ignore browser audio limitations.
      }
    }
  }, [alarmSoundUrl, alarmVolume, ensureAudioContext])

  const playWebAudioFallback = useCallback(() => {
    try {
      const context = ensureAudioContext()

      if (!context) return

      if (context.state === 'suspended') {
        context.resume().catch(() => {})
      }

      const now = context.currentTime
      const master = context.createGain()
      master.gain.setValueAtTime(0.0001, now)
      master.gain.exponentialRampToValueAtTime(
        Math.max(0.03, Math.min(0.35, Number(alarmVolume) || 0.35)),
        now + 0.02
      )
      master.gain.exponentialRampToValueAtTime(0.0001, now + 2.1)
      master.connect(context.destination)

      const tones = [
        { start: 0, duration: 0.35, frequency: 900 },
        { start: 0.45, duration: 0.35, frequency: 1100 },
        { start: 0.9, duration: 0.35, frequency: 900 },
        { start: 1.35, duration: 0.5, frequency: 1200 },
      ]

      tones.forEach(({ start, duration, frequency }) => {
        const oscillator = context.createOscillator()
        const gain = context.createGain()

        oscillator.type = 'sine'
        oscillator.frequency.setValueAtTime(frequency, now + start)

        gain.gain.setValueAtTime(0.0001, now + start)
        gain.gain.exponentialRampToValueAtTime(0.85, now + start + 0.02)
        gain.gain.exponentialRampToValueAtTime(0.0001, now + start + duration)

        oscillator.connect(gain)
        gain.connect(master)
        oscillator.start(now + start)
        oscillator.stop(now + start + duration + 0.03)
      })
    } catch (error) {
      console.warn('[KITCHEN] Web Audio alarm warning:', error)
    }
  }, [alarmVolume, ensureAudioContext])

  const playNotificationSound = useCallback(() => {
    if (!alarmEnabled) return

    let mp3Played = false

    try {
      if (typeof window !== 'undefined') {
        const expectedSrc = new URL(alarmSoundUrl, window.location.origin).href

        if (!audioRef.current || audioRef.current.src !== expectedSrc) {
          audioRef.current = new Audio(alarmSoundUrl)
          audioRef.current.preload = 'auto'
        }

        audioRef.current.volume = Math.min(1, Math.max(0, Number(alarmVolume) || 0))
        audioRef.current.currentTime = 0

        audioRef.current.play()
          .then(() => {
            mp3Played = true
          })
          .catch(() => {
            mp3Played = false
            playWebAudioFallback()
          })
      }
    } catch {
      mp3Played = false
    }

    // A generated Web Audio alarm is a fallback when the configured MP3 is
    // unavailable or the browser refuses that particular media element.
    if (!mp3Played && !audioRef.current) {
      playWebAudioFallback()
    }
  }, [alarmEnabled, alarmSoundUrl, alarmVolume, playWebAudioFallback])

  const triggerNewOrderAlert = useCallback((order) => {
    if (!order?.id) return

    const orderNumber = getOrderNumber(order)
    const table = order?.table_number || 'Takeaway'

    setNewOrderAlert({ orderNumber, table })
    playNotificationSound()

    if (newOrderAlertTimerRef.current) {
      window.clearTimeout(newOrderAlertTimerRef.current)
    }

    newOrderAlertTimerRef.current = window.setTimeout(() => {
      setNewOrderAlert(null)
      newOrderAlertTimerRef.current = null
    }, 7000)
  }, [playNotificationSound])

  const fetchAlarmSettings = useCallback(async () => {
    if (!restaurantId || !restaurantCode || !userId || !password) return

    const { data, error } = await supabase.rpc('get_kitchen_portal_data', {
      p_restaurant_id: String(restaurantId),
      p_restaurant_code: String(restaurantCode).trim(),
      p_user_id: String(userId).trim().toLowerCase(),
      p_password: String(password).trim(),
    })

    if (error) {
      console.error('Kitchen alarm settings error:', error)
      return
    }

    if (!data?.success) return

    const soundMap = {
      'kitchen-default': '/sounds/kitchen-default.mp3',
      'kitchen-1': '/sounds/kitchen-1.mp3',
      'kitchen-2': '/sounds/kitchen-2.mp3',
      'kitchen-3': '/sounds/kitchen-3.mp3',
    }

    const restaurant = data.restaurant || {}
    setAlarmSoundUrl(soundMap[restaurant.kitchen_alarm_sound] || soundMap['kitchen-default'])
    setAlarmEnabled(restaurant.kitchen_alarm_enabled ?? true)
    setAlarmVolume(Math.min(1, Math.max(0, Number(restaurant.kitchen_alarm_volume ?? 1))))
  }, [restaurantId, restaurantCode, userId, password])

  /*
   * ---------------------------------------------------------
   * FETCH ORDERS
   * ---------------------------------------------------------
   */

  const applyActiveOrders = useCallback((data, announceNew = false) => {
    const rows = Array.isArray(data) ? data : []
    const activeRows = rows.filter((order) => !isFinishedStatus(order?.status))

    if (announceNew) {
      activeRows.forEach((order) => {
        const orderId = String(order?.id || '')
        if (!orderId) return
        if (!knownOrderIdsRef.current.has(orderId)) {
          knownOrderIdsRef.current.add(orderId)
          triggerNewOrderAlert(order)
        }
      })
    }

    setOrders(activeRows)
    setLastOrdersRefresh(new Date())
    return activeRows
  }, [triggerNewOrderAlert])

  const fetchKitchenSnapshot = useCallback(async () => {
    if (!restaurantId || !restaurantCode || !userId || !password) return null

    const { data, error } = await supabase.rpc('get_kitchen_portal_data', {
      p_restaurant_id: String(restaurantId),
      p_restaurant_code: String(restaurantCode).trim(),
      p_user_id: String(userId).trim().toLowerCase(),
      p_password: String(password).trim(),
    })

    if (error) {
      console.error('[KITCHEN] Portal data fetch error:', error)
      return null
    }

    if (!data?.success) {
      console.error('[KITCHEN] Portal data rejected:', data?.message)
      return null
    }

    const restaurant = data.restaurant || {}
    const soundMap = {
      'kitchen-default': '/sounds/kitchen-default.mp3',
      'kitchen-1': '/sounds/kitchen-1.mp3',
      'kitchen-2': '/sounds/kitchen-2.mp3',
      'kitchen-3': '/sounds/kitchen-3.mp3',
    }
    setAlarmSoundUrl(soundMap[restaurant.kitchen_alarm_sound] || soundMap['kitchen-default'])
    setAlarmEnabled(restaurant.kitchen_alarm_enabled ?? true)
    setAlarmVolume(Math.min(1, Math.max(0, Number(restaurant.kitchen_alarm_volume ?? 1))))

    return Array.isArray(data.orders) ? data.orders : []
  }, [restaurantId, restaurantCode, userId, password])

  const fetchActiveOrders = useCallback(async (showLoader = true, announceNew = false) => {
    if (!restaurantId) {
      console.error('[KITCHEN] Missing restaurantId', { params: unwrappedParams })
      setOrders([])
      setLoading(false)
      return []
    }

    if (showLoader) setLoading(true)

    try {
      const rows = await fetchKitchenSnapshot()
      if (!rows) return []
      return applyActiveOrders(rows, announceNew)
    } finally {
      setLoading(false)
    }
  }, [restaurantId, unwrappedParams, fetchKitchenSnapshot, applyActiveOrders])

  const fetchTodayOrders = useCallback(async (showLoader = false) => {
    if (!restaurantId) {
      setTodayOrders([])
      return []
    }

    if (showLoader) setTodayOrdersLoading(true)

    try {
      const rows = await fetchKitchenSnapshot()
      if (!rows) return []

      const { start, end } = getTodayBounds()
      const todayRows = rows.filter((order) => {
        const created = order?.created_at
        return created && created >= start && created < end
      }).sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

      setTodayOrders(todayRows)
      setLastTodayRefresh(new Date())
      return todayRows
    } finally {
      setTodayOrdersLoading(false)
    }
  }, [restaurantId, fetchKitchenSnapshot])

  const refreshKitchenData = useCallback(async ({ showLoader = false, announceNew = true } = {}) => {
    if (syncInProgressRef.current) return

    syncInProgressRef.current = true

    try {
      await Promise.all([
        fetchActiveOrders(showLoader, announceNew),
        fetchTodayOrders(showLoader),
      ])
    } finally {
      syncInProgressRef.current = false
    }
  }, [fetchActiveOrders, fetchTodayOrders])

  /*
   * ---------------------------------------------------------
   * LOGIN
   * ---------------------------------------------------------
   */

  const handleLogin = async (e) => {
    e.preventDefault()

    await unlockAlarmAudio()

    if (!restaurantId || !restaurantCode.trim() || !userId.trim() || !password.trim()) {
      alert('Enter the 5-digit Restaurant Code, Kitchen User ID, and password.')
      return
    }

    setLoading(true)

    try {
      const { data, error } = await supabase.rpc('authenticate_staff_login', {
        p_restaurant_id: String(restaurantId),
        p_restaurant_code: String(restaurantCode).trim(),
        p_user_id: String(userId).trim().toLowerCase(),
        p_password: String(password).trim(),
        p_role: 'kitchen',
      })

      if (error) throw error
      if (!data?.success) throw new Error(data?.message || 'Invalid restaurant credentials.')
      if (String(data.restaurantId) !== String(restaurantId)) {
        throw new Error('These credentials do not belong to this restaurant.')
      }

      setRestaurantCode(String(data.restaurantCode || restaurantCode).trim())
      setIsAuthenticated(true)

      await fetchAlarmSettings()
      await refreshKitchenData({ showLoader: true, announceNew: false })
    } catch (err) {
      console.error('[KITCHEN] Login error:', err)
      setIsAuthenticated(false)
      alert(err.message || 'Unable to login.')
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
    if (!isAuthenticated || !restaurantId) return

    let mounted = true

    const channel = supabase
      .channel(`kitchen-orders-${restaurantId}`)
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

          if (payload.eventType === 'INSERT') {
            const insertedId = String(payload?.new?.id || '')

            if (insertedId && !knownOrderIdsRef.current.has(insertedId)) {
              knownOrderIdsRef.current.add(insertedId)
              triggerNewOrderAlert(payload.new)
            }
          }

          await refreshKitchenData({ showLoader: false, announceNew: true })
        }
      )
      .subscribe((status) => {
        console.log('[KITCHEN REALTIME]', {
          status,
          restaurantId,
          url: typeof window !== 'undefined' ? window.location.href : '',
        })

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
      supabase.removeChannel(channel)
    }
  }, [
    isAuthenticated,
    restaurantId,
    refreshKitchenData,
    triggerNewOrderAlert,
  ])

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
      await refreshKitchenData({ showLoader: false, announceNew: true })
    }

    // Keep the active queue and today's total synchronized even when realtime
    // is unavailable or a browser temporarily suspends the websocket.
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
  }, [isAuthenticated, restaurantId, refreshKitchenData])

  /*
   * ---------------------------------------------------------
   * LIVE CLOCK + DAY CHANGE
   * ---------------------------------------------------------
   */

  useEffect(() => {
    if (!isAuthenticated) return

    const interval = setInterval(() => {
      setCurrentTime(Date.now())
    }, 1000)

    return () => clearInterval(interval)
  }, [isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated) return

    // Refresh shortly after midnight so the daily counter switches to the new
    // day even if the kitchen terminal is left open overnight.
    let lastDayKey = new Date().toDateString()

    const interval = window.setInterval(() => {
      const dayKey = new Date().toDateString()

      if (dayKey !== lastDayKey) {
        lastDayKey = dayKey
        knownOrderIdsRef.current = new Set()
        refreshKitchenData({ showLoader: false, announceNew: false })
      }
    }, 30000)

    return () => window.clearInterval(interval)
  }, [isAuthenticated, refreshKitchenData])

  /*
   * ---------------------------------------------------------
   * STATUS UPDATE
   * ---------------------------------------------------------
   */

  const setOrderStatus = async (orderId, newStatus) => {
    if (updatingOrder) return

    setUpdatingOrder(orderId)

    try {
      const { data, error } = await supabase.rpc('staff_update_order_status', {
        p_restaurant_id: String(restaurantId),
        p_restaurant_code: String(restaurantCode).trim(),
        p_user_id: String(userId).trim().toLowerCase(),
        p_password: String(password).trim(),
        p_role: 'kitchen',
        p_order_id: String(orderId),
        p_new_status: String(newStatus),
      })

      if (error) throw error
      if (!data?.success) throw new Error(data?.message || 'Unable to update order.')

      const updatedOrder = data.order
      setOrders((current) =>
        current.map((order) =>
          String(order.id) === String(orderId)
            ? (updatedOrder || { ...order, status: newStatus })
            : order
        ).filter((order) => !isFinishedStatus(order.status))
      )

      await fetchTodayOrders(false)
    } catch (error) {
      console.error('Status update error:', error)
      alert(`Unable to update order: ${error.message || 'Unknown error'}`)
    } finally {
      setUpdatingOrder(null)
    }
  }

  /*
   * ---------------------------------------------------------
   * FILTERING
   * ---------------------------------------------------------
   */

  const filteredOrders = orders.filter((order) => {
    const kitchenStatus = getKitchenStatus(order.status)
    const matchesStatus =
      statusFilter === 'all' || kitchenStatus === statusFilter

    const searchText = search.trim().toLowerCase()

    if (!searchText) {
      return matchesStatus
    }

    const tableNumber = String(order.table_number || '').toLowerCase()

    const orderId = String(order.id || '').toLowerCase()
    const orderNumber = String(getOrderNumber(order) || '').toLowerCase()

    const itemsText = Array.isArray(order.items)
      ? order.items
          .map((item) => {
            return [
              item?.name,
              item?.item_name,
              item?.notes,
              item?.note,
              item?.special_instructions,
            ]
              .filter(Boolean)
              .join(' ')
          })
          .join(' ')
          .toLowerCase()
      : ''

    const matchesSearch =
      tableNumber.includes(searchText) ||
      orderId.includes(searchText) ||
      orderNumber.includes(searchText) ||
      itemsText.includes(searchText)

    return matchesStatus && matchesSearch
  })

  /*
   * ---------------------------------------------------------
   * SORTING
   * ---------------------------------------------------------
   */

  const sortedOrders = [...filteredOrders].sort((a, b) => {
    const aTime = new Date(a.created_at || 0).getTime()
    const bTime = new Date(b.created_at || 0).getTime()

    return aTime - bTime
  })

  /*
   * ---------------------------------------------------------
   * COUNTS
   * ---------------------------------------------------------
   */

  const pendingCount = orders.filter(
    (order) => getKitchenStatus(order.status) === 'pending'
  ).length

  const preparingCount = orders.filter(
    (order) => getKitchenStatus(order.status) === 'preparing'
  ).length

  const readyCount = orders.filter(
    (order) => getKitchenStatus(order.status) === 'ready'
  ).length

  const todayDeliveredCount = todayOrders.filter((order) =>
    isFinishedStatus(order.status)
  ).length

  const todayActiveCount = todayOrders.filter((order) =>
    !isFinishedStatus(order.status)
  ).length

  /*
   * ---------------------------------------------------------
   * FULLSCREEN
   * ---------------------------------------------------------
   */

  const toggleFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen()
        setIsFullscreen(true)
      } else {
        await document.exitFullscreen()
        setIsFullscreen(false)
      }
    } catch (error) {
      console.error('Fullscreen error:', error)
    }
  }

  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(Boolean(document.fullscreenElement))
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
    }
  }, [])

  /*
   * ---------------------------------------------------------
   * LOGOUT / CLEANUP
   * ---------------------------------------------------------
   */

  const handleLogout = () => {
    clearNewOrderAlert()
    setIsAuthenticated(false)
    setOrders([])
    setTodayOrders([])
    setRestaurantCode('')
    setUserId('')
    setPassword('')
    setSearch('')
    setStatusFilter('all')
    setLastOrdersRefresh(null)
    setShowProfile(false)
    setLastTodayRefresh(null)
    knownOrderIdsRef.current = new Set()
    alarmUnlockedRef.current = false
  }

  useEffect(() => {
    return () => {
      if (newOrderAlertTimerRef.current) {
        window.clearTimeout(newOrderAlertTimerRef.current)
      }

      if (audioRef.current) {
        try {
          audioRef.current.pause()
        } catch {
          // Ignore media cleanup errors.
        }
      }

      if (audioContextRef.current) {
        try {
          audioContextRef.current.close()
        } catch {
          // Ignore audio cleanup errors.
        }
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
            <div className="text-4xl mb-3">🍳</div>

            <h1 className="text-xl font-black">
              Kitchen Terminal
            </h1>

            <p className="text-neutral-500 text-xs mt-1">
              Sign in to manage kitchen orders
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
            className="w-full bg-neutral-950 border border-orange-500/30 p-3 rounded-xl text-xs font-mono tracking-widest outline-none focus:border-red-500"
          />

          <input
            type="text"
            placeholder="User ID"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            required
            autoComplete="username"
            className="w-full bg-neutral-950 border border-neutral-800 p-3 rounded-xl text-xs font-mono outline-none focus:border-red-500"
          />

          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full bg-neutral-950 border border-neutral-800 p-3 rounded-xl text-xs font-mono outline-none focus:border-red-500"
          />

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 font-bold p-3 rounded-xl text-xs uppercase transition"
          >
            {loading ? 'Opening Kitchen...' : 'Open Queue 🍳'}
          </button>

          <p className="text-center text-[10px] text-neutral-600">
            Alarm audio is unlocked when you open the kitchen.
          </p>
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
      {/* PROFILE MODAL */}
      {showProfile && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-neutral-800 bg-neutral-900 shadow-2xl">
            <div className="flex items-center justify-between border-b border-neutral-800 p-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-red-400">
                  Staff Profile
                </p>
                <h2 className="mt-1 text-lg font-black text-white">
                  Kitchen Profile
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowProfile(false)}
                className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs font-bold text-neutral-400 hover:text-white"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 p-5">
              <div>
                <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-neutral-500">
                  Restaurant Code
                </p>
                <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-4 text-center">
                  <span className="font-mono text-2xl font-black tracking-[0.35em] text-red-300">
                    {restaurantCode || '-----'}
                  </span>
                </div>
                <p className="mt-2 text-[10px] text-neutral-500">
                  This is the 5-digit restaurant code used for this kitchen portal.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-neutral-500">
                    User ID
                  </p>
                  <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-xs font-mono text-white break-all">
                    {userId || '—'}
                  </div>
                </div>
                <div>
                  <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-neutral-500">
                    Role
                  </p>
                  <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-xs font-bold text-emerald-300">
                    Kitchen
                  </div>
                </div>
              </div>

              <div>
                <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-neutral-500">
                  Restaurant ID
                </p>
                <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-[11px] font-mono text-neutral-300 break-all">
                  {restaurantId || '—'}
                </div>
              </div>

              <div>
                <p className="mb-1 text-[10px] font-black uppercase tracking-wider text-neutral-500">
                  Access
                </p>
                <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-xs text-neutral-300">
                  Kitchen staff access for this restaurant.
                </div>
              </div>

              <div className="rounded-xl border border-neutral-800 bg-neutral-950/70 px-4 py-3 text-[10px] leading-5 text-neutral-500">
                🔒 Your password is never displayed in the profile section.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* NEW ORDER ALARM / ALERT */}

      {newOrderAlert && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-1.5rem)] max-w-xl">
          <div className="bg-red-600 border border-red-400 shadow-2xl shadow-red-950/50 rounded-2xl p-4 flex items-center gap-3">
            <div className="text-3xl animate-pulse">🔔</div>

            <div className="flex-1 min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-red-100/80 font-black">
                New Order Received
              </p>
              <p className="text-base sm:text-lg font-black text-white">
                Order #{newOrderAlert.orderNumber} · Table {newOrderAlert.table}
              </p>
              <p className="text-[10px] text-red-100/80 mt-0.5">
                Please start preparing the order.
              </p>
            </div>

            <button
              type="button"
              onClick={clearNewOrderAlert}
              className="shrink-0 bg-white/10 hover:bg-white/20 rounded-lg px-3 py-2 text-xs font-bold"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

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
                {isConnected ? '● Live' : '● Offline'}
              </span>

              <span
                className={`text-[10px] px-3 py-1 rounded-full border font-bold uppercase ${
                  alarmEnabled
                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                    : 'bg-neutral-900 text-neutral-500 border-neutral-800'
                }`}
              >
                {alarmEnabled ? '🔔 Alarm On' : '🔕 Alarm Off'}
              </span>
            </div>

            <h1 className="text-2xl font-black mt-2">
              Live Kitchen Orders
            </h1>

            <p className="text-[11px] text-neutral-500 mt-1">
              Orders update automatically in real time and through a fallback refresh.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setShowProfile(true)}
              className="bg-neutral-900 border border-neutral-800 hover:border-orange-500/40 text-orange-300 px-4 py-2 rounded-xl text-xs font-bold"
            >
              👤 Profile
            </button>

            <button
              onClick={() => refreshKitchenData({ showLoader: true, announceNew: true })}
              disabled={loading || todayOrdersLoading}
              className="bg-neutral-900 border border-neutral-800 hover:border-neutral-700 px-4 py-2 rounded-xl text-xs font-bold"
            >
              {loading || todayOrdersLoading ? 'Refreshing...' : '↻ Refresh'}
            </button>

            <button
              onClick={() => {
                unlockAlarmAudio()
                playNotificationSound()
              }}
              className="bg-neutral-900 border border-neutral-800 hover:border-red-500/30 text-red-400 px-4 py-2 rounded-xl text-xs font-bold"
            >
              🔔 Test Alarm
            </button>

            <button
              onClick={toggleFullscreen}
              className="bg-neutral-900 border border-neutral-800 hover:border-neutral-700 px-4 py-2 rounded-xl text-xs font-bold"
            >
              {isFullscreen ? '⛶ Exit Fullscreen' : '⛶ Fullscreen'}
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

      {/* DAILY ORDER SUMMARY */}

      <div className="max-w-7xl mx-auto bg-neutral-900 border border-red-500/20 rounded-3xl p-4 sm:p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-lg">📋</span>
              <h2 className="text-base sm:text-lg font-black">
                Today&apos;s Orders
              </h2>
            </div>
            <p className="text-[10px] sm:text-xs text-neutral-500 mt-1">
              Every order received today stays visible here, including orders already delivered by the waiter.
            </p>
          </div>

          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            <div className="bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-center min-w-24">
              <p className="text-[9px] uppercase text-neutral-500 font-bold">
                Total Today
              </p>
              <p className="text-xl sm:text-2xl font-black mt-1">
                {todayOrders.length}
              </p>
            </div>

            <div className="bg-neutral-950 border border-orange-500/20 rounded-xl px-4 py-3 text-center min-w-24">
              <p className="text-[9px] uppercase text-orange-500 font-bold">
                Active Today
              </p>
              <p className="text-xl sm:text-2xl font-black text-orange-400 mt-1">
                {todayActiveCount}
              </p>
            </div>

            <div className="bg-neutral-950 border border-emerald-500/20 rounded-xl px-4 py-3 text-center min-w-24">
              <p className="text-[9px] uppercase text-emerald-500 font-bold">
                Delivered
              </p>
              <p className="text-xl sm:text-2xl font-black text-emerald-400 mt-1">
                {todayDeliveredCount}
              </p>
            </div>
          </div>
        </div>

        <div className="mt-4 border-t border-neutral-800 pt-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <p className="text-[10px] uppercase tracking-wider text-neutral-500 font-black">
              Order Records
            </p>

            <p className="text-[9px] text-neutral-600">
              {todayOrdersLoading
                ? 'Refreshing…'
                : lastTodayRefresh
                ? `Updated ${formatTime(lastTodayRefresh)}`
                : 'Not refreshed yet'}
            </p>
          </div>

          {todayOrders.length === 0 ? (
            <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-8 text-center">
              <div className="text-4xl mb-3">🧾</div>
              <p className="text-sm font-bold text-neutral-300">
                No orders received today
              </p>
              <p className="text-[10px] text-neutral-600 mt-1">
                New orders will be added automatically.
              </p>
            </div>
          ) : (
            <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
              {todayOrders.map((order) => {
                const items = Array.isArray(order.items) ? order.items : []

                return (
                  <div
                    key={`today-${order.id}`}
                    className="bg-neutral-950/70 border border-neutral-800 rounded-2xl p-3 sm:p-4"
                  >
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm sm:text-base font-black text-white">
                            Order #{getOrderNumber(order)}
                          </span>

                          <span className="text-[10px] font-bold px-2 py-1 rounded-lg border bg-neutral-900 text-neutral-400 border-neutral-800">
                            Table {order.table_number || 'Takeaway'}
                          </span>

                          <span
                            className={`text-[10px] font-bold px-2 py-1 rounded-lg border uppercase ${getHistoryStatusClass(
                              order.status
                            )}`}
                          >
                            {getHistoryStatus(order.status)}
                          </span>
                        </div>

                        <p className="text-[10px] text-neutral-500 mt-1">
                          {formatDateTime(order.created_at)}
                          {order.payment_mode ? ` · ${order.payment_mode}` : ''}
                        </p>
                      </div>

                      <div className="text-left md:text-right shrink-0">
                        <p className="text-[9px] uppercase text-neutral-600 font-bold">
                          Order Total
                        </p>
                        <p className="text-sm sm:text-base font-black text-white mt-0.5">
                          {formatCurrency(getOrderAmount(order))}
                        </p>
                      </div>
                    </div>

                    <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                      {items.length === 0 ? (
                        <p className="text-[10px] text-neutral-600">
                          No item details stored for this order.
                        </p>
                      ) : (
                        items.map((item, index) => {
                          const quantity = item?.qty ?? item?.quantity ?? 1
                          const itemName =
                            item?.name || item?.item_name || 'Unnamed item'
                          const note =
                            item?.notes ||
                            item?.note ||
                            item?.special_instructions ||
                            ''

                          return (
                            <div
                              key={`today-${order.id}-item-${index}`}
                              className="bg-neutral-900/80 border border-neutral-800 rounded-xl p-3"
                            >
                              <div className="flex items-start gap-2">
                                <span className="min-w-7 h-7 px-1 rounded-lg bg-orange-500/10 text-orange-400 flex items-center justify-center text-[10px] font-black">
                                  ×{quantity}
                                </span>

                                <div className="min-w-0 flex-1">
                                  <p className="text-[10px] sm:text-xs text-neutral-200 font-bold break-words">
                                    {itemName}
                                  </p>
                                  {note && (
                                    <p className="text-[9px] text-yellow-300 mt-1 break-words">
                                      📝 {note}
                                    </p>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* SEARCH + FILTER */}

      <div className="max-w-7xl mx-auto bg-neutral-900 border border-neutral-800 rounded-2xl p-3">
        <div className="flex flex-col md:flex-row gap-3">
          <input
            type="search"
            placeholder="Search table, order ID, order number, or item..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="flex-1 bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-xs outline-none focus:border-red-500"
          />

          <div className="flex gap-2 overflow-x-auto">
            {[
              ['all', 'All'],
              ['pending', 'New'],
              ['preparing', 'Preparing'],
              ['ready', 'Ready'],
            ].map(([value, label]) => (
              <button
                key={value}
                onClick={() => setStatusFilter(value)}
                className={`px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap border transition ${
                  statusFilter === value
                    ? 'bg-red-600 border-red-600 text-white'
                    : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:text-white'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ORDER QUEUE */}

      <div className="max-w-7xl mx-auto">
        {sortedOrders.length === 0 ? (
          <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-12 text-center">
            <div className="text-5xl mb-4">🍽️</div>

            <h2 className="text-lg font-black">
              Kitchen Queue Is Empty
            </h2>

            <p className="text-xs text-neutral-500 mt-2">
              New orders will appear here automatically.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {sortedOrders.map((order) => {
              const age = getOrderAgeMinutes(order.created_at)
              const kitchenStatus = getKitchenStatus(order.status)

              const isOverdue =
                age >= 30 && kitchenStatus !== 'ready'

              const isWarning =
                age >= 20 && kitchenStatus !== 'ready'

              const items = Array.isArray(order.items)
                ? order.items
                : []

              return (
                <div
                  key={order.id}
                  className={`bg-neutral-900 border p-5 rounded-2xl flex flex-col justify-between space-y-4 transition ${getOrderBorder(
                    order
                  )}`}
                >
                  {/* ORDER HEADER */}

                  <div>
                    <div className="flex justify-between items-start border-b border-neutral-800 pb-3">
                      <div>
                        <p className="text-[9px] uppercase tracking-wider text-neutral-500 font-bold">
                          Table
                        </p>

                        <span className="text-xl font-black text-white">
                          {order.table_number || 'Takeaway'}
                        </span>

                        <p className="text-[10px] text-neutral-500 mt-1 font-bold">
                          Order #{getOrderNumber(order)}
                        </p>
                      </div>

                      <div className="text-right">
                        <span
                          className={`text-[10px] uppercase font-bold px-2 py-1 rounded ${
                            kitchenStatus === 'ready'
                              ? 'bg-emerald-500/20 text-emerald-400'
                              : kitchenStatus === 'preparing'
                              ? 'bg-orange-500/20 text-orange-400'
                              : 'bg-yellow-500/20 text-yellow-400'
                          }`}
                        >
                          {kitchenStatus}
                        </span>

                        <p className="text-[9px] text-neutral-600 mt-2 font-mono">
                          #{String(order.id).slice(-6)}
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
                          {formatTime(order.created_at)}
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

                    {/* WARNING */}

                    {isOverdue && (
                      <div className="mt-3 bg-red-950/40 border border-red-500/30 rounded-xl p-3">
                        <p className="text-[10px] text-red-400 font-black uppercase">
                          ⚠️ Preparation Overdue
                        </p>

                        <p className="text-[10px] text-red-300/70 mt-1">
                          This order has been waiting for more than 30
                          minutes.
                        </p>
                      </div>
                    )}

                    {isWarning && !isOverdue && (
                      <div className="mt-3 bg-orange-950/30 border border-orange-500/20 rounded-xl p-3">
                        <p className="text-[10px] text-orange-400 font-bold uppercase">
                          ⚠️ Long Waiting Order
                        </p>
                      </div>
                    )}

                    {/* ITEMS */}

                    <div className="space-y-2 mt-4">
                      {items.length === 0 ? (
                        <p className="text-xs text-neutral-500">
                          No items found
                        </p>
                      ) : (
                        items.map((item, i) => {
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
                                  ×{quantity}
                                </div>

                                <div className="flex-1 min-w-0">
                                  <p className="text-xs text-neutral-200 font-bold">
                                    {itemName}
                                  </p>

                                  {note && (
                                    <div className="mt-2 text-[10px] text-yellow-300 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-2 py-1.5">
                                      📝 {note}
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>
                          )
                        })
                      )}
                    </div>
                  </div>

                  {/* ACTIONS */}

                  <div className="pt-2 border-t border-neutral-800">
                    {kitchenStatus === 'pending' && (
                      <button
                        onClick={() =>
                          setOrderStatus(order.id, 'preparing')
                        }
                        disabled={updatingOrder === order.id}
                        className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-bold p-3 rounded-xl text-xs transition"
                      >
                        {updatingOrder === order.id
                          ? 'Starting...'
                          : 'Start Preparing 🍳'}
                      </button>
                    )}

                    {kitchenStatus === 'preparing' && (
                      <button
                        onClick={() =>
                          setOrderStatus(order.id, 'ready')
                        }
                        disabled={updatingOrder === order.id}
                        className="w-full bg-emerald-500 hover:bg-emerald-600 disabled:opacity-50 text-neutral-950 font-black p-3 rounded-xl text-xs transition"
                      >
                        {updatingOrder === order.id
                          ? 'Updating...'
                          : 'Mark Ready 🔔'}
                      </button>
                    )}

                    {kitchenStatus === 'ready' && (
                      <div className="space-y-2">
                        <div className="w-full text-center text-[11px] font-bold text-emerald-400 py-3 bg-emerald-950/20 rounded-xl border border-emerald-500/20">
                          ✓ Ready — Waiting for Waiter
                        </div>

                        <button
                          onClick={() =>
                            setOrderStatus(order.id, 'preparing')
                          }
                          disabled={updatingOrder === order.id}
                          className="w-full bg-neutral-950 border border-neutral-800 hover:border-orange-500/30 text-neutral-400 hover:text-orange-400 font-bold p-2 rounded-xl text-[10px] transition"
                        >
                          ↩ Reopen Order
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* FOOTER */}

      <div className="max-w-7xl mx-auto text-center pt-2">
        <p className="text-[9px] text-neutral-700 uppercase tracking-widest">
          Digital Dining • Kitchen Display System
          {lastOrdersRefresh
            ? ` • Queue updated ${formatTime(lastOrdersRefresh)}`
            : ''}
        </p>
      </div>
    </div>
  )
}
