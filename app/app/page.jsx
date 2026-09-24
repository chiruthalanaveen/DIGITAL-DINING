'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const SESSION_STORAGE_KEY = 'digital-dine-staff-session'

export default function DigitalDineApp() {
  const router = useRouter()

  const [restaurantCode, setRestaurantCode] = useState('')
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('waiter')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // =========================================================
  // FIND RESTAURANT
  // =========================================================

  const findRestaurant = async () => {
    const code = String(restaurantCode || '').trim()

    if (!code) {
      throw new Error('Enter your Restaurant Code.')
    }

    const { data, error: restaurantError } = await supabase
      .from('restaurants')
      .select(`
        id,
        name,
        restaurant_code,
        subscription_status,
        subscription_expires_at
      `)
      .eq('restaurant_code', code)
      .maybeSingle()

    if (restaurantError) {
      console.error(
        '[DIGITAL DINE APP] Restaurant lookup error:',
        restaurantError
      )

      throw new Error(
        'Unable to verify restaurant. Please try again.'
      )
    }

    if (!data?.id) {
      throw new Error('Invalid Restaurant Code.')
    }

    return data
  }

  // =========================================================
  // CREATE SECURE STAFF SESSION
  // =========================================================

  const createStaffSession = async (restaurant) => {
    const cleanRestaurantCode =
      String(restaurantCode || '').trim()

    const cleanUserId =
      String(userId || '')
        .trim()
        .toLowerCase()

    const cleanPassword =
      String(password || '').trim()

    console.log(
      '[DIGITAL DINE APP] Creating staff session:',
      {
        restaurantId: restaurant.id,
        restaurantCode: cleanRestaurantCode,
        userId: cleanUserId,
        role,
      }
    )

    const { data, error: sessionError } =
      await supabase.rpc(
        'create_staff_app_session',
        {
          p_restaurant_id: String(restaurant.id),
          p_restaurant_code: cleanRestaurantCode,
          p_user_id: cleanUserId,
          p_password: cleanPassword,
          p_role: role,
        }
      )

    if (sessionError) {
      console.error(
        '[DIGITAL DINE APP] Session RPC error:',
        sessionError
      )

      throw new Error(
        sessionError?.message ||
          'Unable to sign in.'
      )
    }

    console.log(
      '[DIGITAL DINE APP] Session created:',
      {
        success: data?.success,
        restaurantId: data?.restaurantId,
        userId: data?.userId,
        role: data?.role,
        expiresAt: data?.expiresAt,
      }
    )
console.log(
  '[DIGITAL DINE] CREATE SESSION RESPONSE:',
  data
)

console.log(
  '[DIGITAL DINE] CREATE SESSION ERROR:',
  sessionError
)
    if (!data?.success) {
      throw new Error(
        data?.message ||
          'Invalid login credentials.'
      )
    }

    if (!data?.sessionToken) {
      throw new Error(
        'The login server did not return a session.'
      )
    }

    if (
      String(data.restaurantId) !==
      String(restaurant.id)
    ) {
      throw new Error(
        'These credentials do not belong to this restaurant.'
      )
    }

    if (
      String(data.role || '').toLowerCase() !==
      String(role).toLowerCase()
    ) {
      throw new Error(
        'Your account does not have access to this portal.'
      )
    }

    return data
  }

  // =========================================================
  // SAVE SESSION
  // =========================================================

  const saveSession = (
    restaurant,
    sessionData
  ) => {
    if (typeof window === 'undefined') {
      return
    }

    const session = {
      sessionId:
        sessionData.sessionId || null,

      sessionToken:
        sessionData.sessionToken,

      restaurantId:
        String(
          sessionData.restaurantId ||
            restaurant.id
        ),

      restaurantCode:
        String(
          sessionData.restaurantCode ||
            restaurant.restaurant_code ||
            restaurantCode
        ).trim(),

      restaurantName:
        restaurant.name ||
        'Digital Dine',

      userId:
        String(
          sessionData.userId ||
            userId
        )
          .trim()
          .toLowerCase(),

      role:
        String(
          sessionData.role ||
            role
        ).toLowerCase(),

      staff:
        sessionData.staff || null,

      expiresAt:
        sessionData.expiresAt || null,

      createdAt:
        Date.now(),
    }

    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify(session)
    )

    /*
     * Remove the old temporary session format
     * from our previous test.
     */

    localStorage.removeItem(
      'digital-dine-app-session'
    )

    return session
  }

  // =========================================================
  // REDIRECT
  // =========================================================

  const redirectToPortal = (
    restaurant,
    sessionData
  ) => {
    const restaurantId =
      encodeURIComponent(
        String(
          sessionData?.restaurantId ||
            restaurant.id
        )
      )

    const sessionRole =
      String(
        sessionData?.role ||
          role
      ).toLowerCase()

    if (sessionRole === 'waiter') {
      router.replace(
        `/waiter/${restaurantId}`
      )

      return
    }

    if (sessionRole === 'kitchen') {
      router.replace(
        `/kitchen/${restaurantId}`
      )

      return
    }

    if (sessionRole === 'manager') {
      router.replace(
        `/manager/${restaurantId}`
      )

      return
    }

    throw new Error(
      'Unsupported staff role.'
    )
  }

  // =========================================================
  // LOGIN
  // =========================================================

  const handleLogin = async (event) => {
    event.preventDefault()

    if (loading) {
      return
    }

    setError('')

    const cleanRestaurantCode =
      String(restaurantCode || '').trim()

    const cleanUserId =
      String(userId || '').trim()

    const cleanPassword =
      String(password || '').trim()

    if (!cleanRestaurantCode) {
      setError(
        'Enter your Restaurant Code.'
      )

      return
    }

    if (!cleanUserId) {
      setError(
        'Enter your User ID.'
      )

      return
    }

    if (!cleanPassword) {
      setError(
        'Enter your password.'
      )

      return
    }

    setLoading(true)

    try {
      // -------------------------------------
      // 1. Find restaurant
      // -------------------------------------

      const restaurant =
        await findRestaurant()

      // -------------------------------------
      // 2. Authenticate + create session
      // -------------------------------------

      const sessionData =
        await createStaffSession(
          restaurant
        )

      // -------------------------------------
      // 3. Save secure session token
      // -------------------------------------

      saveSession(
        restaurant,
        sessionData
      )

      // -------------------------------------
      // IMPORTANT:
      // Password is NOT saved.
      // -------------------------------------

      setPassword('')

      // -------------------------------------
      // 4. Open existing portal
      // -------------------------------------

      redirectToPortal(
        restaurant,
        sessionData
      )
    } catch (loginError) {
      console.error(
        '[DIGITAL DINE APP] Login failed:',
        loginError
      )

      setError(
        loginError?.message ||
          'Unable to sign in. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  // =========================================================
  // SELECT ROLE
  // =========================================================

  const selectRole = (
    selectedRole
  ) => {
    if (loading) {
      return
    }

    setRole(selectedRole)
    setError('')
  }

  // =========================================================
  // UI
  // =========================================================

  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <div className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-5 py-10">

        {/* BRAND */}

        <div className="mb-8 text-center">

          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] bg-orange-500 shadow-2xl shadow-orange-950/40">

            <span className="text-3xl font-black text-white">
              DD
            </span>

          </div>

          <h1 className="mt-5 text-3xl font-black tracking-tight">
            Digital Dine
          </h1>

          <p className="mt-2 text-sm text-neutral-400">
            Restaurant Operations App
          </p>

        </div>

        {/* LOGIN CARD */}

        <div className="rounded-[32px] border border-neutral-800 bg-neutral-900 p-6 shadow-2xl">

          <div className="mb-6">

            <p className="text-xs font-black uppercase tracking-[0.2em] text-orange-400">
              Staff Login
            </p>

            <h2 className="mt-2 text-xl font-black">
              Welcome back
            </h2>

            <p className="mt-1 text-xs leading-5 text-neutral-500">
              Sign in once to open your Digital Dine workspace.
            </p>

          </div>

          <form
            onSubmit={handleLogin}
            className="space-y-5"
          >

            {/* RESTAURANT CODE */}

            <div>

              <label className="mb-2 block text-[11px] font-black uppercase tracking-wider text-neutral-400">
                Restaurant Code
              </label>

              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                value={restaurantCode}
                onChange={(event) => {
                  setRestaurantCode(
                    event.target.value
                      .replace(/\D/g, '')
                      .slice(0, 5)
                  )

                  setError('')
                }}
                placeholder="15478"
                disabled={loading}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-4 text-base font-bold text-white outline-none transition focus:border-orange-500 disabled:opacity-60"
              />

            </div>

            {/* ROLE */}

            <div>

              <label className="mb-2 block text-[11px] font-black uppercase tracking-wider text-neutral-400">
                Login As
              </label>

              <div className="grid grid-cols-3 gap-2">

                {/* MANAGER */}

                <button
                  type="button"
                  disabled={loading}
                  onClick={() =>
                    selectRole('manager')
                  }
                  className={`rounded-2xl border px-2 py-3 text-xs font-black transition ${
                    role === 'manager'
                      ? 'border-orange-500 bg-orange-500 text-white'
                      : 'border-neutral-800 bg-neutral-950 text-neutral-400'
                  }`}
                >
                  <span className="text-xl">
                    👨‍💼
                  </span>

                  <span className="mt-1 block">
                    Manager
                  </span>

                </button>

                {/* WAITER */}

                <button
                  type="button"
                  disabled={loading}
                  onClick={() =>
                    selectRole('waiter')
                  }
                  className={`rounded-2xl border px-2 py-3 text-xs font-black transition ${
                    role === 'waiter'
                      ? 'border-orange-500 bg-orange-500 text-white'
                      : 'border-neutral-800 bg-neutral-950 text-neutral-400'
                  }`}
                >
                  <span className="text-xl">
                    🧑‍🍽️
                  </span>

                  <span className="mt-1 block">
                    Waiter
                  </span>

                </button>

                {/* KITCHEN */}

                <button
                  type="button"
                  disabled={loading}
                  onClick={() =>
                    selectRole('kitchen')
                  }
                  className={`rounded-2xl border px-2 py-3 text-xs font-black transition ${
                    role === 'kitchen'
                      ? 'border-orange-500 bg-orange-500 text-white'
                      : 'border-neutral-800 bg-neutral-950 text-neutral-400'
                  }`}
                >
                  <span className="text-xl">
                    👨‍🍳
                  </span>

                  <span className="mt-1 block">
                    Kitchen
                  </span>

                </button>

              </div>

            </div>

            {/* USER ID */}

            <div>

              <label className="mb-2 block text-[11px] font-black uppercase tracking-wider text-neutral-400">
                User ID
              </label>

              <input
                type="text"
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="username"
                value={userId}
                onChange={(event) => {
                  setUserId(
                    event.target.value
                  )

                  setError('')
                }}
                placeholder={
                  role === 'manager'
                    ? 'manager01'
                    : role === 'waiter'
                      ? 'waiter01'
                      : 'kitchen01'
                }
                disabled={loading}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-4 text-base text-white outline-none transition focus:border-orange-500 disabled:opacity-60"
              />

            </div>

            {/* PASSWORD */}

            <div>

              <label className="mb-2 block text-[11px] font-black uppercase tracking-wider text-neutral-400">
                Password
              </label>

              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => {
                  setPassword(
                    event.target.value
                  )

                  setError('')
                }}
                placeholder="Enter password"
                disabled={loading}
                className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-4 text-base text-white outline-none transition focus:border-orange-500 disabled:opacity-60"
              />

            </div>

            {/* ERROR */}

            {error && (
              <div className="rounded-2xl border border-red-500/20 bg-red-500/10 p-4">

                <p className="text-xs font-bold leading-5 text-red-300">
                  {error}
                </p>

              </div>
            )}

            {/* LOGIN BUTTON */}

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-2xl bg-orange-500 px-4 py-4 text-sm font-black uppercase tracking-wider text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? 'Signing In...'
                : 'Sign In'}
            </button>

          </form>

        </div>

        {/* SECURITY */}

        <div className="mt-5 rounded-2xl border border-neutral-900 bg-neutral-950/50 px-4 py-3 text-center">

          <p className="text-[10px] leading-4 text-neutral-600">
            Your staff password is used only to authenticate your login.
            Digital Dine does not save the password in the app session.
          </p>

        </div>

        {/* FOOTER */}

        <div className="mt-5 text-center">

          <p className="text-[11px] leading-5 text-neutral-600">
            Digital Dining
            <br />
            Restaurant Management System
          </p>

        </div>

      </div>
    </main>
  )
}