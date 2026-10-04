'use client'

import {
  useState,
} from 'react'

export default function AdminLoginPage() {
  const [email, setEmail] =
    useState('')

  const [password, setPassword] =
    useState('')

  const [loading, setLoading] =
    useState(false)

  const [error, setError] =
    useState('')

  const login = async (event) => {
    event.preventDefault()

    if (loading) {
      return
    }

    setLoading(true)
    setError('')

    try {
      const response =
        await fetch(
          '/api/admin/login',
          {
            method: 'POST',
            headers: {
              'Content-Type':
                'application/json',
            },
            cache: 'no-store',
            body: JSON.stringify({
              email:
                email.trim(),
              password,
            }),
          }
        )

      const data =
        await response
          .json()
          .catch(
            () => ({})
          )

      if (
        !response.ok ||
        !data?.success
      ) {
        throw new Error(
          data?.message ||
            'Admin login failed.'
        )
      }

      /*
       * Verify that the HttpOnly cookie created by /api/admin/login
       * is actually available before navigating to the dashboard.
       */
      const sessionResponse =
        await fetch(
          '/api/admin/session',
          {
            method: 'GET',
            cache: 'no-store',
          }
        )

      const session =
        await sessionResponse
          .json()
          .catch(
            () => ({})
          )

      if (
        !sessionResponse.ok ||
        !session?.authenticated
      ) {
        throw new Error(
          'Login succeeded but the Admin session cookie was not created.'
        )
      }

      /*
       * Full browser navigation avoids stale App Router state from
       * an older Admin dashboard component.
       */
      window.location.assign(
        '/admin/dashboard'
      )
    } catch (loginError) {
      setError(
        loginError?.message ||
          'Unable to login.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-[100dvh] bg-neutral-950 px-4 py-10 text-white">
      <div className="mx-auto flex min-h-[calc(100dvh-5rem)] w-full max-w-md items-center">
        <section className="w-full rounded-[30px] border border-neutral-800 bg-neutral-900 p-6 shadow-2xl sm:p-8">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-red-600 text-lg font-black">
              D
            </div>

            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-red-400">
                Digital Dine-In
              </p>

              <h1 className="mt-1 text-2xl font-black">
                Admin Login
              </h1>
            </div>
          </div>

          <p className="mt-5 text-sm leading-6 text-neutral-400">
            Sign in before opening the Admin ERP Control Center.
          </p>

          {error && (
            <div className="mt-4 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-xs font-bold leading-5 text-red-300">
              {error}
            </div>
          )}

          <form
            onSubmit={login}
            className="mt-6 space-y-4"
          >
            <label className="block">
              <span className="mb-2 block text-[9px] font-black uppercase tracking-wider text-neutral-500">
                Admin Email
              </span>

              <input
                type="email"
                required
                autoComplete="username"
                value={email}
                onChange={(event) =>
                  setEmail(
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3.5 text-sm outline-none focus:border-red-500"
                placeholder="Admin email"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-[9px] font-black uppercase tracking-wider text-neutral-500">
                Admin Password
              </span>

              <input
                type="password"
                required
                autoComplete="current-password"
                value={password}
                onChange={(event) =>
                  setPassword(
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3.5 text-sm outline-none focus:border-red-500"
                placeholder="Admin password"
              />
            </label>

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-xl bg-red-600 px-4 py-4 text-sm font-black text-white disabled:opacity-50"
            >
              {loading
                ? 'Authenticating...'
                : 'Login to Admin ERP'}
            </button>
          </form>

          <p className="mt-5 text-center font-mono text-[9px] text-neutral-600">
            /admin = LOGIN ONLY
          </p>
        </section>
      </div>
    </main>
  )
}
