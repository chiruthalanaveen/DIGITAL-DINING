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

  // Biometric ON / OFF
  const [biometricEnabled, setBiometricEnabled] = useState(true)

  // Load saved biometric preference
  useEffect(() => {
    try {
      const savedPreference = localStorage.getItem(
        'digitaldining_biometric_enabled'
      )

      if (savedPreference === 'false') {
        setBiometricEnabled(false)
      }

      if (savedPreference === 'true') {
        setBiometricEnabled(true)
      }
    } catch (error) {
      console.error(
        'Could not read biometric preference:',
        error
      )
    }
  }, [])

  const toggleBiometric = () => {
    const newValue = !biometricEnabled

    setBiometricEnabled(newValue)

    try {
      localStorage.setItem(
        'digitaldining_biometric_enabled',
        String(newValue)
      )
    } catch (error) {
      console.error(
        'Could not save biometric preference:',
        error
      )
    }
  }

  const isPasskeySupported = () => {
    return (
      typeof window !== 'undefined' &&
      typeof window.PublicKeyCredential !== 'undefined'
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
      message.toLowerCase()

    // Passkey not found
    if (
      code === 'webauthn_credential_not_found'
    ) {
      return (
        'No biometric/passkey was found on this device. ' +
        'Please use the device that was registered during setup, ' +
        'or turn biometric login OFF and use your password.'
      )
    }

    // Verification failed
    if (
      code === 'webauthn_verification_failed' ||
      lowerMessage.includes(
        'credential verification failed'
      )
    ) {
      return (
        'Biometric verification failed. ' +
        'Please try again or turn biometric login OFF ' +
        'and use email, password and Date of Birth.'
      )
    }

    // Challenge expired
    if (
      code === 'webauthn_challenge_expired' ||
      lowerMessage.includes('challenge expired')
    ) {
      return (
        'The biometric security request expired. ' +
        'Please try again.'
      )
    }

    // Challenge not found
    if (
      code === 'webauthn_challenge_not_found' ||
      lowerMessage.includes('challenge not found')
    ) {
      return (
        'The biometric security request could not be found. ' +
        'Please try again.'
      )
    }

    // Passkeys disabled
    if (
      code === 'passkey_disabled' ||
      lowerMessage.includes(
        'passkeys are disabled'
      )
    ) {
      return (
        'Biometric login is currently disabled in the system.'
      )
    }

    // User cancelled
    if (
      lowerMessage.includes('cancel') ||
      lowerMessage.includes('abort') ||
      lowerMessage.includes('notallowed')
    ) {
      return (
        'Biometric verification was cancelled. ' +
        'Please try again or use password login.'
      )
    }

    if (message) {
      return message
    }

    return (
      'Biometric verification could not be completed.'
    )
  }

  /*
   * ============================================================
   * PASSWORD + DOB LOGIN
   * ============================================================
   */

  const handleLogin = async (e) => {
    e.preventDefault()

    if (
      !email.trim() ||
      !password.trim() ||
      !dob.trim()
    ) {
      alert(
        'Please fill out your Email, Password, and Date of Birth.'
      )
      return
    }

    setLoading(true)

    let passwordSessionCreated = false

    try {
      // ==========================================================
      // STEP 1: VERIFY EMAIL + PASSWORD
      // ==========================================================

      const {
        data: authData,
        error: authError,
      } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password.trim(),
        })

      if (
        authError ||
        !authData?.user
      ) {
        throw new Error(
          'Invalid email or password.'
        )
      }

      passwordSessionCreated = true

      const userId =
        authData.user.id

      // ==========================================================
      // STEP 2: VERIFY RESTAURANT PROFILE
      // ==========================================================

      const {
        data: restaurant,
        error: dbError,
      } = await supabase
        .from('restaurants')
        .select('id, dob')
        .eq('id', userId)
        .single()

      if (
        dbError ||
        !restaurant
      ) {
        throw new Error(
          'Restaurant profile not found.'
        )
      }

      // ==========================================================
      // STEP 3: VERIFY DATE OF BIRTH
      // ==========================================================

      if (
        restaurant.dob !==
        dob.trim()
      ) {
        throw new Error(
          'Security Error: Date of Birth does not match account records.'
        )
      }

      // ==========================================================
      // STEP 4: BIOMETRIC OFF
      // ==========================================================

      if (!biometricEnabled) {
        console.log(
          'Biometric login is OFF. Password + DOB authentication accepted.'
        )

        alert(
          'Login Successful! Welcome to Digital Dining.'
        )

        router.replace(
          `/dashboard/${restaurant.id}`
        )

        return
      }

      // ==========================================================
      // STEP 5: BIOMETRIC ON
      // ==========================================================

      if (
        !isPasskeySupported()
      ) {
        /*
         * Password + DOB were correct.
         *
         * But biometric is ON and this browser does
         * not support passkeys.
         */
        throw new Error(
          'Biometric login is enabled, but this browser/device does not support passkeys. Please use a supported device or turn biometric login OFF.'
        )
      }

      if (
        !supabase.auth.signInWithPasskey ||
        typeof supabase.auth.signInWithPasskey !==
          'function'
      ) {
        throw new Error(
          'Biometric login is not available in the current application configuration.'
        )
      }

      // ==========================================================
      // STEP 6: END PASSWORD SESSION BEFORE PASSKEY
      // ==========================================================

      await supabase.auth.signOut()

      passwordSessionCreated = false

      // ==========================================================
      // STEP 7: PASSKEY / BIOMETRIC VERIFICATION
      // ==========================================================

      setBiometricLoading(true)

      console.log(
        'Starting Digital Dining biometric login...'
      )

      const {
        data: passkeyAuthData,
        error: passkeyError,
      } =
        await supabase.auth.signInWithPasskey()

      if (
        passkeyError ||
        !passkeyAuthData?.user
      ) {
        console.error(
          'SUPABASE PASSKEY LOGIN ERROR:',
          passkeyError
        )

        throw new Error(
          getPasskeyErrorMessage(
            passkeyError
          )
        )
      }

      // ==========================================================
      // STEP 8: VERIFY PASSKEY ACCOUNT MATCHES RESTAURANT
      // ==========================================================

      if (
        String(
          passkeyAuthData.user.id
        ) !==
        String(restaurant.id)
      ) {
        await supabase.auth.signOut()

        throw new Error(
          'Biometric account does not match this restaurant account.'
        )
      }

      // ==========================================================
      // STEP 9: SUCCESS
      // ==========================================================

      console.log(
        'Digital Dining biometric login successful.'
      )

      alert(
        'Secure Login Successful! 🔐'
      )

      router.replace(
        `/dashboard/${restaurant.id}`
      )
    } catch (err) {
      console.error(
        'AUTHENTICATION ERROR:',
        err
      )

      /*
       * If password session is still active,
       * destroy it after a failed login.
       */
      if (passwordSessionCreated) {
        await supabase.auth.signOut()
      }

      alert(
        'Authentication Failed: ' +
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
    biometricLoading

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4 font-sans">

      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-md w-full p-8 shadow-2xl space-y-6">

        {/* ====================================================== */}
        {/* HEADER */}
        {/* ====================================================== */}

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

        {/* ====================================================== */}
        {/* BIOMETRIC ON / OFF */}
        {/* ====================================================== */}

        <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4">

          <div className="flex items-center justify-between gap-4">

            <div className="flex items-start gap-3">

              <div className="text-2xl">
                🔐
              </div>

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

            {/* TOGGLE */}
            <button
              type="button"
              disabled={isBusy}
              onClick={
                toggleBiometric
              }
              aria-label="Toggle biometric login"
              aria-pressed={
                biometricEnabled
              }
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

          {/* STATUS */}
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

        {/* ====================================================== */}
        {/* SECURITY INFORMATION */}
        {/* ====================================================== */}

        {biometricEnabled && (

          <div className="bg-orange-500/10 border border-orange-500/20 rounded-2xl p-4">

            <div className="flex items-start gap-3">

              <div className="text-2xl">
                🛡️
              </div>

              <div>

                <p className="text-sm font-black text-orange-300">
                  Biometric verification enabled
                </p>

                <p className="text-[11px] text-neutral-400 mt-1 leading-relaxed">
                  After your email, password and DOB are
                  verified, your device will request your
                  registered Face ID, fingerprint, Windows
                  Hello, Touch ID, PIN, or passkey.
                </p>

              </div>

            </div>

          </div>

        )}

        {/* ====================================================== */}
        {/* LOGIN FORM */}
        {/* ====================================================== */}

        <form
          onSubmit={handleLogin}
          className="space-y-4"
        >

          {/* EMAIL */}
          <div>

            <label className="text-xs font-bold text-neutral-300 block mb-1">
              Email Address
            </label>

            <input
              type="email"
              placeholder="owner@restaurant.com"
              value={email}
              onChange={(e) =>
                setEmail(
                  e.target.value
                )
              }
              required
              disabled={isBusy}
              autoComplete="email"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 disabled:opacity-50"
            />

          </div>

          {/* PASSWORD */}
          <div>

            <label className="text-xs font-bold text-neutral-300 block mb-1">
              Password
            </label>

            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) =>
                setPassword(
                  e.target.value
                )
              }
              required
              disabled={isBusy}
              autoComplete="current-password"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 disabled:opacity-50"
            />

          </div>

          {/* DOB */}
          <div>

            <label className="text-xs font-bold text-neutral-300 block mb-1">
              Date of Birth (Security Verification)
            </label>

            <input
              type="date"
              value={dob}
              onChange={(e) =>
                setDob(
                  e.target.value
                )
              }
              required
              disabled={isBusy}
              autoComplete="bday"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 font-mono text-neutral-300 disabled:opacity-50"
            />

          </div>

          {/* ==================================================== */}
          {/* LOGIN INFORMATION */}
          {/* ==================================================== */}

          <div className="bg-neutral-950 border border-neutral-800 rounded-2xl p-4">

            {biometricEnabled ? (

              <>

                <div className="flex items-center gap-3">

                  <div className="text-3xl">
                    🔐
                  </div>

                  <div>

                    <p className="text-sm font-black text-white">
                      Secure multi-factor login
                    </p>

                    <p className="text-[11px] text-neutral-500 mt-1">
                      Email + Password + DOB + Biometric
                    </p>

                  </div>

                </div>

              </>

            ) : (

              <>

                <div className="flex items-center gap-3">

                  <div className="text-3xl">
                    🔑
                  </div>

                  <div>

                    <p className="text-sm font-black text-white">
                      Standard login
                    </p>

                    <p className="text-[11px] text-neutral-500 mt-1">
                      Email + Password + DOB
                    </p>

                  </div>

                </div>

              </>

            )}

          </div>

          {/* ==================================================== */}
          {/* SUBMIT BUTTON */}
          {/* ==================================================== */}

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

        {/* ====================================================== */}
        {/* FOOTER */}
        {/* ====================================================== */}

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