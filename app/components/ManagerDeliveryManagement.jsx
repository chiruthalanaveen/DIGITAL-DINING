'use client'







import {



  useCallback,



  useEffect,



  useMemo,



  useRef,



  useState,



} from 'react'



import { supabase } from '@/lib/supabase'

import { appConfirm, appNotice, appPrompt } from '@/lib/appDialog'
import { scanBarcodeWithCamera } from '@/lib/barcodeScanner'
import DeliveryManagerSupportChat from '@/app/components/DeliveryManagerSupportChat'









const ORDER_STATUSES = [



  'received',



  'confirmed',



  'preparing',



  'packed',



  'out_for_delivery',



  'delivered',



  'cancelled',



]







const EMPTY_OFFER = {



  title: '',



  description: '',



  discount_text: '',



  original_price: '',



  offer_price: '',



  offer_date: new Date().toLocaleDateString('en-CA'),



  image_url: '',



}

const EMPTY_CREATE_STORE_ITEM = {
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







function money(value) {



  return `₹${Number(value || 0).toLocaleString('en-IN', {



    maximumFractionDigits: 2,



  })}`



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
    const url = new URL(String(value || ''), window.location.origin)

    if (!['http:', 'https:'].includes(url.protocol)) {
      return ''
    }

    return url.href
  } catch {
    return ''
  }
}

function billItemQuantity(item) {
  const quantity = Number(item?.quantity ?? item?.qty ?? 1)
  return Number.isFinite(quantity) && quantity > 0 ? quantity : 1
}

function billItemPrice(item) {
  const quantity = billItemQuantity(item)
  const explicitPrice = Number(item?.price ?? item?.unit_price)

  if (Number.isFinite(explicitPrice)) {
    return explicitPrice
  }

  const lineTotal = Number(item?.line_total ?? item?.total)

  if (Number.isFinite(lineTotal) && quantity > 0) {
    return lineTotal / quantity
  }

  return 0
}

function billItemTotal(item) {
  const explicitTotal = Number(item?.line_total ?? item?.total)

  if (Number.isFinite(explicitTotal)) {
    return explicitTotal
  }

  return billItemPrice(item) * billItemQuantity(item)
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


function deliveryOrderItemId(item) {
  return String(
    item?.id ||
      item?.menu_item_id ||
      ''
  ).trim()
}

function deliveryOrderItemQuantity(item) {
  const quantity = Number(
    item?.quantity ??
      item?.qty ??
      1
  )

  return Number.isFinite(quantity) &&
    quantity > 0
    ? Math.floor(quantity)
    : 1
}

function afterSalesNeedsItems(type) {
  return [
    'return',
    'replacement',
    'return_refund',
    'failed_delivery',
  ].includes(
    String(type || '').toLowerCase()
  )
}

function afterSalesTypeLabel(value) {
  const type =
    String(value || '').toLowerCase()

  const labels = {
    return: 'Return',
    replacement: 'Replacement',
    refund: 'Refund Only',
    return_refund: 'Return + Refund',
    failed_delivery: 'Failed Delivery',
  }

  return (
    labels[type] ||
    labelStatus(type)
  )
}

function afterSalesStatusTone(value) {
  const status =
    String(value || '').toLowerCase()

  if (
    ['resolved', 'return_received'].includes(
      status
    )
  ) {
    return 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300'
  }

  if (
    ['rejected', 'cancelled'].includes(
      status
    )
  ) {
    return 'border-red-500/20 bg-red-500/10 text-red-300'
  }

  if (
    ['refund_pending', 'replacement_reserved'].includes(
      status
    )
  ) {
    return 'border-sky-500/20 bg-sky-500/10 text-sky-300'
  }

  return 'border-amber-500/20 bg-amber-500/10 text-amber-300'
}

function afterSalesIsClosed(value) {
  return [
    'resolved',
    'rejected',
    'cancelled',
  ].includes(
    String(value || '').toLowerCase()
  )
}

export default function ManagerDeliveryManagement({



  restaurantId,



  restaurantCode,



  sessionToken,



  sessionMode,



  userId,



  password,



  restaurant,



}) {



  const [tab, setTab] = useState('overview')



  const [loading, setLoading] = useState(true)



  const [refreshing, setRefreshing] = useState(false)







  const [settings, setSettings] = useState({})



  const [orders, setOrders] = useState([])



  const [menuItems, setMenuItems] = useState([])



  const [offers, setOffers] = useState([])



  const [drivers, setDrivers] = useState([])



  const [message, setMessage] = useState('')



  const [error, setError] = useState('')

  const [managerName, setManagerName] = useState('Manager')
  const [printingOrderId, setPrintingOrderId] = useState('')

  const [codReport, setCodReport] = useState(null)
  const [codLoading, setCodLoading] = useState(false)
  const [codError, setCodError] = useState('')
  const [codReviewId, setCodReviewId] = useState('')

  const [afterSalesReport, setAfterSalesReport] = useState(null)
  const [afterSalesLoading, setAfterSalesLoading] = useState(false)
  const [afterSalesError, setAfterSalesError] = useState('')
  const [afterSalesActionId, setAfterSalesActionId] = useState('')
  const [afterSalesRefundingId, setAfterSalesRefundingId] = useState('')
  const [afterSalesCreating, setAfterSalesCreating] = useState(false)
  const [afterSalesCreateOrderId, setAfterSalesCreateOrderId] = useState('')
  const [afterSalesCreateType, setAfterSalesCreateType] = useState('return')
  const [afterSalesCreateReason, setAfterSalesCreateReason] = useState('')
  const [afterSalesCreateItems, setAfterSalesCreateItems] = useState({})







  const [search, setSearch] = useState('')



  const [orderStatusFilter, setOrderStatusFilter] =



    useState('active')







  const [offerForm, setOfferForm] =



    useState(EMPTY_OFFER)



  const [offerSaving, setOfferSaving] =



    useState(false)







  const [editingMenuId, setEditingMenuId] =



    useState('')



  const [menuDraft, setMenuDraft] = useState({



    delivery_price: '',



    delivery_offer_price: '',



    delivery_enabled: true,



    delivery_available: true,



  })



  const [menuSaving, setMenuSaving] = useState(false)

  const [showCreateStoreItem, setShowCreateStoreItem] = useState(false)
  const [createStoreItemSaving, setCreateStoreItemSaving] = useState(false)
  const [createStoreItemDraft, setCreateStoreItemDraft] = useState({
    ...EMPTY_CREATE_STORE_ITEM,
  })

  const [inventorySearch, setInventorySearch] = useState('')
  const [inventoryFilter, setInventoryFilter] = useState('all')
  const [editingInventoryId, setEditingInventoryId] = useState('')
  const [inventorySaving, setInventorySaving] = useState(false)
  const [restockingId, setRestockingId] = useState('')
  const [inventoryDraft, setInventoryDraft] = useState({
    item_type: 'food', barcode: '', track_stock: false,
    stock_quantity: '0', low_stock_threshold: '5',
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








  const [alarmEnabled, setAlarmEnabled] = useState(false)



  const audioContextRef = useRef(null)



  const knownOrderIdsRef = useRef(new Set())



  const hasInitialSnapshotRef = useRef(false)







  const deliveryUrl =



    typeof window !== 'undefined' &&



    restaurant?.restaurant_code



      ? `${window.location.origin}/delivery/${restaurant.restaurant_code}`



      : restaurant?.restaurant_code



        ? `/delivery/${restaurant.restaurant_code}`



        : ''







  const getData = useCallback(async () => {



    if (!restaurantId) {



      throw new Error('Restaurant ID is missing.')



    }







    if (sessionMode && sessionToken) {



      return supabase.rpc(



        'get_manager_delivery_data_session',



        {



          p_session_token: sessionToken,



        }



      )



    }







    return supabase.rpc(



      'get_manager_delivery_data',



      {



        p_restaurant_id: String(restaurantId),



        p_restaurant_code: String(



          restaurantCode || ''



        ).trim(),



        p_user_id: String(userId || '')



          .trim()



          .toLowerCase(),



        p_password: String(password || ''),



      }



    )



  }, [



    restaurantId,



    restaurantCode,



    sessionToken,



    sessionMode,



    userId,



    password,



  ])







  const runAction = useCallback(



    async (action, payload = {}) => {



      if (!restaurantId) {



        throw new Error('Restaurant ID is missing.')



      }







      const result =



        sessionMode && sessionToken



          ? await supabase.rpc(



              'manager_delivery_action_session',



              {



                p_session_token: sessionToken,



                p_action: action,



                p_payload: payload,



              }



            )



          : await supabase.rpc(



              'manager_delivery_action',



              {



                p_restaurant_id: String(restaurantId),



                p_restaurant_code: String(



                  restaurantCode || ''



                ).trim(),



                p_user_id: String(userId || '')



                  .trim()



                  .toLowerCase(),



                p_password: String(password || ''),



                p_action: action,



                p_payload: payload,



              }



            )







      if (result.error) {



        throw result.error



      }







      if (!result.data?.success) {



        throw new Error(



          result.data?.message ||



            'Manager Delivery action failed.'



        )



      }







      return result.data



    },



    [



      restaurantId,



      restaurantCode,



      sessionToken,



      sessionMode,



      userId,



      password,



    ]



  )







  const playAlarm = useCallback(() => {



    if (!alarmEnabled) return







    try {



      const AudioContextClass =



        window.AudioContext ||



        window.webkitAudioContext







      if (!AudioContextClass) return







      if (!audioContextRef.current) {



        audioContextRef.current =



          new AudioContextClass()



      }







      const context = audioContextRef.current







      if (context.state === 'suspended') {



        context.resume()



      }







      const now = context.currentTime







      ;[0, 0.22, 0.44].forEach((offset) => {



        const oscillator =



          context.createOscillator()



        const gain = context.createGain()







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



        gain.connect(context.destination)







        oscillator.start(now + offset)



        oscillator.stop(now + offset + 0.16)



      })



    } catch (alarmError) {



      console.error(



        'Manager Delivery alarm error:',



        alarmError



      )



    }



  }, [alarmEnabled])







  const enableAlarm = async () => {



    try {



      const AudioContextClass =



        window.AudioContext ||



        window.webkitAudioContext







      if (AudioContextClass) {



        if (!audioContextRef.current) {



          audioContextRef.current =



            new AudioContextClass()



        }







        await audioContextRef.current.resume()



      }







      if (



        'Notification' in window &&



        Notification.permission === 'default'



      ) {



        await Notification.requestPermission()



      }







      setAlarmEnabled(true)



      setMessage(



        'New Delivery order alarm enabled for this Manager session.'



      )



    } catch (alarmError) {



      console.error(alarmError)



      setAlarmEnabled(true)



    }



  }







  const announceNewOrders = useCallback(



    (nextOrders) => {



      const nextIds = new Set(



        nextOrders.map((order) => order.id)



      )







      if (hasInitialSnapshotRef.current) {



        const newOrders = nextOrders.filter(



          (order) =>



            !knownOrderIdsRef.current.has(order.id) &&



            String(order.order_status) === 'received'



        )







        if (newOrders.length > 0) {



          playAlarm()







          setMessage(



            `${newOrders.length} new Delivery ${



              newOrders.length === 1



                ? 'order'



                : 'orders'



            } received.`



          )







          if (



            'Notification' in window &&



            Notification.permission === 'granted'



          ) {



            new Notification('New Delivery Order', {



              body:



                newOrders.length === 1



                  ? `${newOrders[0].order_code} · ${newOrders[0].customer_name}`



                  : `${newOrders.length} new Delivery orders`,



            })



          }



        }



      }







      knownOrderIdsRef.current = nextIds



      hasInitialSnapshotRef.current = true



    },



    [playAlarm]



  )







  const loadData = useCallback(



    async (quiet = false) => {



      if (quiet) {



        setRefreshing(true)



      } else {



        setLoading(true)



      }







      setError('')







      try {



        const { data, error: rpcError } =



          await getData()







        if (rpcError) throw rpcError







        if (!data?.success) {



          throw new Error(



            data?.message ||



              'Unable to load Manager Delivery data.'



          )



        }







        const nextOrders = Array.isArray(data.orders)



          ? data.orders



          : []







        announceNewOrders(nextOrders)







        setSettings(data.settings || {})

        setManagerName(
          String(data.managerName || 'Manager').trim() || 'Manager'
        )



        setOrders(nextOrders)



        setMenuItems(



          Array.isArray(data.menuItems)



            ? data.menuItems



            : []



        )



        setOffers(



          Array.isArray(data.offers)



            ? data.offers



            : []



        )



        setDrivers(



          Array.isArray(data.drivers)



            ? data.drivers



            : []



        )



      } catch (loadError) {



        console.error(



          'Manager Delivery load error:',



          loadError



        )







        setError(



          loadError?.message ||



            'Unable to load Delivery operations.'



        )



      } finally {



        setLoading(false)



        setRefreshing(false)



      }



    },



    [getData, announceNewOrders]



  )







  useEffect(() => {



    loadData()



  }, [loadData])







  useEffect(() => {



    const interval = window.setInterval(



      () => loadData(true),



      8000



    )







    return () => {



      window.clearInterval(interval)



    }



  }, [loadData])







  const stats = useMemo(() => {



    const today = new Date()



    today.setHours(0, 0, 0, 0)







    const todayOrders = orders.filter(



      (order) =>



        order.created_at &&



        new Date(order.created_at) >= today



    )







    const active = orders.filter(



      (order) =>



        !['delivered', 'cancelled'].includes(



          String(order.order_status || '')



        )



    )







    const revenue = todayOrders



      .filter(



        (order) =>



          String(order.order_status || '') !==



          'cancelled'



      )



      .reduce(



        (sum, order) =>



          sum + Number(order.total_amount || 0),



        0



      )







    return {



      today: todayOrders.length,



      active: active.length,



      revenue,



      availableDrivers: drivers.filter(



        (driver) =>



          driver.is_active !== false &&



          driver.status === 'available'



      ).length,



    }



  }, [orders, drivers])







  const filteredOrders = useMemo(() => {



    const term = search.trim().toLowerCase()







    return orders.filter((order) => {



      const status = String(



        order.order_status || ''



      ).toLowerCase()







      if (



        orderStatusFilter === 'active' &&



        ['delivered', 'cancelled'].includes(status)



      ) {



        return false



      }







      if (



        orderStatusFilter !== 'active' &&



        orderStatusFilter !== 'all' &&



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



          String(value || '').toLowerCase()



        )



        .some((value) => value.includes(term))



    })



  }, [orders, search, orderStatusFilter])







  const getManagerDeliveryBill = useCallback(
    async (orderId) => {
      if (!restaurantId) {
        throw new Error('Restaurant ID is missing.')
      }

      const result =
        sessionMode && sessionToken
          ? await supabase.rpc(
              'manager_delivery_get_bill_session',
              {
                p_session_token: sessionToken,
                p_order_id: orderId,
              }
            )
          : await supabase.rpc(
              'manager_delivery_get_bill',
              {
                p_restaurant_id: String(restaurantId),
                p_restaurant_code: String(
                  restaurantCode || ''
                ).trim(),
                p_user_id: String(userId || '')
                  .trim()
                  .toLowerCase(),
                p_password: String(password || ''),
                p_order_id: orderId,
              }
            )

      if (result.error) {
        throw result.error
      }

      if (!result.data?.success || !result.data?.bill) {
        throw new Error(
          result.data?.message ||
            'Unable to generate Delivery bill.'
        )
      }

      return result.data.bill
    },
    [
      restaurantId,
      restaurantCode,
      sessionToken,
      sessionMode,
      userId,
      password,
    ]
  )

  const generateDeliveryBill = async (order) => {
    if (!order?.id || printingOrderId) return

    const paymentMethod = String(
      order.payment_method || ''
    ).toLowerCase()

    const paymentStatus = String(
      order.payment_status || ''
    ).toLowerCase()

    const orderStatus = String(
      order.order_status || ''
    ).toLowerCase()

    if (orderStatus === 'cancelled') {
      appNotice('A cancelled order cannot generate an active Delivery bill.')
      return
    }

    if (
      paymentMethod === 'razorpay' &&
      paymentStatus !== 'paid'
    ) {
      appNotice('Online payment must be verified before generating the bill.')
      return
    }

    // Open synchronously from the click so popup blockers do not
    // block the printable bill after the secure RPC finishes.
    const printWindow = window.open(
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

    setPrintingOrderId(order.id)
    setError('')

    try {
      printWindow.document.open()
      printWindow.document.write(
        '<!doctype html><html><head><title>Preparing Delivery Bill...</title></head><body style="font-family:Arial,sans-serif;padding:24px">Preparing secure Delivery bill...</body></html>'
      )
      printWindow.document.close()

      const bill = await getManagerDeliveryBill(order.id)
      const billOrder = bill?.order || {}
      const business = bill?.business || {}
      const generatedBy = bill?.generated_by || {}

      const items = Array.isArray(billOrder.items)
        ? billOrder.items
        : []

      const customerAddress = [
        billOrder.address_line1,
        billOrder.address_line2,
        billOrder.landmark,
        billOrder.city,
        billOrder.state,
        billOrder.pincode,
      ]
        .filter(Boolean)
        .join(', ')

      const businessAddress = [
        business.address,
        business.city,
        business.state,
        business.pincode,
      ]
        .filter(Boolean)
        .join(', ')

      const itemRows = items
        .map((item) => {
          const quantity = billItemQuantity(item)
          const price = billItemPrice(item)
          const total = billItemTotal(item)

          return `
            <tr>
              <td>
                <strong>${escapeHtml(item?.name || 'Item')}</strong>
                ${item?.category ? `<div class="muted">${escapeHtml(item.category)}</div>` : ''}
              </td>
              <td class="num">${escapeHtml(quantity)}</td>
              <td class="num">${escapeHtml(money(price))}</td>
              <td class="num"><strong>${escapeHtml(money(total))}</strong></td>
            </tr>`
        })
        .join('')

      const amountRows = []

      const addAmountRow = (label, value, options = {}) => {
        const amount = Number(value || 0)
        const showZero = Boolean(options.showZero)

        if (!showZero && Math.abs(amount) < 0.005) {
          return
        }

        amountRows.push(`
          <div class="sum-row">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(
              `${options.negative ? '- ' : ''}${money(Math.abs(amount))}`
            )}</strong>
          </div>`)
      }

      addAmountRow('Subtotal', billOrder.subtotal, { showZero: true })
      addAmountRow('Discount', billOrder.discount_amount, { negative: true })

      const cgst = Number(billOrder.cgst_amount || 0)
      const sgst = Number(billOrder.sgst_amount || 0)
      const totalTax = Number(billOrder.tax_amount || 0)

      if (cgst > 0 || sgst > 0) {
        addAmountRow('CGST', cgst)
        addAmountRow('SGST', sgst)

        const remainingTax = Math.max(0, totalTax - cgst - sgst)
        addAmountRow('Other Tax', remainingTax)
      } else {
        addAmountRow('GST / Tax', totalTax)
      }

      addAmountRow('Packing Charge', billOrder.packing_fee)
      addAmountRow(
        'Handling Charge',
        billOrder.handling_fee ?? billOrder.handling_charge
      )
      addAmountRow('Delivery Fee', billOrder.delivery_fee)
      addAmountRow(
        'Surge Charge',
        billOrder.surge_fee ?? billOrder.surge_charge
      )

      const logoUrl = safePrintImageUrl(business.logo_url)
      const authorizedName =
        String(generatedBy?.name || managerName || 'Manager').trim() ||
        'Manager'

      const billDate = orderTime(
        billOrder.created_at || bill.generated_at
      )

      const paymentText = `${String(
        billOrder.payment_method || ''
      ).toUpperCase()} · ${labelStatus(billOrder.payment_status)}`

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
    .brand h1{margin:0;font-size:24px}.brand p,.meta p{margin:5px 0;color:#525252;font-size:12px;line-height:1.45}
    .invoice{text-align:right}.invoice h2{margin:0;font-size:20px}.pill{display:inline-block;margin-top:7px;padding:5px 9px;border-radius:999px;background:#ecfdf5;color:#047857;font-size:10px;font-weight:800;text-transform:uppercase}
    .section{margin-top:24px}.section h3{margin:0 0 10px;font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:#737373}
    .customer{display:grid;grid-template-columns:1fr 1fr;gap:14px}.card{border:1px solid #e5e7eb;border-radius:12px;padding:14px}.card p{margin:5px 0;font-size:12px;line-height:1.5}
    table{width:100%;border-collapse:collapse;margin-top:20px}th,td{padding:11px 8px;border-bottom:1px solid #e5e7eb;text-align:left;font-size:12px}th{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#737373}.num{text-align:right}.muted{margin-top:3px;color:#737373;font-size:10px}
    .summary{width:min(390px,100%);margin:22px 0 0 auto}.sum-row{display:flex;justify-content:space-between;gap:16px;padding:6px 0;font-size:12px}.total{display:flex;justify-content:space-between;gap:16px;border-top:2px solid #171717;margin-top:8px;padding-top:12px;font-size:18px}
    .foot{display:flex;justify-content:space-between;gap:20px;align-items:flex-end;margin-top:44px;border-top:1px solid #e5e7eb;padding-top:20px;color:#737373;font-size:10px}.signature{text-align:right;color:#171717;min-width:190px}.signature-line{border-top:1px solid #737373;margin-top:34px;padding-top:7px}
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
          Authorized Manager
        </div>
      </div>
    </div>
  </main>
</body>
</html>`)

      printWindow.document.close()
      printWindow.focus()

      window.setTimeout(() => {
        try {
          printWindow.print()
        } catch {
          // The printable bill stays open if automatic print is blocked.
        }
      }, 350)
    } catch (printError) {
      console.error('Delivery bill generation error:', printError)

      try {
        printWindow.close()
      } catch {
        // Ignore popup cleanup errors.
      }

      setError(
        printError?.message ||
          'Unable to generate Delivery bill.'
      )

      appNotice(
        printError?.message ||
          'Unable to generate Delivery bill.'
      )
    } finally {
      setPrintingOrderId('')
    }
  }

  const updateOrderStatus = async (



    order,



    status



  ) => {



    try {



      await runAction('update_order_status', {



        id: order.id,



        status,



      })







      await loadData(true)



    } catch (actionError) {



      appNotice(



        actionError?.message ||



          'Unable to update Delivery order.'



      )



    }



  }







  const assignDriver = async (



    order,



    driverId



  ) => {



    try {



      await runAction('assign_driver', {



        id: order.id,



        driver_id: driverId || '',



      })







      await loadData(true)



    } catch (actionError) {



      appNotice(



        actionError?.message ||



          'Unable to assign driver.'



      )



    }



  }







  const startMenuEdit = (item) => {



    setEditingMenuId(item.id)



    setMenuDraft({



      delivery_price:



        item.delivery_price ?? item.price ?? '',



      delivery_offer_price:



        item.delivery_offer_price ?? '',



      delivery_enabled:



        item.delivery_enabled !== false,



      delivery_available:



        item.delivery_available !== false,



    })



  }







  const saveMenuDelivery = async (item) => {



    if (menuSaving) return







    const deliveryPrice =



      menuDraft.delivery_price === ''



        ? ''



        : Number(menuDraft.delivery_price)







    const offerPrice =



      menuDraft.delivery_offer_price === ''



        ? ''



        : Number(menuDraft.delivery_offer_price)







    if (



      deliveryPrice !== '' &&



      (!Number.isFinite(deliveryPrice) ||



        deliveryPrice < 0)



    ) {



      appNotice('Enter a valid Delivery price.')



      return



    }







    if (



      offerPrice !== '' &&



      (!Number.isFinite(offerPrice) ||



        offerPrice < 0 ||



        (deliveryPrice !== '' &&



          offerPrice > deliveryPrice))



    ) {



      appNotice(



        'Delivery offer price must be valid and cannot exceed Delivery price.'



      )



      return



    }







    setMenuSaving(true)







    try {



      await runAction('update_menu_delivery', {



        id: item.id,



        delivery_price:



          deliveryPrice === ''



            ? ''



            : deliveryPrice,



        delivery_offer_price:



          offerPrice === '' ? '' : offerPrice,



        delivery_enabled:



          menuDraft.delivery_enabled,



        delivery_available:



          menuDraft.delivery_available,



      })







      setEditingMenuId('')



      await loadData(true)



    } catch (actionError) {



      appNotice(



        actionError?.message ||



          'Unable to update Delivery menu.'



      )



    } finally {



      setMenuSaving(false)



    }



  }





  const createManagerStoreItem = useCallback(
    async (payload) => {
      if (!restaurantId) {
        throw new Error('Restaurant ID is missing.')
      }

      const result =
        sessionMode && sessionToken
          ? await supabase.rpc(
              'manager_delivery_create_store_item_session',
              {
                p_session_token: sessionToken,
                p_payload: payload,
              }
            )
          : await supabase.rpc(
              'manager_delivery_create_store_item',
              {
                p_restaurant_id: String(restaurantId),
                p_restaurant_code: String(restaurantCode || '').trim(),
                p_user_id: String(userId || '').trim().toLowerCase(),
                p_password: String(password || ''),
                p_payload: payload,
              }
            )

      if (result.error) throw result.error

      if (!result.data?.success) {
        throw new Error(
          result.data?.message || 'Unable to add store item.'
        )
      }

      return result.data
    },
    [
      restaurantId,
      restaurantCode,
      sessionToken,
      sessionMode,
      userId,
      password,
    ]
  )

  const scanCreateStoreItemBarcode = async () => {
    const currentBarcode = String(
      createStoreItemDraft.barcode || ''
    ).trim()

    try {
      const barcode = await scanBarcodeWithCamera({
        title: 'Scan New Packaged Product',
      })

      setCreateStoreItemDraft((current) => ({
        ...current,
        barcode,
      }))

      setMessage(`Barcode scanned: ${barcode}`)
    } catch (scanError) {
      if (scanError?.code === 'SCAN_CANCELLED') return

      console.error('Store item barcode scan error:', scanError)

      const manual = await appPrompt(
        `${scanError?.message || 'Camera scanning failed.'}\n\nEnter barcode manually:`,
        currentBarcode
      )

      if (manual != null) {
        setCreateStoreItemDraft((current) => ({
          ...current,
          barcode: String(manual).trim(),
        }))
      }
    }
  }

  const saveCreateStoreItem = async (event) => {
    event.preventDefault()

    if (createStoreItemSaving) return

    const type = String(createStoreItemDraft.item_type || 'food')
    const name = String(createStoreItemDraft.name || '').trim()
    const price = Number(createStoreItemDraft.delivery_price)
    const offerPrice =
      createStoreItemDraft.delivery_offer_price === ''
        ? null
        : Number(createStoreItemDraft.delivery_offer_price)
    const barcode = String(createStoreItemDraft.barcode || '').trim()
    const openingStock = Number(createStoreItemDraft.opening_stock)
    const lowStockThreshold = Number(
      createStoreItemDraft.low_stock_threshold
    )

    if (name.length < 2 || !Number.isFinite(price) || price < 0) {
      appNotice('Enter a valid item name and Delivery price.')
      return
    }

    if (
      offerPrice !== null &&
      (!Number.isFinite(offerPrice) || offerPrice < 0 || offerPrice > price)
    ) {
      appNotice(
        'Delivery offer price must be valid and cannot exceed the Delivery price.'
      )
      return
    }

    if (type === 'packaged_product') {
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

    setCreateStoreItemSaving(true)
    setError('')

    try {
      const result = await createManagerStoreItem({
        item_type: type,
        name,
        category: String(createStoreItemDraft.category || '').trim() ||
          (type === 'packaged_product' ? 'Packaged Products' : 'Other'),
        description: String(createStoreItemDraft.description || '').trim(),
        image_url: String(createStoreItemDraft.image_url || '').trim(),
        food_type:
          type === 'packaged_product'
            ? 'other'
            : String(createStoreItemDraft.food_type || 'veg'),
        delivery_price: price,
        delivery_offer_price: offerPrice ?? '',
        delivery_enabled: Boolean(createStoreItemDraft.delivery_enabled),
        delivery_available: Boolean(createStoreItemDraft.delivery_available),
        barcode: type === 'packaged_product' ? barcode : '',
        opening_stock: type === 'packaged_product' ? openingStock : 0,
        low_stock_threshold:
          type === 'packaged_product' ? lowStockThreshold : 0,
      })

      setMessage(
        result?.message ||
          (type === 'packaged_product'
            ? 'Packaged product added with opening stock.'
            : 'Food item added successfully.')
      )

      setCreateStoreItemDraft({ ...EMPTY_CREATE_STORE_ITEM })
      setShowCreateStoreItem(false)

      await loadData(true)
      await loadInventoryReport(true)
    } catch (createError) {
      console.error('Manager add store item error:', createError)
      appNotice(createError?.message || 'Unable to add store item.')
    } finally {
      setCreateStoreItemSaving(false)
    }
  }


  const getManagerInventoryReport = useCallback(
    async (menuItemId = '') => {
      if (!restaurantId) {
        throw new Error('Restaurant ID is missing.')
      }

      const dateParams = {
        p_start_date: inventoryReportStartDate || null,
        p_end_date: inventoryReportEndDate || null,
        p_menu_item_id: menuItemId || null,
      }

      const result =
        sessionMode && sessionToken
          ? await supabase.rpc(
              'manager_delivery_get_inventory_report_session',
              {
                p_session_token: sessionToken,
                ...dateParams,
              }
            )
          : await supabase.rpc(
              'manager_delivery_get_inventory_report',
              {
                p_restaurant_id: String(restaurantId),
                p_restaurant_code: String(restaurantCode || '').trim(),
                p_user_id: String(userId || '').trim().toLowerCase(),
                p_password: String(password || ''),
                ...dateParams,
              }
            )

      if (result.error) throw result.error

      if (!result.data?.success) {
        throw new Error(
          result.data?.message || 'Unable to load inventory report.'
        )
      }

      return result.data
    },
    [
      restaurantId,
      restaurantCode,
      sessionToken,
      sessionMode,
      userId,
      password,
      inventoryReportStartDate,
      inventoryReportEndDate,
    ]
  )

  const loadInventoryReport = useCallback(
    async (quiet = false) => {
      if (!quiet) setInventoryReportLoading(true)
      setInventoryReportError('')

      try {
        const data = await getManagerInventoryReport('')
        setInventoryReport(data)
      } catch (reportError) {
        console.error('Manager inventory report error:', reportError)
        setInventoryReportError(
          reportError?.message || 'Unable to load inventory report.'
        )
      } finally {
        setInventoryReportLoading(false)
      }
    },
    [getManagerInventoryReport]
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
        const data = await getManagerInventoryReport(menuItemId)
        setInventoryHistoryReport(data)
      } catch (historyError) {
        console.error('Manager inventory history error:', historyError)
        setInventoryHistoryReport(null)
        setInventoryHistoryError(
          historyError?.message || 'Unable to load item inventory history.'
        )
      } finally {
        setInventoryHistoryLoading(false)
      }
    },
    [getManagerInventoryReport]
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
    const tracked = menuItems.filter((x) => x.track_stock === true)
    const available = (x) => Number(x.available_stock ?? Math.max(Number(x.stock_quantity || 0) - Number(x.reserved_quantity || 0), 0))
    return {
      tracked: tracked.length,
      packaged: menuItems.filter((x) => String(x.item_type || 'food') === 'packaged_product').length,
      low: tracked.filter((x) => available(x) > 0 && available(x) <= Number(x.low_stock_threshold ?? 5)).length,
      out: tracked.filter((x) => available(x) <= 0).length,
    }
  }, [menuItems])

  const filteredInventoryItems = useMemo(() => {
    const term = inventorySearch.trim().toLowerCase()
    return menuItems.filter((item) => {
      const type = String(item.item_type || 'food')
      const tracked = item.track_stock === true
      const available = Number(item.available_stock ?? Math.max(Number(item.stock_quantity || 0) - Number(item.reserved_quantity || 0), 0))
      const threshold = Number(item.low_stock_threshold ?? 5)
      if (inventoryFilter === 'food' && type !== 'food') return false
      if (inventoryFilter === 'packaged' && type !== 'packaged_product') return false
      if (inventoryFilter === 'tracked' && !tracked) return false
      if (inventoryFilter === 'low' && (!tracked || available <= 0 || available > threshold)) return false
      if (inventoryFilter === 'out' && (!tracked || available > 0)) return false
      if (!term) return true
      return [item.name, item.category, item.barcode].some((v) => String(v || '').toLowerCase().includes(term))
    })
  }, [menuItems, inventorySearch, inventoryFilter])

  const startInventoryEdit = (item) => {
    setEditingInventoryId(item.id)
    setInventoryDraft({
      item_type: String(item.item_type || 'food'),
      barcode: String(item.barcode || ''),
      track_stock: item.track_stock === true,
      stock_quantity: String(item.stock_quantity ?? 0),
      low_stock_threshold: String(item.low_stock_threshold ?? 5),
    })
  }

  const scanBarcode = async () => {
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

      console.error('Inventory barcode scan error:', scanError)

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

  const saveInventory = async (item) => {
    if (inventorySaving) return
    const type = String(inventoryDraft.item_type || 'food')
    const barcode = String(inventoryDraft.barcode || '').trim()
    const stock = Number(inventoryDraft.stock_quantity)
    const low = Number(inventoryDraft.low_stock_threshold)
    if (type === 'packaged_product' && !barcode) return appNotice('Scan or enter the packaged product barcode.')
    if (!Number.isInteger(stock) || stock < 0) return appNotice('Stock must be a whole number of 0 or more.')
    if (!Number.isInteger(low) || low < 0) return appNotice('Low-stock alert must be a whole number of 0 or more.')
    setInventorySaving(true)
    try {
      const result = await runAction('configure_inventory', {
        id: item.id, item_type: type, barcode: type === 'packaged_product' ? barcode : '',
        track_stock: inventoryDraft.track_stock, stock_quantity: stock, low_stock_threshold: low,
      })
      setEditingInventoryId(''); setMessage(result?.message || 'Inventory saved.'); await loadData(true); await loadInventoryReport(true); if (selectedInventoryHistoryId === item.id) await loadInventoryHistory(item.id)
    } catch (e) { appNotice(e?.message || 'Unable to save inventory.') }
    finally { setInventorySaving(false) }
  }

  const restockInventory = async (item) => {
    if (restockingId) return
    const raw = await appPrompt(`Add stock for ${item.name}:`, '1')
    if (raw == null) return
    const quantity = Number(String(raw).trim())
    if (!Number.isInteger(quantity) || quantity <= 0) return appNotice('Restock quantity must be a whole number greater than 0.')
    setRestockingId(item.id)
    try {
      const result = await runAction('restock_inventory', { id: item.id, quantity, notes: 'Manager inventory restock' })
      setMessage(result?.message || 'Stock added successfully.'); await loadData(true); await loadInventoryReport(true); if (selectedInventoryHistoryId === item.id) await loadInventoryHistory(item.id)
    } catch (e) { appNotice(e?.message || 'Unable to add stock.') }
    finally { setRestockingId('') }
  }

  const saveOffer = async (event) => {



    event.preventDefault()







    if (offerSaving) return







    setOfferSaving(true)







    try {



      await runAction('create_offer', {



        ...offerForm,



      })







      setOfferForm(EMPTY_OFFER)



      await loadData(true)



    } catch (actionError) {



      appNotice(



        actionError?.message ||



          'Unable to publish Delivery offer.'



      )



    } finally {



      setOfferSaving(false)



    }



  }







  const toggleOffer = async (offer) => {



    try {



      await runAction('toggle_offer', {



        id: offer.id,



        is_active: offer.is_active === false,



      })







      await loadData(true)



    } catch (actionError) {



      appNotice(



        actionError?.message ||



          'Unable to update Delivery offer.'



      )



    }



  }







  const deleteOffer = async (offer) => {



    if (



      !await appConfirm(



        `Delete "${offer.title}"?`



      )



    ) {



      return



    }







    try {



      await runAction('delete_offer', {



        id: offer.id,



      })







      await loadData(true)



    } catch (actionError) {



      appNotice(



        actionError?.message ||



          'Unable to delete Delivery offer.'



      )



    }



  }







  const toggleDriver = async (driver) => {



    try {



      await runAction('toggle_driver_active', {



        id: driver.id,



        is_active: driver.is_active === false,



      })







      await loadData(true)



    } catch (actionError) {



      appNotice(



        actionError?.message ||



          'Unable to update driver.'



      )



    }



  }







  const toggleStore = async () => {



    try {



      await runAction('toggle_store', {



        is_open: !settings.is_open,



      })







      await loadData(true)



    } catch (actionError) {



      appNotice(



        actionError?.message ||



          'Unable to update Delivery store.'



      )



    }



  }







  const copyDeliveryUrl = async () => {



    if (!deliveryUrl) return







    try {



      await navigator.clipboard.writeText(



        deliveryUrl



      )







      setMessage('Delivery website link copied.')



    } catch {



      await appPrompt(



        'Copy Delivery URL:',



        deliveryUrl



      )



    }



  }








  const getManagerCodReconciliation = useCallback(async () => {
    if (!restaurantId) {
      throw new Error('Restaurant ID is missing.')
    }

    const result =
      sessionMode && sessionToken
        ? await supabase.rpc(
            'manager_delivery_get_cod_reconciliation_session',
            { p_session_token: sessionToken }
          )
        : await supabase.rpc(
            'manager_delivery_get_cod_reconciliation',
            {
              p_restaurant_id: String(restaurantId),
              p_restaurant_code: String(restaurantCode || '').trim(),
              p_user_id: String(userId || '').trim().toLowerCase(),
              p_password: String(password || ''),
            }
          )

    if (result.error) throw result.error
    if (!result.data?.success) {
      throw new Error(
        result.data?.message || 'Unable to load COD reconciliation.'
      )
    }

    return result.data
  }, [
    restaurantId,
    restaurantCode,
    sessionMode,
    sessionToken,
    userId,
    password,
  ])

  const loadCodReconciliation = useCallback(
    async (quiet = false) => {
      if (!quiet) setCodLoading(true)
      setCodError('')

      try {
        const data = await getManagerCodReconciliation()
        setCodReport(data)
      } catch (codLoadError) {
        console.error('Manager COD reconciliation error:', codLoadError)
        setCodError(
          codLoadError?.message || 'Unable to load COD reconciliation.'
        )
      } finally {
        setCodLoading(false)
      }
    },
    [getManagerCodReconciliation]
  )

  const reviewCodSettlement = async (settlement, decision) => {
    if (!settlement?.id || codReviewId) return

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
      const result =
        sessionMode && sessionToken
          ? await supabase.rpc(
              'manager_delivery_review_cod_settlement_session',
              {
                p_session_token: sessionToken,
                p_settlement_id: settlement.id,
                p_decision: decisionLabel,
                p_review_note: String(reviewNote || '').trim(),
              }
            )
          : await supabase.rpc(
              'manager_delivery_review_cod_settlement',
              {
                p_restaurant_id: String(restaurantId),
                p_restaurant_code: String(restaurantCode || '').trim(),
                p_user_id: String(userId || '').trim().toLowerCase(),
                p_password: String(password || ''),
                p_settlement_id: settlement.id,
                p_decision: decisionLabel,
                p_review_note: String(reviewNote || '').trim(),
              }
            )

      if (result.error) throw result.error
      if (!result.data?.success) {
        throw new Error(result.data?.message || 'Unable to review COD handover.')
      }

      setMessage(
        result.data?.message ||
          `COD cash handover ${decisionLabel === 'approve' ? 'approved' : 'rejected'}.`
      )

      await loadCodReconciliation(true)
    } catch (reviewError) {
      console.error('Manager COD review error:', reviewError)
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


  const getManagerAfterSales = useCallback(
    async (caseId = '') => {
      if (!restaurantId) {
        throw new Error('Restaurant ID is missing.')
      }

      const result =
        sessionMode && sessionToken
          ? await supabase.rpc(
              'manager_delivery_get_after_sales_session',
              {
                p_session_token: sessionToken,
                p_case_id: caseId || null,
              }
            )
          : await supabase.rpc(
              'manager_delivery_get_after_sales',
              {
                p_restaurant_id: String(restaurantId),
                p_restaurant_code: String(restaurantCode || '').trim(),
                p_user_id: String(userId || '').trim().toLowerCase(),
                p_password: String(password || ''),
                p_case_id: caseId || null,
              }
            )

      if (result.error) throw result.error

      if (!result.data?.success) {
        throw new Error(
          result.data?.message || 'Unable to load after-sales cases.'
        )
      }

      return result.data
    },
    [
      restaurantId,
      restaurantCode,
      sessionMode,
      sessionToken,
      userId,
      password,
    ]
  )

  const loadAfterSales = useCallback(
    async (quiet = false) => {
      if (!quiet) setAfterSalesLoading(true)
      setAfterSalesError('')

      try {
        const data = await getManagerAfterSales('')
        setAfterSalesReport(data)
      } catch (loadError) {
        console.error('Manager after-sales load error:', loadError)
        setAfterSalesError(
          loadError?.message || 'Unable to load after-sales cases.'
        )
      } finally {
        setAfterSalesLoading(false)
      }
    },
    [getManagerAfterSales]
  )

  const resetAfterSalesCreate = useCallback(() => {
    setAfterSalesCreateOrderId('')
    setAfterSalesCreateType('return')
    setAfterSalesCreateReason('')
    setAfterSalesCreateItems({})
  }, [])

  const openAfterSalesCreate = useCallback((order) => {
    if (!order?.id) return

    const status = String(order.order_status || '').toLowerCase()
    const nextType =
      status === 'out_for_delivery'
        ? 'failed_delivery'
        : 'return'

    const quantities = {}

    for (const item of Array.isArray(order.items) ? order.items : []) {
      const id = deliveryOrderItemId(item)
      if (id) quantities[id] = '0'
    }

    setAfterSalesCreateOrderId(order.id)
    setAfterSalesCreateType(nextType)
    setAfterSalesCreateReason('')
    setAfterSalesCreateItems(quantities)
    setTab('after_sales')
  }, [])

  const submitManagerAfterSalesCase = async () => {
    if (!afterSalesCreateOrderId || afterSalesCreating) return

    const order = orders.find(
      (row) => String(row.id) === String(afterSalesCreateOrderId)
    )

    if (!order) {
      appNotice('The Delivery order is no longer available.')
      return
    }

    const reason = String(afterSalesCreateReason || '').trim()

    if (!reason) {
      appNotice('Enter the reason for this return / replacement / refund.')
      return
    }

    const items = []

    if (afterSalesNeedsItems(afterSalesCreateType)) {
      for (const item of Array.isArray(order.items) ? order.items : []) {
        const id = deliveryOrderItemId(item)
        if (!id) continue

        const orderedQty = deliveryOrderItemQuantity(item)
        const requested = Number(afterSalesCreateItems[id] || 0)

        if (!Number.isInteger(requested) || requested < 0 || requested > orderedQty) {
          appNotice(
            `Enter a valid quantity for ${item.name || 'the selected item'}.`
          )
          return
        }

        if (requested > 0) {
          items.push({
            id,
            quantity: requested,
          })
        }
      }

      if (!items.length) {
        appNotice('Select at least one item quantity.')
        return
      }
    }

    setAfterSalesCreating(true)
    setAfterSalesError('')

    try {
      const result =
        sessionMode && sessionToken
          ? await supabase.rpc(
              'manager_delivery_create_after_sales_case_session',
              {
                p_session_token: sessionToken,
                p_order_id: order.id,
                p_case_type: afterSalesCreateType,
                p_items: items,
                p_reason: reason,
              }
            )
          : await supabase.rpc(
              'manager_delivery_create_after_sales_case',
              {
                p_restaurant_id: String(restaurantId),
                p_restaurant_code: String(restaurantCode || '').trim(),
                p_user_id: String(userId || '').trim().toLowerCase(),
                p_password: String(password || ''),
                p_order_id: order.id,
                p_case_type: afterSalesCreateType,
                p_items: items,
                p_reason: reason,
              }
            )

      if (result.error) throw result.error
      if (!result.data?.success) {
        throw new Error(
          result.data?.message || 'Unable to create after-sales case.'
        )
      }

      setMessage(
        `After-sales case ${result.data?.case?.case_code || ''} created.`
      )
      resetAfterSalesCreate()
      await loadAfterSales(true)
      await loadData(true)
    } catch (createError) {
      console.error('Manager after-sales create error:', createError)
      setAfterSalesError(
        createError?.message || 'Unable to create after-sales case.'
      )
      appNotice(
        createError?.message || 'Unable to create after-sales case.'
      )
    } finally {
      setAfterSalesCreating(false)
    }
  }

  const callManagerAfterSalesAction = useCallback(
    async (caseId, action, payload = {}) => {
      const result =
        sessionMode && sessionToken
          ? await supabase.rpc(
              'manager_delivery_after_sales_action_session',
              {
                p_session_token: sessionToken,
                p_case_id: caseId,
                p_action: action,
                p_payload: payload,
              }
            )
          : await supabase.rpc(
              'manager_delivery_after_sales_action',
              {
                p_restaurant_id: String(restaurantId),
                p_restaurant_code: String(restaurantCode || '').trim(),
                p_user_id: String(userId || '').trim().toLowerCase(),
                p_password: String(password || ''),
                p_case_id: caseId,
                p_action: action,
                p_payload: payload,
              }
            )

      if (result.error) throw result.error

      if (!result.data?.success) {
        throw new Error(
          result.data?.message || 'After-sales action failed.'
        )
      }

      return result.data
    },
    [
      restaurantId,
      restaurantCode,
      sessionMode,
      sessionToken,
      userId,
      password,
    ]
  )

  const reviewManagerAfterSalesCase = async (caseRow, action) => {
    if (!caseRow?.id || afterSalesActionId) return

    let payload = {}
    const type = String(caseRow.case_type || '').toLowerCase()

    if (action === 'approve' && ['refund', 'return_refund'].includes(type)) {
      const defaultAmount =
        type === 'refund'
          ? String(caseRow.order?.total_amount || '')
          : ''

      const rawAmount = await appPrompt(
        'Approved refund amount (₹):',
        defaultAmount
      )

      if (rawAmount === null) return

      const refundAmount = Number(String(rawAmount).trim())

      if (!Number.isFinite(refundAmount) || refundAmount <= 0) {
        appNotice('Enter a refund amount greater than 0.')
        return
      }

      payload.refund_amount = refundAmount
    }

    if (action === 'reject') {
      const note = await appPrompt('Reason for rejecting this case:', '')
      if (note === null) return
      payload.note = String(note || '').trim()
    }

    if (action === 'cancel_case') {
      const note = await appPrompt('Optional cancellation note:', '')
      if (note === null) return

      const confirmed = await appConfirm(
        `Cancel after-sales case ${caseRow.case_code}?`,
        {
          title: 'Cancel After-Sales Case',
          confirmText: 'Cancel Case',
        }
      )

      if (!confirmed) return
      payload.note = String(note || '').trim()
    }

    if (action === 'reattempt_failed_delivery') {
      const note = await appPrompt(
        'Optional reattempt note:',
        'Return to Packed and reassign for another delivery attempt.'
      )

      if (note === null) return

      const confirmed = await appConfirm(
        `Move ${caseRow.order?.order_code || 'this order'} back to Packed for another delivery attempt?`,
        {
          title: 'Reattempt Delivery',
          confirmText: 'Reattempt',
        }
      )

      if (!confirmed) return
      payload.note = String(note || '').trim()
    }

    if (action === 'dispatch_replacement') {
      const note = await appPrompt(
        'Optional replacement dispatch note:',
        ''
      )

      if (note === null) return

      const confirmed = await appConfirm(
        `Dispatch the reserved replacement stock for ${caseRow.case_code}?`,
        {
          title: 'Dispatch Replacement',
          confirmText: 'Dispatch',
        }
      )

      if (!confirmed) return
      payload.note = String(note || '').trim()
    }

    if (action === 'receive_return') {
      const receivedItems = []

      for (const item of Array.isArray(caseRow.items) ? caseRow.items : []) {
        const remaining = Math.max(
          0,
          Number(item.approved_quantity || 0) -
            Number(item.returned_quantity || 0)
        )

        if (remaining <= 0) continue

        const rawQty = await appPrompt(
          `${item.item_name}: physically returned quantity (remaining approved ${remaining})`,
          String(remaining)
        )

        if (rawQty === null) return

        const quantity = Number(String(rawQty).trim())

        if (!Number.isInteger(quantity) || quantity < 0 || quantity > remaining) {
          appNotice(`Invalid returned quantity for ${item.item_name}.`)
          return
        }

        if (quantity === 0) continue

        const rawRestock = await appPrompt(
          `${item.item_name}: how many of the ${quantity} returned units are safe to put back into stock?`,
          String(quantity)
        )

        if (rawRestock === null) return

        const restockableQuantity = Number(String(rawRestock).trim())

        if (
          !Number.isInteger(restockableQuantity) ||
          restockableQuantity < 0 ||
          restockableQuantity > quantity
        ) {
          appNotice(`Invalid restockable quantity for ${item.item_name}.`)
          return
        }

        const rawCondition = await appPrompt(
          `${item.item_name}: condition (sealed, good, opened, damaged, spoiled, missing, other)`,
          restockableQuantity === quantity ? 'good' : 'damaged'
        )

        if (rawCondition === null) return

        const condition = String(rawCondition || '')
          .trim()
          .toLowerCase()

        const allowedConditions = [
          'sealed',
          'good',
          'opened',
          'damaged',
          'spoiled',
          'missing',
          'other',
        ]

        if (!allowedConditions.includes(condition)) {
          appNotice(`Invalid return condition for ${item.item_name}.`)
          return
        }

        receivedItems.push({
          id: item.menu_item_id,
          quantity,
          restockable_quantity: restockableQuantity,
          condition,
        })
      }

      if (!receivedItems.length) {
        appNotice('Enter at least one physically returned quantity.')
        return
      }

      const note = await appPrompt('Optional return receiving note:', '')
      if (note === null) return

      payload = {
        items: receivedItems,
        note: String(note || '').trim(),
      }
    }

    if (action === 'record_manual_refund') {
      const remaining = Math.max(
        0,
        Number(caseRow.refund_amount || 0) -
          Number(caseRow.refund_completed_amount || 0)
      )

      const rawAmount = await appPrompt(
        'Cash / manual refund amount (₹):',
        String(remaining)
      )

      if (rawAmount === null) return

      const amount = Number(String(rawAmount).trim())

      if (!Number.isFinite(amount) || amount <= 0 || amount > remaining) {
        appNotice('Enter a valid refund amount within the remaining balance.')
        return
      }

      const note = await appPrompt('Refund note / reference:', '')
      if (note === null) return

      payload = {
        amount,
        note: String(note || '').trim(),
      }
    }

    if (action === 'approve') {
      const confirmed = await appConfirm(
        `Approve after-sales case ${caseRow.case_code}?`,
        {
          title: 'Approve After-Sales Case',
          confirmText: 'Approve',
        }
      )

      if (!confirmed) return
    }

    setAfterSalesActionId(caseRow.id)
    setAfterSalesError('')

    try {
      const data = await callManagerAfterSalesAction(
        caseRow.id,
        action,
        payload
      )

      setMessage(
        data?.message ||
          `After-sales case updated: ${labelStatus(data?.status || action)}.`
      )

      await Promise.all([
        loadAfterSales(true),
        loadData(true),
        loadInventoryReport(true),
      ])
    } catch (actionError) {
      console.error('Manager after-sales action error:', actionError)
      setAfterSalesError(
        actionError?.message || 'Unable to update after-sales case.'
      )
      appNotice(
        actionError?.message || 'Unable to update after-sales case.'
      )
    } finally {
      setAfterSalesActionId('')
    }
  }

  const processManagerRazorpayRefund = async (caseRow) => {
    if (!caseRow?.id || afterSalesRefundingId) return

    const remaining = Math.max(
      0,
      Number(caseRow.refund_amount || 0) -
        Number(caseRow.refund_completed_amount || 0)
    )

    const confirmed = await appConfirm(
      caseRow.provider_refund_id
        ? `Check the current Razorpay refund status for ${caseRow.case_code}?`
        : `Refund ${money(remaining)} to the original Razorpay payment for ${caseRow.case_code}?`,
      {
        title: caseRow.provider_refund_id
          ? 'Check Razorpay Refund'
          : 'Process Razorpay Refund',
        confirmText: caseRow.provider_refund_id
          ? 'Check Status'
          : 'Refund',
      }
    )

    if (!confirmed) return

    setAfterSalesRefundingId(caseRow.id)
    setAfterSalesError('')

    try {
      const response = await fetch(
        '/api/delivery/after-sales/refund',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            actorType: 'manager',
            caseId: caseRow.id,
            restaurantId: String(restaurantId),
            restaurantCode: String(restaurantCode || '').trim(),
            sessionToken:
              sessionMode && sessionToken
                ? sessionToken
                : '',
            userId: String(userId || '').trim().toLowerCase(),
            password: String(password || ''),
          }),
        }
      )

      const data = await response.json().catch(() => ({}))

      if (!response.ok || !data?.success) {
        throw new Error(
          data?.message || 'Unable to process Razorpay refund.'
        )
      }

      setMessage(
        data?.message || 'Razorpay refund updated.'
      )

      await loadAfterSales(true)
    } catch (refundError) {
      console.error('Manager Razorpay refund error:', refundError)
      setAfterSalesError(
        refundError?.message || 'Unable to process Razorpay refund.'
      )
      appNotice(
        refundError?.message || 'Unable to process Razorpay refund.'
      )
    } finally {
      setAfterSalesRefundingId('')
    }
  }

  useEffect(() => {
    if (tab !== 'after_sales') return
    loadAfterSales(false)
  }, [tab, loadAfterSales])

  const tabs = [



    ['overview', 'Overview'],



    ['orders', `Orders (${orders.length})`],



    ['menu', `Delivery Menu (${menuItems.length})`],



    
    ['inventory', 'Inventory'],

    ['cod', `COD Cash (${Number(codReport?.summary?.pending_handover || 0) > 0 ? 'Pending' : 'Reconcile'})`],

    ['support', 'Live Support'],

    ['after_sales', `Returns / Refunds (${(Array.isArray(afterSalesReport?.cases) ? afterSalesReport.cases : []).filter((row) => !afterSalesIsClosed(row.status)).length})`],

['offers', `Offers (${offers.length})`],



    ['drivers', `Drivers (${drivers.length})`],



    ['website', 'Ordering Website'],



  ]







  if (loading) {



    return (



      <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-8 text-center">



        <p className="text-sm font-bold text-neutral-400">



          Loading Manager Delivery operations...



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



              Manager Delivery Operations



            </p>







            <h2 className="mt-1 text-2xl font-black text-white">



              {settings.store_name ||



                restaurant?.name ||



                'Delivery'}



            </h2>







            <p className="mt-2 max-w-2xl text-xs leading-5 text-neutral-400">



              Manage Delivery orders, drivers, menu availability



              and offers. Payment gateway, tax, subscription and



              Driver Portal credentials remain Owner-only.



            </p>



          </div>







          <div className="flex flex-wrap gap-2">



            <button



              type="button"



              onClick={



                alarmEnabled



                  ? () => setAlarmEnabled(false)



                  : enableAlarm



              }



              className={`rounded-xl px-4 py-3 text-[10px] font-black ${



                alarmEnabled



                  ? 'bg-emerald-600 text-white'



                  : 'border border-neutral-700 bg-neutral-950 text-neutral-300'



              }`}



            >



              {alarmEnabled



                ? '🔔 Order Alarm ON'



                : '🔕 Enable Order Alarm'}



            </button>







            <button



              type="button"



              onClick={() => loadData(true)}



              disabled={refreshing}



              className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-[10px] font-black text-neutral-300 disabled:opacity-50"



            >



              {refreshing ? 'Refreshing...' : '↻ Refresh'}



            </button>



          </div>



        </div>



      </div>







      {message && (



        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-xs font-bold text-emerald-300">



          {message}



        </div>



      )}







      {error && (



        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs font-bold text-red-300">



          {error}



        </div>



      )}







      <nav className="flex gap-2 overflow-x-auto border-b border-neutral-800 pb-3">



        {tabs.map(([id, label]) => (



          <button



            key={id}



            type="button"



            onClick={() => setTab(id)}



            className={`whitespace-nowrap rounded-xl border px-4 py-2.5 text-xs font-black ${



              tab === id



                ? 'border-emerald-500 bg-emerald-500 text-white'



                : 'border-neutral-800 bg-neutral-900 text-neutral-400'



            }`}



          >



            {label}



          </button>



        ))}



      </nav>







      {tab === 'overview' && (



        <div className="space-y-4">



          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">



            <Stat title="Orders Today" value={stats.today} />



            <Stat



              title="Active Orders"



              value={stats.active}



              accent="text-orange-400"



            />



            <Stat



              title="Today's Revenue"



              value={money(stats.revenue)}



              accent="text-emerald-400"



            />



            <Stat



              title="Available Drivers"



              value={stats.availableDrivers}



              accent="text-sky-400"



            />



          </div>







          <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">



            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">



              <div>



                <p className="text-[10px] font-black uppercase tracking-wider text-neutral-500">



                  Delivery Store



                </p>







                <p



                  className={`mt-1 text-lg font-black ${



                    settings.is_open



                      ? 'text-emerald-400'



                      : 'text-red-400'



                  }`}



                >



                  {settings.is_open ? 'OPEN' : 'CLOSED'}



                </p>







                <p className="mt-1 text-xs text-neutral-500">



                  Manager may open/close the Delivery store.



                  Charges, tax and payments remain Owner-only.



                </p>



              </div>







              <button



                type="button"



                onClick={toggleStore}



                className={`rounded-xl px-5 py-3 text-xs font-black text-white ${



                  settings.is_open



                    ? 'bg-red-600'



                    : 'bg-emerald-600'



                }`}



              >



                {settings.is_open



                  ? 'Close Delivery Store'



                  : 'Open Delivery Store'}



              </button>



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



                setSearch(event.target.value)



              }



              placeholder="Search order, customer, mobile, city..."



              className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-xs text-white outline-none focus:border-emerald-500"



            />







            <select



              value={orderStatusFilter}



              onChange={(event) =>



                setOrderStatusFilter(



                  event.target.value



                )



              }



              className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-xs font-bold text-white"



            >



              <option value="active">Active</option>



              <option value="all">All</option>



              {ORDER_STATUSES.map((status) => (



                <option key={status} value={status}>



                  {labelStatus(status)}



                </option>



              ))}



            </select>



          </div>







          <div className="space-y-3">



            {filteredOrders.map((order) => (



              <article



                key={order.id}



                className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5"



              >



                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">



                  <div>



                    <div className="flex flex-wrap gap-2">



                      <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] font-black text-emerald-400">



                        {order.order_code}



                      </span>







                      <span className="rounded-full bg-orange-500/10 px-2.5 py-1 text-[10px] font-black text-orange-400">



                        {labelStatus(order.order_status)}



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







                    <p className="mt-2 text-[10px] text-neutral-600">



                      {orderTime(order.created_at)}



                    </p>



                  </div>







                  <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">



                    <p className="text-[9px] font-black uppercase text-neutral-500">



                      Total



                    </p>



                    <p className="mt-1 text-xl font-black text-white">



                      {money(order.total_amount)}



                    </p>



                    <p className="mt-2 text-[10px] font-bold text-neutral-400">



                      {String(



                        order.payment_method || ''



                      ).toUpperCase()}



                      {' · '}



                      {labelStatus(order.payment_status)}



                    </p>



                  </div>



                </div>







                <div className="mt-4 grid gap-3 lg:grid-cols-2">



                  <label>



                    <span className="mb-1.5 block text-[10px] font-black uppercase text-neutral-500">



                      Status



                    </span>







                    <select



                      value={order.order_status}



                      onChange={(event) =>



                        updateOrderStatus(



                          order,



                          event.target.value



                        )



                      }



                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-xs font-bold text-white"



                    >



                      {ORDER_STATUSES.map((status) => (



                        <option key={status} value={status}>



                          {labelStatus(status)}



                        </option>



                      ))}



                    </select>



                  </label>







                  <label>



                    <span className="mb-1.5 block text-[10px] font-black uppercase text-neutral-500">



                      Driver



                    </span>







                    <select



                      value={order.driver_id || ''}



                      onChange={(event) =>



                        assignDriver(



                          order,



                          event.target.value



                        )



                      }



                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-xs font-bold text-white"



                    >



                      <option value="">Unassigned</option>



                      {drivers



                        .filter(



                          (driver) =>



                            driver.is_active !== false



                        )



                        .map((driver) => (



                          <option



                            key={driver.id}



                            value={driver.id}



                          >



                            {driver.name} · {driver.status}



                          </option>



                        ))}



                    </select>



                  </label>



                </div>

                <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-neutral-500">
                      Customer Bill
                    </p>
                    <p className="mt-1 text-[10px] leading-4 text-neutral-600">
                      Uses the secure server-side order snapshot and your authenticated Manager identity.
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
                    onClick={() => generateDeliveryBill(order)}
                    className="shrink-0 rounded-xl bg-sky-600 px-5 py-3 text-xs font-black text-white disabled:cursor-not-allowed disabled:bg-neutral-800 disabled:text-neutral-500"
                  >
                    {printingOrderId === order.id
                      ? 'Generating Bill...'
                      : '🧾 Generate / Print Bill'}
                  </button>
                </div>

                {['delivered', 'out_for_delivery'].includes(
                  String(order.order_status || '').toLowerCase()
                ) && (
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={() => openAfterSalesCreate(order)}
                      className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-3 text-[10px] font-black text-violet-300"
                    >
                      {String(order.order_status || '').toLowerCase() === 'out_for_delivery'
                        ? '⚠ Failed Delivery / Reattempt'
                        : '↩ Return / Replace / Refund'}
                    </button>
                  </div>
                )}

              </article>



            ))}







            {!filteredOrders.length && (



              <div className="rounded-3xl border border-neutral-800 bg-neutral-900 py-14 text-center text-sm text-neutral-500">



                No matching Delivery orders.



              </div>



            )}



          </div>



        </div>



      )}







      {tab === 'support' && (
        <DeliveryManagerSupportChat
          restaurantId={restaurantId}
          restaurantCode={restaurantCode}
          sessionToken={sessionToken}
          sessionMode={sessionMode}
          userId={userId}
          password={password}
          drivers={drivers}
          onOpenAfterSales={() =>
            setTab('after_sales')
          }
        />
      )}

      {tab === 'after_sales' && (
        <AfterSalesWorkspace
          report={afterSalesReport}
          loading={afterSalesLoading}
          error={afterSalesError}
          onRefresh={() => loadAfterSales(false)}
          orders={orders}
          createOrderId={afterSalesCreateOrderId}
          createType={afterSalesCreateType}
          setCreateType={setAfterSalesCreateType}
          createReason={afterSalesCreateReason}
          setCreateReason={setAfterSalesCreateReason}
          createItems={afterSalesCreateItems}
          setCreateItems={setAfterSalesCreateItems}
          onSubmitCreate={submitManagerAfterSalesCase}
          onCancelCreate={resetAfterSalesCreate}
          creating={afterSalesCreating}
          actionId={afterSalesActionId}
          onAction={reviewManagerAfterSalesCase}
          refundingId={afterSalesRefundingId}
          onRazorpayRefund={processManagerRazorpayRefund}
        />
      )}

      {tab === 'menu' && (
        <div className="space-y-4">
          <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5 sm:p-6">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <p className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
                  Store Catalogue
                </p>
                <h3 className="mt-1 text-xl font-black text-white">
                  Add Food Items & Packaged Products
                </h3>
                <p className="mt-2 max-w-2xl text-xs leading-5 text-neutral-400">
                  Food items can be added normally. For packaged products, scan the barcode and enter the opening stock. Opening stock is recorded through the same atomic inventory engine used by Restock.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowCreateStoreItem((current) => !current)}
                className="shrink-0 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white"
              >
                {showCreateStoreItem ? 'Close Add Item' : '＋ Add Food / Product'}
              </button>
            </div>

            {showCreateStoreItem && (
              <form onSubmit={saveCreateStoreItem} className="mt-5 space-y-4">
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setCreateStoreItemDraft((current) => ({
                        ...current,
                        item_type: 'food',
                        barcode: '',
                        opening_stock: '0',
                        low_stock_threshold: '5',
                        food_type:
                          current.food_type === 'other' ? 'veg' : current.food_type,
                      }))
                    }
                    className={`rounded-xl border px-4 py-3 text-xs font-black ${
                      createStoreItemDraft.item_type === 'food'
                        ? 'border-orange-500 bg-orange-500/10 text-orange-300'
                        : 'border-neutral-800 bg-neutral-950 text-neutral-400'
                    }`}
                  >
                    🍔 Food Item
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setCreateStoreItemDraft((current) => ({
                        ...current,
                        item_type: 'packaged_product',
                        food_type: 'other',
                        category:
                          current.category === 'Main Course'
                            ? 'Packaged Products'
                            : current.category,
                      }))
                    }
                    className={`rounded-xl border px-4 py-3 text-xs font-black ${
                      createStoreItemDraft.item_type === 'packaged_product'
                        ? 'border-sky-500 bg-sky-500/10 text-sky-300'
                        : 'border-neutral-800 bg-neutral-950 text-neutral-400'
                    }`}
                  >
                    📦 Packaged Product
                  </button>
                </div>

                {createStoreItemDraft.item_type === 'packaged_product' && (
                  <div className="rounded-2xl border border-sky-500/20 bg-sky-500/10 p-4">
                    <p className="text-[10px] font-black uppercase tracking-wider text-sky-300">
                      Scan Product First
                    </p>
                    <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_auto]">
                      <Field
                        label="Product Barcode"
                        value={createStoreItemDraft.barcode}
                        onChange={(value) =>
                          setCreateStoreItemDraft((current) => ({
                            ...current,
                            barcode: value,
                          }))
                        }
                        placeholder="Scan or enter barcode"
                      />
                      <button
                        type="button"
                        onClick={scanCreateStoreItemBarcode}
                        className="self-end rounded-xl bg-sky-600 px-5 py-3 text-xs font-black text-white"
                      >
                        📷 Scan Barcode
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid gap-3 md:grid-cols-2">
                  <Field
                    label={
                      createStoreItemDraft.item_type === 'packaged_product'
                        ? 'Product Name'
                        : 'Food Item Name'
                    }
                    value={createStoreItemDraft.name}
                    onChange={(value) =>
                      setCreateStoreItemDraft((current) => ({
                        ...current,
                        name: value,
                      }))
                    }
                    placeholder={
                      createStoreItemDraft.item_type === 'packaged_product'
                        ? 'Example: Coca-Cola 750ml'
                        : 'Example: Chicken Biryani'
                    }
                  />

                  <Field
                    label="Category"
                    value={createStoreItemDraft.category}
                    onChange={(value) =>
                      setCreateStoreItemDraft((current) => ({
                        ...current,
                        category: value,
                      }))
                    }
                  />
                </div>

                {createStoreItemDraft.item_type === 'food' && (
                  <label className="block">
                    <span className="mb-1.5 block text-[10px] font-black uppercase text-neutral-500">
                      Food Type
                    </span>
                    <select
                      value={createStoreItemDraft.food_type}
                      onChange={(event) =>
                        setCreateStoreItemDraft((current) => ({
                          ...current,
                          food_type: event.target.value,
                        }))
                      }
                      className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-xs font-bold text-white outline-none focus:border-emerald-500"
                    >
                      <option value="veg">Vegetarian</option>
                      <option value="non-veg">Non-Vegetarian</option>
                      <option value="egg">Egg</option>
                      <option value="beverage">Beverage</option>
                      <option value="other">Other</option>
                    </select>
                  </label>
                )}

                <div className="grid gap-3 sm:grid-cols-2">
                  <Field
                    label="Delivery Price"
                    type="number"
                    value={createStoreItemDraft.delivery_price}
                    onChange={(value) =>
                      setCreateStoreItemDraft((current) => ({
                        ...current,
                        delivery_price: value,
                      }))
                    }
                    placeholder="0"
                  />

                  <Field
                    label="Delivery Offer Price"
                    type="number"
                    value={createStoreItemDraft.delivery_offer_price}
                    onChange={(value) =>
                      setCreateStoreItemDraft((current) => ({
                        ...current,
                        delivery_offer_price: value,
                      }))
                    }
                    placeholder="Optional"
                  />
                </div>

                {createStoreItemDraft.item_type === 'packaged_product' && (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field
                      label="Opening Stock"
                      type="number"
                      value={createStoreItemDraft.opening_stock}
                      onChange={(value) =>
                        setCreateStoreItemDraft((current) => ({
                          ...current,
                          opening_stock: value,
                        }))
                      }
                      placeholder="0"
                    />

                    <Field
                      label="Low Stock Alert"
                      type="number"
                      value={createStoreItemDraft.low_stock_threshold}
                      onChange={(value) =>
                        setCreateStoreItemDraft((current) => ({
                          ...current,
                          low_stock_threshold: value,
                        }))
                      }
                      placeholder="5"
                    />
                  </div>
                )}

                <Field
                  label="Image URL"
                  value={createStoreItemDraft.image_url}
                  onChange={(value) =>
                    setCreateStoreItemDraft((current) => ({
                      ...current,
                      image_url: value,
                    }))
                  }
                  placeholder="Optional https://..."
                />

                <label className="block">
                  <span className="mb-1.5 block text-[10px] font-black uppercase text-neutral-500">
                    Description
                  </span>
                  <textarea
                    rows="3"
                    value={createStoreItemDraft.description}
                    onChange={(event) =>
                      setCreateStoreItemDraft((current) => ({
                        ...current,
                        description: event.target.value,
                      }))
                    }
                    className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-xs text-white outline-none focus:border-emerald-500"
                  />
                </label>

                <div className="grid gap-3 sm:grid-cols-2">
                  <Toggle
                    label="Show on Delivery Website"
                    checked={createStoreItemDraft.delivery_enabled}
                    onChange={(checked) =>
                      setCreateStoreItemDraft((current) => ({
                        ...current,
                        delivery_enabled: checked,
                      }))
                    }
                  />
                  <Toggle
                    label="Available for Delivery"
                    checked={createStoreItemDraft.delivery_available}
                    onChange={(checked) =>
                      setCreateStoreItemDraft((current) => ({
                        ...current,
                        delivery_available: checked,
                      }))
                    }
                  />
                </div>

                <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4 text-[10px] leading-5 text-neutral-400">
                  {createStoreItemDraft.item_type === 'packaged_product'
                    ? 'Packaged products automatically enable stock tracking. Opening stock is added through the atomic inventory restock action and the barcode is checked for duplicates in this store.'
                    : 'Food items are created without barcode stock tracking, so the Packer barcode gate will not block normal prepared food.'}
                </div>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={createStoreItemSaving}
                    className="flex-1 rounded-xl bg-emerald-600 px-5 py-3 text-xs font-black text-white disabled:opacity-50"
                  >
                    {createStoreItemSaving
                      ? 'Adding Item...'
                      : createStoreItemDraft.item_type === 'packaged_product'
                        ? 'Add Product + Opening Stock'
                        : 'Add Food Item'}
                  </button>

                  <button
                    type="button"
                    disabled={createStoreItemSaving}
                    onClick={() => {
                      setCreateStoreItemDraft({ ...EMPTY_CREATE_STORE_ITEM })
                      setShowCreateStoreItem(false)
                    }}
                    className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3 text-xs font-black text-white disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </section>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">



          {menuItems.map((item) => {



            const editing =



              editingMenuId === item.id







            return (



              <article



                key={item.id}



                className="rounded-3xl border border-neutral-800 bg-neutral-900 p-4"



              >



                <h3 className="font-black text-white">



                  {item.name}



                </h3>







                <p className="mt-1 text-[10px] text-neutral-500">



                  {item.category || 'Other'}



                </p>







                {!editing ? (



                  <>



                    <p className="mt-4 text-lg font-black text-emerald-400">



                      {money(



                        item.delivery_offer_price ??



                          item.delivery_price ??



                          item.offer_price ??



                          item.price



                      )}



                    </p>







                    <div className="mt-3 flex flex-wrap gap-2 text-[10px] font-black">



                      <span



                        className={`rounded-full px-2.5 py-1 ${



                          item.delivery_enabled !== false



                            ? 'bg-sky-500/10 text-sky-400'



                            : 'bg-neutral-800 text-neutral-500'



                        }`}



                      >



                        {item.delivery_enabled !== false



                          ? 'Visible'



                          : 'Hidden'}



                      </span>







                      <span



                        className={`rounded-full px-2.5 py-1 ${



                          item.delivery_available !== false



                            ? 'bg-emerald-500/10 text-emerald-400'



                            : 'bg-red-500/10 text-red-400'



                        }`}



                      >



                        {item.delivery_available !== false



                          ? 'Available'



                          : 'Unavailable'}



                      </span>



                    </div>







                    <button



                      type="button"



                      onClick={() => startMenuEdit(item)}



                      className="mt-4 w-full rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3 text-xs font-black text-white"



                    >



                      Edit Delivery Settings



                    </button>



                  </>



                ) : (



                  <div className="mt-4 space-y-3">



                    <Field



                      label="Delivery Price"



                      type="number"



                      value={menuDraft.delivery_price}



                      onChange={(value) =>



                        setMenuDraft((current) => ({



                          ...current,



                          delivery_price: value,



                        }))



                      }



                    />







                    <Field



                      label="Delivery Offer Price"



                      type="number"



                      value={



                        menuDraft.delivery_offer_price



                      }



                      onChange={(value) =>



                        setMenuDraft((current) => ({



                          ...current,



                          delivery_offer_price: value,



                        }))



                      }



                    />







                    <Toggle



                      label="Visible on Delivery"



                      checked={



                        menuDraft.delivery_enabled



                      }



                      onChange={(checked) =>



                        setMenuDraft((current) => ({



                          ...current,



                          delivery_enabled: checked,



                        }))



                      }



                    />







                    <Toggle



                      label="Available for Delivery"



                      checked={



                        menuDraft.delivery_available



                      }



                      onChange={(checked) =>



                        setMenuDraft((current) => ({



                          ...current,



                          delivery_available: checked,



                        }))



                      }



                    />







                    <div className="flex gap-2">



                      <button



                        type="button"



                        disabled={menuSaving}



                        onClick={() =>



                          saveMenuDelivery(item)



                        }



                        className="flex-1 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white disabled:opacity-50"



                      >



                        {menuSaving



                          ? 'Saving...'



                          : 'Save'}



                      </button>







                      <button



                        type="button"



                        onClick={() =>



                          setEditingMenuId('')



                        }



                        className="rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-3 text-xs font-black text-white"



                      >



                        Cancel



                      </button>



                    </div>



                  </div>



                )}



              </article>



            )



          })}







          {!menuItems.length && (



            <div className="col-span-full rounded-3xl border border-neutral-800 bg-neutral-900 py-14 text-center text-sm text-neutral-500">



              No Delivery menu items.



            </div>



          )}



          </div>
        </div>



      )}







      {tab === 'inventory' && (
        <div className="space-y-4">
          <div className="rounded-3xl border border-sky-500/20 bg-sky-500/10 p-5">
            <p className="text-[10px] font-black uppercase tracking-wider text-sky-300">
              Inventory Operations & History
            </p>
            <h3 className="mt-1 text-lg font-black text-white">
              Live Stock, Daily Sales & Movement Ledger
            </h3>
            <p className="mt-2 text-xs leading-5 text-neutral-400">
              Stock changes still use the same atomic inventory engine. This report reads the movement ledger for sales, restocks, releases and adjustments.
            </p>
            <button
              type="button"
              onClick={() => {
                setTab('menu')
                setShowCreateStoreItem(true)
              }}
              className="mt-4 rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white"
            >
              ＋ Add Food / Scan Product
            </button>
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
                          <button type="button" onClick={scanBarcode} className="self-end rounded-xl bg-sky-600 px-4 py-3 text-xs font-black text-white">
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



              Add Delivery Offer



            </h3>







            <div className="mt-4 space-y-3">



              <Field



                label="Title"



                value={offerForm.title}



                onChange={(value) =>



                  setOfferForm((current) => ({



                    ...current,



                    title: value,



                  }))



                }



              />







              <Field



                label="Discount Text"



                value={offerForm.discount_text}



                onChange={(value) =>



                  setOfferForm((current) => ({



                    ...current,



                    discount_text: value,



                  }))



                }



                placeholder="20% OFF"



              />







              <Field



                label="Original Price"



                type="number"



                value={offerForm.original_price}



                onChange={(value) =>



                  setOfferForm((current) => ({



                    ...current,



                    original_price: value,



                  }))



                }



              />







              <Field



                label="Offer Price"



                type="number"



                value={offerForm.offer_price}



                onChange={(value) =>



                  setOfferForm((current) => ({



                    ...current,



                    offer_price: value,



                  }))



                }



              />







              <Field



                label="Offer Date"



                type="date"



                value={offerForm.offer_date}



                onChange={(value) =>



                  setOfferForm((current) => ({



                    ...current,



                    offer_date: value,



                  }))



                }



              />







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



            {offers.map((offer) => (



              <article



                key={offer.id}



                className="rounded-3xl border border-neutral-800 bg-neutral-900 p-4"



              >



                <div className="flex items-start justify-between gap-4">



                  <div>



                    <p className="text-[10px] font-black uppercase text-orange-400">



                      {offer.discount_text || 'Offer'}



                    </p>







                    <h3 className="mt-1 font-black text-white">



                      {offer.title}



                    </h3>







                    <p className="mt-2 text-xs font-bold text-neutral-300">



                      {money(offer.offer_price)}



                    </p>



                  </div>







                  <div className="flex gap-2">



                    <button



                      type="button"



                      onClick={() => toggleOffer(offer)}



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



                      onClick={() => deleteOffer(offer)}



                      className="rounded-lg bg-red-500/10 px-3 py-2 text-[10px] font-black text-red-400"



                    >



                      Delete



                    </button>



                  </div>



                </div>



              </article>



            ))}







            {!offers.length && (



              <div className="rounded-3xl border border-neutral-800 bg-neutral-900 py-14 text-center text-sm text-neutral-500">



                No Delivery offers.



              </div>



            )}



          </div>



        </div>



      )}







      {tab === 'drivers' && (



        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">



          {drivers.map((driver) => (



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







                  <p className="mt-2 text-[10px] text-neutral-500">



                    {driver.vehicle_type}



                    {driver.vehicle_number



                      ? ` · ${driver.vehicle_number}`



                      : ''}



                  </p>



                </div>







                <span



                  className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${



                    driver.status === 'available'



                      ? 'bg-emerald-500/10 text-emerald-400'



                      : driver.status === 'busy'



                        ? 'bg-orange-500/10 text-orange-400'



                        : 'bg-neutral-800 text-neutral-500'



                  }`}



                >



                  {driver.status}



                </span>



              </div>







              <button



                type="button"



                onClick={() => toggleDriver(driver)}



                className={`mt-4 w-full rounded-xl px-4 py-3 text-xs font-black ${



                  driver.is_active === false



                    ? 'bg-emerald-600 text-white'



                    : 'border border-red-500/20 bg-red-500/10 text-red-400'



                }`}



              >



                {driver.is_active === false



                  ? 'Reactivate Driver'



                  : 'Set Driver Offline'}



              </button>







              <p className="mt-3 text-[10px] leading-5 text-neutral-600">



                Driver User ID/password creation and reset



                remain Owner-only.



              </p>



            </article>



          ))}







          {!drivers.length && (



            <div className="col-span-full rounded-3xl border border-neutral-800 bg-neutral-900 py-14 text-center text-sm text-neutral-500">



              No Delivery drivers.



            </div>



          )}



        </div>



      )}







      {tab === 'website' && (



        <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">



          <p className="text-[10px] font-black uppercase tracking-wider text-emerald-400">



            Delivery Ordering Website



          </p>







          <p className="mt-3 break-all font-mono text-xs text-white">



            {deliveryUrl || 'Restaurant code not available'}



          </p>







          <div className="mt-4 flex flex-wrap gap-2">



            <button



              type="button"



              onClick={copyDeliveryUrl}



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



                Open Website



              </a>



            )}



          </div>



        </div>



      )}



    </section>



  )



}









function AfterSalesWorkspace({
  report,
  loading,
  error,
  onRefresh,
  orders,
  createOrderId,
  createType,
  setCreateType,
  createReason,
  setCreateReason,
  createItems,
  setCreateItems,
  onSubmitCreate,
  onCancelCreate,
  creating,
  actionId,
  onAction,
  refundingId,
  onRazorpayRefund,
}) {
  const cases =
    Array.isArray(report?.cases)
      ? report.cases
      : []

  const createOrder =
    orders.find(
      (order) =>
        String(order.id) ===
        String(createOrderId)
    ) || null

  const createOrderItems =
    Array.isArray(createOrder?.items)
      ? createOrder.items
      : []

  const availableTypes =
    String(
      createOrder?.order_status || ''
    ).toLowerCase() ===
    'out_for_delivery'
      ? [
          [
            'failed_delivery',
            'Failed Delivery',
          ],
        ]
      : [
          ['return', 'Return'],
          [
            'replacement',
            'Replacement',
          ],
          [
            'refund',
            'Refund Only',
          ],
          [
            'return_refund',
            'Return + Refund',
          ],
        ]

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-violet-500/20 bg-violet-500/10 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-violet-300">
              Returns · Replacements · Refunds
            </p>

            <h3 className="mt-1 text-xl font-black text-white">
              Delivery After-Sales
            </h3>

            <p className="mt-2 max-w-3xl text-xs leading-5 text-neutral-400">
              Returned stock is restored only after physical receipt is confirmed.
              Replacement stock is reserved before dispatch. Razorpay refunds are
              sent only through the secure server refund route.
            </p>
          </div>

          <button
            type="button"
            disabled={loading}
            onClick={onRefresh}
            className="shrink-0 rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-xs font-black text-white disabled:opacity-50"
          >
            {loading
              ? 'Refreshing...'
              : '↻ Refresh Cases'}
          </button>
        </div>
      </section>

      {error && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs font-bold text-red-300">
          {error}
        </div>
      )}

      {createOrder && (
        <section className="rounded-3xl border border-emerald-500/20 bg-neutral-900 p-5 sm:p-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-emerald-400">
                New After-Sales Case
              </p>

              <h3 className="mt-1 text-lg font-black text-white">
                {createOrder.order_code}
                {' · '}
                {createOrder.customer_name}
              </h3>

              <p className="mt-1 text-xs text-neutral-500">
                Order status:{' '}
                {labelStatus(
                  createOrder.order_status
                )}
                {' · '}
                {String(
                  createOrder.payment_method ||
                    ''
                ).toUpperCase()}
              </p>
            </div>

            <button
              type="button"
              onClick={onCancelCreate}
              className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-[10px] font-black text-neutral-300"
            >
              Close
            </button>
          </div>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-[10px] font-black uppercase text-neutral-500">
                Case Type
              </span>

              <select
                value={createType}
                onChange={(event) =>
                  setCreateType(
                    event.target.value
                  )
                }
                className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-xs font-bold text-white"
              >
                {availableTypes.map(
                  ([value, label]) => (
                    <option
                      key={value}
                      value={value}
                    >
                      {label}
                    </option>
                  )
                )}
              </select>
            </label>

            <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3">
              <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500">
                Order Total
              </p>

              <p className="mt-1 text-lg font-black text-white">
                {money(
                  createOrder.total_amount
                )}
              </p>
            </div>
          </div>

          {afterSalesNeedsItems(
            createType
          ) && (
            <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
              <p className="text-[10px] font-black uppercase tracking-wider text-neutral-500">
                Select Item Quantities
              </p>

              <div className="mt-3 space-y-2">
                {createOrderItems.map(
                  (item, index) => {
                    const itemId =
                      deliveryOrderItemId(
                        item
                      )

                    const orderedQty =
                      deliveryOrderItemQuantity(
                        item
                      )

                    if (!itemId) {
                      return null
                    }

                    return (
                      <div
                        key={
                          itemId ||
                          index
                        }
                        className="grid gap-2 rounded-xl border border-neutral-800 bg-neutral-900 p-3 sm:grid-cols-[1fr_120px]"
                      >
                        <div>
                          <p className="text-xs font-black text-white">
                            {item.name ||
                              'Item'}
                          </p>

                          <p className="mt-1 text-[10px] text-neutral-500">
                            Ordered:{' '}
                            {orderedQty}
                          </p>
                        </div>

                        <label>
                          <span className="mb-1 block text-[9px] font-black uppercase text-neutral-600">
                            Qty
                          </span>

                          <input
                            type="number"
                            min="0"
                            max={orderedQty}
                            step="1"
                            value={
                              createItems[
                                itemId
                              ] ?? '0'
                            }
                            onChange={(
                              event
                            ) => {
                              const raw =
                                event
                                  .target
                                  .value

                              setCreateItems(
                                (
                                  current
                                ) => ({
                                  ...current,
                                  [itemId]:
                                    raw,
                                })
                              )
                            }}
                            className="w-full rounded-lg border border-neutral-800 bg-neutral-950 px-3 py-2 text-xs font-bold text-white"
                          />
                        </label>
                      </div>
                    )
                  }
                )}

                {!createOrderItems.length && (
                  <p className="py-4 text-center text-xs text-neutral-600">
                    No item snapshot is available for this order.
                  </p>
                )}
              </div>
            </div>
          )}

          <label className="mt-4 block">
            <span className="mb-1.5 block text-[10px] font-black uppercase text-neutral-500">
              Reason / Customer Issue
            </span>

            <textarea
              rows={3}
              value={createReason}
              onChange={(event) =>
                setCreateReason(
                  event.target.value
                )
              }
              placeholder="Example: Product damaged, wrong item, customer unavailable..."
              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-xs text-white outline-none focus:border-emerald-500"
            />
          </label>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={creating}
              onClick={onSubmitCreate}
              className="rounded-xl bg-emerald-600 px-5 py-3 text-xs font-black text-white disabled:opacity-50"
            >
              {creating
                ? 'Creating Case...'
                : 'Create After-Sales Case'}
            </button>

            <button
              type="button"
              disabled={creating}
              onClick={onCancelCreate}
              className="rounded-xl border border-neutral-700 bg-neutral-950 px-5 py-3 text-xs font-black text-neutral-300"
            >
              Cancel
            </button>
          </div>
        </section>
      )}

      <div className="space-y-3">
        {cases.map((caseRow) => {
          const status =
            String(
              caseRow.status || ''
            ).toLowerCase()

          const caseType =
            String(
              caseRow.case_type ||
                ''
            ).toLowerCase()

          const items =
            Array.isArray(
              caseRow.items
            )
              ? caseRow.items
              : []

          const refundRemaining =
            Math.max(
              0,
              Number(
                caseRow.refund_amount ||
                  0
              ) -
                Number(
                  caseRow.refund_completed_amount ||
                    0
                )
            )

          const busy =
            actionId ===
            caseRow.id

          const refundBusy =
            refundingId ===
            caseRow.id

          return (
            <article
              key={caseRow.id}
              className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5"
            >
              <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <span className="rounded-full border border-violet-500/20 bg-violet-500/10 px-2.5 py-1 font-mono text-[9px] font-black text-violet-300">
                      {caseRow.case_code}
                    </span>

                    <span className="rounded-full border border-neutral-700 bg-neutral-800 px-2.5 py-1 text-[9px] font-black text-neutral-300">
                      {afterSalesTypeLabel(
                        caseType
                      )}
                    </span>

                    <span
                      className={`rounded-full border px-2.5 py-1 text-[9px] font-black ${afterSalesStatusTone(
                        status
                      )}`}
                    >
                      {labelStatus(
                        status
                      )}
                    </span>
                  </div>

                  <h3 className="mt-3 font-black text-white">
                    {caseRow.order
                      ?.order_code ||
                      'Delivery Order'}
                    {' · '}
                    {caseRow.customer_name ||
                      'Customer'}
                  </h3>

                  <p className="mt-1 text-xs text-neutral-500">
                    {caseRow.customer_mobile ||
                      '—'}
                    {' · '}
                    Created{' '}
                    {orderTime(
                      caseRow.created_at
                    )}
                  </p>

                  <p className="mt-3 max-w-3xl text-xs leading-5 text-neutral-300">
                    {caseRow.reason ||
                      'No reason entered.'}
                  </p>
                </div>

                <div className="min-w-[220px] rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                  <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500">
                    Original Order
                  </p>

                  <p className="mt-1 text-lg font-black text-white">
                    {money(
                      caseRow.order
                        ?.total_amount
                    )}
                  </p>

                  <p className="mt-1 text-[10px] text-neutral-500">
                    {String(
                      caseRow.order
                        ?.payment_method ||
                        ''
                    ).toUpperCase()}
                    {' · '}
                    {labelStatus(
                      caseRow.order
                        ?.payment_status
                    )}
                  </p>
                </div>
              </div>

              {items.length > 0 && (
                <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
                  <p className="text-[10px] font-black uppercase tracking-wider text-neutral-500">
                    Items
                  </p>

                  <div className="mt-3 grid gap-2">
                    {items.map(
                      (item) => (
                        <div
                          key={item.id}
                          className="rounded-xl border border-neutral-800 bg-neutral-900 p-3"
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="text-xs font-black text-white">
                              {
                                item.item_name
                              }
                            </p>

                            <span className="text-[10px] font-bold text-neutral-500">
                              Requested{' '}
                              {
                                item.requested_quantity
                              }
                              {' · '}
                              Approved{' '}
                              {
                                item.approved_quantity
                              }
                            </span>
                          </div>

                          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                            <div>
                              <p className="text-[9px] font-black uppercase text-neutral-600">
                                Returned
                              </p>
                              <p className="mt-1 text-xs font-black text-white">
                                {
                                  item.returned_quantity
                                }
                              </p>
                            </div>

                            <div>
                              <p className="text-[9px] font-black uppercase text-neutral-600">
                                Restocked
                              </p>
                              <p className="mt-1 text-xs font-black text-emerald-300">
                                {
                                  item.restocked_quantity
                                }
                              </p>
                            </div>

                            <div>
                              <p className="text-[9px] font-black uppercase text-neutral-600">
                                Replacement Reserved
                              </p>
                              <p className="mt-1 text-xs font-black text-sky-300">
                                {
                                  item.replacement_reserved_quantity
                                }
                              </p>
                            </div>

                            <div>
                              <p className="text-[9px] font-black uppercase text-neutral-600">
                                Replacement Out
                              </p>
                              <p className="mt-1 text-xs font-black text-orange-300">
                                {
                                  item.replacement_dispatched_quantity
                                }
                              </p>
                            </div>
                          </div>

                          {item.last_condition && (
                            <p className="mt-2 text-[10px] text-neutral-500">
                              Last condition:{' '}
                              {labelStatus(
                                item.last_condition
                              )}
                            </p>
                          )}
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

              {caseRow.refund_required && (
                <div className="mt-4 rounded-2xl border border-sky-500/20 bg-sky-500/10 p-4">
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                    <div>
                      <p className="text-[9px] font-black uppercase text-sky-300">
                        Approved Refund
                      </p>
                      <p className="mt-1 text-sm font-black text-white">
                        {money(
                          caseRow.refund_amount
                        )}
                      </p>
                    </div>

                    <div>
                      <p className="text-[9px] font-black uppercase text-sky-300">
                        Refunded
                      </p>
                      <p className="mt-1 text-sm font-black text-emerald-300">
                        {money(
                          caseRow.refund_completed_amount
                        )}
                      </p>
                    </div>

                    <div>
                      <p className="text-[9px] font-black uppercase text-sky-300">
                        Remaining
                      </p>
                      <p className="mt-1 text-sm font-black text-amber-300">
                        {money(
                          refundRemaining
                        )}
                      </p>
                    </div>

                    <div>
                      <p className="text-[9px] font-black uppercase text-sky-300">
                        Status
                      </p>
                      <p className="mt-1 text-xs font-black text-white">
                        {labelStatus(
                          caseRow.refund_status
                        )}
                      </p>
                    </div>
                  </div>

                  {caseRow.provider_refund_id && (
                    <p className="mt-3 break-all font-mono text-[9px] text-neutral-500">
                      Razorpay Refund:{' '}
                      {caseRow.provider_refund_id}
                    </p>
                  )}
                </div>
              )}

              <div className="mt-4 flex flex-wrap gap-2">
                {status ===
                  'requested' && (
                  <>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        onAction(
                          caseRow,
                          'approve'
                        )
                      }
                      className="rounded-xl bg-emerald-600 px-4 py-2.5 text-[10px] font-black text-white disabled:opacity-50"
                    >
                      {busy
                        ? 'Processing...'
                        : '✓ Approve'}
                    </button>

                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        onAction(
                          caseRow,
                          'reject'
                        )
                      }
                      className="rounded-xl bg-red-600 px-4 py-2.5 text-[10px] font-black text-white disabled:opacity-50"
                    >
                      Reject
                    </button>
                  </>
                )}

                {caseType ===
                  'failed_delivery' &&
                  !afterSalesIsClosed(
                    status
                  ) &&
                  status !==
                    'return_received' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        onAction(
                          caseRow,
                          'reattempt_failed_delivery'
                        )
                      }
                      className="rounded-xl bg-sky-600 px-4 py-2.5 text-[10px] font-black text-white disabled:opacity-50"
                    >
                      ↻ Reattempt Delivery
                    </button>
                  )}

                {status ===
                  'awaiting_return' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      onAction(
                        caseRow,
                        'receive_return'
                      )
                    }
                    className="rounded-xl bg-violet-600 px-4 py-2.5 text-[10px] font-black text-white disabled:opacity-50"
                  >
                    📦 Receive Physical Return
                  </button>
                )}

                {status ===
                  'replacement_reserved' && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      onAction(
                        caseRow,
                        'dispatch_replacement'
                      )
                    }
                    className="rounded-xl bg-orange-600 px-4 py-2.5 text-[10px] font-black text-white disabled:opacity-50"
                  >
                    🚚 Dispatch Replacement
                  </button>
                )}

                {status ===
                  'refund_pending' &&
                  caseRow.refund_required &&
                  refundRemaining >
                    0 &&
                  String(
                    caseRow.refund_method ||
                      ''
                  ).toLowerCase() ===
                    'razorpay' && (
                    <button
                      type="button"
                      disabled={refundBusy}
                      onClick={() =>
                        onRazorpayRefund(
                          caseRow
                        )
                      }
                      className="rounded-xl bg-sky-600 px-4 py-2.5 text-[10px] font-black text-white disabled:opacity-50"
                    >
                      {refundBusy
                        ? 'Checking Razorpay...'
                        : String(caseRow.refund_status || '').toLowerCase() === 'failed'
                          ? '↻ Retry Razorpay Refund'
                          : caseRow.provider_refund_id
                            ? '↻ Check Razorpay Refund'
                            : `₹ Process Razorpay Refund`}
                    </button>
                  )}

                {status ===
                  'refund_pending' &&
                  caseRow.refund_required &&
                  refundRemaining >
                    0 &&
                  String(
                    caseRow.refund_method ||
                      ''
                  ).toLowerCase() !==
                    'razorpay' && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        onAction(
                          caseRow,
                          'record_manual_refund'
                        )
                      }
                      className="rounded-xl bg-emerald-700 px-4 py-2.5 text-[10px] font-black text-white disabled:opacity-50"
                    >
                      ₹ Record Cash / Manual Refund
                    </button>
                  )}

                {[
                  'requested',
                  'approved',
                  'awaiting_return',
                  'replacement_reserved',
                ].includes(
                  status
                ) && (
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() =>
                      onAction(
                        caseRow,
                        'cancel_case'
                      )
                    }
                    className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-2.5 text-[10px] font-black text-neutral-400 disabled:opacity-50"
                  >
                    Cancel Case
                  </button>
                )}
              </div>

              {Array.isArray(
                caseRow.events
              ) &&
                caseRow.events.length >
                  0 && (
                  <div className="mt-4 border-t border-neutral-800 pt-4">
                    <p className="text-[10px] font-black uppercase tracking-wider text-neutral-500">
                      Recent Case Activity
                    </p>

                    <div className="mt-2 space-y-2">
                      {caseRow.events
                        .slice(0, 5)
                        .map(
                          (event) => (
                            <div
                              key={
                                event.id
                              }
                              className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5"
                            >
                              <div className="flex flex-wrap items-center justify-between gap-2">
                                <p className="text-[10px] font-black text-neutral-300">
                                  {labelStatus(
                                    event.event_type
                                  )}
                                </p>

                                <span className="text-[9px] text-neutral-600">
                                  {orderTime(
                                    event.created_at
                                  )}
                                </span>
                              </div>

                              {event.note && (
                                <p className="mt-1 text-[10px] leading-4 text-neutral-500">
                                  {
                                    event.note
                                  }
                                </p>
                              )}
                            </div>
                          )
                        )}
                    </div>
                  </div>
                )}
            </article>
          )
        })}

        {!cases.length &&
          !loading && (
            <div className="rounded-3xl border border-neutral-800 bg-neutral-900 py-14 text-center text-sm text-neutral-500">
              No after-sales cases yet. Open a delivered order and choose Return / Replace / Refund.
            </div>
          )}
      </div>
    </div>
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







      <p className={`mt-2 text-2xl font-black ${accent}`}>



        {value}



      </p>



    </div>



  )



}







function InventoryMetric({ label, value }) {
  return <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3 text-center"><p className="text-[9px] font-black uppercase text-neutral-600">{label}</p><p className="mt-1 text-lg font-black text-white">{value}</p></div>
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



          onChange(event.target.value)



        }



        placeholder={placeholder}



        className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-xs text-white outline-none focus:border-emerald-500"



      />



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



          onChange(event.target.checked)



        }



        className="h-4 w-4 accent-emerald-500"



      />



    </label>



  )



}
