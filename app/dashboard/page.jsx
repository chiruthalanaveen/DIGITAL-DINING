'use client'
import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function RestaurantDashboard() {
  const params = useParams()
  const restaurantId = params.id
  const router = useRouter()

  const [restaurant, setRestaurant] = useState(null)
  const [menuItems, setMenuItems] = useState([])
  const [orders, setOrders] = useState([])
  const [activeTab, setActiveTab] = useState('orders')
  const [isStoreOpen, setIsStoreOpen] = useState(true)

  // Add Dish Form States
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [category, setCategory] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [isVeg, setIsVeg] = useState('veg')
  const [loading, setLoading] = useState(false)

  // Payment Gateway Configuration States
  const [razorpayKeyId, setRazorpayKeyId] = useState('')
  const [razorpaySecret, setRazorpaySecret] = useState('')
  const [enableCounterPayment, setEnableCounterPayment] = useState(true)
  const [savingPayment, setSavingPayment] = useState(false)

  // Swiggy Sync States
  const [swiggyDataInput, setSwiggyDataInput] = useState('')
  const [syncingSwiggy, setSyncingSwiggy] = useState(false)

  // Plan limit mapping
  const planLimits = {
    Starter: 10,
    Pro: 50,
    Unlimited: Infinity,
    Enterprise: Infinity
  }

  useEffect(() => {
    async function fetchDashboard() {
      if (!restaurantId) return

      const { data: restData, error } = await supabase
        .from('restaurants')
        .select('*')
        .eq('id', restaurantId)
        .maybeSingle()

      if (error || !restData) {
        router.push('/login')
        return
      }

      setRestaurant(restData)
      setRazorpayKeyId(restData.razorpay_key_id || '')
      setRazorpaySecret(restData.razorpay_secret || '')
      setEnableCounterPayment(restData.enable_counter_payment ?? true)

      const { data: menuData } = await supabase
        .from('menu_items')
        .select('*')
        .eq('restaurant_id', restaurantId)
      if (menuData) setMenuItems(menuData)

      const { data: orderData } = await supabase
        .from('orders')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false })
      if (orderData) setOrders(orderData)
    }

    fetchDashboard()
    const interval = setInterval(fetchDashboard, 4000)
    return () => clearInterval(interval)
  }, [restaurantId, router])

  const updateOrderStatus = async (orderId, newStatus) => {
    await supabase.from('orders').update({ status: newStatus }).eq('id', orderId)
    setOrders(orders.map(o => o.id === orderId ? { ...o, status: newStatus } : o))
  }

  const handleAddDish = async (e) => {
    e.preventDefault()
    if (!restaurant) return

    const currentPlan = restaurant.plan || 'Starter'
    const maxAllowed = planLimits[currentPlan] || 10

    if (menuItems.length >= maxAllowed) {
      alert(`⚠️ Limit Reached! Your current ${currentPlan} plan allows a maximum of ${maxAllowed} menu items. Please upgrade to Pro or Unlimited to add more dishes.`)
      return
    }

    setLoading(true)

    const { error } = await supabase.from('menu_items').insert([{
      restaurant_id: restaurant.id,
      name,
      price: parseFloat(price),
      category,
      image_url: imageUrl,
      is_veg: isVeg === 'veg',
      is_available: true
    }])

    if (error) {
      alert("Error adding item: " + error.message)
    } else {
      alert("Dish added to your live menu!")
      setName('')
      setPrice('')
      setCategory('')
      setImageUrl('')
      
      const { data } = await supabase.from('menu_items').select('*').eq('restaurant_id', restaurant.id)
      if (data) setMenuItems(data)
    }
    setLoading(false)
  }

  // Handle Swiggy Menu Direct Sync Import
  const handleSwiggySync = async (e) => {
    e.preventDefault()
    if (!swiggyDataInput.trim()) {
      alert('Please provide valid Swiggy menu export data or JSON.')
      return
    }

    setSyncingSwiggy(true)
    try {
      // Parse JSON format of Swiggy items [{name, price, category, is_veg}]
      const parsedItems = JSON.parse(swiggyDataInput)
      if (!Array.isArray(parsedItems)) throw new Error('Input must be a JSON array of items.')

      const formattedItems = parsedItems.map(item => ({
        restaurant_id: restaurant.id,
        name: item.name || 'Swiggy Item',
        price: parseFloat(item.price || 100),
        category: item.category || 'Swiggy Sync',
        image_url: item.image_url || '',
        is_veg: item.is_veg ?? true,
        is_available: true
      }))

      const { error } = await supabase.from('menu_items').insert(formattedItems)
      if (error) throw new Error(error.message)

      alert(`Successfully synced ${formattedItems.length} items from Swiggy menu! ✅`)
      setSwiggyDataInput('')

      // Refresh menu list
      const { data } = await supabase.from('menu_items').select('*').eq('restaurant_id', restaurant.id)
      if (data) setMenuItems(data)
    } catch (err) {
      alert('Sync Failed: Make sure your input format is valid JSON. Error: ' + err.message)
    }
    setSyncingSwiggy(false)
  }

  // Save payment gateway settings update
  const handleSavePaymentSettings = async (e) => {
    e.preventDefault()
    setSavingPayment(true)

    const { error } = await supabase
      .from('restaurants')
      .update({
        razorpay_key_id: razorpayKeyId.trim(),
        razorpay_secret: razorpaySecret.trim(),
        enable_counter_payment: enableCounterPayment
      })
      .eq('id', restaurantId)

    if (error) {
      alert('Failed to update payment settings: ' + error.message)
    } else {
      alert('Payment settings updated successfully! ✅')
    }
    setSavingPayment(false)
  }

  const handleTabSwitch = (tabId) => {
    if (tabId === 'gateway' && restaurant?.plan === 'Starter') {
      alert('🔒 Advanced Payment Gateway configuration is locked on the Starter plan. Please upgrade to the Unlimited plan to access this feature.')
      return
    }
    setActiveTab(tabId)
  }

  const handleLogout = () => {
    localStorage.removeItem('digital_dining_restaurant_id')
    router.push('/login')
  }

  const totalRevenue = orders.reduce((sum, o) => sum + (o.status !== 'cancelled' ? Number(o.total_amount || 0) : 0), 0)
  const activeOrders = orders.filter(o => o.status === 'pending' || o.status === 'preparing' || o.status === 'paid')
  
  // Daily Order Calculation
  const todayString = new Date().toISOString().split('T')[0]
  const todaysOrders = orders.filter(o => o.created_at && o.created_at.split('T')[0] === todayString)

  const currentPlan = restaurant?.plan || 'Starter'
  const maxMenuAllowed = planLimits[currentPlan] || 10

  if (!restaurant) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center text-white space-y-3">
        <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin"></div>
        <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">Loading Partner Portal...</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans pb-16">
      
      {/* Top Partner Header */}
      <header className="bg-neutral-900 border-b border-neutral-800 sticky top-0 z-30 px-6 py-4 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          
          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-orange-500 to-amber-500 flex items-center justify-center font-black text-white text-xl shadow-lg shadow-orange-500/20">
              {restaurant.name.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-black text-white">{restaurant.name}</h1>
                <button 
                  onClick={() => setIsStoreOpen(!isStoreOpen)}
                  className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center space-x-1 border ${
                    isStoreOpen 
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' 
                      : 'bg-red-500/10 text-red-400 border-red-500/30'
                  }`}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${isStoreOpen ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'}`}></span>
                  <span>{isStoreOpen ? 'Accepting Orders' : 'Store Paused'}</span>
                </button>
              </div>
              <p className="text-[11px] text-neutral-400 font-mono mt-0.5">Unique URL ID: {restaurant.id}</p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button 
              onClick={() => router.push(`/dashboard/${restaurant.id}/qr`)}
              className="bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs transition flex items-center space-x-2 shadow"
            >
              <span>📷 Table QR Codes</span>
            </button>
            <button 
              onClick={handleLogout}
              className="bg-red-500/10 border border-red-500/30 text-red-400 hover:bg-red-500 hover:text-white font-bold px-4 py-2.5 rounded-xl text-xs transition shadow"
            >
              Log Out ⎋
            </button>
          </div>

        </div>
      </header>

      {/* Main Container */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 mt-6 space-y-6">
        
        {/* Metrics Grid */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-3xl shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Total Revenue</p>
            <p className="text-2xl font-black text-white mt-1">₹{totalRevenue}</p>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-3xl shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Orders Today</p>
            <p className="text-2xl font-black text-emerald-400 mt-1">{todaysOrders.length}</p>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-3xl shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Live Kitchen Queue</p>
            <p className="text-2xl font-black text-orange-400 mt-1">{activeOrders.length}</p>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-3xl shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">Partner Tier</p>
            <p className="text-2xl font-black text-amber-400 mt-1">{currentPlan}</p>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-2 border-b border-neutral-800 pb-3 overflow-x-auto">
          {[
            { id: 'orders', label: `🔥 Live Orders (${orders.length})` },
            { id: 'menu', label: `🍔 Menu Catalog (${menuItems.length}/${maxMenuAllowed})` },
            { id: 'swiggy-sync', label: '🟠 Swiggy Sync' },
            { id: 'gateway', label: '💳 Payment Gateway' },
            { id: 'settlements', label: '💰 Settlements' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => handleTabSwitch(tab.id)}
              className={`px-5 py-2.5 rounded-2xl text-xs font-black uppercase tracking-wider transition whitespace-nowrap ${
                activeTab === tab.id 
                  ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' 
                  : 'bg-neutral-900 text-neutral-400 hover:bg-neutral-800 border border-neutral-800'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* TAB 1: LIVE ORDERS */}
        {activeTab === 'orders' && (
          <div className="space-y-4">
            <h2 className="text-lg font-black text-white">Live Kitchen Orders Queue</h2>
            {orders.length === 0 ? (
              <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-16 text-center text-neutral-500 space-y-2">
                <div className="text-4xl">🛎️</div>
                <p className="font-bold text-white text-base">No orders in queue</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {orders.map((order) => (
                  <div key={order.id} className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-md flex flex-col justify-between space-y-4">
                    <div>
                      {/* Order Number & Table Header */}
                      <div className="flex justify-between items-start">
                        <div className="flex items-center space-x-2">
                          <span className="bg-orange-500 text-white text-xs font-black px-3 py-1 rounded-xl">Order #{order.order_number || '1'}</span>
                          <span className="bg-neutral-800 text-neutral-300 border border-neutral-700 text-xs font-bold px-3 py-1 rounded-xl uppercase">Table {order.table_number || '1'}</span>
                        </div>
                        <span className={`text-[10px] font-black px-3 py-1 rounded-xl uppercase ${order.status === 'completed' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse'}`}>
                          {order.payment_mode || 'Online'} • {order.status}
                        </span>
                      </div>

                      {/* Customer Details Display */}
                      <div className="mt-3 bg-neutral-950 px-4 py-2.5 rounded-xl border border-neutral-800 flex justify-between items-center text-xs">
                        <span className="text-neutral-400 font-semibold">Customer: <strong className="text-white">{order.customer_name || 'Guest'}</strong></span>
                        <span className="text-orange-400 font-mono font-bold">📞 {order.customer_mobile || 'N/A'}</span>
                      </div>

                      {/* Items List */}
                      <div className="mt-2 space-y-2 bg-neutral-950 p-4 rounded-2xl border border-neutral-800">
                        {order.items && order.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between items-center text-sm">
                            <span className="text-neutral-200 font-medium">• {item.name} <strong className="text-orange-400">×{item.quantity}</strong></span>
                            <span className="text-xs text-neutral-400">₹{item.price * item.quantity}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="border-t border-neutral-800 pt-4 flex justify-between items-center">
                      <div>
                        <p className="text-[10px] uppercase font-bold text-neutral-500">Total Amount</p>
                        <p className="text-lg font-black text-emerald-400">₹{order.total_amount}</p>
                      </div>
                      <div className="flex space-x-2">
                        {order.status !== 'preparing' && order.status !== 'completed' && (
                          <button 
                            onClick={() => updateOrderStatus(order.id, 'preparing')}
                            className="bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500 hover:text-white text-xs font-bold px-4 py-2 rounded-xl transition"
                          >
                            Accept & Prepare
                          </button>
                        )}
                        {order.status !== 'completed' && (
                          <button 
                            onClick={() => updateOrderStatus(order.id, 'completed')}
                            className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition shadow"
                          >
                            Mark Completed
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: MENU CATALOG */}
        {activeTab === 'menu' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-3xl space-y-4 md:col-span-1 h-fit">
              <div className="flex justify-between items-center">
                <h2 className="text-md font-black text-white">Add New Dish</h2>
                <span className="text-[10px] text-neutral-400 font-bold">{menuItems.length} / {maxMenuAllowed} used</span>
              </div>
              <form onSubmit={handleAddDish} className="space-y-4">
                <div>
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Item Name</label>
                  <input type="text" placeholder="e.g. Paneer Tikka" value={name} onChange={(e) => setName(e.target.value)} required className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm" />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Price (₹)</label>
                  <input type="number" step="0.01" placeholder="e.g. 250" value={price} onChange={(e) => setPrice(e.target.value)} required className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm" />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Category</label>
                  <input type="text" placeholder="e.g. Starter" value={category} onChange={(e) => setCategory(e.target.value)} required className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm" />
                </div>
                <div>
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">Image URL</label>
                  <input type="url" placeholder="https://..." value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm" />
                </div>
                <button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-3.5 rounded-xl text-sm shadow-lg shadow-orange-500/20">
                  {loading ? 'Publishing...' : '+ Publish Dish'}
                </button>
              </form>
            </div>

            <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-3xl md:col-span-2 space-y-4">
              <h2 className="text-md font-black text-white">Active Catalog ({menuItems.length})</h2>
              {menuItems.map((item) => (
                <div key={item.id} className="bg-neutral-950 border border-neutral-800 p-4 rounded-2xl flex items-center justify-between">
                  <h3 className="font-bold text-white text-sm">{item.name}</h3>
                  <span className="font-black text-emerald-400 text-sm">₹{item.price}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 3: SWIGGY SYNC DIRECT IMPORT */}
        {activeTab === 'swiggy-sync' && (
          <div className="bg-neutral-900 border border-neutral-800 p-8 rounded-3xl max-w-xl mx-auto space-y-6 shadow-xl">
            <div className="space-y-2 text-center">
              <span className="text-[10px] font-extrabold text-orange-400 bg-orange-500/10 border border-orange-500/20 px-3 py-1 rounded-full uppercase tracking-widest">
                Swiggy Integration
              </span>
              <h2 className="text-xl font-black text-white">Sync Swiggy Menu Directly</h2>
              <p className="text-xs text-neutral-400">Paste your exported Swiggy menu JSON array below to instantly populate your digital dining menu catalog.</p>
            </div>

            <form onSubmit={handleSwiggySync} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-neutral-300 block mb-1">Swiggy Menu JSON Data</label>
                <textarea 
                  rows="6"
                  placeholder={`[\n  {\n    "name": "Chicken Biryani",\n    "price": 320,\n    "category": "Main Course",\n    "is_veg": false\n  }\n]`}
                  value={swiggyDataInput}
                  onChange={(e) => setSwiggyDataInput(e.target.value)}
                  className="w-full bg-neutral-950 text-white font-mono text-xs border border-neutral-800 rounded-xl p-4 focus:outline-none focus:border-orange-500"
                  required
                />
                <p className="text-[10px] text-neutral-500 mt-1">Format must be a valid JSON array containing item attributes: name, price, category, and is_veg (true/false).</p>
              </div>

              <button 
                type="submit"
                disabled={syncingSwiggy}
                className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-3.5 rounded-xl text-xs transition shadow-lg shadow-orange-500/25 hover:opacity-95"
              >
                {syncingSwiggy ? 'Syncing Menu Items...' : 'Sync Swiggy Menu Now 🔄'}
              </button>
            </form>
          </div>
        )}

        {/* TAB 4: PAYMENT GATEWAY MANAGEMENT */}
        {activeTab === 'gateway' && (
          <div className="bg-neutral-900 border border-neutral-800 p-8 rounded-3xl max-w-xl mx-auto space-y-6 shadow-xl">
            <div className="space-y-2 text-center">
              <span className="text-[10px] font-extrabold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full uppercase tracking-widest">
                Gateway Configurations
              </span>
              <h2 className="text-xl font-black text-white">Manage Your Payment Gateways</h2>
              <p className="text-xs text-neutral-400">Update your restaurant-specific Razorpay API keys and manage counter billing options.</p>
            </div>

            <form onSubmit={handleSavePaymentSettings} className="space-y-4">
              <div>
                <label className="text-xs font-bold text-neutral-300 block mb-1">Razorpay Key ID</label>
                <input 
                  type="text" 
                  placeholder="rzp_live_xxxxxxxxxx" 
                  value={razorpayKeyId}
                  onChange={(e) => setRazorpayKeyId(e.target.value)}
                  className="w-full bg-neutral-950 text-white font-mono text-xs border border-neutral-800 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-neutral-300 block mb-1">Razorpay Key Secret</label>
                <input 
                  type="password" 
                  placeholder="enter_secret_key" 
                  value={razorpaySecret}
                  onChange={(e) => setRazorpaySecret(e.target.value)}
                  className="w-full bg-neutral-950 text-white font-mono text-xs border border-neutral-800 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500"
                />
              </div>

              {/* Toggle Pay at Counter Option */}
              <div className="flex items-center justify-between bg-neutral-950 p-4 rounded-2xl border border-neutral-800">
                <div>
                  <p className="text-xs font-bold text-white">Enable "Pay at Counter"</p>
                  <p className="text-[10px] text-neutral-400">Allow customers to choose cash or offline payments at the billing desk.</p>
                </div>
                <input 
                  type="checkbox"
                  checked={enableCounterPayment}
                  onChange={(e) => setEnableCounterPayment(e.target.checked)}
                  className="w-5 h-5 accent-orange-500 rounded cursor-pointer"
                />
              </div>

              <button 
                type="submit"
                disabled={savingPayment}
                className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-3.5 rounded-xl text-xs transition shadow-lg shadow-orange-500/25 hover:opacity-95"
              >
                {savingPayment ? 'Saving Configurations...' : 'Save Payment Settings 💾'}
              </button>
            </form>
          </div>
        )}

        {/* TAB 5: SETTLEMENTS */}
        {activeTab === 'settlements' && (
          <div className="bg-neutral-900 border border-neutral-800 p-8 rounded-3xl max-w-xl mx-auto space-y-4 text-center">
            <h2 className="text-xl font-black text-white">Partner Settlements</h2>
            <div className="bg-neutral-950 border border-neutral-800 p-6 rounded-2xl">
              <p className="text-xs font-bold uppercase text-neutral-500">Available Payout Balance</p>
              <p className="text-3xl font-black text-emerald-400 mt-2">₹{totalRevenue}</p>
            </div>
            <button onClick={() => alert("Payout requested successfully!")} className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3.5 rounded-xl text-sm">
              Request Bank Payout
            </button>
          </div>
        )}

      </main>
    </div>
  )
}