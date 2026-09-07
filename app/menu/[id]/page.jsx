'use client'

import { useEffect, useState } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function CustomerMenuPage() {
  const params = useParams()
  const searchParams = useSearchParams()
  const restaurantId = params.id || params.restaurantId
  const tableNumber = searchParams.get('table') || '1'

  const [restaurant, setRestaurant] = useState(null)
  const [menuItems, setMenuItems] = useState([])
  const [cart, setCart] = useState({})
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [filterType, setFilterType] = useState('all')
  const [orderType, setOrderType] = useState('dine-in')
  const [loading, setLoading] = useState(true)

  const [isVerified, setIsVerified] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [customerMobile, setCustomerMobile] = useState('')

  const [orderPlaced, setOrderPlaced] = useState(false)
  const [placedOrderNumber, setPlacedOrderNumber] = useState(null)
  const [paymentDetails, setPaymentDetails] = useState(null)
  const [paymentLoading, setPaymentLoading] = useState(false)

  const [confirmedBillSummary, setConfirmedBillSummary] = useState({
    subtotal: 0,
    sgstRate: 2.5,
    cgstRate: 2.5,
    gstAmount: 0,
    packingFee: 0,
    totalAmount: 0,
    diningMode: 'Dine-In',
    customerMobile: ''
  })

  const getGreeting = () => {
    const h = new Date().getHours()
    return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
  }

  const getFoodType = item => item?.food_type || (item?.is_veg ? 'veg' : 'non-veg')

  const foodLabels = {
    veg: 'Veg',
    'non-veg': 'Non-Veg',
    egg: 'Egg',
    beverage: 'Beverage',
    other: 'Other'
  }

  const foodDots = {
    veg: 'bg-emerald-500',
    'non-veg': 'bg-red-500',
    egg: 'bg-amber-400',
    beverage: 'bg-sky-400',
    other: 'bg-neutral-400'
  }

  const fetchMenu = async () => {
    if (!restaurantId) return

    const { data: restData } = await supabase
      .from('restaurants')
      .select('*')
      .eq('id', restaurantId)
      .maybeSingle()

    if (restData) setRestaurant(restData)

    const { data: menuData, error } = await supabase
      .from('menu_items')
      .select('*')
      .eq('restaurant_id', restaurantId)
      .eq('is_available', true)

    if (error) console.error('Menu loading error:', error)
    if (menuData) setMenuItems(menuData)
    setLoading(false)
  }

  useEffect(() => {
    fetchMenu()
    if (!restaurantId) return

    const channel = supabase
      .channel(`customer-menu-sync-${restaurantId}`)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'restaurants',
        filter: `id=eq.${restaurantId}`
      }, payload => payload.new && setRestaurant(payload.new))
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'menu_items',
        filter: `restaurant_id=eq.${restaurantId}`
      }, fetchMenu)
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [restaurantId])

  const handleVerifyGuest = e => {
    e.preventDefault()
    if (!customerName.trim()) return alert('Please enter your name.')
    if (!/^[0-9]{10}$/.test(customerMobile))
      return alert('Please enter a valid 10-digit mobile number.')
    setIsVerified(true)
  }

  const loadRazorpayScript = () => new Promise(resolve => {
    if (document.querySelector('script[src="https://checkout.razorpay.com/v1/checkout.js"]'))
      return resolve(true)

    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.onload = () => resolve(true)
    script.onerror = () => resolve(false)
    document.body.appendChild(script)
  })

  const updateCart = (item, delta) => {
    setCart(prev => {
      const qty = (prev[item.id]?.quantity || 0) + delta
      if (qty <= 0) {
        const copy = { ...prev }
        delete copy[item.id]
        return copy
      }
      return { ...prev, [item.id]: { ...item, quantity: qty } }
    })
  }

  const cartItemsArray = Object.values(cart)
  const subtotalAmount = cartItemsArray.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0), 0
  )

  const sgstRate = Number(restaurant?.sgst_rate ?? 2.5)
  const cgstRate = Number(restaurant?.cgst_rate ?? 2.5)
  const totalTaxPercent = sgstRate + cgstRate
  const gstAmount = Math.round(subtotalAmount * totalTaxPercent / 100)
  const packingFee = orderType === 'parcel' ? Number(restaurant?.packing_charge ?? 20) : 0
  const totalAmount = subtotalAmount + gstAmount + packingFee
  const totalItemsCount = cartItemsArray.reduce((sum, item) => sum + Number(item.quantity || 0), 0)

  const categories = ['All', ...new Set(menuItems.map(i => i.category || 'Starters'))]

  const filteredItems = menuItems.filter(item => {
    const search = String(item.name || '').toLowerCase().includes(searchQuery.toLowerCase())
    const category = selectedCategory === 'All' || (item.category || 'Starters') === selectedCategory
    const type = filterType === 'all' || getFoodType(item) === filterType
    return search && category && type
  })

  // Automatic top 25% ordered items, minimum 5 orders.
  const getAutomaticHighlyReorderedIds = items => {
    const ranked = items
      .map(item => ({ id: item.id, count: Number(item.order_count || 0) }))
      .filter(x => x.count > 0)
      .sort((a, b) => b.count - a.count)

    if (!ranked.length) return new Set()

    const topCount = Math.max(1, Math.ceil(ranked.length * 0.25))
    const threshold = ranked[topCount - 1]?.count || 0

    return new Set(
      ranked.filter(x => x.count >= Math.max(5, threshold)).map(x => x.id)
    )
  }

  const automaticHighlyReorderedIds = getAutomaticHighlyReorderedIds(menuItems)

  const shouldShowHighlyReordered = item => {
    const mode = item?.reorder_mode || 'auto'
    if (mode === 'on') return true
    if (mode === 'off') return false
    return automaticHighlyReorderedIds.has(item?.id)
  }

  const incrementOrderedItems = async items => {
    if (!items?.length) return

    for (const item of items) {
      const quantity = Number(item.quantity || item.qty || 1)
      if (!item.id || quantity <= 0) continue

      const { error } = await supabase.rpc('increment_menu_item_order', {
        p_menu_item_id: item.id,
        p_quantity: quantity
      })

      if (error) console.error('Order count update failed:', error)
    }
  }

  const handleRazorpayCheckout = async () => {
    if (!cartItemsArray.length) return
    setPaymentLoading(true)

    const finalSubtotal = subtotalAmount
    const finalGst = gstAmount
    const finalPacking = packingFee
    const finalBillTotal = totalAmount
    const finalMode = orderType === 'parcel'
      ? `Parcel (${tableNumber})`
      : `Dine-In (${tableNumber})`
    const finalMobile = customerMobile.trim()

    const sdkLoaded = await loadRazorpayScript()

    if (!sdkLoaded) {
      alert('Razorpay SDK failed to load. Please check your internet connection.')
      setPaymentLoading(false)
      return
    }

    const activeKeyId = restaurant?.razorpay_key_id?.trim()

    if (!activeKeyId) {
      alert("This restaurant has not configured their Razorpay Key in their dashboard yet. Please ask the staff or counter.")
      setPaymentLoading(false)
      return
    }

    try {
      const options = {
        key: activeKeyId,
        amount: Math.round(finalBillTotal * 100),
        currency: 'INR',
        name: restaurant?.name || 'Digital Dining',
        description: `Table ${tableNumber} Order (${customerName})`,
        handler: async response => {
          try {
            const todayStart = new Date()
            todayStart.setHours(0, 0, 0, 0)

            const { count } = await supabase
              .from('orders')
              .select('*', { count: 'exact', head: true })
              .eq('restaurant_id', restaurantId)
              .gte('created_at', todayStart.toISOString())

            const dailyOrderNumber = (count || 0) + 1

            const itemsSnapshot = cartItemsArray.map(item => ({
              id: item.id,
              menu_item_id: item.id,
              name: item.name,
              price: Number(item.price),
              quantity: Number(item.quantity || 0),
              qty: Number(item.quantity || 0),
              food_type: item.food_type || (item.is_veg ? 'veg' : 'non-veg'),
              description: item.description || '',
              image_url: item.image_url || ''
            }))

            const { error } = await supabase.from('orders').insert([{
              restaurant_id: restaurantId,
              order_number: dailyOrderNumber,
              table_number: orderType === 'parcel' ? `Parcel (${tableNumber})` : tableNumber,
              customer_name: customerName.trim(),
              customer_mobile: finalMobile,
              items: itemsSnapshot,
              total_amount: finalBillTotal,
              tax_amount: finalGst,
              packing_fee: finalPacking,
              payment_mode: 'Razorpay Online',
              status: 'paid'
            }])

            if (error) throw new Error(error.message)

            await incrementOrderedItems(cartItemsArray)

            setConfirmedBillSummary({
              subtotal: finalSubtotal,
              sgstRate,
              cgstRate,
              gstAmount: finalGst,
              packingFee: finalPacking,
              totalAmount: finalBillTotal,
              diningMode: finalMode,
              customerMobile: finalMobile
            })

            setPlacedOrderNumber(dailyOrderNumber)
            setPaymentDetails({
              paymentId: response.razorpay_payment_id || 'pay_' + Math.random().toString(36).substring(2, 9),
              method: 'Razorpay Secure Gateway',
              timestamp: new Date().toLocaleTimeString()
            })
            setOrderPlaced(true)
            setCart({})
          } catch (err) {
            alert('Payment received, but failed to log order: ' + err.message)
          }
          setPaymentLoading(false)
        },
        prefill: {
          name: customerName,
          contact: customerMobile,
          email: 'guest@digitaldining.com'
        },
        theme: { color: '#f97316' },
        modal: { ondismiss: () => setPaymentLoading(false) }
      }

      const rzp = new window.Razorpay(options)

      rzp.on('payment.failed', resp => {
        alert(`Payment Failed: ${resp.error.description}`)
        setPaymentLoading(false)
      })

      rzp.open()
    } catch (err) {
      alert('Checkout Error: ' + err.message)
      setPaymentLoading(false)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center text-neutral-800 space-y-3">
        <div className="w-8 h-8 border-3 border-orange-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-bold uppercase tracking-widest text-neutral-400">
          Loading Digital Dining...
        </p>
      </div>
    )
  }

  if (!restaurant) {
    return (
      <div className="min-h-screen bg-white text-neutral-900 flex items-center justify-center p-6 text-center font-sans">
        <div>
          <h1 className="text-xl font-black">Restaurant Not Found</h1>
          <p className="text-xs text-neutral-500 mt-1">Please scan a valid table QR code.</p>
        </div>
      </div>
    )
  }

  // GUEST VERIFICATION
  if (!isVerified) {
    return (
      <div className="min-h-screen bg-neutral-100 text-neutral-900 flex items-center justify-center p-4 font-sans">
        <div className="bg-white border border-neutral-200 rounded-3xl max-w-md w-full p-8 shadow-xl space-y-6">
          <div className="text-center space-y-2">
            <span className="bg-orange-50 text-orange-600 text-[10px] font-extrabold px-3 py-1 rounded-full uppercase tracking-widest border border-orange-200">
              Powered by Digital Dining
            </span>
            <h1 className="text-2xl font-black tracking-tight">{restaurant.name}</h1>
            <p className="text-xs text-neutral-500">
              Please enter your details to view menu for <strong className="text-neutral-800">Table {tableNumber}</strong>
            </p>
          </div>

          <form onSubmit={handleVerifyGuest} className="space-y-4">
            <div>
              <label className="text-xs font-bold text-neutral-600 block mb-1">Your Name</label>
              <input
                type="text"
                placeholder="e.g. Rahul Sharma"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                required
                autoComplete="off"
                className="w-full bg-neutral-50 text-neutral-900 font-semibold border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500"
              />
            </div>

            <div>
              <label className="text-xs font-bold text-neutral-600 block mb-1">Mobile Number (10 Digits)</label>
              <input
                type="tel"
                maxLength="10"
                placeholder="9876543210"
                value={customerMobile}
                onChange={e => setCustomerMobile(e.target.value.replace(/\D/g, ''))}
                required
                autoComplete="off"
                className="w-full bg-neutral-50 text-neutral-900 font-semibold border border-neutral-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-orange-500"
              />
              <p className="text-[10px] text-neutral-400 mt-1">
                Required for live kitchen updates and digital receipts.
              </p>
            </div>

            <button
              type="submit"
              className="w-full bg-orange-500 text-white font-bold py-3.5 rounded-xl text-sm transition shadow-md shadow-orange-500/20 hover:bg-orange-600"
            >
              Access Menu & Order ➔
            </button>
          </form>

          <div className="text-center pt-2 border-t border-neutral-100">
            <p className="text-[10px] text-neutral-400 font-medium">
              Seamless dine-in ordering by <span className="font-bold text-orange-500">Digital Dining</span>
            </p>
          </div>
        </div>
      </div>
    )
  }

  // ORDER SUCCESS
  if (orderPlaced) {
    return (
      <div className="min-h-screen bg-neutral-100 text-neutral-900 flex items-center justify-center p-4 font-sans">
        <div className="bg-white border border-neutral-200 p-6 sm:p-8 rounded-3xl max-w-md w-full space-y-6 shadow-xl">
          <div className="text-center space-y-2">
            <div className="w-14 h-14 bg-emerald-50 border border-emerald-200 text-emerald-600 text-xl flex items-center justify-center rounded-2xl mx-auto">✓</div>
            <h1 className="text-xl font-black">Order Placed Successfully!</h1>
            <p className="text-xs text-neutral-500">
              Thank you, <strong className="text-neutral-800">{customerName}</strong>. Sent straight to kitchen queue.
            </p>
          </div>

          <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200 space-y-2">
            <div className="flex justify-between items-center border-b border-neutral-200 pb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">👤 Guest Details</span>
              <span className="font-mono text-xs text-neutral-700 font-bold">📞 {customerMobile}</span>
            </div>
            <div className="flex justify-between items-center text-xs pt-1">
              <span className="text-neutral-500">Customer Name</span>
              <span className="font-bold text-neutral-900">{customerName}</span>
            </div>
          </div>

          <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200 space-y-3">
            <div className="flex justify-between items-center border-b border-neutral-200 pb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-orange-600">📦 Order Status</span>
              <span className="bg-amber-50 text-amber-600 border border-amber-200 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase animate-pulse">
                Preparing in Kitchen
              </span>
            </div>

            <div className="flex justify-between items-center text-xs">
              <span className="text-neutral-500">Daily Token Number</span>
              <span className="font-black text-neutral-900 text-lg text-orange-600">#{placedOrderNumber}</span>
            </div>

            <div className="flex justify-between items-center text-xs">
              <span className="text-neutral-500">Dining Mode</span>
              <span className="font-bold text-neutral-900 capitalize">
                {confirmedBillSummary.diningMode}
              </span>
            </div>
          </div>

          <div className="bg-neutral-50 p-4 rounded-2xl border border-neutral-200 space-y-2.5 text-xs">
            <div className="flex justify-between items-center border-b border-neutral-200 pb-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600">🧾 Tax Invoice</span>
              <span className="bg-emerald-50 text-emerald-600 border border-emerald-200 text-[10px] font-black px-2.5 py-0.5 rounded-full uppercase">
                Paid Online
              </span>
            </div>

            <div className="flex justify-between text-neutral-500 pb-1 border-b border-neutral-200/60">
              <span>Customer Mobile</span>
              <span className="font-mono font-bold text-neutral-900">
                +91 {confirmedBillSummary.customerMobile}
              </span>
            </div>

            <div className="flex justify-between text-neutral-500">
              <span>Item Subtotal</span>
              <span className="font-semibold text-neutral-900">₹{confirmedBillSummary.subtotal}</span>
            </div>

            <div className="flex justify-between text-neutral-500">
              <span>
                SGST ({confirmedBillSummary.sgstRate}%) + CGST ({confirmedBillSummary.cgstRate}%)
              </span>
              <span className="font-semibold text-neutral-900">₹{confirmedBillSummary.gstAmount}</span>
            </div>

            {confirmedBillSummary.packingFee > 0 && (
              <div className="flex justify-between text-neutral-500">
                <span>Parcel Packing Charge</span>
                <span className="font-semibold text-neutral-900">₹{confirmedBillSummary.packingFee}</span>
              </div>
            )}

            <div className="flex justify-between items-center pt-2 border-t border-neutral-200 font-bold">
              <span className="text-neutral-800">Total Amount</span>
              <span className="text-base font-black text-emerald-600 font-mono">
                ₹{confirmedBillSummary.totalAmount}
              </span>
            </div>
          </div>

          <div className="flex space-x-2">
            <button
              onClick={() => window.print()}
              className="flex-1 bg-neutral-100 hover:bg-neutral-200 text-neutral-800 font-bold py-3 rounded-xl text-xs transition border border-neutral-200"
            >
              Print Bill 🖨️
            </button>

            <button
              onClick={() => setOrderPlaced(false)}
              className="flex-1 bg-orange-500 hover:bg-orange-600 text-white font-bold py-3 rounded-xl text-xs transition shadow"
            >
              Back to Menu ➔
            </button>
          </div>

          <div className="text-center pt-1">
            <p className="text-[10px] text-neutral-400">
              Powered by <span className="font-bold text-orange-500">Digital Dining</span>
            </p>
          </div>
        </div>
      </div>
    )
  }

  // CUSTOMER MENU
  return (
    <div className="min-h-screen bg-white text-neutral-900 font-sans pb-48">

      {/* HEADER */}
      <header className="bg-white border-b border-neutral-100 sticky top-0 z-40 px-4 py-3 shadow-xs">
        <div className="max-w-md mx-auto flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <button
              onClick={() => setIsVerified(false)}
              className="text-neutral-400 hover:text-neutral-800 text-lg font-bold"
            >
              ‹
            </button>

            <div>
              <h1 className="text-base font-black tracking-tight">{restaurant.name}</h1>
              <p className="text-[11px] text-neutral-400">
                Table {tableNumber} • {customerName} ({customerMobile})
              </p>
            </div>
          </div>

          <span className="text-[10px] bg-orange-50 text-orange-600 border border-orange-200 px-2.5 py-1 rounded-md font-bold uppercase">
            Digital Dining
          </span>
        </div>
      </header>

      {/* GREETING */}
      <div className="max-w-md mx-auto px-4 pt-3 pb-1">
        <div className="bg-orange-50/70 border border-orange-100 rounded-2xl px-4 py-3 shadow-xs">
          <p className="text-xs text-orange-600 font-medium">
            Welcome to {restaurant.name}
          </p>
          <h2 className="text-base font-black text-neutral-900 capitalize tracking-tight mt-0.5">
            {getGreeting()}, {customerName}! 👋
          </h2>
        </div>
      </div>

      {/* ORDER TYPE */}
      <div className="max-w-md mx-auto px-4 mt-2">
        <div className="flex bg-neutral-100 p-1 rounded-xl border border-neutral-200 text-xs font-bold">
          <button
            onClick={() => setOrderType('dine-in')}
            className={`flex-1 py-2 rounded-lg transition ${
              orderType === 'dine-in'
                ? 'bg-white text-neutral-900 shadow-sm'
                : 'text-neutral-500'
            }`}
          >
            🍽️ Dine-In
          </button>

          <button
            onClick={() => setOrderType('parcel')}
            className={`flex-1 py-2 rounded-lg transition ${
              orderType === 'parcel'
                ? 'bg-white text-orange-600 shadow-sm'
                : 'text-neutral-500'
            }`}
          >
            🥡 Takeaway / Parcel (+₹{restaurant?.packing_charge ?? 20})
          </button>
        </div>
      </div>

      {/* SEARCH + FILTER */}
      <div className="max-w-md mx-auto px-4 mt-3 space-y-3">

        <div className="relative">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3 text-neutral-400">🔍</span>
          <input
            type="text"
            placeholder="Search for a dish"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="w-full bg-neutral-100 text-neutral-900 pl-10 pr-4 py-2.5 rounded-xl text-xs font-medium focus:outline-none focus:ring-1 focus:ring-orange-500 border border-transparent"
          />
        </div>

        <div className="flex space-x-2 overflow-x-auto no-scrollbar">

          {[
            ['all', 'All Items', 'bg-neutral-900 text-white border-neutral-900'],
            ['veg', '🟢 Veg', 'bg-emerald-600 text-white border-emerald-600'],
            ['non-veg', '🔴 Non-Veg', 'bg-red-600 text-white border-red-600'],
            ['egg', '🥚 Egg', 'bg-amber-500 text-white border-amber-500'],
            ['beverage', '🥤 Beverage', 'bg-sky-500 text-white border-sky-500'],
            ['other', '⚪ Other', 'bg-neutral-700 text-white border-neutral-700']
          ].map(([value, label, active]) => (
            <button
              key={value}
              onClick={() => setFilterType(value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border whitespace-nowrap transition ${
                filterType === value
                  ? active
                  : 'bg-white text-neutral-600 border-neutral-200'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="flex space-x-2 overflow-x-auto no-scrollbar pt-1 pb-1">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-2 rounded-full text-xs font-bold whitespace-nowrap transition border ${
                selectedCategory === cat
                  ? 'bg-neutral-900 text-white border-neutral-900 shadow-xs'
                  : 'bg-white text-neutral-600 border-neutral-200 hover:border-neutral-300'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* MENU */}
      <main className="max-w-md mx-auto px-4 mt-4 space-y-6">
        <div>
          <h2 className="text-base font-black text-neutral-900 mb-3">
            {selectedCategory}
          </h2>

          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-neutral-400 text-xs">
              No dishes found matching your criteria.
            </div>
          ) : (
            <div className="space-y-4">

              {filteredItems.map(item => {
                const qty = cart[item.id]?.quantity || 0
                const foodType = getFoodType(item)
                const highlyReordered = shouldShowHighlyReordered(item)

                return (
                  <div
                    key={item.id}
                    className="pb-4 border-b border-neutral-100 flex justify-between items-start gap-4"
                  >

                    {/* ITEM DETAILS */}
                    <div className="space-y-1 flex-1 min-w-0">

                      <div className="flex items-center space-x-1.5">
                        <span className={`w-2 h-2 rounded-full inline-block shrink-0 ${foodDots[foodType] || foodDots.other}`} />
                        <h3 className="font-bold text-neutral-900 text-sm">{item.name}</h3>
                      </div>

                      <div className="text-[9px] font-bold uppercase tracking-wide text-neutral-400">
                        {foodLabels[foodType] || 'Other'}
                      </div>

                      {highlyReordered && (
                        <div className="pt-0.5">
                          <span className="inline-flex items-center bg-green-50 text-green-600 border border-green-200 px-2.5 py-1 rounded-full text-[10px] font-black">
                            🔥 Highly Reordered
                          </span>
                        </div>
                      )}

                      <p className="text-neutral-400 text-xs line-clamp-3 leading-relaxed">
                        {item.description || 'Freshly prepared specialty dish.'}
                      </p>

                      <div className="pt-1 flex items-center justify-between">
                        <div>
                          <span className="font-extrabold text-neutral-900 text-sm block">
                            ₹{item.price}
                          </span>

                          {Number(item.order_count || 0) > 0 && (
                            <span className="text-[9px] text-neutral-400">
                              Ordered {Number(item.order_count)} time{Number(item.order_count) === 1 ? '' : 's'}
                            </span>
                          )}
                        </div>

                        {qty === 0 ? (
                          <button
                            onClick={() => updateCart(item, 1)}
                            className="bg-white border border-orange-500 text-orange-600 hover:bg-orange-50 px-5 py-1.5 rounded-xl text-xs font-black shadow-xs transition"
                          >
                            ADD
                          </button>
                        ) : (
                          <div className="flex items-center space-x-2 bg-orange-500 text-white px-3 py-1 rounded-xl shadow-xs">
                            <button
                              onClick={() => updateCart(item, -1)}
                              className="font-black text-sm px-1"
                            >
                              -
                            </button>

                            <span className="font-black text-xs">
                              {qty}
                            </span>

                            <button
                              onClick={() => updateCart(item, 1)}
                              className="font-black text-sm px-1"
                            >
                              +
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* IMAGE */}
                    {item.image_url ? (
                      <img
                        src={item.image_url}
                        alt={item.name}
                        className="w-24 h-24 object-cover rounded-2xl border border-neutral-100 shrink-0"
                      />
                    ) : (
                      <div className="w-24 h-24 bg-neutral-100 rounded-2xl flex items-center justify-center text-[10px] text-neutral-400 font-bold border border-neutral-100 shrink-0">
                        No Img
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </main>

      {/* CART */}
      {totalItemsCount > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-neutral-200 p-4 z-50 shadow-2xl">
          <div className="max-w-md mx-auto space-y-3">

            <div className="flex justify-between items-center text-xs">
              <div>
                <p className="text-[10px] font-bold text-neutral-400 uppercase">
                  {totalItemsCount} ITEM(S) • Subtotal: ₹{subtotalAmount}
                </p>

                <p className="text-base font-black text-neutral-900">
                  Total: ₹{totalAmount}{' '}
                  <span className="text-[10px] text-neutral-400 font-normal">
                    (GST {totalTaxPercent}%
                    {orderType === 'parcel'
                      ? ` + Packing ₹${packingFee}`
                      : ''}
                    )
                  </span>
                </p>
              </div>
            </div>

            <button
              onClick={handleRazorpayCheckout}
              disabled={paymentLoading}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-extrabold py-3.5 rounded-xl text-xs shadow-md shadow-orange-500/20 transition"
            >
              {paymentLoading
                ? 'Connecting...'
                : '⚡ Pay Online & Place Order'}
            </button>
          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer className="text-center py-6 text-neutral-400 text-xs mt-10 border-t border-neutral-100">
        Proudly powered by{' '}
        <span className="font-bold text-orange-500">
          Digital Dining
        </span>
      </footer>
    </div>
  )
}