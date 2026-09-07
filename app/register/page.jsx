'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

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
  const [biometricLoading, setBiometricLoading] = useState(false)

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

    if (password.trim().length < 6) {
      alert('Password must be at least 6 characters.')
      return
    }

    setLoading(true)

    try {
      // ============================================================
      // STEP 1: CREATE RESTAURANT ACCOUNT
      // ============================================================

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
          data.message || 'Restaurant registration failed.'
        )
      }

      if (!data.restaurantId) {
        throw new Error(
          'Account was created, but the restaurant ID was not returned.'
        )
      }

      // ============================================================
      // STEP 2: SIGN INTO NEW ACCOUNT
      // ============================================================

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

        /*
         * The restaurant account was already created.
         * Do not report registration as completely failed.
         */
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

      // ============================================================
      // STEP 3: BIOMETRIC OFF
      // ============================================================

      if (!biometricEnabled) {
        console.log(
          'Biometric login disabled by restaurant owner.'
        )

        /*
         * No passkey registration at all.
         */
        router.push(
          `/subscribe/${data.restaurantId}`
        )

        return
      }

      // ============================================================
      // STEP 4: CHECK PASSKEY SUPPORT
      // ============================================================

      if (
        typeof window === 'undefined' ||
        !window.PublicKeyCredential
      ) {
        alert(
          'Your account was created successfully. This browser does not support biometric/passkey login. You can enable it later on a supported device.'
        )

        router.push(
          `/subscribe/${data.restaurantId}`
        )

        return
      }

      if (
        !supabase.auth.registerPasskey ||
        typeof supabase.auth.registerPasskey !== 'function'
      ) {
        console.error(
          'Supabase registerPasskey() is not available.'
        )

        alert(
          'Your account was created successfully. Biometric login is currently unavailable. You can continue without it.'
        )

        router.push(
          `/subscribe/${data.restaurantId}`
        )

        return
      }

      // ============================================================
      // STEP 5: REGISTER OWNER PASSKEY / BIOMETRIC
      // ============================================================

      setBiometricLoading(true)

      console.log(
        'Starting Digital Dining passkey registration...'
      )

      try {
        /*
         * Current Supabase API:
         *
         * supabase.auth.registerPasskey()
         *
         * Do not pass friendlyName/options here.
         */
        const {
          data: passkeyData,
          error: passkeyError,
        } = await supabase.auth.registerPasskey()

        if (passkeyError) {
          console.error(
            'SUPABASE PASSKEY REGISTRATION ERROR:',
            passkeyError
          )

          /*
           * IMPORTANT:
           *
           * The restaurant account already exists.
           *
           * Therefore a passkey error should NOT
           * destroy the registration.
           */

          const errorCode =
            passkeyError.code ||
            passkeyError.name ||
            ''

          const errorMessage =
            passkeyError.message ||
            'Unknown passkey error'

          console.error(
            'PASSKEY ERROR CODE:',
            errorCode
          )

          console.error(
            'PASSKEY ERROR MESSAGE:',
            errorMessage
          )

          if (
            errorCode === 'webauthn_verification_failed' ||
            errorMessage
              .toLowerCase()
              .includes('credential verification failed')
          ) {
            alert(
              'Your restaurant account was created successfully, but biometric verification could not be completed. You can continue without biometric login and try again later.'
            )
          } else if (
            errorCode === 'webauthn_credential_exists' ||
            errorMessage
              .toLowerCase()
              .includes('credential already exists')
          ) {
            alert(
              'Your restaurant account was created successfully. This biometric/passkey is already registered. You can continue without setting it up again.'
            )
          } else if (
            errorCode === 'passkey_disabled' ||
            errorMessage
              .toLowerCase()
              .includes('passkeys are disabled')
          ) {
            alert(
              'Your restaurant account was created successfully, but biometric login is currently disabled in the system.'
            )
          } else if (
            errorCode === 'webauthn_challenge_expired' ||
            errorMessage
              .toLowerCase()
              .includes('challenge expired')
          ) {
            alert(
              'Your restaurant account was created successfully, but the biometric request expired. You can continue and try biometric setup later.'
            )
          } else if (
            errorMessage
              .toLowerCase()
              .includes('cancel') ||
            errorMessage
              .toLowerCase()
              .includes('abort') ||
            errorMessage
              .toLowerCase()
              .includes('notallowed')
          ) {
            alert(
              'Your restaurant account was created successfully. Biometric setup was cancelled. You can continue without biometric login.'
            )
          } else {
            alert(
              'Your restaurant account was created successfully, but biometric setup could not be completed. You can continue without biometric login.'
            )
          }

          /*
           * Continue to subscription.
           */
          router.push(
            `/subscribe/${data.restaurantId}`
          )

          return
        }

        if (!passkeyData) {
          console.warn(
            'Passkey registration completed without returned data.'
          )

          alert(
            'Your restaurant account was created successfully. Biometric setup could not be confirmed, but you can continue without it.'
          )

          router.push(
            `/subscribe/${data.restaurantId}`
          )

          return
        }

        // ============================================================
        // STEP 6: PASSKEY SUCCESS
        // ============================================================

        console.log(
          'Digital Dining passkey successfully registered.'
        )

        alert(
          'Account Created and Biometric Login Enabled! 🔐'
        )

        router.push(
          `/subscribe/${data.restaurantId}`
        )

        return
      } catch (passkeyException) {
        /*
         * IMPORTANT:
         *
         * Any unexpected passkey error also does NOT
         * make restaurant registration fail.
         */

        console.error(
          'UNEXPECTED PASSKEY ERROR:',
          passkeyException
        )

        alert(
          'Your restaurant account was created successfully, but biometric setup could not be completed. You can continue without biometric login.'
        )

        router.push(
          `/subscribe/${data.restaurantId}`
        )

        return
      }
    } catch (err) {
      console.error(
        'REGISTRATION ERROR:',
        err
      )

      alert(
        'Registration Error: ' +
          (err?.message ||
            'Something went wrong.')
      )
    } finally {
      setBiometricLoading(false)
      setLoading(false)
    }
  }

  const isBusy =
    loading || biometricLoading

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
                    e.target.value.replace(
                      /\D/g,
                      ''
                    )
                  )
                }
                required
                disabled={isBusy}
                autoComplete="tel"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-orange-500 font-mono disabled:opacity-50"
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

          {/* ====================================================== */}
          {/* BIOMETRIC ON / OFF */}
          {/* ====================================================== */}

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

              {/* TOGGLE */}
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

          {/* SUBMIT BUTTON */}
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