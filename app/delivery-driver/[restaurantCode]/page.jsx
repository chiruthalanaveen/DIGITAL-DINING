'use client'

import {
  use,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { supabase } from '@/lib/supabase'

function money(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  })}`
}

function labelStatus(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) =>
      char.toUpperCase()
    )
}

function formatDate(value) {
  if (!value) return '—'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export default function DeliveryDriverPortal({
  params,
}) {
  const unwrappedParams = use(params)

  const restaurantCode = String(
    unwrappedParams?.restaurantCode || ''
  ).trim()

  const storageKey =
    `digitaldining_delivery_driver_session_${restaurantCode}`

  const [sessionToken, setSessionToken] =
    useState('')

  const [userId, setUserId] =
    useState('')

  const [password, setPassword] =
    useState('')

  const [portalData, setPortalData] =
    useState(null)

  const [loading, setLoading] =
    useState(true)

  const [loggingIn, setLoggingIn] =
    useState(false)

  const [updatingOrderId, setUpdatingOrderId] =
    useState('')

  const [error, setError] =
    useState('')

  const [message, setMessage] =
    useState('')

  useEffect(() => {
    try {
      const saved =
        localStorage.getItem(storageKey)

      if (saved) {
        setSessionToken(saved)
      }
    } catch {
      // Ignore unavailable local storage.
    }

    setLoading(false)
  }, [storageKey])

  const loadPortal = async (
    tokenOverride = ''
  ) => {
    const token =
      String(
        tokenOverride ||
          sessionToken ||
          ''
      ).trim()

    if (!token) {
      setPortalData(null)
      return
    }

    try {
      const {
        data,
        error: rpcError,
      } = await supabase.rpc(
        'get_delivery_driver_portal_data',
        {
          p_session_token: token,
        }
      )

      if (rpcError) {
        throw rpcError
      }

      if (!data?.success) {
        throw new Error(
          data?.message ||
            'Driver session is invalid.'
        )
      }

      setPortalData(data)
      setError('')
    } catch (loadError) {
      console.error(
        'Driver portal load error:',
        loadError
      )

      setPortalData(null)
      setSessionToken('')

      try {
        localStorage.removeItem(
          storageKey
        )
      } catch {
        // Ignore unavailable local storage.
      }

      setError(
        loadError?.message ||
          'Your Driver Portal session expired. Please sign in again.'
      )
    }
  }

  useEffect(() => {
    if (!sessionToken) {
      return undefined
    }

    loadPortal()

    const interval =
      window.setInterval(
        () => {
          loadPortal()
        },
        8000
      )

    return () => {
      window.clearInterval(
        interval
      )
    }

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionToken])

  const handleLogin = async (
    event
  ) => {
    event.preventDefault()

    if (loggingIn) return

    const cleanUserId =
      userId.trim().toLowerCase()

    if (
      cleanUserId.length < 3 ||
      password.length < 6
    ) {
      setError(
        'Enter your Driver User ID and password.'
      )
      return
    }

    setLoggingIn(true)
    setError('')
    setMessage('')

    try {
      const {
        data,
        error: rpcError,
      } = await supabase.rpc(
        'delivery_driver_login',
        {
          p_restaurant_code:
            restaurantCode,
          p_user_id: cleanUserId,
          p_password: password,
        }
      )

      if (rpcError) {
        throw rpcError
      }

      if (
        !data?.success ||
        !data?.session_token
      ) {
        throw new Error(
          data?.message ||
            'Driver login failed.'
        )
      }

      const token =
        String(
          data.session_token
        )

      try {
        localStorage.setItem(
          storageKey,
          token
        )
      } catch {
        // Continue even if storage is unavailable.
      }

      setSessionToken(token)
      setPassword('')
      setMessage(
        `Welcome ${data?.driver?.name || 'Driver'}.`
      )

      await loadPortal(token)
    } catch (loginError) {
      console.error(
        'Delivery driver login error:',
        loginError
      )

      setError(
        loginError?.message ||
          'Driver login failed.'
      )
    } finally {
      setLoggingIn(false)
    }
  }

  const logout = async () => {
    const token =
      sessionToken

    try {
      if (token) {
        await supabase.rpc(
          'delivery_driver_logout',
          {
            p_session_token:
              token,
          }
        )
      }
    } catch (logoutError) {
      console.error(
        'Driver logout error:',
        logoutError
      )
    } finally {
      try {
        localStorage.removeItem(
          storageKey
        )
      } catch {
        // Ignore.
      }

      setSessionToken('')
      setPortalData(null)
      setUserId('')
      setPassword('')
      setMessage('')
      setError('')
    }
  }

  const updateStatus = async (
    order,
    nextStatus
  ) => {
    if (
      !sessionToken ||
      updatingOrderId
    ) {
      return
    }

    const confirmation =
      window.confirm(
        nextStatus ===
          'out_for_delivery'
          ? `Start delivery for ${order.order_code}?`
          : `Mark ${order.order_code} as delivered?`
      )

    if (!confirmation) return

    setUpdatingOrderId(
      order.id
    )
    setError('')
    setMessage('')

    try {
      const {
        data,
        error: rpcError,
      } = await supabase.rpc(
        'delivery_driver_update_order_status',
        {
          p_session_token:
            sessionToken,
          p_order_id:
            order.id,
          p_new_status:
            nextStatus,
        }
      )

      if (rpcError) {
        throw rpcError
      }

      if (!data?.success) {
        throw new Error(
          data?.message ||
            'Unable to update order.'
        )
      }

      setMessage(
        nextStatus ===
          'out_for_delivery'
          ? 'Order marked Out for Delivery.'
          : 'Order marked Delivered.'
      )

      await loadPortal()
    } catch (updateError) {
      console.error(
        'Driver order update error:',
        updateError
      )

      setError(
        updateError?.message ||
          'Unable to update order.'
      )
    } finally {
      setUpdatingOrderId('')
    }
  }

  const orders =
    Array.isArray(
      portalData?.orders
    )
      ? portalData.orders
      : []

  const activeOrders =
    useMemo(
      () =>
        orders.filter(
          (order) =>
            ![
              'delivered',
              'cancelled',
            ].includes(
              String(
                order.order_status ||
                  ''
              )
            )
        ),
      [orders]
    )

  const recentOrders =
    useMemo(
      () =>
        orders.filter((order) =>
          [
            'delivered',
            'cancelled',
          ].includes(
            String(
              order.order_status || ''
            )
          )
        ),
      [orders]
    )

  if (loading) {
    return (
      <main className="min-h-screen bg-neutral-950 px-4 py-10 text-white">
        <div className="mx-auto max-w-md rounded-3xl border border-neutral-800 bg-neutral-900 p-8 text-center">
          Loading Driver Portal...
        </div>
      </main>
    )
  }

  if (
    !sessionToken ||
    !portalData
  ) {
    return (
      <main className="min-h-screen bg-neutral-950 px-4 py-10 text-neutral-100">
        <div className="mx-auto max-w-md">
          <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-6 shadow-2xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-2xl">
              🚚
            </div>

            <p className="mt-5 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-400">
              Digital Dining
            </p>

            <h1 className="mt-1 text-2xl font-black text-white">
              Delivery Driver Login
            </h1>

            <p className="mt-2 text-sm leading-6 text-neutral-400">
              Sign in using the Driver
              User ID and password given
              by the restaurant owner.
            </p>

            <form
              onSubmit={handleLogin}
              className="mt-6 space-y-4"
            >
              <label className="block">
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-neutral-500">
                  Driver User ID
                </span>

                <input
                  value={userId}
                  onChange={(event) =>
                    setUserId(
                      event.target.value
                    )
                  }
                  autoComplete="username"
                  placeholder="driver01"
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-emerald-500"
                />
              </label>

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-neutral-500">
                  Password
                </span>

                <input
                  type="password"
                  value={password}
                  onChange={(event) =>
                    setPassword(
                      event.target.value
                    )
                  }
                  autoComplete="current-password"
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-emerald-500"
                />
              </label>

              {error && (
                <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs font-bold leading-5 text-red-300">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={loggingIn}
                className="w-full rounded-xl bg-emerald-600 px-5 py-4 text-sm font-black text-white disabled:opacity-50"
              >
                {loggingIn
                  ? 'Signing In...'
                  : 'Open Driver Portal'}
              </button>
            </form>

            <p className="mt-5 text-center text-[10px] leading-5 text-neutral-600">
              Five failed login attempts
              temporarily lock the Driver
              Portal account for 15
              minutes.
            </p>
          </section>
        </div>
      </main>
    )
  }

  const driver =
    portalData.driver || {}

  const restaurant =
    portalData.restaurant || {}

  return (
    <main className="min-h-screen bg-neutral-950 pb-10 text-neutral-100">
      <header className="sticky top-0 z-30 border-b border-neutral-800 bg-neutral-950/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-black text-white">
              {restaurant.name ||
                'Delivery'}
            </p>

            <p className="mt-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-400">
              Driver Portal
            </p>
          </div>

          <button
            type="button"
            onClick={logout}
            className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-2.5 text-xs font-black text-neutral-300"
          >
            Logout
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-neutral-500">
                Signed in as
              </p>

              <h1 className="mt-1 text-xl font-black text-white">
                {driver.name}
              </h1>

              <p className="mt-1 text-xs text-neutral-400">
                {driver.mobile}
                {driver.vehicle_type
                  ? ` · ${driver.vehicle_type}`
                  : ''}
                {driver.vehicle_number
                  ? ` · ${driver.vehicle_number}`
                  : ''}
              </p>
            </div>

            <span
              className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase ${
                driver.status ===
                'busy'
                  ? 'bg-orange-500/10 text-orange-400'
                  : 'bg-emerald-500/10 text-emerald-400'
              }`}
            >
              {driver.status ||
                'available'}
            </span>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500">
                Active Deliveries
              </p>

              <p className="mt-2 text-2xl font-black text-orange-400">
                {activeOrders.length}
              </p>
            </div>

            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500">
                Completed Recently
              </p>

              <p className="mt-2 text-2xl font-black text-emerald-400">
                {
                  recentOrders.filter(
                    (order) =>
                      order.order_status ===
                      'delivered'
                  ).length
                }
              </p>
            </div>
          </div>
        </section>

        {message && (
          <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-xs font-bold text-emerald-300">
            {message}
          </div>
        )}

        {error && (
          <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs font-bold text-red-300">
            {error}
          </div>
        )}

        <section>
          <div className="mb-3">
            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
              Assigned Orders
            </p>

            <h2 className="mt-1 text-lg font-black text-white">
              Active Deliveries
            </h2>
          </div>

          <div className="space-y-3">
            {activeOrders.map(
              (order) => {
                const address = [
                  order.address_line1,
                  order.address_line2,
                  order.landmark,
                  order.city,
                  order.state,
                  order.pincode,
                ]
                  .filter(Boolean)
                  .join(', ')

                const mapUrl =
                  `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                    address
                  )}`

                const codDue =
                  order.payment_method ===
                    'cod' &&
                  order.payment_status !==
                    'paid'

                return (
                  <article
                    key={order.id}
                    className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] font-black text-emerald-400">
                        {
                          order.order_code
                        }
                      </span>

                      <span className="rounded-full bg-orange-500/10 px-2.5 py-1 text-[10px] font-black text-orange-400">
                        {labelStatus(
                          order.order_status
                        )}
                      </span>

                      {codDue && (
                        <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-black text-amber-300">
                          COLLECT{' '}
                          {money(
                            order.total_amount
                          )}
                        </span>
                      )}
                    </div>

                    <h3 className="mt-4 text-lg font-black text-white">
                      {
                        order.customer_name
                      }
                    </h3>

                    <p className="mt-1 text-xs text-neutral-400">
                      {order.customer_mobile}
                      {order.alternate_mobile
                        ? ` · Alt ${order.alternate_mobile}`
                        : ''}
                    </p>

                    <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                      <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500">
                        Delivery Address
                      </p>

                      <p className="mt-2 text-sm leading-6 text-neutral-200">
                        {address}
                      </p>
                    </div>

                    {order.customer_note && (
                      <div className="mt-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
                        <p className="text-[9px] font-black uppercase tracking-wider text-amber-400">
                          Customer Note
                        </p>

                        <p className="mt-1 text-xs leading-5 text-amber-100">
                          {
                            order.customer_note
                          }
                        </p>
                      </div>
                    )}

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <a
                        href={`tel:${order.customer_mobile}`}
                        className="rounded-xl bg-neutral-800 px-4 py-3 text-center text-xs font-black text-white"
                      >
                        Call Customer
                      </a>

                      <a
                        href={mapUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl bg-sky-600 px-4 py-3 text-center text-xs font-black text-white"
                      >
                        Open Maps
                      </a>
                    </div>

                    <div className="mt-4 border-t border-neutral-800 pt-4">
                      <div className="space-y-2">
                        {Array.isArray(
                          order.items
                        ) &&
                          order.items.map(
                            (
                              item,
                              index
                            ) => (
                              <div
                                key={
                                  item.id ||
                                  index
                                }
                                className="flex items-center justify-between gap-3 text-xs"
                              >
                                <span className="text-neutral-300">
                                  {
                                    item.name
                                  }{' '}
                                  ×{' '}
                                  {Number(
                                    item.quantity ||
                                      item.qty ||
                                      1
                                  )}
                                </span>

                                <span className="font-black text-white">
                                  {money(
                                    item.line_total ??
                                      Number(
                                        item.price ||
                                          0
                                      ) *
                                        Number(
                                          item.quantity ||
                                            item.qty ||
                                            1
                                        )
                                  )}
                                </span>
                              </div>
                            )
                          )}
                      </div>

                      <div className="mt-3 flex items-center justify-between border-t border-neutral-800 pt-3">
                        <span className="text-xs text-neutral-500">
                          Total
                        </span>

                        <span className="text-lg font-black text-white">
                          {money(
                            order.total_amount
                          )}
                        </span>
                      </div>
                    </div>

                    <p className="mt-4 text-[10px] text-neutral-600">
                      Assigned order ·{' '}
                      {formatDate(
                        order.created_at
                      )}
                    </p>

                    {order.order_status ===
                      'packed' && (
                      <button
                        type="button"
                        disabled={
                          updatingOrderId ===
                          order.id
                        }
                        onClick={() =>
                          updateStatus(
                            order,
                            'out_for_delivery'
                          )
                        }
                        className="mt-4 w-full rounded-xl bg-orange-500 px-5 py-4 text-sm font-black text-white disabled:opacity-50"
                      >
                        {updatingOrderId ===
                        order.id
                          ? 'Updating...'
                          : 'Start Delivery'}
                      </button>
                    )}

                    {order.order_status ===
                      'out_for_delivery' && (
                      <button
                        type="button"
                        disabled={
                          updatingOrderId ===
                          order.id
                        }
                        onClick={() =>
                          updateStatus(
                            order,
                            'delivered'
                          )
                        }
                        className="mt-4 w-full rounded-xl bg-emerald-600 px-5 py-4 text-sm font-black text-white disabled:opacity-50"
                      >
                        {updatingOrderId ===
                        order.id
                          ? 'Updating...'
                          : codDue
                            ? `Delivered & Collected ${money(
                                order.total_amount
                              )}`
                            : 'Mark Delivered'}
                      </button>
                    )}

                    {![
                      'packed',
                      'out_for_delivery',
                    ].includes(
                      order.order_status
                    ) && (
                      <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-xs text-neutral-500">
                        Waiting for the
                        restaurant to mark
                        this order Packed.
                      </div>
                    )}
                  </article>
                )
              }
            )}

            {!activeOrders.length && (
              <div className="rounded-3xl border border-neutral-800 bg-neutral-900 py-14 text-center">
                <div className="text-3xl">
                  ✓
                </div>

                <p className="mt-3 text-sm font-black text-white">
                  No active deliveries
                </p>

                <p className="mt-1 text-xs text-neutral-500">
                  New assigned orders will
                  appear automatically.
                </p>
              </div>
            )}
          </div>
        </section>

        {recentOrders.length > 0 && (
          <section>
            <div className="mb-3">
              <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
                Recent
              </p>

              <h2 className="mt-1 text-lg font-black text-white">
                Completed Orders
              </h2>
            </div>

            <div className="space-y-2">
              {recentOrders.map(
                (order) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between gap-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
                  >
                    <div>
                      <p className="font-mono text-xs font-black text-white">
                        {
                          order.order_code
                        }
                      </p>

                      <p className="mt-1 text-[10px] text-neutral-500">
                        {formatDate(
                          order.delivered_at ||
                            order.created_at
                        )}
                      </p>
                    </div>

                    <span
                      className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${
                        order.order_status ===
                        'delivered'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-red-500/10 text-red-400'
                      }`}
                    >
                      {labelStatus(
                        order.order_status
                      )}
                    </span>
                  </div>
                )
              )}
            </div>
          </section>
        )}
      </div>
    </main>
  )
}
