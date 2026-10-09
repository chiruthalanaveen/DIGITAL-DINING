'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function safeNextPath(value) {
  const next = String(value || '').trim()

  // Only allow internal delivery routes.
  // This prevents open redirects to external websites.
  if (!next.startsWith('/delivery')) {
    return '/delivery'
  }

  return next
}

function DeliveryLoginLoading() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f7f8f6] px-5">
      <div className="flex flex-col items-center">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-emerald-100 border-t-emerald-600" />

        <p className="mt-4 text-xs font-bold text-neutral-500">
          Checking your account...
        </p>
      </div>
    </main>
  )
}

function DeliveryLoginContent() {
  const router = useRouter()
  const searchParams = useSearchParams()

  const [loading, setLoading] = useState(true)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [error, setError] = useState('')

  const nextPath = safeNextPath(searchParams.get('next'))

  useEffect(() => {
    let mounted = true

    async function checkSession() {
      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession()

        if (sessionError) {
          throw sessionError
        }

        if (session?.user && mounted) {
          router.replace(nextPath)
          return
        }
      } catch (sessionError) {
        console.error(
          'Delivery session check error:',
          sessionError
        )
      } finally {
        if (mounted) {
          setLoading(false)
        }
      }
    }

    checkSession()

    return () => {
      mounted = false
    }
  }, [router, nextPath])

  const continueWithGoogle = async () => {
    if (googleLoading) {
      return
    }

    setGoogleLoading(true)
    setError('')

    try {
      if (typeof window === 'undefined') {
        setGoogleLoading(false)
        return
      }

      const callbackUrl = new URL(
        '/auth/callback',
        window.location.origin
      )

      callbackUrl.searchParams.set(
        'source',
        'delivery'
      )

      callbackUrl.searchParams.set(
        'next',
        nextPath
      )

      const { error: oauthError } =
        await supabase.auth.signInWithOAuth({
          provider: 'google',

          options: {
            redirectTo: callbackUrl.toString(),

            queryParams: {
              access_type: 'offline',
              prompt: 'select_account',
            },
          },
        })

      if (oauthError) {
        throw oauthError
      }
    } catch (oauthError) {
      console.error(
        'Delivery Google login error:',
        oauthError
      )

      setError(
        oauthError?.message ||
          'Unable to continue with Google. Please try again.'
      )

      setGoogleLoading(false)
    }
  }

  if (loading) {
    return <DeliveryLoginLoading />
  }

  return (
    <main className="min-h-dvh bg-[#f7f8f6] text-neutral-950">
      <div className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-5 pb-8 pt-[max(1.25rem,env(safe-area-inset-top))]">

        {/* Header */}
        <header className="flex items-center justify-between">
          <button
            type="button"
            onClick={() => router.push('/delivery')}
            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-neutral-200 bg-white text-lg font-black shadow-sm transition active:scale-95"
            aria-label="Back to Delivery"
          >
            ←
          </button>

          <div className="rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-emerald-700">
            Delivery
          </div>
        </header>

        {/* Main Login Section */}
        <section className="flex flex-1 flex-col justify-center py-8">

          {/* Branding */}
          <div className="mb-8">
            <div className="mb-5 flex h-16 w-16 items-center justify-center rounded-[22px] bg-neutral-950 text-xl font-black italic tracking-[-0.12em] text-white shadow-xl">
              DD
            </div>

            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-600">
              Digital Dine
            </p>

            <h1 className="mt-2 text-[34px] font-black leading-[1.05] tracking-[-0.04em] text-neutral-950">
              Sign in to your
              <br />
              delivery account
            </h1>

            <p className="mt-4 max-w-sm text-sm font-medium leading-6 text-neutral-500">
              Sign in or create an account with Google to manage your
              delivery experience.
            </p>
          </div>

          {/* Login Card */}
          <div className="rounded-[28px] border border-neutral-200 bg-white p-5 shadow-[0_18px_60px_rgba(0,0,0,0.07)]">

            {/* Google Login */}
            <button
              type="button"
              onClick={continueWithGoogle}
              disabled={googleLoading}
              className="flex w-full items-center justify-center gap-3 rounded-2xl border border-neutral-200 bg-white px-4 py-4 text-sm font-black text-neutral-800 shadow-sm transition hover:bg-neutral-50 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {googleLoading ? (
                <span className="h-5 w-5 animate-spin rounded-full border-2 border-neutral-300 border-t-neutral-900" />
              ) : (
                <span className="flex h-6 w-6 items-center justify-center rounded-full border border-neutral-200 bg-white text-sm font-black">
                  G
                </span>
              )}

              {googleLoading
                ? 'Connecting to Google...'
                : 'Continue with Google'}
            </button>

            {/* Error */}
            {error ? (
              <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-xs font-bold leading-5 text-red-700">
                {error}
              </div>
            ) : null}

            {/* Divider */}
            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-neutral-200" />

              <span className="text-[9px] font-black uppercase tracking-[0.15em] text-neutral-400">
                Secure customer access
              </span>

              <div className="h-px flex-1 bg-neutral-200" />
            </div>

            {/* Features */}
            <div className="grid grid-cols-3 gap-2">

              <div className="rounded-2xl bg-neutral-50 p-3 text-center">
                <div className="text-lg">
                  📦
                </div>

                <p className="mt-1 text-[9px] font-black text-neutral-600">
                  Orders
                </p>
              </div>

              <div className="rounded-2xl bg-neutral-50 p-3 text-center">
                <div className="text-lg">
                  📍
                </div>

                <p className="mt-1 text-[9px] font-black text-neutral-600">
                  Delivery
                </p>
              </div>

              <div className="rounded-2xl bg-neutral-50 p-3 text-center">
                <div className="text-lg">
                  💬
                </div>

                <p className="mt-1 text-[9px] font-black text-neutral-600">
                  Support
                </p>
              </div>

            </div>
          </div>

          <p className="mt-5 px-3 text-center text-[10px] font-medium leading-5 text-neutral-400">
            New to Digital Dine? Continue with Google and your delivery
            customer account will be created automatically.
          </p>
        </section>

        {/* Footer */}
        <footer className="text-center text-[9px] font-semibold leading-4 text-neutral-400">
          By continuing, you agree to use your Google account for secure
          authentication with Digital Dine Delivery.
        </footer>

      </div>
    </main>
  )
}

export default function DeliveryLoginPage() {
  return (
    <Suspense fallback={<DeliveryLoginLoading />}>
      <DeliveryLoginContent />
    </Suspense>
  )
}