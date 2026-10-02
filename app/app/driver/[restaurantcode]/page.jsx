'use client'







import {



  use,



  useEffect,



  useMemo,



  useState,



} from 'react'



import { supabase } from '@/lib/supabase'

import { useMobileViewportLock } from '@/lib/useMobileViewportLock'
import { useLiveDeliveryRefresh } from '@/lib/useLiveDeliveryRefresh'

import { appConfirm } from '@/lib/appDialog'







function money(value) {



  return `₹${Number(value || 0).toLocaleString('en-IN', {



    maximumFractionDigits: 2,



  })}`



}







function labelStatus(value) {



  return String(value || '')



    .replaceAll('_', ' ')



    .replace(/\b\w/g, (char) =>



      char.toUpperCase()



    )



}







function formatDate(value) {



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











const DELIVERY_FAILURE_REASONS = [



  ['customer_unavailable', 'Customer unavailable'],



  ['customer_rejected', 'Customer rejected order'],



  ['unable_to_contact', 'Unable to contact customer'],



  ['wrong_address', 'Wrong / incomplete address'],



  ['payment_issue', 'COD / payment issue'],



  ['other', 'Other'],



]







function DeliveryResultPanel({



  order,



  sessionToken,



  disabled = false,



  onCompleted,



}) {



  const [result, setResult] = useState('delivered')



  const [failureReason, setFailureReason] = useState('')



  const [note, setNote] = useState('')



  const [files, setFiles] = useState([])



  const [previews, setPreviews] = useState([])



  const [submitting, setSubmitting] = useState(false)



  const [localError, setLocalError] = useState('')







  useEffect(() => {



    const nextPreviews = files.map((file) => ({



      name: file.name,



      url: URL.createObjectURL(file),



    }))







    setPreviews(nextPreviews)







    return () => {



      nextPreviews.forEach((preview) => {



        URL.revokeObjectURL(preview.url)



      })



    }



  }, [files])







  const handleFiles = (event) => {



    const selected = Array.from(event.target.files || [])







    if (selected.length > 5) {



      setLocalError('You can upload up to 5 photos per delivery attempt.')



      event.target.value = ''



      return



    }







    const allowedTypes = new Set([



      'image/jpeg',



      'image/png',



      'image/webp',



    ])







    const invalid = selected.find(



      (file) => !allowedTypes.has(file.type) || file.size > 5 * 1024 * 1024



    )







    if (invalid) {



      setLocalError(



        'Each photo must be JPG, PNG or WEBP and no larger than 5 MB.'



      )



      event.target.value = ''



      return



    }







    setLocalError('')



    setFiles(selected)



  }







  const submitResult = async () => {



    if (!sessionToken || submitting || disabled) return







    if (result === 'not_delivered' && !failureReason) {



      setLocalError('Choose a reason for Not Delivered.')



      return



    }







    const confirmation = await appConfirm(



      result === 'delivered'



        ? `Confirm ${order.order_code} was delivered?`



        : `Submit a Not Delivered attempt for ${order.order_code}?`,



      {



        title:



          result === 'delivered'



            ? 'Confirm Delivery'



            : 'Submit Delivery Attempt',



        confirmText:



          result === 'delivered'



            ? 'Confirm Delivered'



            : 'Submit Attempt',



      }



    )







    if (!confirmation) return







    setSubmitting(true)



    setLocalError('')







    try {



      const formData = new FormData()



      formData.append('sessionToken', sessionToken)



      formData.append('orderId', String(order.id))



      formData.append('result', result)



      formData.append('failureReason', result === 'not_delivered' ? failureReason : '')



      formData.append('note', note.trim())







      files.forEach((file) => {



        formData.append('files', file)



      })







      const response = await fetch('/api/delivery/driver-proof', {



        method: 'POST',



        body: formData,



        cache: 'no-store',



      })







      const data = await response.json().catch(() => ({}))







      if (!response.ok || !data?.success) {



        throw new Error(



          data?.message || 'Unable to submit the delivery result.'



        )



      }







      setFiles([])



      setNote('')



      setFailureReason('')



      setResult('delivered')







      onCompleted?.(



        result === 'delivered'



          ? 'Delivery completed and proof sent to the Delivery Dashboard.'



          : 'Not Delivered attempt sent to the Delivery Dashboard.'



      )



    } catch (submitError) {



      console.error('Delivery proof submit error:', submitError)



      setLocalError(



        submitError?.message || 'Unable to submit the delivery result.'



      )



    } finally {



      setSubmitting(false)



    }



  }







  return (



    <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">



      <div className="flex items-start justify-between gap-3">



        <div>



          <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500">



            Delivery Result



          </p>



          <p className="mt-1 text-xs leading-5 text-neutral-400">



            Confirm delivery or report an unsuccessful attempt. Uploaded item / proof photos are sent to the owner Delivery Dashboard.



          </p>



        </div>



        <span className="rounded-full bg-sky-500/10 px-2.5 py-1 text-[9px] font-black text-sky-300">



          Up to 5 photos



        </span>



      </div>







      <div className="mt-4 grid grid-cols-2 gap-2">



        <button



          type="button"



          onClick={() => {



            setResult('delivered')



            setFailureReason('')



            setLocalError('')



          }}



          className={`rounded-xl border px-3 py-3 text-xs font-black transition ${



            result === 'delivered'



              ? 'border-emerald-500 bg-emerald-500/10 text-emerald-300'



              : 'border-neutral-800 bg-neutral-900 text-neutral-400'



          }`}



        >



          ✓ Delivered



        </button>







        <button



          type="button"



          onClick={() => {



            setResult('not_delivered')



            setLocalError('')



          }}



          className={`rounded-xl border px-3 py-3 text-xs font-black transition ${



            result === 'not_delivered'



              ? 'border-red-500 bg-red-500/10 text-red-300'



              : 'border-neutral-800 bg-neutral-900 text-neutral-400'



          }`}



        >



          ✕ Not Delivered



        </button>



      </div>







      {result === 'not_delivered' && (



        <label className="mt-4 block">



          <span className="mb-1.5 block text-[9px] font-black uppercase tracking-wider text-neutral-500">



            Reason



          </span>



          <select



            value={failureReason}



            onChange={(event) => setFailureReason(event.target.value)}



            className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-3 text-xs font-bold text-white outline-none focus:border-red-500"



          >



            <option value="">Select reason</option>



            {DELIVERY_FAILURE_REASONS.map(([value, label]) => (



              <option key={value} value={value}>



                {label}



              </option>



            ))}



          </select>



        </label>



      )}







      <label className="mt-4 block">



        <span className="mb-1.5 block text-[9px] font-black uppercase tracking-wider text-neutral-500">



          Upload Items / Delivery Proof



        </span>



        <input



          type="file"



          accept="image/jpeg,image/png,image/webp"



          multiple



          onChange={handleFiles}



          className="block w-full rounded-xl border border-dashed border-neutral-700 bg-neutral-900 px-3 py-3 text-xs text-neutral-300 file:mr-3 file:rounded-lg file:border-0 file:bg-emerald-600 file:px-3 file:py-2 file:text-[10px] file:font-black file:text-white"



        />



        <p className="mt-1.5 text-[9px] leading-4 text-neutral-600">



          Optional. Maximum 5 photos, 5 MB each. JPG, PNG or WEBP.



        </p>



      </label>







      {previews.length > 0 && (



        <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-5">



          {previews.map((preview) => (



            <div



              key={`${preview.name}-${preview.url}`}



              className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900"



            >



              <img



                src={preview.url}



                alt={preview.name}



                className="aspect-square w-full object-cover"



              />



            </div>



          ))}



        </div>



      )}







      <label className="mt-4 block">



        <span className="mb-1.5 block text-[9px] font-black uppercase tracking-wider text-neutral-500">



          Driver Note



        </span>



        <textarea



          value={note}



          onChange={(event) => setNote(event.target.value.slice(0, 500))}



          rows={3}



          placeholder={



            result === 'delivered'



              ? 'Optional delivery note...'



              : 'Add useful details about the failed attempt...'



          }



          className="w-full resize-none rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-3 text-xs text-white outline-none focus:border-emerald-500"



        />



        <p className="mt-1 text-right text-[9px] text-neutral-600">



          {note.length}/500



        </p>



      </label>







      {localError && (



        <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2.5 text-[10px] font-bold leading-4 text-red-300">



          {localError}



        </div>



      )}







      <button



        type="button"



        onClick={submitResult}



        disabled={submitting || disabled}



        className={`mt-4 w-full rounded-xl px-5 py-4 text-sm font-black text-white disabled:opacity-50 ${



          result === 'delivered'



            ? 'bg-emerald-600'



            : 'bg-red-600'



        }`}



      >



        {submitting



          ? 'Uploading & Submitting...'



          : result === 'delivered'



            ? 'Confirm Delivered'



            : 'Submit Not Delivered'}



      </button>



    </div>



  )



}







export default function DeliveryDriverPortal({



  params,



}) {



  const unwrappedParams = use(params)

  useMobileViewportLock()







  const restaurantCode = String(



    unwrappedParams?.restaurantCode ||

      unwrappedParams?.restaurantcode ||

      ''



  ).trim()







  const storageKey =



    `digitaldining_delivery_driver_session_${restaurantCode}`







  const [sessionToken, setSessionToken] =



    useState('')







  const [userId, setUserId] =



    useState('')







  const [password, setPassword] =



    useState('')







  const [portalData, setPortalData] =



    useState(null)







  const [loading, setLoading] =



    useState(true)







  const [loggingIn, setLoggingIn] =



    useState(false)







  const [updatingOrderId, setUpdatingOrderId] =



    useState('')







  const [error, setError] =



    useState('')







  const [message, setMessage] =



    useState('')







  useEffect(() => {



    try {



      const saved =



        localStorage.getItem(storageKey)







      if (saved) {



        setSessionToken(saved)



      }



    } catch {



      // Ignore unavailable local storage.



    }







    setLoading(false)



  }, [storageKey])







  const loadPortal = async (



    tokenOverride = ''



  ) => {



    const token =



      String(



        tokenOverride ||



          sessionToken ||



          ''



      ).trim()







    if (!token) {



      setPortalData(null)



      return



    }







    try {



      const {



        data,



        error: rpcError,



      } = await supabase.rpc(



        'get_delivery_driver_portal_data',



        {



          p_session_token: token,



        }



      )







      if (rpcError) {



        throw rpcError



      }







      if (!data?.success) {



        throw new Error(



          data?.message ||



            'Driver session is invalid.'



        )



      }







      setPortalData(data)



      setError('')



    } catch (loadError) {



      console.error(



        'Driver portal load error:',



        loadError



      )







      setPortalData(null)



      setSessionToken('')







      try {



        localStorage.removeItem(



          storageKey



        )



      } catch {



        // Ignore unavailable local storage.



      }







      setError(



        loadError?.message ||



          'Your Driver Portal session expired. Please sign in again.'



      )



    }



  }







  useEffect(() => {
    if (!sessionToken) {
      return
    }

    loadPortal()

    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionToken])

  useLiveDeliveryRefresh(
    () => loadPortal(),
    Boolean(sessionToken),
    1000
  )



  const handleLogin = async (



    event



  ) => {



    event.preventDefault()







    if (loggingIn) return







    const cleanUserId =



      userId.trim().toLowerCase()







    if (



      cleanUserId.length < 3 ||



      password.length < 6



    ) {



      setError(



        'Enter your Driver User ID and password.'



      )



      return



    }







    setLoggingIn(true)



    setError('')



    setMessage('')







    try {



      const {



        data,



        error: rpcError,



      } = await supabase.rpc(



        'delivery_driver_login',



        {



          p_restaurant_code:



            restaurantCode,



          p_user_id: cleanUserId,



          p_password: password,



        }



      )







      if (rpcError) {



        throw rpcError



      }







      if (



        !data?.success ||



        !data?.session_token



      ) {



        throw new Error(



          data?.message ||



            'Driver login failed.'



        )



      }







      const token =



        String(



          data.session_token



        )







      try {



        localStorage.setItem(



          storageKey,



          token



        )



      } catch {



        // Continue even if storage is unavailable.



      }







      setSessionToken(token)



      setPassword('')



      setMessage(



        `Welcome ${data?.driver?.name || 'Driver'}.`



      )







      await loadPortal(token)



    } catch (loginError) {



      console.error(



        'Delivery driver login error:',



        loginError



      )







      setError(



        loginError?.message ||



          'Driver login failed.'



      )



    } finally {



      setLoggingIn(false)



    }



  }







  const logout = async () => {



    const token =



      sessionToken







    try {



      if (token) {



        await supabase.rpc(



          'delivery_driver_logout',



          {



            p_session_token:



              token,



          }



        )



      }



    } catch (logoutError) {



      console.error(



        'Driver logout error:',



        logoutError



      )



    } finally {



      try {



        localStorage.removeItem(



          storageKey



        )



      } catch {



        // Ignore.



      }







      setSessionToken('')



      setPortalData(null)



      setUserId('')



      setPassword('')



      setMessage('')



      setError('')



    }



  }







  const updateStatus = async (



    order,



    nextStatus



  ) => {



    if (



      !sessionToken ||



      updatingOrderId



    ) {



      return



    }







    const confirmation =



      await appConfirm(



        nextStatus ===



          'out_for_delivery'



          ? `Start delivery for ${order.order_code}?`



          : `Mark ${order.order_code} as delivered?`,



        {



          title:



            nextStatus === 'out_for_delivery'



              ? 'Start Delivery'



              : 'Confirm Delivered',



          confirmText:



            nextStatus === 'out_for_delivery'



              ? 'Start Delivery'



              : 'Mark Delivered',



        }



      )







    if (!confirmation) return







    setUpdatingOrderId(



      order.id



    )



    setError('')



    setMessage('')







    try {



      const {



        data,



        error: rpcError,



      } = await supabase.rpc(



        'delivery_driver_update_order_status',



        {



          p_session_token:



            sessionToken,



          p_order_id:



            order.id,



          p_new_status:



            nextStatus,



        }



      )







      if (rpcError) {



        throw rpcError



      }







      if (!data?.success) {



        throw new Error(



          data?.message ||



            'Unable to update order.'



        )



      }







      setMessage(



        nextStatus ===



          'out_for_delivery'



          ? 'Order marked Out for Delivery.'



          : 'Order marked Delivered.'



      )







      await loadPortal()



    } catch (updateError) {



      console.error(



        'Driver order update error:',



        updateError



      )







      setError(



        updateError?.message ||



          'Unable to update order.'



      )



    } finally {



      setUpdatingOrderId('')



    }



  }







  const orders =



    Array.isArray(



      portalData?.orders



    )



      ? portalData.orders



      : []







  const activeOrders =



    useMemo(



      () =>



        orders.filter(



          (order) =>



            ![



              'delivered',



              'cancelled',



            ].includes(



              String(



                order.order_status ||



                  ''



              )



            )



        ),



      [orders]



    )







  const recentOrders =



    useMemo(



      () =>



        orders.filter((order) =>



          [



            'delivered',



            'cancelled',



          ].includes(



            String(



              order.order_status || ''



            )



          )



        ),



      [orders]



    )







  if (loading) {



    return (



      <main className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-neutral-950 px-3 py-6 text-white sm:px-4 sm:py-10">



        <div className="mx-auto w-full max-w-md rounded-3xl border border-neutral-800 bg-neutral-900 p-6 text-center sm:p-8">



          Loading Driver Portal...



        </div>



      </main>



    )



  }







  if (



    !sessionToken ||



    !portalData



  ) {



    return (



      <main className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-neutral-950 px-3 py-6 text-neutral-100 sm:px-4 sm:py-10">



        <div className="mx-auto w-full max-w-md">



          <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5 shadow-2xl sm:p-6">



            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/10 text-2xl">



              🚚



            </div>







            <p className="mt-5 text-[10px] font-black uppercase tracking-[0.18em] text-emerald-400">



              Digital Dining



            </p>







            <h1 className="mt-1 text-2xl font-black text-white">



              Delivery Driver Login



            </h1>







            <p className="mt-2 text-sm leading-6 text-neutral-400">



              Sign in using the Driver



              User ID and password given



              by the restaurant owner.



            </p>







            <form



              onSubmit={handleLogin}



              className="mt-6 space-y-4"



            >



              <label className="block">



                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-neutral-500">



                  Driver User ID



                </span>







                <input



                  value={userId}



                  onChange={(event) =>



                    setUserId(



                      event.target.value



                    )



                  }



                  autoComplete="username"



                  placeholder="driver01"



                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-emerald-500"



                />



              </label>







              <label className="block">



                <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-neutral-500">



                  Password



                </span>







                <input



                  type="password"



                  value={password}



                  onChange={(event) =>



                    setPassword(



                      event.target.value



                    )



                  }



                  autoComplete="current-password"



                  placeholder="••••••••"



                  className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-sm text-white outline-none focus:border-emerald-500"



                />



              </label>







              {error && (



                <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-xs font-bold leading-5 text-red-300">



                  {error}



                </div>



              )}







              <button



                type="submit"



                disabled={loggingIn}



                className="w-full rounded-xl bg-emerald-600 px-5 py-4 text-sm font-black text-white disabled:opacity-50"



              >



                {loggingIn



                  ? 'Signing In...'



                  : 'Open Driver Portal'}



              </button>



            </form>







            <p className="mt-5 text-center text-[10px] leading-5 text-neutral-600">



              Five failed login attempts



              temporarily lock the Driver



              Portal account for 15



              minutes.



            </p>



          </section>



        </div>



      </main>



    )



  }







  const driver =



    portalData.driver || {}







  const restaurant =



    portalData.restaurant || {}







  return (



    <main className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-neutral-950 pb-[max(2.5rem,env(safe-area-inset-bottom))] text-neutral-100">



      <header className="sticky top-0 z-30 border-b border-neutral-800 bg-neutral-950/95 backdrop-blur">



        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-2 px-3 py-3 sm:gap-3 sm:px-4">



          <div className="min-w-0">



            <p className="truncate text-sm font-black text-white">



              {restaurant.name ||



                'Delivery'}



            </p>







            <p className="mt-0.5 text-[10px] font-black uppercase tracking-wider text-emerald-400">



              Driver Portal



            </p>



          </div>







          <button



            type="button"



            onClick={logout}



            className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-2.5 text-xs font-black text-neutral-300"



          >



            Logout



          </button>



        </div>



      </header>







      <div className="mx-auto w-full max-w-3xl space-y-4 px-3 py-4 sm:px-4 sm:py-5">



        <section className="min-w-0 rounded-3xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">



          <div className="flex items-start justify-between gap-4">



            <div>



              <p className="text-[10px] font-black uppercase tracking-wider text-neutral-500">



                Signed in as



              </p>







              <h1 className="mt-1 text-xl font-black text-white">



                {driver.name}



              </h1>







              <p className="mt-1 text-xs text-neutral-400">



                {driver.mobile}



                {driver.vehicle_type



                  ? ` · ${driver.vehicle_type}`



                  : ''}



                {driver.vehicle_number



                  ? ` · ${driver.vehicle_number}`



                  : ''}



              </p>



            </div>







            <span



              className={`rounded-full px-3 py-1.5 text-[10px] font-black uppercase ${



                driver.status ===



                'busy'



                  ? 'bg-orange-500/10 text-orange-400'



                  : 'bg-emerald-500/10 text-emerald-400'



              }`}



            >



              {driver.status ||



                'available'}



            </span>



          </div>







          <div className="mt-5 grid grid-cols-2 gap-3">



            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">



              <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500">



                Active Deliveries



              </p>







              <p className="mt-2 text-2xl font-black text-orange-400">



                {activeOrders.length}



              </p>



            </div>







            <div className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4">



              <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500">



                Completed Recently



              </p>







              <p className="mt-2 text-2xl font-black text-emerald-400">



                {



                  recentOrders.filter(



                    (order) =>



                      order.order_status ===



                      'delivered'



                  ).length



                }



              </p>



            </div>



          </div>



        </section>







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







        <section>



          <div className="mb-3">



            <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">



              Assigned Orders



            </p>







            <h2 className="mt-1 text-lg font-black text-white">



              Active Deliveries



            </h2>



          </div>







          <div className="space-y-3">



            {activeOrders.map(



              (order) => {



                const address = [



                  order.address_line1,



                  order.address_line2,



                  order.landmark,



                  order.city,



                  order.state,



                  order.pincode,



                ]



                  .filter(Boolean)



                  .join(', ')







                const hasLiveLocation =



                  Number.isFinite(Number(order.latitude)) &&



                  Number.isFinite(Number(order.longitude))







                const mapUrl = hasLiveLocation



                  ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(



                      `${order.latitude},${order.longitude}`



                    )}`



                  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(



                      address



                    )}`







                const codDue =



                  order.payment_method ===



                    'cod' &&



                  order.payment_status !==



                    'paid'







                return (



                  <article



                    key={order.id}



                    className="min-w-0 rounded-3xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5"



                  >



                    <div className="flex flex-wrap items-center gap-2">



                      <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 font-mono text-[10px] font-black text-emerald-400">



                        {



                          order.order_code



                        }



                      </span>







                      <span className="rounded-full bg-orange-500/10 px-2.5 py-1 text-[10px] font-black text-orange-400">



                        {labelStatus(



                          order.order_status



                        )}



                      </span>







                      {codDue && (



                        <span className="rounded-full bg-amber-500/10 px-2.5 py-1 text-[10px] font-black text-amber-300">



                          COLLECT{' '}



                          {money(



                            order.total_amount



                          )}



                        </span>



                      )}



                    </div>







                    <h3 className="mt-4 text-lg font-black text-white">



                      {



                        order.customer_name



                      }



                    </h3>







                    <p className="mt-1 text-xs text-neutral-400">



                      {order.customer_mobile}



                      {order.alternate_mobile



                        ? ` · Alt ${order.alternate_mobile}`



                        : ''}



                    </p>







                    <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">



                      <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500">



                        Delivery Address



                      </p>







                      <p className="mt-2 text-sm leading-6 text-neutral-200">



                        {address}



                      </p>







                      {hasLiveLocation && (



                        <p className="mt-2 text-[10px] font-black text-emerald-400">



                          ✓ Customer live location captured



                          {order.location_accuracy_m



                            ? ` · ±${Math.round(Number(order.location_accuracy_m))}m`



                            : ''}



                        </p>



                      )}



                    </div>







                    {order.customer_note && (



                      <div className="mt-3 rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">



                        <p className="text-[9px] font-black uppercase tracking-wider text-amber-400">



                          Customer Note



                        </p>







                        <p className="mt-1 text-xs leading-5 text-amber-100">



                          {



                            order.customer_note



                          }



                        </p>



                      </div>



                    )}







                    <div className="mt-4 grid grid-cols-2 gap-2">



                      <a



                        href={`tel:${order.customer_mobile}`}



                        className="rounded-xl bg-neutral-800 px-4 py-3 text-center text-xs font-black text-white"



                      >



                        Call Customer



                      </a>







                      <a



                        href={mapUrl}



                        target="_blank"



                        rel="noreferrer"



                        className="rounded-xl bg-sky-600 px-4 py-3 text-center text-xs font-black text-white"



                      >



                        Open Maps



                      </a>



                    </div>







                    <div className="mt-4 border-t border-neutral-800 pt-4">



                      <div className="space-y-2">



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



                                className="flex items-center justify-between gap-3 text-xs"



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



                                  )}



                                </span>



                              </div>



                            )



                          )}



                      </div>







                      <div className="mt-3 flex items-center justify-between border-t border-neutral-800 pt-3">



                        <span className="text-xs text-neutral-500">



                          Total



                        </span>







                        <span className="text-lg font-black text-white">



                          {money(



                            order.total_amount



                          )}



                        </span>



                      </div>



                    </div>







                    <p className="mt-4 text-[10px] text-neutral-600">



                      Assigned order ·{' '}



                      {formatDate(



                        order.created_at



                      )}



                    </p>







                    {order.order_status ===



                      'packed' && (



                      <button



                        type="button"



                        disabled={



                          updatingOrderId ===



                          order.id



                        }



                        onClick={() =>



                          updateStatus(



                            order,



                            'out_for_delivery'



                          )



                        }



                        className="mt-4 w-full rounded-xl bg-orange-500 px-5 py-4 text-sm font-black text-white disabled:opacity-50"



                      >



                        {updatingOrderId ===



                        order.id



                          ? 'Updating...'



                          : 'Start Delivery'}



                      </button>



                    )}







                  {order.order_status ===



                    'out_for_delivery' && (



                    <DeliveryResultPanel



                      order={order}



                      sessionToken={sessionToken}



                      disabled={



                        updatingOrderId ===



                        order.id



                      }



                      onCompleted={async (text) => {



                        setMessage(text)



                        setError('')



                        await loadPortal()



                      }}



                    />



                  )}







                    {![



                      'packed',



                      'out_for_delivery',



                    ].includes(



                      order.order_status



                    ) && (



                      <div className="mt-4 rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-xs text-neutral-500">



                        Waiting for the



                        restaurant to mark



                        this order Packed.



                      </div>



                    )}



                  </article>



                )



              }



            )}







            {!activeOrders.length && (



              <div className="rounded-3xl border border-neutral-800 bg-neutral-900 py-14 text-center">



                <div className="text-3xl">



                  ✓



                </div>







                <p className="mt-3 text-sm font-black text-white">



                  No active deliveries



                </p>







                <p className="mt-1 text-xs text-neutral-500">



                  New assigned orders will



                  appear automatically.



                </p>



              </div>



            )}



          </div>



        </section>







        {recentOrders.length > 0 && (



          <section>



            <div className="mb-3">



              <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">



                Recent



              </p>







              <h2 className="mt-1 text-lg font-black text-white">



                Completed Orders



              </h2>



            </div>







            <div className="space-y-2">



              {recentOrders.map(



                (order) => (



                  <div



                    key={order.id}



                    className="flex items-center justify-between gap-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-4"



                  >



                    <div>



                      <p className="font-mono text-xs font-black text-white">



                        {



                          order.order_code



                        }



                      </p>







                      <p className="mt-1 text-[10px] text-neutral-500">



                        {formatDate(



                          order.delivered_at ||



                            order.created_at



                        )}



                      </p>



                    </div>







                    <span



                      className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${



                        order.order_status ===



                        'delivered'



                          ? 'bg-emerald-500/10 text-emerald-400'



                          : 'bg-red-500/10 text-red-400'



                      }`}



                    >



                      {labelStatus(



                        order.order_status



                      )}



                    </span>



                  </div>



                )



              )}



            </div>



          </section>



        )}



      </div>



    </main>



  )



}
