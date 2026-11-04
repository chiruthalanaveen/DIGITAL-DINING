'use client'
// Destination: app/components/DeliveryMarketplaceHome.jsx
// All discovery uses the existing server-controlled Supabase RPCs.
// Show every eligible store the nearby RPC returns, ordered by distance.
// Store cards contain small previews; selecting one opens the FULL existing
// DeliveryStoreExperience catalog inside /delivery (not an external website).
// Checkout continues to be validated by the existing store/order backend.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import DeliverySavedAddressPicker from '@/app/components/DeliverySavedAddressPicker'
import '@/app/components/delivery-marketplace-premium.css'

const CODE = /^[A-Za-z0-9_-]{1,80}$/
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DESTINATION_KEY = 'digitaldine_delivery_selected_location_v1'
const money = value => `₹${Number(value || 0).toLocaleString('en-IN', {maximumFractionDigits:2})}`
const groups = [
  { id:'all', label:'All', icon:'🛍️' },
  { id:'food', label:'Food', icon:'🍛' },
  { id:'groceries', label:'Groceries', icon:'🛒' },
  { id:'fruits', label:'Fruits', icon:'🍎' },
  { id:'vegetables', label:'Vegetables', icon:'🥦' },
]
function pointOf(value) {
  const latitude = Number(value?.latitude)
  const longitude = Number(value?.longitude)
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90 &&
    Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
    ? { latitude, longitude } : null
}
function getStoreId(store) { return String(store?.restaurantId || store?.restaurant_id || '').trim().toLowerCase() }
function getStoreCode(store) { return String(store?.restaurantCode || store?.restaurant_code || store?.storeCode || '').trim() }
function getStoreName(store) { return String(store?.name || store?.restaurantName || store?.restaurant_name || store?.storeName || store?.store_name || 'Delivery store') }
function getDistance(store) {
  const km = store?.distanceKm ?? store?.distance_km ?? store?.distance
  if (km != null && Number.isFinite(Number(km)) && Number(km) >= 0) return Number(km)
  const metres = store?.distanceMeters ?? store?.distance_meters
  if (metres != null && Number.isFinite(Number(metres)) && Number(metres) >= 0) return Number(metres)/1000
  return null
}
function kmLabel(value) {
  if (value === null) return 'Delivers here'
  if (value < 1) return `${Math.max(1,Math.round(value*1000))} m away`
  return `${value.toFixed(value<10?1:0)} km away`
}
function idsOfRpc(value) {
  return new Set((Array.isArray(value) ? value : [])
    .map(row => String(typeof row === 'string' ? row : row?.restaurant_id || row?.restaurantId || '').toLowerCase())
    .filter(id => UUID.test(id)))
}
function itemType(item) {
  const joined = `${item?.category || ''} ${item?.item_type || ''} ${item?.name || ''}`.toLowerCase()
  if (/vegetable|veggie|sabzi|greens|leafy/.test(joined)) return 'vegetables'
  if (/fruit|apple|banana|orange|grapes|mango/.test(joined)) return 'fruits'
  if (/grocery|grocer|packaged|rice|dal|flour|milk|oil|household|snack|soap/.test(joined)) return 'groceries'
  return 'food'
}
function saveLocation(value) {
  try {
    const data = { latitude:Number(value.latitude), longitude:Number(value.longitude),
      source: value.source === 'saved' ? 'saved' : value.source === 'manual' ? 'manual' : 'gps',
      accuracy: value.source === 'gps' ? Number(value.accuracy) || null : null,
      selectedAt: Date.now() }
    if (value.source === 'saved') Object.assign(data, {
      savedAddressId: value.savedAddressId, ownerUserId: value.ownerUserId,
      label: value.label, addressLine1: value.addressLine1,
      addressLine2: value.addressLine2, landmark: value.landmark,
      city: value.city, state: value.state, pincode: value.pincode,
      recipientName: value.recipientName, recipientMobile: value.recipientMobile,
    })
    window.sessionStorage.setItem(DESTINATION_KEY, JSON.stringify(data))
  } catch { /* optional */ }
}
function Picture({ src, fallback, className }) {
  const uri = String(src || '').trim()
  if (/^https:\/\//i.test(uri)) return <img src={uri} alt="" loading="lazy" referrerPolicy="no-referrer" className={className} />
  return <span className="flex h-full w-full items-center justify-center text-4xl" aria-hidden="true">{fallback}</span>
}
function Spinner({ title, detail }) {
  return <div role="status" className="rounded-3xl bg-white px-6 py-12 text-center shadow-sm">
    <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-600" />
    <p className="mt-4 text-sm font-black">{title}</p>
    <p className="mt-2 text-xs text-slate-500">{detail}</p>
  </div>
}

function MarketplaceIcon({name, size = 20, strokeWidth = 1.9}) {
  const paths = {
    pin: <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/></>,
    search: <><circle cx="10.8" cy="10.8" r="7.2"/><path d="m16 16 4.6 4.6"/></>,
    arrow: <path d="M5 12h14m-6-6 6 6-6 6"/>,
    chevron: <path d="m9 18 6-6-6-6"/>,
    down: <path d="m6 9 6 6 6-6"/>,
    locate: <><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></>,
    refresh: <><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5.8 9a7 7 0 0 1 12-2l2.2 5M18.2 15a7 7 0 0 1-12 2L4 12"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><rect x="14" y="14" width="7" height="7" rx="1.4"/></>,
    home: <><path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/></>,
    bag: <><path d="M4 8h16v13H4z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21c0-5 16-5 16 0"/></>,
    check: <path d="m4 12 5 5L20 6"/>,
    spark: <><path d="m12 3 1.6 6.4L20 11l-6.4 1.6L12 19l-1.6-6.4L4 11l6.4-1.6z"/><path d="m19 17 .6 2.4L22 20l-2.4.6L19 23l-.6-2.4L16 20l2.4-.6z"/></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">{paths[name] || paths.grid}</svg>
}

export default function DeliveryMarketplaceHome() {
  const router = useRouter()
  const [location, setLocation] = useState(null)
  const [locating, setLocating] = useState(true)
  const [locationError, setLocationError] = useState('')
  const [phase, setPhase] = useState('idle')
  const [notice, setNotice] = useState('')
  const [stores, setStores] = useState([])
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('all')
  const [customerName, setCustomerName] = useState('Customer')
  const generationRef = useRef(0)
  const gpsRequestedRef = useRef(false)
  const gpsRef = useRef(null)
  const locationRef = useRef(null)

  // The account is verified by DeliveryAppAuthGate before this component mounts.
  useEffect(() => {
    let alive = true
    supabase.auth.getUser().then(({ data }) => {
      if (!alive || !data?.user) return
      setCustomerName(String(data.user.user_metadata?.full_name || data.user.user_metadata?.name ||
        data.user.email?.split('@')?.[0] || 'Customer').trim())
    }).catch(() => {})
    return () => { alive = false }
  }, [])

  const discover = useCallback(async point => {
    const chosen = pointOf(point)
    if (!chosen) return
    const generation = ++generationRef.current
    setStores([])
    setPhase('loading')
    setNotice('Finding nearby restaurants and stores…')
    try {
      const { data: nearby, error } = await supabase.rpc('get_nearby_delivery_stores', {
        p_latitude: chosen.latitude, p_longitude: chosen.longitude,
      })
      if (error) throw new Error(`Nearby-store lookup failed: ${error.message}`)
      if (nearby?.success !== true || !Array.isArray(nearby.stores)) {
        throw new Error(nearby?.message || 'Unable to find nearby Delivery stores.')
      }
      if (generation !== generationRef.current) return
      const unique = new Map()
      for (const entry of nearby.stores) {
        const id = getStoreId(entry), code = getStoreCode(entry)
        if (!UUID.test(id) || !CODE.test(code)) continue
        if (entry.isOpen === false || entry.is_open === false || String(entry.status || '').toLowerCase() === 'closed') continue
        if (!unique.has(id)) unique.set(id, { id, code, source:entry, distance:getDistance(entry) })
      }
      const matches = [...unique.values()].sort((a,b) => (a.distance ?? Infinity)-(b.distance ?? Infinity))
      if (!matches.length) { setPhase('empty'); return }
      setNotice('Verifying plans, wallets and delivery areas…')
      const permitted = new Set()
      // Process all nearby results, not just the nearest three; chunk RPC arguments.
      for (let i=0; i<matches.length; i+=100) {
        const ids = matches.slice(i,i+100).map(row => row.id)
        const [wallet,plans,boundary] = await Promise.all([
          supabase.rpc('delivery_wallet_eligible_restaurant_ids', {p_restaurant_ids:ids}),
          supabase.rpc('delivery_plan_eligible_restaurant_ids', {p_restaurant_ids:ids}),
          supabase.rpc('delivery_polygon_eligible_restaurant_ids', {
            p_restaurant_ids:ids,p_latitude:chosen.latitude,p_longitude:chosen.longitude,
          }),
        ])
        if (wallet.error || plans.error || boundary.error) {
          throw new Error('Unable to verify nearby store eligibility. Check that wallet, Delivery plan and service-area RPCs are installed.')
        }
        const w=idsOfRpc(wallet.data), p=idsOfRpc(plans.data), b=idsOfRpc(boundary.data)
        for (const id of ids) if (w.has(id) && p.has(id) && b.has(id)) permitted.add(id)
      }
      if (generation !== generationRef.current) return
      const eligible = matches.filter(row => permitted.has(row.id))
      if (!eligible.length) { setPhase('empty'); return }
      setNotice('Loading available items for each store…')
      const found = []
      // Bounded concurrency avoids a burst of Supabase reads.
      for (let i=0;i<eligible.length;i+=4) {
        const batch = eligible.slice(i,i+4)
        const listings = await Promise.all(batch.map(async entry => {
          try {
            // Public storefront RPC also verifies the store's current business status.
            const {data,error:catalogError} = await supabase.rpc('get_public_delivery_store', {p_restaurant_code:entry.code})
            if (catalogError || data?.success !== true) return null
            const items = (Array.isArray(data?.menu_items) ? data.menu_items : [])
              .filter(item => item?.is_active !== false && item?.is_available !== false && item?.available !== false)
              .filter(item => item?.track_stock !== true || Number(item?.available_stock || 0) > 0)
            const r = data.restaurant || {}, settings = data.settings || {}
            if (settings.is_open === false || r.is_open === false) return null
            const picture = String(settings.banner_url || r.logo_url || entry.source.banner_url || entry.source.logo_url || '')
            return { ...entry, name:String(settings.store_name || r.name || getStoreName(entry.source)),
              picture, items, itemCount:items.length, categoryKeys:[...new Set(items.map(itemType))] }
          } catch { return null }
        }))
        if (generation !== generationRef.current) return
        found.push(...listings.filter(Boolean))
        setStores([...found])
        setPhase('ready')
      }
      if (generation === generationRef.current && !found.length) setPhase('empty')
    } catch (e) {
      if (generation === generationRef.current) {
        setPhase('error')
        setNotice(e?.message || 'Store discovery is unavailable.')
      }
    }
  }, [])

  const selectLocation = useCallback(value => {
    const coords = pointOf(value)
    if (!coords) return
    const next={...value,...coords,source:value.source || 'manual'}
    locationRef.current = next
    setLocation(next)
    setLocating(false)
    setLocationError('')
    saveLocation(next)
    void discover(next)
  },[discover])

  const askGps = useCallback((force = false) => {
    if (typeof window === 'undefined' || !window.isSecureContext || !navigator.geolocation) {
      setLocating(false)
      setLocationError('Live location needs HTTPS or localhost. Choose a saved address below.')
      return
    }
    setLocating(true)
    setLocationError('')
    navigator.geolocation.getCurrentPosition(position => {
      const point = { latitude:position.coords.latitude, longitude:position.coords.longitude,
        accuracy:position.coords.accuracy, source:'gps' }
      setLocating(false)
      if (locationRef.current?.source === 'saved' && !force) return // Late initial GPS must not override saved address.
      selectLocation(point)
    }, error => {
      setLocating(false)
      setLocationError(error?.code === 1 ? 'Location permission denied. Choose a saved address or enable GPS in browser settings.' :
        'Live location unavailable. Try again or select a saved address.')
      if (!locationRef.current) setPhase('location-needed')
    }, {enableHighAccuracy:true, timeout:15000, maximumAge:30000})
  }, [selectLocation])

  useEffect(() => {
    if (gpsRequestedRef.current) return
    gpsRequestedRef.current = true
    askGps()
    return () => { generationRef.current += 1 }
  }, [askGps])

  const visibleStores = useMemo(() => {
    const term = search.trim().toLowerCase()
    return stores.map(store => {
      const categoryItems = category === 'all' ? store.items : store.items.filter(item => itemType(item) === category)
      const storeMatch = store.name.toLowerCase().includes(term)
      const itemMatches = categoryItems.filter(item =>
        `${item?.name || ''} ${item?.category || ''} ${item?.description || ''}`.toLowerCase().includes(term))
      const visibleItems = !term || storeMatch ? categoryItems : itemMatches
      return {...store, visibleItems}
    }).filter(store => (category === 'all' || store.visibleItems.length > 0) && (
      !term || store.name.toLowerCase().includes(term) || store.visibleItems.length > 0
    ))
  }, [stores,search,category])

  function openStore(code) {
    if (!CODE.test(code)) return
    try { window.sessionStorage.setItem('dd_delivery_last_store_code_v1',code) } catch {}
    // Same Next.js /delivery route; the parent embeds DeliveryStoreExperience.
    router.push(`/delivery?store=${encodeURIComponent(code)}`, {scroll:false})
    window.scrollTo({top:0,behavior:'instant'})
  }
  const initials = Array.from(String(customerName || 'Customer').trim())[0]?.toLocaleUpperCase() || 'C'
  const productsCount = useMemo(() => stores.reduce((sum, store) => sum + Number(store.itemCount || 0), 0), [stores])
  const heroPhotos = useMemo(() => {
    const unique = new Set()
    const photos = []
    for (const store of stores) {
      for (const item of store.items || []) {
        const url = String(item?.image_url || '')
        if (!/^https:\/\//i.test(url) || unique.has(url)) continue
        photos.push({ src: url, name: String(item.name || 'Food') })
        unique.add(url)
        if (photos.length === 3) return photos
      }
    }
    return photos
  }, [stores])

  const jumpToStores = () => document.getElementById('ddm-nearby')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  const repeatDiscovery = () => location ? void discover(location) : askGps(true)
  const changeAddress = () => window.dispatchEvent(new Event('digitaldine:select-address'))
  const navItems = [
    { label: 'Home', icon: 'home', onClick: () => window.scrollTo({ top: 0, behavior: 'smooth' }), active: true },
    { label: 'Explore', icon: 'grid', onClick: jumpToStores },
    { label: 'My Orders', icon: 'bag', onClick: () => router.push('/delivery?view=orders') },
    { label: 'Profile', icon: 'user', onClick: () => router.push('/delivery?view=account') },
  ]
  return (
    <main className="ddm-premium">
      <header className="ddm-header">
        <div className="ddm-container ddm-header-inner">
          <div className="ddm-brand-row">
            <div className="ddm-brand">
              <span className="ddm-brand-logo" aria-hidden="true">D<span>.</span></span>
              <span className="ddm-brand-type"><strong>digital dine-in</strong><small>YOUR DELIVERY MARKETPLACE</small></span>
            </div>
            <button className="ddm-user-avatar" type="button" aria-label="Open customer profile"
              onClick={() => router.push('/delivery?view=account')}>{initials}</button>
          </div>

          <div className="ddm-address-card">
            <span className="ddm-address-symbol" aria-hidden="true"><MarketplaceIcon name="pin" size={20}/></span>
            <div className="ddm-address-copy">
              <strong>{location?.source === 'saved' ? location.label || 'Saved address' : location ? 'Current location' : locating ? 'Locating you…' : 'Delivery location'}</strong>
              <span>{location?.source === 'saved'
                ? [location.addressLine1, location.addressLine2, location.city].filter(Boolean).join(', ') || 'Address selected'
                : location ? 'Showing stores that deliver to your GPS location'
                  : locating ? 'Allow location access to see nearby stores' : 'Select an address or enable GPS'}</span>
            </div>
            <button type="button" className="ddm-address-action" onClick={changeAddress} aria-label="Change delivery address">
              Change <MarketplaceIcon name="chevron" size={15}/>
            </button>
          </div>
          <div className="ddm-picker-wrap" aria-label="Saved delivery address selector">
            <DeliverySavedAddressPicker destination={location} autoApplyDefault={false} compact onSelect={selectLocation}/>
          </div>

          <label className="ddm-search-box">
            <MarketplaceIcon name="search" size={22}/>
            <input value={search} onChange={event => setSearch(event.target.value)}
              placeholder="Search biryani, groceries, stores…" aria-label="Search nearby stores and products" autoComplete="off" />
            {search ? <button type="button" className="ddm-clear" aria-label="Clear search" onClick={() => setSearch('')}>×</button>
              : <span className="ddm-search-hint">SEARCH</span>}
          </label>
        </div>
      </header>

      <div className="ddm-container ddm-content">
        <section className="ddm-hero" aria-label="Digital Dine-In local delivery">
          <div className="ddm-hero-glow ddm-hero-glow-one" aria-hidden="true"/>
          <div className="ddm-hero-glow ddm-hero-glow-two" aria-hidden="true"/>
          <div className="ddm-hero-copy">
            <span className="ddm-hero-eyebrow"><MarketplaceIcon name="spark" size={14}/> YOUR NEIGHBOURHOOD. DELIVERED.</span>
            <h1>Local favourites,<br/><em>one beautiful app.</em></h1>
            <p>From fresh food to everyday essentials, explore the stores that can deliver right to you.</p>
            <button type="button" className="ddm-hero-cta" onClick={jumpToStores}>
              Explore nearby stores <MarketplaceIcon name="arrow" size={18}/>
            </button>
          </div>
          <div className="ddm-hero-art" aria-hidden="true">
            <div className="ddm-hero-orbit ddm-hero-orbit-first"/>
            <div className="ddm-hero-orbit ddm-hero-orbit-second"/>
            <div className="ddm-hero-photo ddm-hero-photo-one">
              {heroPhotos[0] ? <img src={heroPhotos[0].src} alt="" loading="lazy"/> : <span>🍛</span>}
            </div>
            <div className="ddm-hero-photo ddm-hero-photo-two">
              {heroPhotos[1] ? <img src={heroPhotos[1].src} alt="" loading="lazy"/> : <span>🥗</span>}
            </div>
            <div className="ddm-hero-photo ddm-hero-photo-three">
              {heroPhotos[2] ? <img src={heroPhotos[2].src} alt="" loading="lazy"/> : <span>🍔</span>}
            </div>
            <span className="ddm-hero-star ddm-hero-star-a">✦</span>
            <span className="ddm-hero-star ddm-hero-star-b">✦</span>
          </div>
        </section>

        <section className="ddm-categories" aria-label="Explore product categories">
          <div className="ddm-section-heading">
            <div><span className="ddm-overline">DISCOVER WHAT YOU LOVE</span><h2>Shop by category</h2></div>
            <span className="ddm-section-side">Swipe to explore <MarketplaceIcon name="arrow" size={16}/></span>
          </div>
          <div className="ddm-category-scroll">
            {groups.map(group => <button key={group.id} type="button"
              className={`ddm-category-pill${category === group.id ? ' ddm-category-selected' : ''}`}
              aria-pressed={category === group.id} onClick={() => { setCategory(group.id); }}>
              <span className="ddm-category-icon" aria-hidden="true">{group.icon}</span>
              <span>{group.label}</span>
            </button>)}
          </div>
        </section>

        <section id="ddm-nearby" className="ddm-nearby" aria-label="Nearby eligible stores">
          <div className="ddm-section-heading ddm-store-heading">
            <div>
              <span className="ddm-overline"><span className="ddm-live-dot"/> VERIFIED LOCAL DELIVERY</span>
              <h2>Stores near you</h2>
              <p>{phase === 'ready'
                ? `${stores.length} ${stores.length === 1 ? 'store' : 'stores'} available · ${productsCount} listed ${productsCount === 1 ? 'product' : 'products'}`
                : 'Only stores eligible to deliver to your selected location'}</p>
            </div>
            <button className="ddm-refresh" type="button" onClick={repeatDiscovery} disabled={phase === 'loading' || locating} title="Refresh available stores">
              <MarketplaceIcon name="refresh" size={18}/> <span>Refresh</span>
            </button>
          </div>

          {locationError && <div role="alert" className="ddm-message ddm-warning">
            <MarketplaceIcon name="pin" size={18}/><span>{locationError}</span>
            <button type="button" onClick={() => askGps(true)}>Retry GPS</button>
          </div>}
          {locating && !location && <Spinner title="Finding your location" detail="Allow location permission to discover stores near you."/>}
          {!locating && !location && <div className="ddm-state-card">
            <div className="ddm-state-emoji">📍</div><h3>Where should we deliver?</h3>
            <p>Choose a saved address or allow GPS to see nearby restaurants and stores.</p>
            <div className="ddm-state-actions"><button type="button" onClick={changeAddress}>Choose address</button>
              <button type="button" onClick={() => askGps(true)}>Use live location</button></div>
          </div>}
          {location && phase === 'loading' && <Spinner title="Finding the best local stores" detail={notice}/>}
          {location && phase === 'error' && <div className="ddm-state-card" role="alert">
            <div className="ddm-state-emoji">⚠️</div><h3>We couldn't load nearby stores</h3><p>{notice}</p>
            <div className="ddm-state-actions"><button type="button" onClick={() => discover(location)}>Try again</button>
              <button type="button" onClick={changeAddress}>Change address</button></div>
          </div>}
          {location && phase === 'empty' && <div className="ddm-state-card">
            <div className="ddm-state-emoji">🛍️</div><h3>No stores available just yet</h3>
            <p>Try another delivery address. Store availability is checked against live eligibility, plans and delivery boundaries.</p>
            <div className="ddm-state-actions"><button type="button" onClick={changeAddress}>Change address</button>
              <button type="button" onClick={() => askGps(true)}>Retry GPS</button></div>
          </div>}

          {phase === 'ready' && <>
            {visibleStores.length ? (
              <div className="ddm-store-grid">
                {visibleStores.map((store,index) => {
                  const isNearest = index === 0 && store.distance != null && !search && category === 'all'
                  return <article className="ddm-store-card" key={store.id}>
                    <button type="button" className="ddm-store-cover" onClick={() => openStore(store.code)}
                      aria-label={`Open ${store.name} and view the full product catalog`}>
                      <Picture src={store.picture} fallback="🛒" className="ddm-store-cover-image"/>
                      <span className="ddm-store-cover-shade"/>
                      <span className="ddm-store-tag"><span className="ddm-tag-dot"/>{isNearest ? 'CLOSEST TO YOU' : 'DELIVERS TO YOU'}</span>
                    </button>
                    <div className="ddm-store-main">
                      <div className="ddm-store-title-row">
                        <div className="ddm-store-title"><h3>{store.name}</h3>
                          <div className="ddm-store-meta"><span><MarketplaceIcon name="pin" size={14}/>{kmLabel(store.distance)}</span>
                            <span className="ddm-meta-divider"/><span>{store.itemCount} {store.itemCount === 1 ? 'item' : 'items'}</span></div>
                        </div>
                        <button type="button" className="ddm-store-enter" onClick={() => openStore(store.code)} aria-label={`Browse ${store.name}`}>
                          <MarketplaceIcon name="arrow" size={20}/>
                        </button>
                      </div>
                      <div className="ddm-store-product-heading"><strong>Available items</strong>
                        <button type="button" onClick={() => openStore(store.code)}>See all products <MarketplaceIcon name="arrow" size={15}/></button></div>
                      {store.visibleItems.length ? <div className="ddm-products-scroll">
                        {store.visibleItems.slice(0,5).map((item,i) => <button type="button"
                          className="ddm-product-card" key={item.id || `${store.id}-${i}`}
                          onClick={() => openStore(store.code)} aria-label={`Open ${store.name} to view ${item.name || 'product'}`}>
                          <div className="ddm-product-picture"><Picture src={item.image_url}
                            fallback={itemType(item) === 'food' ? '🍛' : itemType(item) === 'fruits' ? '🍎' : itemType(item) === 'vegetables' ? '🥬' : '🛍️'}
                            className="ddm-product-img"/></div>
                          <span className="ddm-product-title">{item.name || 'Product'}</span>
                          <strong>{money(item.price)}</strong>
                        </button>)}
                      </div> : <p className="ddm-no-items">{category === 'all'
                        ? 'Explore this store to view its complete selection.'
                        : 'No products found in this category.'}</p>}
                    </div>
                    <button type="button" className="ddm-store-footer" onClick={() => openStore(store.code)}>
                      <span>Explore {store.name}</span> <span>View complete catalog <MarketplaceIcon name="chevron" size={17}/></span>
                    </button>
                  </article>
                })}
              </div>
            ) : <div className="ddm-state-card"><div className="ddm-state-emoji">🔎</div>
              <h3>No matches found</h3><p>Try another search or select All categories.</p>
              <button type="button" className="ddm-reset-filter" onClick={() => { setSearch('');setCategory('all') }}>Clear filters</button>
            </div>}
          </>}
        </section>
      </div>

      <nav className="ddm-bottom-nav" aria-label="Digital Dine-In primary navigation">
        <div className="ddm-bottom-nav-inner">
          {navItems.map(item => <button key={item.label} type="button" onClick={item.onClick}
            className={`ddm-bottom-link${item.active ? ' ddm-bottom-active' : ''}`}
            aria-current={item.active ? 'page' : undefined}>
            <MarketplaceIcon name={item.icon} size={22}/>
            <span>{item.label}</span>
          </button>)}
        </div>
      </nav>
    </main>
  )
}
