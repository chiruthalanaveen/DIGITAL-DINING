'use client'



import {



  use,



  useEffect,



  useMemo,



  useRef,



  useState,



} from 'react'



import { supabase } from '@/lib/supabase'



import { useMobileViewportLock } from '@/lib/useMobileViewportLock'

import DeliveryReturnPickupTasks from '@/app/components/DeliveryReturnPickupTasks'



import { useLiveDeliveryRefresh } from '@/lib/useLiveDeliveryRefresh'
import { usePersistentPortalAlarm } from '@/lib/usePersistentPortalAlarm'



import { appConfirm } from '@/lib/appDialog'



function money(value) {



  return `₹${Number(value || 0).toLocaleString('en-IN', {



    maximumFractionDigits: 2,



  })}`



}



function labelStatus(value) {



  return String(value || '')



    .replaceAll('_', ' ')



    .replace(/\b\w/g, (char) =>



      char.toUpperCase()



    )



}



function formatDate(value) {



  if (!value) return '—'



  const date = new Date(value)



  if (Number.isNaN(date.getTime())) {



    return '—'



  }



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

    Math.cos(toRadians(firstLat)) *

      Math.cos(toRadians(secondLat)) *

      Math.sin(dLng / 2) ** 2



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



function DeliveryResultPanel({



  order,



  sessionToken,



  disabled = false,



  onCompleted,



}) {



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



      nextPreviews.forEach((preview) => {



        URL.revokeObjectURL(preview.url)



      })



    }



  }, [files])



  const handleFiles = (event) => {



    const selected = Array.from(event.target.files || [])



    if (selected.length > 5) {



      setLocalError('You can upload up to 5 photos per delivery attempt.')



      event.target.value = ''



      return



    }



    const allowedTypes = new Set([



      'image/jpeg',



      'image/png',



      'image/webp',



    ])



    const invalid = selected.find(



      (file) => !allowedTypes.has(file.type) || file.size > 5 * 1024 * 1024



    )



    if (invalid) {



      setLocalError(



        'Each photo must be JPG, PNG or WEBP and no larger than 5 MB.'



      )



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



        title:



          result === 'delivered'



            ? 'Confirm Delivery'



            : 'Submit Delivery Attempt',



        confirmText:



          result === 'delivered'



            ? 'Confirm Delivered'



            : 'Submit Attempt',



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



      files.forEach((file) => {



        formData.append('files', file)



      })



      const response = await fetch('/api/delivery/driver-proof', {



        method: 'POST',



        body: formData,



        cache: 'no-store',



      })



      const data = await response.json().catch(() => ({}))



      if (!response.ok || !data?.success) {



        throw new Error(



          data?.message || 'Unable to submit the delivery result.'



        )



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



      setLocalError(



        submitError?.message || 'Unable to submit the delivery result.'



      )



    } finally {



      setSubmitting(false)



    }



  }



  return (



    <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">



      <div className="flex items-start justify-between gap-3">



        <div>



          <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500">



            Delivery Result



          </p>



          <p className="mt-1 text-xs leading-5 text-neutral-400">



            Confirm delivery or report an unsuccessful attempt. Uploaded item / proof photos are sent to the owner Delivery Dashboard.



          </p>



        </div>



        <span className="rounded-full bg-sky-500/10 px-2.5 py-1 text-[9px] font-black text-sky-300">



          Up to 5 photos



        </span>



      </div>



      <div className="mt-4 grid grid-cols-2 gap-2">



        <button



          type="button"



          onClick={() => {



            setResult('delivered')



            setFailureReason('')



            setLocalError('')



          }}



          className={`rounded-xl border px-3 py-3 text-xs font-black transition ${



            result === 'delivered'



              ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'



              : 'border-neutral-800 bg-neutral-900 text-neutral-400'



          }`}



        >



          ✓ Delivered



        </button>



        <button



          type="button"



          onClick={() => {



            setResult('not_delivered')



            setLocalError('')



          }}



          className={`rounded-xl border px-3 py-3 text-xs font-black transition ${



            result === 'not_delivered'



              ? 'border-red-500 bg-red-500/10 text-red-300'



              : 'border-neutral-800 bg-neutral-900 text-neutral-400'



          }`}



        >



          ✕ Not Delivered



        </button>



      </div>



      {result === 'not_delivered' && (



        <label className="mt-4 block">



          <span className="mb-1.5 block text-[9px] font-black uppercase tracking-wider text-neutral-500">



            Reason



          </span>



          <select



            value={failureReason}



            onChange={(event) => setFailureReason(event.target.value)}



            className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-3 text-xs font-bold text-white outline-none focus:border-red-500"



          >



            <option value="">Select reason</option>



            {DELIVERY_FAILURE_REASONS.map(([value, label]) => (



              <option key={value} value={value}>



                {label}



              </option>



            ))}



          </select>



        </label>



      )}



      <label className="mt-4 block">



        <span className="mb-1.5 block text-[9px] font-black uppercase tracking-wider text-neutral-500">



          Upload Items / Delivery Proof



        </span>



        <input



          type="file"



          accept="image/jpeg,image/png,image/webp"



          multiple



          onChange={handleFiles}



          className="block w-full rounded-xl border border-dashed border-neutral-700 bg-neutral-900 px-3 py-3 text-xs text-neutral-300 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-3 file:py-2 file:text-[10px] file:font-black file:text-white"



        />



        <p className="mt-1.5 text-[9px] leading-4 text-neutral-600">



          Optional. Maximum 5 photos, 5 MB each. JPG, PNG or WEBP.



        </p>



      </label>



      {previews.length > 0 && (



        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">



          {previews.map((preview) => (



            <div



              key={`${preview.name}-${preview.url}`}



              className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900"



            >



              <img



                src={preview.url}



                alt={preview.name}



                className="aspect-square w-full object-cover"



              />



            </div>



          ))}



        </div>



      )}



      <label className="mt-4 block">



        <span className="mb-1.5 block text-[9px] font-black uppercase tracking-wider text-neutral-500">



          Driver Note



        </span>



        <textarea



          value={note}



          onChange={(event) => setNote(event.target.value.slice(0, 500))}



          rows={3}



          placeholder={



            result === 'delivered'



              ? 'Optional delivery note...'



              : 'Add useful details about the failed attempt...'



          }



          className="w-full resize-none rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-3 text-xs text-white outline-none focus:border-emerald-500"



        />



        <p className="mt-1 text-right text-[9px] text-neutral-600">



          {note.length}/500



        </p>



      </label>



      {localError && (



        <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-[10px] font-bold leading-4 text-red-300">



          {localError}



        </div>



      )}



      <button



        type="button"



        onClick={submitResult}



        disabled={submitting || disabled}



        className={`mt-4 w-full rounded-xl px-5 py-4 text-sm font-black text-white disabled:opacity-50 ${



          result === 'delivered'



            ? 'bg-emerald-600'



            : 'bg-red-600'



        }`}



      >



        {submitting



          ? 'Uploading & Submitting...'



          : result === 'delivered'



            ? 'Confirm Delivered'



            : 'Submit Not Delivered'}



      </button>



    </div>



  )



}



export default function DeliveryDriverPortal({



  params,



}) {



  const unwrappedParams = use(params)



  useMobileViewportLock()



  const restaurantCode = String(



    unwrappedParams?.restaurantCode ||



      unwrappedParams?.restaurantcode ||



      ''



  ).trim()



  const storageKey =



    `digitaldining_delivery_driver_session_${restaurantCode}`



  const [sessionToken, setSessionToken] =



    useState('')



  const [userId, setUserId] =



    useState('')



  const [password, setPassword] =



    useState('')



  const [portalData, setPortalData] =



    useState(null)



  const [loading, setLoading] =



    useState(true)



  const [loggingIn, setLoggingIn] =



    useState(false)



  const [updatingOrderId, setUpdatingOrderId] =



    useState('')



  const [error, setError] =



    useState('')



  const [message, setMessage] =



    useState('')



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

  /*
   * Driver workspace UI only.
   * These states do not change delivery/order backend behaviour.
   */
  const [driverView, setDriverView] = useState('tracking')
  const [driverSearch, setDriverSearch] = useState('')



  const gpsWatchRef = useRef(null)

  const gpsSendingRef = useRef(false)

  const gpsLastSentRef = useRef(0)

  const gpsLastCoordsRef = useRef(null)



  useEffect(() => {



    try {



      const saved =



        localStorage.getItem(storageKey)



      if (saved) {



        setSessionToken(saved)



      }



    } catch {



      // Ignore unavailable local storage.



    }



    setLoading(false)



  }, [storageKey])



  const loadPortal = async (



    tokenOverride = ''



  ) => {



    const token =



      String(



        tokenOverride ||



          sessionToken ||



          ''



      ).trim()



    if (!token) {



      setPortalData(null)



      return



    }



    try {



      const {



        data,



        error: rpcError,



      } = await supabase.rpc(



        'get_delivery_driver_portal_data',



        {



          p_session_token: token,



        }



      )



      if (rpcError) {



        throw rpcError



      }



      if (!data?.success) {



        throw new Error(



          data?.message ||



            'Driver session is invalid.'



        )



      }



      setPortalData(data)



      setError('')



    } catch (loadError) {



      console.error(



        'Driver portal load error:',



        loadError



      )



      setPortalData(null)



      setSessionToken('')



      try {



        localStorage.removeItem(



          storageKey



        )



      } catch {



        // Ignore unavailable local storage.



      }



      setError(



        loadError?.message ||



          'Your Driver Portal session expired. Please sign in again.'



      )



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

      const { data, error: rpcError } = await supabase.rpc(

        'delivery_driver_get_cod_summary',

        { p_session_token: token }

      )



      if (rpcError) throw rpcError

      if (!data?.success) {

        throw new Error(data?.message || 'Unable to load COD cash summary.')

      }



      setCodData(data)

    } catch (codLoadError) {

      console.error('Driver COD summary error:', codLoadError)

      setCodError(

        codLoadError?.message || 'Unable to load COD cash summary.'

      )

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

      setCodError(

        `You can submit up to ${money(available)} based on your current COD cash due.`

      )

      return

    }



    setCodSubmitting(true)

    setCodError('')

    setMessage('')



    try {

      const { data, error: rpcError } = await supabase.rpc(

        'delivery_driver_submit_cod_settlement',

        {

          p_session_token: sessionToken,

          p_amount: amount,

          p_note: String(codNote || '').trim(),

        }

      )



      if (rpcError) throw rpcError

      if (!data?.success) {

        throw new Error(data?.message || 'Unable to submit COD cash handover.')

      }



      setCodAmount('')

      setCodNote('')

      setMessage(

        data?.message ||

          'COD cash handover submitted for Manager/Owner confirmation.'

      )



      await loadCodSummary('', true)

    } catch (submitError) {

      console.error('Driver COD settlement submit error:', submitError)

      setCodError(

        submitError?.message || 'Unable to submit COD cash handover.'

      )

    } finally {

      setCodSubmitting(false)

    }

  }



  useEffect(() => {



    if (!sessionToken) {



      return



    }



    loadPortal()

    loadCodSummary()



    const codInterval = window.setInterval(() => {

      loadCodSummary('', true)

    }, 15000)



    return () => window.clearInterval(codInterval)



    // eslint-disable-next-line react-hooks/exhaustive-deps



  }, [sessionToken])



  useLiveDeliveryRefresh(



    () => loadPortal(),



    Boolean(sessionToken),



    1000



  )



  const handleLogin = async (



    event



  ) => {



    event.preventDefault()



    if (loggingIn) return



    const cleanUserId =



      userId.trim().toLowerCase()



    if (



      cleanUserId.length < 3 ||



      password.length < 6



    ) {



      setError(



        'Enter your Driver User ID and password.'



      )



      return



    }



    setLoggingIn(true)



    setError('')



    setMessage('')



    try {



      const {



        data,



        error: rpcError,



      } = await supabase.rpc(



        'delivery_driver_login',



        {



          p_restaurant_code:



            restaurantCode,



          p_user_id: cleanUserId,



          p_password: password,



        }



      )



      if (rpcError) {



        throw rpcError



      }



      if (



        !data?.success ||



        !data?.session_token



      ) {



        throw new Error(



          data?.message ||



            'Driver login failed.'



        )



      }



      const token =



        String(



          data.session_token



        )



      try {



        localStorage.setItem(



          storageKey,



          token



        )



      } catch {



        // Continue even if storage is unavailable.



      }



      setSessionToken(token)



      setPassword('')



      setMessage(



        `Welcome ${data?.driver?.name || 'Driver'}.`



      )



      await Promise.all([

        loadPortal(token),

        loadCodSummary(token, true),

      ])



    } catch (loginError) {



      console.error(



        'Delivery driver login error:',



        loginError



      )



      setError(



        loginError?.message ||



          'Driver login failed.'



      )



    } finally {



      setLoggingIn(false)



    }



  }



  const logout = async () => {



    const token =



      sessionToken



    try {



      if (token) {



        await supabase.rpc(



          'delivery_driver_logout',



          {



            p_session_token:



              token,



          }



        )



      }



    } catch (logoutError) {



      console.error(



        'Driver logout error:',



        logoutError



      )



    } finally {



      try {



        localStorage.removeItem(



          storageKey



        )



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



    }



  }



  const updateStatus = async (



    order,



    nextStatus



  ) => {



    if (



      !sessionToken ||



      updatingOrderId



    ) {



      return



    }



    const confirmation =



      await appConfirm(



        nextStatus ===



          'out_for_delivery'



          ? `Start delivery for ${order.order_code}?`



          : `Mark ${order.order_code} as delivered?`,



        {



          title:



            nextStatus === 'out_for_delivery'



              ? 'Start Delivery'



              : 'Confirm Delivered',



          confirmText:



            nextStatus === 'out_for_delivery'



              ? 'Start Delivery'



              : 'Mark Delivered',



        }



      )



    if (!confirmation) return



    setUpdatingOrderId(



      order.id



    )



    setError('')



    setMessage('')



    try {



      const {



        data,



        error: rpcError,



      } = await supabase.rpc(



        'delivery_driver_update_order_status',



        {



          p_session_token:



            sessionToken,



          p_order_id:



            order.id,



          p_new_status:



            nextStatus,



        }



      )



      if (rpcError) {



        throw rpcError



      }



      if (!data?.success) {



        throw new Error(



          data?.message ||



            'Unable to update order.'



        )



      }



      setMessage(



        nextStatus ===



          'out_for_delivery'



          ? 'Order marked Out for Delivery.'



          : 'Order marked Delivered.'



      )



      await loadPortal()



    } catch (updateError) {



      console.error(



        'Driver order update error:',



        updateError



      )



      setError(



        updateError?.message ||



          'Unable to update order.'



      )



    } finally {



      setUpdatingOrderId('')



    }



  }



  const orders =



    Array.isArray(



      portalData?.orders



    )



      ? portalData.orders



      : []



  const activeOrders =



    useMemo(



      () =>



        orders.filter(



          (order) =>



            ![



              'delivered',



              'cancelled',



            ].includes(



              String(



                order.order_status ||



                  ''



              )



            )



        ),



      [orders]



    )



  /*
   * DELIVERY BOY ALARM:
   * alarm continues while ANY assigned order is still packed.
   */
  const waitingToStartOrders =
    useMemo(
      () =>
        orders.filter(
          (order) =>
            String(
              order.order_status ||
                ''
            ).toLowerCase() ===
            'packed'
        ),
      [orders]
    )

  const {
    enabled: driverAlarmEnabled,
    active: driverAlarmActive,
    enable: enableDriverAlarm,
    disable: disableDriverAlarm,
  } =
    usePersistentPortalAlarm({
      active:
        Boolean(
          sessionToken &&
          waitingToStartOrders.length > 0
        ),
      repeatMs: 1700,
      notificationTitle:
        'Start Delivery Required',
      notificationBody:
        waitingToStartOrders.length === 1
          ? `${waitingToStartOrders[0]?.order_code || '1 order'} is ready. Press Start Delivery.`
          : `${waitingToStartOrders.length} assigned orders are waiting for Start Delivery.`,
    })

  const recentOrders =



    useMemo(



      () =>



        orders.filter((order) =>



          [



            'delivered',



            'cancelled',



          ].includes(



            String(



              order.order_status || ''



            )



          )



        ),



      [orders]



    )



  const normalizeMobile =
    (value) =>
      String(
        value || ''
      ).replace(
        /\D/g,
        ''
      )



  const liveTrackingOrder =
    useMemo(
      () =>
        activeOrders.find(
          (order) =>
            String(
              order.order_status ||
                ''
            ) ===
            'out_for_delivery'
        ) || null,
      [activeOrders]
    )



  /*
   * If the same customer mobile has multiple different orders that are
   * Out for Delivery with this Driver, share this Driver's GPS to ALL
   * those order records.
   *
   * The Driver UI can still show one tracking card, but every matching
   * customer order-tracking page receives the same live Driver location.
   */
  const liveTrackingOrders =
    useMemo(() => {
      if (!liveTrackingOrder) {
        return []
      }

      const primaryMobile =
        normalizeMobile(
          liveTrackingOrder.customer_mobile
        )

      if (!primaryMobile) {
        return [
          liveTrackingOrder,
        ]
      }

      return activeOrders.filter(
        (order) =>
          String(
            order.order_status ||
              ''
          ) ===
            'out_for_delivery' &&
          normalizeMobile(
            order.customer_mobile
          ) ===
            primaryMobile
      )
    }, [
      activeOrders,
      liveTrackingOrder,
    ])



  const liveTrackingOrderIds =
    useMemo(
      () =>
        [
          ...new Set(
            liveTrackingOrders
              .map(
                (order) =>
                  String(
                    order?.id ||
                      ''
                  )
              )
              .filter(Boolean)
          ),
        ],
      [liveTrackingOrders]
    )



  const liveTrackingOrderIdsKey =
    liveTrackingOrderIds.join(
      '|'
    )



  useEffect(() => {

    if (
      !sessionToken ||
      liveTrackingOrderIds.length ===
        0
    ) {

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

      setGpsMessage(

        'Live GPS is not supported on this device/browser. Open the Driver Portal on a GPS-enabled phone.'

      )

      return

    }



    const token = sessionToken

    const orderIds =
      [...liveTrackingOrderIds]

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

        const updateResults =
          await Promise.all(
            orderIds.map(
              async (
                orderId
              ) => {
                const {
                  data,
                  error:
                    rpcError,
                } =
                  await supabase.rpc(
                    'delivery_driver_update_live_location',
                    {
                      p_session_token:
                        token,

                      p_order_id:
                        orderId,

                      p_latitude:
                        latitude,

                      p_longitude:
                        longitude,

                      p_accuracy_m:
                        Number.isFinite(
                          accuracy
                        )
                          ? accuracy
                          : null,

                      p_heading:
                        Number.isFinite(
                          heading
                        )
                          ? heading
                          : null,

                      p_speed_mps:
                        Number.isFinite(
                          speed
                        )
                          ? speed
                          : null,
                    }
                  )

                if (rpcError) {
                  throw rpcError
                }

                if (
                  !data?.success
                ) {
                  throw new Error(
                    data?.message ||
                      `Unable to share live GPS location for order ${orderId}.`
                  )
                }

                return data
              }
            )
          )



        const latestLocation =
          updateResults.find(
            (row) =>
              row?.location
          )?.location ||
          null



        gpsLastSentRef.current =
          now

        gpsLastCoordsRef.current =
          {
            latitude,
            longitude,
          }

        setGpsStatus(
          'live'
        )

        setGpsMessage(
          orderIds.length > 1
            ? `Live location is being shared with ${orderIds.length} orders on the same customer mobile.`
            : 'Live location is being shared with this customer.'
        )

        setGpsLastSentAt(
          latestLocation
            ?.captured_at ||
            new Date().toISOString()
        )

        setGpsAccuracy(
          Number.isFinite(
            accuracy
          )
            ? accuracy
            : null
        )

      } catch (locationUpdateError) {

        console.error('Driver live GPS update error:', locationUpdateError)

        setGpsStatus('error')

        setGpsMessage(

          locationUpdateError?.message || 'Unable to share live GPS location.'

        )

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

            'Location permission was denied. Allow precise location for this site in your phone/browser settings, then tap Retry GPS.'

          )

        } else if (geoError?.code === 2) {

          setGpsMessage(

            'Your phone cannot determine its current location. Turn on GPS/location services and try again.'

          )

        } else {

          setGpsMessage(

            'Live GPS timed out. Keep location services on and tap Retry GPS.'

          )

        }

      },

      {

        enableHighAccuracy: true,

        maximumAge: 3000,

        timeout: 20000,

      }

    )



    gpsWatchRef.current = watchId



    return () => {

      disposed = true



      try {

        navigator.geolocation.clearWatch(watchId)

      } catch {

        // Ignore browser cleanup races.

      }



      if (gpsWatchRef.current === watchId) {

        gpsWatchRef.current = null

      }



      gpsSendingRef.current = false



      orderIds.forEach(
        (
          orderId
        ) => {
          void supabase
            .rpc(
              'delivery_driver_stop_live_location',
              {
                p_session_token:
                  token,

                p_order_id:
                  orderId,
              }
            )
            .then(
              ({
                error:
                  stopError,
              }) => {
                if (
                  stopError
                ) {
                  console.warn(
                    'Driver live GPS stop warning:',
                    stopError
                  )
                }
              }
            )
        }
      )

    }

  }, [
    sessionToken,
    liveTrackingOrderIdsKey,
    gpsRestartNonce,
  ])



  if (loading) {



    return (



      <main className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-neutral-950 px-3 py-6 text-white sm:px-4 sm:py-10">



        <div className="mx-auto w-full max-w-md rounded-3xl border border-neutral-800 bg-neutral-900 p-6 text-center sm:p-8">



          Loading Driver Portal...



        </div>



      </main>



    )



  }



  if (



    !sessionToken ||



    !portalData



  ) {



    return (



      <main className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-neutral-950 px-3 py-6 text-neutral-100 sm:px-4 sm:py-10">



        <div className="mx-auto w-full max-w-md">



          <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5 shadow-2xl sm:p-6">



            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-2xl">



              🚚



            </div>



            <p className="mt-5 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-400">



              Digital Dining



            </p>



            <h1 className="mt-1 text-2xl font-black text-white">



              Delivery Driver Login



            </h1>



            <p className="mt-2 text-sm leading-6 text-neutral-400">



              Sign in using the Driver



              User ID and password given



              by the restaurant owner.



            </p>



            <form



              onSubmit={handleLogin}



              className="mt-6 space-y-4"



            >



              <label className="block">



                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-neutral-500">



                  Driver User ID



                </span>



                <input



                  value={userId}



                  onChange={(event) =>



                    setUserId(



                      event.target.value



                    )



                  }



                  autoComplete="username"



                  placeholder="driver01"



                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-emerald-500"



                />



              </label>



              <label className="block">



                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-neutral-500">



                  Password



                </span>



                <input



                  type="password"



                  value={password}



                  onChange={(event) =>



                    setPassword(



                      event.target.value



                    )



                  }



                  autoComplete="current-password"



                  placeholder="••••••••"



                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-emerald-500"



                />



              </label>



              {error && (



                <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs font-bold leading-5 text-red-300">



                  {error}



                </div>



              )}



              <button



                type="submit"



                disabled={loggingIn}



                className="w-full rounded-xl bg-emerald-600 px-5 py-4 text-sm font-black text-white disabled:opacity-50"



              >



                {loggingIn



                  ? 'Signing In...'



                  : 'Open Driver Portal'}



              </button>



            </form>



            <p className="mt-5 text-center text-[10px] leading-5 text-neutral-600">



              Five failed login attempts



              temporarily lock the Driver



              Portal account for 15



              minutes.



            </p>



          </section>



        </div>



      </main>



    )



  }



  const driver =
    portalData.driver || {}

  const restaurant =
    portalData.restaurant || {}

  const codSummary =
    codData?.summary || {}

  const codSettlements =
    Array.isArray(
      codData?.settlements
    )
      ? codData.settlements
      : []

  const codCollections =
    Array.isArray(
      codData?.collections
    )
      ? codData.collections
      : []

  const codCashDue =
    Number(
      codSummary.cash_due ||
        0
    )

  const codPendingHandover =
    Number(
      codSummary.pending_handover ||
        0
    )

  const codAvailableToSubmit =
    Math.max(
      codCashDue -
        codPendingHandover,
      0
    )

  const completedCount =
    recentOrders.filter(
      (order) =>
        String(
          order.order_status ||
            ''
        ) === 'delivered'
    ).length

  const cancelledCount =
    recentOrders.filter(
      (order) =>
        String(
          order.order_status ||
            ''
        ) === 'cancelled'
    ).length

  const searchTerm =
    driverSearch
      .trim()
      .toLowerCase()

  const orderAddress =
    (order) =>
      [
        order?.address_line1,
        order?.address_line2,
        order?.landmark,
        order?.city,
        order?.state,
        order?.pincode,
      ]
        .filter(Boolean)
        .join(', ')

  const matchesSearch =
    (order) => {
      if (!searchTerm) {
        return true
      }

      const haystack =
        [
          order?.order_code,
          order?.customer_name,
          order?.customer_mobile,
          order?.alternate_mobile,
          orderAddress(order),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()

      return haystack.includes(
        searchTerm
      )
    }

  const visibleActiveOrders =
    activeOrders.filter(
      matchesSearch
    )

  const visibleRecentOrders =
    recentOrders.filter(
      matchesSearch
    )

  const activeCustomers =
    activeOrders
      .filter(matchesSearch)
      .map((order) => ({
        orderId:
          order.id,
        orderCode:
          order.order_code,
        name:
          order.customer_name ||
          'Customer',
        mobile:
          order.customer_mobile ||
          '',
        alternateMobile:
          order.alternate_mobile ||
          '',
        address:
          orderAddress(order),
        status:
          order.order_status,
      }))

  const restaurantPickupAddress =
    [
      restaurant.address,
      restaurant.address_line1,
      restaurant.address_line2,
      restaurant.city,
      restaurant.state,
      restaurant.pincode,
    ]
      .filter(Boolean)
      .join(', ') ||
    restaurant.name ||
    'Store pickup'

  const viewMeta = {
    dashboard: {
      eyebrow:
        'Overview',
      title:
        'Driver Dashboard',
      description:
        'Your shift, assigned deliveries and current cash position.',
    },

    tracking: {
      eyebrow:
        'Live Operations',
      title:
        'Tracking Delivery',
      description:
        'Follow every assigned delivery from packed to completed.',
    },

    inbox: {
      eyebrow:
        'Driver Inbox',
      title:
        'Alerts & Updates',
      description:
        'Important operational notices from your current delivery session.',
    },

    orders: {
      eyebrow:
        'Orders',
      title:
        'Delivery Orders',
      description:
        'Active assignments and recently completed delivery jobs.',
    },

    customers: {
      eyebrow:
        'Customers',
      title:
        'Customer Contacts',
      description:
        'Call, message or navigate to customers on your active route.',
    },

    assigned: {
      eyebrow:
        'Assignments',
      title:
        'Assigned Deliveries',
      description:
        'All orders currently assigned to you and waiting for delivery action.',
    },

    cod: {
      eyebrow:
        'Cash Management',
      title:
        'COD Reconciliation',
      description:
        'Review collected COD cash and submit physical handovers.',
    },

    returns: {
      eyebrow:
        'Return Logistics',
      title:
        'Return Pickups',
      description:
        'Handle return collection tasks assigned by the store.',
    },

    help: {
      eyebrow:
        'Support',
      title:
        'Help & Support',
      description:
        'Quick guidance for delivery, GPS, COD and order issues.',
    },

    settings: {
      eyebrow:
        'Driver',
      title:
        'Settings',
      description:
        'Alarm, account, vehicle and session controls.',
    },
  }

  const currentView =
    viewMeta[driverView] ||
    viewMeta.tracking

  const sidebarItems = [
    {
      key:
        'dashboard',
      icon:
        '⌂',
      label:
        'Dashboard',
    },
    {
      key:
        'tracking',
      icon:
        '◎',
      label:
        'Tracking',
      badge:
        activeOrders.length ||
        '',
    },
    {
      key:
        'inbox',
      icon:
        '✉',
      label:
        'Inbox',
      badge:
        waitingToStartOrders
          .length ||
        '',
    },
    {
      key:
        'orders',
      icon:
        '▣',
      label:
        'Orders',
    },
    {
      key:
        'customers',
      icon:
        '♙',
      label:
        'Customers',
    },
    {
      key:
        'assigned',
      icon:
        '🚚',
      label:
        'Assigned Deliveries',
      badge:
        activeOrders.length ||
        '',
    },
    {
      key:
        'cod',
      icon:
        '₹',
      label:
        'COD Reconciliation',
      badge:
        codCashDue > 0
          ? money(
              codCashDue
            )
          : '',
    },
    {
      key:
        'returns',
      icon:
        '↩',
      label:
        'Return Pickups',
    },
    {
      key:
        'help',
      icon:
        '?',
      label:
        'Help & Support',
    },
    {
      key:
        'settings',
      icon:
        '⚙',
      label:
        'Settings',
    },
  ]

  const renderAlarmCard =
    () => (
      <div
        className={`rounded-2xl border p-4 ${
          driverAlarmActive
            ? 'border-rose-200 bg-rose-50'
            : driverAlarmEnabled
              ? 'border-emerald-200 bg-emerald-50'
              : 'border-neutral-200 bg-white'
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <p
              className={`text-[10px] font-black uppercase tracking-[0.14em] ${
                driverAlarmActive
                  ? 'text-rose-600'
                  : driverAlarmEnabled
                    ? 'text-emerald-600'
                    : 'text-neutral-500'
              }`}
            >
              {driverAlarmActive
                ? '🔔 Delivery alarm active'
                : driverAlarmEnabled
                  ? '✓ Delivery alarm ready'
                  : 'Delivery alarm disabled'}
            </p>

            <p className="mt-1 text-xs leading-5 text-neutral-600">
              {driverAlarmActive
                ? `${waitingToStartOrders.length} assigned packed order${waitingToStartOrders.length === 1 ? '' : 's'} still need Start Delivery.`
                : driverAlarmEnabled
                  ? 'The alarm starts automatically when an assigned order is packed and ready.'
                  : 'Enable the alarm so packed orders keep alerting until you start every delivery.'}
            </p>
          </div>

          <button
            type="button"
            onClick={
              driverAlarmEnabled
                ? disableDriverAlarm
                : enableDriverAlarm
            }
            className={`shrink-0 rounded-xl px-3 py-2 text-[10px] font-black ${
              driverAlarmEnabled
                ? 'bg-neutral-900 text-white'
                : 'bg-emerald-600 text-white'
            }`}
          >
            {driverAlarmEnabled
              ? 'Alarm ON'
              : 'Enable'}
          </button>
        </div>
      </div>
    )

  const renderGpsCard =
    () =>
      liveTrackingOrder ? (
        <section className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-sky-600">
                Customer Live Tracking
              </p>

              <h3 className="mt-1 text-base font-black text-neutral-900">
                GPS for{' '}
                {liveTrackingOrder.order_code}
              </h3>

              <p className="mt-1 max-w-xl text-xs leading-5 text-neutral-500">
                Your live position is shared only while this order is Out for Delivery.
              </p>
            </div>

            <span
              className={`w-fit rounded-full px-3 py-1.5 text-[9px] font-black uppercase ${
                gpsStatus ===
                'live'
                  ? 'bg-emerald-50 text-emerald-700'
                  : gpsStatus ===
                      'requesting'
                    ? 'bg-amber-50 text-amber-700'
                    : gpsStatus ===
                        'error'
                      ? 'bg-rose-50 text-rose-700'
                      : 'bg-neutral-100 text-neutral-500'
              }`}
            >
              {gpsStatus ===
              'live'
                ? '● Live GPS'
                : gpsStatus ===
                    'requesting'
                  ? 'Finding GPS'
                  : gpsStatus ===
                      'error'
                    ? 'GPS Attention'
                    : 'GPS Idle'}
            </span>
          </div>

          <div
            className={`mt-4 rounded-xl border px-4 py-3 text-xs font-bold leading-5 ${
              gpsStatus ===
              'live'
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                : gpsStatus ===
                    'error'
                  ? 'border-rose-200 bg-rose-50 text-rose-700'
                  : 'border-neutral-200 bg-neutral-50 text-neutral-500'
            }`}
          >
            {gpsMessage ||
              'Waiting for delivery to start.'}

            {gpsStatus ===
              'live' &&
              liveTrackingOrders.length > 1 && (
                <p className="mt-2 text-[10px] font-black text-emerald-800">
                  The same live Driver location is being shared with all {liveTrackingOrders.length} orders for this customer mobile.
                </p>
              )}

            {gpsStatus ===
              'live' && (
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[10px] font-semibold text-emerald-700/80">
                {gpsAccuracy !==
                  null && (
                  <span>
                    Accuracy ±
                    {Math.round(
                      Number(
                        gpsAccuracy
                      )
                    )}{' '}
                    m
                  </span>
                )}

                {gpsLastSentAt && (
                  <span>
                    Last sent{' '}
                    {new Date(
                      gpsLastSentAt
                    ).toLocaleTimeString(
                      'en-IN',
                      {
                        hour:
                          '2-digit',
                        minute:
                          '2-digit',
                        second:
                          '2-digit',
                      }
                    )}
                  </span>
                )}
              </div>
            )}
          </div>

          {gpsStatus ===
            'error' && (
            <button
              type="button"
              onClick={() =>
                setGpsRestartNonce(
                  (value) =>
                    value + 1
                )
              }
              className="mt-3 rounded-xl bg-sky-600 px-4 py-3 text-xs font-black text-white"
            >
              Retry GPS
            </button>
          )}
        </section>
      ) : null

  const renderTrackingCard =
    (order) => {
      const address =
        orderAddress(order)

      const hasLiveLocation =
        Number.isFinite(
          Number(
            order.latitude
          )
        ) &&
        Number.isFinite(
          Number(
            order.longitude
          )
        )

      const mapUrl =
        hasLiveLocation
          ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              `${order.latitude},${order.longitude}`
            )}`
          : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
              address
            )}`

      const status =
        String(
          order.order_status ||
            ''
        )

      const isPacked =
        status ===
        'packed'

      const isTransit =
        status ===
        'out_for_delivery'

      const codDue =
        order.payment_method ===
          'cod' &&
        order.payment_status !==
          'paid'

      const progress =
        isTransit
          ? '72%'
          : isPacked
            ? '42%'
            : '18%'

      const statusClasses =
        isTransit
          ? 'bg-violet-100 text-violet-700'
          : isPacked
            ? 'bg-amber-100 text-amber-700'
            : 'bg-sky-100 text-sky-700'

      const mobile =
        String(
          order.customer_mobile ||
            ''
        )

      const whatsapp =
        mobile.replace(
          /\D/g,
          ''
        )

      return (
        <article
          key={order.id}
          className={`rounded-2xl border bg-white p-4 shadow-sm transition sm:p-5 ${
            isTransit
              ? 'border-blue-300 ring-2 ring-blue-100'
              : 'border-neutral-200'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 text-sm">
                ▣
              </div>

              <div className="min-w-0">
                <p className="truncate font-mono text-xs font-black text-neutral-900">
                  #
                  {order.order_code}
                </p>

                <p className="mt-0.5 text-[9px] font-semibold text-neutral-400">
                  Assigned{' '}
                  {formatDate(
                    order.created_at
                  )}
                </p>
              </div>
            </div>

            <span
              className={`rounded-lg px-2.5 py-1 text-[9px] font-black ${statusClasses}`}
            >
              {isTransit
                ? 'Transit'
                : isPacked
                  ? 'Ready'
                  : labelStatus(
                      status
                    )}
            </span>
          </div>

          <div className="mt-5">
            <div className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-emerald-500 bg-white" />

              <div className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-neutral-200">
                <div
                  className="absolute inset-y-0 left-0 rounded-full bg-emerald-500"
                  style={{
                    width:
                      progress,
                  }}
                />
              </div>

              <span className="text-sm">
                🚚
              </span>

              <div className="relative h-[3px] flex-1 overflow-hidden rounded-full bg-neutral-200">
                <div
                  className={`absolute inset-y-0 left-0 rounded-full ${
                    isTransit
                      ? 'bg-blue-500'
                      : 'bg-neutral-300'
                  }`}
                  style={{
                    width:
                      isTransit
                        ? '55%'
                        : '5%',
                  }}
                />
              </div>

              <span className="h-2.5 w-2.5 shrink-0 rounded-full border-2 border-neutral-300 bg-white" />
            </div>

            <div className="mt-2 grid grid-cols-2 gap-4 text-[9px] leading-4 text-neutral-500">
              <p className="line-clamp-2">
                {restaurantPickupAddress}
              </p>

              <p className="line-clamp-2 text-right">
                {address ||
                  'Customer address'}
              </p>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-neutral-100 pt-4">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-neutral-100 text-xs font-black text-neutral-600">
                {String(
                  order.customer_name ||
                    'C'
                )
                  .trim()
                  .charAt(0)
                  .toUpperCase()}
              </div>

              <div className="min-w-0">
                <p className="truncate text-xs font-black text-neutral-900">
                  {order.customer_name ||
                    'Customer'}
                </p>

                <p className="mt-0.5 truncate text-[9px] text-neutral-400">
                  {mobile ||
                    'No mobile'}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 gap-2">
              {mobile && (
                <a
                  href={`tel:${mobile}`}
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 text-sm transition hover:bg-neutral-100"
                  title="Call customer"
                >
                  ☎
                </a>
              )}

              {whatsapp && (
                <a
                  href={`https://wa.me/${whatsapp}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-9 w-9 items-center justify-center rounded-lg border border-neutral-200 bg-neutral-50 text-sm transition hover:bg-neutral-100"
                  title="Message customer"
                >
                  ✉
                </a>
              )}
            </div>
          </div>

          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <a
              href={mapUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-center text-[10px] font-black text-neutral-700 transition hover:bg-neutral-100"
            >
              ↗ Navigate
            </a>

            <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-center">
              <p className="text-[8px] font-black uppercase text-neutral-400">
                Total
              </p>

              <p className="mt-0.5 text-xs font-black text-neutral-900">
                {money(
                  order.total_amount
                )}
              </p>
            </div>

            <div
              className={`rounded-xl border px-3 py-2.5 text-center ${
                codDue
                  ? 'border-amber-200 bg-amber-50'
                  : 'border-emerald-200 bg-emerald-50'
              }`}
            >
              <p
                className={`text-[8px] font-black uppercase ${
                  codDue
                    ? 'text-amber-600'
                    : 'text-emerald-600'
                }`}
              >
                {codDue
                  ? 'Collect COD'
                  : 'Payment'}
              </p>

              <p
                className={`mt-0.5 text-xs font-black ${
                  codDue
                    ? 'text-amber-700'
                    : 'text-emerald-700'
                }`}
              >
                {codDue
                  ? money(
                      order.total_amount
                    )
                  : labelStatus(
                      order.payment_status ||
                        'paid'
                    )}
              </p>
            </div>
          </div>

          {order.customer_note && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">
              <p className="text-[8px] font-black uppercase tracking-wider text-amber-600">
                Customer Note
              </p>

              <p className="mt-1 text-[10px] leading-5 text-amber-800">
                {order.customer_note}
              </p>
            </div>
          )}

          {Array.isArray(
            order.items
          ) &&
            order.items.length >
              0 && (
              <details className="mt-3 rounded-xl border border-neutral-200 bg-neutral-50">
                <summary className="cursor-pointer px-3 py-2.5 text-[10px] font-black text-neutral-600">
                  Order items (
                  {order.items.length})
                </summary>

                <div className="space-y-1 border-t border-neutral-200 px-3 py-3">
                  {order.items.map(
                    (
                      item,
                      itemIndex
                    ) => (
                      <div
                        key={`${order.id}-${item.id || item.menu_item_id || itemIndex}`}
                        className="flex items-center justify-between gap-3 text-[10px]"
                      >
                        <span className="min-w-0 truncate font-semibold text-neutral-600">
                          {item.name ||
                            item.item_name ||
                            'Item'}
                        </span>

                        <span className="shrink-0 font-black text-neutral-900">
                          ×
                          {Number(
                            item.quantity ||
                              item.qty ||
                              1
                          )}
                        </span>
                      </div>
                    )
                  )}
                </div>
              </details>
            )}

          {isPacked && (
            <button
              type="button"
              disabled={
                updatingOrderId ===
                order.id
              }
              onClick={() =>
                updateStatus(
                  order,
                  'out_for_delivery'
                )
              }
              className="mt-4 w-full rounded-xl bg-blue-600 px-5 py-3.5 text-xs font-black text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
            >
              {updatingOrderId ===
              order.id
                ? 'Starting...'
                : 'Start Delivery'}
            </button>
          )}

          {isTransit && (
            <DeliveryResultPanel
              order={order}
              sessionToken={
                sessionToken
              }
              disabled={
                updatingOrderId ===
                order.id
              }
              onCompleted={async (
                text
              ) => {
                setMessage(text)
                setError('')
                await loadPortal()
              }}
            />
          )}

          {![
            'packed',
            'out_for_delivery',
          ].includes(status) && (
            <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-[10px] font-semibold text-neutral-500">
              Waiting for the store to mark this order Packed.
            </div>
          )}
        </article>
      )
    }

  const renderCodWorkspace =
    () => (
      <div className="space-y-4">
        <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-amber-600">
                COD Cash Reconciliation
              </p>

              <h3 className="mt-1 text-lg font-black text-neutral-900">
                Cash collected from customers
              </h3>

              <p className="mt-1 max-w-2xl text-xs leading-5 text-neutral-500">
                Submit cash only after physically handing it to the Manager or Owner. Your balance reduces after approval.
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                loadCodSummary(
                  '',
                  false
                )
              }
              disabled={
                codLoading
              }
              className="w-fit rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-[10px] font-black text-neutral-600 disabled:opacity-50"
            >
              {codLoading
                ? 'Refreshing...'
                : '↻ Refresh COD'}
            </button>
          </div>

          {codError && (
            <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3 py-3 text-xs font-bold text-rose-700">
              {codError}
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
              <p className="text-[9px] font-black uppercase text-amber-600">
                Cash Due
              </p>
              <p className="mt-2 text-xl font-black text-amber-800">
                {money(
                  codCashDue
                )}
              </p>
            </div>

            <div className="rounded-xl border border-sky-200 bg-sky-50 p-4">
              <p className="text-[9px] font-black uppercase text-sky-600">
                Pending Handover
              </p>
              <p className="mt-2 text-xl font-black text-sky-800">
                {money(
                  codPendingHandover
                )}
              </p>
            </div>

            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="text-[9px] font-black uppercase text-emerald-600">
                Can Submit
              </p>
              <p className="mt-2 text-xl font-black text-emerald-800">
                {money(
                  codAvailableToSubmit
                )}
              </p>
            </div>
          </div>

          <form
            onSubmit={
              submitCodSettlement
            }
            className="mt-4 rounded-2xl border border-neutral-200 bg-neutral-50 p-4"
          >
            <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
              <input
                type="number"
                min="0.01"
                step="0.01"
                max={
                  codAvailableToSubmit ||
                  undefined
                }
                value={codAmount}
                onChange={(
                  event
                ) =>
                  setCodAmount(
                    event.target.value
                  )
                }
                placeholder="Amount ₹"
                disabled={
                  codSubmitting ||
                  codAvailableToSubmit <=
                    0
                }
                className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 text-xs font-bold text-neutral-900 outline-none focus:border-amber-500 disabled:opacity-50"
              />

              <input
                value={codNote}
                onChange={(
                  event
                ) =>
                  setCodNote(
                    event.target.value
                  )
                }
                maxLength={500}
                placeholder="Optional handover note"
                disabled={
                  codSubmitting ||
                  codAvailableToSubmit <=
                    0
                }
                className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 text-xs font-bold text-neutral-900 outline-none focus:border-amber-500 disabled:opacity-50"
              />
            </div>

            <button
              type="submit"
              disabled={
                codSubmitting ||
                codAvailableToSubmit <=
                  0 ||
                !String(
                  codAmount || ''
                ).trim()
              }
              className="mt-3 w-full rounded-xl bg-amber-500 px-4 py-3 text-xs font-black text-neutral-950 disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400"
            >
              {codSubmitting
                ? 'Submitting Cash Handover...'
                : '💵 Submit COD Cash Handover'}
            </button>

            {codAvailableToSubmit <=
              0 && (
              <p className="mt-2 text-[10px] leading-4 text-neutral-400">
                No additional COD cash can be submitted right now.
              </p>
            )}
          </form>
        </section>

        {codSettlements.length >
          0 && (
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-neutral-400">
              Handover History
            </p>

            <div className="mt-3 space-y-2">
              {codSettlements
                .slice(0, 12)
                .map(
                  (
                    settlement
                  ) => (
                    <div
                      key={
                        settlement.id
                      }
                      className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-black text-neutral-900">
                          {money(
                            settlement.amount_submitted
                          )}
                        </p>

                        <p className="mt-1 text-[9px] text-neutral-400">
                          {formatDate(
                            settlement.submitted_at
                          )}
                          {settlement.reviewed_by_name
                            ? ` · ${settlement.reviewed_by_name}`
                            : ''}
                        </p>
                      </div>

                      <span
                        className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${
                          settlement.status ===
                          'approved'
                            ? 'bg-emerald-100 text-emerald-700'
                            : settlement.status ===
                                'rejected'
                              ? 'bg-rose-100 text-rose-700'
                              : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {labelStatus(
                          settlement.status
                        )}
                      </span>
                    </div>
                  )
                )}
            </div>
          </section>
        )}

        {codCollections.some(
          (row) =>
            Number(
              row.outstanding_amount ||
                0
            ) > 0
        ) && (
          <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-[0.14em] text-neutral-400">
              Unsettled COD Orders
            </p>

            <div className="mt-3 space-y-2">
              {codCollections
                .filter(
                  (row) =>
                    Number(
                      row.outstanding_amount ||
                        0
                    ) > 0
                )
                .slice(0, 12)
                .map(
                  (row) => (
                    <div
                      key={
                        row.id
                      }
                      className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3"
                    >
                      <div>
                        <p className="font-mono text-[10px] font-black text-neutral-900">
                          {row.order_code ||
                            'COD Order'}
                        </p>

                        <p className="mt-1 text-[9px] text-neutral-400">
                          Collected{' '}
                          {formatDate(
                            row.collected_at
                          )}
                        </p>
                      </div>

                      <p className="text-xs font-black text-amber-700">
                        {money(
                          row.outstanding_amount
                        )}
                      </p>
                    </div>
                  )
                )}
            </div>
          </section>
        )}
      </div>
    )

  return (
    <main className="min-h-[100dvh] bg-[#f5f6f8] text-neutral-900">
      <div className="mx-auto grid min-h-[100dvh] w-full max-w-[1600px] lg:grid-cols-[280px_minmax(0,1fr)]">
        {/* DESKTOP LEFT SIDEBAR */}
        <aside className="sticky top-0 hidden h-[100dvh] flex-col border-r border-neutral-200 bg-white lg:flex">
          <div className="border-b border-neutral-100 p-5">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pink-100 text-sm font-black text-pink-700">
                {String(
                  driver.name ||
                    'D'
                )
                  .trim()
                  .charAt(0)
                  .toUpperCase()}
              </div>

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-black text-neutral-900">
                  {driver.name ||
                    'Delivery Boy'}
                </p>

                <p className="mt-0.5 truncate text-[10px] text-neutral-400">
                  {driver.mobile ||
                    restaurant.name ||
                    'Driver Portal'}
                </p>
              </div>

              <span
                className={`mt-1 h-2.5 w-2.5 rounded-full ${
                  driver.status ===
                  'busy'
                    ? 'bg-amber-400'
                    : 'bg-emerald-500'
                }`}
                title={
                  driver.status ||
                  'available'
                }
              />
            </div>

            <div className="relative mt-5">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400">
                ⌕
              </span>

              <input
                value={driverSearch}
                onChange={(
                  event
                ) =>
                  setDriverSearch(
                    event.target.value
                  )
                }
                placeholder="Search order / customer"
                className="w-full rounded-xl border border-neutral-200 bg-neutral-50 py-2.5 pl-8 pr-3 text-[11px] font-semibold text-neutral-800 outline-none transition focus:border-blue-400 focus:bg-white"
              />
            </div>
          </div>

          <nav className="flex-1 overflow-y-auto p-3">
            <div className="space-y-1">
              {sidebarItems.map(
                (item) => {
                  const active =
                    driverView ===
                    item.key

                  return (
                    <button
                      key={
                        item.key
                      }
                      type="button"
                      onClick={() =>
                        setDriverView(
                          item.key
                        )
                      }
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${
                        active
                          ? 'border border-neutral-200 bg-neutral-50 shadow-sm'
                          : 'border border-transparent text-neutral-500 hover:bg-neutral-50 hover:text-neutral-900'
                      }`}
                    >
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-sm ${
                          active
                            ? 'bg-white text-neutral-900'
                            : 'text-neutral-400'
                        }`}
                      >
                        {item.icon}
                      </span>

                      <span
                        className={`min-w-0 flex-1 truncate text-[11px] font-bold ${
                          active
                            ? 'text-neutral-900'
                            : ''
                        }`}
                      >
                        {item.label}
                      </span>

                      {item.badge !==
                        '' &&
                        item.badge !==
                          undefined && (
                          <span
                            className={`max-w-[92px] truncate rounded-full px-2 py-0.5 text-[9px] font-black ${
                              item.key ===
                              'cod'
                                ? 'bg-amber-100 text-amber-700'
                                : 'bg-neutral-100 text-neutral-600'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                    </button>
                  )
                }
              )}
            </div>
          </nav>

          <div className="border-t border-neutral-100 p-4">
            <button
              type="button"
              onClick={() =>
                setDriverView(
                  'cod'
                )
              }
              className="w-full rounded-2xl border border-amber-200 bg-amber-50 p-4 text-left"
            >
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-wider text-amber-600">
                    COD Cash Due
                  </p>

                  <p className="mt-1 text-lg font-black text-amber-900">
                    {money(
                      codCashDue
                    )}
                  </p>
                </div>

                <span className="text-xl">
                  ₹
                </span>
              </div>

              <div className="mt-3 flex items-center justify-between text-[9px] font-semibold text-amber-700">
                <span>
                  Pending{' '}
                  {money(
                    codPendingHandover
                  )}
                </span>

                <span>
                  Manage →
                </span>
              </div>
            </button>

            <button
              type="button"
              onClick={
                driverAlarmEnabled
                  ? disableDriverAlarm
                  : enableDriverAlarm
              }
              className={`mt-3 w-full rounded-xl px-3 py-2.5 text-[10px] font-black ${
                driverAlarmEnabled
                  ? 'bg-emerald-600 text-white'
                  : 'border border-neutral-200 bg-white text-neutral-600'
              }`}
            >
              {driverAlarmEnabled
                ? '🔔 Delivery Alarm ON'
                : '🔕 Enable Delivery Alarm'}
            </button>

            <button
              type="button"
              onClick={logout}
              className="mt-2 w-full rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-[10px] font-black text-neutral-500 transition hover:bg-neutral-50 hover:text-rose-600"
            >
              Sign Out
            </button>
          </div>
        </aside>

        {/* MAIN WORKSPACE */}
        <section className="min-w-0">
          {/* MOBILE HEADER */}
          <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/95 backdrop-blur lg:hidden">
            <div className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-neutral-900">
                  {restaurant.name ||
                    'Delivery'}
                </p>

                <p className="mt-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-600">
                  Driver Portal
                </p>
              </div>

              <button
                type="button"
                onClick={
                  driverAlarmEnabled
                    ? disableDriverAlarm
                    : enableDriverAlarm
                }
                className={`rounded-xl px-3 py-2 text-[9px] font-black ${
                  driverAlarmEnabled
                    ? 'bg-emerald-600 text-white'
                    : 'border border-neutral-200 bg-neutral-50 text-neutral-600'
                }`}
              >
                {driverAlarmEnabled
                  ? '🔔 ON'
                  : '🔕 Alarm'}
              </button>
            </div>

            <div className="flex gap-1 overflow-x-auto border-t border-neutral-100 px-3 py-2">
              {sidebarItems.map(
                (item) => (
                  <button
                    key={
                      item.key
                    }
                    type="button"
                    onClick={() =>
                      setDriverView(
                        item.key
                      )
                    }
                    className={`shrink-0 rounded-lg px-3 py-2 text-[9px] font-black ${
                      driverView ===
                      item.key
                        ? 'bg-neutral-900 text-white'
                        : 'bg-neutral-50 text-neutral-500'
                    }`}
                  >
                    {item.icon}{' '}
                    {item.key ===
                    'cod'
                      ? 'COD'
                      : item.label}
                  </button>
                )
              )}
            </div>
          </header>

          <div className="px-3 py-4 sm:px-5 sm:py-5 lg:px-8 lg:py-7">
            {/* PAGE HEADER */}
            <div className="mx-auto max-w-6xl">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.16em] text-neutral-400">
                    {currentView.eyebrow}
                  </p>

                  <h1 className="mt-1 text-xl font-black tracking-tight text-neutral-900 sm:text-2xl">
                    {currentView.title}
                  </h1>

                  <p className="mt-1 max-w-2xl text-xs leading-5 text-neutral-500">
                    {currentView.description}
                  </p>
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={async () => {
                      await Promise.all([
                        loadPortal(),
                        loadCodSummary(
                          '',
                          true
                        ),
                      ])
                    }}
                    className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-[10px] font-black text-neutral-600 shadow-sm transition hover:bg-neutral-50"
                  >
                    ↻ Refresh
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setDriverView(
                        'settings'
                      )
                    }
                    className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-[10px] font-black text-neutral-600 shadow-sm transition hover:bg-neutral-50"
                  >
                    ⋮
                  </button>
                </div>
              </div>

              {/* MOBILE SEARCH */}
              <div className="relative mt-4 lg:hidden">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-neutral-400">
                  ⌕
                </span>

                <input
                  value={
                    driverSearch
                  }
                  onChange={(
                    event
                  ) =>
                    setDriverSearch(
                      event.target.value
                    )
                  }
                  placeholder="Search order / customer"
                  className="w-full rounded-xl border border-neutral-200 bg-white py-3 pl-8 pr-3 text-xs font-semibold text-neutral-800 outline-none"
                />
              </div>

              {message && (
                <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700">
                  {message}
                </div>
              )}

              {error && (
                <div className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-bold text-rose-700">
                  {error}
                </div>
              )}

              {/* DASHBOARD */}
              {driverView ===
                'dashboard' && (
                <div className="mt-5 space-y-4">
                  {renderAlarmCard()}

                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                    {[
                      {
                        label:
                          'Active Deliveries',
                        value:
                          activeOrders.length,
                        hint:
                          `${waitingToStartOrders.length} waiting to start`,
                      },
                      {
                        label:
                          'Completed',
                        value:
                          completedCount,
                        hint:
                          'Recent completed jobs',
                      },
                      {
                        label:
                          'COD Cash Due',
                        value:
                          money(
                            codCashDue
                          ),
                        hint:
                          `${money(codPendingHandover)} pending approval`,
                      },
                      {
                        label:
                          'Driver Status',
                        value:
                          labelStatus(
                            driver.status ||
                              'available'
                          ),
                        hint:
                          driver.vehicle_number ||
                          driver.vehicle_type ||
                          'Ready for assignments',
                      },
                    ].map(
                      (card) => (
                        <div
                          key={
                            card.label
                          }
                          className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
                        >
                          <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                            {card.label}
                          </p>

                          <p className="mt-2 text-xl font-black text-neutral-900">
                            {card.value}
                          </p>

                          <p className="mt-1 text-[9px] leading-4 text-neutral-400">
                            {card.hint}
                          </p>
                        </div>
                      )
                    )}
                  </div>

                  {renderGpsCard()}

                </div>
              )}

              {/* TRACKING */}
              {driverView ===
                'tracking' && (
                <div className="mt-5 space-y-4">
                  {liveTrackingOrders.length > 0 ? (
                    <div className="space-y-4">
                      <div
                        className={`rounded-2xl border px-4 py-3 ${
                          liveTrackingOrders.length > 1
                            ? 'border-amber-200 bg-amber-50'
                            : 'border-sky-200 bg-sky-50'
                        }`}
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p
                              className={`text-[10px] font-black uppercase tracking-[0.14em] ${
                                liveTrackingOrders.length > 1
                                  ? 'text-amber-700'
                                  : 'text-sky-700'
                              }`}
                            >
                              {liveTrackingOrders.length > 1
                                ? '⚠ Same Customer · Multiple Orders'
                                : '● Live Location Sharing'}
                            </p>

                            <p
                              className={`mt-1 text-xs leading-5 ${
                                liveTrackingOrders.length > 1
                                  ? 'text-amber-900'
                                  : 'text-sky-800'
                              }`}
                            >
                              {liveTrackingOrders.length > 1
                                ? `${liveTrackingOrders.length} different orders are Out for Delivery for the same customer mobile number. Complete every order card below separately before leaving this customer.`
                                : 'This order is currently Out for Delivery.'}
                            </p>
                          </div>

                          {liveTrackingOrders.length > 1 && (
                            <span className="w-fit shrink-0 rounded-full bg-amber-200 px-3 py-1.5 text-[10px] font-black text-amber-900">
                              {liveTrackingOrders.length} ORDERS
                            </span>
                          )}
                        </div>
                      </div>

                      {liveTrackingOrders.length > 1 && (
                        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3">
                          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-rose-700">
                            Delivery Reminder
                          </p>

                          <p className="mt-1 text-xs font-bold leading-5 text-rose-800">
                            Do not complete only one order and leave. This customer has {liveTrackingOrders.length} separate orders. Submit Delivered / Not Delivered for every order shown below.
                          </p>
                        </div>
                      )}

                      <div className="grid gap-4">
                        {liveTrackingOrders.map(
                          (trackedOrder) =>
                            renderTrackingCard(
                              trackedOrder
                            )
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-neutral-300 bg-white py-16 text-center">
                      <div className="text-3xl">
                        ◎
                      </div>

                      <p className="mt-3 text-sm font-black text-neutral-800">
                        No live-tracked delivery
                      </p>

                      <p className="mx-auto mt-1 max-w-md text-xs leading-5 text-neutral-400">
                        Start Delivery from Assigned Deliveries. When this portal begins sharing the Delivery Boy's GPS location for that order, it will appear here automatically.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* INBOX */}
              {driverView ===
                'inbox' && (
                <div className="mt-5 grid gap-4 xl:grid-cols-2">
                  <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                    <p className="text-[9px] font-black uppercase tracking-[0.14em] text-neutral-400">
                      Action Required
                    </p>

                    <div className="mt-4 space-y-2">
                      {waitingToStartOrders
                        .map(
                          (order) => (
                            <button
                              key={
                                order.id
                              }
                              type="button"
                              onClick={() =>
                                setDriverView(
                                  'assigned'
                                )
                              }
                              className="flex w-full items-center justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left"
                            >
                              <div>
                                <p className="text-xs font-black text-amber-900">
                                  Start Delivery{' '}
                                  {
                                    order.order_code
                                  }
                                </p>

                                <p className="mt-1 text-[9px] text-amber-700">
                                  {order.customer_name ||
                                    'Customer'}{' '}
                                  · Packed & ready
                                </p>
                              </div>

                              <span className="text-amber-700">
                                →
                              </span>
                            </button>
                          )
                        )}

                      {!waitingToStartOrders
                        .length && (
                        <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-8 text-center">
                          <p className="text-xs font-black text-neutral-700">
                            You're all caught up.
                          </p>

                          <p className="mt-1 text-[10px] text-neutral-400">
                            No packed order is waiting for Start Delivery.
                          </p>
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                    <p className="text-[9px] font-black uppercase tracking-[0.14em] text-neutral-400">
                      Session Alerts
                    </p>

                    <div className="mt-4 space-y-3">
                      {renderAlarmCard()}

                      <div className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3">
                        <p className="text-[10px] font-black text-neutral-800">
                          COD cash
                        </p>

                        <p className="mt-1 text-[10px] text-neutral-500">
                          {money(
                            codCashDue
                          )}{' '}
                          due ·{' '}
                          {money(
                            codPendingHandover
                          )}{' '}
                          pending handover
                        </p>
                      </div>

                      {liveTrackingOrder && (
                        <div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">
                          <p className="text-[10px] font-black text-sky-800">
                            Live GPS active
                          </p>

                          <p className="mt-1 text-[10px] text-sky-600">
                            {liveTrackingOrder.order_code}{' '}
                            is currently Out for Delivery.
                          </p>
                        </div>
                      )}
                    </div>
                  </section>
                </div>
              )}

              {/* ORDERS */}
              {driverView ===
                'orders' && (
                <div className="mt-5 grid gap-4 xl:grid-cols-2">
                  <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-blue-500">
                          Active
                        </p>

                        <h3 className="mt-1 text-base font-black text-neutral-900">
                          Assigned Orders
                        </h3>
                      </div>

                      <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[9px] font-black text-blue-700">
                        {
                          visibleActiveOrders.length
                        }
                      </span>
                    </div>

                    <div className="mt-4 space-y-2">
                      {visibleActiveOrders.map(
                        (order) => (
                          <button
                            key={
                              order.id
                            }
                            type="button"
                            onClick={() =>
                              setDriverView(
                                'tracking'
                              )
                            }
                            className="flex w-full items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-left transition hover:bg-white"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-mono text-[10px] font-black text-neutral-900">
                                {
                                  order.order_code
                                }
                              </p>

                              <p className="mt-1 truncate text-[9px] text-neutral-400">
                                {order.customer_name ||
                                  'Customer'}{' '}
                                ·{' '}
                                {labelStatus(
                                  order.order_status
                                )}
                              </p>
                            </div>

                            <p className="text-xs font-black text-neutral-900">
                              {money(
                                order.total_amount
                              )}
                            </p>
                          </button>
                        )
                      )}

                      {!visibleActiveOrders
                        .length && (
                        <p className="rounded-xl border border-dashed border-neutral-200 py-10 text-center text-xs text-neutral-400">
                          No active orders.
                        </p>
                      )}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.14em] text-emerald-500">
                          Recent
                        </p>

                        <h3 className="mt-1 text-base font-black text-neutral-900">
                          Completed Orders
                        </h3>
                      </div>

                      <span className="rounded-full bg-neutral-100 px-2.5 py-1 text-[9px] font-black text-neutral-600">
                        {
                          visibleRecentOrders.length
                        }
                      </span>
                    </div>

                    <div className="mt-4 space-y-2">
                      {visibleRecentOrders.map(
                        (order) => (
                          <div
                            key={
                              order.id
                            }
                            className="flex items-center justify-between gap-3 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-mono text-[10px] font-black text-neutral-900">
                                {
                                  order.order_code
                                }
                              </p>

                              <p className="mt-1 text-[9px] text-neutral-400">
                                {formatDate(
                                  order.delivered_at ||
                                    order.created_at
                                )}
                              </p>
                            </div>

                            <span
                              className={`rounded-full px-2.5 py-1 text-[9px] font-black ${
                                order.order_status ===
                                'delivered'
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-rose-100 text-rose-700'
                              }`}
                            >
                              {labelStatus(
                                order.order_status
                              )}
                            </span>
                          </div>
                        )
                      )}

                      {!visibleRecentOrders
                        .length && (
                        <p className="rounded-xl border border-dashed border-neutral-200 py-10 text-center text-xs text-neutral-400">
                          No recent orders.
                        </p>
                      )}
                    </div>
                  </section>
                </div>
              )}

              {/* CUSTOMERS */}
              {driverView ===
                'customers' && (
                <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {activeCustomers.map(
                    (customer) => {
                      const cleanMobile =
                        String(
                          customer.mobile ||
                            ''
                        ).replace(
                          /\D/g,
                          ''
                        )

                      return (
                        <article
                          key={
                            customer.orderId
                          }
                          className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
                        >
                          <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-sm font-black text-neutral-600">
                              {customer.name
                                .charAt(
                                  0
                                )
                                .toUpperCase()}
                            </div>

                            <div className="min-w-0">
                              <p className="truncate text-xs font-black text-neutral-900">
                                {
                                  customer.name
                                }
                              </p>

                              <p className="mt-0.5 truncate text-[9px] text-neutral-400">
                                {
                                  customer.orderCode
                                }{' '}
                                ·{' '}
                                {labelStatus(
                                  customer.status
                                )}
                              </p>
                            </div>
                          </div>

                          <p className="mt-3 line-clamp-2 text-[10px] leading-5 text-neutral-500">
                            {customer.address ||
                              'No delivery address'}
                          </p>

                          <div className="mt-4 grid grid-cols-2 gap-2">
                            {customer.mobile ? (
                              <a
                                href={`tel:${customer.mobile}`}
                                className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-center text-[10px] font-black text-neutral-700"
                              >
                                ☎ Call
                              </a>
                            ) : (
                              <span className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-center text-[10px] font-black text-neutral-300">
                                No mobile
                              </span>
                            )}

                            {cleanMobile ? (
                              <a
                                href={`https://wa.me/${cleanMobile}`}
                                target="_blank"
                                rel="noreferrer"
                                className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-center text-[10px] font-black text-neutral-700"
                              >
                                ✉ Message
                              </a>
                            ) : (
                              <span className="rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-2.5 text-center text-[10px] font-black text-neutral-300">
                                No message
                              </span>
                            )}
                          </div>
                        </article>
                      )
                    }
                  )}

                  {!activeCustomers.length && (
                    <div className="sm:col-span-2 xl:col-span-3 rounded-2xl border border-dashed border-neutral-300 bg-white py-16 text-center">
                      <p className="text-sm font-black text-neutral-700">
                        No active customers
                      </p>

                      <p className="mt-1 text-xs text-neutral-400">
                        Customer contacts appear when orders are assigned.
                      </p>
                    </div>
                  )}
                </div>
              )}

              {/* ASSIGNED DELIVERIES */}
              {driverView ===
                'assigned' && (
                <div className="mt-5 space-y-4">
                  {renderAlarmCard()}

                  <div className="grid gap-4 xl:grid-cols-2">
                    {visibleActiveOrders.map(
                      renderTrackingCard
                    )}

                    {!visibleActiveOrders
                      .length && (
                      <div className="xl:col-span-2 rounded-2xl border border-dashed border-neutral-300 bg-white py-16 text-center">
                        <div className="text-3xl">
                          🚚
                        </div>

                        <p className="mt-3 text-sm font-black text-neutral-800">
                          {searchTerm
                            ? 'No matching assigned deliveries'
                            : 'No assigned deliveries'}
                        </p>

                        <p className="mt-1 text-xs text-neutral-400">
                          {searchTerm
                            ? 'Try another order code, customer or mobile number.'
                            : 'New assigned orders will appear here automatically.'}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* COD */}
              {driverView ===
                'cod' && (
                <div className="mt-5">
                  {renderCodWorkspace()}
                </div>
              )}

              {/* RETURN PICKUPS */}
              {driverView ===
                'returns' && (
                <div className="mt-5 rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm sm:p-5">
                  <DeliveryReturnPickupTasks
                    sessionToken={
                      sessionToken
                    }
                  />
                </div>
              )}

              {/* HELP */}
              {driverView ===
                'help' && (
                <div className="mt-5 grid gap-4 xl:grid-cols-2">
                  <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                    <p className="text-[9px] font-black uppercase tracking-[0.14em] text-neutral-400">
                      Delivery Help
                    </p>

                    <div className="mt-4 space-y-3">
                      {[
                        [
                          'Alarm',
                          'Enable Delivery Alarm once after login. Packed assignments keep sounding until Start Delivery is pressed for every waiting order.',
                        ],
                        [
                          'GPS',
                          'Allow precise location when an order is Out for Delivery. Use Retry GPS if location permission or signal fails.',
                        ],
                        [
                          'COD',
                          'Submit only the cash that was physically handed to the Manager/Owner. Pending handovers require approval.',
                        ],
                        [
                          'Failed delivery',
                          'Use Not Delivered and select the correct reason. Add photos or notes when useful.',
                        ],
                      ].map(
                        ([
                          title,
                          body,
                        ]) => (
                          <div
                            key={
                              title
                            }
                            className="rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3"
                          >
                            <p className="text-xs font-black text-neutral-800">
                              {title}
                            </p>

                            <p className="mt-1 text-[10px] leading-5 text-neutral-500">
                              {body}
                            </p>
                          </div>
                        )
                      )}
                    </div>
                  </section>

                  <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                    <p className="text-[9px] font-black uppercase tracking-[0.14em] text-neutral-400">
                      Store Contact
                    </p>

                    <h3 className="mt-2 text-base font-black text-neutral-900">
                      {restaurant.name ||
                        'Delivery Store'}
                    </h3>

                    <p className="mt-2 text-xs leading-5 text-neutral-500">
                      For assignment, payment, customer or delivery workflow problems, contact your Manager/Owner from the store's normal communication channel.
                    </p>

                    <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-[10px] text-neutral-500">
                      Restaurant code:{' '}
                      <span className="font-mono font-black text-neutral-800">
                        {restaurantCode}
                      </span>
                    </div>
                  </section>
                </div>
              )}

              {/* SETTINGS */}
              {driverView ===
                'settings' && (
                <div className="mt-5 grid gap-4 xl:grid-cols-2">
                  <section className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                    <p className="text-[9px] font-black uppercase tracking-[0.14em] text-neutral-400">
                      Driver Profile
                    </p>

                    <div className="mt-4 space-y-3 text-xs">
                      {[
                        [
                          'Name',
                          driver.name ||
                            '—',
                        ],
                        [
                          'Mobile',
                          driver.mobile ||
                            '—',
                        ],
                        [
                          'Status',
                          labelStatus(
                            driver.status ||
                              'available'
                          ),
                        ],
                        [
                          'Vehicle',
                          [
                            driver.vehicle_type,
                            driver.vehicle_number,
                          ]
                            .filter(
                              Boolean
                            )
                            .join(
                              ' · '
                            ) ||
                            '—',
                        ],
                        [
                          'Restaurant',
                          restaurant.name ||
                            '—',
                        ],
                      ].map(
                        ([
                          label,
                          value,
                        ]) => (
                          <div
                            key={
                              label
                            }
                            className="flex items-center justify-between gap-4 border-b border-neutral-100 pb-3"
                          >
                            <span className="font-semibold text-neutral-400">
                              {label}
                            </span>

                            <span className="text-right font-black text-neutral-800">
                              {value}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  </section>

                  <section className="space-y-4">
                    {renderAlarmCard()}

                    <div className="rounded-2xl border border-neutral-200 bg-white p-5 shadow-sm">
                      <p className="text-[9px] font-black uppercase tracking-[0.14em] text-neutral-400">
                        Session
                      </p>

                      <button
                        type="button"
                        onClick={logout}
                        className="mt-4 w-full rounded-xl bg-rose-600 px-4 py-3 text-xs font-black text-white"
                      >
                        Sign Out of Driver Portal
                      </button>
                    </div>
                  </section>
                </div>
              )}
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}
