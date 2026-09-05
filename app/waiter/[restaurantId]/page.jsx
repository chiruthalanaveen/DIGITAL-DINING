'use client'
import { useState, useEffect, use } from 'react'
import { supabase } from '@/lib/supabase'

export default function WaiterPortal({ params }) {
  const unwrappedParams = use(params)
  const restaurantId = unwrappedParams.restaurantId

  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [userId, setUserId] = useState('')
  const [password, setPassword] = useState('')
  const [waiterName, setWaiterName] = useState('')
  
  const [menuItems, setMenuItems] = useState([])
  const [tableNumber, setTableNumber] = useState('Table 1')
  const [cart, setCart] = useState([])
  const [readyOrders, setReadyOrders] = useState([])

  const handleLogin = async (e) => {
    e.preventDefault()
    try {
      const { data, error } = await supabase
        .from('staff_users')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('user_id', userId.trim().toLowerCase())
        .eq('password', password.trim())
        .eq('role', 'waiter')
        .single()

      if (error || !data) throw new Error('Invalid waiter credentials.')

      setWaiterName(data.name)
      setIsAuthenticated(true)
      fetchMenu()
      fetchReadyOrders()
    } catch (err) {
      alert(err.message)
    }
  }

  const fetchMenu = async () => {
    const { data } = await supabase.from('menu_items').select('*').eq('restaurant_id', restaurantId).eq('is_available', true)
    if (data) setMenuItems(data)
  }

  const fetchReadyOrders = async () => {
    const { data } = await supabase
      .from('orders')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('status', 'ready')
      .order('created_at', { ascending: false })

    if (data) setReadyOrders(data)
  }

  // Realtime hook for incoming 'ready' orders from kitchen
  useEffect(() => {
    if (!isAuthenticated) return

    const channel = supabase
      .channel(`waiter-channel-${restaurantId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'orders', filter: `restaurant_id=eq.${restaurantId}` },
        (payload) => {
          if (payload.new && payload.new.status === 'ready') {
            new Audio('https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3').play().catch(() => {})
          }
          fetchReadyOrders()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isAuthenticated, restaurantId])

  // Handover action: stamps the waiter's name and marks completed
  const handleHandover = async (orderId) => {
    await supabase
      .from('orders')
      .update({ 
        status: 'completed',
        waiter_name: waiterName 
      })
      .eq('id', orderId)

    fetchReadyOrders()
    alert('Handover recorded successfully! ✅')
  }

  const handlePlaceOrder = async () => {
    if (cart.length === 0) return
    const total = cart.reduce((sum, i) => sum + (i.price * i.qty), 0)

    await supabase.from('orders').insert([
      {
        restaurant_id: restaurantId,
        table_number: tableNumber,
        waiter_name: waiterName,
        items: cart,
        total_amount: total,
        payment_mode: 'Cash at Counter',
        status: 'pending'
      }
    ])

    alert('Order sent to kitchen! 🍳')
    setCart([])
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4">
        <form onSubmit={handleLogin} className="bg-neutral-900 border border-neutral-800 p-8 rounded-3xl max-w-sm w-full space-y-4">
          <h1 className="text-xl font-black">Waiter Sign In</h1>
          <input type="text" placeholder="User ID" value={userId} onChange={(e) => setUserId(e.target.value)} required className="w-full bg-neutral-950 border border-neutral-800 p-3 rounded-xl text-xs font-mono" />
          <input type="password" placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full bg-neutral-950 border border-neutral-800 p-3 rounded-xl text-xs font-mono" />
          <button type="submit" className="w-full bg-orange-500 font-bold p-3 rounded-xl text-xs uppercase">Open Terminal ➔</button>
        </form>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6 space-y-6">
      <div className="flex justify-between items-center border-b border-neutral-800 pb-4">
        <div>
          <h1 className="text-xl font-black">Waiter Portal</h1>
          <p className="text-xs text-neutral-400">Logged in: <strong className="text-orange-400">{waiterName}</strong></p>
        </div>
        <button onClick={() => setIsAuthenticated(false)} className="bg-neutral-900 border border-neutral-800 text-xs px-4 py-2 rounded-xl text-red-400 font-bold">Log Out ⎋</button>
      </div>

      {/* ORDERS READY TO BE HANDED OVER */}
      {readyOrders.length > 0 && (
        <div className="bg-neutral-900 border-2 border-emerald-500/40 p-5 rounded-3xl space-y-3">
          <h2 className="text-sm font-black text-emerald-400 uppercase tracking-wider">🔔 Kitchen Orders Ready for Handover ({readyOrders.length})</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {readyOrders.map((order) => (
              <div key={order.id} className="bg-neutral-950 border border-neutral-800 p-4 rounded-2xl flex flex-col justify-between space-y-3">
                <div>
                  <div className="flex justify-between items-center">
                    <span className="font-black text-white text-base">{order.table_number}</span>
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded font-bold uppercase">Ready</span>
                  </div>
                  <div className="mt-2 text-xs space-y-1 text-neutral-300">
                    {order.items?.map((item, idx) => (
                      <p key={idx}>• {item.name} ×{item.qty || item.quantity}</p>
                    ))}
                  </div>
                </div>
                <button
                  onClick={() => handleHandover(order.id)}
                  className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-2.5 rounded-xl text-xs uppercase tracking-wider transition"
                >
                  Approve & Handover 🚀
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MENU AND CART WORKSPACE */}
      <div className="flex flex-col md:flex-row gap-6">
        <div className="flex-1 space-y-4">
          <div className="flex justify-between items-center">
            <h2 className="text-sm font-bold text-neutral-400 uppercase">Take Direct Order</h2>
            <select value={tableNumber} onChange={(e) => setTableNumber(e.target.value)} className="bg-neutral-900 border border-neutral-800 text-xs font-bold p-2 rounded-xl text-white">
              {[...Array(15)].map((_, i) => <option key={i + 1} value={`Table ${i + 1}`}>Table {i + 1}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {menuItems.map((item) => (
              <div key={item.id} onClick={() => setCart(prev => {
                const ex = prev.find(x => x.id === item.id)
                return ex ? prev.map(x => x.id === item.id ? { ...x, qty: x.qty + 1 } : x) : [...prev, { ...item, qty: 1 }]
              })} className="bg-neutral-900 border border-neutral-800 p-3 rounded-2xl cursor-pointer hover:border-orange-500 space-y-1">
                <p className="text-xs font-bold text-white">{item.name}</p>
                <p className="text-xs font-mono text-orange-400 font-bold">₹{item.price}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="w-full md:w-80 bg-neutral-900 border border-neutral-800 p-5 rounded-3xl flex flex-col justify-between space-y-4">
          <div>
            <h2 className="text-xs font-bold text-white uppercase border-b border-neutral-800 pb-2">Active Ticket ({tableNumber})</h2>
            <div className="space-y-2 mt-3 max-h-60 overflow-y-auto">
              {cart.map(item => (
                <div key={item.id} className="flex justify-between text-xs bg-neutral-950 p-2.5 rounded-xl">
                  <span>{item.name} ×{item.qty}</span>
                  <span className="font-mono text-orange-400 font-bold">₹{item.price * item.qty}</span>
                </div>
              ))}
            </div>
          </div>
          <button onClick={handlePlaceOrder} disabled={cart.length === 0} className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-black py-3 rounded-xl text-xs uppercase">
            Send to Kitchen 🍳
          </button>
        </div>
      </div>
    </div>
  )
}