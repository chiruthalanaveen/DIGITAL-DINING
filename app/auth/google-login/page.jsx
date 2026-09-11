'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function GoogleLoginCallback() {
  const router = useRouter()

  const [status, setStatus] = useState(
    'Completing Google login...'
  )

  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    let isMounted = true

    const completeGoogleLogin = async () => {
      try {
        setStatus('Verifying your Google account...')

        /*
         * Supabase OAuth with PKCE returns a code.
         * Exchange that code for a session.
         */
        const searchParams = new URLSearchParams(
          window.location.search
        )

        const code = searchParams.get('code')

        if (code) {
          const {
            error: exchangeError,
          } =
            await supabase.auth.exchangeCodeForSession(
              code
            )

          if (exchangeError) {
            throw new Error(
              exchangeError.message
            )
          }
        }

        /*
         * Get the authenticated session.
         */
        const {
          data: {
            session,
          },
          error: sessionError,
        } =
          await supabase.auth.getSession()

        if (sessionError) {
          throw new Error(
            sessionError.message
          )
        }

        if (
          !session ||
          !session.user
        ) {
          throw new Error(
            'Google login session was not found. Please try again.'
          )
        }

        const userId =
          session.user.id

        setStatus(
          'Checking your restaurant account...'
        )

        /*
         * Check whether this Google user already
         * has a restaurant profile.
         */
        const {
          data: restaurant,
          error: restaurantError,
        } =
          await supabase
            .from('restaurants')
            .select(
              'id, name, email, dob, subscription_status'
            )
            .eq('id', userId)
            .maybeSingle()

        if (restaurantError) {
          throw new Error(
            restaurantError.message
          )
        }

        /*
         * Google login is for an existing restaurant
         * account. Do not create a restaurant automatically.
         */
        if (!restaurant) {
          await supabase.auth.signOut()

          throw new Error(
            'No restaurant account was found for this Google account. Please register your restaurant first.'
          )
        }

        if (!isMounted) {
          return
        }

        setStatus(
          'Login successful. Redirecting...'
        )

        /*
         * Preserve your existing dashboard URL.
         */
        router.replace(
          `/dashboard/${restaurant.id}`
        )
      } catch (error) {
        console.error(
          'Google login error:',
          error
        )

        if (!isMounted) {
          return
        }

        setErrorMessage(
          error?.message ||
            'Google login failed. Please try again.'
        )

        setStatus('')
      }
    }

    completeGoogleLogin()

    return () => {
      isMounted = false
    }
  }, [router])

  return (
    <main className="min-h-screen bg-neutral-950 flex items-center justify-center px-4">
      <div className="w-full max-w-md rounded-3xl border border-neutral-800 bg-neutral-900 p-8 text-center shadow-2xl">

        {!errorMessage ? (

          <>
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-orange-500/10">

              <svg
                className="h-8 w-8 animate-spin text-orange-500"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />

                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>

            </div>

            <h1 className="text-2xl font-black text-white">
              Google Login
            </h1>

            <p className="mt-3 text-sm text-neutral-400">
              {status}
            </p>
          </>

        ) : (

          <>
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-red-500/10">

              <svg
                className="h-8 w-8 text-red-500"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>

            </div>

            <h1 className="text-2xl font-black text-white">
              Login Failed
            </h1>

            <p className="mt-4 text-sm leading-6 text-red-300">
              {errorMessage}
            </p>

            <button
              type="button"
              onClick={() =>
                router.replace('/login')
              }
              className="mt-6 w-full rounded-xl bg-orange-500 px-4 py-3 font-black text-white transition hover:bg-orange-600"
            >
              Back to Login
            </button>
          </>

        )}

      </div>
    </main>
  )
}