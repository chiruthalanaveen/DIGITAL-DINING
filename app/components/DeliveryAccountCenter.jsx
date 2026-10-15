'use client'
// VS Code destination: app/components/DeliveryAccountCenter.jsx
// Dedicated Orders and Account screens inside /delivery, never inside a store.
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import DeliverySavedAddressPicker from '@/app/components/DeliverySavedAddressPicker'

const currency = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value || 0))
const maskMobile = value => { const s = String(value || '').replace(/\D/g, ''); return s.length >= 4 ? `+91 ••••••${s.slice(-4)}` : 'Not provided' }
const niceStatus = value => String(value || 'pending').replaceAll('_', ' ').replace(/\b\w/g, c => c.toUpperCase())

function Icon({ name, size = 21 }) {
  const paths = {
    home: <><path d="m3 10 9-7 9 7v10H3z"/><path d="M9 20v-7h6v7"/></>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    bag: <><rect x="4" y="7" width="16" height="14" rx="2"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l4 2"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 21c0-5 16-5 16 0"/></>,
    arrow: <><path d="M19 12H5m6 6-6-6 6-6"/></>,
    refresh: <><path d="M3 12a9 9 0 0 1 15-6l2 2"/><path d="M20 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6l-2-2"/><path d="M4 21v-5h5"/></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.user}</svg>
}

export default function DeliveryAccountCenter({ view = 'orders', onGoHome }) {
  const router = useRouter()
  const requestId = useRef(0)
  const [selection, setSelection] = useState('auto')
  const [payload, setPayload] = useState(null)
  const [googleAvailable, setGoogleAvailable] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [signingOut, setSigningOut] = useState(false)
  const [expanded, setExpanded] = useState(null)
  const [detailBusy, setDetailBusy] = useState(false)
  const [details, setDetails] = useState({})
  const [returnAllowed, setReturnAllowed] = useState({})

  const load = useCallback(async () => {
    const id = ++requestId.current
    setLoading(true)
    setError('')
    setPayload(null) // Do not display another account's orders during account changes.
    setDetails({})
    setDetailBusy(false)
    setExpanded(null)
    setReturnAllowed({})
    try {
      const { data: auth } = await supabase.auth.getSession()
      const token = auth?.session?.access_token || ''
      if (id !== requestId.current) return
      setGoogleAvailable(Boolean(token))
      const url = `/api/delivery/customer/overview?accountType=${encodeURIComponent(selection)}`
      const response = await fetch(url, {
        cache: 'no-store', credentials: 'same-origin',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      })
      const result = await response.json().catch(() => ({}))
      if (id !== requestId.current) return
      if (!response.ok || result?.success !== true) {
        throw new Error(result?.message || 'Unable to load your Delivery account.')
      }
      setPayload(result)
      if (view === 'orders' && Array.isArray(result.orders)) {
        const codes = [...new Set(result.orders.filter(o => String(o.order_status || '').toLowerCase() === 'delivered')
          .map(o => o.restaurant_code).filter(Boolean))].slice(0, 50)
        const checks = await Promise.all(codes.map(async code => {
          try {
            const { data, error: rpcError } = await supabase.rpc('get_public_delivery_customer_returns', { p_restaurant_code: code })
            return [code, !rpcError && data?.success === true && data?.returnsEnabled === true]
          } catch { return [code, false] }
        }))
        if (id === requestId.current) setReturnAllowed(Object.fromEntries(checks))
      }
    } catch (caught) {
      if (id === requestId.current) setError(caught?.message || 'Unable to load account details.')
    } finally {
      if (id === requestId.current) setLoading(false)
    }
  }, [selection, view])

  useEffect(() => { void load(); return () => { requestId.current += 1 } }, [load])
  useEffect(() => {
    let active = true
    const { data: { subscription } } = supabase.auth.onAuthStateChange(() => {
      // Do not call getSession synchronously inside the Supabase auth callback.
      Promise.resolve().then(() => { if (active) void load() })
    })
    return () => { active = false; subscription?.unsubscribe() }
  }, [load])

  const go = next => router.push(next, { scroll: false })
  const account = payload?.account || {}
  const type = payload?.accountType || ''
  const orders = Array.isArray(payload?.orders) ? payload.orders : []

  const openDetail = async order => {
    const key = `${order.restaurant_code}:${order.order_code}`
    if (expanded === key) { setExpanded(null); return }
    setExpanded(key)
    if (details[key]) return
    setDetailBusy(true)
    const overviewRevision = requestId.current
    try {
      if (!order.restaurant_code || !order.order_code) throw new Error('Order details are unavailable for this store.')
      const { data: auth } = await supabase.auth.getSession()
      const token = auth?.session?.access_token || ''
      if (type === 'google' && !token) throw new Error('Google session has expired. Sign in again.')
      const params = new URLSearchParams({ restaurantCode: order.restaurant_code, accountType: type, orderCode: order.order_code, details: '1' })
      const response = await fetch(`/api/delivery/customer/my-orders?${params.toString()}`, {
        cache: 'no-store', credentials: 'same-origin',
        headers: type === 'google' ? { Authorization: `Bearer ${token}` } : {},
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || result?.success !== true || result.accountType !== type) throw new Error(result.message || 'Unable to load order details.')
      if (overviewRevision !== requestId.current) return
      setDetails(current => ({ ...current, [key]: result.orders?.[0] || { unavailable: true } }))
    } catch (caught) {
      if (overviewRevision === requestId.current) setDetails(current => ({ ...current, [key]: { error: caught?.message || 'Unable to load order details.' } }))
    } finally { if (overviewRevision === requestId.current) setDetailBusy(false) }
  }

  const signOut = async () => {
    if (signingOut) return
    setSigningOut(true)
    try {
      // End both sessions, so an old Google account never reappears immediately
      // after signing out a Mobile/PIN account in the same browser.
      const mobile = await fetch('/api/delivery/customer/session', { method: 'DELETE', credentials: 'same-origin', cache: 'no-store' })
      if (!mobile.ok && mobile.status !== 401) throw new Error('Unable to end Mobile/PIN session.')
      const { error: authError } = await supabase.auth.signOut()
      if (authError) throw authError
      requestId.current += 1
      setPayload(null)
      setError('')
      go('/delivery?choose=1')
    } catch (caught) { setError(caught?.message || 'Unable to sign out.') }
    finally { setSigningOut(false) }
  }

  return (
    <div className="dm-market dm-account-shell">
      <header className="dm-account-header">
        <div className="dm-account-header-row">
          <button type="button" aria-label="Back to delivery home" className="dm-account-back" onClick={onGoHome}><Icon name="arrow"/></button>
          <h1>{view === 'orders' ? 'My Orders' : 'My Account'}</h1>
          <button type="button" onClick={() => void load()} disabled={loading} aria-label="Refresh account" className="dm-account-back"><Icon name="refresh"/></button>
        </div>
        <p>{view === 'orders' ? 'Track every order from your verified account.' : 'Your Delivery profile and saved addresses.'}</p>
      </header>
      <main className="dm-account-main">
        {loading && <div className="dm-account-state" role="status">Loading your account…</div>}
        {!loading && error && <div className="dm-account-state dm-account-error" role="alert">{error}
          <div className="dm-account-actions">
            <button type="button" onClick={() => void load()}>Retry</button>
            {googleAvailable && selection !== 'google' && <button type="button" onClick={() => setSelection('google')}>Use my Google account</button>}
            <button type="button" onClick={() => go(`/delivery/login?next=${encodeURIComponent(`/delivery?view=${view}`)}`)}>Sign in</button>
          </div>
        </div>}
        {!loading && payload && <>
          <div className="dm-account-identity">
            <div className="dm-account-avatar">{String(account.name || 'C').charAt(0).toUpperCase()}</div>
            <div className="dm-account-name"><strong>{account.name || 'Customer'}</strong><span>{type === 'mobile' ? 'Mobile + PIN' : 'Google account'} · {type === 'mobile' ? maskMobile(account.mobile) : account.email || ''}</span></div>
          </div>
          {googleAvailable && type === 'mobile' && <button type="button" className="dm-account-switch" onClick={() => setSelection('google')}>View my other Google account instead</button>}
          {type === 'google' && selection === 'google' && <button type="button" className="dm-account-switch" onClick={() => setSelection('auto')}>Check my Mobile/PIN account instead</button>}
          {view === 'orders' ? <>
            <div className="dm-account-section-title"><h2>Recent Orders</h2><span>{orders.length} shown</span></div>
            {!orders.length && <div className="dm-account-state"><strong>No linked orders yet</strong><p>Only orders placed using this verified account appear here. Older orders are not linked by phone number alone.</p></div>}
            {orders.map(order => {
              const key = `${order.restaurant_code}:${order.order_code}`
              const expandedNow = expanded === key
              const detail = details[key]
              const allowedReturn = returnAllowed[order.restaurant_code] && String(order.order_status || '').toLowerCase() === 'delivered' &&
                (String(order.payment_method || '').toLowerCase() !== 'razorpay' || String(order.payment_status || '').toLowerCase() === 'paid')
              return <article className="dm-account-order" key={order.id || key}>
                <div className="dm-account-order-top"><strong>{order.restaurant_name || 'Delivery store'}</strong><span>{niceStatus(order.order_status)}</span></div>
                <p className="dm-account-order-code">{order.order_code} · {order.created_at ? new Date(order.created_at).toLocaleString('en-IN', {dateStyle:'medium',timeStyle:'short'}) : ''}</p>
                <div className="dm-account-order-bottom"><span>{order.driver_assigned ? 'Driver assigned' : 'Delivery order'}</span><strong>{currency(order.total_amount)}</strong></div>
                <div className="dm-account-actions">
                  <button type="button" onClick={() => void openDetail(order)}>{expandedNow ? 'Hide details' : 'Track / Order details'}</button>
                  {allowedReturn && <button type="button" onClick={() => go(`/delivery?store=${encodeURIComponent(order.restaurant_code)}&returnOrder=${encodeURIComponent(order.order_code)}`)}>Return / Replace / Refund</button>}
                </div>
                {expandedNow && <div className="dm-account-detail">
                  {detailBusy && !detail ? <p>Loading order details…</p> : detail?.error ? <p role="alert">{detail.error}</p> : detail?.unavailable ? <p>Detailed tracking information is unavailable for this order.</p> : detail ? <>
                    <p><strong>Status:</strong> {niceStatus(detail.order_status || order.order_status)}</p>
                    {detail.driver_mobile && <p><strong>Driver mobile:</strong> {detail.driver_mobile}</p>}
                    {detail.delivery_boy_mobile && <p><strong>Driver mobile:</strong> {detail.delivery_boy_mobile}</p>}
                    {Array.isArray(detail.items) && detail.items.map((item, i) => <p key={`${item.id || i}`} className="dm-account-detail-item">{item.name || 'Item'} × {item.quantity || item.qty || 1}</p>)}
                    </> : null}
                </div>}
              </article>
            })}
          </> : <>
            <div className="dm-account-section-title"><h2>Account details</h2></div>
            <section className="dm-account-card">
              <div><span>Name</span><strong>{account.name || 'Not provided'}</strong></div>
              <div><span>Login method</span><strong>{type === 'mobile' ? 'Mobile + PIN' : 'Google'}</strong></div>
              <div><span>Email</span><strong>{account.email || 'Not provided'}</strong></div>
              <div><span>Mobile</span><strong>{maskMobile(account.mobile)}</strong></div>
              {type === 'mobile' && <div><span>Registered store</span><strong>{account.restaurantName || account.restaurantCode || 'Delivery store'}</strong></div>}
            </section>
            <div className="dm-account-section-title"><h2>Delivery addresses</h2></div>
            <div className="dm-account-address"><DeliverySavedAddressPicker
              key={`${type}:${account.restaurantCode || account.email}`}
              accountType={type}
              restaurantCode={type === 'mobile' ? account.restaurantCode : ''}
              autoApplyDefault={false}
              compact
            /></div>
            <button type="button" disabled={signingOut} onClick={signOut} className="dm-account-signout">{signingOut ? 'Signing out…' : 'Sign out'}</button>
          </>}
        </>}
      </main>
      <nav className="dm-tabbar" aria-label="Delivery navigation">
        <button type="button" onClick={onGoHome}><Icon name="home"/><span>Home</span></button>
        <button type="button" onClick={() => go('/delivery?choose=1')}><Icon name="search"/><span>Explore</span></button>
        <button type="button" className="dm-tab-main" onClick={() => go('/delivery?choose=1')}><span className="dm-tab-main-bubble"><Icon name="bag"/></span><span>Shop</span></button>
        <button type="button" className={view === 'orders' ? 'active' : ''} onClick={() => go('/delivery?view=orders&choose=1')}><Icon name="clock"/><span>Orders</span></button>
        <button type="button" className={view === 'account' ? 'active' : ''} onClick={() => go('/delivery?view=account&choose=1')}><Icon name="user"/><span>Profile</span></button>
      </nav>
    </div>
  )
}