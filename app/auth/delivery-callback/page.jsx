'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import {
  readDeliveryGoogleContext,
  clearDeliveryGoogleContext,
} from '@/lib/deliveryGoogleAuth'

// This callback belongs ONLY to delivery customers.
// Do not replace /auth/google-login: that callback serves website/owner login.
export default function DeliveryGoogleCallbackPage() {
  const router = useRouter()
  const flowRef = useRef(null)
  const [message, setMessage] = useState('Completing Google sign-in...')
  const [error, setError] = useState('')
  const [returnPath, setReturnPath] = useState('/delivery/login')

  useEffect(() => {
    // React StrictMode can mount, clean up, and re-run this effect in dev.
    // Reuse the same pending auth work so a single-use OAuth code is exchanged once.
    let active = true

    async function complete() {
      const context = readDeliveryGoogleContext()
      const intendedPath = context.next === '/delivery' && context.store
        ? `/delivery/${encodeURIComponent(context.store)}`
        : context.next
      const signInLink = new URLSearchParams({ next: context.next })
      if (context.store) signInLink.set('store', context.store)
      const fallbackPath = `/delivery/login?${signInLink.toString()}`
      setReturnPath(fallbackPath)

      try {
        if (typeof window === 'undefined') throw new Error('Browser authentication is unavailable.')
        const url = new URL(window.location.href)
        const fragment = new URLSearchParams(url.hash.replace(/^#/, ''))
        const providerError = url.searchParams.get('error_description') ||
          url.searchParams.get('error') || fragment.get('error_description') || fragment.get('error')
        if (providerError) throw new Error(providerError.replace(/\+/g, ' '))

        setMessage('Verifying your Google session...')
        let { data: { session }, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) throw sessionError

        // This project's existing browser client has detectSessionInUrl: true,
        // so its initialization usually consumes the callback code automatically.
        if (!session && url.searchParams.has('code')) {
          const code = url.searchParams.get('code')
          const exchanged = await supabase.auth.exchangeCodeForSession(code)
          if (exchanged.error) {
            // The browser client may have exchanged the single-use code just before us.
            const latest = await supabase.auth.getSession()
            session = latest.data?.session || null
            if (!session) throw exchanged.error
          } else {
            session = exchanged.data?.session || null
          }
        }
        if (!session?.access_token) {
          throw new Error('No Google session was found. Check your Supabase redirect settings and try again.')
        }

        // getUser verifies the session against Supabase Auth, unlike getSession.
        const { data: { user }, error: userError } = await supabase.auth.getUser()
        if (userError || !user?.id) throw userError || new Error('Google login could not be verified.')

        const hasGoogleIdentity = user?.identities?.some((item) => item.provider === 'google') ||
          user?.app_metadata?.provider === 'google'
        if (!hasGoogleIdentity) {
          throw new Error('This account is not connected to Google. Use the Google button to choose an account.')
        }

        setMessage('Preparing your delivery profile...')
        const { data: existing, error: lookupError } = await supabase
          .from('delivery_customer_profiles')
          .select('id')
          .eq('id', user.id)
          .maybeSingle()
        if (lookupError) throw new Error(`Delivery profile lookup failed: ${lookupError.message}`)

        if (!existing) {
          const metadata = user.user_metadata || {}
          const fullName = String(
            metadata.full_name || metadata.name || metadata.display_name ||
            user.email?.split('@')[0] || 'Customer'
          ).trim().slice(0, 100)
          const avatarUrl = String(metadata.avatar_url || metadata.picture || '').trim()
          const { error: insertError } = await supabase
            .from('delivery_customer_profiles')
            .insert({
              id: user.id,
              full_name: fullName,
              email: user.email || null,
              avatar_url: avatarUrl || null,
            })
          if (insertError && insertError.code !== '23505') {
            throw new Error(`Delivery profile could not be created: ${insertError.message}`)
          }
        }

        clearDeliveryGoogleContext()
        return intendedPath
      } catch (caught) {
        console.error('[DELIVERY GOOGLE CALLBACK]', caught)
        throw caught
      }
    }

    if (!flowRef.current) flowRef.current = complete()
    flowRef.current.then((destination) => {
      if (!active) return
      setMessage('Signed in. Opening Delivery...')
      router.replace(destination)
      router.refresh()
    }).catch((caught) => {
      if (active) setError(caught?.message || 'Google sign-in could not be completed.')
    })
    return () => { active = false }
  }, [router])

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#f7f8f6] px-5 text-neutral-900">
      <section className="w-full max-w-sm rounded-[28px] border border-neutral-200 bg-white p-6 text-center shadow-xl">
        {error ? (
          <>
            <div className="text-3xl">⚠️</div>
            <h1 className="mt-4 text-lg font-black">Google sign-in needs attention</h1>
            <p className="mt-3 break-words text-sm leading-6 text-red-700" role="alert">{error}</p>
            <button
              type="button"
              onClick={() => router.replace(returnPath)}
              className="mt-6 w-full rounded-2xl bg-[#84cc35] px-4 py-3.5 text-sm font-black text-[#26351b]"
            >
              Return to Delivery Login
            </button>
          </>
        ) : (
          <>
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-green-100 border-t-green-600" />
            <h1 className="mt-5 text-lg font-black">Digital Dine Delivery</h1>
            <p className="mt-3 text-sm font-semibold text-neutral-500" role="status">{message}</p>
          </>
        )}
      </section>
    </main>
  )
}
