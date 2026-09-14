'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function isPasskeySupportedOnCurrentDomain() {
  if (typeof window === 'undefined') {
    return false
  }

  const hostname = window.location.hostname

  const isLocalhost =
    hostname === 'localhost' ||
    hostname === '127.0.0.1' ||
    hostname === '[::1]'

  const isProductionDomain =
    hostname === 'digitaldine-in.online' ||
    hostname === 'www.digitaldine-in.online'

  const hasPublicKeyCredential =
    typeof window.PublicKeyCredential !== 'undefined'

  /*
   * Passkeys require a secure context.
   *
   * HTTPS production domains are supported.
   * Localhost is allowed by browsers for development,
   * but a production RP ID cannot be used from localhost.
   */
  return (
    hasPublicKeyCredential &&
    window.isSecureContext &&
    (isLocalhost || isProductionDomain)
  )
}

function getPasskeyErrorMessage(error) {
  const message =
    error?.message ||
    error?.name ||
    ''

  return String(message).toLowerCase()
}

export default function RestaurantRegistration() {
  const router = useRouter()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [dob, setDob] = useState('')
  const [password, setPassword] = useState('')

  // Biometric ON/OFF
  const [biometricEnabled, setBiometricEnabled] = useState(true)

  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [biometricLoading, setBiometricLoading] = useState(false)

  // ============================================================
  // GOOGLE SIGN-UP
  // ============================================================

  const handleGoogleSignup = async () => {
    if (googleLoading || loading || biometricLoading) {
      return
    }

    if (!phone.trim() || !dob.trim()) {
      alert(
        'Please enter your Phone Number and Date of Birth before continuing with Google sign-up.'
      )
      return
    }

    if (phone.trim().replace(/\D/g, '').length !== 10) {
      alert('Please enter a valid 10-digit phone number.')
      return
    }

    setGoogleLoading(true)

    try {
      localStorage.setItem(
        'digitaldining_google_registration',
        JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          dob: dob.trim(),
          biometricEnabled,
        })
      )

      const redirectTo =
        `${window.location.origin}/auth/google-complete`

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account',
          },
        },
      })

      if (error) {
        console.error('GOOGLE SIGN-UP ERROR:', error)

        localStorage.removeItem(
          'digitaldining_google_registration'
        )

        throw new Error(
          error.message ||
            'Google sign-up could not be started.'
        )
      }
    } catch (error) {
      console.error('GOOGLE SIGN-UP EXCEPTION:', error)

      alert(
        'Google Sign-up Error: ' +
          (
            error?.message ||
            'Something went wrong while starting Google sign-up.'
          )
      )

      setGoogleLoading(false)
    }
  }

  // ============================================================
  // SAFE BIOMETRIC SETUP
  // ============================================================

  const tryRegisterBiometric = async () => {
    /*
     * The restaurant account has already been created and the
     * user has already signed in before this function is called.
     *
     * Do not allow a biometric error to make registration fail.
     */

    if (!isPasskeySupportedOnCurrentDomain()) {
      console.warn(
        'Passkey setup skipped: unsupported browser, insecure context, or unsupported domain.'
      )

      return {
        success: false,
        skipped: true,
        reason: 'unsupported_domain_or_browser',
      }
    }

    /*
     * Do not call a method unless it really exists.
     *
     * registerPasskey() is not available in every version of
     * @supabase/supabase-js.
     */
    const registerPasskey =
      supabase?.auth?.registerPasskey

    if (typeof registerPasskey !== 'function') {
      console.warn(
        'Passkey setup skipped: supabase.auth.registerPasskey() is not available in the installed Supabase client.'
      )

      return {
        success: false,
        skipped: true,
        reason: 'supabase_passkey_api_unavailable',
      }
    }

    setBiometricLoading(true)

    try {
      console.log(
        'Starting Digital Dining passkey registration...'
      )

      const result = await registerPasskey()

      const passkeyError = result?.error
      const passkeyData = result?.data

      if (passkeyError) {
        console.error(
          'SUPABASE PASSKEY REGISTRATION ERROR:',
          passkeyError
        )

        return {
          success: false,
          skipped: false,
          reason: getPasskeyErrorMessage(passkeyError),
        }
      }

      /*
       * Some APIs may not return a data object even after the
       * browser has completed the passkey operation.
       */
      console.log(
        'Passkey registration response received:',
        passkeyData
      )

      return {
        success: true,
        skipped: false,
      }
    } catch (error) {
      console.error(
        'UNEXPECTED PASSKEY REGISTRATION ERROR:',
        error
      )

      return {
        success: false,
        skipped: false,
        reason: getPasskeyErrorMessage(error),
      }
    } finally {
      setBiometricLoading(false)
    }
  }

  // ============================================================
  // NORMAL PASSWORD REGISTRATION
  // ============================================================

  const handleRegister = async (e) => {
    e.preventDefault()

    if (
      !name.trim() ||
      !email.trim() ||
      !phone.trim() ||
      !dob.trim() ||
      !password.trim()
    ) {
      alert(
        'Please fill out all required fields, including your Date of Birth.'
      )
      return
    }

    if (phone.trim().replace(/\D/g, '').length !== 10) {
      alert('Please enter a valid 10-digit phone number.')
      return
    }

    if (password.trim().length < 6) {
      alert('Password must be at least 6 characters.')
      return
    }

    setLoading(true)

    try {
      // ========================================================
      // STEP 1: CREATE RESTAURANT ACCOUNT
      // ========================================================

      const res = await fetch('/api/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim(),
          dob: dob.trim(),
          password: password.trim(),
        }),
      })

      const text = await res.text()

      let data = {}

      try {
        data = text ? JSON.parse(text) : {}
      } catch (jsonError) {
        console.error(
          'REGISTER API INVALID RESPONSE:',
          text
        )

        throw new Error(
          'The registration server returned an invalid response.'
        )
      }

      if (!res.ok || !data.success) {
        throw new Error(
          data.message ||
            'Restaurant registration failed.'
        )
      }

      if (!data.restaurantId) {
        throw new Error(
          'Account was created, but the restaurant ID was not returned.'
        )
      }

      // ========================================================
      // STEP 2: SIGN INTO NEW ACCOUNT
      // ========================================================

      const {
        data: authData,
        error: signInError,
      } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      })

      if (signInError) {
        console.error(
          'INITIAL SIGN-IN ERROR:',
          signInError
        )

        alert(
          'Your restaurant account was created successfully. Please login normally to continue.'
        )

        router.push('/login')
        return
      }

      if (!authData?.user) {
        alert(
          'Your restaurant account was created successfully. Please login normally to continue.'
        )

        router.push('/login')
        return
      }

      // ========================================================
      // STEP 3: BIOMETRIC OFF
      // ========================================================

      if (!biometricEnabled) {
        console.log(
          'Biometric login disabled by restaurant owner.'
        )

        router.push(
          `/subscribe/${data.restaurantId}`
        )

        return
      }

      // ========================================================
      // STEP 4: BIOMETRIC SETUP
      // ========================================================

      const biometricResult =
        await tryRegisterBiometric()

      if (biometricResult.success) {
        alert(
          'Account Created and Biometric Login Enabled! 🔐'
        )
      } else if (
        biometricResult.reason ===
        'unsupported_domain_or_browser'
      ) {
        alert(
          'Your restaurant account was created successfully. Biometric setup is available after opening the website on the supported HTTPS domain. You can continue without it.'
        )
      } else if (
        biometricResult.reason ===
        'supabase_passkey_api_unavailable'
      ) {
        alert(
          'Your restaurant account was created successfully. Biometric setup is not available in the current authentication configuration. You can continue without it.'
        )
      } else {
        alert(
          'Your restaurant account was created successfully, but biometric setup could not be completed. You can continue without biometric login and try again later.'
        )
      }

      // ========================================================
      // STEP 5: CONTINUE TO SUBSCRIPTION
      // ========================================================

      router.push(
        `/subscribe/${data.restaurantId}`
      )

      return
    } catch (err) {
      console.error(
        'REGISTRATION ERROR:',
        err
      )

      alert(
        'Registration Error: ' +
          (
            err?.message ||
            'Something went wrong.'
          )
      )
    } finally {
      setBiometricLoading(false)
      setLoading(false)
    }
  }

  const isBusy =
    loading ||
    googleLoading ||
    biometricLoading

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4 font-sans py-12">
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-lg w-full p-8 shadow-2xl space-y-6">

        {/* HEADER */}
        <div className="text-center space-y-2">
          <span className="text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/20 px-3 py-1 rounded-full uppercase font-extrabold tracking-widest">
            Step 1 of 2
          </span>

          <h1 className="text-2xl font-black text-white">
            Create Partner Account
          </h1>

          <p className="text-xs text-neutral-400">
            Set up your digital dining credentials and owner profile.
          </p>
        </div>

        {/* BIOMETRIC INFORMATION */}
        <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4">
          <div className="flex items-start gap-3">
            <div className="text-2xl">
              🔐
            </div>

            <div>
              <p className="text-sm font-black text-orange-300">
                Secure biometric login
              </p>

              <p className="text-xs text-neutral-400 mt-1 leading-relaxed">
                You can choose whether to enable biometric login.
                Your device can use Face ID, fingerprint,
                Windows Hello, Touch ID, device PIN, or another
                supported passkey method.
              </p>

              <p className="text-xs text-neutral-500 mt-2 leading-relaxed">
                Digital Dining does not receive or store your face
                or fingerprint image. Your device handles the
                biometric verification.
              </p>
            </div>
          </div>
        </div>

        {/* REGISTRATION FORM */}
        <form
          onSubmit={handleRegister}
          className="space-y-4"
        >
          {/* RESTAURANT NAME */}
          <div>
            <label className="text-xs font-bold text-neutral-300 block mb-1">
              Restaurant Name
            </label>

            <input
              type="text"
              placeholder="Spice Junction"
              value={name}
              onChange={(e) =>
                setName(e.target.value)
              }
              required
              disabled={isBusy}
              autoComplete="organization"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 disabled:opacity-50"
            />
          </div>

          {/* EMAIL + PHONE */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-neutral-300 block mb-1">
                Email Address
              </label>

              <input
                type="email"
                placeholder="owner@restaurant.com"
                value={email}
                onChange={(e) =>
                  setEmail(e.target.value)
                }
                required
                disabled={isBusy}
                autoComplete="email"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 disabled:opacity-50"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-neutral-300 block mb-1">
                Phone Number
              </label>

              <input
                type="tel"
                maxLength="10"
                placeholder="9876543210"
                value={phone}
                onChange={(e) =>
                  setPhone(
                    e.target.value
                      .replace(/\D/g, '')
                      .slice(0, 10)
                  )
                }
                required
                disabled={isBusy}
                autoComplete="tel"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 disabled:opacity-50"
              />
            </div>
          </div>

          {/* DOB + PASSWORD */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-neutral-300 block mb-1">
                Date of Birth (Security)
              </label>

              <input
                type="date"
                value={dob}
                onChange={(e) =>
                  setDob(e.target.value)
                }
                required
                disabled={isBusy}
                autoComplete="bday"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 font-mono text-neutral-300 disabled:opacity-50"
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
                onChange={(e) =>
                  setPassword(e.target.value)
                }
                required
                disabled={isBusy}
                autoComplete="new-password"
                minLength={6}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 font-mono disabled:opacity-50"
              />
            </div>
          </div>

          {/* BIOMETRIC ON / OFF */}
          <div className="border border-neutral-800 bg-neutral-950 rounded-2xl p-4">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="text-2xl">
                  🔐
                </div>

                <div>
                  <p className="text-sm font-black text-white">
                    Biometric Login
                  </p>

                  <p className="text-xs text-neutral-500 mt-1">
                    Enable fingerprint, Face ID, Windows Hello
                    or passkey login.
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={isBusy}
                onClick={() =>
                  setBiometricEnabled(
                    !biometricEnabled
                  )
                }
                aria-label="Toggle biometric login"
                aria-pressed={biometricEnabled}
                className={
                  'relative flex-shrink-0 w-14 h-8 rounded-full transition ' +
                  (
                    biometricEnabled
                      ? 'bg-orange-500'
                      : 'bg-neutral-700'
                  )
                }
              >
                <span
                  className={
                    'absolute top-1 w-6 h-6 bg-white rounded-full shadow transition-all ' +
                    (
                      biometricEnabled
                        ? 'left-7'
                        : 'left-1'
                    )
                  }
                />
              </button>
            </div>

            <div className="mt-3">
              {biometricEnabled ? (
                <p className="text-[11px] text-green-400 font-bold">
                  ● ON — Biometric setup will be offered after account creation.
                </p>
              ) : (
                <p className="text-[11px] text-neutral-500 font-bold">
                  ● OFF — You can use email, password and DOB to login.
                </p>
              )}
            </div>
          </div>

          {/* NORMAL SUBMIT BUTTON */}
          <button
            type="submit"
            disabled={isBusy}
            className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-4 rounded-xl text-xs uppercase tracking-wider transition shadow-lg shadow-orange-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {biometricLoading
              ? 'Set Up Face / Fingerprint...'
              : loading
              ? 'Creating Account...'
              : biometricEnabled
              ? 'Create Account + Set Up Biometric 🔐'
              : 'Create Account'}
          </button>

          {/* DIVIDER */}
          <div className="flex items-center gap-3">
            <div className="h-px bg-neutral-800 flex-1" />

            <span className="text-[10px] text-neutral-500 font-bold uppercase tracking-widest">
              Or
            </span>

            <div className="h-px bg-neutral-800 flex-1" />
          </div>

          {/* GOOGLE SIGN-UP BUTTON */}
          <button
            type="button"
            onClick={handleGoogleSignup}
            disabled={isBusy}
            className="w-full bg-white hover:bg-neutral-200 text-neutral-900 font-black py-4 rounded-xl text-xs uppercase tracking-wider transition flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {googleLoading ? (
              <>
                <span className="animate-spin h-4 w-4 border-2 border-neutral-400 border-t-neutral-900 rounded-full" />
                Connecting to Google...
              </>
            ) : (
              <>
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                >
                  <path
                    fill="#4285F4"
                    d="M21.35 12.27c0-.78-.07-1.53-.22-2.27H12v4.3h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.91-4.18 2.91-7.42Z"
                  />
                  <path
                    fill="#34A853"
                    d="M12 21.75c2.63 0 4.84-.87 6.45-2.36l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.53A9.75 9.75 0 0 0 12 21.75Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M6.54 13.83A5.86 5.86 0 0 1 6.23 12c0-.64.11-1.26.31-1.83V7.64H3.3A9.75 9.75 0 0 0 2.25 12c0 1.57.38 3.05 1.05 4.36l3.24-2.53Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M12 6.14c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.21 14.63 2.25 12 2.25a9.75 9.75 0 0 0-8.7 5.39l3.24 2.53C7.31 7.86 9.46 6.14 12 6.14Z"
                  />
                </svg>

                Continue with Google
              </>
            )}
          </button>

          <p className="text-[10px] text-neutral-500 text-center leading-relaxed">
            Google sign-up still requires your phone number and
            date of birth because they are used for your restaurant
            profile and account security.
          </p>
        </form>

        {/* SECURITY NOTE */}
        <div className="border-t border-neutral-800 pt-4">
          <p className="text-[11px] text-neutral-500 text-center leading-relaxed">
            Your biometric information stays on your device.
            Digital Dining receives a cryptographic passkey
            credential rather than your face or fingerprint.
          </p>
        </div>

      </div>
    </div>
  )
}