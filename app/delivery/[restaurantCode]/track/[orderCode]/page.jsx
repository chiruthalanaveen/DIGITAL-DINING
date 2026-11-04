'use client'

import {

  use,

  useEffect,


  useState,

} from 'react'

import { supabase } from '@/lib/supabase'

import { useMobileViewportLock } from '@/lib/useMobileViewportLock'

import { useLiveDeliveryRefresh } from '@/lib/useLiveDeliveryRefresh'

import LiveDeliveryTrackingMap from '@/app/components/LiveDeliveryTrackingMap'

import DeliveryLocationMap from '@/app/components/DeliveryLocationMap'

import '@/app/components/delivery-reference-mobile.css'
import '@/app/components/delivery-tracking-premium.css'

const STEPS = ['received', 'preparing', 'packed', 'out_for_delivery', 'delivered']

function DeliveryHomeNavigation({ restaurantCode }) {
  // Return to the existing store's My Orders popup (not the retired selector).
  const ordersHref = /^[A-Za-z0-9_-]{1,80}$/.test(String(restaurantCode || ''))
    ? `/delivery/${encodeURIComponent(restaurantCode)}?view=orders`
    : '/delivery?view=orders'
  return (
    <nav className="ddt-topbar" aria-label="Delivery tracking navigation">
      <a href={ordersHref} className="ddt-topbar-back" aria-label="Back to My Orders">
        <span className="ddt-topbar-arrow" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </span>
        My Orders
      </a>
      <div className="ddt-topbar-brand"><strong>Digital Dine-In</strong><span>TRACKING</span></div>
    </nav>
  )
}

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

  return date.toLocaleString(

    'en-IN',

    {

      day: '2-digit',

      month: 'short',

      year: 'numeric',

      hour: '2-digit',

      minute: '2-digit',
      timeZone: 'Asia/Kolkata',

    }

  )

}

// Render-safe ETA: the clock starts only after hydration, never during SSR.
// This keeps the initial HTML stable and refreshes the ETA on active screens.
function formatEtaLabel(value, nowMs) {
  if (!value) return 'ETA pending'
  const targetMs = new Date(value).getTime()
  if (!Number.isFinite(targetMs)) return 'ETA pending'
  if (nowMs === null) return 'ETA updating'
  const remainingMs = targetMs - nowMs
  return remainingMs > 0
    ? `~${Math.max(1, Math.ceil(remainingMs / 60000))} min`
    : 'ETA updating'
}

function distanceKm(lat1, lng1, lat2, lng2) {

  const firstLat = Number(lat1)

  const firstLng = Number(lng1)

  const secondLat = Number(lat2)

  const secondLng = Number(lng2)

  if (![firstLat, firstLng, secondLat, secondLng].every(Number.isFinite)) {

    return null

  }

  const toRadians = (value) => (value * Math.PI) / 180

  const earthRadiusKm = 6371.0088

  const dLat = toRadians(secondLat - firstLat)

  const dLng = toRadians(secondLng - firstLng)

  const a =

    Math.sin(dLat / 2) ** 2 +

    Math.cos(toRadians(firstLat)) *

      Math.cos(toRadians(secondLat)) *

      Math.sin(dLng / 2) ** 2

  return 2 * earthRadiusKm * Math.asin(Math.sqrt(a))

}

export default function DeliveryTrackingPage({

  params,

}) {

  const unwrappedParams = use(params)

  useMobileViewportLock()

  // Support either dynamic-folder spelling:

  // [restaurantCode] or [restaurantcode]

  const restaurantCode =

    String(

      unwrappedParams?.restaurantCode ||

        unwrappedParams?.restaurantcode ||

        ''

    ).trim()

  // Support either dynamic-folder spelling:

  // [orderCode] or [ordercode]

  const orderCode =

    String(

      unwrappedParams?.orderCode ||

        unwrappedParams?.ordercode ||

        ''

    ).trim()

  const [mobile, setMobile] =

    useState('')

  const [inputMobile, setInputMobile] =

    useState('')

  const [order, setOrder] =

    useState(null)

  const [orders, setOrders] =

    useState([])

  const [loading, setLoading] =

    useState(false)

  const [error, setError] =

    useState('')

  const [accountState, setAccountState] = useState('checking')

  const [accountError, setAccountError] = useState('')

  // Server and first browser render both start without a clock value.
  // Update after mount; this prevents Date.now() from entering hydrated JSX.
  const [nowMs, setNowMs] = useState(null)
  useEffect(() => {
    const updateClock = () => setNowMs(Date.now())
    updateClock()
    const interval = window.setInterval(updateClock, 30000)
    return () => window.clearInterval(interval)
  }, [])


  // Delivery accounts are authenticated by the server and mapped to their own

  // order IDs. Never use the typed shipping phone as an account identifier.

  const loadAccountOrders = async (quiet = false) => {

    try {

      if (!quiet) setLoading(true)

      const { data: sessionData } = await supabase.auth.getSession()

      const headers = {}

      if (sessionData?.session?.access_token) {

        headers.Authorization = `Bearer ${sessionData.session.access_token}`

      }

      const response = await fetch(

        `/api/delivery/customer/my-orders?restaurantCode=${encodeURIComponent(restaurantCode)}&details=1`,

        { headers, credentials: 'same-origin', cache: 'no-store' }

      )

      const result = await response.json().catch(() => ({}))

      if (response.status === 401 && !sessionData?.session?.user) {

        if (!quiet) setAccountState('guest')

        return

      }

      if (!response.ok || !result?.success) {

        throw new Error(result?.message || 'Unable to read your account orders.')

      }

      const list = Array.isArray(result.orders) ? result.orders : []

      const primary = list.find((row) => String(row.order_code) === orderCode)

      if (!primary && list.length) {

        throw new Error('This order is not linked to your signed-in delivery account.')

      }

      setOrders(list)

      setOrder(primary || null)

      setAccountError('')

      setAccountState('ready')

    } catch (err) {

      if (!quiet) {

        setAccountState('error')

        setAccountError(err?.message || 'Unable to load your account orders.')

      }

    } finally {

      if (!quiet) setLoading(false)

    }

  }



  useEffect(() => {

    let active = true

    ;(async () => {

      const { data: sessionData } = await supabase.auth.getSession()

      if (!active) return

      // Google or mobile/PIN session cookies may be available on the server.

      await loadAccountOrders()

    })()

    return () => { active = false }

    // Account session checked once per tracking URL.

    // eslint-disable-next-line react-hooks/exhaustive-deps

  }, [restaurantCode, orderCode])



  useEffect(() => {

    if (accountState !== 'guest') return

    try {

      const stored = localStorage.getItem(

        `digitaldining_delivery_mobile_${restaurantCode}_${orderCode}`

      )

      if (stored) {

        setMobile(stored)

        setInputMobile(stored)

      }

    } catch { /* Ignore unavailable storage. */ }

  }, [restaurantCode, orderCode, accountState])

  const loadOrder = async (

    mobileOverride = '',

    quiet = false

  ) => {

    const cleanMobile =

      String(

        mobileOverride ||

          mobile ||

          ''

      )

        .replace(/\D/g, '')

        .slice(0, 10)

    if (

      cleanMobile.length !== 10

    ) {

      return

    }

    if (!quiet) {

      setLoading(true)

      setError('')

    }

    try {

      /*

       * First find all recent orders for this restaurant + mobile.

       * This RPC already exists in the Delivery customer page.

       */

      const {

        data: mobileData,

        error: mobileRpcError,

      } = await supabase.rpc(

        'get_public_delivery_orders_by_mobile',

        {

          p_restaurant_code:

            restaurantCode,

          p_customer_mobile:

            cleanMobile,

        }

      )

      if (mobileRpcError) {

        throw mobileRpcError

      }

      if (!mobileData?.success) {

        throw new Error(

          mobileData?.message ||

            'Unable to find Delivery orders.'

        )

      }

      const mobileRows =

        Array.isArray(

          mobileData?.orders

        )

          ? mobileData.orders

          : []

      /*

       * If the mobile has multiple ACTIVE orders, show all of them.

       * Do not flood this page with old delivered/cancelled history.

       *

       * If no active order exists, still keep the order from this URL

       * so an older completed tracking link continues to work.

       */

      const activeRows =

        mobileRows.filter(

          (row) => {

            const status =

              String(

                row?.order_status ||

                  ''

              ).toLowerCase()

            return ![

              'delivered',

              'cancelled',

            ].includes(status)

          }

        )

      let candidateRows =

        activeRows.length

          ? activeRows

          : mobileRows.filter(

              (row) =>

                String(

                  row?.order_code ||

                    ''

                ) ===

                String(

                  orderCode

                )

            )

      /*

       * The URL order must never disappear just because the mobile

       * lookup response was temporarily stale.

       */

      if (

        !candidateRows.some(

          (row) =>

            String(

              row?.order_code ||

                ''

            ) ===

            String(orderCode)

        )

      ) {

        candidateRows = [

          {

            order_code:

              orderCode,

          },

          ...candidateRows,

        ]

      }

      const uniqueCodes =

        [

          ...new Set(

            candidateRows

              .map(

                (row) =>

                  String(

                    row?.order_code ||

                      ''

                  ).trim()

              )

              .filter(Boolean)

          ),

        ]

      const detailedOrders =

        (

          await Promise.all(

            uniqueCodes.map(

              async (

                code

              ) => {

                const {

                  data,

                  error:

                    rpcError,

                } =

                  await supabase.rpc(

                    'get_public_delivery_order',

                    {

                      p_restaurant_code:

                        restaurantCode,

                      p_order_code:

                        code,

                      p_customer_mobile:

                        cleanMobile,

                    }

                  )

                if (rpcError) {

                  console.warn(

                    `Delivery tracking detail load failed for ${code}:`,

                    rpcError

                  )

                  return null

                }

                if (

                  !data?.success ||

                  !data?.order

                ) {

                  return null

                }

                return data.order

              }

            )

          )

        ).filter(Boolean)

      if (

        !detailedOrders.length

      ) {

        throw new Error(

          'No Delivery orders were found for this mobile number.'

        )

      }

      detailedOrders.sort(

        (a, b) =>

          new Date(

            b?.created_at ||

              0

          ).getTime() -

          new Date(

            a?.created_at ||

              0

          ).getTime()

      )

      const primaryOrder =

        detailedOrders.find(

          (row) =>

            String(

              row?.order_code ||

                ''

            ) ===

            String(orderCode)

        ) ||

        detailedOrders[0]

      setOrders(

        detailedOrders

      )

      setOrder(

        primaryOrder

      )

      setMobile(

        cleanMobile

      )

      /*

       * Remember the same verified mobile against every visible order.

       * Opening any one of their tracking URLs later can authenticate

       * immediately on this device.

       */

      try {

        detailedOrders.forEach(

          (row) => {

            const code =

              String(

                row?.order_code ||

                  ''

              ).trim()

            if (!code) {

              return

            }

            localStorage.setItem(

              `digitaldining_delivery_mobile_${restaurantCode}_${code}`,

              cleanMobile

            )

          }

        )

      } catch {

        // Ignore unavailable local storage.

      }

    } catch (loadError) {

      console.error(

        'Delivery tracking error:',

        loadError

      )

      if (!quiet) {

        setError(

          loadError?.message ||

            'Unable to load Delivery orders.'

        )

      }

    } finally {

      if (!quiet) {

        setLoading(false)

      }

    }

  }

  useEffect(() => {

    if (accountState !== 'guest' || mobile.length !== 10) return

    loadOrder()

    // eslint-disable-next-line react-hooks/exhaustive-deps

  }, [

    mobile,

    restaurantCode,

    orderCode,

    accountState,

  ])

  useLiveDeliveryRefresh(

    () => accountState === 'ready' ? loadAccountOrders(true) : loadOrder('', true),

    Boolean(restaurantCode && orderCode && (

      accountState === 'ready' || (accountState === 'guest' && mobile.length === 10)

    )),

    180000

  )

  // These five steps are presentation only. Backend statuses stay untouched.

  const getCurrentStep = (trackedOrder) => {

    const status = String(trackedOrder?.order_status || '').toLowerCase()

    if (status === 'received' || status === 'confirmed') return 0

    if (status === 'preparing') return 1

    if (status === 'packed') return 2

    if (status === 'out_for_delivery') return 3

    if (status === 'delivered') return 4

    return -1

  }

  const getStepLabel = (step) => step === 'out_for_delivery' ? 'On the way' : step === 'received' ? 'Order received' : step === 'preparing' ? 'Preparing your food' : step === 'packed' ? 'Packed / pickup' : 'Delivered'

  const getOrderTitle = (status) => ({received:'Order received',confirmed:'Order confirmed',preparing:'Preparing your order',packed:'Packed and ready',out_for_delivery:'On the way to you',delivered:'Delivered. Enjoy your order!',cancelled:'Order cancelled'})[String(status || '').toLowerCase()] || labelStatus(status)

  if (accountState === 'checking') {

    return <main className="min-h-[100dvh] bg-neutral-50 px-4 py-10 text-center text-sm font-bold text-neutral-700"><DeliveryHomeNavigation restaurantCode={restaurantCode} />Loading your delivery account…</main>

  }

  if (accountState === 'error') {

    return <main className="min-h-[100dvh] bg-neutral-50 px-4 py-10"><DeliveryHomeNavigation restaurantCode={restaurantCode} /><section className="mx-auto max-w-md rounded-3xl border border-red-200 bg-white p-6 text-center"><h1 className="text-lg font-black">Unable to show account orders</h1><p className="mt-3 text-sm leading-6 text-neutral-600">{accountError}</p><button className="mt-4 rounded-xl bg-emerald-600 px-5 py-3 text-xs font-black text-white" type="button" onClick={() => { setAccountState('checking'); void loadAccountOrders() }}>Retry</button></section></main>

  }

  if (accountState === 'ready' && (!order || !orders.length)) {

    return <main className="min-h-[100dvh] bg-neutral-50 px-4 py-10"><DeliveryHomeNavigation restaurantCode={restaurantCode} /><section className="mx-auto max-w-md rounded-3xl border border-neutral-200 bg-white p-6 text-center"><h1 className="text-lg font-black">No linked orders found</h1><p className="mt-3 text-sm leading-6 text-neutral-600">Orders made under this signed-in account will appear here. Older orders without an account link need verified recovery.</p><a className="mt-5 inline-block rounded-xl bg-emerald-600 px-5 py-3 text-xs font-black text-white" href={`/delivery/${encodeURIComponent(restaurantCode)}`}>Back to store</a></section></main>

  }

  if (

    accountState === 'guest' &&

    !mobile &&

    !order

  ) {

    return (

      <main className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-neutral-50 px-3 py-6 text-neutral-900 sm:px-4 sm:py-10"><DeliveryHomeNavigation restaurantCode={restaurantCode} />

        <div className="mx-auto max-w-md rounded-3xl border border-neutral-200 bg-white p-6 shadow-sm">

          <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600">

            Delivery tracking

          </p>

          <h1 className="mt-1 text-xl font-black">

            Order {orderCode}

          </h1>

          <p className="mt-2 text-sm leading-6 text-neutral-500">

            Enter the mobile number used

            while placing this order.

          </p>

          <input

            value={inputMobile}

            onChange={(event) =>

              setInputMobile(

                event.target.value

                  .replace(

                    /\D/g,

                    ''

                  )

                  .slice(0, 10)

              )

            }

            placeholder="10-digit mobile"

            className="mt-5 w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm outline-none focus:border-emerald-500"

          />

          {error && (

            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">

              {error}

            </div>

          )}

          <button

            type="button"

            onClick={() =>

              loadOrder(

                inputMobile

              )

            }

            disabled={

              loading ||

              inputMobile.length !==

                10

            }

            className="mt-4 w-full rounded-xl bg-emerald-600 px-5 py-4 text-sm font-black text-white disabled:opacity-50"

          >

            {loading

              ? 'Loading...'

              : 'Track Order'}

          </button>

        </div>

      </main>

    )

  }

  if (

    loading &&

    !order

  ) {

    return (

      <main className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-neutral-50 px-3 py-6 sm:px-4 sm:py-10"><DeliveryHomeNavigation restaurantCode={restaurantCode} />

        <div className="mx-auto max-w-md rounded-3xl border border-neutral-200 bg-white p-8 text-center">

          Loading order...

        </div>

      </main>

    )

  }

  if (

    error &&

    !order

  ) {

    return (

      <main className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-neutral-50 px-3 py-6 text-neutral-900 sm:px-4 sm:py-10"><DeliveryHomeNavigation restaurantCode={restaurantCode} />

        <div className="mx-auto max-w-md rounded-3xl border border-neutral-200 bg-white p-6 text-center">

          <h1 className="text-xl font-black">

            Unable to track order

          </h1>

          <p className="mt-2 text-sm text-neutral-500">

            {error}

          </p>

          <button

            type="button"

            onClick={() => {

              setMobile('')

              setOrder(null)

              setOrders([])

              setError('')

            }}

            className="mt-5 rounded-xl bg-neutral-900 px-5 py-3 text-xs font-black text-white"

          >

            Try Another Mobile

          </button>

        </div>

      </main>

    )

  }

  if (

    !order ||

    !orders.length

  ) {

    return null

  }

  // Track only the verified order selected by this URL. The global/store My Orders
  // views retain responsibility for listing other orders.
  const selectedOrder = order
  const status = String(selectedOrder.order_status || '').toLowerCase()
  const cancelled = status === 'cancelled'
  const delivered = status === 'delivered'
  const currentStep = getCurrentStep(selectedOrder)
  const driverLiveLocation = selectedOrder.driver_live_location || null
  const trackingAppearance = selectedOrder.tracking || {}
  const trackingAdvertisement = trackingAppearance.advertisement || null
  const hasDeliveryPin = selectedOrder.latitude != null && selectedOrder.longitude != null &&
    Number.isFinite(Number(selectedOrder.latitude)) && Number.isFinite(Number(selectedOrder.longitude))
  const canShowLiveRider = status === 'out_for_delivery' && Boolean(driverLiveLocation)
  const orderItems = Array.isArray(selectedOrder.items) ? selectedOrder.items : []
  const itemCount = orderItems.reduce((sum, item) => sum + Math.max(0, Number(item.quantity || item.qty || 1)), 0)
  const isActiveDelivery = !delivered && !cancelled
  const orderNumber = selectedOrder.order_number || selectedOrder.order_code
  const statusTitle = getOrderTitle(status)
  const statusDescription = delivered
    ? 'Your delivery is complete. Thank you for ordering with Digital Dine-In.'
    : cancelled
      ? 'This order was cancelled. Its previous details remain available below.'
      : status === 'out_for_delivery'
        ? canShowLiveRider
          ? 'Your delivery partner is on the way. Follow the latest reported location on the map.'
          : 'Your order is on the way. Rider location will appear when available.'
        : status === 'packed'
          ? 'Your items are packed and being prepared for dispatch.'
          : status === 'preparing'
            ? 'Your order is being prepared.'
            : 'The store has received your order. We will update its progress.'

  return (
    <main className="ddt-page dd-ref-track min-h-[100dvh] w-full text-slate-950">
      <DeliveryHomeNavigation restaurantCode={restaurantCode} />
      <div className="ddt-container">
        <header className="ddt-heading">
          <div className="ddt-heading-title">
            <span className="ddt-overline">DELIVERY TRACKING</span>
            <h1>Track your order</h1>
            <p>
              <span className="ddt-mono">#{orderNumber}</span>
              {selectedOrder.restaurant_name && <> · {selectedOrder.restaurant_name}</>}
            </p>
          </div>
          <span className={`ddt-status-badge ${cancelled ? 'ddt-badge-cancelled' : delivered ? 'ddt-badge-done' : 'ddt-badge-active'}`}>
            <span className="ddt-status-dot" aria-hidden="true" />
            {cancelled ? 'Cancelled' : delivered ? 'Delivered' : labelStatus(status === 'confirmed' ? 'received' : status)}
          </span>
        </header>

        <section className={`ddt-progress-card ${cancelled ? 'ddt-progress-cancelled' : ''}`} aria-label="Current delivery status">
          <div className="ddt-progress-overline">
            <span className="ddt-pulse-dot" aria-hidden="true" />
            {delivered ? 'DELIVERY COMPLETE' : cancelled ? 'ORDER UPDATE' : 'ORDER IN PROGRESS'}
            <span className="ddt-refresh-hint">Auto-updates every 3 min</span>
          </div>
          <div className="ddt-progress-main">
            <div className="ddt-progress-copy">
              <h2>{statusTitle}</h2>
              <p>{statusDescription}</p>
            </div>
            {isActiveDelivery && (
              <div className="ddt-eta" aria-label="Estimated delivery time">
                <span>EST. ARRIVAL</span>
                <strong>{formatEtaLabel(selectedOrder.estimated_delivery_at, nowMs)}</strong>
              </div>
            )}
            {delivered && <span className="ddt-complete-icon" aria-hidden="true">✓</span>}
          </div>
          {!cancelled && (
            <div className="ddt-step-grid" aria-label="Delivery progress">
              {STEPS.map((step, index) => (
                <div className={`ddt-step ${index <= currentStep ? 'is-done' : ''} ${index === currentStep ? 'is-current' : ''}`} key={step}>
                  <span className="ddt-step-track" />
                  <span className="ddt-step-name">{step === 'received' ? 'Received' : step === 'preparing' ? 'Preparing' : step === 'packed' ? 'Packed' : step === 'out_for_delivery' ? 'On the way' : 'Delivered'}</span>
                </div>
              ))}
            </div>
          )}
          {cancelled && <p className="ddt-cancel-note">This order is no longer active.</p>}
        </section>

        <section className="ddt-map-card" aria-label={`Delivery map for order ${orderNumber}`}>
          <div className="ddt-section-head">
            <div className="ddt-section-head-left">
              <span className="ddt-icon-bubble" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>
              </span>
              <div><h2>{canShowLiveRider ? 'Follow your delivery' : 'Delivery location'}</h2><p>{canShowLiveRider ? 'Latest rider location' : 'Your selected delivery pin'}</p></div>
            </div>
            {canShowLiveRider && <span className="ddt-live-indicator"><span /> RIDER GPS</span>}
          </div>
          <div className="ddt-map-frame">
            {canShowLiveRider ? (
              <LiveDeliveryTrackingMap
                driverLatitude={driverLiveLocation.latitude}
                driverLongitude={driverLiveLocation.longitude}
                driverHeading={driverLiveLocation.heading}
                driverName={selectedOrder.driver?.name || 'Delivery partner'}
                customerLatitude={selectedOrder.latitude}
                customerLongitude={selectedOrder.longitude}
                markerType={trackingAppearance.marker_type || 'bike'}
                markerImageUrl={trackingAppearance.marker_image_url || ''}
                markerLabel={trackingAppearance.marker_label || selectedOrder.driver?.name || 'Delivery partner'}
                advertisement={trackingAdvertisement}
                height={290}
              />
            ) : hasDeliveryPin ? (
              <DeliveryLocationMap latitude={selectedOrder.latitude} longitude={selectedOrder.longitude} readOnly customerPin height={290} zoom={14} />
            ) : (
              <div className="ddt-no-map"><span aria-hidden="true">⌖</span><strong>Map location unavailable</strong><p>The map will appear when a valid delivery location is available.</p></div>
            )}
            <span className="ddt-map-pin-label">{canShowLiveRider ? 'Rider & destination' : 'Delivery pin'}</span>
          </div>
          <div className="ddt-map-caption">
            <span className="ddt-caption-icon" aria-hidden="true">↻</span>
            {canShowLiveRider ? 'Rider coordinates update with the tracking data every 3 minutes.' :
              status === 'out_for_delivery' ? 'Waiting for the rider to share a GPS location.' :
              'Map shows the delivery destination. Order data refreshes every 3 minutes.'}
          </div>
        </section>

        {selectedOrder.driver && (
          <section className="ddt-info-card ddt-rider" aria-label="Delivery partner">
            <div className="ddt-rider-avatar" aria-hidden="true">{String(selectedOrder.driver.name || 'D').trim().charAt(0).toUpperCase()}</div>
            <div className="ddt-rider-info">
              <span className="ddt-mini-overline">DELIVERY PARTNER</span>
              <strong>{selectedOrder.driver.name || 'Delivery partner'}</strong>
              <p>{[selectedOrder.driver.vehicle_type, selectedOrder.driver.vehicle_number].filter(Boolean).join(' · ') || 'Assigned to your order'}</p>
            </div>
            {selectedOrder.driver.mobile && (
              <a className="ddt-call-button" href={`tel:${selectedOrder.driver.mobile}`} aria-label="Call delivery partner">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.79 19.79 0 0 1 3.09 5.18 2 2 0 0 1 5.08 3h3a2 2 0 0 1 2 1.72c.12.96.35 1.9.68 2.78a2 2 0 0 1-.45 2.11L9.1 10.82a16 16 0 0 0 4.08 4.08l1.21-1.21a2 2 0 0 1 2.11-.45c.88.33 1.82.56 2.78.68A2 2 0 0 1 22 16.92Z"/></svg>
                Call
              </a>
            )}
          </section>
        )}

        <details className="ddt-expand" id="ddt-timeline">
          <summary>
            <span className="ddt-expand-symbol" aria-hidden="true">◉</span>
            <span className="ddt-expand-title"><strong>Delivery journey</strong><small>See all 5 tracking steps</small></span>
            <span className="ddt-expand-chevron" aria-hidden="true">⌄</span>
          </summary>
          {cancelled ? (
            <div className="ddt-expanded-body"><p className="ddt-cancel-note">This order was cancelled. No further delivery steps will occur.</p></div>
          ) : (
            <ol className="ddt-timeline-list">
              {STEPS.map((step, index) => (
                <li key={step} className={`ddt-timeline-row ${index < currentStep ? 'is-done' : ''} ${index === currentStep ? 'is-active' : ''}`}>
                  <span className="ddt-timeline-marker" aria-hidden="true">{index < currentStep || delivered ? '✓' : index + 1}</span>
                  <div className="ddt-timeline-text"><strong>{getStepLabel(step)}</strong><small>{index === currentStep ? (delivered ? 'Completed' : 'Current status') : index < currentStep ? 'Completed' : 'Upcoming'}</small></div>
                </li>
              ))}
            </ol>
          )}
        </details>

        <section className="ddt-info-card" aria-label="Ordered items">
          <div className="ddt-card-head"><h2>Order summary</h2><span className="ddt-light-pill">{Number.isFinite(itemCount) && itemCount > 0 ? `${itemCount} item${itemCount === 1 ? '' : 's'}` : 'Items'}</span></div>
          <div className="ddt-order-metadata"><span>Order ID</span><strong className="ddt-mono">{selectedOrder.order_code}</strong></div>
          <div className="ddt-order-metadata"><span>Placed on</span><strong>{formatDate(selectedOrder.created_at)}</strong></div>
          {orderItems.length > 0 && (
            <div className="ddt-items-list">
              {orderItems.map((item, index) => (
                <div className="ddt-item" key={item.id || index}>
                  <div className="ddt-item-thumb" aria-hidden="true">
                    {typeof item.image_url === 'string' && /^https:\/\//i.test(item.image_url)
                      ? <img src={item.image_url} alt="" loading="lazy" />
                      : <span>◈</span>}
                  </div>
                  <div className="ddt-item-main"><strong>{item.name || 'Product'}</strong><p>{money(item.price)} × {Number(item.quantity || item.qty || 1)}</p></div>
                  <strong className="ddt-item-total">{money(item.line_total ?? Number(item.price || 0) * Number(item.quantity || item.qty || 1))}</strong>
                </div>
              ))}
            </div>
          )}
          <div className="ddt-summary-total"><span>Total paid / payable</span><strong>{money(selectedOrder.total_amount)}</strong></div>
        </section>

        <details className="ddt-expand" id="ddt-payment-breakdown">
          <summary>
            <span className="ddt-expand-symbol" aria-hidden="true">₹</span>
            <span className="ddt-expand-title"><strong>Payment breakdown</strong><small>{String(selectedOrder.payment_method || '').toUpperCase() || 'Payment method'} · {labelStatus(selectedOrder.payment_status)}</small></span>
            <span className="ddt-expand-chevron" aria-hidden="true">⌄</span>
          </summary>
          <div className="ddt-expanded-body ddt-bill-details">
            <BillRow label="Subtotal" value={money(selectedOrder.subtotal)} />
            <BillRow label="GST" value={money(selectedOrder.tax_amount)} />
            <BillRow label="Packing" value={money(selectedOrder.packing_fee)} />
            <BillRow label="Delivery" value={Number(selectedOrder.delivery_fee || 0) === 0 ? 'FREE' : money(selectedOrder.delivery_fee)} />
            {Number(selectedOrder.handling_fee || selectedOrder.handling_charge || 0) > 0 && <BillRow label="Handling" value={money(selectedOrder.handling_fee ?? selectedOrder.handling_charge)} />}
            {Number(selectedOrder.surge_fee || selectedOrder.surge_charge || 0) > 0 && <BillRow label="High demand" value={money(selectedOrder.surge_fee ?? selectedOrder.surge_charge)} />}
            {Number(selectedOrder.discount_amount || 0) > 0 && <BillRow label="Discount" value={`−${money(selectedOrder.discount_amount)}`} />}
            {Number(selectedOrder.platform_fee_customer_amount || 0) > 0 && <BillRow label="Platform fee" value={money(selectedOrder.platform_fee_customer_amount)} />}
            <div className="ddt-bill-total"><span>Total</span><strong>{money(selectedOrder.total_amount)}</strong></div>
            <p className="ddt-bill-note">Payment: {String(selectedOrder.payment_method || '').toUpperCase()} · {labelStatus(selectedOrder.payment_status)}</p>
          </div>
        </details>

        <section className="ddt-info-card ddt-address" aria-label="Delivery address">
          <div className="ddt-section-head-left">
            <span className="ddt-icon-bubble" aria-hidden="true">⌖</span>
            <div><h2>Delivery address</h2><p>Where your order is going</p></div>
          </div>
          <p className="ddt-address-lines">{[selectedOrder.address_line1, selectedOrder.address_line2, selectedOrder.landmark, selectedOrder.city, selectedOrder.state, selectedOrder.pincode].filter(Boolean).join(', ') || 'Address unavailable'}</p>
          {selectedOrder.estimated_delivery_at && <p className="ddt-address-eta">Estimated delivery: {formatDate(selectedOrder.estimated_delivery_at)}</p>}
          {selectedOrder.support_phone && <a className="ddt-support-link" href={`tel:${selectedOrder.support_phone}`}>Call store support</a>}
        </section>

        <p className="ddt-footer">Digital Dine-In Delivery · Tracking refreshes every 3 minutes</p>
      </div>
    </main>
  )
}

function BillRow({ label, value }) {
  return <div className="ddt-bill-row"><span>{label}</span><strong>{value}</strong></div>
}