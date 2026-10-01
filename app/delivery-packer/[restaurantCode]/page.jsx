'use client'



import {

  use,

  useEffect,

  useMemo,

  useState,

} from 'react'

import { supabase } from '@/lib/supabase'
import { useMobileViewportLock } from '@/lib/useMobileViewportLock'



function money(value) {

  return `₹${Number(value || 0).toLocaleString('en-IN', {

    maximumFractionDigits: 2,

  })}`

}



function labelStatus(value) {

  return String(value || '')

    .replaceAll('_', ' ')

    .replace(/\b\w/g, (char) => char.toUpperCase())

}



function formatDate(value) {

  if (!value) return '—'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) return '—'

  return date.toLocaleString('en-IN', {

    day: '2-digit',

    month: 'short',

    hour: '2-digit',

    minute: '2-digit',

  })

}



export default function DeliveryPackerPortal({ params }) {

  const unwrappedParams = use(params)
  useMobileViewportLock()

  const restaurantCode = String(

    unwrappedParams?.restaurantCode || ''

  ).trim()



  const storageKey =

    `digitaldining_delivery_packer_session_${restaurantCode}`



  const [sessionToken, setSessionToken] = useState('')

  const [userId, setUserId] = useState('')

  const [password, setPassword] = useState('')

  const [portalData, setPortalData] = useState(null)

  const [loading, setLoading] = useState(true)

  const [loggingIn, setLoggingIn] = useState(false)

  const [refreshing, setRefreshing] = useState(false)

  const [updatingOrderId, setUpdatingOrderId] = useState('')

  const [error, setError] = useState('')

  const [message, setMessage] = useState('')



  useEffect(() => {

    try {

      const saved = localStorage.getItem(storageKey)

      if (saved) setSessionToken(saved)

    } catch {

      // Ignore unavailable local storage.

    }

    setLoading(false)

  }, [storageKey])



  const loadPortal = async (tokenOverride = '', quiet = false) => {

    const token = String(tokenOverride || sessionToken || '').trim()

    if (!token) {

      setPortalData(null)

      return

    }



    if (quiet) setRefreshing(true)



    try {

      const { data, error: rpcError } = await supabase.rpc(

        'get_delivery_packer_portal_data',

        { p_session_token: token }

      )



      if (rpcError) throw rpcError

      if (!data?.success) {

        throw new Error(data?.message || 'Packer session is invalid.')

      }



      setPortalData(data)

      setError('')

    } catch (loadError) {

      console.error('Packer portal load error:', loadError)

      setPortalData(null)

      setSessionToken('')

      try {

        localStorage.removeItem(storageKey)

      } catch {

        // Ignore.

      }

      setError(

        loadError?.message ||

          'Your Packer Portal session expired. Please sign in again.'

      )

    } finally {

      setRefreshing(false)

    }

  }



  useEffect(() => {

    if (!sessionToken) return undefined



    loadPortal()



    // Orders-only operational refresh cadence requested: one minute.

    const interval = window.setInterval(() => {

      loadPortal('', true)

    }, 60_000)



    return () => window.clearInterval(interval)

    // eslint-disable-next-line react-hooks/exhaustive-deps

  }, [sessionToken])



  const handleLogin = async (event) => {

    event.preventDefault()

    if (loggingIn) return



    const cleanUserId = userId.trim().toLowerCase()

    if (cleanUserId.length < 3 || password.length < 6) {

      setError('Enter your Packer User ID and password.')

      return

    }



    setLoggingIn(true)

    setError('')

    setMessage('')



    try {

      const { data, error: rpcError } = await supabase.rpc(

        'delivery_packer_login',

        {

          p_restaurant_code: restaurantCode,

          p_user_id: cleanUserId,

          p_password: password,

        }

      )



      if (rpcError) throw rpcError

      if (!data?.success || !data?.session_token) {

        throw new Error(data?.message || 'Packer login failed.')

      }



      const token = String(data.session_token)

      try {

        localStorage.setItem(storageKey, token)

      } catch {

        // Continue even if local storage is unavailable.

      }



      setSessionToken(token)

      setPassword('')

      setMessage(`Welcome ${data?.packer?.name || 'Packer'}.`)

      await loadPortal(token)

    } catch (loginError) {

      console.error('Delivery packer login error:', loginError)

      setError(loginError?.message || 'Packer login failed.')

    } finally {

      setLoggingIn(false)

    }

  }



  const logout = async () => {

    const token = sessionToken

    try {

      if (token) {

        await supabase.rpc('delivery_packer_logout', {

          p_session_token: token,

        })

      }

    } catch (logoutError) {

      console.error('Packer logout error:', logoutError)

    } finally {

      try {

        localStorage.removeItem(storageKey)

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



  const updateStatus = async (order, nextStatus) => {

    if (!sessionToken || updatingOrderId) return



    // Update immediately from the Packer Portal.
    // Do not use the browser's native window.confirm() popup.
    // The pressed button itself is the confirmation/input.
    setUpdatingOrderId(order.id)

    setError('')

    setMessage('')



    try {

      const { data, error: rpcError } = await supabase.rpc(

        'delivery_packer_update_order_status',

        {

          p_session_token: sessionToken,

          p_order_id: order.id,

          p_new_status: nextStatus,

        }

      )



      if (rpcError) throw rpcError

      if (!data?.success) {

        throw new Error(data?.message || 'Unable to update order.')

      }



      setMessage(

        nextStatus === 'confirmed'

          ? 'Order confirmed.'

          : nextStatus === 'packed'

            ? 'Order marked Packed.'

            : 'Order marked Out for Delivery.'

      )



      await loadPortal('', true)

    } catch (updateError) {

      console.error('Packer order update error:', updateError)

      setError(updateError?.message || 'Unable to update order.')

    } finally {

      setUpdatingOrderId('')

    }

  }



  const orders = Array.isArray(portalData?.orders)

    ? portalData.orders

    : []



  const sections = useMemo(() => {

    const grouped = {

      received: [],

      confirmed: [],

      packed: [],

      out_for_delivery: [],

    }



    for (const order of orders) {

      const status = String(order.order_status || '')

      if (status === 'preparing') {

        grouped.confirmed.push(order)

      } else if (grouped[status]) {

        grouped[status].push(order)

      }

    }



    return grouped

  }, [orders])



  if (loading) {

    return (

      <main className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-neutral-950 px-3 py-6 text-white sm:px-4 sm:py-10">

        <div className="mx-auto w-full max-w-md rounded-3xl border border-neutral-800 bg-neutral-900 p-6 text-center sm:p-8">

          Loading Packer Portal...

        </div>

      </main>

    )

  }



  if (!sessionToken || !portalData) {

    return (

      <main className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-neutral-950 px-3 py-6 text-neutral-100 sm:px-4 sm:py-10">

        <div className="mx-auto w-full max-w-md">

          <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5 shadow-2xl sm:p-6">

            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/10 text-2xl">

              📦

            </div>



            <p className="mt-5 text-[10px] font-black uppercase tracking-[0.18em] text-violet-400">

              Digital Dining

            </p>

            <h1 className="mt-1 text-2xl font-black text-white">

              Delivery Packer Login

            </h1>

            <p className="mt-2 text-sm leading-6 text-neutral-400">

              Sign in using the Packer User ID and password given by the owner.

            </p>



            <form onSubmit={handleLogin} className="mt-6 space-y-4">

              <label className="block">

                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-neutral-500">

                  Packer User ID

                </span>

                <input

                  value={userId}

                  onChange={(event) => setUserId(event.target.value)}

                  autoComplete="username"

                  placeholder="packer01"

                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-violet-500"

                />

              </label>



              <label className="block">

                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-neutral-500">

                  Password

                </span>

                <input

                  type="password"

                  value={password}

                  onChange={(event) => setPassword(event.target.value)}

                  autoComplete="current-password"

                  placeholder="••••••••"

                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-violet-500"

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

                className="w-full rounded-xl bg-violet-600 px-5 py-4 text-sm font-black text-white disabled:opacity-50"

              >

                {loggingIn ? 'Signing In...' : 'Open Packer Portal'}

              </button>

            </form>

          </section>

        </div>

      </main>

    )

  }



  const packer = portalData.packer || {}

  const restaurant = portalData.restaurant || {}



  const renderOrders = (title, subtitle, rows) => (

    <section>

      <div className="mb-3 flex items-end justify-between gap-3">

        <div>

          <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">

            {subtitle}

          </p>

          <h2 className="mt-1 text-lg font-black text-white">

            {title}

          </h2>

        </div>

        <span className="rounded-full bg-neutral-900 px-3 py-1.5 text-[10px] font-black text-neutral-400">

          {rows.length}

        </span>

      </div>



      <div className="space-y-3">

        {rows.map((order) => {

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



          const hasLocation =

            Number.isFinite(Number(order.latitude)) &&

            Number.isFinite(Number(order.longitude))



          const mapUrl = hasLocation

            ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(

                `${order.latitude},${order.longitude}`

              )}`

            : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(

                address

              )}`



          const busy = updatingOrderId === order.id

          const status = String(order.order_status || '')



          return (

            <article

              key={order.id}

              className="min-w-0 rounded-3xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5"

            >

              <div className="flex flex-wrap items-center gap-2">

                <span className="rounded-full bg-violet-500/10 px-2.5 py-1 font-mono text-[10px] font-black text-violet-300">

                  {order.order_code}

                </span>

                <span className="rounded-full bg-orange-500/10 px-2.5 py-1 text-[10px] font-black text-orange-400">

                  {labelStatus(status)}

                </span>

                <span className="rounded-full bg-neutral-800 px-2.5 py-1 text-[10px] font-black text-neutral-300">

                  {order.payment_method === 'cod'

                    ? `COD ${money(order.total_amount)}`

                    : `Paid ${money(order.total_amount)}`}

                </span>

              </div>



              <h3 className="mt-4 text-base font-black text-white">

                {order.customer_name}

              </h3>

              <p className="mt-1 text-xs text-neutral-400">

                {order.customer_mobile}

                {order.alternate_mobile

                  ? ` · Alt ${order.alternate_mobile}`

                  : ''}

              </p>



              <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">

                <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500">

                  Items to Pack

                </p>

                <div className="mt-2 space-y-2">

                  {Array.isArray(order.items) &&

                    order.items.map((item, index) => (

                      <div

                        key={item.id || index}

                        className="flex items-start justify-between gap-3 text-xs"

                      >

                        <span className="text-neutral-200">

                          {item.name} ×{' '}

                          {Number(item.quantity || item.qty || 1)}

                        </span>

                        <span className="font-black text-white">

                          {money(

                            item.line_total ??

                              Number(item.price || 0) *

                                Number(item.quantity || item.qty || 1)

                          )}

                        </span>

                      </div>

                    ))}

                </div>

              </div>



              <div className="mt-3 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">

                <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500">

                  Delivery Address

                </p>

                <p className="mt-2 text-xs leading-5 text-neutral-300">

                  {address}

                </p>

                {hasLocation && (

                  <p className="mt-2 text-[10px] font-bold text-emerald-400">

                    ✓ Customer live location captured

                    {order.location_accuracy_m

                      ? ` · ±${Math.round(Number(order.location_accuracy_m))}m`

                      : ''}

                  </p>

                )}

              </div>



              <div className="mt-3 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2">

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

                  Open Location

                </a>

              </div>



              <div className="mt-3 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">

                <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500">

                  Assigned Driver

                </p>

                <p className="mt-1 text-xs font-bold text-white">

                  {order.driver_name || 'Waiting for driver assignment'}

                </p>

                {order.driver_mobile && (

                  <p className="mt-1 text-[10px] text-neutral-400">

                    {order.driver_mobile}

                  </p>

                )}

              </div>



              <p className="mt-4 text-[10px] text-neutral-600">

                Received {formatDate(order.created_at)}

              </p>



              {status === 'received' && (

                <button

                  type="button"

                  disabled={busy}

                  onClick={() => updateStatus(order, 'confirmed')}

                  className="mt-4 w-full rounded-xl bg-violet-600 px-5 py-4 text-sm font-black text-white disabled:opacity-50"

                >

                  {busy ? 'Updating...' : 'Confirm Order'}

                </button>

              )}



              {['confirmed', 'preparing'].includes(status) && (

                <button

                  type="button"

                  disabled={busy}

                  onClick={() => updateStatus(order, 'packed')}

                  className="mt-4 w-full rounded-xl bg-orange-500 px-5 py-4 text-sm font-black text-white disabled:opacity-50"

                >

                  {busy ? 'Updating...' : 'Mark Packed'}

                </button>

              )}



              {status === 'packed' && (

                <button

                  type="button"

                  disabled={busy || !order.driver_id}

                  onClick={() => updateStatus(order, 'out_for_delivery')}

                  className="mt-4 w-full rounded-xl bg-emerald-600 px-5 py-4 text-sm font-black text-white disabled:opacity-40"

                >

                  {busy

                    ? 'Updating...'

                    : order.driver_id

                      ? 'Out for Delivery'

                      : 'Waiting for Driver Assignment'}

                </button>

              )}



              {status === 'out_for_delivery' && (

                <div className="mt-4 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-xs font-bold text-emerald-300">

                  Out for Delivery. Driver completes Delivered / Not Delivered with proof.

                </div>

              )}

            </article>

          )

        })}



        {!rows.length && (

          <div className="rounded-3xl border border-neutral-800 bg-neutral-900 py-12 text-center text-xs text-neutral-500">

            No orders in this stage.

          </div>

        )}

      </div>

    </section>

  )



  return (

    <main className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-neutral-950 pb-[max(2.5rem,env(safe-area-inset-bottom))] text-neutral-100">

      <header className="sticky top-0 z-30 border-b border-neutral-800 bg-neutral-950/95 backdrop-blur">

        <div className="mx-auto flex w-full max-w-4xl items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:px-4">

          <div className="min-w-0">

            <p className="truncate text-sm font-black text-white">

              {restaurant.name || 'Delivery'}

            </p>

            <p className="mt-0.5 text-[10px] font-black uppercase tracking-wider text-violet-400">

              Packer Portal · {packer.name}

            </p>

          </div>



          <div className="flex items-center gap-2">

            <button

              type="button"

              onClick={() => loadPortal('', true)}

              disabled={refreshing}

              className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-[10px] font-black text-neutral-300 disabled:opacity-50"

            >

              {refreshing ? 'Refreshing...' : 'Refresh'}

            </button>

            <button

              type="button"

              onClick={logout}

              className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-[10px] font-black text-neutral-300"

            >

              Logout

            </button>

          </div>

        </div>

      </header>



      <div className="mx-auto w-full max-w-4xl space-y-6 px-4 py-5">

        <section className="min-w-0 rounded-3xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">

          <p className="text-[10px] font-black uppercase tracking-wider text-neutral-500">

            Live Packing Queue

          </p>

          <div className="mt-3 grid grid-cols-4 gap-2">

            {[

              ['Received', sections.received.length],

              ['Confirmed', sections.confirmed.length],

              ['Packed', sections.packed.length],

              ['On Road', sections.out_for_delivery.length],

            ].map(([label, value]) => (

              <div

                key={label}

                className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3 text-center"

              >

                <p className="text-lg font-black text-white">{value}</p>

                <p className="mt-1 text-[8px] font-black uppercase text-neutral-500">

                  {label}

                </p>

              </div>

            ))}

          </div>

          <p className="mt-3 text-[10px] text-neutral-500">

            Orders refresh automatically every 1 minute. Use Refresh for an immediate check.

          </p>

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



        {renderOrders('New Orders', 'Confirm incoming orders', sections.received)}

        {renderOrders('Packing Queue', 'Confirmed and preparing', sections.confirmed)}

        {renderOrders('Ready to Dispatch', 'Packed orders', sections.packed)}

        {renderOrders('Out for Delivery', 'Driver has left', sections.out_for_delivery)}

      </div>

    </main>

  )

}
