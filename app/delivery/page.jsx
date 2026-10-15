'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import DeliverySavedAddressPicker from '@/app/components/DeliverySavedAddressPicker'
import DeliveryStoreExperience from '@/app/components/DeliveryStoreExperience'
import '@/app/components/delivery-green-market.css'

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
  if (distance === null) return 'Delivers to this location'
  if (distance < 1) return `${Math.max(1, Math.round(distance * 1000))} m away`
  return `${distance.toFixed(distance < 10 ? 1 : 0)} km away`
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

async function eligibleRestaurantIds(stores) {
  const ids = [...new Set(stores.map(restaurantId).filter((id) => UUID_RE.test(id)))].slice(0, 100)
  if (!ids.length) throw new Error('Nearby store records are incomplete. Please try again later.')

  // BOTH must pass. The plan helper excludes Restaurant-only and Resort-only plans.
  const [wallet, plan] = await Promise.all([
    supabase.rpc('delivery_wallet_eligible_restaurant_ids', { p_restaurant_ids: ids }),
    supabase.rpc('delivery_plan_eligible_restaurant_ids', { p_restaurant_ids: ids }),
  ])
  if (wallet.error) throw new Error('Unable to verify the approval and wallet status of nearby stores.')
  if (plan.error) {
    console.error('[DELIVERY] Plan visibility verification failed:', plan.error)
    throw new Error('Unable to verify Delivery subscriptions. Install the Delivery plan visibility SQL if it is missing.')
  }
  const walletIds = idsFromRpc(wallet.data)
  const planIds = idsFromRpc(plan.data)
  return new Set(ids.filter((id) => walletIds.has(id) && planIds.has(id)))
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
  { id: 'food', icon: '🍲', title: 'Food', subtitle: 'Fresh meals', tint: 'peach' },
  { id: 'groceries', icon: '🛒', title: 'Groceries', subtitle: 'Daily essentials', tint: 'mint' },
  { id: 'fruits', icon: '🍎', title: 'Fruits', subtitle: 'Naturally good', tint: 'rose' },
  { id: 'vegetables', icon: '🥦', title: 'Vegetables', subtitle: 'Farm fresh', tint: 'lime' },
]

function DDIcon({ name, size = 20 }) {
  const icons = {
    home: <><path d="m3 10 9-7 9 7v10H3z" /><path d="M9 20v-7h6v7" /></>,
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>,
    bag: <><rect x="4" y="7" width="16" height="14" rx="2" /><path d="M9 8V6a3 3 0 0 1 6 0v2" /></>,
    search: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
    arrow: <><path d="M5 12h14m-6-6 6 6-6 6" /></>,
    clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l4 2" /></>,
    user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c0-5 16-5 16 0" /></>,
    gps: <><circle cx="12" cy="12" r="6" /><path d="M12 2v4m0 12v4M2 12h4m12 0h4" /></>,
    spark: <path d="m12 2 2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2Z" />,
    refresh: <><path d="M3 12a9 9 0 0 1 15-6l2 2" /><path d="M20 3v5h-5" /><path d="M21 12a9 9 0 0 1-15 6l-2-2" /><path d="M4 21v-5h5" /></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{icons[name] || icons.bag}</svg>
}

function storePicture(store) {
  const uri = String(store?.banner_url ?? store?.bannerUrl ?? store?.logo_url ?? store?.logoUrl ?? '').trim()
  return /^https:\/\//i.test(uri) ? uri : ''
}

function DeliveryCustomerHomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const forceChoose = searchParams?.get('choose') === '1'
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
    setAccountLabel('Guest')
    const loadLabel = async () => {
      // Same precedence as the store and My Orders APIs: a verified mobile
      // session for the last store overrides a stale Google browser session.
      if (VALID_STORE_CODE.test(lastStoreCode)) {
        try {
          const response = await fetch(`/api/delivery/customer/session?restaurantCode=${encodeURIComponent(lastStoreCode)}`, { credentials: 'same-origin', cache: 'no-store' })
          const payload = await response.json().catch(() => ({}))
          if (!active) return
          if (response.ok && payload?.success === true && payload?.accountType === 'mobile' && payload.customer?.name) {
            setAccountLabel(String(payload.customer.name))
            return
          }
        } catch { /* Optional session lookup; do not guess an identity. */ }
      }
      const { data, error } = await supabase.auth.getUser().catch(() => ({ data: null, error: true }))
      if (!active || error) return
      const user = data?.user
      if (user) setAccountLabel(String(user.user_metadata?.full_name || user.email?.split('@')[0] || 'Customer'))
    }
    void loadLabel()
    return () => { active = false }
  }, [lastStoreCode])
  const rankedStores = useMemo(() => stores, [stores])
  const visibleStores = useMemo(() => rankedStores.filter((item, index) => storeName(item.store, index).toLowerCase().includes(storeSearch.trim().toLowerCase())), [rankedStores, storeSearch])
  const activeCategory = DD_CATEGORIES.find((row) => row.id === categoryChoice)

  const backToMarketplace = useCallback(() => {
    hasVisitedStoreRef.current = true
    setOpeningStore('')
    if (stores.length) setStage('ready')
    // choose=1 intentionally prevents auto-opening the only eligible store again.
    router.push('/delivery?choose=1', { scroll: false })
  }, [router, stores.length])

  const openLastStoreView = useCallback((view = '') => {
    if (!VALID_STORE_CODE.test(lastStoreCode)) {
      router.push('/delivery/login?next=%2Fdelivery')
      return
    }
    hasVisitedStoreRef.current = true
    const suffix = view ? `&view=${encodeURIComponent(view)}` : ''
    router.push(`/delivery?store=${encodeURIComponent(lastStoreCode)}${suffix}`, { scroll: false })
  }, [lastStoreCode, router])


  const openStore = useCallback((item) => {
    const code = item?.code || restaurantCode(item?.store || item)
    if (!VALID_STORE_CODE.test(code)) {
      setError('This store has an invalid store code. Please select another store.')
      setStage('error')
      return
    }
    setOpeningStore(code)
    try { sessionStorage.setItem('dd_delivery_last_store_code_v1', code); localStorage.setItem('digitaldine_delivery_last_store_code', code) } catch { /* optional */ }
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
      const eligibleIds = await eligibleRestaurantIds(nearbyStores)
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

  return (
    <div className="dm-market dm-home">
      <header className="dm-home-top">
        <div className="dm-home-topinner">
          <button type="button" className="dm-profile-avatar" onClick={() => openLastStoreView('account')} aria-label="Open account">
            {accountLabel === 'Guest' ? '👤' : accountLabel.slice(0,1).toUpperCase()}
          </button>
          <div className="dm-greeting">
            <small>Hi, {accountLabel.length > 21 ? `${accountLabel.slice(0,21)}…` : accountLabel}</small>
            <strong className="dm-home-delivery-caption">Delivery from nearby stores</strong>
          </div>

        </div>
        <div className="dm-home-address-select">
          <DeliverySavedAddressPicker destination={destination} autoApplyDefault
            onSelect={applyDestination} onReady={() => setInitialAddressResolved(true)} />
        </div>
        <div className="dm-home-search">
          <DDIcon name="search" size={20} />
          <input value={storeSearch} onChange={(event) => setStoreSearch(event.target.value)} placeholder="Search nearby stores" aria-label="Search nearby stores" />
          {storeSearch && <button type="button" onClick={() => setStoreSearch('')} aria-label="Clear search">×</button>}
        </div>
      </header>

      <main className="dm-home-body">
        <section className="dm-promo" aria-label="Shop locally">
          <div>
            <span className="dm-promo-eyebrow">YOUR LOCAL MARKETPLACE</span>
            <h1>Fresh finds,<br />right at your door.</h1>
            <p>Explore food, groceries and everyday essentials from nearby stores.</p>
            <button type="button" onClick={() => document.getElementById('dm-nearby-stores')?.scrollIntoView({ behavior: 'smooth' })}>Shop now <DDIcon name="arrow" size={15}/></button>
          </div>
          <div className="dm-promo-illustration" aria-hidden="true"><span>🥬</span><span>🥑</span><span>🍎</span><span>🥕</span></div>
        </section>

        <section className="dm-home-section" aria-label="Shopping categories">
          <div className="dm-section-title"><h2>Categories</h2><button type="button" onClick={() => document.getElementById('dm-nearby-stores')?.scrollIntoView({ behavior: 'smooth' })}>See all</button></div>
          <div className="dm-category-icons">{DD_CATEGORIES.map((entry) => (
            <button type="button" key={entry.id} aria-pressed={categoryChoice===entry.id} className={`dm-category-option ${categoryChoice===entry.id ? 'selected' : ''}`}
              onClick={() => { setCategoryChoice(entry.id); document.getElementById('dm-nearby-stores')?.scrollIntoView({ behavior: 'smooth' }) }}>
              <span className="dm-category-bubble">{entry.icon}</span><span>{entry.title}</span>
            </button>
          ))}</div>
        </section>

        <section className="dm-home-section dm-nearby" id="dm-nearby-stores" aria-label="Available nearby stores">
          <div className="dm-section-title"><h2>Nearby stores</h2></div>
          {(stage === 'loading' || stage === 'redirecting') && <div className="dm-status" role="status"><span className="dm-spinner"/><strong>{stage === 'redirecting' ? 'Opening your store…' : 'Finding stores…'}</strong><p>{message}</p></div>}
          {(stage === 'error' || stage === 'empty') && <div className="dm-status" role="alert"><span className="dm-status-emoji">📍</span><strong>{stage === 'empty' ? 'No eligible stores here' : 'Unable to find stores'}</strong><p>{stage === 'empty' ? 'Choose another delivery pin. Only approved stores with active plans and sufficient wallet balance appear.' : error}</p><div className="dm-status-actions"><button type="button" onClick={() => window.dispatchEvent(new Event('digitaldine:select-address'))}>Select address</button><button type="button" onClick={detectCurrentGps}>Retry GPS</button></div></div>}
          {stage === 'ready' && <>
            <p className="dm-count">{rankedStores.length} eligible {rankedStores.length===1 ? 'store' : 'stores'} in delivery range</p>
            <div className="dm-store-grid">{visibleStores.map((item,index) => {
              const picture=storePicture(item.store)
              return <button type="button" className="dm-shop-card" key={`${item.id}:${item.code}`} disabled={openingStore===item.code} onClick={() => openStore(item)}>
                <div className="dm-shop-photo">{picture ? <img src={picture} alt="" loading="lazy"/> : <span>🛍️</span>}<span className="dm-shop-open">● Open</span></div>
                <div className="dm-shop-meta"><strong>{storeName(item.store,index)}</strong><span><DDIcon name="pin" size={13} /> {distanceLabel(item.distance)}</span><small>Store {item.code}</small></div>
              </button>
            })}</div>
            {visibleStores.length===0 && <p className="dm-hint">No nearby stores match your search.</p>}
          </>}
        </section>
      </main>
      <nav className="dm-tabbar" aria-label="Delivery navigation">
        <button type="button" className="active" onClick={() => window.scrollTo({top:0,behavior:'smooth'})}><DDIcon name="home"/><span>Home</span></button>
        <button type="button" onClick={() => document.getElementById('dm-nearby-stores')?.scrollIntoView({behavior:'smooth'})}><DDIcon name="search"/><span>Explore</span></button>
        <button type="button" className="dm-tab-main" onClick={() => lastStoreCode ? openLastStoreView() : document.getElementById('dm-nearby-stores')?.scrollIntoView({behavior:'smooth'})} aria-label="Open shopping store"><span className="dm-tab-main-bubble"><DDIcon name="bag"/></span><span>Shop</span></button>
        <button type="button" onClick={() => openLastStoreView('orders')}><DDIcon name="clock"/><span>Orders</span></button>
        <button type="button" onClick={() => openLastStoreView('account')}><DDIcon name="user"/><span>Profile</span></button>
      </nav>
    </div>
  )
}


// Next.js 16 prerenders /delivery. useSearchParams() in the client content
// must render beneath Suspense so the surrounding route can prerender.
// The fallback is intentionally free of navigation/search-param hooks.
function DeliveryHomeLoadingFallback() {
  return (
    <main className="min-h-[100dvh] bg-[#f6f8f6] text-slate-950">
      <div className="mx-auto min-h-[100dvh] w-full max-w-[540px] px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <section className="mt-5 rounded-[24px] border border-slate-200 bg-white p-7 text-center shadow-sm" role="status" aria-live="polite">
          <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-600" aria-hidden="true" />
          <p className="mt-4 text-sm font-semibold text-slate-600">Loading delivery locations…</p>
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