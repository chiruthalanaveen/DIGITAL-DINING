'use client'

import { useEffect, useMemo, useState, useRef } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

// Restaurant logo used throughout the QR menu.
function RestaurantLogo({ restaurant, className = '', imageClassName = 'w-full h-full object-contain' }) {
  const [imageError, setImageError] = useState(false)
  const logoUrl = restaurant?.logo_url || ''

  useEffect(() => {
    setImageError(false)
  }, [logoUrl])

  return (
    <div className={`overflow-hidden flex items-center justify-center ${className}`}>
      {logoUrl && !imageError ? (
        <img
          src={logoUrl}
          alt={`${restaurant?.name || 'Restaurant'} logo`}
          className={`${imageClassName} opacity-100 mix-blend-normal`}
          style={{ opacity: 1 }}
          onError={() => setImageError(true)}
        />
      ) : (
        <span className="text-2xl" aria-label="Restaurant logo placeholder">
          🍽️
        </span>
      )}
    </div>
  )
}

export default function CustomerMenuPage() {
  const params = useParams()
  const searchParams = useSearchParams()

  const restaurantId = params.id || params.restaurantId
  const tableNumber = searchParams.get('table') || '1'

  const [restaurant, setRestaurant] = useState(null)
  const [menuItems, setMenuItems] = useState([])
  const [dailyOffers, setDailyOffers] = useState([])
  const [cart, setCart] = useState({})

  const [searchQuery, setSearchQuery] = useState('')
  const [selectedCategory, setSelectedCategory] = useState('All')
  const [filterType, setFilterType] = useState('all')

  const [orderType, setOrderType] = useState('dine-in')

  const [loading, setLoading] = useState(true)

  // 3D Visual Entry Experience (active immediately after scanning QR)
  const [showPortal, setShowPortal] = useState(true)
  const [portalExiting, setPortalExiting] = useState(false)
  const [portalTilt, setPortalTilt] = useState({ x: 0, y: 0 })
  const portalCardRef = useRef(null)

  const [isVerified, setIsVerified] = useState(false)
  const [customerName, setCustomerName] = useState('')
  const [customerMobile, setCustomerMobile] = useState('')

  const [activeNav, setActiveNav] = useState('home')
  const [showOrders, setShowOrders] = useState(false)
  const [showCart, setShowCart] = useState(false)
  const [showFilter, setShowFilter] = useState(false)

  const [customerOrders, setCustomerOrders] = useState([])
  const [ordersLoading, setOrdersLoading] = useState(false)

  const [orderPlaced, setOrderPlaced] = useState(false)
  const [placedOrderNumber, setPlacedOrderNumber] = useState(null)
  const [paymentDetails, setPaymentDetails] = useState(null)
  const [paymentLoading, setPaymentLoading] = useState(false)

  const [paymentMethod, setPaymentMethod] = useState('online')

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
    if (h < 12) return 'Good morning'
    if (h < 17) return 'Good afternoon'
    return 'Good evening'
  }

  const getFoodType = item =>
    item?.food_type ||
    (item?.is_veg ? 'veg' : 'non-veg')

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

  const foodIcons = {
    veg: '🟢',
    'non-veg': '🔴',
    egg: '🥚',
    beverage: '🥤',
    other: '⚪'
  }

  /*
   * 3D GYROSCOPIC / TILT EVENT HANDLERS
   */
  const handlePortalMouseMove = e => {
    if (!portalCardRef.current) return
    const rect = portalCardRef.current.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width - 0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5
    setPortalTilt({ x: -(y * 18), y: x * 18 })
  }

  const handlePortalTouchMove = e => {
    if (!portalCardRef.current || !e.touches[0]) return
    const touch = e.touches[0]
    const rect = portalCardRef.current.getBoundingClientRect()
    const x = (touch.clientX - rect.left) / rect.width - 0.5
    const y = (touch.clientY - rect.top) / rect.height - 0.5
    setPortalTilt({ x: -(y * 14), y: x * 14 })
  }

  const resetPortalTilt = () => {
    setPortalTilt({ x: 0, y: 0 })
  }

  const handleEnterExperience = () => {
    setPortalExiting(true)
    setTimeout(() => {
      setShowPortal(false)
      setPortalExiting(false)
    }, 550)
  }

  /*
   * PAY AT COUNTER SETTING
   */
  const counterPaymentEnabled =
    restaurant?.enable_counter_payment === true ||
    restaurant?.enable_counter_payment === 'true' ||
    restaurant?.enable_counter_payment === 1 ||
    restaurant?.enable_counter_payment === '1'

  useEffect(() => {
    if (
      !counterPaymentEnabled &&
      paymentMethod === 'counter'
    ) {
      setPaymentMethod('online')
    }
  }, [counterPaymentEnabled, paymentMethod])

  /*
   * FETCH RESTAURANT + MENU
   */
  const fetchMenu = async () => {
    if (!restaurantId) {
      setLoading(false)
      return
    }

    try {
      const { data: restData, error: restError } =
        await supabase
          .from('restaurants')
          .select('*')
          .eq('id', restaurantId)
          .maybeSingle()

      if (restError) {
        console.error('Restaurant loading error:', restError)
      }

      if (restData) {
        setRestaurant(restData)
      }

      const { data: menuData, error: menuError } =
        await supabase
          .from('menu_items')
          .select('*')
          .eq('restaurant_id', restaurantId)
          .eq('is_available', true)

      if (menuError) {
        console.error('Menu loading error:', menuError)
      }

      if (menuData) {
        setMenuItems(menuData)
      }

      const today = new Date().toLocaleDateString('en-CA')
      const { data: offersData, error: offersError } = await supabase
        .from('daily_offers')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('is_active', true)
        .eq('offer_date', today)
        .order('created_at', { ascending: false })

      if (offersError) {
        console.error('Daily offers loading error:', offersError)
      }

      setDailyOffers(offersData || [])
    } catch (error) {
      console.error('Menu fetch error:', error)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMenu()

    if (!restaurantId) return

    const channel = supabase
      .channel(`customer-menu-sync-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'restaurants',
          filter: `id=eq.${restaurantId}`
        },
        payload => {
          if (payload.new) {
            setRestaurant(payload.new)
          }
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'menu_items',
          filter: `restaurant_id=eq.${restaurantId}`
        },
        () => {
          fetchMenu()
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'daily_offers',
          filter: `restaurant_id=eq.${restaurantId}`
        },
        () => {
          fetchMenu()
        }
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'orders',
          filter: `restaurant_id=eq.${restaurantId}`
        },
        () => {
          if (isVerified) {
            fetchCustomerOrders()
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [restaurantId, isVerified])

  /*
   * GUEST VERIFICATION
   */
  const handleVerifyGuest = e => {
    e.preventDefault()

    if (!customerName.trim()) {
      alert('Please enter your name.')
      return
    }

    if (!/^[0-9]{10}$/.test(customerMobile)) {
      alert('Please enter a valid 10-digit mobile number.')
      return
    }

    setIsVerified(true)
    setActiveNav('home')
  }

  /*
   * LOAD ORDERS
   */
  const fetchCustomerOrders = async () => {
    if (!restaurantId || !customerMobile.trim()) {
      return
    }

    setOrdersLoading(true)

    try {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('restaurant_id', restaurantId)
        .eq('customer_mobile', customerMobile.trim())
        .order('created_at', { ascending: false })
        .limit(20)

      if (error) {
        console.error('Orders loading error:', error)
        return
      }

      setCustomerOrders(data || [])
    } catch (error) {
      console.error('Customer orders error:', error)
    } finally {
      setOrdersLoading(false)
    }
  }

  const openOrders = async () => {
    setActiveNav('orders')
    setShowOrders(true)
    await fetchCustomerOrders()
  }

  const loadRazorpayScript = () =>
    new Promise(resolve => {
      if (
        document.querySelector(
          'script[src="https://checkout.razorpay.com/v1/checkout.js"]'
        )
      ) {
        resolve(true)
        return
      }

      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.onload = () => resolve(true)
      script.onerror = () => resolve(false)
      document.body.appendChild(script)
    })

  /*
   * CART OPERATIONS & CALCULATIONS
   */
  const updateCart = (item, delta) => {
    setCart(prev => {
      const currentQty = prev[item.id]?.quantity || 0
      const newQty = currentQty + delta

      if (newQty <= 0) {
        const copy = { ...prev }
        delete copy[item.id]
        return copy
      }

      return {
        ...prev,
        [item.id]: {
          ...item,
          quantity: newQty
        }
      }
    })
  }

  const cartItemsArray = Object.values(cart)

  const subtotalAmount = cartItemsArray.reduce(
    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
    0
  )

  const sgstRate = Number(restaurant?.sgst_rate ?? 2.5)
  const cgstRate = Number(restaurant?.cgst_rate ?? 2.5)
  const totalTaxPercent = sgstRate + cgstRate

  const gstAmount = Math.round((subtotalAmount * totalTaxPercent) / 100)

  const packingFee =
    orderType === 'parcel' ? Number(restaurant?.packing_charge ?? 20) : 0

  const totalAmount = subtotalAmount + gstAmount + packingFee

  const totalItemsCount = cartItemsArray.reduce(
    (sum, item) => sum + Number(item.quantity || 0),
    0
  )

  const categories = useMemo(() => {
    return [
      'All',
      ...new Set(
        menuItems.map(item => item.category || 'Starters')
      )
    ]
  }, [menuItems])

  const filteredItems = menuItems.filter(item => {
    const search = String(item.name || '')
      .toLowerCase()
      .includes(searchQuery.toLowerCase())

    const category =
      selectedCategory === 'All' ||
      (item.category || 'Starters') === selectedCategory

    const type =
      filterType === 'all' || getFoodType(item) === filterType

    return search && category && type
  })

  const bestSellers = useMemo(() => {
    return [...menuItems]
      .sort((a, b) => Number(b.order_count || 0) - Number(a.order_count || 0))
      .slice(0, 8)
  }, [menuItems])

  const getAutomaticHighlyReorderedIds = items => {
    const ranked = items
      .map(item => ({
        id: item.id,
        count: Number(item.order_count || 0)
      }))
      .filter(item => item.count > 0)
      .sort((a, b) => b.count - a.count)

    if (!ranked.length) {
      return new Set()
    }

    const topCount = Math.max(1, Math.ceil(ranked.length * 0.25))
    const threshold = ranked[topCount - 1]?.count || 0

    return new Set(
      ranked
        .filter(item => item.count >= Math.max(5, threshold))
        .map(item => item.id)
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

      if (error) {
        console.error('Order count update failed:', error)
      }
    }
  }

  const getDailyOrderNumber = async () => {
    const todayStart = new Date()
    todayStart.setHours(0, 0, 0, 0)

    const { count, error } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('restaurant_id', restaurantId)
      .gte('created_at', todayStart.toISOString())

    if (error) {
      throw new Error('Unable to generate order number: ' + error.message)
    }

    return (count || 0) + 1
  }

  const createItemsSnapshot = () => {
    return cartItemsArray.map(item => ({
      id: item.id,
      menu_item_id: item.id,
      name: item.name,
      price: Number(item.price || 0),
      quantity: Number(item.quantity || 0),
      qty: Number(item.quantity || 0),
      food_type: item.food_type || (item.is_veg ? 'veg' : 'non-veg'),
      description: item.description || '',
      image_url: item.image_url || ''
    }))
  }

  const handlePayAtCounter = async () => {
    if (!cartItemsArray.length) {
      alert('Please add at least one item to your cart.')
      return
    }

    if (!counterPaymentEnabled) {
      alert('Pay at Counter is currently disabled by this restaurant.')
      setPaymentMethod('online')
      return
    }

    setPaymentLoading(true)

    try {
      const finalSubtotal = subtotalAmount
      const finalGst = gstAmount
      const finalPacking = packingFee
      const finalBillTotal = totalAmount
      const finalMode =
        orderType === 'parcel' ? `Parcel (${tableNumber})` : `Dine-In (${tableNumber})`
      const finalMobile = customerMobile.trim()

      const dailyOrderNumber = await getDailyOrderNumber()
      const itemsSnapshot = createItemsSnapshot()

      const { error } = await supabase.from('orders').insert([
        {
          restaurant_id: restaurantId,
          order_number: dailyOrderNumber,
          table_number:
            orderType === 'parcel' ? `Parcel (${tableNumber})` : tableNumber,
          customer_name: customerName.trim(),
          customer_mobile: finalMobile,
          items: itemsSnapshot,
          total_amount: finalBillTotal,
          tax_amount: finalGst,
          packing_fee: finalPacking,
          payment_mode: 'Pay at Counter',
          status: 'pending'
        }
      ])

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
        paymentId: null,
        method: 'Pay at Counter',
        timestamp: new Date().toLocaleTimeString()
      })

      setCart({})
      setShowCart(false)
      setOrderPlaced(true)
      fetchCustomerOrders()
    } catch (error) {
      console.error('Counter payment error:', error)
      alert('Failed to place order: ' + error.message)
    } finally {
      setPaymentLoading(false)
    }
  }

  const handleRazorpayCheckout = async () => {
    if (!cartItemsArray.length) {
      alert('Please add at least one item to your cart.')
      return
    }

    setPaymentLoading(true)

    const finalSubtotal = subtotalAmount
    const finalGst = gstAmount
    const finalPacking = packingFee
    const finalBillTotal = totalAmount
    const finalMode =
      orderType === 'parcel' ? `Parcel (${tableNumber})` : `Dine-In (${tableNumber})`
    const finalMobile = customerMobile.trim()

    const sdkLoaded = await loadRazorpayScript()
    if (!sdkLoaded) {
      alert('Razorpay SDK failed to load. Please check your internet connection.')
      setPaymentLoading(false)
      return
    }

    const activeKeyId = restaurant?.razorpay_key_id?.trim()
    if (!activeKeyId) {
      alert(
        'This restaurant has not configured their Razorpay Key in their dashboard yet. Please ask the staff or counter.'
      )
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
            const dailyOrderNumber = await getDailyOrderNumber()
            const itemsSnapshot = createItemsSnapshot()

            const { error } = await supabase.from('orders').insert([
              {
                restaurant_id: restaurantId,
                order_number: dailyOrderNumber,
                table_number:
                  orderType === 'parcel' ? `Parcel (${tableNumber})` : tableNumber,
                customer_name: customerName.trim(),
                customer_mobile: finalMobile,
                items: itemsSnapshot,
                total_amount: finalBillTotal,
                tax_amount: finalGst,
                packing_fee: finalPacking,
                payment_mode: 'Razorpay Online',
                status: 'paid'
              }
            ])

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
              paymentId: response?.razorpay_payment_id || null,
              method: 'Razorpay Secure Gateway',
              timestamp: new Date().toLocaleTimeString()
            })

            setCart({})
            setShowCart(false)
            setOrderPlaced(true)
            fetchCustomerOrders()
          } catch (error) {
            console.error('Online order logging error:', error)
            alert('Payment received, but failed to log order: ' + error.message)
          } finally {
            setPaymentLoading(false)
          }
        },
        prefill: {
          name: customerName,
          contact: customerMobile,
          email: 'guest@digitaldining.com'
        },
        theme: {
          color: '#ef3340'
        },
        modal: {
          ondismiss: () => {
            setPaymentLoading(false)
          }
        }
      }

      const rzp = new window.Razorpay(options)
      rzp.on('payment.failed', response => {
        alert(
          `Payment Failed: ${
            response?.error?.description || 'Please try again.'
          }`
        )
        setPaymentLoading(false)
      })
      rzp.open()
    } catch (error) {
      console.error('Razorpay checkout error:', error)
      alert('Checkout Error: ' + error.message)
      setPaymentLoading(false)
    }
  }

  const getOrderStatus = status => {
    const value = String(status || 'pending').toLowerCase()
    if (value === 'completed' || value === 'delivered') return 'Delivered'
    if (value === 'ready') return 'Ready'
    if (value === 'preparing' || value === 'processing') return 'Preparing'
    if (value === 'confirmed') return 'Confirmed'
    return 'Order Placed'
  }

  const getStatusStep = status => {
    const value = String(status || 'pending').toLowerCase()
    if (value === 'completed' || value === 'delivered') return 4
    if (value === 'ready') return 3
    if (value === 'preparing' || value === 'processing') return 2
    if (value === 'confirmed') return 1
    return 0
  }

  const money = value => `₹${Number(value || 0).toFixed(2)}`

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0507] flex flex-col items-center justify-center text-neutral-100 gap-4">
        <div className="relative w-14 h-14">
          <div className="w-14 h-14 border-4 border-red-500/20 border-t-red-500 rounded-full animate-spin" />
          <div className="absolute inset-0 flex items-center justify-center text-sm">✨</div>
        </div>
        <p className="text-[11px] font-black uppercase tracking-[0.25em] text-neutral-400">
          Syncing Experience...
        </p>
      </div>
    )
  }

  if (!restaurant) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6 text-center">
        <div>
          <div className="text-5xl mb-4">🍽️</div>
          <h1 className="text-2xl font-black">Restaurant Not Found</h1>
          <p className="text-sm text-neutral-500 mt-2">
            Please scan a valid table QR code.
          </p>
        </div>
      </div>
    )
  }

  /*
   * 1. CINEMATIC 3D WELCOME VISUAL (Triggered directly on QR Scan)
   */
  if (showPortal) {
    return (
      <>
        <style jsx global>{`
          @keyframes orb-float-left {
            0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
            50% { transform: translate3d(35px, -30px, 0) scale(1.18); }
          }
          @keyframes orb-float-right {
            0%, 100% { transform: translate3d(0, 0, 0) scale(1); }
            50% { transform: translate3d(-35px, 25px, 0) scale(1.22); }
          }
          @keyframes holo-orbit {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
          @keyframes holo-orbit-rev {
            0% { transform: rotate(360deg); }
            100% { transform: rotate(0deg); }
          }
          @keyframes neon-glow {
            0%, 100% { box-shadow: 0 0 25px rgba(239, 68, 68, 0.35); }
            50% { box-shadow: 0 0 45px rgba(249, 115, 22, 0.55); }
          }
          .dd-portal-orb-1 {
            animation: orb-float-left 8s ease-in-out infinite;
          }
          .dd-portal-orb-2 {
            animation: orb-float-right 10s ease-in-out infinite;
          }
          .dd-portal-ring-1 {
            animation: holo-orbit 14s linear infinite;
          }
          .dd-portal-ring-2 {
            animation: holo-orbit-rev 10s linear infinite;
          }
          .dd-hologram-btn {
            animation: neon-glow 3s ease-in-out infinite;
          }
          .dd-grid-matrix {
            background-size: 36px 36px;
            background-image: 
              linear-gradient(to right, rgba(255, 255, 255, 0.04) 1px, transparent 1px),
              linear-gradient(to bottom, rgba(255, 255, 255, 0.04) 1px, transparent 1px);
          }
          @media (prefers-reduced-motion: reduce) {
            .dd-portal-orb-1, .dd-portal-orb-2, .dd-portal-ring-1, .dd-portal-ring-2, .dd-hologram-btn {
              animation: none !important;
            }
          }
        `}</style>

        <div
          onMouseMove={handlePortalMouseMove}
          onTouchMove={handlePortalTouchMove}
          onMouseLeave={resetPortalTilt}
          className={`fixed inset-0 z-[200] flex items-center justify-center p-5 overflow-hidden transition-all duration-500 ${
            portalExiting ? 'opacity-0 scale-95 blur-md' : 'opacity-100 scale-100'
          }`}
          style={{
            background: 'radial-gradient(circle at 50% 40%, #1a080e 0%, #0c0407 60%, #030102 100%)',
            perspective: '1300px'
          }}
        >
          {/* Cybernetic grid overlay */}
          <div className="dd-grid-matrix absolute inset-0 pointer-events-none" />

          {/* Volumetric ambient light orbs */}
          <div
            aria-hidden="true"
            className="dd-portal-orb-1 absolute -top-12 -left-12 w-80 h-80 rounded-full blur-[100px] pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(239,68,68,0.5) 0%, rgba(249,115,22,0.2) 65%, transparent 100%)' }}
          />
          <div
            aria-hidden="true"
            className="dd-portal-orb-2 absolute -bottom-16 -right-16 w-96 h-96 rounded-full blur-[115px] pointer-events-none"
            style={{ background: 'radial-gradient(circle, rgba(251,146,60,0.45) 0%, rgba(239,68,68,0.25) 70%, transparent 100%)' }}
          />

          {/* Holographic 3D Rings */}
          <div
            aria-hidden="true"
            className="dd-portal-ring-1 absolute w-[360px] h-[360px] sm:w-[480px] sm:h-[480px] rounded-full border border-dashed border-red-500/25 pointer-events-none"
            style={{ boxShadow: '0 0 50px rgba(239, 68, 68, 0.15)' }}
          />
          <div
            aria-hidden="true"
            className="dd-portal-ring-2 absolute w-[290px] h-[290px] sm:w-[390px] sm:h-[390px] rounded-full border border-dotted border-amber-400/30 pointer-events-none"
          />

          {/* 3D Dynamic Floating Glass Card */}
          <div
            ref={portalCardRef}
            className="relative w-full max-w-sm sm:max-w-md rounded-[34px] p-8 text-center overflow-hidden border border-white/20 backdrop-blur-2xl shadow-2xl transition-transform duration-150 ease-out"
            style={{
              background: 'linear-gradient(145deg, rgba(255, 255, 255, 0.14) 0%, rgba(255, 255, 255, 0.03) 100%)',
              boxShadow: '0 30px 70px -15px rgba(0, 0, 0, 0.75), 0 0 40px rgba(239, 68, 68, 0.25), inset 0 1px 1px rgba(255, 255, 255, 0.4)',
              transform: `rotateX(${portalTilt.x}deg) rotateY(${portalTilt.y}deg)`,
              transformStyle: 'preserve-3d'
            }}
          >
            {/* Top Light Ray */}
            <div className="absolute -top-24 left-1/2 -translate-x-1/2 w-48 h-32 bg-red-500/20 blur-2xl rounded-full pointer-events-none" />

            {/* Floating Table Chip */}
            <div
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/10 border border-white/20 backdrop-blur-md mb-6"
              style={{ transform: 'translateZ(30px)' }}
            >
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-widest text-neutral-200">
                Connected • Table {tableNumber}
              </span>
            </div>

            {/* 3D Elevated Logo Island */}
            <div
              className="relative mx-auto w-24 h-24 mb-6 flex items-center justify-center"
              style={{ transform: 'translateZ(55px)' }}
            >
              <div className="absolute inset-0 rounded-3xl bg-gradient-to-tr from-red-500 to-amber-400 blur-lg opacity-80 animate-pulse" />
              <div className="relative w-full h-full rounded-3xl bg-black/40 border border-white/40 backdrop-blur-md p-3 flex items-center justify-center shadow-inner">
                <RestaurantLogo
                  restaurant={restaurant}
                  className="w-full h-full"
                  imageClassName="w-full h-full object-contain"
                />
              </div>
            </div>

            {/* Welcoming Text */}
            <div style={{ transform: 'translateZ(40px)' }}>
              <p className="text-[11px] font-black uppercase tracking-[0.25em] text-red-400 mb-1.5">
                Welcome To
              </p>
              <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight leading-tight">
                {restaurant.name}
              </h1>
              <p className="text-xs text-neutral-300 font-medium mt-3 px-3 leading-relaxed">
                Experience next-generation contactless digital dining right from your seat.
              </p>
            </div>

            {/* Feature Highlights Badges */}
            <div
              className="grid grid-cols-3 gap-2 mt-6 pt-5 border-t border-white/10"
              style={{ transform: 'translateZ(30px)' }}
            >
              <div className="bg-white/5 rounded-2xl p-2.5 border border-white/10">
                <div className="text-base">⚡</div>
                <div className="text-[9px] font-black text-neutral-200 mt-1 uppercase">Instant</div>
              </div>
              <div className="bg-white/5 rounded-2xl p-2.5 border border-white/10">
                <div className="text-base">✨</div>
                <div className="text-[9px] font-black text-neutral-200 mt-1 uppercase">Live Menu</div>
              </div>
              <div className="bg-white/5 rounded-2xl p-2.5 border border-white/10">
                <div className="text-base">💳</div>
                <div className="text-[9px] font-black text-neutral-200 mt-1 uppercase">Easy Pay</div>
              </div>
            </div>

            {/* Interactive Enter Button */}
            <button
              onClick={handleEnterExperience}
              className="dd-hologram-btn mt-7 w-full py-4 rounded-2xl bg-gradient-to-r from-red-500 via-rose-500 to-orange-500 text-white font-black text-xs uppercase tracking-widest transition-transform active:scale-[0.98] border border-white/30 flex items-center justify-center gap-2 cursor-pointer shadow-xl"
              style={{ transform: 'translateZ(45px)' }}
            >
              <span>Explore Digital Dining</span>
              <span className="text-sm">→</span>
            </button>

            <p className="text-[9px] text-neutral-400 font-bold uppercase tracking-widest mt-4">
              Powered by Digital Dining
            </p>
          </div>
        </div>
      </>
    )
  }

  /*
   * 2. GUEST LOGIN (After entering the 3D portal)
   */
  if (!isVerified) {
    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-4">
        <div className="bg-white w-full max-w-md rounded-[28px] shadow-xl p-7">
          <div className="text-center mb-7">
            <RestaurantLogo
              restaurant={restaurant}
              className="w-20 h-20 rounded-3xl bg-neutral-100 mx-auto mb-4 border border-neutral-100"
              imageClassName="w-full h-full object-contain p-2"
            />
            <div className="text-[10px] text-red-500 font-black uppercase tracking-widest mb-2">
              Digital Dining
            </div>
            <h1
              className="dd-restaurant-name text-2xl font-black"
              style={{
                color: '#000000',
                WebkitTextFillColor: '#000000',
                opacity: 1
              }}
            >
              {restaurant.name}
            </h1>
            <p className="text-xs text-neutral-500 mt-2">
              Table {tableNumber}
            </p>
          </div>

          <form onSubmit={handleVerifyGuest} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-neutral-600 mb-1.5">
                Your Name
              </label>
              <input
                type="text"
                value={customerName}
                onChange={e => setCustomerName(e.target.value)}
                placeholder="Enter your name"
                autoComplete="off"
                required
                className="w-full px-4 py-3.5 rounded-2xl bg-neutral-50 border border-neutral-200 focus:border-red-400 focus:outline-none text-sm font-medium !text-black placeholder:!text-neutral-400 caret-black"
                style={{ color: '#000000', opacity: 1 }}
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-600 mb-1.5">
                Mobile Number
              </label>
              <input
                type="tel"
                maxLength={10}
                value={customerMobile}
                onChange={e =>
                  setCustomerMobile(e.target.value.replace(/\D/g, ''))
                }
                placeholder="10 digit mobile number"
                autoComplete="off"
                required
                className="w-full px-4 py-3.5 rounded-2xl bg-neutral-50 border border-neutral-200 focus:border-red-400 focus:outline-none text-sm font-medium !text-black placeholder:!text-neutral-400 caret-black"
                style={{ color: '#000000', opacity: 1 }}
              />
            </div>

            <button
              type="submit"
              className="w-full py-4 bg-red-500 hover:bg-red-600 text-white rounded-2xl font-black text-sm shadow-lg shadow-red-500/20"
            >
              View Menu & Order
            </button>
          </form>

          <p className="text-center text-[10px] text-neutral-400 mt-6">
            Powered by{' '}
            <span className="font-bold text-red-500">Digital Dining</span>
          </p>
        </div>
      </div>
    )
  }

  /*
   * 3. ORDER SUCCESS
   */
  if (orderPlaced) {
    const isCounterOrder = paymentDetails?.method === 'Pay at Counter'

    return (
      <div className="min-h-screen bg-neutral-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-[28px] w-full max-w-md p-6 shadow-xl">
          <div className="text-center">
            <div className="w-20 h-20 bg-green-50 border border-green-200 rounded-full flex items-center justify-center mx-auto">
              <span className="text-4xl text-green-500">✓</span>
            </div>
            <h1 className="text-2xl font-black mt-5">Order Placed!</h1>
            <p className="text-sm text-neutral-500 mt-2">
              Thank you,{' '}
              <strong className="text-neutral-800">{customerName}</strong>
            </p>
          </div>

          <div className="mt-6 bg-neutral-50 rounded-2xl p-4">
            <div className="flex justify-between items-center">
              <span className="text-xs text-neutral-500">Order Number</span>
              <span className="text-2xl font-black text-red-500">
                #{placedOrderNumber}
              </span>
            </div>
            <div className="flex justify-between mt-3 text-xs">
              <span className="text-neutral-500">Table</span>
              <span className="font-bold">{tableNumber}</span>
            </div>
            <div className="flex justify-between mt-2 text-xs">
              <span className="text-neutral-500">Order Type</span>
              <span className="font-bold">
                {confirmedBillSummary.diningMode}
              </span>
            </div>
          </div>

          <div className="mt-4 rounded-2xl border border-neutral-200 p-4">
            <div className="flex justify-between items-center">
              <span className="font-bold text-sm">Payment</span>
              {isCounterOrder ? (
                <span className="text-[10px] font-black bg-amber-50 text-amber-700 border border-amber-200 px-3 py-1.5 rounded-full">
                  PAY AT COUNTER
                </span>
              ) : (
                <span className="text-[10px] font-black bg-green-50 text-green-700 border border-green-200 px-3 py-1.5 rounded-full">
                  PAID ONLINE
                </span>
              )}
            </div>

            {isCounterOrder && (
              <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
                <p className="text-xs font-bold text-amber-800">
                  💵 Please pay {money(confirmedBillSummary.totalAmount)} at the counter.
                </p>
              </div>
            )}

            <div className="border-t border-neutral-100 mt-4 pt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-500">Subtotal</span>
                <span className="font-semibold">
                  {money(confirmedBillSummary.subtotal)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">SGST</span>
                <span>{money(confirmedBillSummary.gstAmount / 2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">CGST</span>
                <span>{money(confirmedBillSummary.gstAmount / 2)}</span>
              </div>
              {confirmedBillSummary.packingFee > 0 && (
                <div className="flex justify-between">
                  <span className="text-neutral-500">Packing</span>
                  <span>{money(confirmedBillSummary.packingFee)}</span>
                </div>
              )}
              <div className="border-t border-neutral-200 pt-3 flex justify-between">
                <span className="font-black">Total</span>
                <span className="font-black text-red-500 text-lg">
                  {money(confirmedBillSummary.totalAmount)}
                </span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mt-5">
            <button
              onClick={() => window.print()}
              className="py-3.5 rounded-xl bg-neutral-100 text-neutral-800 font-bold text-xs"
            >
              🖨️ Print Bill
            </button>
            <button
              onClick={() => {
                setOrderPlaced(false)
                setPaymentDetails(null)
                setActiveNav('home')
              }}
              className="py-3.5 rounded-xl bg-red-500 text-white font-bold text-xs"
            >
              Continue Ordering
            </button>
          </div>

          <button
            onClick={openOrders}
            className="w-full mt-3 py-3.5 rounded-xl border border-neutral-200 text-neutral-700 font-bold text-xs"
          >
            📦 View My Orders
          </button>

          <p className="text-center text-[10px] text-neutral-400 mt-5">
            Powered by{' '}
            <span className="font-bold text-red-500">Digital Dining</span>
          </p>
        </div>
      </div>
    )
  }

  /*
   * 4. MAIN QR MENU
   */
  return (
    <>
      <style jsx global>{`
        input, textarea, select {
          color: #000000 !important;
          -webkit-text-fill-color: #000000 !important;
          opacity: 1 !important;
          caret-color: #000000 !important;
        }
        input::placeholder, textarea::placeholder {
          color: #9ca3af !important;
          -webkit-text-fill-color: #9ca3af !important;
          opacity: 1 !important;
        }
        input:-webkit-autofill,
        input:-webkit-autofill:hover,
        input:-webkit-autofill:focus {
          -webkit-text-fill-color: #000000 !important;
        }

        .dd-restaurant-name {
          color: #000000 !important;
          -webkit-text-fill-color: #000000 !important;
          opacity: 1 !important;
          visibility: visible !important;
          text-shadow: none !important;
          mix-blend-mode: normal !important;
          filter: none !important;
        }

        .dd-restaurant-name-banner {
          color: #ffffff !important;
          -webkit-text-fill-color: #ffffff !important;
          opacity: 1 !important;
          visibility: visible !important;
          text-shadow: 0 1px 2px rgba(0, 0, 0, 0.18) !important;
          mix-blend-mode: normal !important;
          filter: none !important;
        }

        html { scroll-behavior: smooth; }
        body { background: #f8fafc; }
        @keyframes dd-float {
          0%, 100% { transform: translateY(0); }
          50% { transform: translateY(-4px); }
        }
        @keyframes dd-pulse-soft {
          0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,.12); }
          50% { box-shadow: 0 0 0 8px rgba(239,68,68,0); }
        }
        .dd-menu-shell {
          background:
            radial-gradient(circle at 8% 18%, rgba(251,146,60,.10), transparent 24%),
            radial-gradient(circle at 92% 42%, rgba(239,68,68,.08), transparent 26%),
            linear-gradient(180deg, #fff 0%, #fafafa 46%, #f8fafc 100%);
        }
        .dd-premium-card {
          box-shadow: 0 10px 30px rgba(15,23,42,.06), 0 2px 8px rgba(15,23,42,.04);
          transition: transform .22s ease, box-shadow .22s ease, border-color .22s ease;
        }
        .dd-premium-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 18px 38px rgba(15,23,42,.10), 0 3px 10px rgba(15,23,42,.05);
        }
        .dd-food-image {
          transition: transform .35s ease, filter .35s ease;
        }
        .dd-premium-card:hover .dd-food-image {
          transform: scale(1.035);
          filter: saturate(1.06);
        }
        .dd-floating { animation: dd-float 3.2s ease-in-out infinite; }
        .dd-chip {
          border: 1px solid rgba(229,231,235,.9);
          background: rgba(255,255,255,.88);
          backdrop-filter: blur(10px);
          box-shadow: 0 5px 18px rgba(15,23,42,.05);
        }
        .dd-category-row::-webkit-scrollbar, .dd-best-row::-webkit-scrollbar { display: none; }
        .dd-category-row, .dd-best-row { scrollbar-width: none; }
        .dd-bottom-nav {
          box-shadow: 0 16px 45px rgba(15,23,42,.16), 0 3px 12px rgba(15,23,42,.08);
        }
        .dd-search {
          box-shadow: 0 10px 28px rgba(15,23,42,.07);
          transition: box-shadow .2s ease, transform .2s ease, border-color .2s ease;
        }
        .dd-search:focus-within {
          transform: translateY(-1px);
          box-shadow: 0 14px 34px rgba(239,68,68,.11);
          border-color: #fca5a5 !important;
        }
      `}</style>

      <div className="dd-menu-shell min-h-screen bg-white text-neutral-900 pb-32">
        {/* TOP PROMOTIONAL BANNER */}
        <section className="px-4 pt-4">
          <div className="max-w-md mx-auto relative h-52 rounded-[26px] overflow-hidden bg-gradient-to-br from-orange-400 via-red-500 to-red-600 shadow-xl ring-1 ring-black/5">
            {restaurant.banner_url ? (
              <img
                src={restaurant.banner_url}
                alt="Restaurant Banner"
                className="absolute inset-0 w-full h-full object-cover"
              />
            ) : (
              <>
                <div className="absolute -right-16 -top-12 w-64 h-64 bg-white/10 rounded-full" />
                <div className="absolute -left-20 -bottom-20 w-64 h-64 bg-yellow-300/20 rounded-full" />
                <div className="absolute right-4 bottom-3 text-7xl">🍽️</div>
              </>
            )}

            <div className="absolute inset-0 bg-black/15" />

            <div className="relative z-10 p-5">
              <div className="flex items-center gap-3">
                <RestaurantLogo
                  restaurant={restaurant}
                  className="w-14 h-14 rounded-2xl bg-white shadow"
                  imageClassName="w-full h-full object-contain p-1"
                />

                <div className="text-white">
                  <p className="text-[9px] font-black uppercase tracking-widest opacity-80">
                    Digital Menu
                  </p>
                  <h1
                    className="dd-restaurant-name-banner text-xl font-black"
                    style={{
                      color: '#ffffff',
                      WebkitTextFillColor: '#ffffff',
                      opacity: 1
                    }}
                  >
                    {restaurant.name}
                  </h1>
                  <p className="text-[10px] opacity-90">Table {tableNumber}</p>
                </div>
              </div>

              <div className="mt-8">
                <p className="text-white/80 text-xs font-bold uppercase tracking-wider">
                  {getGreeting()}
                </p>
                <h2 className="text-2xl font-black text-white">Order Now 🍴</h2>
              </div>
            </div>

            <div className="absolute right-4 top-4 flex flex-col gap-2">
              {restaurant.phone && (
                <a
                  href={`tel:${restaurant.phone}`}
                  className="bg-white/95 text-neutral-800 px-4 py-2 rounded-full text-xs font-bold shadow"
                >
                  ✉️ Contact
                </a>
              )}
              <div className="bg-white/95 text-neutral-800 px-4 py-2 rounded-full text-xs font-bold shadow">
                🪑 Table {tableNumber}
              </div>
            </div>
          </div>
        </section>

        {/* RESTAURANT BADGE */}
        <div className="max-w-md mx-auto px-5 -mt-5 relative z-10">
          <div className="inline-flex items-center gap-2 bg-white/95 backdrop-blur-xl rounded-2xl px-5 py-3 shadow-xl border border-neutral-100 dd-premium-card">
            <RestaurantLogo
              restaurant={restaurant}
              className="w-9 h-9 rounded-xl bg-white border border-neutral-100"
              imageClassName="w-full h-full object-contain p-1"
            />
            <div>
              <p
                className="dd-restaurant-name font-black text-sm"
                style={{
                  color: '#000000',
                  WebkitTextFillColor: '#000000',
                  opacity: 1
                }}
              >
                {restaurant.name}
              </p>
              <p className="text-[9px] text-neutral-400 font-bold uppercase">
                Digital Restaurant
              </p>
            </div>
            <span className="text-xl">🏅</span>
          </div>
        </div>

        {/* VISUAL TRUST CHIPS */}
        <section className="max-w-md mx-auto px-4 mt-4">
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            <div className="dd-chip shrink-0 rounded-full px-3 py-2 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span className="text-[10px] font-black text-neutral-700">
                Freshly prepared
              </span>
            </div>
            <div className="dd-chip shrink-0 rounded-full px-3 py-2 flex items-center gap-2">
              <span>⚡</span>
              <span className="text-[10px] font-black text-neutral-700">
                Quick ordering
              </span>
            </div>
            <div className="dd-chip shrink-0 rounded-full px-3 py-2 flex items-center gap-2">
              <span>🛡️</span>
              <span className="text-[10px] font-black text-neutral-700">
                Secure checkout
              </span>
            </div>
          </div>
        </section>

        {/* OFFERS OF THE DAY */}
        {dailyOffers.length > 0 && (
          <section className="max-w-md mx-auto px-4 mt-5">
            <div className="rounded-[26px] overflow-hidden bg-gradient-to-br from-red-600 via-orange-500 to-amber-400 shadow-xl ring-1 ring-red-200/60">
              <div className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.22em] text-white/80">
                    Limited time today
                  </p>
                  <h2 className="text-xl font-black text-white mt-1">
                    🔥 Offers of the Day
                  </h2>
                </div>
                <div className="bg-white/20 backdrop-blur-md rounded-full px-3 py-1.5 text-[9px] font-black text-white border border-white/20">
                  TODAY ONLY
                </div>
              </div>
              <div className="px-3 pb-3 space-y-3">
                {dailyOffers.map(offer => (
                  <div
                    key={offer.id}
                    className="bg-white rounded-[22px] p-3 flex gap-3 items-center shadow-lg"
                  >
                    <div className="w-24 h-24 rounded-2xl overflow-hidden shrink-0 bg-neutral-100">
                      {offer.image_url ? (
                        <img
                          src={offer.image_url}
                          alt={offer.title || 'Offer'}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-4xl">
                          🎁
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-black text-neutral-900 text-sm leading-tight">
                          {offer.title}
                        </h3>
                        {offer.discount_text && (
                          <span className="shrink-0 bg-red-100 text-red-600 px-2 py-1 rounded-full text-[9px] font-black">
                            {offer.discount_text}
                          </span>
                        )}
                      </div>
                      {offer.description && (
                        <p className="text-[10px] text-neutral-500 mt-1 line-clamp-2">
                          {offer.description}
                        </p>
                      )}
                      <div className="flex items-end gap-2 mt-2">
                        {offer.original_price != null &&
                          Number(offer.original_price) > 0 && (
                            <span className="text-[11px] text-neutral-400 line-through">
                              ₹{Number(offer.original_price).toFixed(2)}
                            </span>
                          )}
                        {offer.offer_price != null && (
                          <span className="text-lg font-black text-red-600">
                            ₹{Number(offer.offer_price).toFixed(2)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* SEARCH & FILTER */}
        <section className="max-w-md mx-auto px-4 mt-6">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <span className="absolute left-4 top-1/2 -translate-y-1/2 text-xl">
                🔍
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Search dishes..."
                className="dd-search w-full h-14 rounded-2xl border border-neutral-200 bg-white shadow-sm pl-12 pr-12 text-sm font-medium focus:outline-none focus:border-red-400 !text-black placeholder:!text-neutral-400 caret-black"
                style={{ color: '#000000', opacity: 1 }}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-neutral-400"
                >
                  ✕
                </button>
              )}
            </div>

            <button
              onClick={() => setShowFilter(!showFilter)}
              className={`w-14 h-14 rounded-2xl border flex items-center justify-center text-xl transition ${
                showFilter
                  ? 'bg-red-500 text-white border-red-500'
                  : 'bg-white border-neutral-200 text-neutral-800'
              }`}
            >
              ⚱️
            </button>
          </div>

          {showFilter && (
            <div className="mt-3 bg-neutral-50 border border-neutral-200 rounded-2xl p-4">
              <p className="text-xs font-black mb-3">Filter by food type</p>
              <div className="flex flex-wrap gap-2">
                {[
                  ['all', 'All'],
                  ['veg', '🟢 Veg'],
                  ['non-veg', '🔴 Non-Veg'],
                  ['egg', '🥚 Egg'],
                  ['beverage', '🥤 Beverage'],
                  ['other', '⚪ Other']
                ].map(([value, label]) => (
                  <button
                    key={value}
                    onClick={() => setFilterType(value)}
                    className={`px-4 py-2 rounded-full text-xs font-bold ${
                      filterType === value
                        ? 'bg-red-500 text-white'
                        : 'bg-white border border-neutral-200 text-neutral-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* CATEGORY CHIPS */}
        <section className="max-w-md mx-auto px-4 mt-4">
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-2">
            {categories.map((category, index) => (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`flex items-center gap-2 px-5 py-3 rounded-full whitespace-nowrap text-sm font-bold border transition ${
                  selectedCategory === category
                    ? 'bg-red-500 text-white border-red-500 shadow-md'
                    : 'bg-white text-neutral-700 border-neutral-200'
                }`}
              >
                {index === 0
                  ? ''
                  : category.toLowerCase().includes('bread')
                  ? '🥐'
                  : category.toLowerCase().includes('rice')
                  ? '🍚'
                  : category.toLowerCase().includes('dessert')
                  ? '🍰'
                  : '🍽️'}
                {category}
              </button>
            ))}
          </div>
        </section>

        {/* BEST SELLERS */}
        {bestSellers.length > 0 &&
          selectedCategory === 'All' &&
          !searchQuery && (
            <section className="max-w-md mx-auto mt-5">
              <div className="px-4 flex items-center justify-between">
                <h2 className="text-xl font-black flex items-center gap-2">
                  🏆 Best Sellers
                  <span className="text-yellow-500">✨</span>
                </h2>
                <span className="text-[10px] font-bold text-neutral-400">
                  TOP PICKS
                </span>
              </div>

              <div className="dd-best-row flex gap-4 overflow-x-auto no-scrollbar px-4 py-4">
                {bestSellers.map((item, index) => (
                  <div
                    key={item.id}
                    className="min-w-[112px] text-center dd-floating"
                  >
                    <div className="relative">
                      <div className="w-24 h-24 rounded-full border-4 border-red-200 p-1 mx-auto bg-white shadow">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.name}
                            className="w-full h-full object-cover rounded-full"
                          />
                        ) : (
                          <div className="w-full h-full rounded-full bg-neutral-100 flex items-center justify-center text-3xl">
                            🍽️
                          </div>
                        )}
                      </div>
                      <span className="absolute right-0 top-0 w-7 h-7 rounded-full bg-orange-500 text-white text-xs font-black flex items-center justify-center">
                        {index + 1}
                      </span>
                    </div>
                    <p className="font-bold text-xs mt-2 line-clamp-2">
                      {item.name}
                    </p>
                    <p className="text-red-500 font-black text-sm mt-1">
                      {money(item.price)}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

        {/* GREETING */}
        <section className="max-w-md mx-auto px-4 mt-2">
          <div className="bg-red-50 rounded-2xl p-4 border border-red-100">
            <p className="text-xs text-red-500 font-medium">
              Welcome to{' '}
              <span
                className="dd-restaurant-name"
                style={{
                  color: '#000000',
                  WebkitTextFillColor: '#000000',
                  opacity: 1
                }}
              >
                {restaurant.name}
              </span>
            </p>
            <h2 className="text-lg font-black mt-1">
              {getGreeting()},{' '}
              {customerName ? `${customerName}!` : 'Guest!'} 👋
            </h2>
            <p className="text-[10px] text-neutral-500 mt-1">
              Choose your favourite dishes and place your order.
            </p>
          </div>
        </section>

        {/* ORDER TYPE */}
        <section className="max-w-md mx-auto px-4 mt-4">
          <div className="grid grid-cols-2 bg-neutral-100 rounded-2xl p-1 border border-neutral-200">
            <button
              onClick={() => setOrderType('dine-in')}
              className={`py-3 rounded-xl text-xs font-black ${
                orderType === 'dine-in'
                  ? 'bg-white shadow text-neutral-900'
                  : 'text-neutral-500'
              }`}
            >
              🍽️ Dine-In
            </button>
            <button
              onClick={() => setOrderType('parcel')}
              className={`py-3 rounded-xl text-xs font-black ${
                orderType === 'parcel'
                  ? 'bg-white shadow text-red-500'
                  : 'text-neutral-500'
              }`}
            >
              🥡 Takeaway
            </button>
          </div>
        </section>

        {/* MENU TITLE */}
        <section className="max-w-md mx-auto px-4 mt-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-black">{selectedCategory}</h2>
              <p className="text-[10px] text-neutral-400 mt-1">
                {filteredItems.length} dishes available
              </p>
            </div>
            {filterType !== 'all' && (
              <button
                onClick={() => setFilterType('all')}
                className="text-[10px] font-bold text-red-500"
              >
                Clear Filter
              </button>
            )}
          </div>

          {/* MENU ITEMS */}
          <div className="space-y-4">
            {filteredItems.length === 0 ? (
              <div className="py-16 text-center">
                <div className="text-5xl">🍽️</div>
                <h3 className="font-black mt-4">No dishes found</h3>
                <p className="text-xs text-neutral-400 mt-1">
                  Try another search or category.
                </p>
              </div>
            ) : (
              filteredItems.map(item => {
                const qty = cart[item.id]?.quantity || 0
                const foodType = getFoodType(item)
                const highlyReordered = shouldShowHighlyReordered(item)

                return (
                  <div
                    key={item.id}
                    className="dd-premium-card bg-white border border-neutral-200 rounded-[22px] p-3 shadow-sm"
                  >
                    <div className="flex gap-3">
                      {/* ITEM IMAGE */}
                      <div className="relative w-28 h-28 shrink-0">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.name}
                            className="dd-food-image w-full h-full object-cover rounded-2xl"
                          />
                        ) : (
                          <div className="dd-food-image w-full h-full bg-neutral-100 rounded-2xl flex items-center justify-center text-4xl">
                            🍽️
                          </div>
                        )}
                        {highlyReordered && (
                          <span className="absolute top-2 left-2 bg-yellow-400 text-neutral-900 text-[9px] font-black px-2 py-1 rounded-full">
                            ★ BEST
                          </span>
                        )}
                        {qty > 0 && (
                          <span className="absolute top-2 right-2 bg-red-500 text-white w-7 h-7 rounded-full flex items-center justify-center text-xs font-black">
                            {qty}
                          </span>
                        )}
                      </div>

                      {/* DETAILS */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start gap-1">
                          <span
                            className={`w-3 h-3 rounded-full mt-1 shrink-0 ${
                              foodDots[foodType] || foodDots.other
                            }`}
                          />
                          <div className="min-w-0">
                            <h3 className="font-black text-base leading-tight">
                              {item.name}
                            </h3>
                            <p className="text-[9px] text-neutral-400 font-bold uppercase mt-1">
                              {foodIcons[foodType]} {foodLabels[foodType]}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 mt-2">
                          <span className="text-base font-black text-red-500">
                            {money(item.price)}
                          </span>
                          {item.original_price &&
                            Number(item.original_price) >
                              Number(item.price) && (
                              <span className="text-xs text-neutral-400 line-through">
                                {money(item.original_price)}
                              </span>
                            )}
                        </div>

                        <p className="text-xs text-neutral-500 mt-1 line-clamp-2 leading-relaxed">
                          {item.description ||
                            'Freshly prepared specialty dish.'}
                        </p>

                        <div className="flex items-center justify-between mt-3">
                          {Number(item.order_count || 0) > 0 ? (
                            <span className="text-[9px] text-neutral-400">
                              Ordered {Number(item.order_count)} times
                            </span>
                          ) : (
                            <span />
                          )}

                          {qty === 0 ? (
                            <button
                              onClick={() => updateCart(item, 1)}
                              className="px-6 py-2 rounded-full bg-white border-2 border-red-400 text-red-500 text-xs font-black hover:bg-red-50"
                            >
                              ADD
                            </button>
                          ) : (
                            <div className="flex items-center gap-3 bg-red-500 text-white rounded-full px-3 py-2">
                              <button
                                onClick={() => updateCart(item, -1)}
                                className="w-5 h-5 font-black"
                              >
                                −
                              </button>
                              <span className="text-xs font-black">{qty}</span>
                              <button
                                onClick={() => updateCart(item, 1)}
                                className="w-5 h-5 font-black"
                              >
                                +
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </section>

        {/* FLOATING CART BUTTON */}
        {totalItemsCount > 0 && (
          <button
            onClick={() => setShowCart(true)}
            className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 bg-neutral-900 text-white rounded-full px-5 py-3 shadow-2xl flex items-center gap-3"
          >
            <span className="text-xl">🛒</span>
            <div className="text-left">
              <p className="text-[9px] text-neutral-400 uppercase font-bold">
                {totalItemsCount} Items
              </p>
              <p className="text-sm font-black">
                View Cart • {money(totalAmount)}
              </p>
            </div>
            <span className="text-xl">→</span>
          </button>
        )}

        {/* CART MODAL */}
        {showCart && (
          <div className="fixed inset-0 z-[100]">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setShowCart(false)}
            />
            <div className="absolute bottom-0 left-0 right-0 bg-white rounded-t-[30px] max-h-[90vh] overflow-y-auto">
              <div className="max-w-md mx-auto p-5">
                <div className="flex items-center justify-between mb-5">
                  <div>
                    <h2 className="text-xl font-black">Your Cart</h2>
                    <p className="text-xs text-neutral-400">
                      {totalItemsCount} item(s)
                    </p>
                  </div>
                  <button
                    onClick={() => setShowCart(false)}
                    className="w-10 h-10 rounded-full bg-neutral-100 font-bold"
                  >
                    ✕
                  </button>
                </div>

                <div className="space-y-3">
                  {cartItemsArray.map(item => (
                    <div
                      key={item.id}
                      className="flex items-center gap-3 border-b border-neutral-100 pb-3"
                    >
                      <div className="w-14 h-14 rounded-xl overflow-hidden bg-neutral-100">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.name}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            🍽️
                          </div>
                        )}
                      </div>

                      <div className="flex-1">
                        <h3 className="text-sm font-bold">{item.name}</h3>
                        <p className="text-xs text-neutral-500">
                          {money(item.price)}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 bg-red-50 rounded-full px-2 py-1">
                        <button
                          onClick={() => updateCart(item, -1)}
                          className="w-6 h-6 text-red-500 font-black"
                        >
                          −
                        </button>
                        <span className="text-xs font-black">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateCart(item, 1)}
                          className="w-6 h-6 text-red-500 font-black"
                        >
                          +
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                {/* ORDER TYPE */}
                <div className="mt-5">
                  <p className="text-xs font-black mb-2">Order Type</p>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setOrderType('dine-in')}
                      className={`py-3 rounded-xl text-xs font-bold border ${
                        orderType === 'dine-in'
                          ? 'bg-red-500 text-white border-red-500'
                          : 'border-neutral-200'
                      }`}
                    >
                      🍽️ Dine-In
                    </button>
                    <button
                      onClick={() => setOrderType('parcel')}
                      className={`py-3 rounded-xl text-xs font-bold border ${
                        orderType === 'parcel'
                          ? 'bg-red-500 text-white border-red-500'
                          : 'border-neutral-200'
                      }`}
                    >
                      🥡 Takeaway
                    </button>
                  </div>
                </div>

                {/* BILL */}
                <div className="mt-5 bg-neutral-50 rounded-2xl p-4 space-y-2">
                  <div className="flex justify-between text-xs">
                    <span className="text-neutral-500">Subtotal</span>
                    <span className="font-bold">{money(subtotalAmount)}</span>
                  </div>
                  <div className="flex justify-between text-xs">
                    <span className="text-neutral-500">
                      GST ({totalTaxPercent}%)
                    </span>
                    <span className="font-bold">{money(gstAmount)}</span>
                  </div>
                  {packingFee > 0 && (
                    <div className="flex justify-between text-xs">
                      <span className="text-neutral-500">Packing</span>
                      <span className="font-bold">{money(packingFee)}</span>
                    </div>
                  )}
                  <div className="border-t border-neutral-200 pt-3 flex justify-between">
                    <span className="font-black">Total</span>
                    <span className="text-lg font-black text-red-500">
                      {money(totalAmount)}
                    </span>
                  </div>
                </div>

                {/* PAYMENT METHODS */}
                {counterPaymentEnabled && (
                  <div className="mt-5">
                    <p className="text-xs font-black mb-2">Payment Method</p>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => setPaymentMethod('online')}
                        className={`py-3 rounded-xl border text-xs font-black ${
                          paymentMethod === 'online'
                            ? 'bg-red-500 text-white border-red-500'
                            : 'border-neutral-200'
                        }`}
                      >
                        ⚡ Online
                      </button>
                      <button
                        onClick={() => setPaymentMethod('counter')}
                        className={`py-3 rounded-xl border text-xs font-black ${
                          paymentMethod === 'counter'
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'border-neutral-200'
                        }`}
                      >
                        💵 Counter
                      </button>
                    </div>
                  </div>
                )}

                {/* CHECKOUT BUTTON */}
                <div className="mt-4">
                  {paymentMethod === 'online' ? (
                    <button
                      onClick={handleRazorpayCheckout}
                      disabled={paymentLoading}
                      className="w-full py-4 rounded-2xl bg-red-500 hover:bg-red-600 disabled:bg-red-300 text-white font-black text-sm shadow-lg"
                    >
                      {paymentLoading
                        ? 'Connecting...'
                        : `⚡ Pay ${money(totalAmount)} & Place Order`}
                    </button>
                  ) : (
                    <button
                      onClick={handlePayAtCounter}
                      disabled={paymentLoading}
                      className="w-full py-4 rounded-2xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-black text-sm shadow-lg"
                    >
                      {paymentLoading
                        ? 'Placing Order...'
                        : `💵 Pay ${money(totalAmount)} at Counter`}
                    </button>
                  )}
                </div>

                <p className="text-center text-[10px] text-neutral-400 mt-4">
                  Secure ordering by{' '}
                  <span className="font-bold text-red-500">
                    Digital Dining
                  </span>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* ORDERS MODAL */}
        {showOrders && (
          <div className="fixed inset-0 z-[110]">
            <div
              className="absolute inset-0 bg-black/50"
              onClick={() => setShowOrders(false)}
            />
            <div className="absolute inset-x-0 bottom-0 top-10 bg-white rounded-t-[30px] overflow-y-auto">
              <div className="max-w-md mx-auto p-5">
                <div className="flex justify-between items-center mb-5">
                  <div>
                    <h2 className="text-2xl font-black">Your Orders</h2>
                    <p className="text-xs text-neutral-400">{customerName}</p>
                  </div>
                  <button
                    onClick={() => setShowOrders(false)}
                    className="w-10 h-10 rounded-full bg-white shadow border border-neutral-200 text-xl"
                  >
                    ×
                  </button>
                </div>

                {ordersLoading ? (
                  <div className="py-20 text-center">
                    <div className="w-8 h-8 border-4 border-neutral-200 border-t-red-500 rounded-full animate-spin mx-auto" />
                    <p className="text-xs text-neutral-400 mt-3">
                      Loading orders...
                    </p>
                  </div>
                ) : customerOrders.length === 0 ? (
                  <div className="py-20 text-center">
                    <div className="text-5xl">🧾</div>
                    <h3 className="font-black mt-4">No orders yet</h3>
                    <p className="text-xs text-neutral-400 mt-1">
                      Your orders will appear here.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {customerOrders.map(order => {
                      const step = getStatusStep(order.status)
                      return (
                        <div
                          key={order.id}
                          className="border border-neutral-200 rounded-[24px] p-4 shadow-sm"
                        >
                          <div className="flex justify-between items-start">
                            <div>
                              <p className="text-lg font-black">
                                #{order.order_number}
                              </p>
                              <p className="text-[10px] text-neutral-400 mt-1">
                                {order.created_at
                                  ? new Date(order.created_at).toLocaleString()
                                  : ''}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-black">
                                {money(order.total_amount)}
                              </p>
                              <span className="inline-block mt-1 bg-amber-50 text-amber-600 border border-amber-200 rounded-full px-3 py-1 text-[9px] font-black uppercase">
                                {getOrderStatus(order.status)}
                              </span>
                            </div>
                          </div>

                          <div className="mt-6">
                            <div className="flex justify-between relative">
                              <div className="absolute top-4 left-5 right-5 h-1 bg-neutral-100" />
                              <div
                                className="absolute top-4 left-5 h-1 bg-red-400 transition-all"
                                style={{
                                  width: `${Math.min(step * 25, 75)}%`
                                }}
                              />
                              {[
                                ['🕐', 'Placed'],
                                ['✓', 'Confirmed'],
                                ['👨‍🍳', 'Preparing'],
                                ['📦', 'Ready'],
                                ['🚚', 'Delivered']
                              ].map(([icon, label], index) => (
                                <div
                                  key={label}
                                  className="relative z-10 flex flex-col items-center w-1/5"
                                >
                                  <div
                                    className={`w-9 h-9 rounded-full flex items-center justify-center text-sm ${
                                      index <= step
                                        ? 'bg-red-100 border-2 border-red-300'
                                        : 'bg-neutral-50 border border-neutral-100'
                                    }`}
                                  >
                                    {icon}
                                  </div>
                                  <span className="text-[8px] mt-2 text-center font-medium">
                                    {label}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>

                          <div className="mt-6 border-t border-neutral-100 pt-4 space-y-2">
                            {Array.isArray(order.items) &&
                              order.items.map((item, index) => (
                                <div
                                  key={item.id || index}
                                  className="flex justify-between text-sm"
                                >
                                  <span>
                                    {item.name} × {Number(item.quantity || item.qty || 1)}
                                  </span>
                                  <span className="font-bold">
                                    {money(
                                      Number(item.price || 0) *
                                        Number(item.quantity || item.qty || 1)
                                    )}
                                  </span>
                                </div>
                              ))}
                          </div>

                          <div className="mt-4 border-t border-neutral-100 pt-4 space-y-2 text-xs">
                            <div className="flex justify-between">
                              <span className="text-neutral-500">Subtotal</span>
                              <span>
                                {money(
                                  Number(order.total_amount || 0) -
                                    Number(order.tax_amount || 0) -
                                    Number(order.packing_fee || 0)
                                )}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-neutral-500">GST</span>
                              <span>{money(order.tax_amount)}</span>
                            </div>
                            {Number(order.packing_fee || 0) > 0 && (
                              <div className="flex justify-between">
                                <span className="text-neutral-500">Packing</span>
                                <span>{money(order.packing_fee)}</span>
                              </div>
                            )}
                            <div className="border-t border-neutral-200 pt-2 flex justify-between text-sm font-black">
                              <span>Total</span>
                              <span className="text-red-500">
                                {money(order.total_amount)}
                              </span>
                            </div>
                          </div>

                          <div className="mt-4">
                            {String(order.payment_mode || '')
                              .toLowerCase()
                              .includes('counter') ? (
                              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                                <p className="text-[10px] font-black text-amber-700 uppercase">
                                  💵 Pay at Counter
                                </p>
                                <p className="text-[10px] text-amber-600 mt-1">
                                  Payment pending at counter.
                                </p>
                              </div>
                            ) : (
                              <div className="bg-green-50 border border-green-200 rounded-xl p-3">
                                <p className="text-[10px] font-black text-green-700 uppercase">
                                  ✓ Online Payment
                                </p>
                                <p className="text-[10px] text-green-600 mt-1">
                                  Payment recorded online.
                                </p>
                              </div>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* BOTTOM NAVIGATION */}
        <nav className="fixed bottom-0 left-0 right-0 z-50 px-3 pb-3">
          <div className="dd-bottom-nav max-w-md mx-auto bg-white/95 backdrop-blur-xl border border-neutral-200 shadow-2xl rounded-[28px] p-2">
            <div className="grid grid-cols-4">
              <button
                onClick={() => {
                  setActiveNav('home')
                  setShowOrders(false)
                  setShowCart(false)
                }}
                className={`relative py-3 rounded-2xl flex flex-col items-center gap-1 ${
                  activeNav === 'home'
                    ? 'bg-red-50 text-red-500'
                    : 'text-neutral-500'
                }`}
              >
                <span className="text-xl">⌂</span>
                <span className="text-[10px] font-bold">Home</span>
              </button>

              <button
                onClick={() => {
                  setActiveNav('cart')
                  setShowCart(true)
                }}
                className={`relative py-3 rounded-2xl flex flex-col items-center gap-1 ${
                  activeNav === 'cart'
                    ? 'bg-red-50 text-red-500'
                    : 'text-neutral-500'
                }`}
              >
                <span className="text-xl">🛒</span>
                {totalItemsCount > 0 && (
                  <span className="absolute top-1 right-5 bg-red-500 text-white w-5 h-5 rounded-full text-[9px] font-black flex items-center justify-center">
                    {totalItemsCount > 9 ? '9+' : totalItemsCount}
                  </span>
                )}
                <span className="text-[10px] font-bold">Cart</span>
              </button>

              <button
                onClick={openOrders}
                className={`relative py-3 rounded-2xl flex flex-col items-center gap-1 ${
                  activeNav === 'orders'
                    ? 'bg-red-50 text-red-500'
                    : 'text-neutral-500'
                }`}
              >
                <span className="text-xl">🧾</span>
                {customerOrders.length > 0 && (
                  <span className="absolute top-1 right-5 bg-red-500 text-white w-5 h-5 rounded-full text-[9px] font-black flex items-center justify-center">
                    {customerOrders.length > 9 ? '9+' : customerOrders.length}
                  </span>
                )}
                <span className="text-[10px] font-bold">Orders</span>
              </button>

              <button
                onClick={() => {
                  setActiveNav('signin')
                  setIsVerified(false)
                  setShowPortal(true)
                  setCustomerName('')
                  setCustomerMobile('')
                }}
                className={`py-3 rounded-2xl flex flex-col items-center gap-1 ${
                  activeNav === 'signin'
                    ? 'bg-red-50 text-red-500'
                    : 'text-neutral-500'
                }`}
              >
                <span className="text-xl">♙</span>
                <span className="text-[10px] font-bold">Sign In</span>
              </button>
            </div>
          </div>
        </nav>

        {/* FOOTER */}
        <footer className="text-center py-8 mt-10 text-[10px] text-neutral-400">
          Proudly powered by{' '}
          <span className="font-black text-red-500">Digital Dining</span>
        </footer>
      </div>
    </>
  )
}