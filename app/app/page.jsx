'use client'

import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const SESSION_STORAGE_KEY =
  'digital-dine-staff-session'

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
  restaurant_resort_pro:
    'Restaurant + Resort',
  restaurant_delivery:
    'Restaurant + Delivery',
  restaurant_resort_delivery:
    'Restaurant + Resort + Delivery',
  restaurant_standard:
    'Restaurant',
  restaurant_resort_standard:
    'Restaurant + Resort',
}

const ROLE_META = {
  owner: {
    title: 'Owner',
    icon: '👑',
    description:
      'Secure Owner account, subscription modules and business controls.',
    card:
      'border-violet-500/20',
    iconClass:
      'bg-violet-500/10',
    link:
      'text-violet-400',
  },

  manager: {
    title: 'Manager',
    icon: '👨‍💼',
    description:
      'Manage the workspaces included in this restaurant plan.',
    card:
      'border-sky-500/20',
    iconClass:
      'bg-sky-500/10',
    link:
      'text-sky-400',
  },

  waiter: {
    title: 'Waiter',
    icon: '🧑‍🍽️',
    description:
      'Take table orders and serve ready dishes.',
    card:
      'border-orange-500/20',
    iconClass:
      'bg-orange-500/10',
    link:
      'text-orange-400',
  },

  kitchen: {
    title: 'KDS',
    icon: '👨‍🍳',
    description:
      'Open the kitchen display and update preparation status.',
    card:
      'border-red-500/20',
    iconClass:
      'bg-red-500/10',
    link:
      'text-red-400',
  },

  packer: {
    title: 'Packer',
    icon: '📦',
    description:
      'Confirm Delivery orders, pack them and send them out.',
    card:
      'border-amber-500/20',
    iconClass:
      'bg-amber-500/10',
    link:
      'text-amber-400',
  },

  driver: {
    title: 'Delivery Boy',
    icon: '🛵',
    description:
      'Open assigned Delivery batches, navigation and proof tools.',
    card:
      'border-emerald-500/20',
    iconClass:
      'bg-emerald-500/10',
    link:
      'text-emerald-400',
  },
}

function cleanRestaurantCode(value) {
  return String(value || '')
    .replace(/\D/g, '')
    .slice(0, 5)
}

function resolvePlanCode(restaurant) {
  const raw = String(
    restaurant?.plan_code || ''
  )
    .trim()
    .toLowerCase()

  if (
    raw &&
    SUPPORTED_PLAN_CODES.has(raw)
  ) {
    return raw
  }

  // Keep the existing legacy fallback behaviour for old restaurant accounts.
  const legacy = String(
    restaurant?.plan || ''
  )
    .trim()
    .toLowerCase()

  if (
    legacy === 'pro+' ||
    legacy === 'restaurant + resort'
  ) {
    return 'restaurant_resort_pro'
  }

  return 'restaurant_pro'
}

function rolesForPlan(planCode) {
  // Requirement:
  // Delivery-only -> Packer + Driver + Manager + Owner.
  if (planCode === 'delivery') {
    return [
      'owner',
      'manager',
      'packer',
      'driver',
    ]
  }

  // Any plan containing the Restaurant module keeps the existing
  // Restaurant staff login set. Delivery packer/driver credentials
  // remain available through the Owner's Delivery workspace, but
  // they are intentionally not shown on this main role screen.
  return [
    'owner',
    'manager',
    'waiter',
    'kitchen',
  ]
}

export default function DigitalDineApp() {
  const router = useRouter()
  const autoCodeHandledRef =
    useRef(false)

  const [
    restaurantCode,
    setRestaurantCode,
  ] = useState('')
  const [
    restaurant,
    setRestaurant,
  ] = useState(null)

  const [role, setRole] =
    useState('')
  const [userId, setUserId] =
    useState('')
  const [password, setPassword] =
    useState('')

  const [loading, setLoading] =
    useState(false)
  const [error, setError] =
    useState('')

  const planCode = useMemo(
    () =>
      restaurant
        ? resolvePlanCode(
            restaurant
          )
        : '',
    [restaurant]
  )

  const availableRoles = useMemo(
    () =>
      restaurant
        ? rolesForPlan(
            planCode
          )
        : [],
    [
      restaurant,
      planCode,
    ]
  )

  const availableRoleSet =
    useMemo(
      () =>
        new Set(
          availableRoles
        ),
      [availableRoles]
    )

  // =========================================================
  // RESTAURANT CODE GATE
  // =========================================================

  const findRestaurant = async (
    codeValue
  ) => {
    const code =
      cleanRestaurantCode(
        codeValue
      )

    if (code.length !== 5) {
      throw new Error(
        'Enter your 5-digit Restaurant Code.'
      )
    }

    /*
     * IMPORTANT SECURITY / RLS FIX:
     *
     * The app may already have an authenticated Owner session in the same
     * Supabase client. Your restaurants RLS allows an authenticated Owner to
     * SELECT only restaurants owned by that user. Therefore a direct
     * .from('restaurants') lookup can incorrectly return no row for another
     * valid Restaurant Code and the UI would show "Invalid Restaurant Code".
     *
     * This RPC returns only the same safe app-entry fields needed here and
     * does not return owner_id, passwords, payment credentials or secrets.
     * Existing Owner / Staff / Packer / Driver authentication remains
     * unchanged and is still validated by the existing secure login flows.
     */
    const {
      data: lookup,
      error: restaurantError,
    } = await supabase.rpc(
      'get_app_restaurant_by_code',
      {
        p_restaurant_code:
          code,
      }
    )

    if (restaurantError) {
      console.error(
        '[DIGITAL DINE APP] Restaurant lookup RPC error:',
        restaurantError
      )

      const message =
        String(
          restaurantError?.message ||
            ''
        ).toLowerCase()

      if (
        message.includes(
          'get_app_restaurant_by_code'
        ) ||
        message.includes(
          'could not find the function'
        )
      ) {
        throw new Error(
          'The app Restaurant Code lookup is not installed yet. Run the latest App Restaurant Code SQL in Supabase.'
        )
      }

      throw new Error(
        restaurantError?.message ||
          'Unable to verify restaurant. Please try again.'
      )
    }

    if (
      !lookup?.success ||
      !lookup?.restaurant?.id
    ) {
      throw new Error(
        lookup?.message ||
          'Invalid Restaurant Code.'
      )
    }

    const data =
      lookup.restaurant

    const resolvedPlan =
      resolvePlanCode(data)

    if (
      !SUPPORTED_PLAN_CODES.has(
        resolvedPlan
      )
    ) {
      throw new Error(
        'This restaurant plan is not supported by this app version.'
      )
    }

    return {
      ...data,
      app_plan_code:
        resolvedPlan,
    }
  }

  const openRestaurant =
    async (codeValue) => {
      const foundRestaurant =
        await findRestaurant(
          codeValue
        )

      setRestaurant(
        foundRestaurant
      )
      setRole('')
      setUserId('')
      setPassword('')
      setError('')

      return foundRestaurant
    }

  const handleRestaurantCode =
    async (event) => {
      event.preventDefault()

      if (loading) return

      setError('')

      const cleanCode =
        cleanRestaurantCode(
          restaurantCode
        )

      if (
        cleanCode.length !== 5
      ) {
        setError(
          'Enter your 5-digit Restaurant Code.'
        )
        return
      }

      setLoading(true)

      try {
        await openRestaurant(
          cleanCode
        )
      } catch (lookupError) {
        console.error(
          '[DIGITAL DINE APP] Restaurant code error:',
          lookupError
        )

        setRestaurant(null)

        setError(
          lookupError?.message ||
            'Unable to verify restaurant.'
        )
      } finally {
        setLoading(false)
      }
    }

  // =========================================================
  // RETURN TO SAME RESTAURANT AFTER STAFF LOGOUT
  // =========================================================

  useEffect(() => {
    if (
      autoCodeHandledRef
        .current
    ) {
      return
    }

    if (
      typeof window ===
      'undefined'
    ) {
      return
    }

    autoCodeHandledRef.current =
      true

    const params =
      new URLSearchParams(
        window.location.search
      )

    const codeFromUrl =
      cleanRestaurantCode(
        params.get('code') ||
          ''
      )

    if (
      codeFromUrl.length !==
      5
    ) {
      return
    }

    setRestaurantCode(
      codeFromUrl
    )
    setLoading(true)
    setError('')

    openRestaurant(codeFromUrl)
      .catch(
        (lookupError) => {
          console.error(
            '[DIGITAL DINE APP] Return restaurant lookup error:',
            lookupError
          )

          setRestaurant(
            null
          )

          setError(
            lookupError?.message ||
              'Unable to reopen this restaurant.'
          )
        }
      )
      .finally(() => {
        setLoading(false)
      })

    // openRestaurant intentionally remains outside the dependency list.
    // This effect must consume the return code only once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
  // EXISTING SECURE STAFF SESSION
  // =========================================================
  // Waiter / Kitchen / Manager intentionally keep using the
  // same create_staff_app_session RPC and session verification.
  // Passwords are not added to localStorage.

  const createStaffSession =
    async () => {
      if (!restaurant?.id) {
        throw new Error(
          'Restaurant session is missing. Enter the Restaurant Code again.'
        )
      }

      if (
        ![
          'waiter',
          'kitchen',
          'manager',
        ].includes(role)
      ) {
        throw new Error(
          'Choose a valid staff login.'
        )
      }

      if (
        !availableRoleSet.has(
          role
        )
      ) {
        throw new Error(
          'This login is not available for this restaurant plan.'
        )
      }

      const cleanCode =
        cleanRestaurantCode(
          restaurant
            .restaurant_code ||
            restaurantCode
        )

      const cleanUserId =
        String(userId || '')
          .trim()
          .toLowerCase()

      const cleanPassword =
        String(
          password || ''
        ).trim()

      const {
        data,
        error:
          sessionError,
      } = await supabase.rpc(
        'create_staff_app_session',
        {
          p_restaurant_id:
            String(
              restaurant.id
            ),
          p_restaurant_code:
            cleanCode,
          p_user_id:
            cleanUserId,
          p_password:
            cleanPassword,
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

      if (!data?.success) {
        throw new Error(
          data?.message ||
            'Invalid login credentials.'
        )
      }

      if (
        !data?.sessionToken
      ) {
        throw new Error(
          'The login server did not return a session.'
        )
      }

      if (
        String(
          data.restaurantId
        ) !==
        String(
          restaurant.id
        )
      ) {
        throw new Error(
          'These credentials do not belong to this restaurant.'
        )
      }

      if (
        String(
          data.role || ''
        ).toLowerCase() !==
        String(
          role
        ).toLowerCase()
      ) {
        throw new Error(
          'Your account does not have access to this portal.'
        )
      }

      return data
    }

  const saveSession = (
    sessionData
  ) => {
    if (
      typeof window ===
      'undefined'
    ) {
      return
    }

    const session = {
      sessionId:
        sessionData.sessionId ||
        null,

      sessionToken:
        sessionData.sessionToken,

      restaurantId:
        String(
          sessionData
            .restaurantId ||
            restaurant.id
        ),

      restaurantCode:
        cleanRestaurantCode(
          sessionData
            .restaurantCode ||
            restaurant
              .restaurant_code ||
            restaurantCode
        ),

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
        sessionData.staff ||
        null,

      expiresAt:
        sessionData.expiresAt ||
        null,

      createdAt:
        Date.now(),
    }

    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify(
        session
      )
    )

    localStorage.removeItem(
      'digital-dine-app-session'
    )
  }

  const redirectToPortal = (
    sessionData
  ) => {
    const id =
      encodeURIComponent(
        String(
          sessionData
            ?.restaurantId ||
            restaurant.id
        )
      )

    const sessionRole =
      String(
        sessionData?.role ||
          role
      ).toLowerCase()

    if (
      sessionRole ===
      'waiter'
    ) {
      router.replace(
        `/app/waiter/${id}`
      )
      return
    }

    if (
      sessionRole ===
      'kitchen'
    ) {
      router.replace(
        `/app/kitchen/${id}`
      )
      return
    }

    if (
      sessionRole ===
      'manager'
    ) {
      router.replace(
        `/app/manager/${id}`
      )
      return
    }

    throw new Error(
      'Unsupported staff role.'
    )
  }

  const handleStaffLogin =
    async (event) => {
      event.preventDefault()

      if (loading) return

      setError('')

      if (!role) {
        setError(
          'Choose a staff login.'
        )
        return
      }

      if (
        !availableRoleSet.has(
          role
        )
      ) {
        setError(
          'This login is not available for this restaurant plan.'
        )
        return
      }

      if (
        !String(
          userId || ''
        ).trim()
      ) {
        setError(
          'Enter your User ID.'
        )
        return
      }

      if (
        !String(
          password || ''
        ).trim()
      ) {
        setError(
          'Enter your password.'
        )
        return
      }

      setLoading(true)

      try {
        const sessionData =
          await createStaffSession()

        saveSession(
          sessionData
        )

        setPassword('')

        redirectToPortal(
          sessionData
        )
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

  const openStaffLogin = (
    selectedRole
  ) => {
    const normalized =
      String(
        selectedRole || ''
      )
        .trim()
        .toLowerCase()

    if (
      ![
        'waiter',
        'kitchen',
        'manager',
      ].includes(
        normalized
      )
    ) {
      setError(
        'Unsupported staff login.'
      )
      return
    }

    if (
      !availableRoleSet.has(
        normalized
      )
    ) {
      setError(
        'This login is not included in the selected restaurant plan.'
      )
      return
    }

    setRole(normalized)
    setUserId('')
    setPassword('')
    setError('')
  }

  const closeStaffLogin =
    () => {
      setRole('')
      setUserId('')
      setPassword('')
      setError('')
    }

  // =========================================================
  // DEDICATED LOGIN PAGES
  // =========================================================

  const openOwnerLogin = () => {
    if (!restaurant?.id) {
      return
    }

    if (
      !availableRoleSet.has(
        'owner'
      )
    ) {
      return
    }

    const code =
      encodeURIComponent(
        cleanRestaurantCode(
          restaurant
            .restaurant_code ||
            restaurantCode
        )
      )

    const id =
      encodeURIComponent(
        String(
          restaurant.id
        )
      )

    // Existing secure mobile Owner login remains unchanged.
    router.push(
      `/app/owner?restaurantCode=${code}&restaurantId=${id}`
    )
  }

  const openPackerLogin = () => {
    if (
      !availableRoleSet.has(
        'packer'
      )
    ) {
      setError(
        'Packer login is not included in this restaurant plan.'
      )
      return
    }

    const code =
      encodeURIComponent(
        cleanRestaurantCode(
          restaurant
            ?.restaurant_code ||
            restaurantCode
        )
      )

    // Same Delivery Packer security/RPCs, now inside the application namespace.
    router.push(
      `/app/packer/${code}`
    )
  }

  const openDriverLogin = () => {
    if (
      !availableRoleSet.has(
        'driver'
      )
    ) {
      setError(
        'Delivery Boy login is not included in this restaurant plan.'
      )
      return
    }

    const code =
      encodeURIComponent(
        cleanRestaurantCode(
          restaurant
            ?.restaurant_code ||
            restaurantCode
        )
      )

    // Same Delivery Driver security/RPCs, now inside the application namespace.
    router.push(
      `/app/driver/${code}`
    )
  }

  const openRole = (
    selectedRole
  ) => {
    const normalized =
      String(
        selectedRole || ''
      ).toLowerCase()

    if (
      !availableRoleSet.has(
        normalized
      )
    ) {
      setError(
        'This login is not available for the selected restaurant plan.'
      )
      return
    }

    if (
      normalized === 'owner'
    ) {
      openOwnerLogin()
      return
    }

    if (
      normalized ===
      'packer'
    ) {
      openPackerLogin()
      return
    }

    if (
      normalized ===
      'driver'
    ) {
      openDriverLogin()
      return
    }

    openStaffLogin(
      normalized
    )
  }

  const roleTitle =
    role === 'manager'
      ? 'Manager Login'
      : role === 'waiter'
        ? 'Waiter Login'
        : role ===
            'kitchen'
          ? 'KDS Login'
          : 'Staff Login'

  const roleIcon =
    ROLE_META[role]?.icon ||
    '👤'

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
              Restaurant & Delivery Operations App
            </p>
          </div>

          <form
            onSubmit={
              handleRestaurantCode
            }
            className="mt-8 rounded-[32px] border border-neutral-800 bg-neutral-900 p-6 shadow-2xl"
          >
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-400">
              Secure access
            </p>

            <h2 className="mt-2 text-xl font-black">
              Enter Restaurant Code
            </h2>

            <p className="mt-2 text-xs leading-5 text-neutral-500">
              Enter the 5-digit code. Digital Dine will show only the login types for that restaurant&apos;s current plan.
            </p>

            <input
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={5}
              value={
                restaurantCode
              }
              onChange={(
                event
              ) => {
                setRestaurantCode(
                  cleanRestaurantCode(
                    event.target
                      .value
                  )
                )

                setError('')
              }}
              placeholder="37647"
              disabled={loading}
              className="mt-5 w-full rounded-2xl border border-orange-500/30 bg-neutral-950 px-4 py-4 text-center text-2xl font-black tracking-[0.35em] text-white outline-none focus:border-orange-500 disabled:opacity-60"
            />

            {error && (
              <div className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs font-bold leading-5 text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={
                loading ||
                restaurantCode
                  .length !== 5
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
  // STEP 2 — PLAN-AWARE LOGIN CHOOSER
  // =========================================================

  return (
    <main className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-neutral-950 text-white">
      <div className="mx-auto min-h-[100dvh] w-full max-w-[480px] overflow-x-hidden bg-neutral-950 pb-[max(2rem,env(safe-area-inset-bottom))]">
        <header className="sticky top-0 z-50 border-b border-neutral-800 bg-neutral-950/95 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-xl">
          <div className="flex min-w-0 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-900">
                {restaurant
                  ?.logo_url ? (
                  <img
                    src={
                      restaurant.logo_url
                    }
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-xs font-black text-orange-400">
                    DD
                  </span>
                )}
              </div>

              <div className="min-w-0">
                <p className="text-[9px] font-black uppercase tracking-[0.18em] text-orange-400">
                  Digital Dine
                </p>

                <h1 className="mt-0.5 truncate text-base font-black">
                  {restaurant.name ||
                    'Restaurant'}
                </h1>

                <p className="mt-1 truncate text-[9px] font-bold text-neutral-500">
                  Code{' '}
                  {
                    restaurant
                      .restaurant_code
                  }{' '}
                  ·{' '}
                  {PLAN_LABELS[
                    planCode
                  ] ||
                    'Restaurant'}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={
                changeRestaurant
              }
              className="shrink-0 rounded-2xl border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-[10px] font-black text-neutral-300"
            >
              Change
            </button>
          </div>
        </header>

        <div className="space-y-5 px-4 py-6">
          {!role && (
            <>
              <section className="rounded-[30px] border border-orange-500/20 bg-gradient-to-br from-orange-500/15 via-neutral-900 to-neutral-900 p-5">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-orange-400">
                  Plan-aware access
                </p>

                <h2 className="mt-2 text-2xl font-black">
                  Choose your login
                </h2>

                <p className="mt-2 text-xs leading-relaxed text-neutral-400">
                  {planCode ===
                  'delivery'
                    ? 'Delivery plan verified. Packer, Delivery Boy, Manager and Owner access are available.'
                    : 'Restaurant plan verified. Waiter, KDS, Manager and Owner access are available.'}
                </p>
              </section>

              <section className="grid grid-cols-2 gap-3">
                {availableRoles.map(
                  (
                    roleName
                  ) => {
                    const meta =
                      ROLE_META[
                        roleName
                      ]

                    if (!meta) {
                      return null
                    }

                    return (
                      <button
                        key={
                          roleName
                        }
                        type="button"
                        onClick={() =>
                          openRole(
                            roleName
                          )
                        }
                        className={`min-h-[176px] rounded-[28px] border bg-neutral-900 p-5 text-left transition active:scale-[0.98] ${meta.card}`}
                      >
                        <div
                          className={`flex h-14 w-14 items-center justify-center rounded-2xl text-3xl ${meta.iconClass}`}
                        >
                          {
                            meta.icon
                          }
                        </div>

                        <h3 className="mt-5 text-lg font-black">
                          {
                            meta.title
                          }
                        </h3>

                        <p className="mt-2 text-[10px] leading-relaxed text-neutral-500">
                          {
                            meta.description
                          }
                        </p>

                        <p
                          className={`mt-4 text-xs font-black ${meta.link}`}
                        >
                          {
                            meta.title
                          }{' '}
                          Login →
                        </p>
                      </button>
                    )
                  }
                )}
              </section>

              <div className="rounded-2xl border border-neutral-800 bg-neutral-900/60 px-4 py-3">
                <p className="text-[10px] leading-relaxed text-neutral-500">
                  Login authentication, existing staff sessions and Owner ownership checks remain unchanged. This screen only selects which existing secure login flow is available for the current plan.
                </p>
              </div>

              {error && (
                <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs font-bold leading-5 text-red-300">
                  {error}
                </div>
              )}
            </>
          )}

          {role && (
            <section className="rounded-[30px] border border-neutral-800 bg-neutral-900 p-5 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <span className="text-3xl">
                    {roleIcon}
                  </span>

                  <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-orange-400">
                    Secure staff access
                  </p>

                  <h2 className="mt-1 text-xl font-black">
                    {roleTitle}
                  </h2>

                  <p className="mt-1 text-[10px] text-neutral-500">
                    {
                      restaurant.name
                    }{' '}
                    · Code{' '}
                    {
                      restaurant
                        .restaurant_code
                    }
                  </p>
                </div>

                <button
                  type="button"
                  onClick={
                    closeStaffLogin
                  }
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-neutral-800 bg-neutral-950 text-neutral-400"
                  aria-label="Close staff login"
                >
                  ✕
                </button>
              </div>

              <form
                onSubmit={
                  handleStaffLogin
                }
                className="mt-5 space-y-4"
              >
                <div>
                  <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-neutral-500">
                    User ID
                  </label>

                  <input
                    type="text"
                    value={userId}
                    onChange={(
                      event
                    ) => {
                      setUserId(
                        event.target
                          .value
                      )
                      setError('')
                    }}
                    autoCapitalize="none"
                    autoCorrect="off"
                    autoComplete="username"
                    placeholder={
                      role ===
                      'manager'
                        ? 'Manager User ID'
                        : role ===
                            'waiter'
                          ? 'Waiter User ID'
                          : 'Kitchen User ID'
                    }
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
                    value={
                      password
                    }
                    onChange={(
                      event
                    ) => {
                      setPassword(
                        event.target
                          .value
                      )
                      setError('')
                    }}
                    autoComplete="current-password"
                    placeholder="Enter password"
                    disabled={loading}
                    className="w-full rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-4 text-base text-white outline-none focus:border-orange-500 disabled:opacity-60"
                  />
                </div>

                {error && (
                  <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs font-bold leading-5 text-red-300">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={
                    loading
                  }
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

              <button
                type="button"
                onClick={
                  closeStaffLogin
                }
                className="mt-3 w-full rounded-2xl border border-neutral-800 bg-neutral-950 py-3 text-[10px] font-black text-neutral-400"
              >
                ← Back to available logins
              </button>
            </section>
          )}
        </div>
      </div>
    </main>
  )
}
