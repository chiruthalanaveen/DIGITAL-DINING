'use client'

// Exact destination: app/components/DeliveryAccountProfileSheet.jsx
// Full-screen customer profile and separate Edit Profile, Address Book,
// Account Details, Orders, Preferences, and Support views inside /delivery.
// Each view has a back button and preserves the Delivery store/cart.
// The saved-address API verifies the active user; it never looks up an address
// by an unverified mobile number or browser-stored user ID.

import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import DeliverySavedAddressPicker from '@/app/components/DeliverySavedAddressPicker'

const MOBILE = /^[6-9]\d{9}$/
const STORE_CODE = /^[A-Za-z0-9_-]{1,80}$/

function formatMobile(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(-10)
  return digits.length === 10 ? `+91 ${digits}` : 'Not added yet'
}

function addressText(address) {
  return [
    address?.address_line1,
    address?.address_line2,
    address?.landmark,
    address?.city,
    address?.state,
    address?.pincode,
  ].filter(Boolean).join(', ')
}

function Detail({ label, value, lightMode = false }) {
  return (
    <div className={`min-w-0 rounded-2xl border p-3 ${lightMode ? 'border-slate-200 bg-slate-50' : 'border-white/10 bg-black/20'}`}>
      <p className={`text-[10px] font-bold uppercase tracking-wide ${lightMode ? 'text-slate-500' : 'text-[#a9a9b4]'}`}>{label}</p>
      <p className={`mt-1 break-words text-sm font-semibold ${lightMode ? 'text-slate-900' : 'text-[#f8f8fa]'}`}>{value || 'Not added yet'}</p>
    </div>
  )
}

export default function DeliveryAccountProfileSheet({
  restaurantCode,
  activeAccountType,
  customerUser,
  customerProfile,
  mobileCustomer,
  onClose,
  onOrders,
  onReturns,
  onSignOut,
  signingOut = false,
  onAddressSelected,
  onProfileUpdated,
  vegMode = false,
  onVegModeChange,
}) {
  const titleId = useId()
  const addressRequestRef = useRef(0)
  const [addresses, setAddresses] = useState([])
  const [addressesLoading, setAddressesLoading] = useState(true)
  const [addressesError, setAddressesError] = useState('')
  const [addressMessage, setAddressMessage] = useState('')
  const [apiProfile, setApiProfile] = useState(null)
  const [editing, setEditing] = useState(false)
  const [editName, setEditName] = useState('')
  const [editMobile, setEditMobile] = useState('')
  const [saving, setSaving] = useState(false)
  const [editMessage, setEditMessage] = useState('')
  const [profileSaved, setProfileSaved] = useState(false)
  const [lightMode, setLightMode] = useState(false)
  const [subview, setSubview] = useState('home')
  const [orders, setOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersError, setOrdersError] = useState('')

  useEffect(() => {
    try { setLightMode(localStorage.getItem('dd_delivery_profile_light_v1') === '1') } catch { /* optional */ }
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  const toggleAppearance = () => {
    const next = !lightMode
    setLightMode(next)
    try { localStorage.setItem('dd_delivery_profile_light_v1', next ? '1' : '0') } catch { /* optional */ }
  }
  const surface = lightMode ? 'border-slate-200 bg-white' : 'border-white/5 bg-[#25252c]'
  const secondary = lightMode ? 'text-slate-500' : 'text-[#a9a9b4]'
  const heading = lightMode ? 'text-slate-950' : 'text-[#f8f8fa]'
  const outline = lightMode ? 'border-slate-200' : 'border-white/10'
  // Open a distinct full-screen Edit Profile view instead of scrolling down
  // to an inline form. The Delivery store and its cart stay mounted behind it.
  const showEditProfile = () => {
    beginEditing()
  }
  const showAddressBook = () => {
    setAddressMessage('')
    setSubview('addresses')
    void refreshAddresses()
  }
  const backToProfile = () => {
    setSubview('home')
    setAddressMessage('')
  }


  // 'google' is the existing API account type for verified Supabase users,
  // including SMS-verified Mobile + DOB customers. 'mobile' is legacy cookie auth.
  const isLegacyMobile = activeAccountType === 'mobile'
  const hasSupabaseIdentity = !isLegacyMobile && Boolean(customerUser?.id)
  const googleIdentity = !isLegacyMobile && Boolean(
    customerUser?.identities?.some((item) => item?.provider === 'google') ||
    customerUser?.app_metadata?.provider === 'google' ||
    customerUser?.app_metadata?.providers?.includes('google')
  )
  const loginMethod = isLegacyMobile
    ? 'Existing mobile account'
    : googleIdentity
      ? 'Google account'
      : 'Verified mobile account'

  // Keep account identities isolated: an old Google browser session must not
  // override a legacy mobile customer's name, email, or saved addresses.
  const name = String(isLegacyMobile
    ? (mobileCustomer?.name || 'Customer')
    : (apiProfile?.name || customerProfile?.full_name ||
      customerUser?.user_metadata?.full_name || customerUser?.user_metadata?.name ||
      customerUser?.email?.split('@')?.[0] || 'Customer')
  ).trim()
  // Derive the initial only after the customer's display name is initialized.
  const avatarLetter = Array.from(name)[0]?.toLocaleUpperCase() || 'C'

  const mobile = String(isLegacyMobile
    ? (mobileCustomer?.mobile || '')
    : (apiProfile?.mobile || customerProfile?.phone ||
      customerUser?.phone || customerUser?.user_metadata?.phone || '')
  ).replace(/\D/g, '').slice(-10)
  const email = String(isLegacyMobile
    ? (mobileCustomer?.email || '')
    : (customerProfile?.email || customerUser?.email || '')
  ).trim()
  const phoneNumberLocked = Boolean(
    !isLegacyMobile && customerUser?.phone_confirmed_at &&
    /^\+91[6-9]\d{9}$/.test(String(customerUser?.phone || ''))
  )

  const getVerifiedToken = useCallback(async () => {
    if (!hasSupabaseIdentity) return ''
    const { data, error } = await supabase.auth.getSession()
    if (error || !data?.session?.access_token ||
        data?.session?.user?.id !== customerUser?.id) {
      throw new Error('Your account session expired. Sign in again to view private details.')
    }
    return data.session.access_token
  }, [hasSupabaseIdentity, customerUser?.id])

  const refreshOrders = useCallback(async () => {
    setOrdersLoading(true)
    setOrdersError('')
    try {
      const token = await getVerifiedToken()
      const params = new URLSearchParams({
        accountType: isLegacyMobile ? 'mobile' : 'google',
      })
      const response = await fetch(`/api/delivery/customer/overview?${params}`, {
        credentials: 'same-origin', cache: 'no-store',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload.success !== true) {
        throw new Error(payload.message || 'Unable to load your orders.')
      }
      setOrders(Array.isArray(payload.orders) ? payload.orders : [])
    } catch (error) {
      setOrders([])
      setOrdersError(error?.message || 'Unable to load your orders.')
    } finally {
      setOrdersLoading(false)
    }
  }, [getVerifiedToken, isLegacyMobile])

  useEffect(() => {
    if (subview === 'orders') void refreshOrders()
  }, [subview, refreshOrders])

  const refreshAddresses = useCallback(async () => {
    const requestNumber = ++addressRequestRef.current
    setAddressesLoading(true)
    setAddressesError('')
    try {
      const token = await getVerifiedToken()
      if (isLegacyMobile && !STORE_CODE.test(String(restaurantCode || ''))) {
        throw new Error('This account requires a valid delivery store.')
      }
      const params = new URLSearchParams({
        accountType: isLegacyMobile ? 'mobile' : 'google',
        ...(STORE_CODE.test(String(restaurantCode || '')) ? { restaurantCode } : {}),
      })
      const response = await fetch(`/api/delivery/customer/addresses?${params}`, {
        credentials: 'same-origin', cache: 'no-store',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload.success !== true) {
        throw new Error(payload.message || 'Unable to load saved addresses.')
      }
      if (requestNumber !== addressRequestRef.current) return
      setAddresses(Array.isArray(payload.addresses) ? payload.addresses : [])
    } catch (error) {
      if (requestNumber !== addressRequestRef.current) return
      setAddresses([])
      setAddressesError(error?.message || 'Unable to load saved addresses.')
    } finally {
      if (requestNumber === addressRequestRef.current) setAddressesLoading(false)
    }
  }, [getVerifiedToken, isLegacyMobile, restaurantCode])

  // Reuse the address picker's existing authenticated load lifecycle.
  // It invokes onReady after the initial fetch and after address changes.
  const addressPickerReady = useCallback(() => {
    void refreshAddresses()
  }, [refreshAddresses])
  useEffect(() => { void refreshAddresses() }, [refreshAddresses])

  useEffect(() => {
    return () => { addressRequestRef.current += 1 }
  }, [])

  useEffect(() => {
    if (!hasSupabaseIdentity) return undefined
    let active = true
    async function readProfile() {
      try {
        const token = await getVerifiedToken()
        const response = await fetch('/api/delivery/customer/google-profile', {
          credentials: 'same-origin', cache: 'no-store',
          headers: { Authorization: `Bearer ${token}` },
        })
        const data = await response.json().catch(() => ({}))
        // Some older deployments do not have this profile endpoint yet.
        // The sheet still shows verified auth metadata and saved addresses.
        if (active && response.ok && data?.success && data?.profile) {
          setApiProfile(data.profile)
        }
      } catch {
        // Profile lookup is supplementary; protected addresses fail closed.
      }
    }
    void readProfile()
    return () => { active = false }
  }, [hasSupabaseIdentity, getVerifiedToken])

  function beginEditing() {
    setEditName(name)
    setEditMobile(mobile)
    setEditMessage('')
    setProfileSaved(false)
    setEditing(true)
  }

  async function saveProfile(event) {
    event.preventDefault()
    if (!hasSupabaseIdentity || saving) return
    const nextName = editName.trim().replace(/\s+/g, ' ')
    const nextMobile = editMobile.replace(/\D/g, '').slice(-10)
    if (nextName.length < 2 || !MOBILE.test(nextMobile)) {
      setEditMessage('Enter a name and valid 10-digit Indian mobile number.')
      return
    }
    if (phoneNumberLocked && nextMobile !== String(customerUser.phone).replace(/\D/g, '').slice(-10)) {
      setEditMessage('Your SMS-verified login number cannot be changed here.')
      return
    }
    setSaving(true)
    setEditMessage('')
    try {
      const token = await getVerifiedToken()
      const response = await fetch('/api/delivery/customer/google-profile', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: nextName, mobile: nextMobile }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result?.success) {
        throw new Error(result?.message || 'Unable to save account details.')
      }
      setApiProfile((old) => ({ ...old, name: nextName, mobile: nextMobile }))
      onProfileUpdated?.({ name: nextName, mobile: nextMobile })
      setProfileSaved(true)
      setEditing(false)
      setSubview('home')
    } catch (error) {
      setEditMessage(error?.message || 'Unable to update your account.')
    } finally {
      setSaving(false)
    }
  }

  async function selectSavedAddress(point) {
    setAddressMessage('')
    try {
      const validForStore = await onAddressSelected?.(point)
      if (validForStore === false) {
        setAddressMessage('This address could not be applied. Check delivery coverage and try another address.')
      }
    } catch (error) {
      setAddressMessage(error?.message || 'This address could not be applied.')
    }
  }


  // The profile's other destinations are also separate full-screen views.
  // No extra route is pushed, so returning to Profile retains the cart/store.
  if (subview !== 'home' && !editing) {
    const viewTitles = {
      addresses: 'Saved addresses',
      account: 'Account details',
      orders: 'My orders',
      preferences: 'Your preferences',
      help: 'Help, returns & refunds',
    }
    return (
      <main
        className={`fixed inset-0 z-[100] overflow-y-auto overscroll-contain ${lightMode ? 'bg-[#f6f6f8] text-slate-950' : 'bg-[#18181e] text-[#fafafc]'}`}
        role="dialog"
        aria-modal="true"
        aria-label={viewTitles[subview] || 'Customer profile details'}
      >
        <div className="mx-auto min-h-[100dvh] w-full max-w-2xl px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
          <header className="mb-6 flex items-center gap-4">
            <button type="button" onClick={backToProfile} aria-label="Back to profile"
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border ${outline} active:scale-95`}>
              <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m14 6-6 6 6 6M8 12h12" />
              </svg>
            </button>
            <div className="min-w-0 flex-1">
              <p className={`text-[10px] font-extrabold uppercase tracking-[0.15em] ${secondary}`}>Digital Dine-In</p>
              <h1 className={`mt-1 text-xl font-extrabold ${heading}`}>{viewTitles[subview] || 'Profile'}</h1>
            </div>
          </header>

          {subview === 'addresses' && (
            <div className="space-y-4">
              <p className={`text-xs leading-5 ${secondary}`}>Manage addresses linked to your verified customer account. Your saved default is available during checkout.</p>
              {addressesLoading && <p role="status" className={`text-sm ${secondary}`}>Loading saved addresses…</p>}
              {addressesError && <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-400">{addressesError}</p>}
              {!addressesLoading && !addressesError && addresses.length === 0 && (
                <div className={`rounded-2xl border ${outline} ${surface} p-5`}>
                  <p className={`font-bold ${heading}`}>No addresses saved yet</p>
                  <p className={`mt-2 text-sm ${secondary}`}>Add your first address using the button below.</p>
                </div>
              )}
              {addresses.map((address) => (
                <section key={address.id} className={`rounded-[22px] border ${outline} ${surface} p-4`}>
                  <div className="flex items-center gap-2">
                    <span aria-hidden="true">📍</span>
                    <h2 className={`min-w-0 flex-1 truncate text-sm font-extrabold ${heading}`}>{address.label || 'Saved address'}</h2>
                    {address.is_default && <span className="rounded-lg bg-emerald-500/15 px-2 py-1 text-[10px] font-bold text-emerald-500">Default</span>}
                  </div>
                  <p className={`mt-2 text-xs leading-5 ${secondary}`}>{addressText(address)}</p>
                  <p className={`mt-2 text-xs ${secondary}`}>{address.recipient_name || 'Recipient'} · {formatMobile(address.recipient_mobile)}</p>
                  <button type="button" onClick={() => void selectSavedAddress({
                    source: 'saved', savedAddressId: address.id,
                    latitude: Number(address.latitude), longitude: Number(address.longitude),
                    addressLine1: address.address_line1, addressLine2: address.address_line2 || '',
                    landmark: address.landmark || '', city: address.city,
                    state: address.state, pincode: address.pincode,
                    recipientName: address.recipient_name, recipientMobile: address.recipient_mobile,
                  })} className="mt-3 rounded-xl bg-[#d2b06b] px-4 py-2.5 text-xs font-extrabold text-[#1c1b1f]">
                    Deliver to this address
                  </button>
                </section>
              ))}
              <section className={`rounded-[22px] border ${outline} ${surface} p-4`}>
                <h2 className={`text-sm font-extrabold ${heading}`}>Add or manage addresses</h2>
                <p className={`mt-2 mb-3 text-xs ${secondary}`}>Use the existing secure address book to add, edit, delete or set a default address.</p>
                <div className="rounded-2xl bg-white p-1 text-slate-900">
                  <DeliverySavedAddressPicker
                    compact restaurantCode={restaurantCode}
                    accountType={isLegacyMobile ? 'mobile' : 'google'}
                    autoApplyDefault={false}
                    onReady={addressPickerReady}
                    onSelect={() => { void refreshAddresses(); setAddressMessage('Address saved successfully.'); setSubview('home') }}
                  />
                </div>
                {addressMessage && <p role="status" className="mt-3 text-xs text-amber-400">{addressMessage}</p>}
              </section>
            </div>
          )}

          {subview === 'account' && (
            <div className="space-y-4">
              <section className={`rounded-[22px] border ${outline} ${surface} p-5`}>
                <div className="flex items-center gap-4">
                  <div className="grid h-16 w-16 shrink-0 place-items-center rounded-full border-[3px] border-[#c8a65f] bg-[#f8f1dd] text-3xl font-bold text-[#a67a2f]">{avatarLetter}</div>
                  <div className="min-w-0">
                    <h2 className={`truncate text-xl font-extrabold ${heading}`}>{name}</h2>
                    <p className={`mt-1 text-xs ${secondary}`}>{loginMethod}</p>
                  </div>
                </div>
              </section>
              <div className={`rounded-[22px] border ${outline} ${surface} p-4 space-y-3`}>
                <Detail label="Full name" value={name} lightMode={lightMode} />
                <Detail label="Email address" value={email || 'Not added'} lightMode={lightMode} />
                <Detail label="Contact mobile" value={formatMobile(mobile)} lightMode={lightMode} />
                <Detail label="Sign-in method" value={loginMethod} lightMode={lightMode} />
              </div>
              <button type="button" onClick={showEditProfile} disabled={!hasSupabaseIdentity}
                className="h-12 w-full rounded-xl bg-[#d2b06b] text-sm font-extrabold text-[#1c1b1f] disabled:opacity-50">Edit profile</button>
              {!hasSupabaseIdentity && <p className={`text-xs ${secondary}`}>Sign in through Google or verified mobile OTP to edit these details.</p>}
            </div>
          )}

          {subview === 'orders' && (
            <div className="space-y-3">
              <p className={`text-xs leading-5 ${secondary}`}>Your orders are loaded only for your verified customer account.</p>
              <button type="button" onClick={() => void refreshOrders()} disabled={ordersLoading}
                className={`rounded-xl border ${outline} px-3 py-2 text-xs font-bold disabled:opacity-50`}>Refresh orders</button>
              {ordersLoading && <p role="status" className={`text-sm ${secondary}`}>Loading your orders…</p>}
              {ordersError && <p role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-3 text-sm text-rose-400">{ordersError}</p>}
              {!ordersLoading && !ordersError && orders.length === 0 && (
                <div className={`rounded-2xl border ${outline} ${surface} p-5`}>
                  <p className={`font-bold ${heading}`}>You haven't placed any orders yet</p>
                  <p className={`mt-2 text-xs ${secondary}`}>Your placed orders will appear here.</p>
                </div>
              )}
              {orders.map((order) => {
                const code = String(order.order_code || '').trim()
                const store = String(order.restaurant_code || '').trim()
                const canTrack = STORE_CODE.test(code) && STORE_CODE.test(store)
                const amount = Number(order.total_amount || 0)
                return (
                  <section key={order.id || `${store}:${code}`} className={`rounded-[22px] border ${outline} ${surface} p-4`}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className={`break-all text-xs font-extrabold ${heading}`}>{code || `Order #${order.order_number || '—'}`}</p>
                        <p className={`mt-1 text-xs ${secondary}`}>{order.restaurant_name || 'Delivery store'}</p>
                      </div>
                      <span className="rounded-full bg-emerald-500/15 px-3 py-1.5 text-[10px] font-bold capitalize text-emerald-500">{String(order.order_status || 'received').replace(/_/g, ' ')}</span>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-2">
                      <span className={`text-xs ${secondary}`}>{order.created_at ? new Date(order.created_at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : ''}</span>
                      <span className={`text-sm font-extrabold ${heading}`}>₹{amount.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</span>
                    </div>
                    {canTrack && <a href={`/delivery/${encodeURIComponent(store)}/track/${encodeURIComponent(code)}`}
                      className="mt-4 inline-flex rounded-xl bg-[#d2b06b] px-4 py-2.5 text-xs font-extrabold text-[#1c1b1f]">Track order</a>}
                  </section>
                )
              })}
            </div>
          )}

          {subview === 'preferences' && (
            <section className={`overflow-hidden rounded-[22px] border ${outline} ${surface}`}>
              <div className="flex min-h-20 items-center gap-3 px-5 py-4">
                <span className="text-xl" aria-hidden="true">🥬</span>
                <div className="min-w-0 flex-1">
                  <p className={`text-sm font-bold ${heading}`}>Veg Mode</p>
                  <p className={`mt-1 text-xs leading-5 ${secondary}`}>Hide products explicitly marked non-vegetarian or egg in this store.</p>
                </div>
                <button type="button" role="switch" aria-label="Vegetarian mode" aria-checked={Boolean(vegMode)}
                  onClick={() => onVegModeChange?.(!vegMode)} className={`relative h-7 w-12 rounded-full ${vegMode ? 'bg-emerald-500' : lightMode ? 'bg-slate-300' : 'bg-slate-600'}`}>
                  <span className={`absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white ${vegMode ? 'left-[23px]' : 'left-[3px]'}`} />
                </button>
              </div>
              <div className={`mx-4 border-t ${outline}`} />
              <button type="button" onClick={toggleAppearance} className="flex min-h-16 w-full items-center gap-3 px-5 py-4 text-left">
                <span className="text-xl" aria-hidden="true">◐</span>
                <span className={`flex-1 text-sm font-bold ${heading}`}>Appearance</span>
                <span className={`text-xs ${secondary}`}>{lightMode ? 'Light' : 'Dark'} ›</span>
              </button>
            </section>
          )}

          {subview === 'help' && (
            <section className={`rounded-[22px] border ${outline} ${surface} p-5`}>
              <p className={`text-sm leading-6 ${secondary}`}>For order issues, returns, refunds or replacements, open the existing secure after-sales support flow.</p>
              <button type="button" onClick={onReturns}
                className="mt-5 h-12 w-full rounded-xl bg-[#d2b06b] text-sm font-extrabold text-[#1c1b1f]">Open returns & support</button>
              <p className={`mt-3 text-xs ${secondary}`}>Requests are checked against orders associated with your signed-in account.</p>
            </section>
          )}
        </div>
      </main>
    )
  }

  // This is its own full-screen edit screen, not an inline scrolled form.
  // Returning or saving restores the previous Profile screen. Keeping both
  // screens in this mounted component preserves the store/cart and account
  // session, and prevents an unnecessary full application navigation.
  if (editing) {
    return (
      <main
        className={`fixed inset-0 z-[100] overflow-y-auto overscroll-contain ${lightMode ? 'bg-[#f6f6f8] text-slate-950' : 'bg-[#18181e] text-[#fafafc]'}`}
        role="dialog"
        aria-modal="true"
        aria-label="Edit Delivery Profile"
      >
        <div className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
          <header className="mb-6 flex items-center gap-4">
            <button
              type="button"
              onClick={() => { setEditing(false); setEditMessage('') }}
              disabled={saving}
              aria-label="Back to profile"
              title="Back to profile"
              className={`grid h-11 w-11 shrink-0 place-items-center rounded-full border ${outline} transition active:scale-95 disabled:opacity-50`}
            >
              <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="m14 6-6 6 6 6M8 12h12" />
              </svg>
            </button>
            <div className="min-w-0 flex-1">
              <p className={`text-[10px] font-extrabold uppercase tracking-[0.15em] ${secondary}`}>Digital Dine-In</p>
              <h1 className={`mt-1 text-xl font-extrabold ${heading}`}>Edit profile</h1>
            </div>
          </header>

          <section className={`overflow-hidden rounded-[26px] border ${outline} ${surface}`}>
            <div className="flex items-center gap-4 p-5">
              <div className="grid h-[72px] w-[72px] shrink-0 place-items-center rounded-full border-[3px] border-[#c8a65f] bg-[#f8f1dd] text-[34px] font-semibold text-[#a67a2f]">
                {Array.from(editName.trim())[0]?.toLocaleUpperCase() || avatarLetter}
              </div>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-lg font-extrabold ${heading}`}>{editName || name}</p>
                <p className={`mt-1 truncate text-xs ${secondary}`}>{email || loginMethod}</p>
              </div>
            </div>
          </section>

          <form onSubmit={saveProfile} className={`mt-5 rounded-[23px] border ${outline} ${surface} p-5`}>
            <h2 className={`text-base font-extrabold ${heading}`}>Personal information</h2>
            <p className={`mt-1 text-xs leading-5 ${secondary}`}>Update the name and mobile contact displayed on your Delivery account.</p>

            <label htmlFor="dd-edit-profile-name" className={`mt-5 block text-xs font-bold ${secondary}`}>
              Full name
            </label>
            <input
              id="dd-edit-profile-name"
              type="text"
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              autoComplete="name"
              maxLength={100}
              required
              disabled={saving}
              className="mt-2 h-12 w-full rounded-xl border border-slate-300 bg-white px-4 text-base font-medium text-slate-950 outline-none focus:border-[#c8a65f] focus:ring-2 focus:ring-[#c8a65f]/20 disabled:opacity-60"
              placeholder="Enter your full name"
            />

            <label htmlFor="dd-edit-profile-mobile" className={`mt-5 block text-xs font-bold ${secondary}`}>
              Contact mobile number
            </label>
            <div className="mt-2 flex overflow-hidden rounded-xl border border-slate-300 bg-white focus-within:border-[#c8a65f] focus-within:ring-2 focus-within:ring-[#c8a65f]/20">
              <span className="flex items-center border-r border-slate-200 px-3 text-sm font-bold text-slate-600">+91</span>
              <input
                id="dd-edit-profile-mobile"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                value={editMobile}
                onChange={(event) => setEditMobile(event.target.value.replace(/\D/g, '').slice(0, 10))}
                maxLength={10}
                required
                disabled={saving || phoneNumberLocked}
                className="h-12 min-w-0 flex-1 bg-white px-3 text-base font-medium text-slate-950 outline-none disabled:bg-slate-100"
                placeholder="10-digit mobile number"
              />
            </div>
            {phoneNumberLocked && (
              <p className={`mt-2 text-xs leading-5 ${secondary}`}>
                Your SMS-verified login number is locked. Contact support if you need to change it.
              </p>
            )}

            <div className={`mt-5 rounded-xl border ${outline} p-3`}>
              <p className={`text-[11px] font-bold uppercase tracking-wide ${secondary}`}>Verified sign-in</p>
              <p className={`mt-1 break-all text-sm font-semibold ${heading}`}>{email || loginMethod}</p>
              <p className={`mt-1 text-xs ${secondary}`}>Your sign-in identity cannot be changed from this page.</p>
            </div>

            {editMessage && <p role="alert" className="mt-4 rounded-xl border border-rose-500/25 bg-rose-500/10 p-3 text-xs font-semibold text-rose-400">{editMessage}</p>}

            <button
              type="submit"
              disabled={saving || !hasSupabaseIdentity}
              className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-[#d2b06b] px-4 text-sm font-extrabold text-[#1c1b1f] transition active:scale-[0.99] disabled:opacity-50"
            >
              {saving ? 'Saving changes…' : 'Save changes'}
            </button>
          </form>
          <p className={`mt-4 text-center text-xs leading-5 ${secondary}`}>
            Once saved, you will return to your profile with the updated information.
          </p>
        </div>
      </main>
    )
  }

  return (
    <div
      className={`fixed inset-0 z-[95] overflow-y-auto overscroll-contain ${lightMode ? 'bg-[#f6f6f8] text-slate-950' : 'bg-[#18181e] text-[#fafafc]'}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="mx-auto w-full max-w-2xl px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
        <div className="mb-4 flex items-center justify-between">
          <button type="button" onClick={onClose} aria-label="Back to delivery store"
            className={`grid h-11 w-11 place-items-center rounded-full border ${outline} transition active:scale-95`}>
            <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m14 6-6 6 6 6M8 12h12" />
            </svg>
          </button>
          <span className={`text-[11px] font-extrabold uppercase tracking-[0.17em] ${secondary}`}>Digital Dine-In · Profile</span>
        </div>

        {(profileSaved || addressMessage) && (
          <div role="status" className="mb-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-4 py-3 text-xs font-bold text-emerald-500">
            {profileSaved ? 'Profile updated successfully.' : addressMessage}
          </div>
        )}

        {/* Account header. Always use the first name initial, never the Google avatar. */}
        <section className={`relative overflow-hidden rounded-[26px] border ${outline} ${surface}`}>
          <div className="absolute -right-12 -top-10 h-44 w-44 rotate-45 border-[16px] border-amber-400/[0.07]" aria-hidden="true" />
          <div className="absolute right-8 top-6 h-16 w-16 rotate-45 border-2 border-amber-300/10" aria-hidden="true" />
          <div className="relative flex items-center gap-4 px-5 py-6">
            <div className="grid h-[84px] w-[84px] shrink-0 place-items-center rounded-full border-[3px] border-[#c8a65f] bg-[#f8f1dd] text-[42px] font-medium text-[#a67a2f] shadow-[0_6px_25px_rgba(0,0,0,0.22)]"
              aria-label={`Avatar for ${name}: ${avatarLetter}`}>
              {avatarLetter}
            </div>
            <div className="min-w-0 flex-1">
              <p className={`text-[10px] font-extrabold uppercase tracking-[0.12em] ${secondary}`}>Your account</p>
              <h1 id={titleId} className={`mt-1 truncate text-[28px] font-extrabold leading-tight tracking-tight ${heading}`}>{name}</h1>
              <button type="button" onClick={showEditProfile} disabled={!hasSupabaseIdentity}
                className={`mt-2 inline-flex items-center gap-2 text-sm font-semibold ${hasSupabaseIdentity ? 'text-[#dbbb75]' : secondary} disabled:opacity-60`}>
                {hasSupabaseIdentity ? 'Edit profile' : 'Account details'} <span aria-hidden="true">›</span>
              </button>
            </div>
          </div>
          <div className={`flex items-center justify-between border-t ${outline} px-5 py-3.5`}>
            <span className={`flex items-center gap-2 text-xs font-bold ${secondary}`}>
              <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-400/10 text-emerald-500">✓</span>
              {loginMethod}
            </span>
            <span className={`max-w-[52%] truncate text-right text-[11px] ${secondary}`}>{email || formatMobile(mobile)}</span>
          </div>
        </section>

        {/* No invented membership, coupons or customer wallet balances. */}
        <div className="mt-4 grid grid-cols-2 gap-3">
          <button type="button" onClick={() => { if (typeof onOrders === 'function') onOrders(); else setSubview('orders') }} className={`rounded-2xl border ${outline} ${surface} p-4 text-left transition active:scale-[0.99]`}>
            <span className="text-xl" aria-hidden="true">📦</span>
            <span className={`mt-2 block text-sm font-bold ${heading}`}>My Orders</span>
            <span className={`mt-0.5 block text-[11px] ${secondary}`}>Track deliveries ›</span>
          </button>
          <button type="button" onClick={showAddressBook} className={`rounded-2xl border ${outline} ${surface} p-4 text-left transition active:scale-[0.99]`}>
            <span className="text-xl" aria-hidden="true">📍</span>
            <span className={`mt-2 block text-sm font-bold ${heading}`}>Saved Addresses</span>
            <span className={`mt-0.5 block text-[11px] ${secondary}`}>{addressesLoading ? 'Loading…' : `${addresses.length} saved`} ›</span>
          </button>
        </div>

        <section className={`mt-5 overflow-hidden rounded-[23px] border ${outline} ${surface}`} aria-label="Your preferences">
          <button type="button" onClick={() => setSubview('preferences')}
            className="flex w-full items-center gap-3 px-5 py-5 text-left">
            <span className="text-xl" aria-hidden="true">⚙️</span>
            <span className={`flex-1 text-base font-extrabold ${heading}`}>Your preferences</span>
            <span className={`text-xs ${secondary}`}>Veg Mode · Appearance</span>
            <span className={secondary} aria-hidden="true">›</span>
          </button>
        </section>

        <section className={`mt-5 overflow-hidden rounded-[23px] border ${outline} ${surface}`} aria-labelledby="dd-food-title">
          <h2 id="dd-food-title" className={`border-l-[3px] border-[#ff517a] px-5 py-5 text-lg font-extrabold ${heading}`}>Food delivery</h2>
          <div className={`mx-4 border-t ${outline}`} />
          <button type="button" onClick={() => { if (typeof onOrders === 'function') onOrders(); else setSubview('orders') }} className="flex w-full items-center gap-3 px-5 py-4 text-left">
            <span className="text-lg" aria-hidden="true">🛍️</span>
            <span className={`flex-1 text-sm font-semibold ${heading}`}>Your orders</span>
            <span aria-hidden="true" className={secondary}>›</span>
          </button>
          <div className={`mx-4 border-t ${outline}`} />
          <button type="button" onClick={showAddressBook} className="flex w-full items-center gap-3 px-5 py-4 text-left">
            <span className="text-lg" aria-hidden="true">🏠</span>
            <span className={`flex-1 text-sm font-semibold ${heading}`}>Address book</span>
            <span className={`text-xs ${secondary}`}>{addressesLoading ? '…' : addresses.length}</span>
            <span aria-hidden="true" className={secondary}>›</span>
          </button>
          <div className={`mx-4 border-t ${outline}`} />
          <button type="button" onClick={() => setSubview('help')} className="flex w-full items-center gap-3 px-5 py-4 text-left">
            <span className="text-lg" aria-hidden="true">💬</span>
            <span className={`flex-1 text-sm font-semibold ${heading}`}>Help, returns & refunds</span>
            <span aria-hidden="true" className={secondary}>›</span>
          </button>
        </section>

        <section className={`mt-5 overflow-hidden rounded-[23px] border ${outline} ${surface}`} aria-label="Saved delivery addresses">
          <button type="button" onClick={showAddressBook} className="flex w-full items-center gap-3 px-5 py-5 text-left">
            <span className="text-lg" aria-hidden="true">📍</span>
            <span className="min-w-0 flex-1">
              <span className={`block text-base font-extrabold ${heading}`}>Saved addresses</span>
              <span className={`mt-1 block text-xs ${secondary}`}>{addressesLoading ? 'Loading…' : `${addresses.length} saved address${addresses.length === 1 ? '' : 'es'}`}</span>
            </span>
            <span className={`text-xs font-bold ${secondary}`}>Manage ›</span>
          </button>
        </section>

        <section className={`mt-4 overflow-hidden rounded-[23px] border ${outline} ${surface}`} aria-label="Account details">
          <button type="button" onClick={() => setSubview('account')} className="flex w-full items-center gap-3 px-5 py-5 text-left">
            <span className="text-lg" aria-hidden="true">👤</span>
            <span className="min-w-0 flex-1">
              <span className={`block text-base font-extrabold ${heading}`}>Account details</span>
              <span className={`mt-1 block truncate text-xs ${secondary}`}>{name} · {email || formatMobile(mobile)}</span>
            </span>
            <span className={`text-xs font-bold ${secondary}`}>View ›</span>
          </button>
        </section>

        <button type="button" onClick={onSignOut} disabled={signingOut}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-2xl border border-rose-500/25 bg-rose-500/[0.07] py-4 text-sm font-extrabold text-rose-400 disabled:opacity-50">
          <span aria-hidden="true">↪</span>{signingOut ? 'Signing out…' : 'Sign out'}
        </button>
        <p className={`mt-4 text-center text-[10px] ${secondary}`}>Digital Dine-In · Customer accounts and addresses stay private to your sign-in</p>
      </div>
    </div>
  )
}
