
'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const inputClass =
  'w-full rounded-xl border border-neutral-700 bg-neutral-950 ' +
  'px-4 py-3 text-white outline-none focus:border-red-500 ' +
  'disabled:cursor-not-allowed disabled:opacity-60'

const OWNER_DASHBOARD = '/ecommerce/owner'
const OWNER_LOGIN = '/ecommerce/owner/login'

async function verifyOwner(accessToken) {
  if (!accessToken) {
    throw new Error('Your login session is unavailable.')
  }

  const response = await fetch(
    '/api/ecommerce/owner/overview',
    {
      method: 'GET',
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    }
  )

  const body = await response.json().catch(() => ({}))

  if (!response.ok || !body.success) {
    throw new Error(
      body.message ||
      'Could not verify your E-Commerce owner account.'
    )
  }

  if (!Array.isArray(body.stores) || !body.stores.length) {
    throw new Error(
      'This account has no assigned E-Commerce website. ' +
      'Contact Super Admin.'
    )
  }

  return body
}

function GoogleIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 48 48"
      aria-hidden="true"
    >
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5Z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.27 5.48-4.79 7.18l7.73 6C44.4 38.02 46.98 31.86 46.98 24.55Z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59A14.4 14.4 0 0 1 9.75 24c0-1.59.27-3.13.76-4.59l-7.98-6.2A23.9 23.9 0 0 0 0 24c0 3.87.93 7.52 2.56 10.78l7.97-6.19Z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.88-5.8l-7.73-6c-2.15 1.45-4.92 2.3-8.15 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.97 6.19C6.51 42.62 14.62 48 24 48Z"
      />
    </svg>
  )
}

export default function EcommerceOwnerLogin() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [busy, setBusy] = useState(false)
  const [googleBusy, setGoogleBusy] = useState(false)
  const [checking, setChecking] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const mountedRef = useRef(false)
  const verifyingRef = useRef(false)
  const redirectedRef = useRef(false)

  const goToDashboard = useCallback(() => {
    if (redirectedRef.current) return

    redirectedRef.current = true
    router.replace(OWNER_DASHBOARD)
    router.refresh()
  }, [router])

  const verifyAndRedirect = useCallback(
    async accessToken => {
      if (!accessToken || verifyingRef.current) {
        return
      }

      verifyingRef.current = true

      try {
        await verifyOwner(accessToken)

        if (mountedRef.current) {
          goToDashboard()
        }
      } catch (err) {
        if (mountedRef.current) {
          setError(
            err?.message ||
            'Unable to verify your E-Commerce owner account.'
          )
        }
      } finally {
        verifyingRef.current = false

        if (mountedRef.current) {
          setChecking(false)
        }
      }
    },
    [goToDashboard]
  )

  useEffect(() => {
    mountedRef.current = true

    let active = true

    async function checkExistingSession() {
      try {
        const url = new URL(window.location.href)

        const oauthError =
          url.searchParams.get('error_description') ||
          url.searchParams.get('error')

        if (oauthError) {
          if (active) {
            setError(oauthError.replace(/\+/g, ' '))
          }

          // Remove OAuth error parameters from the address.
          url.searchParams.delete('error')
          url.searchParams.delete('error_description')
          url.searchParams.delete('error_code')

          window.history.replaceState(
            {},
            '',
            `${url.pathname}${url.search}${url.hash}`
          )
        }

        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession()

        if (sessionError) {
          throw sessionError
        }

        if (!active) return

        if (session?.access_token) {
          await verifyAndRedirect(session.access_token)
        }
      } catch (err) {
        if (active) {
          setError(
            err?.message ||
            'Unable to check your login session.'
          )
        }
      } finally {
        if (active) {
          setChecking(false)
        }
      }
    }

    checkExistingSession()

    return () => {
      active = false
      mountedRef.current = false
    }
  }, [verifyAndRedirect])

  async function signIn(event) {
    event.preventDefault()

    if (busy || googleBusy || checking) return

    setBusy(true)
    setError('')
    setNotice('')

    try {
      const {
        data,
        error: signInError,
      } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (signInError || !data?.session?.access_token) {
        throw new Error(
          signInError?.message || 'Unable to sign in.'
        )
      }

      await verifyOwner(data.session.access_token)

      goToDashboard()
    } catch (err) {
      setError(
        err?.message || 'Login failed. Please try again.'
      )
    } finally {
      setBusy(false)
    }
  }

  async function signInWithGoogle() {
    if (busy || googleBusy || checking) return

    setGoogleBusy(true)
    setError('')
    setNotice('')

    try {
      // Clear a session from another portal before Google login.
      // This does not remove or modify any store ownership.
      const { error: signOutError } =
        await supabase.auth.signOut({ scope: 'local' })

      if (signOutError) {
        throw signOutError
      }

      const redirectTo =
        `${window.location.origin}${OWNER_LOGIN}`

      const { data, error: googleError } =
        await supabase.auth.signInWithOAuth({
          provider: 'google',
          options: {
            redirectTo,
            scopes: 'email profile',
            queryParams: {
              prompt: 'select_account',
            },
          },
        })

      if (googleError) {
        throw googleError
      }

      if (!data?.url) {
        throw new Error(
          'Google login could not be started. ' +
          'Check your Supabase Google provider settings.'
        )
      }

      setNotice('Redirecting to Google…')

      // Supabase normally redirects automatically.
      // The returned URL is managed by Supabase Auth.
    } catch (err) {
      setError(
        err?.message ||
        'Unable to start Google login. Please try again.'
      )
    } finally {
      setGoogleBusy(false)
    }
  }

  const isBusy = busy || googleBusy || checking

  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-950 px-4 py-10 text-white">
      <section className="w-full max-w-md rounded-3xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl sm:p-9">

        <p className="text-xs font-bold uppercase tracking-[.2em] text-red-400">
          Digital Dine-In · E-Commerce
        </p>

        <h1 className="mt-3 text-3xl font-black">
          Owner Login
        </h1>

        <p className="mt-2 text-sm leading-6 text-neutral-400">
          Sign in with the Supabase account assigned to
          your E-Commerce website.
        </p>

        {error && (
          <div
            role="alert"
            className="mt-5 rounded-xl border border-red-800 bg-red-950/40 p-3 text-sm text-red-200"
          >
            {error}
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="mt-5 rounded-xl border border-green-800 bg-green-950/40 p-3 text-sm text-green-200"
          >
            {notice}
          </div>
        )}

        {checking ? (
          <div className="mt-7 flex items-center gap-3 text-sm text-neutral-400">
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-600 border-t-red-500" />
            Checking your session…
          </div>
        ) : (
          <>
            <form
              className="mt-7 space-y-5"
              onSubmit={signIn}
            >
              <div className="space-y-2">
                <label
                  htmlFor="ecom-email"
                  className="text-sm font-semibold"
                >
                  Email address
                </label>

                <input
                  id="ecom-email"
                  className={inputClass}
                  type="email"
                  autoComplete="username"
                  required
                  maxLength={254}
                  value={email}
                  onChange={event =>
                    setEmail(event.target.value)
                  }
                  placeholder="owner@example.com"
                  disabled={isBusy}
                />
              </div>

              <div className="space-y-2">
                <label
                  htmlFor="ecom-password"
                  className="text-sm font-semibold"
                >
                  Password
                </label>

                <input
                  id="ecom-password"
                  className={inputClass}
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={event =>
                    setPassword(event.target.value)
                  }
                  placeholder="Enter your password"
                  disabled={isBusy}
                />

                <label className="flex items-center gap-2 text-xs text-neutral-400">
                  <input
                    type="checkbox"
                    checked={showPassword}
                    onChange={event =>
                      setShowPassword(event.target.checked)
                    }
                    disabled={isBusy}
                    className="accent-red-600"
                  />
                  Show password
                </label>
              </div>

              <button
                type="submit"
                disabled={isBusy}
                className="w-full rounded-xl bg-red-600 px-4 py-3 font-bold text-white transition hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy
                  ? 'Signing in…'
                  : 'Sign in to Owner Dashboard'}
              </button>
            </form>

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-neutral-700" />
              <span className="text-xs font-semibold uppercase text-neutral-500">
                Or continue with
              </span>
              <div className="h-px flex-1 bg-neutral-700" />
            </div>

            <button
              type="button"
              onClick={signInWithGoogle}
              disabled={isBusy}
              className="flex w-full items-center justify-center gap-3 rounded-xl border border-neutral-700 bg-white px-4 py-3.5 font-semibold text-neutral-900 transition hover:bg-neutral-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {googleBusy ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-400 border-t-neutral-900" />
              ) : (
                <GoogleIcon />
              )}

              <span>
                {googleBusy
                  ? 'Connecting to Google…'
                  : 'Continue with Google'}
              </span>
            </button>

            <p className="mt-4 text-center text-xs leading-5 text-neutral-500">
              Use the Google account assigned to your
              E-Commerce website.
            </p>
          </>
        )}

        <div className="mt-7 border-t border-neutral-800 pt-5">
          <p className="text-xs leading-6 text-neutral-500">
            Only owners assigned by Super Admin can open
            an E-Commerce dashboard.
            Google sign-in does not automatically approve
            a store or grant ownership.
          </p>
        </div>
      </section>
    </main>
  )
}
