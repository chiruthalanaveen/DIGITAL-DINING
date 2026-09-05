'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function DeveloperAdminDashboard() {
  const router = useRouter()
  const [restaurants, setRestaurants] = useState([])
  const [loading, setLoading] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState([])

  // Detailed Modal/Drawer state for inspecting/modifying specific restaurant data
  const [activeRestaurant, setActiveRestaurant] = useState(null)
  const [restaurantMenu, setRestaurantMenu] = useState([])
  const [restaurantStaff, setRestaurantStaff] = useState([])
  const [restaurantOrders, setRestaurantOrders] = useState([])
  const [inspectTab, setInspectTab] = useState('menu')

  useEffect(() => {
    fetchRestaurants()
  }, [])

  const fetchRestaurants = async () => {
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('restaurants')
        .select('*')
        .order('name', { ascending: true })

      if (error) throw new Error(error.message)
      setRestaurants(data || [])
      setSelectedIds([])
    } catch (err) {
      alert('Error loading restaurants: ' + err.message)
    } finally {
      setLoading(false)
    }
  }

  // Open Deep Inspector for a specific restaurant
  const handleOpenInspector = async (restaurant) => {
    setActiveRestaurant(restaurant)
    await fetchInspectorData(restaurant.id)
  }

  const fetchInspectorData = async (restId) => {
    try {
      const [menuRes, staffRes, orderRes] = await Promise.all([
        supabase.from('menu_items').select('*').eq('restaurant_id', restId),
        supabase.from('staff_users').select('*').eq('restaurant_id', restId),
        supabase.from('orders').select('*').eq('restaurant_id', restId).order('created_at', { ascending: false })
      ])

      setRestaurantMenu(menuRes.data || [])
      setRestaurantStaff(staffRes.data || [])
      setRestaurantOrders(orderRes.data || [])
    } catch (err) {
      console.error('Error fetching restaurant deep data:', err)
    }
  }

  // Developer Modifier: Update Restaurant Plan Globally
  const handleUpdatePlan = async (restId, newPlan) => {
    try {
      const { error } = await supabase
        .from('restaurants')
        .update({ plan: newPlan })
        .eq('id', restId)

      if (error) throw error
      setRestaurants(prev => prev.map(r => r.id === restId ? { ...r, plan: newPlan } : r))
      if (activeRestaurant) setActiveRestaurant(prev => ({ ...prev, plan: newPlan }))
      alert(`Plan updated to ${newPlan} successfully! ✅`)
    } catch (err) {
      alert('Failed to update plan: ' + err.message)
    }
  }

  // Developer Modifier: Delete Menu Item
  const handleDeveloperDeleteMenuItem = async (itemId) => {
    if (!confirm('Developer override: Delete this menu item?')) return
    try {
      await supabase.from('menu_items').delete().eq('id', itemId)
      setRestaurantMenu(prev => prev.filter(i => i.id !== itemId))
    } catch (err) {
      alert('Failed to delete item: ' + err.message)
    }
  }

  // Developer Modifier: Revoke Staff
  const handleDeveloperDeleteStaff = async (staffId) => {
    if (!confirm('Developer override: Revoke this staff member?')) return
    try {
      await supabase.from('staff_users').delete().eq('id', staffId)
      setRestaurantStaff(prev => prev.filter(s => s.id !== staffId))
    } catch (err) {
      alert('Failed to revoke staff: ' + err.message)
    }
  }

  // INSTANT DELETE SINGLE RESTAURANT
  const handleDeleteRestaurant = async (id, name) => {
    if (!confirm(`Developer override: Delete restaurant "${name}" and all its related data?`)) return

    setRestaurants(prev => prev.filter(r => r.id !== id))
    setSelectedIds(prev => prev.filter(selectedId => selectedId !== id))
    if (activeRestaurant?.id === id) setActiveRestaurant(null)

    try {
      const { error } = await supabase.from('restaurants').delete().eq('id', id)
      if (error) throw new Error(error.message)
    } catch (err) {
      alert('Delete Failed: ' + err.message)
      fetchRestaurants()
    }
  }

  // INSTANT BULK DELETE
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return
    if (!confirm(`Developer override: Delete ${selectedIds.length} selected restaurant partners?`)) return

    const idsToDelete = [...selectedIds]
    setRestaurants(prev => prev.filter(r => !idsToDelete.includes(r.id)))
    setSelectedIds([])
    setActiveRestaurant(null)

    try {
      const { error } = await supabase.from('restaurants').delete().in('id', idsToDelete)
      if (error) throw new Error(error.message)
    } catch (err) {
      alert('Bulk Delete Failed: ' + err.message)
      fetchRestaurants()
    }
  }

  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(filteredRestaurants.map(r => r.id))
    } else {
      setSelectedIds([])
    }
  }

  const handleToggleSelect = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id])
  }

  const filteredRestaurants = restaurants.filter(r => 
    r.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.email.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const isAllSelected = filteredRestaurants.length > 0 && filteredRestaurants.every(r => selectedIds.includes(r.id))

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 p-6 md:p-10 font-sans">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* HEADER */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border-b border-neutral-800 pb-6">
          <div>
            <span className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-3 py-1 rounded-full uppercase font-extrabold tracking-widest">
              Developer Super Admin Mode ⚡
            </span>
            <h1 className="text-3xl font-black text-white mt-2">Master Control & Data Modifier</h1>
            <p className="text-xs text-neutral-400">Full root access to view, override, and modify all multi-tenant restaurant data.</p>
          </div>

          <div className="flex items-center space-x-3">
            {selectedIds.length > 0 && (
              <button 
                onClick={handleBulkDelete}
                className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-xl text-xs font-bold transition shadow-lg shadow-red-600/20"
              >
                🗑️ Delete Selected ({selectedIds.length})
              </button>
            )}
            <button 
              onClick={fetchRestaurants}
              className="bg-neutral-900 hover:bg-neutral-800 border border-neutral-800 text-neutral-300 px-4 py-2 rounded-xl text-xs font-bold transition"
            >
              🔄 Refresh Master DB
            </button>
            <button 
              onClick={() => router.push('/admin/login')}
              className="bg-red-600/10 hover:bg-red-600 text-red-400 hover:text-white border border-red-500/20 px-4 py-2 rounded-xl text-xs font-bold transition"
            >
              Sign Out 🚪
            </button>
          </div>
        </div>

        {/* METRICS & SEARCH */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-2xl">
            <p className="text-xs text-neutral-400 uppercase tracking-widest font-bold">Total Platform Partners</p>
            <p className="text-2xl font-black text-white font-mono mt-1">{restaurants.length}</p>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-2xl">
            <p className="text-xs text-neutral-400 uppercase tracking-widest font-bold">Active Subscriptions</p>
            <p className="text-2xl font-black text-emerald-400 font-mono mt-1">
              {restaurants.filter(r => r.subscription_status === 'active').length}
            </p>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-2xl flex items-center">
            <input 
              type="text" 
              placeholder="Global search partner name or email..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-xs focus:outline-none focus:border-red-500"
            />
          </div>
        </div>

        {/* DEEP INSPECTOR MODAL / DRAWER (IF ACTIVE RESTAURANT SELECTED) */}
        {activeRestaurant && (
          <div className="bg-neutral-900 border-2 border-red-500/50 rounded-3xl p-6 md:p-8 space-y-6 shadow-2xl relative">
            <div className="flex justify-between items-center border-b border-neutral-800 pb-4">
              <div>
                <span className="text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/20 px-3 py-1 rounded-full uppercase font-extrabold tracking-widest">
                  Developer Data Inspector
                </span>
                <h2 className="text-xl font-black text-white mt-1">Modifying: {activeRestaurant.name}</h2>
                <p className="text-[11px] text-neutral-400 font-mono">UUID: {activeRestaurant.id}</p>
              </div>
              <button 
                onClick={() => setActiveRestaurant(null)}
                className="bg-neutral-800 hover:bg-neutral-700 text-white px-3 py-1.5 rounded-xl text-xs font-bold"
              >
                Close Inspector ✕
              </button>
            </div>

            {/* Quick Plan Override Modifier */}
            <div className="flex items-center justify-between bg-neutral-950 p-4 rounded-2xl border border-neutral-800 text-xs">
              <span className="font-bold text-neutral-300">Developer Tier Override:</span>
              <div className="flex space-x-2">
                {['Standard', 'Pro', 'Pro+'].map((tier) => (
                  <button 
                    key={tier}
                    onClick={() => handleUpdatePlan(activeRestaurant.id, tier)}
                    className={`px-3 py-1.5 rounded-xl font-black uppercase transition ${activeRestaurant.plan === tier ? 'bg-orange-500 text-white' : 'bg-neutral-900 text-neutral-400 hover:text-white'}`}
                  >
                    {tier}
                  </button>
                ))}
              </div>
            </div>

            {/* Inspector Tabs */}
            <div className="flex space-x-2 border-b border-neutral-800 pb-3">
              <button onClick={() => setInspectTab('menu')} className={`px-4 py-2 rounded-xl text-xs font-bold ${inspectTab === 'menu' ? 'bg-red-600 text-white' : 'bg-neutral-950 text-neutral-400'}`}>
                🍔 Menu Items ({restaurantMenu.length})
              </button>
              <button onClick={() => setInspectTab('staff')} className={`px-4 py-2 rounded-xl text-xs font-bold ${inspectTab === 'staff' ? 'bg-red-600 text-white' : 'bg-neutral-950 text-neutral-400'}`}>
                👥 Staff Credentials ({restaurantStaff.length})
              </button>
              <button onClick={() => setInspectTab('orders')} className={`px-4 py-2 rounded-xl text-xs font-bold ${inspectTab === 'orders' ? 'bg-red-600 text-white' : 'bg-neutral-950 text-neutral-400'}`}>
                🔥 Orders Queue ({restaurantOrders.length})
              </button>
            </div>

            {/* Inspector Tab Content */}
            <div className="bg-neutral-950 p-4 rounded-2xl border border-neutral-800 max-h-80 overflow-y-auto">
              {inspectTab === 'menu' && (
                <div className="space-y-2">
                  {restaurantMenu.length === 0 ? <p className="text-xs text-neutral-500">No menu items found.</p> : restaurantMenu.map(item => (
                    <div key={item.id} className="flex justify-between items-center text-xs bg-neutral-900 p-3 rounded-xl border border-neutral-800">
                      <div>
                        <span className="font-bold text-white">{item.name}</span>
                        <span className="text-emerald-400 font-mono ml-3">₹{item.price}</span>
                      </div>
                      <button onClick={() => handleDeveloperDeleteMenuItem(item.id)} className="text-red-400 hover:text-red-300 font-bold">Delete 🗑️</button>
                    </div>
                  ))}
                </div>
              )}

              {inspectTab === 'staff' && (
                <div className="space-y-2">
                  {restaurantStaff.length === 0 ? <p className="text-xs text-neutral-500">No staff accounts found.</p> : restaurantStaff.map(staff => (
                    <div key={staff.id} className="flex justify-between items-center text-xs bg-neutral-900 p-3 rounded-xl border border-neutral-800">
                      <div>
                        <span className="font-bold text-white">{staff.name}</span> ({staff.role})
                        <span className="text-orange-400 font-mono ml-3">ID: {staff.user_id} | Pass: {staff.password}</span>
                      </div>
                      <button onClick={() => handleDeveloperDeleteStaff(staff.id)} className="text-red-400 hover:text-red-300 font-bold">Revoke 🗑️</button>
                    </div>
                  ))}
                </div>
              )}

              {inspectTab === 'orders' && (
                <div className="space-y-2">
                  {restaurantOrders.length === 0 ? <p className="text-xs text-neutral-500">No orders found.</p> : restaurantOrders.map(order => (
                    <div key={order.id} className="flex justify-between items-center text-xs bg-neutral-900 p-3 rounded-xl border border-neutral-800">
                      <div>
                        <span className="font-bold text-white">Table {order.table_number}</span> ({order.status})
                        <span className="text-emerald-400 font-mono ml-3">₹{order.total_amount}</span>
                      </div>
                      <span className="text-neutral-500">{new Date(order.created_at).toLocaleTimeString()}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* MASTER PARTNERS TABLE */}
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl overflow-hidden shadow-2xl">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-neutral-800 text-[10px] text-neutral-400 uppercase tracking-widest bg-neutral-950/50">
                  <th className="p-4 w-12 text-center">
                    <input 
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={handleSelectAll}
                      className="w-4 h-4 accent-red-600 rounded cursor-pointer"
                    />
                  </th>
                  <th className="p-4 font-bold">Restaurant Name</th>
                  <th className="p-4 font-bold">Contact Info</th>
                  <th className="p-4 font-bold">Plan & Tier</th>
                  <th className="p-4 font-bold">Status</th>
                  <th className="p-4 font-bold text-right">Developer Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-800/60 text-xs">
                {loading ? (
                  <tr>
                    <td colSpan="6" className="p-8 text-center text-neutral-400">Loading master database...</td>
                  </tr>
                ) : filteredRestaurants.length === 0 ? (
                  <tr>
                    <td colSpan="6" className="p-8 text-center text-neutral-400">No restaurant partners found.</td>
                  </tr>
                ) : (
                  filteredRestaurants.map((restaurant) => {
                    const isSelected = selectedIds.includes(restaurant.id)
                    return (
                      <tr key={restaurant.id} className={`hover:bg-neutral-800/35 transition ${isSelected ? 'bg-red-950/10' : ''}`}>
                        <td className="p-4 text-center">
                          <input 
                            type="checkbox"
                            checked={isSelected}
                            onChange={() => handleToggleSelect(restaurant.id)}
                            className="w-4 h-4 accent-red-600 rounded cursor-pointer"
                          />
                        </td>
                        <td className="p-4 font-bold text-white">
                          {restaurant.name}
                          <p className="text-[10px] text-neutral-500 font-mono mt-0.5">ID: {restaurant.id}</p>
                        </td>
                        <td className="p-4">
                          <p className="text-neutral-300">{restaurant.email}</p>
                          <p className="text-[10px] text-neutral-500 font-mono">+91 {restaurant.phone || 'N/A'}</p>
                        </td>
                        <td className="p-4">
                          <span className="bg-neutral-800 text-amber-400 px-2.5 py-1 rounded-lg text-[11px] font-black uppercase">
                            {restaurant.plan || 'Standard'}
                          </span>
                        </td>
                        <td className="p-4">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            {restaurant.subscription_status || 'Active'}
                          </span>
                        </td>
                        <td className="p-4 text-right space-x-2">
                          <button 
                            onClick={() => handleOpenInspector(restaurant)}
                            className="bg-orange-500/10 hover:bg-orange-500 text-orange-400 hover:text-white border border-orange-500/30 px-3 py-1.5 rounded-xl font-bold transition"
                          >
                            Manage Data ⚙️
                          </button>
                          <button 
                            onClick={() => router.push(`/dashboard/${restaurant.id}`)}
                            className="bg-neutral-800 hover:bg-neutral-700 text-neutral-200 px-3 py-1.5 rounded-xl font-bold transition"
                          >
                            Dashboard 👁️
                          </button>
                          <button 
                            onClick={() => handleDeleteRestaurant(restaurant.id, restaurant.name)}
                            className="bg-red-500/10 hover:bg-red-600 text-red-400 hover:text-white px-3 py-1.5 rounded-xl font-bold transition"
                          >
                            Delete 🗑️
                          </button>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}