'use client'
// VS Code: app/components/DeliverySavedAddressPicker.jsx
// One address picker for Google and store-scoped Mobile/PIN accounts.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { createPortal } from 'react-dom'
import { supabase } from '@/lib/supabase'
import DeliveryLocationMap from '@/app/components/DeliveryLocationMap'

const EMPTY = {
  label: 'Home', recipient_name: '', recipient_mobile: '', address_line1: '',
  address_line2: '', landmark: '', city: '', state: '', pincode: '',
}
const validPin = (lat, lng) => lat !== '' && lng !== '' && lat != null && lng != null &&
  Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) &&
  Number(lat) >= -90 && Number(lat) <= 90 && Number(lng) >= -180 && Number(lng) <= 180
const format = (a) => [a.address_line1, a.address_line2, a.landmark, a.city, a.state, a.pincode].filter(Boolean).join(', ')
const validContact = (a) => String(a?.recipient_name || '').trim().length >= 2 && /^\d{10}$/.test(String(a?.recipient_mobile || ''))
const inputClass = 'mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-950 outline-none focus:border-emerald-500'
function Field({ label, value, onChange, required, type = 'text', placeholder, maxLength = 240, inputMode }) {
  return <label className="block text-xs font-bold text-slate-600">{label}{required ? ' *' : ''}
    <input type={type} value={value} onChange={event => onChange(event.target.value)} required={required}
      placeholder={placeholder} maxLength={maxLength} inputMode={inputMode} className={inputClass} />
  </label>
}

export default function DeliverySavedAddressPicker({
  restaurantCode = '', accountType = 'auto', destination = null,
  onSelect, autoApplyDefault = true, compact = false, onReady,
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [editor, setEditor] = useState(false)
  const [addresses, setAddresses] = useState([])
  const [availability, setAvailability] = useState({})
  const availabilityRevision = useRef(0)
  const [identity, setIdentity] = useState('')
  const [account, setAccount] = useState({})
  const [userId, setUserId] = useState(null)
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [locating, setLocating] = useState(false)
  const [error, setError] = useState('')
  const [form, setForm] = useState(EMPTY)
  const [editingId, setEditingId] = useState('')
  const [point, setPoint] = useState(null)
  const [accuracy, setAccuracy] = useState(null)
  const [makeDefault, setMakeDefault] = useState(true)
  const lastAutoRef = useRef('')
  const currentRequest = useRef(0)
  const onSelectRef = useRef(onSelect)
  onSelectRef.current = onSelect
  const onReadyRef = useRef(onReady)
  onReadyRef.current = onReady
  useEffect(() => {
    const openSelector = () => setOpen(true)
    window.addEventListener('digitaldine:select-address', openSelector)
    return () => window.removeEventListener('digitaldine:select-address', openSelector)
  }, [])

  const callApi = useCallback(async (method, body = null) => {
    const { data } = await supabase.auth.getSession()
    const googleToken = data?.session?.access_token
    const params = new URLSearchParams({ accountType, ...(restaurantCode ? { restaurantCode } : {}) })
    const response = await fetch(`/api/delivery/customer/addresses?${params.toString()}`, {
      method, credentials: 'same-origin', cache: 'no-store',
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(googleToken ? { Authorization: `Bearer ${googleToken}` } : {}),
      },
      ...(body ? { body: JSON.stringify({ ...body, accountType, restaurantCode }) } : {}),
    })
    const dataResponse = await response.json().catch(() => ({}))
    if (!response.ok || !dataResponse?.success) {
      const exception = new Error(dataResponse.message || 'Unable to load delivery addresses.')
      exception.status = response.status
      throw exception
    }
    return dataResponse
  }, [accountType, restaurantCode])

  const toPoint = useCallback((address, type, uid) => ({
    latitude: Number(address.latitude), longitude: Number(address.longitude),
    source: 'saved', savedAddressId: address.id,
    ownerUserId: type === 'google' ? uid : null,
    accuracy: address.gps_accuracy_m == null ? null : Number(address.gps_accuracy_m),
    label: address.label,
    addressLine1: address.address_line1, addressLine2: address.address_line2 || '',
    landmark: address.landmark || '', city: address.city, state: address.state,
    pincode: address.pincode, recipientName: address.recipient_name,
    recipientMobile: address.recipient_mobile,
  }), [])

  const load = useCallback(async (applyDefault = true) => {
    const id = ++currentRequest.current
    setLoading(true)
    try {
      const result = await callApi('GET')
      if (id !== currentRequest.current) return
      const rows = Array.isArray(result.addresses) ? result.addresses : []
      setAddresses(rows)
      setIdentity(result.accountType)
      setAccount(result.account || {})
      setUserId(result.userId || null)
      setError('')
      const defaultAddress = rows.find(a => a.is_default === true)
      const usableDefault = Boolean(defaultAddress && validContact(defaultAddress))
      if (defaultAddress && applyDefault && autoApplyDefault && validContact(defaultAddress)) {
        const key = `${result.accountType}:${result.userId || restaurantCode}:${defaultAddress.id}`
        if (lastAutoRef.current !== key) {
          lastAutoRef.current = key
          setSelected(defaultAddress.id)
          onSelectRef.current?.(toPoint(defaultAddress, result.accountType, result.userId))
        }
      }
      onReadyRef.current?.(usableDefault)
    } catch (caught) {
      if (id !== currentRequest.current) return
      onReadyRef.current?.(false)
      setIdentity('')
      setAddresses([])
      setSelected('')
      setError(caught?.message || 'Unable to access saved addresses.')
    } finally {
      if (id === currentRequest.current) setLoading(false)
    }
  }, [callApi, autoApplyDefault, toPoint, restaurantCode])

  useEffect(() => {
    lastAutoRef.current = ''
    void load(true)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      Promise.resolve().then(() => void load(true))
    })
    return () => { currentRequest.current += 1; subscription?.unsubscribe() }
  }, [load])

  // Availability is evaluated for each saved GPS pin; never cache a permanent
  // 'available' status. Wallet, plan and open-state can change at any time.
  useEffect(() => {
    const sequence = ++availabilityRevision.current
    if (!open || !addresses.length) return undefined
    setAvailability(Object.fromEntries(addresses.map(a => [a.id, 'checking'])))
    const check = async () => {
      for (let start = 0; start < addresses.length; start += 3) {
        const results = await Promise.all(addresses.slice(start, start + 3).map(async address => {
          try {
            const { data, error } = await supabase.rpc('get_nearby_delivery_stores', {
              p_latitude: Number(address.latitude), p_longitude: Number(address.longitude),
            })
            if (error || data?.success !== true) return [address.id, 'unknown']
            const candidates = (Array.isArray(data.stores) ? data.stores : []).filter(store =>
              store.isOpen !== false && store.is_open !== false &&
              (!restaurantCode || String(store.restaurantCode ?? store.restaurant_code) === restaurantCode)
            )
            const ids = [...new Set(candidates.map(store => String(store.restaurantId ?? store.restaurant_id ?? '')))].filter(Boolean)
            if (!ids.length) return [address.id, 'unavailable']
            const [wallet, plan] = await Promise.all([
              supabase.rpc('delivery_wallet_eligible_restaurant_ids', { p_restaurant_ids: ids }),
              supabase.rpc('delivery_plan_eligible_restaurant_ids', { p_restaurant_ids: ids }),
            ])
            if (wallet.error || plan.error) return [address.id, 'unknown']
            const asId = row => String(typeof row === 'string' ? row : row?.restaurant_id ?? row?.restaurantId ?? '').toLowerCase()
            const allowedWallet = new Set((Array.isArray(wallet.data) ? wallet.data : []).map(asId))
            const allowedPlans = new Set((Array.isArray(plan.data) ? plan.data : []).map(asId))
            const ok = ids.some(id => allowedWallet.has(id.toLowerCase()) && allowedPlans.has(id.toLowerCase()))
            return [address.id, ok ? 'available' : 'unavailable']
          } catch { return [address.id, 'unknown'] }
        }))
        if (availabilityRevision.current !== sequence) return
        setAvailability(current => ({ ...current, ...Object.fromEntries(results) }))
      }
    }
    void check()
    return () => { availabilityRevision.current += 1 }
  }, [open, addresses, restaurantCode])

  const selectAddress = (address) => {
    if (availability[address.id] === 'unavailable') {
      setError(restaurantCode ? 'This store does not deliver to that saved address.' : 'No eligible nearby stores deliver to that saved address currently.')
      return
    }
    if (!validContact(address)) {
      setError('This saved address needs a recipient name and 10-digit mobile. Tap Edit address.')
      return
    }
    setSelected(address.id)
    setError('')
    setOpen(false)
    onSelectRef.current?.(toPoint(address, identity, userId))
  }
  const changeDefault = async (address) => {
    setSaving(true)
    setError('')
    try {
      await callApi('PATCH', { addressId: address.id, setDefault: true })
      lastAutoRef.current = ''
      await load(false)
      selectAddress({ ...address, is_default: true })
    } catch (caught) { setError(caught.message) }
    finally { setSaving(false) }
  }
  const deleteAddress = async (address) => {
    if (!window.confirm(`Delete ${address.label} address?`)) return
    setSaving(true)
    try {
      await callApi('DELETE', { addressId: address.id })
      if (selected === address.id) setSelected('')
      lastAutoRef.current = ''
      await load(true)
    } catch (caught) { setError(caught.message) }
    finally { setSaving(false) }
  }

  const beginEdit = (address = null) => {
    setError('')
    setEditingId(address?.id || '')
    setMakeDefault(!address || !!address.is_default)
    setForm(address ? {
      label: address.label, recipient_name: address.recipient_name || '',
      recipient_mobile: address.recipient_mobile || '', address_line1: address.address_line1 || '',
      address_line2: address.address_line2 || '', landmark: address.landmark || '',
      city: address.city || '', state: address.state || '', pincode: address.pincode || '',
    } : { ...EMPTY, recipient_name: account.name || '', recipient_mobile: account.mobile || '' })
    const lat = address?.latitude ?? destination?.latitude
    const lng = address?.longitude ?? destination?.longitude
    setPoint(validPin(lat, lng) ? { latitude: Number(lat), longitude: Number(lng) } : null)
    setAccuracy(address?.gps_accuracy_m ?? null)
    setEditor(true)
  }
  const getGps = () => {
    if (!window.isSecureContext || !navigator.geolocation) {
      setError('GPS requires HTTPS or localhost. You can enter the coordinates or select the pin on the map.')
      return
    }
    setLocating(true)
    setError('')
    navigator.geolocation.getCurrentPosition(
      location => {
        setLocating(false)
        const coords = { latitude: location.coords.latitude, longitude: location.coords.longitude }
        if (!validPin(coords.latitude, coords.longitude)) return
        setPoint(coords)
        setAccuracy(location.coords.accuracy || null)
        void reverseLocation(coords)
      },
      () => { setLocating(false); setError('GPS unavailable. Select an address pin manually or enter coordinates.') },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    )
  }
  const reverseLocation = async ({ latitude, longitude }) => {
    try {
      const response = await fetch(`/api/location/reverse?lat=${encodeURIComponent(latitude)}&lng=${encodeURIComponent(longitude)}`, { cache: 'no-store' })
      const result = await response.json().catch(() => ({}))
      if (response.ok && result?.success && result?.address) {
        const a = result.address
        setForm(current => ({ ...current,
          address_line1: String(a.addressLine1 || current.address_line1),
          address_line2: String(a.addressLine2 || current.address_line2),
          landmark: String(a.landmark || current.landmark),
          city: String(a.city || current.city), state: String(a.state || current.state),
          pincode: String(a.pincode || current.pincode).replace(/\D/g, '').slice(0, 6),
        }))
      }
    } catch { /* Reverse-geocoding is optional; exact address must be checked. */ }
  }
  const save = async (event) => {
    event.preventDefault()
    // The editor is rendered in a portal inside a checkout component tree.
    // Do not bubble this save submit to the surrounding Place Order form.
    event.stopPropagation()
    if (!point || !validPin(point.latitude, point.longitude)) { setError('Select the delivery location on the map or use GPS.'); return }
    setSaving(true)
    setError('')
    try {
      const address = { ...form, label: form.label.trim() || 'Home',
        recipient_mobile: String(form.recipient_mobile || '').replace(/\D/g, ''),
        pincode: String(form.pincode || '').replace(/\D/g, ''),
        latitude: Number(point.latitude), longitude: Number(point.longitude),
        gps_accuracy_m: accuracy != null && Number.isFinite(Number(accuracy)) ? Number(accuracy) : null,
      }
      const response = editingId
        ? await callApi('PATCH', { addressId: editingId, address, makeDefault })
        : await callApi('POST', { address, makeDefault })
      setEditor(false)
      setError('')
      const savedId = response.addressId || editingId
      await load(false)
      setSelected(savedId)
      setOpen(false)
      onSelectRef.current?.(toPoint({ ...address, id: savedId }, identity || accountType, userId))
      if (makeDefault) lastAutoRef.current = `${identity}:${userId || restaurantCode}:${savedId}`
    } catch (caught) { setError(caught?.message || 'Unable to save address.') }
    finally { setSaving(false) }
  }

  const activeAddress = addresses.find(row => row.id === selected) || addresses.find(row => row.is_default)
  return <>
    <button type="button" onClick={() => setOpen(true)}
      className={`flex w-full items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-white p-3 text-left shadow-sm ${compact ? '' : 'my-3'}`}>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-xl">📍</span>
      <span className="min-w-0 flex-1">
        <span className="block text-[10px] font-black uppercase tracking-wider text-emerald-700">Deliver to</span>
        <span className="block truncate text-sm font-black text-slate-950">{activeAddress?.label || (loading ? 'Checking saved addresses…' : 'Select address')}</span>
        {activeAddress && <span className="block truncate text-[11px] text-slate-500">{format(activeAddress)}</span>}
      </span>
      <span className="shrink-0 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-black text-white">{activeAddress ? 'Change' : 'Select address'}</span>
    </button>
    {typeof document !== 'undefined' && createPortal(<>
    {open && <div className="fixed inset-0 z-[110] overflow-y-auto bg-white pb-10 text-slate-950" role="dialog" aria-modal="true" aria-label="Select delivery address">
      <div className="mx-auto max-w-xl px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="flex items-center gap-3"><button type="button" onClick={() => setOpen(false)} className="grid h-10 w-10 place-items-center rounded-xl border border-slate-200" aria-label="Close address selector">←</button>
          <div className="flex-1"><h2 className="text-xl font-black">Select address</h2><p className="text-xs text-slate-500">Choose once and reuse your default at checkout</p></div>
          <button type="button" onClick={() => beginEdit()} disabled={!identity} className="rounded-xl bg-emerald-600 px-3 py-2.5 text-xs font-black text-white disabled:opacity-40">+ Add address</button>
        </div>
        {error && <p className="mt-4 rounded-xl bg-red-50 p-3 text-xs text-red-700" role="alert">{error}</p>}
        {!identity && !loading && <button type="button" onClick={() => router.push(`/delivery/login?next=${encodeURIComponent(restaurantCode ? `/delivery?store=${restaurantCode}` : '/delivery')}`)} className="mt-5 rounded-xl bg-emerald-600 p-3 text-xs font-bold text-white">Sign in to save addresses</button>}
        {loading && <p className="mt-6 text-sm text-slate-500">Loading your addresses…</p>}
        {!loading && identity && addresses.length === 0 && <p className="mt-5 rounded-xl bg-slate-50 p-4 text-sm text-slate-600">No saved addresses yet. Tap + Add address to save your first default address.</p>}
        <div className="mt-5 space-y-3">{addresses.map(address => <section key={address.id} className="rounded-2xl border border-slate-200 p-4">
          <div className="flex items-center justify-between gap-2"><p className="font-black text-slate-950">{address.label}</p><div className="flex flex-wrap items-center gap-1">
            {address.is_default && <span className="rounded-full bg-emerald-50 px-3 py-1 text-[10px] font-black text-emerald-700">Default</span>}
            {availability[address.id] === 'unavailable' && <span className="rounded-full bg-red-50 px-2 py-1 text-[10px] font-bold text-red-700">Not available here</span>}
            {availability[address.id] === 'available' && <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-bold text-emerald-700">Deliverable</span>}
          </div></div>
          <p className="mt-2 text-xs leading-5 text-slate-600">{format(address)}</p>
          <p className="mt-1 text-xs text-slate-500">{address.recipient_name || 'Recipient missing'} · {address.recipient_mobile || 'Phone missing'}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" disabled={availability[address.id] === 'unavailable'} onClick={() => selectAddress(address)} className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-white disabled:bg-slate-200 disabled:text-slate-500">Deliver here</button>
            {!address.is_default && <button type="button" onClick={() => void changeDefault(address)} disabled={saving} className="rounded-lg border border-emerald-200 px-3 py-2 text-xs font-bold text-emerald-700">Set as default</button>}
            <button type="button" onClick={() => beginEdit(address)} className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-bold">Edit</button>
            <button type="button" onClick={() => void deleteAddress(address)} disabled={saving} className="rounded-lg border border-red-200 px-3 py-2 text-xs font-bold text-red-600">Delete</button>
          </div>
        </section>)}</div>
      </div>
    </div>}
    {editor && <div className="fixed inset-0 z-[120] overflow-y-auto bg-white pb-12 text-slate-950" role="dialog" aria-modal="true" aria-label="Edit saved delivery address">
      <div className="mx-auto max-w-xl px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="mb-4 flex items-center gap-3"><button type="button" onClick={() => setEditor(false)} className="grid h-10 w-10 place-items-center rounded-xl border">←</button>
          <h2 className="flex-1 text-lg font-black">{editingId ? 'Edit address' : 'Add address'}</h2>
          <button type="button" onClick={getGps} disabled={locating} className="rounded-xl bg-emerald-50 px-3 py-2.5 text-xs font-bold text-emerald-700">{locating ? 'Locating…' : '◎ Use GPS'}</button>
        </div>
        {point && validPin(point.latitude, point.longitude) && <div className="overflow-hidden rounded-2xl border border-slate-200"><DeliveryLocationMap latitude={Number(point.latitude)} longitude={Number(point.longitude)}
          onChange={({ latitude, longitude }) => { setPoint({ latitude, longitude }); setAccuracy(null) }} zoom={16} height={240} /></div>}
        <p className="mt-2 text-xs text-slate-500">Select the GPS pin while adding the address. You won't need the map again at checkout.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Field label="Latitude" value={point?.latitude ?? ''} onChange={value => setPoint(current => ({ ...current, latitude: value }))} inputMode="decimal" />
          <Field label="Longitude" value={point?.longitude ?? ''} onChange={value => setPoint(current => ({ ...current, longitude: value }))} inputMode="decimal" />
        </div>
        <button type="button" disabled={!point || !validPin(point.latitude, point.longitude)} onClick={() => void reverseLocation(point)} className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-black text-emerald-700 disabled:opacity-40">Fill address from pin</button>
        <form onSubmit={save} className="mt-4 grid grid-cols-2 gap-3">
          <div className="col-span-2"><Field label="Address label" value={form.label} onChange={value => setForm(f => ({ ...f, label: value }))} required /></div>
          <div className="col-span-2"><Field label="Recipient name" value={form.recipient_name} onChange={value => setForm(f => ({ ...f, recipient_name: value }))} required /></div>
          <div className="col-span-2"><Field label="Recipient mobile" value={form.recipient_mobile} onChange={value => setForm(f => ({ ...f, recipient_mobile: value.replace(/\D/g,'').slice(0,10) }))} required maxLength={10} inputMode="numeric" /></div>
          <div className="col-span-2"><Field label="House / Street" value={form.address_line1} onChange={value => setForm(f => ({ ...f, address_line1: value }))} required /></div>
          <div className="col-span-2"><Field label="Area / locality" value={form.address_line2} onChange={value => setForm(f => ({ ...f, address_line2: value }))} /></div>
          <div className="col-span-2"><Field label="Landmark" value={form.landmark} onChange={value => setForm(f => ({ ...f, landmark: value }))} /></div>
          <Field label="City" value={form.city} onChange={value => setForm(f => ({ ...f, city: value }))} required />
          <Field label="State" value={form.state} onChange={value => setForm(f => ({ ...f, state: value }))} required />
          <div className="col-span-2"><Field label="Pincode" value={form.pincode} onChange={value => setForm(f => ({ ...f, pincode: value.replace(/\D/g,'').slice(0,6) }))} maxLength={6} required inputMode="numeric" /></div>
          <label className="col-span-2 flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={makeDefault} onChange={e => setMakeDefault(e.target.checked)} /> Set as my default delivery address</label>
          {error && <p className="col-span-2 rounded-xl bg-red-50 p-3 text-xs text-red-700" role="alert">{error}</p>}
          <button type="submit" disabled={saving || locating} className="col-span-2 rounded-2xl bg-emerald-600 px-4 py-4 text-sm font-black text-white disabled:opacity-50">{saving ? 'Saving…' : 'Save address and use it'}</button>
        </form>
      </div>
    </div>}
    </>, document.body)}
  </>
}