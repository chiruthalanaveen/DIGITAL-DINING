'use client'
import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'

export default function KitchenPortal({ params }) {
  const unwrappedParams = use(params)
  const restaurantId = unwrappedParams.restaurantId

  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [orders, setOrders] = useState([])

  const handleLogin = async (e) => {
    e.preventDefault()
    try {
      const { data, error } = await supabase
        .from('staff_users')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('user_id', userId.trim().toLowerCase())
        .eq('password', password.trim())
        .eq('role', 'kitchen')
        .single()

      if (error || !data) throw new Error('Invalid kitchen credentials.')
      setIsAuthenticated(true)
      fetchActiveOrders()
    } catch (err) {
      alert(err.message)
    }
  }

  const fetchActiveOrders = async () => {
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .neq('status', 'completed')
      .order('created_at', { ascending: true })

    if (data) setOrders(data)
  }

  // Realtime subscription
  useEffect(() => {
    if (!isAuthenticated) return

    const channel = supabase
      .channel(`kitchen-orders-${restaurantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` },
        (payload) => {
          if (payload.eventType === 'INSERT') {
            new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3').play().catch(() => {})
          }
          fetchActiveOrders()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isAuthenticated, restaurantId])

  const setOrderStatus = async (orderId, newStatus) => {
    await supabase.from('orders').update({ status: newStatus }).eq('id', orderId)
    fetchActiveOrders()
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="bg-neutral-900 border border-neutral-800 p-8 rounded-3xl max-w-sm w-full space-y-4">
          <h1 className="text-xl font-black">Kitchen Terminal</h1>
          <input type="text" placeholder="User ID" value={userId} onChange={(e) => setUserId(e.target.value)} required className="w-full bg-neutral-950 border border-neutral-800 p-3 rounded-xl text-xs font-mono" />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full bg-neutral-950 border border-neutral-800 p-3 rounded-xl text-xs font-mono" />
          <button type="submit" className="w-full bg-red-600 font-bold p-3 rounded-xl text-xs uppercase">Open Queue 🍳</button>
        </form>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6 space-y-6">
      <div className="flex justify-between items-center max-w-7xl mx-auto border-b border-neutral-800 pb-4">
        <div>
          <span className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-3 py-1 rounded-full uppercase font-bold">KDS Terminal</span>
          <h1 className="text-2xl font-black mt-1">Live Kitchen Orders</h1>
        </div>
        <button onClick={() => setIsAuthenticated(false)} className="bg-neutral-900 border border-neutral-800 text-xs px-4 py-2 rounded-xl text-red-400 font-bold">Log Out ⎋</button>
      </div>

      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4">
        {orders.map((order) => (
          <div key={order.id} className="bg-neutral-900 border border-neutral-800 p-5 rounded-2xl flex flex-col justify-between space-y-4">
            <div>
              <div className="flex justify-between items-center border-b border-neutral-800 pb-2">
                <span className="text-lg font-black text-white">{order.table_number}</span>
                <span className={`text-[10px] uppercase font-bold px-2 py-1 rounded ${order.status === 'ready' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-amber-500/20 text-amber-400'}`}>
                  {order.status}
                </span>
              </div>
              <div className="space-y-1 mt-3">
                {order.items?.map((item, i) => (
                  <p key={i} className="text-xs text-neutral-300">• {item.name} <strong className="text-orange-400">×{item.qty || item.quantity}</strong></p>
                ))}
              </div>
            </div>

            <div className="pt-2 border-t border-neutral-800 flex gap-2">
              {order.status === 'pending' && (
                <button onClick={() => setOrderStatus(order.id, 'preparing')} className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold p-2.5 rounded-xl text-xs">
                  Start Preparing 🍳
                </button>
              )}
              {order.status === 'preparing' && (
                <button onClick={() => setOrderStatus(order.id, 'ready')} className="w-full bg-emerald-500 hover:bg-emerald-600 text-neutral-950 font-black p-2.5 rounded-xl text-xs">
                  Mark Ready (Send to Waiter) 🔔
                </button>
              )}
              {order.status === 'ready' && (
                <div className="w-full text-center text-[11px] font-bold text-emerald-400 py-2 bg-emerald-950/20 rounded-xl border border-emerald-500/20">
                  Waiting for Waiter Handover...
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}