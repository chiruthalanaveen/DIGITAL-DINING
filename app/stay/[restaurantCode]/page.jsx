'use client'







import { useEffect, useMemo, useState } from 'react'



import { useParams } from 'next/navigation'



import { supabase } from '@/lib/supabase'
import { useMobileViewportLock } from '@/lib/useMobileViewportLock'







const money = (value) =>



  `₹${Number(value || 0).toLocaleString('en-IN', {



    minimumFractionDigits: 0,



    maximumFractionDigits: 2,



  })}`







function formatDate(value) {



  if (!value) return ''







  return new Date(`${value}T00:00:00`).toLocaleDateString(



    'en-IN',



    {



      day: '2-digit',



      month: 'short',



      year: 'numeric',



    }



  )



}







function tomorrowDate(days = 1) {



  const date = new Date()



  date.setDate(date.getDate() + days)







  return date.toLocaleDateString('en-CA')



}







export default function ResortBookingPage() {
  useMobileViewportLock()



  const params = useParams()







  const restaurantCode =



    typeof params?.restaurantCode === 'string'



      ? decodeURIComponent(params.restaurantCode)



      : ''







  const [loading, setLoading] = useState(true)



  const [searching, setSearching] = useState(false)



  const [booking, setBooking] = useState(false)

  const [paymentMethod, setPaymentMethod] = useState('pay_at_property')

  const [paymentLoading, setPaymentLoading] = useState(false)







  const [property, setProperty] = useState(null)



  const [roomTypes, setRoomTypes] = useState([])



  const [availableRooms, setAvailableRooms] = useState([])







  const [message, setMessage] = useState('')







  const [checkIn, setCheckIn] = useState(



    tomorrowDate(1)



  )







  const [checkOut, setCheckOut] = useState(



    tomorrowDate(2)



  )







  const [adults, setAdults] = useState(2)



  const [children, setChildren] = useState(0)







  const [selectedRoom, setSelectedRoom] =



    useState(null)







  const [bookingResult, setBookingResult] =



    useState(null)







  const [guestForm, setGuestForm] = useState({



    name: '',



    mobile: '',



    alternateMobile: '',



    email: '',



    address: '',



    specialRequest: '',



  })







  const minimumCheckIn = useMemo(



    () => tomorrowDate(0),



    []



  )







  useEffect(() => {



    if (!restaurantCode) return







    loadResort()



  }, [restaurantCode])







  const loadResort = async () => {



    setLoading(true)



    setMessage('')







    try {



      const { data, error } = await supabase.rpc(



        'get_public_resort',



        {



          p_restaurant_code: restaurantCode,



        }



      )







      if (error) throw error







      if (!data?.success) {



        throw new Error(



          data?.message || 'Resort not found.'



        )



      }







      const nextProperty = data.property || null



      setProperty(nextProperty)

      setPaymentMethod(

        nextProperty?.payAtProperty ? 'pay_at_property' : 'razorpay'

      )



      setRoomTypes(



        Array.isArray(data.roomTypes)



          ? data.roomTypes



          : []



      )



    } catch (error) {



      console.error(



        'Public resort load error:',



        error



      )







      setMessage(



        error?.message ||



          'Unable to load this resort.'



      )



    } finally {



      setLoading(false)



    }



  }







  const checkAvailability = async () => {



    setSearching(true)



    setMessage('')



    setAvailableRooms([])



    setSelectedRoom(null)







    try {



      if (!checkIn || !checkOut) {



        throw new Error(



          'Please select check-in and check-out dates.'



        )



      }







      if (



        new Date(checkOut) <= new Date(checkIn)



      ) {



        throw new Error(



          'Check-out must be after check-in.'



        )



      }







      const { data, error } = await supabase.rpc(



        'check_resort_availability',



        {



          p_restaurant_code: restaurantCode,



          p_check_in: checkIn,



          p_check_out: checkOut,



          p_adults: Number(adults),



          p_children: Number(children),



        }



      )







      if (error) throw error







      if (!data?.success) {



        throw new Error(



          data?.message ||



            'Unable to check availability.'



        )



      }







      const rooms = Array.isArray(data.rooms)



        ? data.rooms



        : []







      setAvailableRooms(rooms)







      if (!rooms.length) {



        setMessage(



          'No rooms are available for the selected dates and guests.'



        )



      }



    } catch (error) {



      console.error(



        'Availability error:',



        error



      )







      setMessage(



        error?.message ||



          'Unable to check room availability.'



      )



    } finally {



      setSearching(false)



    }



  }







  const updateGuest = (key, value) => {



    setGuestForm((current) => ({



      ...current,



      [key]: value,



    }))



  }







  const getCleanGuestDetails = () => {

    const cleanName = guestForm.name.trim()

    const cleanMobile = guestForm.mobile.replace(/\D/g, '')

    const cleanAlternate = guestForm.alternateMobile.replace(/\D/g, '')



    if (cleanName.length < 2) {

      throw new Error('Please enter the guest name.')

    }



    if (cleanMobile.length < 10 || cleanMobile.length > 15) {

      throw new Error('Please enter a valid mobile number.')

    }



    if (

      cleanAlternate &&

      (cleanAlternate.length < 10 || cleanAlternate.length > 15)

    ) {

      throw new Error('Please enter a valid alternate mobile number.')

    }



    return {

      cleanName,

      cleanMobile,

      cleanAlternate,

    }

  }



  const createBooking = async (event) => {

    event.preventDefault()



    if (!selectedRoom || paymentMethod !== 'pay_at_property') return



    setBooking(true)

    setMessage('')



    try {

      const {

        cleanName,

        cleanMobile,

        cleanAlternate,

      } = getCleanGuestDetails()



      const { data, error } = await supabase.rpc(

        'create_resort_booking',

        {

          p_restaurant_code: restaurantCode,

          p_room_type_id: selectedRoom.roomTypeId,

          p_check_in: checkIn,

          p_check_out: checkOut,

          p_guest_name: cleanName,

          p_guest_mobile: cleanMobile,

          p_guest_email: guestForm.email.trim(),

          p_alternate_mobile: cleanAlternate,

          p_guest_address: guestForm.address.trim(),

          p_adults: Number(adults),

          p_children: Number(children),

          p_special_request: guestForm.specialRequest.trim(),

          p_payment_method: 'pay_at_property',

        }

      )



      if (error) throw error



      if (!data?.success) {

        throw new Error(

          data?.message || 'Unable to create booking.'

        )

      }



      setBookingResult(data.booking)

      setSelectedRoom(null)

    } catch (error) {

      console.error('Booking error:', error)



      setMessage(

        error?.message || 'Unable to complete the booking.'

      )

    } finally {

      setBooking(false)

    }

  }



  const loadRazorpay = () => {

    return new Promise((resolve) => {

      if (typeof window === 'undefined') {

        resolve(false)

        return

      }



      if (window.Razorpay) {

        resolve(true)

        return

      }



      const existing = document.querySelector(

        'script[data-digital-dining-razorpay="true"]'

      )



      if (existing) {

        existing.addEventListener('load', () => resolve(true), {

          once: true,

        })

        existing.addEventListener('error', () => resolve(false), {

          once: true,

        })

        return

      }



      const script = document.createElement('script')

      script.src = 'https://checkout.razorpay.com/v1/checkout.js'

      script.async = true

      script.dataset.digitalDiningRazorpay = 'true'

      script.onload = () => resolve(true)

      script.onerror = () => resolve(false)

      document.body.appendChild(script)

    })

  }



  const startOnlinePayment = async () => {

    if (!selectedRoom || paymentLoading) return



    setPaymentLoading(true)

    setMessage('')



    try {

      const {

        cleanName,

        cleanMobile,

        cleanAlternate,

      } = getCleanGuestDetails()



      const loaded = await loadRazorpay()



      if (!loaded || !window.Razorpay) {

        throw new Error(

          'Unable to load Razorpay Checkout. Please check your connection and try again.'

        )

      }



      const createResponse = await fetch(

        '/api/resort/razorpay/create-order',

        {

          method: 'POST',

          headers: {

            'Content-Type': 'application/json',

          },

          body: JSON.stringify({

            restaurantCode,

            roomTypeId: selectedRoom.roomTypeId,

            checkIn,

            checkOut,

            guestName: cleanName,

            guestMobile: cleanMobile,

            guestEmail: guestForm.email.trim(),

            alternateMobile: cleanAlternate,

            guestAddress: guestForm.address.trim(),

            adults: Number(adults),

            children: Number(children),

            specialRequest: guestForm.specialRequest.trim(),

          }),

        }

      )



     const responseText = await createResponse.text()



let createData = {}



try {

  createData = responseText

    ? JSON.parse(responseText)

    : {}

} catch {

  createData = {

    message: responseText || 'Invalid server response.',

  }

}



if (!createResponse.ok || !createData?.success) {

  const serverMessage =

    createData?.message ||

    createData?.error ||

    `Server returned HTTP ${createResponse.status}`



  console.error('RESORT PAYMENT CREATE ORDER FAILED', {

    status: createResponse.status,

    statusText: createResponse.statusText,

    response: createData,

  })



  setMessage(

    `Online payment could not start: ${serverMessage}`

  )



  setPaymentLoading(false)

  return

}



      const options = {

        key: createData.keyId,

        amount: createData.amount,

        currency: createData.currency || 'INR',

        name: property?.propertyName || 'Resort Booking',

        description: `${selectedRoom.name} room booking`,

        order_id: createData.orderId,

        prefill: {

          name: cleanName,

          email: guestForm.email.trim(),

          contact: cleanMobile,

        },

        notes: {

          booking_code: createData.bookingCode,

        },

        theme: {

          color: '#171717',

        },

        handler: async (response) => {

          try {

            const verifyResponse = await fetch(

              '/api/resort/razorpay/verify-payment',

              {

                method: 'POST',

                headers: {

                  'Content-Type': 'application/json',

                },

                body: JSON.stringify({

                  bookingId: createData.bookingId,

                  razorpay_order_id: response.razorpay_order_id,

                  razorpay_payment_id: response.razorpay_payment_id,

                  razorpay_signature: response.razorpay_signature,

                }),

              }

            )



            const verifyData = await verifyResponse

              .json()

              .catch(() => ({}))



            if (!verifyResponse.ok || !verifyData?.success) {

              throw new Error(

                verifyData?.message ||

                  'Payment was received but verification did not complete.'

              )

            }



            setBookingResult(verifyData.booking)

            setSelectedRoom(null)

            setMessage('')

          } catch (verifyError) {

            console.error('Payment verification error:', verifyError)



            setMessage(

              verifyError?.message ||

                'Payment verification could not be completed. Please contact the property before paying again.'

            )

          } finally {

            setPaymentLoading(false)

          }

        },

        modal: {

          ondismiss: () => {

            setPaymentLoading(false)

            setMessage(

              'Payment was not completed. The temporary room hold will automatically expire if payment is not completed.'

            )

          },

        },

      }



      const razorpay = new window.Razorpay(options)



      razorpay.on('payment.failed', (response) => {

        console.error(

          'Razorpay payment failed:',

          response?.error || response

        )



        setMessage(

          response?.error?.description ||

            'Payment failed. Please try again.'

        )

        setPaymentLoading(false)

      })



      razorpay.open()

    } catch (error) {

      console.error('Online payment error:', error)



      setMessage(

        error?.message || 'Unable to start online payment.'

      )

      setPaymentLoading(false)

    }

  }





  if (loading) {



    return (



      <main className="min-h-screen bg-[#f7f7f5]">



        <div className="mx-auto max-w-6xl px-5 py-20">



          <div className="animate-pulse">



            <div className="h-8 w-52 rounded bg-neutral-200" />



            <div className="mt-4 h-4 w-80 rounded bg-neutral-200" />







            <div className="mt-10 h-96 rounded-3xl bg-neutral-200" />



          </div>



        </div>



      </main>



    )



  }







  if (!property) {



    return (



      <main className="flex min-h-screen items-center justify-center bg-[#f7f7f5] px-5">



        <div className="max-w-md text-center">



          <div className="text-4xl">🏨</div>







          <h1 className="mt-5 text-2xl font-semibold text-neutral-900">



            Resort unavailable



          </h1>







          <p className="mt-2 text-sm text-neutral-500">



            {message ||



              'This property is currently unavailable for online booking.'}



          </p>



        </div>



      </main>



    )



  }







  if (bookingResult) {



    return (



      <main className="min-h-screen bg-[#f7f7f5] px-4 py-10">



        <div className="mx-auto max-w-lg">



          <div className="rounded-3xl border border-neutral-200 bg-white p-7 shadow-sm">







            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-2xl">



              ✓



            </div>







            <div className="mt-5 text-center">



              <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600">



                Booking confirmed



              </p>







              <h1 className="mt-2 text-2xl font-semibold text-neutral-900">



                Your room is reserved



              </h1>







              <p className="mt-2 text-sm text-neutral-500">



                Keep this booking number for



                check-in.



              </p>



            </div>







            <div className="mt-7 rounded-2xl bg-neutral-50 p-5">







              <p className="text-xs text-neutral-500">



                Booking number



              </p>







              <p className="mt-1 font-mono text-lg font-semibold text-neutral-900">



                {bookingResult.bookingCode}



              </p>







              <div className="my-5 border-t border-neutral-200" />







              <div className="space-y-3 text-sm">







                <div className="flex justify-between gap-4">



                  <span className="text-neutral-500">



                    Room



                  </span>







                  <span className="text-right font-medium">



                    {bookingResult.roomTypeName}



                  </span>



                </div>







                <div className="flex justify-between gap-4">



                  <span className="text-neutral-500">



                    Stay



                  </span>







                  <span className="text-right font-medium">



                    {formatDate(



                      bookingResult.checkIn



                    )}



                    {' → '}



                    {formatDate(



                      bookingResult.checkOut



                    )}



                  </span>



                </div>







                <div className="flex justify-between gap-4">



                  <span className="text-neutral-500">



                    Nights



                  </span>







                  <span className="font-medium">



                    {bookingResult.nights}



                  </span>



                </div>







                <div className="flex justify-between gap-4">



                  <span className="text-neutral-500">



                    Payment



                  </span>







                  <span className="font-medium">



                    {bookingResult.paymentStatus === 'paid'

                      ? 'Paid online'

                      : 'Pay at property'}



                  </span>



                </div>







              </div>







              <div className="my-5 border-t border-neutral-200" />







              <div className="flex items-end justify-between">



                <span className="text-sm text-neutral-500">



                  Total



                </span>







                <span className="text-2xl font-semibold text-neutral-900">



                  {money(



                    bookingResult.totalAmount



                  )}



                </span>



              </div>



              {bookingResult.paymentStatus === 'paid' && (

                <div className="mt-3 flex items-center justify-between rounded-xl bg-emerald-50 px-3 py-2 text-xs text-emerald-800">

                  <span>Payment status</span>

                  <span className="font-semibold">Paid securely online</span>

                </div>

              )}







            </div>







            <button



              type="button"



              onClick={() =>



                window.location.reload()



              }



              className="mt-6 w-full rounded-xl bg-neutral-900 px-4 py-3.5 text-sm font-semibold text-white"



            >



              Back to resort



            </button>







          </div>



        </div>



      </main>



    )



  }







  return (



    <main className="min-h-screen bg-[#f7f7f5] text-neutral-900">







      {/* HEADER */}







      <header className="border-b border-neutral-200 bg-white">



        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4">







          <div>



            <p className="text-lg font-semibold">



              {property.propertyName}



            </p>







            <p className="mt-0.5 text-xs text-neutral-500">



              {property.city}



              {property.state



                ? `, ${property.state}`



                : ''}



            </p>



          </div>







          <a



            href={`tel:${property.phone}`}



            className="rounded-xl border border-neutral-200 px-4 py-2 text-xs font-medium"



          >



            Contact



          </a>







        </div>



      </header>











      {/* HERO */}







      <section className="mx-auto max-w-6xl px-5 pt-6">







        <div



          className="relative min-h-[400px] overflow-hidden rounded-3xl bg-neutral-900"



          style={



            property.heroImageUrl



              ? {



                  backgroundImage: `linear-gradient(to top, rgba(0,0,0,.68), rgba(0,0,0,.08)), url("${property.heroImageUrl}")`,



                  backgroundPosition:



                    'center',



                  backgroundSize:



                    'cover',



                }



              : undefined



          }



        >







          {!property.heroImageUrl && (



            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,#404040,#171717_65%)]" />



          )}







          <div className="absolute inset-x-0 bottom-0 p-6 text-white sm:p-10">







            <p className="text-sm font-medium text-white/70">



              {property.city},



              {' '}



              {property.state}



            </p>







            <h1 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight sm:text-5xl">



              {property.propertyName}



            </h1>







            {property.description && (



              <p className="mt-4 max-w-xl text-sm leading-6 text-white/75">



                {property.description}



              </p>



            )}







            <div className="mt-5 flex flex-wrap gap-3 text-xs text-white/80">







              <span>



                Check-in{' '}



                {String(



                  property.checkInTime || ''



                ).slice(0, 5)}



              </span>







              <span>•</span>







              <span>



                Check-out{' '}



                {String(



                  property.checkOutTime || ''



                ).slice(0, 5)}



              </span>







            </div>







          </div>







        </div>







      </section>











      {/* SEARCH */}







      <section className="mx-auto max-w-6xl px-5">







        <div className="-mt-5 relative z-10 rounded-2xl border border-neutral-200 bg-white p-4 shadow-lg shadow-black/5 sm:p-5">







          <div className="grid gap-3 md:grid-cols-5">







            <label>



              <span className="mb-1.5 block text-xs font-medium text-neutral-500">



                Check-in



              </span>







              <input



                type="date"



                min={minimumCheckIn}



                value={checkIn}



                onChange={(e) =>



                  setCheckIn(e.target.value)



                }



                className="w-full rounded-xl border border-neutral-200 px-3 py-3 text-sm outline-none focus:border-neutral-500"



              />



            </label>







            <label>



              <span className="mb-1.5 block text-xs font-medium text-neutral-500">



                Check-out



              </span>







              <input



                type="date"



                min={checkIn}



                value={checkOut}



                onChange={(e) =>



                  setCheckOut(



                    e.target.value



                  )



                }



                className="w-full rounded-xl border border-neutral-200 px-3 py-3 text-sm outline-none focus:border-neutral-500"



              />



            </label>







            <label>



              <span className="mb-1.5 block text-xs font-medium text-neutral-500">



                Adults



              </span>







              <select



                value={adults}



                onChange={(e) =>



                  setAdults(



                    Number(



                      e.target.value



                    )



                  )



                }



                className="w-full rounded-xl border border-neutral-200 px-3 py-3 text-sm outline-none"



              >



                {[1, 2, 3, 4, 5, 6].map(



                  (number) => (



                    <option



                      key={number}



                      value={number}



                    >



                      {number}



                    </option>



                  )



                )}



              </select>



            </label>







            <label>



              <span className="mb-1.5 block text-xs font-medium text-neutral-500">



                Children



              </span>







              <select



                value={children}



                onChange={(e) =>



                  setChildren(



                    Number(



                      e.target.value



                    )



                  )



                }



                className="w-full rounded-xl border border-neutral-200 px-3 py-3 text-sm outline-none"



              >



                {[0, 1, 2, 3, 4].map(



                  (number) => (



                    <option



                      key={number}



                      value={number}



                    >



                      {number}



                    </option>



                  )



                )}



              </select>



            </label>







            <button



              type="button"



              disabled={searching}



              onClick={checkAvailability}



              className="self-end rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50"



            >



              {searching



                ? 'Checking...'



                : 'Check availability'}



            </button>







          </div>







        </div>







      </section>











      {/* MESSAGE */}







      {message && (



        <div className="mx-auto mt-5 max-w-6xl px-5">



          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">



            {message}



          </div>



        </div>



      )}











      {/* AVAILABLE ROOMS */}







      <section className="mx-auto max-w-6xl px-5 py-12">







        <div>



          <h2 className="text-2xl font-semibold tracking-tight">



            {availableRooms.length



              ? 'Available rooms'



              : 'Our rooms'}



          </h2>







          <p className="mt-1 text-sm text-neutral-500">



            Choose the room that suits your stay.



          </p>



        </div>







        <div className="mt-6 grid gap-5 md:grid-cols-2">







          {(availableRooms.length



            ? availableRooms



            : roomTypes



          ).map((room) => {







            const isAvailability =



              room.roomTypeId







            const images =



              room.imageUrls || []







            const displayPrice =



              room.nightlyRate ??



              room.discountPrice ??



              room.basePrice







            return (



              <article



                key={



                  room.roomTypeId ||



                  room.id



                }



                className="overflow-hidden rounded-2xl border border-neutral-200 bg-white"



              >







                <div className="aspect-[16/9] bg-neutral-100">







                  {images[0] ? (



                    <img



                      src={images[0]}



                      alt={room.name}



                      className="h-full w-full object-cover"



                    />



                  ) : (



                    <div className="flex h-full items-center justify-center text-sm text-neutral-400">



                      Room photo



                    </div>



                  )}







                </div>







                <div className="p-5">







                  <div className="flex items-start justify-between gap-4">







                    <div>



                      <h3 className="text-lg font-semibold">



                        {room.name}



                      </h3>







                      <p className="mt-1 text-sm text-neutral-500">



                        {room.bedType}



                        {' • '}



                        Up to{' '}



                        {room.maxGuests}{' '}



                        guests



                      </p>



                    </div>







                    {room.breakfastIncluded && (



                      <span className="shrink-0 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-medium text-emerald-700">



                        Breakfast



                      </span>



                    )}







                  </div>







                  {room.description && (



                    <p className="mt-4 text-sm leading-6 text-neutral-600">



                      {room.description}



                    </p>



                  )}







                  {!!room.amenities?.length && (



                    <div className="mt-4 flex flex-wrap gap-2">







                      {room.amenities.map(



                        (amenity) => (



                          <span



                            key={amenity}



                            className="rounded-lg bg-neutral-100 px-2.5 py-1.5 text-xs text-neutral-600"



                          >



                            {amenity}



                          </span>



                        )



                      )}







                    </div>



                  )}







                  <div className="mt-6 flex items-end justify-between gap-4 border-t border-neutral-100 pt-5">







                    <div>



                      <p className="text-xl font-semibold">



                        {money(



                          displayPrice



                        )}



                      </p>







                      <p className="mt-0.5 text-xs text-neutral-500">



                        per night



                      </p>



                    </div>







                    {isAvailability ? (



                      <button



                        type="button"



                        onClick={() =>



                          setSelectedRoom(



                            room



                          )



                        }



                        className="rounded-xl bg-neutral-900 px-5 py-3 text-sm font-semibold text-white"



                      >



                        Book room



                      </button>



                    ) : (



                      <button



                        type="button"



                        onClick={



                          checkAvailability



                        }



                        className="rounded-xl border border-neutral-300 px-5 py-3 text-sm font-medium"



                      >



                        Check dates



                      </button>



                    )}







                  </div>







                  {isAvailability && (



                    <div className="mt-4 rounded-xl bg-neutral-50 p-4">







                      <div className="flex justify-between text-sm">



                        <span className="text-neutral-500">



                          Room



                        </span>







                        <span>



                          {money(



                            room.subtotal



                          )}



                        </span>



                      </div>







                      <div className="mt-2 flex justify-between text-sm">



                        <span className="text-neutral-500">



                          GST{' '}



                          {room.gstRate}%



                        </span>







                        <span>



                          {money(



                            room.taxAmount



                          )}



                        </span>



                      </div>







                      <div className="mt-3 flex justify-between border-t border-neutral-200 pt-3">



                        <span className="font-medium">



                          Total



                        </span>







                        <span className="font-semibold">



                          {money(



                            room.totalAmount



                          )}



                        </span>



                      </div>







                      <p className="mt-2 text-xs text-neutral-500">



                        {room.availableRooms}{' '}



                        room



                        {room.availableRooms ===



                        1



                          ? ''



                          : 's'}{' '}



                        available



                      </p>







                    </div>



                  )}







                </div>







              </article>



            )



          })}







        </div>







      </section>











      {/* PROPERTY DETAILS */}







      <section className="border-t border-neutral-200 bg-white">







        <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 md:grid-cols-2">







          <div>



            <h2 className="text-lg font-semibold">



              Property information



            </h2>







            <p className="mt-3 text-sm leading-6 text-neutral-600">



              {property.address}



              <br />



              {property.city},{' '}



              {property.state}{' '}



              {property.pincode}



              <br />



              {property.country}



            </p>



          </div>







          <div>



            <h2 className="text-lg font-semibold">



              Contact



            </h2>







            <div className="mt-3 space-y-2 text-sm text-neutral-600">







              {property.phone && (



                <p>



                  {property.phone}



                </p>



              )}







              {property.email && (



                <p>



                  {property.email}



                </p>



              )}







            </div>



          </div>







        </div>







      </section>











      {/* BOOKING MODAL */}







      {selectedRoom && (



        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-5">







          <div className="max-h-[95dvh] w-full max-w-xl overflow-y-auto rounded-t-3xl bg-white sm:rounded-3xl">







            <div className="sticky top-0 flex items-center justify-between border-b border-neutral-200 bg-white px-5 py-4">







              <div>



                <p className="font-semibold">



                  Complete booking



                </p>







                <p className="mt-0.5 text-xs text-neutral-500">



                  {selectedRoom.name}



                </p>



              </div>







              <button



                type="button"



                onClick={() =>



                  setSelectedRoom(null)



                }



                className="flex h-9 w-9 items-center justify-center rounded-full bg-neutral-100"



              >



                ×



              </button>







            </div>







            <form



              onSubmit={createBooking}



              className="space-y-4 p-5"



            >







              <div className="grid grid-cols-2 gap-3">







                <div className="rounded-xl bg-neutral-50 p-3">



                  <p className="text-xs text-neutral-500">



                    Check-in



                  </p>







                  <p className="mt-1 text-sm font-medium">



                    {formatDate(



                      checkIn



                    )}



                  </p>



                </div>







                <div className="rounded-xl bg-neutral-50 p-3">



                  <p className="text-xs text-neutral-500">



                    Check-out



                  </p>







                  <p className="mt-1 text-sm font-medium">



                    {formatDate(



                      checkOut



                    )}



                  </p>



                </div>







              </div>







              <label className="block">



                <span className="mb-1.5 block text-xs font-medium text-neutral-600">



                  Guest name *



                </span>







                <input



                  required



                  value={



                    guestForm.name



                  }



                  onChange={(e) =>



                    updateGuest(



                      'name',



                      e.target.value



                    )



                  }



                  className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm outline-none focus:border-neutral-500"



                  placeholder="Full name"



                />



              </label>







              <div className="grid gap-4 sm:grid-cols-2">







                <label>



                  <span className="mb-1.5 block text-xs font-medium text-neutral-600">



                    Mobile *



                  </span>







                  <input



                    required



                    inputMode="tel"



                    value={



                      guestForm.mobile



                    }



                    onChange={(e) =>



                      updateGuest(



                        'mobile',



                        e.target.value



                      )



                    }



                    className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm outline-none focus:border-neutral-500"



                    placeholder="Mobile number"



                  />



                </label>







                <label>



                  <span className="mb-1.5 block text-xs font-medium text-neutral-600">



                    Alternate mobile



                  </span>







                  <input



                    inputMode="tel"



                    value={



                      guestForm.alternateMobile



                    }



                    onChange={(e) =>



                      updateGuest(



                        'alternateMobile',



                        e.target.value



                      )



                    }



                    className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm outline-none focus:border-neutral-500"



                    placeholder="Optional"



                  />



                </label>







              </div>







              <label className="block">



                <span className="mb-1.5 block text-xs font-medium text-neutral-600">



                  Email



                </span>







                <input



                  type="email"



                  value={



                    guestForm.email



                  }



                  onChange={(e) =>



                    updateGuest(



                      'email',



                      e.target.value



                    )



                  }



                  className="w-full rounded-xl border border-neutral-200 px-4 py-3 text-sm outline-none focus:border-neutral-500"



                  placeholder="Email address"



                />



              </label>







              <label className="block">



                <span className="mb-1.5 block text-xs font-medium text-neutral-600">



                  Address



                </span>







                <textarea



                  rows={3}



                  value={



                    guestForm.address



                  }



                  onChange={(e) =>



                    updateGuest(



                      'address',



                      e.target.value



                    )



                  }



                  className="w-full resize-none rounded-xl border border-neutral-200 px-4 py-3 text-sm outline-none focus:border-neutral-500"



                  placeholder="Guest address"



                />



              </label>







              <label className="block">



                <span className="mb-1.5 block text-xs font-medium text-neutral-600">



                  Special request



                </span>







                <textarea



                  rows={3}



                  value={



                    guestForm.specialRequest



                  }



                  onChange={(e) =>



                    updateGuest(



                      'specialRequest',



                      e.target.value



                    )



                  }



                  className="w-full resize-none rounded-xl border border-neutral-200 px-4 py-3 text-sm outline-none focus:border-neutral-500"



                  placeholder="Early check-in, extra bed, etc."



                />



              </label>











              <div className="rounded-2xl border border-neutral-200 p-4">







                <div className="flex justify-between text-sm">







                  <span className="text-neutral-500">



                    {selectedRoom.nights}{' '}



                    night



                    {selectedRoom.nights ===



                    1



                      ? ''



                      : 's'}



                  </span>







                  <span>



                    {money(



                      selectedRoom.subtotal



                    )}



                  </span>







                </div>







                <div className="mt-2 flex justify-between text-sm">







                  <span className="text-neutral-500">



                    GST{' '}



                    {selectedRoom.gstRate}%



                  </span>







                  <span>



                    {money(



                      selectedRoom.taxAmount



                    )}



                  </span>







                </div>







                <div className="mt-4 flex justify-between border-t border-neutral-200 pt-4">







                  <span className="font-medium">



                    Total



                  </span>







                  <span className="text-xl font-semibold">



                    {money(



                      selectedRoom.totalAmount



                    )}



                  </span>







                </div>







              </div>











              <div>

                <p className="mb-2 text-xs font-medium text-neutral-600">

                  Payment method

                </p>



                <div

                  className={`grid gap-3 ${

                    property.payAtProperty ? 'grid-cols-2' : 'grid-cols-1'

                  }`}

                >

                  {property.payAtProperty && (

                    <button

                      type="button"

                      onClick={() => setPaymentMethod('pay_at_property')}

                      className={`rounded-xl border p-4 text-left transition ${

                        paymentMethod === 'pay_at_property'

                          ? 'border-neutral-900 bg-neutral-50 ring-1 ring-neutral-900'

                          : 'border-neutral-200 bg-white'

                      }`}

                    >

                      <div className="flex items-start justify-between gap-2">

                        <div>

                          <p className="text-sm font-semibold text-neutral-900">

                            Pay at property

                          </p>

                          <p className="mt-1 text-xs leading-5 text-neutral-500">

                            Reserve now and pay during your stay.

                          </p>

                        </div>



                        <span

                          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${

                            paymentMethod === 'pay_at_property'

                              ? 'border-neutral-900 bg-neutral-900 text-white'

                              : 'border-neutral-300'

                          }`}

                        >

                          {paymentMethod === 'pay_at_property' ? '✓' : ''}

                        </span>

                      </div>

                    </button>

                  )}



                  <button

                    type="button"

                    onClick={() => setPaymentMethod('razorpay')}

                    className={`rounded-xl border p-4 text-left transition ${

                      paymentMethod === 'razorpay'

                        ? 'border-[#2b65f9] bg-blue-50 ring-1 ring-[#2b65f9]'

                        : 'border-neutral-200 bg-white'

                    }`}

                  >

                    <div className="flex items-start justify-between gap-2">

                      <div>

                        <p className="text-sm font-semibold text-neutral-900">

                          Pay online

                        </p>

                        <p className="mt-1 text-xs leading-5 text-neutral-500">

                          Secure payment through Razorpay.

                        </p>

                      </div>



                      <span

                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${

                          paymentMethod === 'razorpay'

                            ? 'border-[#2b65f9] bg-[#2b65f9] text-white'

                            : 'border-neutral-300'

                        }`}

                      >

                        {paymentMethod === 'razorpay' ? '✓' : ''}

                      </span>

                    </div>

                  </button>

                </div>



                {paymentMethod === 'razorpay' && (

                  <p className="mt-2 text-[11px] leading-5 text-neutral-500">

                    Your room is temporarily held while Razorpay Checkout is

                    open. Final amount and room availability are verified again

                    by the server.

                  </p>

                )}

              </div>



              {message && (

                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs leading-5 text-amber-900">

                  {message}

                </div>

              )}



              {paymentMethod === 'pay_at_property' ? (

                <button

                  type="submit"

                  disabled={booking || !property.payAtProperty}

                  className="w-full rounded-xl bg-neutral-900 px-4 py-3.5 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"

                >

                  {booking

                    ? 'Confirming booking...'

                    : `Confirm booking • ${money(

                        selectedRoom.totalAmount

                      )}`}

                </button>

              ) : (

                <button

                  type="button"

                  disabled={paymentLoading}

                  onClick={startOnlinePayment}

                  className="w-full rounded-xl bg-[#2b65f9] px-4 py-3.5 text-sm font-semibold text-white transition hover:bg-[#1f56df] disabled:cursor-not-allowed disabled:opacity-50"

                >

                  {paymentLoading

                    ? 'Starting secure payment...'

                    : `Pay ${money(selectedRoom.totalAmount)} securely`}

                </button>

              )}







              <p className="text-center text-[11px] leading-5 text-neutral-400">



                Availability and final pricing are checked again securely when you confirm.



              </p>







            </form>







          </div>







        </div>



      )}







    </main>



  )



}