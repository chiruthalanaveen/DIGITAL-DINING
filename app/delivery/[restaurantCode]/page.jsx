'use client'

import {
  use,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useMobileViewportLock } from '@/lib/useMobileViewportLock'
import DeliveryLocationMap from '@/app/components/DeliveryLocationMap'
import { useLiveDeliveryRefresh } from '@/lib/useLiveDeliveryRefresh'
import InstallAppButton from '@/app/components/InstallAppButton'
import DeliveryCustomerSupportChat from '@/app/components/DeliveryCustomerSupportChat'


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

function deliveryStockInfo(item) {
  const tracked =
    item?.track_stock === true

  const available = tracked
    ? Math.max(
        0,
        Math.floor(
          Number(
            item?.available_stock || 0
          )
        )
      )
    : null

  const lowThreshold = tracked
    ? Math.max(
        0,
        Math.floor(
          Number(
            item?.low_stock_threshold || 0
          )
        )
      )
    : null

  return {
    tracked,
    available,
    lowThreshold,
    outOfStock:
      tracked &&
      available <= 0,

    lowStock:
      tracked &&
      available > 0 &&
      available <= lowThreshold,

    maxCartQuantity:
      tracked
        ? Math.max(
            0,
            Math.min(
              20,
              available
            )
          )
        : 20,
  }
}

export default function DeliveryStorePage({
  params,
}) {
  const unwrappedParams = use(params)
  const router = useRouter()
  useMobileViewportLock()

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
  const [addressLoading, setAddressLoading] =
    useState(false)
  const [locationError, setLocationError] =
    useState('')
  const [locationConfirmed, setLocationConfirmed] =
    useState(false)

  const [productReviews, setProductReviews] =
    useState({})

  // Delivery customer app session.
  // This keeps Home / Orders / Account available while the customer is inside a store.
  const [customerUser, setCustomerUser] = useState(null)
  const [customerProfile, setCustomerProfile] = useState(null)
  const [customerAuthLoading, setCustomerAuthLoading] = useState(true)
  const [accountOpen, setAccountOpen] = useState(false)


  useEffect(() => {
    let active = true

    async function syncDeliveryCustomer(session) {
      const user = session?.user || null
      if (!active) return

      setCustomerUser(user)

      if (!user) {
        setCustomerProfile(null)
        setCustomerAuthLoading(false)
        return
      }

      const { data, error: profileError } = await supabase
        .from('delivery_customer_profiles')
        .select('id, full_name, email, phone, avatar_url')
        .eq('id', user.id)
        .maybeSingle()

      if (!active) return

      if (profileError) {
        console.warn('Delivery customer profile load warning:', profileError)
        setCustomerProfile(null)
      } else {
        setCustomerProfile(data || null)
      }

      setCustomerAuthLoading(false)
    }

    supabase.auth.getSession().then(({ data, error: sessionError }) => {
      if (!active) return

      if (sessionError) {
        console.warn('Delivery customer session warning:', sessionError)
        setCustomerAuthLoading(false)
        return
      }

      syncDeliveryCustomer(data?.session || null)
    })

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      syncDeliveryCustomer(session)
    })

    return () => {
      active = false
      subscription?.unsubscribe()
    }
  }, [])

  const openCustomerAccount = () => {
    if (customerAuthLoading) return

    if (!customerUser) {
      const next = `/delivery/${encodeURIComponent(restaurantCode)}`
      router.push(`/delivery/login?next=${encodeURIComponent(next)}`)
      return
    }

    setAccountOpen(true)
  }

  const signOutDeliveryCustomer = async () => {
    try {
      setCustomerAuthLoading(true)
      const { error: signOutError } = await supabase.auth.signOut()
      if (signOutError) throw signOutError

      setAccountOpen(false)
      setCustomerUser(null)
      setCustomerProfile(null)
    } catch (signOutError) {
      console.error('Delivery customer sign out error:', signOutError)
      setMessage(signOutError?.message || 'Unable to sign out. Please try again.')
    } finally {
      setCustomerAuthLoading(false)
    }
  }

  const openCustomerOrders = () => {
    if (!customerUser) {
      const next = `/delivery/${encodeURIComponent(restaurantCode)}`
      router.push(`/delivery/login?next=${encodeURIComponent(next)}`)
      return
    }

    // Keep the customer inside the store/app and reuse the existing order tracker.
    openTracking()
  }

  const settings =
    storeData?.settings || {}
  const surge =
    storeData?.surge || {}
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

  const loadStore = async (
    quiet = false
  ) => {
    if (!restaurantCode) {
      setError(
        'Delivery store code is missing.'
      )
      setLoading(false)
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

      if (!quiet) {
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
      }
    } catch (loadError) {
      console.error(
        'Delivery store load error:',
        loadError
      )

      if (!quiet) {
        setError(
          loadError?.message ||
            'Unable to load Delivery store.'
        )
      }
    } finally {
      if (!quiet) {
        setLoading(false)
      }
    }
  }

  const loadProductReviews = async () => {
    if (!restaurantCode) {
      setProductReviews({})
      return
    }

    try {
      const {
        data,
        error: reviewError,
      } = await supabase.rpc(
        'get_public_delivery_product_reviews',
        {
          p_restaurant_code:
            restaurantCode,
        }
      )

      if (reviewError) {
        throw reviewError
      }

      const rows =
        data?.success &&
        Array.isArray(
          data?.products
        )
          ? data.products
          : []

      const next = {}

      rows.forEach((row) => {
        const id =
          String(
            row?.menu_item_id ||
              ''
          ).trim()

        if (id) {
          next[id] = row
        }
      })

      setProductReviews(next)
    } catch (reviewLoadError) {
      // Reviews are additive. Do not block ordering if review
      // backend has not been installed yet.
      console.warn(
        'Delivery product review load warning:',
        reviewLoadError
      )
    }
  }

  useEffect(() => {
    loadStore()
    loadProductReviews()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantCode])

  useLiveDeliveryRefresh(
    () => loadStore(true),
    Boolean(restaurantCode && storeData),
    1000
  )

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

  /*
   * Inventory can change while the customer is browsing.
   * Keep the cart inside the latest public available-stock limit.
   * The server inventory engine remains the final authority.
   */
  useEffect(() => {
    if (!menuItems.length) {
      return
    }

    setCart((current) => {
      let changed = false
      const nextCart = {
        ...current,
      }

      for (const [
        itemId,
        rawQuantity,
      ] of Object.entries(current)) {
        const item =
          menuItems.find(
            (row) =>
              String(row.id) ===
              String(itemId)
          )

        if (!item) {
          delete nextCart[itemId]
          changed = true
          continue
        }

        const stock =
          deliveryStockInfo(item)

        const currentQuantity =
          Math.max(
            0,
            Math.floor(
              Number(
                rawQuantity || 0
              )
            )
          )

        const nextQuantity =
          Math.min(
            currentQuantity,
            stock.maxCartQuantity
          )

        if (
          nextQuantity !==
          currentQuantity
        ) {
          changed = true

          if (nextQuantity <= 0) {
            delete nextCart[itemId]
          } else {
            nextCart[itemId] =
              nextQuantity
          }
        }
      }

      return changed
        ? nextCart
        : current
    })
  }, [menuItems])

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

  const minimumOrderAmount =
    Math.max(
      0,
      Number(
        settings.minimum_order_amount || 0
      )
    )

  const configuredDeliveryFee =
    Math.max(
      0,
      Number(
        settings.delivery_fee || 0
      )
    )

  const previewDeliveryFee =
    minimumOrderAmount > 0
      ? subtotal < minimumOrderAmount
        ? configuredDeliveryFee
        : 0
      : settings.free_delivery_above != null &&
          Number(settings.free_delivery_above) > 0 &&
          subtotal >= Number(settings.free_delivery_above)
        ? 0
        : configuredDeliveryFee

  const previewPacking =
    Math.max(
      0,
      Number(
        settings.packing_charge || 0
      )
    )

  const previewHandling =
    Math.max(
      0,
      Number(
        settings.handling_charge || 0
      )
    )

  const previewSurge =
    Boolean(surge.active)
      ? Math.max(
          0,
          Number(
            surge.charge ||
              settings.surge_charge ||
              0
          )
        )
      : 0

  const previewSgst =
    settings.tax_enabled
      ? (
          subtotal *
          Number(settings.sgst_rate || 0)
        ) / 100
      : 0

  const previewCgst =
    settings.tax_enabled
      ? (
          subtotal *
          Number(settings.cgst_rate || 0)
        ) / 100
      : 0

  const previewTax =
    previewSgst +
    previewCgst

  const previewTotal =
    subtotal +
    previewDeliveryFee +
    previewPacking +
    previewHandling +
    previewSurge +
    previewTax

  const updateQuantity = (
    itemId,
    next
  ) => {
    const requestedQuantity = Math.max(0, Math.floor(Number(next || 0)))

    if (requestedQuantity > 0 && !customerUser) {
      setMessage('Please login to add items to your cart.')
      const nextPath = `/delivery/${encodeURIComponent(restaurantCode)}`
      router.push(`/delivery/login?next=${encodeURIComponent(nextPath)}`)
      return
    }

    const item =
      menuItems.find(
        (row) =>
          String(row.id) ===
          String(itemId)
      )

    if (!item) {
      return
    }

    const stock =
      deliveryStockInfo(item)

    const requested = requestedQuantity

    const safe =
      Math.min(
        requested,
        stock.maxCartQuantity
      )

    if (
      stock.tracked &&
      requested >
        stock.maxCartQuantity
    ) {
      setMessage(
        stock.outOfStock
          ? `${item.name} is currently out of stock.`
          : `Only ${stock.available} unit${
              stock.available === 1
                ? ''
                : 's'
            } of ${item.name} ${
              stock.available === 1
                ? 'is'
                : 'are'
            } available right now.`
      )
    }

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


  const fillAddressFromLocation =
    async (latitude, longitude) => {
      const lat = Number(latitude)
      const lng = Number(longitude)

      if (
        !Number.isFinite(lat) ||
        !Number.isFinite(lng)
      ) {
        return false
      }

      setAddressLoading(true)

      try {
        const response = await fetch(
          `/api/location/reverse?lat=${encodeURIComponent(
            lat
          )}&lng=${encodeURIComponent(
            lng
          )}`,
          {
            method: 'GET',
            cache: 'no-store',
          }
        )

        const data = await response
          .json()
          .catch(() => ({}))

        if (!response.ok || !data?.success) {
          throw new Error(
            data?.message ||
              'Unable to identify this address.'
          )
        }

        const address = data.address || {}

        setCheckout((current) => ({
          ...current,
          addressLine1:
            address.addressLine1 ||
            current.addressLine1,
          addressLine2:
            address.addressLine2 ||
            current.addressLine2,
          landmark:
            address.landmark ||
            current.landmark,
          city:
            address.city ||
            current.city,
          state:
            address.state ||
            current.state,
          pincode: digits(
            address.pincode ||
              current.pincode,
            6
          ),
        }))

        return true
      } catch (addressError) {
        console.error(
          'Automatic address lookup error:',
          addressError
        )

        setLocationError(
          'Your location pin was found, but the written address could not be filled automatically. You can enter it manually.'
        )

        return false
      } finally {
        setAddressLoading(false)
      }
    }

  const chooseLiveLocation = () => {
    if (locationLoading || addressLoading) {
      return
    }

    if (
      typeof navigator === 'undefined' ||
      !navigator.geolocation
    ) {
      setLocationError(
        'Live location is not supported on this device/browser. Please allow location access or choose your location on the map.'
      )
      return
    }

    setLocationLoading(true)
    setLocationError('')

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        const latitude = Number(
          position.coords.latitude
        )

        const longitude = Number(
          position.coords.longitude
        )

        const accuracy = Number(
          position.coords.accuracy || 0
        )

        setCheckout((current) => ({
          ...current,
          latitude: latitude.toFixed(7),
          longitude: longitude.toFixed(7),
          locationAccuracy: accuracy
            ? accuracy.toFixed(2)
            : '',
        }))

        setLocationConfirmed(false)

        await fillAddressFromLocation(
          latitude,
          longitude
        )

        setLocationLoading(false)
      },
      (geoError) => {
        console.error(
          'Customer geolocation error:',
          geoError
        )

        setLocationLoading(false)

        setLocationError(
          geoError?.code === 1
            ? 'Location permission was denied. Allow location access and tap Use My Current Location again.'
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

    if (!customerUser) {
      setMessage('Please login before placing your Delivery order.')
      const nextPath = `/delivery/${encodeURIComponent(restaurantCode)}`
      router.push(`/delivery/login?next=${encodeURIComponent(nextPath)}`)
      return
    }

    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()

    if (sessionError || !session?.access_token) {
      setMessage('Your login session has expired. Please login again.')
      const nextPath = `/delivery/${encodeURIComponent(restaurantCode)}`
      router.push(`/delivery/login?next=${encodeURIComponent(nextPath)}`)
      return
    }

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

    const stockConflict =
      cartRows.find((item) => {
        const stock =
          deliveryStockInfo(item)

        return (
          stock.tracked &&
          (
            stock.outOfStock ||
            Number(
              item.quantity || 0
            ) > stock.available
          )
        )
      })

    if (stockConflict) {
      const stock =
        deliveryStockInfo(
          stockConflict
        )

      setMessage(
        stock.outOfStock
          ? `${stockConflict.name} is now out of stock. Your cart has been updated.`
          : `Only ${stock.available} unit${
              stock.available === 1
                ? ''
                : 's'
            } of ${stockConflict.name} ${
              stock.available === 1
                ? 'is'
                : 'are'
            } available now. Your cart has been updated.`
      )

      await loadStore(true)
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
            Authorization:
              `Bearer ${session.access_token}`,
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
      <main className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-[#f7f7f5] px-3 py-6 text-neutral-950 sm:px-4 sm:py-10">
        <div className="mx-auto w-full max-w-lg rounded-[28px] border border-neutral-200/80 bg-white p-8 text-center shadow-[0_20px_60px_rgba(0,0,0,0.06)]">
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
      <main className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-[#f7f7f5] px-3 py-6 text-neutral-950 sm:px-4 sm:py-10">
        <div className="mx-auto w-full max-w-lg rounded-[28px] border border-neutral-200/80 bg-white p-8 text-center shadow-[0_20px_60px_rgba(0,0,0,0.06)]">
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
    <main className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-[#f7f7f5] pb-[calc(12rem+env(safe-area-inset-bottom))] text-neutral-950">
      <header className="sticky top-0 z-30 border-b border-neutral-200/80 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto w-full max-w-5xl px-3 pb-3 sm:px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
          <div className="mb-2 flex items-center justify-between">
            <button
              type="button"
              onClick={() => router.push('/delivery')}
              className="flex items-center gap-2 rounded-xl px-1 py-1 text-xs font-black text-neutral-700 transition active:scale-[0.98]"
              aria-label="Back to Delivery home"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-xl border border-neutral-200 bg-white text-base shadow-sm">
                ←
              </span>
              <span>DIGITAL DINE</span>
            </button>

            <span className="text-[9px] font-black uppercase tracking-[0.16em] text-emerald-600">
              Delivery
            </span>
          </div>

          <div className="flex min-w-0 items-center gap-2 sm:gap-3">
            <div className="h-10 w-10 shrink-0 overflow-hidden rounded-2xl sm:h-12 sm:w-12 border border-neutral-200 bg-neutral-100 shadow-sm">
              {restaurant.logo_url ? (
                <img
                  src={restaurant.logo_url}
                  alt={settings.store_name || restaurant.name}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full items-center justify-center bg-neutral-950 text-xl text-white">
                  🍽️
                </div>
              )}
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-[15px] font-black tracking-tight text-neutral-950">
                  {settings.store_name || restaurant.name || 'Delivery'}
                </h1>
                <span
                  className={`h-2 w-2 shrink-0 rounded-full ${
                    settings.is_open ? 'bg-emerald-500' : 'bg-red-500'
                  }`}
                />
              </div>

              <p className="mt-0.5 truncate text-[10px] font-semibold text-neutral-500">
                {settings.is_open
                  ? `Open now · ${settings.estimated_delivery_minutes || 45} min delivery`
                  : 'Currently closed'}
              </p>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <InstallAppButton
                label="App"
                className="!h-10 !min-h-10 !rounded-xl !px-2.5 sm:!px-3"
              />


              <button
                type="button"
                onClick={openTracking}
                className="flex h-10 shrink-0 items-center gap-1.5 rounded-xl border border-neutral-200 bg-white px-2.5 sm:px-3 text-[10px] font-black text-neutral-800 shadow-sm transition active:scale-[0.98]"
                aria-label="Track order"
              >
                <span aria-hidden="true">⌖</span>

                <span className="hidden min-[390px]:inline">
                  Track
                </span>
              </button>

              <button
                type="button"
                onClick={() => setCheckoutOpen(true)}
                className="relative flex h-10 shrink-0 items-center gap-1.5 rounded-xl bg-neutral-950 px-2.5 sm:px-3.5 text-[10px] font-black text-white shadow-sm transition active:scale-[0.98]"
                aria-label="Open cart"
              >
                <span aria-hidden="true">🛒</span>

                <span className="hidden min-[390px]:inline">
                  Cart
                </span>

                {cartCount > 0 && (
                  <span className="absolute -right-2 -top-2 flex h-5 min-w-5 items-center justify-center rounded-full bg-emerald-500 px-1 text-[9px] font-black text-white ring-2 ring-white">
                    {cartCount}
                  </span>
                )}
              </button>
            </div>
          </div>

          <div className="relative mt-3">
            <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm text-neutral-400">
              ⌕
            </span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search food, drinks or categories"
              className="h-12 w-full rounded-2xl border border-neutral-200 bg-neutral-100 pl-10 pr-4 text-sm font-medium outline-none transition placeholder:text-neutral-400 focus:border-neutral-400 focus:bg-white focus:ring-4 focus:ring-neutral-100"
            />
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-4 sm:py-6">
        <section className="overflow-hidden rounded-[28px] border border-neutral-200/80 bg-white shadow-[0_18px_50px_rgba(0,0,0,0.06)]">
          <div className="relative">
            {settings.banner_url ? (
              <img
                src={settings.banner_url}
                alt="Delivery banner"
                className="h-40 w-full object-cover sm:h-56"
              />
            ) : (
              <div className="h-28 bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-700 sm:h-36" />
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />

            <div className="absolute bottom-4 left-4 right-4 flex items-end justify-between gap-3 text-white">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-white/75">
                  Delivery by Digital Dine
                </p>
                <h2 className="mt-1 truncate text-xl font-black tracking-tight sm:text-2xl">
                  {settings.store_name || restaurant.name || 'Delivery Store'}
                </h2>
              </div>

              <span
                className={`shrink-0 rounded-full px-3 py-1.5 text-[9px] font-black uppercase ${
                  settings.is_open
                    ? 'bg-white text-emerald-700'
                    : 'bg-red-500 text-white'
                }`}
              >
                {settings.is_open ? 'Open' : 'Closed'}
              </span>
            </div>
          </div>

          <div className="p-4 sm:p-5">
            {settings.description && (
              <p className="text-sm leading-6 text-neutral-600">
                {settings.description}
              </p>
            )}

            <div className={`${settings.description ? 'mt-4' : ''} grid grid-cols-2 gap-2 sm:grid-cols-4`}>
              <div className="rounded-2xl bg-neutral-50 px-3 py-3">
                <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                  Delivery time
                </p>
                <p className="mt-1 text-sm font-black text-neutral-950">
                  ~{settings.estimated_delivery_minutes || 45} min
                </p>
              </div>

              <div className="rounded-2xl bg-neutral-50 px-3 py-3">
                <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                  Delivery fee
                </p>
                <p className="mt-1 text-sm font-black text-neutral-950">
                  {previewDeliveryFee === 0
                    ? 'FREE'
                    : money(previewDeliveryFee)}
                </p>
                {minimumOrderAmount > 0 &&
                  subtotal > 0 &&
                  subtotal < minimumOrderAmount && (
                    <p className="mt-1 text-[9px] font-semibold text-neutral-400">
                      Free above {money(minimumOrderAmount)}
                    </p>
                  )}
              </div>

              <div className="rounded-2xl bg-neutral-50 px-3 py-3">
                <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                  Free delivery from
                </p>
                <p className="mt-1 text-sm font-black text-neutral-950">
                  {minimumOrderAmount > 0
                    ? money(minimumOrderAmount)
                    : settings.free_delivery_above != null &&
                        Number(settings.free_delivery_above) > 0
                      ? money(settings.free_delivery_above)
                      : Number(settings.delivery_fee || 0) === 0
                        ? 'Always FREE'
                        : 'Standard fee'}
                </p>
              </div>

              <div className="rounded-2xl bg-neutral-50 px-3 py-3">
                <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                  Service area
                </p>
                <p className="mt-1 text-sm font-black text-neutral-950">
                  {coverageEnabled && coverageRadiusKm > 0
                    ? `${coverageRadiusKm.toFixed(1)} km`
                    : 'Local delivery'}
                </p>
              </div>
            </div>

            {(settings.address || settings.city) && (
              <p className="mt-3 flex items-start gap-2 text-[11px] leading-5 text-neutral-500">
                <span className="mt-0.5">⌖</span>
                <span>
                  {[settings.address, settings.city, settings.state]
                    .filter(Boolean)
                    .join(', ')}
                </span>
              </p>
            )}
          </div>
        </section>

        {offers.length > 0 && (
          <section className="mt-7">
            <div className="mb-3 flex items-end justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-500">
                  Offers for you
                </p>
                <h2 className="mt-1 text-lg font-black tracking-tight text-neutral-950">
                  Save on your order
                </h2>
              </div>
              <span className="text-[10px] font-bold text-neutral-400">
                Swipe
              </span>
            </div>

            <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {offers.map((offer) => (
                <article
                  key={offer.id}
                  className="relative min-w-[285px] snap-start overflow-hidden rounded-[24px] border border-orange-100 bg-gradient-to-br from-orange-50 via-white to-amber-50 p-4 shadow-sm"
                >
                  <div className="absolute -right-7 -top-7 h-24 w-24 rounded-full bg-orange-200/30" />

                  <div className="relative flex items-start gap-3">
                    {offer.image_url && (
                      <img
                        src={offer.image_url}
                        alt={offer.title || 'Offer'}
                        className="h-16 w-16 shrink-0 rounded-2xl object-cover"
                      />
                    )}

                    <div className="min-w-0 flex-1">
                      <p className="text-[9px] font-black uppercase tracking-wider text-orange-600">
                        {offer.discount_text || 'Special offer'}
                      </p>
                      <h3 className="mt-1 line-clamp-1 text-sm font-black text-neutral-950">
                        {offer.title}
                      </h3>
                      {offer.description && (
                        <p className="mt-1 line-clamp-2 text-[11px] leading-5 text-neutral-500">
                          {offer.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="relative mt-4 flex items-center justify-between">
                    <p className="text-base font-black text-orange-700">
                      {money(offer.offer_price)}
                    </p>
                    <span className="rounded-full border border-orange-200 bg-white px-3 py-1.5 text-[9px] font-black uppercase text-orange-700">
                      Limited deal
                    </span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="mt-7">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-neutral-400">
                Browse menu
              </p>
              <h2 className="mt-1 text-lg font-black tracking-tight text-neutral-950">
                What would you like?
              </h2>
            </div>
            <span className="text-[10px] font-bold text-neutral-400">
              {filteredItems.length} items
            </span>
          </div>

          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                  className={`whitespace-nowrap rounded-full border px-4 py-2.5 text-[11px] font-black transition active:scale-[0.98] ${
                    category === itemCategory
                      ? 'border-neutral-950 bg-neutral-950 text-white shadow-sm'
                      : 'border-neutral-200 bg-white text-neutral-600'
                  }`}
                >
                  {itemCategory}
                </button>
              )
            )}
          </div>
        </section>

        <section className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
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

              const stock =
                deliveryStockInfo(item)

              const packagedProduct =
                String(
                  item.item_type ||
                    'food'
                ) ===
                'packaged_product'

              const reviewInfo =
                productReviews[
                  String(item.id)
                ] || null

              const averageRating =
                Number(
                  reviewInfo?.average_rating ||
                    0
                )

              const reviewCount =
                Number(
                  reviewInfo?.review_count ||
                    0
                )

              const recentReview =
                Array.isArray(
                  reviewInfo?.recent_reviews
                )
                  ? reviewInfo.recent_reviews[0]
                  : null

              return (
                <article
                  key={item.id}
                  className="group flex min-h-[138px] overflow-hidden rounded-[24px] border border-neutral-200/80 bg-white shadow-[0_8px_30px_rgba(0,0,0,0.04)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_34px_rgba(0,0,0,0.07)] sm:block sm:min-h-0"
                >
                  <div className="h-[132px] w-[108px] shrink-0 bg-neutral-100 min-[380px]:w-[128px] sm:aspect-[16/10] sm:h-auto sm:w-full">
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
                        {packagedProduct
                          ? '📦'
                          : '🍽️'}
                      </div>
                    )}
                  </div>

                  <div className="flex min-w-0 flex-1 flex-col p-4">
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

                    {reviewCount > 0 && (
                      <div className="mt-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="rounded-full bg-amber-50 px-2 py-1 text-[9px] font-black text-amber-700">
                            ★ {averageRating.toFixed(1)}
                          </span>

                          <span className="text-[9px] font-bold text-neutral-400">
                            {reviewCount}{' '}
                            verified{' '}
                            {reviewCount === 1
                              ? 'review'
                              : 'reviews'}
                          </span>
                        </div>

                        {recentReview?.review && (
                          <div className="mt-2 rounded-xl bg-neutral-50 px-3 py-2">
                            <p className="line-clamp-2 text-[10px] leading-4 text-neutral-600">
                              “{recentReview.review}”
                            </p>

                            <p className="mt-1 text-[8px] font-black text-neutral-400">
                              {recentReview.customer_name ||
                                'Verified customer'}{' '}
                              ·{' '}
                              {Number(
                                recentReview.rating ||
                                  0
                              )}{' '}
                              ★
                            </p>
                          </div>
                        )}
                      </div>
                    )}

                    {stock.tracked && (
                      <div
                        className={`mt-2 inline-flex w-fit items-center rounded-full px-2.5 py-1 text-[9px] font-black ${
                          stock.outOfStock
                            ? 'bg-red-50 text-red-600'
                            : stock.lowStock
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-emerald-50 text-emerald-700'
                        }`}
                      >
                        {stock.outOfStock
                          ? 'OUT OF STOCK'
                          : stock.lowStock
                            ? `ONLY ${stock.available} LEFT`
                            : `${stock.available} IN STOCK`}
                      </div>
                    )}

                    <div className="mt-4">
                      {quantity <= 0 ? (
                        <button
                          type="button"
                          disabled={
                            !settings.is_open ||
                            stock.outOfStock
                          }
                          onClick={() =>
                            updateQuantity(
                              item.id,
                              1
                            )
                          }
                          className="w-full rounded-xl border border-emerald-600 bg-white py-2.5 text-xs font-black text-emerald-700 shadow-sm transition hover:bg-emerald-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-40"
                        >
                          {stock.outOfStock
                            ? 'OUT OF STOCK'
                            : 'ADD'}
                        </button>
                      ) : (
                        <div className="grid grid-cols-3 overflow-hidden rounded-xl border border-emerald-600 bg-white shadow-sm">
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
                            disabled={
                              stock.tracked &&
                              quantity >=
                                stock.maxCartQuantity
                            }
                            onClick={() =>
                              updateQuantity(
                                item.id,
                                quantity +
                                  1
                              )
                            }
                            className="py-2.5 text-lg font-black text-emerald-700 disabled:cursor-not-allowed disabled:bg-neutral-50 disabled:text-neutral-300"
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
            <div className="col-span-full rounded-[28px] border border-dashed border-neutral-300 bg-white px-6 py-16 text-center shadow-sm">
              <div className="text-4xl">🍽️</div>
              <p className="mt-3 text-sm font-black text-neutral-800">
                Nothing matched your search
              </p>
              <p className="mt-1 text-xs text-neutral-500">
                Try another dish or category.
              </p>
            </div>
          )}
        </section>
      </div>

      {cartCount > 0 && (
        <div className="fixed inset-x-0 bottom-[68px] z-40 px-2 sm:px-3">
          <div className="mx-auto flex max-w-2xl items-center gap-3 rounded-[22px] border border-neutral-800 bg-neutral-950 p-2.5 pl-4 text-white shadow-[0_18px_55px_rgba(0,0,0,0.28)]">
            <div className="min-w-0 flex-1">
              <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                {cartCount} {cartCount === 1 ? 'item' : 'items'} in cart
              </p>
              <p className="mt-0.5 truncate text-base font-black">
                {money(previewTotal)}
                <span className="ml-1 text-[9px] font-medium text-neutral-400">
                  estimated
                </span>
              </p>
            </div>

            <button
              type="button"
              onClick={() => setCheckoutOpen(true)}
              className="flex h-12 shrink-0 items-center gap-2 rounded-2xl bg-emerald-500 px-5 text-xs font-black text-white shadow-sm transition active:scale-[0.98]"
            >
              View cart
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      )}


      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-neutral-200 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto grid max-w-md grid-cols-4 px-3 pb-[max(0.65rem,env(safe-area-inset-bottom))] pt-2">
          <button
            type="button"
            onClick={() => router.push('/delivery')}
            className="flex flex-col items-center gap-1 py-1 text-neutral-500 transition active:scale-[0.98]"
          >
            <span className="text-xl" aria-hidden="true">🏠</span>
            <span className="text-[10px] font-black">Home</span>
          </button>

          <button
            type="button"
            onClick={() => {
              window.scrollTo({ top: 0, behavior: 'smooth' })
              window.setTimeout(() => {
                document.querySelector('input[placeholder="Search food, drinks or categories"]')?.focus()
              }, 250)
            }}
            className="flex flex-col items-center gap-1 py-1 text-emerald-700 transition active:scale-[0.98]"
          >
            <span className="text-xl" aria-hidden="true">🔎</span>
            <span className="text-[10px] font-black">Search</span>
          </button>

          <button
            type="button"
            onClick={openTracking}
            className="flex flex-col items-center gap-1 py-1 text-neutral-500 transition active:scale-[0.98]"
          >
            <span className="text-xl" aria-hidden="true">📦</span>
            <span className="text-[10px] font-black">Orders</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new Event('digitaldine:open-help-centre'))
              }
            }}
            className="flex flex-col items-center gap-1 py-1 text-violet-600 transition active:scale-[0.98]"
            aria-label="Open Help Centre"
          >
            <span className="text-xl" aria-hidden="true">❓</span>
            <span className="text-[10px] font-black">Help</span>
          </button>
        </div>
      </nav>

      <DeliveryCustomerSupportChat
        restaurantCode={restaurantCode}
        onReviewSubmitted={
          loadProductReviews
        }
        hideLauncher
      />


      {trackingOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
          <div className="max-h-[92dvh] w-full min-w-0 max-w-md overflow-y-auto rounded-t-[30px] border border-neutral-200 bg-white p-5 shadow-2xl sm:rounded-[30px]">
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

            <div className="mt-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-[10px] font-semibold leading-5 text-violet-700">
              Need help with this order? Close tracking and open Help Centre to raise a request or chat with the store Manager.
            </div>


            <p className="mt-4 text-[10px] leading-5 text-neutral-500">
              Order progress refreshes every 1 minute on the tracking page.
            </p>
          </div>
        </div>
      )}

      {checkoutOpen && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/55 backdrop-blur-[2px] sm:items-center sm:justify-center sm:p-5">
          <div className="max-h-[94dvh] w-full min-w-0 overflow-y-auto rounded-t-[30px] border border-neutral-200 bg-white p-5 shadow-2xl sm:max-w-2xl sm:rounded-[30px]">
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
                (item) => {
                  const stock =
                    deliveryStockInfo(
                      item
                    )

                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-3 rounded-2xl border border-neutral-200 p-3"
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-black">
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

                        {stock.tracked && (
                          <p
                            className={`mt-1 text-[9px] font-black ${
                              stock.outOfStock
                                ? 'text-red-600'
                                : stock.lowStock
                                  ? 'text-amber-700'
                                  : 'text-emerald-700'
                            }`}
                          >
                            {stock.outOfStock
                              ? 'Out of stock'
                              : `${stock.available} available`}
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 items-center gap-3">
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
                          disabled={
                            stock.tracked &&
                            item.quantity >=
                              stock.maxCartQuantity
                          }
                          onClick={() =>
                            updateQuantity(
                              item.id,
                              item.quantity +
                                1
                            )
                          }
                          className="h-8 w-8 rounded-lg bg-neutral-900 font-black text-white disabled:cursor-not-allowed disabled:bg-neutral-200 disabled:text-neutral-400"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  )
                }
              )}
            </div>

            <div className="mt-5 rounded-[22px] border border-neutral-200 bg-neutral-50 p-4 text-xs">
              <BillRow
                label="Item Subtotal"
                value={money(subtotal)}
              />

              <BillRow
                label="Delivery Fee"
                value={previewDeliveryFee === 0 ? 'FREE' : money(previewDeliveryFee)}
              />

              <BillRow
                label="Handling Charge"
                value={money(previewHandling)}
              />

              <BillRow
                label="Packing Charge"
                value={money(previewPacking)}
              />

              {previewSurge > 0 && (
                <BillRow
                  label="High Demand Charge"
                  value={money(previewSurge)}
                />
              )}

              {settings.tax_enabled && (
                <>
                  <BillRow
                    label={`SGST (${Number(settings.sgst_rate || 0)}%)`}
                    value={money(previewSgst)}
                  />
                  <BillRow
                    label={`CGST (${Number(settings.cgst_rate || 0)}%)`}
                    value={money(previewCgst)}
                  />
                </>
              )}

              <div className="mt-3 flex items-center justify-between border-t border-neutral-200 pt-3 text-sm font-black">
                <span>Estimated Total</span>
                <span>{money(previewTotal)}</span>
              </div>

              {minimumOrderAmount > 0 &&
                subtotal > 0 &&
                subtotal < minimumOrderAmount && (
                  <div className="mt-3 rounded-xl bg-amber-50 px-3 py-2 text-[10px] font-semibold leading-4 text-amber-700">
                    Add {money(Math.max(0, minimumOrderAmount - subtotal))} more for free delivery.
                  </div>
                )}

              {Boolean(surge.active) && previewSurge > 0 && (
                <div className="mt-2 rounded-xl bg-orange-50 px-3 py-2 text-[10px] font-semibold leading-4 text-orange-700">
                  High demand is active right now. The current demand charge is {money(previewSurge)}.
                </div>
              )}

              <p className="mt-3 text-[10px] leading-4 text-neutral-400">
                Item prices, delivery fee, handling, packing, demand charges and taxes are recalculated securely when the order is placed.
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
                        Use your current GPS location or tap/drag the pin on the map to the exact delivery point. We will try to fill the written address automatically, and you can edit it before ordering.
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
                          disabled={
                            outsideDeliveryRadius ||
                            addressLoading
                          }
                          onClick={async () => {
                            if (
                              outsideDeliveryRadius ||
                              addressLoading
                            ) {
                              return
                            }

                            const addressFilled =
                              await fillAddressFromLocation(
                                checkout.latitude,
                                checkout.longitude
                              )

                            setLocationConfirmed(true)

                            if (addressFilled) {
                              setLocationError('')
                            }
                          }}
                          className="shrink-0 rounded-xl bg-neutral-950 px-4 py-3 text-xs font-black text-white disabled:cursor-not-allowed disabled:bg-neutral-300"
                        >
                          {addressLoading
                            ? 'Finding Address...'
                            : 'Confirm Delivery Pin'}
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
                        2. Confirm Your Delivery Address
                      </p>
                      <p className="mt-1 text-[10px] leading-4 text-neutral-400">
                        We filled what we could from your selected location. Check the house, street, locality and landmark details and edit anything that needs correction.
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
                  className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-3 text-sm font-medium outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-50"
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
                className="w-full rounded-2xl bg-neutral-950 px-5 py-4 text-sm font-black text-white shadow-sm transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
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
    
      {/* Persistent Delivery customer app navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-[55] border-t border-neutral-200 bg-white/95 backdrop-blur-xl">
        <div className="mx-auto grid max-w-md grid-cols-4 px-3 pb-[max(0.6rem,env(safe-area-inset-bottom))] pt-2">
          <button
            type="button"
            onClick={() => router.push('/delivery')}
            className="flex flex-col items-center gap-1 py-1 text-neutral-400"
          >
            <span className="text-xl">🏠</span>
            <span className="text-[10px] font-black">Home</span>
          </button>

          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            className="flex flex-col items-center gap-1 py-1 text-emerald-700"
          >
            <span className="text-xl">🏪</span>
            <span className="text-[10px] font-black">Store</span>
          </button>

          <button
            type="button"
            onClick={openCustomerOrders}
            className="flex flex-col items-center gap-1 py-1 text-neutral-400"
          >
            <span className="text-xl">📦</span>
            <span className="text-[10px] font-black">Orders</span>
          </button>

          <button
            type="button"
            onClick={openCustomerAccount}
            className="flex flex-col items-center gap-1 py-1 text-neutral-400"
          >
            <span className="text-xl">{customerUser ? '👤' : '🔐'}</span>
            <span className="text-[10px] font-black">
              {customerUser ? 'Account' : 'Sign In'}
            </span>
          </button>
        </div>
      </nav>

      {accountOpen && customerUser ? (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center sm:p-4">
          <button
            type="button"
            aria-label="Close account"
            onClick={() => setAccountOpen(false)}
            className="absolute inset-0"
          />

          <section className="relative z-10 w-full max-w-md rounded-t-[30px] bg-white p-5 shadow-2xl sm:rounded-[30px]">
            <div className="mx-auto mb-4 h-1.5 w-12 rounded-full bg-neutral-200 sm:hidden" />

            <div className="flex items-center gap-4">
              <div className="flex h-16 w-16 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-emerald-50 text-2xl">
                {customerProfile?.avatar_url ? (
                  <img
                    src={customerProfile.avatar_url}
                    alt=""
                    className="h-full w-full object-cover"
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  '👤'
                )}
              </div>

              <div className="min-w-0 flex-1">
                <p className="text-[9px] font-black uppercase tracking-[0.16em] text-emerald-600">
                  Delivery Account
                </p>
                <h2 className="mt-1 truncate text-xl font-black">
                  {customerProfile?.full_name ||
                    customerUser?.user_metadata?.full_name ||
                    customerUser?.email?.split('@')?.[0] ||
                    'Customer'}
                </h2>
                <p className="mt-1 truncate text-xs font-semibold text-neutral-500">
                  {customerProfile?.email || customerUser?.email || ''}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setAccountOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-neutral-100 text-xs font-black text-neutral-600"
              >
                ✕
              </button>
            </div>

            <button
              type="button"
              onClick={() => {
                setAccountOpen(false)
                openTracking()
              }}
              className="mt-5 flex w-full items-center justify-between rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-left"
            >
              <span>
                <span className="block text-sm font-black">My Orders</span>
                <span className="mt-1 block text-[10px] font-semibold text-neutral-500">
                  View and track your Delivery orders
                </span>
              </span>
              <span className="text-lg">📦</span>
            </button>

            <button
              type="button"
              onClick={signOutDeliveryCustomer}
              disabled={customerAuthLoading}
              className="mt-3 w-full rounded-2xl border border-red-200 bg-red-50 px-4 py-3.5 text-sm font-black text-red-700 disabled:opacity-50"
            >
              {customerAuthLoading ? 'Signing Out...' : 'Sign Out'}
            </button>
          </section>
        </div>
      ) : null}

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
        className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 py-3 text-sm font-medium outline-none transition focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-50"
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
