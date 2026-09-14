'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function RestaurantLogin() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [dob, setDob] = useState('')

  const [loading, setLoading] = useState(false)
  const [biometricLoading, setBiometricLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  const [biometricEnabled, setBiometricEnabled] = useState(false)

  useEffect(() => {
    try {
      const savedPreference = localStorage.getItem(
        'digitaldining_biometric_enabled'
      )

      setBiometricEnabled(savedPreference === 'true')
    } catch (error) {
      console.error('Could not read biometric preference:', error)
      setBiometricEnabled(false)
    }
  }, [])

  const toggleBiometric = () => {
    if (loading || biometricLoading || googleLoading) {
      return
    }

    const newValue = !biometricEnabled

    setBiometricEnabled(newValue)

    try {
      localStorage.setItem(
        'digitaldining_biometric_enabled',
        String(newValue)
      )
    } catch (error) {
      console.error('Could not save biometric preference:', error)
    }
  }

  const isPasskeySupported = () => {
    return (
      typeof window !== 'undefined' &&
      typeof window.PublicKeyCredential !== 'undefined'
    )
  }

  const getPasskeyErrorMessage = (error) => {
    const code = error?.code || error?.name || ''
    const message = error?.message || ''
    const lowerMessage = message.toLowerCase()

    if (code === 'webauthn_credential_not_found') {
      return (
        'No biometric/passkey was found on this device. ' +
        'Please use password login or register a passkey first.'
      )
    }

    if (
      code === 'webauthn_verification_failed' ||
      lowerMessage.includes('credential verification failed')
    ) {
      return (
        'Biometric verification failed. Please try again or turn biometric login OFF.'
      )
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
      return (
        'The biometric security request could not be found. Please try again.'
      )
    }

    if (
      code === 'passkey_disabled' ||
      lowerMessage.includes('passkeys are disabled')
    ) {
      return 'Biometric login is currently disabled in the system.'
    }

    if (
      lowerMessage.includes('cancel') ||
      lowerMessage.includes('abort') ||
      lowerMessage.includes('notallowed')
    ) {
      return (
        'Biometric verification was cancelled. Please try again or use password login.'
      )
    }

    return message || 'Biometric verification could not be completed.'
  }

  const handleGoogleLogin = async () => {
    if (loading || biometricLoading || googleLoading) {
      return
    }

    setGoogleLoading(true)

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/auth/google-login`,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      })

      if (error) {
        throw error
      }
    } catch (error) {
      console.error('Google login error:', error)

      alert(
        'Google Login Failed: ' +
          (error?.message || 'Something went wrong.')
      )

      setGoogleLoading(false)
    }
  }

  const handleLogin = async (e) => {
    e.preventDefault()

    if (loading || biometricLoading || googleLoading) {
      return
    }

    const cleanEmail = email.trim().toLowerCase()
    const cleanPassword = password
    const cleanDob = dob.trim()

    if (!cleanEmail || !cleanPassword || !cleanDob) {
      alert(
        'Please fill out your Email, Password, and Date of Birth.'
      )
      return
    }

    setLoading(true)

    let passwordSessionCreated = false

    try {
      console.log('LOGIN: Sending credentials to /api/login')

      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: cleanEmail,
          password: cleanPassword,
          dob: cleanDob,
        }),
      })

      let result = null

      try {
        result = await response.json()
      } catch (jsonError) {
        console.error('LOGIN: Invalid API response:', jsonError)
        throw new Error('The login server returned an invalid response.')
      }

      console.log('LOGIN: API response status:', response.status)

      if (!response.ok || !result?.success) {
        throw new Error(
          result?.message ||
            'Invalid email, password, or Date of Birth.'
        )
      }

      if (
        !result?.session?.access_token ||
        !result?.session?.refresh_token
      ) {
        throw new Error(
          'Login succeeded, but a secure session was not returned.'
        )
      }

      const { error: sessionError } =
        await supabase.auth.setSession({
          access_token: result.session.access_token,
          refresh_token: result.session.refresh_token,
        })

      if (sessionError) {
        console.error('LOGIN: Session restoration failed:', sessionError)
        throw sessionError
      }

      passwordSessionCreated = true

      const restaurant = result.restaurant

      if (!restaurant?.id) {
        throw new Error(
          'Restaurant profile not found for this account.'
        )
      }

      console.log('LOGIN: Password authentication successful')
      console.log('LOGIN: Restaurant ID:', restaurant.id)

      /*
       * If biometric login is disabled, continue directly
       * to the restaurant dashboard.
       */
      if (!biometricEnabled) {
        alert('Login Successful! Welcome to Digital Dining.')

        router.replace(`/dashboard/${restaurant.id}`)
        router.refresh()

        return
      }

      /*
       * Biometric login is enabled.
       */
      if (!isPasskeySupported()) {
        throw new Error(
          'Biometric login is enabled, but this browser or device does not support passkeys. Turn biometric login OFF and use password login.'
        )
      }

      if (
        typeof supabase.auth.signInWithPasskey !== 'function'
      ) {
        throw new Error(
          'Biometric login is not available in the current Supabase configuration. Turn biometric login OFF and use password login.'
        )
      }

      /*
       * End the password session before starting passkey login.
       */
      await supabase.auth.signOut()
      passwordSessionCreated = false

      setBiometricLoading(true)

      console.log('LOGIN: Starting biometric verification')

      const {
        data: passkeyAuthData,
        error: passkeyError,
      } = await supabase.auth.signInWithPasskey()

      if (passkeyError || !passkeyAuthData?.user) {
        console.error(
          'SUPABASE PASSKEY LOGIN ERROR:',
          passkeyError
        )

        throw new Error(
          getPasskeyErrorMessage(passkeyError)
        )
      }

      /*
       * The Auth user ID must match restaurants.owner_id.
       *
       * Do not compare the Auth user ID with restaurants.id.
       */
      const authUserId = passkeyAuthData.user.id
      const restaurantOwnerId = restaurant.owner_id

      if (
        restaurantOwnerId &&
        String(authUserId) !== String(restaurantOwnerId)
      ) {
        await supabase.auth.signOut()

        throw new Error(
          'Biometric account does not match this restaurant account.'
        )
      }

      console.log('LOGIN: Biometric authentication successful')

      alert('Secure Login Successful! 🔐')

      router.replace(`/dashboard/${restaurant.id}`)
      router.refresh()
    } catch (err) {
      console.error('AUTHENTICATION ERROR:', err)

      if (passwordSessionCreated) {
        try {
          await supabase.auth.signOut()
        } catch (signOutError) {
          console.error(
            'LOGIN: Could not clear failed session:',
            signOutError
          )
        }
      }

      alert(
        'Authentication Failed: ' +
          (err?.message || 'Something went wrong.')
      )
    } finally {
      setBiometricLoading(false)
      setLoading(false)
    }
  }

  const isBusy =
    loading ||
    biometricLoading ||
    googleLoading

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4 font-sans">
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-md w-full p-8 shadow-2xl space-y-6">
        <div className="text-center space-y-2">
          <span className="text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/20 px-3 py-1 rounded-full uppercase font-extrabold tracking-widest">
            Restaurant Login
          </span>

          <h1 className="text-2xl font-black text-white">
            Partner Sign In
          </h1>

          <p className="text-xs text-neutral-400">
            Sign in securely to your Digital Dining dashboard.
          </p>
        </div>

        <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="text-2xl">🔐</div>

              <div>
                <p className="text-sm font-black text-white">
                  Biometric Login
                </p>

                <p className="text-[11px] text-neutral-500 mt-1 leading-relaxed">
                  Use Face ID, fingerprint, Windows Hello,
                  Touch ID, device PIN, or passkey.
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={isBusy}
              onClick={toggleBiometric}
              aria-label="Toggle biometric login"
              aria-pressed={biometricEnabled}
              className={
                'relative flex-shrink-0 w-14 h-8 rounded-full transition ' +
                (biometricEnabled
                  ? 'bg-orange-500'
                  : 'bg-neutral-700')
              }
            >
              <span
                className={
                  'absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-all ' +
                  (biometricEnabled ? 'left-7' : 'left-1')
                }
              />
            </button>
          </div>

          <div className="mt-3">
            {biometricEnabled ? (
              <p className="text-[11px] text-green-400 font-bold">
                ● ON — Biometric verification is required.
              </p>
            ) : (
              <p className="text-[11px] text-neutral-500 font-bold">
                ● OFF — Password + DOB login only.
              </p>
            )}
          </div>
        </div>

        {biometricEnabled && (
          <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <div className="text-2xl">🛡️</div>

              <div>
                <p className="text-sm font-black text-orange-300">
                  Biometric verification enabled
                </p>

                <p className="text-[11px] text-neutral-400 mt-1 leading-relaxed">
                  After your email, password and DOB are
                  verified, your device will request your
                  registered biometric or passkey.
                </p>
              </div>
            </div>
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-neutral-300 block mb-1">
              Email Address
            </label>

            <input
              type="email"
              placeholder="owner@restaurant.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={isBusy}
              autoComplete="email"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-neutral-300 block mb-1">
              Password
            </label>

            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={isBusy}
              autoComplete="current-password"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 disabled:opacity-50"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-neutral-300 block mb-1">
              Date of Birth (Security Verification)
            </label>

            <input
              type="date"
              value={dob}
              onChange={(e) => setDob(e.target.value)}
              required
              disabled={isBusy}
              autoComplete="bday"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 font-mono text-neutral-300 disabled:opacity-50"
            />
          </div>

          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4">
            <div className="flex items-center gap-3">
              <div className="text-3xl">
                {biometricEnabled ? '🔐' : '🔑'}
              </div>

              <div>
                <p className="text-sm font-black text-white">
                  {biometricEnabled
                    ? 'Secure multi-factor login'
                    : 'Standard login'}
                </p>

                <p className="text-[11px] text-neutral-500 mt-1">
                  {biometricEnabled
                    ? 'Email + Password + DOB + Biometric'
                    : 'Email + Password + DOB'}
                </p>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={isBusy}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-4 rounded-xl text-xs uppercase tracking-wider transition shadow-lg shadow-orange-500/25 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {biometricLoading
              ? 'Verifying Biometric...'
              : loading
              ? biometricEnabled
                ? 'Verifying Credentials...'
                : 'Signing In...'
              : biometricEnabled
              ? 'Sign In Securely 🔐'
              : 'Sign In'}
          </button>
        </form>

        <div className="flex items-center gap-4">
          <div className="h-px flex-1 bg-neutral-800" />

          <span className="text-[10px] font-bold text-neutral-500 uppercase tracking-widest">
            Or
          </span>

          <div className="h-px flex-1 bg-neutral-800" />
        </div>

        <button
          type="button"
          onClick={handleGoogleLogin}
          disabled={isBusy}
          className="w-full flex items-center justify-center gap-3 bg-white hover:bg-neutral-100 text-neutral-900 font-black py-4 rounded-xl text-xs transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {googleLoading ? (
            <>
              <svg
                className="h-5 w-5 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />

                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>

              Connecting to Google...
            </>
          ) : (
            <>
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                xmlns="http://www.w3.org/2000/svg"
              >
                <path
                  fill="#4285F4"
                  d="M21.35 12.27c0-.78-.07-1.53-.22-2.27H12v4.3h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.91-4.18 2.91-7.42Z"
                />

                <path
                  fill="#34A853"
                  d="M12 21.5c2.63 0 4.84-.87 6.45-2.36l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.53A9.74 9.74 0 0 0 12 21.5Z"
                />

                <path
                  fill="#FBBC05"
                  d="M6.54 13.58A5.85 5.85 0 0 1 6.23 12c0-.55.1-1.08.31-1.58V7.89H3.3A9.75 9.75 0 0 0 2.25 12c0 1.57.38 3.05 1.05 4.11l3.24-2.53Z"
                />

                <path
                  fill="#EA4335"
                  d="M12 6.39c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.47 14.63 2.5 12 2.5a9.74 9.74 0 0 0-8.7 5.39l3.24 2.53C7.31 8.11 9.46 6.39 12 6.39Z"
                />
              </svg>

              Continue with Google
            </>
          )}
        </button>

        <div className="text-center pt-2 space-y-3">
          <a
            href="/register"
            className="text-xs text-orange-400 hover:text-orange-300 underline"
          >
            Create Restaurant Account
          </a>

          <div>
            <a
              href="/"
              className="text-xs text-neutral-400 hover:text-white underline"
            >
              ← Back to Home
            </a>
          </div>
        </div>
      </div>
    </div>
  )
}