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
    <>
      <style>{`
        .register-scene { position: relative; isolation: isolate; overflow: hidden; min-height: 100vh; background: radial-gradient(ellipse at 50% 8%, rgba(55,77,151,.42) 0%, transparent 42%), radial-gradient(ellipse at 15% 80%, rgba(84,35,130,.32) 0%, transparent 38%), radial-gradient(ellipse at 88% 42%, rgba(13,103,153,.22) 0%, transparent 35%), linear-gradient(180deg, #030617 0%, #07102b 48%, #02030d 100%); }
        .register-scene::before { content: ''; position: absolute; inset: 0; pointer-events: none; z-index: -5; opacity: .95; background-image: radial-gradient(circle at 4% 12%, #fff 0 1px, transparent 1.8px), radial-gradient(circle at 18% 72%, #b8d7ff 0 1px, transparent 1.8px), radial-gradient(circle at 31% 21%, #fff 0 1.2px, transparent 2px), radial-gradient(circle at 47% 86%, #d6c7ff 0 1px, transparent 1.8px), radial-gradient(circle at 62% 13%, #fff 0 1px, transparent 1.8px), radial-gradient(circle at 74% 63%, #b8d7ff 0 1.2px, transparent 2px), radial-gradient(circle at 89% 20%, #fff 0 1px, transparent 1.8px), radial-gradient(circle at 96% 84%, #d6c7ff 0 1px, transparent 1.8px); background-size: 170px 170px, 230px 230px, 190px 190px, 280px 280px, 210px 210px, 250px 250px, 180px 180px, 310px 310px; animation: star-drift 22s linear infinite; }
        .register-scene::after { content: ''; position: absolute; inset: 0; pointer-events: none; z-index: -4; background: radial-gradient(ellipse at 50% 105%, rgba(35,67,140,.36), transparent 48%), linear-gradient(115deg, transparent 0 38%, rgba(120,92,220,.06) 45%, transparent 54%); }
        .space-stars { position: absolute; inset: 0; pointer-events: none; z-index: -3; overflow: hidden; }
        .space-stars::before, .space-stars::after { content: ''; position: absolute; width: 2px; height: 2px; border-radius: 50%; background: #fff; box-shadow: 7vw 12vh #fff, 14vw 34vh #9ecbff, 22vw 8vh #fff, 29vw 54vh #d8c6ff, 37vw 20vh #fff, 43vw 72vh #9ecbff, 51vw 12vh #fff, 58vw 42vh #d8c6ff, 66vw 25vh #fff, 72vw 82vh #9ecbff, 81vw 14vh #fff, 91vw 48vh #d8c6ff, 96vw 76vh #fff, 11vw 90vh #9ecbff, 34vw 92vh #fff, 84vw 92vh #fff; opacity: .85; animation: twinkle 3.5s ease-in-out infinite alternate; }
        .space-stars::after { width: 3px; height: 3px; opacity: .55; transform: translate(20px, 12px); animation-delay: -1.4s; }
        .space-ship { position: absolute; left: 4%; bottom: 7%; width: clamp(150px, 24vw, 310px); pointer-events: none; z-index: -1; filter: drop-shadow(0 0 18px rgba(80,174,255,.55)); animation: ship-float 7s ease-in-out infinite; transform: rotate(-8deg); }
        .space-ship .ship-flame { transform-origin: center top; animation: flame-flicker .24s ease-in-out infinite alternate; }
        .asteroid { position: absolute; border-radius: 42% 58% 55% 45%; pointer-events: none; z-index: -2; background: radial-gradient(circle at 30% 25%, #9b9bad 0 5%, #55566d 25%, #272b42 62%, #111426 100%); box-shadow: inset -10px -12px 18px rgba(0,0,0,.55), 0 0 12px rgba(130,145,190,.14); opacity: .9; }
        .asteroid::before, .asteroid::after { content: ''; position: absolute; border-radius: 50%; background: rgba(10,13,29,.55); box-shadow: inset 2px 2px 4px rgba(0,0,0,.35); }
        .asteroid::before { width: 18%; height: 18%; left: 23%; top: 27%; }
        .asteroid::after { width: 25%; height: 20%; right: 18%; bottom: 20%; }
        .asteroid-one { width: 72px; height: 58px; top: 13%; left: 7%; animation: asteroid-float-one 14s ease-in-out infinite; }
        .asteroid-two { width: 105px; height: 82px; top: 18%; right: 5%; transform: rotate(28deg); animation: asteroid-float-two 18s ease-in-out infinite; }
        .asteroid-three { width: 48px; height: 40px; bottom: 16%; right: 18%; transform: rotate(-18deg); animation: asteroid-float-three 11s ease-in-out infinite; }
        .asteroid-four { width: 34px; height: 28px; top: 55%; left: 18%; animation: asteroid-float-three 13s ease-in-out infinite reverse; opacity: .65; }
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
        @keyframes firefly-pulse { from { opacity: .58; transform: scale(.82); } to { opacity: 1; transform: scale(1.18); } }
        @keyframes firefly-halo { from { transform: scale(.8); opacity: .3; } to { transform: scale(1.18); opacity: .8; } }
        @keyframes trail-fade { 0% { opacity: .75; transform: scale(1); } 100% { opacity: 0; transform: scale(.1) translateY(12px); } }
        @keyframes button-gradient { 0%,100% { background-position: 0% 50%; } 50% { background-position: 100% 50%; } }
        @keyframes button-shine { 0%,55% { left: -75%; } 78%,100% { left: 135%; } }
        @keyframes tiny-glow { from { opacity: .45; box-shadow: 0 0 6px #ffc04d; } to { opacity: 1; box-shadow: 0 0 16px #fff0ae; } }
        @keyframes star-drift { from { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(-8px,10px) scale(1.02); } to { transform: translate3d(6px,18px) scale(1); } }
        @keyframes twinkle { from { opacity: .35; transform: scale(.8); } to { opacity: 1; transform: scale(1.2); } }
        @keyframes ship-float { 0%,100% { transform: translate3d(0,0,0) rotate(-8deg); } 50% { transform: translate3d(18px,-16px,0) rotate(-4deg); } }
        @keyframes flame-flicker { from { transform: scaleY(.72) scaleX(.82); opacity: .65; } to { transform: scaleY(1.2) scaleX(1.08); opacity: 1; } }
        @keyframes asteroid-float-one { 0%,100% { transform: translate3d(0,0,0) rotate(0deg); } 50% { transform: translate3d(24px,18px,0) rotate(130deg); } }
        @keyframes asteroid-float-two { 0%,100% { transform: translate3d(0,0,0) rotate(28deg); } 50% { transform: translate3d(-28px,22px,0) rotate(150deg); } }
        @keyframes asteroid-float-three { 0%,100% { transform: translate3d(0,0,0) rotate(-18deg); } 50% { transform: translate3d(-16px,-24px,0) rotate(80deg); } }
        @media (prefers-reduced-motion: reduce) { .firefly-orb, .firefly-orb::before, .firefly-orb::after, .magic-submit, .magic-submit::before, .register-scene::before, .space-stars::before, .space-stars::after, .space-ship, .asteroid { animation: none !important; } }
        @media (max-width: 640px) { .register-scene { padding: 1rem .75rem; } .register-card { border-radius: 1.5rem; padding: 1.25rem !important; } .firefly-orb { width: 10px; height: 10px; } }
      `}</style>

      <div className="register-scene text-white flex items-center justify-center p-4 font-sans py-12">
        <div className="space-stars" aria-hidden="true" />

        <div className="asteroid asteroid-one" aria-hidden="true" />
        <div className="asteroid asteroid-two" aria-hidden="true" />
        <div className="asteroid asteroid-three" aria-hidden="true" />
        <div className="asteroid asteroid-four" aria-hidden="true" />

        <div className="space-ship" aria-hidden="true">
          <svg viewBox="0 0 320 180" width="100%" height="100%" fill="none" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <linearGradient id="shipBodyGradient" x1="45" y1="30" x2="260" y2="145" gradientUnits="userSpaceOnUse">
                <stop stopColor="#F8FBFF" />
                <stop offset=".45" stopColor="#9EB6D8" />
                <stop offset="1" stopColor="#344565" />
              </linearGradient>
              <linearGradient id="shipGlassGradient" x1="115" y1="45" x2="190" y2="105" gradientUnits="userSpaceOnUse">
                <stop stopColor="#B9F4FF" />
                <stop offset="1" stopColor="#3272B7" />
              </linearGradient>
              <linearGradient id="shipFlameGradient" x1="0" y1="0" x2="0" y2="70" gradientUnits="userSpaceOnUse">
                <stop stopColor="#FFF7B2" />
                <stop offset=".45" stopColor="#FFB52E" />
                <stop offset="1" stopColor="#FF4C5B" stopOpacity="0" />
              </linearGradient>
            </defs>
            <ellipse cx="154" cy="146" rx="112" ry="12" fill="#59B9FF" fillOpacity=".16" />
            <path className="ship-flame" d="M72 118C64 136 66 155 82 171C87 151 98 137 111 126L72 118Z" fill="url(#shipFlameGradient)" />
            <path d="M62 112L20 133L74 137L103 119L62 112Z" fill="#516887" stroke="#BFD5F1" strokeWidth="2" />
            <path d="M244 112L296 128L250 139L221 120L244 112Z" fill="#516887" stroke="#BFD5F1" strokeWidth="2" />
            <path d="M47 108C69 72 111 43 160 40C209 43 251 72 274 108L241 128C193 145 127 145 79 128L47 108Z" fill="url(#shipBodyGradient)" stroke="#D9E8FF" strokeWidth="3" />
            <path d="M111 80C122 56 143 49 160 49C177 49 198 56 209 80L198 102C176 111 144 111 122 102L111 80Z" fill="url(#shipGlassGradient)" stroke="#D8FAFF" strokeWidth="2" />
            <path d="M129 65C141 56 153 53 163 54" stroke="white" strokeOpacity=".8" strokeWidth="4" strokeLinecap="round" />
            <circle cx="91" cy="112" r="6" fill="#FFCC57" />
            <circle cx="229" cy="112" r="6" fill="#6DE7FF" />
            <path d="M80 126C126 137 194 137 240 126" stroke="#263650" strokeWidth="4" strokeLinecap="round" />
          </svg>
        </div>

        <div ref={trailContainerRef} aria-hidden="true" />

        <div
          ref={fireflyRef}
          className="firefly-orb"
          aria-hidden="true"
        />

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
