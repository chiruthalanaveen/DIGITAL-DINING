http://localhost:3000/dashboard/52098cec-0a59-4911-a99d-e24b595d1621'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function RestaurantDashboard() {
  const params = useParams()
  const router = useRouter()
  const restaurantId = params?.id

  const [restaurant, setRestaurant] = useState(null)
  const [menuItems, setMenuItems] = useState([])
  const [orders, setOrders] = useState([])
  const [activeTab, setActiveTab] = useState('orders')
  const [isStoreOpen, setIsStoreOpen] = useState(true)
  const [authChecked, setAuthChecked] = useState(false)

  // Add item
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [category, setCategory] = useState('')
  const [description, setDescription] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [foodType, setFoodType] = useState('veg')
  const [reorderMode, setReorderMode] = useState('auto')
  const [loading, setLoading] = useState(false)

  // Edit item
  const [editingItem, setEditingItem] = useState(null)
  const [editName, setEditName] = useState('')
  const [editPrice, setEditPrice] = useState('')
  const [editCategory, setEditCategory] = useState('')
  const [editDescription, setEditDescription] = useState('')
  const [editImageUrl, setEditImageUrl] = useState('')
  const [editFoodType, setEditFoodType] = useState('veg')
  const [editReorderMode, setEditReorderMode] = useState('auto')
  const [editAvailable, setEditAvailable] = useState(true)
  const [savingEdit, setSavingEdit] = useState(false)

  // Razorpay
  const [razorpayKeyId, setRazorpayKeyId] = useState('')
  const [razorpaySecret, setRazorpaySecret] = useState('')
  const [enableCounterPayment, setEnableCounterPayment] = useState(true)
  const [savingPayment, setSavingPayment] = useState(false)

  // Swiggy
  const [swiggyDataInput, setSwiggyDataInput] = useState('')
  const [syncingSwiggy, setSyncingSwiggy] = useState(false)

  const planLimits = {
    Starter: 10,
    Pro: 50,
    Unlimited: Infinity,
    Enterprise: Infinity
  }

  const foodLabels = {
    veg: '🟢 Veg',
    'non-veg': '🔴 Non-Veg',
    egg: '🥚 Egg',
    beverage: '🥤 Beverage',
    other: 'Other'
  }

  // -----------------------------
  // AUTH CHECK
  // -----------------------------

  useEffect(() => {
    let cancelled = false

    const checkAuth = async () => {
      if (!restaurantId) {
        router.replace('/login')
        return
      }

      const {
        data: { user },
        error
      } = await supabase.auth.getUser()

      if (error || !user) {
        if (!cancelled) {
          router.replace('/login')
        }
        return
      }

      if (String(user.id) !== String(restaurantId)) {
        await supabase.auth.signOut()

        if (!cancelled) {
          router.replace('/login')
        }

        return
      }

      if (!cancelled) {
        setAuthChecked(true)
      }
    }

    checkAuth()

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT' || !session?.user) {
        router.replace('/login')
      }
    })

    return () => {
      cancelled = true
      subscription?.unsubscribe()
    }
  }, [restaurantId, router])

  // -----------------------------
  // FETCH MENU
  // -----------------------------

  const refreshMenu = useCallback(async () => {
    if (!restaurantId) return

    const { data, error } = await supabase
      .from('menu_items')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('category', { ascending: true })
      .order('name', { ascending: true })

    if (!error && data) {
      setMenuItems(data)
    }
  }, [restaurantId])

  // -----------------------------
  // FETCH DASHBOARD
  // -----------------------------

  const refreshDashboard = useCallback(async () => {
    if (!restaurantId) return

    const {
      data: { user },
      error: authError
    } = await supabase.auth.getUser()

    if (
      authError ||
      !user ||
      String(user.id) !== String(restaurantId)
    ) {
      await supabase.auth.signOut()
      router.replace('/login')
      return
    }

    const {
      data: restaurantData,
      error: restaurantError
    } = await supabase
      .from('restaurants')
      .select('*')
      .eq('id', restaurantId)
      .maybeSingle()

    if (restaurantError || !restaurantData) {
      router.replace('/login')
      return
    }

    setRestaurant(restaurantData)
    setRazorpayKeyId(restaurantData.razorpay_key_id || '')
    setRazorpaySecret(restaurantData.razorpay_secret || '')
    setEnableCounterPayment(
      restaurantData.enable_counter_payment ?? true
    )

    await refreshMenu()

    const { data: orderData } = await supabase
      .from('orders')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .order('created_at', { ascending: false })

    if (orderData) {
      setOrders(orderData)
    }
  }, [restaurantId, router, refreshMenu])

  useEffect(() => {
    if (!authChecked) return

    refreshDashboard()

    const interval = setInterval(() => {
      refreshDashboard()
    }, 4000)

    return () => clearInterval(interval)
  }, [authChecked, refreshDashboard])

  // -----------------------------
  // ORDER STATUS
  // -----------------------------

  const updateOrderStatus = async (orderId, status) => {
    const { error } = await supabase
      .from('orders')
      .update({ status })
      .eq('id', orderId)
      .eq('restaurant_id', restaurantId)

    if (error) {
      alert('Failed to update order: ' + error.message)
      return
    }

    setOrders(prev =>
      prev.map(order =>
        order.id === orderId
          ? { ...order, status }
          : order
      )
    )
  }

  // -----------------------------
  // ADD DISH
  // -----------------------------

  const resetAddForm = () => {
    setName('')
    setPrice('')
    setCategory('')
    setDescription('')
    setImageUrl('')
    setFoodType('veg')
    setReorderMode('auto')
  }

  const handleAddDish = async e => {
    e.preventDefault()

    if (!restaurant) return

    const currentPlan = restaurant.plan || 'Starter'
    const maxAllowed = planLimits[currentPlan] ?? 10

    if (menuItems.length >= maxAllowed) {
      alert(
        `⚠️ Limit Reached! Your ${currentPlan} plan allows a maximum of ${maxAllowed} menu items.`
      )
      return
    }

    if (!name.trim() || !price || !category.trim()) {
      alert('Please fill Item Name, Price and Category.')
      return
    }

    setLoading(true)

    const itemData = {
      restaurant_id: restaurant.id,
      name: name.trim(),
      price: Number(price),
      category: category.trim(),
      description: description.trim(),
      image_url: imageUrl.trim(),
      food_type: foodType,
      is_veg: foodType === 'veg',
      reorder_mode: reorderMode,
      is_available: true,
      order_count: 0
    }

    const { error } = await supabase
      .from('menu_items')
      .insert([itemData])

    if (error) {
      alert('Error adding item: ' + error.message)
    } else {
      alert('Dish added to your live menu! ✅')
      resetAddForm()
      await refreshMenu()
    }

    setLoading(false)
  }

  // -----------------------------
  // EDIT DISH
  // -----------------------------

  const openEditItem = item => {
    const currentFoodType =
      item.food_type ||
      (item.is_veg === false ? 'non-veg' : 'veg')

    setEditingItem(item)
    setEditName(item.name || '')
    setEditPrice(String(item.price ?? ''))
    setEditCategory(item.category || '')
    setEditDescription(item.description || '')
    setEditImageUrl(item.image_url || '')
    setEditFoodType(currentFoodType)
    setEditReorderMode(item.reorder_mode || 'auto')
    setEditAvailable(item.is_available !== false)
  }

  const closeEditItem = () => {
    setEditingItem(null)
    setEditName('')
    setEditPrice('')
    setEditCategory('')
    setEditDescription('')
    setEditImageUrl('')
    setEditFoodType('veg')
    setEditReorderMode('auto')
    setEditAvailable(true)
  }

  const handleEditItem = async e => {
    e.preventDefault()

    if (!editingItem) return

    if (
      !editName.trim() ||
      !editPrice ||
      !editCategory.trim()
    ) {
      alert('Please fill Item Name, Price and Category.')
      return
    }

    setSavingEdit(true)

    const updateData = {
      name: editName.trim(),
      price: Number(editPrice),
      category: editCategory.trim(),
      description: editDescription.trim(),
      image_url: editImageUrl.trim(),
      food_type: editFoodType,
      is_veg: editFoodType === 'veg',
      reorder_mode: editReorderMode,
      is_available: editAvailable
    }

    const { error } = await supabase
      .from('menu_items')
      .update(updateData)
      .eq('id', editingItem.id)
      .eq('restaurant_id', restaurantId)

    if (error) {
      alert('Failed to update item: ' + error.message)
    } else {
      alert('Menu item updated successfully! ✅')
      closeEditItem()
      await refreshMenu()
    }

    setSavingEdit(false)
  }

  // -----------------------------
  // AVAILABILITY
  // -----------------------------

  const toggleAvailability = async item => {
    const newValue = item.is_available === false

    const { error } = await supabase
      .from('menu_items')
      .update({
        is_available: newValue
      })
      .eq('id', item.id)
      .eq('restaurant_id', restaurantId)

    if (error) {
      alert(
        'Failed to update availability: ' +
          error.message
      )
      return
    }

    setMenuItems(prev =>
      prev.map(menuItem =>
        menuItem.id === item.id
          ? {
              ...menuItem,
              is_available: newValue
            }
          : menuItem
      )
    )
  }

  // -----------------------------
  // DELETE
  // -----------------------------

  const deleteItem = async item => {
    const confirmed = window.confirm(
      `Delete "${item.name}" from your menu?`
    )

    if (!confirmed) return

    const { error } = await supabase
      .from('menu_items')
      .delete()
      .eq('id', item.id)
      .eq('restaurant_id', restaurantId)

    if (error) {
      alert('Unable to delete item: ' + error.message)
      return
    }

    await refreshMenu()
  }

  // -----------------------------
  // SWIGGY
  // -----------------------------

  const handleSwiggySync = async e => {
    e.preventDefault()

    if (!swiggyDataInput.trim()) {
      alert('Please enter valid JSON.')
      return
    }

    setSyncingSwiggy(true)

    try {
      const parsedItems = JSON.parse(
        swiggyDataInput
      )

      if (!Array.isArray(parsedItems)) {
        throw new Error(
          'Input must be a JSON array.'
        )
      }

      const formattedItems = parsedItems.map(item => {
        const currentFoodType =
          item.food_type ||
          (item.is_veg === false
            ? 'non-veg'
            : 'veg')

        return {
          restaurant_id: restaurant.id,
          name: item.name || 'Swiggy Item',
          price: Number(item.price || 100),
          category:
            item.category || 'Swiggy Sync',
          description: item.description || '',
          image_url: item.image_url || '',
          food_type: currentFoodType,
          is_veg: currentFoodType === 'veg',
          reorder_mode:
            item.reorder_mode || 'auto',
          is_available: true,
          order_count: Number(
            item.order_count || 0
          )
        }
      })

      const { error } = await supabase
        .from('menu_items')
        .insert(formattedItems)

      if (error) {
        throw new Error(error.message)
      }

      alert(
        `Successfully synced ${formattedItems.length} items! ✅`
      )

      setSwiggyDataInput('')
      await refreshMenu()
    } catch (error) {
      alert(
        'Sync Failed: ' + error.message
      )
    }

    setSyncingSwiggy(false)
  }

  // -----------------------------
  // PAYMENT
  // -----------------------------

  const handleSavePaymentSettings = async e => {
    e.preventDefault()

    setSavingPayment(true)

    const { error } = await supabase
      .from('restaurants')
      .update({
        razorpay_key_id:
          razorpayKeyId.trim(),
        razorpay_secret:
          razorpaySecret.trim(),
        enable_counter_payment:
          enableCounterPayment
      })
      .eq('id', restaurantId)

    if (error) {
      alert(
        'Failed to update payment settings: ' +
          error.message
      )
    } else {
      alert(
        'Payment settings updated successfully! ✅'
      )
    }

    setSavingPayment(false)
  }

  // -----------------------------
  // TABS
  // -----------------------------

  const handleTabSwitch = tabId => {
    if (
      tabId === 'gateway' &&
      restaurant?.plan === 'Starter'
    ) {
      alert(
        '🔒 Payment Gateway is locked on the Starter plan. Please upgrade.'
      )
      return
    }

    setActiveTab(tabId)
  }

  // -----------------------------
  // LOGOUT
  // -----------------------------

  const handleLogout = async () => {
    localStorage.removeItem(
      'digital_dining_restaurant_id'
    )

    await supabase.auth.signOut()

    router.replace('/login')
  }

  // -----------------------------
  // METRICS
  // -----------------------------

  const totalRevenue = orders.reduce(
    (sum, order) =>
      sum +
      (order.status !== 'cancelled'
        ? Number(order.total_amount || 0)
        : 0),
    0
  )

  const activeOrders = orders.filter(order =>
    ['pending', 'preparing', 'paid'].includes(
      order.status
    )
  )

  const todayString = new Date()
    .toISOString()
    .split('T')[0]

  const todaysOrders = orders.filter(
    order =>
      order.created_at?.split('T')[0] ===
      todayString
  )

  const currentPlan =
    restaurant?.plan || 'Starter'

  const maxMenuAllowed =
    planLimits[currentPlan] ?? 10

  // -----------------------------
  // LOADING
  // -----------------------------

  if (!authChecked || !restaurant) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center text-white gap-3">
        <div className="w-8 h-8 border-[3px] border-orange-500 border-t-transparent rounded-full animate-spin" />

        <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">
          Loading Partner Portal...
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans pb-16">

      {/* HEADER */}
      <header className="bg-neutral-900 border-b border-neutral-800 sticky top-0 z-30 px-6 py-4">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">

          <div className="flex items-center gap-3">

            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-orange-500 to-amber-500 flex items-center justify-center font-black text-xl">
              {restaurant.name?.charAt(0)?.toUpperCase()}
            </div>

            <div>
              <div className="flex items-center gap-2 flex-wrap">

                <h1 className="text-lg font-black text-white">
                  {restaurant.name}
                </h1>

                <button
                  type="button"
                  onClick={() =>
                    setIsStoreOpen(
                      prev => !prev
                    )
                  }
                  className={`text-[10px] font-black px-2.5 py-1 rounded-full border ${
                    isStoreOpen
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-red-500/10 text-red-400 border-red-500/30'
                  }`}
                >
                  ●{' '}
                  {isStoreOpen
                    ? 'Accepting Orders'
                    : 'Store Paused'}
                </button>
              </div>

              <p className="text-[11px] text-neutral-400 font-mono">
                Unique URL ID: {restaurant.id}
              </p>
            </div>
          </div>

          <div className="flex gap-3 flex-wrap">

            <button
              type="button"
              onClick={() =>
                router.push(
                  `/dashboard/${restaurant.id}/qr`
                )
              }
              className="bg-neutral-800 border border-neutral-700 text-white font-bold px-4 py-2.5 rounded-xl text-xs"
            >
              📷 Table QR Codes
            </button>

            <button
              type="button"
              onClick={handleLogout}
              className="bg-red-500/10 border border-red-500/30 text-red-400 font-bold px-4 py-2.5 rounded-xl text-xs"
            >
              Log Out ⎋
            </button>

          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 mt-6 space-y-6">

        {/* METRICS */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">

          <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-3xl">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
              Total Revenue
            </p>
            <p className="text-2xl font-black text-white mt-1">
              ₹{totalRevenue}
            </p>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-3xl">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
              Orders Today
            </p>
            <p className="text-2xl font-black text-emerald-400 mt-1">
              {todaysOrders.length}
            </p>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-3xl">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
              Live Kitchen Queue
            </p>
            <p className="text-2xl font-black text-orange-400 mt-1">
              {activeOrders.length}
            </p>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-3xl">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
              Partner Tier
            </p>
            <p className="text-2xl font-black text-amber-400 mt-1">
              {currentPlan}
            </p>
          </div>

        </div>

        {/* TABS */}
        <div className="flex gap-2 border-b border-neutral-800 pb-3 overflow-x-auto">

          {[
            [
              'orders',
              `🔥 Live Orders (${orders.length})`
            ],
            [
              'menu',
              `🍔 Menu Catalog (${menuItems.length}/${maxMenuAllowed})`
            ],
            [
              'swiggy-sync',
              '🟠 Swiggy Sync'
            ],
            [
              'gateway',
              '💳 Payment Gateway'
            ],
            [
              'settlements',
              '💰 Settlements'
            ]
          ].map(([id, label]) => (
            <button
              type="button"
              key={id}
              onClick={() =>
                handleTabSwitch(id)
              }
              className={`px-5 py-2.5 rounded-2xl text-xs font-black whitespace-nowrap ${
                activeTab === id
                  ? 'bg-orange-500 text-white'
                  : 'bg-neutral-900 text-neutral-400 border border-neutral-800'
              }`}
            >
              {label}
            </button>
          ))}

        </div>

        {/* ORDERS */}
        {activeTab === 'orders' && (
          <section className="space-y-4">

            <h2 className="text-lg font-black text-white">
              Live Kitchen Orders Queue
            </h2>

            {orders.length === 0 ? (
              <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-16 text-center">

                <div className="text-4xl">
                  🛎️
                </div>

                <p className="font-bold mt-2">
                  No orders in queue
                </p>

              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {orders.map(order => (
                  <div
                    key={order.id}
                    className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 space-y-4"
                  >

                    <div>

                      <div className="flex justify-between gap-2">

                        <div className="flex gap-2 flex-wrap">

                          <span className="bg-orange-500 px-3 py-1 rounded-xl text-xs font-black">
                            Order #
                            {order.order_number ||
                              '1'}
                          </span>

                          <span className="bg-neutral-800 border border-neutral-700 px-3 py-1 rounded-xl text-xs font-bold">
                            Table{' '}
                            {order.table_number ||
                              '1'}
                          </span>

                        </div>

                        <span className="text-[10px] text-amber-400 font-black uppercase">
                          {order.payment_mode ||
                            'Online'}{' '}
                          • {order.status}
                        </span>

                      </div>

                      <div className="mt-3 bg-neutral-950 px-4 py-2.5 rounded-xl text-xs flex justify-between gap-3 flex-wrap">

                        <span>
                          Customer:{' '}
                          <b className="text-white">
                            {order.customer_name ||
                              'Guest'}
                          </b>
                        </span>

                        <span className="text-orange-400">
                          📞{' '}
                          {order.customer_mobile ||
                            'N/A'}
                        </span>

                      </div>

                      <div className="mt-2 space-y-2 bg-neutral-950 p-4 rounded-2xl">

                        {Array.isArray(
                          order.items
                        ) &&
                          order.items.map(
                            (item, index) => {
                              const qty =
                                Number(
                                  item.quantity ||
                                    item.qty ||
                                    1
                                )

                              const itemTotal =
                                Number(
                                  item.price || 0
                                ) * qty

                              return (
                                <div
                                  key={index}
                                  className="flex justify-between text-sm"
                                >
                                  <span>
                                    • {item.name}{' '}
                                    <b className="text-orange-400">
                                      ×{qty}
                                    </b>
                                  </span>

                                  <span>
                                    ₹{itemTotal}
                                  </span>
                                </div>
                              )
                            }
                          )}

                      </div>

                    </div>

                    <div className="border-t border-neutral-800 pt-4 flex justify-between items-center gap-3">

                      <p className="text-lg font-black text-emerald-400">
                        ₹
                        {Number(
                          order.total_amount || 0
                        )}
                      </p>

                      <div className="flex gap-2 flex-wrap">

                        {![
                          'preparing',
                          'completed',
                          'cancelled'
                        ].includes(
                          order.status
                        ) && (
                          <button
                            type="button"
                            onClick={() =>
                              updateOrderStatus(
                                order.id,
                                'preparing'
                              )
                            }
                            className="bg-amber-500/10 border border-amber-500/30 text-amber-400 text-xs font-bold px-4 py-2 rounded-xl"
                          >
                            Accept & Prepare
                          </button>
                        )}

                        {![
                          'completed',
                          'cancelled'
                        ].includes(
                          order.status
                        ) && (
                          <button
                            type="button"
                            onClick={() =>
                              updateOrderStatus(
                                order.id,
                                'completed'
                              )
                            }
                            className="bg-emerald-600 text-white text-xs font-bold px-4 py-2 rounded-xl"
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

          </section>
        )}

        {/* MENU */}
        {activeTab === 'menu' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* ADD */}
            <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-3xl h-fit">

              <div className="flex justify-between mb-4">

                <h2 className="font-black text-white">
                  Add New Dish
                </h2>

                <span className="text-[10px] text-neutral-400">
                  {menuItems.length}/
                  {maxMenuAllowed}
                </span>

              </div>

              <form
                onSubmit={handleAddDish}
                className="space-y-4"
              >

                <div>
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                    Item Name
                  </label>

                  <input
                    type="text"
                    value={name}
                    onChange={e =>
                      setName(e.target.value)
                    }
                    placeholder="Paneer Tikka"
                    required
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                    Price (₹)
                  </label>

                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={price}
                    onChange={e =>
                      setPrice(e.target.value)
                    }
                    placeholder="250"
                    required
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                    Category
                  </label>

                  <input
                    type="text"
                    value={category}
                    onChange={e =>
                      setCategory(e.target.value)
                    }
                    placeholder="Starter"
                    required
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                    Description
                  </label>

                  <textarea
                    rows="3"
                    value={description}
                    onChange={e =>
                      setDescription(
                        e.target.value
                      )
                    }
                    placeholder="Dish description..."
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white resize-none"
                  />
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                    Food Type
                  </label>

                  <select
                    value={foodType}
                    onChange={e =>
                      setFoodType(
                        e.target.value
                      )
                    }
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white"
                  >
                    <option value="veg">
                      🟢 Veg
                    </option>
                    <option value="non-veg">
                      🔴 Non-Veg
                    </option>
                    <option value="egg">
                      🥚 Egg
                    </option>
                    <option value="beverage">
                      🥤 Beverage
                    </option>
                    <option value="other">
                      Other
                    </option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                    Highly Reordered
                  </label>

                  <select
                    value={reorderMode}
                    onChange={e =>
                      setReorderMode(
                        e.target.value
                      )
                    }
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white"
                  >
                    <option value="auto">
                      🤖 Auto
                    </option>
                    <option value="on">
                      ⭐ Always Show
                    </option>
                    <option value="off">
                      🚫 Never Show
                    </option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                    Image URL
                  </label>

                  <input
                    type="url"
                    value={imageUrl}
                    onChange={e =>
                      setImageUrl(
                        e.target.value
                      )
                    }
                    placeholder="https://..."
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-3.5 rounded-xl"
                >
                  {loading
                    ? 'Publishing...'
                    : '+ Publish Dish'}
                </button>

              </form>
            </div>

            {/* CATALOG */}
            <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-3xl md:col-span-2">

              <div className="flex justify-between mb-4">

                <h2 className="font-black text-white">
                  Active Catalog (
                  {menuItems.length})
                </h2>

                <button
                  type="button"
                  onClick={refreshMenu}
                  className="text-xs text-orange-400"
                >
                  Refresh ↻
                </button>

              </div>

              {menuItems.length === 0 ? (
                <p className="text-center text-neutral-500 py-10">
                  No menu items added yet.
                </p>
              ) : (
                <div className="space-y-3">

                  {menuItems.map(item => {

                    const currentFoodType =
                      item.food_type ||
                      (item.is_veg === false
                        ? 'non-veg'
                        : 'veg')

                    const reorderLabel =
                      item.reorder_mode === 'on'
                        ? '⭐ Always'
                        : item.reorder_mode ===
                            'off'
                          ? '🚫 Never'
                          : '🤖 Auto'

                    return (
                      <div
                        key={item.id}
                        className={`bg-neutral-950 border p-4 rounded-2xl ${
                          item.is_available ===
                          false
                            ? 'border-red-500/30 opacity-70'
                            : 'border-neutral-800'
                        }`}
                      >

                        <div className="flex flex-col sm:flex-row justify-between gap-4">

                          <div className="flex gap-3">

                            {item.image_url ? (
                              <img
                                src={
                                  item.image_url
                                }
                                alt={
                                  item.name
                                }
                                className="w-16 h-16 rounded-xl object-cover"
                              />
                            ) : (
                              <div className="w-16 h-16 rounded-xl bg-neutral-900 flex items-center justify-center text-2xl">
                                🍽️
                              </div>
                            )}

                            <div>

                              <div className="flex flex-wrap gap-2 items-center">

                                <h3 className="font-bold text-sm text-white">
                                  {item.name}
                                </h3>

                                <span className="text-[9px] bg-neutral-800 px-2 py-1 rounded-full">
                                  {foodLabels[
                                    currentFoodType
                                  ] || 'Other'}
                                </span>

                              </div>

                              <p className="text-[10px] text-orange-400 font-bold">
                                {item.category}
                              </p>

                              {item.description && (
                                <p className="text-xs text-neutral-500 mt-1 max-w-xl">
                                  {
                                    item.description
                                  }
                                </p>
                              )}

                              <div className="flex flex-wrap gap-2 mt-2">

                                <span className="text-[9px] bg-neutral-900 border border-neutral-800 px-2 py-1 rounded-lg">
                                  {reorderLabel}
                                </span>

                                <span className="text-[9px] bg-neutral-900 border border-neutral-800 px-2 py-1 rounded-lg">
                                  Orders:{' '}
                                  {Number(
                                    item.order_count ||
                                      0
                                  )}
                                </span>

                                <span className="text-[9px] bg-neutral-900 border border-neutral-800 px-2 py-1 rounded-lg">
                                  {item.is_available ===
                                  false
                                    ? 'Unavailable'
                                    : 'Available'}
                                </span>

                              </div>

                            </div>

                          </div>

                          <div className="flex flex-col sm:items-end gap-3">

                            <span className="font-black text-emerald-400 text-sm">
                              ₹{item.price}
                            </span>

                            <div className="flex gap-2 flex-wrap">

                              <button
                                type="button"
                                onClick={() =>
                                  toggleAvailability(
                                    item
                                  )
                                }
                                className="bg-neutral-800 text-[10px] font-bold px-3 py-2 rounded-lg"
                              >
                                {item.is_available ===
                                false
                                  ? 'Enable'
                                  : 'Disable'}
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  openEditItem(
                                    item
                                  )
                                }
                                className="bg-orange-500/10 border border-orange-500/30 text-orange-400 text-[10px] font-bold px-3 py-2 rounded-lg"
                              >
                                ✏️ Edit
                              </button>

                              <button
                                type="button"
                                onClick={() =>
                                  deleteItem(
                                    item
                                  )
                                }
                                className="bg-red-500/10 border border-red-500/30 text-red-400 text-[10px] font-bold px-3 py-2 rounded-lg"
                              >
                                Delete
                              </button>

                            </div>

                          </div>

                        </div>

                      </div>
                    )
                  })}

                </div>
              )}

            </div>

          </div>
        )}

        {/* SWIGGY */}
        {activeTab === 'swiggy-sync' && (
          <div className="bg-neutral-900 border border-neutral-800 p-8 rounded-3xl max-w-xl mx-auto space-y-5">

            <div className="text-center">
              <span className="text-[10px] text-orange-400 uppercase tracking-widest">
                Swiggy Integration
              </span>

              <h2 className="text-xl font-black text-white mt-2">
                Sync Swiggy Menu Directly
              </h2>
            </div>

            <form
              onSubmit={handleSwiggySync}
              className="space-y-4"
            >

              <textarea
                rows="10"
                value={swiggyDataInput}
                onChange={e =>
                  setSwiggyDataInput(
                    e.target.value
                  )
                }
                placeholder={`[
  {
    "name": "Chicken Biryani",
    "price": 320,
    "category": "Main Course",
    "description": "Chicken biryani",
    "food_type": "non-veg",
    "reorder_mode": "auto",
    "image_url": "https://..."
  }
]`}
                required
                className="w-full bg-neutral-950 text-white font-mono text-xs border border-neutral-800 rounded-xl p-4"
              />

              <button
                type="submit"
                disabled={syncingSwiggy}
                className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-3.5 rounded-xl"
              >
                {syncingSwiggy
                  ? 'Syncing...'
                  : 'Sync Swiggy Menu Now 🔄'}
              </button>

            </form>
          </div>
        )}

        {/* PAYMENT */}
        {activeTab === 'gateway' && (
          <div className="bg-neutral-900 border border-neutral-800 p-8 rounded-3xl max-w-xl mx-auto space-y-5">

            <div className="text-center">
              <span className="text-[10px] text-emerald-400 uppercase tracking-widest">
                Payment Gateway
              </span>

              <h2 className="text-xl font-black text-white mt-2">
                Manage Payment Gateway
              </h2>
            </div>

            <form
              onSubmit={
                handleSavePaymentSettings
              }
              className="space-y-4"
            >

              <input
                type="text"
                value={razorpayKeyId}
                onChange={e =>
                  setRazorpayKeyId(
                    e.target.value
                  )
                }
                placeholder="Razorpay Key ID"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white"
              />

              <input
                type="password"
                value={razorpaySecret}
                onChange={e =>
                  setRazorpaySecret(
                    e.target.value
                  )
                }
                placeholder="Razorpay Key Secret"
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white"
              />

              <label className="flex items-center justify-between bg-neutral-950 p-4 rounded-2xl border border-neutral-800 text-xs font-bold">

                <span>
                  Enable Pay at Counter
                </span>

                <input
                  type="checkbox"
                  checked={
                    enableCounterPayment
                  }
                  onChange={e =>
                    setEnableCounterPayment(
                      e.target.checked
                    )
                  }
                  className="w-5 h-5 accent-orange-500"
                />

              </label>

              <button
                type="submit"
                disabled={savingPayment}
                className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-3.5 rounded-xl"
              >
                {savingPayment
                  ? 'Saving...'
                  : 'Save Payment Settings 💾'}
              </button>

            </form>
          </div>
        )}

        {/* SETTLEMENTS */}
        {activeTab === 'settlements' && (
          <div className="bg-neutral-900 border border-neutral-800 p-8 rounded-3xl max-w-xl mx-auto text-center space-y-4">

            <h2 className="text-xl font-black text-white">
              Partner Settlements
            </h2>

            <div className="bg-neutral-950 border border-neutral-800 p-6 rounded-2xl">

              <p className="text-xs text-neutral-500 uppercase">
                Available Payout Balance
              </p>

              <p className="text-3xl font-black text-emerald-400 mt-2">
                ₹{totalRevenue}
              </p>

            </div>

            <button
              type="button"
              onClick={() =>
                alert(
                  'Payout requested successfully!'
                )
              }
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3.5 rounded-xl"
            >
              Request Bank Payout
            </button>

          </div>
        )}

      </main>

      {/* EDIT MODAL */}
      {editingItem && (
        <div className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4">

          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-neutral-900 border border-neutral-800 rounded-3xl">

            <div className="flex justify-between items-center px-6 py-5 border-b border-neutral-800">

              <div>
                <h2 className="font-black text-lg text-white">
                  Edit Menu Item
                </h2>

                <p className="text-xs text-neutral-500">
                  Update dish details
                </p>
              </div>

              <button
                type="button"
                onClick={closeEditItem}
                className="w-9 h-9 rounded-xl bg-neutral-800 text-white text-lg"
              >
                ×
              </button>

            </div>

            <form
              onSubmit={handleEditItem}
              className="p-6 space-y-4"
            >

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

                <input
                  type="text"
                  value={editName}
                  onChange={e =>
                    setEditName(
                      e.target.value
                    )
                  }
                  placeholder="Item Name"
                  required
                  className="md:col-span-2 w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white"
                />

                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={editPrice}
                  onChange={e =>
                    setEditPrice(
                      e.target.value
                    )
                  }
                  placeholder="Price"
                  required
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white"
                />

                <input
                  type="text"
                  value={editCategory}
                  onChange={e =>
                    setEditCategory(
                      e.target.value
                    )
                  }
                  placeholder="Category"
                  required
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white"
                />

                <textarea
                  rows="4"
                  value={editDescription}
                  onChange={e =>
                    setEditDescription(
                      e.target.value
                    )
                  }
                  placeholder="Description"
                  className="md:col-span-2 w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white resize-none"
                />

                <select
                  value={editFoodType}
                  onChange={e =>
                    setEditFoodType(
                      e.target.value
                    )
                  }
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white"
                >
                  <option value="veg">
                    🟢 Veg
                  </option>
                  <option value="non-veg">
                    🔴 Non-Veg
                  </option>
                  <option value="egg">
                    🥚 Egg
                  </option>
                  <option value="beverage">
                    🥤 Beverage
                  </option>
                  <option value="other">
                    Other
                  </option>
                </select>

                <select
                  value={editReorderMode}
                  onChange={e =>
                    setEditReorderMode(
                      e.target.value
                    )
                  }
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white"
                >
                  <option value="auto">
                    🤖 Auto
                  </option>
                  <option value="on">
                    ⭐ Always Show
                  </option>
                  <option value="off">
                    🚫 Never Show
                  </option>
                </select>

                <input
                  type="url"
                  value={editImageUrl}
                  onChange={e =>
                    setEditImageUrl(
                      e.target.value
                    )
                  }
                  placeholder="Image URL"
                  className="md:col-span-2 w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-sm text-white"
                />

              </div>

              <label className="flex items-center justify-between bg-neutral-950 border border-neutral-800 p-4 rounded-2xl text-sm font-bold text-white">

                <span>Item Available</span>

                <input
                  type="checkbox"
                  checked={editAvailable}
                  onChange={e =>
                    setEditAvailable(
                      e.target.checked
                    )
                  }
                  className="w-5 h-5 accent-orange-500"
                />

              </label>

              <div className="flex gap-3">

                <button
                  type="button"
                  onClick={closeEditItem}
                  className="flex-1 bg-neutral-800 text-white font-bold py-3 rounded-xl"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={savingEdit}
                  className="flex-1 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-3 rounded-xl"
                >
                  {savingEdit
                    ? 'Saving...'
                    : 'Save Changes ✅'}
                </button>

              </div>

            </form>
          </div>
        </div>
      )}

    </div>
  )
}