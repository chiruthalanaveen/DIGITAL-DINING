'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// app/delivery/page.jsx
// Location -> approved, wallet-eligible, Delivery-plan stores -> customer selection.
// The store page continues to handle login, account, My Orders, menu and checkout.

const VALID_STORE_CODE = /^[A-Za-z0-9_-]{1,80}$/
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

function validPoint(lat, lng) {
  return Number.isFinite(lat) && Number.isFinite(lng) &&
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180
}

function storeCodeOf(store) {
  return String(store?.restaurantCode ?? store?.restaurant_code ?? store?.storeCode ?? '').trim()
}

function restaurantIdOf(store) {
  return String(store?.restaurantId ?? store?.restaurant_id ?? '').trim().toLowerCase()
}

function storeNameOf(store) {
  return String(store?.name ?? store?.restaurantName ?? store?.restaurant_name ??
    store?.storeName ?? store?.store_name ?? 'Delivery store').trim()
}

function storeDistanceKm(store) {
  const km = store?.distanceKm ?? store?.distance_km ?? store?.distance ?? null
  if (km !== null && km !== undefined && km !== '') {
    const n = Number(km)
    if (Number.isFinite(n) && n >= 0) return n
  }
  const meters = store?.distanceMeters ?? store?.distance_meters ?? null
  if (meters !== null && meters !== undefined && meters !== '') {
    const n = Number(meters)
    if (Number.isFinite(n) && n >= 0) return n / 1000
  }
  return null
}

function distanceLabel(distance) {
  if (distance === null) return 'Serves your location'
  if (distance < 1) return `${Math.max(1, Math.round(distance * 1000))} m away`
  return `${distance.toFixed(2)} km away`
}

function storeIsOpen(store) {
  return store?.isOpen !== false && store?.is_open !== false &&
    String(store?.status || '').toLowerCase() !== 'closed'
}

function normalizeEligibleStores(stores, eligibleIds) {
  const seen = new Set()
  return (Array.isArray(stores) ? stores : [])
    .map((store, index) => ({
      store, index, code: storeCodeOf(store), id: restaurantIdOf(store),
      distance: storeDistanceKm(store),
    }))
    .filter((row) => VALID_STORE_CODE.test(row.code) && UUID_RE.test(row.id))
    .filter((row) => eligibleIds.has(row.id) && storeIsOpen(row.store))
    .filter((row) => {
      const key = row.id + ':' + row.code.toLowerCase()
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

function locationErrorMessage(error) {
  if (error?.code === 1) return 'Location permission is disabled. Allow location access for this website and retry.'
  if (error?.code === 2) return 'Your location is unavailable. Turn on GPS and try again.'
  if (error?.code === 3) return 'Location detection timed out. Try again with a clear GPS signal.'
  return 'Could not detect your location. Please try again.'
}

// Intersect independent database checks. Store listings alone are not trusted
// to determine whether a tenant purchased the Delivery module.
async function getEligibleIds(stores) {
  const ids = [...new Set(stores.map(restaurantIdOf).filter((id) => UUID_RE.test(id)))].slice(0, 100)
  if (!ids.length) throw new Error('Nearby store information is incomplete. Please try again later.')

  const [walletResult, planResult] = await Promise.all([
    supabase.rpc('delivery_wallet_eligible_restaurant_ids', {
      p_restaurant_ids: ids,
    }),
    supabase.rpc('delivery_plan_eligible_restaurant_ids', {
      p_restaurant_ids: ids,
    }),
  ])

  if (walletResult.error) {
    throw new Error('Could not verify store approval or wallet eligibility. Please try again.')
  }
  if (planResult.error) {
    console.error('[Delivery] Plan eligibility lookup failed:', planResult.error)
    throw new Error('Could not verify delivery subscription plans. Install the Delivery plan visibility SQL or try again.')
  }

  const resultIds = (data) => new Set((Array.isArray(data) ? data : []).map((row) =>
    String(typeof row === 'string' ? row : row?.restaurant_id ?? row?.restaurantId ?? '').trim().toLowerCase()
  ))
  const walletIds = resultIds(walletResult.data)
  const planIds = resultIds(planResult.data)
  return new Set(ids.filter((id) => walletIds.has(id) && planIds.has(id)))
}

export default function DeliveryCustomerHome() {
  const router = useRouter()
  const runRef = useRef(0)
  const mountedRef = useRef(false)
  const openingRef = useRef(false)
  const [stage, setStage] = useState('loading') // loading, choosing, opening, error
  const [message, setMessage] = useState('Finding delivery stores near you…')
  const [error, setError] = useState('')
  const [availableStores, setAvailableStores] = useState([])
  const [nearbyCount, setNearbyCount] = useState(0)

  const openStore = useCallback(async (row, auto = false) => {
    const code = row?.code || ''
    const id = row?.id || ''
    if (!VALID_STORE_CODE.test(code) || !UUID_RE.test(id)) {
      setError('This store is missing valid information. Please refresh nearby stores.')
      return
    }
    if (openingRef.current) return
    openingRef.current = true
    setStage('opening')
    setError('')
    setMessage(`Checking ${storeNameOf(row.store)}…`)

    try {
      // Re-check BOTH wallet/approval and purchased Delivery plan, because
      // an admin may change either after the list was displayed.
      const eligibleIds = await getEligibleIds([row.store])
      if (!eligibleIds.has(id)) {
        throw new Error('This store is no longer eligible for delivery orders. Choose another store.')
      }

      // Never select a previously visited / cached store: use the selected code.
      const target = `/delivery/${encodeURIComponent(code)}`
      setMessage(`Opening ${storeNameOf(row.store)}…`)
      if (auto) router.replace(target)
      else router.push(target)
    } catch (openError) {
      console.error('[Delivery] Store opening failed:', openError)
      setStage('choosing')
      setError(openError?.message || 'Unable to open this store.')
      openingRef.current = false
    }
  }, [router])

  const findStores = useCallback(() => {
    const run = ++runRef.current
    setStage('loading')
    setMessage('Checking your current location…')
    setError('')
    openingRef.current = false
    setNearbyCount(0)
    setAvailableStores([])

    if (typeof window === 'undefined' || !window.isSecureContext ||
        typeof navigator === 'undefined' || !navigator.geolocation) {
      setStage('error')
      setError('Location access requires HTTPS (or localhost) and a browser with location support.')
      return
    }

    navigator.geolocation.getCurrentPosition(
      async (position) => {
        if (!mountedRef.current || runRef.current !== run) return
        try {
          const lat = Number(position?.coords?.latitude)
          const lng = Number(position?.coords?.longitude)
          if (!validPoint(lat, lng)) {
            throw new Error('Your GPS location could not be verified. Please retry.')
          }
          setMessage('Checking all stores that can deliver to you…')
          const { data, error: lookupError } = await supabase.rpc('get_nearby_delivery_stores', {
            p_latitude: lat,
            p_longitude: lng,
          })
          if (!mountedRef.current || runRef.current !== run) return
          if (lookupError) throw lookupError
          if (!data?.success) throw new Error(data?.message || 'Unable to find nearby stores.')
          const stores = Array.isArray(data?.stores) ? data.stores : []
          setNearbyCount(stores.length)
          if (!stores.length) throw new Error('No delivery stores currently serve your location.')
          const eligibleIds = await getEligibleIds(stores)
          if (!mountedRef.current || runRef.current !== run) return
          const eligible = normalizeEligibleStores(stores, eligibleIds)
          if (!eligible.length) {
            throw new Error('No approved, open stores with an active Delivery module and ordering enabled are currently available near you.')
          }

          setAvailableStores(eligible)
          setError('')

          // Only auto-open when exactly ONE nearby store was discovered.
          // Even if only one of several nearby stores passes the availability
          // check, show the choices so customers aren't surprised by a redirect.
          const forceChoice = new URLSearchParams(window.location.search).get('choose') === '1'
          if (stores.length === 1 && eligible.length === 1 && !forceChoice) {
            setMessage('Opening the only available nearby store…')
            // openStore rechecks eligibility immediately before navigating.
            await openStore(eligible[0], true)
            return
          }

          setStage('choosing')
          setMessage('Choose a store to view its full menu and your account.')
        } catch (lookupFailure) {
          if (!mountedRef.current || runRef.current !== run) return
          console.error('[Delivery] Nearby store lookup failed:', lookupFailure)
          setStage('error')
          setError(lookupFailure?.message || 'Unable to load nearby stores.')
        }
      },
      (geoError) => {
        if (!mountedRef.current || runRef.current !== run) return
        setStage('error')
        setError(locationErrorMessage(geoError))
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }, [openStore])

  useEffect(() => {
    mountedRef.current = true
    findStores()
    return () => {
      mountedRef.current = false
      runRef.current += 1
    }
  }, [findStores])

  const busy = stage === 'loading' || stage === 'opening'
  return (
    <main className="min-h-[100dvh] bg-[#f6f8f6] px-4 py-8 text-[#142017]">
      <div className="mx-auto w-full max-w-xl">
        <header className="mb-5 rounded-[26px] border border-[#e5ece6] bg-white p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-2xl" aria-hidden="true">📍</span>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-emerald-700">Digital Dine-In Delivery</p>
              <h1 className="mt-1 text-xl font-black tracking-tight">
                {stage === 'choosing' || stage === 'opening' ? 'Choose your delivery store' :
                  stage === 'error' ? 'Location or store lookup failed' : 'Finding stores near you'}
              </h1>
            </div>
          </div>
          <p className="mt-3 text-sm leading-6 text-slate-600" role="status" aria-live="polite">
            {stage === 'error' ? error : message}
          </p>
        </header>

        {busy && (
          <div className="rounded-3xl border border-[#e5ece6] bg-white p-7 text-center shadow-sm">
            <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-600" role="status" aria-label="Loading stores" />
            <p className="mt-4 text-sm font-semibold text-slate-500">{message}</p>
          </div>
        )}

        {stage === 'error' && (
          <section className="rounded-3xl border border-red-200 bg-white p-6 text-center shadow-sm">
            <p className="text-sm font-semibold leading-6 text-red-700">{error}</p>
            <button type="button" onClick={findStores}
              className="mt-5 w-full rounded-2xl bg-emerald-600 px-5 py-3.5 text-sm font-black text-white hover:bg-emerald-700">
              Retry current location
            </button>
          </section>
        )}

        {stage === 'choosing' && (
          <section aria-label="Nearby delivery stores" className="space-y-3">
            {error && <p role="alert" className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</p>}
            <div className="flex items-center justify-between gap-3 px-1">
              <div>
                <h2 className="text-base font-black">Available near you</h2>
                <p className="mt-1 text-xs text-slate-500">
                  {availableStores.length} available of {nearbyCount} nearby {nearbyCount === 1 ? 'store' : 'stores'}
                </p>
              </div>
              <button type="button" onClick={findStores}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700">
                Refresh GPS
              </button>
            </div>
            {availableStores.map((row, index) => (
              <button key={`${row.id}-${row.code}`} type="button" onClick={() => void openStore(row)}
                className="flex w-full items-center gap-3 rounded-[24px] border border-[#e5ece6] bg-white p-4 text-left shadow-sm transition hover:border-emerald-500 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-emerald-600">
                <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-2xl" aria-hidden="true">🏪</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-black text-slate-900">{storeNameOf(row.store)}</span>
                  <span className="mt-1 block text-xs font-semibold text-slate-500">{distanceLabel(row.distance)} · Store {row.code}</span>
                  {index === 0 && row.distance !== null && availableStores.every((item) => item.distance !== null) && (
                    <span className="mt-1.5 inline-block rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">Nearest available</span>
                  )}
                </span>
                <span className="text-xl font-bold text-emerald-600" aria-hidden="true">→</span>
              </button>
            ))}
            {nearbyCount > availableStores.length && (
              <p className="rounded-2xl bg-amber-50 px-4 py-3 text-xs leading-5 text-amber-900">
                Other nearby businesses may have a restaurant-only plan, be closed, await approval, or be unavailable for new orders.
              </p>
            )}
            <p className="px-1 pt-1 text-center text-xs leading-5 text-slate-500">
              Select a store to open its full menu, offers, cart and account orders.
            </p>
          </section>
        )}
      </div>
    </main>
  )
}
