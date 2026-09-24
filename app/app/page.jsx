'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const SESSION_STORAGE_KEY = 'digital-dine-staff-session'

export default function DigitalDineApp() {
  const router = useRouter()

  const [restaurantCode, setRestaurantCode] = useState('')
  const [restaurant, setRestaurant] = useState(null)

  const [role, setRole] = useState('')
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')

  const [menuOpen, setMenuOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // =========================================================
  // RESTAURANT CODE GATE
  // =========================================================

  const findRestaurant = async (codeValue) => {
    const code = String(codeValue || '').trim()

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

  const handleRestaurantCode = async (event) => {
    event.preventDefault()

    if (loading) return

    setError('')

    const cleanCode = String(restaurantCode || '').trim()

    if (!cleanCode) {
      setError('Enter your Restaurant Code.')
      return
    }

    setLoading(true)

    try {
      const foundRestaurant = await findRestaurant(cleanCode)

      setRestaurant(foundRestaurant)
      setRole('')
      setUserId('')
      setPassword('')
      setMenuOpen(false)
    } catch (lookupError) {
      console.error(
        '[DIGITAL DINE APP] Restaurant code error:',
        lookupError
      )

      setError(
        lookupError?.message ||
          'Unable to verify restaurant.'
      )
    } finally {
      setLoading(false)
    }
  }

  const changeRestaurant = () => {
    setRestaurant(null)
    setRole('')
    setUserId('')
    setPassword('')
    setMenuOpen(false)
    setError('')
  }

  // =========================================================
  // CREATE SECURE STAFF SESSION
  // =========================================================

  const createStaffSession = async () => {
    if (!restaurant?.id) {
      throw new Error(
        'Restaurant session is missing. Enter the Restaurant Code again.'
      )
    }

    const cleanRestaurantCode = String(
      restaurant.restaurant_code || restaurantCode
    ).trim()

    const cleanUserId = String(userId || '')
      .trim()
      .toLowerCase()

    const cleanPassword = String(password || '').trim()

    const { data, error: sessionError } = await supabase.rpc(
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
        sessionError?.message || 'Unable to sign in.'
      )
    }

    if (!data?.success) {
      throw new Error(
        data?.message || 'Invalid login credentials.'
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
  // SAVE STAFF SESSION
  // =========================================================

  const saveSession = (sessionData) => {
    if (typeof window === 'undefined') return

    const session = {
      sessionId: sessionData.sessionId || null,
      sessionToken: sessionData.sessionToken,

      restaurantId: String(
        sessionData.restaurantId || restaurant.id
      ),

      restaurantCode: String(
        sessionData.restaurantCode ||
          restaurant.restaurant_code ||
          restaurantCode
      ).trim(),

      restaurantName:
        restaurant.name || 'Digital Dine',

      userId: String(
        sessionData.userId || userId
      )
        .trim()
        .toLowerCase(),

      role: String(
        sessionData.role || role
      ).toLowerCase(),

      staff: sessionData.staff || null,
      expiresAt: sessionData.expiresAt || null,
      createdAt: Date.now(),
    }

    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify(session)
    )

    localStorage.removeItem(
      'digital-dine-app-session'
    )
  }

  // =========================================================
  // STAFF REDIRECT
  // =========================================================

  const redirectToPortal = (sessionData) => {
    const id = encodeURIComponent(
      String(
        sessionData?.restaurantId ||
          restaurant.id
      )
    )

    const sessionRole = String(
      sessionData?.role || role
    ).toLowerCase()

    if (sessionRole === 'waiter') {
      router.replace(`/app/waiter/${id}`)
      return
    }

    if (sessionRole === 'kitchen') {
      router.replace(`/app/kitchen/${id}`)
      return
    }

    if (sessionRole === 'manager') {
      router.replace(`/app/manager/${id}`)
      return
    }

    throw new Error('Unsupported staff role.')
  }

  // =========================================================
  // STAFF LOGIN
  // =========================================================

  const handleStaffLogin = async (event) => {
    event.preventDefault()

    if (loading) return

    setError('')

    if (!role) {
      setError('Choose a staff login.')
      return
    }

    if (!String(userId || '').trim()) {
      setError('Enter your User ID.')
      return
    }

    if (!String(password || '').trim()) {
      setError('Enter your password.')
      return
    }

    setLoading(true)

    try {
      const sessionData =
        await createStaffSession()

      saveSession(sessionData)

      setPassword('')

      redirectToPortal(sessionData)
    } catch (loginError) {
      console.error(
        '[DIGITAL DINE APP] Staff login failed:',
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

  const openStaffLogin = (selectedRole) => {
    setRole(selectedRole)
    setUserId('')
    setPassword('')
    setError('')
    setMenuOpen(false)
  }

  const closeStaffLogin = () => {
    setRole('')
    setUserId('')
    setPassword('')
    setError('')
  }

  const openOwnerLogin = () => {
    setMenuOpen(false)

    // Owner keeps using the existing owner authentication page.
    // No duplicate owner username/password system is created here.
    router.push('/login')
  }

  const roleTitle =
    role === 'manager'
      ? 'Manager Login'
      : role === 'waiter'
        ? 'Waiter Login'
        : role === 'kitchen'
          ? 'Kitchen Login'
          : 'Staff Login'

  const roleIcon =
    role === 'manager'
      ? '👨‍💼'
      : role === 'waiter'
        ? '🧑‍🍳'
        : role === 'kitchen'
          ? '🍳'
          : '👤'

  // =========================================================
  // STEP 1 — RESTAURANT CODE
  // =========================================================

  if (!restaurant) {
    return (
      <main className="min-h-[100dvh] w-full overflow-x-hidden bg-neutral-950 text-white">
        <div className="mx-auto flex min-h-[100dvh] w-full max-w-[480px] flex-col justify-center px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(2rem,env(safe-area-inset-top))]">
          <div className="text-center">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] bg-orange-500 shadow-2xl shadow-orange-950/40">
              <span className="text-3xl font-black">
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

          <form
            onSubmit={handleRestaurantCode}
            className="mt-8 rounded-[32px] border border-neutral-800 bg-neutral-900 p-6 shadow-2xl"
          >
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-400">
              Step 1
            </p>

            <h2 className="mt-2 text-xl font-black">
              Enter Restaurant Code
            </h2>

            <p className="mt-2 text-xs leading-5 text-neutral-500">
              Enter the restaurant&apos;s 5-digit code to open the staff portal.
            </p>

            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={5}
              value={restaurantCode}
              onChange={(event) => {
                setRestaurantCode(
                  event.target.value
                    .replace(/\D/g, '')
                    .slice(0, 5)
                )
                setError('')
              }}
              placeholder="18945"
              disabled={loading}
              className="mt-5 w-full rounded-2xl border border-orange-500/30 bg-neutral-950 px-4 py-4 text-center text-2xl font-black tracking-[0.35em] text-white outline-none focus:border-orange-500 disabled:opacity-60"
            />

            {error && (
              <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs font-bold text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={
                loading ||
                restaurantCode.length !== 5
              }
              className="mt-5 w-full rounded-2xl bg-orange-500 py-4 text-sm font-black text-white shadow-lg shadow-orange-500/20 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {loading
                ? 'Checking Restaurant...'
                : 'Continue'}
            </button>
          </form>
        </div>
      </main>
    )
  }

  // =========================================================
  // STEP 2 — RESTAURANT ROLE HOME
  // =========================================================

  return (
    <main className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-neutral-950 text-white">
      <div className="mx-auto min-h-[100dvh] w-full max-w-[480px] overflow-x-hidden bg-neutral-950 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {/* MOBILE HEADER */}

        <header className="sticky top-0 z-50 border-b border-neutral-800 bg-neutral-950/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-400">
                Digital Dine
              </p>

              <h1 className="mt-1 truncate text-lg font-black">
                {restaurant.name || 'Restaurant'}
              </h1>

              <button
                type="button"
                onClick={changeRestaurant}
                className="mt-1 text-left text-[10px] font-bold text-neutral-500"
              >
                Code {restaurant.restaurant_code} · Change
              </button>
            </div>

            {/* THREE HORIZONTAL LINES */}

            <button
              type="button"
              onClick={() =>
                setMenuOpen((current) => !current)
              }
              className={`flex h-11 w-11 shrink-0 flex-col items-center justify-center gap-1.5 rounded-2xl border transition ${
                menuOpen
                  ? 'border-orange-500 bg-orange-500/10'
                  : 'border-neutral-800 bg-neutral-900'
              }`}
              aria-label="Open owner and manager login menu"
              aria-expanded={menuOpen}
            >
              <span className="h-0.5 w-5 rounded-full bg-white" />
              <span className="h-0.5 w-5 rounded-full bg-white" />
              <span className="h-0.5 w-5 rounded-full bg-white" />
            </button>
          </div>

          {/* OWNER + MANAGER HAMBURGER MENU */}

          {menuOpen && (
            <div className="absolute left-3 right-3 top-[calc(100%+0.5rem)] rounded-[24px] border border-neutral-800 bg-neutral-900 p-3 shadow-2xl">
              <p className="px-2 pb-2 text-[9px] font-black uppercase tracking-widest text-neutral-500">
                Management Access
              </p>

              <button
                type="button"
                onClick={() =>
                  openStaffLogin('manager')
                }
                className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left hover:bg-neutral-800"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-xl">
                  👨‍💼
                </span>

                <div>
                  <p className="text-sm font-black">
                    Manager Login
                  </p>

                  <p className="mt-0.5 text-[10px] text-neutral-500">
                    Restaurant management workspace
                  </p>
                </div>
              </button>

              <button
                type="button"
                onClick={openOwnerLogin}
                className="mt-1 flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left hover:bg-neutral-800"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/10 text-xl">
                  👑
                </span>

                <div>
                  <p className="text-sm font-black">
                    Owner Login
                  </p>

                  <p className="mt-0.5 text-[10px] text-neutral-500">
                    Open existing owner account login
                  </p>
                </div>
              </button>
            </div>
          )}
        </header>

        <div className="space-y-5 px-4 py-6">
          {/* RESTAURANT WELCOME */}

          {!role && (
            <>
              <section className="rounded-[30px] border border-orange-500/20 bg-gradient-to-br from-orange-500/15 via-neutral-900 to-neutral-900 p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-400">
                  Restaurant Portal
                </p>

                <h2 className="mt-2 text-2xl font-black">
                  Who&apos;s working today?
                </h2>

                <p className="mt-2 text-xs leading-relaxed text-neutral-400">
                  Waiter and Kitchen access stay on the front screen for quick daily use.
                </p>
              </section>

              {/* FRONT SCREEN ONLY: WAITER + KITCHEN */}

              <section className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() =>
                    openStaffLogin('waiter')
                  }
                  className="min-h-[180px] rounded-[28px] border border-orange-500/20 bg-neutral-900 p-5 text-left active:scale-[0.98]"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/10 text-3xl">
                    🧑‍🍳
                  </div>

                  <h3 className="mt-5 text-lg font-black">
                    Waiter
                  </h3>

                  <p className="mt-2 text-[10px] leading-relaxed text-neutral-500">
                    Take orders and hand over ready dishes.
                  </p>

                  <p className="mt-4 text-xs font-black text-orange-400">
                    Login →
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() =>
                    openStaffLogin('kitchen')
                  }
                  className="min-h-[180px] rounded-[28px] border border-red-500/20 bg-neutral-900 p-5 text-left active:scale-[0.98]"
                >
                  <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-red-500/10 text-3xl">
                    🍳
                  </div>

                  <h3 className="mt-5 text-lg font-black">
                    Kitchen
                  </h3>

                  <p className="mt-2 text-[10px] leading-relaxed text-neutral-500">
                    Open KDS queue and update preparation.
                  </p>

                  <p className="mt-4 text-xs font-black text-red-400">
                    Login →
                  </p>
                </button>
              </section>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 px-4 py-3 text-center">
                <p className="text-[10px] leading-relaxed text-neutral-500">
                  Manager and Owner access are inside the{' '}
                  <span className="font-black text-white">
                    ☰ menu
                  </span>{' '}
                  at the top-right.
                </p>
              </div>
            </>
          )}

          {/* STAFF CREDENTIAL FORM */}

          {role && (
            <section className="rounded-[30px] border border-neutral-800 bg-neutral-900 p-5 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-3xl">
                    {roleIcon}
                  </span>

                  <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-orange-400">
                    Staff Access
                  </p>

                  <h2 className="mt-1 text-xl font-black">
                    {roleTitle}
                  </h2>

                  <p className="mt-1 text-[10px] text-neutral-500">
                    {restaurant.name} · Code{' '}
                    {restaurant.restaurant_code}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={closeStaffLogin}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-950 text-neutral-400"
                  aria-label="Close staff login"
                >
                  ✕
                </button>
              </div>

              <form
                onSubmit={handleStaffLogin}
                className="mt-5 space-y-4"
              >
                <div>
                  <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-neutral-500">
                    User ID
                  </label>

                  <input
                    type="text"
                    value={userId}
                    onChange={(event) => {
                      setUserId(event.target.value)
                      setError('')
                    }}
                    autoComplete="username"
                    placeholder={`${role} user ID`}
                    disabled={loading}
                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-4 text-base text-white outline-none focus:border-orange-500 disabled:opacity-60"
                  />
                </div>

                <div>
                  <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-neutral-500">
                    Password / PIN
                  </label>

                  <input
                    type="password"
                    value={password}
                    onChange={(event) => {
                      setPassword(event.target.value)
                      setError('')
                    }}
                    autoComplete="current-password"
                    placeholder="Enter password"
                    disabled={loading}
                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-4 text-base text-white outline-none focus:border-orange-500 disabled:opacity-60"
                  />
                </div>

                {error && (
                  <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs font-bold text-red-300">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full rounded-2xl bg-orange-500 py-4 text-sm font-black text-white shadow-lg shadow-orange-500/20 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {loading
                    ? 'Signing In...'
                    : `Open ${roleTitle.replace(
                        ' Login',
                        ''
                      )}`}
                </button>
              </form>
            </section>
          )}
        </div>
      </div>
    </main>
  )
}
