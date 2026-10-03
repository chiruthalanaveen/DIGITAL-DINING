'use client'

import {

  use,

  useEffect,

  useMemo,

  useState,

} from 'react'

import { supabase } from '@/lib/supabase'

import { useMobileViewportLock } from '@/lib/useMobileViewportLock'

import { useLiveDeliveryRefresh } from '@/lib/useLiveDeliveryRefresh'

import LiveDeliveryTrackingMap from '@/app/components/LiveDeliveryTrackingMap'

const STEPS = [

  'received',

  'confirmed',

  'preparing',

  'packed',

  'out_for_delivery',

  'delivered',

]

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

    }

  )

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

  const [loading, setLoading] =

    useState(false)

  const [error, setError] =

    useState('')

  useEffect(() => {

    try {

      const stored =

        localStorage.getItem(

          `digitaldining_delivery_mobile_${restaurantCode}_${orderCode}`

        )

      if (stored) {

        setMobile(stored)

        setInputMobile(stored)

      }

    } catch {

      // Ignore unavailable local storage.

    }

  }, [

    restaurantCode,

    orderCode,

  ])

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

      const {

        data,

        error: rpcError,

      } = await supabase.rpc(

        'get_public_delivery_order',

        {

          p_restaurant_code:

            restaurantCode,

          p_order_code:

            orderCode,

          p_customer_mobile:

            cleanMobile,

        }

      )

      if (rpcError) {

        throw rpcError

      }

      if (!data?.success) {

        throw new Error(

          data?.message ||

            'Order was not found.'

        )

      }

      setOrder(data.order)

      setMobile(cleanMobile)

      try {

        localStorage.setItem(

          `digitaldining_delivery_mobile_${restaurantCode}_${orderCode}`,

          cleanMobile

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

            'Unable to load Delivery order.'

        )

      }

    } finally {

      if (!quiet) {

        setLoading(false)

      }

    }

  }

  useEffect(() => {

    if (mobile.length !== 10) {

      return

    }

    loadOrder()

    // eslint-disable-next-line react-hooks/exhaustive-deps

  }, [

    mobile,

    restaurantCode,

    orderCode,

  ])

  useLiveDeliveryRefresh(

    () => loadOrder('', true),

    Boolean(

      mobile.length === 10 &&

        restaurantCode &&

        orderCode

    ),

    1000

  )

  const currentStep =

    useMemo(() => {

      if (!order) return -1

      return STEPS.indexOf(

        order.order_status

      )

    }, [order])

  const driverLiveLocation = order?.driver_live_location || null
  const trackingAppearance = order?.tracking || {}
  const trackingAdvertisement = trackingAppearance?.advertisement || null



  if (

    !mobile &&

    !order

  ) {

    return (

      <main className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-neutral-50 px-3 py-6 text-neutral-900 sm:px-4 sm:py-10">

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

      <main className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-neutral-50 px-3 py-6 sm:px-4 sm:py-10">

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

      <main className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-neutral-50 px-3 py-6 text-neutral-900 sm:px-4 sm:py-10">

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

  if (!order) return null

  const cancelled =

    order.order_status ===

    'cancelled'

  return (

    <main className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-neutral-50 px-3 py-4 text-neutral-900 sm:px-4 sm:py-6">

      <div className="mx-auto max-w-2xl space-y-4">

        <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">

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

                order.order_status

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

                          {labelStatus(

                            status

                          )}

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

              This order was

              cancelled.

            </div>

          )}

          <p className="mt-5 text-[10px] text-neutral-400">

            This page automatically

            checks for status updates

            every few seconds.

          </p>

        </section>

        {order.order_status === 'out_for_delivery' &&
          driverLiveLocation && (
            <section className="overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm">
              <LiveDeliveryTrackingMap
                driverLatitude={
                  driverLiveLocation.latitude
                }
                driverLongitude={
                  driverLiveLocation.longitude
                }
                driverHeading={
                  driverLiveLocation.heading
                }
                driverName={
                  order.driver?.name ||
                  'Delivery partner'
                }
                customerLatitude={
                  order.latitude
                }
                customerLongitude={
                  order.longitude
                }
                markerType={
                  trackingAppearance.marker_type ||
                  'bike'
                }
                markerImageUrl={
                  trackingAppearance.marker_image_url ||
                  ''
                }
                markerLabel={
                  trackingAppearance.marker_label ||
                  order.driver?.name ||
                  'Delivery partner'
                }
                advertisement={
                  trackingAdvertisement
                }
                height={420}
              />
            </section>
          )}

        {order.driver && (

          <section className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-sm">

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

              <a

                href={`tel:${order.driver.mobile}`}

                className="rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white"

              >

                Call{' '}

                {order.driver.mobile}

              </a>

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
