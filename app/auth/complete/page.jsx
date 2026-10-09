'use client'

import { Suspense, useEffect, useRef, useState } from 'react'

import { useRouter, useSearchParams } from 'next/navigation'

import { supabase } from '@/lib/supabase'

function safeSource(value) {

  return value === 'delivery' || value === 'website' ? value : ''

}

function safeNextPath(value) {

  const next = String(value || '').trim()

  return next.startsWith('/delivery') ? next : '/delivery'

}

function AuthCompleteContent() {

  const router = useRouter()

  const searchParams = useSearchParams()

  const startedRef = useRef(false)

  const [message, setMessage] = useState('Completing Google sign-in...')

  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {

    if (startedRef.current) return

    startedRef.current = true

    let active = true

    async function completeLogin() {

      const source = safeSource(searchParams.get('source'))

      const nextPath = safeNextPath(searchParams.get('next'))

      const code = String(searchParams.get('code') || '').trim()

      try {

        setMessage('Securing your Google session...')

        // With the current browser Supabase client, persist the OAuth session

        // into the same browser storage used by /delivery and the store pages.

        let session = null

        const {

          data: existingSessionData,

          error: existingSessionError,

        } = await supabase.auth.getSession()

        if (existingSessionError) {

          throw existingSessionError

        }

        session = existingSessionData?.session || null

        if (!session && code) {

          const {

            data: exchangeData,

            error: exchangeError,

          } = await supabase.auth.exchangeCodeForSession(code)

          if (exchangeError) {

            throw exchangeError

          }

          session = exchangeData?.session || null

        }

        if (!active) return

        const user = session?.user

        if (!user) {

          throw new Error(

            'Google authentication session was not found. Please try again.'

          )

        }

        // ============================================================

        // DELIVERY CUSTOMER GOOGLE LOGIN / SIGN-UP

        // ============================================================

        if (source === 'delivery') {

          setMessage('Preparing your delivery account...')

          const metadata = user.user_metadata || {}

          const fullName = String(

            metadata.full_name ||

              metadata.name ||

              metadata.display_name ||

              user.email?.split('@')[0] ||

              'Customer'

          ).trim()

          const email = String(user.email || '').trim().toLowerCase()

          const avatarUrl = String(

            metadata.avatar_url ||

              metadata.picture ||

              ''

          ).trim()

          const { error: profileError } = await supabase

            .from('delivery_customer_profiles')

            .upsert(

              {

                id: user.id,

                full_name: fullName,

                email: email || null,

                avatar_url: avatarUrl || null,

                updated_at: new Date().toISOString(),

              },

              {

                onConflict: 'id',

              }

            )

          if (profileError) {

            throw new Error(

              profileError.message ||

                'Unable to prepare your delivery customer account.'

            )

          }

          localStorage.removeItem('digitaldining_google_registration')

          setMessage('Login successful. Opening Delivery...')

          router.replace(nextPath)

          return

        }

        // ============================================================

        // WEBSITE OWNER GOOGLE LOGIN

        // ============================================================

        if (source === 'website') {

          setMessage('Verifying your restaurant account...')

          // Support the current schema while avoiding a hard dependency on

          // only one historical ownership-column layout.

          let restaurant = null

          const byId = await supabase

            .from('restaurants')

            .select('id')

            .eq('id', user.id)

            .maybeSingle()

          if (byId.error) {

            throw new Error(

              byId.error.message ||

                'Unable to verify your restaurant account.'

            )

          }

          restaurant = byId.data

          if (!restaurant) {

            const byUserId = await supabase

              .from('restaurants')

              .select('id')

              .eq('user_id', user.id)

              .maybeSingle()

            // Ignore "column does not exist" style fallback errors because

            // the id=user.id layout is the established registration layout.

            if (!byUserId.error) {

              restaurant = byUserId.data

            }

          }

          if (!restaurant?.id) {

            await supabase.auth.signOut()

            throw new Error(

              'No restaurant account is connected to this Google account. Please register your business first.'

            )

          }

          localStorage.removeItem('digitaldining_google_registration')

          setMessage('Login successful. Opening your dashboard...')

          router.replace(`/dashboard/${encodeURIComponent(restaurant.id)}`)

          return

        }

        // ============================================================

        // EXISTING RESTAURANT GOOGLE REGISTRATION

        // ============================================================

        const savedRegistration = localStorage.getItem(

          'digitaldining_google_registration'

        )

        let registrationDetails = {}

        if (savedRegistration) {

          try {

            registrationDetails = JSON.parse(savedRegistration)

          } catch (parseError) {

            console.error(

              'GOOGLE REGISTRATION STORAGE PARSE ERROR:',

              parseError

            )

          }

        }

        const metadata = user.user_metadata || {}

        const googleName =

          metadata.full_name ||

          metadata.name ||

          metadata.display_name ||

          user.email?.split('@')[0] ||

          'Restaurant Owner'

        const cleanName =

          registrationDetails.name?.trim() || googleName.trim()

        const cleanEmail = user.email?.trim().toLowerCase()

        const cleanPhone = registrationDetails.phone?.trim() || ''

        const cleanDob = registrationDetails.dob?.trim() || ''

        if (!cleanEmail) {

          throw new Error(

            'Google did not provide an email address. Please use another Google account.'

          )

        }

        if (!cleanPhone || !cleanDob) {

          throw new Error(

            'Phone number or date of birth was missing. Please return to registration and try again.'

          )

        }

        setMessage('Creating your restaurant profile...')

        const response = await fetch('/api/register/google', {

          method: 'POST',

          headers: {

            'Content-Type': 'application/json',

          },

          body: JSON.stringify({

            userId: user.id,

            name: cleanName,

            email: cleanEmail,

            phone: cleanPhone,

            dob: cleanDob,

          }),

        })

        const responseText = await response.text()

        let data = {}

        try {

          data = responseText ? JSON.parse(responseText) : {}

        } catch {

          throw new Error(

            'The Google registration server returned an invalid response.'

          )

        }

        if (!response.ok || !data.success) {

          throw new Error(

            data.message || 'Could not create your restaurant profile.'

          )

        }

        if (!data.restaurantId) {

          throw new Error(

            'Restaurant profile was created, but no restaurant ID was returned.'

          )

        }

        localStorage.removeItem('digitaldining_google_registration')

        const biometricEnabled =

          registrationDetails.biometricEnabled !== false

        if (!biometricEnabled) {

          setMessage(

            'Registration completed. Redirecting to subscription...'

          )

          router.replace(`/subscribe/${data.restaurantId}`)

          return

        }

        if (

          typeof window === 'undefined' ||

          !window.PublicKeyCredential ||

          !supabase.auth.registerPasskey ||

          typeof supabase.auth.registerPasskey !== 'function'

        ) {

          alert(

            'Your Google restaurant account was created successfully. Biometric/passkey login is unavailable in this browser. You can enable it later.'

          )

          router.replace(`/subscribe/${data.restaurantId}`)

          return

        }

        setMessage('Set up your biometric login...')

        try {

          const { data: passkeyData, error: passkeyError } =

            await supabase.auth.registerPasskey()

          if (passkeyError) {

            console.error(

              'GOOGLE PASSKEY REGISTRATION ERROR:',

              passkeyError

            )

            alert(

              'Your Google restaurant account was created successfully, but biometric setup could not be completed. You can continue without it.'

            )

          } else if (passkeyData) {

            alert(

              'Google Account Created and Biometric Login Enabled! 🔐'

            )

          }

          router.replace(`/subscribe/${data.restaurantId}`)

        } catch (passkeyError) {

          console.error(

            'GOOGLE UNEXPECTED PASSKEY ERROR:',

            passkeyError

          )

          alert(

            'Your Google restaurant account was created successfully, but biometric setup could not be completed. You can continue without biometric login.'

          )

          router.replace(`/subscribe/${data.restaurantId}`)

        }

      } catch (error) {

        console.error('GOOGLE AUTH COMPLETION ERROR:', error)

        if (!active) return

        const source = safeSource(searchParams.get('source'))

        setErrorMessage(

          error?.message || 'Google sign-in could not be completed.'

        )

        setMessage('')

        // Do not automatically redirect here, otherwise an OAuth failure can

        // become a visible redirect loop.

        if (source === 'delivery') {

          return

        }

      }

    }

    completeLogin()

    return () => {

      active = false

    }

  }, [router, searchParams])

  const source = safeSource(searchParams.get('source'))

  const retryPath =

    source === 'delivery' ? '/delivery/login' : source === 'website' ? '/login' : '/register'

  return (

    <main className="flex min-h-dvh items-center justify-center bg-neutral-950 p-4 text-neutral-100">

      <section className="w-full max-w-md rounded-3xl border border-neutral-800 bg-neutral-900 p-8 text-center shadow-2xl">

        {!errorMessage ? (

          <>

            <div className="mx-auto mb-5 h-12 w-12 animate-spin rounded-full border-4 border-neutral-700 border-t-emerald-500" />

            <h1 className="text-xl font-black text-white">

              Please wait

            </h1>

            <p className="mt-3 text-sm text-neutral-400">

              {message}

            </p>

          </>

        ) : (

          <>

            <div className="mb-4 text-4xl">⚠️</div>

            <h1 className="text-xl font-black text-white">

              Sign In Could Not Be Completed

            </h1>

            <p className="mt-3 text-sm leading-relaxed text-red-400">

              {errorMessage}

            </p>

            <button

              type="button"

              onClick={() => router.replace(retryPath)}

              className="mt-6 w-full rounded-xl bg-emerald-500 py-3 text-xs font-black uppercase tracking-wider text-white transition hover:bg-emerald-600"

            >

              Try Again

            </button>

          </>

        )}

      </section>

    </main>

  )

}
function AuthCompleteLoading() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-neutral-950 p-4 text-neutral-100">
      <section className="w-full max-w-md rounded-3xl border border-neutral-800 bg-neutral-900 p-8 text-center shadow-2xl">
        <div className="mx-auto mb-5 h-12 w-12 animate-spin rounded-full border-4 border-neutral-700 border-t-emerald-500" />
        <h1 className="text-xl font-black text-white">
          Please wait
        </h1>
        <p className="mt-3 text-sm text-neutral-400">
          Completing Google sign-in...
        </p>
      </section>
    </main>
  )
}

export default function AuthCompletePage() {
  return (
    <Suspense fallback={<AuthCompleteLoading />}>
      <AuthCompleteContent />
    </Suspense>
  )
}
