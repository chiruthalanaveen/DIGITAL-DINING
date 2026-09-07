'use client'
import { useEffect, useState, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// Real-Time Restaurant Chat Widget Component
function RestaurantChatWidget({ restaurantId }) {
  const [isOpen, setIsOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState('')
  const chatEndRef = useRef(null)

  useEffect(() => {
    if (!isOpen || !restaurantId) return

    const fetchMessages = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: true })

      if (!error && data) setMessages(data)
    }

    fetchMessages()

    // Real-time subscription for this specific restaurant chat room
    const channel = supabase
      .channel(`restaurant-live-chat-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `restaurant_id=eq.${restaurantId}`
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new])
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [isOpen, restaurantId])

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const handleSendMessage = async (e) => {
    e.preventDefault()
    if (!newMessage.trim() || !restaurantId) return

    const messageText = newMessage.trim()
    setNewMessage('')

    await supabase.from('messages').insert([
      {
        restaurant_id: restaurantId,
        sender: 'restaurant',
        message: messageText
      }
    ])
  }

  return (
    <div className="fixed bottom-6 right-6 z-50 font-sans">
      {!isOpen ? (
        <button
          onClick={() => setIsOpen(true)}
          className="bg-orange-500 hover:bg-orange-600 text-white font-black p-4 rounded-full shadow-2xl flex items-center space-x-2 transition transform hover:scale-105"
        >
          <span>💬</span>
          <span className="text-xs uppercase tracking-wider pr-1">Support Chat</span>
        </button>
      ) : (
        <div className="bg-neutral-900 border border-neutral-800 rounded-3xl w-80 sm:w-96 h-[450px] shadow-2xl flex flex-col overflow-hidden">
          <div className="bg-neutral-950 p-4 border-b border-neutral-800 flex justify-between items-center">
            <div className="flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <h3 className="text-xs font-black text-white uppercase tracking-wider">
                Restaurant Support
              </h3>
            </div>

            <button
              onClick={() => setIsOpen(false)}
              className="text-neutral-400 hover:text-white font-bold text-sm px-2 py-1"
            >
              ✕
            </button>
          </div>

          <div className="flex-1 p-4 overflow-y-auto space-y-3 bg-neutral-950/50">
            {messages.length === 0 ? (
              <p className="text-center text-xs text-neutral-500 mt-12">
                No messages yet. Send a message to start chatting!
              </p>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex ${
                    msg.sender === 'restaurant'
                      ? 'justify-end'
                      : 'justify-start'
                  }`}
                >
                  <div
                    className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-xs ${
                      msg.sender === 'restaurant'
                        ? 'bg-orange-500 text-white rounded-br-none'
                        : 'bg-neutral-800 text-neutral-200 rounded-bl-none border border-neutral-700'
                    }`}
                  >
                    {msg.message}
                  </div>
                </div>
              ))
            )}

            <div ref={chatEndRef} />
          </div>

          <form
            onSubmit={handleSendMessage}
            className="p-3 bg-neutral-950 border-t border-neutral-800 flex space-x-2"
          >
            <input
              type="text"
              placeholder="Type your message..."
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              className="flex-1 bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5 text-white text-xs focus:outline-none focus:border-orange-500"
            />

            <button
              type="submit"
              className="bg-orange-500 hover:bg-orange-600 text-white font-black px-4 py-2.5 rounded-xl text-xs transition"
            >
              Send
            </button>
          </form>
        </div>
      )}
    </div>
  )
}

export default function RestaurantDashboard() {
  const params = useParams()
  const restaurantId = params.id || params.restaurantId
  const router = useRouter()

  const [restaurant, setRestaurant] = useState(null)
  const [authChecked, setAuthChecked] = useState(false)
  const [menuItems, setMenuItems] = useState([])
  const [orders, setOrders] = useState([])
  const [activeTab, setActiveTab] = useState('orders')
  const [isStoreOpen, setIsStoreOpen] = useState(true)

  // Add Dish Form States
  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [category, setCategory] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [description, setDescription] = useState('')
  const [foodType, setFoodType] = useState('veg')
  const [reorderMode, setReorderMode] = useState('auto')
  const [addons, setAddons] = useState([''])
  const [loading, setLoading] = useState(false)

  // Full menu item editing states
  const [editingMenuItemId, setEditingMenuItemId] = useState(null)
  const [editItemName, setEditItemName] = useState('')
  const [editItemPrice, setEditItemPrice] = useState('')
  const [editItemCategory, setEditItemCategory] = useState('')
  const [editItemDescription, setEditItemDescription] = useState('')
  const [editItemImageUrl, setEditItemImageUrl] = useState('')
  const [editItemFoodType, setEditItemFoodType] = useState('veg')
  const [editItemReorderMode, setEditItemReorderMode] = useState('auto')
  const [editItemAddons, setEditItemAddons] = useState([''])
  const [savingMenuItem, setSavingMenuItem] = useState(false)

  // Staff Management States
  const [staffList, setStaffList] = useState([])
  const [staffName, setStaffName] = useState('')
  const [staffUserId, setStaffUserId] = useState('')
  const [staffPassword, setStaffPassword] = useState('')
  const [staffRole, setStaffRole] = useState('waiter')
  const [addingStaff, setAddingStaff] = useState(false)

  // Tax & Packing Charge Configuration States
  const [sgstRate, setSgstRate] = useState(2.5)
  const [cgstRate, setCgstRate] = useState(2.5)
  const [packingCharge, setPackingCharge] = useState(20)
  const [savingTaxes, setSavingTaxes] = useState(false)

  // Inline Price Editing State (Pro+ Only)
  const [editingItemId, setEditingItemId] = useState(null)
  const [editPriceValue, setEditPriceValue] = useState('')

  // Payment Gateway Configuration States & Edit Toggle
  const [razorpayKeyId, setRazorpayKeyId] = useState('')
  const [razorpaySecret, setRazorpaySecret] = useState('')
  const [enableCounterPayment, setEnableCounterPayment] = useState(true)
  const [savingPayment, setSavingPayment] = useState(false)
  const [hasInitializedKeys, setHasInitializedKeys] = useState(false)
  const [isGatewayEditable, setIsGatewayEditable] = useState(false)

  // Swiggy Sync States (Pro & Pro+ Only)
  const [swiggyDataInput, setSwiggyDataInput] = useState('')
  const [syncingSwiggy, setSyncingSwiggy] = useState(false)

  // Reports Timeframe State
  const [reportTimeframe, setReportTimeframe] = useState('daily')

  // Audio Alarm Reference for Pro+ real-time order sound
  const audioRef = useRef(null)
  const prevOrdersLengthRef = useRef(0)

  // Plan limit mapping
  const planLimits = {
    Standard: 20,
    Pro: 50,
    'Pro+': Infinity
  }

  const currentPlan = restaurant?.plan || 'Standard'
  const maxMenuAllowed = planLimits[currentPlan] || 20

  // SECURITY: The restaurant ID in the URL is not authentication.
  // The authenticated Supabase user must own the dashboard being opened.
  useEffect(() => {
    let cancelled = false

    const verifyDashboardAccess = async () => {
      if (!restaurantId) {
        router.replace('/login')
        return
      }

      const {
        data: { user },
        error
      } = await supabase.auth.getUser()

      if (error || !user) {
        if (!cancelled) router.replace('/login')
        return
      }

      if (String(user.id) !== String(restaurantId)) {
        await supabase.auth.signOut()
        if (!cancelled) router.replace('/login')
        return
      }

      if (!cancelled) setAuthChecked(true)
    }

    verifyDashboardAccess()

    const { data: authListener } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'SIGNED_OUT' || !session?.user) {
          router.replace('/login')
        }
      }
    )

    return () => {
      cancelled = true
      authListener?.subscription?.unsubscribe()
    }
  }, [restaurantId, router])

  useEffect(() => {
    async function fetchDashboard() {
      if (!authChecked || !restaurantId) return

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

      const { data: restData, error } = await supabase
        .from('restaurants')
        .select('*')
        .eq('id', restaurantId)
        .maybeSingle()

      if (error || !restData) {
        router.replace('/login')
        return
      }

      setRestaurant(restData)

      if (!hasInitializedKeys && !savingPayment) {
        const keyId = restData.razorpay_key_id || ''
        const keySec = restData.razorpay_secret || ''

        setRazorpayKeyId(keyId)
        setRazorpaySecret(keySec)
        setEnableCounterPayment(
          restData.enable_counter_payment ?? true
        )
        setSgstRate(restData.sgst_rate ?? 2.5)
        setCgstRate(restData.cgst_rate ?? 2.5)
        setPackingCharge(restData.packing_charge ?? 20)
        setHasInitializedKeys(true)

        if (keyId || keySec) {
          setIsGatewayEditable(false)
        } else {
          setIsGatewayEditable(true)
        }
      }

      const { data: menuData } = await supabase
        .from('menu_items')
        .select('*')
        .eq('restaurant_id', restaurantId)

      if (menuData) setMenuItems(menuData)

      const { data: staffData } = await supabase
        .from('staff_users')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false })

      if (staffData) setStaffList(staffData)

      const { data: orderData } = await supabase
        .from('orders')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: false })

      if (orderData) {
        if (
          currentPlan === 'Pro+' &&
          orderData.length > prevOrdersLengthRef.current &&
          prevOrdersLengthRef.current > 0
        ) {
          if (audioRef.current) {
            audioRef.current
              .play()
              .catch((e) =>
                console.log('Audio play blocked:', e)
              )
          }
        }

        prevOrdersLengthRef.current = orderData.length
        setOrders(orderData)
      }
    }

    fetchDashboard()

    const interval = setInterval(fetchDashboard, 2000)

    return () => clearInterval(interval)
  }, [
    authChecked,
    restaurantId,
    router,
    currentPlan,
    hasInitializedKeys,
    savingPayment
  ])

  const updateOrderStatus = async (orderId, newStatus) => {
    setOrders(
      orders.map((o) =>
        o.id === orderId
          ? { ...o, status: newStatus }
          : o
      )
    )

    await supabase
      .from('orders')
      .update({ status: newStatus })
      .eq('id', orderId)
  }

  const toggleItemAvailability = async (
    itemId,
    currentAvailability
  ) => {
    if (currentPlan !== 'Pro+') {
      alert(
        '🔒 Item availability toggle is restricted to Pro+ plan members.'
      )
      return
    }

    const updatedStatus = !currentAvailability

    setMenuItems(
      menuItems.map((item) =>
        item.id === itemId
          ? { ...item, is_available: updatedStatus }
          : item
      )
    )

    const { error } = await supabase
      .from('menu_items')
      .update({ is_available: updatedStatus })
      .eq('id', itemId)

    if (error) {
      alert(
        'Failed to update availability: ' + error.message
      )
    }
  }

  const handleSaveItemPrice = async (itemId) => {
    if (currentPlan !== 'Pro+') {
      alert(
        '🔒 Price modification is exclusive to the Pro+ tier.'
      )
      setEditingItemId(null)
      return
    }

    const newPrice = parseFloat(editPriceValue)

    if (isNaN(newPrice) || newPrice <= 0) {
      alert('Please enter a valid price.')
      return
    }

    setMenuItems(
      menuItems.map((item) =>
        item.id === itemId
          ? { ...item, price: newPrice }
          : item
      )
    )

    setEditingItemId(null)

    const { error } = await supabase
      .from('menu_items')
      .update({ price: newPrice })
      .eq('id', itemId)

    if (error) {
      alert('Failed to update price: ' + error.message)
    } else {
      alert('Dish price modified successfully! ✅')
    }
  }

  // Calculates how many units of a menu item appear in orders.
  // Supports item.id, item.menu_item_id and item.name matching.
  const getItemOrderCount = (menuItem, orderList = orders) => {
    if (!menuItem || !Array.isArray(orderList)) return 0

    return orderList.reduce((total, order) => {
      if (
        order?.status === 'cancelled' ||
        !Array.isArray(order?.items)
      ) {
        return total
      }

      return (
        total +
        order.items.reduce((itemTotal, orderedItem) => {
          const sameId =
            orderedItem?.id &&
            menuItem?.id &&
            String(orderedItem.id) ===
              String(menuItem.id)

          const sameMenuItemId =
            orderedItem?.menu_item_id &&
            menuItem?.id &&
            String(orderedItem.menu_item_id) ===
              String(menuItem.id)

          const sameName =
            orderedItem?.name &&
            menuItem?.name &&
            String(orderedItem.name)
              .trim()
              .toLowerCase() ===
              String(menuItem.name)
                .trim()
                .toLowerCase()

          if (sameId || sameMenuItemId || sameName) {
            return (
              itemTotal +
              Number(
                orderedItem?.qty ||
                  orderedItem?.quantity ||
                  1
              )
            )
          }

          return itemTotal
        }, 0)
      )
    }, 0)
  }

  // Automatic badge:
  // - Looks at actual non-cancelled orders
  // - Considers the top 25% of ordered items
  // - Requires at least 5 units ordered
  const getAutomaticHighlyReorderedIds = (
    items = menuItems
  ) => {
    const ranked = items
      .map((item) => ({
        id: item.id,
        count: getItemOrderCount(item)
      }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count)

    if (ranked.length === 0) return new Set()

    const topCount = Math.max(
      1,
      Math.ceil(ranked.length * 0.25)
    )

    const threshold =
      ranked[topCount - 1]?.count || 0

    return new Set(
      ranked
        .filter(
          (item) =>
            item.count >= Math.max(5, threshold)
        )
        .map((item) => item.id)
    )
  }

  const isItemHighlyReordered = (
    item,
    automaticIds
  ) => {
    if (!item) return false

    const mode = item.reorder_mode || 'auto'

    if (mode === 'on') return true

    if (mode === 'off') return false

    return automaticIds.has(item.id)
  }

  const getFoodTypeLabel = (type) => {
    const labels = {
      veg: 'Veg',
      'non-veg': 'Non-Veg',
      egg: 'Egg',
      beverage: 'Beverage',
      other: 'Other'
    }

    return labels[type] || 'Other'
  }

  const getFoodTypeClasses = (type) => {
    const classes = {
      veg: 'bg-emerald-500',
      'non-veg': 'bg-red-500',
      egg: 'bg-amber-400',
      beverage: 'bg-sky-400',
      other: 'bg-neutral-400'
    }

    return classes[type] || classes.other
  }

  const startEditingMenuItem = (item) => {
    setEditingMenuItemId(item.id)

    setEditItemName(item.name || '')
    setEditItemPrice(item.price ?? '')
    setEditItemCategory(item.category || '')
    setEditItemDescription(item.description || '')
    setEditItemImageUrl(item.image_url || '')

    setEditItemFoodType(
      item.food_type ||
        (item.is_veg ? 'veg' : 'non-veg')
    )

    setEditItemReorderMode(
      item.reorder_mode || 'auto'
    )

    setEditItemAddons(
      Array.isArray(item.addons) &&
        item.addons.length > 0
        ? item.addons
        : ['']
    )
  }

  const cancelEditingMenuItem = () => {
    setEditingMenuItemId(null)
    setEditItemName('')
    setEditItemPrice('')
    setEditItemCategory('')
    setEditItemDescription('')
    setEditItemImageUrl('')
    setEditItemFoodType('veg')
    setEditItemReorderMode('auto')
    setEditItemAddons([''])
  }

  const handleSaveMenuItem = async (itemId) => {
    if (savingMenuItem) return

    if (!editItemName.trim()) {
      alert('Please enter an item name.')
      return
    }

    const parsedPrice = parseFloat(editItemPrice)

    if (
      isNaN(parsedPrice) ||
      parsedPrice <= 0
    ) {
      alert('Please enter a valid price.')
      return
    }

    if (currentPlan !== 'Pro+') {
      const currentItem = menuItems.find(
        (item) => item.id === itemId
      )

      if (
        currentItem &&
        Number(currentItem.price) !== parsedPrice
      ) {
        alert(
          '🔒 Price modification is exclusive to the Pro+ tier. Keep the existing price or upgrade to Pro+ to change it.'
        )
        return
      }
    }

    setSavingMenuItem(true)

    const validEditAddons =
      editItemAddons.filter(
        (a) => a.trim() !== ''
      )

    const updatedData = {
      name: editItemName.trim(),
      price: parsedPrice,
      category: editItemCategory.trim(),
      description:
        editItemDescription.trim(),
      image_url:
        editItemImageUrl.trim(),
      is_veg:
        editItemFoodType === 'veg',
      food_type:
        editItemFoodType,
      reorder_mode:
        editItemReorderMode,
      addons: validEditAddons
    }

    const { data, error } = await supabase
      .from('menu_items')
      .update(updatedData)
      .eq('id', itemId)
      .select()
      .single()

    if (error) {
      alert(
        'Failed to update menu item: ' +
          error.message
      )
    } else {
      setMenuItems((prev) =>
        prev.map((item) =>
          item.id === itemId
            ? data
            : item
        )
      )

      alert(
        'Menu item updated successfully! ✅'
      )

      cancelEditingMenuItem()
    }

    setSavingMenuItem(false)
  }

  const handleAddDish = async (e) => {
    e.preventDefault()

    if (!restaurant) return

    if (menuItems.length >= maxMenuAllowed) {
      alert(
        `⚠️ Limit Reached! Your current ${currentPlan} plan allows a maximum of ${maxMenuAllowed} menu items. Please upgrade to Pro or Pro+ to add more dishes.`
      )
      return
    }

    if (!name.trim()) {
      alert('Please enter the item name.')
      return
    }

    const parsedPrice = parseFloat(price)

    if (
      isNaN(parsedPrice) ||
      parsedPrice <= 0
    ) {
      alert('Please enter a valid price.')
      return
    }

    if (!category.trim()) {
      alert('Please enter a category.')
      return
    }

    setLoading(true)

    const validAddons =
      addons.filter((a) => a.trim() !== '')

    const newItem = {
      restaurant_id: restaurant.id,
      name: name.trim(),
      price: parsedPrice,
      category: category.trim(),
      image_url: imageUrl.trim(),
      description: description.trim(),
      is_veg: foodType === 'veg',
      food_type: foodType,
      reorder_mode: reorderMode,
      addons: validAddons,
      is_available: true
    }

    const {
      data,
      error
    } = await supabase
      .from('menu_items')
      .insert([newItem])
      .select()

    if (error) {
      alert(
        'Error adding item: ' +
          error.message
      )
    } else {
      alert(
        'Dish added to your live menu!'
      )

      setName('')
      setPrice('')
      setCategory('')
      setImageUrl('')
      setDescription('')
      setFoodType('veg')
      setReorderMode('auto')
      setAddons([''])

      if (data) {
        setMenuItems((prev) => [
          ...data,
          ...prev
        ])
      }
    }

    setLoading(false)
  }

  const handleCreateStaff = async (e) => {
    e.preventDefault()

    if (
      !staffName.trim() ||
      !staffUserId.trim() ||
      !staffPassword.trim()
    ) {
      alert(
        'Please fill out all staff credentials.'
      )
      return
    }

    setAddingStaff(true)

    try {
      const newStaff = {
        restaurant_id: restaurantId,
        name: staffName.trim(),
        user_id:
          staffUserId
            .trim()
            .toLowerCase(),
        password:
          staffPassword.trim(),
        role: staffRole,
        pin:
          staffPassword.trim()
      }

      const {
        data,
        error
      } = await supabase
        .from('staff_users')
        .insert([newStaff])
        .select()

      if (error) throw error

      alert(
        'Staff member created successfully! 🎉'
      )

      setStaffName('')
      setStaffUserId('')
      setStaffPassword('')

      if (data) {
        setStaffList((prev) => [
          ...data,
          ...prev
        ])
      }
    } catch (err) {
      alert(
        'Error creating staff account: ' +
          err.message
      )
    } finally {
      setAddingStaff(false)
    }
  }

  const handleDeleteStaff = async (
    staffId,
    name
  ) => {
    if (
      !confirm(
        `Are you sure you want to remove staff member "${name}"?`
      )
    ) {
      return
    }

    setStaffList((prev) =>
      prev.filter(
        (s) => s.id !== staffId
      )
    )

    try {
      const { error } =
        await supabase
          .from('staff_users')
          .delete()
          .eq('id', staffId)

      if (error) throw error

      alert(
        'Staff account revoked.'
      )
    } catch (err) {
      alert(
        'Failed to delete staff: ' +
          err.message
      )
    }
  }

  const handleSaveTaxSettings =
    async (e) => {
      e.preventDefault()

      setSavingTaxes(true)

      const taxData = {
        sgst_rate:
          parseFloat(sgstRate),
        cgst_rate:
          parseFloat(cgstRate),
        packing_charge:
          parseFloat(packingCharge)
      }

      const { error } =
        await supabase
          .from('restaurants')
          .update(taxData)
          .eq(
            'id',
            restaurantId
          )

      if (error) {
        alert(
          'Failed to save tax settings: ' +
            error.message
        )
      } else {
        setRestaurant((prev) => ({
          ...prev,
          ...taxData
        }))

        alert(
          'Tax & packing charges updated successfully! ✅'
        )
      }

      setSavingTaxes(false)
    }

  const handleSwiggySync = async (e) => {
    e.preventDefault()

    if (currentPlan === 'Standard') {
      alert(
        '🔒 Swiggy sync is locked on the Standard plan. Please upgrade to Pro or Pro+.'
      )
      return
    }

    if (!swiggyDataInput.trim()) {
      alert(
        'Please provide valid Swiggy menu export JSON data.'
      )
      return
    }

    setSyncingSwiggy(true)

    try {
      const parsedItems =
        JSON.parse(
          swiggyDataInput
        )

      if (!Array.isArray(parsedItems)) {
        throw new Error(
          'Input must be a JSON array of items.'
        )
      }

      const formattedItems =
        parsedItems.map(
          (item) => ({
            restaurant_id:
              restaurant.id,
            name:
              item.name ||
              'Swiggy Item',
            price: parseFloat(
              item.price || 100
            ),
            category:
              item.category ||
              'Swiggy Sync',
            image_url:
              item.image_url ||
              '',
            description:
              item.description ||
              '',
            is_veg:
              item.is_veg ??
              true,
            food_type:
              item.food_type ||
              (
                item.is_veg === false
                  ? 'non-veg'
                  : 'veg'
              ),
            reorder_mode:
              item.reorder_mode ||
              'auto',
            is_available:
              true
          })
        )

      const {
        data,
        error
      } = await supabase
        .from('menu_items')
        .insert(
          formattedItems
        )
        .select()

      if (error) {
        throw new Error(
          error.message
        )
      }

      alert(
        `Successfully synced ${formattedItems.length} items from Swiggy menu! ✅`
      )

      setSwiggyDataInput('')

      if (data) {
        setMenuItems((prev) => [
          ...data,
          ...prev
        ])
      }
    } catch (err) {
      alert(
        'Sync Failed: Make sure your input format is valid JSON. Error: ' +
          err.message
      )
    }

    setSyncingSwiggy(false)
  }

  const handleSavePaymentSettings =
    async (e) => {
      e.preventDefault()

      setSavingPayment(true)

      const updatedData = {
        razorpay_key_id:
          razorpayKeyId.trim(),
        razorpay_secret:
          razorpaySecret.trim(),
        enable_counter_payment:
          enableCounterPayment
      }

      const { error } =
        await supabase
          .from('restaurants')
          .update(updatedData)
          .eq(
            'id',
            restaurantId
          )

      if (error) {
        alert(
          'Failed to update payment settings: ' +
            error.message
        )
      } else {
        setRestaurant(
          (prev) => ({
            ...prev,
            ...updatedData
          })
        )

        setIsGatewayEditable(false)

        alert(
          'Payment settings saved successfully! ✅'
        )
      }

      setSavingPayment(false)
    }

  const handleReportTimeframeChange =
    (frame) => {
      if (
        frame === 'yearly' &&
        currentPlan !== 'Pro+'
      ) {
        alert(
          '🔒 Yearly comprehensive audit reports are exclusive to the Pro+ tier. Please upgrade to Pro+ to unlock yearly analytics.'
        )
        return
      }

      setReportTimeframe(frame)
    }

  const handleUpgradePlan =
    async (targetPlan) => {
      const confirmation =
        window.confirm(
          `Upgrade your subscription to ${targetPlan}?`
        )

      if (!confirmation) return

      const { error } =
        await supabase
          .from('restaurants')
          .update({
            plan: targetPlan
          })
          .eq(
            'id',
            restaurantId
          )

      if (error) {
        alert(
          'Upgrade failed: ' +
            error.message
        )
      } else {
        alert(
          `Congratulations! Your restaurant has been upgraded to the ${targetPlan} plan successfully! 🎉`
        )

        setRestaurant(
          (prev) => ({
            ...prev,
            plan: targetPlan
          })
        )
      }
    }

  const handleTabSwitch = (
    tabId
  ) => {
    if (
      tabId ===
        'swiggy-sync' &&
      currentPlan === 'Standard'
    ) {
      alert(
        '🔒 Swiggy menu sync is locked on the Standard plan. Please upgrade to Pro or Pro+.'
      )
      return
    }

    setActiveTab(tabId)
  }

  const handleLogout = async () => {
    try {
      localStorage.removeItem(
        'digital_dining_restaurant_id'
      )

      await supabase.auth.signOut()
    } finally {
      router.replace('/login')
    }
  }

  const totalRevenue =
    orders.reduce(
      (sum, o) =>
        sum +
        (
          o.status !==
          'cancelled'
            ? Number(
                o.total_amount ||
                  0
              )
            : 0
        ),
      0
    )

  const activeOrders =
    orders.filter(
      (o) =>
        o.status === 'pending' ||
        o.status === 'preparing' ||
        o.status === 'ready'
    )

  const todayString =
    new Date()
      .toISOString()
      .split('T')[0]

  const todaysOrders =
    orders.filter(
      (o) =>
        o.created_at &&
        o.created_at.split(
          'T'
        )[0] === todayString
    )

  const automaticHighlyReorderedIds =
    getAutomaticHighlyReorderedIds(
      menuItems
    )

  if (!authChecked || !restaurant) {
    return (
      <div className="min-h-screen bg-neutral-950 flex flex-col items-center justify-center text-white space-y-3">
        <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin"></div>

        <p className="text-xs font-bold text-neutral-400 uppercase tracking-widest">
          Loading Partner Portal...
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans pb-16">

      <audio
        ref={audioRef}
        src="https://assets.mixkit.co/active_storage/sfx/2869/2869-preview.mp3"
        preload="auto"
      />

      {/* Top Partner Header */}
      <header className="bg-neutral-900 border-b border-neutral-800 sticky top-0 z-30 px-6 py-4 shadow-md">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">

          <div className="flex items-center space-x-3">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-orange-500 to-amber-500 flex items-center justify-center font-black text-white text-xl shadow-lg shadow-orange-500/20">
              {restaurant.name
                .charAt(0)
                .toUpperCase()}
            </div>

            <div>
              <div className="flex items-center space-x-2">
                <h1 className="text-lg font-black text-white">
                  {restaurant.name}
                </h1>

                <button
                  onClick={() =>
                    setIsStoreOpen(
                      !isStoreOpen
                    )
                  }
                  className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider flex items-center space-x-1 border ${
                    isStoreOpen
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                      : 'bg-red-500/10 text-red-400 border-red-500/30'
                  }`}
                >
                  <span
                    className={`w-1.5 h-1.5 rounded-full ${
                      isStoreOpen
                        ? 'bg-emerald-400 animate-pulse'
                        : 'bg-red-400'
                    }`}
                  ></span>

                  <span>
                    {isStoreOpen
                      ? 'Accepting Orders'
                      : 'Store Paused'}
                  </span>
                </button>
              </div>

              <p className="text-[11px] text-neutral-400 font-mono mt-0.5">
                Unique URL ID: {restaurant.id}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-3">
            <button
              onClick={() =>
                router.push(
                  `/dashboard/${restaurant.id}/qr`
                )
              }
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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">

          <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-3xl shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
              Total Revenue
            </p>

            <p className="text-2xl font-black text-white mt-1">
              ₹{totalRevenue}
            </p>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-3xl shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
              Orders Today
            </p>

            <p className="text-2xl font-black text-emerald-400 mt-1">
              {todaysOrders.length}
            </p>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-3xl shadow-sm">
            <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
              Live Kitchen Queue
            </p>

            <p className="text-2xl font-black text-orange-400 mt-1">
              {activeOrders.length}
            </p>
          </div>

          <div className="bg-neutral-900 border border-neutral-800 p-5 rounded-3xl shadow-sm flex flex-col justify-between">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-neutral-400">
                Partner Tier
              </p>

              <p className="text-xl font-black text-amber-400 mt-0.5">
                {currentPlan}
              </p>
            </div>

            {currentPlan !== 'Pro+' && (
              <div className="flex space-x-1 pt-2">
                {currentPlan === 'Standard' && (
                  <button
                    onClick={() =>
                      handleUpgradePlan('Pro')
                    }
                    className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold text-[10px] py-1.5 rounded-lg transition"
                  >
                    Upgrade to Pro 🚀
                  </button>
                )}

                <button
                  onClick={() =>
                    handleUpgradePlan('Pro+')
                  }
                  className="w-full bg-amber-500 hover:bg-amber-600 text-neutral-950 font-black text-[10px] py-1.5 rounded-lg transition"
                >
                  Go Pro+ 👑
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-2 border-b border-neutral-800 pb-3 overflow-x-auto">
          {[
            {
              id: 'orders',
              label: `🔥 Live Orders (${orders.length})`
            },
            {
              id: 'menu',
              label: `🍔 Menu Catalog (${menuItems.length}/${maxMenuAllowed})`
            },
            {
              id: 'staff',
              label: `👥 Staff Management (${staffList.length})`
            },
            {
              id: 'taxes',
              label: `🧾 Taxes & Packing`
            },
            {
              id: 'swiggy-sync',
              label: '🟠 Swiggy Sync'
            },
            {
              id: 'gateway',
              label: '💳 Payment Gateways'
            },
            {
              id: 'settlements',
              label: '📊 Reports & Settlements'
            }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() =>
                handleTabSwitch(tab.id)
              }
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
            <h2 className="text-lg font-black text-white">
              Live Kitchen Orders Queue
            </h2>

            {orders.length === 0 ? (
              <div className="bg-neutral-900 border border-neutral-800 rounded-3xl p-16 text-center text-neutral-500 space-y-2">
                <div className="text-4xl">
                  🛎️
                </div>

                <p className="font-bold text-white text-base">
                  No orders in queue
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {orders.map((order) => {
                  const orderTime =
                    new Date(
                      order.created_at
                    ).getTime()

                  const currentTime =
                    Date.now()

                  const diffMinutes =
                    (
                      currentTime -
                      orderTime
                    ) /
                    (1000 * 60)

                  const isProPlus =
                    currentPlan ===
                    'Pro+'

                  const isWithin3MinWindow =
                    isProPlus &&
                    diffMinutes <=
                      3 &&
                    order.status !==
                      'completed'

                  return (
                    <div
                      key={order.id}
                      className="bg-neutral-900 border border-neutral-800 rounded-3xl p-6 shadow-md flex flex-col justify-between space-y-4"
                    >
                      <div>
                        <div className="flex justify-between items-start">
                          <div className="flex items-center space-x-2">
                            <span className="bg-orange-500 text-white text-xs font-black px-3 py-1 rounded-xl">
                              Table{' '}
                              {order.table_number ||
                                '1'}
                            </span>

                            {order.waiter_name && (
                              <span className="bg-neutral-800 text-orange-400 text-[10px] font-bold px-2.5 py-1 rounded-lg border border-neutral-700">
                                Waiter:{' '}
                                {
                                  order.waiter_name
                                }
                              </span>
                            )}
                          </div>

                          <span
                            className={`text-[10px] font-black px-3 py-1 rounded-xl uppercase ${
                              order.status ===
                              'ready'
                                ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                : 'bg-amber-500/10 text-amber-400 border border-amber-500/20 animate-pulse'
                            }`}
                          >
                            {order.payment_mode ||
                              'Online'}{' '}
                            •{' '}
                            {
                              order.status
                            }
                          </span>
                        </div>

                        {isWithin3MinWindow && (
                          <div className="mt-3 bg-amber-500/10 border border-amber-500/30 p-2.5 rounded-xl text-[11px] text-amber-300 flex items-center justify-between">
                            <span>
                              ⏳ 3-Min Add-On Active: Customer can append items.
                            </span>

                            <span className="font-bold font-mono">
                              {Math.max(
                                0,
                                Math.ceil(
                                  3 -
                                    diffMinutes
                                )
                              )}{' '}
                              min left
                            </span>
                          </div>
                        )}

                        <div className="mt-3 space-y-2 bg-neutral-950 p-4 rounded-2xl border border-neutral-800">
                          {order.items &&
                            order.items.map(
                              (
                                item,
                                idx
                              ) => (
                                <div
                                  key={
                                    idx
                                  }
                                  className="flex justify-between items-center text-sm"
                                >
                                  <span className="text-neutral-200 font-medium">
                                    •{' '}
                                    {
                                      item.name
                                    }{' '}
                                    <strong className="text-orange-400">
                                      ×
                                      {item.qty ||
                                        item.quantity}
                                    </strong>
                                  </span>

                                  <span className="text-xs text-neutral-400">
                                    ₹
                                    {item.price *
                                      (item.qty ||
                                        item.quantity ||
                                        1)}
                                  </span>
                                </div>
                              )
                            )}
                        </div>
                      </div>

                      <div className="border-t border-neutral-800 pt-4 flex justify-between items-center">
                        <div>
                          <p className="text-[10px] uppercase font-bold text-neutral-500">
                            Total Amount (Incl. Taxes & Packing)
                          </p>

                          <p className="text-lg font-black text-emerald-400">
                            ₹
                            {
                              order.total_amount
                            }
                          </p>
                        </div>

                        <div className="flex space-x-2">
                          {order.status !==
                            'completed' && (
                            <button
                              onClick={() =>
                                updateOrderStatus(
                                  order.id,
                                  'completed'
                                )
                              }
                              className="bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold px-4 py-2 rounded-xl transition shadow"
                            >
                              Mark Completed 🚀
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: MENU CATALOG */}
        {activeTab === 'menu' && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

            {/* ADD ITEM */}
            <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-3xl space-y-4 md:col-span-1 h-fit">
              <div className="flex justify-between items-center">
                <h2 className="text-md font-black text-white">
                  Add New Dish
                </h2>

                <span className="text-[10px] text-neutral-400 font-bold">
                  {menuItems.length} /{' '}
                  {maxMenuAllowed} used
                </span>
              </div>

              <form
                onSubmit={handleAddDish}
                className="space-y-4"
              >

                {/* FOOD TYPE */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                    Food Type
                  </label>

                  <div className="grid grid-cols-2 gap-2 bg-neutral-950 p-2 rounded-xl border border-neutral-800">
                    {[
                      {
                        value: 'veg',
                        label: 'Veg',
                        dot: 'bg-emerald-500',
                        active:
                          'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                      },
                      {
                        value: 'non-veg',
                        label:
                          'Non-Veg',
                        dot: 'bg-red-500',
                        active:
                          'bg-red-500/20 text-red-400 border-red-500/30'
                      },
                      {
                        value: 'egg',
                        label: 'Egg',
                        dot: 'bg-amber-400',
                        active:
                          'bg-amber-500/20 text-amber-300 border-amber-500/30'
                      },
                      {
                        value:
                          'beverage',
                        label:
                          'Beverage',
                        dot: 'bg-sky-400',
                        active:
                          'bg-sky-500/20 text-sky-300 border-sky-500/30'
                      },
                      {
                        value: 'other',
                        label: 'Other',
                        dot: 'bg-neutral-400',
                        active:
                          'bg-neutral-500/20 text-neutral-200 border-neutral-500/30'
                      }
                    ].map(
                      (type) => (
                        <button
                          key={
                            type.value
                          }
                          type="button"
                          onClick={() =>
                            setFoodType(
                              type.value
                            )
                          }
                          className={`flex items-center justify-center space-x-1.5 py-2 rounded-lg text-xs font-bold transition border ${
                            foodType ===
                            type.value
                              ? type.active
                              : 'border-transparent text-neutral-500 hover:text-neutral-300'
                          }`}
                        >
                          <span
                            className={`w-2 h-2 rounded-full ${type.dot}`}
                          ></span>

                          <span>
                            {
                              type.label
                            }
                          </span>
                        </button>
                      )
                    )}
                  </div>

                  <p className="text-[10px] text-neutral-500 mt-2">
                    Use Beverage for water bottles, cool drinks, juices, soda, etc.
                  </p>
                </div>

                {/* NAME */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                    Item Name
                  </label>

                  <input
                    type="text"
                    placeholder="e.g. Paneer Tikka"
                    value={name}
                    onChange={(e) =>
                      setName(
                        e.target.value
                      )
                    }
                    required
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm"
                  />
                </div>

                {/* PRICE */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                    Price (₹)
                  </label>

                  <input
                    type="number"
                    step="0.01"
                    placeholder="e.g. 250"
                    value={price}
                    onChange={(e) =>
                      setPrice(
                        e.target.value
                      )
                    }
                    required
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm"
                  />
                </div>

                {/* CATEGORY */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                    Category
                  </label>

                  <input
                    type="text"
                    placeholder="e.g. Starter"
                    value={category}
                    onChange={(e) =>
                      setCategory(
                        e.target.value
                      )
                    }
                    required
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm"
                  />
                </div>

                {/* DESCRIPTION */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                    Item Description
                  </label>

                  <textarea
                    rows="3"
                    placeholder="e.g. Soft and fluffy bite-sized dumplings served with chutney."
                    value={description}
                    onChange={(e) =>
                      setDescription(
                        e.target.value
                      )
                    }
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm resize-none"
                  />
                </div>

                {/* HIGHLY REORDERED */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                    Highly Reordered
                  </label>

                  <select
                    value={
                      reorderMode
                    }
                    onChange={(e) =>
                      setReorderMode(
                        e.target.value
                      )
                    }
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm"
                  >
                    <option value="auto">
                      Auto — based on customer orders
                    </option>

                    <option value="on">
                      Always show 🔥 Highly Reordered
                    </option>

                    <option value="off">
                      Never show Highly Reordered
                    </option>
                  </select>

                  <p className="text-[10px] text-neutral-500 mt-1">
                    Auto uses actual order activity. You can override it with Always or Never.
                  </p>
                </div>

                {/* IMAGE */}
                <div>
                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                    Image URL
                  </label>

                  <input
                    type="url"
                    placeholder="https://..."
                    value={imageUrl}
                    onChange={(e) =>
                      setImageUrl(
                        e.target.value
                      )
                    }
                    className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-3 text-white text-sm"
                  />
                </div>

                {/* ADDONS */}
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-[10px] uppercase font-bold text-neutral-400">
                      Custom Add-ons (Unlimited)
                    </label>

                    <button
                      type="button"
                      onClick={() =>
                        setAddons([
                          ...addons,
                          ''
                        ])
                      }
                      className="text-[10px] font-bold text-orange-400 hover:underline"
                    >
                      + Add More Add-on
                    </button>
                  </div>

                  <div className="space-y-2">
                    {addons.map(
                      (
                        addon,
                        index
                      ) => (
                        <div
                          key={index}
                          className="flex space-x-2"
                        >
                          <input
                            type="text"
                            placeholder={`Add-on ${
                              index + 1
                            } (e.g. Extra Cheese)`}
                            value={addon}
                            onChange={(
                              e
                            ) => {
                              const newAddons =
                                [
                                  ...addons
                                ]

                              newAddons[
                                index
                              ] =
                                e.target.value

                              setAddons(
                                newAddons
                              )
                            }}
                            className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-white text-xs"
                          />

                          {addons.length >
                            1 && (
                            <button
                              type="button"
                              onClick={() =>
                                setAddons(
                                  addons.filter(
                                    (
                                      _,
                                      i
                                    ) =>
                                      i !==
                                      index
                                  )
                                )
                              }
                              className="bg-neutral-800 hover:bg-red-500/20 text-neutral-400 hover:text-red-400 px-3 py-2 rounded-xl text-xs font-bold transition"
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      )
                    )}
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-3.5 rounded-xl text-sm shadow-lg shadow-orange-500/20"
                >
                  {loading
                    ? 'Publishing...'
                    : '+ Publish Dish'}
                </button>
              </form>
            </div>

            {/* ACTIVE CATALOG */}
            <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-3xl md:col-span-2 space-y-4">

              <div className="flex justify-between items-center">
                <h2 className="text-md font-black text-white">
                  Active Catalog ({menuItems.length})
                </h2>

                {currentPlan !==
                  'Pro+' && (
                  <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2.5 py-1 rounded-lg">
                    🔒 Price modification locked (Pro+ required)
                  </span>
                )}
              </div>

              {menuItems.length ===
              0 ? (
                <p className="text-xs text-neutral-500 py-8">
                  No dishes added to your catalog yet.
                </p>
              ) : (
                <div className="space-y-3">
                  {menuItems.map(
                    (item) => {
                      const orderCount =
                        getItemOrderCount(
                          item
                        )

                      const highlyReordered =
                        isItemHighlyReordered(
                          item,
                          automaticHighlyReorderedIds
                        )

                      const currentItemFoodType =
                        item.food_type ||
                        (
                          item.is_veg
                            ? 'veg'
                            : 'non-veg'
                        )

                      return (
                        <div
                          key={item.id}
                          className="bg-neutral-950 border border-neutral-800 p-4 rounded-2xl space-y-4"
                        >
                          {editingMenuItemId ===
                          item.id ? (
                            /* EDIT MODE */
                            <div className="space-y-4">

                              <div className="flex items-center justify-between">
                                <div>
                                  <h3 className="font-black text-white text-sm">
                                    Edit Menu Item
                                  </h3>

                                  <p className="text-[10px] text-neutral-500 mt-0.5">
                                    Update the details customers see on your menu.
                                  </p>
                                </div>

                                <button
                                  type="button"
                                  onClick={
                                    cancelEditingMenuItem
                                  }
                                  className="bg-neutral-800 hover:bg-neutral-700 text-neutral-400 px-3 py-1.5 rounded-lg text-xs font-bold transition"
                                >
                                  ✕ Close
                                </button>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                                {/* EDIT NAME */}
                                <div>
                                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                                    Item Name
                                  </label>

                                  <input
                                    type="text"
                                    value={
                                      editItemName
                                    }
                                    onChange={(
                                      e
                                    ) =>
                                      setEditItemName(
                                        e.target.value
                                      )
                                    }
                                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5 text-white text-sm"
                                  />
                                </div>

                                {/* EDIT PRICE */}
                                <div>
                                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                                    Price (₹)
                                  </label>

                                  <input
                                    type="number"
                                    step="0.01"
                                    value={
                                      editItemPrice
                                    }
                                    onChange={(
                                      e
                                    ) =>
                                      setEditItemPrice(
                                        e.target.value
                                      )
                                    }
                                    disabled={
                                      currentPlan !==
                                      'Pro+'
                                    }
                                    className={`w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5 text-white text-sm ${
                                      currentPlan !==
                                      'Pro+'
                                        ? 'opacity-50 cursor-not-allowed'
                                        : ''
                                    }`}
                                  />

                                  {currentPlan !==
                                    'Pro+' && (
                                    <p className="text-[9px] text-amber-400 mt-1">
                                      🔒 Price editing requires Pro+.
                                    </p>
                                  )}
                                </div>

                                {/* EDIT CATEGORY */}
                                <div>
                                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                                    Category
                                  </label>

                                  <input
                                    type="text"
                                    value={
                                      editItemCategory
                                    }
                                    onChange={(
                                      e
                                    ) =>
                                      setEditItemCategory(
                                        e.target.value
                                      )
                                    }
                                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5 text-white text-sm"
                                  />
                                </div>

                                {/* EDIT FOOD TYPE */}
                                <div>
                                  <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                                    Food Type
                                  </label>

                                  <select
                                    value={
                                      editItemFoodType
                                    }
                                    onChange={(
                                      e
                                    ) =>
                                      setEditItemFoodType(
                                        e.target.value
                                      )
                                    }
                                    className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5 text-white text-sm"
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
                                      ⚪ Other
                                    </option>
                                  </select>
                                </div>
                              </div>

                              {/* EDIT DESCRIPTION */}
                              <div>
                                <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                                  Item Description
                                </label>

                                <textarea
                                  rows="3"
                                  value={
                                    editItemDescription
                                  }
                                  onChange={(
                                    e
                                  ) =>
                                    setEditItemDescription(
                                      e.target.value
                                    )
                                  }
                                  placeholder="Describe the dish for customers..."
                                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5 text-white text-sm resize-none"
                                />
                              </div>

                              {/* EDIT HIGHLY REORDERED */}
                              <div>
                                <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                                  Highly Reordered
                                </label>

                                <select
                                  value={
                                    editItemReorderMode
                                  }
                                  onChange={(
                                    e
                                  ) =>
                                    setEditItemReorderMode(
                                      e.target.value
                                    )
                                  }
                                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5 text-white text-sm"
                                >
                                  <option value="auto">
                                    Auto — based on customer orders
                                  </option>

                                  <option value="on">
                                    Always show 🔥 Highly Reordered
                                  </option>

                                  <option value="off">
                                    Never show Highly Reordered
                                  </option>
                                </select>

                                <p className="text-[10px] text-neutral-500 mt-1">
                                  Auto follows actual order activity. Always and Never let the restaurant override it.
                                </p>
                              </div>

                              {/* EDIT IMAGE */}
                              <div>
                                <label className="text-[10px] uppercase font-bold text-neutral-400 block mb-1">
                                  Image URL
                                </label>

                                <input
                                  type="url"
                                  value={
                                    editItemImageUrl
                                  }
                                  onChange={(
                                    e
                                  ) =>
                                    setEditItemImageUrl(
                                      e.target.value
                                    )
                                  }
                                  placeholder="https://..."
                                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2.5 text-white text-sm"
                                />
                              </div>

                              {/* EDIT ADDONS */}
                              <div>
                                <div className="flex justify-between items-center mb-1">
                                  <label className="text-[10px] uppercase font-bold text-neutral-400">
                                    Custom Add-ons
                                  </label>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      setEditItemAddons(
                                        [
                                          ...editItemAddons,
                                          ''
                                        ]
                                      )
                                    }
                                    className="text-[10px] font-bold text-orange-400 hover:underline"
                                  >
                                    + Add More Add-on
                                  </button>
                                </div>

                                <div className="space-y-2">
                                  {editItemAddons.map(
                                    (
                                      addon,
                                      index
                                    ) => (
                                      <div
                                        key={
                                          index
                                        }
                                        className="flex space-x-2"
                                      >
                                        <input
                                          type="text"
                                          placeholder={`Add-on ${
                                            index +
                                            1
                                          }`}
                                          value={
                                            addon
                                          }
                                          onChange={(
                                            e
                                          ) => {
                                            const next =
                                              [
                                                ...editItemAddons
                                              ]

                                            next[
                                              index
                                            ] =
                                              e.target.value

                                            setEditItemAddons(
                                              next
                                            )
                                          }}
                                          className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-white text-xs"
                                        />

                                        {editItemAddons.length >
                                          1 && (
                                          <button
                                            type="button"
                                            onClick={() =>
                                              setEditItemAddons(
                                                editItemAddons.filter(
                                                  (
                                                    _,
                                                    i
                                                  ) =>
                                                    i !==
                                                    index
                                                )
                                              )
                                            }
                                            className="bg-neutral-800 hover:bg-red-500/20 text-neutral-400 hover:text-red-400 px-3 py-2 rounded-xl text-xs font-bold transition"
                                          >
                                            ✕
                                          </button>
                                        )}
                                      </div>
                                    )
                                  )}
                                </div>
                              </div>

                              {/* SAVE / CANCEL */}
                              <div className="flex space-x-2">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleSaveMenuItem(
                                      item.id
                                    )
                                  }
                                  disabled={
                                    savingMenuItem
                                  }
                                  className="flex-1 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-3 rounded-xl text-xs transition shadow-lg shadow-orange-500/20"
                                >
                                  {savingMenuItem
                                    ? 'Saving Changes...'
                                    : 'Save Item Changes 💾'}
                                </button>

                                <button
                                  type="button"
                                  onClick={
                                    cancelEditingMenuItem
                                  }
                                  disabled={
                                    savingMenuItem
                                  }
                                  className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-5 py-3 rounded-xl text-xs font-bold transition"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* DISPLAY MODE */
                            <>
                              <div className="flex items-start justify-between gap-4">

                                <div className="min-w-0 flex-1">

                                  <div className="flex items-center space-x-2 flex-wrap gap-y-1">

                                    <span
                                      className={`w-2.5 h-2.5 rounded-full ${getFoodTypeClasses(
                                        currentItemFoodType
                                      )}`}
                                    ></span>

                                    <h3 className="font-bold text-white text-sm">
                                      {
                                        item.name
                                      }
                                    </h3>

                                    {highlyReordered && (
                                      <span className="bg-green-500/10 text-green-400 border border-green-500/20 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide">
                                        🔥 Highly Reordered
                                      </span>
                                    )}
                                  </div>

                                  <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-1">

                                    <span className="font-black text-emerald-400 text-sm">
                                      ₹
                                      {
                                        item.price
                                      }
                                    </span>

                                    <span className="text-neutral-600">
                                      •
                                    </span>

                                    <span className="text-xs text-orange-400">
                                      {
                                        item.category ||
                                        'General'
                                      }
                                    </span>

                                    <span className="text-neutral-600">
                                      •
                                    </span>

                                    <span className="text-[10px] font-bold uppercase text-neutral-500">
                                      {
                                        getFoodTypeLabel(
                                          currentItemFoodType
                                        )
                                      }
                                    </span>

                                    <span className="text-neutral-600">
                                      •
                                    </span>

                                    <span className="text-[10px] font-bold text-neutral-500">
                                      {
                                        orderCount
                                      }{' '}
                                      order
                                      {orderCount ===
                                      1
                                        ? ''
                                        : 's'}
                                    </span>
                                  </div>

                                  {item.description && (
                                    <p className="text-xs text-neutral-400 mt-2 max-w-2xl line-clamp-2">
                                      {
                                        item.description
                                      }
                                    </p>
                                  )}
                                </div>

                                <div className="flex items-center space-x-2 shrink-0">

                                  <button
                                    type="button"
                                    onClick={() =>
                                      startEditingMenuItem(
                                        item
                                      )
                                    }
                                    className="bg-orange-500/10 hover:bg-orange-500 text-orange-400 hover:text-white border border-orange-500/20 px-3 py-2 rounded-xl text-[10px] font-black transition"
                                  >
                                    ✏️ Edit Item
                                  </button>

                                  <button
                                    type="button"
                                    onClick={() =>
                                      toggleItemAvailability(
                                        item.id,
                                        item.is_available
                                      )
                                    }
                                    className={`w-12 h-6 flex items-center rounded-full p-1 transition cursor-pointer ${
                                      item.is_available
                                        ? 'bg-emerald-600 justify-end'
                                        : 'bg-neutral-700 justify-start'
                                    }`}
                                    aria-label="Toggle item availability"
                                  >
                                    <div className="bg-white w-4 h-4 rounded-full shadow-md transform transition"></div>
                                  </button>
                                </div>
                              </div>

                              <div className="flex items-center justify-between pt-2 border-t border-neutral-800">
                                <div className="flex items-center gap-2">

                                  <span
                                    className={`text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-md ${
                                      item.is_available
                                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                        : 'bg-red-500/10 text-red-400 border border-red-500/20'
                                    }`}
                                  >
                                    {item.is_available
                                      ? 'Available'
                                      : 'Out of Stock'}
                                  </span>

                                  <span className="text-[10px] text-neutral-500">
                                    Reorder:{' '}
                                    {item.reorder_mode ===
                                    'on'
                                      ? 'Always'
                                      : item.reorder_mode ===
                                        'off'
                                      ? 'Never'
                                      : 'Auto'}
                                  </span>
                                </div>

                                {currentPlan !==
                                  'Pro+' && (
                                  <span className="text-[9px] text-neutral-600">
                                    Price editing: Pro+
                                  </span>
                                )}
                              </div>
                            </>
                          )}
                        </div>
                      )
                    }
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: STAFF MANAGEMENT */}
        {activeTab === 'staff' && (
          <div className="bg-neutral-900 border border-neutral-800 p-8 rounded-3xl max-w-4xl mx-auto space-y-6 shadow-xl">

            <div className="border-b border-neutral-800 pb-4">
              <span className="text-[10px] bg-orange-500/10 text-orange-400 border border-orange-500/20 px-3 py-1 rounded-full uppercase font-extrabold tracking-widest">
                Staff Access Control
              </span>

              <h2 className="text-xl font-black text-white mt-2">
                Waiter & Kitchen User IDs & Passwords
              </h2>

              <p className="text-xs text-neutral-400">
                Create login credentials for your waiters and kitchen staff so they can access their respective portals.
              </p>
            </div>

            <form
              onSubmit={handleCreateStaff}
              className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-3 items-end bg-neutral-950 p-4 rounded-2xl border border-neutral-800"
            >
              <div>
                <label className="text-[10px] font-bold text-neutral-400 block mb-1 uppercase">
                  Staff Name
                </label>

                <input
                  type="text"
                  placeholder="Rahul Kumar"
                  value={staffName}
                  onChange={(e) =>
                    setStaffName(
                      e.target.value
                    )
                  }
                  required
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-neutral-400 block mb-1 uppercase">
                  User ID
                </label>

                <input
                  type="text"
                  placeholder="waiter1"
                  value={staffUserId}
                  onChange={(e) =>
                    setStaffUserId(
                      e.target.value
                    )
                  }
                  required
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-neutral-400 block mb-1 uppercase">
                  Password / PIN
                </label>

                <input
                  type="text"
                  placeholder="Secret123"
                  value={
                    staffPassword
                  }
                  onChange={(e) =>
                    setStaffPassword(
                      e.target.value
                    )
                  }
                  required
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-white text-xs font-mono focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold text-neutral-400 block mb-1 uppercase">
                  Role
                </label>

                <select
                  value={staffRole}
                  onChange={(e) =>
                    setStaffRole(
                      e.target.value
                    )
                  }
                  className="w-full bg-neutral-900 border border-neutral-800 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-orange-500"
                >
                  <option value="waiter">
                    Waiter
                  </option>

                  <option value="kitchen">
                    Kitchen KDS
                  </option>
                </select>
              </div>

              <button
                type="submit"
                disabled={addingStaff}
                className="bg-orange-500 hover:bg-orange-600 text-white font-black py-2.5 rounded-xl text-xs uppercase tracking-wider transition shadow-lg shadow-orange-500/20"
              >
                {addingStaff
                  ? 'Adding...'
                  : 'Create Login ➕'}
              </button>
            </form>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-neutral-800 text-[10px] text-neutral-400 uppercase tracking-widest bg-neutral-950/40">
                    <th className="p-3 font-bold">
                      Staff Name
                    </th>
                    <th className="p-3 font-bold">
                      Login User ID
                    </th>
                    <th className="p-3 font-bold">
                      Role Portal
                    </th>
                    <th className="p-3 font-bold text-right">
                      Actions
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-neutral-800/60 text-xs">
                  {staffList.length ===
                  0 ? (
                    <tr>
                      <td
                        colSpan="4"
                        className="p-6 text-center text-neutral-500"
                      >
                        No staff accounts created yet.
                      </td>
                    </tr>
                  ) : (
                    staffList.map(
                      (staff) => (
                        <tr
                          key={staff.id}
                          className="hover:bg-neutral-800/20 transition"
                        >
                          <td className="p-3 font-bold text-white">
                            {
                              staff.name
                            }
                          </td>

                          <td className="p-3 font-mono text-neutral-300">
                            {
                              staff.user_id ||
                              staff.pin
                            }
                          </td>

                          <td className="p-3">
                            <span
                              className={`px-2.5 py-1 rounded-full text-[10px] font-black uppercase ${
                                staff.role ===
                                'waiter'
                                  ? 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                                  : 'bg-red-500/10 text-red-400 border border-red-500/20'
                              }`}
                            >
                              {
                                staff.role
                              }
                            </span>
                          </td>

                          <td className="p-3 text-right space-x-2">
                            <button
                              onClick={() =>
                                window.open(
                                  staff.role ===
                                    'waiter'
                                    ? `/waiter/${restaurantId}`
                                    : `/kitchen/${restaurantId}`,
                                  '_blank'
                                )
                              }
                              className="bg-neutral-800 hover:bg-neutral-700 text-neutral-300 px-3 py-1 rounded-lg font-bold transition"
                            >
                              Open Portal ↗
                            </button>

                            <button
                              onClick={() =>
                                handleDeleteStaff(
                                  staff.id,
                                  staff.name
                                )
                              }
                              className="bg-red-500/10 hover:bg-red-600 text-red-400 hover:text-white px-3 py-1 rounded-lg font-bold transition"
                            >
                              Revoke 🗑️
                            </button>
                          </td>
                        </tr>
                      )
                    )
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: TAX & PACKING CHARGES */}
        {activeTab ===
          'taxes' && (
          <div className="bg-neutral-900 border border-neutral-800 p-8 rounded-3xl max-w-xl mx-auto space-y-6 shadow-xl">

            <div className="text-center space-y-2">
              <span className="text-[10px] font-extrabold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full uppercase tracking-widest">
                State Taxation & Fees
              </span>

              <h2 className="text-xl font-black text-white">
                Tax & Parcel Packing Settings
              </h2>

              <p className="text-xs text-neutral-400">
                Configure your local SGST, CGST, and parcel packing fees applied automatically across all membership tiers.
              </p>
            </div>

            <form
              onSubmit={
                handleSaveTaxSettings
              }
              className="space-y-4"
            >
              <div>
                <label className="text-xs font-bold text-neutral-300 block mb-1">
                  SGST Rate (%)
                </label>

                <input
                  type="number"
                  step="0.1"
                  value={sgstRate}
                  onChange={(e) =>
                    setSgstRate(
                      e.target.value
                    )
                  }
                  required
                  className="w-full bg-neutral-950 text-white font-mono text-xs border border-neutral-800 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-neutral-300 block mb-1">
                  CGST Rate (%)
                </label>

                <input
                  type="number"
                  step="0.1"
                  value={cgstRate}
                  onChange={(e) =>
                    setCgstRate(
                      e.target.value
                    )
                  }
                  required
                  className="w-full bg-neutral-950 text-white font-mono text-xs border border-neutral-800 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-neutral-300 block mb-1">
                  Parcel Packing Charge (₹)
                </label>

                <input
                  type="number"
                  step="1"
                  value={
                    packingCharge
                  }
                  onChange={(e) =>
                    setPackingCharge(
                      e.target.value
                    )
                  }
                  required
                  className="w-full bg-neutral-950 text-white font-mono text-xs border border-neutral-800 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500"
                />
              </div>

              <button
                type="submit"
                disabled={savingTaxes}
                className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-3.5 rounded-xl text-xs transition shadow-lg shadow-orange-500/25 hover:opacity-95"
              >
                {savingTaxes
                  ? 'Saving Tax Configurations...'
                  : 'Save Tax Settings 💾'}
              </button>
            </form>
          </div>
        )}

        {/* TAB 5: SWIGGY SYNC */}
        {activeTab ===
          'swiggy-sync' && (
          <div className="bg-neutral-900 border border-neutral-800 p-8 rounded-3xl max-w-xl mx-auto space-y-6 shadow-xl">

            <div className="space-y-2 text-center">
              <span className="text-[10px] font-extrabold text-orange-400 bg-orange-500/10 border border-orange-500/20 px-3 py-1 rounded-full uppercase tracking-widest">
                Swiggy Integration
              </span>

              <h2 className="text-xl font-black text-white">
                Sync Swiggy Menu Directly
              </h2>
            </div>

            <form
              onSubmit={
                handleSwiggySync
              }
              className="space-y-4"
            >
              <div>
                <label className="text-xs font-bold text-neutral-300 block mb-1">
                  Swiggy Menu JSON Data
                </label>

                <textarea
                  rows="6"
                  placeholder={`[
  {
    "name": "Chicken Biryani",
    "price": 320,
    "category": "Main Course",
    "is_veg": false,
    "description": "Aromatic basmati rice with tender chicken.",
    "food_type": "non-veg",
    "reorder_mode": "auto"
  }
]`}
                  value={
                    swiggyDataInput
                  }
                  onChange={(e) =>
                    setSwiggyDataInput(
                      e.target.value
                    )
                  }
                  className="w-full bg-neutral-950 text-white font-mono text-xs border border-neutral-800 rounded-xl p-4 focus:outline-none focus:border-orange-500"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={
                  syncingSwiggy
                }
                className="w-full bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-3.5 rounded-xl text-xs transition shadow-lg shadow-orange-500/25 hover:opacity-95"
              >
                {syncingSwiggy
                  ? 'Syncing Menu Items...'
                  : 'Sync Swiggy Menu Now 🔄'}
              </button>
            </form>
          </div>
        )}

        {/* TAB 6: PAYMENT GATEWAYS */}
        {activeTab ===
          'gateway' && (
          <div className="bg-neutral-900 border border-neutral-800 p-8 rounded-3xl max-w-xl mx-auto space-y-6 shadow-xl">

            <div className="space-y-2 text-center">
              <span className="text-[10px] font-extrabold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full uppercase tracking-widest">
                Gateway Configurations
              </span>

              <h2 className="text-xl font-black text-white">
                Manage Your Payment Gateways
              </h2>

              <p className="text-xs text-neutral-400">
                Configure your individual Razorpay credentials securely.
              </p>
            </div>

            {!isGatewayEditable ? (
              <div className="space-y-4 bg-neutral-950 p-6 rounded-2xl border border-neutral-800 text-center">

                <div className="flex items-center justify-center space-x-2 text-emerald-400 font-bold text-xs bg-emerald-500/10 border border-emerald-500/20 py-2 rounded-xl">
                  <span>
                    🔒 Gateway Credentials Securely Saved
                  </span>
                </div>

                <div className="space-y-3 text-left">

                  <div>
                    <label className="text-[10px] uppercase font-bold text-neutral-500 block">
                      Razorpay Key ID
                    </label>

                    <p className="font-mono text-xs text-white bg-neutral-900 p-2.5 rounded-xl border border-neutral-800">
                      {razorpayKeyId
                        ? razorpayKeyId
                        : 'Not Configured'}
                    </p>
                  </div>

                  <div>
                    <label className="text-[10px] uppercase font-bold text-neutral-500 block">
                      Razorpay Key Secret
                    </label>

                    <p className="font-mono text-xs text-white bg-neutral-900 p-2.5 rounded-xl border border-neutral-800">
                      {razorpaySecret
                        ? '••••••••••••••••••••••••'
                        : 'Not Configured'}
                    </p>
                  </div>

                  <div className="flex justify-between items-center text-xs bg-neutral-900 p-3 rounded-xl border border-neutral-800">
                    <span className="text-neutral-400 font-bold">
                      Pay at Counter (Cash):
                    </span>

                    <span
                      className={`font-bold uppercase ${
                        enableCounterPayment
                          ? 'text-emerald-400'
                          : 'text-red-400'
                      }`}
                    >
                      {enableCounterPayment
                        ? 'Enabled ✅'
                        : 'Disabled ❌'}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() =>
                    setIsGatewayEditable(
                      true
                    )
                  }
                  className="w-full bg-neutral-800 hover:bg-neutral-700 text-orange-400 font-black py-3 rounded-xl text-xs uppercase tracking-wider transition border border-neutral-700 mt-2"
                >
                  ✏️ Edit Gateway Credentials
                </button>
              </div>
            ) : (
              <form
                onSubmit={
                  handleSavePaymentSettings
                }
                className="space-y-4"
              >

                <div>
                  <label className="text-xs font-bold text-neutral-300 block mb-1">
                    Razorpay Key ID
                  </label>

                  <input
                    type="text"
                    placeholder="rzp_live_xxxxxxxxxx"
                    value={
                      razorpayKeyId
                    }
                    onChange={(e) =>
                      setRazorpayKeyId(
                        e.target.value
                      )
                    }
                    className="w-full bg-neutral-950 text-white font-mono text-xs border border-neutral-800 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div>
                  <label className="text-xs font-bold text-neutral-300 block mb-1">
                    Razorpay Key Secret
                  </label>

                  <input
                    type="password"
                    placeholder="enter_secret_key"
                    value={
                      razorpaySecret
                    }
                    onChange={(e) =>
                      setRazorpaySecret(
                        e.target.value
                      )
                    }
                    className="w-full bg-neutral-950 text-white font-mono text-xs border border-neutral-800 rounded-xl px-4 py-3 focus:outline-none focus:border-orange-500"
                  />
                </div>

                <div className="flex items-center justify-between bg-neutral-950 p-4 rounded-2xl border border-neutral-800">
                  <div>
                    <p className="text-xs font-bold text-white">
                      Enable "Pay at Counter"
                    </p>

                    <p className="text-[10px] text-neutral-400">
                      Allow customers to choose cash or offline payments.
                    </p>
                  </div>

                  <input
                    type="checkbox"
                    checked={
                      enableCounterPayment
                    }
                    onChange={(e) =>
                      setEnableCounterPayment(
                        e.target.checked
                      )
                    }
                    className="w-5 h-5 accent-orange-500 rounded cursor-pointer"
                  />
                </div>

                <div className="flex space-x-2">

                  <button
                    type="submit"
                    disabled={
                      savingPayment
                    }
                    className="flex-1 bg-gradient-to-r from-orange-500 to-amber-500 text-white font-bold py-3.5 rounded-xl text-xs transition shadow-lg shadow-orange-500/25 hover:opacity-95"
                  >
                    {savingPayment
                      ? 'Saving...'
                      : 'Save & Lock Gateway 💾'}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setIsGatewayEditable(
                        false
                      )
                    }
                    className="bg-neutral-800 hover:bg-neutral-700 text-neutral-400 px-4 py-3.5 rounded-xl text-xs font-bold transition"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* TAB 7: REPORTS & SETTLEMENTS */}
        {activeTab ===
          'settlements' && (
          <div className="bg-neutral-900 border border-neutral-800 p-8 rounded-3xl max-w-xl mx-auto space-y-6 shadow-xl">

            <div className="text-center space-y-2">
              <span className="text-[10px] font-extrabold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-3 py-1 rounded-full uppercase tracking-widest">
                Financial Reporting & Payouts
              </span>

              <h2 className="text-xl font-black text-white">
                Order & Revenue Reports
              </h2>
            </div>

            <div className="grid grid-cols-4 gap-2 bg-neutral-950 p-1.5 rounded-2xl border border-neutral-800">

              <button
                onClick={() =>
                  handleReportTimeframeChange(
                    'daily'
                  )
                }
                className={`py-2 rounded-xl text-[11px] font-bold transition ${
                  reportTimeframe ===
                  'daily'
                    ? 'bg-orange-500 text-white'
                    : 'text-neutral-400'
                }`}
              >
                Daily
              </button>

              <button
                onClick={() =>
                  handleReportTimeframeChange(
                    'weekly'
                  )
                }
                className={`py-2 rounded-xl text-[11px] font-bold transition ${
                  reportTimeframe ===
                  'weekly'
                    ? 'bg-orange-500 text-white'
                    : 'text-neutral-400'
                }`}
              >
                Weekly
              </button>

              <button
                onClick={() =>
                  handleReportTimeframeChange(
                    'monthly'
                  )
                }
                className={`py-2 rounded-xl text-[11px] font-bold transition ${
                  reportTimeframe ===
                  'monthly'
                    ? 'bg-orange-500 text-white'
                    : 'text-neutral-400'
                }`}
              >
                Monthly
              </button>

              <button
                onClick={() =>
                  handleReportTimeframeChange(
                    'yearly'
                  )
                }
                className={`py-2 rounded-xl text-[11px] font-bold transition ${
                  reportTimeframe ===
                  'yearly'
                    ? 'bg-amber-500 text-neutral-950 font-black'
                    : 'text-neutral-400'
                }`}
              >
                Yearly{' '}
                {currentPlan !==
                  'Pro+' &&
                  '🔒'}
              </button>
            </div>

            <div className="bg-neutral-950 border border-neutral-800 p-6 rounded-2xl text-center space-y-1">
              <p className="text-xs font-bold uppercase text-neutral-500">

                {reportTimeframe ===
                  'daily' &&
                  'Daily Revenue Report'}

                {reportTimeframe ===
                  'weekly' &&
                  'Weekly Revenue Report'}

                {reportTimeframe ===
                  'monthly' &&
                  'Monthly Revenue Report'}

                {reportTimeframe ===
                  'yearly' &&
                  'Yearly Pro+ Audit Report'}
              </p>

              <p className="text-3xl font-black text-emerald-400">
                ₹{totalRevenue}
              </p>

              <p className="text-[10px] text-neutral-500 pt-1">
                Active Membership Tier:{' '}
                <strong className="text-amber-400">
                  {currentPlan}
                </strong>
              </p>
            </div>

            <button
              onClick={() =>
                alert(
                  'Payout requested successfully!'
                )
              }
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-bold py-3.5 rounded-xl text-xs transition shadow"
            >
              Request Bank Payout 🏦
            </button>
          </div>
        )}

      </main>

      {/* Embedded Real-Time Restaurant Chat Widget */}
      <RestaurantChatWidget
        restaurantId={restaurantId}
      />
    </div>
  )
}