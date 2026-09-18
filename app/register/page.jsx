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
        console.error(
          'GOOGLE SIGN-UP ERROR:',
          error
        )

        localStorage.removeItem(
          'digitaldining_google_registration'
        )

        throw new Error(
          error.message ||
            'Google sign-up could not be started.'
        )
      }
    } catch (error) {
      console.error(
        'GOOGLE SIGN-UP EXCEPTION:',
        error
      )

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
          reason: getPasskeyErrorMessage(
            passkeyError
          ),
        }
      }

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

    if (
      phone.trim().replace(/\D/g, '').length !== 10
    ) {
      alert(
        'Please enter a valid 10-digit phone number.'
      )
      return
    }

    if (password.trim().length < 6) {
      alert(
        'Password must be at least 6 characters.'
      )
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
    <main className="min-h-screen relative overflow-hidden bg-[#210b35] text-white font-sans">

      {/* ======================================================
          BACKGROUND
      ====================================================== */}

      <div className="absolute inset-0 bg-gradient-to-br from-[#260735] via-[#63147d] to-[#d04aa6]" />

      <div className="absolute -top-32 -left-32 w-[420px] h-[420px] rounded-full bg-fuchsia-500/20 blur-[120px]" />

      <div className="absolute top-[35%] -right-32 w-[420px] h-[420px] rounded-full bg-purple-400/20 blur-[120px]" />

      <div className="absolute bottom-[-180px] left-[25%] w-[600px] h-[400px] rounded-full bg-pink-500/20 blur-[140px]" />

      {/* ======================================================
          NAVIGATION
          ====================================================== */}

      <header className="relative z-20 px-5 sm:px-8 pt-5">

        <nav className="mx-auto max-w-6xl">

          <div className="h-14 px-4 sm:px-6 rounded-2xl border border-white/15 bg-white/[0.08] backdrop-blur-xl flex items-center justify-between shadow-[0_10px_40px_rgba(0,0,0,0.15)]">

            {/* LOGO */}

            <div className="flex items-center gap-2.5">

              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-fuchsia-400 to-purple-500 flex items-center justify-center shadow-lg shadow-purple-900/30">

                <svg
                  width="17"
                  height="17"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="white"
                  strokeWidth="2"
                >
                  <path d="M6 3v18" />
                  <path d="M6 3c3 1 5 3 5 6s-2 5-5 6" />
                  <path d="M15 3v18" />
                  <path d="M15 3v6" />
                  <path d="M15 9c3 0 4-2 4-4" />
                </svg>

              </div>

              <span className="text-sm font-black tracking-tight">
                Digital Dining
              </span>

            </div>

            {/* NAV LINKS */}

            <div className="hidden md:flex items-center gap-7 text-[11px] text-white/60 font-semibold">

              <span className="hover:text-white transition cursor-pointer">
                Home
              </span>

              <span className="hover:text-white transition cursor-pointer">
                Services
              </span>

              <span className="hover:text-white transition cursor-pointer">
                Contact
              </span>

              <span className="hover:text-white transition cursor-pointer">
                About
              </span>

            </div>

            {/* LOGIN */}

            <button
              type="button"
              onClick={() => router.push('/login')}
              className="text-[10px] font-bold px-4 py-2 rounded-lg border border-white/20 bg-white/10 hover:bg-white/20 transition"
            >
              Login
            </button>

          </div>

        </nav>

      </header>

      {/* ======================================================
          MAIN
      ====================================================== */}

      <section className="relative z-10 min-h-[calc(100vh-74px)] flex items-center justify-center px-4 py-10 sm:py-14">

        <div className="w-full max-w-[520px]">

          {/* TOP BADGE */}

          <div className="text-center mb-5">

            <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-white/15 bg-white/10 backdrop-blur-md text-[9px] uppercase tracking-[0.2em] font-bold text-white/70">

              <span className="w-1.5 h-1.5 rounded-full bg-fuchsia-300 shadow-[0_0_8px_#f0abfc]" />

              Step 1 of 2

            </div>

          </div>

          {/* ==================================================
              REGISTRATION CARD
              ================================================== */}

          <div className="relative">

            {/* Glow */}

            <div className="absolute inset-4 rounded-[32px] bg-fuchsia-500/20 blur-3xl" />

            <div className="relative rounded-[30px] border border-white/20 bg-[#351044]/70 backdrop-blur-2xl shadow-[0_30px_80px_rgba(18,0,30,0.4)] overflow-hidden">

              {/* Top gradient line */}

              <div className="h-1 w-full bg-gradient-to-r from-fuchsia-400 via-purple-300 to-pink-400" />

              <div className="p-6 sm:p-8">

                {/* HEADER */}

                <div className="text-center mb-7">

                  <div className="mx-auto mb-4 w-12 h-12 rounded-2xl bg-gradient-to-br from-fuchsia-400/30 to-purple-500/30 border border-white/15 flex items-center justify-center">

                    <svg
                      width="23"
                      height="23"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="white"
                      strokeWidth="1.7"
                    >
                      <path d="M20 21a8 8 0 0 0-16 0" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>

                  </div>

                  <h1 className="text-2xl sm:text-[27px] font-black tracking-tight">
                    Create Partner Account
                  </h1>

                  <p className="text-xs text-white/50 mt-2">
                    Set up your digital dining credentials
                    and owner profile.
                  </p>

                </div>

                {/* =================================================
                    BIOMETRIC INFO
                    ================================================= */}

                <div className="mb-6 rounded-2xl border border-fuchsia-300/15 bg-fuchsia-400/[0.07] p-4">

                  <div className="flex gap-3">

                    <div className="w-9 h-9 flex-shrink-0 rounded-xl bg-fuchsia-400/10 border border-fuchsia-300/10 flex items-center justify-center">

                      <svg
                        width="19"
                        height="19"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#f0abfc"
                        strokeWidth="1.8"
                      >
                        <rect
                          x="4"
                          y="10"
                          width="16"
                          height="11"
                          rx="2"
                        />
                        <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                      </svg>

                    </div>

                    <div>

                      <p className="text-xs font-extrabold text-fuchsia-200">
                        Secure biometric login
                      </p>

                      <p className="text-[10px] leading-relaxed text-white/45 mt-1.5">
                        Use Face ID, fingerprint, Windows
                        Hello, Touch ID, device PIN or another
                        supported passkey method.
                      </p>

                      <p className="text-[10px] leading-relaxed text-white/30 mt-1.5">
                        Your biometric data stays on your
                        device.
                      </p>

                    </div>

                  </div>

                </div>

                {/* =================================================
                    FORM
                    ================================================= */}

                <form
                  onSubmit={handleRegister}
                  className="space-y-4"
                >

                  {/* RESTAURANT */}

                  <div>

                    <label className="block text-[10px] font-bold text-white/60 mb-1.5">
                      Restaurant Name
                    </label>

                    <div className="relative">

                      <svg
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30"
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.7"
                      >
                        <path d="M3 21h18" />
                        <path d="M5 21V5l7-2 7 2v16" />
                        <path d="M9 9h1" />
                        <path d="M14 9h1" />
                        <path d="M9 13h1" />
                        <path d="M14 13h1" />
                      </svg>

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
                        className="ui-input pl-10"
                      />

                    </div>

                  </div>

                  {/* EMAIL + PHONE */}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                    <div>

                      <label className="block text-[10px] font-bold text-white/60 mb-1.5">
                        Email Address
                      </label>

                      <div className="relative">

                        <svg
                          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30"
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                        >
                          <rect
                            x="3"
                            y="5"
                            width="18"
                            height="14"
                            rx="2"
                          />
                          <path d="m3 7 9 6 9-6" />
                        </svg>

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
                          className="ui-input pl-10"
                        />

                      </div>

                    </div>

                    <div>

                      <label className="block text-[10px] font-bold text-white/60 mb-1.5">
                        Phone Number
                      </label>

                      <div className="relative">

                        <svg
                          className="absolute left-3.5 top-1/2 -translate-y-1/2 text-white/30"
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.7"
                        >
                          <path d="M22 16.92v3a2 2 0 0 1-2.18 2A19.8 19.8 0 0 1 3.07 5.18 2 2 0 0 1 5.06 3h3a2 2 0 0 1 2 1.72c.12.9.33 1.78.62 2.63a2 2 0 0 1-.45 2.11L9 10.73a16 16 0 0 0 4.27 4.27l1.27-1.27a2 2 0 0 1 2.11-.45c.85.29 1.73.5 2.63.62A2 2 0 0 1 21 15.92Z" />
                        </svg>

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
                          className="ui-input pl-10"
                        />

                      </div>

                    </div>

                  </div>

                  {/* DOB + PASSWORD */}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

                    <div>

                      <label className="block text-[10px] font-bold text-white/60 mb-1.5">
                        Date of Birth
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
                        className="ui-input"
                      />

                      <p className="text-[9px] text-white/25 mt-1">
                        Used for account security
                      </p>

                    </div>

                    <div>

                      <label className="block text-[10px] font-bold text-white/60 mb-1.5">
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
                        className="ui-input font-mono"
                      />

                      <p className="text-[9px] text-white/25 mt-1">
                        Minimum 6 characters
                      </p>

                    </div>

                  </div>

                  {/* =================================================
                      BIOMETRIC TOGGLE
                      ================================================= */}

                  <div className="rounded-2xl border border-white/10 bg-black/10 p-4">

                    <div className="flex items-center justify-between gap-4">

                      <div className="flex items-center gap-3">

                        <div className="w-9 h-9 flex-shrink-0 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center">

                          <svg
                            width="18"
                            height="18"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke={
                              biometricEnabled
                                ? '#f0abfc'
                                : '#ffffff55'
                            }
                            strokeWidth="1.7"
                          >
                            <path d="M12 3a7 7 0 0 1 7 7v2" />
                            <path d="M12 7a3 3 0 0 1 3 3v3" />
                            <path d="M12 11v7" />
                            <path d="M8 10v2a4 4 0 0 0 4 4" />
                            <path d="M5 10v2a7 7 0 0 0 7 7" />
                            <path d="M19 10v2a7 7 0 0 1-1 3.6" />
                          </svg>

                        </div>

                        <div>

                          <p className="text-xs font-extrabold text-white">
                            Biometric Login
                          </p>

                          <p className="text-[9px] text-white/35 mt-0.5">
                            Fingerprint, Face ID or passkey
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
                          'relative flex-shrink-0 w-11 h-6 rounded-full transition-all duration-300 ' +
                          (
                            biometricEnabled
                              ? 'bg-fuchsia-500 shadow-[0_0_18px_rgba(217,70,239,0.35)]'
                              : 'bg-white/15'
                          )
                        }
                      >

                        <span
                          className={
                            'absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-all duration-300 ' +
                            (
                              biometricEnabled
                                ? 'left-[22px]'
                                : 'left-0.5'
                            )
                          }
                        />

                      </button>

                    </div>

                    <div className="mt-3 pt-3 border-t border-white/5">

                      {biometricEnabled ? (

                        <p className="text-[9px] text-emerald-300/80 font-bold">
                          <span className="mr-1">●</span>
                          ON — Setup will be offered after account creation.
                        </p>

                      ) : (

                        <p className="text-[9px] text-white/30 font-bold">
                          <span className="mr-1">●</span>
                          OFF — You can use email and password to login.
                        </p>

                      )}

                    </div>

                  </div>

                  {/* =================================================
                      CREATE ACCOUNT
                      ================================================= */}

                  <button
                    type="submit"
                    disabled={isBusy}
                    className="group relative w-full overflow-hidden rounded-xl py-3.5 text-[10px] uppercase tracking-[0.16em] font-black text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-[0_10px_30px_rgba(217,70,239,0.22)]"
                  >

                    <span className="absolute inset-0 bg-gradient-to-r from-fuchsia-500 via-purple-500 to-pink-500" />

                    <span className="absolute inset-0 bg-gradient-to-r from-fuchsia-400 via-purple-400 to-pink-400 opacity-0 group-hover:opacity-100 transition-opacity" />

                    <span className="relative flex items-center justify-center gap-2">

                      {biometricLoading ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Setting Up Biometric...
                        </>
                      ) : loading ? (
                        <>
                          <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          Creating Account...
                        </>
                      ) : biometricEnabled ? (
                        <>
                          Create Account
                          <span>→</span>
                        </>
                      ) : (
                        <>
                          Create Account
                          <span>→</span>
                        </>
                      )}

                    </span>

                  </button>

                  {/* =================================================
                      DIVIDER
                      ================================================= */}

                  <div className="flex items-center gap-3 py-1">

                    <div className="h-px bg-white/10 flex-1" />

                    <span className="text-[9px] text-white/25 font-bold uppercase tracking-[0.2em]">
                      Or continue with
                    </span>

                    <div className="h-px bg-white/10 flex-1" />

                  </div>

                  {/* =================================================
                      GOOGLE
                      ================================================= */}

                  <button
                    type="button"
                    onClick={handleGoogleSignup}
                    disabled={isBusy}
                    className="w-full bg-white hover:bg-white/90 text-[#24112d] font-extrabold py-3.5 rounded-xl text-[10px] uppercase tracking-wider transition flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
                  >

                    {googleLoading ? (

                      <>
                        <span className="animate-spin h-4 w-4 border-2 border-purple-200 border-t-purple-700 rounded-full" />
                        Connecting...
                      </>

                    ) : (

                      <>
                        <svg
                          width="17"
                          height="17"
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

                  <p className="text-[9px] text-white/25 text-center leading-relaxed px-4">

                    Google sign-up still requires your phone
                    number and date of birth for your restaurant
                    profile and account security.

                  </p>

                </form>

                {/* =================================================
                    FOOTER SECURITY
                    ================================================= */}

                <div className="mt-6 pt-5 border-t border-white/10">

                  <div className="flex items-center justify-center gap-2">

                    <svg
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.7"
                      className="text-fuchsia-300/50"
                    >
                      <rect
                        x="4"
                        y="10"
                        width="16"
                        height="11"
                        rx="2"
                      />
                      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
                    </svg>

                    <p className="text-[9px] text-white/25 text-center">
                      Your biometric information stays on your device.
                    </p>

                  </div>

                </div>

              </div>

            </div>

          </div>

          {/* LOGIN */}

          <p className="text-center text-[10px] text-white/35 mt-5">

            Already have a partner account?{' '}

            <button
              type="button"
              onClick={() => router.push('/login')}
              className="text-fuchsia-200 hover:text-white font-bold transition"
            >
              Login
            </button>

          </p>

        </div>

      </section>

      {/* ======================================================
          GLOBAL INPUT STYLES
          ====================================================== */}

      <style jsx global>{`

        .ui-input {
          width: 100%;
          height: 43px;
          border-radius: 11px;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(10,3,18,0.20);
          color: white;
          padding: 0 14px;
          font-size: 11px;
          outline: none;
          transition:
            border-color 180ms ease,
            background 180ms ease,
            box-shadow 180ms ease;
        }

        .ui-input::placeholder {
          color: rgba(255,255,255,0.22);
        }

        .ui-input:hover {
          border-color: rgba(255,255,255,0.17);
        }

        .ui-input:focus {
          border-color: rgba(232,121,249,0.65);
          background: rgba(10,3,18,0.30);
          box-shadow:
            0 0 0 3px rgba(217,70,239,0.08),
            0 0 20px rgba(217,70,239,0.06);
        }

        .ui-input:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }

        .ui-input[type="date"] {
          color-scheme: dark;
        }

        ::selection {
          background: rgba(217,70,239,0.45);
          color: white;
        }

      `}</style>

    </main>
  )
}