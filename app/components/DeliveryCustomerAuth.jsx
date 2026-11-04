'use client'
// EXACT PATH: app/components/DeliveryCustomerAuth.jsx
// Unified Google + no-SMS-OTP device-bound mobile account screen.
// A phone number + DOB alone NEVER logs in from an unrecognized device.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import DeliveryLoginAdHero from '@/app/components/DeliveryLoginAdHero'
import {
  safeDeliveryNext,
  saveDeliveryGoogleContext,
  startDeliveryGoogleOAuth,
} from '@/lib/deliveryGoogleAuth'

const MOBILE = /^[6-9]\d{9}$/
const STORE = /^[A-Za-z0-9_-]{1,80}$/
const DEVICE_KEY = 'digitaldine_delivery_mobile_device_credentials_v1'
function dobValid(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return Number.isFinite(d.getTime()) && d.toISOString().slice(0, 10) === value &&
    value >= '1900-01-01' && value <= new Date().toISOString().slice(0, 10)
}
function readCredentials(mobile) {
  try {
    const saved = JSON.parse(window.localStorage.getItem(DEVICE_KEY) || '{}')
    const credential = saved?.[mobile]
    if (credential && typeof credential.email === 'string' &&
      typeof credential.password === 'string' && credential.password.length >= 40) return credential
  } catch { /* storage can be disabled */ }
  return null
}
function saveCredentials(mobile, credential) {
  try {
    const saved = JSON.parse(window.localStorage.getItem(DEVICE_KEY) || '{}')
    // Limit the number of stored device credentials.
    const next = Object.fromEntries(Object.entries(saved).slice(-5))
    next[mobile] = credential
    window.localStorage.setItem(DEVICE_KEY, JSON.stringify(next))
    return true
  } catch { return false }
}
function hasGoogleIdentity(user) {
  return Boolean(user?.identities?.some(item => item.provider === 'google') ||
    user?.app_metadata?.provider === 'google' || user?.app_metadata?.providers?.includes('google'))
}

export default function DeliveryCustomerAuth({ mode = 'login' }) {
  const router = useRouter()
  const params = useSearchParams()
  const storeCandidate = String(params.get('store') || params.get('restaurantCode') || '').trim()
  const storeCode = STORE.test(storeCandidate) ? storeCandidate : ''
  const requested = params.get('next') || ''
  const nextPath = useMemo(() => {
    if (requested === '/delivery?view=orders' || requested === '/delivery?view=account') return requested
    const safe = safeDeliveryNext(requested)
    const blocked = /^\/delivery\/(?:login|signup|complete-profile|forgot-pin)(?:[/?]|$)/i.test(safe)
    if (!blocked && (safe !== '/delivery' || requested === '/delivery')) return safe
    return storeCode ? `/delivery/${encodeURIComponent(storeCode)}` : '/delivery'
  }, [requested, storeCode])

  // Login and signup are both available in this ONE screen.
  const [screen, setScreen] = useState(mode === 'signup' ? 'signup' : 'login')
  const [method, setMethod] = useState('google')
  const [googleUser, setGoogleUser] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [mobile, setMobile] = useState('')
  const [dob, setDob] = useState('')
  const [name, setName] = useState('')
  const isSignup = screen === 'signup'
  const [showMobileDetails, setShowMobileDetails] = useState(false)
  const loginPanelRef = useRef(null)
  // Direct-store mode: use the configured storefront's existing ads.
  // No account identifier or phone number is sent in the ad request.
  const fallbackStoreCode = String(process.env.NEXT_PUBLIC_DELIVERY_DEFAULT_STORE_CODE || '15478')
  const pathParts = String(nextPath).split('?')[0].split('/').filter(Boolean)
  const pathStoreCode = pathParts.length > 1 && STORE.test(pathParts[1]) && !['login','signup','complete-profile','forgot-pin'].includes(pathParts[1].toLowerCase())
    ? pathParts[1] : ''
  const adStoreCode = storeCode || pathStoreCode || (STORE.test(fallbackStoreCode) ? fallbackStoreCode : '')
  const skipAd = () => loginPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  useEffect(() => {
    let active = true
    supabase.auth.getUser().then(({ data }) => {
      if (active) setGoogleUser(hasGoogleIdentity(data?.user) ? data.user : null)
    }).catch(() => {})
    return () => { active = false }
  }, [])

  function changeScreen(value) {
    setScreen(value)
    setShowMobileDetails(false)
    setError('')
    setNotice('')
  }
  async function google(switchAccount = false) {
    if (busy) return
    setBusy(true); setError(''); setNotice('')
    try {
      if (googleUser && !switchAccount) {
        saveDeliveryGoogleContext({ nextPath, storeCode, mode: screen })
        router.push('/auth/delivery-callback')
        return
      }
      await startDeliveryGoogleOAuth({ nextPath, storeCode, mode: screen })
    } catch (caught) {
      setError(caught?.message || 'Google login could not be started.')
      setBusy(false)
    }
  }
  async function mobileSubmit(event) {
    event.preventDefault()
    if (busy) return
    setError(''); setNotice('')
    const number = mobile.replace(/\D/g, '')
    const fullName = name.trim().replace(/\s+/g, ' ')
    if (!MOBILE.test(number) || !dobValid(dob) || (isSignup && fullName.length < 2)) {
      setError('Enter a valid mobile number, date of birth and (for signup) full name.')
      return
    }
    setBusy(true)
    try {
      let credential = readCredentials(number)
      if (isSignup) {
        if (credential) {
          throw new Error('This browser already has an account for this number. Switch to Sign in.')
        }
        const registerResponse = await fetch('/api/delivery/customer/mobile-device', {
          method: 'POST', credentials: 'same-origin', cache: 'no-store',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'register', name: fullName,
            mobile: number, dateOfBirth: dob }),
        })
        const registered = await registerResponse.json().catch(() => ({}))
        if (!registerResponse.ok || !registered.success || !registered.loginEmail || !registered.devicePassword) {
          throw new Error(registered.message || 'Unable to create your account.')
        }
        credential = { email: registered.loginEmail, password: registered.devicePassword }
        if (!saveCredentials(number, credential)) {
          throw new Error('Account created, but this browser could not remember its device credential. Enable browser storage before continuing; do not clear browser data.')
        }
      } else if (!credential) {
        throw new Error('This number was not registered on this browser. A mobile number and DOB alone cannot open a private account from another device. Use Google, or register a new device-only account.')
      }
      // The secret device credential is the real authentication factor.
      // Supabase Auth issues a normal signed session, not an unverified cookie.
      const { data: signed, error: signError } = await supabase.auth.signInWithPassword({
        email: credential.email, password: credential.password,
      })
      if (signError || !signed?.session?.access_token) {
        throw new Error('The saved device sign-in credential is invalid. Use Google or contact support.')
      }
      const checkResponse = await fetch('/api/delivery/customer/mobile-device', {
        method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json',
          Authorization: `Bearer ${signed.session.access_token}` },
        body: JSON.stringify({ action: 'verify', mobile: number, dateOfBirth: dob }),
      })
      const check = await checkResponse.json().catch(() => ({}))
      if (!checkResponse.ok || check.success !== true) {
        await supabase.auth.signOut()
        throw new Error(check.message || 'Mobile number or date of birth did not match.')
      }
      // Clear only the OLD Mobile/PIN session (if any). This does not sign out Supabase Auth.
      await fetch('/api/delivery/customer/session', {
        method: 'DELETE', credentials: 'same-origin', cache: 'no-store',
      }).catch(() => {})
      let profileComplete = false
      try {
        const res = await fetch('/api/delivery/customer/google-profile', {
          credentials: 'same-origin', cache: 'no-store',
          headers: { Authorization: `Bearer ${signed.session.access_token}` },
        })
        const data = await res.json().catch(() => ({}))
        profileComplete = res.ok && data.success === true && data.profile?.complete === true
      } catch { /* Direct to setup if profile read is temporarily unavailable. */ }
      router.replace(profileComplete ? nextPath : `/delivery/complete-profile?next=${encodeURIComponent(nextPath)}`)
      router.refresh()
    } catch (caught) {
      setError(caught?.message || 'Unable to sign in.')
      setBusy(false)
    }
  }

  return (
    <main className="min-h-[100dvh] overflow-x-hidden bg-[#0c0c0f] text-[#f7f7f9]">
      <div className="mx-auto w-full max-w-[620px] bg-[#0c0c0f] shadow-[0_0_65px_rgba(0,0,0,0.20)] lg:my-4 lg:overflow-hidden lg:rounded-[32px]">
        <DeliveryLoginAdHero restaurantCode={adStoreCode} onSkip={skipAd} />
        <section ref={loginPanelRef} className="relative z-10 -mt-6 min-h-[470px] rounded-t-[28px] bg-[#19191e] px-5 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-6 shadow-[0_-22px_60px_rgba(0,0,0,0.12)] sm:px-8" aria-label="Customer login or signup">
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-[#494951]" aria-hidden="true" />
          <div className="mb-5 text-center">
            <h2 className="text-2xl font-black tracking-[-0.04em]">Log in or sign up</h2>
            <p className="mt-1.5 text-xs text-[#a3a4af]">One account for orders, tracking and saved addresses</p>
          </div>
          <div className="mb-5 grid grid-cols-2 gap-1 rounded-xl border border-[#383842] bg-[#25252c] p-1" role="tablist" aria-label="Delivery account access">
            <button type="button" role="tab" aria-selected={!isSignup} disabled={busy} onClick={() => changeScreen('login')}
              className={`min-h-11 rounded-lg text-sm font-bold transition ${!isSignup ? 'bg-[#f5f5f7] text-[#1b1b20]' : 'text-[#c7c7d0]'}`}>Login</button>
            <button type="button" role="tab" aria-selected={isSignup} disabled={busy} onClick={() => changeScreen('signup')}
              className={`min-h-11 rounded-lg text-sm font-bold transition ${isSignup ? 'bg-[#f5f5f7] text-[#1b1b20]' : 'text-[#c7c7d0]'}`}>Sign Up</button>
          </div>
          <div className="mb-4 grid grid-cols-2 gap-2">
            <button type="button" disabled={busy} onClick={() => { setMethod('mobile'); setShowMobileDetails(false); setError('') }} aria-pressed={method === 'mobile'}
              className={`min-h-11 rounded-xl border px-3 text-sm font-bold transition ${method === 'mobile' ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300' : 'border-[#3f3f47] bg-[#24242a] text-[#c6c6cd]'}`}>Mobile + DOB</button>
            <button type="button" disabled={busy} onClick={() => { setMethod('google'); setError('') }} aria-pressed={method === 'google'}
              className={`min-h-11 rounded-xl border px-3 text-sm font-bold transition ${method === 'google' ? 'border-emerald-500 bg-emerald-500/15 text-emerald-300' : 'border-[#3f3f47] bg-[#24242a] text-[#c6c6cd]'}`}>
              <span className="mr-2 font-black text-[#4285f4]">G</span>Google
            </button>
          </div>
          {method === 'mobile' ? (
            <form onSubmit={event => {
              if (!showMobileDetails) {
                event.preventDefault()
                setError('')
                if (!MOBILE.test(mobile.replace(/\D/g,''))) { setError('Enter a valid Indian 10-digit mobile number.'); return }
                setShowMobileDetails(true)
                return
              }
              void mobileSubmit(event)
            }} className="space-y-3">
              <label className="block text-[11px] font-bold text-[#d9d9df]" htmlFor="dd-login-mobile">Mobile number</label>
              <div className="flex min-h-14 items-center overflow-hidden rounded-xl border border-[#41414b] bg-[#17171b] focus-within:border-emerald-500">
                <span className="flex h-14 items-center border-r border-[#41414b] px-3 text-lg" aria-label="India country code">🇮🇳</span>
                <span className="pl-3 text-base font-semibold text-white">+91</span>
                <input id="dd-login-mobile" type="tel" inputMode="numeric" autoComplete="tel-national" required maxLength={10} value={mobile}
                  onChange={event => { setMobile(event.target.value.replace(/\D/g,'').slice(0,10)); setShowMobileDetails(false) }}
                  placeholder="Enter Mobile Number"
                  className="h-14 min-w-0 flex-1 bg-transparent px-2.5 text-base font-semibold text-white outline-none placeholder:text-[#767680]" />
              </div>
              {showMobileDetails && (
                <div className="space-y-3 rounded-xl border border-[#34343d] bg-[#222228] p-3">
                  <p className="text-xs font-bold text-emerald-300">{isSignup ? 'Create your mobile account' : 'Welcome back — confirm your DOB'}</p>
                  {isSignup && (
                    <label className="block text-xs font-semibold text-[#dbdbe2]">Full name
                      <input type="text" autoComplete="name" required maxLength={100} value={name} onChange={event => setName(event.target.value)} placeholder="Your full name"
                        className="mt-1.5 h-12 w-full rounded-lg border border-[#454550] bg-[#151519] px-3 text-base text-white outline-none focus:border-emerald-500" />
                    </label>
                  )}
                  <label className="block text-xs font-semibold text-[#dbdbe2]">Date of birth
                    <input type="date" autoComplete="bday" required min="1900-01-01" max={new Date().toISOString().slice(0,10)} value={dob} onChange={event => setDob(event.target.value)}
                      className="mt-1.5 h-12 w-full rounded-lg border border-[#454550] bg-[#151519] px-3 text-base text-white outline-none [color-scheme:dark] focus:border-emerald-500" />
                  </label>
                  <p className="text-[11px] leading-4 text-[#a7a7b0]">Without SMS OTP, mobile accounts work only on the browser where they were registered. Number + DOB cannot unlock another person's private account.</p>
                </div>
              )}
              <button type="submit" disabled={busy} className="min-h-14 w-full rounded-xl bg-[#ed526b] px-4 text-base font-extrabold text-white shadow-[0_10px_24px_rgba(237,82,107,0.16)] transition hover:bg-[#f3677e] active:scale-[0.99] disabled:opacity-60">
                {busy ? 'Please wait…' : showMobileDetails ? isSignup ? 'Create account' : 'Log in securely' : 'Continue'}
              </button>
            </form>
          ) : (
            <div className="space-y-4">
              <button type="button" disabled={busy} onClick={() => google(false)}
                className="flex min-h-14 w-full items-center justify-center gap-3 rounded-xl bg-[#f5f5f7] px-4 text-base font-extrabold text-[#202127] transition hover:bg-white disabled:opacity-60">
                <span className="text-xl font-black text-[#4285f4]">G</span>
                {busy ? 'Connecting to Google…' : isSignup ? 'Sign up with Google' : 'Continue with Google'}
              </button>
              {googleUser && <button type="button" disabled={busy} onClick={() => google(true)} className="block w-full text-center text-xs font-bold text-emerald-300">Use another Google account</button>}
              <p className="text-xs leading-5 text-[#a7a7b0]">Your Google account verifies your identity so you can access saved addresses and previous orders across devices.</p>
            </div>
          )}
          {error && <p role="alert" className="mt-4 rounded-xl border border-rose-700/45 bg-rose-900/15 p-3 text-xs font-semibold leading-5 text-rose-200">{error}</p>}
          {notice && <p role="status" className="mt-4 rounded-xl border border-emerald-500/25 bg-emerald-500/10 p-3 text-xs font-medium text-emerald-200">{notice}</p>}
          <div className="mt-7 border-t border-[#36363e] pt-5 text-center">
            <p className="text-xs leading-6 text-[#a9a9b2]">By continuing, you agree to Digital Dine-In's Terms of Service and Privacy Policy.</p>
            <p className="mt-3 text-[10px] font-bold tracking-[0.09em] text-[#797982]">SECURE DELIVERY CUSTOMER ACCESS</p>
          </div>
          <button type="button" onClick={() => router.push(nextPath)} className="mt-4 w-full rounded-lg px-4 py-2 text-xs font-semibold text-[#9999a4] underline underline-offset-4">Continue browsing without signing in</button>
        </section>
      </div>
    </main>
  )
}