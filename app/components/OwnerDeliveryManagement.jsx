'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { supabase } from '@/lib/supabase'
import PaymentGatewayConfigCard from '@/app/components/PaymentGatewayConfigCard'
import DeliveryLocationMap from '@/app/components/DeliveryLocationMap'
import { appConfirm, appNotice, appPrompt } from '@/lib/appDialog'
import { scanBarcodeWithCamera } from '@/lib/barcodeScanner'
import { useLiveDeliveryRefresh } from '@/lib/useLiveDeliveryRefresh'
import InstallAppButton from '@/app/components/InstallAppButton'

const ORDER_STATUSES = [
  'received',
  'confirmed',
  'preparing',
  'packed',
  'out_for_delivery',
  'delivered',
  'cancelled',
]

const EMPTY_SETTINGS = {
  store_name: '',
  description: '',
  logo_url: '',
  banner_url: '',
  is_open: true,
  cod_enabled: true,
  online_payment_enabled: false,
  minimum_order_amount: 0,
  delivery_fee: 0,
  free_delivery_above: '',
  packing_charge: 0,
  handling_charge: 0,
  surge_enabled: true,
  surge_charge: 0,
  orders_per_delivery_boy_per_hour: 5,
  tax_enabled: true,
  sgst_rate: 2.5,
  cgst_rate: 2.5,
  max_delivery_distance_km: '',
  delivery_radius_enabled: false,
  delivery_origin_latitude: '',
  delivery_origin_longitude: '',
  delivery_origin_accuracy_m: '',
  estimated_delivery_minutes: 45,
  auto_assign_enabled: false,
  auto_assign_min_orders: 3,
  support_phone: '',
  address: '',
  city: '',
  state: '',
  pincode: '',
  bill_business_name: '',
  bill_gstin: '',
  bill_footer: '',
  bill_signature_name: '',
  bill_logo_url: '',
}

const EMPTY_MENU = {
  id: '',
  item_type: 'food',
  name: '',
  category: 'Main Course',
  description: '',
  image_url: '',
  food_type: 'veg',
  delivery_price: '',
  delivery_offer_price: '',
  delivery_enabled: true,
  delivery_available: true,
  barcode: '',
  opening_stock: '0',
  low_stock_threshold: '5',
}

const EMPTY_DRIVER = {
  name: '',
  mobile: '',
  alternate_mobile: '',
  vehicle_type: 'bike',
  vehicle_number: '',
  portal_user_id: '',
  password: '',
}

const EMPTY_PACKER = {
  name: '',
  mobile: '',
  portal_user_id: '',
  password: '',
}

const EMPTY_OFFER = {
  title: '',
  description: '',
  discount_text: '',
  original_price: '',
  offer_price: '',
  image_url: '',
  offer_date: new Date().toLocaleDateString('en-CA'),
}

function money(value) {
  return `₹${Number(value || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 2,
  })}`
}

function cleanDigits(value, max = 10) {
  return String(value || '')
    .replace(/\D/g, '')
    .slice(0, max)
}

function labelStatus(value) {
  return String(value || '')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function orderTime(value) {
  if (!value) return '—'

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return '—'
  }

  return date.toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function indiaDateKey(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value)

  if (Number.isNaN(date.getTime())) return ''

  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date)

  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value])
  )

  return `${values.year}-${values.month}-${values.day}`
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;')
}

function safePrintImageUrl(value) {
  if (typeof window === 'undefined') return ''

  try {
    const url = new URL(
      String(value || ''),
      window.location.origin
    )

    if (!['http:', 'https:'].includes(url.protocol)) {
      return ''
    }

    return url.href
  } catch {
    return ''
  }
}

function billItemQuantity(item) {
  const quantity = Number(
    item?.quantity ??
      item?.qty ??
      1
  )

  return Number.isFinite(quantity) && quantity > 0
    ? quantity
    : 1
}

function billItemPrice(item) {
  const quantity =
    billItemQuantity(item)

  const explicitPrice = Number(
    item?.price ??
      item?.unit_price
  )

  if (Number.isFinite(explicitPrice)) {
    return explicitPrice
  }

  const lineTotal = Number(
    item?.line_total ??
      item?.total
  )

  if (
    Number.isFinite(lineTotal) &&
    quantity > 0
  ) {
    return lineTotal / quantity
  }

  return 0
}

function billItemTotal(item) {
  const explicitTotal = Number(
    item?.line_total ??
      item?.total
  )

  if (Number.isFinite(explicitTotal)) {
    return explicitTotal
  }

  return (
    billItemPrice(item) *
    billItemQuantity(item)
  )
}


function csvValue(value) {
  const text = String(value ?? '')
  return `"${text.replaceAll('"', '""')}"`
}

function downloadCsv(filename, headers, rows) {
  if (typeof window === 'undefined') return

  const content = [
    headers.map(csvValue).join(','),
    ...rows.map((row) => row.map(csvValue).join(',')),
  ].join('\\n')

  const blob = new Blob([`\\ufeff${content}`], {
    type: 'text/csv;charset=utf-8',
  })

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

function inventoryMovementLabel(value) {
  const type = String(value || '').toUpperCase()

  const labels = {
    ORDER_RESERVE: 'Order Reserved',
    ORDER_SALE: 'Order Sale',
    ORDER_RELEASE: 'Reservation Released',
    ORDER_CANCEL: 'Order Cancelled / Returned',
    RESTOCK: 'Restocked',
    RETURN: 'Returned to Stock',
    MANUAL_ADJUST: 'Manual Adjustment',
  }

  return labels[type] || labelStatus(type)
}

function inventoryMovementTone(value) {
  const type = String(value || '').toUpperCase()

  if (['RESTOCK', 'RETURN', 'ORDER_RELEASE', 'ORDER_CANCEL'].includes(type)) {
    return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
  }

  if (type === 'ORDER_SALE') {
    return 'border-sky-500/20 bg-sky-500/10 text-sky-300'
  }

  if (type === 'ORDER_RESERVE') {
    return 'border-violet-500/20 bg-violet-500/10 text-violet-300'
  }

  if (type === 'MANUAL_ADJUST') {
    return 'border-amber-500/20 bg-amber-500/10 text-amber-300'
  }

  return 'border-neutral-700 bg-neutral-800 text-neutral-300'
}

export default function DeliveryManagement({
  restaurant,
  planCode = '',
}) {
  const restaurantId = restaurant?.id
  const deliveryOnly =
    String(planCode).toLowerCase() === 'delivery'

  const [tab, setTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const [settings, setSettings] =
    useState(EMPTY_SETTINGS)
  const [orders, setOrders] = useState([])
  const [menuItems, setMenuItems] = useState([])
  const [offers, setOffers] = useState([])
  const [drivers, setDrivers] = useState([])
  const [packers, setPackers] = useState([])
  const [deliveryProofsByOrder, setDeliveryProofsByOrder] = useState({})

  const [message, setMessage] = useState('')
  const [alarmEnabled, setAlarmEnabled] = useState(false)
  const knownOrderIdsRef = useRef(new Set())
  const hasInitialOrderSnapshotRef = useRef(false)
  const audioContextRef = useRef(null)

  const [search, setSearch] = useState('')
  const [orderNumberSearch, setOrderNumberSearch] = useState('')
  const [orderDateFilter, setOrderDateFilter] = useState('')
  const [orderStatusFilter, setOrderStatusFilter] =
    useState('active')

  const [menuForm, setMenuForm] =
    useState(EMPTY_MENU)
  const [menuSaving, setMenuSaving] =
    useState(false)

  const [inventorySearch, setInventorySearch] =
    useState('')
  const [inventoryFilter, setInventoryFilter] =
    useState('all')
  const [editingInventoryId, setEditingInventoryId] =
    useState('')
  const [inventorySaving, setInventorySaving] =
    useState(false)
  const [restockingId, setRestockingId] =
    useState('')
  const [inventoryDraft, setInventoryDraft] =
    useState({
      item_type: 'food',
      barcode: '',
      track_stock: false,
      stock_quantity: '0',
      low_stock_threshold: '5',
    })

  const [inventoryReport, setInventoryReport] = useState(null)
  const [inventoryReportLoading, setInventoryReportLoading] = useState(false)
  const [inventoryReportError, setInventoryReportError] = useState('')
  const [inventoryReportStartDate, setInventoryReportStartDate] = useState(() => indiaDateKey())
  const [inventoryReportEndDate, setInventoryReportEndDate] = useState(() => indiaDateKey())
  const [selectedInventoryHistoryId, setSelectedInventoryHistoryId] = useState('')
  const [inventoryHistoryReport, setInventoryHistoryReport] = useState(null)
  const [inventoryHistoryLoading, setInventoryHistoryLoading] = useState(false)
  const [inventoryHistoryError, setInventoryHistoryError] = useState('')

  const [printingOrderId, setPrintingOrderId] =
    useState('')
  const [savingBillSettings, setSavingBillSettings] =
    useState(false)

  const [codReport, setCodReport] = useState(null)
  const [codLoading, setCodLoading] = useState(false)
  const [codError, setCodError] = useState('')
  const [codReviewId, setCodReviewId] = useState('')

  const [driverForm, setDriverForm] =
    useState(EMPTY_DRIVER)
  const [driverSaving, setDriverSaving] =
    useState(false)

  const [packerForm, setPackerForm] =
    useState(EMPTY_PACKER)
  const [packerSaving, setPackerSaving] =
    useState(false)

  const [offerForm, setOfferForm] =
    useState(EMPTY_OFFER)
  const [offerSaving, setOfferSaving] =
    useState(false)

  const [savingSettings, setSavingSettings] =
    useState(false)
  const [runningAutoAssign, setRunningAutoAssign] =
    useState(false)
  const [ownerLocationLoading, setOwnerLocationLoading] =
    useState(false)
  const [ownerLocationError, setOwnerLocationError] =
    useState('')

  const deliveryUrl =
    typeof window !== 'undefined' &&
    restaurant?.restaurant_code
      ? `${window.location.origin}/delivery/${restaurant.restaurant_code}`
      : restaurant?.restaurant_code
        ? `/delivery/${restaurant.restaurant_code}`
        : ''

  const qrUrl = deliveryUrl
    ? `https://quickchart.io/qr?size=320&margin=2&text=${encodeURIComponent(
        deliveryUrl
      )}`
    : ''

  const driverPortalUrl =
    typeof window !== 'undefined' &&
    restaurant?.restaurant_code
      ? `${window.location.origin}/delivery-driver/${restaurant.restaurant_code}`
      : restaurant?.restaurant_code
        ? `/delivery-driver/${restaurant.restaurant_code}`
        : ''

  const packerPortalUrl =
    typeof window !== 'undefined' &&
    restaurant?.restaurant_code
      ? `${window.location.origin}/delivery-packer/${restaurant.restaurant_code}`
      : restaurant?.restaurant_code
        ? `/delivery-packer/${restaurant.restaurant_code}`
        : ''

  const playNewOrderAlarm = useCallback(() => {
    if (!alarmEnabled || typeof window === 'undefined') {
      return
    }

    try {
      const AudioContextClass =
        window.AudioContext ||
        window.webkitAudioContext

      if (!AudioContextClass) return

      if (!audioContextRef.current) {
        audioContextRef.current =
          new AudioContextClass()
      }

      const context =
        audioContextRef.current

      if (context.state === 'suspended') {
        context.resume()
      }

      const now = context.currentTime

      ;[0, 0.22, 0.44].forEach((offset) => {
        const oscillator =
          context.createOscillator()

        const gain =
          context.createGain()

        oscillator.type = 'sine'

        oscillator.frequency.setValueAtTime(
          880,
          now + offset
        )

        gain.gain.setValueAtTime(
          0.0001,
          now + offset
        )

        gain.gain.exponentialRampToValueAtTime(
          0.18,
          now + offset + 0.02
        )

        gain.gain.exponentialRampToValueAtTime(
          0.0001,
          now + offset + 0.14
        )

        oscillator.connect(gain)
        gain.connect(
          context.destination
        )

        oscillator.start(
          now + offset
        )

        oscillator.stop(
          now + offset + 0.16
        )
      })
    } catch (error) {
      console.error(
        'Delivery order alarm error:',
        error
      )
    }
  }, [alarmEnabled])

  const inspectNewOrders = useCallback(
    (nextOrders, announce = false) => {
      const nextIds = new Set(
        nextOrders.map(
          (order) => order.id
        )
      )

      if (
        announce &&
        hasInitialOrderSnapshotRef.current
      ) {
        const newOrders =
          nextOrders.filter(
            (order) =>
              !knownOrderIdsRef.current.has(
                order.id
              ) &&
              String(
                order.order_status ||
                  ''
              ) === 'received'
          )

        if (newOrders.length > 0) {
          playNewOrderAlarm()

          setMessage(
            `${newOrders.length} new Delivery ${
              newOrders.length === 1
                ? 'order'
                : 'orders'
            } received.`
          )

          if (
            typeof window !==
              'undefined' &&
            'Notification' in window &&
            Notification.permission ===
              'granted'
          ) {
            new Notification(
              'New Delivery Order',
              {
                body:
                  newOrders.length ===
                  1
                    ? `${newOrders[0].order_code} · ${newOrders[0].customer_name}`
                    : `${newOrders.length} new Delivery orders`,
              }
            )
          }
        }
      }

      knownOrderIdsRef.current =
        nextIds

      hasInitialOrderSnapshotRef.current =
        true
    },
    [playNewOrderAlarm]
  )

  const enableOrderAlarm = async () => {
    try {
      if (
        typeof window !==
        'undefined'
      ) {
        const AudioContextClass =
          window.AudioContext ||
          window.webkitAudioContext

        if (AudioContextClass) {
          if (
            !audioContextRef.current
          ) {
            audioContextRef.current =
              new AudioContextClass()
          }

          await audioContextRef.current.resume()
        }

        if (
          'Notification' in window &&
          Notification.permission ===
            'default'
        ) {
          await Notification.requestPermission()
        }
      }

      setAlarmEnabled(true)

      setMessage(
        'New Delivery order alarm enabled.'
      )
    } catch (error) {
      console.error(
        'Unable to unlock Delivery order alarm:',
        error
      )

      setAlarmEnabled(true)
    }
  }


  const loadDeliveryProofs = useCallback(
    async () => {
      if (!restaurantId) return

      try {
        const {
          data: { session },
          error: sessionError,
        } = await supabase.auth.getSession()

        if (sessionError) throw sessionError

        const accessToken =
          session?.access_token

        if (!accessToken) {
          throw new Error(
            'Your owner session has expired.'
          )
        }

        const response = await fetch(
          `/api/delivery/driver-proof?restaurantId=${encodeURIComponent(
            restaurantId
          )}`,
          {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${accessToken}`,
            },
            cache: 'no-store',
          }
        )

        const data = await response
          .json()
          .catch(() => ({}))

        if (!response.ok || !data?.success) {
          throw new Error(
            data?.message ||
              'Unable to load delivery proof.'
          )
        }

        const grouped = {}

        for (const proof of Array.isArray(data.proofs)
          ? data.proofs
          : []) {
          const orderId = String(
            proof.delivery_order_id || ''
          )

          if (!orderId) continue

          if (!grouped[orderId]) {
            grouped[orderId] = []
          }

          grouped[orderId].push(proof)
        }

        setDeliveryProofsByOrder(grouped)
      } catch (proofError) {
        console.error(
          'Delivery proof load error:',
          proofError
        )
      }
    },
    [restaurantId]
  )

  const loadDelivery = useCallback(
    async (
      quiet = false,
      announceNew = false
    ) => {
      if (!restaurantId) return

      if (quiet) {
        setRefreshing(true)
      } else {
        setLoading(true)
      }

      setMessage('')

      try {
        const [
          settingsResult,
          ordersResult,
          driversResult,
          packersResult,
          menuResult,
          offersResult,
        ] = await Promise.all([
          supabase
            .from('delivery_settings')
            .select('*')
            .eq('restaurant_id', restaurantId)
            .maybeSingle(),

          supabase
            .from('delivery_orders')
            .select('*')
            .eq('restaurant_id', restaurantId)
            // COD is operational immediately.
            // Razorpay becomes operational only after verified payment.
            .or(
              'payment_method.eq.cod,payment_status.eq.paid'
            )
            .order('created_at', {
              ascending: false,
            })
            .limit(200),

          supabase
            .from('delivery_drivers')
            .select('*')
            .eq('restaurant_id', restaurantId)
            .order('created_at', {
              ascending: false,
            }),

          supabase
            .from('delivery_packers')
            .select('*')
            .eq('restaurant_id', restaurantId)
            .order('created_at', {
              ascending: false,
            }),

          supabase
            .from('menu_items')
            .select(
              `
                id,
                restaurant_id,
                name,
                price,
                original_price,
                offer_price,
                category,
                description,
                image_url,
                is_veg,
                food_type,
                is_available,
                addons,
                delivery_enabled,
                delivery_available,
                delivery_price,
                delivery_offer_price,
                delivery_sort_order,
                item_type,
                barcode,
                track_stock,
                stock_quantity,
                reserved_quantity,
                low_stock_threshold,
                is_out_of_stock,
                stock_updated_at
              `
            )
            .eq('restaurant_id', restaurantId)
            .order('category', {
              ascending: true,
            })
            .order('name', {
              ascending: true,
            }),

          supabase
            .from('daily_offers')
            .select('*')
            .eq('restaurant_id', restaurantId)
            .order('created_at', {
              ascending: false,
            }),
        ])

        const failures = [
          settingsResult.error,
          ordersResult.error,
          driversResult.error,
          packersResult.error,
          menuResult.error,
          offersResult.error,
        ].filter(Boolean)

        if (failures.length) {
          throw failures[0]
        }

        let settingsRow =
          settingsResult.data

        if (!settingsRow) {
          const {
            data: created,
            error: createError,
          } = await supabase
            .from('delivery_settings')
            .insert({
              restaurant_id: restaurantId,
              store_name:
                restaurant?.name || '',
              support_phone:
                restaurant?.phone || '',
            })
            .select('*')
            .single()

          if (createError) {
            throw createError
          }

          settingsRow = created
        }

        setSettings({
          ...EMPTY_SETTINGS,
          ...(settingsRow || {}),
          free_delivery_above:
            settingsRow?.free_delivery_above ??
            '',
          max_delivery_distance_km:
            settingsRow
              ?.max_delivery_distance_km ??
            '',
        })

        const nextOrders =
          Array.isArray(
            ordersResult.data
          )
            ? ordersResult.data
            : []

        inspectNewOrders(
          nextOrders,
          announceNew
        )

        setOrders(nextOrders)

        setDrivers(
          Array.isArray(driversResult.data)
            ? driversResult.data
            : []
        )

        setPackers(
          Array.isArray(packersResult.data)
            ? packersResult.data
            : []
        )

        setMenuItems(
          Array.isArray(menuResult.data)
            ? menuResult.data
            : []
        )

        setOffers(
          Array.isArray(offersResult.data)
            ? offersResult.data
            : []
        )

        await loadDeliveryProofs()
      } catch (error) {
        console.error(
          'Delivery dashboard load error:',
          error
        )

        setMessage(
          error?.message ||
            'Unable to load Delivery Management.'
        )
      } finally {
        setLoading(false)
        setRefreshing(false)
      }
    },
    [
      restaurantId,
      restaurant?.name,
      restaurant?.phone,
      inspectNewOrders,
      loadDeliveryProofs,
    ]
  )

  useEffect(() => {
    loadDelivery()
  }, [loadDelivery])

  const refreshOrdersOnly = useCallback(
    async (announceNew = true) => {
      if (!restaurantId) return

      try {
        const { data, error } = await supabase
          .from('delivery_orders')
          .select('*')
          .eq('restaurant_id', restaurantId)
          // Never surface a pending/failed Razorpay payment attempt.
          .or(
            'payment_method.eq.cod,payment_status.eq.paid'
          )
          .order('created_at', {
            ascending: false,
          })
          .limit(200)

        if (error) throw error

        const nextOrders = Array.isArray(data) ? data : []
        inspectNewOrders(nextOrders, announceNew)
        setOrders(nextOrders)
        await loadDeliveryProofs()
      } catch (refreshError) {
        console.error('Delivery orders refresh error:', refreshError)
      }
    },
    [restaurantId, inspectNewOrders, loadDeliveryProofs]
  )

  useEffect(() => {
    if (!restaurantId) return undefined

    const channel = supabase
      .channel(`owner-delivery-orders-${restaurantId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'delivery_orders',
          filter: `restaurant_id=eq.${restaurantId}`,
        },
        () => refreshOrdersOnly(true)
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [restaurantId, refreshOrdersOnly])

  useLiveDeliveryRefresh(
    () => refreshOrdersOnly(true),
    Boolean(restaurantId),
    1000
  )


  const stats = useMemo(() => {
    const todayKey = indiaDateKey()

    const todayOrders = orders.filter(
      (order) =>
        order.created_at &&
        indiaDateKey(order.created_at) === todayKey
    )

    const activeOrders = orders.filter(
      (order) =>
        ![
          'delivered',
          'cancelled',
        ].includes(
          String(
            order.order_status || ''
          ).toLowerCase()
        )
    )

    const todayRevenue = todayOrders
      .filter(
        (order) =>
          String(
            order.order_status || ''
          ).toLowerCase() !==
          'cancelled'
      )
      .reduce(
        (sum, order) =>
          sum +
          Number(
            order.total_amount || 0
          ),
        0
      )

    return {
      today: todayOrders.length,
      active: activeOrders.length,
      todayRevenue,
      availableDrivers:
        drivers.filter(
          (driver) =>
            driver.is_active !== false &&
            driver.status ===
              'available'
        ).length,
      menuAvailable:
        menuItems.filter(
          (item) =>
            item.delivery_enabled !==
              false &&
            item.delivery_available !==
              false &&
            item.is_available !== false
        ).length,
    }
  }, [
    orders,
    drivers,
    menuItems,
  ])

  const filteredOrders = useMemo(() => {
    const term =
      search.trim().toLowerCase()

    return orders.filter((order) => {
      const status = String(
        order.order_status || ''
      ).toLowerCase()

      if (
        orderStatusFilter === 'active' &&
        [
          'delivered',
          'cancelled',
        ].includes(status)
      ) {
        return false
      }

      if (
        orderStatusFilter !== 'all' &&
        orderStatusFilter !== 'active' &&
        status !== orderStatusFilter
      ) {
        return false
      }

      const numberTerm = orderNumberSearch.trim()

      if (
        numberTerm &&
        String(order.order_number || '') !== numberTerm &&
        !String(order.order_code || '')
          .toLowerCase()
          .includes(numberTerm.toLowerCase())
      ) {
        return false
      }

      if (
        orderDateFilter &&
        indiaDateKey(order.created_at) !== orderDateFilter
      ) {
        return false
      }

      if (!term) return true

      return [
        order.order_code,
        order.order_number,
        order.customer_name,
        order.customer_mobile,
        order.city,
        order.pincode,
      ]
        .map((value) =>
          String(value || '')
            .toLowerCase()
        )
        .some((value) =>
          value.includes(term)
        )
    })
  }, [
    orders,
    search,
    orderNumberSearch,
    orderDateFilter,
    orderStatusFilter,
  ])



  const getOwnerInventoryReport = useCallback(
    async (menuItemId = '') => {
      if (!restaurantId) {
        throw new Error('Restaurant ID is missing.')
      }

      const { data, error } = await supabase.rpc(
        'owner_delivery_get_inventory_report',
        {
          p_restaurant_id: restaurantId,
          p_start_date: inventoryReportStartDate || null,
          p_end_date: inventoryReportEndDate || null,
          p_menu_item_id: menuItemId || null,
        }
      )

      if (error) throw error

      if (!data?.success) {
        throw new Error(
          data?.message || 'Unable to load inventory report.'
        )
      }

      return data
    },
    [
      restaurantId,
      inventoryReportStartDate,
      inventoryReportEndDate,
    ]
  )

  const loadInventoryReport = useCallback(
    async (quiet = false) => {
      if (!quiet) setInventoryReportLoading(true)
      setInventoryReportError('')

      try {
        const data = await getOwnerInventoryReport('')
        setInventoryReport(data)
      } catch (reportError) {
        console.error('Owner inventory report error:', reportError)
        setInventoryReportError(
          reportError?.message || 'Unable to load inventory report.'
        )
      } finally {
        setInventoryReportLoading(false)
      }
    },
    [getOwnerInventoryReport]
  )

  const loadInventoryHistory = useCallback(
    async (menuItemId) => {
      if (!menuItemId) {
        setSelectedInventoryHistoryId('')
        setInventoryHistoryReport(null)
        setInventoryHistoryError('')
        return
      }

      setSelectedInventoryHistoryId(menuItemId)
      setInventoryHistoryLoading(true)
      setInventoryHistoryError('')

      try {
        const data = await getOwnerInventoryReport(menuItemId)
        setInventoryHistoryReport(data)
      } catch (historyError) {
        console.error('Owner inventory history error:', historyError)
        setInventoryHistoryReport(null)
        setInventoryHistoryError(
          historyError?.message || 'Unable to load item inventory history.'
        )
      } finally {
        setInventoryHistoryLoading(false)
      }
    },
    [getOwnerInventoryReport]
  )

  const refreshInventoryReports = useCallback(async () => {
    await loadInventoryReport(false)

    if (selectedInventoryHistoryId) {
      await loadInventoryHistory(selectedInventoryHistoryId)
    }
  }, [
    loadInventoryReport,
    loadInventoryHistory,
    selectedInventoryHistoryId,
  ])

  useEffect(() => {
    if (tab !== 'inventory') return
    loadInventoryReport(false)
  }, [tab, loadInventoryReport])

  const inventoryReportItemsById = useMemo(() => {
    return new Map(
      (Array.isArray(inventoryReport?.items) ? inventoryReport.items : []).map(
        (item) => [String(item.id), item]
      )
    )
  }, [inventoryReport])

  const exportInventorySummaryCsv = () => {
    const rows = Array.isArray(inventoryReport?.items)
      ? inventoryReport.items
      : []

    if (!rows.length) {
      appNotice('There is no inventory report data to export.')
      return
    }

    downloadCsv(
      `delivery-inventory-${inventoryReportStartDate || 'start'}-to-${inventoryReportEndDate || 'end'}.csv`,
      [
        'Item',
        'Category',
        'Type',
        'Barcode',
        'Stock',
        'Reserved',
        'Available',
        'Low Stock Alert',
        'Sold Today',
        'Restocked Today',
        'Released Today',
        'Adjustments Today',
        'Sold In Range',
        'Restocked In Range',
        'Released In Range',
        'Movements In Range',
      ],
      rows.map((item) => [
        item.name,
        item.category,
        item.item_type,
        item.barcode,
        item.stock_quantity,
        item.reserved_quantity,
        item.available_stock,
        item.low_stock_threshold,
        item.sold_today,
        item.restocked_today,
        item.released_today,
        item.adjustments_today,
        item.sold_in_range,
        item.restocked_in_range,
        item.released_in_range,
        item.movements_in_range,
      ])
    )
  }

  const exportInventoryHistoryCsv = () => {
    const rows = Array.isArray(inventoryHistoryReport?.history)
      ? inventoryHistoryReport.history
      : []

    if (!rows.length) {
      appNotice('There is no movement history to export for this item.')
      return
    }

    const item = menuItems.find(
      (row) => String(row.id) === String(selectedInventoryHistoryId)
    )

    downloadCsv(
      `delivery-inventory-history-${String(item?.name || 'item')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')}-${inventoryReportStartDate}-to-${inventoryReportEndDate}.csv`,
      [
        'Date / Time',
        'Movement',
        'Quantity',
        'Order Code',
        'Order Number',
        'Notes',
        'Actor',
        'Stock Before',
        'Stock After',
        'Reserved Before',
        'Reserved After',
      ],
      rows.map((movement) => [
        orderTime(movement.created_at),
        inventoryMovementLabel(movement.movement_type),
        movement.quantity,
        movement.order_code,
        movement.order_number,
        movement.notes,
        movement.actor_name,
        movement.stock_before,
        movement.stock_after,
        movement.reserved_before,
        movement.reserved_after,
      ])
    )
  }

  const inventoryStats = useMemo(() => {
    const tracked =
      menuItems.filter(
        (item) =>
          item.track_stock === true
      )

    const available = (item) =>
      Math.max(
        Number(
          item.stock_quantity || 0
        ) -
          Number(
            item.reserved_quantity || 0
          ),
        0
      )

    return {
      packaged:
        menuItems.filter(
          (item) =>
            String(
              item.item_type || 'food'
            ) ===
            'packaged_product'
        ).length,

      tracked:
        tracked.length,

      low:
        tracked.filter(
          (item) => {
            const value =
              available(item)

            return (
              value > 0 &&
              value <=
                Number(
                  item.low_stock_threshold ??
                    5
                )
            )
          }
        ).length,

      out:
        tracked.filter(
          (item) =>
            available(item) <= 0
        ).length,
    }
  }, [menuItems])

  const filteredInventoryItems =
    useMemo(() => {
      const term =
        inventorySearch
          .trim()
          .toLowerCase()

      return menuItems.filter(
        (item) => {
          const type =
            String(
              item.item_type ||
                'food'
            )

          const tracked =
            item.track_stock ===
            true

          const available =
            Math.max(
              Number(
                item.stock_quantity ||
                  0
              ) -
                Number(
                  item.reserved_quantity ||
                    0
                ),
              0
            )

          const threshold =
            Number(
              item.low_stock_threshold ??
                5
            )

          if (
            inventoryFilter ===
              'food' &&
            type !== 'food'
          ) {
            return false
          }

          if (
            inventoryFilter ===
              'packaged' &&
            type !==
              'packaged_product'
          ) {
            return false
          }

          if (
            inventoryFilter ===
              'tracked' &&
            !tracked
          ) {
            return false
          }

          if (
            inventoryFilter ===
              'low' &&
            (
              !tracked ||
              available <= 0 ||
              available > threshold
            )
          ) {
            return false
          }

          if (
            inventoryFilter ===
              'out' &&
            (
              !tracked ||
              available > 0
            )
          ) {
            return false
          }

          if (!term) {
            return true
          }

          return [
            item.name,
            item.category,
            item.barcode,
          ]
            .map((value) =>
              String(value || '')
                .toLowerCase()
            )
            .some((value) =>
              value.includes(term)
            )
        }
      )
    }, [
      menuItems,
      inventorySearch,
      inventoryFilter,
    ])

  const ownerInventoryAction =
    useCallback(
      async (
        action,
        payload = {}
      ) => {
        if (!restaurantId) {
          throw new Error(
            'Restaurant ID is missing.'
          )
        }

        const {
          data,
          error,
        } = await supabase.rpc(
          'owner_delivery_inventory_action',
          {
            p_restaurant_id:
              restaurantId,

            p_action:
              action,

            p_payload:
              payload,
          }
        )

        if (error) {
          throw error
        }

        if (!data?.success) {
          throw new Error(
            data?.message ||
              'Owner inventory action failed.'
          )
        }

        return data
      },
      [restaurantId]
    )

  const startInventoryEdit = (
    item
  ) => {
    setEditingInventoryId(
      item.id
    )

    setInventoryDraft({
      item_type:
        String(
          item.item_type ||
            'food'
        ),

      barcode:
        String(
          item.barcode ||
            ''
        ),

      track_stock:
        item.track_stock ===
        true,

      stock_quantity:
        String(
          item.stock_quantity ??
            0
        ),

      low_stock_threshold:
        String(
          item.low_stock_threshold ??
            5
        ),
    })
  }

  const scanInventoryBarcode = async () => {
    const currentBarcode = String(
      inventoryDraft.barcode || ''
    ).trim()

    try {
      const barcode = await scanBarcodeWithCamera({
        title: 'Scan Inventory Barcode',
      })

      setInventoryDraft((current) => ({
        ...current,
        barcode,
      }))

      setMessage(`Barcode scanned: ${barcode}`)
    } catch (scanError) {
      if (scanError?.code === 'SCAN_CANCELLED') return

      console.error('Owner inventory barcode scan error:', scanError)

      const manual = await appPrompt(
        `${scanError?.message || 'Camera scanning failed.'}\n\nEnter barcode manually:`,
        currentBarcode
      )

      if (manual != null) {
        setInventoryDraft((current) => ({
          ...current,
          barcode: String(manual).trim(),
        }))
      }
    }
  }

  const saveInventory = async (
    item
  ) => {
    if (inventorySaving) {
      return
    }

    const type =
      String(
        inventoryDraft.item_type ||
          'food'
      )

    const barcode =
      String(
        inventoryDraft.barcode ||
          ''
      ).trim()

    const stock =
      Number(
        inventoryDraft.stock_quantity
      )

    const low =
      Number(
        inventoryDraft.low_stock_threshold
      )

    if (
      type ===
        'packaged_product' &&
      !barcode
    ) {
      appNotice(
        'Scan or enter the packaged product barcode.'
      )

      return
    }

    if (
      !Number.isInteger(
        stock
      ) ||
      stock < 0
    ) {
      appNotice(
        'Stock must be a whole number of 0 or more.'
      )

      return
    }

    if (
      !Number.isInteger(
        low
      ) ||
      low < 0
    ) {
      appNotice(
        'Low-stock alert must be a whole number of 0 or more.'
      )

      return
    }

    setInventorySaving(
      true
    )

    try {
      const result =
        await ownerInventoryAction(
          'configure_inventory',
          {
            id: item.id,

            item_type:
              type,

            barcode:
              type ===
              'packaged_product'
                ? barcode
                : '',

            track_stock:
              Boolean(
                inventoryDraft.track_stock
              ),

            stock_quantity:
              stock,

            low_stock_threshold:
              low,
          }
        )

      setEditingInventoryId(
        ''
      )

      setMessage(
        result?.message ||
          'Inventory saved.'
      )

      await loadDelivery(
        true
      )

      await loadInventoryReport(true)

      if (selectedInventoryHistoryId === item.id) {
        await loadInventoryHistory(item.id)
      }
    } catch (inventoryError) {
      console.error(
        'Owner inventory save error:',
        inventoryError
      )

      appNotice(
        inventoryError?.message ||
          'Unable to save inventory.'
      )
    } finally {
      setInventorySaving(
        false
      )
    }
  }

  const restockInventory =
    async (item) => {
      if (restockingId) {
        return
      }

      const raw =
        await appPrompt(
          `Add stock for ${item.name}:`,
          '1'
        )

      if (raw == null) {
        return
      }

      const quantity =
        Number(
          String(
            raw
          ).trim()
        )

      if (
        !Number.isInteger(
          quantity
        ) ||
        quantity <= 0
      ) {
        appNotice(
          'Restock quantity must be a whole number greater than 0.'
        )

        return
      }

      setRestockingId(
        item.id
      )

      try {
        const result =
          await ownerInventoryAction(
            'restock_inventory',
            {
              id:
                item.id,

              quantity,

              notes:
                'Owner inventory restock',
            }
          )

        setMessage(
          result?.message ||
            'Stock added successfully.'
        )

        await loadDelivery(
          true
        )

        await loadInventoryReport(true)

        if (selectedInventoryHistoryId === item.id) {
          await loadInventoryHistory(item.id)
        }
      } catch (inventoryError) {
        console.error(
          'Owner inventory restock error:',
          inventoryError
        )

        appNotice(
          inventoryError?.message ||
            'Unable to add stock.'
        )
      } finally {
        setRestockingId(
          ''
        )
      }
    }

  const getOwnerDeliveryBill =
    useCallback(
      async (orderId) => {
        if (!restaurantId) {
          throw new Error(
            'Restaurant ID is missing.'
          )
        }

        const {
          data,
          error,
        } = await supabase.rpc(
          'owner_delivery_get_bill',
          {
            p_restaurant_id:
              restaurantId,

            p_order_id:
              orderId,
          }
        )

        if (error) {
          throw error
        }

        if (
          !data?.success ||
          !data?.bill
        ) {
          throw new Error(
            data?.message ||
              'Unable to generate Delivery bill.'
          )
        }

        return data.bill
      },
      [restaurantId]
    )

  const generateDeliveryBill =
    async (order) => {
      if (
        !order?.id ||
        printingOrderId
      ) {
        return
      }

      const paymentMethod =
        String(
          order.payment_method ||
            ''
        ).toLowerCase()

      const paymentStatus =
        String(
          order.payment_status ||
            ''
        ).toLowerCase()

      const orderStatus =
        String(
          order.order_status ||
            ''
        ).toLowerCase()

      if (
        orderStatus ===
        'cancelled'
      ) {
        appNotice(
          'A cancelled order cannot generate an active Delivery bill.'
        )

        return
      }

      if (
        paymentMethod ===
          'razorpay' &&
        paymentStatus !==
          'paid'
      ) {
        appNotice(
          'Online payment must be verified before generating the bill.'
        )

        return
      }

      const printWindow =
        window.open(
          '',
          '_blank',
          'width=920,height=900,noopener,noreferrer'
        )

      if (!printWindow) {
        appNotice(
          'Your browser blocked the bill window. Allow pop-ups for this website and try again.'
        )

        return
      }

      setPrintingOrderId(
        order.id
      )

      try {
        printWindow.document.open()

        printWindow.document.write(
          '<!doctype html><html><head><title>Preparing Delivery Bill...</title></head><body style="font-family:Arial,sans-serif;padding:24px">Preparing secure Delivery bill...</body></html>'
        )

        printWindow.document.close()

        const bill =
          await getOwnerDeliveryBill(
            order.id
          )

        const billOrder =
          bill?.order || {}

        const business =
          bill?.business || {}

        const generatedBy =
          bill?.generated_by ||
          {}

        const items =
          Array.isArray(
            billOrder.items
          )
            ? billOrder.items
            : []

        const customerAddress =
          [
            billOrder.address_line1,
            billOrder.address_line2,
            billOrder.landmark,
            billOrder.city,
            billOrder.state,
            billOrder.pincode,
          ]
            .filter(Boolean)
            .join(', ')

        const businessAddress =
          [
            business.address,
            business.city,
            business.state,
            business.pincode,
          ]
            .filter(Boolean)
            .join(', ')

        const itemRows =
          items
            .map((item) => {
              const quantity =
                billItemQuantity(
                  item
                )

              const price =
                billItemPrice(
                  item
                )

              const total =
                billItemTotal(
                  item
                )

              return `
                <tr>
                  <td>
                    <strong>${escapeHtml(item?.name || 'Item')}</strong>
                    ${
                      item?.category
                        ? `<div class="muted">${escapeHtml(item.category)}</div>`
                        : ''
                    }
                  </td>
                  <td class="num">${escapeHtml(quantity)}</td>
                  <td class="num">${escapeHtml(money(price))}</td>
                  <td class="num"><strong>${escapeHtml(money(total))}</strong></td>
                </tr>
              `
            })
            .join('')

        const amountRows =
          []

        const addAmountRow = (
          label,
          value,
          options = {}
        ) => {
          const amount =
            Number(
              value || 0
            )

          if (
            !options.showZero &&
            Math.abs(amount) <
              0.005
          ) {
            return
          }

          amountRows.push(`
            <div class="sum-row">
              <span>${escapeHtml(label)}</span>
              <strong>${escapeHtml(
                `${
                  options.negative
                    ? '- '
                    : ''
                }${money(
                  Math.abs(
                    amount
                  )
                )}`
              )}</strong>
            </div>
          `)
        }

        addAmountRow(
          'Subtotal',
          billOrder.subtotal,
          {
            showZero: true,
          }
        )

        addAmountRow(
          'Discount',
          billOrder.discount_amount,
          {
            negative: true,
          }
        )

        const cgst =
          Number(
            billOrder.cgst_amount ||
              0
          )

        const sgst =
          Number(
            billOrder.sgst_amount ||
              0
          )

        const totalTax =
          Number(
            billOrder.tax_amount ||
              0
          )

        if (
          cgst > 0 ||
          sgst > 0
        ) {
          addAmountRow(
            'CGST',
            cgst
          )

          addAmountRow(
            'SGST',
            sgst
          )

          addAmountRow(
            'Other Tax',
            Math.max(
              0,
              totalTax -
                cgst -
                sgst
            )
          )
        } else {
          addAmountRow(
            'GST / Tax',
            totalTax
          )
        }

        addAmountRow(
          'Packing Charge',
          billOrder.packing_fee
        )

        addAmountRow(
          'Handling Charge',
          billOrder.handling_fee ??
            billOrder.handling_charge
        )

        addAmountRow(
          'Delivery Fee',
          billOrder.delivery_fee
        )

        addAmountRow(
          'Surge Charge',
          billOrder.surge_fee ??
            billOrder.surge_charge
        )

        const logoUrl =
          safePrintImageUrl(
            business.logo_url
          )

        const authorizedName =
          String(
            business.signature_name ||
              generatedBy?.name ||
              'Owner'
          ).trim() ||
          'Owner'

        const billDate =
          orderTime(
            billOrder.created_at ||
              bill.generated_at
          )

        const paymentText =
          `${String(
            billOrder.payment_method ||
              ''
          ).toUpperCase()} · ${labelStatus(
            billOrder.payment_status
          )}`

        printWindow.document.open()

        printWindow.document.write(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>${escapeHtml(bill.bill_number || billOrder.order_code || 'Delivery Bill')}</title>
  <style>
    *{box-sizing:border-box}
    body{margin:0;background:#f5f5f5;color:#171717;font-family:Arial,Helvetica,sans-serif}
    .toolbar{position:sticky;top:0;z-index:5;display:flex;justify-content:center;gap:10px;padding:14px;background:#111827}
    .toolbar button{border:0;border-radius:10px;background:#059669;color:#fff;padding:11px 18px;font-weight:800;cursor:pointer}
    .toolbar button.secondary{background:#374151}
    main{width:min(820px,calc(100% - 24px));margin:24px auto;background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:32px}
    .top{display:flex;justify-content:space-between;gap:28px;border-bottom:2px solid #111827;padding-bottom:22px}
    .brand-wrap{display:flex;gap:14px;align-items:flex-start;min-width:0}
    .logo{width:64px;height:64px;object-fit:contain;border:1px solid #e5e7eb;border-radius:12px;padding:5px}
    .brand h1{margin:0;font-size:24px}
    .brand p,.meta p{margin:5px 0;color:#525252;font-size:12px;line-height:1.45}
    .invoice{text-align:right}
    .invoice h2{margin:0;font-size:20px}
    .pill{display:inline-block;margin-top:7px;padding:5px 9px;border-radius:999px;background:#ecfdf5;color:#047857;font-size:10px;font-weight:800;text-transform:uppercase}
    .section{margin-top:24px}
    .section h3{margin:0 0 10px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#737373}
    .customer{display:grid;grid-template-columns:1fr 1fr;gap:14px}
    .card{border:1px solid #e5e7eb;border-radius:12px;padding:14px}
    .card p{margin:5px 0;font-size:12px;line-height:1.5}
    table{width:100%;border-collapse:collapse;margin-top:20px}
    th,td{padding:11px 8px;border-bottom:1px solid #e5e7eb;text-align:left;font-size:12px}
    th{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#737373}
    .num{text-align:right}
    .muted{margin-top:3px;color:#737373;font-size:10px}
    .summary{width:min(390px,100%);margin:22px 0 0 auto}
    .sum-row{display:flex;justify-content:space-between;gap:16px;padding:6px 0;font-size:12px}
    .total{display:flex;justify-content:space-between;gap:16px;border-top:2px solid #171717;margin-top:8px;padding-top:12px;font-size:18px}
    .foot{display:flex;justify-content:space-between;gap:20px;align-items:flex-end;margin-top:44px;border-top:1px solid #e5e7eb;padding-top:20px;color:#737373;font-size:10px}
    .signature{text-align:right;color:#171717;min-width:190px}
    .signature-line{border-top:1px solid #737373;margin-top:34px;padding-top:7px}
    @media(max-width:620px){main{margin:10px auto;padding:18px}.top{flex-direction:column}.invoice{text-align:left}.customer{grid-template-columns:1fr}.foot{flex-direction:column;align-items:stretch}.signature{text-align:left}.summary{width:100%}}
    @media print{body{background:#fff}.toolbar{display:none}main{width:100%;margin:0;border:0;border-radius:0;padding:12mm}.top{break-inside:avoid}.section,.summary,.foot{break-inside:avoid}}
  </style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">Print / Save PDF</button>
    <button class="secondary" onclick="window.close()">Close</button>
  </div>

  <main>
    <div class="top">
      <div class="brand-wrap">
        ${logoUrl ? `<img class="logo" src="${escapeHtml(logoUrl)}" alt="Store logo" />` : ''}
        <div class="brand">
          <h1>${escapeHtml(business.name || settings.store_name || restaurant?.name || 'Delivery')}</h1>
          ${business.gstin ? `<p><strong>GSTIN:</strong> ${escapeHtml(business.gstin)}</p>` : ''}
          ${businessAddress ? `<p>${escapeHtml(businessAddress)}</p>` : ''}
          ${business.support_phone ? `<p>Support: ${escapeHtml(business.support_phone)}</p>` : ''}
        </div>
      </div>

      <div class="invoice">
        <h2>DELIVERY BILL</h2>
        <div class="meta">
          <p>Bill No: <strong>${escapeHtml(bill.bill_number || '—')}</strong></p>
          <p>Order No: <strong>#${escapeHtml(billOrder.order_number || '—')}</strong></p>
          <p>${escapeHtml(billOrder.order_code || '')}</p>
          <p>${escapeHtml(billDate)}</p>
          <span class="pill">${escapeHtml(labelStatus(billOrder.order_status))}</span>
        </div>
      </div>
    </div>

    <div class="section customer">
      <div class="card">
        <h3>Customer</h3>
        <p><strong>${escapeHtml(billOrder.customer_name || '')}</strong></p>
        <p>${escapeHtml(billOrder.customer_mobile || '')}${billOrder.alternate_mobile ? ` · Alt ${escapeHtml(billOrder.alternate_mobile)}` : ''}</p>
        ${billOrder.customer_email ? `<p>${escapeHtml(billOrder.customer_email)}</p>` : ''}
      </div>

      <div class="card">
        <h3>Delivery Address</h3>
        <p>${escapeHtml(customerAddress || '—')}</p>
      </div>
    </div>

    <div class="section">
      <h3>Items</h3>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th class="num">Qty</th>
            <th class="num">Price</th>
            <th class="num">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${itemRows || '<tr><td colspan="4">No item snapshot available.</td></tr>'}
        </tbody>
      </table>
    </div>

    <div class="summary">
      ${amountRows.join('')}
      <div class="total">
        <span>Total</span>
        <strong>${escapeHtml(money(billOrder.total_amount))}</strong>
      </div>
      <div class="sum-row">
        <span>Payment</span>
        <strong>${escapeHtml(paymentText)}</strong>
      </div>
    </div>

    <div class="foot">
      <div>
        <div>${escapeHtml(business.footer || 'Thank you for your order.')}</div>
        <div style="margin-top:5px">Generated securely from Digital Dine-In Delivery Management.</div>
      </div>

      <div class="signature">
        <div class="signature-line">
          <strong>${escapeHtml(authorizedName)}</strong><br/>
          Authorized Owner
        </div>
      </div>
    </div>
  </main>
</body>
</html>`)

        printWindow.document.close()
        printWindow.focus()

        window.setTimeout(
          () => {
            try {
              printWindow.print()
            } catch {
              // Printable bill stays open when automatic printing is blocked.
            }
          },
          350
        )
      } catch (printError) {
        console.error(
          'Owner Delivery bill generation error:',
          printError
        )

        try {
          printWindow.close()
        } catch {
          // Ignore popup cleanup errors.
        }

        appNotice(
          printError?.message ||
            'Unable to generate Delivery bill.'
        )
      } finally {
        setPrintingOrderId(
          ''
        )
      }
    }

  const saveBillSettings =
    async (event) => {
      event.preventDefault()

      if (
        !restaurantId ||
        savingBillSettings
      ) {
        return
      }

      const businessName =
        String(
          settings.bill_business_name ||
            settings.store_name ||
            restaurant?.name ||
            ''
        ).trim()

      if (!businessName) {
        appNotice(
          'Billing business name is required.'
        )

        return
      }

      setSavingBillSettings(
        true
      )

      try {
        const {
          data,
          error,
        } = await supabase.rpc(
          'owner_save_delivery_bill_settings',
          {
            p_restaurant_id:
              restaurantId,

            p_business_name:
              businessName,

            p_gstin:
              String(
                settings.bill_gstin ||
                  ''
              ).trim(),

            p_footer:
              String(
                settings.bill_footer ||
                  ''
              ).trim(),

            p_signature_name:
              String(
                settings.bill_signature_name ||
                  ''
              ).trim(),

            p_logo_url:
              String(
                settings.bill_logo_url ||
                  ''
              ).trim(),
          }
        )

        if (error) {
          throw error
        }

        if (!data?.success) {
          throw new Error(
            data?.message ||
              'Unable to save billing settings.'
          )
        }

        setSettings(
          (current) => ({
            ...current,
            ...(data?.settings ||
              {}),
          })
        )

        setMessage(
          'Delivery billing settings saved.'
        )
      } catch (billError) {
        console.error(
          'Owner billing settings save error:',
          billError
        )

        appNotice(
          billError?.message ||
            'Unable to save billing settings.'
        )
      } finally {
        setSavingBillSettings(
          false
        )
      }
    }

  const chooseOwnerDeliveryCenter = () => {
    if (ownerLocationLoading) return

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setOwnerLocationError(
        'Location access is not supported in this browser.'
      )
      return
    }

    setOwnerLocationLoading(true)
    setOwnerLocationError('')

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const latitude = Number(position.coords.latitude)
        const longitude = Number(position.coords.longitude)
        const accuracy = Number(position.coords.accuracy || 0)

        setSettings((current) => ({
          ...current,
          delivery_origin_latitude: latitude.toFixed(7),
          delivery_origin_longitude: longitude.toFixed(7),
          delivery_origin_accuracy_m: accuracy
            ? accuracy.toFixed(2)
            : '',
        }))

        setOwnerLocationLoading(false)
        setOwnerLocationError('')
      },
      (geoError) => {
        console.error('Owner delivery center geolocation error:', geoError)
        setOwnerLocationLoading(false)
        setOwnerLocationError(
          geoError?.code === 1
            ? 'Location permission was denied. Allow location access and try again.'
            : 'Unable to read this device location. Check GPS/location services and try again.'
        )
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0,
      }
    )
  }

  const saveSettings = async (
    event
  ) => {
    event.preventDefault()

    if (
      !restaurantId ||
      savingSettings
    ) {
      return
    }

    setSavingSettings(true)
    setMessage('')

    try {
      const radiusEnabled = Boolean(
        settings.delivery_radius_enabled
      )
      const radiusKm = Number(
        settings.max_delivery_distance_km
      )
      const originLatitude = Number(
        settings.delivery_origin_latitude
      )
      const originLongitude = Number(
        settings.delivery_origin_longitude
      )

      if (
        radiusEnabled &&
        (
          !Number.isFinite(radiusKm) ||
          radiusKm <= 0
        )
      ) {
        throw new Error(
          'Enter a valid delivery radius in kilometres.'
        )
      }

      if (
        radiusEnabled &&
        (
          !Number.isFinite(originLatitude) ||
          originLatitude < -90 ||
          originLatitude > 90 ||
          !Number.isFinite(originLongitude) ||
          originLongitude < -180 ||
          originLongitude > 180
        )
      ) {
        throw new Error(
          'Set the store delivery center on the map before enabling the delivery radius.'
        )
      }

      const payload = {
        restaurant_id: restaurantId,
        store_name: String(
          settings.store_name || ''
        ).trim(),
        description: String(
          settings.description || ''
        ).trim(),
        logo_url: String(
          settings.logo_url || ''
        ).trim(),
        banner_url: String(
          settings.banner_url || ''
        ).trim(),
        is_open: Boolean(
          settings.is_open
        ),
        minimum_order_amount:
          Math.max(
            0,
            Number(
              settings.minimum_order_amount ||
                0
            )
          ),
        delivery_fee: Math.max(
          0,
          Number(
            settings.delivery_fee || 0
          )
        ),
        free_delivery_above:
          settings.free_delivery_above ===
            '' ||
          settings.free_delivery_above ===
            null
            ? null
            : Math.max(
                0,
                Number(
                  settings.free_delivery_above
                )
              ),
        packing_charge: Math.max(
          0,
          Number(
            settings.packing_charge || 0
          )
        ),
        handling_charge: Math.max(
          0,
          Number(
            settings.handling_charge || 0
          )
        ),
        surge_enabled: Boolean(
          settings.surge_enabled
        ),
        surge_charge: Math.max(
          0,
          Number(
            settings.surge_charge || 0
          )
        ),
        orders_per_delivery_boy_per_hour:
          Math.max(
            1,
            Math.floor(
              Number(
                settings.orders_per_delivery_boy_per_hour ||
                  5
              )
            )
          ),
        tax_enabled: Boolean(
          settings.tax_enabled
        ),
        sgst_rate: Math.max(
          0,
          Number(
            settings.sgst_rate || 0
          )
        ),
        cgst_rate: Math.max(
          0,
          Number(
            settings.cgst_rate || 0
          )
        ),
        max_delivery_distance_km:
          settings.max_delivery_distance_km ===
            '' ||
          settings.max_delivery_distance_km ===
            null
            ? null
            : Math.max(
                0.1,
                Number(
                  settings.max_delivery_distance_km
                )
              ),
        delivery_radius_enabled:
          radiusEnabled,
        delivery_origin_latitude:
          Number.isFinite(originLatitude)
            ? originLatitude
            : null,
        delivery_origin_longitude:
          Number.isFinite(originLongitude)
            ? originLongitude
            : null,
        delivery_origin_accuracy_m:
          settings.delivery_origin_accuracy_m === '' ||
          settings.delivery_origin_accuracy_m === null
            ? null
            : Math.max(
                0,
                Number(settings.delivery_origin_accuracy_m || 0)
              ),
        estimated_delivery_minutes:
          Math.max(
            1,
            Number(
              settings.estimated_delivery_minutes ||
                45
            )
          ),
        auto_assign_enabled: Boolean(
          settings.auto_assign_enabled
        ),
        auto_assign_min_orders:
          Math.max(
            3,
            Math.min(
              20,
              Math.floor(
                Number(
                  settings.auto_assign_min_orders ||
                    3
                )
              )
            )
          ),
        support_phone: String(
          settings.support_phone || ''
        ).trim(),
        address: String(
          settings.address || ''
        ).trim(),
        city: String(
          settings.city || ''
        ).trim(),
        state: String(
          settings.state || ''
        ).trim(),
        pincode: cleanDigits(
          settings.pincode,
          6
        ),
      }

      const {
        data,
        error,
      } = await supabase
        .from('delivery_settings')
        .upsert(payload, {
          onConflict:
            'restaurant_id',
        })
        .select('*')
        .single()

      if (error) throw error

      setSettings({
        ...EMPTY_SETTINGS,
        ...data,
        free_delivery_above:
          data?.free_delivery_above ??
          '',
        max_delivery_distance_km:
          data?.max_delivery_distance_km ??
          '',
      })

      setMessage(
        'Delivery settings saved successfully.'
      )
    } catch (error) {
      console.error(
        'Delivery settings save error:',
        error
      )

      setMessage(
        error?.message ||
          'Unable to save Delivery settings.'
      )
    } finally {
      setSavingSettings(false)
    }
  }

  const runAutoAssignmentNow = async () => {
    if (
      !restaurantId ||
      runningAutoAssign
    ) {
      return
    }

    setRunningAutoAssign(true)
    setMessage('')

    try {
      const {
        data,
        error,
      } = await supabase.rpc(
        'owner_run_delivery_auto_assignment',
        {
          p_restaurant_id:
            restaurantId,
        }
      )

      if (error) throw error

      if (data?.success === false) {
        throw new Error(
          data?.message ||
            'Unable to run automatic assignment.'
        )
      }

      const assignedOrders =
        Number(
          data?.assigned_orders || 0
        )

      const assignedBatches =
        Number(
          data?.assigned_batches || 0
        )

      setMessage(
        assignedOrders > 0
          ? `Auto assignment completed: ${assignedOrders} order${
              assignedOrders === 1
                ? ''
                : 's'
            } assigned in ${assignedBatches} batch${
              assignedBatches === 1
                ? ''
                : 'es'
            }.`
          : data?.reason === 'automation_disabled'
            ? 'Auto assignment is disabled. Enable it and save Delivery Settings.'
            : data?.reason === 'waiting_for_batch'
              ? `Waiting for a complete batch. Queue: ${Number(data?.queued_orders || 0)} / ${Number(data?.batch_size || 3)}.`
              : data?.reason === 'no_available_driver'
                ? 'A complete batch is ready, but no active free driver is available.'
                : 'No auto-assignment action was required.'
      )

      await loadDelivery(false)
    } catch (error) {
      console.error(
        'Delivery auto assignment error:',
        error
      )

      setMessage(
        error?.message ||
          'Unable to run automatic assignment.'
      )
    } finally {
      setRunningAutoAssign(false)
    }
  }

  const scanNewMenuProductBarcode = async () => {
    const currentBarcode = String(
      menuForm.barcode || ''
    ).trim()

    try {
      const barcode = await scanBarcodeWithCamera({
        title: 'Scan New Packaged Product',
      })

      setMenuForm((current) => ({
        ...current,
        barcode,
      }))

      setMessage(`Barcode scanned: ${barcode}`)
    } catch (scanError) {
      if (scanError?.code === 'SCAN_CANCELLED') return

      console.error('Owner new product barcode scan error:', scanError)

      const manual = await appPrompt(
        `${scanError?.message || 'Camera scanning failed.'}\n\nEnter barcode manually:`,
        currentBarcode
      )

      if (manual != null) {
        setMenuForm((current) => ({
          ...current,
          barcode: String(manual).trim(),
        }))
      }
    }
  }

  const saveMenuItem = async (
    event
  ) => {
    event.preventDefault()

    if (menuSaving) return

    const name =
      menuForm.name.trim()

    const deliveryPrice = Number(
      menuForm.delivery_price
    )

    const offerPrice =
      menuForm.delivery_offer_price ===
      ''
        ? null
        : Number(
            menuForm.delivery_offer_price
          )

    const itemType = String(
      menuForm.item_type || 'food'
    )
    const barcode = String(
      menuForm.barcode || ''
    ).trim()
    const openingStock = Number(
      menuForm.opening_stock
    )
    const lowStockThreshold = Number(
      menuForm.low_stock_threshold
    )

    if (
      name.length < 2 ||
      !Number.isFinite(
        deliveryPrice
      ) ||
      deliveryPrice < 0
    ) {
      appNotice(
        'Enter a valid item name and Delivery price.'
      )
      return
    }

    if (
      offerPrice !== null &&
      (
        !Number.isFinite(
          offerPrice
        ) ||
        offerPrice < 0 ||
        offerPrice > deliveryPrice
      )
    ) {
      appNotice(
        'Delivery offer price must be between ₹0 and the Delivery price.'
      )
      return
    }

    if (!menuForm.id && itemType === 'packaged_product') {
      if (!barcode) {
        appNotice('Scan or enter the packaged product barcode.')
        return
      }

      if (!Number.isInteger(openingStock) || openingStock < 0) {
        appNotice('Opening stock must be a whole number of 0 or more.')
        return
      }

      if (!Number.isInteger(lowStockThreshold) || lowStockThreshold < 0) {
        appNotice('Low-stock alert must be a whole number of 0 or more.')
        return
      }
    }

    setMenuSaving(true)

    try {
      const commonPayload = {
        name,
        category:
          menuForm.category.trim() ||
          'Other',
        description:
          menuForm.description.trim(),
        image_url:
          menuForm.image_url.trim() ||
          null,
        food_type:
          menuForm.food_type ||
          'other',
        is_veg:
          menuForm.food_type ===
          'veg',
        delivery_enabled: Boolean(
          menuForm.delivery_enabled
        ),
        delivery_available:
          Boolean(
            menuForm.delivery_available
          ),
        delivery_price:
          deliveryPrice,
        delivery_offer_price:
          offerPrice,
      }

      if (menuForm.id) {
        const payload = {
          ...commonPayload,
        }

        if (deliveryOnly) {
          payload.price =
            deliveryPrice
        }

        const {
          data,
          error,
        } = await supabase
          .from('menu_items')
          .update(payload)
          .eq('id', menuForm.id)
          .eq(
            'restaurant_id',
            restaurantId
          )
          .select('*')
          .single()

        if (error) throw error

        setMenuItems((current) =>
          current.map((item) =>
            item.id === data.id
              ? data
              : item
          )
        )
      } else {
        const { data: result, error } =
          await supabase.rpc(
            'owner_delivery_create_store_item',
            {
              p_restaurant_id: restaurantId,
              p_payload: {
                ...commonPayload,
                item_type: itemType,
                barcode:
                  itemType === 'packaged_product'
                    ? barcode
                    : '',
                opening_stock:
                  itemType === 'packaged_product'
                    ? openingStock
                    : 0,
                low_stock_threshold:
                  itemType === 'packaged_product'
                    ? lowStockThreshold
                    : 0,
              },
            }
          )

        if (error) throw error
        if (!result?.success) {
          throw new Error(
            result?.message ||
              'Unable to add Delivery item.'
          )
        }

        if (result?.data) {
          setMenuItems((current) => [
            result.data,
            ...current.filter(
              (item) =>
                String(item.id) !==
                String(result.data.id)
            ),
          ])
        }

        await loadInventoryReport(true)
      }

      setMenuForm(EMPTY_MENU)
      setMessage(
        'Delivery menu item saved.'
      )
    } catch (error) {
      console.error(
        'Delivery menu save error:',
        error
      )

      appNotice(
        error?.message ||
          'Unable to save Delivery menu item.'
      )
    } finally {
      setMenuSaving(false)
    }
  }

  const editMenuItem = (item) => {
    setMenuForm({
      id: item.id,
      item_type: String(item.item_type || 'food'),
      name: item.name || '',
      category:
        item.category || 'Other',
      description:
        item.description || '',
      image_url:
        item.image_url || '',
      food_type:
        item.food_type ||
        (item.is_veg
          ? 'veg'
          : 'non-veg'),
      delivery_price:
        item.delivery_price ??
        item.price ??
        '',
      delivery_offer_price:
        item.delivery_offer_price ??
        '',
      delivery_enabled:
        item.delivery_enabled !==
        false,
      delivery_available:
        item.delivery_available !==
        false,
      barcode: String(item.barcode || ''),
      opening_stock: String(item.stock_quantity ?? 0),
      low_stock_threshold: String(item.low_stock_threshold ?? 5),
    })

    window.setTimeout(() => {
      window.scrollTo({
        top: 0,
        behavior: 'smooth',
      })
    }, 50)
  }

  const toggleMenuField = async (
    item,
    field
  ) => {
    const next =
      item[field] === false

    const {
      data,
      error,
    } = await supabase
      .from('menu_items')
      .update({
        [field]: next,
      })
      .eq('id', item.id)
      .eq(
        'restaurant_id',
        restaurantId
      )
      .select('*')
      .single()

    if (error) {
      appNotice(error.message)
      return
    }

    setMenuItems((current) =>
      current.map((row) =>
        row.id === data.id
          ? data
          : row
      )
    )
  }

  const saveDriver = async (
    event
  ) => {
    event.preventDefault()

    if (driverSaving) return

    const name =
      driverForm.name.trim()

    const mobile =
      cleanDigits(
        driverForm.mobile
      )

    const alternate =
      cleanDigits(
        driverForm.alternate_mobile
      )

    const portalUserId =
      driverForm.portal_user_id
        .trim()
        .toLowerCase()

    if (
      name.length < 2 ||
      mobile.length !== 10
    ) {
      appNotice(
        'Enter driver name and a valid 10-digit mobile number.'
      )
      return
    }

    if (
      alternate &&
      alternate.length !== 10
    ) {
      appNotice(
        'Enter a valid alternate mobile number.'
      )
      return
    }

    if (
      !/^[a-z0-9._-]{3,40}$/.test(
        portalUserId
      )
    ) {
      appNotice(
        'Driver User ID must be 3-40 characters using letters, numbers, dot, underscore or hyphen.'
      )
      return
    }

    if (
      String(
        driverForm.password || ''
      ).length < 6
    ) {
      appNotice(
        'Driver password must contain at least 6 characters.'
      )
      return
    }

    setDriverSaving(true)

    try {
      const {
        data,
        error,
      } = await supabase.rpc(
        'owner_create_delivery_driver',
        {
          p_restaurant_id:
            restaurantId,
          p_name: name,
          p_mobile: mobile,
          p_alternate_mobile:
            alternate,
          p_vehicle_type:
            driverForm.vehicle_type,
          p_vehicle_number:
            driverForm.vehicle_number
              .trim()
              .toUpperCase(),
          p_portal_user_id:
            portalUserId,
          p_password:
            driverForm.password,
        }
      )

      if (error) throw error

      if (
        !data?.success ||
        !data?.driver
      ) {
        throw new Error(
          data?.message ||
            'Unable to create Delivery driver.'
        )
      }

      setDriverForm(
        EMPTY_DRIVER
      )

      setMessage(
        `Driver ${data.driver.name} created. Portal User ID: ${data.driver.portal_user_id}`
      )

      await loadDelivery(true)
    } catch (error) {
      console.error(
        'Driver save error:',
        error
      )

      appNotice(
        error?.message ||
          'Unable to save driver.'
      )
    } finally {
      setDriverSaving(false)
    }
  }

  const resetDriverLogin =
    async (driver) => {
      const defaultUserId =
        driver.portal_user_id ||
        String(driver.name || 'driver')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '.')
          .replace(/^\.+|\.+$/g, '')
          .slice(0, 30)

      const nextUserId =
        await appPrompt(
          'Driver User ID',
          defaultUserId
        )

      if (nextUserId === null) {
        return
      }

      const cleanUserId =
        nextUserId
          .trim()
          .toLowerCase()

      if (
        !/^[a-z0-9._-]{3,40}$/.test(
          cleanUserId
        )
      ) {
        appNotice(
          'Driver User ID must be 3-40 characters using letters, numbers, dot, underscore or hyphen.'
        )
        return
      }

      const password =
        await appPrompt(
          'Enter a new Driver Portal password (minimum 6 characters). The old password and old sessions will be replaced.'
        )

      if (password === null) {
        return
      }

      if (password.length < 6) {
        appNotice(
          'Driver password must contain at least 6 characters.'
        )
        return
      }

      try {
        const {
          data,
          error,
        } = await supabase.rpc(
          'owner_set_delivery_driver_login',
          {
            p_restaurant_id:
              restaurantId,
            p_driver_id:
              driver.id,
            p_portal_user_id:
              cleanUserId,
            p_password:
              password,
          }
        )

        if (error) throw error

        if (!data?.success) {
          throw new Error(
            data?.message ||
              'Unable to update Driver Portal login.'
          )
        }

        setMessage(
          `Driver Portal login updated for ${driver.name}. User ID: ${cleanUserId}`
        )

        await loadDelivery(true)
      } catch (error) {
        console.error(
          'Driver login reset error:',
          error
        )

        appNotice(
          error?.message ||
            'Unable to update Driver Portal login.'
        )
      }
    }

  const toggleDriverActive =
    async (driver) => {
      const next =
        driver.is_active === false

      const {
        data,
        error,
      } = await supabase
        .from('delivery_drivers')
        .update({
          is_active: next,
          status: next
            ? 'available'
            : 'offline',
        })
        .eq('id', driver.id)
        .eq(
          'restaurant_id',
          restaurantId
        )
        .select('*')
        .single()

      if (error) {
        appNotice(error.message)
        return
      }

      setDrivers((current) =>
        current.map((row) =>
          row.id === data.id
            ? data
            : row
        )
      )
    }

  const savePacker = async (event) => {
    event.preventDefault()
    if (!restaurantId || packerSaving) return

    const cleanName = String(packerForm.name || '').trim()
    const cleanMobile = cleanDigits(packerForm.mobile)
    const cleanUserId = String(packerForm.portal_user_id || '')
      .trim()
      .toLowerCase()
    const cleanPassword = String(packerForm.password || '')

    if (cleanName.length < 2) {
      appNotice('Enter the packer name.')
      return
    }

    if (cleanMobile && cleanMobile.length !== 10) {
      appNotice('Enter a valid 10-digit packer mobile number.')
      return
    }

    if (!/^[a-z0-9._-]{3,40}$/.test(cleanUserId)) {
      appNotice('Packer User ID must be 3-40 characters using letters, numbers, dot, underscore or hyphen.')
      return
    }

    if (cleanPassword.length < 6) {
      appNotice('Packer password must contain at least 6 characters.')
      return
    }

    setPackerSaving(true)
    setMessage('')

    try {
      const { data, error } = await supabase.rpc(
        'owner_create_delivery_packer',
        {
          p_restaurant_id: restaurantId,
          p_name: cleanName,
          p_mobile: cleanMobile,
          p_portal_user_id: cleanUserId,
          p_password: cleanPassword,
        }
      )

      if (error) throw error
      if (!data?.success) {
        throw new Error(data?.message || 'Unable to create packer.')
      }

      setPackerForm(EMPTY_PACKER)
      setMessage(
        `Packer ${data?.packer?.name || cleanName} created. User ID: ${cleanUserId}`
      )
      await loadDelivery(true)
    } catch (packerError) {
      console.error('Packer save error:', packerError)
      appNotice(packerError?.message || 'Unable to create packer.')
    } finally {
      setPackerSaving(false)
    }
  }

  const resetPackerLogin = async (packer) => {
    const nextUserId = await appPrompt(
      'Packer User ID',
      packer.portal_user_id ||
        String(packer.name || 'packer')
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '.')
          .replace(/^\.+|\.+$/g, '')
          .slice(0, 30)
    )

    if (nextUserId === null) return

    const cleanUserId = nextUserId.trim().toLowerCase()
    if (!/^[a-z0-9._-]{3,40}$/.test(cleanUserId)) {
      appNotice('Packer User ID must be 3-40 characters using letters, numbers, dot, underscore or hyphen.')
      return
    }

    const password = await appPrompt(
      'Enter a new Packer Portal password (minimum 6 characters).'
    )
    if (password === null) return
    if (password.length < 6) {
      appNotice('Packer password must contain at least 6 characters.')
      return
    }

    try {
      const { data, error } = await supabase.rpc(
        'owner_set_delivery_packer_login',
        {
          p_restaurant_id: restaurantId,
          p_packer_id: packer.id,
          p_portal_user_id: cleanUserId,
          p_password: password,
        }
      )

      if (error) throw error
      if (!data?.success) {
        throw new Error(data?.message || 'Unable to update Packer login.')
      }

      setMessage(`Packer login updated. User ID: ${cleanUserId}`)
      await loadDelivery(true)
    } catch (packerError) {
      console.error('Packer login reset error:', packerError)
      appNotice(packerError?.message || 'Unable to update Packer login.')
    }
  }

  const togglePackerActive = async (packer) => {
    const next = packer.is_active === false

    const { data, error } = await supabase
      .from('delivery_packers')
      .update({ is_active: next })
      .eq('id', packer.id)
      .eq('restaurant_id', restaurantId)
      .select('*')
      .single()

    if (error) {
      appNotice(error.message)
      return
    }

    setPackers((current) =>
      current.map((row) => (row.id === data.id ? data : row))
    )
  }

  const assignDriver = async (
    order,
    driverId
  ) => {
    if (
      String(
        order?.payment_method || ''
      ).toLowerCase() === 'razorpay' &&
      String(
        order?.payment_status || ''
      ).toLowerCase() !== 'paid'
    ) {
      await appNotice(
        'Online-payment orders can be assigned only after successful payment verification.'
      )
      return
    }

    const cleanDriverId =
      driverId || null

    const {
      data,
      error,
    } = await supabase
      .from('delivery_orders')
      .update({
        driver_id:
          cleanDriverId,
      })
      .eq('id', order.id)
      .eq(
        'restaurant_id',
        restaurantId
      )
      .select('*')
      .single()

    if (error) {
      appNotice(error.message)
      return
    }

    setOrders((current) =>
      current.map((row) =>
        row.id === data.id
          ? data
          : row
      )
    )

    await loadDelivery(true)
  }

  const updateOrderStatus =
    async (order, nextStatus) => {
      if (
        !ORDER_STATUSES.includes(
          nextStatus
        )
      ) {
        return
      }

      if (
        String(
          order?.payment_method || ''
        ).toLowerCase() === 'razorpay' &&
        String(
          order?.payment_status || ''
        ).toLowerCase() !== 'paid'
      ) {
        await appNotice(
          'Online-payment orders can be updated only after successful payment verification.'
        )
        return
      }

      const payload = {
        order_status: nextStatus,
      }

      if (
        nextStatus ===
          'delivered' &&
        order.payment_method ===
          'cod' &&
        order.payment_status !==
          'paid'
      ) {
        payload.payment_status =
          'paid'
      }

      if (
        nextStatus ===
          'cancelled' &&
        order.payment_method ===
          'cod' &&
        order.payment_status ===
          'pending'
      ) {
        payload.payment_status =
          'failed'
      }

      const {
        data,
        error,
      } = await supabase
        .from('delivery_orders')
        .update(payload)
        .eq('id', order.id)
        .eq(
          'restaurant_id',
          restaurantId
        )
        .select('*')
        .single()

      if (error) {
        appNotice(error.message)
        return
      }

      setOrders((current) =>
        current.map((row) =>
          row.id === data.id
            ? data
            : row
        )
      )

      await loadDelivery(true)
    }

  const saveOffer = async (
    event
  ) => {
    event.preventDefault()

    if (offerSaving) return

    const title =
      offerForm.title.trim()

    const offerPrice = Number(
      offerForm.offer_price
    )

    if (
      title.length < 2 ||
      !Number.isFinite(
        offerPrice
      ) ||
      offerPrice < 0
    ) {
      appNotice(
        'Enter a valid offer title and price.'
      )
      return
    }

    setOfferSaving(true)

    try {
      const {
        data,
        error,
      } = await supabase
        .from('daily_offers')
        .insert({
          restaurant_id:
            restaurantId,
          title,
          description:
            offerForm.description.trim(),
          discount_text:
            offerForm.discount_text.trim(),
          original_price:
            offerForm.original_price ===
            ''
              ? null
              : Number(
                  offerForm.original_price
                ),
          offer_price:
            offerPrice,
          offer_date:
            offerForm.offer_date,
          image_url:
            offerForm.image_url.trim() ||
            null,
          is_active: true,
          delivery_enabled: true,
        })
        .select('*')
        .single()

      if (error) throw error

      setOffers((current) => [
        data,
        ...current,
      ])

      setOfferForm({
        ...EMPTY_OFFER,
        offer_date:
          new Date().toLocaleDateString(
            'en-CA'
          ),
      })

      setMessage(
        'Delivery offer published.'
      )
    } catch (error) {
      console.error(
        'Delivery offer error:',
        error
      )

      appNotice(
        error?.message ||
          'Unable to save offer.'
      )
    } finally {
      setOfferSaving(false)
    }
  }

  const toggleOffer = async (
    offer
  ) => {
    const next =
      offer.is_active === false

    const {
      data,
      error,
    } = await supabase
      .from('daily_offers')
      .update({
        is_active: next,
        delivery_enabled: true,
      })
      .eq('id', offer.id)
      .eq(
        'restaurant_id',
        restaurantId
      )
      .select('*')
      .single()

    if (error) {
      appNotice(error.message)
      return
    }

    setOffers((current) =>
      current.map((row) =>
        row.id === data.id
          ? data
          : row
      )
    )
  }

  const deleteOffer = async (
    offer
  ) => {
    if (
      !await appConfirm(
        `Delete "${offer.title}"?`
      )
    ) {
      return
    }

    const { error } =
      await supabase
        .from('daily_offers')
        .delete()
        .eq('id', offer.id)
        .eq(
          'restaurant_id',
          restaurantId
        )

    if (error) {
      appNotice(error.message)
      return
    }

    setOffers((current) =>
      current.filter(
        (row) =>
          row.id !== offer.id
      )
    )
  }

  const copyDeliveryUrl =
    async () => {
      if (!deliveryUrl) return

      try {
        await navigator.clipboard.writeText(
          deliveryUrl
        )

        setMessage(
          'Delivery website link copied.'
        )
      } catch {
        await appPrompt(
          'Copy Delivery URL:',
          deliveryUrl
        )
      }
    }

  const downloadQr = async () => {
    if (!qrUrl) return

    try {
      const response =
        await fetch(qrUrl)

      if (!response.ok) {
        throw new Error(
          'Unable to download QR code.'
        )
      }

      const blob =
        await response.blob()

      const objectUrl =
        URL.createObjectURL(blob)

      const anchor =
        document.createElement('a')

      anchor.href = objectUrl
      anchor.download =
        `${String(
          settings.store_name ||
            restaurant?.name ||
            'delivery'
        )
          .toLowerCase()
          .replace(
            /[^a-z0-9]+/g,
            '-'
          )}-delivery-qr.png`

      document.body.appendChild(
        anchor
      )
      anchor.click()
      anchor.remove()

      URL.revokeObjectURL(
        objectUrl
      )
    } catch (error) {
      console.error(
        'Delivery QR error:',
        error
      )

      window.open(
        qrUrl,
        '_blank',
        'noopener,noreferrer'
      )
    }
  }

  const deliveryOffers =
    offers.filter(
      (offer) =>
        offer.delivery_enabled !==
        false
    )


  const loadCodReconciliation = useCallback(
    async (quiet = false) => {
      if (!restaurantId) return
      if (!quiet) setCodLoading(true)
      setCodError('')

      try {
        const { data, error } = await supabase.rpc(
          'owner_delivery_get_cod_reconciliation',
          { p_restaurant_id: restaurantId }
        )

        if (error) throw error
        if (!data?.success) {
          throw new Error(data?.message || 'Unable to load COD reconciliation.')
        }

        setCodReport(data)
      } catch (codLoadError) {
        console.error('Owner COD reconciliation error:', codLoadError)
        setCodError(
          codLoadError?.message || 'Unable to load COD reconciliation.'
        )
      } finally {
        setCodLoading(false)
      }
    },
    [restaurantId]
  )

  const reviewCodSettlement = async (settlement, decision) => {
    if (!restaurantId || !settlement?.id || codReviewId) return

    const decisionLabel = decision === 'approve' ? 'approve' : 'reject'
    const reviewNote = await appPrompt(
      `${decisionLabel === 'approve' ? 'Optional confirmation note' : 'Reason for rejection'} for ${settlement.driver_name || 'driver'}:`,
      ''
    )

    if (reviewNote === null) return

    const confirmed = await appConfirm(
      `${decisionLabel === 'approve' ? 'Approve' : 'Reject'} ${money(
        settlement.amount_submitted
      )} COD cash handover from ${settlement.driver_name || 'this driver'}?`,
      {
        title: decisionLabel === 'approve' ? 'Approve COD Cash' : 'Reject COD Cash',
        confirmText: decisionLabel === 'approve' ? 'Approve' : 'Reject',
      }
    )

    if (!confirmed) return

    setCodReviewId(settlement.id)
    setCodError('')

    try {
      const { data, error } = await supabase.rpc(
        'owner_delivery_review_cod_settlement',
        {
          p_restaurant_id: restaurantId,
          p_settlement_id: settlement.id,
          p_decision: decisionLabel,
          p_review_note: String(reviewNote || '').trim(),
        }
      )

      if (error) throw error
      if (!data?.success) {
        throw new Error(data?.message || 'Unable to review COD handover.')
      }

      setMessage(
        data?.message ||
          `COD cash handover ${decisionLabel === 'approve' ? 'approved' : 'rejected'}.`
      )

      await loadCodReconciliation(true)
    } catch (reviewError) {
      console.error('Owner COD review error:', reviewError)
      setCodError(
        reviewError?.message || 'Unable to review COD cash handover.'
      )
      appNotice(
        reviewError?.message || 'Unable to review COD cash handover.'
      )
    } finally {
      setCodReviewId('')
    }
  }

  useEffect(() => {
    if (tab !== 'cod') return
    loadCodReconciliation(false)
  }, [tab, loadCodReconciliation])

  const tabs = [
    ['overview', 'Overview'],
    [
      'orders',
      `Orders (${orders.length})`,
    ],
    [
      'menu',
      `Delivery Menu (${menuItems.length})`,
    ],
    [
      'inventory',
      `Inventory (${inventoryStats.tracked})`,
    ],
    [
      'cod',
      `COD Cash (${Number(codReport?.summary?.pending_handover || 0) > 0 ? 'Pending' : 'Reconcile'})`,
    ],
    [
      'offers',
      `Offers (${deliveryOffers.length})`,
    ],
    [
      'drivers',
      `Drivers (${drivers.length})`,
    ],
    [
      'packers',
      `Packers (${packers.length})`,
    ],
    ['settings', 'Settings'],
    ['billing', 'Billing'],
    ['payments', 'Payments'],
    ['website', 'Ordering Website'],
  ]

  if (loading) {
    return (
      <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-8 text-center">
        <p className="text-sm font-bold text-neutral-400">
          Loading Delivery
          Management...
        </p>
      </div>
    )
  }

  return (
    <section className="space-y-5">
      <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5 sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-emerald-400">
              Delivery Management
            </p>

            <h2 className="mt-1 text-2xl font-black text-white">
              {settings.store_name ||
                restaurant?.name ||
                'Delivery Store'}
            </h2>

            <p className="mt-2 max-w-2xl text-xs leading-5 text-neutral-400">
              Menu, orders, drivers,
              offers, delivery charges,
              customer payments and the
              separate Delivery ordering
              website are managed here.
            </p>
          </div>

          <div className="flex gap-2">
            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 px-4 py-3">
              <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500">
                Store
              </p>

              <p
                className={`mt-1 text-xs font-black ${
                  settings.is_open
                    ? 'text-emerald-400'
                    : 'text-red-400'
                }`}
              >
                {settings.is_open
                  ? 'OPEN'
                  : 'CLOSED'}
              </p>
            </div>

            <button
              type="button"
              onClick={
                alarmEnabled
                  ? () =>
                      setAlarmEnabled(
                        false
                      )
                  : enableOrderAlarm
              }
              className={`rounded-2xl px-4 py-3 text-[10px] font-black ${
                alarmEnabled
                  ? 'bg-emerald-600 text-white'
                  : 'border border-neutral-800 bg-neutral-950 text-neutral-300'
              }`}
            >
              {alarmEnabled
                ? '🔔 Alarm ON'
                : '🔕 Enable Alarm'}
            </button>
          </div>
        </div>
      </div>

      {message && (
        <div className="rounded-2xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-xs font-bold text-neutral-200">
          {message}
        </div>
      )}

      <nav className="flex gap-2 overflow-x-auto border-b border-neutral-800 pb-3">
        {tabs.map(
          ([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() =>
                setTab(id)
              }
              className={`whitespace-nowrap rounded-xl border px-4 py-2.5 text-xs font-black ${
                tab === id
                  ? 'border-emerald-500 bg-emerald-500 text-white'
                  : 'border-neutral-800 bg-neutral-900 text-neutral-400'
              }`}
            >
              {label}
            </button>
          )
        )}
      </nav>

      {tab === 'overview' && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Stat
              title="Orders Today"
              value={stats.today}
            />

            <Stat
              title="Active Orders"
              value={stats.active}
              accent="text-orange-400"
            />

            <Stat
              title="Today's Revenue"
              value={money(
                stats.todayRevenue
              )}
              accent="text-emerald-400"
            />

            <Stat
              title="Available Drivers"
              value={
                stats.availableDrivers
              }
              accent="text-sky-400"
            />

            <Stat
              title="Delivery Items"
              value={
                stats.menuAvailable
              }
              accent="text-violet-400"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
              <p className="text-[10px] font-black uppercase tracking-wider text-neutral-500">
                Store summary
              </p>

              <div className="mt-4 space-y-3 text-xs">
                <SummaryRow
                  label="Minimum order"
                  value={money(
                    settings.minimum_order_amount
                  )}
                />

                <SummaryRow
                  label="Delivery fee"
                  value={money(
                    settings.delivery_fee
                  )}
                />

                <SummaryRow
                  label="Estimated time"
                  value={`${settings.estimated_delivery_minutes || 45} min`}
                />

                <SummaryRow
                  label="COD"
                  value={
                    settings.cod_enabled
                      ? 'Enabled'
                      : 'Disabled'
                  }
                />

                <SummaryRow
                  label="Online payments"
                  value={
                    settings.online_payment_enabled
                      ? 'Enabled'
                      : 'Disabled'
                  }
                />
              </div>
            </div>

            <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
              <p className="text-[10px] font-black uppercase tracking-wider text-neutral-500">
                Ordering website
              </p>

              <p className="mt-3 break-all font-mono text-xs text-white">
                {deliveryUrl ||
                  'Restaurant code not available'}
              </p>

              <div className="mt-4 flex gap-2">
                <button
                  type="button"
                  onClick={
                    copyDeliveryUrl
                  }
                  disabled={!deliveryUrl}
                  className="rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white disabled:opacity-40"
                >
                  Copy Link
                </button>

                {deliveryUrl && (
                  <a
                    href={deliveryUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3 text-xs font-black text-white"
                  >
                    Open Store
                  </a>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'orders' && (
        <div className="space-y-4">
          <div className="grid gap-3 rounded-3xl border border-neutral-800 bg-neutral-900 p-4 md:grid-cols-2 xl:grid-cols-[1.4fr_0.7fr_0.8fr_auto_auto]">
            <input
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Search code, customer, mobile, city..."
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-xs text-white outline-none focus:border-emerald-500"
            />

            <input
              type="text"
              inputMode="numeric"
              value={orderNumberSearch}
              onChange={(event) =>
                setOrderNumberSearch(
                  event.target.value.replace(/[^0-9A-Za-z-]/g, '')
                )
              }
              placeholder="Order No."
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-xs text-white outline-none focus:border-emerald-500"
            />

            <input
              type="date"
              value={orderDateFilter}
              onChange={(event) =>
                setOrderDateFilter(event.target.value)
              }
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-xs font-bold text-white outline-none [color-scheme:dark]"
            />

            <select
              value={
                orderStatusFilter
              }
              onChange={(event) =>
                setOrderStatusFilter(
                  event.target.value
                )
              }
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-xs font-bold text-white outline-none"
            >
              <option value="active">
                Active
              </option>
              <option value="all">
                All
              </option>

              {ORDER_STATUSES.map(
                (status) => (
                  <option
                    key={status}
                    value={status}
                  >
                    {labelStatus(
                      status
                    )}
                  </option>
                )
              )}
            </select>

            <button
              type="button"
              onClick={() => {
                setSearch('')
                setOrderNumberSearch('')
                setOrderDateFilter('')
              }}
              disabled={!search && !orderNumberSearch && !orderDateFilter}
              className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3 text-[10px] font-black text-neutral-300 disabled:opacity-40"
            >
              Clear Search
            </button>
          </div>

          {(orderNumberSearch || orderDateFilter) &&
            orderStatusFilter === 'active' && (
              <p className="px-1 text-[10px] font-semibold text-amber-400">
                Searching Active orders only. Choose All to include delivered or cancelled orders.
              </p>
            )}

          <div className="space-y-3">
            {filteredOrders.map(
              (order) => (
                <article
                  key={order.id}
                  className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5"
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] font-black text-emerald-400">
                          {order.order_code}
                        </span>

                        <span className="rounded-full bg-neutral-800 px-2.5 py-1 text-[10px] font-black text-neutral-300">
                          #{order.order_number ||
                            '—'}
                        </span>

                        <span className="rounded-full bg-orange-500/10 px-2.5 py-1 text-[10px] font-black text-orange-400">
                          {labelStatus(
                            order.order_status
                          )}
                        </span>
                      </div>

                      <h3 className="mt-3 font-black text-white">
                        {order.customer_name}
                      </h3>

                      <p className="mt-1 text-xs text-neutral-400">
                        {order.customer_mobile}
                        {order.alternate_mobile
                          ? ` · Alt ${order.alternate_mobile}`
                          : ''}
                      </p>

                      <p className="mt-2 max-w-2xl text-xs leading-5 text-neutral-500">
                        {[
                          order.address_line1,
                          order.address_line2,
                          order.landmark,
                          order.city,
                          order.state,
                          order.pincode,
                        ]
                          .filter(Boolean)
                          .join(', ')}
                      </p>

                      {Number.isFinite(Number(order.latitude)) &&
                        Number.isFinite(Number(order.longitude)) && (
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                              `${order.latitude},${order.longitude}`
                            )}`}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 inline-flex rounded-lg bg-sky-500/10 px-3 py-2 text-[10px] font-black text-sky-400"
                          >
                            📍 Open Customer Live Location
                            {order.location_accuracy_m
                              ? ` · ±${Math.round(Number(order.location_accuracy_m))}m`
                              : ''}
                          </a>
                        )}

                      <p className="mt-2 text-[10px] text-neutral-600">
                        Placed{' '}
                        {orderTime(
                          order.created_at
                        )}
                      </p>
                    </div>

                    <div className="min-w-[220px] rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                      <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500">
                        Total
                      </p>

                      <p className="mt-1 text-xl font-black text-white">
                        {money(
                          order.total_amount
                        )}
                      </p>

                      <p className="mt-2 text-[10px] font-bold text-neutral-400">
                        {String(
                          order.payment_method ||
                            ''
                        ).toUpperCase()}
                        {' · '}
                        {labelStatus(
                          order.payment_status
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3 lg:grid-cols-2">
                    <label className="block">
                      <span className="mb-1.5 block text-[10px] font-black uppercase text-neutral-500">
                        Order status
                      </span>

                      <select
                        value={
                          order.order_status
                        }
                        onChange={(event) =>
                          updateOrderStatus(
                            order,
                            event.target
                              .value
                          )
                        }
                        className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-xs font-bold text-white"
                      >
                        {ORDER_STATUSES.map(
                          (status) => (
                            <option
                              key={
                                status
                              }
                              value={
                                status
                              }
                            >
                              {labelStatus(
                                status
                              )}
                            </option>
                          )
                        )}
                      </select>
                    </label>

                    <label className="block">
                      <span className="mb-1.5 block text-[10px] font-black uppercase text-neutral-500">
                        Assign driver
                      </span>

                      <select
                        value={
                          order.driver_id ||
                          ''
                        }
                        onChange={(event) =>
                          assignDriver(
                            order,
                            event.target
                              .value
                          )
                        }
                        className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-xs font-bold text-white"
                      >
                        <option value="">
                          Unassigned
                        </option>

                        {drivers
                          .filter(
                            (driver) =>
                              driver.is_active !==
                              false
                          )
                          .map(
                            (driver) => (
                              <option
                                key={
                                  driver.id
                                }
                                value={
                                  driver.id
                                }
                              >
                                {
                                  driver.name
                                }{' '}
                                ·{' '}
                                {
                                  driver.mobile
                                }{' '}
                                ·{' '}
                                {
                                  driver.status
                                }
                              </option>
                            )
                          )}
                      </select>
                    </label>
                  </div>

                  <div className="mt-4 flex flex-col gap-2 rounded-2xl border border-neutral-800 bg-neutral-950 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="text-[10px] font-black uppercase tracking-wider text-neutral-500">
                        Customer Bill
                      </p>

                      <p className="mt-1 text-[10px] leading-4 text-neutral-600">
                        Generate the authoritative Owner bill using the secure server-side order snapshot.
                      </p>
                    </div>

                    <button
                      type="button"
                      disabled={
                        printingOrderId === order.id ||
                        String(order.order_status || '').toLowerCase() === 'cancelled' ||
                        (
                          String(order.payment_method || '').toLowerCase() === 'razorpay' &&
                          String(order.payment_status || '').toLowerCase() !== 'paid'
                        )
                      }
                      onClick={() =>
                        generateDeliveryBill(
                          order
                        )
                      }
                      className="shrink-0 rounded-xl bg-sky-600 px-5 py-3 text-xs font-black text-white disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
                    >
                      {printingOrderId === order.id
                        ? 'Generating Bill...'
                        : '🧾 Generate / Print Bill'}
                    </button>
                  </div>

                  <div className="mt-4 border-t border-neutral-800 pt-4">
                    <p className="text-[10px] font-black uppercase tracking-wider text-neutral-500">
                      Items
                    </p>

                    <div className="mt-2 grid gap-2">
                      {Array.isArray(
                        order.items
                      ) &&
                        order.items.map(
                          (
                            item,
                            index
                          ) => (
                            <div
                              key={
                                item.id ||
                                index
                              }
                              className="flex items-center justify-between gap-4 text-xs"
                            >
                              <span className="text-neutral-300">
                                {
                                  item.name
                                }{' '}
                                ×{' '}
                                {Number(
                                  item.quantity ||
                                    item.qty ||
                                    1
                                )}
                              </span>

                              <span className="font-black text-white">
                                {money(
                                  Number(
                                    item.line_total ??
                                      Number(
                                        item.price ||
                                          0
                                      ) *
                                        Number(
                                          item.quantity ||
                                            item.qty ||
                                            1
                                        )
                                  )
                                )}
                              </span>
                            </div>
                          )
                        )}
                    </div>
                  </div>


                  {Array.isArray(
                    deliveryProofsByOrder[
                      String(order.id)
                    ]
                  ) &&
                    deliveryProofsByOrder[
                      String(order.id)
                    ].length > 0 && (
                    <div className="mt-4 border-t border-neutral-800 pt-4">
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-wider text-neutral-500">
                            Delivery Proof / Attempts
                          </p>
                          <p className="mt-1 text-[10px] text-neutral-600">
                            Submitted from the assigned Driver Portal.
                          </p>
                        </div>
                        <span className="rounded-full bg-sky-500/10 px-2.5 py-1 text-[9px] font-black text-sky-300">
                          {
                            deliveryProofsByOrder[
                              String(order.id)
                            ].length
                          }{' '}
                          {
                            deliveryProofsByOrder[
                              String(order.id)
                            ].length === 1
                              ? 'attempt'
                              : 'attempts'
                          }
                        </span>
                      </div>

                      <div className="mt-3 space-y-3">
                        {deliveryProofsByOrder[
                          String(order.id)
                        ].map((proof) => (
                          <div
                            key={proof.id}
                            className={`rounded-2xl border p-4 ${
                              proof.delivery_result ===
                              'delivered'
                                ? 'border-emerald-500/20 bg-emerald-500/5'
                                : 'border-red-500/20 bg-red-500/5'
                            }`}
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p
                                  className={`text-xs font-black ${
                                    proof.delivery_result ===
                                    'delivered'
                                      ? 'text-emerald-300'
                                      : 'text-red-300'
                                  }`}
                                >
                                  {proof.delivery_result ===
                                  'delivered'
                                    ? '✓ Delivered'
                                    : '✕ Not Delivered'}
                                </p>
                                <p className="mt-1 text-[10px] text-neutral-500">
                                  Driver:{' '}
                                  {proof.driver_name ||
                                    'Assigned driver'}{' '}
                                  ·{' '}
                                  {orderTime(
                                    proof.created_at
                                  )}
                                </p>
                              </div>
                            </div>

                            {proof.failure_reason && (
                              <div className="mt-3 rounded-xl border border-red-500/10 bg-neutral-950/60 px-3 py-2.5">
                                <p className="text-[9px] font-black uppercase tracking-wider text-neutral-600">
                                  Reason
                                </p>
                                <p className="mt-1 text-xs font-bold text-red-200">
                                  {labelStatus(
                                    proof.failure_reason
                                  )}
                                </p>
                              </div>
                            )}

                            {proof.driver_note && (
                              <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-950/60 px-3 py-2.5">
                                <p className="text-[9px] font-black uppercase tracking-wider text-neutral-600">
                                  Driver Note
                                </p>
                                <p className="mt-1 text-xs leading-5 text-neutral-300">
                                  {proof.driver_note}
                                </p>
                              </div>
                            )}

                            {Array.isArray(proof.images) &&
                              proof.images.length > 0 && (
                              <div className="mt-3">
                                <p className="mb-2 text-[9px] font-black uppercase tracking-wider text-neutral-600">
                                  Uploaded Items / Proof
                                </p>
                                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
                                  {proof.images.map(
                                    (image, index) => (
                                      <a
                                        key={`${proof.id}-${index}`}
                                        href={image.url}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="group overflow-hidden rounded-xl border border-neutral-800 bg-neutral-950"
                                      >
                                        <img
                                          src={image.url}
                                          alt={`Delivery proof ${index + 1}`}
                                          className="aspect-square w-full object-cover transition group-hover:scale-[1.03]"
                                          loading="lazy"
                                        />
                                      </a>
                                    )
                                  )}
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </article>
              )
            )}

            {!filteredOrders.length && (
              <div className="rounded-3xl border border-neutral-800 bg-neutral-900 py-14 text-center text-sm text-neutral-500">
                No matching Delivery
                orders.
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'menu' && (
        <div className="grid gap-5 xl:grid-cols-[380px_1fr]">
          <form
            onSubmit={saveMenuItem}
            className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5"
          >
            <h3 className="font-black text-white">
              {menuForm.id
                ? 'Edit Delivery Item'
                : 'Add Delivery Item'}
            </h3>

            <p className="mt-1 text-xs leading-5 text-neutral-500">
              {menuForm.id
                ? 'Update the Delivery item details. Inventory/barcode edits remain available in the Inventory tab.'
                : 'Add normal food items or scan a packaged product barcode and enter its opening stock. Packaged opening stock is recorded through the atomic inventory engine.'}
            </p>

            <div className="mt-5 space-y-3">
              {!menuForm.id && (
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setMenuForm((current) => ({
                        ...current,
                        item_type: 'food',
                        barcode: '',
                        opening_stock: '0',
                        food_type:
                          current.food_type === 'other' ? 'veg' : current.food_type,
                      }))
                    }
                    className={`rounded-xl border px-3 py-3 text-xs font-black ${
                      menuForm.item_type === 'food'
                        ? 'border-orange-500 bg-orange-500/10 text-orange-300'
                        : 'border-neutral-800 bg-neutral-950 text-neutral-400'
                    }`}
                  >
                    🍔 Food Item
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setMenuForm((current) => ({
                        ...current,
                        item_type: 'packaged_product',
                        food_type: 'other',
                        category:
                          current.category === 'Main Course'
                            ? 'Packaged Products'
                            : current.category,
                      }))
                    }
                    className={`rounded-xl border px-3 py-3 text-xs font-black ${
                      menuForm.item_type === 'packaged_product'
                        ? 'border-sky-500 bg-sky-500/10 text-sky-300'
                        : 'border-neutral-800 bg-neutral-950 text-neutral-400'
                    }`}
                  >
                    📦 Packaged Product
                  </button>
                </div>
              )}

              {!menuForm.id && menuForm.item_type === 'packaged_product' && (
                <div className="rounded-2xl border border-sky-500/20 bg-sky-500/10 p-3">
                  <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                    <Field
                      label="Product Barcode"
                      value={menuForm.barcode}
                      onChange={(value) =>
                        setMenuForm((current) => ({
                          ...current,
                          barcode: value,
                        }))
                      }
                      placeholder="Scan or enter barcode"
                    />
                    <button
                      type="button"
                      onClick={scanNewMenuProductBarcode}
                      className="self-end rounded-xl bg-sky-600 px-4 py-3 text-xs font-black text-white"
                    >
                      📷 Scan
                    </button>
                  </div>
                </div>
              )}

              <Field
                label={
                  !menuForm.id && menuForm.item_type === 'packaged_product'
                    ? 'Product Name'
                    : 'Item Name'
                }
                value={menuForm.name}
                onChange={(value) =>
                  setMenuForm(
                    (current) => ({
                      ...current,
                      name: value,
                    })
                  )
                }
              />

              <Field
                label="Category"
                value={
                  menuForm.category
                }
                onChange={(value) =>
                  setMenuForm(
                    (current) => ({
                      ...current,
                      category: value,
                    })
                  )
                }
              />

              {(menuForm.id || menuForm.item_type !== 'packaged_product') && (
              <SelectField
                label="Food Type"
                value={
                  menuForm.food_type
                }
                onChange={(value) =>
                  setMenuForm(
                    (current) => ({
                      ...current,
                      food_type:
                        value,
                    })
                  )
                }
                options={[
                  [
                    'veg',
                    'Vegetarian',
                  ],
                  [
                    'non-veg',
                    'Non-Vegetarian',
                  ],
                  [
                    'egg',
                    'Egg',
                  ],
                  [
                    'beverage',
                    'Beverage',
                  ],
                  [
                    'cocktail',
                    'Cocktail',
                  ],
                  [
                    'other',
                    'Other',
                  ],
                ]}
              />
              )}

              <Field
                label="Delivery Price"
                type="number"
                value={
                  menuForm.delivery_price
                }
                onChange={(value) =>
                  setMenuForm(
                    (current) => ({
                      ...current,
                      delivery_price:
                        value,
                    })
                  )
                }
              />

              <Field
                label="Delivery Offer Price"
                type="number"
                value={
                  menuForm.delivery_offer_price
                }
                onChange={(value) =>
                  setMenuForm(
                    (current) => ({
                      ...current,
                      delivery_offer_price:
                        value,
                    })
                  )
                }
                placeholder="Optional"
              />

              {!menuForm.id && menuForm.item_type === 'packaged_product' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Opening Stock"
                    type="number"
                    value={menuForm.opening_stock}
                    onChange={(value) =>
                      setMenuForm((current) => ({
                        ...current,
                        opening_stock: value,
                      }))
                    }
                  />
                  <Field
                    label="Low Stock Alert"
                    type="number"
                    value={menuForm.low_stock_threshold}
                    onChange={(value) =>
                      setMenuForm((current) => ({
                        ...current,
                        low_stock_threshold: value,
                      }))
                    }
                  />
                </div>
              )}

              <Field
                label="Image URL"
                value={
                  menuForm.image_url
                }
                onChange={(value) =>
                  setMenuForm(
                    (current) => ({
                      ...current,
                      image_url: value,
                    })
                  )
                }
                placeholder="https://..."
              />

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-black uppercase text-neutral-500">
                  Description
                </span>

                <textarea
                  rows="3"
                  value={
                    menuForm.description
                  }
                  onChange={(event) =>
                    setMenuForm(
                      (current) => ({
                        ...current,
                        description:
                          event.target
                            .value,
                      })
                    )
                  }
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-xs text-white outline-none focus:border-emerald-500"
                />
              </label>

              <Toggle
                label="Show on Delivery Website"
                checked={
                  menuForm.delivery_enabled
                }
                onChange={(checked) =>
                  setMenuForm(
                    (current) => ({
                      ...current,
                      delivery_enabled:
                        checked,
                    })
                  )
                }
              />

              <Toggle
                label="Available for Delivery"
                checked={
                  menuForm.delivery_available
                }
                onChange={(checked) =>
                  setMenuForm(
                    (current) => ({
                      ...current,
                      delivery_available:
                        checked,
                    })
                  )
                }
              />

              <div className="flex gap-2">
                <button
                  type="submit"
                  disabled={menuSaving}
                  className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white disabled:opacity-50"
                >
                  {menuSaving
                    ? 'Saving...'
                    : menuForm.id
                      ? 'Update Item'
                      : 'Add Item'}
                </button>

                {menuForm.id && (
                  <button
                    type="button"
                    onClick={() =>
                      setMenuForm(
                        EMPTY_MENU
                      )
                    }
                    className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3 text-xs font-black text-white"
                  >
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </form>

          <div className="space-y-3">
            {menuItems.map(
              (item) => {
                const livePrice =
                  item.delivery_offer_price ??
                  item.delivery_price ??
                  item.offer_price ??
                  item.price

                return (
                  <article
                    key={item.id}
                    className="rounded-3xl border border-neutral-800 bg-neutral-900 p-4"
                  >
                    <div className="flex gap-4">
                      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-2xl border border-neutral-800 bg-neutral-950">
                        {item.image_url ? (
                          <img
                            src={
                              item.image_url
                            }
                            alt={
                              item.name
                            }
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full items-center justify-center text-2xl text-neutral-700">
                            🍽️
                          </div>
                        )}
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h3 className="truncate font-black text-white">
                              {
                                item.name
                              }
                            </h3>

                            <p className="mt-1 text-[10px] text-neutral-500">
                              {item.category ||
                                'Other'}{' '}
                              ·{' '}
                              {item.food_type ||
                                'other'}
                            </p>
                          </div>

                          <p className="font-black text-emerald-400">
                            {money(
                              livePrice
                            )}
                          </p>
                        </div>

                        {!deliveryOnly && (
                          <p className="mt-2 text-[10px] text-neutral-600">
                            Restaurant
                            price:{' '}
                            {money(
                              item.offer_price ??
                                item.price
                            )}
                          </p>
                        )}

                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() =>
                              editMenuItem(
                                item
                              )
                            }
                            className="rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-[10px] font-black text-white"
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              toggleMenuField(
                                item,
                                'delivery_available'
                              )
                            }
                            className={`rounded-lg px-3 py-2 text-[10px] font-black ${
                              item.delivery_available !==
                              false
                                ? 'bg-emerald-500/10 text-emerald-400'
                                : 'bg-red-500/10 text-red-400'
                            }`}
                          >
                            {item.delivery_available !==
                            false
                              ? 'Available'
                              : 'Unavailable'}
                          </button>

                          <button
                            type="button"
                            onClick={() =>
                              toggleMenuField(
                                item,
                                'delivery_enabled'
                              )
                            }
                            className={`rounded-lg px-3 py-2 text-[10px] font-black ${
                              item.delivery_enabled !==
                              false
                                ? 'bg-sky-500/10 text-sky-400'
                                : 'bg-neutral-800 text-neutral-500'
                            }`}
                          >
                            {item.delivery_enabled !==
                            false
                              ? 'Visible'
                              : 'Hidden'}
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                )
              }
            )}

            {!menuItems.length && (
              <div className="rounded-3xl border border-neutral-800 bg-neutral-900 py-14 text-center text-sm text-neutral-500">
                No menu items yet. Add
                your first Delivery item.
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'inventory' && (
        <div className="space-y-4">
          <div className="rounded-3xl border border-sky-500/20 bg-sky-500/10 p-5">
            <p className="text-[10px] font-black uppercase tracking-wider text-sky-300">
              Owner Inventory Control & History
            </p>
            <h3 className="mt-1 text-lg font-black text-white">
              Live Stock, Daily Sales & Movement Ledger
            </h3>
            <p className="mt-2 text-xs leading-5 text-neutral-400">
              Owner and Manager use the same atomic stock engine. This report adds daily sales and full movement history without bypassing reserved-stock protection.
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat title="Packaged Products" value={inventoryStats.packaged} accent="text-sky-400" />
            <Stat title="Stock Tracked" value={inventoryStats.tracked} accent="text-emerald-400" />
            <Stat title="Low Stock" value={inventoryStats.low} accent="text-orange-400" />
            <Stat title="Out of Stock" value={inventoryStats.out} accent="text-red-400" />
          </div>

          <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
              <div className="grid flex-1 gap-3 sm:grid-cols-2 lg:max-w-2xl">
                <Field
                  label="Report From"
                  type="date"
                  value={inventoryReportStartDate}
                  onChange={setInventoryReportStartDate}
                />
                <Field
                  label="Report To"
                  type="date"
                  value={inventoryReportEndDate}
                  onChange={setInventoryReportEndDate}
                />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={inventoryReportLoading}
                  onClick={refreshInventoryReports}
                  className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3 text-xs font-black text-white disabled:opacity-50"
                >
                  {inventoryReportLoading ? 'Loading...' : 'Refresh Report'}
                </button>
                <button
                  type="button"
                  onClick={exportInventorySummaryCsv}
                  className="rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white"
                >
                  ↓ Download CSV
                </button>
              </div>
            </div>

            {inventoryReportError && (
              <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs font-bold text-red-300">
                {inventoryReportError}
              </div>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <InventoryMetric label="Sold Today" value={Number(inventoryReport?.today_totals?.sold || 0)} />
              <InventoryMetric label="Restocked Today" value={Number(inventoryReport?.today_totals?.restocked || 0)} />
              <InventoryMetric label="Released Today" value={Number(inventoryReport?.today_totals?.released || 0)} />
              <InventoryMetric label="Movements Today" value={Number(inventoryReport?.today_totals?.movements || 0)} />
            </div>

            <div className="mt-3 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500">
                Selected Range · {inventoryReportStartDate || '—'} → {inventoryReportEndDate || '—'}
              </p>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <InventoryMetric label="Sold" value={Number(inventoryReport?.range_totals?.sold || 0)} />
                <InventoryMetric label="Restocked" value={Number(inventoryReport?.range_totals?.restocked || 0)} />
                <InventoryMetric label="Released" value={Number(inventoryReport?.range_totals?.released || 0)} />
                <InventoryMetric label="Movements" value={Number(inventoryReport?.range_totals?.movements || 0)} />
              </div>
            </div>
          </div>

          <div className="grid gap-3 rounded-3xl border border-neutral-800 bg-neutral-900 p-4 lg:grid-cols-[1fr_auto]">
            <input
              value={inventorySearch}
              onChange={(event) => setInventorySearch(event.target.value)}
              placeholder="Search product, category or barcode..."
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-xs text-white outline-none focus:border-emerald-500"
            />
            <select
              value={inventoryFilter}
              onChange={(event) => setInventoryFilter(event.target.value)}
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-xs font-bold text-white"
            >
              <option value="all">All Items</option>
              <option value="food">Food Items</option>
              <option value="packaged">Packaged Products</option>
              <option value="tracked">Stock Tracked</option>
              <option value="low">Low Stock</option>
              <option value="out">Out of Stock</option>
            </select>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {filteredInventoryItems.map((item) => {
              const editing = editingInventoryId === item.id
              const type = String(item.item_type || 'food')
              const tracked = item.track_stock === true
              const stock = Number(item.stock_quantity || 0)
              const reserved = Number(item.reserved_quantity || 0)
              const available = Number(item.available_stock ?? Math.max(stock - reserved, 0))
              const threshold = Number(item.low_stock_threshold ?? 5)
              const out = tracked && available <= 0
              const low = tracked && available > 0 && available <= threshold
              const reportItem = inventoryReportItemsById.get(String(item.id)) || {}
              const soldToday = Number(reportItem.sold_today || 0)

              return (
                <article key={item.id} className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex flex-wrap gap-2">
                        <h3 className="font-black text-white">{item.name}</h3>
                        <span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${type === 'packaged_product' ? 'bg-sky-500/10 text-sky-400' : 'bg-orange-500/10 text-orange-400'}`}>
                          {type === 'packaged_product' ? '📦 PACKAGED' : '🍔 FOOD'}
                        </span>
                      </div>
                      <p className="mt-1 text-[10px] text-neutral-500">{item.category || 'Other'}</p>
                      {type === 'packaged_product' && (
                        <p className="mt-2 break-all font-mono text-[10px] text-neutral-400">
                          Barcode: {item.barcode || 'Not configured'}
                        </p>
                      )}
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${!tracked ? 'bg-neutral-800 text-neutral-500' : out ? 'bg-red-500/10 text-red-400' : low ? 'bg-orange-500/10 text-orange-400' : 'bg-emerald-500/10 text-emerald-400'}`}>
                      {!tracked ? 'NOT TRACKED' : out ? 'OUT OF STOCK' : low ? 'LOW STOCK' : 'IN STOCK'}
                    </span>
                  </div>

                  {!editing ? (
                    <>
                      {tracked && (
                        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                          <InventoryMetric label="Stock" value={stock} />
                          <InventoryMetric label="Reserved" value={reserved} />
                          <InventoryMetric label="Available" value={available} />
                          <InventoryMetric label="Sold Today" value={soldToday} />
                        </div>
                      )}

                      {tracked && (
                        <p className="mt-3 text-[10px] text-neutral-500">
                          Low-stock alert at {threshold} units
                        </p>
                      )}

                      <div className="mt-4 grid gap-2 sm:grid-cols-3">
                        <button
                          type="button"
                          onClick={() => startInventoryEdit(item)}
                          className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3 text-xs font-black text-white"
                        >
                          Edit Inventory
                        </button>

                        {tracked && (
                          <button
                            type="button"
                            disabled={restockingId === item.id}
                            onClick={() => restockInventory(item)}
                            className="rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white disabled:opacity-50"
                          >
                            {restockingId === item.id ? 'Adding...' : '+ Restock'}
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => loadInventoryHistory(item.id)}
                          className="rounded-xl border border-sky-500/30 bg-sky-500/10 px-4 py-3 text-xs font-black text-sky-300"
                        >
                          View History
                        </button>
                      </div>
                    </>
                  ) : (
                    <div className="mt-5 space-y-3">
                      <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => setInventoryDraft((current) => ({ ...current, item_type: 'food', barcode: '', track_stock: false }))} className={`rounded-xl border px-3 py-3 text-xs font-black ${inventoryDraft.item_type === 'food' ? 'border-orange-500 bg-orange-500/10 text-orange-300' : 'border-neutral-800 bg-neutral-950 text-neutral-400'}`}>
                          🍔 Food Item
                        </button>
                        <button type="button" onClick={() => setInventoryDraft((current) => ({ ...current, item_type: 'packaged_product', track_stock: true }))} className={`rounded-xl border px-3 py-3 text-xs font-black ${inventoryDraft.item_type === 'packaged_product' ? 'border-sky-500 bg-sky-500/10 text-sky-300' : 'border-neutral-800 bg-neutral-950 text-neutral-400'}`}>
                          📦 Packaged Product
                        </button>
                      </div>

                      {inventoryDraft.item_type === 'packaged_product' && (
                        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                          <Field label="Barcode" value={inventoryDraft.barcode} onChange={(value) => setInventoryDraft((current) => ({ ...current, barcode: value }))} placeholder="Scan or enter barcode" />
                          <button type="button" onClick={scanInventoryBarcode} className="self-end rounded-xl bg-sky-600 px-4 py-3 text-xs font-black text-white">
                            📷 Scan
                          </button>
                        </div>
                      )}

                      <Toggle label="Track Stock" checked={inventoryDraft.track_stock} onChange={(value) => setInventoryDraft((current) => ({ ...current, track_stock: value }))} />

                      {inventoryDraft.track_stock && (
                        <div className="grid gap-3 sm:grid-cols-2">
                          <Field label="Current / Opening Stock" type="number" value={inventoryDraft.stock_quantity} onChange={(value) => setInventoryDraft((current) => ({ ...current, stock_quantity: value }))} />
                          <Field label="Low Stock Alert" type="number" value={inventoryDraft.low_stock_threshold} onChange={(value) => setInventoryDraft((current) => ({ ...current, low_stock_threshold: value }))} />
                        </div>
                      )}

                      {reserved > 0 && (
                        <p className="rounded-xl bg-orange-500/10 px-3 py-2 text-[10px] font-bold text-orange-300">
                          {reserved} unit(s) currently reserved by orders.
                        </p>
                      )}

                      <div className="flex gap-2">
                        <button type="button" disabled={inventorySaving} onClick={() => saveInventory(item)} className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white disabled:opacity-50">
                          {inventorySaving ? 'Saving...' : 'Save Inventory'}
                        </button>
                        <button type="button" onClick={() => setEditingInventoryId('')} className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3 text-xs font-black text-white">
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </article>
              )
            })}

            {!filteredInventoryItems.length && (
              <div className="col-span-full rounded-3xl border border-neutral-800 bg-neutral-900 py-14 text-center text-sm text-neutral-500">
                No inventory items match this filter.
              </div>
            )}
          </div>

          {selectedInventoryHistoryId && (
            <InventoryHistoryPanel
              item={menuItems.find((row) => String(row.id) === String(selectedInventoryHistoryId))}
              report={inventoryHistoryReport}
              loading={inventoryHistoryLoading}
              error={inventoryHistoryError}
              onRefresh={() => loadInventoryHistory(selectedInventoryHistoryId)}
              onDownload={exportInventoryHistoryCsv}
              onClose={() => loadInventoryHistory('')}
            />
          )}
        </div>
      )}


      {tab === 'cod' && (
        <div className="space-y-4">
          <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                  COD Cash Reconciliation
                </p>
                <h3 className="mt-1 text-xl font-black text-white">
                  Driver cash due & handovers
                </h3>
                <p className="mt-2 max-w-2xl text-xs leading-5 text-neutral-400">
                  Approve a handover only after the physical cash is received. Approved cash is automatically allocated to the driver's oldest unsettled COD orders.
                </p>
              </div>

              <button
                type="button"
                onClick={() => loadCodReconciliation(false)}
                disabled={codLoading}
                className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-[10px] font-black text-neutral-300 disabled:opacity-50"
              >
                {codLoading ? 'Refreshing...' : '↻ Refresh COD'}
              </button>
            </div>

            {codError && (
              <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs font-bold text-red-300">
                {codError}
              </div>
            )}

            <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <p className="text-[9px] font-black uppercase text-neutral-500">Rider Cash Due</p>
                <p className="mt-2 text-xl font-black text-amber-300">{money(codReport?.summary?.cash_due)}</p>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <p className="text-[9px] font-black uppercase text-neutral-500">Pending Handover</p>
                <p className="mt-2 text-xl font-black text-sky-300">{money(codReport?.summary?.pending_handover)}</p>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <p className="text-[9px] font-black uppercase text-neutral-500">Collected Today</p>
                <p className="mt-2 text-xl font-black text-white">{money(codReport?.summary?.collected_today)}</p>
              </div>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                <p className="text-[9px] font-black uppercase text-neutral-500">Settled Today</p>
                <p className="mt-2 text-xl font-black text-emerald-300">{money(codReport?.summary?.settled_today)}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {(Array.isArray(codReport?.drivers) ? codReport.drivers : []).map((driver) => (
              <article key={driver.driver_id} className="rounded-3xl border border-neutral-800 bg-neutral-900 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-black text-white">{driver.driver_name}</p>
                    <p className="mt-1 text-[10px] text-neutral-500">{driver.driver_mobile || 'No mobile'}</p>
                  </div>
                  <span className={`rounded-full px-2.5 py-1 text-[9px] font-black ${Number(driver.cash_due || 0) > 0 ? 'bg-amber-500/10 text-amber-300' : 'bg-emerald-500/10 text-emerald-300'}`}>
                    {Number(driver.cash_due || 0) > 0 ? 'Cash Due' : 'Clear'}
                  </span>
                </div>

                <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-xl bg-neutral-950 p-3">
                    <p className="text-[8px] font-black uppercase text-neutral-600">Due</p>
                    <p className="mt-1 text-xs font-black text-amber-300">{money(driver.cash_due)}</p>
                  </div>
                  <div className="rounded-xl bg-neutral-950 p-3">
                    <p className="text-[8px] font-black uppercase text-neutral-600">Pending</p>
                    <p className="mt-1 text-xs font-black text-sky-300">{money(driver.pending_handover)}</p>
                  </div>
                  <div className="rounded-xl bg-neutral-950 p-3">
                    <p className="text-[8px] font-black uppercase text-neutral-600">Orders</p>
                    <p className="mt-1 text-xs font-black text-white">{Number(driver.unsettled_orders || 0)}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-amber-400">Action Required</p>
              <h3 className="mt-1 text-lg font-black text-white">Pending Cash Handovers</h3>
            </div>

            <div className="mt-4 space-y-3">
              {(Array.isArray(codReport?.settlements) ? codReport.settlements : [])
                .filter((row) => row.status === 'pending')
                .map((settlement) => (
                  <article key={settlement.id} className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-black text-white">{settlement.driver_name}</p>
                        <p className="mt-1 text-2xl font-black text-amber-300">{money(settlement.amount_submitted)}</p>
                        <p className="mt-1 text-[10px] text-neutral-500">Submitted {orderTime(settlement.submitted_at)}</p>
                        {settlement.driver_note && <p className="mt-2 text-xs text-neutral-300">{settlement.driver_note}</p>}
                      </div>

                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={Boolean(codReviewId)}
                          onClick={() => reviewCodSettlement(settlement, 'reject')}
                          className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-black text-red-300 disabled:opacity-40"
                        >
                          Reject
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(codReviewId)}
                          onClick={() => reviewCodSettlement(settlement, 'approve')}
                          className="rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white disabled:opacity-40"
                        >
                          {codReviewId === settlement.id ? 'Processing...' : '✓ Approve Cash'}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}

              {!(Array.isArray(codReport?.settlements) ? codReport.settlements : []).some((row) => row.status === 'pending') && (
                <div className="rounded-2xl border border-neutral-800 bg-neutral-950 py-10 text-center text-xs text-neutral-500">
                  No pending COD cash handovers.
                </div>
              )}
            </div>
          </section>

          <div className="grid gap-4 lg:grid-cols-2">
            <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
              <p className="text-[10px] font-black uppercase tracking-wider text-neutral-500">Recent</p>
              <h3 className="mt-1 text-lg font-black text-white">Settlement History</h3>
              <div className="mt-4 space-y-2">
                {(Array.isArray(codReport?.settlements) ? codReport.settlements : []).slice(0, 15).map((row) => (
                  <div key={row.id} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3">
                    <div>
                      <p className="text-xs font-black text-white">{row.driver_name} · {money(row.amount_submitted)}</p>
                      <p className="mt-1 text-[9px] text-neutral-500">{orderTime(row.submitted_at)}{row.reviewed_by_name ? ` · ${row.reviewed_by_name}` : ''}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${row.status === 'approved' ? 'bg-emerald-500/10 text-emerald-300' : row.status === 'rejected' ? 'bg-red-500/10 text-red-300' : 'bg-amber-500/10 text-amber-300'}`}>
                      {labelStatus(row.status)}
                    </span>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
              <p className="text-[10px] font-black uppercase tracking-wider text-neutral-500">Order Ledger</p>
              <h3 className="mt-1 text-lg font-black text-white">Outstanding COD Orders</h3>
              <div className="mt-4 space-y-2">
                {(Array.isArray(codReport?.collections) ? codReport.collections : [])
                  .filter((row) => Number(row.outstanding_amount || 0) > 0)
                  .slice(0, 15)
                  .map((row) => (
                    <div key={row.id} className="flex items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3">
                      <div>
                        <p className="font-mono text-[10px] font-black text-white">{row.order_code || 'COD Order'}</p>
                        <p className="mt-1 text-[9px] text-neutral-500">{row.driver_name || 'Unassigned'} · {orderTime(row.collected_at)}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-black text-amber-300">{money(row.outstanding_amount)}</p>
                        <p className="mt-1 text-[8px] uppercase text-neutral-600">Outstanding</p>
                      </div>
                    </div>
                  ))}
              </div>
            </section>
          </div>
        </div>
      )}

      {tab === 'offers' && (
        <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
          <form
            onSubmit={saveOffer}
            className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5"
          >
            <h3 className="font-black text-white">
              Delivery Offer
            </h3>

            <p className="mt-1 text-xs text-neutral-500">
              Promotional cards appear
              on the Delivery website.
            </p>

            <div className="mt-5 space-y-3">
              <Field
                label="Offer Title"
                value={
                  offerForm.title
                }
                onChange={(value) =>
                  setOfferForm(
                    (current) => ({
                      ...current,
                      title: value,
                    })
                  )
                }
              />

              <Field
                label="Discount Text"
                value={
                  offerForm.discount_text
                }
                onChange={(value) =>
                  setOfferForm(
                    (current) => ({
                      ...current,
                      discount_text:
                        value,
                    })
                  )
                }
                placeholder="20% OFF"
              />

              <Field
                label="Original Price"
                type="number"
                value={
                  offerForm.original_price
                }
                onChange={(value) =>
                  setOfferForm(
                    (current) => ({
                      ...current,
                      original_price:
                        value,
                    })
                  )
                }
                placeholder="Optional"
              />

              <Field
                label="Offer Price"
                type="number"
                value={
                  offerForm.offer_price
                }
                onChange={(value) =>
                  setOfferForm(
                    (current) => ({
                      ...current,
                      offer_price:
                        value,
                    })
                  )
                }
              />

              <Field
                label="Offer Date"
                type="date"
                value={
                  offerForm.offer_date
                }
                onChange={(value) =>
                  setOfferForm(
                    (current) => ({
                      ...current,
                      offer_date:
                        value,
                    })
                  )
                }
              />

              <Field
                label="Image URL"
                value={
                  offerForm.image_url
                }
                onChange={(value) =>
                  setOfferForm(
                    (current) => ({
                      ...current,
                      image_url: value,
                    })
                  )
                }
                placeholder="Optional"
              />

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-black uppercase text-neutral-500">
                  Description
                </span>

                <textarea
                  rows="3"
                  value={
                    offerForm.description
                  }
                  onChange={(event) =>
                    setOfferForm(
                      (current) => ({
                        ...current,
                        description:
                          event.target
                            .value,
                      })
                    )
                  }
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-xs text-white"
                />
              </label>

              <button
                type="submit"
                disabled={offerSaving}
                className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white disabled:opacity-50"
              >
                {offerSaving
                  ? 'Publishing...'
                  : 'Publish Offer'}
              </button>
            </div>
          </form>

          <div className="space-y-3">
            {deliveryOffers.map(
              (offer) => (
                <article
                  key={offer.id}
                  className="rounded-3xl border border-neutral-800 bg-neutral-900 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-[10px] font-black uppercase text-orange-400">
                        {offer.discount_text ||
                          'Offer'}
                      </p>

                      <h3 className="mt-1 font-black text-white">
                        {offer.title}
                      </h3>

                      <p className="mt-1 text-xs text-neutral-500">
                        {offer.description}
                      </p>

                      <p className="mt-3 text-xs font-bold text-neutral-300">
                        {offer.original_price
                          ? `${money(
                              offer.original_price
                            )} → `
                          : ''}
                        {money(
                          offer.offer_price
                        )}
                      </p>
                    </div>

                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          toggleOffer(
                            offer
                          )
                        }
                        className={`rounded-lg px-3 py-2 text-[10px] font-black ${
                          offer.is_active
                            ? 'bg-emerald-500/10 text-emerald-400'
                            : 'bg-neutral-800 text-neutral-500'
                        }`}
                      >
                        {offer.is_active
                          ? 'Active'
                          : 'Inactive'}
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          deleteOffer(
                            offer
                          )
                        }
                        className="rounded-lg bg-red-500/10 px-3 py-2 text-[10px] font-black text-red-400"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </article>
              )
            )}

            {!deliveryOffers.length && (
              <div className="rounded-3xl border border-neutral-800 bg-neutral-900 py-14 text-center text-sm text-neutral-500">
                No Delivery offers yet.
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'drivers' && (
        <div className="space-y-5">
          <div className="rounded-3xl border border-emerald-500/20 bg-emerald-500/10 p-5">
            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
              Driver Mobile Portal
            </p>

            <p className="mt-2 break-all font-mono text-xs text-white">
              {driverPortalUrl ||
                'Restaurant code not available'}
            </p>

            <p className="mt-2 text-[10px] leading-5 text-neutral-400">
              Give this link to your
              delivery drivers. Each
              driver signs in with the
              Driver User ID and password
              you create below.
            </p>

            {driverPortalUrl && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(
                        driverPortalUrl
                      )
                      setMessage(
                        'Driver Portal link copied.'
                      )
                    } catch {
                      await appPrompt(
                        'Copy Driver Portal URL:',
                        driverPortalUrl
                      )
                    }
                  }}
                  className="rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white"
                >
                  Copy Driver Portal Link
                </button>

                <a
                  href={driverPortalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-xs font-black text-white"
                >
                  Open Driver Portal

    
                </a>
              </div>
            )}
          </div>

          <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
          <form
            onSubmit={saveDriver}
            className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5"
          >
            <h3 className="font-black text-white">
              Add Delivery Driver
            </h3>

            <div className="mt-5 space-y-3">
              <Field
                label="Driver Name"
                value={
                  driverForm.name
                }
                onChange={(value) =>
                  setDriverForm(
                    (current) => ({
                      ...current,
                      name: value,
                    })
                  )
                }
              />

              <Field
                label="Mobile"
                value={
                  driverForm.mobile
                }
                onChange={(value) =>
                  setDriverForm(
                    (current) => ({
                      ...current,
                      mobile:
                        cleanDigits(
                          value
                        ),
                    })
                  )
                }
              />

              <Field
                label="Alternate Mobile"
                value={
                  driverForm.alternate_mobile
                }
                onChange={(value) =>
                  setDriverForm(
                    (current) => ({
                      ...current,
                      alternate_mobile:
                        cleanDigits(
                          value
                        ),
                    })
                  )
                }
              />

              <SelectField
                label="Vehicle Type"
                value={
                  driverForm.vehicle_type
                }
                onChange={(value) =>
                  setDriverForm(
                    (current) => ({
                      ...current,
                      vehicle_type:
                        value,
                    })
                  )
                }
                options={[
                  ['bike', 'Bike'],
                  [
                    'scooter',
                    'Scooter',
                  ],
                  [
                    'bicycle',
                    'Bicycle',
                  ],
                  ['car', 'Car'],
                  ['other', 'Other'],
                ]}
              />

              <Field
                label="Vehicle Number"
                value={
                  driverForm.vehicle_number
                }
                onChange={(value) =>
                  setDriverForm(
                    (current) => ({
                      ...current,
                      vehicle_number:
                        value,
                    })
                  )
                }
              />

              <Field
                label="Driver User ID"
                value={
                  driverForm.portal_user_id
                }
                onChange={(value) =>
                  setDriverForm(
                    (current) => ({
                      ...current,
                      portal_user_id:
                        value
                          .toLowerCase()
                          .replace(
                            /[^a-z0-9._-]/g,
                            ''
                          ),
                    })
                  )
                }
                placeholder="driver01"
              />

              <Field
                label="Driver Portal Password"
                type="password"
                value={
                  driverForm.password
                }
                onChange={(value) =>
                  setDriverForm(
                    (current) => ({
                      ...current,
                      password:
                        value,
                    })
                  )
                }
                placeholder="Minimum 6 characters"
              />

              <p className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-[10px] leading-5 text-neutral-500">
                The password is hashed in
                the database. It is never
                stored as readable text.
              </p>

              <button
                type="submit"
                disabled={driverSaving}
                className="w-full rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white disabled:opacity-50"
              >
                {driverSaving
                  ? 'Adding...'
                  : 'Add Driver'}
              </button>
            </div>
          </form>

          <div className="grid gap-3 sm:grid-cols-2">
            {drivers.map(
              (driver) => (
                <article
                  key={driver.id}
                  className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-black text-white">
                        {driver.name}
                      </h3>

                      <p className="mt-1 text-xs text-neutral-400">
                        {driver.mobile}
                      </p>

                      <p className="mt-2 text-[10px] font-bold text-neutral-500">
                        {driver.vehicle_type}{' '}
                        {driver.vehicle_number
                          ? `· ${driver.vehicle_number}`
                          : ''}
                      </p>

                      <p className="mt-2 text-[10px] font-mono text-emerald-400">
                        Portal:{' '}
                        {driver.portal_user_id ||
                          'Not configured'}
                      </p>
                    </div>

                    <span
                      className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${
                        driver.status ===
                        'available'
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : driver.status ===
                              'busy'
                            ? 'bg-orange-500/10 text-orange-400'
                            : 'bg-neutral-800 text-neutral-500'
                      }`}
                    >
                      {driver.status}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() =>
                      resetDriverLogin(
                        driver
                      )
                    }
                    className="mt-4 w-full rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-xs font-black text-emerald-400"
                  >
                    {driver.portal_user_id
                      ? 'Reset Driver Login'
                      : 'Set Driver Login'}
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      toggleDriverActive(
                        driver
                      )
                    }
                    className={`mt-2 w-full rounded-xl px-4 py-3 text-xs font-black ${
                      driver.is_active ===
                      false
                        ? 'bg-emerald-600 text-white'
                        : 'border border-red-500/20 bg-red-500/10 text-red-400'
                    }`}
                  >
                    {driver.is_active ===
                    false
                      ? 'Reactivate Driver'
                      : 'Deactivate Driver'}
                  </button>
                </article>
              )
            )}

            {!drivers.length && (
              <div className="col-span-full rounded-3xl border border-neutral-800 bg-neutral-900 py-14 text-center text-sm text-neutral-500">
                No drivers added yet.
              </div>
            )}
          </div>
          </div>
        </div>
      )}

      {tab === 'packers' && (
        <div className="space-y-5">
          <div className="rounded-3xl border border-violet-500/20 bg-violet-500/10 p-5">
            <p className="text-[10px] font-black uppercase tracking-wider text-violet-300">
              Delivery Packer Portal
            </p>

            <p className="mt-2 break-all font-mono text-xs text-white">
              {packerPortalUrl || 'Restaurant code not available'}
            </p>

            <p className="mt-2 text-[10px] leading-5 text-neutral-400">
              Packers receive all eligible Delivery orders. They can Confirm,
              mark Packed, and move a packed order Out for Delivery after a
              driver has been assigned.
            </p>

            {packerPortalUrl && (
              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(packerPortalUrl)
                      setMessage('Packer Portal link copied.')
                    } catch {
                      await appPrompt('Copy Packer Portal URL:', packerPortalUrl)
                    }
                  }}
                  className="rounded-xl bg-violet-600 px-4 py-3 text-xs font-black text-white"
                >
                  Copy Packer Portal Link
                </button>

                <a
                  href={packerPortalUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-xs font-black text-white"
                >
                  Open Packer Portal
                </a>
              </div>
            )}
          </div>

          <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
            <form
              onSubmit={savePacker}
              className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5"
            >
              <h3 className="font-black text-white">Add Delivery Packer</h3>

              <div className="mt-5 space-y-3">
                <Field
                  label="Packer Name"
                  value={packerForm.name}
                  onChange={(value) =>
                    setPackerForm((current) => ({ ...current, name: value }))
                  }
                />

                <Field
                  label="Mobile"
                  value={packerForm.mobile}
                  onChange={(value) =>
                    setPackerForm((current) => ({
                      ...current,
                      mobile: cleanDigits(value),
                    }))
                  }
                  placeholder="Optional"
                />

                <Field
                  label="Packer User ID"
                  value={packerForm.portal_user_id}
                  onChange={(value) =>
                    setPackerForm((current) => ({
                      ...current,
                      portal_user_id: value
                        .toLowerCase()
                        .replace(/[^a-z0-9._-]/g, ''),
                    }))
                  }
                  placeholder="packer01"
                />

                <Field
                  label="Packer Portal Password"
                  type="password"
                  value={packerForm.password}
                  onChange={(value) =>
                    setPackerForm((current) => ({ ...current, password: value }))
                  }
                  placeholder="Minimum 6 characters"
                />

                <p className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-[10px] leading-5 text-neutral-500">
                  Packer passwords are hashed and old sessions are invalidated
                  when the owner resets a login.
                </p>

                <button
                  type="submit"
                  disabled={packerSaving}
                  className="w-full rounded-xl bg-violet-600 px-4 py-3 text-xs font-black text-white disabled:opacity-50"
                >
                  {packerSaving ? 'Adding...' : 'Add Packer'}
                </button>
              </div>
            </form>

            <div className="grid gap-3 sm:grid-cols-2">
              {packers.map((packer) => (
                <article
                  key={packer.id}
                  className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-black text-white">{packer.name}</h3>
                      <p className="mt-1 text-xs text-neutral-400">
                        {packer.mobile || 'No mobile added'}
                      </p>
                      <p className="mt-2 text-[10px] font-mono text-violet-300">
                        Portal: {packer.portal_user_id || 'Not configured'}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${
                        packer.is_active === false
                          ? 'bg-neutral-800 text-neutral-500'
                          : 'bg-emerald-500/10 text-emerald-400'
                      }`}
                    >
                      {packer.is_active === false ? 'Inactive' : 'Active'}
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => resetPackerLogin(packer)}
                    className="mt-4 w-full rounded-xl border border-violet-500/20 bg-violet-500/10 px-4 py-3 text-xs font-black text-violet-300"
                  >
                    Reset Packer Login
                  </button>

                  <button
                    type="button"
                    onClick={() => togglePackerActive(packer)}
                    className={`mt-2 w-full rounded-xl px-4 py-3 text-xs font-black ${
                      packer.is_active === false
                        ? 'bg-emerald-600 text-white'
                        : 'border border-red-500/20 bg-red-500/10 text-red-400'
                    }`}
                  >
                    {packer.is_active === false
                      ? 'Reactivate Packer'
                      : 'Deactivate Packer'}
                  </button>
                </article>
              ))}

              {!packers.length && (
                <div className="col-span-full rounded-3xl border border-neutral-800 bg-neutral-900 py-14 text-center text-sm text-neutral-500">
                  No packers added yet.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'settings' && (
        <form
          onSubmit={saveSettings}
          className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5 sm:p-6"
        >
          <div>
            <h3 className="font-black text-white">
              Delivery Settings
            </h3>

            <p className="mt-1 text-xs text-neutral-500">
              Payment method switches are
              managed securely from the
              Payments tab.
            </p>
          </div>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field
              label="Delivery Store Name"
              value={
                settings.store_name
              }
              onChange={(value) =>
                setSettings(
                  (current) => ({
                    ...current,
                    store_name: value,
                  })
                )
              }
            />

            <Field
              label="Support Phone"
              value={
                settings.support_phone
              }
              onChange={(value) =>
                setSettings(
                  (current) => ({
                    ...current,
                    support_phone:
                      cleanDigits(
                        value
                      ),
                  })
                )
              }
            />

            <Field
              label="Minimum Order"
              type="number"
              value={
                settings.minimum_order_amount
              }
              onChange={(value) =>
                setSettings(
                  (current) => ({
                    ...current,
                    minimum_order_amount:
                      value,
                  })
                )
              }
            />

            <Field
              label="Delivery Fee"
              type="number"
              value={
                settings.delivery_fee
              }
              onChange={(value) =>
                setSettings(
                  (current) => ({
                    ...current,
                    delivery_fee:
                      value,
                  })
                )
              }
            />

            <Field
              label="Free Delivery Above"
              type="number"
              value={
                settings.free_delivery_above
              }
              onChange={(value) =>
                setSettings(
                  (current) => ({
                    ...current,
                    free_delivery_above:
                      value,
                  })
                )
              }
            />

            <Field
              label="Packing Charge"
              type="number"
              value={
                settings.packing_charge
              }
              onChange={(value) =>
                setSettings(
                  (current) => ({
                    ...current,
                    packing_charge:
                      value,
                  })
                )
              }
            />

            <Field
              label="Handling Charge"
              type="number"
              value={
                settings.handling_charge
              }
              onChange={(value) =>
                setSettings(
                  (current) => ({
                    ...current,
                    handling_charge:
                      value,
                  })
                )
              }
            />

            <Field
              label="Surge Charge"
              type="number"
              value={
                settings.surge_charge
              }
              onChange={(value) =>
                setSettings(
                  (current) => ({
                    ...current,
                    surge_charge:
                      value,
                  })
                )
              }
            />

            <Field
              label="Orders Per Delivery Boy / Hour"
              type="number"
              value={
                settings.orders_per_delivery_boy_per_hour
              }
              onChange={(value) =>
                setSettings(
                  (current) => ({
                    ...current,
                    orders_per_delivery_boy_per_hour:
                      value,
                  })
                )
              }
            />

            <div className="sm:col-span-2">
              <Toggle
                label="Enable Automatic Surge Pricing"
                checked={Boolean(
                  settings.surge_enabled
                )}
                onChange={(checked) =>
                  setSettings(
                    (current) => ({
                      ...current,
                      surge_enabled:
                        checked,
                    })
                  )
                }
              />

              <p className="mt-2 text-[10px] leading-4 text-neutral-500">
                Surge becomes active when orders received in the last hour reach the current delivery capacity. Capacity = active delivery boys × orders per delivery boy per hour.
              </p>
            </div>

            <Field
              label="SGST %"
              type="number"
              value={
                settings.sgst_rate
              }
              onChange={(value) =>
                setSettings(
                  (current) => ({
                    ...current,
                    sgst_rate: value,
                  })
                )
              }
            />

            <Field
              label="CGST %"
              type="number"
              value={
                settings.cgst_rate
              }
              onChange={(value) =>
                setSettings(
                  (current) => ({
                    ...current,
                    cgst_rate: value,
                  })
                )
              }
            />

            <Field
              label="Estimated Delivery (minutes)"
              type="number"
              value={
                settings.estimated_delivery_minutes
              }
              onChange={(value) =>
                setSettings(
                  (current) => ({
                    ...current,
                    estimated_delivery_minutes:
                      value,
                  })
                )
              }
            />

            <Field
              label="Logo URL"
              value={
                settings.logo_url
              }
              onChange={(value) =>
                setSettings(
                  (current) => ({
                    ...current,
                    logo_url: value,
                  })
                )
              }
            />

            <Field
              label="Banner URL"
              value={
                settings.banner_url
              }
              onChange={(value) =>
                setSettings(
                  (current) => ({
                    ...current,
                    banner_url: value,
                  })
                )
              }
            />

            <Field
              label="Address"
              value={
                settings.address
              }
              onChange={(value) =>
                setSettings(
                  (current) => ({
                    ...current,
                    address: value,
                  })
                )
              }
            />

            <Field
              label="City"
              value={
                settings.city
              }
              onChange={(value) =>
                setSettings(
                  (current) => ({
                    ...current,
                    city: value,
                  })
                )
              }
            />

            <Field
              label="State"
              value={
                settings.state
              }
              onChange={(value) =>
                setSettings(
                  (current) => ({
                    ...current,
                    state: value,
                  })
                )
              }
            />

            <Field
              label="Pincode"
              value={
                settings.pincode
              }
              onChange={(value) =>
                setSettings(
                  (current) => ({
                    ...current,
                    pincode:
                      cleanDigits(
                        value,
                        6
                      ),
                  })
                )
              }
            />
          </div>

          <div className="mt-5 rounded-2xl border border-sky-500/20 bg-sky-500/5 p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-sky-400">
                  Owner-only Delivery Coverage
                </p>
                <h4 className="mt-1 text-sm font-black text-white">
                  Map Delivery Radius
                </h4>
                <p className="mt-1 max-w-2xl text-[11px] leading-5 text-neutral-400">
                  Set the restaurant/store dispatch center and choose how many kilometres you will deliver. Customer orders outside this radius are blocked on the server. Managers and packers cannot change this setting.
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setSettings((current) => ({
                    ...current,
                    delivery_radius_enabled:
                      !current.delivery_radius_enabled,
                  }))
                }
                className={`shrink-0 rounded-xl px-4 py-2.5 text-[10px] font-black uppercase ${
                  settings.delivery_radius_enabled
                    ? 'bg-sky-500 text-white'
                    : 'bg-neutral-800 text-neutral-400'
                }`}
              >
                {settings.delivery_radius_enabled
                  ? 'Radius Limit On'
                  : 'Radius Limit Off'}
              </button>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[240px_1fr]">
              <div className="space-y-3">
                <Field
                  label="Delivery Radius (km)"
                  type="number"
                  value={settings.max_delivery_distance_km}
                  onChange={(value) =>
                    setSettings((current) => ({
                      ...current,
                      max_delivery_distance_km: value,
                    }))
                  }
                  placeholder="Example: 5"
                />

                <button
                  type="button"
                  onClick={chooseOwnerDeliveryCenter}
                  disabled={ownerLocationLoading}
                  className="w-full rounded-xl bg-sky-600 px-4 py-3 text-xs font-black text-white disabled:opacity-50"
                >
                  {ownerLocationLoading
                    ? 'Getting Store Location...'
                    : 'Use Current Store Location'}
                </button>

                {settings.delivery_origin_latitude &&
                  settings.delivery_origin_longitude && (
                    <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-[10px] leading-5 text-neutral-400">
                      <p className="font-black text-sky-300">
                        Store delivery center set
                      </p>
                      <p className="mt-1 font-mono">
                        {Number(settings.delivery_origin_latitude).toFixed(5)}, {Number(settings.delivery_origin_longitude).toFixed(5)}
                      </p>
                      {settings.delivery_origin_accuracy_m && (
                        <p>
                          GPS accuracy ±{Math.round(Number(settings.delivery_origin_accuracy_m))}m
                        </p>
                      )}
                    </div>
                  )}

                {ownerLocationError && (
                  <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-[10px] font-bold leading-5 text-red-300">
                    {ownerLocationError}
                  </div>
                )}
              </div>

              <div>
                <DeliveryLocationMap
                  latitude={settings.delivery_origin_latitude}
                  longitude={settings.delivery_origin_longitude}
                  referenceLatitude={settings.delivery_origin_latitude}
                  referenceLongitude={settings.delivery_origin_longitude}
                  radiusKm={settings.max_delivery_distance_km}
                  showRadius={
                    Boolean(settings.delivery_radius_enabled) &&
                    Number(settings.max_delivery_distance_km) > 0
                  }
                  onChange={({ latitude, longitude }) => {
                    setSettings((current) => ({
                      ...current,
                      delivery_origin_latitude: latitude,
                      delivery_origin_longitude: longitude,
                      delivery_origin_accuracy_m: '',
                    }))
                    setOwnerLocationError('')
                  }}
                  height={320}
                />
                <p className="mt-2 text-[10px] leading-4 text-neutral-500">
                  Tap the map or drag the pin to the exact restaurant/store dispatch point. The circle shows the configured delivery boundary.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4 sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.16em] text-emerald-400">
                  Owner-only Dispatch Automation
                </p>

                <h4 className="mt-1 text-sm font-black text-white">
                  Automatic Driver Assignment
                </h4>

                <p className="mt-1 max-w-2xl text-[11px] leading-5 text-neutral-400">
                  When enabled, Delivery orders wait until a complete batch is ready.
                  The oldest batch is assigned to one available driver automatically.
                  Cash-on-delivery orders qualify immediately; online-payment orders
                  qualify only after successful payment verification.
                </p>
              </div>

              <span className={`w-fit rounded-full px-3 py-1.5 text-[9px] font-black uppercase ${
                settings.auto_assign_enabled
                  ? 'bg-emerald-500/10 text-emerald-400'
                  : 'bg-neutral-800 text-neutral-400'
              }`}>
                {settings.auto_assign_enabled
                  ? 'Automation On'
                  : 'Automation Off'}
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_220px]">
              <Toggle
                label="Enable Auto Assignment"
                checked={Boolean(
                  settings.auto_assign_enabled
                )}
                onChange={(checked) =>
                  setSettings(
                    (current) => ({
                      ...current,
                      auto_assign_enabled:
                        checked,
                    })
                  )
                }
              />

              <label className="block">
                <span className="mb-1.5 block text-[10px] font-black uppercase text-neutral-500">
                  Orders Per Driver Batch
                </span>

                <input
                  type="number"
                  min="3"
                  max="20"
                  step="1"
                  value={
                    settings.auto_assign_min_orders
                  }
                  onChange={(event) =>
                    setSettings(
                      (current) => ({
                        ...current,
                        auto_assign_min_orders:
                          event.target.value,
                      })
                    )
                  }
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-xs text-white outline-none focus:border-emerald-500"
                />

                <p className="mt-1 text-[9px] leading-4 text-neutral-600">
                  Minimum allowed is 3 orders. Example: with 3 selected, the first
                  two eligible orders wait; when the third arrives, all three are
                  assigned together to one available driver.
                </p>
              </label>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                <p className="text-[9px] font-black uppercase text-neutral-500">
                  Eligible Unassigned Queue
                </p>
                <p className="mt-1 text-xl font-black text-white">
                  {orders.filter((order) =>
                    !order.driver_id &&
                    ['received', 'confirmed', 'preparing', 'packed'].includes(
                      String(order.order_status || '')
                    ) &&
                    (
                      order.payment_method === 'cod' ||
                      order.payment_status === 'paid'
                    )
                  ).length}
                </p>
              </div>

              <div className="rounded-xl border border-neutral-800 bg-neutral-950 p-3">
                <p className="text-[9px] font-black uppercase text-neutral-500">
                  Available Drivers
                </p>
                <p className="mt-1 text-xl font-black text-white">
                  {drivers.filter((driver) =>
                    driver.is_active !== false &&
                    driver.status !== 'offline' &&
                    !orders.some((order) =>
                      order.driver_id === driver.id &&
                      !['delivered', 'cancelled'].includes(
                        String(order.order_status || '')
                      )
                    )
                  ).length}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={
                runAutoAssignmentNow
              }
              disabled={
                runningAutoAssign ||
                !settings.auto_assign_enabled
              }
              className="mt-4 w-full rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-xs font-black text-emerald-300 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {runningAutoAssign
                ? 'Running Assignment...'
                : 'Run Auto Assignment Now'}
            </button>
          </div>

          <label className="mt-4 block">
            <span className="mb-1.5 block text-[10px] font-black uppercase text-neutral-500">
              Store Description
            </span>

            <textarea
              rows="4"
              value={
                settings.description
              }
              onChange={(event) =>
                setSettings(
                  (current) => ({
                    ...current,
                    description:
                      event.target.value,
                  })
                )
              }
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-xs text-white"
            />
          </label>

          <div className="mt-4">
            <Toggle
              label="Delivery Store Open"
              checked={Boolean(
                settings.is_open
              )}
              onChange={(checked) =>
                setSettings(
                  (current) => ({
                    ...current,
                    is_open: checked,
                  })
                )
              }
            />
          </div>

          <div className="mt-3">
            <Toggle
              label="GST Calculation"
              checked={Boolean(
                settings.tax_enabled
              )}
              onChange={(checked) =>
                setSettings(
                  (current) => ({
                    ...current,
                    tax_enabled:
                      checked,
                  })
                )
              }
            />
          </div>

          <div className="mt-5">
            <button
              type="submit"
              disabled={
                savingSettings
              }
              className="rounded-xl bg-emerald-600 px-5 py-3 text-xs font-black text-white disabled:opacity-50"
            >
              {savingSettings
                ? 'Saving...'
                : 'Save Delivery Settings'}
            </button>
          </div>
        </form>
      )}

      {tab === 'billing' && (
        <form
          onSubmit={
            saveBillSettings
          }
          className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5 sm:p-6"
        >
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-sky-400">
                Owner Billing Settings
              </p>

              <h3 className="mt-1 text-lg font-black text-white">
                Delivery Bill Identity
              </h3>

              <p className="mt-2 max-w-2xl text-xs leading-5 text-neutral-400">
                These settings are used for Delivery bills generated by the Owner
                and Manager portals. GSTIN and billing identity remain Owner-controlled.
              </p>
            </div>

            <span className="w-fit rounded-full bg-sky-500/10 px-3 py-1.5 text-[9px] font-black uppercase text-sky-300">
              Owner Only
            </span>
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <Field
              label="Billing Business Name"
              value={
                settings.bill_business_name ||
                settings.store_name ||
                restaurant?.name ||
                ''
              }
              onChange={(value) =>
                setSettings(
                  (current) => ({
                    ...current,
                    bill_business_name:
                      value,
                  })
                )
              }
              placeholder="Store / legal business name"
            />

            <Field
              label="GSTIN"
              value={
                settings.bill_gstin ||
                ''
              }
              onChange={(value) =>
                setSettings(
                  (current) => ({
                    ...current,
                    bill_gstin:
                      value
                        .toUpperCase()
                        .replace(/\s+/g, ''),
                  })
                )
              }
              placeholder="Optional 15-character GSTIN"
            />

            <Field
              label="Authorized Signature Name"
              value={
                settings.bill_signature_name ||
                ''
              }
              onChange={(value) =>
                setSettings(
                  (current) => ({
                    ...current,
                    bill_signature_name:
                      value,
                  })
                )
              }
              placeholder="Owner / authorized signatory"
            />

            <Field
              label="Bill Logo URL"
              value={
                settings.bill_logo_url ||
                ''
              }
              onChange={(value) =>
                setSettings(
                  (current) => ({
                    ...current,
                    bill_logo_url:
                      value,
                  })
                )
              }
              placeholder="Optional HTTPS image URL"
            />
          </div>

          <label className="mt-3 block">
            <span className="mb-1.5 block text-[10px] font-black uppercase text-neutral-500">
              Bill Footer
            </span>

            <textarea
              rows="3"
              value={
                settings.bill_footer ||
                ''
              }
              onChange={(event) =>
                setSettings(
                  (current) => ({
                    ...current,
                    bill_footer:
                      event.target.value,
                  })
                )
              }
              placeholder="Thank you for your order."
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-xs text-white outline-none focus:border-sky-500"
            />
          </label>

          <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-[10px] leading-5 text-neutral-500">
            Store address and support phone are taken from Delivery Settings.
            Item values, taxes, packing, handling, delivery fee, surge, payment
            and final total are read from the authoritative Delivery order snapshot.
          </div>

          <button
            type="submit"
            disabled={
              savingBillSettings
            }
            className="mt-5 rounded-xl bg-sky-600 px-5 py-3 text-xs font-black text-white disabled:opacity-50"
          >
            {savingBillSettings
              ? 'Saving Billing Settings...'
              : 'Save Billing Settings'}
          </button>
        </form>
      )}

      {tab === 'payments' && (
        <PaymentGatewayConfigCard
          restaurantId={restaurantId}
          module="delivery"
          title="Delivery Razorpay"
          description="These credentials are used only for online orders placed on the separate Delivery website. Cash on Delivery is controlled here too."
        />
      )}

      {tab === 'website' && (
        <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
          <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
              Delivery QR
            </p>

            {qrUrl ? (
              <div className="mt-4 rounded-2xl bg-white p-3">
                <img
                  src={qrUrl}
                  alt="Delivery ordering QR"
                  className="mx-auto block h-auto w-full max-w-[260px]"
                />
              </div>
            ) : (
              <p className="mt-4 text-xs text-neutral-500">
                Restaurant code is
                missing.
              </p>
            )}

            <button
              type="button"
              onClick={downloadQr}
              disabled={!qrUrl}
              className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white disabled:opacity-40"
            >
              Download QR
            </button>
          </div>

          <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5 sm:p-6">
            <p className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
              Public Delivery Ordering
            </p>

            <h3 className="mt-1 text-lg font-black text-white">
              Separate Delivery Website
            </h3>

            <p className="mt-2 text-xs leading-5 text-neutral-400">
              Customers browse the Delivery
              menu, add items, enter two
              mobile numbers and delivery
              address, choose COD or
              Razorpay, then track the
              order.
            </p>

            <div className="mt-5 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500">
                Delivery URL
              </p>

              <p className="mt-2 break-all font-mono text-xs text-white">
                {deliveryUrl ||
                  'Restaurant code not available'}
              </p>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={
                  copyDeliveryUrl
                }
                disabled={!deliveryUrl}
                className="rounded-xl border border-neutral-700 bg-neutral-800 px-5 py-3 text-xs font-black text-white disabled:opacity-40"
              >
                Copy Delivery URL
              </button>

              {deliveryUrl && (
                <a
                  href={deliveryUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-xl bg-emerald-600 px-5 py-3 text-xs font-black text-white"
                >
                  Open Delivery Website
                </a>
              )}<InstallAppButton
  label="Add App"
/>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}


function InventoryHistoryPanel({
  item,
  report,
  loading,
  error,
  onRefresh,
  onDownload,
  onClose,
}) {
  const history = Array.isArray(report?.history) ? report.history : []
  const summary = Array.isArray(report?.items) ? report.items[0] : null

  return (
    <section className="rounded-3xl border border-sky-500/20 bg-neutral-900 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-wider text-sky-300">
            Inventory Movement History
          </p>
          <h3 className="mt-1 truncate text-lg font-black text-white">
            {item?.name || summary?.name || 'Inventory Item'}
          </h3>
          <p className="mt-1 text-[10px] text-neutral-500">
            {report?.start_date || '—'} → {report?.end_date || '—'} · Asia/Kolkata
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={loading} onClick={onRefresh} className="rounded-xl border border-neutral-700 bg-neutral-800 px-3 py-2.5 text-[10px] font-black text-white disabled:opacity-50">
            {loading ? 'Loading...' : 'Refresh'}
          </button>
          <button type="button" onClick={onDownload} className="rounded-xl bg-emerald-600 px-3 py-2.5 text-[10px] font-black text-white">
            ↓ History CSV
          </button>
          <button type="button" onClick={onClose} className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-[10px] font-black text-neutral-300">
            Close
          </button>
        </div>
      </div>

      {summary && (
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <InventoryMetric label="Sold In Range" value={Number(summary.sold_in_range || 0)} />
          <InventoryMetric label="Restocked" value={Number(summary.restocked_in_range || 0)} />
          <InventoryMetric label="Released" value={Number(summary.released_in_range || 0)} />
          <InventoryMetric label="Movements" value={Number(summary.movements_in_range || 0)} />
        </div>
      )}

      {error && (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs font-bold text-red-300">
          {error}
        </div>
      )}

      {!error && loading && !history.length && (
        <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 py-10 text-center text-xs font-bold text-neutral-500">
          Loading inventory movement history...
        </div>
      )}

      {!loading && !error && !history.length && (
        <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 py-10 text-center text-xs text-neutral-500">
          No inventory movements were recorded for this item in the selected date range.
        </div>
      )}

      {history.length > 0 && (
        <div className="mt-4 space-y-2">
          {history.map((movement, index) => (
            <article key={movement.id || `${movement.created_at}-${index}`} className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full border px-2.5 py-1 text-[9px] font-black ${inventoryMovementTone(movement.movement_type)}`}>
                      {inventoryMovementLabel(movement.movement_type)}
                    </span>
                    <span className="text-[10px] font-black text-white">
                      Qty {Number(movement.quantity || 0)}
                    </span>
                  </div>

                  <p className="mt-2 text-[10px] text-neutral-500">
                    {orderTime(movement.created_at)}
                  </p>

                  {(movement.order_code || movement.order_number) && (
                    <p className="mt-1 text-[10px] font-bold text-sky-300">
                      Order {movement.order_code || `#${movement.order_number}`}
                    </p>
                  )}

                  {movement.notes && (
                    <p className="mt-2 text-xs leading-5 text-neutral-400">
                      {movement.notes}
                    </p>
                  )}

                  {movement.actor_name && (
                    <p className="mt-1 text-[9px] text-neutral-600">
                      By {movement.actor_name}
                    </p>
                  )}
                </div>

                <div className="grid shrink-0 grid-cols-2 gap-2 text-right">
                  <div className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2">
                    <p className="text-[8px] font-black uppercase text-neutral-600">Stock</p>
                    <p className="mt-1 text-[10px] font-black text-white">
                      {Number(movement.stock_before || 0)} → {Number(movement.stock_after || 0)}
                    </p>
                  </div>
                  <div className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2">
                    <p className="text-[8px] font-black uppercase text-neutral-600">Reserved</p>
                    <p className="mt-1 text-[10px] font-black text-white">
                      {Number(movement.reserved_before || 0)} → {Number(movement.reserved_after || 0)}
                    </p>
                  </div>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}

function Stat({
  title,
  value,
  accent = 'text-white',
}) {
  return (
    <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
      <p className="text-[10px] font-black uppercase tracking-wider text-neutral-500">
        {title}
      </p>

      <p
        className={`mt-2 text-2xl font-black ${accent}`}
      >
        {value}
      </p>
    </div>
  )
}

function SummaryRow({
  label,
  value,
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-neutral-800 pb-2 last:border-0 last:pb-0">
      <span className="text-neutral-500">
        {label}
      </span>

      <span className="font-black text-white">
        {value}
      </span>
    </div>
  )
}

function InventoryMetric({
  label,
  value,
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3 text-center">
      <p className="text-lg font-black text-white">
        {value}
      </p>

      <p className="mt-1 text-[8px] font-black uppercase tracking-wider text-neutral-600">
        {label}
      </p>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  placeholder = '',
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-black uppercase text-neutral-500">
        {label}
      </span>

      <input
        type={type}
        value={value ?? ''}
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
        placeholder={placeholder}
        className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-xs text-white outline-none focus:border-emerald-500"
      />
    </label>
  )
}

function SelectField({
  label,
  value,
  onChange,
  options,
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-black uppercase text-neutral-500">
        {label}
      </span>

      <select
        value={value}
        onChange={(event) =>
          onChange(
            event.target.value
          )
        }
        className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-xs text-white outline-none focus:border-emerald-500"
      >
        {options.map(
          ([optionValue, labelText]) => (
            <option
              key={optionValue}
              value={optionValue}
            >
              {labelText}
            </option>
          )
        )}
      </select>
    </label>
  )
}

function Toggle({
  label,
  checked,
  onChange,
}) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
      <span className="text-xs font-bold text-white">
        {label}
      </span>

      <input
        type="checkbox"
        checked={checked}
        onChange={(event) =>
          onChange(
            event.target.checked
          )
        }
        className="h-4 w-4 accent-emerald-500"
      />
    </label>
  )
}
