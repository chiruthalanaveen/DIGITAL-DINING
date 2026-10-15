'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'

import { useRouter, useSearchParams } from 'next/navigation'

import { supabase } from '@/lib/supabase'
import { startDeliveryGoogleOAuth, saveDeliveryGoogleContext } from '@/lib/deliveryGoogleAuth'

function safeNextPath(value) {

  const next = String(value || '').trim()

  if (

    !next.startsWith('/delivery') ||

    next.startsWith('//') ||

    next.includes('\\') ||

    /[\r\n]/.test(next) ||
    /^\/delivery\/(?:login|signup|forgot-pin)(?:[/?]|$)/i.test(next)

  ) {

    return '/delivery'

  }

  return next

}

function getStoreCode(searchParams, nextPath) {

  const explicit = String(

    searchParams.get('store') ||

    searchParams.get('restaurantCode') ||

    ''

  ).trim()

  if (/^[A-Za-z0-9_-]{1,80}$/.test(explicit)) {

    return explicit

  }

  const pathname = nextPath.split('?')[0]

  const parts = pathname.split('/').filter(Boolean)

  const reserved = [

    'login',

    'signup',

    'account',

    'orders',

    'checkout',

  ]

  if (

    parts.length >= 2 &&

    parts[0] === 'delivery' &&

    !reserved.includes(parts[1]?.toLowerCase())

  ) {

    try {

      const code = decodeURIComponent(parts[1])

      if (/^[A-Za-z0-9_-]{1,80}$/.test(code)) {

        return code

      }

    } catch {

      return ''

    }

  }

  return ''

}

function DeliveryLoginLoading() {

  return (

    <main className="flex min-h-dvh items-center justify-center bg-[#f7f8f6] px-5">

      <div className="flex flex-col items-center">

        <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-600" />

        <p className="mt-4 text-xs font-bold text-neutral-500">

          Loading delivery login...

        </p>

      </div>

    </main>

  )

}

function DeliveryLoginContent() {

  const router = useRouter()

  const searchParams = useSearchParams()

  const nextPath = safeNextPath(searchParams.get('next'))

  const storeCode = useMemo(

    () => getStoreCode(searchParams, nextPath),

    [searchParams, nextPath]

  )

  const [loading, setLoading] = useState(true)

  const [googleLoading, setGoogleLoading] = useState(false)

  const [mobileLoading, setMobileLoading] = useState(false)

  const [error, setError] = useState('')

  const [success, setSuccess] = useState('')

  const [loginMethod, setLoginMethod] = useState('google')

  const [mobile, setMobile] = useState('')

  const [pin, setPin] = useState('')

  const [showPin, setShowPin] = useState(false)

  const [googleUser, setGoogleUser] = useState(null)

  useEffect(() => {

    let mounted = true

    async function checkSession() {

      try {

        const {

          data: { session },

          error: sessionError,

        } = await supabase.auth.getSession()

        if (sessionError) {

          throw sessionError

        }

        if (!mounted) return

        // IMPORTANT FIX:

        // We no longer redirect an already signed-in customer.

        // This allows /delivery/login to remain accessible.

        setGoogleUser(session?.user || null)

      } catch (sessionError) {

        console.error(

          'Delivery session check error:',

          sessionError

        )

      } finally {

        if (mounted) {

          setLoading(false)

        }

      }

    }

    checkSession()

    const {

      data: { subscription },

    } = supabase.auth.onAuthStateChange(

      (_event, session) => {

        if (mounted) {

          setGoogleUser(session?.user || null)

        }

      }

    )

    return () => {

      mounted = false

      subscription?.unsubscribe()

    }

  }, [])

  async function continueWithGoogle() {
    if (googleLoading || mobileLoading) return

    setGoogleLoading(true)
    setError('')
    setSuccess('')

    try {
      // A Google session may already exist because all modules share Supabase Auth.
      // Send it through the DELIVERY callback so the delivery profile is verified,
      // instead of blindly redirecting an owner session to the customer store.
      const googleIdentity = googleUser?.identities?.some(
        (identity) => identity?.provider === 'google'
      ) || googleUser?.app_metadata?.provider === 'google'

      if (googleUser && googleIdentity) {
        saveDeliveryGoogleContext({ nextPath, storeCode, mode: 'login' })
        router.push('/auth/delivery-callback')
        return
      }

      await startDeliveryGoogleOAuth({ nextPath, storeCode, mode: 'login' })
    } catch (oauthError) {
      console.error('Delivery Google login error:', oauthError)
      setError(
        oauthError?.message || 'Unable to continue with Google. Please try again.'
      )
      setGoogleLoading(false)
    }
  }

  async function loginWithMobile(event) {

    event.preventDefault()

    if (mobileLoading || googleLoading) return

    setError('')

    setSuccess('')

    const cleanMobile = mobile.replace(/\D/g, '')

    if (!storeCode) {

      setError(

        'Please select a delivery store before signing in with your mobile number.'

      )

      return

    }

    if (!/^[6-9]\d{9}$/.test(cleanMobile)) {

      setError('Enter a valid 10-digit mobile number.')

      return

    }

    if (!/^\d{4}$/.test(pin)) {

      setError('Enter your 4-digit PIN.')

      return

    }

    setMobileLoading(true)

    try {

      const response = await fetch(

        '/api/delivery/customer/login',

        {

          method: 'POST',

          credentials: 'same-origin',

          headers: {

            'Content-Type': 'application/json',

          },

          body: JSON.stringify({

            restaurantCode: storeCode,

            mobile: cleanMobile,

            pin,

          }),

        }

      )

      const result = await response.json()

      if (!response.ok || !result?.success) {

        throw new Error(

          result?.message || 'Unable to sign in.'

        )

      }

      // Verify the HttpOnly mobile/PIN cookie was really installed before
      // navigating. Otherwise the store immediately redirects back to login.
      const sessionCheck = await fetch(
        `/api/delivery/customer/session?restaurantCode=${encodeURIComponent(storeCode)}`,
        { credentials: 'same-origin', cache: 'no-store' }
      )
      const sessionResult = await sessionCheck.json().catch(() => ({}))
      if (!sessionCheck.ok || sessionResult?.success !== true) {
        throw new Error(
          sessionResult?.code === 'SESSION_UNAVAILABLE'
            ? 'Cannot verify your login session right now. Please retry.'
            : 'Your PIN was accepted, but the login cookie was not established. Update the customer login API and try again.'
        )
      }

      setPin('')
      setSuccess('Signed in successfully.')
      const destination = nextPath === '/delivery'
        ? `/delivery/${encodeURIComponent(storeCode)}` : nextPath
      // A full navigation reinitializes the client and reads the new
      // HttpOnly cookie, preventing stale auth state and redirect loops.
      window.location.replace(destination)

    } catch (loginError) {

      setError(

        loginError?.message ||

          'Unable to sign in. Please try again.'

      )

    } finally {

      setMobileLoading(false)

    }

  }

  const forgotPinQuery = new URLSearchParams({ next: nextPath })
  if (storeCode) forgotPinQuery.set('store', storeCode)

  const signupQuery = new URLSearchParams({

    next: nextPath,

  })

  if (storeCode) {

    signupQuery.set('store', storeCode)

  }

  if (loading) {

    return <DeliveryLoginLoading />

  }

  return (

    <main className="min-h-dvh bg-[#f7f8f6] text-neutral-950">

      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))]">

        {/* Header */}

        <header className="flex items-center justify-between">

          <button

            type="button"

            onClick={() => router.push('/delivery')}

            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-neutral-200 bg-white text-lg font-black shadow-sm transition active:scale-95"

            aria-label="Back to Delivery"

          >

            ←

          </button>

          <div className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-emerald-700">

            Delivery

          </div>

        </header>

        {/* Main */}

        <section className="flex flex-1 flex-col justify-center py-8">

          {/* Branding */}

          <div className="mb-8">

            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[22px] bg-neutral-950 text-xl font-black italic tracking-[-0.12em] text-white shadow-xl">

              DD

            </div>

            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">

              Digital Dine

            </p>

            <h1 className="mt-2 text-[34px] font-black leading-[1.05] tracking-[-0.04em] text-neutral-950">

              Sign in to your

              <br />

              delivery account

            </h1>

            <p className="mt-4 max-w-sm text-sm font-medium leading-6 text-neutral-500">

              Continue with Google or sign in using your

              mobile number and PIN.

            </p>

          </div>

          {/* Login Card */}

          <div className="rounded-[28px] border border-neutral-200 bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.07)]">

            {/* Already Signed In */}

            {googleUser && (

              <div className="mb-5 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">

                <p className="text-xs font-black text-emerald-800">

                  Google account connected

                </p>

                <p className="mt-1 truncate text-xs font-semibold text-emerald-700">

                  {googleUser.email || 'Signed-in customer'}

                </p>

                <p className="mt-2 text-xs leading-5 text-emerald-700">

                  You can continue to delivery or choose another login method.

                </p>

              </div>

            )}

            {/* Login Method Tabs */}

            <div className="mb-5 grid grid-cols-2 gap-2 rounded-2xl bg-neutral-100 p-1">

              <button

                type="button"

                onClick={() => {

                  setLoginMethod('google')

                  setError('')

                }}

                className={`rounded-xl px-3 py-3 text-xs font-black transition ${

                  loginMethod === 'google'

                    ? 'bg-white text-neutral-950 shadow-sm'

                    : 'text-neutral-500'

                }`}

              >

                Google

              </button>

              <button

                type="button"

                onClick={() => {

                  setLoginMethod('mobile')

                  setError('')

                }}

                className={`rounded-xl px-3 py-3 text-xs font-black transition ${

                  loginMethod === 'mobile'

                    ? 'bg-white text-neutral-950 shadow-sm'

                    : 'text-neutral-500'

                }`}

              >

                Mobile + PIN

              </button>

            </div>

            {/* Google Login */}

            {loginMethod === 'google' ? (

              <button

                type="button"

                onClick={continueWithGoogle}

                disabled={googleLoading}

                className="flex w-full items-center justify-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-4 text-sm font-black text-neutral-800 shadow-sm transition hover:bg-neutral-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"

              >

                {googleLoading ? (

                  <span className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />

                ) : (

                  <span className="flex h-6 w-6 items-center justify-center rounded-full border border-neutral-200 bg-white text-sm font-black">

                    G

                  </span>

                )}

                {googleLoading

                  ? 'Connecting to Google...'

                  : googleUser

                    ? 'Continue to Delivery'

                    : 'Continue with Google'}

              </button>

            ) : (

              <form

                onSubmit={loginWithMobile}

                className="space-y-4"

              >

                {/* Store Detection */}

                {!storeCode && (

                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">

                    <p className="text-xs font-bold leading-5 text-amber-800">

                      Please select a delivery store first

                      to sign in with your mobile number.

                    </p>

                    <button

                      type="button"

                      onClick={() => router.push('/delivery')}

                      className="mt-3 text-xs font-black text-amber-900 underline"

                    >

                      Browse Delivery Stores

                    </button>

                  </div>

                )}

                {/* Mobile */}

                <div>

                  <label

                    htmlFor="mobile"

                    className="mb-2 block text-xs font-black text-neutral-700"

                  >

                    Mobile Number

                  </label>

                  <div className="flex overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50 focus-within:border-emerald-500">

                    <span className="flex items-center border-r border-neutral-200 px-4 text-sm font-black text-neutral-500">

                      +91

                    </span>

                    <input

                      id="mobile"

                      type="tel"

                      inputMode="numeric"

                      autoComplete="tel-national"

                      value={mobile}

                      onChange={(event) =>

                        setMobile(

                          event.target.value

                            .replace(/\D/g, '')

                            .slice(0, 10)

                        )

                      }

                      placeholder="10-digit mobile number"

                      maxLength={10}

                      required

                      className="min-w-0 flex-1 bg-transparent px-4 py-3.5 text-sm font-semibold outline-none"

                    />

                  </div>

                </div>

                {/* PIN */}

                <div>

                  <label

                    htmlFor="pin"

                    className="mb-2 block text-xs font-black text-neutral-700"

                  >

                    4-Digit PIN

                  </label>

                  <div className="flex overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50 focus-within:border-emerald-500">

                    <input

                      id="pin"

                      type={showPin ? 'text' : 'password'}

                      inputMode="numeric"

                      autoComplete="current-password"

                      value={pin}

                      onChange={(event) =>

                        setPin(

                          event.target.value

                            .replace(/\D/g, '')

                            .slice(0, 4)

                        )

                      }

                      placeholder="Enter PIN"

                      maxLength={4}

                      required

                      className="min-w-0 flex-1 bg-transparent px-4 py-3.5 text-sm font-semibold tracking-widest outline-none"

                    />

                    <button

                      type="button"

                      onClick={() => setShowPin(!showPin)}

                      className="px-4 text-xs font-black text-emerald-700"

                    >

                      {showPin ? 'Hide' : 'Show'}

                    </button>

                  </div>

                </div>

                {/* Login Button */}

                <button

                  type="submit"

                  disabled={mobileLoading || !storeCode}

                  className="w-full rounded-2xl bg-neutral-950 px-5 py-4 text-sm font-black text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"

                >

                  {mobileLoading

                    ? 'Signing In...'

                    : 'Sign In with Mobile'}

                </button>

                <button
                  type="button"
                  onClick={() => router.push(`/delivery/forgot-pin?${forgotPinQuery.toString()}`)}
                  className="w-full rounded-xl border border-neutral-200 bg-emerald-50 px-4 py-3 text-xs font-black text-emerald-800"
                >
                  Forgot PIN? Answer your security question
                </button>

                {/* Signup */}

                <button

                  type="button"

                  onClick={() =>

                    router.push(

                      `/delivery/signup?${signupQuery.toString()}`

                    )

                  }

                  className="w-full py-2 text-xs font-black text-emerald-700"

                >

                  New customer? Create an account

                </button>

              </form>

            )}

            {/* Error */}

            {error && (

              <div

                role="alert"

                className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold leading-5 text-red-700"

              >

                {error}

              </div>

            )}

            {/* Success */}

            {success && (

              <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-xs font-bold text-emerald-700">

                {success}

              </div>

            )}

            {/* Divider */}

            <div className="my-5 flex items-center gap-3">

              <div className="h-px flex-1 bg-neutral-200" />

              <span className="text-[9px] font-black uppercase tracking-[0.15em] text-neutral-400">

                Secure customer access

              </span>

              <div className="h-px flex-1 bg-neutral-200" />

            </div>

            {/* Features */}

            <div className="grid grid-cols-3 gap-2">

              {[

                ['📦', 'Orders'],

                ['📍', 'Delivery'],

                ['💬', 'Support'],

              ].map(([icon, label]) => (

                <div

                  key={label}

                  className="rounded-2xl bg-neutral-50 p-3 text-center"

                >

                  <div className="text-lg">{icon}</div>

                  <p className="mt-1 text-[9px] font-black text-neutral-600">

                    {label}

                  </p>

                </div>

              ))}

            </div>

          </div>

          <p className="mt-5 px-3 text-center text-[10px] font-medium leading-5 text-neutral-400">

            New to Digital Dine? Continue with Google

            or create a delivery customer account.

          </p>

        </section>

        <footer className="text-center text-[9px] font-semibold leading-4 text-neutral-400">

          Digital Dine Delivery · Secure Customer Access

        </footer>

      </div>

    </main>

  )

}

export default function DeliveryLoginPage() {

  return (

    <Suspense fallback={<DeliveryLoginLoading />}>

      <DeliveryLoginContent />

    </Suspense>

  )

}
