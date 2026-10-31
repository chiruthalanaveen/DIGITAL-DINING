'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { getCommerceClient } from '@/lib/commerce/client'

export const OWNER_BUSINESSES = [
  ['general', 'General retail'], ['sarees', 'Sarees & ethnic wear'], ['fashion', 'Fashion & clothing'],
  ['grocery', 'Groceries'], ['food', 'Food ordering'], ['toys', 'Toys & gifts'], ['electronics', 'Electronics'],
  ['beauty', 'Beauty & cosmetics'], ['footwear', 'Footwear & accessories'], ['pharmacy', 'Pharmacy (review required)'],
]

export function money(paise) {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(paise || 0) / 100)
}

export function slugify(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+/, '').slice(0, 80)
}

export function useOwnerSession() {
  const [state, setState] = useState({ client: null, session: null, loading: true, error: '' })
  useEffect(() => {
    let active = true
    let subscription
    async function load() {
      try {
        const client = getCommerceClient('owner')
        const { data, error } = await client.auth.getSession()
        if (error) throw error
        if (!active) return
        setState({ client, session: data.session, loading: false, error: '' })
        subscription = client.auth.onAuthStateChange((_event, session) => {
          if (active) setState({ client, session, loading: false, error: '' })
        }).data.subscription
      } catch {
        if (active) setState({ client: null, session: null, loading: false, error: 'Unable to initialize owner sign-in. Please try again later.' })
      }
    }
    void load()
    return () => { active = false; subscription?.unsubscribe() }
  }, [])
  return state
}

export function OwnerAccess({ state, children }) {
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  if (state.loading) return <div className="co-loading" role="status"><span className="co-spinner" />Loading your owner account…</div>
  if (state.error) return <div className="co-card co-empty"><h2>We could not open your account.</h2><p role="alert">{state.error}</p><button className="co-button co-button-primary" onClick={() => window.location.reload()}>Try again</button></div>
  if (!state.session) return <div className="co-card co-empty"><span className="co-empty-icon" aria-hidden="true">↗</span><h2>Your owner workspace starts here.</h2><p>Sign in with your Client Websites account to apply for a store or manage a website assigned to you.</p><div className="co-actions"><Link className="co-button co-button-primary" href="/commerce/auth">Sign in</Link><Link className="co-button co-button-outline" href="/commerce/auth?mode=signup">Create an account</Link></div></div>
  if (!state.session.user.email_confirmed_at) {
    async function resend() {
      if (busy) return
      setBusy(true)
      setNotice('')
      try {
        const { error } = await state.client.auth.resend({ type: 'signup', email: state.session.user.email, options: { emailRedirectTo: `${window.location.origin}/commerce/auth?next=/commerce/apply` } })
        setNotice(error ? 'Unable to resend verification right now. Please try again later.' : 'Verification email requested. Check your inbox and spam folder.')
      } catch {
        setNotice('Unable to resend verification right now. Please try again later.')
      } finally { setBusy(false) }
    }
    return <div className="co-card co-empty"><h2>One more step: verify your email.</h2><p>Use the verification link sent to {state.session.user.email} before submitting your business application.</p>{notice && <p role="status">{notice}</p>}<button className="co-button co-button-primary" disabled={busy} onClick={() => void resend()}>{busy ? 'Requesting…' : 'Resend verification'}</button></div>
  }
  return children
}
