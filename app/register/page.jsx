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

    // Check browser WebAuthn/passkey support
    if (
      typeof window !== 'undefined' &&
      !window.PublicKeyCredential
    ) {
      alert(
        'This browser does not support biometric/passkey authentication. Please use a recent version of Chrome, Edge, Safari, or another supported browser.'
      )
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

        throw new Error(
          'Your account was created, but we could not start secure biometric setup. Please try signing in normally.'
        )
      }

      if (!authData?.user) {
        throw new Error(
          'Your account was created, but no authenticated user session was returned.'
        )
      }

      // ============================================================
      // STEP 3: VERIFY PASSKEY SUPPORT
      // ============================================================

      if (
        !supabase.auth.registerPasskey ||
        typeof supabase.auth.registerPasskey !== 'function'
      ) {
        await supabase.auth.signOut()

        throw new Error(
          'Passkey support is not available in this Supabase client. Please check your Supabase client configuration.'
        )
      }

      if (
        typeof window !== 'undefined' &&
        !window.PublicKeyCredential
      ) {
        await supabase.auth.signOut()

        throw new Error(
          'This browser does not support passkeys/biometric authentication.'
        )
      }

      // ============================================================
      // STEP 4: REGISTER OWNER PASSKEY / BIOMETRIC
      // ============================================================

      setBiometricLoading(true)

      console.log(
        'Starting Digital Dining passkey registration...'
      )

      /*
       * Supabase current JavaScript API:
       *
       * supabase.auth.registerPasskey()
       *
       * We intentionally do not pass friendlyName here.
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

        await supabase.auth.signOut()

        const errorCode =
          passkeyError.code ||
          passkeyError.name ||
          ''

        const errorMessage =
          passkeyError.message ||
          'Unknown passkey error'

        // Passkeys disabled
        if (
          errorCode === 'passkey_disabled' ||
          errorMessage.toLowerCase().includes('passkeys are disabled')
        ) {
          throw new Error(
            'Passkeys are disabled in your Supabase project. Please enable Authentication → Passkeys in Supabase.'
          )
        }

        // WebAuthn verification failed
        if (
          errorCode === 'webauthn_verification_failed' ||
          errorMessage.toLowerCase().includes('credential verification failed')
        ) {
          throw new Error(
            'Credential verification failed. Please check your Supabase Passkey RP ID and Origin settings. For production they should use digitaldine-in.online and https://digitaldine-in.online.'
          )
        }

        // Credential already exists
        if (
          errorCode === 'webauthn_credential_exists' ||
          errorMessage.toLowerCase().includes('credential already exists')
        ) {
          throw new Error(
            'This biometric/passkey is already registered. Please use another device or remove the existing passkey from your account.'
          )
        }

        // Challenge expired
        if (
          errorCode === 'webauthn_challenge_expired' ||
          errorMessage.toLowerCase().includes('challenge expired')
        ) {
          throw new Error(
            'The biometric setup request expired. Please start registration again.'
          )
        }

        // Challenge not found
        if (
          errorCode === 'webauthn_challenge_not_found' ||
          errorMessage.toLowerCase().includes('challenge not found')
        ) {
          throw new Error(
            'The biometric security challenge was not found. Please start registration again.'
          )
        }

        // User cancelled biometric prompt
        if (
          errorMessage.toLowerCase().includes('cancel') ||
          errorMessage.toLowerCase().includes('abort') ||
          errorMessage.toLowerCase().includes('notallowed')
        ) {
          throw new Error(
            'Biometric setup was cancelled. Please try again and complete the Face ID, fingerprint, Windows Hello, Touch ID, or device PIN prompt.'
          )
        }

        throw new Error(
          `Biometric setup was not completed: ${errorMessage}`
        )
      }

      if (!passkeyData) {
        await supabase.auth.signOut()

        throw new Error(
          'Biometric setup completed without returning a valid passkey.'
        )
      }

      console.log(
        'Digital Dining passkey successfully registered:',
        passkeyData
      )

      // ============================================================
      // STEP 5: SUCCESS
      // ============================================================

      alert(
        'Account Created and Biometric Login Enabled! 🔐'
      )

      router.push(
        `/subscribe/${data.restaurantId}`
      )
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
                After creating your account, your device will ask you
                to verify using Face ID, fingerprint, Windows Hello,
                Touch ID, device PIN, or another supported passkey
                method.
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
              : 'Create Account + Set Up Biometric 🔐'}

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