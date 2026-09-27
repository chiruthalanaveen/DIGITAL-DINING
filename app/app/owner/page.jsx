'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const OWNER_APP_CONTEXT_KEY =
  'digitaldining_owner_app_context'

const OWNER_GOOGLE_CONTEXT_KEY =
  'digitaldining_owner_google_context'

export default function OwnerMobileLoginPage() {
  const router = useRouter()

  const [restaurantId, setRestaurantId] = useState('')
  const [restaurantCode, setRestaurantCode] = useState('')
  const [contextReady, setContextReady] = useState(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [dob, setDob] = useState('')

  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [biometricLoading, setBiometricLoading] = useState(false)
  const [biometricAccountDetected, setBiometricAccountDetected] =
    useState(false)
  const [checkingSession, setCheckingSession] =
    useState(true)
  const [error, setError] = useState('')

  const isPasskeySupported = () => {
    return (
      typeof window !== 'undefined' &&
      window.isSecureContext &&
      typeof window.PublicKeyCredential !==
        'undefined'
    )
  }

  const getPasskeyErrorMessage = (error) => {
    const code =
      error?.code ||
      error?.name ||
      ''

    const message =
      error?.message ||
      ''

    const lowerMessage =
      String(message).toLowerCase()

    if (
      code ===
      'webauthn_credential_not_found'
    ) {
      return (
        'No biometric/passkey was found for this Owner account on this device. ' +
        'Turn Biometric OFF and use password login, or use a device where the Owner passkey is registered.'
      )
    }

    if (
      code ===
        'webauthn_verification_failed' ||
      lowerMessage.includes(
        'credential verification failed'
      )
    ) {
      return (
        'Biometric verification failed. Please try again or turn Biometric OFF.'
      )
    }

    if (
      code ===
        'webauthn_challenge_expired' ||
      lowerMessage.includes(
        'challenge expired'
      )
    ) {
      return (
        'The biometric security request expired. Please try again.'
      )
    }

    if (
      code ===
        'webauthn_challenge_not_found' ||
      lowerMessage.includes(
        'challenge not found'
      )
    ) {
      return (
        'The biometric security request could not be found. Please try again.'
      )
    }

    if (
      code === 'passkey_disabled' ||
      lowerMessage.includes(
        'passkeys are disabled'
      )
    ) {
      return (
        'Biometric login is currently disabled in the authentication system.'
      )
    }

    if (
      lowerMessage.includes('cancel') ||
      lowerMessage.includes('abort') ||
      lowerMessage.includes(
        'notallowed'
      )
    ) {
      return (
        'Biometric verification was cancelled. Please try again or turn Biometric OFF.'
      )
    }

    return (
      message ||
      'Biometric verification could not be completed.'
    )
  }

  useEffect(() => {
    let active = true

    const start = async () => {
      try {
        const params = new URLSearchParams(
          window.location.search
        )

        const googleError = String(
          params.get('googleError') || ''
        ).trim()

        if (googleError && active) {
          setError(googleError)
        }

        const id = String(
          params.get('restaurantId') || ''
        ).trim()

        const code = String(
          params.get('restaurantCode') || ''
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
          sessionStorage.setItem(
            OWNER_APP_CONTEXT_KEY,
            JSON.stringify({
              restaurantId: id,
              restaurantCode: code,
            })
          )
        } catch (storageError) {
          console.warn(
            '[OWNER APP LOGIN] Could not save app context:',
            storageError
          )
        }

        // If an Owner session already exists — including a session
        // returned from Google OAuth — verify that it owns the exact
        // restaurant selected from /app before opening the mobile portal.
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser()

        if (!userError && user) {
          const {
            data: ownedRestaurant,
            error: ownershipError,
          } = await supabase
            .from('restaurants')
            .select('id, owner_id, restaurant_code')
            .eq('id', id)
            .eq('owner_id', user.id)
            .maybeSingle()

          if (
            !ownershipError &&
            ownedRestaurant?.id &&
            active
          ) {
            router.replace(
              `/app/owner/${encodeURIComponent(id)}`
            )
            router.refresh()
            return
          }

          // A different Google/Owner account is currently authenticated.
          // Clear it so the selected restaurant cannot be opened by mistake.
          try {
            await supabase.auth.signOut()
          } catch (signOutError) {
            console.error(
              '[OWNER APP LOGIN] Could not clear mismatched session:',
              signOutError
            )
          }

          if (active) {
            const provider = String(
              user?.app_metadata?.provider || ''
            ).toLowerCase()

            setError(
              provider === 'google'
                ? 'This Google account is not the Owner account for the selected restaurant. Please choose the correct Google account.'
                : 'The current Owner session does not belong to the selected restaurant. Please sign in with the correct Owner account.'
            )
          }
        }
      } catch (startError) {
        console.error(
          '[OWNER APP LOGIN] Start error:',
          startError
        )

        if (active) {
          setError(
            startError?.message ||
              'Unable to prepare Owner login.'
          )
        }
      } finally {
        if (active) {
          setCheckingSession(false)
        }
      }
    }

    start()

    return () => {
      active = false
    }
  }, [router])

  const handleGoogleLogin = async () => {
    if (
      loading ||
      googleLoading ||
      biometricLoading ||
      checkingSession
    ) {
      return
    }

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
        restaurantId: String(
          restaurantId
        ),
        restaurantCode: String(
          restaurantCode || ''
        ),
        createdAt: Date.now(),
      }

      /*
       * IMPORTANT:
       * Keep the selected mobile restaurant outside the OAuth URL.
       *
       * The previous version put restaurantId/query parameters
       * directly inside redirectTo. If that full redirect URL is
       * not present in Supabase's Redirect URL allow-list,
       * Supabase falls back to the configured Site URL — which is
       * why Google was returning to the website landing page.
       *
       * /auth/google-login is already the website's working Google
       * callback. We reuse that exact stable callback and preserve
       * the mobile Owner context in browser storage.
       */
      try {
        sessionStorage.setItem(
          OWNER_APP_CONTEXT_KEY,
          JSON.stringify({
            restaurantId,
            restaurantCode,
          })
        )

        sessionStorage.setItem(
          OWNER_GOOGLE_CONTEXT_KEY,
          JSON.stringify(googleContext)
        )

        localStorage.setItem(
          OWNER_GOOGLE_CONTEXT_KEY,
          JSON.stringify(googleContext)
        )
      } catch (storageError) {
        console.warn(
          '[OWNER APP GOOGLE] Could not save OAuth context:',
          storageError
        )
      }

      const redirectTo =
        `${window.location.origin}/auth/google-login`

      const { error: oauthError } =
        await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo,
            queryParams: {
              access_type: 'offline',
              prompt: 'select_account',
            },
          },
        })

      if (oauthError) {
        throw oauthError
      }
    } catch (googleError) {
      console.error(
        '[OWNER APP GOOGLE] Login error:',
        googleError
      )

      try {
        sessionStorage.removeItem(
          OWNER_GOOGLE_CONTEXT_KEY
        )
        localStorage.removeItem(
          OWNER_GOOGLE_CONTEXT_KEY
        )
      } catch {}

      setError(
        googleError?.message ||
          'Google sign in could not be started.'
      )

      setGoogleLoading(false)
    }
  }

  const handleLogin = async (event) => {
    event.preventDefault()

    if (
      loading ||
      googleLoading ||
      biometricLoading
    ) {
      return
    }

    const cleanEmail =
      email.trim().toLowerCase()

    const cleanPassword = password
    const cleanDob = dob.trim()

    if (!restaurantId) {
      setError(
        'Restaurant information is missing. Please return to the restaurant code page.'
      )
      return
    }

    if (
      !cleanEmail ||
      !cleanPassword ||
      !cleanDob
    ) {
      setError(
        'Please enter Email, Password and Date of Birth.'
      )
      return
    }

    setLoading(true)
    setError('')
    setBiometricAccountDetected(false)

    let browserSessionCreated = false

    try {
      const response =
        await fetch('/api/login', {
          method: 'POST',
          headers: {
            'Content-Type':
              'application/json',
          },
          body: JSON.stringify({
            email: cleanEmail,
            password: cleanPassword,
            dob: cleanDob,
          }),
        })

      const result =
        await response
          .json()
          .catch(() => ({}))

      if (
        !response.ok ||
        !result?.success
      ) {
        throw new Error(
          result?.message ||
            'Invalid Owner login details.'
        )
      }

      const loggedRestaurant =
        result?.restaurant

      if (!loggedRestaurant?.id) {
        throw new Error(
          'Restaurant profile was not returned.'
        )
      }

      if (
        String(loggedRestaurant.id) !==
        String(restaurantId)
      ) {
        throw new Error(
          'This Owner account does not belong to the restaurant code selected in the app.'
        )
      }

      /*
       * IMPORTANT:
       * The server checks Supabase Auth itself for registered
       * passkeys after Email + Password + DOB are verified.
       *
       * No local toggle decides this.
       */
      const biometricStatusAvailable =
        result?.biometric
          ?.status_available !== false

      const biometricRegistered =
        result?.biometric
          ?.registered === true

      if (!biometricStatusAvailable) {
        throw new Error(
          'Biometric account status could not be checked. Update @supabase/supabase-js to v2.105.0 or newer on the server and redeploy.'
        )
      }

      /*
       * NO REGISTERED PASSKEY:
       * Standard Owner login only. Do not show or request biometric.
       */
      if (!biometricRegistered) {
        if (
          !result?.session?.access_token ||
          !result?.session
            ?.refresh_token
        ) {
          throw new Error(
            'Login succeeded, but the secure Owner session was not returned.'
          )
        }

        const {
          error: sessionError,
        } =
          await supabase.auth
            .setSession({
              access_token:
                result.session
                  .access_token,
              refresh_token:
                result.session
                  .refresh_token,
            })

        if (sessionError) {
          throw sessionError
        }

        browserSessionCreated = true

        try {
          sessionStorage.setItem(
            OWNER_APP_CONTEXT_KEY,
            JSON.stringify({
              restaurantId,
              restaurantCode,
            })
          )
        } catch {}

        router.replace(
          `/app/owner/${encodeURIComponent(
            restaurantId
          )}`
        )
        router.refresh()
        return
      }

      /*
       * REGISTERED PASSKEY:
       * This account enrolled biometric/passkey in Supabase Auth,
       * so now — and only now — ask for biometric verification.
       */
      setBiometricAccountDetected(true)

      if (!isPasskeySupported()) {
        throw new Error(
          'This Owner account has biometric/passkey login enabled, but this device/browser cannot use passkeys on the current page.'
        )
      }

      if (
        typeof supabase?.auth
          ?.signInWithPasskey !==
        'function'
      ) {
        throw new Error(
          'This Owner account has biometric/passkey login enabled, but the installed Supabase client does not support passkey sign-in. Upgrade @supabase/supabase-js to v2.105.0 or newer.'
        )
      }

      setLoading(false)
      setBiometricLoading(true)

      const {
        data: passkeyAuthData,
        error: passkeyError,
      } =
        await supabase.auth
          .signInWithPasskey()

      if (
        passkeyError ||
        !passkeyAuthData?.user
      ) {
        throw new Error(
          getPasskeyErrorMessage(
            passkeyError
          )
        )
      }

      const biometricUserId =
        String(
          passkeyAuthData.user.id || ''
        )

      const restaurantOwnerId =
        String(
          loggedRestaurant.owner_id ||
            ''
        )

      if (
        !restaurantOwnerId ||
        biometricUserId !==
          restaurantOwnerId
      ) {
        await supabase.auth.signOut()

        throw new Error(
          'The biometric/passkey account does not match the Owner of the selected restaurant.'
        )
      }

      const {
        data:
          biometricRestaurant,
        error:
          biometricOwnershipError,
      } = await supabase
        .from('restaurants')
        .select(
          'id, owner_id, restaurant_code'
        )
        .eq(
          'id',
          restaurantId
        )
        .eq(
          'owner_id',
          biometricUserId
        )
        .maybeSingle()

      if (
        biometricOwnershipError ||
        !biometricRestaurant?.id
      ) {
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
              restaurantCode ||
              biometricRestaurant
                .restaurant_code ||
              '',
          })
        )
      } catch {}

      router.replace(
        `/app/owner/${encodeURIComponent(
          restaurantId
        )}`
      )
      router.refresh()
    } catch (loginError) {
      console.error(
        '[OWNER APP LOGIN] Login error:',
        loginError
      )

      if (browserSessionCreated) {
        try {
          await supabase.auth.signOut()
        } catch {}
      }

      setError(
        loginError?.message ||
          'Owner login failed.'
      )
    } finally {
      setBiometricLoading(false)
      setLoading(false)
    }
  }

  const isBusy =
    loading ||
    googleLoading ||
    biometricLoading ||
    checkingSession

  const backToRestaurantRoles = () => {
    try {
      sessionStorage.removeItem(
        OWNER_GOOGLE_CONTEXT_KEY
      )
      localStorage.removeItem(
        OWNER_GOOGLE_CONTEXT_KEY
      )
    } catch {}

    router.replace(
      restaurantCode
        ? `/app?code=${encodeURIComponent(
            restaurantCode
          )}`
        : '/app'
    )
  }

  if (!contextReady || checkingSession) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-neutral-950 px-5 text-white">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-neutral-800 border-t-orange-500" />
          <p className="mt-4 text-[10px] font-black uppercase tracking-[0.18em] text-neutral-500">
            Opening Owner Login
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-[100dvh] w-full overflow-x-hidden bg-neutral-950 text-white">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="flex items-center justify-between gap-3 py-2">
          <button
            type="button"
            onClick={backToRestaurantRoles}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-900 text-neutral-300"
            aria-label="Back to restaurant roles"
          >
            ←
          </button>

          <div className="text-right">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-orange-400">
              Digital Dine
            </p>
            {restaurantCode && (
              <p className="mt-1 text-[9px] font-bold text-neutral-600">
                Restaurant Code {restaurantCode}
              </p>
            )}
          </div>
        </header>

        <div className="flex flex-1 items-center py-6">
          <section className="w-full overflow-hidden rounded-[32px] border border-neutral-800 bg-neutral-900 shadow-2xl">
            <div className="border-b border-neutral-800 bg-gradient-to-br from-orange-500/15 via-neutral-900 to-neutral-900 p-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500 text-2xl shadow-lg shadow-orange-500/20">
                👑
              </div>

              <p className="mt-5 text-[10px] font-black uppercase tracking-[0.18em] text-orange-400">
                Owner Mobile Access
              </p>

              <h1 className="mt-2 text-2xl font-black">
                Owner Sign In
              </h1>

              <p className="mt-2 max-w-sm text-xs leading-6 text-neutral-400">
                Sign in to open the mobile Owner dashboard for the restaurant you selected.
              </p>
            </div>

            <form
              onSubmit={handleLogin}
              className="space-y-4 p-5"
            >
              <div className="rounded-[22px] border border-neutral-800 bg-neutral-950 p-4">
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-orange-500/10 text-xl">
                    🔐
                  </div>

                  <div>
                    <p className="text-sm font-black text-white">
                      Automatic biometric protection
                    </p>

                    <p className="mt-1 text-[10px] leading-5 text-neutral-500">
                      Biometric is requested only when this Owner account actually has a passkey registered in Supabase Auth. Owners who did not complete biometric registration will use Email + Password + DOB normally.
                    </p>
                  </div>
                </div>
              </div>

              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={
                  googleLoading ||
                  loading ||
                  biometricLoading ||
                  !restaurantId
                }
                className="flex w-full items-center justify-center gap-3 rounded-2xl border border-neutral-700 bg-white px-4 py-4 text-sm font-black text-neutral-900 shadow-lg shadow-black/10 transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {googleLoading ? (
                  <>
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
                    <span>Opening Google...</span>
                  </>
                ) : (
                  <>
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        fill="#4285F4"
                        d="M21.6 12.23c0-.71-.06-1.4-.18-2.06H12v3.9h5.38a4.6 4.6 0 0 1-2 3.02v2.52h3.24c1.9-1.75 2.98-4.33 2.98-7.38Z"
                      />
                      <path
                        fill="#34A853"
                        d="M12 22c2.7 0 4.97-.9 6.62-2.39l-3.24-2.52c-.9.6-2.05.96-3.38.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.6A10 10 0 0 0 12 22Z"
                      />
                      <path
                        fill="#FBBC05"
                        d="M6.39 13.92A6.03 6.03 0 0 1 6.07 12c0-.67.12-1.32.32-1.92v-2.6H3.04A10 10 0 0 0 2 12c0 1.61.38 3.13 1.04 4.52l3.35-2.6Z"
                      />
                      <path
                        fill="#EA4335"
                        d="M12 5.95c1.47 0 2.78.5 3.82 1.49l2.86-2.86A9.6 9.6 0 0 0 12 2 10 10 0 0 0 3.04 7.48l3.35 2.6C7.18 7.71 9.39 5.95 12 5.95Z"
                      />
                    </svg>

                    <span>Continue with Google</span>
                  </>
                )}
              </button>

              <p className="px-2 text-center text-[9px] font-semibold leading-4 text-neutral-500">
                Use the Google account connected to this restaurant Owner account.
              </p>

              <div className="flex items-center gap-3 py-1">
                <div className="h-px flex-1 bg-neutral-800" />
                <span className="text-[8px] font-black uppercase tracking-[0.18em] text-neutral-600">
                  or use password
                </span>
                <div className="h-px flex-1 bg-neutral-800" />
              </div>

              <div>
                <label className="mb-2 block text-[9px] font-black uppercase tracking-wider text-neutral-500">
                  Owner Email
                </label>

                <input
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
                  className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-4 text-base text-white outline-none transition focus:border-orange-500 disabled:opacity-60"
                />
              </div>

              <div>
                <label className="mb-2 block text-[9px] font-black uppercase tracking-wider text-neutral-500">
                  Password
                </label>

                <input
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value)
                    setError('')
                  }}
                  autoComplete="current-password"
                  placeholder="Enter Owner password"
                  disabled={isBusy}
                  className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-4 text-base text-white outline-none transition focus:border-orange-500 disabled:opacity-60"
                />
              </div>

              <div>
                <label className="mb-2 block text-[9px] font-black uppercase tracking-wider text-neutral-500">
                  Date of Birth
                </label>

                <input
                  type="date"
                  value={dob}
                  onChange={(event) => {
                    setDob(event.target.value)
                    setError('')
                  }}
                  disabled={isBusy}
                  className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-4 text-base text-white outline-none transition focus:border-orange-500 disabled:opacity-60"
                />
              </div>

              {biometricAccountDetected && biometricLoading && (
                <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3">
                  <p className="text-[10px] font-black text-emerald-300">
                    Registered biometric account detected 🔐
                  </p>
                  <p className="mt-1 text-[9px] leading-4 text-neutral-400">
                    Complete the passkey / fingerprint / Face ID / device PIN prompt to continue.
                  </p>
                </div>
              )}

              {error && (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[10px] font-bold leading-5 text-red-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isBusy || !restaurantId}
                className="w-full rounded-2xl bg-orange-500 py-4 text-sm font-black text-white shadow-lg shadow-orange-500/20 transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {biometricLoading
                  ? 'Verify Biometric / Passkey...'
                  : loading
                    ? 'Checking Owner Account...'
                    : 'Open Owner Mobile Dashboard'}
              </button>

              <button
                type="button"
                onClick={backToRestaurantRoles}
                disabled={isBusy}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 py-3 text-[10px] font-black text-neutral-400"
              >
                ← Back to Owner / Manager / Waiter / Kitchen
              </button>
            </form>
          </section>
        </div>

        <p className="px-4 text-center text-[9px] leading-5 text-neutral-600">
          Google returns through the secure Google callback and then opens this selected mobile Owner restaurant.
          Password login requests biometric automatically only when Supabase confirms that this Owner has a registered passkey.
        </p>
      </div>
    </main>
  )
}
