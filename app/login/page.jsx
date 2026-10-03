'use client'

import {
  useMemo,
  useState,
} from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'

import { supabase } from '@/lib/supabase'
import { useMobileViewportLock } from '@/lib/useMobileViewportLock'

const ROLE_META = {
  owner: {
    title: 'Owner',
    icon: '👑',
    description:
      'Business owner dashboard and subscribed modules.',
    className:
      'border-orange-500/20 bg-orange-500/[0.08] text-orange-300',
  },

  manager: {
    title: 'Manager',
    icon: '🧑‍💼',
    description:
      'Operational controls for the enabled modules.',
    className:
      'border-violet-500/20 bg-violet-500/[0.08] text-violet-300',
  },

  waiter: {
    title: 'Waiter',
    icon: '🧑‍🍳',
    description:
      'Restaurant waiter ordering and handover.',
    className:
      'border-cyan-500/20 bg-cyan-500/[0.08] text-cyan-300',
  },

  kitchen: {
    title: 'Kitchen',
    icon: '👨‍🍳',
    description:
      'KDS orders and preparation workflow.',
    className:
      'border-red-500/20 bg-red-500/[0.08] text-red-300',
  },

  packer: {
    title: 'Packer',
    icon: '📦',
    description:
      'Delivery packing and barcode verification.',
    className:
      'border-amber-500/20 bg-amber-500/[0.08] text-amber-300',
  },

  driver: {
    title: 'Delivery Boy',
    icon: '🛵',
    description:
      'Assigned deliveries, navigation and proof.',
    className:
      'border-emerald-500/20 bg-emerald-500/[0.08] text-emerald-300',
  },
}

function cleanRestaurantCode(value) {
  return String(value || '')
    .replace(/\D/g, '')
    .slice(0, 5)
}

function moduleLabels(modules) {
  const values = []

  if (modules?.restaurant) {
    values.push('Restaurant')
  }

  if (modules?.delivery) {
    values.push('Delivery')
  }

  if (modules?.resort) {
    values.push('Resort')
  }

  return values
}

export default function RestaurantLoginPage() {
  useMobileViewportLock()

  const router = useRouter()

  const [restaurantCode, setRestaurantCode] =
    useState('')

  const [result, setResult] =
    useState(null)

  const [loading, setLoading] =
    useState(false)

  const [error, setError] =
    useState('')

  const modules = useMemo(
    () =>
      moduleLabels(
        result?.modules
      ),
    [result]
  )

  const verifyCode =
    async (event) => {
      event.preventDefault()

      if (loading) return

      const code =
        cleanRestaurantCode(
          restaurantCode
        )

      if (
        code.length !== 5
      ) {
        setError(
          'Enter your 5-digit Restaurant Code.'
        )
        return
      }

      setLoading(true)
      setError('')

      try {
        const {
          data,
          error: rpcError,
        } =
          await supabase.rpc(
            'resolve_app_restaurant_portals',
            {
              p_restaurant_code:
                code,
            }
          )

        if (rpcError) {
          throw rpcError
        }

        if (!data?.success) {
          throw new Error(
            data?.message ||
              'Invalid Restaurant Code.'
          )
        }

        setResult(data)
        setRestaurantCode(code)
      } catch (lookupError) {
        console.error(
          '[RESTAURANT LOGIN] Restaurant lookup error:',
          lookupError
        )

        setResult(null)

        const message =
          String(
            lookupError?.message ||
              ''
          )

        if (
          message.includes(
            'resolve_app_restaurant_portals'
          ) ||
          message
            .toLowerCase()
            .includes(
              'could not find the function'
            )
        ) {
          setError(
            'Step 9A is not installed yet. Run the Step 9A SQL in Supabase.'
          )
        } else {
          setError(
            message ||
              'Unable to verify Restaurant Code.'
          )
        }
      } finally {
        setLoading(false)
      }
    }

  const changeRestaurant =
    () => {
      setResult(null)
      setRestaurantCode('')
      setError('')
    }

  const openPortal =
    (role) => {
      const restaurant =
        result?.restaurant

      const code =
        cleanRestaurantCode(
          restaurant?.restaurant_code ||
            restaurantCode
        )

      const restaurantId =
        String(
          restaurant?.id || ''
        ).trim()

      if (
        !code ||
        !restaurantId
      ) {
        setError(
          'Restaurant information is incomplete. Verify the Restaurant Code again.'
        )
        return
      }

      const normalizedRole =
        String(role || '')
          .trim()
          .toLowerCase()

      const allowedRoles =
        Array.isArray(
          result?.available_roles
        )
          ? result.available_roles.map(
              (value) =>
                String(
                  value || ''
                )
                  .trim()
                  .toLowerCase()
            )
          : []

      if (
        !allowedRoles.includes(
          normalizedRole
        )
      ) {
        setError(
          'This portal is not included in this restaurant plan.'
        )
        return
      }

      const encodedCode =
        encodeURIComponent(code)

      const encodedId =
        encodeURIComponent(
          restaurantId
        )

      if (
        normalizedRole ===
        'owner'
      ) {
        router.push(
          `/app/owner?restaurantCode=${encodedCode}&restaurantId=${encodedId}`
        )
        return
      }

      if (
        normalizedRole ===
        'packer'
      ) {
        router.push(
          `/app/packer/${encodedCode}`
        )
        return
      }

      if (
        normalizedRole ===
        'driver'
      ) {
        router.push(
          `/app/driver/${encodedCode}`
        )
        return
      }

      /*
       * Manager / Waiter / Kitchen keep using your existing
       * secure staff login system.
       *
       * Step 9C will make the role query auto-open the selected
       * login form without changing the current authentication.
       */
      router.push(
        `/app?code=${encodedCode}&role=${encodeURIComponent(
          normalizedRole
        )}`
      )
    }

  return (
    <main className="min-h-[100dvh] w-full overflow-x-hidden bg-[#090909] text-white">
      <div className="mx-auto flex min-h-[100dvh] w-full max-w-[520px] flex-col px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:px-5">
        <header className="flex items-center justify-between gap-3 py-2">
          <Link
            href="/"
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] text-sm font-black text-neutral-300"
            aria-label="Back to Digital Dine-In"
          >
            ←
          </Link>

          <div className="min-w-0 text-center">
            <p className="truncate text-sm font-black">
              Digital Dine-In
            </p>

            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-orange-400">
              Restaurant Login
            </p>
          </div>

          <div className="h-10 w-10" />
        </header>

        {!result ? (
          <div className="flex flex-1 flex-col justify-center py-6">
            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[26px] border border-orange-500/20 bg-orange-500/10 shadow-2xl shadow-orange-950/20">
              <span className="text-3xl">
                🏪
              </span>
            </div>

            <div className="mt-5 text-center">
              <h1 className="text-2xl font-black tracking-tight sm:text-3xl">
                Enter Restaurant Code
              </h1>

              <p className="mx-auto mt-2 max-w-sm text-xs leading-6 text-neutral-500">
                We will check the active subscription and show only the portals included in this restaurant&apos;s plan.
              </p>
            </div>

            <form
              onSubmit={verifyCode}
              className="mt-6 rounded-[28px] border border-white/[0.08] bg-neutral-900 p-5 shadow-2xl shadow-black/30"
            >
              <label className="block">
                <span className="mb-2 block text-[9px] font-black uppercase tracking-[0.18em] text-neutral-500">
                  5-digit Restaurant Code
                </span>

                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
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
                  placeholder="00000"
                  className="h-16 w-full rounded-2xl border border-white/10 bg-black/30 px-4 text-center font-mono text-3xl font-black tracking-[0.35em] text-white outline-none transition placeholder:text-neutral-700 focus:border-orange-500/50"
                />
              </label>

              {error && (
                <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-3 text-[10px] font-bold leading-5 text-red-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={
                  loading ||
                  restaurantCode.length !==
                    5
                }
                className="mt-4 inline-flex min-h-12 w-full items-center justify-center rounded-xl bg-orange-500 px-4 text-xs font-black text-black transition hover:bg-orange-400 disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading
                  ? 'Checking...'
                  : 'Continue'}
              </button>
            </form>

            <div className="mt-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
              <p className="text-[9px] font-black uppercase tracking-[0.16em] text-neutral-600">
                Plan-aware portal access
              </p>

              <p className="mt-2 text-[10px] leading-5 text-neutral-500">
                Delivery-only plans show Owner, Manager, Packer and Delivery Boy. Restaurant plans show Restaurant staff portals. Combined plans show all permitted roles.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex-1 py-4">
            <section className="rounded-[26px] border border-white/[0.08] bg-neutral-900 p-4">
              <div className="flex items-start gap-3">
                {result?.restaurant
                  ?.logo_url ? (
                  <img
                    src={
                      result
                        .restaurant
                        .logo_url
                    }
                    alt={`${result?.restaurant?.name || 'Restaurant'} logo`}
                    className="h-14 w-14 shrink-0 rounded-2xl border border-white/10 bg-white object-contain p-1"
                  />
                ) : (
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-orange-500 text-lg font-black text-black">
                    DD
                  </div>
                )}

                <div className="min-w-0 flex-1">
                  <h1 className="truncate text-lg font-black">
                    {result
                      ?.restaurant
                      ?.name ||
                      'Restaurant'}
                  </h1>

                  <p className="mt-1 font-mono text-[9px] font-bold text-neutral-500">
                    Code{' '}
                    {
                      result
                        ?.restaurant
                        ?.restaurant_code
                    }
                  </p>

                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-2.5 py-1 text-[8px] font-black uppercase tracking-wider text-orange-300">
                      {result?.plan
                        ?.name ||
                        result
                          ?.restaurant
                          ?.plan_code ||
                        'Plan'}
                    </span>

                    <span
                      className={`rounded-full border px-2.5 py-1 text-[8px] font-black uppercase tracking-wider ${
                        result
                          ?.subscription
                          ?.active
                          ? 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
                          : 'border-red-500/20 bg-red-500/10 text-red-300'
                      }`}
                    >
                      {result
                        ?.subscription
                        ?.active
                        ? 'Active'
                        : 'Inactive'}
                    </span>
                  </div>
                </div>
              </div>

              {modules.length >
                0 && (
                <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.06] pt-3">
                  {modules.map(
                    (module) => (
                      <span
                        key={module}
                        className="rounded-full border border-white/[0.08] bg-black/20 px-2.5 py-1 text-[8px] font-black text-neutral-400"
                      >
                        {module}
                      </span>
                    )
                  )}
                </div>
              )}
            </section>

            {!result?.access_allowed ? (
              <section className="mt-4 rounded-2xl border border-red-500/20 bg-red-500/10 p-4">
                <p className="text-xs font-black text-red-200">
                  Portal access unavailable
                </p>

                <p className="mt-2 text-[10px] leading-5 text-red-300/80">
                  {result
                    ?.subscription
                    ?.reason ||
                    'This subscription is not active.'}
                </p>

                <button
                  type="button"
                  onClick={
                    changeRestaurant
                  }
                  className="mt-4 w-full rounded-xl border border-red-400/20 px-4 py-3 text-[10px] font-black text-red-200"
                >
                  Use Another Restaurant Code
                </button>
              </section>
            ) : (
              <>
                <div className="mt-5 flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-neutral-600">
                      Available Portals
                    </p>

                    <p className="mt-1 text-xs font-bold text-neutral-300">
                      Choose your role
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={
                      changeRestaurant
                    }
                    className="text-[9px] font-black text-orange-400"
                  >
                    Change Code
                  </button>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-3">
                  {(Array.isArray(
                    result?.portals
                  )
                    ? result.portals
                    : []
                  ).map(
                    (portal) => {
                      const role =
                        String(
                          portal?.role ||
                            ''
                        ).toLowerCase()

                      const meta =
                        ROLE_META[
                          role
                        ] || {
                          title:
                            portal
                              ?.title ||
                            role ||
                            'Portal',
                          icon:
                            portal?.icon ||
                            '👤',
                          description:
                            'Open secure portal.',
                          className:
                            'border-white/10 bg-white/[0.03] text-white',
                        }

                      return (
                        <button
                          key={role}
                          type="button"
                          onClick={() =>
                            openPortal(
                              role
                            )
                          }
                          className={`min-h-[142px] rounded-2xl border p-3 text-left transition active:scale-[0.98] ${meta.className}`}
                        >
                          <span className="text-2xl">
                            {portal?.icon ||
                              meta.icon}
                          </span>

                          <p className="mt-3 text-xs font-black text-white">
                            {portal
                              ?.title ||
                              meta.title}
                          </p>

                          <p className="mt-1 line-clamp-2 text-[9px] leading-4 text-neutral-500">
                            {
                              meta.description
                            }
                          </p>

                          <p className="mt-3 text-[8px] font-black uppercase tracking-wider">
                            Login →
                          </p>
                        </button>
                      )
                    }
                  )}
                </div>

                {error && (
                  <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-3 text-[10px] font-bold leading-5 text-red-300">
                    {error}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <footer className="mt-auto border-t border-white/[0.06] py-3 text-center">
          <p className="text-[8px] font-bold uppercase tracking-[0.18em] text-neutral-700">
            Digital Dine-In · Secure Operations Access
          </p>
        </footer>
      </div>
    </main>
  )
}
