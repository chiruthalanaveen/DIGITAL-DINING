'use client'



import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useRouter } from 'next/navigation'

import { supabase } from '@/lib/supabase'

import DDAppInstall from '@/app/components/DDAppInstall'
import '@/app/components/dd-delivery-ui.css'



const DESTINATION_KEY = 'digitaldine_delivery_selected_location_v1'

const LAST_STORE_KEY = 'dd_delivery_last_store_code_v1'

const STORE_CODE = /^[A-Za-z0-9\_-]{1,80}$/

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const CATEGORIES = [

  { icon: '🍲', name: 'Food', title: 'Fresh meals', color: 'peach' },

  { icon: '🛒', name: 'Groceries', title: 'Daily essentials', color: 'mint' },

  { icon: '🍎', name: 'Fruits', title: 'Naturally good', color: 'rose' },

  { icon: '🥦', name: 'Vegetables', title: 'Farm fresh', color: 'lime' },

]



const stringValue = (v) => String(v ?? '').trim()

function validCoords(lat, lng) {

  return lat !== '' && lng !== '' && lat != null && lng != null &&

    Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) &&

    Number(lat) >= -90 && Number(lat) <= 90 && Number(lng) >= -180 && Number(lng) <= 180

}

function normalizeStore(row) {

  const id = stringValue(row?.restaurantId ?? row?.restaurant_id).toLowerCase()

  const code = stringValue(row?.restaurantCode ?? row?.restaurant_code ?? row?.storeCode)

  if (!UUID.test(id) || !STORE_CODE.test(code)) return null

  const open = row?.isOpen !== false && row?.is_open !== false && stringValue(row?.status).toLowerCase() !== 'closed'

  if (!open) return null

  const d = row?.distanceKm ?? row?.distance_km ?? row?.distance

  const m = row?.distanceMeters ?? row?.distance_meters

  const distance = d != null && d !== '' && Number.isFinite(Number(d)) ? Number(d) :

    m != null && m !== '' && Number.isFinite(Number(m)) ? Number(m) / 1000 : null

  return {

    id, code,

    name: stringValue(row?.name ?? row?.restaurantName ?? row?.restaurant_name ?? row?.storeName ?? row?.store_name) || 'Delivery store',

    banner: stringValue(row?.banner_url ?? row?.bannerUrl ?? row?.logo_url ?? row?.logoUrl),

    distance: distance !== null && distance >= 0 ? distance : null,

  }

}

function eligibleSet(rows) {

  return new Set((Array.isArray(rows) ? rows : []).map((v) =>

    stringValue(typeof v === 'string' ? v : (v?.restaurant_id ?? v?.restaurantId)).toLowerCase()

  ).filter((v) => UUID.test(v)))

}

function formatDistance(d) {

  if (d == null) return 'Delivers to this address'

  return d < 1 ? `${Math.max(1, Math.round(d * 1000))} m away` : `${d.toFixed(1)} km away`

}



function Icon({ name, size = 21 }) {

  const paths = {

    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,

    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,

    home: <><path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/></>,

    bag: <><rect x="4" y="7" width="16" height="14" rx="2"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></>,

    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/></>,

    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21c0-5 16-5 16 0"/></>,

    arrow: <><path d="M5 12h14m-6-6 6 6-6 6"/></>,

    chevron: <path d="m9 6 6 6-6 6"/>,

    gps: <><circle cx="12" cy="12" r="6"/><path d="M12 2v4m0 12v4M2 12h4m12 0h4"/></>,

    refresh: <><path d="M3 12a9 9 0 0 1 15-6l2 2"/><path d="M20 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6l-2-2"/><path d="M4 21v-5h5"/></>,

    sparkle: <><path d="m12 2 2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2Z"/></>,

  }

  return <svg width={size} height={size} viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.bag}</svg>

}



export default function DDDeliveryAppPage() {

  const router = useRouter()

  const [coords, setCoords] = useState(null)

  const [manual, setManual] = useState(false)

  const [latInput, setLatInput] = useState('')

  const [lngInput, setLngInput] = useState('')

  const [busy, setBusy] = useState(false)

  const [error, setError] = useState('')

  const [stores, setStores] = useState([])

  const [searched, setSearched] = useState(false)

  const [search, setSearch] = useState('')

  const [lastStore, setLastStore] = useState('')

  const discoveryId = useRef(0)



  const discover = useCallback(async (position, autoOpen = false) => {

    if (!validCoords(position?.latitude, position?.longitude)) {

      setError('Choose a valid delivery location.')

      return

    }

    const requestId = ++discoveryId.current

    setCoords(position)

    setBusy(true)

    setError('')

    setSearched(false)

    setStores([])

    try {

      const { data, error: discoverError } = await supabase.rpc('get_nearby_delivery_stores', {

        p_latitude: Number(position.latitude), p_longitude: Number(position.longitude),

      })

      if (discoverError) throw discoverError

      if (data?.success !== true) throw new Error(data?.message || 'Could not find stores for this location.')

      const nearby = (Array.isArray(data.stores) ? data.stores : [])

        .map(normalizeStore).filter(Boolean)

      const ids = [...new Set(nearby.map((s) => s.id))].slice(0, 100)

      let verified = []

      if (ids.length) {

        const [wallet, plan] = await Promise.all([

          supabase.rpc('delivery_wallet_eligible_restaurant_ids', { p_restaurant_ids: ids }),

          supabase.rpc('delivery_plan_eligible_restaurant_ids', { p_restaurant_ids: ids }),

        ])

        if (wallet.error || plan.error) throw new Error('Could not verify store wallet and subscription eligibility. Please retry.')

        const walletIds = eligibleSet(wallet.data)

        const planIds = eligibleSet(plan.data)

        const seen = new Set()

        verified = nearby.filter((s) => walletIds.has(s.id) && planIds.has(s.id) &&

          !seen.has(`${s.id}:${s.code.toLowerCase()}`) && Boolean(seen.add(`${s.id}:${s.code.toLowerCase()}`)))

          .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity)).slice(0, 3)

      }

      if (requestId !== discoveryId.current) return

      setStores(verified)

      setSearched(true)

      if (autoOpen && verified.length === 1) {

        try { sessionStorage.setItem(LAST_STORE_KEY, verified[0].code); localStorage.setItem('digitaldine_delivery_last_store_code', verified[0].code) } catch { /* optional */ }

        router.push(`/delivery/${encodeURIComponent(verified[0].code)}`)

      }

    } catch (e) {

      if (requestId === discoveryId.current) setError(e?.message || 'Delivery stores could not be loaded.')

    } finally {

      if (requestId === discoveryId.current) setBusy(false)

    }

  }, [router])



  useEffect(() => {

    try {

      const last = sessionStorage.getItem(LAST_STORE_KEY) || localStorage.getItem('digitaldine_delivery_last_store_code') || ''

      if (STORE_CODE.test(last)) setLastStore(last)

      const saved = JSON.parse(sessionStorage.getItem(DESTINATION_KEY) || 'null')

      if (validCoords(saved?.latitude, saved?.longitude)) {

        setLatInput(String(saved.latitude))

        setLngInput(String(saved.longitude))

        void discover({ latitude: saved.latitude, longitude: saved.longitude, source: saved.source || 'saved' })

      }

    } catch { /* Corrupt browser storage is not authentication. */ }

  }, [discover])



  function setDeliveryPoint(latitude, longitude, source = 'manual', accuracy = null) {

    if (!validCoords(latitude, longitude)) {

      setError('Enter valid latitude and longitude or use GPS.')

      return

    }

    const value = { latitude: Number(latitude), longitude: Number(longitude), source, accuracy, selectedAt: Date.now() }

    try { sessionStorage.setItem(DESTINATION_KEY, JSON.stringify(value)) } catch { /* Storage may be disabled. */ }

    setLatInput(String(value.latitude))

    setLngInput(String(value.longitude))

    setManual(false)

    void discover(value, true)

  }

  function useGps() {

    if (!navigator.geolocation || !window.isSecureContext) {

      setError('GPS requires HTTPS or localhost. Use Choose address to select your delivery destination.')

      return

    }

    setError('')

    setBusy(true)

    navigator.geolocation.getCurrentPosition(

      (pos) => { setBusy(false); setDeliveryPoint(pos.coords.latitude, pos.coords.longitude, 'gps', pos.coords.accuracy) },

      () => { setBusy(false); setError('GPS was unavailable or permission was denied. You can choose an address instead.') },

      { enableHighAccuracy: true, timeout: 15000, maximumAge: 30000 }

    )

  }

  function visitStore(code) {

    if (!STORE_CODE.test(code)) return

    try { sessionStorage.setItem(LAST_STORE_KEY, code); localStorage.setItem('digitaldine_delivery_last_store_code', code) } catch { /* optional */ }

    setLastStore(code)

    router.push(`/delivery/${encodeURIComponent(code)}`)

  }

  const shown = useMemo(() => stores.filter((s) => s.name.toLowerCase().includes(search.trim().toLowerCase())), [stores, search])

  const orderTarget = STORE_CODE.test(lastStore) ? `/delivery/${encodeURIComponent(lastStore)}` : '/delivery/login?next=%2Fdelivery'



  return <div className="ddp">

    <header className="ddp-topbar">

      <div className="ddp-topinner">

        <a href="/dd-delivery" className="ddp-brand" aria-label="DD Delivery home"><span className="ddp-logo">dd<span>.</span></span><span className="ddp-brand-title">delivery<small>by Digital Dine-In</small></span></a>

        <div className="ddp-current-location"><span className="ddp-location-icon"><Icon name="pin" size={18}/></span><span><small>DELIVERING TO</small><strong>{coords ? `${Number(coords.latitude).toFixed(4)}, ${Number(coords.longitude).toFixed(4)}` : 'Choose your location'}</strong></span><a href="/delivery?choose=1" aria-label="Choose delivery address">Change</a></div>

        <div className="ddp-header-actions"><DDAppInstall swPath="/dd-delivery-sw.js" swScope="/dd-delivery"/><a href="/delivery/login?next=%2Fdelivery" className="ddp-avatar" aria-label="Sign in"><Icon name="user" size={21}/></a></div>

      </div>

    </header>



    <main className="ddp-main">

      <div className="ddp-hello"><span className="ddp-eyebrow"><Icon name="sparkle" size={14}/> YOUR LOCAL MARKETPLACE</span><h1>Everyday essentials,<br/><span>delivered with care.</span></h1><p>Good food, fresh produce and the little things you need — all from nearby stores.</p></div>

      <section className="ddp-hero" aria-label="Explore delivery">

        <div className="ddp-hero-content"><span className="ddp-hero-pill">✦ FRESH PICKS • LOCAL STORES</span><h2>Good things<br/>are coming <em>your way.</em></h2><p>From the first craving to the last-minute grocery run.</p><a className="ddp-primary-btn" href="/delivery?choose=1">Explore stores <Icon name="arrow" size={19}/></a></div>

        <div className="ddp-hero-art" aria-hidden="true"><div className="ddp-hero-disc"/><span className="ddp-hero-veg v1">🥑</span><span className="ddp-hero-veg v2">🥬</span><span className="ddp-hero-veg v3">🥕</span><span className="ddp-hero-veg v4">🍊</span><div className="ddp-hero-caption">Made for your everyday <span>✳</span></div></div>

      </section>



      <section className="ddp-section ddp-categories" aria-label="Shopping categories"><div className="ddp-section-head"><div><span className="ddp-kicker">PICK YOUR FAVOURITES</span><h2>What are you looking for?</h2></div><a href="/delivery?choose=1" className="ddp-subtle-link">See stores <Icon name="arrow" size={16}/></a></div><div className="ddp-category-grid">{CATEGORIES.map((category) => <a key={category.name} className={`ddp-category ${category.color}`} href="/delivery?choose=1"><span aria-hidden="true">{category.icon}</span><strong>{category.name}</strong><small>{category.title}</small></a>)}</div></section>



      <section className="ddp-section ddp-discovery" aria-label="Nearby delivery stores">

        <div className="ddp-section-head"><div><span className="ddp-kicker">RIGHT AROUND THE CORNER</span><h2>Stores near you</h2></div><button type="button" className="ddp-refetch" onClick={() => coords && discover(coords)} disabled={!coords || busy}><Icon name="refresh" size={17}/> Refresh</button></div>

        <div className="ddp-address-bar"><div className="ddp-address-heading"><span className="ddp-address-pin"><Icon name="pin"/></span><span><strong>{coords ? 'Delivery location selected' : 'Where should we deliver?'}</strong><small>{coords ? `GPS pin · ${Number(coords.latitude).toFixed(5)}, ${Number(coords.longitude).toFixed(5)}` : 'Select a destination to find available stores'}</small></span></div><div className="ddp-address-actions"><button type="button" onClick={useGps} disabled={busy}><Icon name="gps" size={17}/> Use GPS</button><a href="/delivery?choose=1">Choose address <Icon name="chevron" size={16}/></a></div></div>

        <div className="ddp-location-details"><button type="button" className="ddp-coordinate-toggle" onClick={() => setManual(v => !v)}>{manual ? 'Hide manual coordinates' : 'Testing? Enter coordinates manually'}</button>{manual && <form onSubmit={(e) => { e.preventDefault(); setDeliveryPoint(latInput, lngInput) }} className="ddp-coordinate-form"><label>Latitude<input value={latInput} onChange={e => setLatInput(e.target.value)} inputMode="decimal" placeholder="Latitude" required/></label><label>Longitude<input value={lngInput} onChange={e => setLngInput(e.target.value)} inputMode="decimal" placeholder="Longitude" required/></label><button type="submit">Find stores</button></form>}</div>

        {error && <p className="ddp-error" role="alert">{error}</p>}

        {busy && <div className="ddp-empty"><span className="ddp-loader"/><h3>Checking available stores…</h3><p>Verifying delivery coverage, wallet eligibility and plans.</p></div>}

        {!busy && !searched && !error && <div className="ddp-empty"><span className="ddp-empty-illustration">📍</span><h3>Your neighbourhood, on demand.</h3><p>Use GPS or choose an address to explore delivery stores near you.</p><a className="ddp-small-primary" href="/delivery?choose=1">Select delivery address <Icon name="arrow" size={16}/></a></div>}

        {!busy && searched && stores.length === 0 && <div className="ddp-empty"><span className="ddp-empty-illustration">🏡</span><h3>No eligible stores at this location</h3><p>Try another destination. Stores must be open and pass delivery plan and wallet checks.</p><a className="ddp-small-primary" href="/delivery?choose=1">Change address <Icon name="arrow" size={16}/></a></div>}

        {!busy && stores.length > 0 && <><div className="ddp-store-tools"><p><strong>{stores.length} store{stores.length !== 1 ? 's' : ''}</strong> delivering to your location</p><label className="ddp-store-search"><Icon name="search" size={18}/><input aria-label="Search nearby stores" placeholder="Search stores" value={search} onChange={e => setSearch(e.target.value)}/></label></div><div className="ddp-stores">{shown.map(store => <button type="button" key={`${store.id}:${store.code}`} className="ddp-store" onClick={() => visitStore(store.code)}><span className="ddp-store-image">{/^https:\/\//i.test(store.banner) ? <img src={store.banner} alt="" onError={e => { e.currentTarget.style.display = 'none' }}/> : <span>🛍️</span>}</span><span className="ddp-store-desc"><strong>{store.name}</strong><small><span className="ddp-open-dot"/> Open for delivery</small><span className="ddp-distance"><Icon name="pin" size={14}/> {formatDistance(store.distance)}</span></span><span className="ddp-go"><Icon name="arrow" size={20}/></span></button>)}</div>{shown.length === 0 && <p className="ddp-filter-empty">No stores match that search.</p>}</>}

      </section>

      <section className="ddp-promise"><span className="ddp-promise-icon">✳</span><div><strong>Built around your neighbourhood.</strong><p>Order securely using the existing Digital Dine-In checkout, with live tracking and support when you need it.</p></div><a href="/delivery?choose=1">Start shopping <Icon name="arrow" size={16}/></a></section>

    </main>



    <nav className="ddp-bottom-nav" aria-label="Delivery app navigation"><a className="active" href="/dd-delivery"><Icon name="home"/><span>Home</span></a><a href="/delivery?choose=1"><Icon name="bag"/><span>Explore</span></a><a href={orderTarget}><Icon name="clock"/><span>Orders</span></a><a href="/delivery/login?next=%2Fdelivery"><Icon name="user"/><span>Account</span></a></nav>

    <footer className="ddp-footer">DD Delivery · Powered by Digital Dine-In</footer>

  </div>

}