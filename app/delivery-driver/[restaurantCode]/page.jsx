'use client'

import { use, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useMobileViewportLock } from '@/lib/useMobileViewportLock'
import DeliveryReturnPickupTasks from '@/app/components/DeliveryReturnPickupTasks'
import { useLiveDeliveryRefresh } from '@/lib/useLiveDeliveryRefresh'
import { usePersistentPortalAlarm } from '@/lib/usePersistentPortalAlarm'
import { appConfirm } from '@/lib/appDialog'

function money(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
}

function labelStatus(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function formatDate(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function distanceMeters(lat1, lng1, lat2, lng2) {
  const firstLat = Number(lat1)
  const firstLng = Number(lng1)
  const secondLat = Number(lat2)
  const secondLng = Number(lng2)

  if (![firstLat, firstLng, secondLat, secondLng].every(Number.isFinite)) {
    return Number.POSITIVE_INFINITY
  }

  const toRadians = (value) => (value * Math.PI) / 180
  const earthRadiusMeters = 6371008.8
  const dLat = toRadians(secondLat - firstLat)
  const dLng = toRadians(secondLng - firstLng)

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(firstLat)) * Math.cos(toRadians(secondLat)) * Math.sin(dLng / 2) ** 2

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(a))
}

const DELIVERY_FAILURE_REASONS = [
  ['customer_unavailable', 'Customer unavailable'],
  ['customer_rejected', 'Customer rejected order'],
  ['unable_to_contact', 'Unable to contact customer'],
  ['wrong_address', 'Wrong / incomplete address'],
  ['payment_issue', 'COD / payment issue'],
  ['other', 'Other'],
]

// Simple inline icons so the portal does not depend on emoji rendering.
function Icon({ name, className = 'h-5 w-5' }) {
  const paths = {
    home: <><path d="m3 10 9-7 9 7v10H3z" /><path d="M9 20v-7h6v7" /></>,
    route: <><circle cx="6" cy="19" r="2" /><circle cx="18" cy="5" r="2" /><path d="M8 19h8a4 4 0 0 0 0-8H8a4 4 0 0 1 0-8h8" /></>,
    bell: <><path d="M6 8a6 6 0 1 1 12 0c0 7 3 8 3 8H3s3-1 3-8" /><path d="M10 21h4" /></>,
    box: <><path d="M3 7l9-4 9 4-9 4-9-4z" /><path d="M3 7v10l9 4 9-4V7" /><path d="M12 11v10" /></>,
    users: <><circle cx="9" cy="8" r="3.5" /><path d="M2 20c0-3.5 3-6 7-6s7 2.5 7 6" /><path d="M16 4a3.5 3.5 0 0 1 0 7M22 20c0-2.6-1.6-4.6-4-5.5" /></>,
    truck: <><path d="M3 7h11v9H3z" /><path d="M14 10h4l3 3v3h-7" /><circle cx="7" cy="17.5" r="1.5" /><circle cx="17" cy="17.5" r="1.5" /></>,
    cash: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></>,
    menu: <><path d="M4 7h16M4 12h16M4 17h16" /></>,
    refresh: <><path d="M3 12a9 9 0 0 1 15-6l2 2" /><path d="M20 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6l-2-2" /><path d="M4 21v-5h5" /></>,
    phone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.5 2.1L8 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2z" />,
    chat: <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" />,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.7" /><path d="M12 17h.01" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    check: <path d="m5 12 5 5 9-10" />,
    close: <path d="M6 6l12 12M18 6 6 18" />,
    logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5M21 12H9" /></>,
    up: <path d="m6 15 6-6 6 6" />,
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] || paths.home}
    </svg>
  )
}

function DeliveryResultPanel({ order, sessionToken, disabled = false, onCompleted }) {
  const [result, setResult] = useState('delivered')
  const [failureReason, setFailureReason] = useState('')
  const [note, setNote] = useState('')
  const [files, setFiles] = useState([])
  const [previews, setPreviews] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [localError, setLocalError] = useState('')

  useEffect(() => {
    const nextPreviews = files.map((file) => ({
      name: file.name,
      url: URL.createObjectURL(file),
    }))
    setPreviews(nextPreviews)
    return () => {
      nextPreviews.forEach((preview) => URL.revokeObjectURL(preview.url))
    }
  }, [files])

  const handleFiles = (event) => {
    const selected = Array.from(event.target.files || [])
    if (selected.length > 5) {
      setLocalError('You can upload up to 5 photos per delivery attempt.')
      event.target.value = ''
      return
    }
    const allowedTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])
    const invalid = selected.find(
      (file) => !allowedTypes.has(file.type) || file.size > 5 * 1024 * 1024
    )
    if (invalid) {
      setLocalError('Each photo must be JPG, PNG or WEBP and no larger than 5 MB.')
      event.target.value = ''
      return
    }
    setLocalError('')
    setFiles(selected)
  }

  const submitResult = async () => {
    if (!sessionToken || submitting || disabled) return
    if (result === 'not_delivered' && !failureReason) {
      setLocalError('Choose a reason for Not Delivered.')
      return
    }

    const confirmation = await appConfirm(
      result === 'delivered'
        ? `Confirm ${order.order_code} was delivered?`
        : `Submit a Not Delivered attempt for ${order.order_code}?`,
      {
        title: result === 'delivered' ? 'Confirm Delivery' : 'Submit Delivery Attempt',
        confirmText: result === 'delivered' ? 'Confirm Delivered' : 'Submit Attempt',
      }
    )
    if (!confirmation) return

    setSubmitting(true)
    setLocalError('')

    try {
      const formData = new FormData()
      formData.append('sessionToken', sessionToken)
      formData.append('orderId', String(order.id))
      formData.append('result', result)
      formData.append('failureReason', result === 'not_delivered' ? failureReason : '')
      formData.append('note', note.trim())
      files.forEach((file) => formData.append('files', file))

      const response = await fetch('/api/delivery/driver-proof', {
        method: 'POST',
        body: formData,
        cache: 'no-store',
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || 'Unable to submit the delivery result.')
      }

      setFiles([])
      setNote('')
      setFailureReason('')
      setResult('delivered')
      onCompleted?.(
        result === 'delivered'
          ? 'Delivery completed and proof sent to the Delivery Dashboard.'
          : 'Not Delivered attempt sent to the Delivery Dashboard.'
      )
    } catch (submitError) {
      console.error('Delivery proof submit error:', submitError)
      setLocalError(submitError?.message || 'Unable to submit the delivery result.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="mt-4 rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
      <p className="text-sm font-bold text-slate-900">Delivery result</p>
      <p className="mt-1 text-xs leading-5 text-slate-500">
        Confirm delivery or report a failed attempt. Photos are sent to the store dashboard.
      </p>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => {
            setResult('delivered')
            setFailureReason('')
            setLocalError('')
          }}
          className={`h-12 rounded-xl text-sm font-bold transition ${
            result === 'delivered'
              ? 'bg-emerald-600 text-white'
              : 'bg-white text-slate-600 ring-1 ring-slate-200'
          }`}
        >
          Delivered
        </button>
        <button
          type="button"
          onClick={() => {
            setResult('not_delivered')
            setLocalError('')
          }}
          className={`h-12 rounded-xl text-sm font-bold transition ${
            result === 'not_delivered'
              ? 'bg-rose-600 text-white'
              : 'bg-white text-slate-600 ring-1 ring-slate-200'
          }`}
        >
          Not delivered
        </button>
      </div>

      {result === 'not_delivered' && (
        <label className="mt-4 block">
          <span className="mb-1.5 block text-xs font-bold text-slate-600">Reason</span>
          <select
            value={failureReason}
            onChange={(event) => setFailureReason(event.target.value)}
            className="h-12 w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900 outline-none focus:border-rose-500 sm:text-sm"
          >
            <option value="">Select reason</option>
            {DELIVERY_FAILURE_REASONS.map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </label>
      )}

      <label className="mt-4 block">
        <span className="mb-1.5 block text-xs font-bold text-slate-600">
          Photos <span className="font-normal text-slate-400">(optional, up to 5)</span>
        </span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={handleFiles}
          className="block w-full rounded-xl border border-dashed border-slate-300 bg-white px-3 py-3 text-xs text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white"
        />
      </label>

      {previews.length > 0 && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          {previews.map((preview) => (
            <div key={`${preview.name}-${preview.url}`} className="overflow-hidden rounded-xl ring-1 ring-slate-200">
              <img src={preview.url} alt={preview.name} className="aspect-square w-full object-cover" />
            </div>
          ))}
        </div>
      )}

      <label className="mt-4 block">
        <span className="mb-1.5 block text-xs font-bold text-slate-600">Note</span>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value.slice(0, 500))}
          rows={3}
          placeholder={result === 'delivered' ? 'Optional note…' : 'Describe the failed attempt…'}
          className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-3 text-base text-slate-900 outline-none focus:border-emerald-500 sm:text-sm"
        />
        <p className="mt-1 text-right text-[11px] text-slate-400">{note.length}/500</p>
      </label>

      {localError && (
        <div role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2.5 text-xs font-semibold text-rose-700">
          {localError}
        </div>
      )}

      <button
        type="button"
        onClick={submitResult}
        disabled={submitting || disabled}
        className={`mt-4 h-13 w-full rounded-xl py-3.5 text-sm font-bold text-white disabled:opacity-50 ${
          result === 'delivered' ? 'bg-emerald-600' : 'bg-rose-600'
        }`}
      >
        {submitting
          ? 'Uploading…'
          : result === 'delivered'
            ? 'Confirm delivered'
            : 'Submit not delivered'}
      </button>
    </div>
  )
}

export default function DeliveryDriverPortal({ params }) {
  const unwrappedParams = use(params)
  useMobileViewportLock()

  const restaurantCode = String(
    unwrappedParams?.restaurantCode || unwrappedParams?.restaurantcode || ''
  ).trim()

  const storageKey = `digitaldining_delivery_driver_session_${restaurantCode}`

  const [sessionToken, setSessionToken] = useState('')
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [portalData, setPortalData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [loggingIn, setLoggingIn] = useState(false)
  const [updatingOrderId, setUpdatingOrderId] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  const [codData, setCodData] = useState(null)
  const [codLoading, setCodLoading] = useState(false)
  const [codSubmitting, setCodSubmitting] = useState(false)
  const [codAmount, setCodAmount] = useState('')
  const [codNote, setCodNote] = useState('')
  const [codError, setCodError] = useState('')

  const [gpsStatus, setGpsStatus] = useState('idle')
  const [gpsMessage, setGpsMessage] = useState('')
  const [gpsLastSentAt, setGpsLastSentAt] = useState('')
  const [gpsAccuracy, setGpsAccuracy] = useState(null)
  const [gpsRestartNonce, setGpsRestartNonce] = useState(0)

  // Workspace UI only: which tab is open and what the search box filters.
  const [driverView, setDriverView] = useState('tracking')
  const [driverSearch, setDriverSearch] = useState('')
  const [moreOpen, setMoreOpen] = useState(false)

  const gpsWatchRef = useRef(null)
  const gpsSendingRef = useRef(false)
  const gpsLastSentRef = useRef(0)
  const gpsLastCoordsRef = useRef(null)

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey)
      if (saved) setSessionToken(saved)
    } catch {
      // Ignore unavailable local storage.
    }
    setLoading(false)
  }, [storageKey])

  const loadPortal = async (tokenOverride = '') => {
    const token = String(tokenOverride || sessionToken || '').trim()
    if (!token) {
      setPortalData(null)
      return
    }
    try {
      const { data, error: rpcError } = await supabase.rpc('get_delivery_driver_portal_data', {
        p_session_token: token,
      })
      if (rpcError) throw rpcError
      if (!data?.success) throw new Error(data?.message || 'Driver session is invalid.')
      setPortalData(data)
      setError('')
    } catch (loadError) {
      console.error('Driver portal load error:', loadError)
      setPortalData(null)
      setSessionToken('')
      try {
        localStorage.removeItem(storageKey)
      } catch {
        // Ignore unavailable local storage.
      }
      setError(loadError?.message || 'Your Driver Portal session expired. Please sign in again.')
    }
  }

  const loadCodSummary = async (tokenOverride = '', quiet = false) => {
    const token = String(tokenOverride || sessionToken || '').trim()
    if (!token) {
      setCodData(null)
      return
    }
    if (!quiet) setCodLoading(true)
    setCodError('')
    try {
      const { data, error: rpcError } = await supabase.rpc('delivery_driver_get_cod_summary', {
        p_session_token: token,
      })
      if (rpcError) throw rpcError
      if (!data?.success) throw new Error(data?.message || 'Unable to load COD cash summary.')
      setCodData(data)
    } catch (codLoadError) {
      console.error('Driver COD summary error:', codLoadError)
      setCodError(codLoadError?.message || 'Unable to load COD cash summary.')
    } finally {
      setCodLoading(false)
    }
  }

  const submitCodSettlement = async (event) => {
    event.preventDefault()
    if (!sessionToken || codSubmitting) return

    const amount = Number(codAmount)
    const summary = codData?.summary || {}
    const available = Math.max(
      Number(summary.cash_due || 0) - Number(summary.pending_handover || 0),
      0
    )

    if (!Number.isFinite(amount) || amount <= 0) {
      setCodError('Enter a valid cash handover amount greater than 0.')
      return
    }
    if (amount > available + 0.001) {
      setCodError(`You can submit up to ${money(available)} based on your current COD cash due.`)
      return
    }

    setCodSubmitting(true)
    setCodError('')
    setMessage('')

    try {
      const { data, error: rpcError } = await supabase.rpc('delivery_driver_submit_cod_settlement', {
        p_session_token: sessionToken,
        p_amount: amount,
        p_note: String(codNote || '').trim(),
      })
      if (rpcError) throw rpcError
      if (!data?.success) throw new Error(data?.message || 'Unable to submit COD cash handover.')

      setCodAmount('')
      setCodNote('')
      setMessage(data?.message || 'COD cash handover submitted for Manager/Owner confirmation.')
      await loadCodSummary('', true)
    } catch (submitError) {
      console.error('Driver COD settlement submit error:', submitError)
      setCodError(submitError?.message || 'Unable to submit COD cash handover.')
    } finally {
      setCodSubmitting(false)
    }
  }

  useEffect(() => {
    if (!sessionToken) return
    loadPortal()
    loadCodSummary()
    const codInterval = window.setInterval(() => {
      loadCodSummary('', true)
    }, 15000)
    return () => window.clearInterval(codInterval)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionToken])

  useLiveDeliveryRefresh(() => loadPortal(), Boolean(sessionToken), 1000)

  const handleLogin = async (event) => {
    event.preventDefault()
    if (loggingIn) return

    const cleanUserId = userId.trim().toLowerCase()
    if (cleanUserId.length < 3 || password.length < 6) {
      setError('Enter your Driver User ID and password.')
      return
    }

    setLoggingIn(true)
    setError('')
    setMessage('')

    try {
      const { data, error: rpcError } = await supabase.rpc('delivery_driver_login', {
        p_restaurant_code: restaurantCode,
        p_user_id: cleanUserId,
        p_password: password,
      })
      if (rpcError) throw rpcError
      if (!data?.success || !data?.session_token) {
        throw new Error(data?.message || 'Driver login failed.')
      }

      const token = String(data.session_token)
      try {
        localStorage.setItem(storageKey, token)
      } catch {
        // Continue even if storage is unavailable.
      }

      setSessionToken(token)
      setPassword('')
      setMessage(`Welcome ${data?.driver?.name || 'Driver'}.`)

      await Promise.all([loadPortal(token), loadCodSummary(token, true)])
    } catch (loginError) {
      console.error('Delivery driver login error:', loginError)
      setError(loginError?.message || 'Driver login failed.')
    } finally {
      setLoggingIn(false)
    }
  }

  const logout = async () => {
    const token = sessionToken
    try {
      if (token) {
        await supabase.rpc('delivery_driver_logout', { p_session_token: token })
      }
    } catch (logoutError) {
      console.error('Driver logout error:', logoutError)
    } finally {
      try {
        localStorage.removeItem(storageKey)
      } catch {
        // Ignore.
      }
      setSessionToken('')
      setPortalData(null)
      setCodData(null)
      setCodAmount('')
      setCodNote('')
      setCodError('')
      setUserId('')
      setPassword('')
      setMessage('')
      setError('')
      setMoreOpen(false)
    }
  }

  const updateStatus = async (order, nextStatus) => {
    if (!sessionToken || updatingOrderId) return

    const confirmation = await appConfirm(
      nextStatus === 'out_for_delivery'
        ? `Start delivery for ${order.order_code}?`
        : `Mark ${order.order_code} as delivered?`,
      {
        title: nextStatus === 'out_for_delivery' ? 'Start Delivery' : 'Confirm Delivered',
        confirmText: nextStatus === 'out_for_delivery' ? 'Start Delivery' : 'Mark Delivered',
      }
    )
    if (!confirmation) return

    setUpdatingOrderId(order.id)
    setError('')
    setMessage('')

    try {
      const { data, error: rpcError } = await supabase.rpc('delivery_driver_update_order_status', {
        p_session_token: sessionToken,
        p_order_id: order.id,
        p_new_status: nextStatus,
      })
      if (rpcError) throw rpcError
      if (!data?.success) throw new Error(data?.message || 'Unable to update order.')

      setMessage(
        nextStatus === 'out_for_delivery'
          ? 'Order marked Out for Delivery.'
          : 'Order marked Delivered.'
      )
      await loadPortal()
    } catch (updateError) {
      console.error('Driver order update error:', updateError)
      setError(updateError?.message || 'Unable to update order.')
    } finally {
      setUpdatingOrderId('')
    }
  }

  const orders = Array.isArray(portalData?.orders) ? portalData.orders : []

  const activeOrders = useMemo(
    () =>
      orders.filter(
        (order) => !['delivered', 'cancelled'].includes(String(order.order_status || ''))
      ),
    [orders]
  )

  // DELIVERY BOY ALARM: continues while ANY assigned order is still packed.
  const waitingToStartOrders = useMemo(
    () =>
      orders.filter(
        (order) => String(order.order_status || '').toLowerCase() === 'packed'
      ),
    [orders]
  )

  const {
    enabled: driverAlarmEnabled,
    active: driverAlarmActive,
    enable: enableDriverAlarm,
    disable: disableDriverAlarm,
  } = usePersistentPortalAlarm({
    active: Boolean(sessionToken && waitingToStartOrders.length > 0),
    repeatMs: 1700,
    notificationTitle: 'Start Delivery Required',
    notificationBody:
      waitingToStartOrders.length === 1
        ? `${waitingToStartOrders[0]?.order_code || '1 order'} is ready. Press Start Delivery.`
        : `${waitingToStartOrders.length} assigned orders are waiting for Start Delivery.`,
  })

  const recentOrders = useMemo(
    () =>
      orders.filter((order) =>
        ['delivered', 'cancelled'].includes(String(order.order_status || ''))
      ),
    [orders]
  )

  const normalizeMobile = (value) => String(value || '').replace(/\D/g, '')

  const liveTrackingOrder = useMemo(
    () =>
      activeOrders.find((order) => String(order.order_status || '') === 'out_for_delivery') || null,
    [activeOrders]
  )

  // Same customer mobile with several Out-for-Delivery orders: share GPS to all of them.
  const liveTrackingOrders = useMemo(() => {
    if (!liveTrackingOrder) return []
    const primaryMobile = normalizeMobile(liveTrackingOrder.customer_mobile)
    if (!primaryMobile) return [liveTrackingOrder]
    return activeOrders.filter(
      (order) =>
        String(order.order_status || '') === 'out_for_delivery' &&
        normalizeMobile(order.customer_mobile) === primaryMobile
    )
  }, [activeOrders, liveTrackingOrder])

  const liveTrackingOrderIds = useMemo(
    () => [
      ...new Set(liveTrackingOrders.map((order) => String(order?.id || '')).filter(Boolean)),
    ],
    [liveTrackingOrders]
  )

  const liveTrackingOrderIdsKey = liveTrackingOrderIds.join('|')

  useEffect(() => {
    if (!sessionToken || liveTrackingOrderIds.length === 0) {
      setGpsStatus('idle')
      setGpsMessage('')
      setGpsLastSentAt('')
      setGpsAccuracy(null)
      gpsLastSentRef.current = 0
      gpsLastCoordsRef.current = null
      return
    }

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsStatus('error')
      setGpsMessage('Live GPS is not supported on this device. Open the portal on a GPS-enabled phone.')
      return
    }

    const token = sessionToken
    const orderIds = [...liveTrackingOrderIds]
    let disposed = false

    gpsLastSentRef.current = 0
    gpsLastCoordsRef.current = null
    setGpsStatus('requesting')
    setGpsMessage('Allow precise location access to share your live delivery position.')

    const sendPosition = async (position) => {
      if (disposed || !position?.coords) return

      const latitude = Number(position.coords.latitude)
      const longitude = Number(position.coords.longitude)
      const accuracy = Number(position.coords.accuracy)
      const heading = Number(position.coords.heading)
      const speed = Number(position.coords.speed)

      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return

      const now = Date.now()
      const previous = gpsLastCoordsRef.current
      const elapsed = now - Number(gpsLastSentRef.current || 0)
      const moved = previous
        ? distanceMeters(previous.latitude, previous.longitude, latitude, longitude)
        : Number.POSITIVE_INFINITY

      if (elapsed < 4000) return
      if (elapsed < 20000 && moved < 5) return
      if (gpsSendingRef.current) return

      gpsSendingRef.current = true

      try {
        const updateResults = await Promise.all(
          orderIds.map(async (orderId) => {
            const { data, error: rpcError } = await supabase.rpc(
              'delivery_driver_update_live_location',
              {
                p_session_token: token,
                p_order_id: orderId,
                p_latitude: latitude,
                p_longitude: longitude,
                p_accuracy_m: Number.isFinite(accuracy) ? accuracy : null,
                p_heading: Number.isFinite(heading) ? heading : null,
                p_speed_mps: Number.isFinite(speed) ? speed : null,
              }
            )
            if (rpcError) throw rpcError
            if (!data?.success) {
              throw new Error(
                data?.message || `Unable to share live GPS location for order ${orderId}.`
              )
            }
            return data
          })
        )

        const latestLocation =
          updateResults.find((row) => row?.location)?.location || null

        gpsLastSentRef.current = now
        gpsLastCoordsRef.current = { latitude, longitude }
        setGpsStatus('live')
        setGpsMessage(
          orderIds.length > 1
            ? `Live location is being shared with ${orderIds.length} orders on the same customer mobile.`
            : 'Live location is being shared with this customer.'
        )
        setGpsLastSentAt(latestLocation?.captured_at || new Date().toISOString())
        setGpsAccuracy(Number.isFinite(accuracy) ? accuracy : null)
      } catch (locationUpdateError) {
        console.error('Driver live GPS update error:', locationUpdateError)
        setGpsStatus('error')
        setGpsMessage(locationUpdateError?.message || 'Unable to share live GPS location.')
      } finally {
        gpsSendingRef.current = false
      }
    }

    const watchId = navigator.geolocation.watchPosition(
      sendPosition,
      (geoError) => {
        if (disposed) return
        console.error('Driver live GPS error:', geoError)
        setGpsStatus('error')
        if (geoError?.code === 1) {
          setGpsMessage(
            'Location permission was denied. Allow precise location for this site in your phone settings, then tap Retry GPS.'
          )
        } else if (geoError?.code === 2) {
          setGpsMessage(
            'Your phone cannot determine its location. Turn on GPS/location services and try again.'
          )
        } else {
          setGpsMessage('Live GPS timed out. Keep location services on and tap Retry GPS.')
        }
      },
      { enableHighAccuracy: true, maximumAge: 3000, timeout: 20000 }
    )

    gpsWatchRef.current = watchId

    return () => {
      disposed = true
      try {
        navigator.geolocation.clearWatch(watchId)
      } catch {
        // Ignore browser cleanup races.
      }
      if (gpsWatchRef.current === watchId) gpsWatchRef.current = null
      gpsSendingRef.current = false

      orderIds.forEach((orderId) => {
        void supabase
          .rpc('delivery_driver_stop_live_location', {
            p_session_token: token,
            p_order_id: orderId,
          })
          .then(({ error: stopError }) => {
            if (stopError) console.warn('Driver live GPS stop warning:', stopError)
          })
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionToken, liveTrackingOrderIdsKey, gpsRestartNonce])

  // ===== LOGIN SCREEN =====
  if (loading) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-slate-50 px-4 text-slate-500">
        <div className="flex flex-col items-center gap-3">
          <span className="h-9 w-9 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-600" />
          <p className="text-sm font-semibold">Loading driver portal…</p>
        </div>
      </main>
    )
  }

  if (!sessionToken || !portalData) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-slate-950 px-5 py-10 text-white">
        <div className="w-full max-w-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-emerald-500/15 text-emerald-400">
            <Icon name="truck" className="h-8 w-8" />
          </div>
          <p className="mt-6 text-center text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-400">
            Digital Dine · Driver
          </p>
          <h1 className="mt-2 text-center text-2xl font-black">Driver sign in</h1>
          <p className="mt-2 text-center text-sm leading-6 text-slate-400">
            Use the Driver User ID and password given by your restaurant.
          </p>

          <form onSubmit={handleLogin} className="mt-8 space-y-4">
            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-400">Driver User ID</span>
              <input
                value={userId}
                onChange={(event) => setUserId(event.target.value)}
                autoComplete="username"
                placeholder="driver01"
                className="h-13 w-full rounded-xl border border-slate-800 bg-slate-900 px-4 text-base text-white outline-none placeholder:text-slate-600 focus:border-emerald-500 sm:text-sm"
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-semibold text-slate-400">Password</span>
              <input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                placeholder="••••••••"
                className="h-13 w-full rounded-xl border border-slate-800 bg-slate-900 px-4 text-base text-white outline-none placeholder:text-slate-600 focus:border-emerald-500 sm:text-sm"
              />
            </label>

            {error && (
              <div role="alert" className="rounded-xl bg-rose-500/10 px-4 py-3 text-xs font-semibold leading-5 text-rose-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loggingIn}
              className="h-14 w-full rounded-xl bg-emerald-600 text-sm font-bold text-white disabled:opacity-50"
            >
              {loggingIn ? 'Signing in…' : 'Open driver portal'}
            </button>
          </form>

          <p className="mt-6 text-center text-[11px] leading-5 text-slate-500">
            Five failed attempts temporarily lock the account for 15 minutes.
          </p>
        </div>
      </main>
    )
  }

  // ===== DERIVED DATA =====
  const driver = portalData.driver || {}
  const restaurant = portalData.restaurant || {}
  const codSummary = codData?.summary || {}
  const codSettlements = Array.isArray(codData?.settlements) ? codData.settlements : []
  const codCollections = Array.isArray(codData?.collections) ? codData.collections : []
  const codCashDue = Number(codSummary.cash_due || 0)
  const codPendingHandover = Number(codSummary.pending_handover || 0)
  const codAvailableToSubmit = Math.max(codCashDue - codPendingHandover, 0)
  const completedCount = recentOrders.filter((o) => String(o.order_status || '') === 'delivered').length

  const searchTerm = driverSearch.trim().toLowerCase()

  const orderAddress = (order) =>
    [order?.address_line1, order?.address_line2, order?.landmark, order?.city, order?.state, order?.pincode]
      .filter(Boolean)
      .join(', ')

  const matchesSearch = (order) => {
    if (!searchTerm) return true
    const haystack = [
      order?.order_code,
      order?.customer_name,
      order?.customer_mobile,
      order?.alternate_mobile,
      orderAddress(order),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase()
    return haystack.includes(searchTerm)
  }

  const visibleActiveOrders = activeOrders.filter(matchesSearch)
  const visibleRecentOrders = recentOrders.filter(matchesSearch)

  const activeCustomers = activeOrders.filter(matchesSearch).map((order) => ({
    orderId: order.id,
    orderCode: order.order_code,
    name: order.customer_name || 'Customer',
    mobile: order.customer_mobile || '',
    address: orderAddress(order),
    status: order.order_status,
  }))

  const restaurantPickupAddress =
    [restaurant.address, restaurant.address_line1, restaurant.address_line2, restaurant.city, restaurant.state, restaurant.pincode]
      .filter(Boolean)
      .join(', ') ||
    restaurant.name ||
    'Store pickup'

  const tabs = [
    { key: 'tracking', label: 'Trips', icon: 'route', badge: activeOrders.length },
    { key: 'assigned', label: 'Assigned', icon: 'box', badge: activeOrders.length },
    { key: 'cod', label: 'Cash', icon: 'cash', badge: 0 },
    { key: 'inbox', label: 'Alerts', icon: 'bell', badge: waitingToStartOrders.length },
  ]

  const moreItems = [
    { key: 'dashboard', label: 'Dashboard', icon: 'home', hint: 'Shift summary and GPS status' },
    { key: 'orders', label: 'Order history', icon: 'box', hint: 'Active and completed orders' },
    { key: 'customers', label: 'Customers', icon: 'users', hint: 'Call or message on your route' },
    { key: 'returns', label: 'Return pickups', icon: 'truck', hint: 'Collections assigned by the store' },
    { key: 'help', label: 'Help', icon: 'help', hint: 'Guidance for delivery, GPS and COD' },
    { key: 'settings', label: 'Settings', icon: 'settings', hint: 'Profile, alarm and sign out' },
  ]

  const viewTitles = {
    dashboard: 'Dashboard',
    tracking: 'Trips',
    inbox: 'Alerts',
    orders: 'Order history',
    customers: 'Customers',
    assigned: 'Assigned orders',
    cod: 'Cash handover',
    returns: 'Return pickups',
    help: 'Help',
    settings: 'Settings',
  }

  const isMoreView = moreItems.some((item) => item.key === driverView)
  const activeTabKey = isMoreView ? 'more' : driverView

  // ===== REUSABLE BLOCKS =====
  const renderAlarmCard = () => (
    <div
      className={`rounded-2xl p-4 ring-1 ${
        driverAlarmActive
          ? 'bg-rose-50 ring-rose-200'
          : driverAlarmEnabled
            ? 'bg-emerald-50 ring-emerald-200'
            : 'bg-white ring-slate-200'
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className={`text-sm font-bold ${driverAlarmActive ? 'text-rose-700' : driverAlarmEnabled ? 'text-emerald-700' : 'text-slate-900'}`}>
            {driverAlarmActive
              ? 'Alarm ringing'
              : driverAlarmEnabled
                ? 'Alarm ready'
                : 'Delivery alarm is off'}
          </p>
          <p className="mt-1 text-xs leading-5 text-slate-600">
            {driverAlarmActive
              ? `${waitingToStartOrders.length} packed order${waitingToStartOrders.length === 1 ? '' : 's'} waiting for Start Delivery.`
              : driverAlarmEnabled
                ? 'You will be alerted when a packed order needs Start Delivery.'
                : 'Turn it on so packed orders alert you until you start them.'}
          </p>
        </div>
        <button
          type="button"
          onClick={driverAlarmEnabled ? disableDriverAlarm : enableDriverAlarm}
          className={`h-10 shrink-0 rounded-xl px-4 text-xs font-bold ${
            driverAlarmEnabled ? 'bg-slate-900 text-white' : 'bg-emerald-600 text-white'
          }`}
        >
          {driverAlarmEnabled ? 'Turn off' : 'Turn on'}
        </button>
      </div>
    </div>
  )

  const renderGpsCard = () =>
    liveTrackingOrder ? (
      <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-900">Live location</p>
            <p className="mt-0.5 truncate text-xs text-slate-500">Shared for {liveTrackingOrder.order_code}</p>
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold ${
              gpsStatus === 'live'
                ? 'bg-emerald-50 text-emerald-700'
                : gpsStatus === 'requesting'
                  ? 'bg-amber-50 text-amber-700'
                  : gpsStatus === 'error'
                    ? 'bg-rose-50 text-rose-700'
                    : 'bg-slate-100 text-slate-500'
            }`}
          >
            {gpsStatus === 'live'
              ? '● Live'
              : gpsStatus === 'requesting'
                ? 'Finding GPS…'
                : gpsStatus === 'error'
                  ? 'Needs attention'
                  : 'Idle'}
          </span>
        </div>

        <p
          className={`mt-3 rounded-xl px-3 py-2.5 text-xs leading-5 ${
            gpsStatus === 'error' ? 'bg-rose-50 text-rose-700' : 'bg-slate-50 text-slate-600'
          }`}
        >
          {gpsMessage || 'Waiting for delivery to start.'}
        </p>

        {gpsStatus === 'live' && (
          <p className="mt-2 text-[11px] text-slate-400">
            {gpsAccuracy !== null && `Accuracy ±${Math.round(Number(gpsAccuracy))} m`}
            {gpsAccuracy !== null && gpsLastSentAt && ' · '}
            {gpsLastSentAt &&
              `Last sent ${new Date(gpsLastSentAt).toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}`}
          </p>
        )}

        {gpsStatus === 'error' && (
          <button
            type="button"
            onClick={() => setGpsRestartNonce((value) => value + 1)}
            className="mt-3 h-11 w-full rounded-xl bg-sky-600 text-sm font-bold text-white"
          >
            Retry GPS
          </button>
        )}
      </section>
    ) : null

  const renderOrderCard = (order) => {
    const address = orderAddress(order)
    const hasLiveLocation =
      Number.isFinite(Number(order.latitude)) && Number.isFinite(Number(order.longitude))
    const mapUrl = hasLiveLocation
      ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${order.latitude},${order.longitude}`)}`
      : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`

    const status = String(order.order_status || '')
    const isPacked = status === 'packed'
    const isTransit = status === 'out_for_delivery'
    const codDue = order.payment_method === 'cod' && order.payment_status !== 'paid'
    const mobile = String(order.customer_mobile || '')
    const whatsapp = mobile.replace(/\D/g, '')

    return (
      <article
        key={order.id}
        className={`overflow-hidden rounded-2xl bg-white ring-1 ${
          isTransit ? 'ring-2 ring-sky-400' : 'ring-slate-200'
        }`}
      >
        {/* Header strip */}
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate font-mono text-xs font-bold text-slate-900">{order.order_code}</p>
            <p className="mt-0.5 text-[11px] text-slate-400">{formatDate(order.created_at)}</p>
          </div>
          <span
            className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-bold ${
              isTransit
                ? 'bg-sky-100 text-sky-700'
                : isPacked
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-slate-100 text-slate-600'
            }`}
          >
            {isTransit ? 'On the way' : isPacked ? 'Ready to start' : labelStatus(status)}
          </span>
        </div>

        <div className="space-y-4 p-4">
          {/* Pickup and drop */}
          <div className="space-y-3">
            <div className="flex gap-3">
              <div className="flex flex-col items-center pt-1">
                <span className="h-2.5 w-2.5 rounded-full border-2 border-emerald-500 bg-white" />
                <span className="my-1 w-px flex-1 bg-slate-200" />
              </div>
              <div className="min-w-0 pb-1">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Pickup</p>
                <p className="text-xs leading-5 text-slate-700">{restaurantPickupAddress}</p>
              </div>
            </div>
            <div className="flex gap-3">
              <div className="flex flex-col items-center pt-1">
                <span className="h-2.5 w-2.5 rounded-full bg-rose-500" />
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Drop</p>
                <p className="text-xs leading-5 text-slate-700">{address || 'Customer address'}</p>
              </div>
            </div>
          </div>

          {/* Customer row */}
          <div className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 p-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-sm font-bold text-slate-700 ring-1 ring-slate-200">
                {String(order.customer_name || 'C').trim().charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-slate-900">{order.customer_name || 'Customer'}</p>
                <p className="truncate text-xs text-slate-500">{mobile || 'No mobile'}</p>
              </div>
            </div>
            <div className="flex shrink-0 gap-2">
              {mobile && (
                <a
                  href={`tel:${mobile}`}
                  aria-label="Call customer"
                  className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-emerald-700 ring-1 ring-slate-200"
                >
                  <Icon name="phone" className="h-5 w-5" />
                </a>
              )}
              {whatsapp && (
                <a
                  href={`https://wa.me/${whatsapp}`}
                  target="_blank"
                  rel="noreferrer"
                  aria-label="Message customer"
                  className="flex h-11 w-11 items-center justify-center rounded-xl bg-white text-emerald-700 ring-1 ring-slate-200"
                >
                  <Icon name="chat" className="h-5 w-5" />
                </a>
              )}
            </div>
          </div>

          {/* Amount + payment */}
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-slate-50 p-3">
              <p className="text-[11px] font-semibold text-slate-500">Order total</p>
              <p className="mt-1 text-base font-black text-slate-900">{money(order.total_amount)}</p>
            </div>
            <div className={`rounded-xl p-3 ${codDue ? 'bg-amber-50' : 'bg-emerald-50'}`}>
              <p className={`text-[11px] font-semibold ${codDue ? 'text-amber-700' : 'text-emerald-700'}`}>
                {codDue ? 'Collect cash' : 'Payment'}
              </p>
              <p className={`mt-1 text-base font-black ${codDue ? 'text-amber-800' : 'text-emerald-800'}`}>
                {codDue ? money(order.total_amount) : labelStatus(order.payment_status || 'paid')}
              </p>
            </div>
          </div>

          {order.customer_note && (
            <div className="rounded-xl bg-amber-50 px-3 py-3 ring-1 ring-amber-200">
              <p className="text-[11px] font-bold text-amber-700">Customer note</p>
              <p className="mt-1 text-xs leading-5 text-amber-900">{order.customer_note}</p>
            </div>
          )}

          {Array.isArray(order.items) && order.items.length > 0 && (
            <details className="rounded-xl bg-slate-50 ring-1 ring-slate-200">
              <summary className="cursor-pointer px-3 py-3 text-xs font-bold text-slate-700">
                Items ({order.items.length})
              </summary>
              <div className="space-y-2 border-t border-slate-200 px-3 py-3">
                {order.items.map((item, itemIndex) => (
                  <div key={`${order.id}-${item.id || item.menu_item_id || itemIndex}`} className="flex items-center justify-between gap-3 text-xs">
                    <span className="min-w-0 truncate text-slate-600">{item.name || item.item_name || 'Item'}</span>
                    <span className="shrink-0 font-bold text-slate-900">×{Number(item.quantity || item.qty || 1)}</span>
                  </div>
                ))}
              </div>
            </details>
          )}

          <a
            href={mapUrl}
            target="_blank"
            rel="noreferrer"
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 text-sm font-bold text-white"
          >
            <Icon name="pin" className="h-4 w-4" />
            Open navigation
          </a>

          {isPacked && (
            <button
              type="button"
              disabled={updatingOrderId === order.id}
              onClick={() => updateStatus(order, 'out_for_delivery')}
              className="h-13 w-full rounded-xl bg-sky-600 py-3.5 text-sm font-bold text-white disabled:opacity-50"
            >
              {updatingOrderId === order.id ? 'Starting…' : 'Start delivery'}
            </button>
          )}

          {isTransit && (
            <DeliveryResultPanel
              order={order}
              sessionToken={sessionToken}
              disabled={updatingOrderId === order.id}
              onCompleted={async (text) => {
                setMessage(text)
                setError('')
                await loadPortal()
              }}
            />
          )}

          {!['packed', 'out_for_delivery'].includes(status) && (
            <p className="rounded-xl bg-slate-50 px-3 py-3 text-center text-xs font-semibold text-slate-500">
              Waiting for the store to mark this order packed.
            </p>
          )}
        </div>
      </article>
    )
  }

  const renderCodWorkspace = () => (
    <div className="space-y-4">
      <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-xl bg-amber-50 p-3">
            <p className="text-[11px] font-semibold text-amber-700">Cash due</p>
            <p className="mt-1 text-sm font-black text-amber-900">{money(codCashDue)}</p>
          </div>
          <div className="rounded-xl bg-sky-50 p-3">
            <p className="text-[11px] font-semibold text-sky-700">Pending</p>
            <p className="mt-1 text-sm font-black text-sky-900">{money(codPendingHandover)}</p>
          </div>
          <div className="rounded-xl bg-emerald-50 p-3">
            <p className="text-[11px] font-semibold text-emerald-700">Can submit</p>
            <p className="mt-1 text-sm font-black text-emerald-900">{money(codAvailableToSubmit)}</p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => loadCodSummary('', false)}
          disabled={codLoading}
          className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-xl bg-slate-100 text-xs font-bold text-slate-700 disabled:opacity-50"
        >
          <Icon name="refresh" className="h-4 w-4" />
          {codLoading ? 'Refreshing…' : 'Refresh balance'}
        </button>

        {codError && (
          <div role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-3 text-xs font-semibold text-rose-700">
            {codError}
          </div>
        )}
      </section>

      <form onSubmit={submitCodSettlement} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
        <p className="text-sm font-bold text-slate-900">Hand over cash</p>
        <p className="mt-1 text-xs leading-5 text-slate-500">
          Submit only after you physically hand the cash to the Manager or Owner. Your balance updates after approval.
        </p>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-600">Amount (₹)</span>
            <input
              type="number"
              inputMode="decimal"
              min="0.01"
              step="0.01"
              max={codAvailableToSubmit || undefined}
              value={codAmount}
              onChange={(event) => setCodAmount(event.target.value)}
              placeholder="0.00"
              disabled={codSubmitting || codAvailableToSubmit <= 0}
              className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-base font-bold text-slate-900 outline-none focus:border-emerald-500 focus:bg-white disabled:opacity-50 sm:text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-xs font-bold text-slate-600">Note (optional)</span>
            <input
              value={codNote}
              onChange={(event) => setCodNote(event.target.value)}
              maxLength={500}
              placeholder="Example: Evening handover"
              disabled={codSubmitting || codAvailableToSubmit <= 0}
              className="h-12 w-full rounded-xl border border-slate-200 bg-slate-50 px-4 text-base text-slate-900 outline-none focus:border-emerald-500 focus:bg-white disabled:opacity-50 sm:text-sm"
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={codSubmitting || codAvailableToSubmit <= 0 || !String(codAmount || '').trim()}
          className="mt-4 h-13 w-full rounded-xl bg-emerald-600 py-3.5 text-sm font-bold text-white disabled:bg-slate-200 disabled:text-slate-400"
        >
          {codSubmitting ? 'Submitting…' : 'Submit cash handover'}
        </button>

        {codAvailableToSubmit <= 0 && (
          <p className="mt-2 text-center text-[11px] text-slate-400">No cash is available to submit right now.</p>
        )}
      </form>

      {codSettlements.length > 0 && (
        <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <p className="text-sm font-bold text-slate-900">Handover history</p>
          <div className="mt-3 divide-y divide-slate-100">
            {codSettlements.slice(0, 12).map((settlement) => (
              <div key={settlement.id} className="flex items-center justify-between gap-3 py-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-slate-900">{money(settlement.amount_submitted)}</p>
                  <p className="mt-0.5 text-[11px] text-slate-400">
                    {formatDate(settlement.submitted_at)}
                    {settlement.reviewed_by_name ? ` · ${settlement.reviewed_by_name}` : ''}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                    settlement.status === 'approved'
                      ? 'bg-emerald-100 text-emerald-700'
                      : settlement.status === 'rejected'
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-amber-100 text-amber-700'
                  }`}
                >
                  {labelStatus(settlement.status)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {codCollections.some((row) => Number(row.outstanding_amount || 0) > 0) && (
        <section className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
          <p className="text-sm font-bold text-slate-900">Unsettled COD orders</p>
          <div className="mt-3 divide-y divide-slate-100">
            {codCollections
              .filter((row) => Number(row.outstanding_amount || 0) > 0)
              .slice(0, 12)
              .map((row) => (
                <div key={row.id} className="flex items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <p className="font-mono text-xs font-bold text-slate-900">{row.order_code || 'COD order'}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">Collected {formatDate(row.collected_at)}</p>
                  </div>
                  <p className="shrink-0 text-sm font-black text-amber-700">{money(row.outstanding_amount)}</p>
                </div>
              ))}
          </div>
        </section>
      )}
    </div>
  )

  // ===== MAIN APP =====
  return (
    <main className="flex min-h-[100dvh] flex-col bg-slate-50 text-slate-900">
      {/* TOP BAR */}
      <header className="sticky top-0 z-30 bg-white ring-1 ring-slate-200/70">
        <div className="flex items-center gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white">
            {String(driver.name || 'D').trim().charAt(0).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-slate-900">{driver.name || 'Driver'}</p>
            <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
              <span
                className={`h-2 w-2 rounded-full ${
                  driver.status === 'busy' ? 'bg-amber-400' : 'bg-emerald-500'
                }`}
              />
              {labelStatus(driver.status || 'available')} · {restaurant.name || 'Store'}
            </p>
          </div>
          <button
            type="button"
            onClick={driverAlarmEnabled ? disableDriverAlarm : enableDriverAlarm}
            aria-label={driverAlarmEnabled ? 'Turn delivery alarm off' : 'Turn delivery alarm on'}
            className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
              driverAlarmEnabled ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500'
            }`}
          >
            <Icon name="bell" className="h-5 w-5" />
            {driverAlarmActive && (
              <span className="absolute -right-0.5 -top-0.5 h-3 w-3 animate-pulse rounded-full bg-rose-500 ring-2 ring-white" />
            )}
          </button>
        </div>

        {/* Cash strip */}
        <button
          type="button"
          onClick={() => setDriverView('cod')}
          className="flex w-full items-center justify-between border-t border-slate-100 bg-amber-50 px-4 py-2.5 text-left"
        >
          <span className="text-xs font-semibold text-amber-800">Cash to hand over</span>
          <span className="text-sm font-black text-amber-900">{money(codCashDue)}</span>
        </button>
      </header>

      {/* PAGE TITLE + SEARCH */}
      <div className="px-4 pt-4">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-xl font-black tracking-tight text-slate-900">{viewTitles[driverView] || 'Trips'}</h1>
          <button
            type="button"
            onClick={async () => {
              await Promise.all([loadPortal(), loadCodSummary('', true)])
            }}
            aria-label="Refresh"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-600 ring-1 ring-slate-200"
          >
            <Icon name="refresh" className="h-4 w-4" />
          </button>
        </div>

        {(driverView === 'tracking' || driverView === 'assigned' || driverView === 'orders' || driverView === 'customers') && (
          <label className="mt-3 flex h-11 items-center gap-2.5 rounded-xl bg-white px-3.5 ring-1 ring-slate-200 focus-within:ring-2 focus-within:ring-emerald-500">
            <Icon name="search" className="h-4 w-4 text-slate-400" />
            <input
              value={driverSearch}
              onChange={(event) => setDriverSearch(event.target.value)}
              placeholder="Search order, customer or mobile"
              aria-label="Search orders"
              className="min-w-0 flex-1 bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-400 sm:text-sm"
            />
            {driverSearch && (
              <button type="button" onClick={() => setDriverSearch('')} aria-label="Clear search" className="text-slate-400">
                <Icon name="close" className="h-4 w-4" />
              </button>
            )}
          </label>
        )}

        {message && (
          <div className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-xs font-semibold text-emerald-700 ring-1 ring-emerald-200">
            {message}
          </div>
        )}
        {error && (
          <div role="alert" className="mt-3 rounded-xl bg-rose-50 px-4 py-3 text-xs font-semibold text-rose-700 ring-1 ring-rose-200">
            {error}
          </div>
        )}
      </div>

      {/* CONTENT */}
      <section className="flex-1 space-y-4 px-4 pb-32 pt-4">
        {/* TRIPS */}
        {driverView === 'tracking' && (
          <>
            {renderGpsCard()}
            {liveTrackingOrders.length > 1 && (
              <div className="rounded-2xl bg-rose-50 p-4 ring-1 ring-rose-200">
                <p className="text-sm font-bold text-rose-800">{liveTrackingOrders.length} orders for one customer</p>
                <p className="mt-1 text-xs leading-5 text-rose-700">
                  Complete every order below separately before leaving this customer.
                </p>
              </div>
            )}
            {liveTrackingOrders.length > 0 ? (
              liveTrackingOrders.map((order) => renderOrderCard(order))
            ) : (
              <EmptyState
                icon="route"
                title="No active trip"
                text="When you start a delivery from Assigned orders, it appears here with live navigation."
              />
            )}
          </>
        )}

        {/* ASSIGNED */}
        {driverView === 'assigned' && (
          <>
            {renderAlarmCard()}
            {visibleActiveOrders.length > 0 ? (
              visibleActiveOrders.map((order) => renderOrderCard(order))
            ) : (
              <EmptyState
                icon="box"
                title={searchTerm ? 'No matching orders' : 'No assigned orders'}
                text={searchTerm ? 'Try another order code, name or mobile number.' : 'New assignments appear here automatically.'}
              />
            )}
          </>
        )}

        {/* CASH */}
        {driverView === 'cod' && renderCodWorkspace()}

        {/* ALERTS */}
        {driverView === 'inbox' && (
          <>
            {renderAlarmCard()}
            <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <p className="text-sm font-bold text-slate-900">Action required</p>
              <div className="mt-3 space-y-2">
                {waitingToStartOrders.map((order) => (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => setDriverView('assigned')}
                    className="flex w-full items-center justify-between gap-3 rounded-xl bg-amber-50 px-4 py-3 text-left ring-1 ring-amber-200"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-amber-900">Start delivery</p>
                      <p className="mt-0.5 truncate text-xs text-amber-700">
                        {order.order_code} · {order.customer_name || 'Customer'}
                      </p>
                    </div>
                    <Icon name="route" className="h-4 w-4 shrink-0 text-amber-700" />
                  </button>
                ))}
                {waitingToStartOrders.length === 0 && (
                  <p className="rounded-xl bg-slate-50 px-4 py-6 text-center text-xs text-slate-500">
                    You're all caught up.
                  </p>
                )}
              </div>
            </div>
          </>
        )}

        {/* MORE SCREENS */}
        {driverView === 'dashboard' && (
          <>
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: 'Active', value: activeOrders.length, tone: 'bg-sky-50 text-sky-900' },
                { label: 'Completed', value: completedCount, tone: 'bg-emerald-50 text-emerald-900' },
                { label: 'Waiting', value: waitingToStartOrders.length, tone: 'bg-amber-50 text-amber-900' },
                { label: 'Cash due', value: money(codCashDue), tone: 'bg-rose-50 text-rose-900' },
              ].map((card) => (
                <div key={card.label} className={`rounded-2xl p-4 ${card.tone}`}>
                  <p className="text-[11px] font-semibold opacity-70">{card.label}</p>
                  <p className="mt-1 text-xl font-black">{card.value}</p>
                </div>
              ))}
            </div>
            {renderAlarmCard()}
            {renderGpsCard()}
          </>
        )}

        {driverView === 'orders' && (
          <>
            <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Active</p>
            {visibleActiveOrders.length > 0 ? (
              <div className="space-y-2">
                {visibleActiveOrders.map((order) => (
                  <button
                    key={order.id}
                    type="button"
                    onClick={() => setDriverView('tracking')}
                    className="flex w-full items-center justify-between gap-3 rounded-2xl bg-white p-4 text-left ring-1 ring-slate-200"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs font-bold text-slate-900">{order.order_code}</p>
                      <p className="mt-1 truncate text-xs text-slate-500">
                        {order.customer_name || 'Customer'} · {labelStatus(order.order_status)}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-black text-slate-900">{money(order.total_amount)}</p>
                  </button>
                ))}
              </div>
            ) : (
              <p className="rounded-2xl bg-white p-6 text-center text-xs text-slate-500 ring-1 ring-slate-200">No active orders.</p>
            )}

            <p className="pt-2 text-xs font-bold uppercase tracking-wide text-slate-400">Completed</p>
            {visibleRecentOrders.length > 0 ? (
              <div className="space-y-2">
                {visibleRecentOrders.map((order) => (
                  <div key={order.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                    <div className="min-w-0">
                      <p className="truncate font-mono text-xs font-bold text-slate-900">{order.order_code}</p>
                      <p className="mt-1 text-xs text-slate-500">{formatDate(order.delivered_at || order.created_at)}</p>
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-bold ${
                        order.order_status === 'delivered' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                      }`}
                    >
                      {labelStatus(order.order_status)}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-2xl bg-white p-6 text-center text-xs text-slate-500 ring-1 ring-slate-200">No completed orders yet.</p>
            )}
          </>
        )}

        {driverView === 'customers' && (
          <>
            {activeCustomers.length > 0 ? (
              activeCustomers.map((customer) => {
                const cleanMobile = String(customer.mobile || '').replace(/\D/g, '')
                return (
                  <article key={customer.orderId} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                    <div className="flex items-center gap-3">
                      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-700">
                        {customer.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-900">{customer.name}</p>
                        <p className="truncate text-xs text-slate-500">
                          {customer.orderCode} · {labelStatus(customer.status)}
                        </p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs leading-5 text-slate-600">{customer.address || 'No delivery address'}</p>
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      {customer.mobile ? (
                        <a href={`tel:${customer.mobile}`} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-emerald-600 text-sm font-bold text-white">
                          <Icon name="phone" className="h-4 w-4" /> Call
                        </a>
                      ) : (
                        <span className="flex h-11 items-center justify-center rounded-xl bg-slate-100 text-sm font-semibold text-slate-400">No phone</span>
                      )}
                      {cleanMobile ? (
                        <a
                          href={`https://wa.me/${cleanMobile}`}
                          target="_blank"
                          rel="noreferrer"
                          className="flex h-11 items-center justify-center gap-2 rounded-xl bg-slate-100 text-sm font-bold text-slate-800"
                        >
                          <Icon name="chat" className="h-4 w-4" /> Message
                        </a>
                      ) : (
                        <span className="flex h-11 items-center justify-center rounded-xl bg-slate-100 text-sm font-semibold text-slate-400">No message</span>
                      )}
                    </div>
                  </article>
                )
              })
            ) : (
              <EmptyState icon="users" title="No active customers" text="Customer contacts appear when orders are assigned." />
            )}
          </>
        )}

        {driverView === 'returns' && (
          <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
            <DeliveryReturnPickupTasks sessionToken={sessionToken} />
          </div>
        )}

        {driverView === 'help' && (
          <div className="space-y-3">
            {[
              ['Start a delivery', 'Open Assigned orders and tap Start delivery when you leave the store.'],
              ['Live location', 'Allow precise location while on the way. Tap Retry GPS if sharing stops.'],
              ['Cash handover', 'Submit only cash you have physically handed to the Manager or Owner.'],
              ['Failed delivery', 'Use Not delivered, choose the reason, and add photos or a note if useful.'],
            ].map(([title, body]) => (
              <div key={title} className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
                <p className="text-sm font-bold text-slate-900">{title}</p>
                <p className="mt-1 text-xs leading-5 text-slate-600">{body}</p>
              </div>
            ))}
            <div className="rounded-2xl bg-white p-4 text-xs text-slate-500 ring-1 ring-slate-200">
              For store or payment issues, contact your Manager or Owner. Store code:{' '}
              <span className="font-mono font-bold text-slate-800">{restaurantCode}</span>
            </div>
          </div>
        )}

        {driverView === 'settings' && (
          <>
            <div className="rounded-2xl bg-white p-4 ring-1 ring-slate-200">
              <p className="text-sm font-bold text-slate-900">Profile</p>
              <div className="mt-3 divide-y divide-slate-100 text-sm">
                {[
                  ['Name', driver.name || '—'],
                  ['Mobile', driver.mobile || '—'],
                  ['Status', labelStatus(driver.status || 'available')],
                  ['Vehicle', [driver.vehicle_type, driver.vehicle_number].filter(Boolean).join(' · ') || '—'],
                  ['Store', restaurant.name || '—'],
                ].map(([label, value]) => (
                  <div key={label} className="flex items-center justify-between gap-4 py-3">
                    <span className="text-slate-500">{label}</span>
                    <span className="text-right font-semibold text-slate-900">{value}</span>
                  </div>
                ))}
              </div>
            </div>
            {renderAlarmCard()}
            <button
              type="button"
              onClick={logout}
              className="h-13 w-full rounded-2xl bg-rose-600 py-3.5 text-sm font-bold text-white"
            >
              Sign out of driver portal
            </button>
          </>
        )}
      </section>

      {/* MORE SHEET */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 flex items-end bg-slate-950/50" onClick={() => setMoreOpen(false)}>
          <div
            role="dialog"
            aria-label="More sections"
            onClick={(event) => event.stopPropagation()}
            className="w-full rounded-t-3xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl"
          >
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-slate-200" />
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-900">More</h2>
              <button type="button" onClick={() => setMoreOpen(false)} aria-label="Close" className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100">
                <Icon name="close" className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-2">
              {moreItems.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  onClick={() => {
                    setDriverView(item.key)
                    setMoreOpen(false)
                  }}
                  className={`flex flex-col items-start gap-2 rounded-2xl p-4 text-left ring-1 ${
                    driverView === item.key ? 'bg-emerald-50 ring-emerald-300' : 'bg-slate-50 ring-slate-200'
                  }`}
                >
                  <Icon name={item.icon} className="h-5 w-5 text-slate-700" />
                  <span className="text-sm font-bold text-slate-900">{item.label}</span>
                  <span className="text-[11px] leading-4 text-slate-500">{item.hint}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* BOTTOM TAB BAR */}
      <nav
        aria-label="Driver navigation"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur"
      >
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {tabs.map((tab) => {
            const active = activeTabKey === tab.key
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => {
                  setDriverView(tab.key)
                  setMoreOpen(false)
                }}
                aria-current={active ? 'page' : undefined}
                className={`relative flex flex-col items-center gap-1 py-2.5 ${active ? 'text-emerald-700' : 'text-slate-500'}`}
              >
                <Icon name={tab.icon} className="h-5 w-5" />
                <span className="text-[11px] font-bold">{tab.label}</span>
                {tab.badge > 0 && (
                  <span className="absolute right-[22%] top-1.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white">
                    {tab.badge}
                  </span>
                )}
              </button>
            )
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-current={isMoreView ? 'page' : undefined}
            className={`flex flex-col items-center gap-1 py-2.5 ${isMoreView ? 'text-emerald-700' : 'text-slate-500'}`}
          >
            <Icon name="menu" className="h-5 w-5" />
            <span className="text-[11px] font-bold">More</span>
          </button>
        </div>
      </nav>
    </main>
  )
}

function EmptyState({ icon, title, text }) {
  return (
    <div className="flex flex-col items-center rounded-2xl bg-white px-6 py-12 text-center ring-1 ring-slate-200">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-500">
        <Icon name={icon} className="h-6 w-6" />
      </div>
      <p className="mt-4 text-sm font-bold text-slate-900">{title}</p>
      <p className="mt-1 max-w-xs text-xs leading-5 text-slate-500">{text}</p>
    </div>
  )
}