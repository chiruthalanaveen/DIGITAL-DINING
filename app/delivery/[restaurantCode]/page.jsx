'use client'

import {
  use,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import DeliveryLocationMap from '@/app/components/DeliveryLocationMap'

const EMPTY_CHECKOUT = {
  customerName: '',
  customerMobile: '',
  alternateMobile: '',
  customerEmail: '',
  addressLine1: '',
  addressLine2: '',
  landmark: '',
  city: '',
  state: '',
  pincode: '',
  latitude: '',
  longitude: '',
  locationAccuracy: '',
  customerNote: '',
}

function money(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  })}`
}

function digits(value, max) {
  return String(value || '')
    .replace(/\D/g, '')
    .slice(0, max)
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

export default function DeliveryStorePage({
  params,
}) {
  const unwrappedParams = use(params)
  const router = useRouter()

  // Support either dynamic-folder spelling:
  // app/delivery/[restaurantCode]/page.jsx
  // app/delivery/[restaurantcode]/page.jsx
  const restaurantCode = String(
    unwrappedParams?.restaurantCode ||
      unwrappedParams?.restaurantcode ||
      ''
  ).trim()

  const [loading, setLoading] =
    useState(true)
  const [storeData, setStoreData] =
    useState(null)
  const [error, setError] =
    useState('')

  const [search, setSearch] =
    useState('')
  const [category, setCategory] =
    useState('All')
  const [cart, setCart] =
    useState({})

  const [
    checkoutOpen,
    setCheckoutOpen,
  ] = useState(false)

  const [
    checkout,
    setCheckout,
  ] = useState(
    EMPTY_CHECKOUT
  )

  const [
    paymentMethod,
    setPaymentMethod,
  ] = useState('cod')

  const [placing, setPlacing] =
    useState(false)
  const [message, setMessage] =
    useState('')

  const [trackingOpen, setTrackingOpen] =
    useState(false)
  const [trackingMobile, setTrackingMobile] =
    useState('')
  const [trackingError, setTrackingError] =
    useState('')
  const [trackingLoading, setTrackingLoading] =
    useState(false)
  const [trackingOrders, setTrackingOrders] =
    useState([])
  const [locationLoading, setLocationLoading] =
    useState(false)
  const [locationError, setLocationError] =
    useState('')
  const [locationConfirmed, setLocationConfirmed] =
    useState(false)

  const settings =
    storeData?.settings || {}
  const coverage =
    storeData?.coverage || {}
  const restaurant =
    storeData?.restaurant || {}
  const menuItems =
    Array.isArray(
      storeData?.menu_items
    )
      ? storeData.menu_items
      : []
  const offers =
    Array.isArray(
      storeData?.daily_offers
    )
      ? storeData.daily_offers
      : []

  const coverageEnabled = Boolean(
    coverage?.delivery_radius_enabled
  )
  const coverageRadiusKm = Number(
    coverage?.max_delivery_distance_km || 0
  )
  const coverageOriginLatitude = Number(
    coverage?.delivery_origin_latitude
  )
  const coverageOriginLongitude = Number(
    coverage?.delivery_origin_longitude
  )

  const selectedDistanceKm = useMemo(() => {
    if (
      !coverageEnabled ||
      !Number.isFinite(coverageOriginLatitude) ||
      !Number.isFinite(coverageOriginLongitude) ||
      !checkout.latitude ||
      !checkout.longitude
    ) {
      return null
    }

    return distanceKm(
      coverageOriginLatitude,
      coverageOriginLongitude,
      checkout.latitude,
      checkout.longitude
    )
  }, [
    coverageEnabled,
    coverageOriginLatitude,
    coverageOriginLongitude,
    checkout.latitude,
    checkout.longitude,
  ])

  const outsideDeliveryRadius = Boolean(
    coverageEnabled &&
      coverageRadiusKm > 0 &&
      selectedDistanceKm !== null &&
      selectedDistanceKm > coverageRadiusKm
  )

  const loadStore = async () => {
    if (!restaurantCode) {
      setError(
        'Delivery store code is missing.'
      )
      setLoading(false)
      return
    }

    setLoading(true)
    setError('')

    try {
      const {
        data,
        error: rpcError,
      } = await supabase.rpc(
        'get_public_delivery_store',
        {
          p_restaurant_code:
            restaurantCode,
        }
      )

      if (rpcError) {
        throw rpcError
      }

      if (!data?.success) {
        throw new Error(
          data?.message ||
            'Delivery store is unavailable.'
        )
      }

      let coverageData = {}

      try {
        const {
          data: radiusData,
          error: radiusError,
        } = await supabase.rpc(
          'get_public_delivery_coverage',
          {
            p_restaurant_code:
              restaurantCode,
          }
        )

        if (radiusError) throw radiusError
        if (radiusData?.success) {
          coverageData = radiusData
        }
      } catch (radiusLoadError) {
        console.warn(
          'Delivery coverage load warning:',
          radiusLoadError
        )
      }

      setStoreData({
        ...data,
        coverage: coverageData,
      })

      if (
        data?.settings
          ?.cod_enabled
      ) {
        setPaymentMethod('cod')
      } else if (
        data?.settings
          ?.online_payment_enabled
      ) {
        setPaymentMethod(
          'razorpay'
        )
      }
    } catch (loadError) {
      console.error(
        'Delivery store load error:',
        loadError
      )

      setError(
        loadError?.message ||
          'Unable to load Delivery store.'
      )
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadStore()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantCode])

  const categories =
    useMemo(() => {
      return [
        'All',
        ...new Set(
          menuItems
            .map(
              (item) =>
                item.category ||
                'Other'
            )
            .filter(Boolean)
        ),
      ]
    }, [menuItems])

  const filteredItems =
    useMemo(() => {
      const term =
        search
          .trim()
          .toLowerCase()

      return menuItems.filter(
        (item) => {
          if (
            category !== 'All' &&
            item.category !==
              category
          ) {
            return false
          }

          if (!term) return true

          return [
            item.name,
            item.category,
            item.description,
          ]
            .map((value) =>
              String(value || '')
                .toLowerCase()
            )
            .some((value) =>
              value.includes(
                term
              )
            )
        }
      )
    }, [
      menuItems,
      search,
      category,
    ])

  const cartRows =
    useMemo(() => {
      return menuItems
        .filter(
          (item) =>
            Number(
              cart[item.id] || 0
            ) > 0
        )
        .map((item) => ({
          ...item,
          quantity:
            Number(
              cart[item.id] || 0
            ),
        }))
    }, [menuItems, cart])

  const cartCount =
    cartRows.reduce(
      (sum, item) =>
        sum + item.quantity,
      0
    )

  const subtotal =
    cartRows.reduce(
      (sum, item) =>
        sum +
        Number(
          item.price || 0
        ) *
          item.quantity,
      0
    )

  const previewDeliveryFee =
    settings.free_delivery_above !=
      null &&
    subtotal >=
      Number(
        settings.free_delivery_above
      )
      ? 0
      : Number(
          settings.delivery_fee || 0
        )

  const previewPacking =
    Number(
      settings.packing_charge || 0
    )

  const previewTax =
    settings.tax_enabled
      ? (
          subtotal *
          (
            Number(
              settings.sgst_rate || 0
            ) +
            Number(
              settings.cgst_rate || 0
            )
          )
        ) /
        100
      : 0

  const previewTotal =
    subtotal +
    previewDeliveryFee +
    previewPacking +
    previewTax

  const updateQuantity = (
    itemId,
    next
  ) => {
    const safe = Math.max(
      0,
      Math.min(
        20,
        Number(next || 0)
      )
    )

    setCart((current) => {
      const copy = {
        ...current,
      }

      if (safe <= 0) {
        delete copy[itemId]
      } else {
        copy[itemId] = safe
      }

      return copy
    })
  }

  const loadRazorpay = () => {
    return new Promise(
      (resolve) => {
        if (
          typeof window ===
          'undefined'
        ) {
          resolve(false)
          return
        }

        if (window.Razorpay) {
          resolve(true)
          return
        }

        const existing =
          document.querySelector(
            'script[data-digital-dining-delivery-razorpay="true"]'
          )

        if (existing) {
          existing.addEventListener(
            'load',
            () => resolve(true),
            { once: true }
          )

          existing.addEventListener(
            'error',
            () => resolve(false),
            { once: true }
          )

          return
        }

        const script =
          document.createElement(
            'script'
          )

        script.src =
          'https://checkout.razorpay.com/v1/checkout.js'
        script.async = true
        script.dataset.digitalDiningDeliveryRazorpay =
          'true'

        script.onload = () =>
          resolve(true)
        script.onerror = () =>
          resolve(false)

        document.body.appendChild(
          script
        )
      }
    )
  }

  const rememberTrackingMobile = (
    orderCode,
    mobile
  ) => {
    try {
      localStorage.setItem(
        `digitaldining_delivery_mobile_${restaurantCode}_${orderCode}`,
        mobile
      )
    } catch {
      // Storage can be unavailable in strict privacy mode.
    }
  }

  const goToTracking = (
    orderCode,
    mobile
  ) => {
    rememberTrackingMobile(
      orderCode,
      mobile
    )

    router.push(
      `/delivery/${encodeURIComponent(
        restaurantCode
      )}/track/${encodeURIComponent(
        orderCode
      )}`
    )
  }

  const openTracking = () => {
    setTrackingError('')
    setTrackingOrders([])
    setTrackingOpen(true)
  }

  const submitTracking = async (event) => {
    event.preventDefault()

    const mobile = digits(trackingMobile, 10)

    if (mobile.length !== 10) {
      setTrackingError(
        'Enter the 10-digit mobile number used for your Delivery orders.'
      )
      return
    }

    setTrackingLoading(true)
    setTrackingError('')
    setTrackingOrders([])

    try {
      const { data, error: rpcError } = await supabase.rpc(
        'get_public_delivery_orders_by_mobile',
        {
          p_restaurant_code: restaurantCode,
          p_customer_mobile: mobile,
        }
      )

      if (rpcError) throw rpcError
      if (!data?.success) {
        throw new Error(data?.message || 'Unable to find Delivery orders.')
      }

      const rows = Array.isArray(data?.orders) ? data.orders : []
      setTrackingOrders(rows)

      if (!rows.length) {
        setTrackingError(
          'No recent Delivery orders were found for this mobile number.'
        )
      }
    } catch (lookupError) {
      console.error('Delivery mobile tracking lookup error:', lookupError)
      setTrackingError(
        lookupError?.message || 'Unable to find Delivery orders.'
      )
    } finally {
      setTrackingLoading(false)
    }
  }

  const chooseLiveLocation = () => {
    if (locationLoading) return

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setLocationError(
        'Live location is not supported on this device/browser. Please open the Delivery page in a modern browser and allow location access.'
      )
      return
    }

    setLocationLoading(true)
    setLocationError('')

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = Number(position.coords.latitude)
        const longitude = Number(position.coords.longitude)
        const accuracy = Number(position.coords.accuracy || 0)

        setCheckout((current) => ({
          ...current,
          latitude: latitude.toFixed(7),
          longitude: longitude.toFixed(7),
          locationAccuracy: accuracy ? accuracy.toFixed(2) : '',
        }))
        setLocationConfirmed(false)

        setLocationLoading(false)
        setLocationError('')
      },
      (geoError) => {
        console.error('Customer geolocation error:', geoError)
        setLocationLoading(false)
        setLocationError(
          geoError?.code === 1
            ? 'Location permission was denied. Allow location access and tap Use Current Location again.'
            : 'Unable to read your current location. Check GPS/location services and try again.'
        )
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    )
  }

  const placeOrder = async (
    event
  ) => {
    event.preventDefault()

    if (placing) return

    const cleanName =
      checkout.customerName.trim()
    const cleanMobile =
      digits(
        checkout.customerMobile,
        10
      )
    const cleanAlternate =
      digits(
        checkout.alternateMobile,
        10
      )
    const cleanPincode =
      digits(
        checkout.pincode,
        6
      )

    if (
      cleanName.length < 2
    ) {
      setMessage(
        'Enter your name.'
      )
      return
    }

    if (
      cleanMobile.length !== 10
    ) {
      setMessage(
        'Enter a valid 10-digit mobile number.'
      )
      return
    }

    if (
      cleanAlternate &&
      cleanAlternate.length !==
        10
    ) {
      setMessage(
        'Enter a valid alternate mobile number.'
      )
      return
    }

    if (
      !checkout.addressLine1.trim() ||
      !checkout.city.trim() ||
      !checkout.state.trim() ||
      cleanPincode.length !== 6
    ) {
      setMessage(
        'Complete your delivery address and 6-digit pincode.'
      )
      return
    }

    const selectedLatitude = Number(checkout.latitude)
    const selectedLongitude = Number(checkout.longitude)

    if (!locationConfirmed) {
      setMessage(
        'Choose your location on the map and tap Confirm Delivery Pin before placing the order.'
      )
      return
    }

    if (outsideDeliveryRadius) {
      setMessage(
        `This location is outside the store delivery area. Delivery is available within ${coverageRadiusKm.toFixed(1)} km.`
      )
      return
    }

    if (
      !Number.isFinite(selectedLatitude) ||
      !Number.isFinite(selectedLongitude) ||
      selectedLatitude < -90 ||
      selectedLatitude > 90 ||
      selectedLongitude < -180 ||
      selectedLongitude > 180
    ) {
      setMessage(
        'Choose your live delivery location before placing the order.'
      )
      return
    }

    if (!cartRows.length) {
      setMessage(
        'Your cart is empty.'
      )
      return
    }

    if (
      subtotal <
      Number(
        settings.minimum_order_amount ||
          0
      )
    ) {
      setMessage(
        `Minimum order is ${money(
          settings.minimum_order_amount
        )}.`
      )
      return
    }

    setPlacing(true)
    setMessage('')

    try {
      const response = await fetch(
        '/api/delivery/orders/create',
        {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            restaurantCode,
            customerName:
              cleanName,
            customerMobile:
              cleanMobile,
            alternateMobile:
              cleanAlternate,
            customerEmail:
              checkout.customerEmail
                .trim(),
            addressLine1:
              checkout.addressLine1
                .trim(),
            addressLine2:
              checkout.addressLine2
                .trim(),
            landmark:
              checkout.landmark
                .trim(),
            city:
              checkout.city.trim(),
            state:
              checkout.state.trim(),
            pincode:
              cleanPincode,
            latitude:
              selectedLatitude,
            longitude:
              selectedLongitude,
            locationAccuracy:
              Number(checkout.locationAccuracy || 0) || null,
            customerNote:
              checkout.customerNote
                .trim(),
            paymentMethod,
            items:
              cartRows.map(
                (item) => ({
                  id: item.id,
                  quantity:
                    item.quantity,
                })
              ),
          }),
        }
      )

      const data =
        await response
          .json()
          .catch(() => ({}))

      if (
        !response.ok ||
        !data?.success
      ) {
        throw new Error(
          data?.message ||
            'Unable to place order.'
        )
      }

      if (
        data.paymentMethod ===
        'cod'
      ) {
        setCart({})
        setCheckoutOpen(false)

        goToTracking(
          data.order.orderCode,
          cleanMobile
        )
        return
      }

      const loaded =
        await loadRazorpay()

      if (
        !loaded ||
        !window.Razorpay
      ) {
        throw new Error(
          'Unable to load Razorpay Checkout.'
        )
      }

      const paymentObject =
        new window.Razorpay({
          key: data.keyId,
          amount: data.amount,
          currency:
            data.currency ||
            'INR',
          name:
            settings.store_name ||
            restaurant.name ||
            'Delivery',
          description:
            `Delivery order ${data.deliveryOrderCode}`,
          order_id:
            data.orderId,

          prefill: {
            name:
              cleanName,
            email:
              checkout.customerEmail
                .trim(),
            contact:
              cleanMobile,
          },

          notes: {
            delivery_order_code:
              data.deliveryOrderCode,
          },

          theme: {
            color: '#059669',
          },

          handler:
            async (
              razorpayResponse
            ) => {
              setPlacing(true)

              try {
                const verifyResponse =
                  await fetch(
                    '/api/delivery/razorpay/verify-payment',
                    {
                      method:
                        'POST',
                      headers: {
                        'Content-Type':
                          'application/json',
                      },
                      body:
                        JSON.stringify(
                          {
                            deliveryOrderId:
                              data.deliveryOrderId,
                            razorpay_order_id:
                              razorpayResponse.razorpay_order_id,
                            razorpay_payment_id:
                              razorpayResponse.razorpay_payment_id,
                            razorpay_signature:
                              razorpayResponse.razorpay_signature,
                          }
                        ),
                    }
                  )

                const verifyData =
                  await verifyResponse
                    .json()
                    .catch(
                      () => ({})
                    )

                if (
                  !verifyResponse.ok ||
                  !verifyData?.success
                ) {
                  throw new Error(
                    verifyData?.message ||
                      'Payment verification failed.'
                  )
                }

                setCart({})
                setCheckoutOpen(
                  false
                )

                goToTracking(
                  verifyData.orderCode,
                  cleanMobile
                )
              } catch (
                verifyError
              ) {
                console.error(
                  'Delivery payment verify error:',
                  verifyError
                )

                setMessage(
                  verifyError?.message ||
                    'Payment was received but could not be verified. Contact the store before paying again.'
                )
              } finally {
                setPlacing(false)
              }
            },

          modal: {
            ondismiss: () => {
              setPlacing(false)
              setMessage(
                'Online payment was not completed. You can try again by placing the order again.'
              )
            },
          },
        })

      paymentObject.on(
        'payment.failed',
        (failure) => {
          setPlacing(false)

          setMessage(
            failure?.error
              ?.description ||
              'Payment failed. Please try again.'
          )
        }
      )

      paymentObject.open()
    } catch (placeError) {
      console.error(
        'Delivery checkout error:',
        placeError
      )

      setMessage(
        placeError?.message ||
          'Unable to place order.'
      )

      setPlacing(false)
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-50 px-4 py-10 text-neutral-900">
        <div className="mx-auto max-w-lg rounded-3xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-neutral-200 border-t-emerald-600" />
          <p className="mt-4 text-sm font-bold text-neutral-600">
            Loading Delivery
            store...
          </p>
        </div>
      </main>
    )
  }

  if (error || !storeData) {
    return (
      <main className="min-h-screen bg-neutral-50 px-4 py-10 text-neutral-900">
        <div className="mx-auto max-w-lg rounded-3xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
          <div className="text-4xl">
            🚚
          </div>

          <h1 className="mt-4 text-xl font-black">
            Delivery unavailable
          </h1>

          <p className="mt-2 text-sm text-neutral-500">
            {error ||
              'This Delivery store is not available.'}
          </p>

          <button
            type="button"
            onClick={loadStore}
            className="mt-5 rounded-xl bg-neutral-900 px-5 py-3 text-xs font-black text-white"
          >
            Try Again
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-neutral-50 pb-28 text-neutral-900">
      <header className="sticky top-0 z-30 border-b border-neutral-200 bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-5xl px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="h-11 w-11 overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-100">
              {restaurant.logo_url ? (
                <img
                  src={
                    restaurant.logo_url
                  }
                  alt={
                    settings.store_name ||
                    restaurant.name
                  }
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center text-xl">
                  🍽️
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <h1 className="truncate text-base font-black">
                {settings.store_name ||
                  restaurant.name ||
                  'Delivery'}
              </h1>

              <p
                className={`text-[10px] font-black uppercase tracking-wider ${
                  settings.is_open
                    ? 'text-emerald-600'
                    : 'text-red-500'
                }`}
              >
                {settings.is_open
                  ? `Open · ~${settings.estimated_delivery_minutes || 45} min`
                  : 'Currently Closed'}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={
                  openTracking
                }
                className="rounded-xl border border-neutral-200 bg-white px-3 py-2.5 text-[10px] font-black text-neutral-700 shadow-sm"
              >
                Track Order
              </button>

              <button
                type="button"
                onClick={() =>
                  setCheckoutOpen(
                    true
                  )
                }
                className="relative rounded-xl bg-neutral-900 px-4 py-2.5 text-xs font-black text-white"
              >
                Cart
                {cartCount > 0 && (
                  <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-600 px-1 text-[9px] text-white">
                    {cartCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          <div className="mt-3">
            <input
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Search dishes, drinks, categories..."
              className="w-full rounded-2xl border border-neutral-200 bg-neutral-100 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:bg-white"
            />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-5">
        {settings.banner_url && (
          <div className="overflow-hidden rounded-3xl border border-neutral-200 bg-neutral-900 shadow-sm">
            <img
              src={
                settings.banner_url
              }
              alt="Delivery banner"
              className="h-44 w-full object-cover sm:h-56"
            />
          </div>
        )}

        {settings.description && (
          <p className="mt-4 text-sm leading-6 text-neutral-600">
            {settings.description}
          </p>
        )}

        {offers.length > 0 && (
          <section className="mt-6">
            <div className="mb-3 flex items-end justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-orange-500">
                  Today&apos;s offers
                </p>
                <h2 className="mt-1 text-lg font-black">
                  Special deals
                </h2>
              </div>
            </div>

            <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2">
              {offers.map(
                (offer) => (
                  <article
                    key={offer.id}
                    className="min-w-[260px] max-w-[280px] rounded-3xl border border-orange-100 bg-orange-50 p-4"
                  >
                    <p className="text-[10px] font-black uppercase text-orange-600">
                      {offer.discount_text ||
                        'Offer'}
                    </p>

                    <h3 className="mt-1 font-black">
                      {offer.title}
                    </h3>

                    <p className="mt-1 line-clamp-2 text-xs leading-5 text-neutral-600">
                      {offer.description}
                    </p>

                    <p className="mt-3 text-sm font-black text-orange-700">
                      {money(
                        offer.offer_price
                      )}
                    </p>
                  </article>
                )
              )}
            </div>
          </section>
        )}

        <section className="mt-6">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2">
            {categories.map(
              (itemCategory) => (
                <button
                  key={
                    itemCategory
                  }
                  type="button"
                  onClick={() =>
                    setCategory(
                      itemCategory
                    )
                  }
                  className={`whitespace-nowrap rounded-full border px-4 py-2 text-xs font-black ${
                    category ===
                    itemCategory
                      ? 'border-neutral-900 bg-neutral-900 text-white'
                      : 'border-neutral-200 bg-white text-neutral-600'
                  }`}
                >
                  {itemCategory}
                </button>
              )
            )}
          </div>
        </section>

        <section className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filteredItems.map(
            (item) => {
              const quantity =
                Number(
                  cart[item.id] || 0
                )

              const hasDiscount =
                Number(
                  item.base_price || 0
                ) >
                Number(
                  item.price || 0
                )

              return (
                <article
                  key={item.id}
                  className="overflow-hidden rounded-3xl border border-neutral-200 bg-white shadow-sm"
                >
                  <div className="aspect-[16/10] bg-neutral-100">
                    {item.image_url ? (
                      <img
                        src={
                          item.image_url
                        }
                        alt={
                          item.name
                        }
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-4xl">
                        🍽️
                      </div>
                    )}
                  </div>

                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p
                          className={`text-[9px] font-black uppercase tracking-wider ${
                            item.is_veg
                              ? 'text-emerald-600'
                              : 'text-red-500'
                          }`}
                        >
                          {item.food_type ||
                            (item.is_veg
                              ? 'veg'
                              : 'non-veg')}
                        </p>

                        <h3 className="mt-1 truncate font-black">
                          {
                            item.name
                          }
                        </h3>
                      </div>

                      <div className="text-right">
                        <p className="font-black">
                          {money(
                            item.price
                          )}
                        </p>

                        {hasDiscount && (
                          <p className="text-[10px] text-neutral-400 line-through">
                            {money(
                              item.base_price
                            )}
                          </p>
                        )}
                      </div>
                    </div>

                    {item.description && (
                      <p className="mt-2 line-clamp-2 text-xs leading-5 text-neutral-500">
                        {
                          item.description
                        }
                      </p>
                    )}

                    <div className="mt-4">
                      {quantity <= 0 ? (
                        <button
                          type="button"
                          disabled={
                            !settings.is_open
                          }
                          onClick={() =>
                            updateQuantity(
                              item.id,
                              1
                            )
                          }
                          className="w-full rounded-xl border border-emerald-600 bg-emerald-50 py-2.5 text-xs font-black text-emerald-700 disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          ADD
                        </button>
                      ) : (
                        <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-emerald-600">
                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(
                                item.id,
                                quantity -
                                  1
                              )
                            }
                            className="py-2.5 text-lg font-black text-emerald-700"
                          >
                            −
                          </button>

                          <div className="flex items-center justify-center bg-emerald-600 text-sm font-black text-white">
                            {quantity}
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              updateQuantity(
                                item.id,
                                quantity +
                                  1
                              )
                            }
                            className="py-2.5 text-lg font-black text-emerald-700"
                          >
                            +
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </article>
              )
            }
          )}

          {!filteredItems.length && (
            <div className="col-span-full rounded-3xl border border-neutral-200 bg-white py-14 text-center text-sm text-neutral-500">
              No matching Delivery
              items.
            </div>
          )}
        </section>
      </div>

      {cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white p-3 shadow-[0_-12px_30px_rgba(0,0,0,0.08)]">
          <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
            <div>
              <p className="text-[10px] font-bold text-neutral-500">
                {cartCount}{' '}
                {cartCount === 1
                  ? 'item'
                  : 'items'}
              </p>

              <p className="font-black">
                {money(
                  previewTotal
                )}
                <span className="ml-1 text-[10px] font-medium text-neutral-400">
                  approx.
                </span>
              </p>
            </div>

            <button
              type="button"
              onClick={() =>
                setCheckoutOpen(
                  true
                )
              }
              className="rounded-xl bg-emerald-600 px-6 py-3 text-xs font-black text-white"
            >
              View Cart & Checkout
            </button>
          </div>
        </div>
      )}

      {trackingOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-0 sm:items-center sm:p-4">
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-3xl border border-neutral-200 bg-white p-5 shadow-2xl sm:rounded-3xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-600">
                  Delivery Tracking
                </p>

                <h2 className="mt-1 text-xl font-black text-neutral-950">
                  Find orders by mobile
                </h2>

                <p className="mt-1 text-xs leading-5 text-neutral-500">
                  Enter the mobile number used while placing the order. Your recent Delivery orders will appear below.
                </p>
              </div>

              <button
                type="button"
                onClick={() => {
                  setTrackingOpen(false)
                  setTrackingError('')
                  setTrackingOrders([])
                }}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 text-sm font-black text-neutral-600"
                aria-label="Close order tracking"
              >
                ✕
              </button>
            </div>

            <form onSubmit={submitTracking} className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-neutral-500">
                  Mobile Number
                </span>

                <input
                  type="tel"
                  inputMode="numeric"
                  value={trackingMobile}
                  onChange={(event) => {
                    setTrackingMobile(digits(event.target.value, 10))
                    setTrackingOrders([])
                    setTrackingError('')
                  }}
                  placeholder="10-digit mobile number"
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none focus:border-emerald-500 focus:bg-white"
                />
              </label>

              {trackingError && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">
                  {trackingError}
                </div>
              )}

              <button
                type="submit"
                disabled={trackingLoading || trackingMobile.length !== 10}
                className="w-full rounded-xl bg-emerald-600 px-5 py-4 text-sm font-black text-white disabled:opacity-50"
              >
                {trackingLoading ? 'Finding Orders...' : 'Find My Orders'}
              </button>
            </form>

            {trackingOrders.length > 0 && (
              <div className="mt-5 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-neutral-500">
                  Recent Orders
                </p>

                {trackingOrders.map((order) => (
                  <button
                    key={order.order_code}
                    type="button"
                    onClick={() => {
                      setTrackingOpen(false)
                      goToTracking(order.order_code, trackingMobile)
                    }}
                    className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50/50"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-xs font-black text-neutral-900">
                          {order.order_code}
                        </p>
                        <p className="mt-1 text-[10px] text-neutral-500">
                          {order.created_at
                            ? new Date(order.created_at).toLocaleString('en-IN', {
                                day: '2-digit',
                                month: 'short',
                                hour: '2-digit',
                                minute: '2-digit',
                              })
                            : ''}
                        </p>
                      </div>

                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[9px] font-black uppercase text-emerald-700">
                        {String(order.order_status || '').replaceAll('_', ' ')}
                      </span>
                    </div>

                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="text-neutral-500">
                        {order.driver_assigned ? 'Driver assigned' : 'Preparing dispatch'}
                      </span>
                      <span className="font-black text-neutral-900">
                        {money(order.total_amount)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}

            <p className="mt-4 text-[10px] leading-5 text-neutral-500">
              Order progress refreshes every 1 minute on the tracking page.
            </p>
          </div>
        </div>
      )}

      {checkoutOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/45 sm:items-center sm:justify-center sm:p-5">
          <div className="max-h-[92vh] w-full overflow-y-auto rounded-t-3xl bg-white p-5 sm:max-w-2xl sm:rounded-3xl">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-600">
                  Delivery checkout
                </p>

                <h2 className="mt-1 text-xl font-black">
                  Your order
                </h2>
              </div>

              <button
                type="button"
                onClick={() =>
                  setCheckoutOpen(
                    false
                  )
                }
                className="rounded-full bg-neutral-100 px-3 py-2 text-sm font-black"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 space-y-3">
              {cartRows.map(
                (item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 p-3"
                  >
                    <div>
                      <p className="text-sm font-black">
                        {item.name}
                      </p>

                      <p className="mt-1 text-xs text-neutral-500">
                        {money(
                          item.price
                        )}{' '}
                        ×{' '}
                        {
                          item.quantity
                        }
                      </p>
                    </div>

                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          updateQuantity(
                            item.id,
                            item.quantity -
                              1
                          )
                        }
                        className="h-8 w-8 rounded-lg bg-neutral-100 font-black"
                      >
                        −
                      </button>

                      <span className="text-sm font-black">
                        {
                          item.quantity
                        }
                      </span>

                      <button
                        type="button"
                        onClick={() =>
                          updateQuantity(
                            item.id,
                            item.quantity +
                              1
                          )
                        }
                        className="h-8 w-8 rounded-lg bg-neutral-900 font-black text-white"
                      >
                        +
                      </button>
                    </div>
                  </div>
                )
              )}
            </div>

            <div className="mt-5 rounded-2xl bg-neutral-50 p-4 text-xs">
              <BillRow
                label="Subtotal"
                value={money(
                  subtotal
                )}
              />

              <BillRow
                label="GST"
                value={money(
                  previewTax
                )}
              />

              <BillRow
                label="Packing"
                value={money(
                  previewPacking
                )}
              />

              <BillRow
                label="Delivery"
                value={
                  previewDeliveryFee ===
                  0
                    ? 'FREE'
                    : money(
                        previewDeliveryFee
                      )
                }
              />

              <div className="mt-3 flex items-center justify-between border-t border-neutral-200 pt-3 text-sm font-black">
                <span>
                  Estimated Total
                </span>

                <span>
                  {money(
                    previewTotal
                  )}
                </span>
              </div>

              <p className="mt-2 text-[10px] leading-4 text-neutral-400">
                The server recalculates
                item prices, GST, packing
                and delivery charges before
                the order is created.
              </p>
            </div>

            <form
              onSubmit={placeOrder}
              className="mt-5 space-y-3"
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <CheckoutField
                  label="Name"
                  value={
                    checkout.customerName
                  }
                  onChange={(value) =>
                    setCheckout(
                      (current) => ({
                        ...current,
                        customerName:
                          value,
                      })
                    )
                  }
                />

                <CheckoutField
                  label="Mobile"
                  value={
                    checkout.customerMobile
                  }
                  onChange={(value) =>
                    setCheckout(
                      (current) => ({
                        ...current,
                        customerMobile:
                          digits(
                            value,
                            10
                          ),
                      })
                    )
                  }
                />

                <CheckoutField
                  label="Alternate Mobile"
                  value={
                    checkout.alternateMobile
                  }
                  onChange={(value) =>
                    setCheckout(
                      (current) => ({
                        ...current,
                        alternateMobile:
                          digits(
                            value,
                            10
                          ),
                      })
                    )
                  }
                />

                <CheckoutField
                  label="Email"
                  type="email"
                  value={
                    checkout.customerEmail
                  }
                  onChange={(value) =>
                    setCheckout(
                      (current) => ({
                        ...current,
                        customerEmail:
                          value,
                      })
                    )
                  }
                  placeholder="Optional"
                />

                <div className="sm:col-span-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">
                        1. Pin Your Delivery Location
                      </p>
                      <p className="mt-1 text-xs leading-5 text-emerald-900/70">
                        Use your current GPS location or tap/drag the pin on the map to the exact delivery point. Confirm the pin first, then enter the written address manually.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={chooseLiveLocation}
                      disabled={locationLoading}
                      className="shrink-0 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white disabled:opacity-50"
                    >
                      {locationLoading
                        ? 'Getting Location...'
                        : 'Use My Current Location'}
                    </button>
                  </div>

                  <div className="mt-4">
                    <DeliveryLocationMap
                      latitude={checkout.latitude}
                      longitude={checkout.longitude}
                      referenceLatitude={coverageOriginLatitude}
                      referenceLongitude={coverageOriginLongitude}
                      radiusKm={coverageRadiusKm}
                      showRadius={coverageEnabled}
                      onChange={({ latitude, longitude }) => {
                        setCheckout((current) => ({
                          ...current,
                          latitude,
                          longitude,
                          locationAccuracy: '',
                        }))
                        setLocationConfirmed(false)
                        setLocationError('')
                      }}
                      height={300}
                    />
                  </div>

                  {checkout.latitude && checkout.longitude && (
                    <div
                      className={`mt-3 rounded-xl border px-3 py-3 ${
                        outsideDeliveryRadius
                          ? 'border-red-200 bg-red-50'
                          : locationConfirmed
                            ? 'border-emerald-200 bg-white'
                            : 'border-amber-200 bg-amber-50'
                      }`}
                    >
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p
                            className={`text-xs font-black ${
                              outsideDeliveryRadius
                                ? 'text-red-700'
                                : locationConfirmed
                                  ? 'text-emerald-700'
                                  : 'text-amber-700'
                            }`}
                          >
                            {outsideDeliveryRadius
                              ? 'Outside delivery area'
                              : locationConfirmed
                                ? '✓ Delivery pin confirmed'
                                : 'Pin selected — confirm this location'}
                          </p>

                          <div className="mt-1 flex flex-wrap items-center gap-2 text-[10px] text-neutral-500">
                            <span>
                              {Number(checkout.latitude).toFixed(5)}, {Number(checkout.longitude).toFixed(5)}
                            </span>
                            {checkout.locationAccuracy && (
                              <span>· GPS ±{Math.round(Number(checkout.locationAccuracy))}m</span>
                            )}
                            {selectedDistanceKm !== null && (
                              <span>
                                · {selectedDistanceKm.toFixed(2)} km from store
                              </span>
                            )}
                          </div>

                          {coverageEnabled && coverageRadiusKm > 0 && (
                            <p className="mt-1 text-[10px] font-bold text-neutral-500">
                              This store delivers within {coverageRadiusKm.toFixed(1)} km of its delivery center.
                            </p>
                          )}
                        </div>

                        <button
                          type="button"
                          disabled={outsideDeliveryRadius}
                          onClick={() => {
                            if (outsideDeliveryRadius) return
                            setLocationConfirmed(true)
                            setLocationError('')
                          }}
                          className="shrink-0 rounded-xl bg-neutral-950 px-4 py-3 text-xs font-black text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
                        >
                          Confirm Delivery Pin
                        </button>
                      </div>
                    </div>
                  )}

                  {locationError && (
                    <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-[10px] font-bold leading-5 text-red-700">
                      {locationError}
                    </div>
                  )}
                </div>

                {locationConfirmed && (
                  <>
                    <div className="sm:col-span-2 mt-1">
                      <p className="text-[10px] font-black uppercase tracking-wider text-neutral-500">
                        2. Enter Delivery Address Manually
                      </p>
                      <p className="mt-1 text-[10px] leading-4 text-neutral-400">
                        The map pin is used for navigation. Enter house, street and landmark details so the driver can identify the exact door/building.
                      </p>
                    </div>

                    <CheckoutField
                      label="House / Street"
                      value={checkout.addressLine1}
                      onChange={(value) =>
                        setCheckout((current) => ({
                          ...current,
                          addressLine1: value,
                        }))
                      }
                    />

                    <CheckoutField
                      label="Area / Locality"
                      value={checkout.addressLine2}
                      onChange={(value) =>
                        setCheckout((current) => ({
                          ...current,
                          addressLine2: value,
                        }))
                      }
                      placeholder="Optional"
                    />

                    <CheckoutField
                      label="Landmark"
                      value={checkout.landmark}
                      onChange={(value) =>
                        setCheckout((current) => ({
                          ...current,
                          landmark: value,
                        }))
                      }
                      placeholder="Optional"
                    />

                    <CheckoutField
                      label="City"
                      value={checkout.city}
                      onChange={(value) =>
                        setCheckout((current) => ({
                          ...current,
                          city: value,
                        }))
                      }
                    />

                    <CheckoutField
                      label="State"
                      value={checkout.state}
                      onChange={(value) =>
                        setCheckout((current) => ({
                          ...current,
                          state: value,
                        }))
                      }
                    />

                    <CheckoutField
                      label="Pincode"
                      value={checkout.pincode}
                      onChange={(value) =>
                        setCheckout((current) => ({
                          ...current,
                          pincode: digits(value, 6),
                        }))
                      }
                    />
                  </>
                )}
              </div>

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-neutral-500">
                  Delivery Note
                </span>

                <textarea
                  rows="3"
                  value={
                    checkout.customerNote
                  }
                  onChange={(event) =>
                    setCheckout(
                      (current) => ({
                        ...current,
                        customerNote:
                          event.target
                            .value,
                      })
                    )
                  }
                  placeholder="Optional instructions"
                  className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 text-sm outline-none focus:border-emerald-500"
                />
              </label>

              <div>
                <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-neutral-500">
                  Payment
                </p>

                <div className="grid gap-2 sm:grid-cols-2">
                  {settings.cod_enabled && (
                    <button
                      type="button"
                      onClick={() =>
                        setPaymentMethod(
                          'cod'
                        )
                      }
                      className={`rounded-2xl border p-4 text-left ${
                        paymentMethod ===
                        'cod'
                          ? 'border-emerald-600 bg-emerald-50'
                          : 'border-neutral-200'
                      }`}
                    >
                      <p className="text-sm font-black">
                        Cash on Delivery
                      </p>

                      <p className="mt-1 text-xs text-neutral-500">
                        Pay when the order
                        arrives.
                      </p>
                    </button>
                  )}

                  {settings.online_payment_enabled && (
                    <button
                      type="button"
                      onClick={() =>
                        setPaymentMethod(
                          'razorpay'
                        )
                      }
                      className={`rounded-2xl border p-4 text-left ${
                        paymentMethod ===
                        'razorpay'
                          ? 'border-emerald-600 bg-emerald-50'
                          : 'border-neutral-200'
                      }`}
                    >
                      <p className="text-sm font-black">
                        Pay Online
                      </p>

                      <p className="mt-1 text-xs text-neutral-500">
                        Razorpay secure
                        checkout.
                      </p>
                    </button>
                  )}
                </div>
              </div>

              {message && (
                <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold text-red-700">
                  {message}
                </div>
              )}

              <button
                type="submit"
                disabled={
                  placing ||
                  !settings.is_open ||
                  !cartRows.length
                }
                className="w-full rounded-xl bg-emerald-600 px-5 py-4 text-sm font-black text-white disabled:cursor-not-allowed disabled:opacity-50"
              >
                {placing
                  ? 'Processing...'
                  : paymentMethod ===
                      'razorpay'
                    ? 'Continue to Razorpay'
                    : 'Place Delivery Order'}
              </button>
            </form>
          </div>
        </div>
      )}
    </main>
  )
}

function CheckoutField({
  label,
  value,
  onChange,
  type = 'text',
  placeholder = '',
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-neutral-500">
        {label}
      </span>

      <input
        type={type}
        value={value}
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
        placeholder={placeholder}
        className="w-full rounded-xl border border-neutral-200 bg-white px-3 py-3 text-sm outline-none focus:border-emerald-500"
      />
    </label>
  )
}

function BillRow({
  label,
  value,
}) {
  return (
    <div className="mb-2 flex items-center justify-between text-neutral-600">
      <span>{label}</span>
      <span className="font-bold text-neutral-900">
        {value}
      </span>
    </div>
  )
}
