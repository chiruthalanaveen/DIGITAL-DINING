'use client'

import { Suspense, useEffect, useMemo, useState } from 'react'

import { useRouter, useSearchParams } from 'next/navigation'
import { startDeliveryGoogleOAuth } from '@/lib/deliveryGoogleAuth'
import { supabase } from '@/lib/supabase'

function safeNextPath(value) {

  const next = String(value || '').trim()

  if (

    !next.startsWith('/delivery') ||

    next.startsWith('//') ||

    next.includes('\\') ||

    /[\r\n]/.test(next)

  ) {

    return '/delivery'

  }

  return next

}

function getStoreCode(searchParams, nextPath) {

  const explicit = String(

    searchParams.get('store') ||

    searchParams.get('restaurantCode') ||

    ''

  ).trim()

  if (/^[A-Za-z0-9_-]{1,80}$/.test(explicit)) {

    return explicit

  }

  const pathname = nextPath.split('?')[0]

  const parts = pathname.split('/').filter(Boolean)

  const reserved = [

    'login',

    'signup',

    'account',

    'orders',

    'checkout',

  ]

  if (

    parts.length >= 2 &&

    parts[0] === 'delivery' &&

    !reserved.includes(parts[1]?.toLowerCase())

  ) {

    try {

      const code = decodeURIComponent(parts[1])

      if (/^[A-Za-z0-9_-]{1,80}$/.test(code)) {

        return code

      }

    } catch {

      return ''

    }

  }

  return ''

}

function SignupLoading() {

  return (

    <main className="flex min-h-dvh items-center justify-center bg-[#f7f8f6]">

      <div className="flex flex-col items-center gap-4">

        <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-600" />

        <p className="text-xs font-bold text-neutral-500">

          Loading registration...

        </p>

      </div>

    </main>

  )

}

function SignupContent() {

  const router = useRouter()

  const searchParams = useSearchParams()

  const nextPath = safeNextPath(searchParams.get('next'))

  const storeCode = useMemo(

    () => getStoreCode(searchParams, nextPath),

    [searchParams, nextPath]

  )

  const [name, setName] = useState('')

  const [mobile, setMobile] = useState('')

  const [pin, setPin] = useState('')

  const [confirmPin, setConfirmPin] = useState('')

  const [showPin, setShowPin] = useState(false)

  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)

  const [error, setError] = useState('')

  const [registered, setRegistered] = useState(false)

  const [recoveryCode, setRecoveryCode] = useState('')

  const [recoverySaved, setRecoverySaved] = useState(false)
  const [otpSent, setOtpSent] = useState(false)
  const [otp, setOtp] = useState('')
  const [otpMobile, setOtpMobile] = useState('')
  const [verifiedAccessToken, setVerifiedAccessToken] = useState('')
  const [signupMode, setSignupMode] = useState('loading')
  const [policyRetry, setPolicyRetry] = useState(0)
  const [securityQuestionKey, setSecurityQuestionKey] = useState('private_phrase')
  const [securityAnswer, setSecurityAnswer] = useState('')

  useEffect(() => {
    let active = true
    const loadSignupMode = async () => {
      if (active) setSignupMode('loading')
      try {
        const response = await fetch('/api/delivery/customer/signup-policy', {
          method: 'GET',
          cache: 'no-store',
          credentials: 'same-origin',
        })
        const result = await response.json().catch(() => null)
        if (response.status === 404) {
          throw new Error('Customer signup settings API is missing. Ask the administrator to install the signup-policy route.')
        }
        if (!response.ok || result?.success !== true || !['otp','pin_question'].includes(result?.signupMode)) {
          throw new Error(
            result?.message || `Unable to load signup settings (HTTP ${response.status}). Please retry.`
          )
        }
        if (active) {
          setSignupMode(result.signupMode)
          setError('')
        }
      } catch (policyError) {
        if (active) {
          setSignupMode('unavailable')
          setError(policyError?.message || 'Signup settings are temporarily unavailable.')
        }
      }
    }
    void loadSignupMode()
    return () => { active = false }
  }, [policyRetry])


  const loginQuery = new URLSearchParams({

    next: nextPath,

  })

  if (storeCode) {

    loginQuery.set('store', storeCode)

  }

  const loginPath = `/delivery/login?${loginQuery.toString()}`

  async function handleGoogleSignup() {
    if (googleLoading || loading) return
    setGoogleLoading(true)
    setError('')

    try {
      // Google authenticates the account; the delivery callback creates
      // the profile. Checkout continues to collect the contact/mobile details.
      await startDeliveryGoogleOAuth({ nextPath, storeCode, mode: 'signup' })
    } catch (googleError) {
      console.error('Delivery Google signup error:', googleError)
      setError(googleError?.message || 'Unable to sign up with Google.')
      setGoogleLoading(false)
    }
  }

  async function handleSignup(event) {
    event.preventDefault()
    if (loading || googleLoading) return
    setError('')

    const cleanName = name.trim()
    const cleanMobile = mobile.replace(/\D/g, '')
    if (!storeCode) {
      setError('Please select a delivery store before creating an account.')
      return
    }
    if (cleanName.length < 2 || cleanName.length > 100) {
      setError('Enter your full name (2–100 characters).')
      return
    }
    if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
      setError('Enter a valid 10-digit Indian mobile number.')
      return
    }
    if (!/^\d{4}$/.test(pin)) {
      setError('Create a valid 4-digit PIN.')
      return
    }
    if (pin !== confirmPin) {
      setError('Your PIN and confirmation PIN do not match.')
      return
    }

    if (signupMode !== 'otp' && signupMode !== 'pin_question') {
      setError('Signup is not configured. Try again after the admin enables registration.')
      return
    }
    if (signupMode === 'pin_question' &&
       (!securityQuestionKey || securityAnswer.trim().length < 8 || new TextEncoder().encode(securityAnswer.trim()).length > 72)) {
      setError('Select a security question and enter a private answer of 8–72 bytes.')
      return
    }

    setLoading(true)
    try {
      if (signupMode === 'pin_question') {
        const response = await fetch('/api/delivery/customer/register-pin-question', {
          method:'POST',credentials:'same-origin',cache:'no-store',
          headers:{'Content-Type':'application/json'},
          body:JSON.stringify({restaurantCode:storeCode,name:cleanName,mobile:cleanMobile,pin,
            securityQuestionKey,securityAnswer}),
        })
        const result = await response.json().catch(() => ({}))
        if (!response.ok || result?.success !== true) throw new Error(result?.message || 'Account registration failed.')
        if (!result?.recoveryCode) throw new Error('Account was created but no recovery code returned. Contact support; do not retry.')
        setRecoveryCode(result.recoveryCode)
        setPin('');setConfirmPin('');setSecurityAnswer('')
        setRegistered(true)
        return
      }
      const phone = `+91${cleanMobile}`
      if (!otpSent) {
        // Supabase Phone Auth must have an SMS provider configured.
        const { error: smsError } = await supabase.auth.signInWithOtp({
          phone,
          options: { shouldCreateUser: true },
        })
        if (smsError) throw smsError
        setOtpSent(true)
        setOtpMobile(cleanMobile)
        setVerifiedAccessToken('')
        setOtp('')
        return
      }

      if (otpMobile !== cleanMobile) {
        throw new Error('Mobile number changed. Please request a fresh OTP.')
      }
      if (!verifiedAccessToken && !/^\d{6,8}$/.test(otp)) {
        throw new Error('Enter the SMS verification code sent to your mobile.')
      }

      let accessToken = verifiedAccessToken
      if (!accessToken) {
        const { data: verification, error: verificationError } = await supabase.auth.verifyOtp({
          phone,
          token: otp.trim(),
          type: 'sms',
        })
        if (verificationError) throw verificationError
        accessToken = verification?.session?.access_token || ''
        if (!accessToken) throw new Error('Phone verified, but no secure session was returned. Retry signing in.')
        setVerifiedAccessToken(accessToken)
      }

      // The server independently verifies this Supabase Auth session and the
      // phone number. PIN/recovery code never go into browser persistence.
      const response = await fetch('/api/delivery/customer/register-verified', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          restaurantCode: storeCode,
          name: cleanName,
          mobile: cleanMobile,
          pin,
        }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok || result?.success !== true) {
        throw new Error(result?.message || 'Unable to create your verified mobile account.')
      }
      if (!result?.recoveryCode) {
        throw new Error('Registration succeeded but the recovery code was not received. Please contact support; do not register again.')
      }
      setRecoveryCode(result.recoveryCode)
      setPin('')
      setConfirmPin('')
      setOtp('')
      setVerifiedAccessToken('')
      setRegistered(true)
    } catch (signupError) {
      const raw = String(signupError?.message || '')
      setError(/unsupported phone provider/i.test(raw)
        ? 'SMS OTP is not configured in Supabase. Ask your platform admin to connect an SMS provider or switch signup to Mobile PIN + security question.'
        : (raw || 'Unable to complete mobile registration. Please try again.'))
    } finally {
      setLoading(false)
    }
  }

  async function resendOtp() {
    if (loading || googleLoading || !otpSent) return
    setLoading(true)
    setError('')
    try {
      const { error: smsError } = await supabase.auth.signInWithOtp({
        phone: `+91${otpMobile}`,
        options: { shouldCreateUser: true },
      })
      if (smsError) throw smsError
      setOtp('')
      setVerifiedAccessToken('')
    } catch (smsError) {
      setError(smsError?.message || 'Unable to resend OTP. Wait a moment and try again.')
    } finally {
      setLoading(false)
    }
  }

  function editMobile() {
    if (loading) return
    setOtpSent(false)
    setOtpMobile('')
    setOtp('')
    setVerifiedAccessToken('')
    setError('')
  }

  async function copyRecoveryCode() {

    try {

      await navigator.clipboard.writeText(recoveryCode)

    } catch {

      setError(

        'Unable to copy automatically. Please write down your recovery code.'

      )

    }

  }

  function continueAfterSignup() {

    if (!recoverySaved) return

    const destination =

      nextPath === '/delivery' && storeCode

        ? `/delivery/${encodeURIComponent(storeCode)}`

        : nextPath

    router.replace(destination)

    router.refresh()

  }

  function renderInput({

    id,

    label,

    value,

    onChange,

    placeholder,

    type = 'text',

    autoComplete,

    maxLength,

    inputMode,

    disabled = false,

  }) {

    return (

      <div>

        <label

          htmlFor={id}

          className="mb-2 block text-xs font-black text-neutral-700"

        >

          {label}

        </label>

        <input

          id={id}

          type={type}

          value={value}

          onChange={onChange}

          placeholder={placeholder}

          autoComplete={autoComplete}

          maxLength={maxLength}

          inputMode={inputMode}

          required
          disabled={disabled}

          className="w-full rounded-2xl border border-neutral-200 bg-neutral-50 px-4 py-3.5 text-sm font-semibold outline-none transition focus:border-emerald-500"

        />

      </div>

    )

  }

  return (

    <main className="min-h-dvh bg-[#f7f8f6] text-neutral-950">

      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))]">

        <header className="flex items-center justify-between">

          <button

            type="button"

            onClick={() => router.push(loginPath)}

            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-neutral-200 bg-white text-lg font-black shadow-sm transition active:scale-95"

            aria-label="Back to login"

          >

            ←

          </button>

          <div className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-emerald-700">

            Delivery

          </div>

        </header>

        <section className="flex flex-1 flex-col justify-center py-8">

          <div className="mb-7">

            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[22px] bg-neutral-950 text-xl font-black italic tracking-[-0.12em] text-white shadow-xl">

              DD

            </div>

            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">

              Digital Dine

            </p>

            <h1 className="mt-2 text-[34px] font-black leading-[1.05] tracking-[-0.04em]">

              {registered ? (

                'Save your recovery code'

              ) : (

                <>

                  Create your

                  <br />

                  delivery account

                </>

              )}

            </h1>

            <p className="mt-4 text-sm font-medium leading-6 text-neutral-500">

              {registered

                ? 'Keep your recovery code safe. PIN recovery requires it along with the security answer, or support for OTP-based accounts.'

                : 'Sign up to manage orders, track deliveries and save your addresses.'}

            </p>

          </div>

          <div className="rounded-[28px] border border-neutral-200 bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.07)]">

            {registered ? (

              <div className="space-y-5">

                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">

                  <p className="text-sm font-black text-emerald-800">

                    Account created successfully!

                  </p>

                  <p className="mt-2 text-xs leading-5 text-emerald-700">

                    Your recovery code is shown only once.

                    Never share it with anyone.

                  </p>

                </div>

                <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-center">

                  <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">

                    Your Recovery Code

                  </p>

                  <p className="mt-3 break-all font-mono text-lg font-black tracking-wider text-neutral-950">

                    {recoveryCode}

                  </p>

                </div>

                <button

                  type="button"

                  onClick={copyRecoveryCode}

                  className="w-full rounded-2xl border border-neutral-200 px-4 py-3.5 text-sm font-black"

                >

                  Copy Recovery Code

                </button>

                <label className="flex items-start gap-3 rounded-2xl bg-neutral-50 p-4">

                  <input

                    type="checkbox"

                    checked={recoverySaved}

                    onChange={(event) =>

                      setRecoverySaved(event.target.checked)

                    }

                    className="mt-1 h-4 w-4 accent-emerald-600"

                  />

                  <span className="text-xs font-semibold leading-5 text-neutral-700">

                    I have saved my recovery code in a secure place.

                  </span>

                </label>

                <button

                  type="button"

                  onClick={continueAfterSignup}

                  disabled={!recoverySaved}

                  className="w-full rounded-2xl bg-neutral-950 px-5 py-4 text-sm font-black text-white disabled:opacity-40"

                >

                  Continue to Delivery

                </button>

              </div>

            ) : (

              <div className="space-y-4">
                <button
                  type="button"
                  onClick={handleGoogleSignup}
                  disabled={googleLoading || loading}
                  className="flex w-full items-center justify-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-4 text-sm font-black text-neutral-900 shadow-sm transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="flex h-6 w-6 items-center justify-center rounded-full border border-neutral-200 bg-white text-base font-black">G</span>
                  {googleLoading ? 'Connecting to Google...' : 'Sign up with Google'}
                </button>
                <p className="text-center text-[11px] leading-5 text-neutral-500">
                  Google sign-up does not require a mobile PIN. You will enter delivery contact details at checkout.
                </p>
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-neutral-200" />
                  <span className="text-[10px] font-bold text-neutral-400">Mobile registration</span>
                  <div className="h-px flex-1 bg-neutral-200" />
                </div>
                <form onSubmit={handleSignup} className="space-y-4">

                <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                  <p className="text-xs font-black text-emerald-900">
                    Secure mobile registration
                  </p>
                  <p className="mt-2 text-xs leading-5 text-emerald-800">
                    {signupMode === 'otp' ? 'Admin requires SMS OTP verification before creating your PIN account.' :
                     signupMode === 'pin_question' ? 'Admin enabled mobile + PIN + security question signup. Mobile ownership will not be verified. Save your recovery code.' :
                     signupMode === 'unavailable' ? 'Mobile signup is temporarily unavailable until the admin configuration is restored.' :
                     'Loading signup requirements...'}
                  </p>
                  {signupMode === 'unavailable' && (
                    <button
                      type="button"
                      onClick={() => {
                        setError('')
                        setPolicyRetry((value) => value + 1)
                      }}
                      className="mt-3 rounded-xl bg-white px-4 py-2 text-xs font-black text-emerald-800 ring-1 ring-emerald-200"
                    >
                      Retry signup settings
                    </button>
                  )}
                </div>

                {renderInput({

                  id: 'name',

                  label: 'Full Name',

                  value: name,

                  onChange: (event) =>

                    setName(event.target.value),

                  placeholder: 'Enter your full name',

                  autoComplete: 'name',

                  maxLength: 100,
                  disabled: otpSent,

                })}

                <div>

                  <label

                    htmlFor="mobile"

                    className="mb-2 block text-xs font-black text-neutral-700"

                  >

                    Mobile Number

                  </label>

                  <div className="flex overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50 focus-within:border-emerald-500">

                    <span className="flex items-center border-r border-neutral-200 px-4 text-sm font-black text-neutral-500">

                      +91

                    </span>

                    <input

                      id="mobile"

                      type="tel"

                      inputMode="numeric"

                      autoComplete="tel-national"

                      value={mobile}

                      onChange={(event) =>

                        setMobile(

                          event.target.value

                            .replace(/\D/g, '')

                            .slice(0, 10)

                        )

                      }

                      placeholder="10-digit mobile number"

                      maxLength={10}
                      disabled={otpSent}

                      required

                      className="min-w-0 flex-1 bg-transparent px-4 py-3.5 text-sm font-semibold outline-none"

                    />

                  </div>

                </div>

                <div>

                  <label

                    htmlFor="pin"

                    className="mb-2 block text-xs font-black text-neutral-700"

                  >

                    Create 4-Digit PIN

                  </label>

                  <div className="flex overflow-hidden rounded-2xl border border-neutral-200 bg-neutral-50 focus-within:border-emerald-500">

                    <input

                      id="pin"

                      type={showPin ? 'text' : 'password'}

                      inputMode="numeric"

                      autoComplete="new-password"

                      value={pin}

                      onChange={(event) =>

                        setPin(

                          event.target.value

                            .replace(/\D/g, '')

                            .slice(0, 4)

                        )

                      }

                      placeholder="Enter your PIN"

                      maxLength={4}
                      disabled={otpSent}

                      required

                      className="min-w-0 flex-1 bg-transparent px-4 py-3.5 text-sm font-semibold tracking-widest outline-none"

                    />

                    <button

                      type="button"

                      onClick={() => setShowPin(!showPin)}

                      className="px-4 text-xs font-black text-emerald-700"

                    >

                      {showPin ? 'Hide' : 'Show'}

                    </button>

                  </div>

                </div>

                {renderInput({

                  id: 'confirmPin',

                  label: 'Confirm PIN',

                  value: confirmPin,

                  onChange: (event) =>

                    setConfirmPin(

                      event.target.value

                        .replace(/\D/g, '')

                        .slice(0, 4)

                    ),

                  placeholder: 'Re-enter your PIN',

                  type: 'password',

                  autoComplete: 'new-password',

                  inputMode: 'numeric',

                  maxLength: 4,
                  disabled: otpSent,

                })}

                {signupMode === 'pin_question' && (
                  <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <label htmlFor="security-question" className="block text-xs font-black text-neutral-700">Security question for PIN recovery</label>
                    <select id="security-question" value={securityQuestionKey}
                      onChange={(event) => setSecurityQuestionKey(event.target.value)}
                      className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold">
                      <option value="private_phrase">What is your private recovery phrase hint?</option>
                      <option value="first_trip">Which place did you first travel alone to?</option>
                      <option value="childhood_street">Which street did you grow up on?</option>
                      <option value="first_teacher">What was your first teacher's name?</option>
                    </select>
                    <label htmlFor="security-answer" className="block text-xs font-black text-neutral-700">Private answer (8+ characters)</label>
                    <input id="security-answer" type="password" minLength={8} maxLength={72}
                      autoComplete="off" value={securityAnswer}
                      onChange={event => setSecurityAnswer(event.target.value)}
                      placeholder="Enter a private answer" required
                      className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold" />
                    <p className="text-[11px] leading-5 text-emerald-900">Don't use a publicly known answer. PIN recovery requires this answer AND your recovery code.</p>
                  </div>
                )}

                {otpSent && signupMode === 'otp' && (
                  <div className="space-y-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-black text-emerald-900">Verify mobile +91{otpMobile}</p>
                      <button type="button" onClick={editMobile} disabled={loading}
                        className="text-xs font-black text-emerald-700 underline">Edit number</button>
                    </div>
                    <label htmlFor="mobile-otp" className="block text-xs font-bold text-neutral-700">SMS verification code</label>
                    <input id="mobile-otp" type="text" inputMode="numeric"
                      autoComplete="one-time-code" value={otp} onChange={(event) => setOtp(event.target.value.replace(/\D/g, '').slice(0, 8))}
                      placeholder="Enter OTP" minLength={6} maxLength={8} required
                      className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm font-semibold tracking-widest outline-none focus:border-emerald-500" />
                    <button type="button" onClick={resendOtp} disabled={loading}
                      className="text-xs font-bold text-emerald-700 underline disabled:opacity-40">Resend OTP</button>
                  </div>
                )}

                {error && (

                  <div

                    role="alert"

                    className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-bold leading-5 text-red-700"

                  >

                    {error}

                  </div>

                )}

                <button

                  type="submit"

                  disabled={loading || googleLoading || !['otp','pin_question'].includes(signupMode)}

                  className="w-full rounded-2xl bg-neutral-950 px-5 py-4 text-sm font-black text-white transition disabled:cursor-not-allowed disabled:opacity-40"

                >

                  {loading ? 'Please wait...' : signupMode === 'pin_question' ? 'Create PIN Account' : otpSent ? 'Verify OTP & Create Account' : 'Send Verification OTP'}

                </button>

                <button

                  type="button"

                  onClick={() => router.push(loginPath)}

                  className="w-full py-2 text-xs font-black text-emerald-700"

                >

                  Already have an account? Sign In

                </button>

              </form>
            </div>
            )}

          </div>

        </section>

        <footer className="text-center text-[9px] font-semibold leading-4 text-neutral-400">

          Digital Dine Delivery · Secure Customer Access

        </footer>

      </div>

    </main>

  )

}

export default function DeliverySignupPage() {

  return (

    <Suspense fallback={<SignupLoading />}>

      <SignupContent />

    </Suspense>

  )

}
