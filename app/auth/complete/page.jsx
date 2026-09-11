'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function AuthCompletePage() {
  const router = useRouter()
  const [message, setMessage] = useState('Completing Google sign-in...')

  useEffect(() => {
    let active = true

    async function completeLogin() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (!active) return

      if (userError || !user) {
        router.replace('/login?error=google_login_failed')
        return
      }

      const { data: restaurant, error: restaurantError } = await supabase
        .from('restaurants')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle()

      if (!active) return

      if (restaurantError) {
        setMessage('Unable to check your restaurant profile.')
        return
      }

      if (restaurant) {
        router.replace(`/dashboard/${restaurant.id}`)
        return
      }

      router.replace('/register?google=complete')
    }

    completeLogin()

    return () => {
      active = false
    }
  }, [router])

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '24px',
      }}
    >
      <p>{message}</p>
    </main>
  )
}