'use client'

// DIGITAL DINE APP ENTRY: BLINKIT-STYLE MOBILE UI

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useMobileViewportLock } from '@/lib/useMobileViewportLock'

const SESSION_STORAGE_KEY = 'digital-dine-staff-session'

const SUPPORTED_PLAN_CODES = new Set([
  'restaurant_pro',
  'delivery',
  'restaurant_resort_pro',
  'restaurant_delivery',
  'restaurant_resort_delivery',
  // Temporary compatibility with accounts not yet refreshed after migration.
  'restaurant_standard',
  'restaurant_resort_standard',
])

const PLAN_LABELS = {
  restaurant_pro: 'Restaurant',
  delivery: 'Delivery',
  restaurant_resort_pro: 'Restaurant + Resort',
  restaurant_delivery: 'Restaurant + Delivery',
  restaurant_resort_delivery: 'Restaurant + Resort + Delivery',
  restaurant_standard: 'Restaurant',
  restaurant_resort_standard: 'Restaurant + Resort',
}

// Presentation only. Colours, icons and copy for each portal tile.
const ROLE_META = {
  owner: {
    title: 'Owner',
    icon: '👑',
    subtitle: 'Business & billing',
    tint: 'bg-violet-50',
    ring: 'text-violet-700',
    group: 'Business',
  },
  manager: {
    title: 'Manager',
    icon: '🧑‍💼',
    subtitle: 'Run daily operations',
    tint: 'bg-sky-50',
    ring: 'text-sky-700',
    group: 'Business',
  },
  waiter: {
    title: 'Waiter',
    icon: '🧑‍🍽️',
    subtitle: 'Table orders & service',
    tint: 'bg-orange-50',
    ring: 'text-orange-700',
    group: 'Restaurant',
  },
  kitchen: {
    title: 'KDS',
    icon: '👨‍🍳',
    subtitle: 'Kitchen display',
    tint: 'bg-red-50',
    ring: 'text-red-700',
    group: 'Restaurant',
  },
  packer: {
    title: 'Packer',
    icon: '📦',
    subtitle: 'Pack delivery orders',
    tint: 'bg-amber-50',
    ring: 'text-amber-700',
    group: 'Delivery',
  },
  driver: {
    title: 'Delivery Boy',
    icon: '🛵',
    subtitle: 'Routes & proof of delivery',
    tint: 'bg-emerald-50',
    ring: 'text-emerald-700',
    group: 'Delivery',
  },
}

const ROLE_TITLES = {
  waiter: 'Waiter Login',
  kitchen: 'KDS Login',
  manager: 'Manager Login',
}

function cleanRestaurantCode(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 5)
}

function resolvePlanCode(restaurant) {
  const raw = String(restaurant?.plan_code || '').trim().toLowerCase()
  if (raw && SUPPORTED_PLAN_CODES.has(raw)) return raw

  const legacy = String(restaurant?.plan || '').trim().toLowerCase()
  if (legacy === 'pro+' || legacy === 'restaurant + resort') {
    return 'restaurant_resort_pro'
  }
  return 'restaurant_pro'
}

function rolesForPlan(planCode) {
  const restaurantPlans = new Set([
    'restaurant_pro',
    'restaurant_standard',
    'restaurant_resort_pro',
    'restaurant_resort_standard',
    'restaurant_delivery',
    'restaurant_resort_delivery',
  ])
  const deliveryPlans = new Set([
    'delivery',
    'restaurant_delivery',
    'restaurant_resort_delivery',
  ])

  const roles = ['owner', 'manager']
  if (restaurantPlans.has(planCode)) roles.push('waiter', 'kitchen')
  if (deliveryPlans.has(planCode)) roles.push('packer', 'driver')
  return roles
}

export default function DigitalDineApp() {
  const router = useRouter()
  useMobileViewportLock()

  const [restaurantCode, setRestaurantCode] = useState('')
  const [restaurant, setRestaurant] = useState(null)
  const [role, setRole] = useState('')
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const planCode = useMemo(
    () => (restaurant ? resolvePlanCode(restaurant) : ''),
    [restaurant]
  )

  const availableRoles = useMemo(
    () => (restaurant ? rolesForPlan(planCode) : []),
    [restaurant, planCode]
  )

  const availableRoleSet = useMemo(() => new Set(availableRoles), [availableRoles])

  // =========================================================
  // RESTAURANT CODE LOOKUP (unchanged logic)
  // =========================================================

  const findRestaurant = async (codeValue) => {
    const code = cleanRestaurantCode(codeValue)

    if (code.length !== 5) {
      throw new Error('Enter your 5-digit Restaurant Code.')
    }

    const { data: lookup, error: restaurantError } = await supabase.rpc(
      'get_app_restaurant_by_code',
      { p_restaurant_code: code }
    )

    if (restaurantError) {
      console.error('[DIGITAL DINE APP] Restaurant lookup RPC error:', restaurantError)

      const message = String(restaurantError?.message || '').toLowerCase()
      if (
        message.includes('get_app_restaurant_by_code') ||
        message.includes('could not find the function')
      ) {
        throw new Error(
          'The app Restaurant Code lookup is not installed yet. Run the latest App Restaurant Code SQL in Supabase.'
        )
      }

      throw new Error(
        restaurantError?.message || 'Unable to verify restaurant. Please try again.'
      )
    }

    if (!lookup?.success || !lookup?.restaurant?.id) {
      throw new Error(lookup?.message || 'Invalid Restaurant Code.')
    }

    const data = lookup.restaurant
    const resolvedPlan = resolvePlanCode(data)

    if (!SUPPORTED_PLAN_CODES.has(resolvedPlan)) {
      throw new Error('This restaurant plan is not supported by this app version.')
    }

    return { ...data, app_plan_code: resolvedPlan }
  }

  const openRestaurant = async (codeValue) => {
    const foundRestaurant = await findRestaurant(codeValue)
    setRestaurant(foundRestaurant)
    setRole('')
    setUserId('')
    setPassword('')
    setError('')
    return foundRestaurant
  }

  const handleRestaurantCode = async (event) => {
    event.preventDefault()
    if (loading) return

    setError('')
    const cleanCode = cleanRestaurantCode(restaurantCode)

    if (cleanCode.length !== 5) {
      setError('Enter your 5-digit Restaurant Code.')
      return
    }

    setLoading(true)
    try {
      await openRestaurant(cleanCode)
    } catch (lookupError) {
      console.error('[DIGITAL DINE APP] Restaurant code error:', lookupError)
      setRestaurant(null)
      setError(lookupError?.message || 'Unable to verify restaurant.')
    } finally {
      setLoading(false)
    }
  }

  // =========================================================
  // APP ENTRY: always starts at the code step (unchanged logic)
  // =========================================================

  useEffect(() => {
    if (typeof window === 'undefined') return

    const pathname = window.location.pathname.replace(/\/+$/, '') || '/'
    if (pathname !== '/app') return

    const params = new URLSearchParams(window.location.search)
    const rawCode = String(params.get('code') || '').trim()
    const prefilledCode = /^\d{5}$/.test(rawCode) ? rawCode : ''

    setRestaurant(null)
    setRole('')
    setUserId('')
    setPassword('')
    setError('')
    setRestaurantCode(prefilledCode)

    if (window.location.search) {
      window.history.replaceState(window.history.state, '', '/app')
    }
  }, [])

  const changeRestaurant = () => {
    setRestaurant(null)
    setRestaurantCode('')
    setRole('')
    setUserId('')
    setPassword('')
    setError('')
    router.replace('/app')
  }

  // =========================================================
  // STAFF SESSION (unchanged logic)
  // =========================================================

  const createStaffSession = async () => {
    if (!restaurant?.id) {
      throw new Error('Restaurant session is missing. Enter the Restaurant Code again.')
    }
    if (!['waiter', 'kitchen', 'manager'].includes(role)) {
      throw new Error('Choose a valid staff login.')
    }
    if (!availableRoleSet.has(role)) {
      throw new Error('This login is not available for this restaurant plan.')
    }

    const cleanCode = cleanRestaurantCode(restaurant.restaurant_code || restaurantCode)
    const cleanUserId = String(userId || '').trim().toLowerCase()
    const cleanPassword = String(password || '').trim()

    const { data, error: sessionError } = await supabase.rpc(
      'create_staff_app_session',
      {
        p_restaurant_id: String(restaurant.id),
        p_restaurant_code: cleanCode,
        p_user_id: cleanUserId,
        p_password: cleanPassword,
        p_role: role,
      }
    )

    if (sessionError) {
      console.error('[DIGITAL DINE APP] Session RPC error:', sessionError)
      throw new Error(sessionError?.message || 'Unable to sign in.')
    }
    if (!data?.success) {
      throw new Error(data?.message || 'Invalid login credentials.')
    }
    if (!data?.sessionToken) {
      throw new Error('The login server did not return a session.')
    }
    if (String(data.restaurantId) !== String(restaurant.id)) {
      throw new Error('These credentials do not belong to this restaurant.')
    }
    if (String(data.role || '').toLowerCase() !== String(role).toLowerCase()) {
      throw new Error('Your account does not have access to this portal.')
    }

    return data
  }

  const saveSession = (sessionData) => {
    if (typeof window === 'undefined') return

    const session = {
      sessionId: sessionData.sessionId || null,
      sessionToken: sessionData.sessionToken,
      restaurantId: String(sessionData.restaurantId || restaurant.id),
      restaurantCode: cleanRestaurantCode(
        sessionData.restaurantCode || restaurant.restaurant_code || restaurantCode
      ),
      restaurantName: restaurant.name || 'Digital Dine',
      userId: String(sessionData.userId || userId).trim().toLowerCase(),
      role: String(sessionData.role || role).toLowerCase(),
      staff: sessionData.staff || null,
      expiresAt: sessionData.expiresAt || null,
      createdAt: Date.now(),
    }

    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(session))
    localStorage.removeItem('digital-dine-app-session')
  }

  const redirectToPortal = (sessionData) => {
    const id = encodeURIComponent(String(sessionData?.restaurantId || restaurant.id))
    const sessionRole = String(sessionData?.role || role).toLowerCase()

    if (sessionRole === 'waiter') return router.replace(`/app/waiter/${id}`)
    if (sessionRole === 'kitchen') return router.replace(`/app/kitchen/${id}`)
    if (sessionRole === 'manager') return router.replace(`/app/manager/${id}`)

    throw new Error('Unsupported staff role.')
  }

  const handleStaffLogin = async (event) => {
    event.preventDefault()
    if (loading) return

    setError('')

    if (!role) return setError('Choose a staff login.')
    if (!availableRoleSet.has(role)) {
      return setError('This login is not available for this restaurant plan.')
    }
    if (!String(userId || '').trim()) return setError('Enter your User ID.')
    if (!String(password || '').trim()) return setError('Enter your password.')

    setLoading(true)
    try {
      const sessionData = await createStaffSession()
      saveSession(sessionData)
      setPassword('')
      redirectToPortal(sessionData)
    } catch (loginError) {
      console.error('[DIGITAL DINE APP] Staff login failed:', loginError)
      setError(loginError?.message || 'Unable to sign in. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const openStaffLogin = (selectedRole) => {
    const normalized = String(selectedRole || '').trim().toLowerCase()

    if (!['waiter', 'kitchen', 'manager'].includes(normalized)) {
      setError('Unsupported staff login.')
      return
    }
    if (!availableRoleSet.has(normalized)) {
      setError('This login is not included in the selected restaurant plan.')
      return
    }

    setRole(normalized)
    setUserId('')
    setPassword('')
    setShowPassword(false)
    setError('')
  }

  const closeStaffLogin = () => {
    setRole('')
    setUserId('')
    setPassword('')
    setShowPassword(false)
    setError('')
  }

  // =========================================================
  // DEDICATED LOGIN PAGES (unchanged routes)
  // =========================================================

  const codeForRoute = () =>
    encodeURIComponent(cleanRestaurantCode(restaurant?.restaurant_code || restaurantCode))

  const openOwnerLogin = () => {
    if (!restaurant?.id || !availableRoleSet.has('owner')) return
    const id = encodeURIComponent(String(restaurant.id))
    router.push(`/app/owner?restaurantCode=${codeForRoute()}&restaurantId=${id}`)
  }

  const openPackerLogin = () => {
    if (!availableRoleSet.has('packer')) {
      setError('Packer login is not included in this restaurant plan.')
      return
    }
    router.push(`/app/packer/${codeForRoute()}`)
  }

  const openDriverLogin = () => {
    if (!availableRoleSet.has('driver')) {
      setError('Delivery Boy login is not included in this restaurant plan.')
      return
    }
    router.push(`/app/driver/${codeForRoute()}`)
  }

  const openRole = (selectedRole) => {
    const normalized = String(selectedRole || '').toLowerCase()

    if (!availableRoleSet.has(normalized)) {
      setError('This login is not available for the selected restaurant plan.')
      return
    }

    if (normalized === 'owner') return openOwnerLogin()
    if (normalized === 'packer') return openPackerLogin()
    if (normalized === 'driver') return openDriverLogin()
    openStaffLogin(normalized)
  }

  // =========================================================
  // PRESENTATION DERIVED VALUES
  // =========================================================

  const hasRestaurantModule = ['restaurant_pro', 'restaurant_standard', 'restaurant_resort_pro', 'restaurant_resort_standard', 'restaurant_delivery', 'restaurant_resort_delivery'].includes(planCode)
  const hasDeliveryModule = ['delivery', 'restaurant_delivery', 'restaurant_resort_delivery'].includes(planCode)
  const hasResortModule = ['restaurant_resort_pro', 'restaurant_resort_standard', 'restaurant_resort_delivery'].includes(planCode)

  const moduleLabels = [
    ...(hasRestaurantModule ? ['Restaurant'] : []),
    ...(hasDeliveryModule ? ['Delivery'] : []),
    ...(hasResortModule ? ['Resort'] : []),
  ]

  const isCodeStep = !restaurant
  const roleTitle = ROLE_TITLES[role] || 'Staff Login'
  const roleIcon = ROLE_META[role]?.icon || '👤'
  const codeReady = restaurantCode.length === 5

  // Group visible portals by section for a store-like browsing feel.
  const groupedRoles = availableRoles.reduce((groups, roleName) => {
    const group = ROLE_META[roleName]?.group || 'Other'
    if (!groups[group]) groups[group] = []
    groups[group].push(roleName)
    return groups
  }, {})

  return (
    <main className="min-h-[100dvh] bg-white text-[#0c831f] antialiased">
      <style jsx global>{`
        body { background: #ffffff; }
        .dd-scroll-hide::-webkit-scrollbar { display: none; }
        .dd-scroll-hide { scrollbar-width: none; }
      `}</style>

      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[520px] flex-col bg-[#f8f8f8] text-neutral-900">
        {/* ============ TOP BRAND BAR ============ */}
        <header className="sticky top-0 z-20 bg-[#0c831f] px-4 pb-4 pt-[max(0.9rem,env(safe-area-inset-top))] text-white">
          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2.5">
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-[15px] font-black text-[#0c831f]">
                DD
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-white/75">Digital Dine-In</p>
                <p className="truncate text-[15px] font-extrabold leading-tight">
                  {isCodeStep ? 'Welcome back' : restaurant?.name || 'Your business'}
                </p>
              </div>
            </div>

            {!isCodeStep && (
              <button
                type="button"
                onClick={changeRestaurant}
                className="shrink-0 rounded-full bg-white/15 px-3.5 py-2 text-[12px] font-bold text-white transition active:scale-95"
              >
                Change
              </button>
            )}
          </div>

          {!isCodeStep && (
            <div className="dd-scroll-hide mt-3 flex gap-2 overflow-x-auto">
              <span className="shrink-0 rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold">
                Code {restaurant.restaurant_code}
              </span>
              {moduleLabels.map((label) => (
                <span key={label} className="shrink-0 rounded-full bg-white/15 px-3 py-1.5 text-[11px] font-bold">
                  {label}
                </span>
              ))}
              <span className="shrink-0 rounded-full bg-white px-3 py-1.5 text-[11px] font-bold text-[#0c831f]">
                {PLAN_LABELS[planCode] || 'Business'}
              </span>
            </div>
          )}
        </header>

        {/* ============ STEP 1: RESTAURANT CODE ============ */}
        {isCodeStep ? (
          <form
            onSubmit={handleRestaurantCode}
            className="flex flex-1 flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5"
          >
            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <p className="text-[12px] font-bold uppercase tracking-wide text-[#0c831f]">Step 1 of 2</p>
              <h1 className="mt-1 text-[24px] font-black leading-tight tracking-tight">
                Enter your business code
              </h1>
              <p className="mt-1.5 text-[13px] leading-5 text-neutral-500">
                Use the 5-digit code given to your business to open your workspace.
              </p>

              <label htmlFor="dd-restaurant-code" className="sr-only">Restaurant code</label>
              <div
                className={`mt-5 flex h-16 items-center rounded-2xl border-2 bg-[#f8f8f8] px-4 transition ${
                  error ? 'border-red-400' : codeReady ? 'border-[#0c831f]' : 'border-transparent focus-within:border-[#0c831f]'
                }`}
              >
                <span aria-hidden="true" className="mr-3 text-xl">🔑</span>
                <input
                  id="dd-restaurant-code"
                  name="restaurantCode"
                  type="text"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={5}
                  value={restaurantCode}
                  onChange={(event) => {
                    setRestaurantCode(cleanRestaurantCode(event.target.value))
                    setError('')
                  }}
                  placeholder="5-digit code"
                  disabled={loading}
                  aria-invalid={Boolean(error)}
                  className="h-full w-full bg-transparent text-[22px] font-black tracking-[0.25em] text-neutral-900 outline-none placeholder:text-[15px] placeholder:font-semibold placeholder:tracking-normal placeholder:text-neutral-400"
                />
                <span className="ml-2 text-[12px] font-bold tabular-nums text-neutral-400">
                  {restaurantCode.length}/5
                </span>
              </div>

              {error && (
                <p role="alert" className="mt-3 rounded-xl bg-red-50 px-3 py-2.5 text-[13px] font-semibold text-red-700">
                  {error}
                </p>
              )}
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2.5">
              {[
                ['🍽️', 'Restaurant'],
                ['🛵', 'Delivery'],
                ['🏨', 'Resort'],
              ].map(([emoji, label]) => (
                <div key={label} className="flex flex-col items-center gap-1.5 rounded-2xl bg-white py-4 shadow-sm">
                  <span aria-hidden="true" className="text-2xl">{emoji}</span>
                  <span className="text-[12px] font-bold text-neutral-700">{label}</span>
                </div>
              ))}
            </div>

            <p className="mt-4 text-center text-[12px] text-neutral-500">
              🔒 Entering a code never signs you in automatically.
            </p>

            <div className="mt-auto pt-6">
              <button
                type="submit"
                disabled={loading || !codeReady}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-[#0c831f] text-[16px] font-extrabold text-white shadow-lg shadow-green-900/15 transition active:scale-[0.98] disabled:bg-neutral-300 disabled:shadow-none"
              >
                {loading ? 'Verifying code…' : 'Continue'}
              </button>
            </div>
          </form>
        ) : !role ? (
          /* ============ STEP 2: PORTAL GRID ============ */
          <div className="flex flex-1 flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <p className="text-[12px] font-bold uppercase tracking-wide text-[#0c831f]">Step 2 of 2</p>
                <h1 className="mt-0.5 text-[22px] font-black tracking-tight">Choose your portal</h1>
              </div>
            </div>

            {Object.entries(groupedRoles).map(([groupName, roleNames]) => (
              <section key={groupName} className="mb-5">
                <h2 className="mb-2.5 px-1 text-[13px] font-extrabold uppercase tracking-wide text-neutral-500">
                  {groupName}
                </h2>
                <div className="grid grid-cols-2 gap-3">
                  {roleNames.map((roleName) => {
                    const meta = ROLE_META[roleName]
                    if (!meta) return null
                    return (
                      <button
                        key={roleName}
                        type="button"
                        onClick={() => openRole(roleName)}
                        className="flex flex-col items-start rounded-2xl bg-white p-3.5 text-left shadow-sm transition active:scale-[0.97]"
                      >
                        <span className={`grid h-14 w-14 place-items-center rounded-xl text-[28px] ${meta.tint}`} aria-hidden="true">
                          {meta.icon}
                        </span>
                        <span className="mt-3 text-[15px] font-extrabold leading-tight">{meta.title}</span>
                        <span className="mt-0.5 text-[12px] leading-snug text-neutral-500">{meta.subtitle}</span>
                        <span className="mt-3 flex w-full items-center justify-between text-[12px] font-bold text-[#0c831f]">
                          Open <span aria-hidden="true">›</span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </section>
            ))}

            {error && (
              <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-[13px] font-semibold text-red-700">
                {error}
              </p>
            )}

            <p className="mt-auto pt-4 text-center text-[12px] leading-5 text-neutral-500">
              Only portals included in your plan are shown. Each role still needs its own secure login.
            </p>
          </div>
        ) : (
          /* ============ STEP 3: STAFF LOGIN ============ */
          <form
            onSubmit={handleStaffLogin}
            className="flex flex-1 flex-col px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-5"
          >
            <button
              type="button"
              onClick={closeStaffLogin}
              className="mb-4 flex w-fit items-center gap-1.5 rounded-full bg-white px-3.5 py-2 text-[13px] font-bold text-neutral-700 shadow-sm active:scale-95"
            >
              <span aria-hidden="true">‹</span> All portals
            </button>

            <div className="rounded-2xl bg-white p-5 shadow-sm">
              <div className="flex items-center gap-3">
                <div className={`grid h-14 w-14 place-items-center rounded-xl text-[28px] ${ROLE_META[role]?.tint || 'bg-neutral-100'}`} aria-hidden="true">
                  {roleIcon}
                </div>
                <div>
                  <p className="text-[12px] font-bold uppercase tracking-wide text-[#0c831f]">Secure access</p>
                  <h1 className="text-[21px] font-black leading-tight tracking-tight">{roleTitle}</h1>
                </div>
              </div>

              <div className="mt-5 space-y-4">
                <div>
                  <label htmlFor="dd-staff-username" className="mb-1.5 block text-[13px] font-bold text-neutral-700">
                    User ID
                  </label>
                  <input
                    id="dd-staff-username"
                    type="text"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    value={userId}
                    onChange={(event) => {
                      setUserId(event.target.value)
                      setError('')
                    }}
                    disabled={loading}
                    placeholder="Enter your user ID"
                    className="h-14 w-full rounded-xl bg-[#f8f8f8] px-4 text-[16px] font-semibold text-neutral-900 outline-none ring-2 ring-transparent transition focus:bg-white focus:ring-[#0c831f] disabled:opacity-60"
                  />
                </div>

                <div>
                  <label htmlFor="dd-staff-password" className="mb-1.5 block text-[13px] font-bold text-neutral-700">
                    Password / PIN
                  </label>
                  <div className="relative">
                    <input
                      id="dd-staff-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      value={password}
                      onChange={(event) => {
                        setPassword(event.target.value)
                        setError('')
                      }}
                      disabled={loading}
                      placeholder="Enter your password"
                      className="h-14 w-full rounded-xl bg-[#f8f8f8] pl-4 pr-20 text-[16px] font-semibold text-neutral-900 outline-none ring-2 ring-transparent transition focus:bg-white focus:ring-[#0c831f] disabled:opacity-60"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((value) => !value)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg px-3 py-2 text-[12px] font-bold text-[#0c831f]"
                    >
                      {showPassword ? 'Hide' : 'Show'}
                    </button>
                  </div>
                </div>

                {error && (
                  <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-[13px] font-semibold text-red-700">
                    {error}
                  </p>
                )}
              </div>
            </div>

            <p className="mt-4 px-1 text-center text-[12px] leading-5 text-neutral-500">
              Your existing staff permissions and security checks stay active.
            </p>

            <div className="mt-auto pt-6">
              <button
                type="submit"
                disabled={loading || !userId.trim() || !password.trim()}
                className="flex h-14 w-full items-center justify-center rounded-2xl bg-[#0c831f] text-[16px] font-extrabold text-white shadow-lg shadow-green-900/15 transition active:scale-[0.98] disabled:bg-neutral-300 disabled:shadow-none"
              >
                {loading ? 'Signing in…' : `Open ${roleTitle.replace(' Login', '')}`}
              </button>
            </div>
          </form>
        )}

        <footer className="pb-4 pt-2 text-center text-[11px] text-neutral-400">
          © Digital Dine-In
        </footer>
      </div>
    </main>
  )
}