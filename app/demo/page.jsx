'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const SESSION_STORAGE_KEY = 'digital-dine-staff-session'

const portals = [
  {
    role: 'customer',
    name: 'Customer QR Menu',
    description:
      'Open the actual Table 1 QR menu, place an order and track it.',
    icon: '▦',
  },
  {
    role: 'owner',
    name: 'Owner Portal',
    description:
      'Open the actual restaurant Owner Dashboard and its real features.',
    icon: '◫',
  },
  {
    role: 'manager',
    name: 'Manager Portal',
    description:
      'Use the actual Manager Dashboard for orders, menu, staff and reports.',
    icon: '◇',
  },
  {
    role: 'waiter',
    name: 'Waiter Portal',
    description:
      'Use the actual Waiter interface and restaurant service workflow.',
    icon: '◎',
  },
  {
    role: 'kitchen',
    name: 'Kitchen Portal',
    description:
      'Use the actual KDS and move real demo orders through preparation.',
    icon: '▤',
  },
]

export default function RealDemoPage() {
  const router = useRouter()

  const [loadingRole, setLoadingRole] = useState('')
  const [error, setError] = useState('')
  const [restaurantId, setRestaurantId] = useState('')
  const [siteOrigin, setSiteOrigin] = useState('')

  useEffect(() => {
    setSiteOrigin(window.location.origin)

    // The ID is intentionally exposed only for navigation/QR purposes.
    // Login credentials remain server-side.
    const id = String(
      process.env.NEXT_PUBLIC_DEMO_RESTAURANT_ID || ''
    ).trim()

    setRestaurantId(id)
  }, [])

  const openCustomer = () => {
    if (!restaurantId) {
      setError(
        'NEXT_PUBLIC_DEMO_RESTAURANT_ID is not configured.'
      )
      return
    }

    router.push(
      `/menu/${encodeURIComponent(
        restaurantId
      )}?table=1&demo=1`
    )
  }

  const saveStaffSession = (sessionData) => {
    const session = {
      sessionId: sessionData?.sessionId || null,
      sessionToken: sessionData?.sessionToken,
      restaurantId: String(
        sessionData?.restaurantId || ''
      ),
      restaurantCode: String(
        sessionData?.restaurantCode || ''
      ).trim(),
      restaurantName:
        sessionData?.restaurantName || 'Demo Restaurant',
      userId: String(sessionData?.userId || '')
        .trim()
        .toLowerCase(),
      role: String(sessionData?.role || '')
        .trim()
        .toLowerCase(),
      staff: sessionData?.staff || null,
      expiresAt: sessionData?.expiresAt || null,
      createdAt: Date.now(),
      demo: true,
    }

    localStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify(session)
    )

    localStorage.removeItem('digital-dine-app-session')
  }

  const launchRealPortal = async (role) => {
    if (loadingRole) return

    setError('')
    setLoadingRole(role)

    try {
      if (role === 'customer') {
        openCustomer()
        return
      }

      const response = await fetch('/api/demo-session', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        cache: 'no-store',
        body: JSON.stringify({ role }),
      })

      const data = await response
        .json()
        .catch(() => ({}))

      if (!response.ok || !data?.success) {
        throw new Error(
          data?.message ||
            'Unable to open the demo portal.'
        )
      }

      const id = encodeURIComponent(
        String(data.restaurantId || '')
      )

      if (!id) {
        throw new Error(
          'The demo restaurant ID was not returned.'
        )
      }

      if (role === 'owner') {
        const { error: sessionError } =
          await supabase.auth.setSession({
            access_token: data.accessToken,
            refresh_token: data.refreshToken,
          })

        if (sessionError) throw sessionError

        router.push(`/dashboard/${id}?demo=1`)
        return
      }

      saveStaffSession(data)

      if (role === 'manager') {
        router.push(`/manager/${id}?demo=1`)
        return
      }

      if (role === 'waiter') {
        router.push(`/waiter/${id}?demo=1`)
        return
      }

      if (role === 'kitchen') {
        router.push(`/kitchen/${id}?demo=1`)
        return
      }

      throw new Error('Unsupported demo role.')
    } catch (launchError) {
      console.error('[REAL DEMO]', launchError)

      setError(
        launchError?.message ||
          'Unable to open the demo right now.'
      )
    } finally {
      setLoadingRole('')
    }
  }

  const qrTarget =
    siteOrigin && restaurantId
      ? `${siteOrigin}/menu/${encodeURIComponent(
          restaurantId
        )}?table=1&demo=1`
      : ''

  const qrUrl = qrTarget
    ? `https://api.qrserver.com/v1/create-qr-code/?size=380x380&margin=18&data=${encodeURIComponent(
        qrTarget
      )}`
    : ''

  return (
    <div className="min-h-screen bg-[#090909] text-white">
      <header className="border-b border-white/[0.07] bg-[#090909]/95">
        <div className="mx-auto flex min-h-16 max-w-6xl items-center justify-between gap-3 px-5 sm:px-6">
          <Link href="/" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500 text-sm font-black text-black">
              D
            </span>

            <div>
              <div className="text-sm font-black">
                Digital Dining
              </div>
              <div className="text-[8px] font-black uppercase tracking-[0.18em] text-neutral-600">
                Real Product Demo
              </div>
            </div>
          </Link>

          <Link
            href="/register"
            className="rounded-xl bg-white px-4 py-2.5 text-[9px] font-black text-black transition hover:bg-orange-500"
          >
            Start Free
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-12 sm:px-6 sm:py-16">
        <div className="max-w-3xl">
          <div className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400">
            Actual Digital Dining Pages
          </div>

          <h1 className="mt-3 text-3xl font-black tracking-tight sm:text-5xl">
            Experience the real product.
          </h1>

          <p className="mt-4 max-w-2xl text-sm leading-7 text-neutral-400">
            These buttons open the same Owner, Manager,
            Waiter, Kitchen and Customer pages used by the
            product. The only difference is that they use a
            dedicated demo restaurant and demo accounts.
          </p>
        </div>

        {error && (
          <div className="mt-6 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-xs font-bold text-red-300">
            {error}
          </div>
        )}

        <section className="mt-8 grid gap-4 md:grid-cols-2">
          {portals.map((portal) => {
            const loading = loadingRole === portal.role

            return (
              <button
                key={portal.role}
                type="button"
                onClick={() =>
                  launchRealPortal(portal.role)
                }
                disabled={Boolean(loadingRole)}
                className="group flex items-start gap-4 rounded-[22px] border border-white/[0.08] bg-white/[0.025] p-5 text-left transition hover:border-orange-500/30 hover:bg-white/[0.045] disabled:opacity-60"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-500/10 text-lg font-black text-orange-400">
                  {portal.icon}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-black text-white">
                    {portal.name}
                  </span>

                  <span className="mt-1 block text-[10px] leading-5 text-neutral-500">
                    {portal.description}
                  </span>

                  <span className="mt-4 inline-flex rounded-lg bg-white px-3 py-2 text-[8px] font-black text-black transition group-hover:bg-orange-500">
                    {loading
                      ? 'Opening...'
                      : 'Open Real Demo →'}
                  </span>
                </span>
              </button>
            )
          })}
        </section>

        <section className="mt-8 grid gap-5 rounded-[24px] border border-orange-500/15 bg-orange-500/[0.05] p-5 sm:p-6 md:grid-cols-[180px_1fr] md:items-center">
          <div className="rounded-2xl bg-white p-3">
            {qrUrl ? (
              <img
                src={qrUrl}
                alt="Table 1 real demo QR"
                className="aspect-square w-full object-contain"
              />
            ) : (
              <div className="flex aspect-square items-center justify-center rounded-xl bg-neutral-100 text-4xl text-neutral-900">
                ▦
              </div>
            )}

            <div className="mt-2 text-center text-[8px] font-black text-neutral-900">
              REAL TABLE 1 QR
            </div>
          </div>

          <div>
            <div className="text-[9px] font-black uppercase tracking-[0.18em] text-orange-400">
              Real-time test
            </div>

            <h2 className="mt-2 text-xl font-black sm:text-2xl">
              Place a real demo order from your phone.
            </h2>

            <p className="mt-2 max-w-2xl text-[10px] leading-5 text-neutral-500">
              Scan Table 1, place an order in the actual QR
              menu, then open the actual Kitchen and Waiter
              demo portals to move that same order through
              preparation and service.
            </p>
          </div>
        </section>

        <div className="mt-8 rounded-2xl border border-amber-400/15 bg-amber-400/[0.05] p-4">
          <div className="text-[9px] font-black text-amber-300">
            Dedicated demo restaurant only
          </div>

          <p className="mt-2 text-[9px] leading-5 text-neutral-500">
            Do not connect these demo buttons to a real
            customer restaurant or production payment
            credentials. Use a separate demo restaurant,
            demo staff accounts and Razorpay test mode.
          </p>
        </div>
      </main>
    </div>
  )
}
