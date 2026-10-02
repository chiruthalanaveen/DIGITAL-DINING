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







const EMPTY_OFFER = {



  title: '',



  description: '',



  discount_text: '',



  original_price: '',



  offer_price: '',



  offer_date: new Date().toLocaleDateString('en-CA'),



  image_url: '',



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







  const managerLiveReady = Boolean(
    restaurantId &&
      (
        (
          sessionMode &&
          sessionToken
        ) ||
        (
          !sessionMode &&
          restaurantCode &&
          userId &&
          password
        )
      )
  )

  useLiveDeliveryRefresh(
    () => loadData(true),
    managerLiveReady,
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







  const tabs = [



    ['overview', 'Overview'],



    ['orders', `Orders (${orders.length})`],



    ['menu', `Delivery Menu (${menuItems.length})`],



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







      {tab === 'menu' && (



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
