'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { commerceFetch, getCommerceClient } from '@/lib/commerce/client'
import { StoreBrand, storeStyle } from './Storefront'

const money = (value) => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value || 0) / 100)
const human = (value) => String(value || '').replaceAll('_', ' ')

export default function StoreAccount({ website }) {
  const clientRef = useRef(null)
  const accountIdRef = useRef(null)
  const [session, setSession] = useState(null)
  const [ready, setReady] = useState(false)
  const [mode, setMode] = useState('login')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [form, setForm] = useState({ name: '', email: '', password: '' })
  const [orders, setOrders] = useState([])
  const [items, setItems] = useState([])
  const [ordersUserId, setOrdersUserId] = useState(null)
  const [verificationEmail, setVerificationEmail] = useState('')
  const [loadingOrders, setLoadingOrders] = useState(false)
  const [ordersError, setOrdersError] = useState('')
  const [refresh, setRefresh] = useState(0)
  const home = `/shops/${encodeURIComponent(website.slug)}`
  const verified = Boolean(session?.user?.email_confirmed_at)
  const visibleOrders = ordersUserId === session?.user?.id ? orders : []

  useEffect(() => {
    let alive = true
    let authVersion = 0
    const client = getCommerceClient(`customer:${website.slug}`)
    clientRef.current = client
    function acceptSession(next) {
      if (!alive) return
      const nextId = next?.user?.id || null
      if (accountIdRef.current !== nextId) {
        accountIdRef.current = nextId
        setOrders([]); setItems([]); setOrdersUserId(null); setOrdersError('')
        setForm({ name: '', email: '', password: '' }); setVerificationEmail('')
        setError(''); setNotice('')
      }
      setSession(next); setReady(true)
    }
    client.auth.getSession().then(({ data }) => { if (!authVersion) acceptSession(data.session) }).catch(() => { if (alive) { setReady(true); setError('We could not check your session. Please try signing in again.') } })
    const { data: listener } = client.auth.onAuthStateChange((event, next) => {
      if (!alive) return
      authVersion += 1
      acceptSession(next)
      if (event === 'PASSWORD_RECOVERY') setMode('update')
      if (event === 'SIGNED_OUT') setMode('login')
    })
    return () => { alive = false; listener.subscription.unsubscribe() }
  }, [website.slug])

  useEffect(() => {
    if (!verified || !session?.user?.id || !clientRef.current) return
    const controller = new AbortController()
    Promise.resolve().then(() => { if (!controller.signal.aborted) { setLoadingOrders(true); setOrdersError('') } })
    commerceFetch(`/api/commerce/customer/orders?website_id=${encodeURIComponent(website.id)}`, { client: clientRef.current, signal: controller.signal })
      .then((result) => { if (!controller.signal.aborted) { setOrdersUserId(session.user.id); setOrders(result.orders || []); setItems(result.order_items || []) } })
      .catch((requestError) => { if (!controller.signal.aborted) setOrdersError(requestError.message || 'Unable to load orders.') })
      .finally(() => { if (!controller.signal.aborted) setLoadingOrders(false) })
    return () => controller.abort()
  }, [website.id, session?.user?.id, verified, refresh])

  async function authenticate(event) {
    event.preventDefault()
    if (busy || !clientRef.current) return
    const client = clientRef.current
    setBusy(true); setError(''); setNotice('')
    try {
      const redirectTo = `${window.location.origin}${home}/account`
      if (mode === 'recover') {
        const { error: authError } = await client.auth.resetPasswordForEmail(form.email.trim(), { redirectTo })
        if (authError) throw new Error('We could not send a recovery request right now. Please try again later.')
        setNotice('If this email has an account, a password recovery link will arrive shortly. Open it in this browser.')
      } else if (mode === 'update') {
        const { error: authError } = await client.auth.updateUser({ password: form.password })
        if (authError) throw new Error('We could not update your password. Request a fresh recovery link and try again.')
        setMode('login'); setNotice('Your password has been updated.'); setForm(current => ({ ...current, password: '' }))
      } else if (mode === 'signup') {
        const { data, error: authError } = await client.auth.signUp({
          email: form.email.trim(), password: form.password,
          options: { emailRedirectTo: redirectTo, data: { full_name: form.name.trim(), commerce_customer: true } },
        })
        if (authError) throw new Error('We could not create your account. Check your details or try signing in.')
        setSession(data.session); setForm(current => ({ ...current, password: '' }))
        setVerificationEmail(data.user?.email_confirmed_at ? '' : form.email.trim())
        setNotice(data.user?.email_confirmed_at ? 'Your account is ready.' : 'Check your email to verify your account. Open the verification link in this browser, then return to the store.')
      } else {
        const { data, error: authError } = await client.auth.signInWithPassword({ email: form.email.trim(), password: form.password })
        if (authError) throw new Error('Unable to sign in. Check your email and password, and try again.')
        setSession(data.session); setForm(current => ({ ...current, password: '' }))
      }
    } catch (authError) { setError(authError.message || 'The request could not be completed. Please try again.') }
    finally { setBusy(false) }
  }

  async function resend() {
    const email = session?.user?.email || verificationEmail
    if (busy || !clientRef.current || !email) return
    setBusy(true); setError(''); setNotice('')
    try {
      const { error: authError } = await clientRef.current.auth.resend({ type: 'signup', email, options: { emailRedirectTo: `${window.location.origin}${home}/account` } })
      if (authError) throw new Error('We could not resend the verification email. Please wait a moment and try again.')
      setNotice('A verification email has been requested. Check your inbox and spam folder.')
    } catch (authError) { setError(authError.message) }
    finally { setBusy(false) }
  }

  async function signOut() {
    if (busy || !clientRef.current) return
    setBusy(true); setError(''); setNotice('')
    try {
      const { error: authError } = await clientRef.current.auth.signOut({ scope: 'local' })
      if (authError) throw new Error('We could not sign out. Please try again.')
      setSession(null); setOrders([]); setItems([]); setOrdersUserId(null); setVerificationEmail(''); setForm({ name: '', email: '', password: '' }); setMode('login')
    } catch (authError) { setError(authError.message) }
    finally { setBusy(false) }
  }

  return <main className="commerce-store cs-account-page" style={storeStyle(website.branding)}>
    <header className="cs-header cs-container"><StoreBrand website={website} /><Link className="cs-text-link" href={home}>← Back to the store</Link></header>
    <div className="cs-container cs-account-layout">
      <section className="cs-account-intro"><p className="cs-eyebrow">Your {website.name} account</p><h1>Good to see you.</h1><p>Sign in to order from this store and keep track of your purchases.</p><div className="cs-account-benefits"><p><span aria-hidden="true">01</span> A secure account for your shopping</p><p><span aria-hidden="true">02</span> Your orders, all in one place</p><p><span aria-hidden="true">03</span> Direct updates from the store</p></div></section>
      <section className="cs-account-panel" aria-label="Customer account">
        {!ready ? <p role="status">Checking your account…</p> : session && mode !== 'update' ? <>
          <p className="cs-eyebrow">Signed in</p><h2>{session.user.user_metadata?.full_name || 'My account'}</h2><p className="cs-account-email">{session.user.email}</p>
          {!verified && <div className="cs-notice"><p>Verify your email to place orders and view your order history.</p><button className="cs-secondary" type="button" disabled={busy} onClick={resend}>Resend verification email</button></div>}
          <div className="cs-account-actions"><Link className="cs-primary" href={home}>Continue shopping</Link><button className="cs-secondary" type="button" disabled={busy} onClick={signOut}>Sign out</button></div>
          <button className="cs-text-button" type="button" onClick={() => { setMode('update'); setError(''); setNotice('') }}>Change password</button>
        </> : <>
          {mode !== 'recover' && mode !== 'update' && <div className="cs-auth-tabs" role="group" aria-label="Choose account action"><button type="button" aria-pressed={mode === 'login'} onClick={() => { setMode('login'); setError(''); setNotice('') }}>Sign in</button><button type="button" aria-pressed={mode === 'signup'} onClick={() => { setMode('signup'); setError(''); setNotice('') }}>Create account</button></div>}
          <h2>{mode === 'signup' ? 'Create your account' : mode === 'recover' ? 'Reset your password' : mode === 'update' ? 'Choose a new password' : 'Welcome back'}</h2>
          <form className="cs-auth-form" onSubmit={authenticate}>
            {mode === 'signup' && <label>Your name<input required autoComplete="name" minLength={2} maxLength={100} value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></label>}
            {mode !== 'update' && <label>Email address<input required type="email" autoComplete="email" maxLength={254} value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></label>}
            {mode !== 'recover' && <label>{mode === 'update' ? 'New password' : 'Password'}<input required type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'login' ? 1 : 10} maxLength={200} value={form.password} onChange={event => setForm({ ...form, password: event.target.value })} />{mode !== 'login' && <span className="cs-small">Use at least 10 characters.</span>}</label>}
            <button className="cs-primary cs-full-width" type="submit" disabled={busy}>{busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : mode === 'recover' ? 'Send recovery link' : mode === 'update' ? 'Update password' : 'Sign in'}</button>
          </form>
          {mode === 'login' ? <button className="cs-text-button" type="button" onClick={() => { setMode('recover'); setError(''); setNotice('') }}>Forgot your password?</button> : <button className="cs-text-button" type="button" onClick={() => { setMode('login'); setError(''); setNotice('') }}>Back to sign in</button>}
        </>}
        {error && <p className="cs-error" role="alert">{error}</p>}{notice && <p className="cs-notice" role="status">{notice}</p>}
        {!session && verificationEmail && <button className="cs-text-button" type="button" disabled={busy} onClick={resend}>Resend verification email</button>}
      </section>
    </div>
    {verified && <section className="cs-container cs-order-history" aria-labelledby="cs-orders-title"><div className="cs-section-heading"><div><p className="cs-eyebrow">Your purchases with this store</p><h2 id="cs-orders-title">Order history</h2></div><button className="cs-secondary" type="button" disabled={loadingOrders} onClick={() => setRefresh(current => current + 1)}>{loadingOrders ? 'Loading…' : 'Refresh orders'}</button></div>
      {ordersError && <p role="alert" className="cs-error">{ordersError}</p>}
      {!loadingOrders && !ordersError && visibleOrders.length === 0 && <div className="cs-empty"><h3>No orders yet.</h3><p>Your confirmed orders from {website.name} will appear here.</p><Link className="cs-primary" href={home}>Browse the collection</Link></div>}
      <div className="cs-orders-list">{visibleOrders.map(order => <article className="cs-history-order" key={order.id}><div className="cs-order-top"><div><p className="cs-small">Order reference</p><h3>{order.id}</h3><p className="cs-small">{new Date(order.created_at).toLocaleString('en-IN')}</p></div><span className="cs-order-status">{human(order.status)}</span></div><ul>{items.filter(item => item.order_id === order.id).map(item => <li key={item.id}><span>{item.quantity} × {item.product_name}</span><strong>{money(item.line_total_paise ?? item.unit_price_paise * item.quantity)}</strong></li>)}</ul><div className="cs-order-bottom"><span>{human(order.fulfillment_method)} · {order.payment_method === 'cod' ? 'Cash payment' : human(order.payment_method)} · {human(order.payment_status)}</span><strong>{money(order.total_paise)}</strong></div></article>)}</div>
    </section>}
    <footer className="cs-container cs-account-footer"><span>{website.name}</span><Link href={home}>Back to the collection</Link></footer>
  </main>
}
