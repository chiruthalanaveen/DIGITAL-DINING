'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useMobileViewportLock } from '@/lib/useMobileViewportLock'

const OWNER_APP_CONTEXT_KEY = 'digitaldining_owner_app_context'
const OWNER_GOOGLE_CONTEXT_KEY = 'digitaldining_owner_google_context'

function OwnerMobileLoginContent() {
  const router = useRouter()
  useMobileViewportLock()

  const [restaurantId, setRestaurantId] = useState('')
  const [restaurantCode, setRestaurantCode] = useState('')
  const [contextReady, setContextReady] = useState(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [dob, setDob] = useState('')

  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [biometricLoading, setBiometricLoading] = useState(false)
  const [biometricAccountDetected, setBiometricAccountDetected] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [error, setError] = useState('')

  const isPasskeySupported = () => {
    return (
      typeof window !== 'undefined' &&
      window.isSecureContext &&
      typeof window.PublicKeyCredential !== 'undefined'
    )
  }

  const getPasskeyErrorMessage = (error) => {
    const code = error?.code || error?.name || ''
    const message = error?.message || ''
    const lowerMessage = String(message).toLowerCase()

    if (code === 'webauthn_credential_not_found') {
      return (
        'No biometric/passkey was found for this Owner account on this device. ' +
        'Turn Biometric OFF and use password login, or use a device where the Owner passkey is registered.'
      )
    }
    if (
      code === 'webauthn_verification_failed' ||
      lowerMessage.includes('credential verification failed')
    ) {
      return 'Biometric verification failed. Please try again or turn Biometric OFF.'
    }
    if (
      code === 'webauthn_challenge_expired' ||
      lowerMessage.includes('challenge expired')
    ) {
      return 'The biometric security request expired. Please try again.'
    }
    if (
      code === 'webauthn_challenge_not_found' ||
      lowerMessage.includes('challenge not found')
    ) {
      return 'The biometric security request could not be found. Please try again.'
    }
    if (
      code === 'passkey_disabled' ||
      lowerMessage.includes('passkeys are disabled')
    ) {
      return 'Biometric login is currently disabled in the authentication system.'
    }
    if (
      lowerMessage.includes('cancel') ||
      lowerMessage.includes('abort') ||
      lowerMessage.includes('notallowed')
    ) {
      return 'Biometric verification was cancelled. Please try again or turn Biometric OFF.'
    }
    return message || 'Biometric verification could not be completed.'
  }

  useEffect(() => {
    let active = true

    const start = async () => {
      try {
        const params = new URLSearchParams(window.location.search)
        const googleError = String(params.get('googleError') || '').trim()

        if (googleError && active) {
          setError(googleError)
        }

        let savedContext = {}
        try {
          const savedRaw =
            sessionStorage.getItem(OWNER_APP_CONTEXT_KEY) ||
            localStorage.getItem(OWNER_APP_CONTEXT_KEY) ||
            ''
          savedContext = savedRaw ? JSON.parse(savedRaw) : {}
        } catch (storageError) {
          console.warn(
            '[OWNER APP LOGIN] Could not read saved restaurant context:',
            storageError
          )
        }

        const id = String(
          params.get('restaurantId') || savedContext?.restaurantId || ''
        ).trim()

        const code = String(
          params.get('restaurantCode') || savedContext?.restaurantCode || ''
        )
          .replace(/\D/g, '')
          .slice(0, 5)

        if (!active) return

        setRestaurantId(id)
        setRestaurantCode(code)
        setContextReady(true)

        if (!id) {
          setCheckingSession(false)
          setError(
            'Restaurant information is missing. Please return to the restaurant code page.'
          )
          return
        }

        try {
          const ownerContext = { restaurantId: id, restaurantCode: code }
          sessionStorage.setItem(OWNER_APP_CONTEXT_KEY, JSON.stringify(ownerContext))
          localStorage.setItem(OWNER_APP_CONTEXT_KEY, JSON.stringify(ownerContext))
        } catch (storageError) {
          console.warn('[OWNER APP LOGIN] Could not save app context:', storageError)
        }

        // If an Owner session already exists (including one returned from
        // Google OAuth), verify it owns the exact restaurant selected in /app.
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser()

        if (!userError && user) {
          const { data: ownedRestaurant, error: ownershipError } = await supabase
            .from('restaurants')
            .select('id, owner_id, restaurant_code')
            .eq('id', id)
            .eq('owner_id', user.id)
            .maybeSingle()

          if (!ownershipError && ownedRestaurant?.id && active) {
            router.replace(`/app/owner/${encodeURIComponent(id)}`)
            router.refresh()
            return
          }

          // A different account is signed in. Clear it so the selected
          // restaurant cannot be opened by mistake.
          try {
            await supabase.auth.signOut()
          } catch (signOutError) {
            console.error(
              '[OWNER APP LOGIN] Could not clear mismatched session:',
              signOutError
            )
          }

          if (active) {
            const provider = String(user?.app_metadata?.provider || '').toLowerCase()
            setError(
              provider === 'google'
                ? 'This Google account is not the Owner account for the selected restaurant. Please choose the correct Google account.'
                : 'The current Owner session does not belong to the selected restaurant. Please sign in with the correct Owner account.'
            )
          }
        }
      } catch (startError) {
        console.error('[OWNER APP LOGIN] Start error:', startError)
        if (active) {
          setError(startError?.message || 'Unable to prepare Owner login.')
        }
      } finally {
        if (active) setCheckingSession(false)
      }
    }

    start()
    return () => {
      active = false
    }
  }, [router])

  const handleGoogleLogin = async () => {
    if (loading || googleLoading || biometricLoading || checkingSession) return

    if (!restaurantId) {
      setError(
        'Restaurant information is missing. Please return to the restaurant code page.'
      )
      return
    }

    setGoogleLoading(true)
    setError('')

    try {
      const googleContext = {
        source: 'owner-app',
        restaurantId: String(restaurantId),
        restaurantCode: String(restaurantCode || ''),
        createdAt: Date.now(),
      }

      // The selected restaurant stays in browser storage, not in the OAuth
      // URL. /auth/google-login is the stable Google callback.
      try {
        sessionStorage.setItem(
          OWNER_APP_CONTEXT_KEY,
          JSON.stringify({ restaurantId, restaurantCode })
        )
        sessionStorage.setItem(OWNER_GOOGLE_CONTEXT_KEY, JSON.stringify(googleContext))
        localStorage.setItem(OWNER_GOOGLE_CONTEXT_KEY, JSON.stringify(googleContext))
      } catch (storageError) {
        console.warn('[OWNER APP GOOGLE] Could not save OAuth context:', storageError)
      }

      const redirectTo = `${window.location.origin}/auth/google-login`

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      })

      if (oauthError) throw oauthError
    } catch (googleError) {
      console.error('[OWNER APP GOOGLE] Login error:', googleError)

      try {
        sessionStorage.removeItem(OWNER_GOOGLE_CONTEXT_KEY)
        localStorage.removeItem(OWNER_GOOGLE_CONTEXT_KEY)
      } catch {}

      setError(googleError?.message || 'Google sign in could not be started.')
      setGoogleLoading(false)
    }
  }

  const handleLogin = async (event) => {
    event.preventDefault()

    if (loading || googleLoading || biometricLoading) return

    const cleanEmail = email.trim().toLowerCase()
    const cleanPassword = password
    const cleanDob = dob.trim()

    if (!restaurantId) {
      setError(
        'Restaurant information is missing. Please return to the restaurant code page.'
      )
      return
    }

    if (!cleanEmail || !cleanPassword || !cleanDob) {
      setError('Please enter Email, Password and Date of Birth.')
      return
    }

    setLoading(true)
    setError('')
    setBiometricAccountDetected(false)

    let browserSessionCreated = false

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: cleanEmail,
          password: cleanPassword,
          dob: cleanDob,
        }),
      })

      const result = await response.json().catch(() => ({}))

      if (!response.ok || !result?.success) {
        throw new Error(result?.message || 'Invalid Owner login details.')
      }

      const loggedRestaurant = result?.restaurant

      if (!loggedRestaurant?.id) {
        throw new Error('Restaurant profile was not returned.')
      }

      if (String(loggedRestaurant.id) !== String(restaurantId)) {
        throw new Error(
          'This Owner account does not belong to the restaurant code selected in the app.'
        )
      }

      // The server checks Supabase Auth for registered passkeys after
      // Email + Password + DOB are verified. No local toggle decides this.
      const biometricStatusAvailable =
        result?.biometric?.status_available !== false
      const biometricRegistered = result?.biometric?.registered === true

      if (!biometricStatusAvailable) {
        throw new Error(
          'Biometric account status could not be checked. Update @supabase/supabase-js to v2.105.0 or newer on the server and redeploy.'
        )
      }

      // No registered passkey: standard Owner login only.
      if (!biometricRegistered) {
        if (!result?.session?.access_token || !result?.session?.refresh_token) {
          throw new Error(
            'Login succeeded, but the secure Owner session was not returned.'
          )
        }

        const { error: sessionError } = await supabase.auth.setSession({
          access_token: result.session.access_token,
          refresh_token: result.session.refresh_token,
        })

        if (sessionError) throw sessionError

        browserSessionCreated = true

        try {
          sessionStorage.setItem(
            OWNER_APP_CONTEXT_KEY,
            JSON.stringify({ restaurantId, restaurantCode })
          )
        } catch {}

        router.replace(`/app/owner/${encodeURIComponent(restaurantId)}`)
        router.refresh()
        return
      }

      // Registered passkey: request biometric verification now.
      setBiometricAccountDetected(true)

      if (!isPasskeySupported()) {
        throw new Error(
          'This Owner account has biometric/passkey login enabled, but this device/browser cannot use passkeys on the current page.'
        )
      }

      if (typeof supabase?.auth?.signInWithPasskey !== 'function') {
        throw new Error(
          'This Owner account has biometric/passkey login enabled, but the installed Supabase client does not support passkey sign-in. Upgrade @supabase/supabase-js to v2.105.0 or newer.'
        )
      }

      setLoading(false)
      setBiometricLoading(true)

      const { data: passkeyAuthData, error: passkeyError } =
        await supabase.auth.signInWithPasskey()

      if (passkeyError || !passkeyAuthData?.user) {
        throw new Error(getPasskeyErrorMessage(passkeyError))
      }

      const biometricUserId = String(passkeyAuthData.user.id || '')
      const restaurantOwnerId = String(loggedRestaurant.owner_id || '')

      if (!restaurantOwnerId || biometricUserId !== restaurantOwnerId) {
        await supabase.auth.signOut()
        throw new Error(
          'The biometric/passkey account does not match the Owner of the selected restaurant.'
        )
      }

      const { data: biometricRestaurant, error: biometricOwnershipError } =
        await supabase
          .from('restaurants')
          .select('id, owner_id, restaurant_code')
          .eq('id', restaurantId)
          .eq('owner_id', biometricUserId)
          .maybeSingle()

      if (biometricOwnershipError || !biometricRestaurant?.id) {
        await supabase.auth.signOut()
        throw new Error(
          'Biometric verification succeeded, but this Owner does not match the selected restaurant.'
        )
      }

      try {
        sessionStorage.setItem(
          OWNER_APP_CONTEXT_KEY,
          JSON.stringify({
            restaurantId,
            restaurantCode:
              restaurantCode || biometricRestaurant.restaurant_code || '',
          })
        )
      } catch {}

      router.replace(`/app/owner/${encodeURIComponent(restaurantId)}`)
      router.refresh()
    } catch (loginError) {
      console.error('[OWNER APP LOGIN] Login error:', loginError)

      if (browserSessionCreated) {
        try {
          await supabase.auth.signOut()
        } catch {}
      }

      setError(loginError?.message || 'Owner login failed.')
    } finally {
      setBiometricLoading(false)
      setLoading(false)
    }
  }

  const isBusy = loading || googleLoading || biometricLoading || checkingSession

  const backToRestaurantRoles = () => {
    try {
      sessionStorage.removeItem(OWNER_GOOGLE_CONTEXT_KEY)
      localStorage.removeItem(OWNER_GOOGLE_CONTEXT_KEY)
    } catch {}

    const destination = restaurantCode
      ? `/app?code=${encodeURIComponent(restaurantCode)}`
      : '/app'

    if (typeof window !== 'undefined') {
      window.location.assign(destination)
      return
    }
    router.replace(destination)
  }

  if (!contextReady || checkingSession) {
    return (
      <main className="flex min-h-[100dvh] w-full items-center justify-center bg-[#f6f7f9] px-4">
        <div className="flex flex-col items-center gap-4">
          <span className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-600" />
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
            Opening Owner Login
          </p>
        </div>
      </main>
    )
  }

  const inputClass =
    'h-12 w-full rounded-xl border border-slate-200 bg-white px-4 text-base text-slate-900 placeholder:text-slate-400 outline-none transition focus:border-emerald-500 focus:ring-4 focus:ring-emerald-50 disabled:bg-slate-50 disabled:opacity-60 sm:text-sm'

  const labelClass = 'mb-1.5 block text-xs font-bold text-slate-700'

  return (
    <main className="min-h-[100dvh] w-full overflow-x-hidden bg-[#f6f7f9] text-slate-900">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-md flex-col px-5 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        {/* Top bar */}
        <header className="flex items-center justify-between gap-3 py-2">
          <button
            type="button"
            onClick={backToRestaurantRoles}
            aria-label="Back to restaurant roles"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 transition active:scale-95"
          >
            ←
          </button>

          <div className="text-right">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-emerald-600">
              Digital Dine
            </p>
            {restaurantCode && (
              <p className="mt-0.5 font-mono text-[11px] font-semibold text-slate-400">
                Code {restaurantCode}
              </p>
            )}
          </div>
        </header>

        {/* Brand block */}
        <div className="mt-6 flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-900 text-2xl text-white shadow-lg shadow-slate-900/20">
            👑
          </div>
          <p className="mt-5 text-[11px] font-bold uppercase tracking-[0.18em] text-slate-400">
            Owner mobile access
          </p>
          <h1 className="mt-1.5 text-2xl font-black tracking-tight text-slate-950">
            Welcome back
          </h1>
          <p className="mt-2 max-w-xs text-sm leading-6 text-slate-500">
            Sign in to open the Owner dashboard for your selected restaurant.
          </p>
        </div>

        {/* Card */}
        <section className="mt-7 rounded-3xl bg-white p-5 shadow-sm ring-1 ring-slate-200/70 sm:p-6">
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isBusy || !restaurantId}
            className="flex h-12 w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white text-sm font-bold text-slate-800 shadow-sm transition hover:bg-slate-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
          >
            {googleLoading ? (
              <>
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-300 border-t-slate-800" />
                <span>Opening Google…</span>
              </>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  <path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.52h3.24c1.9-1.75 2.98-4.33 2.98-7.38Z" />
                  <path fill="#34A853" d="M12 22c2.7 0 4.97-.9 6.62-2.39l-3.24-2.52c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.6A10 10 0 0 0 12 22Z" />
                  <path fill="#FBBC05" d="M6.39 13.92A6.03 6.03 0 0 1 6.07 12c0-.67.12-1.32.32-1.92v-2.6H3.04A10 10 0 0 0 2 12c0 1.61.38 3.13 1.04 4.52l3.35-2.6Z" />
                  <path fill="#EA4335" d="M12 5.95c1.47 0 2.78.5 3.82 1.49l2.86-2.86A9.6 9.6 0 0 0 12 2 10 10 0 0 0 3.04 7.48l3.35 2.6C7.18 7.71 9.39 5.95 12 5.95Z" />
                </svg>
                <span>Continue with Google</span>
              </>
            )}
          </button>

          <p className="mt-2.5 text-center text-[11px] leading-4 text-slate-400">
            Use the Google account connected to this restaurant.
          </p>

          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-slate-200" />
            <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-slate-400">
              or with password
            </span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          <form onSubmit={handleLogin} className="space-y-4">
            <div>
              <label htmlFor="owner-email" className={labelClass}>
                Owner email
              </label>
              <input
                id="owner-email"
                type="email"
                value={email}
                onChange={(event) => {
                  setEmail(event.target.value)
                  setError('')
                }}
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="email"
                placeholder="owner@restaurant.com"
                disabled={isBusy}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="owner-password" className={labelClass}>
                Password
              </label>
              <input
                id="owner-password"
                type="password"
                value={password}
                onChange={(event) => {
                  setPassword(event.target.value)
                  setError('')
                }}
                autoComplete="current-password"
                placeholder="Enter your password"
                disabled={isBusy}
                className={inputClass}
              />
            </div>

            <div>
              <label htmlFor="owner-dob" className={labelClass}>
                Date of birth
              </label>
              <input
                id="owner-dob"
                type="date"
                value={dob}
                onChange={(event) => {
                  setDob(event.target.value)
                  setError('')
                }}
                disabled={isBusy}
                className={inputClass}
              />
            </div>

            {biometricAccountDetected && biometricLoading && (
              <div className="flex items-start gap-3 rounded-xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-200">
                <span className="mt-0.5 text-base" aria-hidden="true">🔐</span>
                <div>
                  <p className="text-xs font-bold text-emerald-800">
                    Biometric verification required
                  </p>
                  <p className="mt-0.5 text-[11px] leading-4 text-emerald-700">
                    Complete the fingerprint, Face ID or device PIN prompt to continue.
                  </p>
                </div>
              </div>
            )}

            {error && (
              <div
                role="alert"
                className="rounded-xl bg-rose-50 px-4 py-3 text-xs font-semibold leading-5 text-rose-700 ring-1 ring-rose-200"
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={isBusy || !restaurantId}
              className="h-12 w-full rounded-xl bg-emerald-600 text-sm font-black text-white shadow-[0_12px_28px_rgba(5,150,105,0.25)] transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {biometricLoading
                ? 'Verifying biometric…'
                : loading
                  ? 'Checking account…'
                  : 'Open Owner dashboard'}
            </button>
          </form>
        </section>

        <button
          type="button"
          onClick={backToRestaurantRoles}
          disabled={isBusy}
          className="mt-4 h-11 w-full rounded-xl text-xs font-bold text-slate-500 transition hover:text-slate-800 disabled:opacity-50"
        >
          ← Back to Owner, Manager, Waiter and Kitchen
        </button>

        <p className="mt-auto pt-6 text-center text-[11px] leading-5 text-slate-400">
          Biometric is requested only when this Owner account has a registered passkey.
        </p>
      </div>
    </main>
  )
}

function OwnerLoginFallback() {
  return (
    <main className="flex min-h-[100dvh] w-full items-center justify-center bg-[#f6f7f9] px-4">
      <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
        Preparing Owner login…
      </p>
    </main>
  )
}

export default function OwnerMobileLoginPage() {
  return (
    <Suspense fallback={<OwnerLoginFallback />}>
      <OwnerMobileLoginContent />
    </Suspense>
  )
}