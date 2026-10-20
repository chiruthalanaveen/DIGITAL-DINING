'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

// Keep passkey enrollment limited to the configured production RP domain.
function isPasskeySupportedOnCurrentDomain() {
  if (typeof window === 'undefined') return false

  const hostname = window.location.hostname
  const isProductionDomain =
    hostname === 'digitaldine-in.online' ||
    hostname === 'www.digitaldine-in.online'

  const hasPublicKeyCredential = typeof window.PublicKeyCredential !== 'undefined'

  return hasPublicKeyCredential && window.isSecureContext && isProductionDomain
}

function getPasskeyErrorMessage(error) {
  const message = error?.message || error?.name || ''
  return String(message).toLowerCase()
}

// 16px text on mobile prevents iOS Safari from zooming in when a field is focused.
const inputClassName =
  'h-11 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3.5 text-base font-medium text-neutral-900 placeholder:text-neutral-400 outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-60 sm:text-sm'

const labelClassName = 'mb-1 block text-xs font-semibold text-neutral-700'

const sectionTitleClassName =
  'sr-only text-[10px] font-bold uppercase tracking-[0.18em] text-neutral-400 sm:not-sr-only sm:mb-1'

export default function RestaurantRegistration() {
  const router = useRouter()

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [dob, setDob] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [privacyAcknowledged, setPrivacyAcknowledged] = useState(false)

  const [biometricEnabled, setBiometricEnabled] = useState(true)
  const [registrationComplete, setRegistrationComplete] = useState(false)

  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [appleLoading, setAppleLoading] = useState(false)
  const [biometricLoading, setBiometricLoading] = useState(false)

  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const isBusy = loading || googleLoading || appleLoading || biometricLoading

  // GOOGLE SIGN-UP: original OAuth, saved details and redirect preserved.
  const handleGoogleSignup = async () => {
    if (isBusy) return
    setError('')

    if (!privacyAcknowledged) {
      setError('Please read and acknowledge the Privacy Policy before signing up.')
      return
    }

    if (!phone.trim() || !dob.trim()) {
      setError('Enter your phone number and date of birth to continue with Google sign-up.')
      return
    }

    if (phone.trim().replace(/\D/g, '').length !== 10) {
      setError('Please enter a valid 10-digit phone number.')
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

      if (oauthError) {
        console.error('GOOGLE SIGN-UP ERROR:', oauthError)
        localStorage.removeItem('digitaldining_google_registration')
        throw new Error(oauthError.message || 'Google sign-up could not be started.')
      }
    } catch (err) {
      console.error('GOOGLE SIGN-UP EXCEPTION:', err)
      setError(err?.message || 'Something went wrong while starting Google sign-up.')
      setGoogleLoading(false)
    }
  }

  // APPLE SIGN-UP: original OAuth, saved details and redirect preserved.
  const handleAppleSignup = async () => {
    if (isBusy) return
    setError('')

    if (!privacyAcknowledged) {
      setError('Please read and acknowledge the Privacy Policy before signing up.')
      return
    }

    if (!name.trim() || !phone.trim() || !dob.trim()) {
      setError('Enter your restaurant name, phone number and date of birth to continue with Apple sign-up.')
      return
    }

    if (phone.trim().replace(/\D/g, '').length !== 10) {
      setError('Please enter a valid 10-digit phone number.')
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

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: 'apple',
        options: { redirectTo },
      })

      if (oauthError) {
        localStorage.removeItem('digitaldining_apple_registration')
        throw oauthError
      }
    } catch (err) {
      console.error('APPLE SIGN-UP ERROR:', err)
      setError(err?.message || 'Something went wrong while starting Apple sign-up.')
      setAppleLoading(false)
    }
  }

  // SAFE BIOMETRIC SETUP: existing support checks and verification preserved.
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

      const { data: passkeyListData, error: passkeyListError } =
        await supabase.auth.passkey.list()

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
          reason: 'Supabase Auth did not return a registered passkey after enrollment.',
        }
      }

      return {
        success: true,
        skipped: false,
        passkeyCount: registeredPasskeys.length,
      }
    } catch (err) {
      console.error('UNEXPECTED PASSKEY REGISTRATION ERROR:', err)
      return {
        success: false,
        skipped: false,
        reason: getPasskeyErrorMessage(err),
      }
    } finally {
      setBiometricLoading(false)
    }
  }

  // PASSWORD REGISTRATION: original API and approval flow preserved.
  const handleRegister = async (e) => {
    e.preventDefault()
    setError('')
    setNotice('')

    if (!privacyAcknowledged) {
      setError('Please read and acknowledge the Privacy Policy to create an account.')
      return
    }

    if (!name.trim() || !email.trim() || !phone.trim() || !dob.trim() || !password.trim()) {
      setError('Please fill out all required fields, including your date of birth.')
      return
    }

    if (phone.trim().replace(/\D/g, '').length !== 10) {
      setError('Please enter a valid 10-digit phone number.')
      return
    }

    if (password.trim().length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }

    setLoading(true)

    try {
      const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
        throw new Error('Account was created, but the restaurant ID was not returned.')
      }

      const { data: authData, error: signInError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password: password.trim(),
        })

      if (signInError || !authData?.user) {
        setNotice('Your restaurant account was created successfully. Please sign in to continue.')
        setRegistrationComplete(true)
        return
      }

      if (!biometricEnabled) {
        try {
          localStorage.setItem('digitaldining_biometric_enabled', 'false')
        } catch {}

        setRegistrationComplete(true)
        return
      }

      const biometricResult = await tryRegisterBiometric()

      if (biometricResult.success) {
        try {
          localStorage.setItem('digitaldining_biometric_enabled', 'true')
        } catch {}
        setNotice('Biometric login is enabled for your account.')
      } else if (biometricResult.reason === 'unsupported_domain_or_browser') {
        setNotice(
          'Biometric setup is available after opening the website on the supported HTTPS domain. You can continue without it.'
        )
      } else if (
        String(biometricResult.reason || '').includes('Supabase passkey API is unavailable')
      ) {
        setNotice(
          'Your account was created, but biometric setup cannot run because the installed Supabase client is too old. Upgrade @supabase/supabase-js to v2.105.0 or newer.'
        )
      } else {
        const biometricReason = String(biometricResult.reason || '').trim()
        setNotice(
          'Your account was created, but biometric setup could not be completed.' +
            (biometricReason ? ` Reason: ${biometricReason}.` : '') +
            ' You can repair biometric setup from the owner login later.'
        )
      }

      setRegistrationComplete(true)
    } catch (err) {
      console.error('REGISTRATION ERROR:', err)
      setError(err?.message || 'Something went wrong. Please try again.')
    } finally {
      setBiometricLoading(false)
      setLoading(false)
    }
  }

  // SUCCESS STATE
  if (registrationComplete) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-neutral-50 px-4 py-6 text-neutral-950">
        <section className="w-full max-w-md rounded-3xl border border-neutral-200 bg-white p-6 text-center shadow-xl shadow-neutral-200/50 sm:p-8">
          <div
            className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-xl font-bold text-emerald-600"
            aria-hidden="true"
          >
            ✓
          </div>

          <h1 className="mt-4 text-xl font-black tracking-tight sm:text-2xl">Registration submitted</h1>
          <p className="mt-2 text-sm leading-6 text-neutral-500">
            Your partner account has been created. Digital Dine will review your registration.
            Once approved, you can activate your prepaid wallet with an initial recharge of ₹5,000.
          </p>

          {notice && (
            <div
              role="status"
              className="mt-4 rounded-xl border border-orange-100 bg-orange-50/60 px-4 py-3 text-left text-xs leading-5 text-neutral-700"
            >
              {notice}
            </div>
          )}

          <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-4 text-left">
            <p className="text-xs font-bold text-neutral-800">Next step: wallet activation</p>
            <p className="mt-1 text-xs leading-5 text-neutral-500">
              No subscription payment is required. Recharge will be available after administrator
              approval and secure payment setup. Do not send money until the verified recharge page
              is enabled.
            </p>
          </div>

          <p className="mt-4 text-xs text-neutral-500">
            You can review our{' '}
            <Link href="/privacy-policy" className="font-semibold text-orange-600 underline underline-offset-2">
              Privacy Policy
            </Link>
            {' '}at any time.
          </p>

          <button
            type="button"
            onClick={() => router.push('/login')}
            className="mt-5 h-12 w-full rounded-xl bg-orange-500 text-sm font-bold text-neutral-950 shadow-sm transition hover:bg-orange-400 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200"
          >
            Continue to login
          </button>
        </section>
      </main>
    )
  }

  // FORM
  return (
    <main className="min-h-[100dvh] bg-neutral-50 text-neutral-950">
      <div className="mx-auto grid min-h-[100dvh] w-full max-w-6xl lg:grid-cols-2">

        {/* Brand panel: desktop only */}
        <aside className="relative hidden flex-col justify-between overflow-hidden bg-neutral-950 p-12 text-white lg:flex">
          <div className="absolute -right-24 -top-24 h-96 w-96 rounded-full bg-orange-500/20 blur-3xl" />
          <div className="absolute -bottom-32 -left-16 h-80 w-80 rounded-full bg-orange-400/10 blur-3xl" />

          <div className="relative flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-500 text-sm font-black text-neutral-950">
              DD
            </div>
            <div>
              <p className="text-sm font-bold">Digital Dine</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-orange-400">
                Partner Registration
              </p>
            </div>
          </div>

          <div className="relative max-w-sm">
            <h2 className="text-4xl font-black leading-tight tracking-tight">
              Bring your restaurant online.
            </h2>
            <p className="mt-4 text-sm leading-6 text-neutral-400">
              Register once, get approved, then activate your prepaid wallet to start running your
              business on Digital Dine.
            </p>

            <ul className="mt-8 space-y-3 text-sm text-neutral-300">
              <li className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500/20 text-xs font-bold text-orange-400">1</span>
                Submit your restaurant details
              </li>
              <li className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500/20 text-xs font-bold text-orange-400">2</span>
                Wait for admin approval
              </li>
              <li className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-orange-500/20 text-xs font-bold text-orange-400">3</span>
                Activate your wallet
              </li>
            </ul>
          </div>

          <p className="relative text-xs text-neutral-500">
            © {new Date().getFullYear()} Digital Dine
          </p>
        </aside>

        {/* Form panel: fits the screen height on mobile */}
        <section className="flex min-h-[100dvh] flex-col px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-8 sm:py-10">
          <div className="mx-auto flex w-full max-w-lg flex-1 flex-col justify-center gap-4 sm:gap-6">

            {/* Top bar */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => router.push('/login')}
                aria-label="Back to login"
                className="inline-flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-200 bg-white text-sm font-bold shadow-sm transition hover:bg-neutral-50 sm:h-10 sm:w-10"
              >
                ←
              </button>
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-orange-600 lg:hidden">
                Digital Dine
              </span>
            </div>

            {/* Heading */}
            <div>
              <p className="hidden text-xs font-bold uppercase tracking-[0.18em] text-orange-600 sm:block">
                Partner Registration
              </p>
              <h1 className="text-2xl font-black tracking-tight sm:mt-2 sm:text-3xl">
                Create your account
              </h1>
              <p className="mt-1 text-xs text-neutral-500 sm:mt-2 sm:text-sm">
                Register your restaurant to get started.
              </p>
            </div>

            <form onSubmit={handleRegister} className="space-y-4 sm:space-y-6" noValidate>

              {/* Restaurant details */}
              <fieldset disabled={isBusy} className="space-y-3 sm:space-y-5">
                <legend className={sectionTitleClassName}>Restaurant details</legend>

                <div>
                  <label htmlFor="restaurant-name" className={labelClassName}>
                    Restaurant name
                  </label>
                  <input
                    id="restaurant-name"
                    type="text"
                    name="restaurantName"
                    placeholder="Enter restaurant name"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setError('') }}
                    autoComplete="organization"
                    className={inputClassName}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 sm:gap-5">
                  <div>
                    <label htmlFor="register-phone" className={labelClassName}>
                      Phone number
                    </label>
                    <input
                      id="register-phone"
                      type="tel"
                      name="phone"
                      inputMode="numeric"
                      maxLength={10}
                      placeholder="9876543210"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))
                        setError('')
                      }}
                      autoComplete="tel"
                      className={inputClassName}
                    />
                  </div>

                  <div>
                    <label htmlFor="register-dob" className={labelClassName}>
                      Date of birth
                    </label>
                    <input
                      id="register-dob"
                      type="date"
                      name="dob"
                      value={dob}
                      onChange={(e) => { setDob(e.target.value); setError('') }}
                      autoComplete="bday"
                      className={inputClassName}
                    />
                  </div>
                </div>
              </fieldset>

              {/* Owner account */}
              <fieldset disabled={isBusy} className="space-y-3 sm:space-y-5">
                <legend className={sectionTitleClassName}>Owner account</legend>

                <div>
                  <label htmlFor="register-email" className={labelClassName}>
                    Email address
                  </label>
                  <input
                    id="register-email"
                    type="email"
                    name="email"
                    placeholder="owner@example.com"
                    value={email}
                    onChange={(e) => { setEmail(e.target.value); setError('') }}
                    autoComplete="email"
                    className={inputClassName}
                  />
                </div>

                <div>
                  <label htmlFor="register-password" className={labelClassName}>
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="register-password"
                      type={showPassword ? 'text' : 'password'}
                      name="password"
                      placeholder="At least 6 characters"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); setError('') }}
                      minLength={6}
                      autoComplete="new-password"
                      className={`${inputClassName} pr-16`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-neutral-500 transition hover:bg-neutral-200/60 hover:text-neutral-800"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>
              </fieldset>

              {/* Security */}
              <fieldset disabled={isBusy}>
                <legend className={sectionTitleClassName}>Security</legend>

                <div className="flex items-center justify-between gap-4 rounded-xl border border-neutral-200 bg-white px-3.5 py-2.5 sm:py-3.5">
                  <div className="min-w-0">
                    <label htmlFor="biometric-toggle" className="text-sm font-semibold text-neutral-800">
                      Biometric login
                    </label>
                    <p className="text-xs leading-5 text-neutral-500">
                      Face ID, fingerprint or Windows Hello
                    </p>
                  </div>
                  <button
                    id="biometric-toggle"
                    type="button"
                    role="switch"
                    aria-checked={biometricEnabled}
                    onClick={() => setBiometricEnabled((v) => !v)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200 ${
                      biometricEnabled ? 'bg-orange-500' : 'bg-neutral-300'
                    }`}
                  >
                    <span
                      className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                        biometricEnabled ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              </fieldset>

              {/* Privacy notice acknowledgment applies to password, Google and Apple signup. */}
              <div className="rounded-xl border border-neutral-200 bg-white px-3.5 py-3.5">
                <div className="flex items-start gap-3">
                  <input
                    id="register-privacy-acknowledgment"
                    type="checkbox"
                    checked={privacyAcknowledged}
                    disabled={isBusy}
                    onChange={(event) => {
                      setPrivacyAcknowledged(event.target.checked)
                      setError('')
                    }}
                    aria-describedby="register-privacy-description"
                    className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-orange-500 disabled:cursor-not-allowed"
                  />
                  <div className="min-w-0 text-xs leading-5 text-neutral-600">
                    <label
                      htmlFor="register-privacy-acknowledgment"
                      className="cursor-pointer font-medium text-neutral-800"
                    >
                      I have read the Privacy Policy and understand how my personal data is used
                      for registration and account services.
                    </label>
                    <p id="register-privacy-description" className="mt-1 text-neutral-500">
                      Read our{' '}
                      <Link
                        href="/privacy-policy"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-bold text-orange-600 underline underline-offset-2 hover:text-orange-700"
                      >
                        Privacy Policy
                      </Link>
                      {' '}before continuing with email, Google or Apple signup.
                    </p>
                  </div>
                </div>
              </div>

              {error && (
                <div
                  role="alert"
                  className="rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-medium leading-5 text-red-700"
                >
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={isBusy}
                className="h-12 w-full rounded-xl bg-orange-500 text-sm font-bold text-neutral-950 shadow-sm transition hover:bg-orange-400 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {biometricLoading
                  ? 'Setting up biometrics…'
                  : loading
                  ? 'Creating account…'
                  : 'Create account'}
              </button>

              {/* Social sign-up: visible without scrolling */}
              <div className="relative py-0.5 text-center">
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="h-px w-full bg-neutral-200" />
                </div>
                <span className="relative bg-neutral-50 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-400">
                  or sign up with
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={handleGoogleSignup}
                  disabled={isBusy}
                  className="flex h-11 items-center justify-center gap-2.5 rounded-xl border border-neutral-200 bg-white text-sm font-semibold text-neutral-800 transition hover:bg-neutral-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {googleLoading ? (
                    <span
                      className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-800"
                      aria-label="Loading"
                    />
                  ) : (
                    <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M21.35 12.27c0-.78-.07-1.53-.22-2.27H12v4.3h5.24a4.48 4.48 0 0 1-1.94 2.94v2.45h3.14c1.84-1.69 2.91-4.18 2.91-7.42Z" />
                      <path fill="#34A853" d="M12 21.75c2.63 0 4.84-.87 6.45-2.36l-3.14-2.45c-.87.58-1.98.92-3.31.92-2.54 0-4.69-1.72-5.46-4.03H3.3v2.53A9.75 9.75 0 0 0 12 21.75Z" />
                      <path fill="#FBBC05" d="M6.54 13.83A5.86 5.86 0 0 1 6.23 12c0-.64.11-1.26.31-1.83V7.64H3.3A9.75 9.75 0 0 0 2.25 12c0 1.57.38 3.05 1.05 4.36l3.24-2.53Z" />
                      <path fill="#EA4335" d="M12 6.14c1.43 0 2.71.49 3.72 1.45l2.79-2.79C16.84 3.21 14.63 2.25 12 2.25a9.75 9.75 0 0 0-8.7 5.39l3.24 2.53C7.31 7.86 9.46 6.14 12 6.14Z" />
                    </svg>
                  )}
                  Google
                </button>

                <button
                  type="button"
                  onClick={handleAppleSignup}
                  disabled={isBusy}
                  className="flex h-11 items-center justify-center gap-2.5 rounded-xl bg-neutral-950 text-sm font-semibold text-white transition hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-orange-100 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {appleLoading ? (
                    <span
                      className="h-4 w-4 animate-spin rounded-full border-2 border-neutral-600 border-t-white"
                      aria-label="Loading"
                    />
                  ) : (
                    <svg aria-hidden="true" width="17" height="17" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M17.05 12.54c-.02-2.15 1.76-3.18 1.84-3.23-1.01-1.47-2.58-1.67-3.13-1.69-1.31-.14-2.58.78-3.25.78-.68 0-1.72-.76-2.82-.74-1.45.02-2.79.84-3.54 2.14-1.52 2.63-.39 6.5 1.08 8.63.74 1.04 1.59 2.19 2.72 2.15 1.09-.04 1.5-.69 2.81-.69 1.31 0 1.68.69 2.82.67 1.17-.02 1.9-1.05 2.61-2.1.83-1.21 1.17-2.38 1.19-2.44-.03-.01-2.29-.88-2.31-3.48ZM14.9 6.22c.6-.73 1.01-1.74.9-2.74-.87.04-1.93.58-2.55 1.3-.56.64-1.06 1.66-.93 2.64.97.08 1.96-.49 2.58-1.2Z" />
                    </svg>
                  )}
                  Apple
                </button>
              </div>

              <p className="hidden text-center text-xs leading-5 text-neutral-400 sm:block">
                For Google sign-up, enter your phone number and date of birth first.
                Apple sign-up also requires a restaurant name.
              </p>
            </form>

            <div className="text-center">
              <p className="text-sm text-neutral-500">
                Already have an account?{' '}
                <button
                  type="button"
                  onClick={() => router.push('/login')}
                  className="font-bold text-orange-600 underline-offset-4 hover:text-orange-700 hover:underline"
                >
                  Sign in
                </button>
              </p>
              <p className="mt-2 text-[11px] leading-4 text-neutral-400">
                Registration is subject to admin approval. Wallet activation follows approval.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  )
}