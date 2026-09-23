'use client'

import { useEffect, useRef, useState } from 'react'
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

  // Bird cursor-follow animation
  const birdRef = useRef(null)
  const birdTargetRef = useRef({ x: 0, y: 0 })
  const birdPositionRef = useRef({ x: 0, y: 0 })
  const fireflyRef = useRef(null)
  const fireflyPositionRef = useRef({ x: 0, y: 0 })
  const fireflyTargetRef = useRef({ x: 0, y: 0 })
  const trailContainerRef = useRef(null)

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const initial = {
      x: window.innerWidth * 0.18,
      y: window.innerHeight * 0.24,
    }

    fireflyTargetRef.current = initial
    fireflyPositionRef.current = initial

    const handlePointerMove = (event) => {
      fireflyTargetRef.current = {
        x: event.clientX + 12,
        y: event.clientY - 12,
      }
    }

    const handleTouchMove = (event) => {
      const touch = event.touches?.[0]
      if (!touch) return
      fireflyTargetRef.current = {
        x: touch.clientX + 10,
        y: touch.clientY - 10,
      }
    }

    let frameId
    let lastTrail = 0

    const animateFirefly = (time) => {
      const current = fireflyPositionRef.current
      const target = fireflyTargetRef.current
      current.x += (target.x - current.x) * 0.055
      current.y += (target.y - current.y) * 0.055

      if (fireflyRef.current) {
        fireflyRef.current.style.transform = `translate3d(${current.x}px, ${current.y}px, 0)`
      }

      if (trailContainerRef.current && time - lastTrail > 115) {
        const trail = document.createElement('span')
        trail.className = 'firefly-trail'
        trail.style.left = `${current.x + 4}px`
        trail.style.top = `${current.y + 4}px`
        trailContainerRef.current.appendChild(trail)
        window.setTimeout(() => trail.remove(), 1450)
        lastTrail = time
      }

      frameId = window.requestAnimationFrame(animateFirefly)
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    window.addEventListener('touchmove', handleTouchMove, { passive: true })
    frameId = window.requestAnimationFrame(animateFirefly)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('touchmove', handleTouchMove)
      window.cancelAnimationFrame(frameId)
    }
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    birdTargetRef.current = {
      x: window.innerWidth * 0.72,
      y: window.innerHeight * 0.22,
    }

    birdPositionRef.current = {
      x: window.innerWidth * 0.72,
      y: window.innerHeight * 0.22,
    }

    const handlePointerMove = (event) => {
      birdTargetRef.current = {
        x: event.clientX + 22,
        y: event.clientY - 34,
      }
    }

    let animationFrameId

    const animateBird = () => {
      const current = birdPositionRef.current
      const target = birdTargetRef.current

      current.x += (target.x - current.x) * 0.075
      current.y += (target.y - current.y) * 0.075

      if (birdRef.current) {
        birdRef.current.style.transform = `translate3d(${current.x}px, ${current.y}px, 0)`
      }

      animationFrameId = window.requestAnimationFrame(animateBird)
    }

    window.addEventListener('pointermove', handlePointerMove, { passive: true })
    animationFrameId = window.requestAnimationFrame(animateBird)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.cancelAnimationFrame(animationFrameId)
    }
  }, [])

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
  const [focusedField, setFocusedField] = useState('')

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

      const redirectTo =
        `${window.location.origin}/auth/apple-complete`

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
    appleLoading ||
    biometricLoading

  return (
    <>
      <style>{`
        .register-scene { position: relative; isolation: isolate; overflow: hidden; min-height: 100vh; background: radial-gradient(circle at 50% -10%, rgba(255,255,255,.96) 0 8%, transparent 28%), linear-gradient(180deg, #dce8ff 0%, #c9dcfb 38%, #72b5e5 68%, #092d47 100%); }
        .register-scene::before { content: ''; position: absolute; inset: 0; pointer-events: none; z-index: -3; opacity: .42; background-image: radial-gradient(circle at 15% 22%, #fff 0 1px, transparent 2px), radial-gradient(circle at 80% 18%, #fff 0 1px, transparent 2px), radial-gradient(circle at 64% 64%, #fff 0 1px, transparent 2px), radial-gradient(circle at 32% 72%, #fff 0 1px, transparent 2px); background-size: 180px 180px, 230px 230px, 260px 260px, 210px 210px; animation: sky-drift 18s linear infinite; }
        .register-scene::after { content: ''; position: absolute; z-index: -2; pointer-events: none; width: 130vw; height: 34vh; left: -15vw; bottom: -13vh; border-radius: 50% 50% 0 0; background: #061523; box-shadow: 0 -8vh 0 rgba(5,55,82,.78); }
        .register-card { position: relative; background: linear-gradient(180deg, rgba(255,255,255,.90) 0%, rgba(84,151,201,.93) 47%, rgba(7,30,49,.97) 100%); border: 1px solid rgba(255,255,255,.82); box-shadow: 0 28px 70px rgba(2,25,45,.44), inset 0 1px 0 rgba(255,255,255,.62); backdrop-filter: blur(18px); -webkit-backdrop-filter: blur(18px); }
        .register-card::before { content: ''; position: absolute; inset: 1px; border-radius: inherit; pointer-events: none; background: linear-gradient(120deg, rgba(255,255,255,.18), transparent 35%, rgba(255,255,255,.08)); }
        .register-card input { background: rgba(5,24,40,.32) !important; border: 1px solid rgba(255,255,255,.52) !important; color: #fff !important; opacity: 1 !important; font-weight: 600; text-shadow: 0 1px 2px rgba(0,0,0,.35); transition: border-color .18s ease, box-shadow .18s ease, background .18s ease, transform .18s ease; }
        .register-card input::placeholder { color: rgba(255,255,255,.94) !important; opacity: 1 !important; }
        .register-card input:hover { background: rgba(5,24,40,.42) !important; border-color: rgba(255,255,255,.78) !important; }
        .register-card input:focus { outline: none; border-color: #ffd27a !important; background: rgba(5,24,40,.52) !important; box-shadow: 0 0 0 3px rgba(255,190,76,.18), 0 0 22px rgba(255,176,58,.28); transform: translateY(-1px); }
        .register-card label, .register-card p, .register-card h1, .register-card span, .register-card button { color: #fff; text-shadow: 0 2px 4px rgba(0,0,0,.42); }
        .register-card .text-neutral-300, .register-card .text-neutral-400, .register-card .text-neutral-500, .register-card .text-orange-400, .register-card .text-orange-300 { color: #fff !important; opacity: 1 !important; text-shadow: 0 2px 4px rgba(0,0,0,.42); }
        .register-card input:disabled, .register-card button:disabled { opacity: .68 !important; }
        .firefly-orb { position: absolute; width: 12px; height: 12px; border-radius: 999px; pointer-events: none; z-index: 3; background: #fff2b3; box-shadow: 0 0 5px #fff, 0 0 14px #ffc857, 0 0 34px rgba(255,172,45,.95), 0 0 70px rgba(255,145,0,.55); transform: translate3d(0,0,0); will-change: transform; animation: firefly-pulse 1.2s ease-in-out infinite alternate; }
        .firefly-orb::before, .firefly-orb::after { content: ''; position: absolute; inset: -18px; border-radius: inherit; background: radial-gradient(circle, rgba(255,193,70,.32), transparent 68%); animation: firefly-halo 1.8s ease-in-out infinite alternate; }
        .firefly-orb::after { inset: -42px; opacity: .32; animation-delay: -.5s; }
        .firefly-trail { position: absolute; width: 4px; height: 4px; border-radius: 50%; pointer-events: none; z-index: 2; background: #ffd477; box-shadow: 0 0 12px #ffbd4a; opacity: .7; animation: trail-fade 1.4s ease-out forwards; }
        .magic-submit { position: relative; overflow: hidden; isolation: isolate; background: linear-gradient(100deg, #e79a2e, #ffd36f 48%, #e79a2e) !important; background-size: 220% 100%; color: #17202b !important; text-shadow: none !important; box-shadow: 0 8px 24px rgba(190,111,20,.34), inset 0 1px 0 rgba(255,255,255,.65); animation: button-gradient 4s ease-in-out infinite; transition: transform .18s ease, box-shadow .18s ease, filter .18s ease; }
        .magic-submit::before { content: ''; position: absolute; top: 0; left: -75%; width: 45%; height: 100%; transform: skewX(-20deg); background: linear-gradient(90deg, transparent, rgba(255,255,255,.72), transparent); animation: button-shine 3.2s ease-in-out infinite; z-index: -1; }
        .magic-submit:hover:not(:disabled) { transform: translateY(-2px); filter: brightness(1.08); box-shadow: 0 12px 30px rgba(190,111,20,.46), 0 0 22px rgba(255,190,74,.25); }
        .magic-submit:active:not(:disabled) { transform: translateY(0) scale(.985); }
        .field-glow { position: absolute; right: 14px; top: 50%; width: 5px; height: 5px; border-radius: 50%; background: #ffe6a0; box-shadow: 0 0 12px #ffc04d; transform: translateY(-50%); pointer-events: none; animation: tiny-glow 1s ease-in-out infinite alternate; }
        .cursor-bird { position: fixed; top: 0; left: 0; z-index: 50; width: 58px; height: 38px; pointer-events: none; will-change: transform; filter: drop-shadow(0 5px 5px rgba(0,0,0,.2)); opacity: .78; }
        .bird-wing { transform-box: fill-box; transform-origin: center; animation: bird-flap .42s ease-in-out infinite alternate; }
        .bird-wing-reverse { animation-delay: .18s; }
        @keyframes firefly-pulse { from { opacity: .58; transform: scale(.82); } to { opacity: 1; transform: scale(1.18); } }
        @keyframes firefly-halo { from { transform: scale(.8); opacity: .3; } to { transform: scale(1.18); opacity: .8; } }
        @keyframes trail-fade { 0% { opacity: .75; transform: scale(1); } 100% { opacity: 0; transform: scale(.1) translateY(12px); } }
        @keyframes button-gradient { 0%,100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
        @keyframes button-shine { 0%,55% { left: -75%; } 78%,100% { left: 135%; } }
        @keyframes tiny-glow { from { opacity: .45; box-shadow: 0 0 6px #ffc04d; } to { opacity: 1; box-shadow: 0 0 16px #fff0ae; } }
        @keyframes bird-flap { from { transform: rotate(12deg) translateY(1px); } to { transform: rotate(-18deg) translateY(-4px); } }
        @keyframes sky-drift { from { transform: translate3d(0,0,0); } to { transform: translate3d(0,18px,0); } }
        @media (prefers-reduced-motion: reduce) { .firefly-orb, .firefly-orb::before, .firefly-orb::after, .magic-submit, .magic-submit::before, .bird-wing, .register-scene::before { animation: none !important; } }
        @media (max-width: 640px) { .register-scene { padding: 1rem .75rem; } .register-card { border-radius: 1.5rem; padding: 1.25rem !important; } .cursor-bird { width: 46px; height: 30px; } .firefly-orb { width: 10px; height: 10px; } }
      `}</style>

      <div className="register-scene text-white flex items-center justify-center p-4 font-sans py-12">
        <div ref={trailContainerRef} aria-hidden="true" />

        <div
          ref={fireflyRef}
          className="firefly-orb"
          aria-hidden="true"
        />

        <div
          ref={birdRef}
          className="cursor-bird"
          aria-hidden="true"
        >
          <svg viewBox="0 0 120 80" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M7 42C25 18 43 19 58 35C74 11 98 10 114 27C99 26 91 34 83 43C69 59 51 59 36 46C25 37 17 39 7 42Z"
              fill="#111827"
            />
            <path
              className="bird-wing"
              d="M57 36C43 12 28 5 13 12C29 22 37 34 38 47C45 45 51 41 57 36Z"
              fill="#1F2937"
            />
            <path
              className="bird-wing bird-wing-reverse"
              d="M65 35C76 11 94 5 108 13C93 21 84 34 82 46C75 44 70 40 65 35Z"
              fill="#1F2937"
            />
            <circle cx="91" cy="27" r="2.2" fill="#F8FAFC" />
            <circle cx="91.5" cy="27" r="1" fill="#111827" />
            <path d="M112 28L119 31L112 34" fill="#F59E0B" />
          </svg>
        </div>

        <div className="register-card max-w-lg w-full p-8 rounded-3xl space-y-6">

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

        {/* REGISTRATION FORM */}
        <form
          onSubmit={handleRegister}
          onFocus={(e) => {
            if (e.target?.name) setFocusedField(e.target.name)
          }}
          onBlur={(e) => {
            if (e.target?.name) setFocusedField('')
          }}
          className="space-y-4"
        >
          {/* RESTAURANT NAME */}
          <div>
            <label className="text-xs font-bold text-neutral-300 block mb-1">
              Restaurant Name
            </label>

            <input
              type="text"
              name="restaurantName"
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
                name="email"
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
                name="phone"
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
                name="dob"
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
                name="password"
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
            className="magic-submit w-full font-black py-4 rounded-xl text-xs uppercase tracking-wider transition disabled:opacity-50 disabled:cursor-not-allowed"
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

          {/* APPLE SIGN-UP BUTTON */}
          <button
            type="button"
            onClick={handleAppleSignup}
            disabled={isBusy}
            className="w-full bg-black hover:bg-neutral-900 text-white border border-neutral-700 font-black py-4 rounded-xl text-xs uppercase tracking-wider transition flex items-center justify-center gap-3 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {appleLoading ? (
              <>
                <span className="animate-spin h-4 w-4 border-2 border-white/40 border-t-white rounded-full" />
                Connecting to Apple...
              </>
            ) : (
              <>
                <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M17.05 12.54c-.02-2.15 1.76-3.18 1.84-3.23-1.01-1.47-2.58-1.67-3.13-1.69-1.31-.14-2.58.78-3.25.78-.68 0-1.72-.76-2.82-.74-1.45.02-2.79.84-3.54 2.14-1.52 2.63-.39 6.5 1.08 8.63.74 1.04 1.59 2.19 2.72 2.15 1.09-.04 1.5-.69 2.81-.69 1.31 0 1.68.69 2.82.67 1.17-.02 1.9-1.05 2.61-2.1.83-1.21 1.17-2.38 1.19-2.44-.03-.01-2.29-.88-2.31-3.48ZM14.9 6.22c.6-.73 1.01-1.74.9-2.74-.87.04-1.93.58-2.55 1.3-.56.64-1.06 1.66-.93 2.64.97.08 1.96-.49 2.58-1.2Z"/>
                </svg>
                Continue with Apple
              </>
            )}
          </button>

          <p className="text-[10px] text-neutral-500 text-center leading-relaxed">
            Apple sign-up uses your Apple Account for authentication.
            Your restaurant profile still uses the name, phone number
            and date of birth entered above.
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
    </>
  )
}
