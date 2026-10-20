'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import DeliverySavedAddressPicker from '@/app/components/DeliverySavedAddressPicker'
import DeliveryStoreExperience from '@/app/components/DeliveryStoreExperience'
import DeliveryAccountCenter from '@/app/components/DeliveryAccountCenter'

// Customer's selected delivery destination. It is not proof of GPS accuracy;
// checkout still confirms the actual address, location pin and delivery radius.
const DESTINATION_KEY = 'digitaldine_delivery_selected_location_v1'
const VALID_STORE_CODE = /^[A-Za-z0-9_-]{1,80}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function validPoint(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

function parsePoint(latitude, longitude) {
  if (latitude === '' || longitude === '' || latitude == null || longitude == null) return null
  const lat = Number(latitude)
  const lng = Number(longitude)
  return validPoint(lat, lng) ? { latitude: lat, longitude: lng } : null
}

function restaurantId(store) {
  return String(store?.restaurantId ?? store?.restaurant_id ?? '').trim().toLowerCase()
}

function restaurantCode(store) {
  return String(store?.restaurantCode ?? store?.restaurant_code ?? store?.storeCode ?? '').trim()
}

function storeDistanceKm(store) {
  const km = store?.distanceKm ?? store?.distance_km ?? store?.distance ?? null
  if (km !== null && km !== undefined && km !== '') {
    const number = Number(km)
    if (Number.isFinite(number) && number >= 0) return number
  }
  const meters = store?.distanceMeters ?? store?.distance_meters ?? null
  if (meters !== null && meters !== undefined && meters !== '') {
    const number = Number(meters)
    if (Number.isFinite(number) && number >= 0) return number / 1000
  }
  return null
}

function distanceLabel(distance) {
  if (distance === null) return 'Delivers to you'
  if (distance < 1) return `${Math.max(1, Math.round(distance * 1000))} m`
  return `${distance.toFixed(distance < 10 ? 1 : 0)} km`
}

function storeName(store, index) {
  return String(store?.name ?? store?.restaurantName ?? store?.restaurant_name ??
    store?.storeName ?? store?.store_name ?? `Delivery store ${index + 1}`).trim()
}

function storeIsOpen(store) {
  return store?.isOpen !== false && store?.is_open !== false &&
    String(store?.status || '').toLowerCase() !== 'closed'
}

function normalizeEligibleStores(stores, eligibleIds) {
  const seen = new Set()
  return (Array.isArray(stores) ? stores : [])
    .map((store, index) => ({
      store,
      index,
      code: restaurantCode(store),
      id: restaurantId(store),
      distance: storeDistanceKm(store),
    }))
    .filter((item) => VALID_STORE_CODE.test(item.code) && UUID_RE.test(item.id))
    .filter((item) => eligibleIds.has(item.id) && storeIsOpen(item.store))
    .filter((item) => {
      const key = `${item.id}:${item.code.toLowerCase()}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .sort((a, b) => {
      if (a.distance === null && b.distance === null) return a.index - b.index
      if (a.distance === null) return 1
      if (b.distance === null) return -1
      return a.distance - b.distance || a.index - b.index
    })
}

function idsFromRpc(value) {
  return new Set((Array.isArray(value) ? value : [])
    .map((row) => String(typeof row === 'string' ? row : row?.restaurant_id ?? row?.restaurantId ?? '').trim().toLowerCase())
    .filter((id) => UUID_RE.test(id)))
}

async function eligibleRestaurantIds(stores, location) {
  const ids = [...new Set(stores.map(restaurantId).filter((id) => UUID_RE.test(id)))].slice(0, 100)
  if (!ids.length) throw new Error('Nearby store records are incomplete. Please try again later.')

  // BOTH must pass. The plan helper excludes Restaurant-only and Resort-only plans.
  // A drawn polygon is an additional restriction, alongside existing radius,
  // wallet, plan, and approval checks. Fail closed if boundary verification fails.
  const [wallet, plan, serviceArea] = await Promise.all([
    supabase.rpc('delivery_wallet_eligible_restaurant_ids', { p_restaurant_ids: ids }),
    supabase.rpc('delivery_plan_eligible_restaurant_ids', { p_restaurant_ids: ids }),
    supabase.rpc('delivery_polygon_eligible_restaurant_ids', {
      p_restaurant_ids: ids,
      p_latitude: location.latitude,
      p_longitude: location.longitude,
    }),
  ])
  if (serviceArea.error) throw new Error('Unable to verify delivery boundaries. Please retry.')
  if (wallet.error) throw new Error('Unable to verify the approval and wallet status of nearby stores.')
  if (plan.error) {
    console.error('[DELIVERY] Plan visibility verification failed:', plan.error)
    throw new Error('Unable to verify Delivery subscriptions. Install the Delivery plan visibility SQL if it is missing.')
  }
  const walletIds = idsFromRpc(wallet.data)
  const planIds = idsFromRpc(plan.data)
  const polygonIds = idsFromRpc(serviceArea.data)
  return new Set(ids.filter((id) => walletIds.has(id) && planIds.has(id) && polygonIds.has(id)))
}

function getGpsError(error) {
  if (error?.code === 1) return 'Location permission was denied. Allow GPS access or choose another destination on the map.'
  if (error?.code === 2) return 'Your location is unavailable. Enable location services, or choose another destination on the map.'
  if (error?.code === 3) return 'GPS timed out. Please try again or select a location on the map.'
  return 'We could not read your GPS location. You can still choose a destination on the map.'
}

function saveDestination(location) {
  try {
    sessionStorage.setItem(DESTINATION_KEY, JSON.stringify({
      latitude: location.latitude,
      longitude: location.longitude,
      source: location.source,
      accuracy: location.source === 'gps' ? location.accuracy || null : null,
      selectedAt: Date.now(),
      // Saved address fields only, when chosen from an authenticated account.
      ...(location.source === 'saved' ? {
        savedAddressId: location.savedAddressId,
        ownerUserId: location.ownerUserId,
        label: location.label,
        addressLine1: location.addressLine1,
        addressLine2: location.addressLine2,
        landmark: location.landmark,
        city: location.city,
        state: location.state,
        pincode: location.pincode,
        recipientName: location.recipientName,
        recipientMobile: location.recipientMobile,
      } : {}),
    }))
  } catch {
    // Session storage can be disabled. Location discovery still works.
  }
}

const DD_CATEGORIES = [
  { id: 'food', icon: '🍲', title: 'Food', bg: 'bg-orange-50' },
  { id: 'groceries', icon: '🛒', title: 'Groceries', bg: 'bg-emerald-50' },
  { id: 'fruits', icon: '🍎', title: 'Fruits', bg: 'bg-rose-50' },
  { id: 'vegetables', icon: '🥦', title: 'Vegetables', bg: 'bg-lime-50' },
]

function Icon({ name, className = 'h-5 w-5' }) {
  const paths = {
    home: <><path d="m3 10 9-7 9 7v10H3z" /><path d="M9 20v-7h6v7" /></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    bag: <><rect x="4" y="7" width="16" height="14" rx="2" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    arrow: <><path d="M5 12h14m-6-6 6 6-6 6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l4 2" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-5 16-5 16 0" /></>,
    chevron: <path d="m6 9 6 6 6-6" />,
  }
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {paths[name] || paths.bag}
    </svg>
  )
}

function storePicture(store) {
  const uri = String(store?.banner_url ?? store?.bannerUrl ?? store?.logo_url ?? store?.logoUrl ?? '').trim()
  return /^https:\/\//i.test(uri) ? uri : ''
}

function DeliveryCustomerHomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const requestedHomeView = ['orders', 'account'].includes(searchParams?.get('view')) && !searchParams?.get('store')
    ? searchParams.get('view') : ''
  const forceChoose = searchParams?.get('choose') === '1' || Boolean(requestedHomeView)
  const requestedStoreCode = String(searchParams?.get('store') || '').trim()
  const inlineStoreCode = VALID_STORE_CODE.test(requestedStoreCode) ? requestedStoreCode : ''
  const requestedStoreView = ['orders', 'account'].includes(searchParams?.get('view')) ? searchParams.get('view') : ''
  const hasVisitedStoreRef = useRef(false)
  const requestSequenceRef = useRef(0)
  const mapOpenRef = useRef(false)
  const hasSelectedDestinationRef = useRef(false)

  const [stage, setStage] = useState('loading')
  const [initialAddressResolved, setInitialAddressResolved] = useState(false)
  const [message, setMessage] = useState('Detecting your current location…')
  const [error, setError] = useState('')
  const [destination, setDestination] = useState(null)
  const [stores, setStores] = useState([])
  const [openingStore, setOpeningStore] = useState('')
  const [mapOpen, setMapOpen] = useState(false)
  const [draftPin, setDraftPin] = useState(null)
  const [latitudeInput, setLatitudeInput] = useState('')
  const [longitudeInput, setLongitudeInput] = useState('')
  const [mapError, setMapError] = useState('')
  const [locating, setLocating] = useState(false)
  const [storeSearch, setStoreSearch] = useState('')
  const [accountLabel, setAccountLabel] = useState('Guest')
  const [categoryChoice, setCategoryChoice] = useState('')
  const [lastStoreCode, setLastStoreCode] = useState('')

  useEffect(() => {
    try {
      const stored = sessionStorage.getItem('dd_delivery_last_store_code_v1') || localStorage.getItem('digitaldine_delivery_last_store_code') || ''
      if (VALID_STORE_CODE.test(stored)) setLastStoreCode(stored)
    } catch { /* Browser storage is optional. */ }
  }, [])

  useEffect(() => {
    let active = true
    const loadLabel = async () => {
      setAccountLabel('Guest')
      try {
        // Verify the same identity as the account overview: Mobile/PIN cookie
        // is preferred even if a different Google session exists in the browser.
        const { data } = await supabase.auth.getSession()
        const token = data?.session?.access_token || ''
        const response = await fetch('/api/delivery/customer/overview?summaryOnly=1', {
          credentials: 'same-origin', cache: 'no-store',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        })
        const payload = await response.json().catch(() => ({}))
        if (active && response.ok && payload.success === true && payload.account?.name) {
          setAccountLabel(String(payload.account.name))
        }
      } catch { /* Profile label is optional; never guess an account identity. */ }
    }
    void loadLabel()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      // Schedule outside Supabase auth callback to avoid an auth-lock deadlock.
      Promise.resolve().then(() => { if (active) void loadLabel() })
    })
    return () => { active = false; subscription?.unsubscribe() }
  }, [requestedHomeView])

  const rankedStores = useMemo(() => stores, [stores])
  const visibleStores = useMemo(
    () => rankedStores.filter((item, index) =>
      storeName(item.store, index).toLowerCase().includes(storeSearch.trim().toLowerCase())),
    [rankedStores, storeSearch]
  )

  const backToMarketplace = useCallback(() => {
    hasVisitedStoreRef.current = true
    setOpeningStore('')
    if (stores.length) setStage('ready')
    // choose=1 intentionally prevents auto-opening the only eligible store again.
    router.push('/delivery?choose=1', { scroll: false })
  }, [router, stores.length])

  const openLastStoreView = useCallback((view = '') => {
    if (view === 'orders' || view === 'account') {
      // Orders/Profile are global Delivery app tabs, not a store sub-page.
      // The backend verifies the active identity (Mobile/PIN before Google).
      hasVisitedStoreRef.current = true
      router.push(`/delivery?view=${view}&choose=1`, { scroll: false })
      return
    }
    if (VALID_STORE_CODE.test(lastStoreCode)) {
      hasVisitedStoreRef.current = true
      router.push(`/delivery?store=${encodeURIComponent(lastStoreCode)}`, { scroll: false })
      return
    }
    document.getElementById('dm-nearby-stores')?.scrollIntoView({ behavior: 'smooth' })
  }, [lastStoreCode, router])

  const openStore = useCallback((item) => {
    const code = item?.code || restaurantCode(item?.store || item)
    if (!VALID_STORE_CODE.test(code)) {
      setError('This store has an invalid store code. Please select another store.')
      setStage('error')
      return
    }
    setOpeningStore(code)
    try {
      sessionStorage.setItem('dd_delivery_last_store_code_v1', code)
      localStorage.setItem('digitaldine_delivery_last_store_code', code)
    } catch { /* optional */ }
    hasVisitedStoreRef.current = true
    // Blinkit-like in-app navigation: /delivery stays mounted; only the
    // selected store view changes. Back restores the nearby-store list.
    window.scrollTo({ top: 0, behavior: 'instant' })
    router.push(`/delivery?store=${encodeURIComponent(code)}`, { scroll: false })
  }, [router])

  const discoverStores = useCallback(async (point) => {
    const sequence = ++requestSequenceRef.current
    setStage('loading')
    setError('')
    setMessage('Finding stores that deliver to the selected location…')
    setOpeningStore('')
    setStores([])

    try {
      const location = parsePoint(point?.latitude, point?.longitude)
      if (!location) throw new Error('Please choose a valid delivery location.')

      const { data, error: nearbyError } = await supabase.rpc('get_nearby_delivery_stores', {
        p_latitude: location.latitude,
        p_longitude: location.longitude,
      })
      if (nearbyError) throw nearbyError
      if (!data?.success) throw new Error(data?.message || 'Unable to find nearby delivery stores.')
      if (requestSequenceRef.current !== sequence) return

      const nearbyStores = Array.isArray(data?.stores) ? data.stores : []
      if (!nearbyStores.length) {
        setStage('empty')
        return
      }
      setMessage('Checking Delivery plans, approval and wallet availability…')
      const eligibleIds = await eligibleRestaurantIds(nearbyStores, location)
      if (requestSequenceRef.current !== sequence) return

      const eligible = normalizeEligibleStores(nearbyStores, eligibleIds)
      if (!eligible.length) {
        setStage('empty')
        return
      }

      setStores(eligible)
      // Signed-in customers must be able to choose an existing saved address.
      // Preserve the previous automatic one-store behavior for guests and
      // for explicitly selected recipient destinations.
      const authResult = await supabase.auth.getUser()
      const hasAccount = Boolean(authResult.data?.user?.id)
      if (requestSequenceRef.current !== sequence) return
      const explicitDestination = point?.source === 'saved' || point?.source === 'manual'
      if (eligible.length === 1 && !forceChoose && !hasVisitedStoreRef.current && !inlineStoreCode && (!hasAccount || explicitDestination)) {
        setStage('redirecting')
        setMessage('Opening the available delivery store…')
        openStore(eligible[0])
        return
      }
      setStage('ready')
    } catch (lookupError) {
      if (requestSequenceRef.current !== sequence) return
      console.error('[DELIVERY] Store discovery failed:', lookupError)
      setError(lookupError?.message || 'We could not load nearby stores.')
      setStage('error')
    }
  }, [forceChoose, inlineStoreCode, openStore])

  const applyDestination = useCallback((point) => {
    const parsed = parsePoint(point?.latitude, point?.longitude)
    if (!parsed) {
      setMapError('Choose a valid latitude and longitude.')
      return
    }
    const next = {
      ...parsed,
      source: point?.source === 'gps' ? 'gps' : point?.source === 'saved' ? 'saved' : 'manual',
      accuracy: Number(point?.accuracy || 0) || null,
      ...(point?.source === 'saved' ? {
        savedAddressId: point.savedAddressId,
        ownerUserId: point.ownerUserId,
        label: point.label,
        addressLine1: point.addressLine1,
        addressLine2: point.addressLine2,
        landmark: point.landmark,
        city: point.city,
        state: point.state,
        pincode: point.pincode,
        recipientName: point.recipientName,
        recipientMobile: point.recipientMobile,
      } : {}),
    }
    hasSelectedDestinationRef.current = true
    setDestination(next)
    saveDestination(next)
    setMapError('')
    mapOpenRef.current = false
    setMapOpen(false)
    void discoverStores(next)
  }, [discoverStores])

  const requestGps = useCallback((onSuccess, onError) => {
    if (typeof window === 'undefined' || !window.isSecureContext || !navigator.geolocation) {
      onError(new Error('Location requires HTTPS (or localhost) and a supported browser.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const point = parsePoint(position?.coords?.latitude, position?.coords?.longitude)
        if (!point) {
          onError(new Error('GPS returned invalid coordinates.'))
          return
        }
        onSuccess({ ...point, source: 'gps', accuracy: Number(position?.coords?.accuracy || 0) || null })
      },
      (geoError) => onError(new Error(getGpsError(geoError))),
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }
    )
  }, [])

  const detectCurrentGps = useCallback(() => {
    setLocating(true)
    setError('')
    const sequence = ++requestSequenceRef.current
    setStage('loading')
    setMessage('Detecting your current location…')
    requestGps(
      (location) => {
        if (requestSequenceRef.current !== sequence) return
        setLocating(false)
        // Do not close the recipient picker if the initial GPS returns late.
        if (mapOpenRef.current || hasSelectedDestinationRef.current) return
        applyDestination(location)
      },
      (gpsError) => {
        if (requestSequenceRef.current !== sequence) return
        setLocating(false)
        setError(gpsError?.message || 'Unable to detect GPS.')
        setStage('error')
      }
    )
  }, [applyDestination, requestGps])

  useEffect(() => {
    if (inlineStoreCode || hasSelectedDestinationRef.current || !initialAddressResolved) return undefined
    detectCurrentGps()
    return () => { requestSequenceRef.current += 1 }
    // Avoid invalidating in-flight nearby-store requests on GPS state changes.
  }, [detectCurrentGps, inlineStoreCode, initialAddressResolved])

  const previousEmbeddedStoreRef = useRef(inlineStoreCode)
  useEffect(() => {
    const previous = previousEmbeddedStoreRef.current
    previousEmbeddedStoreRef.current = inlineStoreCode
    if (previous && !inlineStoreCode) {
      hasVisitedStoreRef.current = true
      setOpeningStore('')
      if (stores.length) setStage('ready')
    }
  }, [inlineStoreCode, stores.length])

  const openMap = () => {
    // If permission is denied, the map can still be used for manual selection.
    const point = destination || { latitude: 20.5937, longitude: 78.9629 }
    setDraftPin(point)
    setLatitudeInput(point.latitude.toFixed(7))
    setLongitudeInput(point.longitude.toFixed(7))
    setMapError('')
    mapOpenRef.current = true
    setMapOpen(true)
  }

  const closeMap = () => {
    mapOpenRef.current = false
    setMapOpen(false)
    // If GPS never completed and no manual pin was confirmed, retry discovery.
    if (!destination && stage === 'loading') detectCurrentGps()
  }

  const setPin = (latitude, longitude) => {
    const point = parsePoint(latitude, longitude)
    if (!point) return
    setDraftPin(point)
    setLatitudeInput(point.latitude.toFixed(7))
    setLongitudeInput(point.longitude.toFixed(7))
    setMapError('')
  }

  const placeCoordinatePin = () => {
    const latitude = latitudeInput.trim()
    const longitude = longitudeInput.trim()
    const point = parsePoint(latitude, longitude)
    if (!point) {
      setMapError('Enter a valid latitude (-90 to 90) and longitude (-180 to 180).')
      return
    }
    setPin(point.latitude, point.longitude)
  }

  const useGpsInMap = () => {
    setLocating(true)
    setMapError('')
    requestGps(
      (point) => { setLocating(false); setPin(point.latitude, point.longitude) },
      (gpsError) => { setLocating(false); setMapError(gpsError?.message || 'Unable to use GPS.') }
    )
  }

  // Orders and Profile are application-level screens. Do not mount a store
  // to show these tabs, even when no store has ever been visited.
  if (requestedHomeView) {
    return <DeliveryAccountCenter view={requestedHomeView} onGoHome={backToMarketplace} />
  }

  // The store renders INSIDE the /delivery route without iframe or redirect.
  // Its cart/payment/account state is owned by the original store component.
  if (inlineStoreCode) {
    return (
      <DeliveryStoreExperience
        key={inlineStoreCode}
        restaurantCode={inlineStoreCode}
        initialView={requestedStoreView}
        onBackToStores={backToMarketplace}
      />
    )
  }

  const scrollToStores = () =>
    document.getElementById('dm-nearby-stores')?.scrollIntoView({ behavior: 'smooth' })

  return (
    <div className="min-h-[100dvh] bg-[#f6f7f9] pb-24 text-slate-900">
      {/* TOP BAR: location + profile */}
      <header className="sticky top-0 z-30 bg-white shadow-[0_1px_0_rgba(15,23,42,0.06)]">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-3 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
          <button
            type="button"
            onClick={openMap}
            className="flex min-w-0 flex-1 items-center gap-2 text-left"
            aria-label="Change delivery location"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white">
              <Icon name="pin" className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                Delivering to
              </span>
              <span className="flex items-center gap-1 text-sm font-bold text-slate-900">
                <span className="truncate">{destination ? 'Selected location' : 'Detecting location…'}</span>
                <Icon name="chevron" className="h-4 w-4 shrink-0 text-slate-500" />
              </span>
            </span>
          </button>

          <button
            type="button"
            onClick={() => openLastStoreView('account')}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-sm font-bold text-white"
            aria-label="Open account"
          >
            {accountLabel === 'Guest' ? <Icon name="user" className="h-5 w-5" /> : accountLabel.slice(0, 1).toUpperCase()}
          </button>
        </div>

        {/* Saved address picker stays mounted for its own logic */}
        <div className="mx-auto w-full max-w-6xl px-4 sm:px-6">
          <DeliverySavedAddressPicker
            destination={destination}
            autoApplyDefault
            onSelect={applyDestination}
            onReady={() => setInitialAddressResolved(true)}
          />
        </div>

        {/* SEARCH */}
        <div className="mx-auto w-full max-w-6xl px-4 pb-4 pt-2 sm:px-6">
          <label className="flex h-12 items-center gap-3 rounded-2xl bg-slate-100 px-4 focus-within:bg-white focus-within:ring-2 focus-within:ring-emerald-500">
            <Icon name="search" className="h-5 w-5 text-slate-500" />
            <input
              value={storeSearch}
              onChange={(event) => setStoreSearch(event.target.value)}
              placeholder="Search nearby stores"
              aria-label="Search nearby stores"
              className="min-w-0 flex-1 bg-transparent text-base text-slate-900 outline-none placeholder:text-slate-500 sm:text-sm"
            />
            {storeSearch && (
              <button
                type="button"
                onClick={() => setStoreSearch('')}
                aria-label="Clear search"
                className="text-lg leading-none text-slate-500"
              >
                ×
              </button>
            )}
          </label>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pt-4 sm:px-6">
        {/* PROMO BANNER */}
        <section
          aria-label="Shop locally"
          className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-600 to-emerald-800 p-6 text-white shadow-lg shadow-emerald-900/10 sm:p-10"
        >
          <div className="relative z-10 max-w-md">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-emerald-100">
              Your local marketplace
            </p>
            <h1 className="mt-2 text-2xl font-black leading-tight sm:text-4xl">
              Fresh finds,<br />delivered fast.
            </h1>
            <p className="mt-2 text-sm text-emerald-50/90 sm:text-base">
              Food, groceries and daily essentials from stores near you.
            </p>
            <button
              type="button"
              onClick={scrollToStores}
              className="mt-5 inline-flex h-11 items-center gap-2 rounded-xl bg-white px-5 text-sm font-bold text-emerald-800 shadow-sm hover:bg-emerald-50"
            >
              Shop now <Icon name="arrow" className="h-4 w-4" />
            </button>
          </div>
          <div className="pointer-events-none absolute -bottom-6 -right-4 flex gap-2 text-5xl opacity-90 sm:text-7xl" aria-hidden="true">
            <span>🥬</span><span>🍎</span><span>🥕</span>
          </div>
        </section>

        {/* CATEGORIES */}
        <section aria-label="Shopping categories" className="mt-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-black">Shop by category</h2>
            <button type="button" onClick={scrollToStores} className="text-sm font-semibold text-emerald-700">
              See all
            </button>
          </div>
          <div className="grid grid-cols-4 gap-3 sm:gap-5">
            {DD_CATEGORIES.map((entry) => (
              <button
                type="button"
                key={entry.id}
                aria-pressed={categoryChoice === entry.id}
                onClick={() => {
                  setCategoryChoice(entry.id)
                  scrollToStores()
                }}
                className={`flex flex-col items-center gap-2 rounded-2xl p-2 transition ${
                  categoryChoice === entry.id ? 'ring-2 ring-emerald-500' : ''
                }`}
              >
                <span className={`flex h-16 w-16 items-center justify-center rounded-2xl text-3xl shadow-sm sm:h-20 sm:w-20 ${entry.bg}`}>
                  {entry.icon}
                </span>
                <span className="text-xs font-semibold text-slate-700 sm:text-sm">{entry.title}</span>
              </button>
            ))}
          </div>
        </section>

        {/* NEARBY STORES */}
        <section id="dm-nearby-stores" aria-label="Available nearby stores" className="scroll-mt-40 mt-8">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <h2 className="text-lg font-black">Stores near you</h2>
              {stage === 'ready' && (
                <p className="text-xs text-slate-500">
                  {rankedStores.length} {rankedStores.length === 1 ? 'store' : 'stores'} delivering to you
                </p>
              )}
            </div>
          </div>

          {(stage === 'loading' || stage === 'redirecting') && (
            <div role="status" className="flex flex-col items-center gap-3 rounded-2xl bg-white p-8 text-center shadow-sm">
              <span className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-600" aria-hidden="true" />
              <p className="text-sm font-bold">{stage === 'redirecting' ? 'Opening your store…' : 'Finding stores…'}</p>
              <p className="text-xs text-slate-500">{message}</p>
            </div>
          )}

          {(stage === 'error' || stage === 'empty') && (
            <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl bg-white p-8 text-center shadow-sm">
              <span className="text-4xl" aria-hidden="true">📍</span>
              <p className="font-bold">{stage === 'empty' ? 'No stores deliver here yet' : 'Unable to find stores'}</p>
              <p className="max-w-sm text-sm text-slate-500">
                {stage === 'empty'
                  ? 'Try another delivery location. Only approved stores with active plans and sufficient wallet balance appear.'
                  : error}
              </p>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new Event('digitaldine:select-address'))}
                  className="h-10 rounded-xl bg-slate-900 px-4 text-sm font-semibold text-white"
                >
                  Select address
                </button>
                <button
                  type="button"
                  onClick={detectCurrentGps}
                  className="h-10 rounded-xl border border-slate-300 bg-white px-4 text-sm font-semibold"
                >
                  Retry GPS
                </button>
              </div>
            </div>
          )}

          {stage === 'ready' && (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 sm:gap-5">
                {visibleStores.map((item, index) => {
                  const picture = storePicture(item.store)
                  const busy = openingStore === item.code
                  return (
                    <button
                      type="button"
                      key={`${item.id}:${item.code}`}
                      disabled={Boolean(openingStore)}
                      onClick={() => openStore(item)}
                      className="group overflow-hidden rounded-2xl bg-white text-left shadow-sm ring-1 ring-slate-200/70 transition hover:-translate-y-0.5 hover:shadow-md disabled:opacity-60"
                    >
                      <div className="relative flex h-28 items-center justify-center bg-gradient-to-br from-slate-100 to-slate-200 sm:h-36">
                        {picture ? (
                          <img src={picture} alt="" loading="lazy" className="h-full w-full object-cover" />
                        ) : (
                          <span className="text-4xl" aria-hidden="true">🛍️</span>
                        )}
                        <span className="absolute left-2 top-2 rounded-md bg-emerald-600 px-2 py-0.5 text-[10px] font-bold text-white">
                          OPEN
                        </span>
                      </div>
                      <div className="p-3">
                        <p className="line-clamp-1 text-sm font-bold text-slate-900">{storeName(item.store, index)}</p>
                        <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                          <Icon name="pin" className="h-3.5 w-3.5" />
                          {distanceLabel(item.distance)}
                        </p>
                        <p className="mt-1 text-[11px] text-slate-400">Store {item.code}</p>
                        {busy && <p className="mt-2 text-xs font-semibold text-emerald-700">Opening…</p>}
                      </div>
                    </button>
                  )
                })}
              </div>
              {visibleStores.length === 0 && (
                <p className="mt-6 text-center text-sm text-slate-500">No nearby stores match your search.</p>
              )}
            </>
          )}
        </section>
      </main>

      {/* BOTTOM NAV */}
      <nav
        aria-label="Delivery navigation"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 backdrop-blur pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto grid max-w-3xl grid-cols-5">
          <button type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} className="flex flex-col items-center gap-1 py-2.5 text-emerald-700">
            <Icon name="home" className="h-5 w-5" />
            <span className="text-[11px] font-semibold">Home</span>
          </button>
          <button type="button" onClick={scrollToStores} className="flex flex-col items-center gap-1 py-2.5 text-slate-500">
            <Icon name="search" className="h-5 w-5" />
            <span className="text-[11px] font-semibold">Explore</span>
          </button>
          <button
            type="button"
            onClick={() => (lastStoreCode ? openLastStoreView() : scrollToStores())}
            aria-label="Open shopping store"
            className="flex flex-col items-center gap-1 py-1.5"
          >
            <span className="-mt-6 flex h-14 w-14 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg shadow-emerald-600/30">
              <Icon name="bag" className="h-6 w-6" />
            </span>
            <span className="text-[11px] font-semibold text-slate-600">Shop</span>
          </button>
          <button type="button" onClick={() => openLastStoreView('orders')} className="flex flex-col items-center gap-1 py-2.5 text-slate-500">
            <Icon name="clock" className="h-5 w-5" />
            <span className="text-[11px] font-semibold">Orders</span>
          </button>
          <button type="button" onClick={() => openLastStoreView('account')} className="flex flex-col items-center gap-1 py-2.5 text-slate-500">
            <Icon name="user" className="h-5 w-5" />
            <span className="text-[11px] font-semibold">Profile</span>
          </button>
        </div>
      </nav>

      {/* LOCATION MAP MODAL */}
      {mapOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 p-0 sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Choose delivery location">
          <div className="w-full max-w-lg rounded-t-3xl bg-white p-5 shadow-2xl sm:rounded-3xl sm:p-6">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-black">Choose delivery location</h2>
              <button type="button" onClick={closeMap} className="h-9 w-9 rounded-full bg-slate-100 text-lg" aria-label="Close">×</button>
            </div>

            <div className="mb-4 flex flex-col gap-2 sm:flex-row">
              <button
                type="button"
                onClick={useGpsInMap}
                disabled={locating}
                className="h-11 flex-1 rounded-xl bg-emerald-600 text-sm font-bold text-white disabled:opacity-60"
              >
                {locating ? 'Detecting…' : 'Use my current location'}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="text-xs font-semibold text-slate-600">
                Latitude
                <input
                  value={latitudeInput}
                  onChange={(e) => setLatitudeInput(e.target.value)}
                  inputMode="decimal"
                  className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-base text-slate-900 outline-none focus:border-emerald-500 sm:text-sm"
                />
              </label>
              <label className="text-xs font-semibold text-slate-600">
                Longitude
                <input
                  value={longitudeInput}
                  onChange={(e) => setLongitudeInput(e.target.value)}
                  inputMode="decimal"
                  className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-base text-slate-900 outline-none focus:border-emerald-500 sm:text-sm"
                />
              </label>
            </div>

            {mapError && (
              <p role="alert" className="mt-3 rounded-xl bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700">
                {mapError}
              </p>
            )}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={placeCoordinatePin}
                className="h-11 flex-1 rounded-xl border border-slate-300 text-sm font-semibold"
              >
                Place pin
              </button>
              <button
                type="button"
                onClick={() => draftPin && applyDestination({ ...draftPin, source: 'manual' })}
                disabled={!draftPin}
                className="h-11 flex-1 rounded-xl bg-slate-900 text-sm font-semibold text-white disabled:opacity-50"
              >
                Confirm location
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// Next.js 16 prerenders /delivery. useSearchParams() in the client content
// must render beneath Suspense so the surrounding route can prerender.
// The fallback is intentionally free of navigation/search-param hooks.
function DeliveryHomeLoadingFallback() {
  return (
    <main className="min-h-[100dvh] bg-[#f6f7f9] text-slate-950">
      <div className="mx-auto min-h-[100dvh] w-full max-w-6xl px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <section className="mt-5 flex flex-col items-center gap-3 rounded-2xl bg-white p-8 text-center shadow-sm" role="status" aria-live="polite">
          <span className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-600" aria-hidden="true" />
          <p className="text-sm font-semibold text-slate-600">Loading delivery locations…</p>
        </section>
      </div>
    </main>
  )
}

export default function DeliveryCustomerHome() {
  return (
    <Suspense fallback={<DeliveryHomeLoadingFallback />}>
      <DeliveryCustomerHomeContent />
    </Suspense>
  )
}