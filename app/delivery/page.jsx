'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import DeliveryLocationMap from '@/app/components/DeliveryLocationMap'
import DeliveryAddressBook from '@/app/components/DeliveryAddressBook'

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

function DeliveryCustomerHomeContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const forceChoose = searchParams?.get('choose') === '1'
  const requestSequenceRef = useRef(0)
  const mapOpenRef = useRef(false)

  const [stage, setStage] = useState('loading')
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
  const rankedStores = useMemo(() => stores, [stores])

  const openStore = useCallback((item) => {
    const code = item?.code || restaurantCode(item?.store || item)
    if (!VALID_STORE_CODE.test(code)) {
      setError('This store has an invalid store code. Please select another store.')
      setStage('error')
      return
    }
    setOpeningStore(code)
    router.push(`/delivery/${encodeURIComponent(code)}`)
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
      if (eligible.length === 1 && !forceChoose && (!hasAccount || explicitDestination)) {
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
  }, [forceChoose, openStore])

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
        if (mapOpenRef.current) return
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
    detectCurrentGps()
    return () => { requestSequenceRef.current += 1 }
    // In React StrictMode development this effect re-runs; stale callbacks are ignored.
  }, [detectCurrentGps])

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

  return (
    <main className="min-h-[100dvh] bg-[#f5f7f6] text-slate-950">
      <div className="mx-auto min-h-[100dvh] w-full max-w-[540px] px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        {/* Customer account address book (GPS + saved address + recipient). */}
        <DeliveryAddressBook
          destination={destination}
          onUseLocation={applyDestination}
          onUseCurrentGps={detectCurrentGps}
          onOpenMap={openMap}
        />

        {stage === 'loading' || stage === 'redirecting' ? (
          <section className="mt-5 rounded-[24px] border border-slate-200 bg-white p-7 text-center shadow-sm" aria-live="polite">
            <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-600" role="status" aria-label="Loading" />
            <p className="mt-4 text-sm font-semibold text-slate-600">{message}</p>
          </section>
        ) : null}

        {stage === 'error' || stage === 'empty' ? (
          <section className="mt-5 rounded-[24px] border border-slate-200 bg-white p-6 shadow-sm" aria-live="polite">
            <h1 className="text-lg font-black text-slate-950">{stage === 'empty' ? 'No delivery stores found' : 'Unable to find stores'}</h1>
            <p className="mt-2 text-sm leading-6 text-slate-600">{stage === 'empty' ? 'No open, approved and eligible delivery store currently serves this location. Try another delivery pin.' : error}</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <button type="button" onClick={openMap} className="rounded-xl bg-emerald-600 px-3 py-3 text-xs font-black text-white">Choose on map</button>
              <button type="button" onClick={detectCurrentGps} disabled={locating} className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-xs font-black text-slate-900 disabled:opacity-50">Retry GPS</button>
            </div>
          </section>
        ) : null}

        {stage === 'ready' ? (
          <section className="mt-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <h1 className="text-[20px] font-black tracking-tight text-slate-950">Available near you</h1>
                <p className="mt-1 text-xs text-slate-500">{rankedStores.length} {rankedStores.length === 1 ? 'store' : 'stores'} deliver to this location</p>
              </div>
              <button type="button" onClick={detectCurrentGps} disabled={locating} className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-black text-slate-700 disabled:opacity-50">
                {locating ? 'Locating…' : 'Use my GPS'}
              </button>
            </div>

            <div className="grid gap-3">
              {rankedStores.map((item, index) => {
                const loading = openingStore === item.code
                return (
                  <button key={`${item.id}:${item.code}`} type="button" onClick={() => openStore(item)} disabled={loading}
                    className="w-full rounded-[24px] border border-slate-200 bg-white p-4 text-left shadow-[0_5px_18px_rgba(15,23,42,0.04)] transition-colors hover:border-emerald-300 focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-500 disabled:opacity-60">
                    <div className="flex items-center gap-4">
                      <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] bg-emerald-50 text-3xl" aria-hidden="true">🏬</span>
                      <div className="min-w-0 flex-1">
                        <h2 className="truncate text-[19px] font-black leading-6 text-slate-950">{storeName(item.store, index)}</h2>
                        <p className="mt-1.5 text-sm font-semibold text-slate-500">{distanceLabel(item.distance)} <span aria-hidden="true">·</span> Store {item.code}</p>
                        <p className="mt-2 text-xs text-emerald-700">Browse menu and order</p>
                      </div>
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-slate-950 text-xl text-white" aria-hidden="true">→</span>
                    </div>
                  </button>
                )
              })}
            </div>
          </section>
        ) : null}
      </div>

      {mapOpen && (
        <div className="fixed inset-0 z-[100] flex flex-col bg-white text-slate-950" role="dialog" aria-modal="true" aria-label="Choose delivery GPS location">
          <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <button type="button" onClick={closeMap} aria-label="Close location picker" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-200 text-lg font-bold">←</button>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-black">Choose delivery location</h2>
              <p className="text-xs text-slate-500">For yourself or someone else</p>
            </div>
            <button type="button" onClick={useGpsInMap} disabled={locating} className="shrink-0 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 disabled:opacity-60">{locating ? 'Locating…' : '◎ My GPS'}</button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden bg-slate-100">
            {draftPin && (
              <DeliveryLocationMap latitude={draftPin.latitude} longitude={draftPin.longitude} onChange={({ latitude, longitude }) => setPin(latitude, longitude)} height={Math.max(320, typeof window !== 'undefined' ? window.innerHeight - 365 : 430)} zoom={15} />
            )}
          </div>
          <div className="shrink-0 border-t border-slate-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-3">
            <p className="text-xs font-bold text-slate-700">Tap or drag the pin to your recipient's location.</p>
            <div className="mt-3 flex gap-2">
              <label className="min-w-0 flex-1 text-[10px] font-bold text-slate-500">Latitude
                <input type="text" inputMode="decimal" value={latitudeInput} onChange={(event) => setLatitudeInput(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900" placeholder="Latitude" />
              </label>
              <label className="min-w-0 flex-1 text-[10px] font-bold text-slate-500">Longitude
                <input type="text" inputMode="decimal" value={longitudeInput} onChange={(event) => setLongitudeInput(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm font-semibold text-slate-900" placeholder="Longitude" />
              </label>
              <button type="button" onClick={placeCoordinatePin} className="self-end rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-black text-slate-700">Set pin</button>
            </div>
            {mapError && <p role="alert" className="mt-2 text-xs font-semibold text-red-600">{mapError}</p>}
            <button type="button" onClick={() => applyDestination({ ...draftPin, source: 'manual' })} disabled={!draftPin} className="mt-3 w-full rounded-2xl bg-emerald-600 px-5 py-3.5 text-sm font-black text-white disabled:opacity-50">
              Use this delivery location
            </button>
            <p className="mt-2 text-center text-[11px] text-slate-500">Confirm the full delivery address again at checkout.</p>
          </div>
        </div>
      )}
    </main>
  )
}


// Next.js 16 prerenders /delivery. useSearchParams() in the client content
// must render beneath Suspense so the surrounding route can prerender.
// The fallback is intentionally free of navigation/search-param hooks.
function DeliveryHomeLoadingFallback() {
  return (
    <main className="min-h-[100dvh] bg-[#f5f7f6] text-slate-950">
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
