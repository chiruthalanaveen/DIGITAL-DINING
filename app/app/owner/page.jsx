'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const OWNER_APP_CONTEXT_KEY =
  'digitaldining_owner_app_context'

export default function OwnerMobileLoginPage() {
  const router = useRouter()

  const [restaurantId, setRestaurantId] = useState('')
  const [restaurantCode, setRestaurantCode] = useState('')
  const [contextReady, setContextReady] = useState(false)

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [dob, setDob] = useState('')

  const [loading, setLoading] = useState(false)
  const [checkingSession, setCheckingSession] =
    useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    const start = async () => {
      try {
        const params = new URLSearchParams(
          window.location.search
        )

        const id = String(
          params.get('restaurantId') || ''
        ).trim()

        const code = String(
          params.get('restaurantCode') || ''
        )
          .replace(/\D/g, '')
          .slice(0, 5)

        if (!active) return

        setRestaurantId(id)
        setRestaurantCode(code)
        setContextReady(true)

        if (!id) {
          setCheckingSession(false)
          setError(
            'Restaurant information is missing. Please return to the restaurant code page.'
          )
          return
        }

        try {
          sessionStorage.setItem(
            OWNER_APP_CONTEXT_KEY,
            JSON.stringify({
              restaurantId: id,
              restaurantCode: code,
            })
          )
        } catch (storageError) {
          console.warn(
            '[OWNER APP LOGIN] Could not save app context:',
            storageError
          )
        }

        // If the owner is already authenticated in Supabase,
        // verify ownership and open the MOBILE dashboard directly.
        const {
          data: { user },
        } = await supabase.auth.getUser()

        if (user) {
          const { data: ownedRestaurant } =
            await supabase
              .from('restaurants')
              .select('id')
              .eq('id', id)
              .eq('owner_id', user.id)
              .maybeSingle()

          if (ownedRestaurant?.id && active) {
            router.replace(
              `/app/owner/${encodeURIComponent(id)}`
            )
            return
          }
        }
      } catch (startError) {
        console.error(
          '[OWNER APP LOGIN] Start error:',
          startError
        )

        if (active) {
          setError(
            startError?.message ||
              'Unable to prepare Owner login.'
          )
        }
      } finally {
        if (active) {
          setCheckingSession(false)
        }
      }
    }

    start()

    return () => {
      active = false
    }
  }, [router])

  const handleLogin = async (event) => {
    event.preventDefault()

    if (loading) return

    const cleanEmail = email.trim().toLowerCase()
    const cleanPassword = password
    const cleanDob = dob.trim()

    if (!restaurantId) {
      setError(
        'Restaurant information is missing. Please return to the restaurant code page.'
      )
      return
    }

    if (!cleanEmail || !cleanPassword || !cleanDob) {
      setError(
        'Please enter Email, Password and Date of Birth.'
      )
      return
    }

    setLoading(true)
    setError('')

    let browserSessionCreated = false

    try {
      // Use the SAME secure Owner login API used by the website.
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: cleanEmail,
          password: cleanPassword,
          dob: cleanDob,
        }),
      })

      const result = await response
        .json()
        .catch(() => ({}))

      if (!response.ok || !result?.success) {
        throw new Error(
          result?.message ||
            'Invalid Owner login details.'
        )
      }

      if (
        !result?.session?.access_token ||
        !result?.session?.refresh_token
      ) {
        throw new Error(
          'Login succeeded, but the secure Owner session was not returned.'
        )
      }

      const loggedRestaurant = result?.restaurant

      if (!loggedRestaurant?.id) {
        throw new Error(
          'Restaurant profile was not returned.'
        )
      }

      // The owner must belong to the restaurant selected by code.
      if (
        String(loggedRestaurant.id) !==
        String(restaurantId)
      ) {
        throw new Error(
          'This Owner account does not belong to the restaurant code selected in the app.'
        )
      }

      const { error: sessionError } =
        await supabase.auth.setSession({
          access_token:
            result.session.access_token,
          refresh_token:
            result.session.refresh_token,
        })

      if (sessionError) {
        throw sessionError
      }

      browserSessionCreated = true

      try {
        sessionStorage.setItem(
          OWNER_APP_CONTEXT_KEY,
          JSON.stringify({
            restaurantId,
            restaurantCode,
          })
        )
      } catch {}

      // MOBILE OWNER PAGE ONLY.
      router.replace(
        `/app/owner/${encodeURIComponent(
          restaurantId
        )}`
      )
      router.refresh()
    } catch (loginError) {
      console.error(
        '[OWNER APP LOGIN] Login error:',
        loginError
      )

      if (browserSessionCreated) {
        try {
          await supabase.auth.signOut()
        } catch {}
      }

      setError(
        loginError?.message ||
          'Owner login failed.'
      )
    } finally {
      setLoading(false)
    }
  }

  const backToRestaurantRoles = () => {
    router.replace(
      restaurantCode
        ? `/app?code=${encodeURIComponent(
            restaurantCode
          )}`
        : '/app'
    )
  }

  if (!contextReady || checkingSession) {
    return (
      <main className="flex min-h-[100dvh] items-center justify-center bg-neutral-950 px-5 text-white">
        <div className="text-center">
          <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-neutral-800 border-t-orange-500" />
          <p className="mt-4 text-[10px] font-black uppercase tracking-[0.18em] text-neutral-500">
            Opening Owner Login
          </p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-[100dvh] w-full overflow-x-hidden bg-neutral-950 text-white">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <header className="flex items-center justify-between gap-3 py-2">
          <button
            type="button"
            onClick={backToRestaurantRoles}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-900 text-neutral-300"
            aria-label="Back to restaurant roles"
          >
            ←
          </button>

          <div className="text-right">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-orange-400">
              Digital Dine
            </p>
            {restaurantCode && (
              <p className="mt-1 text-[9px] font-bold text-neutral-600">
                Restaurant Code {restaurantCode}
              </p>
            )}
          </div>
        </header>

        <div className="flex flex-1 items-center py-6">
          <section className="w-full overflow-hidden rounded-[32px] border border-neutral-800 bg-neutral-900 shadow-2xl">
            <div className="border-b border-neutral-800 bg-gradient-to-br from-orange-500/15 via-neutral-900 to-neutral-900 p-6">
              <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500 text-2xl shadow-lg shadow-orange-500/20">
                👑
              </div>

              <p className="mt-5 text-[10px] font-black uppercase tracking-[0.18em] text-orange-400">
                Owner Mobile Access
              </p>

              <h1 className="mt-2 text-2xl font-black">
                Owner Sign In
              </h1>

              <p className="mt-2 max-w-sm text-xs leading-6 text-neutral-400">
                Sign in to open the mobile Owner dashboard for the restaurant you selected.
              </p>
            </div>

            <form
              onSubmit={handleLogin}
              className="space-y-4 p-5"
            >
              <div>
                <label className="mb-2 block text-[9px] font-black uppercase tracking-wider text-neutral-500">
                  Owner Email
                </label>

                <input
                  type="email"
                  value={email}
                  onChange={(event) => {
                    setEmail(event.target.value)
                    setError('')
                  }}
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="email"
                  placeholder="owner@restaurant.com"
                  disabled={loading}
                  className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-4 text-base text-white outline-none transition focus:border-orange-500 disabled:opacity-60"
                />
              </div>

              <div>
                <label className="mb-2 block text-[9px] font-black uppercase tracking-wider text-neutral-500">
                  Password
                </label>

                <input
                  type="password"
                  value={password}
                  onChange={(event) => {
                    setPassword(event.target.value)
                    setError('')
                  }}
                  autoComplete="current-password"
                  placeholder="Enter Owner password"
                  disabled={loading}
                  className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-4 text-base text-white outline-none transition focus:border-orange-500 disabled:opacity-60"
                />
              </div>

              <div>
                <label className="mb-2 block text-[9px] font-black uppercase tracking-wider text-neutral-500">
                  Date of Birth
                </label>

                <input
                  type="date"
                  value={dob}
                  onChange={(event) => {
                    setDob(event.target.value)
                    setError('')
                  }}
                  disabled={loading}
                  className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-4 text-base text-white outline-none transition focus:border-orange-500 disabled:opacity-60"
                />
              </div>

              {error && (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-[10px] font-bold leading-5 text-red-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loading || !restaurantId}
                className="w-full rounded-2xl bg-orange-500 py-4 text-sm font-black text-white shadow-lg shadow-orange-500/20 transition active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loading
                  ? 'Signing In...'
                  : 'Open Owner Mobile Dashboard'}
              </button>

              <button
                type="button"
                onClick={backToRestaurantRoles}
                disabled={loading}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 py-3 text-[10px] font-black text-neutral-400"
              >
                ← Back to Owner / Manager / Waiter / Kitchen
              </button>
            </form>
          </section>
        </div>

        <p className="px-4 text-center text-[9px] leading-5 text-neutral-600">
          This Owner login opens only the mobile Owner interface.
          The normal website Owner login remains separate.
        </p>
      </div>
    </main>
  )
}
