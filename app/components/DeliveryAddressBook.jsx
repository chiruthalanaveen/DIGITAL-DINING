'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import DeliveryLocationMap from '@/app/components/DeliveryLocationMap'

const TABLE = 'delivery_customer_saved_addresses'
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PHONE = /^[0-9]{10}$/
const PINCODE = /^[0-9]{6}$/
const EMPTY = {
  label: 'Home', recipient_name: '', recipient_mobile: '',
  address_line1: '', address_line2: '', landmark: '', city: '', state: '', pincode: '',
}

function validPoint(latitude, longitude) {
  return latitude !== '' && longitude !== '' && latitude != null && longitude != null &&
    Number.isFinite(Number(latitude)) && Number.isFinite(Number(longitude)) &&
    Number(latitude) >= -90 && Number(latitude) <= 90 &&
    Number(longitude) >= -180 && Number(longitude) <= 180
}

function storeId(row) {
  return String(row?.restaurantId ?? row?.restaurant_id ?? '').toLowerCase().trim()
}
function storeCode(row) {
  return String(row?.restaurantCode ?? row?.restaurant_code ?? '').trim()
}
function idsFromRpc(rows) {
  return new Set((Array.isArray(rows) ? rows : [])
    .map((row) => String(typeof row === 'string' ? row : row?.restaurant_id ?? row?.restaurantId ?? '').toLowerCase().trim())
    .filter((id) => UUID.test(id)))
}
function distanceKm(row) {
  const value = row?.distanceKm ?? row?.distance_km ?? row?.distance
  if (value != null && value !== '' && Number.isFinite(Number(value))) return Number(value)
  const meters = row?.distanceMeters ?? row?.distance_meters
  if (meters != null && meters !== '' && Number.isFinite(Number(meters))) return Number(meters) / 1000
  return null
}
function formatDistance(km) {
  if (km == null) return ''
  if (km < 1) return `${Math.round(km * 1000)} m`
  return `${km.toFixed(1)} km`
}
function prettifyAddress(a) {
  return [a.address_line1, a.address_line2, a.landmark, a.city, a.state, a.pincode]
    .filter(Boolean).join(', ')
}

// An availability check is NEVER a permanent address property. It must be checked
// for the exact pin against current open status, service radius, approval and wallet.
async function checkAddressAvailability(address) {
  const latitude = Number(address.latitude)
  const longitude = Number(address.longitude)
  if (!validPoint(latitude, longitude)) return { status: 'unavailable', count: 0 }

  const { data, error } = await supabase.rpc('get_nearby_delivery_stores', {
    p_latitude: latitude, p_longitude: longitude,
  })
  if (error || data?.success !== true) throw error || new Error(data?.message || 'Store lookup failed')

  const stores = (Array.isArray(data.stores) ? data.stores : [])
    .filter((row) => UUID.test(storeId(row)) && /^[A-Za-z0-9_-]{1,80}$/.test(storeCode(row)))
    .filter((row) => row.isOpen !== false && row.is_open !== false && String(row.status || '').toLowerCase() !== 'closed')
  if (!stores.length) return { status: 'unavailable', count: 0 }
  const ids = [...new Set(stores.map(storeId))].slice(0, 100)
  const [wallet, plan] = await Promise.all([
    supabase.rpc('delivery_wallet_eligible_restaurant_ids', { p_restaurant_ids: ids }),
    supabase.rpc('delivery_plan_eligible_restaurant_ids', { p_restaurant_ids: ids }),
  ])
  if (wallet.error || plan.error) throw wallet.error || plan.error
  const allowedWallet = idsFromRpc(wallet.data)
  const allowedPlan = idsFromRpc(plan.data)
  const matching = stores.filter((store) => allowedWallet.has(storeId(store)) && allowedPlan.has(storeId(store)))
    .sort((a, b) => (distanceKm(a) ?? Infinity) - (distanceKm(b) ?? Infinity))
  const nearest = matching[0]
  return nearest
    ? { status: 'available', count: matching.length, storeCode: storeCode(nearest), storeName: String(nearest.name || nearest.storeName || nearest.restaurantName || ''), km: distanceKm(nearest) }
    : { status: 'unavailable', count: 0 }
}

const fieldClass = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-3 text-sm text-slate-900 outline-none focus:border-emerald-500'
function FormField({ name, label, value, onChange, required = false, placeholder = '', maxLength = 240, inputMode }) {
  return (
    <label className="block text-xs font-bold text-slate-600">
      {label}{required ? ' *' : ''}
      <input type="text" inputMode={inputMode} className={fieldClass}
        name={name} value={value} onChange={(event) => onChange(name, event.target.value)}
        maxLength={maxLength} required={required} placeholder={placeholder} />
    </label>
  )
}

export default function DeliveryAddressBook({ destination, onUseLocation, onUseCurrentGps, onOpenMap, compact = false }) {
  const router = useRouter()
  const [user, setUser] = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [addresses, setAddresses] = useState([])
  const [addressLoading, setAddressLoading] = useState(false)
  const [availability, setAvailability] = useState({})
  const [availabilityRevision, setAvailabilityRevision] = useState(0)
  const [message, setMessage] = useState('')
  const [open, setOpen] = useState(false)
  const [editorOpen, setEditorOpen] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [pin, setPin] = useState(null)
  const [accuracy, setAccuracy] = useState(null)
  const [locationSource, setLocationSource] = useState('map')
  const [addressForm, setAddressForm] = useState(EMPTY)
  const [locating, setLocating] = useState(false)
  const [reverseLoading, setReverseLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [editorError, setEditorError] = useState('')
  const sessionRef = useRef(0)
  const availabilityRef = useRef(0)
  const coordsRef = useRef(0)

  const loadSavedAddresses = useCallback(async (uid) => {
    if (!uid) return
    setAddressLoading(true)
    try {
      const { data, error } = await supabase.from(TABLE)
        .select('id,user_id,label,recipient_name,recipient_mobile,address_line1,address_line2,landmark,city,state,pincode,latitude,longitude,gps_accuracy_m,is_default,created_at')
        .eq('user_id', uid).order('created_at', { ascending: false }).limit(30)
      if (error) throw error
      setAddresses(Array.isArray(data) ? data : [])
    } catch (error) {
      setMessage(error?.message || 'Unable to load saved addresses. Install the address table SQL.')
    } finally {
      setAddressLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    const epoch = ++sessionRef.current
    const reload = async () => {
      const { data, error } = await supabase.auth.getUser()
      if (!active || sessionRef.current !== epoch) return
      if (error || !data?.user) {
        setUser(null); setAddresses([]); setAvailability({}); setAuthLoading(false)
      } else {
        setUser(data.user); setAuthLoading(false)
        await loadSavedAddresses(data.user.id)
      }
    }
    void reload()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      // Defer queries out of the auth callback to avoid Supabase auth locks.
      Promise.resolve().then(() => { if (active) void reload() })
    })
    return () => { active = false; sessionRef.current++; subscription?.unsubscribe() }
  }, [loadSavedAddresses])

  useEffect(() => {
    const run = ++availabilityRef.current
    if (!user?.id || !addresses.length) { setAvailability({}); return }
    const initial = Object.fromEntries(addresses.map((address) => [address.id, { status: 'checking' }]))
    setAvailability(initial)
    // Bound concurrency for multiple address cards; results are scoped to this user.
    const check = async () => {
      const results = {}
      for (let i = 0; i < addresses.length; i += 4) {
        const batch = addresses.slice(i, i + 4)
        const resolved = await Promise.all(batch.map(async (address) => {
          try { return [address.id, await checkAddressAvailability(address)] }
          catch (error) {
            console.warn('[DELIVERY] Saved address availability check failed:', error)
            return [address.id, { status: 'error' }]
          }
        }))
        if (availabilityRef.current !== run) return
        for (const [id, result] of resolved) results[id] = result
        setAvailability((current) => ({ ...current, ...Object.fromEntries(resolved) }))
      }
    }
    void check()
    return () => { availabilityRef.current++ }
  }, [user?.id, addresses, open, availabilityRevision])

  const updateForm = (name, value) => {
    setAddressForm((current) => ({ ...current, [name]: value }))
  }

  const reverseAddress = useCallback(async (latitude, longitude) => {
    const sequence = ++coordsRef.current
    setReverseLoading(true)
    setEditorError('')
    try {
      const response = await fetch(`/api/location/reverse?lat=${encodeURIComponent(latitude)}&lng=${encodeURIComponent(longitude)}`, { cache: 'no-store' })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload.success) throw new Error(payload.message || 'Unable to find the written address')
      if (coordsRef.current !== sequence) return
      const info = payload.address || {}
      setAddressForm((current) => ({
        ...current,
        address_line1: String(info.addressLine1 || ''),
        address_line2: String(info.addressLine2 || ''),
        landmark: String(info.landmark || ''),
        city: String(info.city || ''),
        state: String(info.state || ''),
        pincode: String(info.pincode || '').replace(/\D/g, '').slice(0, 6),
      }))
    } catch (error) {
      if (coordsRef.current === sequence) {
        setEditorError('Pin selected, but the written address could not be filled automatically. Please enter it below.')
      }
    } finally {
      if (coordsRef.current === sequence) setReverseLoading(false)
    }
  }, [])

  const requestExactGps = useCallback(() => {
    if (!window.isSecureContext || !navigator.geolocation) {
      setEditorError('Location permission requires HTTPS or localhost and a GPS-capable device.')
      return
    }
    setLocating(true)
    setEditorError('')
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocating(false)
        const lat = Number(position.coords.latitude)
        const lng = Number(position.coords.longitude)
        if (!validPoint(lat, lng)) { setEditorError('GPS returned an invalid location.'); return }
        setPin({ latitude: lat, longitude: lng })
        setAccuracy(Number(position.coords.accuracy) || null)
        setLocationSource('gps')
        void reverseAddress(lat, lng)
      },
      (error) => {
        setLocating(false)
        setEditorError(error?.code === 1 ? 'GPS permission denied. You can still choose the address on the map.' : 'Unable to get your live GPS location. You can choose a pin on the map.')
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 }
    )
  }, [reverseAddress])

  const startAdd = () => {
    if (!user) { router.push('/delivery/login?next=%2Fdelivery%3Fchoose%3D1'); return }
    setEditingId(null)
    setAddressForm(EMPTY)
    setEditorError('')
    setPin(destination?.latitude != null && validPoint(destination.latitude, destination.longitude)
      ? { latitude: Number(destination.latitude), longitude: Number(destination.longitude) }
      : { latitude: 20.5937, longitude: 78.9629 })
    setAccuracy(null)
    setLocationSource('map')
    setEditorOpen(true)
    // Start a fresh location request (never an old cached geolocation).
    requestAnimationFrame(() => requestExactGps())
  }

  const startEdit = (address) => {
    setEditingId(address.id)
    setAddressForm({
      label: address.label, recipient_name: address.recipient_name || '', recipient_mobile: address.recipient_mobile || '',
      address_line1: address.address_line1, address_line2: address.address_line2 || '', landmark: address.landmark || '',
      city: address.city, state: address.state, pincode: address.pincode,
    })
    setPin({ latitude: Number(address.latitude), longitude: Number(address.longitude) })
    setAccuracy(address.gps_accuracy_m != null ? Number(address.gps_accuracy_m) : null)
    setLocationSource('saved')
    setEditorError('')
    setEditorOpen(true)
  }

  const movePin = (lat, lng) => {
    if (!validPoint(lat, lng)) return
    setPin({ latitude: Number(lat), longitude: Number(lng) })
    setAccuracy(null)
    setLocationSource('map')
    // Wipe the old written address until reverse-geocoding the new pin.
    setAddressForm((current) => ({ ...current, address_line1: '', address_line2: '', landmark: '', city: '', state: '', pincode: '' }))
    setEditorError('The pin moved. Tap “Fill address from pin” to load its location details.')
  }

  const saveAddress = async (event) => {
    event.preventDefault()
    if (!user) { setEditorError('Sign in to save an address.'); return }
    if (!pin || !validPoint(pin.latitude, pin.longitude)) { setEditorError('Choose a valid GPS or map pin.'); return }
    const label = addressForm.label.trim().slice(0, 40)
    const line1 = addressForm.address_line1.trim()
    const city = addressForm.city.trim()
    const state = addressForm.state.trim()
    const pincode = addressForm.pincode.trim()
    const mobile = addressForm.recipient_mobile.replace(/\D/g, '')
    if (!label || line1.length < 2 || city.length < 2 || state.length < 2 || !PINCODE.test(pincode)) {
      setEditorError('Enter a label, house/street, city, state and valid 6-digit pincode.'); return
    }
    if (mobile && !PHONE.test(mobile)) { setEditorError('Recipient mobile must be 10 digits.'); return }
    setSaving(true); setEditorError('')
    try {
      const payload = {
        label, recipient_name: addressForm.recipient_name.trim().slice(0, 120), recipient_mobile: mobile,
        address_line1: line1.slice(0, 240), address_line2: addressForm.address_line2.trim().slice(0, 240),
        landmark: addressForm.landmark.trim().slice(0, 240), city: city.slice(0, 120), state: state.slice(0, 120),
        pincode, latitude: Number(pin.latitude).toFixed(7), longitude: Number(pin.longitude).toFixed(7),
        gps_accuracy_m: locationSource === 'gps' && accuracy != null ? Number(accuracy.toFixed(2)) : null,
      }
      let result
      if (editingId) result = await supabase.from(TABLE).update(payload).eq('id', editingId).eq('user_id', user.id).select('id').single()
      else result = await supabase.from(TABLE).insert({ ...payload, user_id: user.id, is_default: addresses.length === 0 }).select('id').single()
      if (result.error) throw result.error
      setEditorOpen(false)
      setMessage(editingId ? 'Saved address updated.' : 'Address saved to your account.')
      await loadSavedAddresses(user.id)
    } catch (error) {
      setEditorError(error?.message || 'Unable to save address. Please retry.')
    } finally { setSaving(false) }
  }

  const chooseAddress = (address) => {
    const status = availability[address.id]?.status
    if (status !== 'available') return
    const point = {
      latitude: Number(address.latitude), longitude: Number(address.longitude),
      source: 'saved', savedAddressId: address.id, ownerUserId: user.id,
      accuracy: Number(address.gps_accuracy_m || 0) || null,
      label: address.label,
      addressLine1: address.address_line1, addressLine2: address.address_line2,
      landmark: address.landmark, city: address.city, state: address.state, pincode: address.pincode,
      recipientName: address.recipient_name, recipientMobile: address.recipient_mobile,
    }
    setOpen(false)
    onUseLocation?.(point)
  }

  const useLiveLocation = () => {
    setOpen(false)
    onUseCurrentGps?.()
  }

  return (
    <>
      {compact ? (
        <button type="button" onClick={() => setOpen(true)} className="mt-2 w-full rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-left text-xs font-black text-emerald-800">⌖ Saved addresses / Add new address →</button>
      ) : <header className="flex items-center gap-3 rounded-[22px] border border-slate-200 bg-white px-4 py-3 shadow-sm">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-2xl" aria-hidden="true">📍</span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">Deliver to</p>
          <p className="truncate text-sm font-black text-slate-950">{destination?.label || (destination?.source === 'saved' ? 'Saved address' : destination?.source === 'gps' ? 'Current location' : destination ? 'Selected location' : 'Finding location…')}</p>
          <p className="truncate text-[11px] text-slate-500">{destination?.addressLine1 ? [destination.addressLine1, destination.city].filter(Boolean).join(', ') : 'Choose another delivery address anytime'}</p>
        </div>
        <button type="button" onClick={() => setOpen(true)} className="shrink-0 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-black text-emerald-700 hover:bg-emerald-100">Change</button>
      </header>}

      {message && <div className="mt-2 rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600" role="status">{message}</div>}

      {open && (
        <div className="fixed inset-0 z-[100] overflow-y-auto bg-[#f5f7f6] px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-slate-950" role="dialog" aria-modal="true" aria-label="Select delivery address">
          <div className="mx-auto max-w-xl">
            <div className="flex items-center gap-3">
              <button onClick={() => setOpen(false)} type="button" aria-label="Close address picker" className="grid h-11 w-11 place-items-center rounded-full border border-slate-200 bg-white text-lg">←</button>
              <div className="flex-1"><h2 className="text-xl font-black">Delivery location</h2><p className="text-xs text-slate-500">Choose an address or use your live GPS</p></div>
            </div>
            <button onClick={useLiveLocation} type="button" className="mt-5 w-full rounded-2xl border border-emerald-200 bg-white px-4 py-4 text-left shadow-sm">
              <span className="text-sm font-black text-emerald-700">◎ Use my current GPS location</span>
              <span className="mt-1 block text-xs text-slate-500">Find currently available stores around you</span>
            </button>

            {typeof onOpenMap === 'function' && (
              <button type="button" onClick={() => { setOpen(false); onOpenMap() }} className="mt-3 w-full rounded-2xl border border-slate-200 bg-white px-4 py-3.5 text-left text-sm font-black text-slate-700">📍 Choose another location on map</button>
            )}

            <div className="mt-6 flex items-center justify-between gap-2">
              <h3 className="text-lg font-black">Saved addresses</h3>
              {user && addresses.length > 0 && <button type="button" onClick={() => setAvailabilityRevision((v) => v + 1)} className="ml-auto rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-[11px] font-bold text-slate-700">Refresh availability</button>}
              {user && <button type="button" onClick={startAdd} className="rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-black text-white">+ Add new</button>}
            </div>

            {authLoading || addressLoading ? <p className="mt-3 text-sm text-slate-500">Loading your account addresses…</p> :
              !user ? (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-5">
                  <p className="text-sm text-slate-600">Sign in to save and reuse your addresses across visits.</p>
                  <button type="button" onClick={() => router.push('/delivery/login?next=%2Fdelivery%3Fchoose%3D1')} className="mt-3 rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-black text-white">Sign in</button>
                </div>
              ) : addresses.length === 0 ? (
                <div className="mt-3 rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-600">No saved addresses yet. Add your home, work or a recipient's address.</div>
              ) : (
                <div className="mt-3 grid gap-3">
                  {addresses.map((address) => {
                    const check = availability[address.id]?.status || 'checking'
                    const available = check === 'available'
                    return (
                      <section key={address.id} className="rounded-[22px] border border-slate-200 bg-white p-4 shadow-sm">
                        <div className="flex items-start gap-3">
                          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-emerald-50 text-xl">{address.label.toLowerCase().includes('work') ? '🏢' : '🏠'}</div>
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2"><strong className="text-sm">{address.label}</strong>
                              {check === 'available' ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black text-emerald-700">Available</span>
                                : check === 'unavailable' ? <span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-black text-red-700">Not available at this address</span>
                                : check === 'error' ? <span className="rounded-full bg-amber-50 px-2 py-1 text-[10px] font-black text-amber-700">Unable to verify</span>
                                : <span className="text-[10px] text-slate-500">Checking availability…</span>}
                            </div>
                            <p className="mt-2 text-xs leading-5 text-slate-600">{prettifyAddress(address)}</p>
                            {available ? <p className="mt-2 text-[11px] font-bold text-emerald-700">{availability[address.id].count} {availability[address.id].count === 1 ? 'store delivers' : 'stores deliver'} here {availability[address.id].km != null ? `· Nearest ${formatDistance(availability[address.id].km)}` : ''}</p> : null}
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button type="button" disabled={!available} onClick={() => chooseAddress(address)} className="rounded-xl bg-slate-950 px-4 py-2.5 text-xs font-black text-white disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-500">Deliver here</button>
                              <button type="button" onClick={() => startEdit(address)} className="rounded-xl border border-slate-200 px-3 py-2.5 text-xs font-bold text-slate-700">Edit address / landmark</button>
                            </div>
                          </div>
                        </div>
                      </section>
                    )
                  })}
                </div>
              )}
            {checkHasNoAddress(user, addresses, addressLoading) && <button type="button" onClick={startAdd} className="mt-4 w-full rounded-2xl bg-emerald-600 px-5 py-3 text-sm font-black text-white">+ Add a saved address</button>}
          </div>
        </div>
      )}

      {editorOpen && (
        <div className="fixed inset-0 z-[110] overflow-y-auto bg-white pb-[max(1.5rem,env(safe-area-inset-bottom))] text-slate-950" role="dialog" aria-modal="true" aria-label="Add or edit delivery address">
          <div className="mx-auto max-w-xl px-4 pt-[max(0.75rem,env(safe-area-inset-top))]">
            <div className="flex items-center gap-3 pb-3">
              <button type="button" onClick={() => setEditorOpen(false)} aria-label="Close address form" className="grid h-10 w-10 place-items-center rounded-full border border-slate-200">←</button>
              <div className="flex-1"><h2 className="text-lg font-black">{editingId ? 'Edit saved address' : 'Add new address'}</h2><p className="text-xs text-slate-500">Confirm the pin and address details</p></div>
              <button type="button" onClick={requestExactGps} disabled={locating} className="rounded-xl bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-700 disabled:opacity-60">{locating ? 'Getting GPS…' : '◎ My GPS'}</button>
            </div>
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
              {pin && <DeliveryLocationMap latitude={pin.latitude} longitude={pin.longitude} onChange={({ latitude, longitude }) => movePin(latitude, longitude)} zoom={16} height={310} />}
            </div>
            <p className="mt-2 text-xs leading-5 text-slate-500">{pin ? `Pin: ${pin.latitude.toFixed(6)}, ${pin.longitude.toFixed(6)}` : 'Choose your pin'} {locationSource === 'gps' && accuracy != null ? ` · GPS accuracy approximately ±${Math.round(accuracy)} m` : ' · Map pin selected manually'}</p>
            <button type="button" onClick={() => pin && reverseAddress(pin.latitude, pin.longitude)} disabled={!pin || reverseLoading} className="mt-3 w-full rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-black text-emerald-700 disabled:opacity-50">{reverseLoading ? 'Finding address…' : 'Fill address from pin'}</button>
            <p className="mt-2 text-[11px] text-slate-500">Auto-filled address lines may be approximate. Verify house, street and landmark before saving.</p>
            <form onSubmit={saveAddress} className="mt-4 grid grid-cols-2 gap-3">
              <div className="col-span-2"><FormField name="label" label="Address label" value={addressForm.label} onChange={updateForm} maxLength={40} required placeholder="Home / Office / Other" /></div>
              <div className="col-span-2"><FormField name="recipient_name" label="Recipient name" value={addressForm.recipient_name} onChange={updateForm} maxLength={120} placeholder="Optional — for someone else" /></div>
              <div className="col-span-2"><FormField name="recipient_mobile" label="Recipient mobile" value={addressForm.recipient_mobile} onChange={(name, value) => updateForm(name, value.replace(/\D/g, '').slice(0, 10))} maxLength={10} inputMode="numeric" placeholder="Optional 10-digit number" /></div>
              <div className="col-span-2"><FormField name="address_line1" label="House / Street" value={addressForm.address_line1} onChange={updateForm} required /></div>
              <div className="col-span-2"><FormField name="address_line2" label="Area / Locality" value={addressForm.address_line2} onChange={updateForm} /></div>
              <div className="col-span-2"><FormField name="landmark" label="Landmark (editable)" value={addressForm.landmark} onChange={updateForm} placeholder="Near school / temple / building" /></div>
              <FormField name="city" label="City" value={addressForm.city} onChange={updateForm} required maxLength={120} />
              <FormField name="state" label="State" value={addressForm.state} onChange={updateForm} required maxLength={120} />
              <div className="col-span-2"><FormField name="pincode" label="Pincode" value={addressForm.pincode} onChange={(name, value) => updateForm(name, value.replace(/\D/g, '').slice(0, 6))} required maxLength={6} inputMode="numeric" /></div>
              {editorError && <p className="col-span-2 rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800" role="alert">{editorError}</p>}
              <button type="submit" disabled={saving || reverseLoading || locating} className="col-span-2 rounded-2xl bg-emerald-600 px-5 py-4 text-sm font-black text-white disabled:opacity-50">{saving ? 'Saving address…' : editingId ? 'Save address changes' : 'Save address to my account'}</button>
            </form>
          </div>
        </div>
      )}
    </>
  )
}

function checkHasNoAddress(user, addresses, loading) {
  return Boolean(user && !loading && addresses.length === 0)
}
