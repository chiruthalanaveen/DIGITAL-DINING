'use client'

import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { appConfirm } from '@/lib/appDialog'

const date = value => value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'

export default function DeliveryFailedReturnDesk({
  restaurantId, mode = 'owner', sessionToken = '', sessionMode = true,
  restaurantCode = '', userId = '', password = '',
}) {
  const [returns, setReturns] = useState([])
  const [busy, setBusy] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const managerRpc = async (action, orderId) => {
    const isSession = Boolean(sessionMode && sessionToken)
    const name = isSession ? 'dd_manager_failed_return_session' : 'dd_manager_failed_return_manual'
    const params = isSession
      ? { p_session_token: sessionToken, p_action: action, p_order_id: orderId || null }
      : { p_restaurant_id: String(restaurantId), p_restaurant_code: String(restaurantCode),
          p_user_id: String(userId), p_password: String(password), p_action: action, p_order_id: orderId || null }
    const { data, error: rpcError } = await supabase.rpc(name, params)
    if (rpcError) throw rpcError
    return data
  }

  const ownerApi = async (action, orderId) => {
    const { data: { session } = {}, error: sessionError } = await supabase.auth.getSession()
    if (sessionError || !session?.access_token) throw new Error('Owner sign-in required.')
    const response = await fetch(action === 'list'
      ? `/api/delivery/failed-return?restaurantId=${encodeURIComponent(restaurantId)}`
      : '/api/delivery/failed-return', {
      method: action === 'list' ? 'GET' : 'POST',
      headers: { Authorization: `Bearer ${session.access_token}`,
        ...(action === 'list' ? {} : { 'Content-Type': 'application/json' }) },
      ...(action === 'list' ? {} : { body: JSON.stringify({ restaurantId, orderId }) }),
      cache: 'no-store',
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok && !data?.message) throw new Error('Restaurant return request failed.')
    return data
  }

  const request = async (action, orderId) => mode === 'manager'
    ? managerRpc(action, orderId) : ownerApi(action, orderId)

  const load = useCallback(async (quiet = false) => {
    if (!restaurantId) return
    if (!quiet) setLoading(true)
    try {
      const data = await (mode === 'manager' ? managerRpc('list') : ownerApi('list'))
      if (!data?.success) throw new Error(data?.message || 'Unable to load returned orders.')
      setReturns(Array.isArray(data.returns) ? data.returns : [])
      setError('')
    } catch (err) { setError(err?.message || 'Unable to load returned orders.') }
    finally { if (!quiet) setLoading(false) }
  // The caller is stable across ordinary renders; dependencies are primitive credentials/session values.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restaurantId, mode, sessionToken, sessionMode, restaurantCode, userId, password])

  useEffect(() => {
    void load()
    const timer = window.setInterval(() => { void load(true) }, 25000)
    return () => window.clearInterval(timer)
  }, [load])

  const confirm = async order => {
    if (busy || !order.handed_over_at) return
    const approved = await appConfirm(
      `Have you physically received all returned items for ${order.order_code}? This releases the delivery boy from the order. Cancellation/refund must still be completed separately.`,
      { title: 'Confirm Returned Items Received', confirmText: 'Confirm Receipt' }
    )
    if (!approved) return
    setBusy(String(order.order_id)); setError(''); setNotice('')
    try {
      const data = await request('confirm', order.order_id)
      if (!data?.success) throw new Error(data?.message || 'Could not confirm receipt.')
      setNotice('Return received. Driver assignment released. Finish cancellation/refund through the existing restaurant order workflow.')
      await load(true)
    } catch (err) { setError(err?.message || 'Unable to confirm receipt.') }
    finally { setBusy('') }
  }

  const waiting = returns.filter(x => !x.return_received_at)
  const received = returns.filter(x => Boolean(x.return_received_at))

  return (
    <section className="rounded-3xl border border-amber-300/30 bg-amber-50 p-4 text-slate-900 sm:p-5" aria-label="Unsuccessful delivery returns">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-black">Unsuccessful Delivery — Restaurant Handover</h2>
          <p className="mt-1 text-xs text-slate-600">{waiting.length} returns waiting for physical receipt confirmation</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="rounded-xl border border-amber-300 bg-white px-3 py-2 text-xs font-bold disabled:opacity-50">{loading ? 'Refreshing…' : 'Refresh Returns'}</button>
      </div>
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-100 p-3 text-xs text-red-800">{error}</p>}
      {notice && <p role="status" className="mt-3 rounded-xl bg-green-100 p-3 text-xs text-green-800">{notice}</p>}
      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        {waiting.map(order => (
          <article key={order.order_id} className="rounded-2xl border border-amber-200 bg-white p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="font-black">#{order.order_code}</p>
              <span className="rounded-full bg-amber-100 px-2 py-1 text-xs font-bold text-amber-900">{order.handed_over_at ? 'Awaiting Store Confirmation' : 'Driver Returning Items'}</span>
            </div>
            <p className="mt-2 text-xs text-slate-700">Driver: {order.driver_name || 'Driver'} · Customer: {order.customer_name || 'Customer'}</p>
            <p className="mt-1 text-xs text-slate-600">Reason: {String(order.unsuccessful_reason || 'Not delivered').replaceAll('_',' ')} · {date(order.unsuccessful_at)}</p>
            <p className="mt-1 text-xs text-slate-600">Payment: {String(order.payment_method || '').toUpperCase()} / {order.payment_status}</p>
            {order.handed_over_at ? (
              <button type="button" disabled={Boolean(busy)} onClick={() => void confirm(order)} className="mt-3 rounded-xl bg-amber-700 px-4 py-2.5 text-xs font-bold text-white disabled:opacity-50">Confirm Returned Order Received</button>
            ) : <p className="mt-3 text-xs text-amber-800">Driver has not yet submitted physical handover.</p>}
          </article>
        ))}
        {!waiting.length && <p className="col-span-full rounded-xl border border-dashed border-amber-200 p-6 text-center text-sm text-slate-600">No unsuccessful deliveries awaiting return confirmation.</p>}
      </div>
      {received.length > 0 && <details className="mt-4 rounded-xl bg-white p-3 text-xs">
        <summary className="cursor-pointer font-bold">Recently confirmed returns ({received.length})</summary>
        <div className="mt-3 space-y-2">{received.map(x => <p key={x.order_id}>#{x.order_code} — received {date(x.return_received_at)} by {x.return_received_by}</p>)}</div>
      </details>}
      <p className="mt-3 text-xs leading-5 text-amber-900"><strong>Payment safety:</strong> Confirming receipt only releases the driver. Process cancellation, prepaid refunds, stock reconciliation and any COD exceptions through your existing restaurant workflow. COD reconciliation itself is unchanged.</p>
    </section>
  )
}