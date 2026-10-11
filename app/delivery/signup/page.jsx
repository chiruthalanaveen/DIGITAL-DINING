
'use client'

import { Suspense, useMemo, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'

const REGISTRATION_ENABLED = false

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
  const [error, setError] = useState('')
  const [registered, setRegistered] = useState(false)
  const [recoveryCode, setRecoveryCode] = useState('')
  const [recoverySaved, setRecoverySaved] = useState(false)

  const loginQuery = new URLSearchParams({
    next: nextPath,
  })

  if (storeCode) {
    loginQuery.set('store', storeCode)
  }

  const loginPath = `/delivery/login?${loginQuery.toString()}`

  async function handleSignup(event) {
    event.preventDefault()
    setError('')

    if (!REGISTRATION_ENABLED) {
      setError(
        'Mobile registration is temporarily unavailable. Please continue with Google sign-in.'
      )
      return
    }

    const cleanName = name.trim()
    const cleanMobile = mobile.replace(/\D/g, '')

    if (!storeCode) {
      setError(
        'Please select a delivery store before creating an account.'
      )
      return
    }

    if (cleanName.length < 2 || cleanName.length > 100) {
      setError('Enter your full name (2–100 characters).')
      return
    }

    if (!/^[6-9]\d{9}$/.test(cleanMobile)) {
      setError('Enter a valid 10-digit mobile number.')
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

    setLoading(true)

    try {
      const response = await fetch(
        '/api/delivery/customer/register',
        {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            restaurantCode: storeCode,
            name: cleanName,
            mobile: cleanMobile,
            pin,
          }),
        }
      )

      const result = await response.json()

      if (!response.ok || !result?.success) {
        throw new Error(
          result?.message || 'Unable to create your account.'
        )
      }

      if (!result?.recoveryCode) {
        throw new Error(
          'Your account was created, but your recovery code could not be displayed. Please contact support.'
        )
      }

      setRecoveryCode(result.recoveryCode)
      setPin('')
      setConfirmPin('')
      setRegistered(true)
    } catch (signupError) {
      setError(
        signupError?.message ||
          'Unable to create your account. Please try again.'
      )
    } finally {
      setLoading(false)
    }
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
                ? 'Keep your recovery code safe. You may need it if you forget your PIN.'
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
              <form onSubmit={handleSignup} className="space-y-4">
                {!REGISTRATION_ENABLED && (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                    <p className="text-xs font-black text-amber-900">
                      Mobile registration coming soon
                    </p>
                    <p className="mt-2 text-xs leading-5 text-amber-800">
                      Account security improvements are in progress.
                      You can continue using Google sign-in.
                    </p>
                  </div>
                )}

                {renderInput({
                  id: 'name',
                  label: 'Full Name',
                  value: name,
                  onChange: (event) =>
                    setName(event.target.value),
                  placeholder: 'Enter your full name',
                  autoComplete: 'name',
                  maxLength: 100,
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
                })}

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
                  disabled={loading || !REGISTRATION_ENABLED}
                  className="w-full rounded-2xl bg-neutral-950 px-5 py-4 text-sm font-black text-white transition disabled:cursor-not-allowed disabled:opacity-40"
                >
                  {loading
                    ? 'Creating Account...'
                    : 'Create Account'}
                </button>

                <button
                  type="button"
                  onClick={() => router.push(loginPath)}
                  className="w-full py-2 text-xs font-black text-emerald-700"
                >
                  Already have an account? Sign In
                </button>
              </form>
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
