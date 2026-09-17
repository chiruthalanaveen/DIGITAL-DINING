'use client'

import { use, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'

const EMPTY_DISH = {
  name: '', price: '', original_price: '', offer_price: '', category: '',
  description: '', image_url: '', food_type: 'veg', reorder_mode: 'auto', addons: ''
}
const EMPTY_OFFER = {
  title: '', description: '', discount_text: '', original_price: '',
  offer_price: '', offer_date: new Date().toLocaleDateString('en-CA'), image_url: ''
}

const money = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`

const csvCell = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`

function Input({ label, value, onChange, type = 'text', placeholder = '' }) {
  return (
    <div>
      <label className="mb-1 block text-[10px] font-black uppercase text-neutral-400">{label}</label>
      <input
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-xs text-white outline-none focus:border-orange-500"
      />
    </div>
  )
}

function Stat({ title, value, accent = 'text-white' }) {
  return (
    <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
      <p className="text-[10px] font-black uppercase tracking-wider text-neutral-500">{title}</p>
      <p className={`mt-2 text-2xl font-black ${accent}`}>{value}</p>
    </div>
  )
}

function RestaurantChatWidget({ restaurantId }) {
  const [open, setOpen] = useState(false)
  const [messages, setMessages] = useState([])
  const [text, setText] = useState('')
  const endRef = useRef(null)

  useEffect(() => {
    if (!open || !restaurantId) return
    let active = true

    const load = async () => {
      const { data, error } = await supabase
        .from('messages')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .order('created_at', { ascending: true })

      if (!error && active) setMessages(data || [])
    }

    load()

    const channel = supabase
      .channel(`manager-support-chat-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `restaurant_id=eq.${restaurantId}`
        },
        (payload) => setMessages((current) => [...current, payload.new])
      )
      .subscribe()

    return () => {
      active = false
      supabase.removeChannel(channel)
    }
  }, [open, restaurantId])

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const send = async (event) => {
    event.preventDefault()
    const message = text.trim()
    if (!message || !restaurantId) return
    setText('')
    const { error } = await supabase.from('messages').insert({
      restaurant_id: restaurantId,
      sender: 'restaurant',
      message
    })
    if (error) alert(`Unable to send message: ${error.message}`)
  }

  return (
    <div className="fixed bottom-5 right-5 z-50">
      {!open ? (
        <button onClick={() => setOpen(true)} className="rounded-full bg-orange-500 px-5 py-4 text-xs font-black text-white shadow-2xl">
          💬 Support Chat
        </button>
      ) : (
        <div className="flex h-[450px] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-950 shadow-2xl">
          <div className="flex items-center justify-between border-b border-neutral-800 p-4">
            <h3 className="text-xs font-black uppercase text-white">Restaurant Support</h3>
            <button onClick={() => setOpen(false)} className="text-neutral-400">✕</button>
          </div>
          <div className="flex-1 space-y-3 overflow-y-auto p-4">
            {!messages.length && <p className="mt-12 text-center text-xs text-neutral-500">No messages yet.</p>}
            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.sender === 'restaurant' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-xs ${
                  message.sender === 'restaurant'
                    ? 'rounded-br-none bg-orange-500 text-white'
                    : 'rounded-bl-none border border-neutral-700 bg-neutral-800 text-neutral-200'
                }`}>
                  {message.message}
                </div>
              </div>
            ))}
            <div ref={endRef} />
          </div>
          <form onSubmit={send} className="flex gap-2 border-t border-neutral-800 p-3">
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Type your message..." className="min-w-0 flex-1 rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-xs text-white outline-none" />
            <button className="rounded-xl bg-orange-500 px-4 text-xs font-black text-white">Send</button>
          </form>
        </div>
      )}
    </div>
  )
}

export default function RestaurantManagerDashboard({ params }) {
  const routeParams = use(params)
  const restaurantId = routeParams?.restaurantId || routeParams?.id

  const [authenticated, setAuthenticated] = useState(false)
  const [manager, setManager] = useState(null)
  const [loginUserId, setLoginUserId] = useState('')
  const [loginPassword, setLoginPassword] = useState('')
  const [loginLoading, setLoginLoading] = useState(false)

  const [restaurant, setRestaurant] = useState(null)
  const [menuItems, setMenuItems] = useState([])
  const [dailyOffers, setDailyOffers] = useState([])
  const [orders, setOrders] = useState([])
  const [staffList, setStaffList] = useState([])
  const [activeTab, setActiveTab] = useState('settlements')
  const [loading, setLoading] = useState(false)
  const [notice, setNotice] = useState('')

  const [dish, setDish] = useState(EMPTY_DISH)
  const [editingDishId, setEditingDishId] = useState(null)
  const [savingDish, setSavingDish] = useState(false)

  const [offer, setOffer] = useState(EMPTY_OFFER)
  const [editingOfferId, setEditingOfferId] = useState(null)
  const [savingOffer, setSavingOffer] = useState(false)

  const [staffName, setStaffName] = useState('')
  const [staffUserId, setStaffUserId] = useState('')
  const [staffPassword, setStaffPassword] = useState('')
  const [staffRole, setStaffRole] = useState('waiter')
  const [savingStaff, setSavingStaff] = useState(false)

  const [reportTimeframe, setReportTimeframe] = useState('daily')
  const [swiggyDataInput, setSwiggyDataInput] = useState('')
  const [syncingSwiggy, setSyncingSwiggy] = useState(false)
  const [storeOpen, setStoreOpen] = useState(true)

  const notify = (message) => {
    setNotice(message)
    window.setTimeout(() => setNotice(''), 3500)
  }

  const fetchDashboard = useCallback(async () => {
    if (!restaurantId) return
    setLoading(true)
    try {
      const [restaurantResult, menuResult, offerResult, orderResult, staffResult] = await Promise.all([
        supabase.from('restaurants').select('*').eq('id', restaurantId).maybeSingle(),
        supabase.from('menu_items').select('*').eq('restaurant_id', restaurantId).order('name', { ascending: true }),
        supabase.from('daily_offers').select('*').eq('restaurant_id', restaurantId).order('offer_date', { ascending: false }),
        supabase.from('orders').select('*').eq('restaurant_id', restaurantId).order('created_at', { ascending: false }),
        supabase.from('staff_users').select('id, restaurant_id, name, user_id, role').eq('restaurant_id', restaurantId).in('role', ['waiter', 'kitchen']).order('name', { ascending: true })
      ])

      if (restaurantResult.error) throw restaurantResult.error
      if (menuResult.error) throw menuResult.error
      if (orderResult.error) throw orderResult.error

      setRestaurant(restaurantResult.data || null)
      setMenuItems(menuResult.data || [])
      setDailyOffers(offerResult.error ? [] : (offerResult.data || []))
      setOrders(orderResult.data || [])
      setStaffList(staffResult.error ? [] : (staffResult.data || []))
      setStoreOpen(restaurantResult.data?.is_open ?? true)
    } catch (error) {
      console.error('Manager dashboard loading error:', error)
      setNotice(`Loading issue: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }, [restaurantId])

  const handleLogin = async (event) => {
    event.preventDefault()
    if (!restaurantId || !loginUserId.trim() || !loginPassword.trim()) {
      alert('Enter your Manager User ID and password.')
      return
    }

    setLoginLoading(true)
    try {
      const { data, error } = await supabase
        .from('staff_users')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('user_id', loginUserId.trim().toLowerCase())
        .eq('password', loginPassword.trim())
        .eq('role', 'manager')
        .maybeSingle()

      if (error || !data) throw new Error('Invalid Manager credentials.')
      setManager(data)
      setAuthenticated(true)
      await fetchDashboard()
    } catch (error) {
      console.error(error)
      alert(error.message || 'Unable to sign in.')
    } finally {
      setLoginLoading(false)
    }
  }

  useEffect(() => {
    if (!authenticated || !restaurantId) return undefined

    const channel = supabase
      .channel(`manager-live-orders-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          setOrders((current) => {
            if (current.some((order) => String(order.id) === String(payload.new.id))) {
              return current
            }
            return [payload.new, ...current]
          })
          setNotice('🔔 New order received')
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          setOrders((current) =>
            current.map((order) =>
              String(order.id) === String(payload.new.id) ? payload.new : order,
            ),
          )
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        (payload) => {
          setOrders((current) =>
            current.filter((order) => String(order.id) !== String(payload.old.id)),
          )
        },
      )
      .subscribe((status) => {
        if (status === 'CHANNEL_ERROR') {
          console.error('Live order subscription failed')
        }
      })

    return () => {
      supabase.removeChannel(channel)
    }
  }, [authenticated, restaurantId])

  useEffect(() => {
    if (!authenticated) return undefined
    const interval = window.setInterval(fetchDashboard, 15000)
    return () => window.clearInterval(interval)
  }, [authenticated, fetchDashboard])

  const planLimits = { Standard: 20, Pro: 50, 'Pro+': Infinity }
  const currentPlan = restaurant?.plan || 'Standard'
  const maxMenuAllowed = planLimits[currentPlan] ?? 20

  const getItemOrderCount = useCallback((item) => {
    return orders.reduce((total, order) => {
      if (order?.status === 'cancelled' || !Array.isArray(order?.items)) return total
      return total + order.items.reduce((count, orderedItem) => {
        const sameId = String(orderedItem?.id || '') === String(item?.id || '')
        const sameMenuId = String(orderedItem?.menu_item_id || '') === String(item?.id || '')
        const sameName = String(orderedItem?.name || '').trim().toLowerCase() === String(item?.name || '').trim().toLowerCase()
        return count + (sameId || sameMenuId || sameName ? Number(orderedItem?.qty || orderedItem?.quantity || 1) : 0)
      }, 0)
    }, 0)
  }, [orders])

  const automaticHighlyReorderedIds = useMemo(() => {
    const ranked = menuItems.map((item) => ({ id: item.id, count: getItemOrderCount(item) }))
      .filter((item) => item.count > 0)
      .sort((a, b) => b.count - a.count)
    if (!ranked.length) return new Set()
    const topCount = Math.max(1, Math.ceil(ranked.length * 0.25))
    const threshold = ranked[topCount - 1]?.count || 0
    return new Set(ranked.filter((item) => item.count >= Math.max(5, threshold)).map((item) => item.id))
  }, [menuItems, getItemOrderCount])

  const isHighlyReordered = (item) => {
    if (item.reorder_mode === 'on') return true
    if (item.reorder_mode === 'off') return false
    return automaticHighlyReorderedIds.has(item.id)
  }

  const resetDish = () => {
    setDish(EMPTY_DISH)
    setEditingDishId(null)
  }

  const startEditDish = (item) => {
    setEditingDishId(item.id)
    setDish({
      name: item.name || '',
      price: item.price ?? '',
      original_price: item.original_price ?? '',
      offer_price: item.offer_price ?? '',
      category: item.category || '',
      description: item.description || '',
      image_url: item.image_url || '',
      food_type: item.food_type || (item.is_veg ? 'veg' : 'non-veg'),
      reorder_mode: item.reorder_mode || 'auto',
      addons: Array.isArray(item.addons) ? item.addons.join(', ') : ''
    })
    setActiveTab('menu')
  }

  const saveDish = async (event) => {
    event.preventDefault()
    const name = dish.name.trim()
    const price = Number(dish.price)
    if (!name || !Number.isFinite(price) || price <= 0) {
      alert('Enter a valid dish name and price.')
      return
    }
    if (!editingDishId && menuItems.length >= maxMenuAllowed) {
      alert(`Your ${currentPlan} plan allows ${maxMenuAllowed} menu items.`)
      return
    }

    const originalPrice = dish.original_price === '' ? null : Number(dish.original_price)
    const offerPrice = dish.offer_price === '' ? null : Number(dish.offer_price)
    if (originalPrice !== null && (!Number.isFinite(originalPrice) || originalPrice <= 0)) return alert('Enter a valid original price.')
    if (offerPrice !== null && (!Number.isFinite(offerPrice) || offerPrice <= 0)) return alert('Enter a valid offer price.')
    if (originalPrice !== null && offerPrice !== null && offerPrice >= originalPrice) return alert('Offer price must be lower than original price.')

    setSavingDish(true)
    const payload = {
      restaurant_id: restaurantId,
      name,
      price: offerPrice !== null ? offerPrice : price,
      original_price: originalPrice,
      offer_price: offerPrice,
      category: dish.category.trim() || 'Other',
      description: dish.description.trim(),
      image_url: dish.image_url.trim() || null,
      is_veg: dish.food_type === 'veg',
      food_type: dish.food_type,
      reorder_mode: dish.reorder_mode,
      addons: dish.addons.split(',').map((value) => value.trim()).filter(Boolean)
    }

    try {
      const query = editingDishId
        ? supabase.from('menu_items').update(payload).eq('id', editingDishId).eq('restaurant_id', restaurantId).select('*').single()
        : supabase.from('menu_items').insert(payload).select('*').single()
      const { data, error } = await query
      if (error) throw error

      if (editingDishId) setMenuItems((items) => items.map((item) => item.id === editingDishId ? data : item))
      else setMenuItems((items) => [data, ...items])
      resetDish()
      notify(editingDishId ? 'Dish updated successfully.' : 'Dish added successfully.')
    } catch (error) {
      console.error(error)
      alert(`Unable to save dish: ${error.message}`)
    } finally {
      setSavingDish(false)
    }
  }

  const deleteDish = async (item) => {
    if (!window.confirm(`Delete ${item.name}?`)) return
    const { error } = await supabase.from('menu_items').delete().eq('id', item.id).eq('restaurant_id', restaurantId)
    if (error) return alert(`Unable to delete dish: ${error.message}`)
    setMenuItems((items) => items.filter((value) => value.id !== item.id))
    notify('Dish deleted.')
  }

  const toggleAvailability = async (item) => {
    const next = item.is_available === false
    const { error } = await supabase.from('menu_items').update({ is_available: next }).eq('id', item.id).eq('restaurant_id', restaurantId)
    if (error) return alert(`Unable to update availability: ${error.message}`)
    setMenuItems((items) => items.map((value) => value.id === item.id ? { ...value, is_available: next } : value))
  }

  const resetOffer = () => {
    setOffer({ ...EMPTY_OFFER, offer_date: new Date().toLocaleDateString('en-CA') })
    setEditingOfferId(null)
  }

  const saveOffer = async (event) => {
    event.preventDefault()
    if (!offer.title.trim() || !offer.offer_price || Number(offer.offer_price) <= 0) {
      alert('Enter an offer title and valid offer price.')
      return
    }

    setSavingOffer(true)
    const payload = {
      restaurant_id: restaurantId,
      title: offer.title.trim(),
      description: offer.description.trim(),
      discount_text: offer.discount_text.trim(),
      original_price: offer.original_price === '' ? null : Number(offer.original_price),
      offer_price: Number(offer.offer_price),
      offer_date: offer.offer_date,
      image_url: offer.image_url.trim() || null,
      is_active: true
    }

    try {
      const query = editingOfferId
        ? supabase.from('daily_offers').update(payload).eq('id', editingOfferId).eq('restaurant_id', restaurantId).select('*').single()
        : supabase.from('daily_offers').insert(payload).select('*').single()
      const { data, error } = await query
      if (error) throw error
      if (editingOfferId) setDailyOffers((items) => items.map((item) => item.id === editingOfferId ? data : item))
      else setDailyOffers((items) => [data, ...items])
      resetOffer()
      notify(editingOfferId ? 'Offer updated.' : 'Offer created.')
    } catch (error) {
      console.error(error)
      alert(`Unable to save offer: ${error.message}`)
    } finally {
      setSavingOffer(false)
    }
  }

  const editOffer = (item) => {
    setEditingOfferId(item.id)
    setOffer({
      title: item.title || '',
      description: item.description || '',
      discount_text: item.discount_text || '',
      original_price: item.original_price ?? '',
      offer_price: item.offer_price ?? '',
      offer_date: item.offer_date || item.date || new Date().toLocaleDateString('en-CA'),
      image_url: item.image_url || ''
    })
  }

  const deleteOffer = async (item) => {
    if (!window.confirm(`Delete offer ${item.title}?`)) return
    const { error } = await supabase.from('daily_offers').delete().eq('id', item.id).eq('restaurant_id', restaurantId)
    if (error) return alert(`Unable to delete offer: ${error.message}`)
    setDailyOffers((items) => items.filter((value) => value.id !== item.id))
    notify('Offer deleted.')
  }

  const toggleOffer = async (item) => {
    const next = item.is_active === false
    const { error } = await supabase.from('daily_offers').update({ is_active: next }).eq('id', item.id).eq('restaurant_id', restaurantId)
    if (error) return alert(`Unable to update offer: ${error.message}`)
    setDailyOffers((items) => items.map((value) => value.id === item.id ? { ...value, is_active: next } : value))
  }

  const saveStaff = async (event) => {
    event.preventDefault()
    const name = staffName.trim()
    const userId = staffUserId.trim().toLowerCase()
    const password = staffPassword.trim()
    if (!name || !userId || !password) return alert('Fill in all staff fields.')
    if (!/^[a-zA-Z0-9._-]{3,40}$/.test(userId)) return alert('User ID must be 3–40 characters.')
    if (password.length < 4) return alert('Password/PIN must contain at least 4 characters.')

    setSavingStaff(true)
    try {
      const { data, error } = await supabase
        .from('staff_users')
        .insert({
          restaurant_id: restaurantId,
          name,
          user_id: userId,
          password,
          pin: password,
          role: staffRole
        })
        .select('id, restaurant_id, name, user_id, role')
        .single()
      if (error) throw error
      setStaffList((items) => [data, ...items])
      setStaffName('')
      setStaffUserId('')
      setStaffPassword('')
      notify(`${staffRole === 'waiter' ? 'Waiter' : 'Kitchen'} account created.`)
    } catch (error) {
      console.error(error)
      alert(`Unable to create staff account: ${error.message}`)
    } finally {
      setSavingStaff(false)
    }
  }

  const revokeStaff = async (staff) => {
    if (!window.confirm(`Revoke ${staff.name}'s account?`)) return
    const { error } = await supabase.from('staff_users').delete().eq('id', staff.id).eq('restaurant_id', restaurantId).in('role', ['waiter', 'kitchen'])
    if (error) return alert(`Unable to revoke account: ${error.message}`)
    setStaffList((items) => items.filter((item) => item.id !== staff.id))
    notify('Staff account revoked.')
  }

  const updateOrderStatus = async (orderId, nextStatus) => {
    if (!orderId || !restaurantId || !nextStatus) return

    try {
      /*
       * Do not use .select().single() after this UPDATE.
       * With Supabase RLS, an UPDATE can succeed while the updated
       * row is not returned to the browser. That causes:
       * "Cannot coerce the result to a single JSON object".
       */
      const { error } = await supabase
        .from('orders')
        .update({ status: nextStatus })
        .eq('id', orderId)
        .eq('restaurant_id', restaurantId)

      if (error) {
        console.error('Order status update error:', error)
        alert(`Unable to update order: ${error.message}`)
        return
      }

      /*
       * Update this dashboard immediately. The same database update
       * is then delivered to the kitchen, customer QR page, and any
       * other subscribed POS screen through Supabase Realtime.
       */
      setOrders((items) =>
        items.map((item) =>
          String(item.id) === String(orderId)
            ? { ...item, status: nextStatus }
            : item
        )
      )

      const selectedOrder = orders.find(
        (item) => String(item.id) === String(orderId)
      )

      notify(
        `Order #${
          selectedOrder?.order_number || String(orderId).slice(0, 8)
        } marked ${nextStatus}.`
      )
    } catch (error) {
      console.error('Unexpected order status update error:', error)
      alert(`Unable to update order: ${error.message || 'Unknown error'}`)
    }
  }

  const handleStoreToggle = async () => {
    const next = !storeOpen
    const { error } = await supabase.from('restaurants').update({ is_open: next }).eq('id', restaurantId)
    if (error) return alert(`Unable to update store status: ${error.message}`)
    setStoreOpen(next)
    setRestaurant((value) => ({ ...value, is_open: next }))
    notify(next ? 'Restaurant is now open.' : 'Restaurant is now closed.')
  }

  const handleSwiggySync = async (event) => {
    event.preventDefault()
    if (!swiggyDataInput.trim()) return alert('Paste valid menu JSON data.')
    let items
    try {
      items = JSON.parse(swiggyDataInput)
      if (!Array.isArray(items)) throw new Error('JSON must be an array.')
    } catch (error) {
      return alert(`Invalid JSON: ${error.message}`)
    }

    setSyncingSwiggy(true)
    try {
      const rows = items.map((item) => ({
        restaurant_id: restaurantId,
        name: String(item.name || '').trim(),
        price: Number(item.price || 0),
        category: item.category || 'Other',
        description: item.description || '',
        image_url: item.image_url || item.imageUrl || null,
        is_veg: Boolean(item.is_veg),
        food_type: item.food_type || (item.is_veg ? 'veg' : 'non-veg'),
        reorder_mode: item.reorder_mode || 'auto',
        addons: Array.isArray(item.addons) ? item.addons : [],
        is_available: true
      })).filter((item) => item.name && item.price > 0)

      if (!rows.length) throw new Error('No valid menu items found.')
      const { data, error } = await supabase.from('menu_items').insert(rows).select('*')
      if (error) throw error
      setMenuItems((current) => [...(data || []), ...current])
      setSwiggyDataInput('')
      notify(`${data?.length || rows.length} menu items imported.`)
    } catch (error) {
      console.error(error)
      alert(`Unable to sync menu: ${error.message}`)
    } finally {
      setSyncingSwiggy(false)
    }
  }

  const reportOrders = useMemo(() => {
    const now = new Date()
    const start = new Date(now)
    if (reportTimeframe === 'daily') start.setHours(0, 0, 0, 0)
    if (reportTimeframe === 'weekly') {
      const day = start.getDay()
      start.setDate(start.getDate() - (day === 0 ? 6 : day - 1))
      start.setHours(0, 0, 0, 0)
    }
    if (reportTimeframe === 'monthly') {
      start.setDate(1)
      start.setHours(0, 0, 0, 0)
    }
    if (reportTimeframe === 'yearly') {
      start.setMonth(0, 1)
      start.setHours(0, 0, 0, 0)
    }
    return orders.filter((order) => order.status !== 'cancelled' && order.created_at && new Date(order.created_at) >= start)
  }, [orders, reportTimeframe])

  const reportStats = useMemo(() => {
    const sales = reportOrders.reduce((sum, order) => sum + Number(order.total_amount ?? order.total ?? 0), 0)
    return { orders: reportOrders.length, sales, average: reportOrders.length ? sales / reportOrders.length : 0 }
  }, [reportOrders])

  const hourlyData = useMemo(() => {
    const hours = Array.from({ length: 24 }, (_, hour) => ({ hour, orders: 0, sales: 0 }))
    reportOrders.forEach((order) => {
      const hour = new Date(order.created_at).getHours()
      hours[hour].orders += 1
      hours[hour].sales += Number(order.total_amount ?? order.total ?? 0)
    })
    return hours.filter((item) => item.orders > 0)
  }, [reportOrders])

  const peakHour = useMemo(() => {
    if (!hourlyData.length) return null
    return [...hourlyData].sort((a, b) => b.orders - a.orders || b.sales - a.sales)[0]
  }, [hourlyData])

  const totalRevenue = useMemo(() => orders.filter((order) => order.status !== 'cancelled').reduce((sum, order) => sum + Number(order.total_amount ?? order.total ?? 0), 0), [orders])
  const todayOrders = useMemo(() => {
    const start = new Date()
    start.setHours(0, 0, 0, 0)
    return orders.filter((order) => order.created_at && new Date(order.created_at) >= start && order.status !== 'cancelled')
  }, [orders])
  const activeOrders = useMemo(() => orders.filter((order) => !['completed', 'cancelled', 'delivered'].includes(String(order.status || '').toLowerCase())), [orders])

  const downloadReport = () => {
    const rows = [
      ['Restaurant', restaurant?.name || ''],
      ['Report Period', reportTimeframe],
      ['Orders', reportStats.orders],
      ['Sales', reportStats.sales.toFixed(2)],
      ['Average Order Value', reportStats.average.toFixed(2)],
      ['Peak Hour', peakHour ? `${String(peakHour.hour).padStart(2, '0')}:00` : 'N/A'],
      [],
      ['Order ID', 'Date & Time', 'Payment Mode', 'Status', 'Amount'],
      ...reportOrders.map((order) => [
        order.id,
        new Date(order.created_at).toLocaleString('en-IN'),
        order.payment_mode || '',
        order.status || '',
        Number(order.total_amount ?? order.total ?? 0).toFixed(2)
      ])
    ]
    const csv = rows.map((row) => row.map(csvCell).join(',')).join('\n')
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }))
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `restaurant-manager-${reportTimeframe}-${new Date().toLocaleDateString('en-CA')}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  const logout = () => {
    setAuthenticated(false)
    setManager(null)
    setOrders([])
    setMenuItems([])
    setDailyOffers([])
    setStaffList([])
    setLoginPassword('')
  }

  if (!authenticated) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-neutral-950 p-4 text-neutral-100">
        <form onSubmit={handleLogin} className="w-full max-w-sm space-y-4 rounded-3xl border border-neutral-800 bg-neutral-900 p-8 shadow-2xl">
          <div className="mb-6 text-center">
            <div className="mb-3 text-5xl">🧑‍💼</div>
            <h1 className="text-2xl font-black">Restaurant Manager</h1>
            <p className="mt-2 text-xs text-neutral-500">Sign in to manage restaurant operations</p>
          </div>
          <input value={loginUserId} onChange={(e) => setLoginUserId(e.target.value)} placeholder="Manager User ID" autoComplete="username" required className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-orange-500" />
          <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="Password / PIN" autoComplete="current-password" required className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-orange-500" />
          <button disabled={loginLoading} className="w-full rounded-xl bg-orange-500 py-3 text-sm font-black uppercase text-white disabled:opacity-50">
            {loginLoading ? 'Signing in...' : 'Open Manager Dashboard'}
          </button>
        </form>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-neutral-950 p-3 text-neutral-100 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-5">
        <header className="flex flex-col justify-between gap-4 border-b border-neutral-800 pb-5 lg:flex-row lg:items-center">
          <div>
            <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-orange-400">Restaurant Manager Portal</span>
            <h1 className="mt-3 text-2xl font-black sm:text-3xl">{restaurant?.name || 'Restaurant'} Manager Dashboard</h1>
            <p className="mt-1 text-xs text-neutral-500">Logged in as {manager?.name || manager?.user_id} · Operational access only</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={handleStoreToggle} className={`rounded-xl px-4 py-2.5 text-xs font-black ${storeOpen ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>{storeOpen ? '🟢 Store Open' : '🔴 Store Closed'}</button>
            <button onClick={fetchDashboard} className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-2.5 text-xs font-black">{loading ? 'Refreshing...' : '↻ Refresh'}</button>
            <button onClick={logout} className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-2.5 text-xs font-black text-red-400">Log Out ⎋</button>
          </div>
        </header>

        {notice && <div className="fixed right-5 top-5 z-50 rounded-xl bg-emerald-600 px-5 py-3 text-sm font-bold text-white shadow-2xl">{notice}</div>}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat title="Total Revenue" value={money(totalRevenue)} />
          <Stat title="Orders Today" value={todayOrders.length} accent="text-emerald-400" />
          <Stat title="Active Orders" value={activeOrders.length} accent="text-orange-400" />
          <Stat title="Menu Items" value={`${menuItems.length}/${maxMenuAllowed === Infinity ? '∞' : maxMenuAllowed}`} accent="text-amber-400" />
        </div>

        <nav className="flex gap-2 overflow-x-auto border-b border-neutral-800 pb-3">
          {[
            ['live-orders', `🔴 Live Orders (${activeOrders.length})`],
            ['settlements', '📊 Analytics & Reports'],
            ['menu', `🍔 Menu Catalog (${menuItems.length})`],
            ['staff', `👥 Waiter & Kitchen Staff (${staffList.length})`],
            ['offers', `🔥 Offers of the Day (${dailyOffers.filter((item) => item.is_active !== false).length})`],
            ['swiggy-sync', '🟠 Menu Import / Sync']
          ].map(([id, label]) => (
            <button key={id} onClick={() => setActiveTab(id)} className={`whitespace-nowrap rounded-2xl border px-4 py-2.5 text-xs font-black uppercase ${activeTab === id ? 'border-orange-500 bg-orange-500 text-white' : 'border-neutral-800 bg-neutral-900 text-neutral-400'}`}>
              {label}
            </button>
          ))}
        </nav>

        {activeTab === 'live-orders' && (
          <section className="space-y-5">
            <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
              <div>
                <span className="rounded-full border border-red-500/20 bg-red-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-red-400">
                  Real-time Order Monitor
                </span>
                <h2 className="mt-3 text-2xl font-black">Live Orders</h2>
                <p className="mt-2 text-xs text-neutral-400">
                  New orders appear automatically without refreshing this page.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-[10px] font-black text-emerald-300">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-400" />
                  LIVE
                </span>
                <button
                  onClick={fetchDashboard}
                  className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-2.5 text-xs font-black"
                >
                  ↻ Refresh
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat title="Active Orders" value={activeOrders.length} accent="text-orange-400" />
              <Stat title="Pending Orders" value={orders.filter((order) => String(order.status || 'pending').toLowerCase() === 'pending').length} accent="text-amber-400" />
              <Stat title="Ready Orders" value={orders.filter((order) => String(order.status || '').toLowerCase() === 'ready').length} accent="text-emerald-400" />
            </div>

            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              {activeOrders.map((order) => {
                const status = String(order.status || 'pending').toLowerCase()
                const orderItems = Array.isArray(order.items) ? order.items : []
                const orderAmount = Number(order.total_amount ?? order.total ?? 0)

                return (
                  <article
                    key={order.id}
                    className="rounded-3xl border border-orange-500/30 bg-neutral-900 p-5 shadow-lg shadow-orange-500/5"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="text-lg font-black text-white">
                          Order #{String(order.id).slice(0, 8)}
                        </p>
                        <p className="mt-1 text-[11px] text-neutral-500">
                          {order.created_at
                            ? new Date(order.created_at).toLocaleString('en-IN')
                            : 'Time unavailable'}
                        </p>
                      </div>
                      <span className="rounded-full bg-orange-500/15 px-3 py-1.5 text-[10px] font-black uppercase text-orange-300">
                        {status}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-3 rounded-2xl border border-neutral-800 bg-neutral-950/70 p-3 text-xs">
                      <div>
                        <p className="text-[10px] uppercase text-neutral-500">Customer</p>
                        <p className="mt-1 font-bold">{order.customer_name || order.name || 'Guest'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-neutral-500">Payment</p>
                        <p className="mt-1 font-bold">{order.payment_mode || order.payment_method || 'Not specified'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-neutral-500">Dining Mode</p>
                        <p className="mt-1 font-bold">{order.dining_mode || order.order_type || 'Dine-in'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] uppercase text-neutral-500">Total</p>
                        <p className="mt-1 font-black text-emerald-400">{money(orderAmount)}</p>
                      </div>
                    </div>

                    <div className="mt-4">
                      <p className="mb-2 text-[10px] font-black uppercase tracking-wider text-neutral-500">
                        Items
                      </p>
                      <div className="space-y-2">
                        {orderItems.length ? orderItems.map((item, index) => (
                          <div
                            key={`${order.id}-item-${index}`}
                            className="flex items-center justify-between gap-3 rounded-xl bg-neutral-950 px-3 py-2 text-xs"
                          >
                            <span className="font-semibold">
                              {item.qty || item.quantity || 1} × {item.name || item.title || 'Item'}
                            </span>
                            <span className="text-neutral-400">
                              {money(Number(item.price || 0) * Number(item.qty || item.quantity || 1))}
                            </span>
                          </div>
                        )) : (
                          <p className="text-xs text-neutral-500">Item details unavailable.</p>
                        )}
                      </div>
                    </div>

                    <div className="mt-5 flex flex-wrap items-center gap-2">
                      <label className="text-[10px] font-black uppercase text-neutral-500">Update status</label>
                      <select
                        value={order.status || 'pending'}
                        onChange={(event) => updateOrderStatus(order.id, event.target.value)}
                        className="flex-1 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-xs text-white"
                      >
                        <option value="pending">Pending</option>
                        <option value="confirmed">Confirmed</option>
                        <option value="preparing">Preparing</option>
                        <option value="ready">Ready</option>
                        <option value="completed">Completed</option>
                        <option value="delivered">Delivered</option>
                        <option value="cancelled">Cancelled</option>
                      </select>
                    </div>
                  </article>
                )
              })}
            </div>

            {!activeOrders.length && (
              <div className="rounded-3xl border border-dashed border-neutral-800 bg-neutral-900 p-14 text-center">
                <div className="text-5xl">🧾</div>
                <h3 className="mt-4 text-lg font-black">No active orders</h3>
                <p className="mt-2 text-xs text-neutral-500">
                  New customer orders will appear here instantly.
                </p>
              </div>
            )}
          </section>
        )}

        {activeTab === 'settlements' && (
          <section className="space-y-5">
            <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
              <div>
                <span className="rounded-full border border-amber-500/20 bg-amber-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-amber-400">Restaurant Analytics</span>
                <h2 className="mt-3 text-2xl font-black">Sales & Order Reports</h2>
                <p className="mt-2 text-xs text-neutral-400">Review order volume, revenue, average order value, and order timing.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <select value={reportTimeframe} onChange={(e) => setReportTimeframe(e.target.value)} className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2.5 text-xs text-white">
                  <option value="daily">Today</option>
                  <option value="weekly">This Week</option>
                  <option value="monthly">This Month</option>
                  <option value="yearly">This Year</option>
                </select>
                <button onClick={downloadReport} className="rounded-xl bg-orange-500 px-4 py-2.5 text-xs font-black">Generate CSV 📥</button>
                <button onClick={() => window.print()} className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-2.5 text-xs font-black">Print 🖨️</button>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Stat title="Orders Generated" value={reportStats.orders} />
              <Stat title="Sales Generated" value={money(reportStats.sales)} accent="text-emerald-400" />
              <Stat title="Average Order Value" value={money(reportStats.average)} accent="text-orange-400" />
            </div>

            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                <h3 className="font-black">Orders by Hour</h3>
                <p className="mt-1 text-xs text-neutral-500">Order activity during the selected period.</p>
                {!hourlyData.length ? <p className="py-12 text-center text-sm text-neutral-500">No orders in this period.</p> : (
                  <div className="mt-5 space-y-3">
                    {hourlyData.map((item) => {
                      const maximum = Math.max(...hourlyData.map((value) => value.orders), 1)
                      return (
                        <div key={item.hour}>
                          <div className="mb-1 flex justify-between text-xs"><span>{String(item.hour).padStart(2, '0')}:00–{String((item.hour + 1) % 24).padStart(2, '0')}:00</span><span>{item.orders} orders · {money(item.sales)}</span></div>
                          <div className="h-3 overflow-hidden rounded-full bg-neutral-950"><div className="h-full rounded-full bg-orange-500" style={{ width: `${Math.max(5, (item.orders / maximum) * 100)}%` }} /></div>
                        </div>
                      )
                    })}
                  </div>
                )}
                {peakHour && <div className="mt-5 rounded-xl border border-orange-500/20 bg-orange-500/10 p-3 text-xs text-orange-300">Peak order time: <strong>{String(peakHour.hour).padStart(2, '0')}:00–{String((peakHour.hour + 1) % 24).padStart(2, '0')}:00</strong></div>}
              </div>

              <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                <h3 className="font-black">Order Report Details</h3>
                <div className="mt-4 space-y-3">
                  {reportOrders.slice(0, 20).map((order) => (
                    <div key={order.id} className="flex justify-between gap-3 border-b border-neutral-800 pb-3">
                      <div>
                        <p className="text-xs font-bold">Order #{String(order.id).slice(0, 8)}</p>
                        <p className="mt-1 text-[11px] text-neutral-500">{new Date(order.created_at).toLocaleString('en-IN')} · {order.payment_mode || 'Payment not specified'}</p>
                      </div>
                      <span className="text-xs font-black">{money(order.total_amount ?? order.total)}</span>
                    </div>
                  ))}
                  {!reportOrders.length && <p className="py-12 text-center text-sm text-neutral-500">No report records available.</p>}
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
              <h3 className="font-black">Recent Orders & Status Management</h3>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[650px] text-left text-xs">
                  <thead className="border-b border-neutral-800 text-neutral-500"><tr><th className="p-3">Order</th><th className="p-3">Date</th><th className="p-3">Amount</th><th className="p-3">Status</th><th className="p-3">Update</th></tr></thead>
                  <tbody>
                    {orders.slice(0, 30).map((order) => (
                      <tr key={order.id} className="border-b border-neutral-800/70">
                        <td className="p-3 font-bold">#{String(order.id).slice(0, 8)}</td>
                        <td className="p-3 text-neutral-400">{order.created_at ? new Date(order.created_at).toLocaleString('en-IN') : '—'}</td>
                        <td className="p-3 font-black">{money(order.total_amount ?? order.total)}</td>
                        <td className="p-3">{order.status || 'pending'}</td>
                        <td className="p-3"><select value={order.status || 'pending'} onChange={(e) => updateOrderStatus(order.id, e.target.value)} className="rounded-lg border border-neutral-800 bg-neutral-950 px-2 py-1.5 text-xs"><option value="pending">Pending</option><option value="confirmed">Confirmed</option><option value="preparing">Preparing</option><option value="ready">Ready</option><option value="completed">Completed</option><option value="delivered">Delivered</option><option value="cancelled">Cancelled</option></select></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!orders.length && <p className="py-10 text-center text-sm text-neutral-500">No orders found.</p>}
              </div>
            </div>
          </section>
        )}

        {activeTab === 'menu' && (
          <section className="grid grid-cols-1 gap-6 md:grid-cols-3">
            <div className="h-fit space-y-4 rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
              <div className="flex items-center justify-between"><h2 className="font-black">{editingDishId ? 'Edit Dish' : 'Add New Dish'}</h2><span className="text-[10px] text-neutral-500">{menuItems.length}/{maxMenuAllowed === Infinity ? '∞' : maxMenuAllowed}</span></div>
              <form onSubmit={saveDish} className="space-y-3">
                <Input label="Dish Name" value={dish.name} onChange={(value) => setDish({ ...dish, name: value })} placeholder="Chicken Biryani" />
                <Input label="Price" type="number" value={dish.price} onChange={(value) => setDish({ ...dish, price: value })} placeholder="180" />
                <Input label="Original Price" type="number" value={dish.original_price} onChange={(value) => setDish({ ...dish, original_price: value })} placeholder="Optional" />
                <Input label="Offer Price" type="number" value={dish.offer_price} onChange={(value) => setDish({ ...dish, offer_price: value })} placeholder="Optional" />
                <Input label="Category" value={dish.category} onChange={(value) => setDish({ ...dish, category: value })} placeholder="Main Course" />
                <Input label="Image URL" value={dish.image_url} onChange={(value) => setDish({ ...dish, image_url: value })} placeholder="https://..." />
                <Input label="Add-ons comma separated" value={dish.addons} onChange={(value) => setDish({ ...dish, addons: value })} placeholder="Extra rice, Raita" />
                <div><label className="mb-1 block text-[10px] font-black uppercase text-neutral-400">Food Type</label><select value={dish.food_type} onChange={(e) => setDish({ ...dish, food_type: e.target.value })} className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-xs"><option value="veg">Veg</option><option value="non-veg">Non-Veg</option><option value="egg">Egg</option><option value="beverage">Beverage</option><option value="other">Other</option></select></div>
                <div><label className="mb-1 block text-[10px] font-black uppercase text-neutral-400">Highly Reordered</label><select value={dish.reorder_mode} onChange={(e) => setDish({ ...dish, reorder_mode: e.target.value })} className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-xs"><option value="auto">Automatic</option><option value="on">Always On</option><option value="off">Off</option></select></div>
                <div><label className="mb-1 block text-[10px] font-black uppercase text-neutral-400">Description</label><textarea rows={3} value={dish.description} onChange={(e) => setDish({ ...dish, description: e.target.value })} className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-xs" /></div>
                <div className="flex gap-2"><button disabled={savingDish} className="rounded-xl bg-orange-500 px-5 py-3 text-xs font-black">{savingDish ? 'Saving...' : editingDishId ? 'Update Dish' : 'Add Dish'}</button>{editingDishId && <button type="button" onClick={resetDish} className="rounded-xl bg-neutral-800 px-5 py-3 text-xs font-black">Cancel</button>}</div>
              </form>
            </div>

            <div className="grid grid-cols-1 gap-4 md:col-span-2 sm:grid-cols-2">
              {menuItems.map((item) => (
                <div key={item.id} className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
                  {item.image_url && <img src={item.image_url} alt={item.name} className="h-36 w-full rounded-xl object-cover" />}
                  <div className="flex justify-between gap-3"><div><h3 className="font-black">{item.name}</h3><p className="text-[11px] text-neutral-500">{item.category || 'Other'} · {item.food_type || 'veg'}</p></div><span className="font-black text-orange-400">{money(item.offer_price ?? item.price)}</span></div>
                  {item.description && <p className="text-xs text-neutral-400">{item.description}</p>}
                  {isHighlyReordered(item) && <span className="inline-block rounded-full bg-amber-500/15 px-2 py-1 text-[10px] font-black text-amber-300">⭐ Highly Reordered</span>}
                  <div className="flex flex-wrap gap-2"><button onClick={() => startEditDish(item)} className="rounded-lg bg-neutral-800 px-3 py-2 text-[11px] font-bold">Edit</button><button onClick={() => toggleAvailability(item)} className={`rounded-lg px-3 py-2 text-[11px] font-bold ${item.is_available === false ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300'}`}>{item.is_available === false ? 'Unavailable' : 'Available'}</button><button onClick={() => deleteDish(item)} className="rounded-lg bg-red-500/10 px-3 py-2 text-[11px] font-bold text-red-300">Delete</button></div>
                </div>
              ))}
              {!menuItems.length && <p className="py-12 text-center text-sm text-neutral-500">No menu items found.</p>}
            </div>
          </section>
        )}

        {activeTab === 'staff' && (
          <section className="space-y-5">
            <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
              <span className="rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-orange-400">Operational Staff</span>
              <h2 className="mt-3 text-xl font-black">Create Waiter and Kitchen Accounts</h2>
              <p className="mt-2 text-xs text-neutral-400">Manager account creation is intentionally unavailable here. This section is only for operational staff.</p>
              <form onSubmit={saveStaff} className="mt-5 grid grid-cols-1 items-end gap-3 sm:grid-cols-2 lg:grid-cols-5">
                <Input label="Staff Name" value={staffName} onChange={setStaffName} placeholder="Staff name" />
                <Input label="User ID" value={staffUserId} onChange={setStaffUserId} placeholder="waiter01" />
                <Input label="Password / PIN" type="password" value={staffPassword} onChange={setStaffPassword} placeholder="Minimum 4 characters" />
                <div><label className="mb-1 block text-[10px] font-black uppercase text-neutral-400">Role</label><select value={staffRole} onChange={(e) => setStaffRole(e.target.value)} className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-xs"><option value="waiter">Waiter</option><option value="kitchen">Kitchen</option></select></div>
                <button disabled={savingStaff} className="rounded-xl bg-orange-500 px-4 py-3 text-xs font-black">{savingStaff ? 'Creating...' : 'Create Account'}</button>
              </form>
            </div>
            <div className="overflow-x-auto rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
              <table className="w-full min-w-[600px] text-left text-xs"><thead className="border-b border-neutral-800 text-neutral-500"><tr><th className="p-3">Name</th><th className="p-3">User ID</th><th className="p-3">Role</th><th className="p-3">Created</th><th className="p-3">Action</th></tr></thead><tbody>{staffList.map((staff) => <tr key={staff.id} className="border-b border-neutral-800/70"><td className="p-3 font-bold">{staff.name}</td><td className="p-3">{staff.user_id}</td><td className="p-3 uppercase text-orange-400">{staff.role}</td><td className="p-3 text-neutral-500">{staff.created_at ? new Date(staff.created_at).toLocaleDateString('en-IN') : '—'}</td><td className="p-3"><button onClick={() => revokeStaff(staff)} className="rounded-lg bg-red-500/10 px-3 py-2 font-bold text-red-300">Revoke</button></td></tr>)}</tbody></table>
              {!staffList.length && <p className="py-10 text-center text-sm text-neutral-500">No waiter or kitchen accounts found.</p>}
            </div>
          </section>
        )}

        {activeTab === 'offers' && (
          <section className="space-y-5">
            <div><h2 className="text-xl font-black">🔥 Offers of the Day</h2><p className="mt-1 text-xs text-neutral-500">Create and maintain offers displayed on the QR menu.</p></div>
            <form onSubmit={saveOffer} className="grid grid-cols-1 gap-3 rounded-3xl border border-neutral-800 bg-neutral-900 p-5 sm:grid-cols-2 lg:grid-cols-4">
              <Input label="Offer Title" value={offer.title} onChange={(value) => setOffer({ ...offer, title: value })} placeholder="Biryani Special" />
              <Input label="Discount Text" value={offer.discount_text} onChange={(value) => setOffer({ ...offer, discount_text: value })} placeholder="20% OFF" />
              <Input label="Original Price" type="number" value={offer.original_price} onChange={(value) => setOffer({ ...offer, original_price: value })} placeholder="250" />
              <Input label="Offer Price" type="number" value={offer.offer_price} onChange={(value) => setOffer({ ...offer, offer_price: value })} placeholder="200" />
              <Input label="Offer Date" type="date" value={offer.offer_date} onChange={(value) => setOffer({ ...offer, offer_date: value })} />
              <Input label="Image URL" value={offer.image_url} onChange={(value) => setOffer({ ...offer, image_url: value })} placeholder="https://..." />
              <div className="sm:col-span-2"><label className="mb-1 block text-[10px] font-black uppercase text-neutral-400">Description</label><textarea rows={2} value={offer.description} onChange={(e) => setOffer({ ...offer, description: e.target.value })} className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-xs" /></div>
              <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-4"><button disabled={savingOffer} className="rounded-xl bg-orange-500 px-5 py-3 text-xs font-black">{savingOffer ? 'Saving...' : editingOfferId ? 'Update Offer' : 'Create Offer'}</button>{editingOfferId && <button type="button" onClick={resetOffer} className="rounded-xl bg-neutral-800 px-5 py-3 text-xs font-black">Cancel</button>}</div>
            </form>
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {dailyOffers.map((item) => <div key={item.id} className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-4">{item.image_url && <img src={item.image_url} alt={item.title} className="h-36 w-full rounded-xl object-cover" />}<div className="flex justify-between gap-3"><h3 className="font-black">{item.title}</h3><span className="font-black text-orange-400">{money(item.offer_price)}</span></div><p className="text-xs text-neutral-400">{item.description}</p><p className="text-[11px] text-neutral-500">{item.offer_date || '—'} {item.discount_text && `· ${item.discount_text}`}</p><div className="flex flex-wrap gap-2"><button onClick={() => editOffer(item)} className="rounded-lg bg-neutral-800 px-3 py-2 text-[11px] font-bold">Edit</button><button onClick={() => toggleOffer(item)} className={`rounded-lg px-3 py-2 text-[11px] font-bold ${item.is_active === false ? 'bg-red-500/20 text-red-300' : 'bg-emerald-500/20 text-emerald-300'}`}>{item.is_active === false ? 'Inactive' : 'Active'}</button><button onClick={() => deleteOffer(item)} className="rounded-lg bg-red-500/10 px-3 py-2 text-[11px] font-bold text-red-300">Delete</button></div></div>)}
              {!dailyOffers.length && <p className="py-12 text-center text-sm text-neutral-500">No offers found.</p>}
            </div>
          </section>
        )}

        {activeTab === 'swiggy-sync' && (
          <section className="mx-auto max-w-3xl space-y-5">
            <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-6">
              <h2 className="text-xl font-black">🟠 Menu Import / Sync</h2>
              <p className="mt-2 text-xs text-neutral-400">Import menu JSON into your restaurant menu. This does not connect to or use Swiggy APIs.</p>
              <form onSubmit={handleSwiggySync} className="mt-5 space-y-4">
                <textarea rows={12} value={swiggyDataInput} onChange={(e) => setSwiggyDataInput(e.target.value)} placeholder={'[\n  {\n    "name": "Chicken Biryani",\n    "price": 320,\n    "category": "Main Course",\n    "is_veg": false,\n    "food_type": "non-veg",\n    "description": "Aromatic biryani"\n  }\n]'} className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-4 font-mono text-xs text-white outline-none focus:border-orange-500" />
                <button disabled={syncingSwiggy} className="rounded-xl bg-orange-500 px-5 py-3 text-xs font-black">{syncingSwiggy ? 'Importing...' : 'Import Menu JSON'}</button>
              </form>
            </div>
          </section>
        )}

        <footer className="border-t border-neutral-800 pt-5 text-center text-[10px] text-neutral-600">
          Manager access excludes payment gateway settings, tax settings, subscription, billing, and manager account creation. Those remain Owner-only.
        </footer>
      </div>
      <RestaurantChatWidget restaurantId={restaurantId} />
    </main>
  )
}
