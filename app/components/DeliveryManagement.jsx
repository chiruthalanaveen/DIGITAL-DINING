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
import { useLiveDeliveryRefresh } from '@/lib/useLiveDeliveryRefresh'


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
}

const EMPTY_MENU = {
  id: '',
  name: '',
  category: 'Main Course',
  description: '',
  image_url: '',
  food_type: 'veg',
  delivery_price: '',
  delivery_offer_price: '',
  delivery_enabled: true,
  delivery_available: true,
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
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
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
  const [orderStatusFilter, setOrderStatusFilter] =
    useState('active')

  const [menuForm, setMenuForm] =
    useState(EMPTY_MENU)
  const [menuSaving, setMenuSaving] =
    useState(false)

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
                delivery_sort_order
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
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const todayOrders = orders.filter(
      (order) =>
        order.created_at &&
        new Date(order.created_at) >= today
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
    orderStatusFilter,
  ])

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
        const {
          data,
          error,
        } = await supabase
          .from('menu_items')
          .insert({
            restaurant_id:
              restaurantId,
            ...commonPayload,
            price: deliveryPrice,
            original_price: null,
            offer_price: null,
            reorder_mode: 'auto',
            addons: [],
            is_available: true,
          })
          .select('*')
          .single()

        if (error) throw error

        setMenuItems((current) => [
          data,
          ...current,
        ])
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
          <div className="grid gap-3 rounded-3xl border border-neutral-800 bg-neutral-900 p-4 sm:grid-cols-[1fr_auto]">
            <input
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Search order code, customer, mobile, city..."
              className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-xs text-white outline-none focus:border-emerald-500"
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
          </div>

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
              {deliveryOnly
                ? 'Delivery-only subscriptions manage their complete menu here.'
                : 'The item name/details are shared with Restaurant. Delivery price and availability remain separate.'}
            </p>

            <div className="mt-5 space-y-3">
              <Field
                label="Item Name"
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
              )}
            </div>
          </div>
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
