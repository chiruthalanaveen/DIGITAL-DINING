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
          decoding="async"
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


// Shared browser cache for menu images.
// The QR menu loads restaurant/menu data before the customer signs in,
// so we use that time to preload the first visible food photos.
const qrImageCache = new Set()
const qrImageErrorCache = new Set()

function getOptimizedMenuImageUrl(value) {
  const rawUrl = String(value || '').trim()
  if (!rawUrl) return ''

  try {
    const url = new URL(rawUrl)

    // Wikimedia full-resolution food photos can be several MB.
    // Use a 480px thumbnail for QR-menu cards so mobile devices load them much faster.
    if (
      url.hostname === 'upload.wikimedia.org' &&
      url.pathname.startsWith('/wikipedia/commons/') &&
      !url.pathname.includes('/thumb/')
    ) {
      const parts = url.pathname.split('/')

      // /wikipedia/commons/f/f2/Paneer_tikka.jpg
      if (parts.length >= 6) {
        const hash1 = parts[3]
        const hash2 = parts[4]
        const fileName = parts.slice(5).join('/')

        if (hash1 && hash2 && fileName) {
          return `${url.origin}/wikipedia/commons/thumb/${hash1}/${hash2}/${fileName}/480px-${fileName}`
        }
      }
    }

    return rawUrl
  } catch {
    return rawUrl
  }
}

function preloadQrImage(value) {
  if (typeof window === 'undefined') return Promise.resolve(false)

  const src = getOptimizedMenuImageUrl(value)
  if (!src) return Promise.resolve(false)

  if (qrImageCache.has(src)) {
    return Promise.resolve(true)
  }

  if (qrImageErrorCache.has(src)) {
    return Promise.resolve(false)
  }

  return new Promise(resolve => {
    const image = new window.Image()
    image.decoding = 'async'

    image.onload = () => {
      qrImageCache.add(src)
      qrImageErrorCache.delete(src)
      resolve(true)
    }

    image.onerror = () => {
      qrImageErrorCache.add(src)
      resolve(false)
    }

    image.src = src
  })
}

function MenuFoodImage({
  src,
  alt,
  className = 'h-full w-full object-cover',
  fallback = '🍽️',
  priority = false
}) {
  const optimizedSrc = getOptimizedMenuImageUrl(src)
  const [loaded, setLoaded] = useState(
    () => Boolean(optimizedSrc && qrImageCache.has(optimizedSrc))
  )
  const [failed, setFailed] = useState(
    () => Boolean(!optimizedSrc || qrImageErrorCache.has(optimizedSrc))
  )

  useEffect(() => {
    setLoaded(Boolean(optimizedSrc && qrImageCache.has(optimizedSrc)))
    setFailed(Boolean(!optimizedSrc || qrImageErrorCache.has(optimizedSrc)))
  }, [optimizedSrc])

  if (failed || !optimizedSrc) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-neutral-100 text-3xl">
        {fallback}
      </div>
    )
  }

  return (
    <div className="relative h-full w-full overflow-hidden bg-neutral-100">
      {!loaded && (
        <div
          aria-hidden="true"
          className="absolute inset-0 animate-pulse bg-gradient-to-br from-neutral-100 via-neutral-200 to-neutral-100"
        />
      )}

      <img
        src={optimizedSrc}
        alt={alt || 'Menu item'}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : 'auto'}
        decoding="async"
        className={`${className} transition-opacity duration-200 ${
          loaded ? 'opacity-100' : 'opacity-0'
        }`}
        onLoad={() => {
          qrImageCache.add(optimizedSrc)
          qrImageErrorCache.delete(optimizedSrc)
          setLoaded(true)
        }}
        onError={() => {
          qrImageErrorCache.add(optimizedSrc)
          setFailed(true)
        }}
      />
    </div>
  )
}

export default function CustomerMenuPage() {
  const params = useParams()
  const searchParams = useSearchParams()

  // Normalize the QR restaurant id so it works consistently on every device/browser.
  const restaurantId = String(
    params?.id ?? params?.restaurantId ?? ''
  ).trim()
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
  const customerMobileRef = useRef('')

  // Keep the latest mobile number available to realtime callbacks without
  // recreating the Supabase channel on every digit typed into the form.
  // Recreating the menu effect on every keystroke can toggle the loading
  // view and dismiss the mobile keyboard.
  useEffect(() => {
    customerMobileRef.current = customerMobile
  }, [customerMobile])

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
   *
   * QR visitors are anonymous users. Do not depend on a logged-in
   * Supabase session or direct table RLS policies for the public menu.
   * The public RPC returns only the fields that the QR menu needs.
   */
  const fetchMenu = async () => {
    if (!restaurantId) {
      setRestaurant(null)
      setMenuItems([])
      setDailyOffers([])
      setLoading(false)
      return
    }

    try {
      setLoading(true)

      const { data, error } = await supabase.rpc(
        'get_public_qr_menu',
        {
          p_restaurant_id: restaurantId
        }
      )

      if (error) {
        console.error('[QR MENU] Public menu RPC failed:', {
          restaurantId,
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        })

        // Do not leave stale data from another restaurant on screen.
        setRestaurant(null)
        setMenuItems([])
        setDailyOffers([])
        return
      }

      const payload =
        data && typeof data === 'object' ? data : {}

      const nextRestaurant =
        payload.restaurant &&
        typeof payload.restaurant === 'object' &&
        !Array.isArray(payload.restaurant)
          ? payload.restaurant
          : null

      const nextMenuItems = Array.isArray(payload.menu_items)
        ? payload.menu_items
        : []

      const nextDailyOffers = Array.isArray(payload.daily_offers)
        ? payload.daily_offers
        : []

      setRestaurant(nextRestaurant)
      setMenuItems(nextMenuItems)
      setDailyOffers(nextDailyOffers)

      console.log('[QR MENU] Public menu loaded:', {
        restaurantId,
        dishes: nextMenuItems.length,
        offers: nextDailyOffers.length,
        device: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown'
      })
    } catch (error) {
      console.error('[QR MENU] Menu fetch error:', error)
      setRestaurant(null)
      setMenuItems([])
      setDailyOffers([])
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
        payload => {
          if (!isVerified) return

          // Apply the exact row received from Supabase immediately.
          // This avoids a stale fetch replacing the newer kitchen status.
          if (payload.eventType === 'INSERT' && payload.new) {
            const belongsToCustomer =
              String(payload.new.customer_mobile || '') ===
              String(customerMobileRef.current.trim())

            if (belongsToCustomer) {
              setCustomerOrders(current => {
                if (current.some(order => String(order.id) === String(payload.new.id))) {
                  return current.map(order =>
                    String(order.id) === String(payload.new.id)
                      ? payload.new
                      : order
                  )
                }
                return [payload.new, ...current].slice(0, 20)
              })
            }
          }

          if (payload.eventType === 'UPDATE' && payload.new) {
            setCustomerOrders(current =>
              current.map(order =>
                String(order.id) === String(payload.new.id)
                  ? { ...order, ...payload.new }
                  : order
              )
            )
          }

          if (payload.eventType === 'DELETE' && payload.old) {
            setCustomerOrders(current =>
              current.filter(order => String(order.id) !== String(payload.old.id))
            )
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
   * LOAD CUSTOMER ORDERS
   *
   * QR visitors are anonymous Supabase clients. Direct SELECT access to
   * public.orders can be blocked by RLS, so customer history is loaded
   * through a dedicated SECURITY DEFINER RPC instead.
   */
  const fetchCustomerOrders = async (mobileOverride = null) => {
    const mobile = String(
      mobileOverride ?? customerMobileRef.current ?? customerMobile ?? ''
    ).trim()

    if (!restaurantId || !mobile) {
      return []
    }

    setOrdersLoading(true)

    try {
      const { data, error } = await supabase.rpc(
        'get_public_customer_orders',
        {
          p_restaurant_id: String(restaurantId),
          p_customer_mobile: mobile
        }
      )

      if (error) {
        console.error('[QR MENU] Customer orders RPC error:', {
          code: error.code,
          message: error.message,
          details: error.details,
          hint: error.hint
        })
        return []
      }

      let orders = data

      if (typeof orders === 'string') {
        try {
          orders = JSON.parse(orders)
        } catch {
          orders = []
        }
      }

      if (!Array.isArray(orders)) {
        orders = orders?.orders || []
      }

      const safeOrders = Array.isArray(orders) ? orders : []
      setCustomerOrders(safeOrders)
      return safeOrders
    } catch (error) {
      console.error('Customer orders error:', error)
      return []
    } finally {
      setOrdersLoading(false)
    }
  }

  const mergePlacedOrderIntoCustomerOrders = order => {
    if (!order?.id) return

    setCustomerOrders(current => {
      const existing = current.findIndex(
        item => String(item.id) === String(order.id)
      )

      if (existing >= 0) {
        return current.map(item =>
          String(item.id) === String(order.id)
            ? { ...item, ...order }
            : item
        )
      }

      return [order, ...current].slice(0, 20)
    })
  }

  const openOrders = async () => {
    setActiveNav('orders')
    setShowOrders(true)
    await fetchCustomerOrders(
      customerMobileRef.current || customerMobile
    )
  }

  /*
   * When the Orders sheet is open, refresh customer orders periodically.
   * This is a fallback for deployments where Realtime order payloads are
   * restricted by RLS for anonymous QR visitors.
   */
  useEffect(() => {
    if (!isVerified || !showOrders || !restaurantId) return undefined

    const intervalId = window.setInterval(() => {
      fetchCustomerOrders(
        customerMobileRef.current || customerMobile
      )
    }, 5000)

    return () => window.clearInterval(intervalId)
  }, [isVerified, showOrders, restaurantId])

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

  // Add a daily offer to the existing cart using the linked menu item.
  // The daily_offers row should contain menu_item_id or item_id.
  const addOfferToCart = offer => {
    if (!offer) return

    const linkedMenuItem = menuItems.find(
      item =>
        String(item.id) === String(offer.menu_item_id) ||
        String(item.id) === String(offer.item_id)
    )

    const matchedMenuItem =
      linkedMenuItem ||
      menuItems.find(
        item =>
          String(item.name || '').trim().toLowerCase() ===
          String(offer.title || '').trim().toLowerCase()
      )

    if (!matchedMenuItem) {
      alert('This offer is not linked to an available menu item.')
      return
    }

    const offerPrice =
      offer.offer_price !== null &&
      offer.offer_price !== undefined &&
      !Number.isNaN(Number(offer.offer_price))
        ? Number(offer.offer_price)
        : Number(matchedMenuItem.price || 0)

    updateCart(
      {
        ...matchedMenuItem,
        price: offerPrice,
        offer_title: offer.title || matchedMenuItem.name,
        is_daily_offer: true
      },
      1
    )
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


  /*
   * PRELOAD MENU IMAGES BEFORE GUEST LOGIN COMPLETES
   *
   * fetchMenu() already loads the restaurant/menu before the guest form is shown.
   * Preload the banner, offers and first/popular menu images immediately, then
   * continue the remaining food photos during browser idle time. This prevents
   * the menu from appearing first and only then beginning to download every image.
   */
  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    let cancelled = false
    let idleHandle = null

    const uniqueUrls = values =>
      [...new Set(
        values
          .map(value => String(value || '').trim())
          .filter(Boolean)
      )]

    const priorityUrls = uniqueUrls([
      restaurant?.banner_url,
      restaurant?.logo_url,
      ...dailyOffers.slice(0, 4).map(offer => offer?.image_url),
      ...bestSellers.slice(0, 8).map(item => item?.image_url),
      ...menuItems.slice(0, 8).map(item => item?.image_url)
    ])

    const allMenuUrls = uniqueUrls([
      ...dailyOffers.map(offer => offer?.image_url),
      ...menuItems.map(item => item?.image_url)
    ])

    const prioritySet = new Set(priorityUrls)
    const remainingUrls = allMenuUrls.filter(url => !prioritySet.has(url))

    // Load what the customer is most likely to see first.
    priorityUrls.forEach(url => {
      preloadQrImage(url)
    })

    const preloadRemainingInBatches = async () => {
      const batchSize = 6

      for (let index = 0; index < remainingUrls.length; index += batchSize) {
        if (cancelled) return

        const batch = remainingUrls.slice(index, index + batchSize)
        await Promise.allSettled(batch.map(url => preloadQrImage(url)))

        // Yield between batches so image preloading never blocks menu interaction.
        await new Promise(resolve => window.setTimeout(resolve, 40))
      }
    }

    if ('requestIdleCallback' in window) {
      idleHandle = window.requestIdleCallback(
        () => {
          preloadRemainingInBatches()
        },
        { timeout: 1200 }
      )
    } else {
      idleHandle = window.setTimeout(() => {
        preloadRemainingInBatches()
      }, 250)
    }

    return () => {
      cancelled = true

      if ('cancelIdleCallback' in window && typeof idleHandle === 'number') {
        window.cancelIdleCallback(idleHandle)
      } else if (idleHandle) {
        window.clearTimeout(idleHandle)
      }
    }
  }, [
    restaurant?.banner_url,
    restaurant?.logo_url,
    dailyOffers,
    bestSellers,
    menuItems
  ])

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

  const createPublicOrder = async ({
    paymentMode,
    status,
    itemsSnapshot,
    totalAmount,
    taxAmount,
    packingFeeAmount,
    diningTable,
    customerFullName,
    customerPhone
  }) => {
    if (!restaurantId) {
      throw new Error('Restaurant ID is missing. Please reopen the QR menu.')
    }

    const cleanName = String(customerFullName || '').trim()
    const cleanMobile = String(customerPhone || '').trim()

    if (!cleanName) {
      throw new Error('Customer name is required.')
    }

    if (!/^[0-9]{10}$/.test(cleanMobile)) {
      throw new Error('Please enter a valid 10-digit mobile number.')
    }

    if (!Array.isArray(itemsSnapshot) || itemsSnapshot.length === 0) {
      throw new Error('Your cart is empty.')
    }

    const { data, error } = await supabase.rpc(
      'create_public_qr_order',
      {
        p_restaurant_id: String(restaurantId),
        p_table_number: String(diningTable || tableNumber || '1'),
        p_customer_name: cleanName,
        p_customer_mobile: cleanMobile,
        p_items: itemsSnapshot,
        p_total_amount: Number(totalAmount || 0),
        p_tax_amount: Number(taxAmount || 0),
        p_packing_fee: Number(packingFeeAmount || 0),
        p_payment_mode: String(paymentMode || 'Pay at Counter'),
        p_status: String(status || 'pending')
      }
    )

    if (error) {
      console.error('[QR MENU] Public order RPC failed:', {
        restaurantId,
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint
      })

      throw new Error(
        error.message ||
          'Unable to place order. Please try again.'
      )
    }

    let result = data

    if (typeof result === 'string') {
      try {
        result = JSON.parse(result)
      } catch {
        result = {}
      }
    }

    const order =
      result && typeof result === 'object' && !Array.isArray(result)
        ? result.order || result
        : null

    const orderNumber = Number(
      order?.order_number ?? result?.order_number
    )

    if (!Number.isSafeInteger(orderNumber) || orderNumber < 1) {
      console.error('[QR MENU] Invalid order response:', result)
      throw new Error('Unable to generate a valid order number.')
    }

    return {
      orderNumber,
      order
    }
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

      const itemsSnapshot = createItemsSnapshot()
      const { orderNumber: dailyOrderNumber, order: createdOrder } = await createPublicOrder({
        paymentMode: 'Pay at Counter',
        status: 'pending',
        itemsSnapshot,
        totalAmount: finalBillTotal,
        taxAmount: finalGst,
        packingFeeAmount: finalPacking,
        diningTable:
          orderType === 'parcel' ? `Parcel (${tableNumber})` : tableNumber,
        customerFullName: customerName,
        customerPhone: finalMobile
      })

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

      mergePlacedOrderIntoCustomerOrders(createdOrder)
      setCart({})
      setShowCart(false)
      setOrderPlaced(true)
      await fetchCustomerOrders(finalMobile)
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
            const itemsSnapshot = createItemsSnapshot()
            const { orderNumber: dailyOrderNumber, order: createdOrder } = await createPublicOrder({
              paymentMode: 'Razorpay Online',
              status: 'paid',
              itemsSnapshot,
              totalAmount: finalBillTotal,
              taxAmount: finalGst,
              packingFeeAmount: finalPacking,
              diningTable:
                orderType === 'parcel' ? `Parcel (${tableNumber})` : tableNumber,
              customerFullName: customerName,
              customerPhone: finalMobile
            })

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

            mergePlacedOrderIntoCustomerOrders(createdOrder)
            setCart({})
            setShowCart(false)
            setOrderPlaced(true)
            await fetchCustomerOrders(finalMobile)
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

  // Keep the customer timeline consistent with the database status values.
  // Razorpay orders are initially stored as "paid", which means the order
  // has been placed but is still waiting for kitchen confirmation.
  const normalizeCustomerStatus = status => {
    const value = String(status || 'pending').trim().toLowerCase()

    if (['paid', 'new', 'order_placed'].includes(value)) return 'pending'
    if (value === 'processing') return 'preparing'
    return value
  }

  const getOrderStatus = status => {
    const value = normalizeCustomerStatus(status)
    if (value === 'completed' || value === 'delivered') return 'Delivered'
    if (value === 'ready') return 'Ready'
    if (value === 'preparing' || value === 'processing') return 'Preparing'
    if (value === 'confirmed') return 'Confirmed'
    return 'Order Placed'
  }

  const getStatusStep = status => {
    const value = normalizeCustomerStatus(status)
    if (value === 'completed' || value === 'delivered') return 4
    if (value === 'ready') return 3
    if (value === 'preparing' || value === 'processing') return 2
    if (value === 'confirmed') return 1
    return 0
  }

  const money = value => `₹${Number(value || 0).toFixed(2)}`

  if (loading) {
    return (
      <main className="flex min-h-[100dvh] w-full items-center justify-center overflow-hidden bg-[#f7f6f2] px-6 text-neutral-900">
        <div className="text-center">
          <div className="relative mx-auto h-16 w-16">
            <div className="absolute inset-0 rounded-full border-[5px] border-orange-100" />
            <div className="absolute inset-0 animate-spin rounded-full border-[5px] border-transparent border-t-orange-500" />
            <div className="absolute inset-0 flex items-center justify-center text-xl">
              🍽️
            </div>
          </div>
          <p className="mt-5 text-xs font-black uppercase tracking-[0.22em] text-neutral-500">
            Loading menu
          </p>
        </div>
      </main>
    )
  }

  if (!restaurant) {
    return (
      <main className="flex min-h-[100dvh] w-full items-center justify-center bg-[#f7f6f2] p-6 text-center text-neutral-900">
        <div className="w-full max-w-sm rounded-[32px] border border-black/5 bg-white p-8 shadow-[0_24px_70px_rgba(15,23,42,.08)]">
          <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] bg-orange-50 text-4xl">
            🍽️
          </div>
          <h1 className="mt-5 text-2xl font-black">Restaurant not found</h1>
          <p className="mt-2 text-sm leading-6 text-neutral-500">
            Please scan a valid table QR code and try again.
          </p>
        </div>
      </main>
    )
  }

  /*
   * NEW QR ENTRY
   * The old cinematic welcome/Explore screen has been removed.
   * Customers now reach guest verification immediately after scanning.
   */
  if (!isVerified) {
    return (
      <>
        <style jsx global>{`
          html, body {
            margin: 0;
            max-width: 100%;
            overflow-x: hidden;
            background: #f7f6f2;
          }

          * {
            -webkit-tap-highlight-color: transparent;
          }

          .dd-input {
            color: #171717 !important;
            -webkit-text-fill-color: #171717 !important;
            opacity: 1 !important;
          }

          .dd-input::placeholder {
            color: #a3a3a3 !important;
            -webkit-text-fill-color: #a3a3a3 !important;
          }
        `}</style>

        <main className="dd-mobile-shell bg-[#f7f6f2] text-neutral-900">
          <div className="dd-mobile-frame min-h-[100dvh] pb-[max(2rem,env(safe-area-inset-bottom))]">
            <div className="relative h-[205px] min-[390px]:h-[230px] overflow-hidden bg-neutral-900">
              {restaurant.banner_url ? (
                <img
                  src={restaurant.banner_url}
                  alt={`${restaurant.name || 'Restaurant'} banner`}
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,#fb923c_0%,#f97316_28%,#c2410c_68%,#431407_100%)]" />
              )}

              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-black/10" />

              <div className="absolute inset-x-0 top-0 flex items-center justify-between px-5 pt-[max(1rem,env(safe-area-inset-top))]">
                <span className="rounded-full border border-white/20 bg-black/20 px-3 py-1.5 text-[9px] font-black uppercase tracking-widest text-white backdrop-blur-md">
                  Digital Menu
                </span>

                <span className="rounded-full border border-white/20 bg-white/15 px-3 py-1.5 text-[10px] font-black text-white backdrop-blur-md">
                  Table {tableNumber}
                </span>
              </div>

              <div className="absolute inset-x-5 bottom-5">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-200">
                  Scan • Order • Enjoy
                </p>
                <h1 className="mt-1 line-clamp-2 text-3xl font-black leading-tight text-white">
                  {restaurant.name}
                </h1>
              </div>
            </div>

            <div className="relative -mt-7 px-4">
              <div className="rounded-[32px] border border-black/5 bg-white p-5 shadow-[0_24px_70px_rgba(15,23,42,.10)]">
                <div className="flex items-center gap-3 border-b border-neutral-100 pb-4">
                  <RestaurantLogo
                    restaurant={restaurant}
                    className="h-14 w-14 shrink-0 rounded-2xl border border-neutral-100 bg-white shadow-sm"
                    imageClassName="h-full w-full object-contain p-1.5"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-orange-500">
                      Start your order
                    </p>
                    <h2 className="mt-1 truncate text-lg font-black">
                      Tell us who&apos;s ordering
                    </h2>
                    <p className="mt-0.5 text-[10px] text-neutral-500">
                      Used only to show your live order status.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleVerifyGuest} className="mt-5 space-y-4">
                  <div>
                    <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-neutral-500">
                      Your name
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-base">
                        👤
                      </span>
                      <input
                        type="text"
                        value={customerName}
                        onChange={e => setCustomerName(e.currentTarget.value)}
                        placeholder="Enter your name"
                        autoComplete="name"
                        autoCorrect="off"
                        autoCapitalize="words"
                        spellCheck={false}
                        required
                        className="dd-input h-14 w-full rounded-2xl border border-neutral-200 bg-[#fafafa] pl-11 pr-4 text-base font-semibold outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-50"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="mb-2 block text-[10px] font-black uppercase tracking-wider text-neutral-500">
                      Mobile number
                    </label>
                    <div className="relative">
                      <span className="absolute left-4 top-1/2 -translate-y-1/2 text-base">
                        📱
                      </span>
                      <input
                        type="text"
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={10}
                        value={customerMobile}
                        onChange={e => {
                          const nextValue = e.currentTarget.value
                            .replace(/\D/g, '')
                            .slice(0, 10)
                          setCustomerMobile(nextValue)
                        }}
                        onInput={e => {
                          const nextValue = e.currentTarget.value
                            .replace(/\D/g, '')
                            .slice(0, 10)
                          if (nextValue !== e.currentTarget.value) {
                            e.currentTarget.value = nextValue
                          }
                        }}
                        placeholder="10 digit mobile number"
                        autoComplete="tel"
                        autoCorrect="off"
                        autoCapitalize="off"
                        spellCheck={false}
                        enterKeyHint="done"
                        required
                        className="dd-input h-14 w-full rounded-2xl border border-neutral-200 bg-[#fafafa] pl-11 pr-4 text-base font-semibold outline-none transition focus:border-orange-400 focus:bg-white focus:ring-4 focus:ring-orange-50"
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-neutral-950 text-sm font-black text-white shadow-lg shadow-neutral-950/10 transition active:scale-[0.99]"
                  >
                    Browse Menu
                    <span>→</span>
                  </button>
                </form>

                <div className="mt-4 flex items-center justify-center gap-4 text-[9px] font-bold text-neutral-400">
                  <span>✓ Live order status</span>
                  <span>✓ Secure checkout</span>
                </div>
              </div>
            </div>

            <p className="mt-6 text-center text-[9px] font-bold uppercase tracking-[0.16em] text-neutral-400">
              Powered by <span className="text-orange-500">Digital Dining</span>
            </p>
          </div>
        </main>
      </>
    )
  }

  if (orderPlaced) {
    const isCounterOrder = paymentDetails?.method === 'Pay at Counter'

    return (
      <main className="dd-mobile-shell bg-[#f7f6f2] px-3 min-[390px]:px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] text-neutral-900">
        <div className="dd-mobile-frame">
          <div className="rounded-[32px] border border-black/5 bg-white p-5 shadow-[0_22px_60px_rgba(15,23,42,.08)]">
            <div className="text-center">
              <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-[28px] bg-emerald-50 text-4xl text-emerald-600">
                ✓
              </div>
              <p className="mt-5 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-600">
                Order confirmed
              </p>
              <h1 className="mt-1 text-3xl font-black">Thank you, {customerName}</h1>
              <p className="mt-2 text-sm text-neutral-500">
                Your order has been sent to the restaurant.
              </p>
            </div>

            <div className="mt-6 grid grid-cols-2 gap-3">
              <div className="rounded-2xl bg-neutral-950 p-4 text-white">
                <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                  Order number
                </p>
                <p className="mt-1 text-3xl font-black">#{placedOrderNumber}</p>
              </div>
              <div className="rounded-2xl bg-orange-50 p-4">
                <p className="text-[9px] font-black uppercase tracking-wider text-orange-500">
                  Table
                </p>
                <p className="mt-1 text-2xl font-black text-neutral-900">
                  {tableNumber}
                </p>
                <p className="mt-1 text-[9px] text-neutral-500">
                  {confirmedBillSummary.diningMode}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-[24px] border border-neutral-200 p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                    Payment
                  </p>
                  <p className="mt-1 text-sm font-black">
                    {isCounterOrder ? 'Pay at Counter' : 'Paid Online'}
                  </p>
                </div>
                <span
                  className={`rounded-full px-3 py-1.5 text-[9px] font-black ${
                    isCounterOrder
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-emerald-100 text-emerald-700'
                  }`}
                >
                  {isCounterOrder ? 'PAYMENT DUE' : 'PAID'}
                </span>
              </div>

              {isCounterOrder && (
                <div className="mt-4 rounded-2xl bg-amber-50 p-3 text-xs font-bold text-amber-800">
                  Please pay {money(confirmedBillSummary.totalAmount)} at the counter.
                </div>
              )}

              <div className="mt-4 space-y-2 border-t border-neutral-100 pt-4 text-sm">
                <div className="flex justify-between">
                  <span className="text-neutral-500">Subtotal</span>
                  <span className="font-semibold">
                    {money(confirmedBillSummary.subtotal)}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">
                    SGST ({confirmedBillSummary.sgstRate}%)
                  </span>
                  <span>{money(confirmedBillSummary.gstAmount / 2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-neutral-500">
                    CGST ({confirmedBillSummary.cgstRate}%)
                  </span>
                  <span>{money(confirmedBillSummary.gstAmount / 2)}</span>
                </div>
                {confirmedBillSummary.packingFee > 0 && (
                  <div className="flex justify-between">
                    <span className="text-neutral-500">Packing</span>
                    <span>{money(confirmedBillSummary.packingFee)}</span>
                  </div>
                )}
                <div className="flex justify-between border-t border-neutral-200 pt-3">
                  <span className="font-black">Total</span>
                  <span className="text-xl font-black text-orange-600">
                    {money(confirmedBillSummary.totalAmount)}
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <button
                onClick={() => window.print()}
                className="h-13 rounded-2xl border border-neutral-200 bg-neutral-50 px-3 py-3.5 text-xs font-black"
              >
                🖨 Print Bill
              </button>
              <button
                onClick={() => {
                  setOrderPlaced(false)
                  setPaymentDetails(null)
                  setActiveNav('home')
                }}
                className="h-13 rounded-2xl bg-neutral-950 px-3 py-3.5 text-xs font-black text-white"
              >
                Order More
              </button>
            </div>

            <button
              onClick={openOrders}
              className="mt-3 w-full rounded-2xl bg-orange-500 py-3.5 text-xs font-black text-white"
            >
              Track My Order
            </button>
          </div>
        </div>
      </main>
    )
  }

  return (
    <>
      <style jsx global>{`
        html, body {
          margin: 0;
          width: 100%;
          max-width: 100%;
          min-height: 100%;
          overflow-x: hidden;
          background: #f7f6f2;
          overscroll-behavior-x: none;
        }

        * {
          box-sizing: border-box;
          -webkit-tap-highlight-color: transparent;
        }

        .dd-mobile-shell {
          width: 100svw;
          max-width: 100svw;
          min-height: 100dvh;
          overflow-x: clip;
          overscroll-behavior-x: none;
        }

        .dd-mobile-frame {
          width: 100%;
          max-width: 480px;
          min-width: 0;
          margin-inline: auto;
          overflow-x: clip;
        }

        .dd-mobile-frame img,
        .dd-mobile-frame video,
        .dd-mobile-frame canvas,
        .dd-mobile-frame svg {
          max-width: 100%;
        }

        @media (max-width: 639px) {
          .dd-mobile-frame input,
          .dd-mobile-frame textarea,
          .dd-mobile-frame select {
            font-size: 16px !important;
          }

          .dd-mobile-frame button,
          .dd-mobile-frame a {
            touch-action: manipulation;
          }
        }

        @media (max-width: 359px) {
          .dd-xs-hide {
            display: none !important;
          }
        }

        .dd-app {
          background:
            radial-gradient(circle at 10% 4%, rgba(249,115,22,.08), transparent 22rem),
            #f7f6f2;
        }

        .dd-scrollbar-none {
          scrollbar-width: none;
        }

        .dd-scrollbar-none::-webkit-scrollbar {
          display: none;
        }

        .dd-input {
          color: #171717 !important;
          -webkit-text-fill-color: #171717 !important;
          opacity: 1 !important;
        }

        .dd-input::placeholder {
          color: #a3a3a3 !important;
          -webkit-text-fill-color: #a3a3a3 !important;
        }

        .dd-card {
          box-shadow: 0 12px 36px rgba(15,23,42,.055);
        }

        .dd-image-stable {
          contain: layout paint;
        }

        .dd-sheet {
          animation: dd-sheet-in .22s ease-out;
        }

        @keyframes dd-sheet-in {
          from { transform: translateY(22px); opacity: .75; }
          to { transform: translateY(0); opacity: 1; }
        }

        @media (prefers-reduced-motion: reduce) {
          .dd-sheet {
            animation: none;
          }
        }
      `}</style>

      <main className="dd-app dd-mobile-shell pb-[calc(7.5rem+env(safe-area-inset-bottom))] text-neutral-900">
        <div className="dd-mobile-frame">
          {/* APP HEADER */}
          <header className="sticky top-0 z-40 min-h-[72px] border-b border-black/5 bg-[#f7f6f2]/95 px-3 min-[390px]:px-4 pb-3 pt-[max(.75rem,env(safe-area-inset-top))] backdrop-blur-xl">
            <div className="flex min-w-0 items-center gap-3">
              <RestaurantLogo
                restaurant={restaurant}
                className="h-11 w-11 shrink-0 rounded-2xl border border-black/5 bg-white shadow-sm"
                imageClassName="h-full w-full object-contain p-1"
              />

              <div className="min-w-0 flex-1">
                <p className="truncate text-base font-black leading-tight">
                  {restaurant.name}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-1 text-[8px] font-black uppercase tracking-wide text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    Live menu
                  </span>
                  <span className="text-[9px] font-bold text-neutral-500">
                    Table {tableNumber}
                  </span>
                </div>
              </div>

              {restaurant.phone && (
                <a
                  href={`tel:${restaurant.phone}`}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-black/5 bg-white text-base shadow-sm"
                  aria-label="Call restaurant"
                >
                  ☎
                </a>
              )}
            </div>
          </header>

          {/* HERO */}
          <section className="px-3 min-[390px]:px-4 pt-4">
            <div className="relative h-[150px] min-[390px]:h-[164px] overflow-hidden rounded-[26px] min-[390px]:rounded-[30px] bg-neutral-900 shadow-[0_20px_45px_rgba(15,23,42,.14)]">
              {restaurant.banner_url ? (
                <img
                  src={restaurant.banner_url}
                  alt="Restaurant"
                  className="absolute inset-0 h-full w-full object-cover"
                />
              ) : (
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,#fb923c_0%,#f97316_25%,#c2410c_70%,#431407_100%)]" />
              )}

              <div className="absolute inset-0 bg-gradient-to-r from-black/75 via-black/35 to-black/10" />

              <div className="relative flex h-full flex-col justify-end p-5">
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-orange-200">
                  {getGreeting()}, {customerName}
                </p>
                <h1 className="mt-1 max-w-[82%] text-[1.35rem] min-[390px]:text-2xl font-black leading-tight text-white">
                  What are you craving today?
                </h1>
                <div className="mt-3 flex items-center gap-2">
                  <span className="rounded-full bg-white/15 px-3 py-1.5 text-[9px] font-black text-white backdrop-blur">
                    🪑 Table {tableNumber}
                  </span>
                  <span className="rounded-full bg-white/15 px-3 py-1.5 text-[9px] font-black text-white backdrop-blur">
                    ⚡ Quick order
                  </span>
                </div>
              </div>
            </div>
          </section>

          {/* ORDER MODE */}
          <section className="px-3 min-[390px]:px-4 pt-4">
            <div className="grid grid-cols-2 gap-1 rounded-2xl border border-black/5 bg-white p-1.5 shadow-sm">
              <button
                type="button"
                onClick={() => setOrderType('dine-in')}
                className={`rounded-xl py-3 text-xs font-black transition ${
                  orderType === 'dine-in'
                    ? 'bg-neutral-950 text-white shadow'
                    : 'text-neutral-500'
                }`}
              >
                🍽 Dine-In
              </button>
              <button
                type="button"
                onClick={() => setOrderType('parcel')}
                className={`rounded-xl py-3 text-xs font-black transition ${
                  orderType === 'parcel'
                    ? 'bg-orange-500 text-white shadow'
                    : 'text-neutral-500'
                }`}
              >
                🥡 Takeaway
              </button>
            </div>
          </section>

          {/* OFFERS */}
          {dailyOffers.length > 0 && (
            <section className="mt-6">
              <div className="flex items-end justify-between px-3 min-[390px]:px-4">
                <div>
                  <p className="text-[9px] font-black uppercase tracking-[0.2em] text-orange-500">
                    Special today
                  </p>
                  <h2 className="mt-1 text-xl font-black">Offers for you</h2>
                </div>
                <span className="text-[9px] font-black uppercase text-neutral-400">
                  Tap to add
                </span>
              </div>

              <div className="dd-scrollbar-none mt-3 flex snap-x gap-3 overflow-x-auto px-3 min-[390px]:px-4 pb-2">
                {dailyOffers.map(offer => (
                  <button
                    key={offer.id}
                    type="button"
                    onClick={() => addOfferToCart(offer)}
                    className="dd-card min-w-[86%] min-[390px]:min-w-[82%] snap-start overflow-hidden rounded-[24px] min-[390px]:rounded-[28px] border border-black/5 bg-neutral-950 text-left text-white active:scale-[.99]"
                  >
                    <div className="flex min-h-[150px]">
                      <div className="flex min-w-0 flex-1 flex-col justify-between p-4">
                        <div>
                          {offer.discount_text && (
                            <span className="inline-flex rounded-full bg-orange-500 px-2.5 py-1 text-[8px] font-black uppercase tracking-wide">
                              {offer.discount_text}
                            </span>
                          )}
                          <h3 className="mt-3 line-clamp-2 text-lg font-black leading-tight">
                            {offer.title}
                          </h3>
                          {offer.description && (
                            <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-neutral-400">
                              {offer.description}
                            </p>
                          )}
                        </div>

                        <div className="mt-3 flex items-end gap-2">
                          {offer.offer_price != null && (
                            <span className="text-xl font-black text-orange-400">
                              ₹{Number(offer.offer_price).toFixed(2)}
                            </span>
                          )}
                          {offer.original_price != null &&
                            Number(offer.original_price) > 0 && (
                              <span className="pb-1 text-[10px] text-neutral-500 line-through">
                                ₹{Number(offer.original_price).toFixed(2)}
                              </span>
                            )}
                        </div>
                      </div>

                      <div className="w-[38%] shrink-0 bg-neutral-900">
                        <MenuFoodImage
                          src={offer.image_url}
                          alt={offer.title || 'Offer'}
                          className="h-full w-full object-cover"
                          fallback="🎁"
                          priority
                        />
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* SEARCH */}
          <section className="sticky top-[calc(72px+env(safe-area-inset-top))] z-30 mt-5 border-y border-black/5 bg-[#f7f6f2]/95 px-3 min-[390px]:px-4 py-3 backdrop-blur-xl">
            <div className="flex gap-2">
              <div className="relative min-w-0 flex-1">
                <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-sm">
                  🔍
                </span>
                <input
                  type="text"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder="Search dishes"
                  className="dd-input h-12 w-full rounded-2xl border border-black/5 bg-white pl-10 pr-10 text-base font-semibold outline-none shadow-sm focus:border-orange-300 focus:ring-4 focus:ring-orange-50"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full bg-neutral-100 text-xs text-neutral-500"
                  >
                    ✕
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={() => setShowFilter(current => !current)}
                className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border text-base shadow-sm transition ${
                  showFilter || filterType !== 'all'
                    ? 'border-orange-500 bg-orange-500 text-white'
                    : 'border-black/5 bg-white text-neutral-900'
                }`}
                aria-label="Food filters"
              >
                ⚙
              </button>
            </div>

            {showFilter && (
              <div className="dd-scrollbar-none mt-3 flex gap-2 overflow-x-auto pb-1">
                {[
                  ['all', 'All'],
                  ['veg', '🟢 Veg'],
                  ['non-veg', '🔴 Non-Veg'],
                  ['egg', '🥚 Egg'],
                  ['beverage', '🥤 Drinks'],
                  ['other', '⚪ Other']
                ].map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setFilterType(value)}
                    className={`shrink-0 rounded-full px-4 py-2 text-[10px] font-black ${
                      filterType === value
                        ? 'bg-neutral-950 text-white'
                        : 'border border-black/5 bg-white text-neutral-600'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </section>

          {/* CATEGORIES */}
          <section className="mt-4">
            <div className="px-3 min-[390px]:px-4">
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-400">
                Browse by category
              </p>
            </div>
            <div className="dd-scrollbar-none mt-2 flex gap-2 overflow-x-auto px-3 min-[390px]:px-4 pb-2">
              {categories.map(category => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setSelectedCategory(category)}
                  className={`shrink-0 rounded-full px-4 py-2.5 text-xs font-black transition ${
                    selectedCategory === category
                      ? 'bg-orange-500 text-white shadow-md shadow-orange-500/15'
                      : 'border border-black/5 bg-white text-neutral-600 shadow-sm'
                  }`}
                >
                  {category}
                </button>
              ))}
            </div>
          </section>

          {/* BEST SELLERS */}
          {bestSellers.length > 0 &&
            selectedCategory === 'All' &&
            !searchQuery && (
              <section className="mt-5">
                <div className="flex items-end justify-between px-3 min-[390px]:px-4">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] text-orange-500">
                      Customer favourites
                    </p>
                    <h2 className="mt-1 text-xl font-black">Popular right now</h2>
                  </div>
                  <span className="text-lg">🔥</span>
                </div>

                <div className="dd-scrollbar-none mt-3 flex gap-3 overflow-x-auto px-3 min-[390px]:px-4 pb-2">
                  {bestSellers.map((item, index) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => updateCart(item, 1)}
                      className="dd-card min-w-[132px] min-[390px]:min-w-[142px] overflow-hidden rounded-[22px] min-[390px]:rounded-[24px] border border-black/5 bg-white text-left active:scale-[.99]"
                    >
                      <div className="relative h-[112px] bg-neutral-100">
                        <MenuFoodImage
                          src={item.image_url}
                          alt={item.name}
                          className="h-full w-full object-cover"
                          priority={index < 6}
                        />
                        <span className="absolute left-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-neutral-950 text-[10px] font-black text-white">
                          {index + 1}
                        </span>
                        <span className="absolute bottom-2 right-2 rounded-full bg-white px-2.5 py-1 text-[9px] font-black text-orange-600 shadow">
                          + ADD
                        </span>
                      </div>
                      <div className="p-3">
                        <p className="line-clamp-1 text-xs font-black">{item.name}</p>
                        <p className="mt-1 text-sm font-black text-orange-600">
                          {money(item.price)}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </section>
            )}

          {/* MENU */}
          <section className="px-3 min-[390px]:px-4 pb-4 pt-6">
            <div className="flex items-end justify-between">
              <div>
                <p className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-400">
                  {filterType === 'all' ? 'Full menu' : foodLabels[filterType] || 'Filtered'}
                </p>
                <h2 className="mt-1 text-2xl font-black">{selectedCategory}</h2>
              </div>
              <p className="text-[10px] font-bold text-neutral-400">
                {filteredItems.length} dishes
              </p>
            </div>

            {filteredItems.length === 0 ? (
              <div className="mt-4 rounded-[28px] border border-dashed border-neutral-300 bg-white px-5 py-14 text-center">
                <div className="text-5xl">🍽️</div>
                <h3 className="mt-4 font-black">No dishes found</h3>
                <p className="mt-1 text-xs text-neutral-500">
                  Try another search, category or food filter.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('')
                    setSelectedCategory('All')
                    setFilterType('all')
                  }}
                  className="mt-4 rounded-full bg-neutral-950 px-5 py-2.5 text-[10px] font-black text-white"
                >
                  Reset filters
                </button>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {filteredItems.map((item, itemIndex) => {
                  const qty = cart[item.id]?.quantity || 0
                  const foodType = getFoodType(item)
                  const highlyReordered = shouldShowHighlyReordered(item)

                  return (
                    <article
                      key={item.id}
                      className="dd-card overflow-hidden rounded-[26px] border border-black/5 bg-white"
                    >
                      <div className="flex min-h-[150px]">
                        <div className="flex min-w-0 flex-1 flex-col p-4">
                          <div className="flex items-center gap-2">
                            <span
                              className={`h-2.5 w-2.5 shrink-0 rounded-full ${
                                foodDots[foodType] || foodDots.other
                              }`}
                            />
                            <span className="text-[8px] font-black uppercase tracking-wider text-neutral-400">
                              {foodLabels[foodType] || 'Other'}
                            </span>
                            {highlyReordered && (
                              <span className="rounded-full bg-amber-50 px-2 py-1 text-[8px] font-black uppercase text-amber-700">
                                ★ Highly Reordered
                              </span>
                            )}
                          </div>

                          <h3 className="mt-2 line-clamp-2 text-base font-black leading-snug">
                            {item.name}
                          </h3>

                          <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-neutral-500">
                            {item.description || 'Freshly prepared specialty dish.'}
                          </p>

                          <div className="mt-auto flex items-end gap-2 pt-3">
                            <span className="text-base font-black text-neutral-950">
                              {money(item.price)}
                            </span>
                            {item.original_price &&
                              Number(item.original_price) > Number(item.price) && (
                                <span className="pb-0.5 text-[10px] text-neutral-400 line-through">
                                  {money(item.original_price)}
                                </span>
                              )}
                          </div>

                          {Number(item.order_count || 0) > 0 && (
                            <p className="mt-1 text-[8px] font-bold text-neutral-400">
                              Ordered {Number(item.order_count)} times
                            </p>
                          )}
                        </div>

                        <div className="relative w-[116px] min-[390px]:w-[132px] shrink-0 p-3 pl-0">
                          <div className="h-[108px] min-[390px]:h-[118px] overflow-hidden rounded-[18px] min-[390px]:rounded-[20px] bg-neutral-100">
                            <MenuFoodImage
                              src={item.image_url}
                              alt={item.name}
                              className="h-full w-full object-cover"
                              priority={itemIndex < 6}
                            />
                          </div>

                          <div className="absolute inset-x-2 bottom-2 flex justify-center">
                            {qty === 0 ? (
                              <button
                                type="button"
                                onClick={() => updateCart(item, 1)}
                                className="min-w-[88px] rounded-xl border border-orange-200 bg-white px-5 py-2.5 text-[10px] font-black text-orange-600 shadow-lg"
                              >
                                ADD
                              </button>
                            ) : (
                              <div className="flex min-w-[96px] items-center justify-between rounded-xl bg-orange-500 px-2 py-2 text-white shadow-lg">
                                <button
                                  type="button"
                                  onClick={() => updateCart(item, -1)}
                                  className="flex h-6 w-6 items-center justify-center text-base font-black"
                                >
                                  −
                                </button>
                                <span className="text-xs font-black">{qty}</span>
                                <button
                                  type="button"
                                  onClick={() => updateCart(item, 1)}
                                  className="flex h-6 w-6 items-center justify-center text-base font-black"
                                >
                                  +
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </section>

          {/* FLOATING CART */}
          {totalItemsCount > 0 && (
            <button
              type="button"
              onClick={() => {
                setActiveNav('cart')
                setShowCart(true)
              }}
              className="fixed bottom-[calc(5.8rem+env(safe-area-inset-bottom))] left-1/2 z-40 flex w-[calc(100svw-1rem)] max-w-[464px] -translate-x-1/2 items-center gap-2 min-[390px]:gap-3 rounded-[20px] min-[390px]:rounded-[22px] bg-neutral-950 px-3 min-[390px]:px-4 py-3.5 text-white shadow-2xl shadow-neutral-950/20"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/10 text-base">
                🛒
              </span>
              <div className="min-w-0 flex-1 text-left">
                <p className="text-[8px] font-black uppercase tracking-wider text-neutral-400">
                  {totalItemsCount} {totalItemsCount === 1 ? 'item' : 'items'} in cart
                </p>
                <p className="truncate text-xs font-black">View cart & checkout</p>
              </div>
              <span className="text-sm font-black text-orange-400">
                {money(totalAmount)}
              </span>
              <span className="text-neutral-400">→</span>
            </button>
          )}

          {/* CART SHEET */}
          {showCart && (
            <div className="fixed inset-0 z-[100] flex min-h-[100dvh] items-end justify-center">
              <button
                type="button"
                aria-label="Close cart"
                className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
                onClick={() => setShowCart(false)}
              />

              <div className="dd-sheet relative max-h-[92dvh] w-[100svw] max-w-[480px] overflow-x-hidden overflow-y-auto rounded-t-[30px] min-[390px]:rounded-t-[34px] bg-white pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl">
                <div className="sticky top-0 z-10 border-b border-neutral-100 bg-white/95 px-5 pb-4 pt-3 backdrop-blur-xl">
                  <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-neutral-200" />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-orange-500">
                        Your order
                      </p>
                      <h2 className="mt-1 text-2xl font-black">Cart</h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowCart(false)}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-sm font-black"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div className="p-5">
                  {cartItemsArray.length === 0 ? (
                    <div className="py-14 text-center">
                      <div className="text-5xl">🛒</div>
                      <h3 className="mt-4 text-lg font-black">Your cart is empty</h3>
                      <p className="mt-1 text-xs text-neutral-500">
                        Add something delicious from the menu.
                      </p>
                    </div>
                  ) : (
                    <>
                      <div className="space-y-3">
                        {cartItemsArray.map(item => (
                          <div
                            key={item.id}
                            className="flex items-center gap-3 rounded-2xl border border-neutral-100 bg-[#fafafa] p-3"
                          >
                            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-neutral-100">
                              <MenuFoodImage
                                src={item.image_url}
                                alt={item.name}
                                className="h-full w-full object-cover"
                                priority
                              />
                            </div>

                            <div className="min-w-0 flex-1">
                              <h3 className="truncate text-xs font-black">{item.name}</h3>
                              <p className="mt-1 text-xs font-black text-orange-600">
                                {money(item.price)}
                              </p>
                            </div>

                            <div className="flex items-center gap-2 rounded-xl border border-orange-100 bg-white px-1.5 py-1.5 text-orange-600">
                              <button
                                type="button"
                                onClick={() => updateCart(item, -1)}
                                className="flex h-7 w-7 items-center justify-center font-black"
                              >
                                −
                              </button>
                              <span className="min-w-4 text-center text-xs font-black">
                                {item.quantity}
                              </span>
                              <button
                                type="button"
                                onClick={() => updateCart(item, 1)}
                                className="flex h-7 w-7 items-center justify-center font-black"
                              >
                                +
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-5">
                        <p className="mb-2 text-[9px] font-black uppercase tracking-wider text-neutral-400">
                          Order type
                        </p>
                        <div className="grid grid-cols-2 gap-2 rounded-2xl bg-neutral-100 p-1.5">
                          <button
                            type="button"
                            onClick={() => setOrderType('dine-in')}
                            className={`rounded-xl py-3 text-xs font-black ${
                              orderType === 'dine-in'
                                ? 'bg-white text-neutral-950 shadow-sm'
                                : 'text-neutral-500'
                            }`}
                          >
                            🍽 Dine-In
                          </button>
                          <button
                            type="button"
                            onClick={() => setOrderType('parcel')}
                            className={`rounded-xl py-3 text-xs font-black ${
                              orderType === 'parcel'
                                ? 'bg-white text-orange-600 shadow-sm'
                                : 'text-neutral-500'
                            }`}
                          >
                            🥡 Takeaway
                          </button>
                        </div>
                      </div>

                      <div className="mt-5 rounded-[24px] bg-neutral-950 p-4 text-white">
                        <p className="text-[9px] font-black uppercase tracking-[0.18em] text-neutral-400">
                          Bill summary
                        </p>
                        <div className="mt-4 space-y-2 text-xs">
                          <div className="flex justify-between">
                            <span className="text-neutral-400">Subtotal</span>
                            <span className="font-bold">{money(subtotalAmount)}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-neutral-400">
                              GST ({totalTaxPercent}%)
                            </span>
                            <span className="font-bold">{money(gstAmount)}</span>
                          </div>
                          {packingFee > 0 && (
                            <div className="flex justify-between">
                              <span className="text-neutral-400">Packing</span>
                              <span className="font-bold">{money(packingFee)}</span>
                            </div>
                          )}
                          <div className="mt-3 flex justify-between border-t border-white/10 pt-3">
                            <span className="font-black">Total</span>
                            <span className="text-xl font-black text-orange-400">
                              {money(totalAmount)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {counterPaymentEnabled && (
                        <div className="mt-5">
                          <p className="mb-2 text-[9px] font-black uppercase tracking-wider text-neutral-400">
                            Payment method
                          </p>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              type="button"
                              onClick={() => setPaymentMethod('online')}
                              className={`rounded-2xl border py-3.5 text-xs font-black ${
                                paymentMethod === 'online'
                                  ? 'border-orange-500 bg-orange-50 text-orange-700'
                                  : 'border-neutral-200 text-neutral-500'
                              }`}
                            >
                              ⚡ Online
                            </button>
                            <button
                              type="button"
                              onClick={() => setPaymentMethod('counter')}
                              className={`rounded-2xl border py-3.5 text-xs font-black ${
                                paymentMethod === 'counter'
                                  ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                                  : 'border-neutral-200 text-neutral-500'
                              }`}
                            >
                              💵 Counter
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="mt-5">
                        {paymentMethod === 'online' ? (
                          <button
                            type="button"
                            onClick={handleRazorpayCheckout}
                            disabled={paymentLoading}
                            className="w-full rounded-2xl bg-orange-500 py-4 text-sm font-black text-white shadow-lg shadow-orange-500/20 disabled:opacity-50"
                          >
                            {paymentLoading
                              ? 'Connecting...'
                              : `Pay ${money(totalAmount)} & Place Order`}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={handlePayAtCounter}
                            disabled={paymentLoading}
                            className="w-full rounded-2xl bg-emerald-600 py-4 text-sm font-black text-white shadow-lg shadow-emerald-600/15 disabled:opacity-50"
                          >
                            {paymentLoading
                              ? 'Placing Order...'
                              : `Pay ${money(totalAmount)} at Counter`}
                          </button>
                        )}
                      </div>

                      <p className="mt-4 text-center text-[9px] font-bold text-neutral-400">
                        Secure ordering by Digital Dining
                      </p>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ORDERS SHEET */}
          {showOrders && (
            <div className="fixed inset-0 z-[110] flex min-h-[100dvh] items-end justify-center">
              <button
                type="button"
                aria-label="Close orders"
                className="absolute inset-0 bg-black/55 backdrop-blur-[2px]"
                onClick={() => setShowOrders(false)}
              />

              <div className="dd-sheet relative h-[92dvh] w-[100svw] max-w-[480px] overflow-x-hidden overflow-y-auto rounded-t-[30px] min-[390px]:rounded-t-[34px] bg-white pb-[max(1rem,env(safe-area-inset-bottom))] shadow-2xl">
                <div className="sticky top-0 z-10 border-b border-neutral-100 bg-white/95 px-5 pb-4 pt-3 backdrop-blur-xl">
                  <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-neutral-200" />
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-orange-500">
                        Live tracking
                      </p>
                      <h2 className="mt-1 text-2xl font-black">My Orders</h2>
                    </div>
                    <button
                      type="button"
                      onClick={() => setShowOrders(false)}
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-neutral-100 text-sm font-black"
                    >
                      ✕
                    </button>
                  </div>
                </div>

                <div className="p-5">
                  {ordersLoading ? (
                    <div className="py-20 text-center">
                      <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-neutral-100 border-t-orange-500" />
                      <p className="mt-3 text-xs text-neutral-500">Loading orders...</p>
                    </div>
                  ) : customerOrders.length === 0 ? (
                    <div className="py-20 text-center">
                      <div className="text-5xl">🧾</div>
                      <h3 className="mt-4 text-lg font-black">No orders yet</h3>
                      <p className="mt-1 text-xs text-neutral-500">
                        Your orders will appear here after checkout.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {customerOrders.map(order => {
                        const step = getStatusStep(order.status)

                        return (
                          <article
                            key={order.id}
                            className="rounded-[28px] border border-black/5 bg-[#fafafa] p-4"
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">
                                  Order
                                </p>
                                <p className="mt-1 text-2xl font-black">
                                  #{order.order_number}
                                </p>
                                <p className="mt-1 text-[9px] text-neutral-400">
                                  {order.created_at
                                    ? new Date(order.created_at).toLocaleString()
                                    : ''}
                                </p>
                              </div>

                              <div className="text-right">
                                <p className="text-lg font-black">
                                  {money(order.total_amount)}
                                </p>
                                <span className="mt-1 inline-flex rounded-full bg-orange-100 px-3 py-1.5 text-[8px] font-black uppercase text-orange-700">
                                  {getOrderStatus(order.status)}
                                </span>
                              </div>
                            </div>

                            <div className="mt-6">
                              <div className="relative flex justify-between">
                                <div className="absolute left-4 right-4 top-4 h-1 rounded-full bg-neutral-200" />
                                <div
                                  className="absolute left-4 top-4 h-1 rounded-full bg-orange-500 transition-all"
                                  style={{ width: `${Math.min(step * 25, 75)}%` }}
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
                                    className="relative z-10 flex w-1/5 flex-col items-center"
                                  >
                                    <div
                                      className={`flex h-9 w-9 items-center justify-center rounded-full text-xs ${
                                        index <= step
                                          ? 'border-2 border-orange-300 bg-orange-50'
                                          : 'border border-neutral-200 bg-white'
                                      }`}
                                    >
                                      {icon}
                                    </div>
                                    <span className="mt-2 text-center text-[7px] font-bold text-neutral-500">
                                      {label}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>

                            <div className="mt-6 space-y-2 border-t border-neutral-200 pt-4">
                              {Array.isArray(order.items) &&
                                order.items.map((item, index) => (
                                  <div
                                    key={item.id || index}
                                    className="flex justify-between gap-3 text-xs"
                                  >
                                    <span className="min-w-0 flex-1 text-neutral-600">
                                      {item.name} × {Number(item.quantity || item.qty || 1)}
                                    </span>
                                    <span className="shrink-0 font-black">
                                      {money(
                                        Number(item.price || 0) *
                                          Number(item.quantity || item.qty || 1)
                                      )}
                                    </span>
                                  </div>
                                ))}
                            </div>

                            <div className="mt-4 space-y-2 border-t border-neutral-200 pt-4 text-[10px]">
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
                            </div>

                            <div className="mt-4">
                              {String(order.payment_mode || '')
                                .toLowerCase()
                                .includes('counter') ? (
                                <div className="rounded-2xl bg-amber-50 p-3">
                                  <p className="text-[9px] font-black uppercase text-amber-700">
                                    💵 Pay at Counter
                                  </p>
                                  <p className="mt-1 text-[9px] text-amber-600">
                                    Payment pending at counter.
                                  </p>
                                </div>
                              ) : (
                                <div className="rounded-2xl bg-emerald-50 p-3">
                                  <p className="text-[9px] font-black uppercase text-emerald-700">
                                    ✓ Online Payment
                                  </p>
                                  <p className="mt-1 text-[9px] text-emerald-600">
                                    Payment recorded online.
                                  </p>
                                </div>
                              )}
                            </div>
                          </article>
                        )
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* BOTTOM NAVIGATION */}
          <nav className="fixed bottom-0 left-1/2 z-50 w-[100svw] max-w-[480px] -translate-x-1/2 overflow-hidden border-t border-black/5 bg-white/95 px-1.5 min-[390px]:px-2 pt-2 pb-[max(.5rem,env(safe-area-inset-bottom))] backdrop-blur-xl">
            <div className="grid grid-cols-4 gap-1">
              <button
                type="button"
                onClick={() => {
                  setActiveNav('home')
                  setShowOrders(false)
                  setShowCart(false)
                  window.scrollTo({ top: 0, behavior: 'smooth' })
                }}
                className={`flex flex-col items-center rounded-2xl py-2.5 ${
                  activeNav === 'home'
                    ? 'bg-orange-50 text-orange-600'
                    : 'text-neutral-400'
                }`}
              >
                <span className="text-lg">⌂</span>
                <span className="mt-1 text-[7px] min-[390px]:text-[8px] font-black uppercase">Home</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveNav('cart')
                  setShowCart(true)
                }}
                className={`relative flex flex-col items-center rounded-2xl py-2.5 ${
                  activeNav === 'cart'
                    ? 'bg-orange-50 text-orange-600'
                    : 'text-neutral-400'
                }`}
              >
                <span className="text-lg">🛒</span>
                {totalItemsCount > 0 && (
                  <span className="absolute right-[21%] top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-orange-500 px-1 text-[7px] font-black text-white">
                    {totalItemsCount > 9 ? '9+' : totalItemsCount}
                  </span>
                )}
                <span className="mt-1 text-[7px] min-[390px]:text-[8px] font-black uppercase">Cart</span>
              </button>

              <button
                type="button"
                onClick={openOrders}
                className={`relative flex flex-col items-center rounded-2xl py-2.5 ${
                  activeNav === 'orders'
                    ? 'bg-orange-50 text-orange-600'
                    : 'text-neutral-400'
                }`}
              >
                <span className="text-lg">🧾</span>
                {customerOrders.length > 0 && (
                  <span className="absolute right-[21%] top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-neutral-950 px-1 text-[7px] font-black text-white">
                    {customerOrders.length > 9 ? '9+' : customerOrders.length}
                  </span>
                )}
                <span className="mt-1 text-[7px] min-[390px]:text-[8px] font-black uppercase">Orders</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setActiveNav('signin')
                  setIsVerified(false)
                  setShowPortal(false)
                  setCustomerName('')
                  setCustomerMobile('')
                }}
                className={`flex flex-col items-center rounded-2xl py-2.5 ${
                  activeNav === 'signin'
                    ? 'bg-orange-50 text-orange-600'
                    : 'text-neutral-400'
                }`}
              >
                <span className="text-lg">♙</span>
                <span className="mt-1 text-[7px] min-[390px]:text-[8px] font-black uppercase">Sign In</span>
              </button>
            </div>
          </nav>

          <footer className="px-4 pb-3 pt-8 text-center text-[9px] font-bold uppercase tracking-[0.14em] text-neutral-400">
            Powered by <span className="text-orange-500">Digital Dining</span>
          </footer>
        </div>
      </main>
    </>
  )
}
