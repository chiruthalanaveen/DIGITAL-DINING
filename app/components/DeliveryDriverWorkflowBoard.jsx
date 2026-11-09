'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { appConfirm } from '@/lib/appDialog'

const SECTIONS = [
  ['new', 'New Assignments'],
  ['pending', 'Pending Deliveries'],
  ['completed', 'Completed Deliveries'],
  ['unsuccessful', 'Unsuccessful Deliveries'],
]
const fmt = value => value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—'
const cash = value => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const category = order => {
  if (order.unsuccessful_at && !order.return_received_at) return 'unsuccessful'
  if (order.order_status === 'delivered') return 'completed'
  if (order.order_status === 'cancelled') return null
  if (!order.accepted_at && order.order_status !== 'out_for_delivery') return 'new'
  return 'pending'
}

export default function DeliveryDriverWorkflowBoard({ sessionToken, onGoToTracking, onChanged }) {
  const [orders, setOrders] = useState([])
  const [section, setSection] = useState('new')
  const [busy, setBusy] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const load = useCallback(async (quiet = false) => {
    if (!sessionToken) { setOrders([]); return }
    if (!quiet) setLoading(true)
    try {
      const { data, error: rpcError } = await supabase.rpc('delivery_driver_get_job_board', { p_session_token: sessionToken })
      if (rpcError) throw rpcError
      if (!data?.success) throw new Error(data?.message || 'Unable to load delivery jobs.')
      setOrders(Array.isArray(data.orders) ? data.orders : [])
      setError('')
    } catch (err) { setError(err?.message || 'Unable to load delivery jobs.') }
    finally { if (!quiet) setLoading(false) }
  }, [sessionToken])

  useEffect(() => {
    void load()
    if (!sessionToken) return undefined
    const interval = window.setInterval(() => { void load(true) }, 20000)
    return () => window.clearInterval(interval)
  }, [sessionToken, load])

  const groups = useMemo(() => {
    const result = { new: [], pending: [], completed: [], unsuccessful: [] }
    orders.forEach(order => { const key = category(order); if (key) result[key].push(order) })
    return result
  }, [orders])

  const act = async (order, action) => {
    if (busy) return
    const title = action === 'accept' ? 'Accept Order' : action === 'collect' ? 'Collect Order' : 'Hand Over to Restaurant'
    const detail = action === 'hand_over'
      ? `Confirm you are physically handing order ${order.order_code} back to the restaurant? It will stay in Unsuccessful Deliveries until the restaurant confirms receipt.`
      : `${title} ${order.order_code}?`
    if (!(await appConfirm(detail, { title, confirmText: title }))) return
    setBusy(String(order.id)); setError(''); setNotice('')
    try {
      const { data, error: rpcError } = await supabase.rpc('delivery_driver_job_action', {
        p_session_token: sessionToken, p_order_id: order.id, p_action: action,
      })
      if (rpcError) throw rpcError
      if (!data?.success) throw new Error(data?.message || 'Unable to update order.')
      setNotice(action === 'accept' ? 'Order accepted. It is now in Pending Deliveries.' :
        action === 'collect' ? 'Order collected. Customer tracking is now Out for Delivery.' :
        'Handover submitted. Waiting for the restaurant to confirm receipt.')
      await load(true)
      onChanged?.()
      if (action === 'accept' || action === 'collect') setSection('pending')
    } catch (err) { setError(err?.message || 'Unable to update order.') }
    finally { setBusy('') }
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-3 shadow-sm sm:p-5" aria-label="Delivery job workflow">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-black text-slate-900">Delivery Orders</h2>
          <p className="mt-1 text-xs text-slate-500">Accept → Collect → Deliver, or return unsuccessful deliveries to the restaurant.</p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="rounded-xl border border-slate-200 px-3 py-2 text-xs font-bold text-slate-700 disabled:opacity-50">{loading ? 'Refreshing…' : 'Refresh'}</button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-2 xl:grid-cols-4">
        {SECTIONS.map(([key, label]) => (
          <button type="button" key={key} onClick={() => setSection(key)}
            aria-pressed={section === key}
            className={`rounded-xl border p-3 text-left text-xs font-bold ${section === key ? 'border-blue-500 bg-blue-50 text-blue-800' : 'border-slate-200 bg-slate-50 text-slate-700'}`}>
            <span className="block text-xl font-black">{groups[key].length}</span>{label}
          </button>
        ))}
      </div>
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-700">{error}</p>}
      {notice && <p role="status" className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-700">{notice}</p>}
      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {groups[section].map(order => {
          const address = [order.address_line1,order.address_line2,order.landmark,order.city,order.state,order.pincode].filter(Boolean).join(', ')
          return (
            <article key={order.id} className="rounded-2xl border border-slate-200 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><p className="text-sm font-black text-slate-900">#{order.order_code}</p><p className="text-xs text-slate-500">{order.customer_name || 'Customer'} · {fmt(order.created_at)}</p></div>
                <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">{cash(order.total_amount)}</span>
              </div>
              <p className="mt-2 text-xs text-slate-600">{address || 'Address unavailable'}</p>
              <p className="mt-1 text-xs text-slate-500">{String(order.order_status || '').replaceAll('_',' ')} · {String(order.payment_method || '').toUpperCase()}</p>
              {section === 'unsuccessful' && <p className="mt-2 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">Reason: {String(order.unsuccessful_reason || 'Not delivered').replaceAll('_',' ')}. {order.handed_over_at ? 'Waiting for restaurant confirmation.' : 'Return the items to the restaurant.'}</p>}
              {section === 'completed' && <p className="mt-2 text-xs text-emerald-700">Delivered: {fmt(order.delivered_at)}</p>}
              <div className="mt-3 flex flex-wrap gap-2">
                {section === 'new' && order.order_status === 'packed' && <button type="button" disabled={Boolean(busy)} onClick={() => void act(order,'accept')} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Accept Order</button>}
                {section === 'new' && order.order_status !== 'packed' && <p className="text-xs text-amber-700">Waiting for packing before acceptance.</p>}
                {section === 'pending' && !order.accepted_at && <button type="button" disabled={Boolean(busy)} onClick={() => void act(order,'accept')} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Accept Order</button>}
                {section === 'pending' && order.accepted_at && !order.collected_at && <button type="button" disabled={Boolean(busy)} onClick={() => void act(order,'collect')} className="rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Collect / Start Delivery</button>}
                {section === 'pending' && order.collected_at && <button type="button" onClick={() => onGoToTracking?.()} className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white">Open Tracking / Submit Result</button>}
                {section === 'unsuccessful' && !order.handed_over_at && <button type="button" disabled={Boolean(busy)} onClick={() => void act(order,'hand_over')} className="rounded-xl bg-amber-600 px-4 py-2 text-xs font-bold text-white disabled:opacity-50">Hand Over to Restaurant</button>}
                {order.customer_mobile && <a href={`tel:${order.customer_mobile}`} className="rounded-xl border border-slate-200 px-4 py-2 text-xs font-bold text-slate-700">Call Customer</a>}
              </div>
            </article>
          )
        })}
        {!groups[section].length && <p className="col-span-full rounded-2xl border border-dashed border-slate-200 py-10 text-center text-sm text-slate-500">No {SECTIONS.find(x=>x[0]===section)?.[1].toLowerCase()} right now.</p>}
      </div>
    </section>
  )
}