'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useMobileViewportLock } from '@/lib/useMobileViewportLock'
import DeliverySavedAddressPicker from '@/app/components/DeliverySavedAddressPicker'
import DeliveryCustomerSupportChat from '@/app/components/DeliveryCustomerSupportChat'
import { useLiveDeliveryRefresh } from '@/lib/useLiveDeliveryRefresh'
import '@/app/components/delivery-green-market.css'

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

export default function DeliveryStoreExperience({
  restaurantCode: selectedStoreCode,
  onBackToStores,
  initialView = '',
}) {
  const router = useRouter()
  useMobileViewportLock()

  // Same component is mounted inline on /delivery and at the legacy
  // /delivery/[restaurantcode] deep link. Never duplicate checkout logic.
  const restaurantCode = String(selectedStoreCode || '').trim()

  useEffect(() => {
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(restaurantCode)) return
    try { localStorage.setItem('digitaldine_delivery_last_store_code', restaurantCode) } catch { /* optional browser storage */ }
  }, [restaurantCode])
  const [loading, setLoading] =
    useState(true)
  const [storeData, setStoreData] =
    useState(null)
  // ERP platform fee quote. Only the server sets the actual fee.
  const [platformFeeQuote, setPlatformFeeQuote] = useState({
    loaded: false,
    customerAmount: 0,
  })
  const [error, setError] =
    useState('')

  const [search, setSearch] =
    useState('')
  const [category, setCategory] =
    useState('All')
  const [sortMode, setSortMode] = useState('default')
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
  const [trackingAccountUnauthorized, setTrackingAccountUnauthorized] = useState(false)
  const [otherStoreOrderCount, setOtherStoreOrderCount] = useState(0)
  const [trackingAccountEmail, setTrackingAccountEmail] = useState('')
  const [trackingAccountType, setTrackingAccountType] = useState('')
  const [locationLoading, setLocationLoading] =
    useState(false)
  const [addressLoading, setAddressLoading] =
    useState(false)
  const [locationError, setLocationError] =
    useState('')
  const [locationConfirmed, setLocationConfirmed] =
    useState(false)
  const [selectedSavedAddressId, setSelectedSavedAddressId] = useState('')
  const addressValidationRef = useRef(0)

  // Carry the verified location chosen on /delivery to checkout.
  // Saved address fields are applied only for the SAME currently signed-in
  // Supabase user. A location is NEVER accepted as proof of store coverage;
  // the existing server order validation remains authoritative.
  useEffect(() => {
    let active = true
    const restore = async () => {
      try {
        const raw = sessionStorage.getItem('digitaldine_delivery_selected_location_v1')
        if (!raw) return
        const selected = JSON.parse(raw)
        const latitude = Number(selected?.latitude)
        const longitude = Number(selected?.longitude)
        const selectedAt = Number(selected?.selectedAt)
        if (!Number.isFinite(selectedAt) || Date.now() - selectedAt > 2 * 60 * 60 * 1000 ||
            !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
            !Number.isFinite(longitude) || longitude < -180 || longitude > 180) return
        const saved = selected.source === 'saved'
        if (saved) {
          // The selected saved address may belong to another Google session.
          // A verified mobile account must never inherit that account's address.
          const sessionCheck = await fetch(
            `/api/delivery/customer/session?restaurantCode=${encodeURIComponent(restaurantCode)}`,
            { credentials: 'same-origin', cache: 'no-store' }
          ).catch(() => null)
          if (!sessionCheck || sessionCheck.status !== 401) return
          const { data, error } = await supabase.auth.getUser()
          if (error || !data?.user?.id || data.user.id !== selected.ownerUserId) return
          // Re-read the address from the protected table. Do not trust
          // editable browser storage as a source for account address fields.
          const { data: address, error: addrError } = await supabase
            .from('delivery_customer_saved_addresses')
            .select('id,address_line1,address_line2,landmark,city,state,pincode,recipient_name,recipient_mobile,latitude,longitude,gps_accuracy_m')
            .eq('id', String(selected.savedAddressId || ''))
            .eq('user_id', data.user.id)
            .maybeSingle()
          if (!active || addrError || !address) return
          // Ensure this saved pin is the same as the selected location.
          if (Math.abs(Number(address.latitude) - latitude) > 0.0000002 ||
              Math.abs(Number(address.longitude) - longitude) > 0.0000002) return
          setCheckout((current) => current.latitude && current.longitude ? current : ({
            ...current,
            latitude: latitude.toFixed(7), longitude: longitude.toFixed(7),
            locationAccuracy: address.gps_accuracy_m != null ? String(address.gps_accuracy_m) : '',
            addressLine1: address.address_line1 || '', addressLine2: address.address_line2 || '',
            landmark: address.landmark || '', city: address.city || '', state: address.state || '',
            pincode: address.pincode || '',
            customerName: current.customerName || address.recipient_name || '',
            customerMobile: current.customerMobile || address.recipient_mobile || '',
          }))
          setLocationConfirmed(true)
          return
        }
        if (!active) return
        setCheckout((current) => current.latitude && current.longitude ? current : ({
          ...current,
          latitude: latitude.toFixed(7), longitude: longitude.toFixed(7),
          locationAccuracy: selected.source === 'gps' && Number(selected.accuracy) > 0
            ? String(Number(selected.accuracy).toFixed(2)) : '',
        }))
        setLocationConfirmed(false)
        // A GPS/map destination was selected on /delivery. Resolve its
        // written address and validate coverage automatically so checkout can
        // display a confirmed address rather than another map/pin form.
        // If reverse-geocoding is incomplete, the customer chooses/edits an
        // address in their saved-address book instead of placing a blind order.
        try {
          const response = await fetch(
            `/api/location/reverse?lat=${encodeURIComponent(latitude)}&lng=${encodeURIComponent(longitude)}`,
            { method: 'GET', cache: 'no-store' }
          )
          const payload = await response.json().catch(() => ({}))
          if (!active || !response.ok || payload?.success !== true) return
          const address = payload.address || {}
          const point = {
            latitude, longitude, accuracy: selected.source === 'gps' ? selected.accuracy : null,
            addressLine1: String(address.addressLine1 || '').trim(),
            addressLine2: String(address.addressLine2 || '').trim(),
            landmark: String(address.landmark || '').trim(),
            city: String(address.city || '').trim(),
            state: String(address.state || '').trim(),
            pincode: digits(address.pincode, 6),
          }
          if (point.addressLine1 && point.city && point.state && point.pincode.length === 6) {
            await selectSavedAddressAtCheckout(point)
          }
        } catch {
          // The address picker remains available. Never invent address data.
        }
      } catch {
        // Optional browser storage can be unavailable. Checkout still works.
      }
    }
    void restore()
    return () => { active = false }
  }, [restaurantCode])

  const [afterSalesOpen, setAfterSalesOpen] =
    useState(false)
  const [afterSalesTab, setAfterSalesTab] =
    useState('request')
  const [afterSalesOrderCode, setAfterSalesOrderCode] =
    useState('')
  const [afterSalesMobile, setAfterSalesMobile] =
    useState('')
  const [afterSalesOrder, setAfterSalesOrder] =
    useState(null)
  const [afterSalesLoading, setAfterSalesLoading] =
    useState(false)
  const [afterSalesSubmitting, setAfterSalesSubmitting] =
    useState(false)
  const [afterSalesError, setAfterSalesError] =
    useState('')
  const [afterSalesMessage, setAfterSalesMessage] =
    useState('')
  const [afterSalesType, setAfterSalesType] =
    useState('return')
  const [afterSalesReason, setAfterSalesReason] =
    useState('')
  const [afterSalesQuantities, setAfterSalesQuantities] =
    useState({})
  const [afterSalesCreated, setAfterSalesCreated] =
    useState(null)
  const [afterSalesCaseCode, setAfterSalesCaseCode] =
    useState('')
  const [afterSalesCase, setAfterSalesCase] =
    useState(null)
  const [afterSalesCaseLoading, setAfterSalesCaseLoading] =
    useState(false)

  const [productReviews, setProductReviews] =
    useState({})
  // Delivery customer app session.
  // This keeps Home / Orders / Account available while the customer is inside a store.
  const [customerUser, setCustomerUser] = useState(null)
  const [customerProfile, setCustomerProfile] = useState(null)
  const [customerAuthLoading, setCustomerAuthLoading] = useState(true)
  const [mobileCustomer, setMobileCustomer] = useState(null)
  const [mobileAuthLoading, setMobileAuthLoading] = useState(true)
  // A verified Mobile/PIN session is active for THIS store even if a separate
  // Google session was previously cached in this browser. Never mix identities.
  const activeAccountType = mobileCustomer ? 'mobile' : customerUser ? 'google' : ''
  const activeIdentityKey = activeAccountType === 'mobile'
    ? `mobile:${mobileCustomer?.id || ''}:${restaurantCode}`
    : activeAccountType === 'google'
      ? `google:${customerUser?.id || ''}`
      : 'guest'
  const activeIdentityRef = useRef(activeIdentityKey)
  useEffect(() => {
    // A logout, Google switch, or Mobile/PIN login invalidates all old orders.
    activeIdentityRef.current = activeIdentityKey
    setTrackingOrders([])
    setTrackingAccountEmail('')
    setTrackingOpen(false)
    setAfterSalesOrder(null)
    setAfterSalesOpen(false)
    addressValidationRef.current += 1
    setLocationConfirmed(false)
    setSelectedSavedAddressId('')
  }, [activeIdentityKey])
  const isCustomerSignedIn = Boolean(activeAccountType)
  const isCustomerSessionLoading = customerAuthLoading || mobileAuthLoading
  const [accountOpen, setAccountOpen] = useState(false)
  const [returnsByStore, setReturnsByStore] = useState({})
  const [returnsEnabled, setReturnsEnabled] = useState(false)
  const [returnsPolicyLoaded, setReturnsPolicyLoaded] = useState(false)
  // Store policy is public, but the API and database trigger also enforce it.
  useEffect(() => {
    let active = true
    setReturnsEnabled(false)
    setReturnsPolicyLoaded(false)
    if (!restaurantCode) return
    const load = async () => {
      try {
        const { data, error: policyError } = await supabase.rpc(
          'get_public_delivery_customer_returns',
          { p_restaurant_code: restaurantCode }
        )
        if (policyError) throw policyError
        if (active) setReturnsEnabled(data?.success === true && data.returnsEnabled === true)
      } catch (policyError) {
        console.warn('Delivery return policy unavailable:', policyError?.message)
        if (active) setReturnsEnabled(false)
      } finally {
        if (active) setReturnsPolicyLoaded(true)
      }
    }
    void load()
    return () => { active = false }
  }, [restaurantCode])
  // A mobile/PIN login uses a server-verified HttpOnly cookie, NOT Supabase Auth.
  // Never infer a logged-in account from browser storage or a typed mobile.
  useEffect(() => {
    let active = true
    const loadMobileSession = async () => {
      setMobileAuthLoading(true)
      setMobileCustomer(null)
      try {
        const response = await fetch(
          `/api/delivery/customer/session?restaurantCode=${encodeURIComponent(restaurantCode)}`,
          { credentials: 'same-origin', cache: 'no-store' }
        )
        const result = await response.json().catch(() => ({}))
        if (!active) return
        if (response.ok && result?.success === true && result?.accountType === 'mobile') {
          setMobileCustomer(result.customer)
          setCheckout((current) => ({
            ...current,
            // Do not carry a previous Google customer's identity into PIN checkout.
            customerName: result.customer?.name || '',
            customerMobile: result.customer?.mobile || '',
            customerEmail: '',
          }))
        }
      } catch (error) {
        if (active) console.warn('Delivery mobile session check:', error?.message)
      } finally {
        if (active) setMobileAuthLoading(false)
      }
    }
    if (restaurantCode) void loadMobileSession()
    else setMobileAuthLoading(false)
    return () => { active = false }
  }, [restaurantCode])
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
    if (isCustomerSessionLoading) return
    if (!isCustomerSignedIn) {
      const next = `/delivery/${encodeURIComponent(restaurantCode)}`
      router.push(`/delivery/login?next=${encodeURIComponent(next)}`)
      return
    }
    setAccountOpen(true)
  }
  const signOutDeliveryCustomer = async () => {
    try {
      setCustomerAuthLoading(true)
      if (mobileCustomer) {
        const response = await fetch('/api/delivery/customer/session', {
          method: 'DELETE', credentials: 'same-origin', cache: 'no-store',
        })
        if (!response.ok) throw new Error('Unable to end your mobile login session.')
      }
      if (customerUser) {
        const { error: signOutError } = await supabase.auth.signOut()
        if (signOutError) throw signOutError
      }
      setAccountOpen(false)
      setCustomerUser(null)
      setMobileCustomer(null)
      setCustomerProfile(null)
    } catch (signOutError) {
      console.error('Delivery customer sign out error:', signOutError)
      setMessage(signOutError?.message || 'Unable to sign out. Please try again.')
    } finally {
      setCustomerAuthLoading(false)
    }
  }
  const openCustomerOrders = () => {
    // Google or mobile/PIN sessions are verified on the server.
    // Do not require the customer to type a delivery phone number again.
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

      // Query the SERVER-calculated public fee, never a value set by the owner
      // or submitted by the browser. Initial load only; validate again at pay.
      if (!quiet) {
        try {
          const { data: feeData, error: feeError } = await supabase.rpc(
            'get_public_delivery_platform_fee_quote',
            { p_restaurant_code: restaurantCode }
          )
          if (feeError) throw feeError
          if (!feeData?.success) {
            throw new Error(feeData?.message || 'Fee quote unavailable')
          }
          const amount = Number(feeData.customerAmount || 0)
          if (!Number.isFinite(amount) || amount < 0 || amount > 1000) {
            throw new Error('Invalid checkout fee quote')
          }
          setPlatformFeeQuote({ loaded: true, customerAmount: amount })
        } catch (feeLoadError) {
          console.error('Delivery platform fee quote error:', feeLoadError)
          // Block CHECKOUT, not product browsing, until quote is available.
          setPlatformFeeQuote({ loaded: false, customerAmount: 0 })
        }
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

  const displayItems = useMemo(() => {
    if (sortMode === 'default') return filteredItems
    const copy = [...filteredItems]
    if (sortMode === 'low') return copy.sort((a,b)=>Number(a.price || 0)-Number(b.price || 0))
    if (sortMode === 'high') return copy.sort((a,b)=>Number(b.price || 0)-Number(a.price || 0))
    return copy.sort((a,b)=>String(a.name || '').localeCompare(String(b.name || '')))
  }, [filteredItems,sortMode])

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

  // Use the server-calculated ERP quote in both the displayed total
  // and the fee snapshot submitted for secure order creation.
  const previewPlatformFee = Math.max(
    0,
    Number(platformFeeQuote.customerAmount || 0)
  )

  const previewTotal =
    subtotal +
    previewDeliveryFee +
    previewPacking +
    previewHandling +
    previewSurge +
    previewTax +
    previewPlatformFee

  const updateQuantity = (
    itemId,
    next
  ) => {
    const requestedQuantity = Math.max(0, Math.floor(Number(next || 0)))
    if (requestedQuantity > 0 && isCustomerSessionLoading) {
      setMessage('Checking your delivery login. Please try again in a moment.')
      return
    }
    if (requestedQuantity > 0 && !isCustomerSignedIn) {
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
    if (isCustomerSessionLoading) {
      setMessage('Checking your delivery account. Please try again in a moment.')
      return
    }
    if (!isCustomerSignedIn) {
      router.push(`/delivery/login?next=${encodeURIComponent(`/delivery/${restaurantCode}`)}`)
      return
    }
    setTrackingError('')
    setTrackingOrders([])
    setTrackingAccountUnauthorized(false)
    setOtherStoreOrderCount(0)
    setTrackingAccountEmail('')
    setTrackingAccountType('')
    setTrackingOpen(true)
    void loadAccountOrders()
  }
  const loadAccountOrders = async () => {
    const mode = activeAccountType
    const identityAtRequest = activeIdentityKey
    if (!mode) {
      setTrackingOrders([])
      setTrackingError('Sign in to your delivery account to view orders.')
      setTrackingAccountEmail('')
      return
    }
    setTrackingOrders([]) // Never display another account's cached order history.
    setTrackingAccountEmail('')
    setTrackingLoading(true)
    setTrackingError('')
    setTrackingAccountUnauthorized(false)
    try {
      const headers = {}
      if (mode === 'google') {
        const { data: sessionData } = await supabase.auth.getSession()
        if (!sessionData?.session?.access_token) throw new Error('Google session expired. Sign in again.')
        headers.Authorization = `Bearer ${sessionData.session.access_token}`
      }
      const response = await fetch(
        `/api/delivery/customer/my-orders?restaurantCode=${encodeURIComponent(restaurantCode)}&accountType=${mode}&allStores=${mode === 'google' ? '1' : '0'}`,
        { headers, credentials: 'same-origin', cache: 'no-store' }
      )
      const result = await response.json().catch(() => ({}))
      if (identityAtRequest !== activeIdentityRef.current) return
      if (response.status === 401) {
        setTrackingAccountUnauthorized(true)
        throw new Error('Sign in to your delivery account to view your orders.')
      }
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Unable to load your orders.')
      }
      if (result.accountType !== mode) {
        throw new Error('The orders API returned a different login. Refresh and sign in again.')
      }
      const orders = Array.isArray(result.orders) ? result.orders : []
      setTrackingOrders(orders)
      // Policy can differ across stores; hide new-return actions for disabled stores.
      const codes = [...new Set(orders.map(o => String(o.restaurant_code || restaurantCode)))].slice(0, 50)
      const policyRows = await Promise.all(codes.map(async code => {
        try {
          const { data, error: policyError } = await supabase.rpc(
            'get_public_delivery_customer_returns', { p_restaurant_code: code }
          )
          return [code, !policyError && data?.success === true && data?.returnsEnabled === true]
        } catch { return [code, false] }
      }))
      if (identityAtRequest !== activeIdentityRef.current) return
      setReturnsByStore(Object.fromEntries(policyRows))
      setOtherStoreOrderCount(Math.max(0, Number(result.otherStoreOrderCount || 0)))
      setTrackingAccountEmail(mode === 'mobile'
        ? `Mobile + PIN · +91 ${String(mobileCustomer?.mobile || '').replace(/\D/g, '').replace(/^\d{0,6}/, '••••••')}`
        : String(result.accountEmail || ''))
      setTrackingAccountType(String(result.accountType || ''))
    } catch (error) {
      if (identityAtRequest === activeIdentityRef.current) {
        setTrackingError(error?.message || 'Unable to load your orders.')
      }
    } finally {
      if (identityAtRequest === activeIdentityRef.current) setTrackingLoading(false)
    }
  }
  const initialViewHandled = useRef('')
  useEffect(() => {
    if (isCustomerSessionLoading || !restaurantCode) return
    const url = new URL(window.location.href)
    const requestedView = initialView || url.searchParams.get('view') || ''
    if (requestedView !== 'orders' && requestedView !== 'account') {
      initialViewHandled.current = ''
      return
    }
    const viewKey = `${restaurantCode}:${requestedView}`
    if (initialViewHandled.current === viewKey) return
    initialViewHandled.current = viewKey
    // Remove one-time view request so browser Back does not reopen a modal.
    if (url.searchParams.get('view') === requestedView) {
      url.searchParams.delete('view')
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
    }
    if (requestedView === 'orders') openTracking()
    else openCustomerAccount()
    // Use the verified Mobile/PIN-vs-Google account selection already present.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCustomerSessionLoading, restaurantCode, initialView])

  const resetAfterSalesRequest = () => {
    setAfterSalesOrder(null)
    setAfterSalesError('')
    setAfterSalesMessage('')
    setAfterSalesType('return')
    setAfterSalesReason('')
    setAfterSalesQuantities({})
    setAfterSalesCreated(null)
  }

  const openAfterSales = ({
    orderCode = '',
    mobile = '',
    tab = 'request',
  } = {}) => {
    setAfterSalesTab(tab === 'request' && !returnsEnabled ? 'track' : tab)
    setAfterSalesOrderCode(
      String(orderCode || '').trim()
    )
    setAfterSalesMobile(
      digits(mobile, 10)
    )
    setAfterSalesCaseCode('')
    setAfterSalesCase(null)
    resetAfterSalesRequest()
    setAfterSalesOpen(true)
  }

  // Deep link from an order belonging to a different delivery store.
  // Google sessions may span stores; mobile/PIN sessions remain store-scoped.
  useEffect(() => {
    if (!restaurantCode || isCustomerSessionLoading || !returnsPolicyLoaded) return
    try {
      const url = new URL(window.location.href)
      const orderCode = url.searchParams.get('returnOrder') || ''
      if (!/^[A-Za-z0-9_-]{1,100}$/.test(orderCode)) return
      url.searchParams.delete('returnOrder')
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash)
      if (!isCustomerSignedIn) {
        const next = `/delivery/${encodeURIComponent(restaurantCode)}?returnOrder=${encodeURIComponent(orderCode)}`
        router.push(`/delivery/login?next=${encodeURIComponent(next)}`)
        return
      }
      if (returnsEnabled) {
        openAfterSales({ orderCode, mobile: mobileCustomer?.mobile || '', tab: 'request' })
      } else {
        setTrackingError('This store has disabled new return requests. Existing return cases can still be tracked.')
        setTrackingOpen(true)
      }
    } catch { /* invalid location state; do not block store */ }
    // Trigger only on store/session-policy readiness, not every popup state update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantCode, isCustomerSessionLoading, returnsPolicyLoaded, isCustomerSignedIn, returnsEnabled])

  const closeAfterSales = () => {
    setAfterSalesOpen(false)
    setAfterSalesError('')
    setAfterSalesMessage('')
    setAfterSalesLoading(false)
    setAfterSalesSubmitting(false)
    setAfterSalesCaseLoading(false)
  }

  const loadAfterSalesOrder = async (event) => {
    event?.preventDefault?.()
    if (!returnsEnabled) {
      setAfterSalesError('This store has disabled new return requests.')
      return
    }
    const orderCode = String(afterSalesOrderCode || '').trim()
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(orderCode)) {
      setAfterSalesError('Choose a valid delivered order from My Orders.')
      return
    }
    setAfterSalesLoading(true)
    setAfterSalesError('')
    setAfterSalesMessage('')
    setAfterSalesOrder(null)
    setAfterSalesCreated(null)
    try {
      const headers = {}
      if (activeAccountType === 'google') {
        const { data: sessionData } = await supabase.auth.getSession()
        if (!sessionData?.session?.access_token) throw new Error('Google session expired.')
        headers.Authorization = `Bearer ${sessionData.session.access_token}`
      }
      const response = await fetch(
        `/api/delivery/customer/returns?restaurantCode=${encodeURIComponent(restaurantCode)}&orderCode=${encodeURIComponent(orderCode)}&accountType=${activeAccountType}`,
        { headers, credentials: 'same-origin', cache: 'no-store' }
      )
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data?.success !== true || !data?.order) {
        throw new Error(data?.message || 'Unable to verify your account order.')
      }
      const order = data.order
      if (String(order.order_status || '').toLowerCase() !== 'delivered') {
        throw new Error('Return requests are available after your order is delivered.')
      }
      if (String(order.payment_method || '').toLowerCase() === 'razorpay' &&
          String(order.payment_status || '').toLowerCase() !== 'paid') {
        throw new Error('This online-payment order is not eligible for a return request.')
      }
      setAfterSalesOrder(order)
      setAfterSalesOrderCode(String(order.order_code || orderCode))
      setAfterSalesMobile(digits(order.customer_mobile || mobileCustomer?.mobile || '', 10))
      const initialQuantities = {}
      ;(Array.isArray(order.items) ? order.items : []).forEach(item => {
        const id = String(item?.id || item?.menu_item_id || '')
        if (id) initialQuantities[id] = 0
      })
      setAfterSalesQuantities(initialQuantities)
      setAfterSalesMessage('Order verified through your account. Select the affected items and describe your request.')
    } catch (lookupError) {
      console.error('Delivery authenticated return order lookup:', lookupError?.message)
      setAfterSalesError(lookupError?.message || 'Unable to verify this order.')
    } finally {
      setAfterSalesLoading(false)
    }
  }

  const changeAfterSalesQuantity = (
    item,
    change
  ) => {
    const id =
      String(
        item?.id ||
          item?.menu_item_id ||
          ''
      )

    if (!id) {
      return
    }

    const ordered =
      Math.max(
        1,
        Math.floor(
          Number(
            item?.quantity ||
              item?.qty ||
              1
          )
        )
      )

    setAfterSalesQuantities(
      (current) => {
        const existing =
          Math.max(
            0,
            Math.floor(
              Number(
                current?.[id] ||
                  0
              )
            )
          )

        return {
          ...current,
          [id]:
            Math.max(
              0,
              Math.min(
                ordered,
                existing +
                  Number(change || 0)
              )
            ),
        }
      }
    )
  }

  const submitAfterSalesRequest =
    async (event) => {
      event?.preventDefault?.()

      if (!afterSalesOrder) {
        setAfterSalesError(
          'Verify your Delivery order first.'
        )
        return
      }

      const reason =
        String(
          afterSalesReason || ''
        ).trim()

      if (reason.length < 5) {
        setAfterSalesError(
          'Please enter a short reason for this request.'
        )
        return
      }

      const requiresItems =
        afterSalesType !==
          'refund'

      const selectedItems =
        (
          Array.isArray(
            afterSalesOrder.items
          )
            ? afterSalesOrder.items
            : []
        )
          .map((item) => {
            const id =
              String(
                item?.id ||
                  item?.menu_item_id ||
                  ''
              )

            return {
              id,
              quantity:
                Math.max(
                  0,
                  Math.floor(
                    Number(
                      afterSalesQuantities?.[
                        id
                      ] || 0
                    )
                  )
                ),
            }
          })
          .filter(
            (item) =>
              item.id &&
              item.quantity > 0
          )

      if (
        requiresItems &&
        !selectedItems.length
      ) {
        setAfterSalesError(
          'Select at least one affected item and quantity.'
        )
        return
      }

      setAfterSalesSubmitting(true)
      setAfterSalesError('')
      setAfterSalesMessage('')

      try {
        if (!returnsEnabled) throw new Error('This store has disabled new return requests.')
        const headers = { 'Content-Type': 'application/json' }
        if (activeAccountType === 'google') {
          const { data: sessionData } = await supabase.auth.getSession()
          if (!sessionData?.session?.access_token) throw new Error('Google session expired.')
          headers.Authorization = `Bearer ${sessionData.session.access_token}`
        }
        const response = await fetch('/api/delivery/customer/returns', {
          method: 'POST', headers, credentials: 'same-origin', cache: 'no-store',
          body: JSON.stringify({
            restaurantCode,
            accountType: activeAccountType,
            orderCode: String(afterSalesOrder.order_code || afterSalesOrderCode),
            caseType: afterSalesType,
            items: requiresItems ? selectedItems : [],
            reason,
          }),
        })
        const data = await response.json().catch(() => ({}))
        if (!response.ok || data?.success !== true) {
          if (data?.code === 'CUSTOMER_RETURNS_DISABLED') setReturnsEnabled(false)
          throw new Error(data?.message || 'Unable to submit the after-sales request.')
        }

        const created =
          data?.case || {}

        setAfterSalesCreated(
          created
        )

        setAfterSalesCaseCode(
          String(
            created?.case_code ||
              ''
          )
        )

        setAfterSalesMessage(
          data?.message ||
            'Your request was submitted to the store for review.'
        )
      } catch (requestError) {
        console.error(
          'Delivery after-sales request error:',
          requestError
        )

        setAfterSalesError(
          requestError?.message ||
            'Unable to submit your request.'
        )
      } finally {
        setAfterSalesSubmitting(false)
      }
    }

  const loadAfterSalesCase =
    async (event) => {
      event?.preventDefault?.()

      const caseCode =
        String(
          afterSalesCaseCode || ''
        ).trim()

      const mobile =
        digits(
          afterSalesMobile,
          10
        )

      if (!caseCode) {
        setAfterSalesError(
          'Enter your return/refund request code.'
        )
        return
      }

      if (mobile.length !== 10) {
        setAfterSalesError(
          'Enter the 10-digit mobile number used for the Delivery order.'
        )
        return
      }

      setAfterSalesCaseLoading(true)
      setAfterSalesError('')
      setAfterSalesMessage('')
      setAfterSalesCase(null)

      try {
        const {
          data,
          error: rpcError,
        } = await supabase.rpc(
          'get_public_delivery_after_sales_case',
          {
            p_restaurant_code:
              restaurantCode,

            p_case_code:
              caseCode,

            p_customer_mobile:
              mobile,
          }
        )

        if (rpcError) {
          throw rpcError
        }

        if (!data?.success) {
          throw new Error(
            data?.message ||
              'Return/refund request was not found.'
          )
        }

        setAfterSalesCase(
          data?.case || null
        )
      } catch (caseError) {
        console.error(
          'Delivery after-sales case lookup error:',
          caseError
        )

        setAfterSalesError(
          caseError?.message ||
            'Unable to load this return/refund request.'
        )
      } finally {
        setAfterSalesCaseLoading(false)
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

  // Selecting an account address during checkout must not discard the cart.
  // Also verify that THIS store is eligible at the selected pin, not merely
  // that some OTHER store delivers to the saved address.
  const selectSavedAddressAtCheckout = async (point) => {
    const validationId = ++addressValidationRef.current
    const accountAtSelection = activeIdentityRef.current
    try {
      setLocationError('')
      const line1 = String(point?.addressLine1 || '').trim()
      const city = String(point?.city || '').trim()
      const state = String(point?.state || '').trim()
      const pincode = digits(point?.pincode, 6)
      if (!line1 || !city || !state || pincode.length !== 6) {
        throw new Error('This address is incomplete. Edit it in Saved addresses before checkout.')
      }
      const lat = Number(point?.latitude)
      const lng = Number(point?.longitude)
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new Error('Invalid address coordinates.')
      const { data, error: nearbyError } = await supabase.rpc('get_nearby_delivery_stores', {
        p_latitude: lat, p_longitude: lng,
      })
      if (nearbyError || data?.success !== true) throw nearbyError || new Error(data?.message || 'Unable to verify delivery coverage.')
      const matches = (Array.isArray(data?.stores) ? data.stores : []).filter((store) =>
        String(store.restaurantCode || store.restaurant_code || '') === restaurantCode &&
        store.isOpen !== false && store.is_open !== false
      )
      const target = matches[0]
      if (!target) throw new Error('This store does not deliver to that saved address. Select another address or choose a different store.')
      const id = String(target.restaurantId || target.restaurant_id || '')
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        throw new Error('Store coverage could not be verified.')
      }
      const [wallet, plan] = await Promise.all([
        supabase.rpc('delivery_wallet_eligible_restaurant_ids', { p_restaurant_ids: [id] }),
        supabase.rpc('delivery_plan_eligible_restaurant_ids', { p_restaurant_ids: [id] }),
      ])
      if (wallet.error || plan.error) throw new Error('Could not verify this store’s eligibility. Please retry.')
      const allowed = (rows) => (Array.isArray(rows) ? rows : []).some((row) =>
        String(typeof row === 'string' ? row : row?.restaurant_id ?? row?.restaurantId ?? '').toLowerCase() === id.toLowerCase()
      )
      if (!allowed(wallet.data) || !allowed(plan.data)) {
        throw new Error('This store cannot take orders for that saved address right now.')
      }
      if (validationId !== addressValidationRef.current || accountAtSelection !== activeIdentityRef.current) return false
      setCheckout((current) => ({
        ...current,
        latitude: lat.toFixed(7), longitude: lng.toFixed(7),
        locationAccuracy: point.accuracy != null ? String(point.accuracy) : '',
        addressLine1: line1, addressLine2: String(point.addressLine2 || ''),
        landmark: String(point.landmark || ''), city, state, pincode,
        customerName: String(point.recipientName || ''),
        customerMobile: digits(point.recipientMobile || '', 10),
        customerEmail: activeAccountType === 'mobile' ? '' : current.customerEmail,
      }))
      setLocationConfirmed(true)
      return true
    } catch (error) {
      if (validationId === addressValidationRef.current && accountAtSelection === activeIdentityRef.current) {
        setLocationError(error?.message || 'This saved address is unavailable for this store.')
      }
      return false
    }
  }
  const placeOrder = async (
    event
  ) => {
    event.preventDefault()
    if (placing) return
    if (isCustomerSessionLoading) {
      setMessage('Checking your delivery login. Please try again in a moment.')
      return
    }
    if (!isCustomerSignedIn) {
      setMessage('Please login before placing your Delivery order.')
      const nextPath = `/delivery/${encodeURIComponent(restaurantCode)}`
      router.push(`/delivery/login?next=${encodeURIComponent(nextPath)}`)
      return
    }
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession()
    if (activeAccountType === 'google' && (sessionError || !session?.access_token)) {
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
    if (!locationConfirmed || !selectedSavedAddressId) {
      setMessage('Select a saved delivery address before placing your order.')
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
        'Select an address with a valid GPS location before placing your order.'
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
    // Revalidate right before order submission. If the ERP fee or owner
    // preference changed since the displayed total, require another tap.
    if (!platformFeeQuote.loaded) {
      setMessage('Unable to verify platform fee. Please refresh the store and try again.')
      return
    }
    let latestPlatformFee = 0
    try {
      const { data: feeData, error: feeError } = await supabase.rpc(
        'get_public_delivery_platform_fee_quote',
        { p_restaurant_code: restaurantCode }
      )
      if (feeError || !feeData?.success) throw new Error('Platform fee quote unavailable')
      latestPlatformFee = Number(feeData.customerAmount || 0)
      if (!Number.isFinite(latestPlatformFee) || latestPlatformFee < 0) {
        throw new Error('Invalid platform fee quote')
      }
    } catch (feeError) {
      setMessage('Unable to verify platform fee. Please try again.')
      return
    }
    if (Math.round(latestPlatformFee * 100) !== Math.round(previewPlatformFee * 100)) {
      setPlatformFeeQuote({ loaded: true, customerAmount: latestPlatformFee })
      setMessage('Platform fee changed. Review the updated total and tap Place Order again.')
      return
    }
    setPlacing(true)
    setMessage('')
    try {
      const response = await fetch(
        '/api/delivery/orders/create',
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            ...(activeAccountType === 'google' && session?.access_token
              ? { Authorization: `Bearer ${session.access_token}` }
              : {}),
          },
          body: JSON.stringify({
            restaurantCode,
            accountType: activeAccountType,
            requireAccountLink: true,
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
            // Expected amount confirms consent only. SQL computes the real fee.
            expectedPlatformFeePaise: Math.round(previewPlatformFee * 100),
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
      if (data.customerAccountLinked !== true) {
        // Never make a customer retry payment after a server reports success.
        // A prior deployed API might not include the new status field.
        console.warn('Delivery server did not confirm the account link. Please check My Orders.')
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
      if (String(placeError?.message || '').includes('PLATFORM_FEE_CHANGED_REVIEW_TOTAL')) {
        try {
          const { data: quoteData } = await supabase.rpc(
            'get_public_delivery_platform_fee_quote',
            { p_restaurant_code: restaurantCode }
          )
          if (quoteData?.success) {
            setPlatformFeeQuote({
              loaded: true,
              customerAmount: Math.max(0, Number(quoteData.customerAmount || 0)),
            })
          }
        } catch (refreshError) {
          console.warn('Delivery fee quote refresh warning:', refreshError)
        }
        setMessage('Platform fee changed. Review the updated total and place the order again.')
      } else {
        setMessage(placeError?.message || 'Unable to place order.')
      }
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
    <main className="dm-market dm-store min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-[#f7f9f7] pb-[calc(12rem+env(safe-area-inset-bottom))] text-neutral-950">
      <header className="dm-store-header">
        <div className="dm-store-topline">
          <button type="button" className="dm-round-icon" onClick={() => typeof onBackToStores === 'function' ? onBackToStores() : router.push('/delivery?choose=1')} aria-label="Back to nearby stores">←</button>
          <div className="dm-store-heading"><strong>Store Detail</strong><small>{settings.store_name || restaurant.name || 'Delivery'}</small></div>
          <button type="button" className="dm-round-icon" onClick={() => window.dispatchEvent(new Event('digitaldine:open-help-centre'))} aria-label="Help centre">⋮</button>
        </div>
        <div className="dm-store-searchline">
          <DDMarketSearchIcon />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search here" aria-label="Search products" />
          {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear product search">×</button>}
        </div>
      </header>

      <div className="mx-auto w-full max-w-5xl px-3 py-4 sm:px-4 sm:py-6">
        <section className="dm-store-detail" aria-label="Store information">
          <div className="dm-store-cover">
            {settings.banner_url || restaurant.logo_url ? (
              <img src={settings.banner_url || restaurant.logo_url} alt={settings.store_name || restaurant.name || 'Store'} />
            ) : <div className="dm-store-cover-empty" aria-hidden="true">🛒 🥦 🍎 🥕</div>}
            <span className={settings.is_open ? 'dm-cover-tag open' : 'dm-cover-tag closed'}>{settings.is_open ? 'Open for delivery' : 'Currently closed'}</span>
          </div>
          <div className="dm-store-detail-body">
            <div className="dm-store-name-row">
              <div><h1>{settings.store_name || restaurant.name || 'Delivery Store'}</h1>
                <p><span className="dm-small-dot"/> {settings.is_open ? `Estimated ${settings.estimated_delivery_minutes || 45} min delivery` : 'Store closed'}</p>
              </div>
              <button type="button" className="dm-store-account" onClick={openCustomerAccount} aria-label="Customer profile">♧</button>
            </div>
            {settings.description ? <p className="dm-store-description">{settings.description}</p> : null}
            {(settings.address || settings.city) && <p className="dm-store-address">⌖ {[settings.address,settings.city,settings.state].filter(Boolean).join(', ')}</p>}
            <div className="dm-store-facts">
              <span>🚚 {previewDeliveryFee === 0 ? 'Free delivery' : `${money(previewDeliveryFee)} delivery`}</span>
              <span>🛍 {minimumOrderAmount > 0 ? `Free delivery from ${money(minimumOrderAmount)}` : 'Local delivery'}</span>
              <span>📍 {coverageEnabled && coverageRadiusKm > 0 ? `${coverageRadiusKm.toFixed(1)} km range` : 'Coverage verified'}</span>
            </div>
          </div>
        </section>

        {offers.length > 0 && (
          <section className="dm-offers mt-7">
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

        <section className="dm-products-heading" id="dm-products">
          <div className="dm-section-title"><h2>Our Products</h2>
            <label className="dm-sort-label">Sort
              <select value={sortMode} onChange={(event)=>setSortMode(event.target.value)} aria-label="Sort products">
                <option value="default">Recommended</option><option value="low">Price: low to high</option><option value="high">Price: high to low</option><option value="az">Name A to Z</option>
              </select>
            </label>
          </div>
          <div className="dm-store-categories" aria-label="Product categories">
            {categories.map(itemCategory => <button key={itemCategory} type="button" onClick={()=>setCategory(itemCategory)} aria-pressed={category===itemCategory} className={category===itemCategory?'selected':''}>{itemCategory}</button>)}
          </div>
          <p className="dm-products-count">{displayItems.length} products available</p>
        </section>

        <section className="dm-product-grid" aria-label="Store products">
          {displayItems.map((item) => {
            const quantity = Number(cart[item.id] || 0)
            const stock = deliveryStockInfo(item)
            const packagedProduct = String(item.item_type || 'food') === 'packaged_product'
            const hasDiscount = Number(item.base_price || 0) > Number(item.price || 0)
            const reviewInfo = productReviews[String(item.id)] || null
            const averageRating = Number(reviewInfo?.average_rating || 0)
            const reviewCount = Number(reviewInfo?.review_count || 0)
            const recentReview = Array.isArray(reviewInfo?.recent_reviews) ? reviewInfo.recent_reviews[0] : null
            return <article className="dm-product" key={item.id}>
              <div className="dm-product-picture">
                {item.image_url ? <img src={item.image_url} alt={item.name} loading="lazy"/> : <span aria-hidden="true">{packagedProduct ? '📦' : '🥗'}</span>}
              </div>
              <div className="dm-product-info">
                <h3>{item.name}</h3>
                <p className="dm-product-kind">{item.category || (packagedProduct ? 'Groceries' : 'Food')} · {item.food_type || (item.is_veg ? 'Veg' : 'Non-veg')}</p>
                {item.description && <p className="dm-product-description">{item.description}</p>}
                {reviewCount > 0 && <p className="dm-product-rating">★ {averageRating.toFixed(1)} <span>({reviewCount} verified {reviewCount===1?'review':'reviews'})</span></p>}
                {recentReview?.review && <p className="dm-product-description">“{recentReview.review}” — {recentReview.customer_name || 'Verified customer'} · {Number(recentReview.rating || 0)} ★</p>}
                {stock.tracked && <p className={stock.outOfStock ? 'dm-stock-out' : stock.lowStock ? 'dm-stock-low' : 'dm-stock-good'}>{stock.outOfStock ? 'Out of stock' : stock.lowStock ? `Only ${stock.available} left` : `${stock.available} in stock`}</p>}
                <div className="dm-product-buy">
                  <div className="dm-price"><strong>{money(item.price)}</strong>{hasDiscount && <del>{money(item.base_price)}</del>}</div>
                  {quantity <= 0 ? <button type="button" className="dm-add-button" aria-label={`Add ${item.name}`} disabled={!settings.is_open || stock.outOfStock} onClick={()=>updateQuantity(item.id,1)}>{stock.outOfStock?'×':'+'}</button> : <div className="dm-counter"><button type="button" aria-label={`Remove one ${item.name}`} onClick={()=>updateQuantity(item.id,quantity-1)}>−</button><strong>{quantity}</strong><button type="button" aria-label={`Add one ${item.name}`} disabled={stock.tracked && quantity>=stock.maxCartQuantity} onClick={()=>updateQuantity(item.id,quantity+1)}>+</button></div>}
                </div>
              </div>
            </article>
          })}
          {displayItems.length===0 && <div className="dm-status"><span className="dm-status-emoji">🔎</span><strong>No products found</strong><p>Try another search or category.</p></div>}
        </section>
      </div>

      {cartCount > 0 && (
        <div className="dm-cart-float fixed inset-x-0 bottom-[72px] z-40 px-2 sm:px-3">
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
              onClick={() => { setMessage(''); setCheckoutOpen(true) }}
              className="flex h-12 shrink-0 items-center gap-2 rounded-2xl bg-emerald-500 px-5 text-xs font-black text-white shadow-sm transition active:scale-[0.98]"
            >
              View cart
              <span aria-hidden="true">→</span>
            </button>
          </div>
        </div>
      )}

      <DeliveryCustomerSupportChat
        restaurantCode={restaurantCode}
        onReviewSubmitted={loadProductReviews}
        hideLauncher
      />
      {afterSalesOpen && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 p-0 backdrop-blur-[3px] sm:items-center sm:p-4">
          <div className="max-h-[94dvh] w-full min-w-0 max-w-xl overflow-y-auto rounded-t-[30px] border border-neutral-200 bg-white p-5 shadow-2xl sm:rounded-[30px]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-violet-600">
                  After-sales support
                </p>

                <h2 className="mt-1 text-xl font-black text-neutral-950">
                  Returns · Replacements · Refunds
                </h2>

                <p className="mt-1 text-xs leading-5 text-neutral-500">
                  Choose a delivered order in My Orders. Requests are verified against your signed-in account.
                </p>
              </div>

              <button
                type="button"
                onClick={closeAfterSales}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 text-sm font-black text-neutral-600"
                aria-label="Close returns and refunds"
              >
                ✕
              </button>
            </div>

            <div className={`mt-5 grid ${returnsEnabled ? 'grid-cols-2' : 'grid-cols-1'} gap-2 rounded-2xl bg-neutral-100 p-1`}>
              {returnsEnabled && <button
                type="button"
                onClick={() => {
                  setAfterSalesTab('request')
                  setAfterSalesError('')
                  setAfterSalesMessage('')
                  setAfterSalesCase(null)
                }}
                className={`rounded-xl px-3 py-3 text-[11px] font-black transition ${
                  afterSalesTab === 'request'
                    ? 'bg-white text-neutral-950 shadow-sm'
                    : 'text-neutral-500'
                }`}
              >
                New Request
              </button>}

              <button
                type="button"
                onClick={() => {
                  setAfterSalesTab('track')
                  setAfterSalesError('')
                  setAfterSalesMessage('')
                }}
                className={`rounded-xl px-3 py-3 text-[11px] font-black transition ${
                  afterSalesTab === 'track'
                    ? 'bg-white text-neutral-950 shadow-sm'
                    : 'text-neutral-500'
                }`}
              >
                Track Request
              </button>
            </div>

            {!returnsEnabled && <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-xs text-amber-800">New requests are disabled by this store. Existing cases can still be tracked.</p>}
            {afterSalesError && (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold leading-5 text-red-700">
                {afterSalesError}
              </div>
            )}

            {afterSalesMessage && (
              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold leading-5 text-emerald-700">
                {afterSalesMessage}
              </div>
            )}

            {returnsEnabled && afterSalesTab === 'request' && (
              <div className="mt-5">
                {!afterSalesOrder ? (
                  <form
                    onSubmit={loadAfterSalesOrder}
                    className="space-y-4"
                  >
                    <label className="block">
                      <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-neutral-500">
                        Delivery Order Code
                      </span>

                      <input
                        value={afterSalesOrderCode}
                        onChange={(event) => {
                          setAfterSalesOrderCode(
                            event.target.value
                          )
                          setAfterSalesError('')
                        }}
                        placeholder="Example: DEL-20261003-0018"
                        autoCapitalize="characters"
                        className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 font-mono text-sm font-bold outline-none focus:border-violet-500 focus:bg-white"
                      />
                    </label>

                    <button
                      type="submit"
                      disabled={
                        afterSalesLoading ||
                        !afterSalesOrderCode.trim()
                      }
                      className="w-full rounded-xl bg-violet-600 px-5 py-4 text-sm font-black text-white disabled:opacity-50"
                    >
                      {afterSalesLoading
                        ? 'Verifying Order...'
                        : 'Verify Delivered Order'}
                    </button>
                  </form>
                ) : (
                  <form
                    onSubmit={submitAfterSalesRequest}
                    className="space-y-5"
                  >
                    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-mono text-xs font-black text-neutral-950">
                            {afterSalesOrder.order_code}
                          </p>
                          <p className="mt-1 text-[10px] font-semibold text-neutral-500">
                            Delivered order · {money(afterSalesOrder.total_amount)}
                          </p>
                        </div>

                        <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[9px] font-black uppercase text-emerald-700">
                          Delivered
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={resetAfterSalesRequest}
                        className="mt-3 text-[10px] font-black text-violet-700 underline underline-offset-2"
                      >
                        Use another order
                      </button>
                    </div>

                    <div>
                      <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-neutral-500">
                        What do you need?
                      </p>

                      <div className="grid grid-cols-2 gap-2">
                        {[
                          ['return', '↩ Return'],
                          ['replacement', '🔁 Replacement'],
                          ['refund', '₹ Refund'],
                          ['return_refund', '↩ Return + Refund'],
                        ].map(([value, label]) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() => {
                              setAfterSalesType(value)
                              setAfterSalesError('')
                            }}
                            className={`rounded-xl border px-3 py-3 text-[11px] font-black transition ${
                              afterSalesType === value
                                ? 'border-violet-500 bg-violet-50 text-violet-800'
                                : 'border-neutral-200 bg-white text-neutral-600'
                            }`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {afterSalesType !== 'refund' && (
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-neutral-500">
                          Select affected items
                        </p>

                        <p className="mt-1 text-[10px] leading-4 text-neutral-400">
                          Set the quantity only for products affected by this request.
                        </p>

                        <div className="mt-3 space-y-2">
                          {(Array.isArray(afterSalesOrder.items)
                            ? afterSalesOrder.items
                            : []
                          ).map((item, index) => {
                            const id = String(
                              item?.id ||
                                item?.menu_item_id ||
                                ''
                            )

                            const ordered = Math.max(
                              1,
                              Math.floor(
                                Number(
                                  item?.quantity ||
                                    item?.qty ||
                                    1
                                )
                              )
                            )

                            const selected = Math.max(
                              0,
                              Math.floor(
                                Number(
                                  afterSalesQuantities?.[id] ||
                                    0
                                )
                              )
                            )

                            return (
                              <div
                                key={id || index}
                                className={`rounded-2xl border p-3 ${
                                  selected > 0
                                    ? 'border-violet-300 bg-violet-50/70'
                                    : 'border-neutral-200 bg-white'
                                }`}
                              >
                                <div className="flex items-center gap-3">
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-xs font-black text-neutral-950">
                                      {item?.name || 'Order item'}
                                    </p>

                                    <p className="mt-1 text-[10px] font-semibold text-neutral-500">
                                      Ordered ×{ordered}
                                      {item?.price != null
                                        ? ` · ${money(item.price)} each`
                                        : ''}
                                    </p>
                                  </div>

                                  <div className="flex items-center rounded-xl border border-neutral-200 bg-white p-1">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        changeAfterSalesQuantity(
                                          item,
                                          -1
                                        )
                                      }
                                      disabled={selected <= 0}
                                      className="flex h-8 w-8 items-center justify-center rounded-lg text-sm font-black text-neutral-700 disabled:opacity-30"
                                    >
                                      −
                                    </button>

                                    <span className="w-8 text-center text-xs font-black text-neutral-950">
                                      {selected}
                                    </span>

                                    <button
                                      type="button"
                                      onClick={() =>
                                        changeAfterSalesQuantity(
                                          item,
                                          1
                                        )
                                      }
                                      disabled={selected >= ordered}
                                      className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-950 text-sm font-black text-white disabled:opacity-30"
                                    >
                                      +
                                    </button>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    <label className="block">
                      <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-neutral-500">
                        Reason
                      </span>

                      <textarea
                        value={afterSalesReason}
                        onChange={(event) => {
                          setAfterSalesReason(
                            event.target.value
                          )
                          setAfterSalesError('')
                        }}
                        maxLength={1000}
                        rows={4}
                        placeholder={
                          afterSalesType === 'replacement'
                            ? 'Example: Product was damaged / wrong item received...'
                            : afterSalesType === 'refund'
                              ? 'Explain why you are requesting a refund...'
                              : 'Explain the issue with the returned item...'
                        }
                        className="w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none focus:border-violet-500 focus:bg-white"
                      />
                    </label>

                    {afterSalesCreated ? (
                      <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                        <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">
                          Request submitted
                        </p>

                        <p className="mt-2 font-mono text-base font-black text-emerald-950">
                          {afterSalesCreated.case_code}
                        </p>

                        <p className="mt-2 text-xs leading-5 text-emerald-800">
                          Save this request code. The store will review your request before any stock replacement or refund is processed.
                        </p>

                        <button
                          type="button"
                          onClick={() => {
                            setAfterSalesTab('track')
                            setAfterSalesCaseCode(
                              String(
                                afterSalesCreated.case_code ||
                                  ''
                              )
                            )
                            setAfterSalesCase(null)
                            setAfterSalesError('')
                            setAfterSalesMessage('')
                          }}
                          className="mt-3 w-full rounded-xl bg-emerald-700 px-4 py-3 text-xs font-black text-white"
                        >
                          Track This Request
                        </button>
                      </div>
                    ) : (
                      <button
                        type="submit"
                        disabled={afterSalesSubmitting}
                        className="w-full rounded-xl bg-violet-600 px-5 py-4 text-sm font-black text-white disabled:opacity-50"
                      >
                        {afterSalesSubmitting
                          ? 'Submitting Request...'
                          : 'Submit to Store for Review'}
                      </button>
                    )}

                    <p className="text-[10px] leading-5 text-neutral-400">
                      Submitting a request does not automatically refund money or add products back into inventory. The store must review and confirm the return/replacement/refund.
                    </p>
                  </form>
                )}
              </div>
            )}

            {afterSalesTab === 'track' && (
              <div className="mt-5">
                <form
                  onSubmit={loadAfterSalesCase}
                  className="space-y-4"
                >
                  <label className="block">
                    <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-neutral-500">
                      Request Code
                    </span>

                    <input
                      value={afterSalesCaseCode}
                      onChange={(event) => {
                        setAfterSalesCaseCode(
                          event.target.value
                        )
                        setAfterSalesCase(null)
                        setAfterSalesError('')
                      }}
                      placeholder="Example: AS-20261003-XXXXXXXX"
                      autoCapitalize="characters"
                      className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 font-mono text-sm font-bold outline-none focus:border-violet-500 focus:bg-white"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-neutral-500">
                      Order Mobile Number
                    </span>

                    <input
                      type="tel"
                      inputMode="numeric"
                      value={afterSalesMobile}
                      onChange={(event) => {
                        setAfterSalesMobile(
                          digits(
                            event.target.value,
                            10
                          )
                        )
                        setAfterSalesCase(null)
                        setAfterSalesError('')
                      }}
                      placeholder="10-digit order mobile"
                      className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-bold outline-none focus:border-violet-500 focus:bg-white"
                    />
                  </label>

                  <button
                    type="submit"
                    disabled={
                      afterSalesCaseLoading ||
                      !afterSalesCaseCode.trim() ||
                      afterSalesMobile.length !== 10
                    }
                    className="w-full rounded-xl bg-neutral-950 px-5 py-4 text-sm font-black text-white disabled:opacity-50"
                  >
                    {afterSalesCaseLoading
                      ? 'Loading Request...'
                      : 'Check Request Status'}
                  </button>
                </form>

                {afterSalesCase && (
                  <div className="mt-5 space-y-3">
                    <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-mono text-xs font-black text-neutral-950">
                            {afterSalesCase.case_code}
                          </p>

                          <p className="mt-1 text-[10px] font-semibold text-neutral-500">
                            Order {afterSalesCase.order_code}
                          </p>
                        </div>

                        <span className="max-w-[48%] rounded-full bg-violet-100 px-2.5 py-1 text-center text-[9px] font-black uppercase text-violet-700">
                          {String(
                            afterSalesCase.status || ''
                          ).replaceAll('_', ' ')}
                        </span>
                      </div>

                      <div className="mt-4 grid grid-cols-2 gap-2 text-[10px]">
                        <div className="rounded-xl bg-white p-3">
                          <p className="font-black uppercase text-neutral-400">
                            Request
                          </p>
                          <p className="mt-1 font-black capitalize text-neutral-900">
                            {String(
                              afterSalesCase.case_type || ''
                            ).replaceAll('_', ' ')}
                          </p>
                        </div>

                        <div className="rounded-xl bg-white p-3">
                          <p className="font-black uppercase text-neutral-400">
                            Refund
                          </p>
                          <p className="mt-1 font-black capitalize text-neutral-900">
                            {afterSalesCase.refund_required
                              ? String(
                                  afterSalesCase.refund_status ||
                                    'pending'
                                ).replaceAll('_', ' ')
                              : 'Not required'}
                          </p>
                        </div>
                      </div>

                      {afterSalesCase.reason && (
                        <div className="mt-3 rounded-xl bg-white p-3">
                          <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                            Reason
                          </p>
                          <p className="mt-1 text-xs leading-5 text-neutral-700">
                            {afterSalesCase.reason}
                          </p>
                        </div>
                      )}

                      {afterSalesCase.refund_required && (
                        <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                          <div className="flex justify-between gap-3 text-xs">
                            <span className="font-semibold text-emerald-800">
                              Approved refund
                            </span>
                            <span className="font-black text-emerald-950">
                              {money(afterSalesCase.refund_amount)}
                            </span>
                          </div>

                          <div className="mt-2 flex justify-between gap-3 text-xs">
                            <span className="font-semibold text-emerald-800">
                              Refunded
                            </span>
                            <span className="font-black text-emerald-950">
                              {money(
                                afterSalesCase.refund_completed_amount
                              )}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    {Array.isArray(afterSalesCase.items) &&
                      afterSalesCase.items.length > 0 && (
                        <div className="rounded-2xl border border-neutral-200 bg-white p-4">
                          <p className="text-[10px] font-black uppercase tracking-wider text-neutral-500">
                            Items
                          </p>

                          <div className="mt-3 space-y-2">
                            {afterSalesCase.items.map(
                              (item, index) => (
                                <div
                                  key={`${item.name || 'item'}-${index}`}
                                  className="rounded-xl bg-neutral-50 p-3"
                                >
                                  <p className="text-xs font-black text-neutral-950">
                                    {item.name || 'Order item'}
                                  </p>

                                  <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[10px] text-neutral-600">
                                    <span>
                                      Requested: <b>{item.requested_quantity || 0}</b>
                                    </span>
                                    <span>
                                      Approved: <b>{item.approved_quantity || 0}</b>
                                    </span>
                                    <span>
                                      Returned: <b>{item.returned_quantity || 0}</b>
                                    </span>
                                    <span>
                                      Replacement sent: <b>{item.replacement_dispatched_quantity || 0}</b>
                                    </span>
                                  </div>
                                </div>
                              )
                            )}
                          </div>
                        </div>
                      )}

                    <button
                      type="button"
                      onClick={() =>
                        loadAfterSalesCase()
                      }
                      disabled={afterSalesCaseLoading}
                      className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-xs font-black text-neutral-700 disabled:opacity-50"
                    >
                      ↻ Refresh Request Status
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {trackingOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
          <div className="max-h-[92dvh] w-full min-w-0 max-w-md overflow-y-auto rounded-t-[30px] border border-neutral-200 bg-white p-5 shadow-2xl sm:rounded-[30px]">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-600">Delivery Tracking</p>
                <h2 className="mt-1 text-xl font-black text-neutral-950">My Orders</h2>
                <p className="mt-1 text-xs leading-5 text-neutral-500">{activeAccountType === 'mobile' ? 'Orders linked to your Mobile/PIN account at this store.' : 'Your orders across Digital Dine-In delivery stores.'}</p>
                {trackingAccountEmail ? (
                  <p className="mt-2 break-all text-[11px] font-semibold text-emerald-700">Signed in as {trackingAccountEmail}</p>
                ) : null}
              </div>
              <button type="button" onClick={() => setTrackingOpen(false)} className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 text-sm font-black text-neutral-600" aria-label="Close order tracking">✕</button>
            </div>
            {trackingLoading ? (
              <p className="mt-5 rounded-xl bg-neutral-50 px-4 py-5 text-center text-xs font-bold text-neutral-600">Loading your orders…</p>
            ) : null}
            {!trackingLoading && trackingError ? (
              <div role="alert" className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold leading-5 text-red-700">{trackingError}</div>
            ) : null}
            {trackingAccountUnauthorized ? (
              <button type="button" onClick={() => router.push(`/delivery/login?next=${encodeURIComponent(`/delivery/${restaurantCode}`)}`)} className="mt-4 w-full rounded-xl bg-emerald-600 px-5 py-4 text-sm font-black text-white">Sign in</button>
            ) : null}
            {!trackingLoading && !trackingError && trackingOrders.length === 0 ? (
              <div className="mt-5 rounded-2xl border border-neutral-200 bg-neutral-50 p-5 text-center">
                <p className="text-sm font-black text-neutral-900">No linked orders found</p>
                <p className="mt-2 text-xs leading-5 text-neutral-500">
                  {trackingAccountType === 'google'
                    ? 'No orders belong to this signed-in Google account. Check the Google email shown above against the account used at checkout. Orders linked to a different account cannot be shown here.'
                    : otherStoreOrderCount > 0
                      ? `Your mobile/PIN session has no linked orders at this store. ${otherStoreOrderCount} order(s) are linked at other stores, which require their own store session.`
                      : 'No orders are linked to this verified delivery session yet. Previous orders need verified recovery.'}
                </p>
              </div>
            ) : null}
            {trackingOrders.length > 0 && (
              <div className="mt-5 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-neutral-500">Recent Orders</p>
                {trackingOrders.map((order) => (
                  <div key={`${order.restaurant_code || restaurantCode}-${order.order_code}`} className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-left transition hover:border-emerald-300 hover:bg-emerald-50/50">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-mono text-xs font-black text-neutral-900">{order.order_code}</p>
                        <p className="mt-1 text-[10px] text-neutral-500">{order.created_at ? new Date(order.created_at).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : ''}</p>
                        {order.restaurant_code ? (<p className="mt-1 text-[10px] font-semibold text-neutral-600">{order.restaurant_name || 'Delivery store'} · {order.restaurant_code}</p>) : null}
                      </div>
                      <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-[9px] font-black uppercase text-emerald-700">{String(order.order_status || '').replaceAll('_', ' ')}</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs">
                      <span className="text-neutral-500">{order.driver_assigned ? 'Driver assigned' : 'Preparing dispatch'}</span>
                      <span className="font-black text-neutral-900">{money(order.total_amount)}</span>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button type="button" onClick={() => {
                        setTrackingOpen(false)
                        const code = String(order.restaurant_code || restaurantCode)
                        router.push(`/delivery/${encodeURIComponent(code)}/track/${encodeURIComponent(order.order_code)}`)
                      }} className="rounded-xl border border-emerald-200 bg-white px-3 py-2 text-[11px] font-black text-emerald-800">
                        Track Order
                      </button>
                      {String(order.order_status || '').toLowerCase() === 'delivered' &&
                       (String(order.payment_method || '').toLowerCase() !== 'razorpay' || String(order.payment_status || '').toLowerCase() === 'paid') &&
                       (String(order.restaurant_code || restaurantCode) === restaurantCode
                         ? returnsEnabled
                         : returnsByStore[String(order.restaurant_code || '')] === true) ? (
                        <button type="button" onClick={() => {
                          const code=String(order.restaurant_code || restaurantCode)
                          setTrackingOpen(false)
                          if (code !== restaurantCode) {
                            router.push(`/delivery/${encodeURIComponent(code)}?returnOrder=${encodeURIComponent(order.order_code)}`)
                          } else {
                            openAfterSales({ orderCode: order.order_code, mobile: mobileCustomer?.mobile || '', tab: 'request' })
                          }
                        }} className="rounded-xl border border-violet-200 bg-violet-50 px-3 py-2 text-[11px] font-black text-violet-700">
                          Return / Replace / Refund
                        </button>
                      ) : null}
                    </div>
                  </div>
                ))}
              </div>
            )}
            <button type="button" onClick={loadAccountOrders} disabled={trackingLoading} className="mt-4 w-full rounded-xl border border-neutral-200 bg-white px-5 py-3 text-xs font-bold text-neutral-900 disabled:opacity-50">Refresh orders</button>
            <button type="button" onClick={() => { setTrackingOpen(false); openAfterSales({ mobile: mobileCustomer?.mobile || trackingMobile, tab: 'track' }) }} className="mt-4 w-full rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-xs font-black text-violet-700">Track an Existing Return / Refund Case</button>
            <p className="mt-3 text-xs text-neutral-500">For questions, use the Help tab to chat with your store Manager.</p>
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

              {previewPlatformFee > 0 && (
                <BillRow
                  label="Digital Dine-In Platform Fee"
                  value={money(previewPlatformFee)}
                />
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
              <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <h3 className="text-sm font-black text-emerald-950">Delivery address</h3>
                  <span className="text-[10px] font-black text-emerald-700">Saved to your account</span>
                </div>
                <DeliverySavedAddressPicker compact restaurantCode={restaurantCode}
                  accountType={activeAccountType || 'auto'}
                  destination={checkout} autoApplyDefault
                  onSelect={async point => {
                    setLocationConfirmed(false)
                    setSelectedSavedAddressId('')
                    const ok = await selectSavedAddressAtCheckout(point)
                    if (ok) setSelectedSavedAddressId(point.savedAddressId)
                  }}
                />
                {locationConfirmed && selectedSavedAddressId ? (
                  <div className="mt-3 rounded-xl bg-white p-3 text-xs leading-5 text-slate-700">
                    <p className="font-black text-emerald-700">✓ Address verified for this store</p>
                    <p className="mt-1 font-semibold text-slate-950">{checkout.customerName} · {checkout.customerMobile}</p>
                    <p>{[checkout.addressLine1, checkout.addressLine2, checkout.landmark, checkout.city, checkout.state, checkout.pincode].filter(Boolean).join(', ')}</p>
                  </div>
                ) : (
                  <p className="mt-3 text-[11px] leading-5 text-emerald-900">Your default address will be applied automatically when available. Otherwise tap Select address to add or choose one. The store's delivery coverage is checked before ordering.</p>
                )}
                {locationError && <p className="mt-2 rounded-xl bg-red-50 p-3 text-xs text-red-700" role="alert">{locationError}</p>}
              </section>

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
      <nav className="dm-tabbar dm-store-tabbar" aria-label="Delivery application navigation" style={{ display: checkoutOpen || trackingOpen || afterSalesOpen || accountOpen ? 'none' : undefined }}>
        <button type="button" onClick={() => typeof onBackToStores === 'function' ? onBackToStores() : router.push('/delivery?choose=1')}><DDMarketHomeIcon/><span>Home</span></button>
        <button type="button" onClick={() => { document.querySelector('.dm-store-searchline input')?.focus(); window.scrollTo({top:0,behavior:'smooth'}) }}><DDMarketSearchIcon/><span>Explore</span></button>
        <button type="button" className="dm-tab-main" onClick={() => {setMessage('');setCheckoutOpen(true)}} aria-label="Open cart"><span className="dm-tab-main-bubble"><DDMarketBagIcon/>{cartCount>0 && <i>{cartCount}</i>}</span><span>Cart</span></button>
        <button type="button" onClick={openCustomerOrders}><DDMarketClockIcon/><span>Orders</span></button>
        <button type="button" onClick={openCustomerAccount}><DDMarketUserIcon/><span>Profile</span></button>
      </nav>
      {accountOpen && isCustomerSignedIn ? (
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
                {activeAccountType === 'google' && customerProfile?.avatar_url ? (
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
                  {mobileCustomer?.name ||
                    (activeAccountType === 'google' ? customerProfile?.full_name : '') ||
                    customerUser?.user_metadata?.full_name ||
                    customerUser?.email?.split('@')?.[0] ||
                    'Customer'}
                </h2>
                <p className="mt-1 truncate text-xs font-semibold text-neutral-500">
                  {mobileCustomer?.mobile
                    ? `Mobile + PIN · +91 ${mobileCustomer.mobile}`
                    : customerProfile?.email || customerUser?.email || ''}
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

// Local vector icons used only by the delivery reference-inspired navigation.
function DDMarketIcon({ children }) {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
}
function DDMarketHomeIcon(){return <DDMarketIcon><path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/></DDMarketIcon>}
function DDMarketSearchIcon(){return <DDMarketIcon><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></DDMarketIcon>}
function DDMarketBagIcon(){return <DDMarketIcon><rect x="4" y="7" width="16" height="14" rx="2"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></DDMarketIcon>}
function DDMarketClockIcon(){return <DDMarketIcon><circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/></DDMarketIcon>}
function DDMarketUserIcon(){return <DDMarketIcon><circle cx="12" cy="8" r="4"/><path d="M4 21c0-5 16-5 16 0"/></DDMarketIcon>}