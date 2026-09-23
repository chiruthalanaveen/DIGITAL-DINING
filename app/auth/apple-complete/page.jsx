'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AppleSignupComplete() {
  const router = useRouter()
  const [message, setMessage] = useState('Completing Apple sign-up…')

  useEffect(() => {
    let active = true

    const complete = async () => {
      try {
        const { data: sessionData, error: sessionError } = await supabase.auth.getSession()

        if (sessionError || !sessionData?.session?.access_token) {
          throw new Error('Apple authentication session was not returned.')
        }

        const saved = localStorage.getItem('digitaldining_apple_registration')
        if (!saved) {
          await supabase.auth.signOut()
          throw new Error('Apple registration details were not found. Please start sign-up again.')
        }

        let profile
        try {
          profile = JSON.parse(saved)
        } catch {
          throw new Error('Saved Apple registration details are invalid.')
        }

        const response = await fetch('/api/auth/apple-complete', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${sessionData.session.access_token}`,
          },
          body: JSON.stringify({
            name: profile?.name,
            phone: profile?.phone,
            dob: profile?.dob,
          }),
        })

        let result = {}
        try {
          result = await response.json()
        } catch {
          throw new Error('The Apple registration server returned an invalid response.')
        }

        if (!response.ok || !result?.success || !result?.restaurantId) {
          throw new Error(
            result?.message || 'Unable to create your restaurant profile.'
          )
        }

        localStorage.removeItem('digitaldining_apple_registration')
        localStorage.setItem(
          'digitaldining_biometric_enabled',
          String(profile?.biometricEnabled === true)
        )

        setMessage('Restaurant account created. Opening your subscription page…')

        router.replace(`/subscribe/${result.restaurantId}`)
      } catch (error) {
        console.error('APPLE SIGN-UP COMPLETE ERROR:', error)
        localStorage.removeItem('digitaldining_apple_registration')
        try {
          await supabase.auth.signOut()
        } catch (signOutError) {
          console.error('APPLE SIGN-UP: Could not clear session:', signOutError)
        }

        if (!active) return
        setMessage(error?.message || 'Apple sign-up could not be completed.')
      }
    }

    complete()

    return () => {
      active = false
    }
  }, [router])

  return (
    <div className="min-h-screen bg-neutral-950 text-white flex items-center justify-center p-6">
      <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-3xl p-8 text-center shadow-2xl">
        <div className="mx-auto mb-5 w-14 h-14 rounded-2xl bg-black border border-neutral-700 flex items-center justify-center">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M17.05 12.54c-.02-2.15 1.76-3.18 1.84-3.23-1.01-1.47-2.58-1.67-3.13-1.69-1.31-.14-2.58.78-3.25.78-.68 0-1.72-.76-2.82-.74-1.45.02-2.79.84-3.54 2.14-1.52 2.63-.39 6.5 1.08 8.63.74 1.04 1.59 2.19 2.72 2.15 1.09-.04 1.5-.69 2.81-.69 1.31 0 1.68.69 2.82.67 1.17-.02 1.9-1.05 2.61-2.1.83-1.21 1.17-2.38 1.19-2.44-.03-.01-2.29-.88-2.31-3.48ZM14.9 6.22c.6-.73 1.01-1.74.9-2.74-.87.04-1.93.58-2.55 1.3-.56.64-1.06 1.66-.93 2.64.97.08 1.96-.49 2.58-1.2Z" />
          </svg>
        </div>
        <h1 className="text-xl font-black">Apple Sign-Up</h1>
        <p className="text-sm text-neutral-400 mt-2 leading-relaxed">{message}</p>
        <div className="mt-6 h-1 bg-neutral-800 rounded-full overflow-hidden">
          <div className="h-full w-1/2 bg-white animate-pulse rounded-full" />
        </div>
      </div>
    </div>
  )
}
