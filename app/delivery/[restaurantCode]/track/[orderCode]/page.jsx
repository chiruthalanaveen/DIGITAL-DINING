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

const STEPS = ['received', 'preparing', 'packed', 'out_for_delivery', 'delivered']

function DeliveryHomeNavigation({ restaurantCode }) {
  const storeHome = /^[A-Za-z0-9_-]{1,80}$/.test(String(restaurantCode || ''))
    ? `/delivery/${encodeURIComponent(restaurantCode)}`
    : '/delivery' 
  return (
    <nav
      className="mx-auto mb-4 flex w-full max-w-2xl justify-start"
      aria-label="Delivery navigation"
    >
      <a
        href={storeHome}
        aria-label="Back to this delivery store"
        title="Back to Store Home"
        className="inline-flex h-11 w-20 shrink-0 items-center justify-start rounded-full border pl-5 shadow-sm transition-transform duration-150 hover:scale-[1.03] active:scale-95 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-500"
        style={{
          backgroundColor: '#050505',
          borderColor: '#3f3f3f',
          color: '#ffffff',
        }}
      >
        <svg
          width="22"
          height="22"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M19 12H5" />
          <path d="m12 19-7-7 7-7" />
        </svg>
      </a>
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

    15000

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

  const getStepLabel = (step) => step === 'out_for_delivery' ? 'On the way' : step === 'received' ? 'Order confirmed' : step === 'preparing' ? 'Preparing your food' : step === 'packed' ? 'Packed / pickup' : 'Delivered'

  const getOrderTitle = (status) => ({received:'Order confirmed',confirmed:'Order confirmed',preparing:'Preparing your order',packed:'Packed and ready',out_for_delivery:'On the way to you',delivered:'Delivered. Enjoy your order!',cancelled:'Order cancelled'})[String(status || '').toLowerCase()] || labelStatus(status)

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

  return (

    <main className="dd-ref-track min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-neutral-50 px-3 py-4 text-neutral-900 sm:px-4 sm:py-6"><DeliveryHomeNavigation restaurantCode={restaurantCode} />

      <div className="mx-auto max-w-2xl space-y-5">

        {orders.length > 1 && (

          <section className="rounded-3xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">

            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">

              Multiple Active Orders

            </p>

            <p className="mt-1 text-sm font-black text-emerald-950">

              {orders.length} orders found in your delivery account

            </p>

            <p className="mt-1 text-xs leading-5 text-emerald-800">

              Each order is tracked separately below. If the Delivery Boy is sharing live location with both orders, each order shows its own live map.

            </p>

          </section>

        )}

        {orders.map(

          (trackedOrder) => {

            const order =

              trackedOrder

            const cancelled =

              order.order_status ===

              'cancelled'

            const currentStep =

              getCurrentStep(

                order

              )

            const driverLiveLocation =

              order?.driver_live_location ||

              null

            const trackingAppearance =

              order?.tracking ||

              {}

            const trackingAdvertisement =

              trackingAppearance

                ?.advertisement ||

              null

            return (

              <div

                key={

                  order.id ||

                  order.order_code

                }

                className="dd-ref-order-stack space-y-4"

              >

                <section className="dd-ref-tracking-hero" aria-label="Order tracking map">

                  <div className="dd-ref-tracking-map">

                    {order.order_status === 'out_for_delivery' && driverLiveLocation ? (

                      <LiveDeliveryTrackingMap

                        driverLatitude={driverLiveLocation.latitude}

                        driverLongitude={driverLiveLocation.longitude}

                        driverHeading={driverLiveLocation.heading}

                        driverName={order.driver?.name || 'Delivery partner'}

                        customerLatitude={order.latitude}

                        customerLongitude={order.longitude}

                        markerType={trackingAppearance.marker_type || 'bike'}

                        markerImageUrl={trackingAppearance.marker_image_url || ''}

                        markerLabel={trackingAppearance.marker_label || order.driver?.name || 'Delivery partner'}

                        advertisement={trackingAdvertisement}

                        height={335}

                      />

                    ) : Number.isFinite(Number(order.latitude)) && Number.isFinite(Number(order.longitude)) && order.latitude != null && order.longitude != null ? (

                      <DeliveryLocationMap latitude={order.latitude} longitude={order.longitude} readOnly customerPin height={335} zoom={14} />

                    ) : (

                      <div className="dd-ref-no-map"><span>⌖</span><p>The delivery map will appear when a location is available.</p></div>

                    )}

                    <div className="dd-ref-order-chip">Order #{order.order_number || order.order_code}</div>

                  </div>

                  <div className="dd-ref-tracking-sheet">

                    <div className="dd-ref-tracking-topline"><span className="dd-ref-live-dot">{order.order_status === 'delivered' ? 'Completed' : cancelled ? 'Cancelled' : 'Order status · Live'}</span>

                      {order.order_status !== 'delivered' && !cancelled && <span className="dd-ref-eta">{formatEtaLabel(order.estimated_delivery_at, nowMs)}</span>}

                    </div>

                    <h2>{getOrderTitle(order.order_status)}</h2>

                    <p>{order.order_status === 'out_for_delivery' ? (driverLiveLocation ? 'Your delivery partner is sharing their live location.' : 'Waiting for your rider to share live location.') : order.order_status === 'delivered' ? 'Thank you for ordering with us.' : 'We will update each step as your order progresses.'}</p>

                    <div className="dd-ref-stage-meter" aria-label="Order progress">

                      {STEPS.map((step,index) => <div key={step} className={index <= currentStep ? 'is-complete' : ''}><span /> <small>{getStepLabel(step)}</small></div>)}

                    </div>

                    {order.order_status === 'delivered' && <div className="dd-ref-delivered"><span>✓</span><strong>Your order has arrived</strong><a href={`/delivery/${encodeURIComponent(restaurantCode)}`}>Back to Store →</a></div>}

                  </div>

                </section>

                <section className="dd-ref-order-timeline rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">

                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">

                    <div>

                      <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600">

                        Live Delivery Tracking

                      </p>

                      <h1 className="mt-1 text-xl font-black">

                        {order.order_code}

                      </h1>

                      <p className="mt-1 text-xs text-neutral-500">

                        Order #

                        {order.order_number ||

                          '—'}{' '}

                        ·{' '}

                        {formatDate(

                          order.created_at

                        )}

                      </p>

                    </div>

                    <span

                      className={`w-fit rounded-full px-3 py-1.5 text-[10px] font-black uppercase ${

                        cancelled

                          ? 'bg-red-50 text-red-600'

                          : order.order_status ===

                              'delivered'

                            ? 'bg-emerald-50 text-emerald-700'

                            : 'bg-orange-50 text-orange-600'

                      }`}

                    >

                      {labelStatus(

                        [

                          'confirmed',

                          'preparing',

                        ].includes(

                          String(

                            order.order_status ||

                              ''

                          ).toLowerCase()

                        )

                          ? 'received'

                          : order.order_status

                      )}

                    </span>

                  </div>

                  {!cancelled && (

                    <div className="mt-6 space-y-4">

                      {STEPS.map(

                        (

                          status,

                          index

                        ) => {

                          const complete =

                            index <=

                            currentStep

                          return (

                            <div

                              key={status}

                              className="flex gap-3"

                            >

                              <div className="flex flex-col items-center">

                                <div

                                  className={`flex h-7 w-7 items-center justify-center rounded-full text-[10px] font-black ${

                                    complete

                                      ? 'bg-emerald-600 text-white'

                                      : 'bg-neutral-200 text-neutral-500'

                                  }`}

                                >

                                  {complete

                                    ? '✓'

                                    : index +

                                      1}

                                </div>

                                {index <

                                  STEPS.length -

                                    1 && (

                                  <div

                                    className={`h-8 w-0.5 ${

                                      index <

                                      currentStep

                                        ? 'bg-emerald-600'

                                        : 'bg-neutral-200'

                                    }`}

                                  />

                                )}

                              </div>

                              <div className="pt-1">

                                <p

                                  className={`text-sm font-black ${

                                    complete

                                      ? 'text-neutral-900'

                                      : 'text-neutral-400'

                                  }`}

                                >

                                  {getStepLabel(status)}

                                </p>

                              </div>

                            </div>

                          )

                        }

                      )}

                    </div>

                  )}

                  {cancelled && (

                    <div className="mt-5 rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">

                      This order was cancelled.

                    </div>

                  )}

                  <p className="mt-5 text-[10px] text-neutral-400">

                    Order status and rider location refresh automatically when updates are available.

                  </p>

                </section>

                {order.order_status ===

                  'out_for_delivery' &&

                  !driverLiveLocation && (

                    <section className="rounded-3xl border border-sky-200 bg-sky-50 p-4 shadow-sm">

                      <p className="text-[10px] font-black uppercase tracking-wider text-sky-700">

                        Waiting for Live Location

                      </p>

                      <p className="mt-1 text-xs leading-5 text-sky-800">

                        This order is Out for Delivery. The live map will appear as soon as the Delivery Boy location reaches this order.

                      </p>

                    </section>

                  )}

                {order.driver && (

                  <section className="dd-ref-rider-card rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">

                    <p className="text-[10px] font-black uppercase tracking-wider text-neutral-500">

                      Delivery Partner

                    </p>

                    <div className="mt-3 flex items-center justify-between gap-4">

                      <div>

                        <h2 className="font-black">

                          {order.driver.name}

                        </h2>

                        <p className="mt-1 text-xs text-neutral-500">

                          {order.driver.vehicle_type}

                          {order.driver.vehicle_number

                            ? ` · ${order.driver.vehicle_number}`

                            : ''}

                        </p>

                      </div>

                      {order.driver.mobile && (

                        <a

                          href={`tel:${order.driver.mobile}`}

                          className="rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white"

                        >

                          Call{' '}

                          {order.driver.mobile}

                        </a>

                      )}

                    </div>

                  </section>

                )}

                <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">

                  <p className="text-[10px] font-black uppercase tracking-wider text-neutral-500">

                    Order Items

                  </p>

                  <div className="mt-4 space-y-3">

                    {Array.isArray(

                      order.items

                    ) &&

                      order.items.map(

                        (

                          item,

                          index

                        ) => (

                          <div

                            key={

                              item.id ||

                              index

                            }

                            className="flex items-center justify-between gap-4"

                          >

                            <div>

                              <p className="text-sm font-bold">

                                {item.name}

                              </p>

                              <p className="mt-1 text-xs text-neutral-500">

                                {money(

                                  item.price

                                )}{' '}

                                ×{' '}

                                {Number(

                                  item.quantity ||

                                    item.qty ||

                                    1

                                )}

                              </p>

                            </div>

                            <p className="font-black">

                              {money(

                                item.line_total ??

                                  Number(

                                    item.price ||

                                      0

                                  ) *

                                    Number(

                                      item.quantity ||

                                        item.qty ||

                                        1

                                    )

                              )}

                            </p>

                          </div>

                        )

                      )}

                  </div>

                </section>

                <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">

                  <p className="text-[10px] font-black uppercase tracking-wider text-neutral-500">

                    Bill

                  </p>

                  <div className="mt-4 space-y-2 text-sm">

                    <BillRow

                      label="Subtotal"

                      value={money(

                        order.subtotal

                      )}

                    />

                    <BillRow

                      label="GST"

                      value={money(

                        order.tax_amount

                      )}

                    />

                    <BillRow

                      label="Packing"

                      value={money(

                        order.packing_fee

                      )}

                    />

                    <BillRow

                      label="Delivery"

                      value={

                        Number(

                          order.delivery_fee ||

                            0

                        ) === 0

                          ? 'FREE'

                          : money(

                              order.delivery_fee

                            )

                      }

                    />

                    {Number(order.handling_fee || order.handling_charge || 0) > 0 && <BillRow label="Handling" value={money(order.handling_fee ?? order.handling_charge)} />}

                    {Number(order.surge_fee || order.surge_charge || 0) > 0 && <BillRow label="High demand" value={money(order.surge_fee ?? order.surge_charge)} />}

                    {Number(order.discount_amount || 0) > 0 && <BillRow label="Discount" value={`−${money(order.discount_amount)}`} />}

                    {Number(order.platform_fee_customer_amount || 0) > 0 && <BillRow label="Platform fee" value={money(order.platform_fee_customer_amount)} />}

                    <div className="mt-3 flex items-center justify-between border-t border-neutral-200 pt-3 font-black">

                      <span>Total</span>

                      <span>

                        {money(

                          order.total_amount

                        )}

                      </span>

                    </div>

                    <div className="mt-4 rounded-xl bg-neutral-50 px-4 py-3 text-xs">

                      <span className="font-bold">

                        Payment:{' '}

                      </span>

                      {String(

                        order.payment_method ||

                          ''

                      ).toUpperCase()}

                      {' · '}

                      {labelStatus(

                        order.payment_status

                      )}

                    </div>

                  </div>

                </section>

                <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">

                  <p className="text-[10px] font-black uppercase tracking-wider text-neutral-500">

                    Delivery Address

                  </p>

                  <p className="mt-3 text-sm leading-6 text-neutral-700">

                    {[

                      order.address_line1,

                      order.address_line2,

                      order.landmark,

                      order.city,

                      order.state,

                      order.pincode,

                    ]

                      .filter(Boolean)

                      .join(', ')}

                  </p>

                  {order.estimated_delivery_at && (

                    <p className="mt-3 text-xs font-bold text-emerald-700">

                      Estimated delivery:{' '}

                      {formatDate(

                        order.estimated_delivery_at

                      )}

                    </p>

                  )}

                  {order.support_phone && (

                    <a

                      href={`tel:${order.support_phone}`}

                      className="mt-4 inline-block rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-xs font-black text-neutral-900"

                    >

                      Store Support:{' '}

                      {order.support_phone}

                    </a>

                  )}

                </section>

              </div>

            )

          }

        )}

      </div>

    </main>

  )

}

function BillRow({

  label,

  value,

}) {

  return (

    <div className="flex items-center justify-between text-neutral-600">

      <span>{label}</span>

      <span className="font-bold text-neutral-900">

        {value}

      </span>

    </div>

  )

}
