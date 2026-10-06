'use client'



import { useState } from 'react'

import Link from 'next/link'

import { useRouter } from 'next/navigation'

import { supabase } from '@/lib/supabase'



export default function WebsiteOwnerLoginPage() {

  const router = useRouter()



  const [email, setEmail] = useState('')

  const [password, setPassword] = useState('')
  const [dob, setDob] = useState('')

  const [loading, setLoading] = useState(false)

  const [oauthLoading, setOauthLoading] = useState('')

  const [error, setError] = useState('')



  const findOwnerRestaurant = async (user) => {

    if (!user?.id) {

      throw new Error('Authenticated user was not found.')

    }



    const { data: restaurant, error: restaurantError } = await supabase

      .from('restaurants')

      .select('id, name, dob, subscription_status')

      .eq('id', user.id)

      .maybeSingle()



    if (restaurantError) {

      throw new Error(

        restaurantError.message || 'Unable to load your restaurant account.'

      )

    }



    if (!restaurant?.id) {

      throw new Error(

        'No restaurant account is connected to this login. Please register your business first.'

      )

    }



    return restaurant

  }



  const handlePasswordLogin = async (event) => {

    event.preventDefault()

    if (loading || oauthLoading) return



    const cleanEmail = email.trim().toLowerCase()



    if (!cleanEmail || !password) {

      setError('Enter your email address and password.')

      return

    }



    setLoading(true)

    setError('')



    try {

      const { data, error: signInError } =

        await supabase.auth.signInWithPassword({

          email: cleanEmail,

          password,

        })



      if (signInError) {

        throw new Error(signInError.message || 'Unable to sign in.')

      }



      if (!data?.user) {

        throw new Error('Login succeeded, but the user session was not found.')

      }



      const restaurant = await findOwnerRestaurant(data.user)



      router.replace(

        `/dashboard/${encodeURIComponent(restaurant.id)}`

      )

    } catch (loginError) {

      console.error('[WEBSITE LOGIN] Password login error:', loginError)

      setError(loginError?.message || 'Unable to sign in. Please try again.')

    } finally {

      setLoading(false)

    }

  }



  const handleBiometricLogin = async () => {
    if (loading || oauthLoading) return
    const cleanEmail = email.trim().toLowerCase()
    const cleanDob = dob.trim()

    if (!cleanEmail || !cleanDob) {
      setError('Enter your email address and date of birth before using biometric login.')
      return
    }

    setLoading(true)
    setError('')

    try {
      if (typeof window === 'undefined' || !window.PublicKeyCredential) {
        throw new Error('Biometric/passkey login is not supported by this browser or device.')
      }
      if (!supabase.auth.signInWithPasskey || typeof supabase.auth.signInWithPasskey !== 'function') {
        throw new Error('Biometric/passkey login is not available in the current Supabase client.')
      }

      const { data, error: passkeyError } = await supabase.auth.signInWithPasskey()
      if (passkeyError) throw new Error(passkeyError.message || 'Biometric verification failed.')

      const fallback = await supabase.auth.getUser()
      const user = data?.user || data?.session?.user || fallback.data?.user
      if (!user) throw new Error('Biometric verification succeeded, but the user session was not found.')

      if (user.email && user.email.trim().toLowerCase() !== cleanEmail) {
        await supabase.auth.signOut()
        throw new Error('The biometric credential belongs to a different email account.')
      }

      const restaurant = await findOwnerRestaurant(user)
      if (!restaurant?.dob) {
        await supabase.auth.signOut()
        throw new Error('Date of birth is not available for this account. Please use email/password or Google login.')
      }
      if (String(restaurant.dob).slice(0, 10) !== cleanDob) {
        await supabase.auth.signOut()
        throw new Error('Date of birth does not match this account.')
      }

      router.replace(`/dashboard/${encodeURIComponent(restaurant.id)}`)
    } catch (biometricError) {
      console.error('[WEBSITE LOGIN] Biometric/passkey login error:', biometricError)
      setError(biometricError?.message || 'Biometric login could not be completed.')
    } finally {
      setLoading(false)
    }
  }

  const handleGoogleLogin = async () => {

    if (loading || oauthLoading) return



    setOauthLoading('google')

    setError('')



    try {

      // Prevent a previous registration attempt from being mistaken for

      // a website owner login.

      localStorage.removeItem('digitaldining_google_registration')



      const redirectTo =

        `${window.location.origin}/auth/google-complete?source=website`



      const { error: googleError } =

        await supabase.auth.signInWithOAuth({

          provider: 'google',

          options: {

            redirectTo,

            queryParams: {

              access_type: 'offline',

              prompt: 'select_account',

            },

          },

        })



      if (googleError) {

        throw googleError

      }

    } catch (googleError) {

      console.error('[WEBSITE LOGIN] Google login error:', googleError)

      setError(

        googleError?.message ||

          'Google login could not be started. Please try again.'

      )

      setOauthLoading('')

    }

  }



  const handleAppleLogin = async () => {

    if (loading || oauthLoading) return



    setOauthLoading('apple')

    setError('')



    try {

      localStorage.removeItem('digitaldining_apple_registration')



      const redirectTo =

        `${window.location.origin}/auth/apple-complete?source=website`



      const { error: appleError } =

        await supabase.auth.signInWithOAuth({

          provider: 'apple',

          options: { redirectTo },

        })



      if (appleError) {

        throw appleError

      }

    } catch (appleError) {

      console.error('[WEBSITE LOGIN] Apple login error:', appleError)

      setError(

        appleError?.message ||

          'Apple login could not be started. Please try again.'

      )

      setOauthLoading('')

    }

  }



  return (

    <main className="min-h-screen bg-[#f7f7f5] px-4 py-8 text-neutral-950 sm:py-12">

      <div className="mx-auto w-full max-w-md">

        <div className="mb-6 flex items-center justify-between">

          <Link

            href="/"

            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-neutral-200 bg-white text-sm font-black shadow-sm transition hover:bg-neutral-50"

            aria-label="Back to Digital Dine-In"

          >

            ←

          </Link>



          <div className="text-right">

            <p className="text-sm font-black">Digital Dine-In</p>

            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-orange-600">

              Website Owner Login

            </p>

          </div>

        </div>



        <section className="rounded-[30px] border border-neutral-200 bg-white p-6 shadow-xl shadow-neutral-200/50 sm:p-8">

          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-neutral-950 text-xl font-black text-white">

            DD

          </div>



          <div className="mt-5 text-center">

            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-600">

              Business Account

            </p>

            <h1 className="mt-2 text-2xl font-black tracking-tight">

              Welcome back

            </h1>

            <p className="mx-auto mt-2 max-w-sm text-xs leading-6 text-neutral-500">

              Sign in to manage your Digital Dine-In business dashboard.

            </p>

          </div>



          <div className="mt-6 grid gap-3">

            <button

              type="button"

              onClick={handleGoogleLogin}

              disabled={loading || Boolean(oauthLoading)}

              className="flex min-h-12 items-center justify-center gap-3 rounded-xl border border-neutral-200 bg-white px-4 text-xs font-black transition hover:bg-neutral-50 disabled:cursor-not-allowed disabled:opacity-50"

            >

              <span className="text-base font-black text-[#4285F4]">G</span>

              {oauthLoading === 'google'

                ? 'Opening Google...'

                : 'Continue with Google'}

            </button>



            <button

              type="button"

              onClick={handleAppleLogin}

              disabled={loading || Boolean(oauthLoading)}

              className="flex min-h-12 items-center justify-center gap-3 rounded-xl bg-neutral-950 px-4 text-xs font-black text-white transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"

            >

              <span className="text-lg">●</span>

              {oauthLoading === 'apple'

                ? 'Opening Apple...'

                : 'Continue with Apple'}

            </button>

          </div>



          <div className="my-6 flex items-center gap-3">

            <div className="h-px flex-1 bg-neutral-200" />

            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-neutral-400">

              or email

            </span>

            <div className="h-px flex-1 bg-neutral-200" />

          </div>



          <form onSubmit={handlePasswordLogin} className="space-y-4">

            <label className="block">

              <span className="mb-2 block text-[9px] font-black uppercase tracking-[0.16em] text-neutral-500">

                Email address

              </span>

              <input

                type="email"

                autoComplete="email"

                value={email}

                onChange={(event) => {

                  setEmail(event.target.value)

                  setError('')

                }}

                placeholder="owner@example.com"

                className="h-12 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 text-sm font-bold outline-none transition focus:border-orange-400 focus:bg-white"

              />

            </label>



            <label className="block">

              <span className="mb-2 block text-[9px] font-black uppercase tracking-[0.16em] text-neutral-500">

                Password

              </span>

              <input

                type="password"

                autoComplete="current-password"

                value={password}

                onChange={(event) => {

                  setPassword(event.target.value)

                  setError('')

                }}

                placeholder="Enter your password"

                className="h-12 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 text-sm font-bold outline-none transition focus:border-orange-400 focus:bg-white"

              />

            </label>



            <label className="block">
              <span className="mb-2 block text-[9px] font-black uppercase tracking-[0.16em] text-neutral-500">
                Date of birth
              </span>
              <input
                type="date"
                autoComplete="bday"
                value={dob}
                onChange={(event) => {
                  setDob(event.target.value)
                  setError('')
                }}
                className="h-12 w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 text-sm font-bold outline-none transition focus:border-orange-400 focus:bg-white"
              />
              <p className="mt-1.5 text-[9px] leading-4 text-neutral-400">
                DOB is used only as an additional account check for biometric login.
              </p>
            </label>

            {error ? (

              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-[11px] font-bold leading-5 text-red-700">

                {error}

              </div>

            ) : null}



            <button

              type="submit"

              disabled={loading || Boolean(oauthLoading)}

              className="min-h-12 w-full rounded-xl bg-orange-500 px-4 text-xs font-black text-neutral-950 transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-50"

            >

              {loading ? 'Signing in...' : 'Login to Dashboard'}

            </button>

                      <button
              type="button"
              onClick={handleBiometricLogin}
              disabled={loading || Boolean(oauthLoading)}
              className="mt-3 min-h-12 w-full rounded-xl border border-orange-200 bg-orange-50 px-4 text-xs font-black text-orange-700 transition hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading ? 'Verifying...' : 'Login with Biometric / Passkey'}
            </button>
</form>



          <div className="mt-6 border-t border-neutral-100 pt-5 text-center">

            <p className="text-[11px] text-neutral-500">

              New to Digital Dine-In?{' '}

              <Link href="/register" className="font-black text-orange-600">

                Register your business

              </Link>

            </p>

          </div>

        </section>



        <div className="mt-4 rounded-2xl border border-neutral-200 bg-white/70 p-4 text-center">

          <p className="text-[10px] leading-5 text-neutral-500">

            Looking for staff, packer or delivery access?

          </p>

          <Link

            href="/app"

            className="mt-1 inline-block text-[10px] font-black text-neutral-950 underline decoration-orange-400 underline-offset-4"

          >

            Open Restaurant APP

          </Link>

        </div>

      </div>

    </main>

  )

}
