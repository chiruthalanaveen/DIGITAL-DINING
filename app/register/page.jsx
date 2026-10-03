'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function isPasskeySupportedOnCurrentDomain() {
  if (typeof window === 'undefined') {
    return false
  }

  const hostname = window.location.hostname

  const isProductionDomain =
    hostname === 'digitaldine-in.online' ||
    hostname === 'www.digitaldine-in.online'

  const hasPublicKeyCredential =
    typeof window.PublicKeyCredential !== 'undefined'

  /*
   * Digital Dining passkeys are enrolled only on the real
   * production domain. This avoids creating a WebAuthn challenge
   * on localhost when the production RP ID/origin is configured.
   */
  return (
    hasPublicKeyCredential &&
    window.isSecureContext &&
    isProductionDomain
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
  const [appleLoading, setAppleLoading] = useState(false)
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

      const redirectTo = `${window.location.origin}/auth/google-complete`

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
        localStorage.removeItem('digitaldining_google_registration')
        throw new Error(
          error.message || 'Google sign-up could not be started.'
        )
      }
    } catch (error) {
      console.error('GOOGLE SIGN-UP EXCEPTION:', error)
      alert(
        'Google Sign-up Error: ' +
          (error?.message ||
            'Something went wrong while starting Google sign-up.')
      )
      setGoogleLoading(false)
    }
  }

  // ============================================================
  // APPLE SIGN-UP
  // ============================================================

  const handleAppleSignup = async () => {
    if (appleLoading || googleLoading || loading || biometricLoading) {
      return
    }

    if (!name.trim() || !phone.trim() || !dob.trim()) {
      alert(
        'Please enter your Restaurant Name, Phone Number and Date of Birth before continuing with Apple sign-up.'
      )
      return
    }

    if (phone.trim().replace(/\D/g, '').length !== 10) {
      alert('Please enter a valid 10-digit phone number.')
      return
    }

    setAppleLoading(true)

    try {
      localStorage.setItem(
        'digitaldining_apple_registration',
        JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          dob: dob.trim(),
          biometricEnabled,
        })
      )

      const redirectTo = `${window.location.origin}/auth/apple-complete`

      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: {
          redirectTo,
        },
      })

      if (error) {
        localStorage.removeItem('digitaldining_apple_registration')
        throw error
      }
    } catch (error) {
      console.error('APPLE SIGN-UP ERROR:', error)
      alert(
        'Apple Sign-up Failed: ' +
          (error?.message || 'Something went wrong while starting Apple sign-up.')
      )
      setAppleLoading(false)
    }
  }

  // ============================================================
  // SAFE BIOMETRIC SETUP
  // ============================================================

  const tryRegisterBiometric = async () => {
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

    if (
      typeof supabase?.auth?.registerPasskey !== 'function' ||
      typeof supabase?.auth?.passkey?.list !== 'function'
    ) {
      console.warn(
        'Passkey setup skipped: the installed Supabase client does not expose the complete passkey API.'
      )
      return {
        success: false,
        skipped: true,
        reason:
          'Supabase passkey API is unavailable. Upgrade @supabase/supabase-js to v2.105.0 or newer.',
      }
    }

    setBiometricLoading(true)

    try {
      const result = await supabase.auth.registerPasskey()
      const passkeyError = result?.error

      if (passkeyError) {
        console.error('SUPABASE PASSKEY REGISTRATION ERROR:', passkeyError)
        return {
          success: false,
          skipped: false,
          reason: getPasskeyErrorMessage(passkeyError),
        }
      }

      const {
        data: passkeyListData,
        error: passkeyListError,
      } = await supabase.auth.passkey.list()

      if (passkeyListError) {
        console.error('PASSKEY CONFIRMATION ERROR:', passkeyListError)
        return {
          success: false,
          skipped: false,
          reason:
            passkeyListError?.message ||
            passkeyListError?.code ||
            'Passkey was created but could not be confirmed.',
        }
      }

      const registeredPasskeys = Array.isArray(passkeyListData)
        ? passkeyListData
        : Array.isArray(passkeyListData?.passkeys)
        ? passkeyListData.passkeys
        : []

      if (registeredPasskeys.length === 0) {
        return {
          success: false,
          skipped: false,
          reason:
            'Supabase Auth did not return a registered passkey after enrollment.',
        }
      }

      return {
        success: true,
        skipped: false,
        passkeyCount: registeredPasskeys.length,
      }
    } catch (error) {
      console.error('UNEXPECTED PASSKEY REGISTRATION ERROR:', error)
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
      alert('Please fill out all required fields, including your Date of Birth.')
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
        console.error('REGISTER API INVALID RESPONSE:', text)
        throw new Error('The registration server returned an invalid response.')
      }

      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Restaurant registration failed.')
      }

      if (!data.restaurantId) {
        throw new Error(
          'Account was created, but the restaurant ID was not returned.'
        )
      }

      const {
        data: authData,
        error: signInError,
      } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password: password.trim(),
      })

      if (signInError || !authData?.user) {
        alert(
          'Your restaurant account was created successfully. Please login normally to continue.'
        )
        router.push('/login')
        return
      }

      if (!biometricEnabled) {
        try {
          localStorage.setItem('digitaldining_biometric_enabled', 'false')
        } catch {}

        router.push(`/subscribe/${data.restaurantId}`)
        return
      }

      const biometricResult = await tryRegisterBiometric()

      if (biometricResult.success) {
        try {
          localStorage.setItem('digitaldining_biometric_enabled', 'true')
        } catch {}
        alert('Account Created and Biometric Login Enabled! 🔐')
      } else if (
        biometricResult.reason === 'unsupported_domain_or_browser'
      ) {
        alert(
          'Your restaurant account was created successfully. Biometric setup is available after opening the website on the supported HTTPS domain. You can continue without it.'
        )
      } else if (
        String(biometricResult.reason || '').includes(
          'Supabase passkey API is unavailable'
        )
      ) {
        alert(
          'Your restaurant account was created successfully, but biometric setup cannot run because the installed Supabase JavaScript client is too old. Upgrade @supabase/supabase-js to v2.105.0 or newer.'
        )
      } else {
        const biometricReason = String(biometricResult.reason || '').trim()
        alert(
          'Your restaurant account was created successfully, but biometric setup could not be completed.' +
            (biometricReason ? `\n\nReason: ${biometricReason}` : '') +
            '\n\nYou can continue and repair biometric setup from the Owner login later.'
        )
      }

      router.push(`/subscribe/${data.restaurantId}`)
      return
    } catch (err) {
      console.error('REGISTRATION ERROR:', err)
      alert(
        'Registration Error: ' +
          (err?.message || 'Something went wrong.')
      )
    } finally {
      setBiometricLoading(false)
      setLoading(false)
    }
  }

  const isBusy =
    loading ||
    googleLoading ||
    appleLoading ||
    biometricLoading

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 flex items-center justify-center p-4 sm:p-6 lg:p-8 font-sans">
      <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-sm p-6 sm:p-8 space-y-6">

        {/* Header */}
        <div className="text-center space-y-1.5">
          <span className="inline-block text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-2.5 py-0.5 rounded-full uppercase tracking-wider">
            Step 1 of 2
          </span>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">
            Create Partner Account
          </h1>
          <p className="text-xs text-slate-500">
            Set up your restaurant credentials and management profile.
          </p>
        </div>

        {/* Registration Form */}
        <form onSubmit={handleRegister} className="space-y-4">
          
          {/* Restaurant Name */}
          <div>
            <label className="text-xs font-semibold text-slate-700 block mb-1.5">
              Restaurant Name
            </label>
            <input
              type="text"
              name="restaurantName"
              placeholder="e.g. Spice Junction"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              disabled={isBusy}
              autoComplete="organization"
              className="w-full bg-white border border-slate-300 rounded-lg px-3.5 py-2.5 text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition disabled:bg-slate-100 disabled:opacity-60"
            />
          </div>

          {/* Email & Phone */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                Email Address
              </label>
              <input
                type="email"
                name="email"
                placeholder="owner@restaurant.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={isBusy}
                autoComplete="email"
                className="w-full bg-white border border-slate-300 rounded-lg px-3.5 py-2.5 text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition disabled:bg-slate-100 disabled:opacity-60"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                Phone Number
              </label>
              <input
                type="tel"
                name="phone"
                maxLength="10"
                placeholder="9876543210"
                value={phone}
                onChange={(e) =>
                  setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))
                }
                required
                disabled={isBusy}
                autoComplete="tel"
                className="w-full bg-white border border-slate-300 rounded-lg px-3.5 py-2.5 text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition disabled:bg-slate-100 disabled:opacity-60"
              />
            </div>
          </div>

          {/* DOB & Password */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                Date of Birth
              </label>
              <input
                type="date"
                name="dob"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                required
                disabled={isBusy}
                autoComplete="bday"
                className="w-full bg-white border border-slate-300 rounded-lg px-3.5 py-2.5 text-slate-900 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition disabled:bg-slate-100 disabled:opacity-60"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-slate-700 block mb-1.5">
                Password
              </label>
              <input
                type="password"
                name="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={isBusy}
                autoComplete="new-password"
                minLength={6}
                className="w-full bg-white border border-slate-300 rounded-lg px-3.5 py-2.5 text-slate-900 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-900 transition disabled:bg-slate-100 disabled:opacity-60"
              />
            </div>
          </div>

          {/* Biometric Toggle Card */}
          <div className="border border-slate-200 bg-slate-50/70 rounded-xl p-3.5">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-2.5">
                <span className="text-lg">🔐</span>
                <div>
                  <p className="text-xs font-bold text-slate-900">
                    Biometric Passkey Login
                  </p>
                  <p className="text-[11px] text-slate-500 leading-tight mt-0.5">
                    Enable Touch ID, Face ID, or Windows Hello.
                  </p>
                </div>
              </div>

              <button
                type="button"
                disabled={isBusy}
                onClick={() => setBiometricEnabled(!biometricEnabled)}
                aria-label="Toggle biometric login"
                aria-pressed={biometricEnabled}
                className={`relative flex-shrink-0 w-11 h-6 rounded-full transition-colors duration-200 ease-in-out ${
                  biometricEnabled ? 'bg-slate-900' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`inline-block w-5 h-5 bg-white rounded-full shadow-sm transform transition duration-200 ease-in-out mt-0.5 ${
                    biometricEnabled ? 'translate-x-5' : 'translate-x-0.5'
                  }`}
                />
              </button>
            </div>

            <div className="mt-2.5 pt-2 border-t border-slate-200/60">
              {biometricEnabled ? (
                <p className="text-[11px] text-emerald-600 font-medium">
                  ● Enabled — You'll be prompted to register biometric passkey.
                </p>
              ) : (
                <p className="text-[11px] text-slate-500">
                  ● Disabled — Standard email and password login only.
                </p>
              )}
            </div>
          </div>

          {/* Primary Submit */}
          <button
            type="submit"
            disabled={isBusy}
            className="w-full bg-slate-900 hover:bg-slate-800 text-white font-semibold py-3 rounded-lg text-sm transition shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {biometricLoading
              ? 'Setting up Biometrics...'
              : loading
              ? 'Creating Account...'
              : biometricEnabled
              ? 'Create Account & Enable Passkey'
              : 'Create Account'}
          </button>

          {/* Divider */}
          <div className="relative my-4 flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-slate-200" />
            </div>
            <span className="relative bg-white px-3 text-[11px] uppercase tracking-wider text-slate-400 font-medium">
              Or continue with
            </span>
          </div>

          {/* Social Logins */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <button
              type="button"
              onClick={handleGoogleSignup}
              disabled={isBusy}
              className="w-full bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-medium py-2.5 rounded-lg text-xs transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
            >
              {googleLoading ? (
                <span className="animate-spin h-3.5 w-3.5 border-2 border-slate-400 border-t-slate-800 rounded-full" />
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M21.35 12.27c0-.78-.07-1.53-.22-2.27H12v4.3h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.91-4.18 2.91-7.42Z"/>
                  <path fill="#34A853" d="M12 21.75c2.63 0 4.84-.87 6.45-2.36l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.53A9.75 9.75 0 0 0 12 21.75Z"/>
                  <path fill="#FBBC05" d="M6.54 13.83A5.86 5.86 0 0 1 6.23 12c0-.64.11-1.26.31-1.83V7.64H3.3A9.75 9.75 0 0 0 2.25 12c0 1.57.38 3.05 1.05 4.36l3.24-2.53Z"/>
                  <path fill="#EA4335" d="M12 6.14c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.21 14.63 2.25 12 2.25a9.75 9.75 0 0 0-8.7 5.39l3.24 2.53C7.31 7.86 9.46 6.14 12 6.14Z"/>
                </svg>
              )}
              Google
            </button>

            <button
              type="button"
              onClick={handleAppleSignup}
              disabled={isBusy}
              className="w-full bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-medium py-2.5 rounded-lg text-xs transition flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
            >
              {appleLoading ? (
                <span className="animate-spin h-3.5 w-3.5 border-2 border-slate-400 border-t-slate-800 rounded-full" />
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.05 12.54c-.02-2.15 1.76-3.18 1.84-3.23-1.01-1.47-2.58-1.67-3.13-1.69-1.31-.14-2.58.78-3.25.78-.68 0-1.72-.76-2.82-.74-1.45.02-2.79.84-3.54 2.14-1.52 2.63-.39 6.5 1.08 8.63.74 1.04 1.59 2.19 2.72 2.15 1.09-.04 1.5-.69 2.81-.69 1.31 0 1.68.69 2.82.67 1.17-.02 1.9-1.05 2.61-2.1.83-1.21 1.17-2.38 1.19-2.44-.03-.01-2.29-.88-2.31-3.48ZM14.9 6.22c.6-.73 1.01-1.74.9-2.74-.87.04-1.93.58-2.55 1.3-.56.64-1.06 1.66-.93 2.64.97.08 1.96-.49 2.58-1.2Z"/>
                </svg>
              )}
              Apple
            </button>
          </div>

          <p className="text-[11px] text-slate-400 text-center leading-relaxed pt-1">
            Third-party sign-up automatically links your name, phone number, and DOB for your partner account security.
          </p>
        </form>

        {/* Security note */}
        <div className="border-t border-slate-100 pt-4">
          <p className="text-[11px] text-slate-400 text-center leading-relaxed">
            Protected by WebAuthn &amp; Supabase Auth. Biometrics never leave your physical device.
          </p>
        </div>

      </div>
    </div>
  )
}