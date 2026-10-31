'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getCommerceClient } from '@/lib/commerce/client'

function nextPath() {
  const next = new URL(window.location.href).searchParams.get('next')
  return next === '/commerce/apply' ? next : '/commerce/dashboard'
}

export default function OwnerAuth() {
  const router = useRouter()
  const [mode, setMode] = useState('signin')
  const [busy, setBusy] = useState(false)
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  useEffect(() => {
    let active = true
    let subscription
    async function initialize() {
      try {
        const client = getCommerceClient('owner')
        const { data } = await client.auth.getSession()
        if (!active) return
        const query = new URL(window.location.href).searchParams
        setMode(query.get('recovery') === '1' && data.session ? 'update' : query.get('mode') === 'signup' ? 'signup' : 'signin')
        subscription = client.auth.onAuthStateChange((event) => {
          if (active && event === 'PASSWORD_RECOVERY') setMode('update')
        }).data.subscription
      } catch {
        if (active) setError('Owner sign-in is temporarily unavailable. Please try again later.')
      }
    }
    void initialize()
    return () => { active = false; subscription?.unsubscribe() }
  }, [])

  function changeMode(next) { setMode(next); setError(''); setNotice('') }

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    setNotice('')
    const fields = new FormData(event.currentTarget)
    try {
      const client = getCommerceClient('owner')
      const password = String(fields.get('password') || '')
      if (mode === 'signup') {
        const { data, error } = await client.auth.signUp({ email: email.trim(), password, options: { data: { commerce_owner_name: String(fields.get('name') || '').trim() }, emailRedirectTo: `${window.location.origin}/commerce/auth?next=/commerce/apply` } })
        if (error) throw new Error('Unable to create your account. Check your details or try signing in instead.')
        if (data.session?.user.email_confirmed_at) router.push('/commerce/apply')
        else setNotice('Check your email for a verification link. Once verified, sign in to submit your website application.')
      } else if (mode === 'recover') {
        const { error } = await client.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/commerce/auth?recovery=1` })
        if (error) throw new Error('Unable to request a recovery email right now. Please try again later.')
        setNotice('If an account exists for this address, you will receive a recovery link. Please check your inbox.')
      } else if (mode === 'update') {
        const { error } = await client.auth.updateUser({ password })
        if (error) throw new Error('Unable to update your password. Request a new recovery link and try again.')
        setNotice('Your password has been updated. You can now open your owner workspace.')
      } else {
        const { error } = await client.auth.signInWithPassword({ email: email.trim(), password })
        if (error) throw new Error('Unable to sign in. Check your email and password, and make sure your email is verified.')
        router.push(nextPath())
      }
    } catch (requestError) {
      setError(requestError.message || 'We could not complete that request. Please try again.')
    } finally { setBusy(false) }
  }

  const signup = mode === 'signup'
  const recovery = mode === 'recover'
  return (
    <main className="co-main co-auth-layout">
      <section className="co-auth-story"><span className="co-eyebrow">Client Websites · Owner access</span><h1>Small business.<br /><em>Big possibilities.</em></h1><p>Your own catalog, your own customers and a workspace that keeps everything together.</p><div className="co-auth-benefits"><span><b>01</b> One account for your assigned stores</span><span><b>02</b> A catalog that belongs to your business</span><span><b>03</b> Support from setup to opening day</span></div></section>
      <section className="co-card co-auth-card" aria-labelledby="co-auth-title">
        <span className="co-eyebrow">Welcome to your next chapter</span>
        <h2 id="co-auth-title">{signup ? 'Create your owner account' : recovery ? 'Recover your account' : mode === 'update' ? 'Choose a new password' : 'Welcome back.'}</h2>
        <p className="co-muted">{signup ? 'Start with an account. Your business application comes next.' : recovery ? 'We will send a secure recovery link to your email.' : mode === 'update' ? 'Use a strong password that you do not use elsewhere.' : 'Sign in to manage your website or continue your application.'}</p>
        <form className="co-form" onSubmit={submit}>
          {signup && <label>Your name<input name="name" autoComplete="name" required maxLength={120} placeholder="How should we address you?" /></label>}
          {mode !== 'update' && <label>Email address<input name="email" type="email" autoComplete="email" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="you@yourbusiness.com" /></label>}
          {!recovery && <label>{mode === 'update' ? 'New password' : 'Password'}<input name="password" type="password" required minLength={8} maxLength={128} autoComplete={signup || mode === 'update' ? 'new-password' : 'current-password'} placeholder="At least 8 characters" /></label>}
          {error && <p className="co-message co-message-error" role="alert">{error}</p>}
          {notice && <p className="co-message co-message-success" role="status">{notice}</p>}
          <button className="co-button co-button-primary co-button-block" disabled={busy} type="submit">{busy ? 'Please wait…' : signup ? 'Create owner account' : recovery ? 'Send recovery link' : mode === 'update' ? 'Update password' : 'Sign in'} <span aria-hidden="true">→</span></button>
        </form>
        <div className="co-auth-links">{mode === 'signin' ? <><button onClick={() => changeMode('recover')}>Forgot password?</button><button onClick={() => changeMode('signup')}>Create an account</button></> : <button onClick={() => changeMode('signin')}>Back to sign in</button>}</div>
        <p className="co-fine-print">This account is for Client Websites. Your existing restaurant and delivery sessions stay separate.</p>
        {mode === 'update' && notice && <Link className="co-text-link" href="/commerce/dashboard">Open owner workspace →</Link>}
      </section>
    </main>
  )
}
