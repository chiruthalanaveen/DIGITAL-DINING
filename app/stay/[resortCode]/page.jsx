'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const money = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const today = new Date().toISOString().slice(0, 10)
const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10)

export default function ResortStayPage() {
  const params = useParams()
  const router = useRouter()
  const resortCode = String(params?.resortCode || '').trim()
  const [resort, setResort] = useState(null)
  const [rooms, setRooms] = useState([])
  const [checkIn, setCheckIn] = useState(today)
  const [checkOut, setCheckOut] = useState(tomorrow)
  const [adults, setAdults] = useState(2)
  const [children, setChildren] = useState(0)
  const [loading, setLoading] = useState(true)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState('')
  const [selectedRoom, setSelectedRoom] = useState(null)
  const [guest, setGuest] = useState({ name: '', mobile: '', email: '', address: '', specialRequest: '' })
  const [paymentMode, setPaymentMode] = useState('online')
  const [booking, setBooking] = useState(null)
  const [paymentLoading, setPaymentLoading] = useState(false)

  const nights = useMemo(() => {
    const a = new Date(`${checkIn}T00:00:00`)
    const b = new Date(`${checkOut}T00:00:00`)
    return Math.max(0, Math.round((b - a) / 86400000))
  }, [checkIn, checkOut])

  const loadResort = useCallback(async () => {
    if (!resortCode) return
    setLoading(true)
    setError('')
    try {
      const { data, error: rpcError } = await supabase.rpc('get_public_resort', { p_resort_code: resortCode })
      if (rpcError) throw rpcError
      if (!data?.success) throw new Error(data?.message || 'Resort not found.')
      setResort(data.resort)
    } catch (e) {
      console.error(e)
      setError('This Resort QR link is invalid or the resort is unavailable.')
    } finally { setLoading(false) }
  }, [resortCode])

  useEffect(() => { loadResort() }, [loadResort])

  const searchRooms = async (event) => {
    event?.preventDefault()
    setError('')
    setBooking(null)
    setSelectedRoom(null)
    if (!checkIn || !checkOut || new Date(`${checkOut}T00:00:00`) <= new Date(`${checkIn}T00:00:00`)) {
      setError('Please select a valid check-in and check-out date.')
      return
    }
    setSearching(true)
    try {
      const { data, error: rpcError } = await supabase.rpc('get_public_resort_availability', {
        p_resort_code: resortCode,
        p_check_in: checkIn,
        p_check_out: checkOut,
        p_adults: Number(adults),
        p_children: Number(children),
      })
      if (rpcError) throw rpcError
      if (!data?.success) throw new Error(data?.message || 'Unable to search rooms.')
      setRooms(Array.isArray(data.rooms) ? data.rooms.filter((room) => Number(room.available_room_count || 0) > 0) : [])
      if (!data.rooms?.length) setError('No rooms are available for the selected dates and guests.')
    } catch (e) {
      console.error(e)
      setError(e.message || 'Unable to search rooms.')
      setRooms([])
    } finally { setSearching(false) }
  }

  const createOnlineBooking = async () => {
    const room = selectedRoom
    if (!room?.room_id && !room?.room_type_id) return
    if (!guest.name.trim() || !/^\d{10}$/.test(guest.mobile.trim())) {
      setError('Enter guest name and a valid 10-digit mobile number.')
      return
    }
    setPaymentLoading(true)
    setError('')
    try {
      const response = await fetch('/api/resort/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resortCode,
          roomTypeId: room.room_type_id,
          checkIn,
          checkOut,
          adults: Number(adults),
          children: Number(children),
          guestName: guest.name.trim(),
          guestMobile: guest.mobile.trim(),
          guestEmail: guest.email.trim(),
          guestAddress: guest.address.trim(),
          specialRequest: guest.specialRequest.trim(),
        }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data?.success) throw new Error(data?.message || 'Unable to start payment.')
      const keyId = data.keyId
      const options = {
        key: keyId,
        amount: data.order.amount,
        currency: data.order.currency || 'INR',
        name: resort?.name || 'Digital Dining Stay',
        description: `${room.name} • ${nights} night(s)`,
        order_id: data.order.id,
        prefill: { name: guest.name.trim(), email: guest.email.trim(), contact: guest.mobile.trim() },
        theme: { color: '#f97316' },
        handler: async (razorpayResponse) => {
          const verify = await fetch('/api/resort/verify-payment', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              bookingId: data.bookingId,
              razorpayOrderId: razorpayResponse.razorpay_order_id,
              razorpayPaymentId: razorpayResponse.razorpay_payment_id,
              razorpaySignature: razorpayResponse.razorpay_signature,
            }),
          })
          const verified = await verify.json().catch(() => ({}))
          if (!verify.ok || !verified?.success) throw new Error(verified?.message || 'Payment verification failed.')
          setBooking(verified.booking)
          setSelectedRoom(null)
        },
        modal: { ondismiss: () => setPaymentLoading(false) },
      }
      if (typeof window.Razorpay !== 'function') throw new Error('Razorpay is still loading. Please try again.')
      const payment = new window.Razorpay(options)
      payment.on('payment.failed', () => setError('Payment failed. Please try again.'))
      payment.open()
    } catch (e) {
      console.error(e)
      setError(e.message || 'Unable to start payment.')
    } finally { setPaymentLoading(false) }
  }

  const createPayAtPropertyBooking = async () => {
    if (!selectedRoom) return
    if (!guest.name.trim() || !/^\d{10}$/.test(guest.mobile.trim())) {
      setError('Enter guest name and a valid 10-digit mobile number.')
      return
    }
    setPaymentLoading(true); setError('')
    try {
      const response = await fetch('/api/resort/create-booking', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ resortCode, roomTypeId: selectedRoom.room_type_id, checkIn, checkOut, adults: Number(adults), children: Number(children), guestName: guest.name.trim(), guestMobile: guest.mobile.trim(), guestEmail: guest.email.trim(), guestAddress: guest.address.trim(), specialRequest: guest.specialRequest.trim() }),
      })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data?.success) throw new Error(data?.message || 'Unable to create booking.')
      setBooking(data.booking)
      setSelectedRoom(null)
    } catch (e) { console.error(e); setError(e.message || 'Unable to create booking.') } finally { setPaymentLoading(false) }
  }

  const bookingTotal = selectedRoom ? Number(selectedRoom.total_amount || 0) : 0

  if (loading) return <div className="min-h-screen bg-neutral-950 text-white grid place-items-center p-6"><p>Loading Resort…</p></div>
  if (error && !resort) return <div className="min-h-screen bg-neutral-950 text-white grid place-items-center p-6 text-center"><div><div className="text-5xl">🏨</div><h1 className="text-xl font-black mt-3">Resort unavailable</h1><p className="text-sm text-neutral-400 mt-2">{error}</p></div></div>

  return (
    <main className="min-h-screen bg-neutral-50 text-neutral-900 pb-10">
      <section className="relative overflow-hidden bg-neutral-950 text-white">
        {resort?.cover_image_url && <img src={resort.cover_image_url} alt="" className="absolute inset-0 w-full h-full object-cover opacity-30" />}
        <div className="relative max-w-md mx-auto px-5 py-8">
          <div className="w-16 h-16 rounded-2xl bg-white grid place-items-center overflow-hidden shadow-xl">{resort?.logo_url ? <img src={resort.logo_url} alt={resort.name} className="w-full h-full object-contain p-2" /> : <span className="text-neutral-900 text-2xl font-black">{String(resort?.name || 'R').charAt(0)}</span>}</div>
          <h1 className="text-3xl font-black mt-4">{resort?.name}</h1>
          <p className="text-sm text-white/70 mt-2">{resort?.description || 'Book your stay directly with Digital Dining Stay.'}</p>
        </div>
      </section>

      <section className="max-w-md mx-auto -mt-5 relative px-4">
        <form onSubmit={searchRooms} className="bg-white rounded-3xl shadow-xl border border-neutral-200 p-4 space-y-3">
          <div className="grid grid-cols-2 gap-3"><label className="text-xs font-bold">Check-in<input min={today} type="date" value={checkIn} onChange={e=>setCheckIn(e.target.value)} className="w-full mt-1 border border-neutral-200 rounded-xl px-3 py-3 text-sm"/></label><label className="text-xs font-bold">Check-out<input min={tomorrow} type="date" value={checkOut} onChange={e=>setCheckOut(e.target.value)} className="w-full mt-1 border border-neutral-200 rounded-xl px-3 py-3 text-sm"/></label></div>
          <div className="grid grid-cols-2 gap-3"><label className="text-xs font-bold">Adults<input min="1" type="number" value={adults} onChange={e=>setAdults(Math.max(1,Number(e.target.value)||1))} className="w-full mt-1 border border-neutral-200 rounded-xl px-3 py-3 text-sm"/></label><label className="text-xs font-bold">Children<input min="0" type="number" value={children} onChange={e=>setChildren(Math.max(0,Number(e.target.value)||0))} className="w-full mt-1 border border-neutral-200 rounded-xl px-3 py-3 text-sm"/></label></div>
          <button disabled={searching} className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-black py-3.5 rounded-2xl text-sm">{searching?'Searching…':'Search Available Rooms'}</button>
        </form>
      </section>

      {error && resort && <div className="max-w-md mx-auto px-4 mt-4"><div className="bg-red-50 border border-red-200 text-red-700 rounded-2xl p-3 text-xs font-bold">{error}</div></div>}

      {booking && <section className="max-w-md mx-auto px-4 mt-5"><div className="bg-emerald-50 border border-emerald-200 rounded-3xl p-5"><div className="text-4xl">🎉</div><h2 className="text-xl font-black mt-2">Booking Confirmed</h2><p className="text-xs text-neutral-600 mt-1">{booking.booking_number}</p><div className="mt-4 grid grid-cols-2 gap-3 text-xs"><div><p className="text-neutral-500">Check-in</p><p className="font-bold">{booking.check_in}</p></div><div><p className="text-neutral-500">Check-out</p><p className="font-bold">{booking.check_out}</p></div><div><p className="text-neutral-500">Room</p><p className="font-bold">{booking.room_type || 'Selected Room'}</p></div><div><p className="text-neutral-500">Total</p><p className="font-black text-orange-600">{money(booking.total_amount)}</p></div></div><button type="button" onClick={()=>window.print()} className="w-full mt-4 bg-neutral-900 text-white py-3 rounded-xl text-xs font-black">Print Booking</button></div></section>}

      <section className="max-w-md mx-auto px-4 mt-6 space-y-4">
        {rooms.map((room) => <article key={room.room_type_id} className="bg-white border border-neutral-200 rounded-3xl overflow-hidden shadow-sm"><div className="aspect-[16/10] bg-neutral-100">{room.images?.[0] ? <img src={room.images[0]} alt={room.name} className="w-full h-full object-cover"/> : <div className="w-full h-full grid place-items-center text-5xl">🛏️</div>}</div><div className="p-5"><div className="flex items-start justify-between gap-3"><div><h2 className="text-lg font-black">{room.name}</h2><p className="text-xs text-neutral-500 mt-1">{room.bed_type} • Up to {room.max_guests} guests</p></div><span className="bg-emerald-50 text-emerald-700 px-2.5 py-1 rounded-full text-[10px] font-black">{room.available_room_count} available</span></div><p className="text-xs text-neutral-500 mt-3 line-clamp-3">{room.description}</p><div className="flex flex-wrap gap-1.5 mt-3">{(room.amenities||[]).slice(0,6).map((a)=><span key={a} className="bg-neutral-100 rounded-full px-2 py-1 text-[9px] font-bold text-neutral-600">{a}</span>)}</div><div className="flex items-end justify-between mt-5"><div><p className="text-xs text-neutral-500">From</p><p className="text-xl font-black text-orange-600">{money(room.discounted_price_per_night || room.price_per_night)}<span className="text-xs text-neutral-400 font-bold"> / night</span></p><p className="text-[10px] text-neutral-400">GST included in estimate • {nights} night(s)</p></div><button type="button" onClick={()=>setSelectedRoom(room)} className="bg-neutral-900 text-white px-4 py-3 rounded-xl text-xs font-black">View & Book</button></div></div></article>)}
        {!searching && rooms.length===0 && !booking && <div className="bg-white border border-neutral-200 rounded-3xl p-10 text-center"><div className="text-5xl">🛏️</div><p className="font-black mt-3">Search for your dates</p><p className="text-xs text-neutral-500 mt-1">Available room types will appear here.</p></div>}
      </section>

      {selectedRoom && <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"><div className="absolute inset-0 bg-black/60" onClick={()=>setSelectedRoom(null)} /><div className="relative bg-white w-full sm:max-w-md max-h-[92vh] overflow-y-auto rounded-t-[30px] sm:rounded-[30px] p-5"><div className="flex justify-between items-start"><div><p className="text-[10px] uppercase tracking-widest text-neutral-400 font-black">Room</p><h2 className="text-2xl font-black mt-1">{selectedRoom.name}</h2></div><button type="button" onClick={()=>setSelectedRoom(null)} className="w-10 h-10 rounded-full bg-neutral-100">✕</button></div><div className="mt-5 bg-neutral-50 rounded-2xl p-4 text-xs space-y-2"><div className="flex justify-between"><span>Room rate</span><span className="font-bold">{money(selectedRoom.discounted_price_per_night)} × {nights}</span></div><div className="flex justify-between"><span>Subtotal</span><span>{money(selectedRoom.discounted_price_per_night*nights)}</span></div><div className="flex justify-between"><span>GST</span><span>{money(selectedRoom.tax_amount)}</span></div><div className="border-t pt-2 flex justify-between text-base font-black"><span>Total</span><span className="text-orange-600">{money(bookingTotal || selectedRoom.total_amount)}</span></div></div><div className="mt-5 space-y-3"><input value={guest.name} onChange={e=>setGuest({...guest,name:e.target.value})} placeholder="Guest name" className="w-full border border-neutral-200 rounded-xl px-3 py-3 text-sm"/><input value={guest.mobile} onChange={e=>setGuest({...guest,mobile:e.target.value.replace(/\D/g,'').slice(0,10)})} placeholder="10-digit mobile" className="w-full border border-neutral-200 rounded-xl px-3 py-3 text-sm"/><input value={guest.email} onChange={e=>setGuest({...guest,email:e.target.value})} placeholder="Email (optional)" type="email" className="w-full border border-neutral-200 rounded-xl px-3 py-3 text-sm"/><textarea value={guest.address} onChange={e=>setGuest({...guest,address:e.target.value})} placeholder="Address (optional)" className="w-full border border-neutral-200 rounded-xl px-3 py-3 text-sm min-h-20"/><textarea value={guest.specialRequest} onChange={e=>setGuest({...guest,specialRequest:e.target.value})} placeholder="Special request (optional)" className="w-full border border-neutral-200 rounded-xl px-3 py-3 text-sm min-h-20"/><div className="grid grid-cols-2 gap-2"><button type="button" onClick={()=>setPaymentMode('online')} className={`py-3 rounded-xl text-xs font-black border ${paymentMode==='online'?'bg-orange-500 text-white border-orange-500':'bg-white border-neutral-200'}`}>Pay Online</button><button type="button" disabled={!resort?.pay_at_property} onClick={()=>setPaymentMode('pay_at_property')} className={`py-3 rounded-xl text-xs font-black border ${paymentMode==='pay_at_property'?'bg-neutral-900 text-white border-neutral-900':'bg-white border-neutral-200'} disabled:opacity-40`}>Pay at Property</button></div><button disabled={paymentLoading} type="button" onClick={paymentMode==='online'?createOnlineBooking:createPayAtPropertyBooking} className="w-full bg-neutral-900 hover:bg-black disabled:opacity-50 text-white font-black py-4 rounded-2xl text-sm">{paymentLoading?'Processing…':paymentMode==='online'?`Pay ${money(bookingTotal || selectedRoom.total_amount)} & Book`:'Confirm Booking'}</button></div></div></div>}
    </main>
  )
}
