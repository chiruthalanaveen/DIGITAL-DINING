'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function WebsiteOwnerLoginPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [dob, setDob] = useState('')
  const [showDob, setShowDob] = useState(false)
  const [loading, setLoading] = useState(false)
  const [oauthLoading, setOauthLoading] = useState('')
  const [error, setError] = useState('')

  const busy = loading || Boolean(oauthLoading)

  const findOwnerRestaurant = async (user) => {
    if (!user?.id) {
      throw new Error('Authenticated user was not found.')
    }

    const { data: restaurant, error: restaurantError } = await supabase
      .from('restaurants')
      .select('id, name, dob, subscription_status')
      .eq('id', user.id)
      .maybeSingle()

    if (restaurantError) {
      throw new Error(restaurantError.message || 'Unable to load your restaurant account.')
    }

    if (!restaurant?.id) {
      throw new Error(
        'No restaurant account is connected to this login. Please register your business first.'
      )
    }

    return restaurant
  }

  const handlePasswordLogin = async (event) => {
    event.preventDefault()
    if (busy) return

    const cleanEmail = email.trim().toLowerCase()

    if (!cleanEmail || !password) {
      setError('Enter your email address and password.')
      return
    }

    setLoading(true)
    setError('')

    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      })

      if (signInError) throw new Error(signInError.message || 'Unable to sign in.')
      if (!data?.user) throw new Error('Login succeeded, but the user session was not found.')

      const restaurant = await findOwnerRestaurant(data.user)
      router.replace(`/dashboard/${encodeURIComponent(restaurant.id)}`)
    } catch (loginError) {
      console.error('[WEBSITE LOGIN] Password login error:', loginError)
      setError(loginError?.message || 'Unable to sign in. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleBiometricLogin = async () => {
    if (busy) return

    const cleanEmail = email.trim().toLowerCase()
    const cleanDob = dob.trim()

    if (!cleanEmail || !cleanDob) {
      setError('Enter your email address and date of birth before using biometric login.')
      return
    }

    setLoading(true)
    setError('')

    try {
      if (typeof window === 'undefined' || !window.PublicKeyCredential) {
        throw new Error('Biometric/passkey login is not supported by this browser or device.')
      }
      if (typeof supabase.auth.signInWithPasskey !== 'function') {
        throw new Error('Biometric/passkey login is not available in the current Supabase client.')
      }

      const { data, error: passkeyError } = await supabase.auth.signInWithPasskey()
      if (passkeyError) throw new Error(passkeyError.message || 'Biometric verification failed.')

      const fallback = await supabase.auth.getUser()
      const user = data?.user || data?.session?.user || fallback.data?.user
      if (!user) throw new Error('Biometric verification succeeded, but the user session was not found.')

      if (user.email && user.email.trim().toLowerCase() !== cleanEmail) {
        await supabase.auth.signOut()
        throw new Error('The biometric credential belongs to a different email account.')
      }

      const restaurant = await findOwnerRestaurant(user)

      if (!restaurant?.dob) {
        await supabase.auth.signOut()
        throw new Error(
          'Date of birth is not available for this account. Please use email/password or Google login.'
        )
      }
      if (String(restaurant.dob).slice(0, 10) !== cleanDob) {
        await supabase.auth.signOut()
        throw new Error('Date of birth does not match this account.')
      }

      router.replace(`/dashboard/${encodeURIComponent(restaurant.id)}`)
    } catch (biometricError) {
      console.error('[WEBSITE LOGIN] Biometric/passkey login error:', biometricError)
      setError(biometricError?.message || 'Biometric login could not be completed.')
    } finally {
      setLoading(false)
    }
  }

  const handleOAuth = async (provider) => {
    if (busy) return

    setOauthLoading(provider)
    setError('')

    try {
      if (provider === 'google') {
        localStorage.removeItem('digitaldining_google_registration')
      } else {
        localStorage.removeItem('digitaldining_apple_registration')
      }

      const redirectTo = `${window.location.origin}/auth/${provider}-complete?source=website`

      const options =
        provider === 'google'
          ? { redirectTo, queryParams: { access_type: 'offline', prompt: 'select_account' } }
          : { redirectTo }

      const { error: oauthError } = await supabase.auth.signInWithOAuth({ provider, options })
      if (oauthError) throw oauthError
    } catch (oauthError) {
      console.error(`[WEBSITE LOGIN] ${provider} login error:`, oauthError)
      setError(oauthError?.message || `${provider} login could not be started. Please try again.`)
      setOauthLoading('')
    }
  }

  const inputClass =
    'h-12 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 text-sm font-medium text-neutral-900 placeholder:text-neutral-400 outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-100 disabled:opacity-60'

  const labelClass =
    'mb-1.5 block text-xs font-semibold text-neutral-700'

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-950">
      <div className="mx-auto grid min-h-screen w-full max-w-6xl lg:grid-cols-2">

        {/* Brand panel */}
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-neutral-950 p-12 text-white lg:flex">
          <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-orange-500/20 blur-3xl" />
          <div className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-orange-400/10 blur-3xl" />

          <div className="relative flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500 text-sm font-black text-neutral-950">
              DD
            </div>
            <div>
              <p className="text-sm font-bold">Digital Dine-In</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-400">
                Business Platform
              </p>
            </div>
          </div>

          <div className="relative max-w-sm">
            <h2 className="text-4xl font-black leading-tight tracking-tight">
              Run your restaurant from one place.
            </h2>
            <p className="mt-4 text-sm leading-6 text-neutral-400">
              Manage orders, menus, staff and delivery from your business dashboard.
            </p>
          </div>

          <p className="relative text-xs text-neutral-500">
            © {new Date().getFullYear()} Digital Dine-In
          </p>
        </aside>

        {/* Form panel */}
        <section className="flex items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full max-w-md">

            <div className="mb-8 flex items-center justify-between">
              <Link
                href="/"
                aria-label="Back to Digital Dine-In"
                className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-200 bg-white text-sm font-bold shadow-sm transition hover:bg-neutral-50"
              >
                ←
              </Link>
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-orange-600 lg:hidden">
                Digital Dine-In
              </span>
            </div>

            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-orange-600">
                Website Owner Login
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight">Welcome back</h1>
              <p className="mt-2 text-sm text-neutral-500">
                Sign in to manage your business dashboard.
              </p>
            </div>

            {/* Social sign-in */}
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => handleOAuth('google')}
                disabled={busy}
                className="flex h-12 items-center justify-center gap-2.5 rounded-xl border border-neutral-200 bg-white text-sm font-semibold transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="text-base font-black text-[#4285F4]">G</span>
                {oauthLoading === 'google' ? 'Opening Google…' : 'Google'}
              </button>

              <button
                type="button"
                onClick={() => handleOAuth('apple')}
                disabled={busy}
                className="flex h-12 items-center justify-center gap-2.5 rounded-xl bg-neutral-950 text-sm font-semibold text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <span className="text-base">●</span>
                {oauthLoading === 'apple' ? 'Opening Apple…' : 'Apple'}
              </button>
            </div>

            <div className="my-7 flex items-center gap-3">
              <div className="h-px flex-1 bg-neutral-200" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                or with email
              </span>
              <div className="h-px flex-1 bg-neutral-200" />
            </div>

            <form onSubmit={handlePasswordLogin} className="space-y-5" noValidate>
              <div>
                <label htmlFor="email" className={labelClass}>Email address</label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => { setEmail(e.target.value); setError('') }}
                  placeholder="owner@example.com"
                  className={inputClass}
                />
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label htmlFor="password" className="text-xs font-semibold text-neutral-700">
                    Password
                  </label>
                </div>
                <input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => { setPassword(e.target.value); setError('') }}
                  placeholder="Enter your password"
                  className={inputClass}
                />
              </div>

              {/* Optional DOB, revealed only for biometric login */}
              <div>
                <button
                  type="button"
                  onClick={() => setShowDob((v) => !v)}
                  className="text-xs font-semibold text-orange-600 hover:text-orange-700"
                  aria-expanded={showDob}
                >
                  {showDob ? 'Hide date of birth' : 'Use biometric login instead?'}
                </button>

                {showDob && (
                  <div className="mt-3 rounded-xl border border-orange-100 bg-orange-50/60 p-4">
                    <label htmlFor="dob" className={labelClass}>Date of birth</label>
                    <input
                      id="dob"
                      type="date"
                      autoComplete="bday"
                      value={dob}
                      onChange={(e) => { setDob(e.target.value); setError('') }}
                      className={inputClass}
                    />
                    <p className="mt-2 text-[11px] leading-4 text-neutral-500">
                      Used only as an additional account check for biometric login.
                    </p>
                    <button
                      type="button"
                      onClick={handleBiometricLogin}
                      disabled={busy}
                      className="mt-3 h-11 w-full rounded-xl border border-orange-200 bg-white text-sm font-semibold text-orange-700 transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {loading ? 'Verifying…' : 'Continue with Passkey / Biometric'}
                    </button>
                  </div>
                )}
              </div>

              {error && (
                <div
                  role="alert"
                  aria-live="assertive"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-medium leading-5 text-red-700"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={busy}
                className="h-12 w-full rounded-xl bg-orange-500 text-sm font-bold text-neutral-950 shadow-sm transition hover:bg-orange-400 focus:outline-none focus-visible:ring-4 focus-visible:ring-orange-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading ? 'Signing in…' : 'Log in to dashboard'}
              </button>
            </form>

            <p className="mt-8 text-center text-sm text-neutral-500">
              New to Digital Dine-In?{' '}
              <Link href="/register" className="font-bold text-orange-600 hover:text-orange-700">
                Register your business
              </Link>
            </p>

            <div className="mt-8 rounded-2xl border border-neutral-200 bg-white p-4 text-center">
              <p className="text-xs text-neutral-500">Looking for staff, packer or delivery access?</p>
              <Link
                href="/app"
                className="mt-1 inline-block text-xs font-bold text-neutral-950 underline decoration-orange-400 underline-offset-4"
              >
                Open Restaurant App
              </Link>
            </div>

          </div>
        </section>
      </div>
    </main>
  )
}