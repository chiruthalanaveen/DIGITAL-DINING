'use client'
// EXACT VS CODE DESTINATION: app/components/DeliveryAccountCenter.jsx
// Main Digital Dine-In app uses the same profile component as individual stores
// and the same white My Orders card styling as the store's order sheet.
// The global orders endpoint still returns only records linked to the verified user,
// across all Delivery stores. No phone-number-only order lookups are performed.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import DeliveryAccountProfileSheet from '@/app/components/DeliveryAccountProfileSheet'

const CODE = /^[A-Za-z0-9_-]{1,80}$/
const money = amount => `₹${Number(amount || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const statusLabel = value => String(value || 'received').replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase())
const mobileDigits = value => String(value || '').replace(/\D/g, '').slice(-10)
const initial = value => Array.from(String(value || 'Customer').trim())[0]?.toLocaleUpperCase() || 'C'

function ArrowLeft() {
  return <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m14 6-6 6 6 6M8 12h12" /></svg>
}
function XIcon() {
  return <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg>
}
function ReloadIcon() {
  return <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M5 9a8 8 0 0 1 14-2l1 5M19 15a8 8 0 0 1-14 2l-1-5"/></svg>
}
function badgeColor(status) {
  const value = String(status || '').toLowerCase()
  if (value === 'cancelled' || value === 'rejected') return 'bg-rose-100 text-rose-700'
  if (value === 'delivered') return 'bg-emerald-100 text-emerald-800'
  if (value === 'out_for_delivery') return 'bg-sky-100 text-sky-800'
  if (value === 'packed') return 'bg-indigo-100 text-indigo-800'
  return 'bg-emerald-100 text-emerald-700'
}
function safeNextHome() {
  return '/delivery'
}

export default function DeliveryAccountCenter({ view = 'orders', onGoHome }) {
  const router = useRouter()
  const profilePage = view === 'account'
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [identityLoading, setIdentityLoading] = useState(true)
  const [identityError, setIdentityError] = useState('')
  const [orders, setOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(false)
  const [ordersError, setOrdersError] = useState('')
  const [returnsByStore, setReturnsByStore] = useState({})
  const [signingOut, setSigningOut] = useState(false)
  const [vegMode, setVegMode] = useState(false)
  const mountedRef = useRef(true)
  const orderRequestRef = useRef(0)

  const goHome = useCallback(() => {
    if (typeof onGoHome === 'function') onGoHome()
    else router.push(safeNextHome())
  }, [onGoHome, router])

  useEffect(() => {
    mountedRef.current = true
    try { setVegMode(window.localStorage.getItem('dd_delivery_veg_mode_v1') === '1') } catch { /* storage optional */ }
    return () => { mountedRef.current = false; orderRequestRef.current += 1 }
  }, [])

  // A Supabase-issued identity (Google, verified SMS, or the explicitly configured
  // device-bound account) is the account identity. Never read private customer
  // details using a phone number typed in a form or query parameter.
  const refreshIdentity = useCallback(async () => {
    setIdentityLoading(true)
    setIdentityError('')
    try {
      const { data, error } = await supabase.auth.getUser()
      if (error || !data?.user?.id) throw new Error('Your Delivery session has expired. Please sign in again.')
      if (!mountedRef.current) return
      setUser(data.user)
      // The existing verified customer profile endpoint is preferred over a
      // direct table read because direct reads may be blocked by RLS/GRANTs.
      const { data: sessionData } = await supabase.auth.getSession()
      const session = sessionData?.session
      if (session?.access_token && session?.user?.id === data.user.id) {
        try {
          const response = await fetch('/api/delivery/customer/google-profile', {
            credentials: 'same-origin', cache: 'no-store',
            headers: { Authorization: `Bearer ${session.access_token}` },
          })
          const result = await response.json().catch(() => ({}))
          if (mountedRef.current && response.ok && result.success && result.profile) {
            setProfile(result.profile)
          }
        } catch { /* Profile API is supplementary; the verified user is enough to show the screen. */ }
      }
    } catch (err) {
      if (mountedRef.current) {
        setUser(null)
        setProfile(null)
        setIdentityError(err?.message || 'Unable to verify your Delivery account.')
      }
    } finally { if (mountedRef.current) setIdentityLoading(false) }
  }, [])

  useEffect(() => {
    void refreshIdentity()
    const { data: { subscription } } = supabase.auth.onAuthStateChange(event => {
      if (event === 'SIGNED_OUT') {
        if (mountedRef.current) { setUser(null); setProfile(null); setIdentityError('Sign in to view your account.') }
      } else if (event === 'SIGNED_IN' || event === 'USER_UPDATED') {
        // Avoid calls that require the auth lock inside an auth callback.
        Promise.resolve().then(() => { if (mountedRef.current) void refreshIdentity() })
      }
    })
    return () => subscription?.unsubscribe()
  }, [refreshIdentity])

  const refreshOrders = useCallback(async () => {
    const revision = ++orderRequestRef.current
    setOrdersLoading(true)
    setOrdersError('')
    setReturnsByStore({})
    try {
      const { data, error } = await supabase.auth.getSession()
      const session = data?.session
      if (error || !session?.access_token || !session?.user?.id) {
        throw new Error('Sign in to see orders from all your Delivery stores.')
      }
      const response = await fetch('/api/delivery/customer/overview?accountType=google', {
        credentials: 'same-origin', cache: 'no-store',
        headers: { Authorization: `Bearer ${session.access_token}` },
      })
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || payload?.success !== true || payload.accountType !== 'google') {
        throw new Error(payload?.message || 'Unable to load your orders.')
      }
      if (!mountedRef.current || revision !== orderRequestRef.current) return
      const next = Array.isArray(payload.orders) ? payload.orders : []
      setOrders(next)
      // Preserve the store-level Return/Replace/Refund eligibility check.
      const codes = [...new Set(next
        .filter(row => String(row.order_status).toLowerCase() === 'delivered')
        .map(row => String(row.restaurant_code || ''))
        .filter(code => CODE.test(code)))].slice(0, 40)
      const flags = await Promise.all(codes.map(async code => {
        try {
          const { data: value, error: rpcError } = await supabase.rpc('get_public_delivery_customer_returns', { p_restaurant_code: code })
          return [code, !rpcError && value?.success === true && value?.returnsEnabled === true]
        } catch { return [code, false] }
      }))
      if (mountedRef.current && revision === orderRequestRef.current) setReturnsByStore(Object.fromEntries(flags))
    } catch (err) {
      if (mountedRef.current && revision === orderRequestRef.current) {
        setOrders([])
        setOrdersError(err?.message || 'Unable to load linked orders.')
      }
    } finally { if (mountedRef.current && revision === orderRequestRef.current) setOrdersLoading(false) }
  }, [])

  useEffect(() => {
    if (profilePage) return undefined
    void refreshOrders()
    return () => { orderRequestRef.current += 1 }
  }, [profilePage, refreshOrders])

  const signOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    try {
      // Legacy store cookie is ended too, so a different old identity is not
      // silently shown after signing out the Supabase account.
      const response = await fetch('/api/delivery/customer/session', {
        method: 'DELETE', credentials: 'same-origin', cache: 'no-store',
      })
      if (!response.ok && response.status !== 401 && response.status !== 404) {
        throw new Error('Unable to end the previous mobile session.')
      }
      const { error } = await supabase.auth.signOut()
      if (error) throw error
      router.replace('/delivery/login?next=%2Fdelivery')
    } catch (err) {
      if (mountedRef.current) setIdentityError(err?.message || 'Unable to sign out.')
    } finally { if (mountedRef.current) setSigningOut(false) }
  }

  const selectSavedAddress = async point => {
    const latitude = Number(point?.latitude), longitude = Number(point?.longitude)
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      throw new Error('Select a saved address with a valid GPS pin.')
    }
    // This only selects a discovery location. The storefront/server independently
    // verifies distance, polygon and account ownership before checkout.
    try {
      sessionStorage.setItem('digitaldine_delivery_selected_location_v1', JSON.stringify({
        source: 'saved', latitude, longitude, selectedAt: Date.now(),
        savedAddressId: point.savedAddressId,
        addressLine1: point.addressLine1,
        addressLine2: point.addressLine2,
        landmark: point.landmark,
        city: point.city,
        state: point.state,
        pincode: point.pincode,
        recipientName: point.recipientName,
        recipientMobile: point.recipientMobile,
      }))
    } catch { /* session storage can be unavailable */ }
    router.push('/delivery')
    return true
  }

  const changeVegMode = enabled => {
    setVegMode(Boolean(enabled))
    try { localStorage.setItem('dd_delivery_veg_mode_v1', enabled ? '1' : '0') } catch { /* optional */ }
  }

  if (identityLoading) {
    return <main className="flex min-h-[100dvh] items-center justify-center bg-[#18181e] px-6 text-white" role="status">Loading your Delivery account…</main>
  }
  if (!user?.id) {
    return <main className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#18181e] px-6 text-center text-white">
      <h1 className="text-xl font-black">Sign in to Digital Dine-In</h1>
      <p className="mt-2 text-sm text-slate-400">{identityError || 'Your account session has expired.'}</p>
      <button type="button" onClick={() => router.push(`/delivery/login?next=${encodeURIComponent(`/delivery?view=${profilePage ? 'account' : 'orders'}`)}`)} className="mt-5 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold">Sign in</button>
    </main>
  }

  if (profilePage) {
    // This is literally the SAME full-screen dark profile component used by
    // the store, including first-letter avatar and separate edit/address views.
    return <DeliveryAccountProfileSheet
      restaurantCode=""
      activeAccountType="google"
      customerUser={user}
      customerProfile={profile ? {
        full_name: profile.name || profile.full_name,
        email: profile.email || user.email || '',
        phone: profile.mobile || profile.phone || '',
        avatar_url: profile.avatar_url || '',
      } : null}
      mobileCustomer={null}
      onClose={goHome}
      onOrders={() => router.push('/delivery?view=orders')}
      onReturns={() => router.push('/delivery?view=orders')}
      onSignOut={signOut}
      signingOut={signingOut}
      onAddressSelected={selectSavedAddress}
      onProfileUpdated={({ name, mobile }) => {
        setProfile(previous => ({ ...(previous || {}), name, mobile }))
      }}
      vegMode={vegMode}
      onVegModeChange={changeVegMode}
    />
  }

  // Store-style My Orders white panel, but every linked store is included.
  return <main className="min-h-[100dvh] bg-[#e8edf0] text-slate-950">
    <div className="mx-auto flex min-h-[100dvh] w-full max-w-2xl flex-col bg-white shadow-2xl">
      <header className="sticky top-0 z-10 flex items-start gap-3 border-b border-slate-100 bg-white px-4 pb-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
        <button type="button" onClick={goHome} className="mt-1 grid h-10 w-10 shrink-0 place-items-center rounded-full border border-slate-200 bg-slate-50 text-slate-800" aria-label="Back to Digital Dine-In home"><ArrowLeft/></button>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-bold uppercase tracking-wide text-emerald-600">Delivery tracking</p>
          <h1 className="mt-1 text-xl font-black text-slate-950">My orders</h1>
          <p className="mt-1 text-xs leading-5 text-slate-500">Your orders across Digital Dine-In delivery stores.</p>
          {user.email && <p className="mt-2 break-all text-[11px] font-semibold text-emerald-700">Signed in as {user.email}</p>}
        </div>
        <button type="button" onClick={goHome} aria-label="Close My Orders" className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-700"><XIcon/></button>
      </header>

      <div className="flex-1 space-y-4 px-4 pb-[max(6rem,env(safe-area-inset-bottom))] pt-5 sm:px-6">
        {ordersLoading && <p className="rounded-xl bg-slate-50 px-4 py-5 text-center text-xs font-semibold text-slate-600" role="status">Loading your orders…</p>}
        {!ordersLoading && ordersError && <div role="alert" className="rounded-xl bg-rose-50 px-4 py-4 text-xs font-semibold text-rose-700">
          {ordersError}
          <button type="button" className="mt-3 block rounded-lg bg-white px-4 py-2 text-rose-800 ring-1 ring-rose-200" onClick={() => void refreshOrders()}>Retry</button>
        </div>}
        {!ordersLoading && !ordersError && orders.length === 0 && <div className="rounded-2xl bg-slate-50 p-6 text-center ring-1 ring-slate-200">
          <p className="text-sm font-bold">No linked orders found</p>
          <p className="mt-2 text-xs leading-5 text-slate-500">Orders from all Delivery stores appear here only when linked to this verified account. Orders linked to a different login cannot be shown.</p>
        </div>}
        {orders.length > 0 && <div className="space-y-3">
          <div className="flex items-center justify-between gap-2"><h2 className="text-xs font-bold text-slate-600">Recent orders</h2><span className="text-xs text-slate-400">{orders.length} shown</span></div>
          {orders.map(order => {
            const store = String(order.restaurant_code || '').trim()
            const code = String(order.order_code || '').trim()
            const trackable = CODE.test(store) && code.length > 0
            const delivered = String(order.order_status || '').toLowerCase() === 'delivered'
            const paid = String(order.payment_method || '').toLowerCase() !== 'razorpay' || String(order.payment_status || '').toLowerCase() === 'paid'
            const canReturn = trackable && delivered && paid && returnsByStore[store] === true
            return <article key={order.id || `${store}-${code}`} className="rounded-2xl bg-slate-50 p-4 ring-1 ring-slate-200">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="break-all font-mono text-xs font-black text-slate-950">{code || 'Delivery order'}</p>
                  <p className="mt-1 text-[11px] text-slate-500">{order.created_at ? new Date(order.created_at).toLocaleString('en-IN', {day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'}) : ''}</p>
                  <p className="mt-1 truncate text-[11px] font-semibold text-slate-600">{order.restaurant_name || 'Delivery store'}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold uppercase ${badgeColor(order.order_status)}`}>{statusLabel(order.order_status)}</span>
              </div>
              <div className="mt-3 flex items-center justify-between gap-3 text-xs">
                <span className="text-slate-500">{order.driver_assigned ? 'Driver assigned' : delivered ? 'Delivered' : 'Preparing dispatch'}</span>
                <span className="font-black text-slate-950">{money(order.total_amount)}</span>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                {trackable && <button type="button" onClick={() => router.push(`/delivery/${encodeURIComponent(store)}/track/${encodeURIComponent(code)}`)} className="h-9 rounded-lg bg-white px-3 text-xs font-bold text-emerald-700 ring-1 ring-emerald-200">Track order</button>}
                {canReturn && <button type="button" onClick={() => router.push(`/delivery?store=${encodeURIComponent(store)}&returnOrder=${encodeURIComponent(code)}`)} className="h-9 rounded-lg bg-violet-50 px-3 text-xs font-bold text-violet-700 ring-1 ring-violet-200">Return / replace / refund</button>}
              </div>
            </article>
          })}
        </div>}
        <button type="button" disabled={ordersLoading} onClick={() => void refreshOrders()} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-900 disabled:opacity-50"><ReloadIcon/>Refresh orders</button>
        <button type="button" onClick={() => router.push('/delivery?view=account')} className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-50 text-xs font-bold text-emerald-700 ring-1 ring-emerald-100"><span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#f8eed6] font-black text-[#a8803f]">{initial(profile?.name || user.user_metadata?.full_name || user.email)}</span>Go to my profile</button>
      </div>
    </div>
  </main>
}