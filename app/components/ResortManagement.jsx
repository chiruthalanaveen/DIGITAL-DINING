'use client'



import { useEffect, useMemo, useState } from 'react'

import { supabase } from '@/lib/supabase'

import PaymentGatewayConfigCard from '@/app/components/PaymentGatewayConfigCard'
import { appNotice } from '@/lib/appDialog'




const emptyType = {

  name: '',

  description: '',

  bed_type: 'King',

  max_guests: 2,

  base_price: '',

  discount_price: '',

  gst_rate: 12,

  breakfast_included: false,

  amenities: '',

  image_urls: '',

}



const emptyRoom = {

  room_type_id: '',

  room_number: '',

  floor: '',

  status: 'available',

}



const emptyProperty = {

  property_name: '',

  address: '',

  city: '',

  state: '',

  country: 'India',

  pincode: '',

  phone: '',

  email: '',

  check_in_time: '14:00',

  check_out_time: '11:00',

}



export default function ResortManagement({ restaurant, allowPaymentSettings = true }) {

  const restaurantId = String(restaurant?.id || '')

  const restaurantCode = String(restaurant?.restaurant_code || '')



  const [tab, setTab] = useState('overview')

  const [property, setProperty] = useState(null)

  const [types, setTypes] = useState([])

  const [rooms, setRooms] = useState([])

  const [bookings, setBookings] = useState([])

  const [loading, setLoading] = useState(true)

  const [saving, setSaving] = useState(false)

  const [typeForm, setTypeForm] = useState(emptyType)

  const [roomForm, setRoomForm] = useState(emptyRoom)

  const [propertyForm, setPropertyForm] = useState(emptyProperty)



  const baseUrl =

    typeof window !== 'undefined'

      ? window.location.origin

      : 'https://digitaldine-in.online'



  const resortUrl = `${baseUrl}/stay/${encodeURIComponent(restaurantCode)}`

  const qrUrl = (value) =>

    `https://quickchart.io/qr?size=320&margin=2&text=${encodeURIComponent(value)}`



  const load = async () => {

    if (!restaurantId) return



    setLoading(true)



    try {

      const [p, t, r, b] = await Promise.all([

        supabase

          .from('resort_properties')

          .select('*')

          .eq('restaurant_id', restaurantId)

          .maybeSingle(),

        supabase

          .from('room_types')

          .select('*')

          .eq('restaurant_id', restaurantId)

          .order('created_at', { ascending: false }),

        supabase

          .from('rooms')

          .select('*, room_types(name)')

          .eq('restaurant_id', restaurantId)

          .order('room_number'),

        supabase

          .from('room_bookings')

          .select('*, room_types(name), rooms(room_number)')

          .eq('restaurant_id', restaurantId)

          .order('created_at', { ascending: false })

          .limit(100),

      ])



      for (const result of [p, t, r, b]) {

        if (result.error) throw result.error

      }



      setProperty(p.data || null)

      setTypes(t.data || [])

      setRooms(r.data || [])

      setBookings(b.data || [])



      if (p.data) {

        setPropertyForm({

          property_name: p.data.property_name || '',

          address: p.data.address || '',

          city: p.data.city || '',

          state: p.data.state || '',

          country: p.data.country || 'India',

          pincode: p.data.pincode || '',

          phone: p.data.phone || '',

          email: p.data.email || '',

          check_in_time: p.data.check_in_time || '14:00',

          check_out_time: p.data.check_out_time || '11:00',

        })

      } else {

        setPropertyForm(emptyProperty)

      }

    } catch (error) {

      console.error('Resort load error:', error)

      appNotice(`Unable to load Resort Management: ${error.message}`)

    } finally {

      setLoading(false)

    }

  }



  useEffect(() => {

    load()

    // eslint-disable-next-line react-hooks/exhaustive-deps

  }, [restaurantId])



  useEffect(() => {

    if (!allowPaymentSettings && tab === 'payments') {

      setTab('overview')

    }

  }, [allowPaymentSettings, tab])



  const stats = useMemo(

    () => ({

      total: rooms.length,

      available: rooms.filter((item) => item.status === 'available').length,

      occupied: rooms.filter((item) => item.status === 'checked_in').length,

      active: bookings.filter((item) =>

        ['pending', 'confirmed', 'checked_in'].includes(item.booking_status)

      ).length,

    }),

    [rooms, bookings]

  )



  const saveProperty = async (event) => {

    event.preventDefault()

    setSaving(true)



    try {

      const payload = {

        restaurant_id: restaurantId,

        ...propertyForm,

      }



      const { error } = await supabase

        .from('resort_properties')

        .upsert(payload, { onConflict: 'restaurant_id' })



      if (error) throw error

      appNotice('Resort settings saved.')

      await load()

    } catch (error) {

      appNotice(error.message)

    } finally {

      setSaving(false)

    }

  }



  const addType = async (event) => {

    event.preventDefault()

    setSaving(true)



    try {

      const payload = {

        restaurant_id: restaurantId,

        name: typeForm.name.trim(),

        description: typeForm.description.trim(),

        bed_type: typeForm.bed_type,

        max_guests: Number(typeForm.max_guests) || 1,

        base_price: Number(typeForm.base_price) || 0,

        discount_price:

          typeForm.discount_price === '' ? null : Number(typeForm.discount_price),

        gst_rate: Number(typeForm.gst_rate) || 0,

        breakfast_included: Boolean(typeForm.breakfast_included),

        amenities: typeForm.amenities

          .split(',')

          .map((item) => item.trim())

          .filter(Boolean),

        image_urls: typeForm.image_urls

          .split('\n')

          .map((item) => item.trim())

          .filter(Boolean),

        is_active: true,

      }



      if (!payload.name || payload.base_price <= 0) {

        throw new Error('Room type name and valid base price are required.')

      }



      const { error } = await supabase.from('room_types').insert(payload)

      if (error) throw error



      setTypeForm(emptyType)

      await load()

    } catch (error) {

      appNotice(error.message)

    } finally {

      setSaving(false)

    }

  }



  const addRoom = async (event) => {

    event.preventDefault()

    setSaving(true)



    try {

      if (!roomForm.room_type_id || !roomForm.room_number.trim()) {

        throw new Error('Room type and room number are required.')

      }



      const { error } = await supabase.from('rooms').insert({

        restaurant_id: restaurantId,

        room_type_id: roomForm.room_type_id,

        room_number: roomForm.room_number.trim(),

        floor: roomForm.floor.trim(),

        status: roomForm.status,

      })



      if (error) throw error



      setRoomForm(emptyRoom)

      await load()

    } catch (error) {

      appNotice(error.message)

    } finally {

      setSaving(false)

    }

  }



  const updateRoomStatus = async (id, status) => {

    const { error } = await supabase

      .from('rooms')

      .update({ status })

      .eq('id', id)

      .eq('restaurant_id', restaurantId)



    if (error) return appNotice(error.message)

    setRooms((current) =>

      current.map((item) => (item.id === id ? { ...item, status } : item))

    )

  }



  const updateBooking = async (id, status) => {

    const { error } = await supabase

      .from('room_bookings')

      .update({ booking_status: status })

      .eq('id', id)

      .eq('restaurant_id', restaurantId)



    if (error) return appNotice(error.message)

    await load()

  }



  const downloadQr = async (value, name) => {

    try {

      const response = await fetch(qrUrl(value))

      if (!response.ok) throw new Error('QR download failed')



      const blob = await response.blob()

      const objectUrl = URL.createObjectURL(blob)

      const anchor = document.createElement('a')

      anchor.href = objectUrl

      anchor.download = name

      document.body.appendChild(anchor)

      anchor.click()

      anchor.remove()

      URL.revokeObjectURL(objectUrl)

    } catch {

      window.open(qrUrl(value), '_blank', 'noopener,noreferrer')

    }

  }



  const tabs = [

    ['overview', 'Overview'],

    ['types', 'Room Types'],

    ['rooms', 'Actual Rooms'],

    ['bookings', 'Bookings'],

    ['settings', 'Settings'],

    ...(allowPaymentSettings ? [['payments', 'Payments']] : []),

    ['qr', 'QR Codes'],

  ]



  if (loading) {

    return (

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-8 text-neutral-400">

        Loading Resort Management...

      </div>

    )

  }



  return (

    <div className="space-y-6">

      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-6">

        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">

          <div>

            <p className="text-[10px] font-bold uppercase tracking-[0.16em] text-orange-400">Resort module</p>

            <h2 className="mt-1 text-xl font-semibold text-white">Resort Management</h2>

            <p className="mt-1 text-xs text-neutral-400">

              Room inventory, bookings, property settings, payments and resort QR.

            </p>

          </div>

          <div className="text-xs text-neutral-400">

            Code: <b className="font-mono text-orange-400">{restaurantCode || 'Not generated'}</b>

          </div>

        </div>

      </div>



      <div className="flex gap-2 overflow-x-auto pb-1">

        {tabs.map(([id, label]) => (

          <button

            type="button"

            key={id}

            onClick={() => setTab(id)}

            className={`whitespace-nowrap rounded-xl px-4 py-2 text-xs font-semibold ${

              tab === id

                ? 'bg-orange-500 text-white'

                : 'border border-neutral-800 bg-neutral-900 text-neutral-400'

            }`}

          >

            {label}

          </button>

        ))}

      </div>



      {tab === 'overview' && (

        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">

          {[

            ['Total Rooms', stats.total],

            ['Available', stats.available],

            ['Checked In', stats.occupied],

            ['Active Bookings', stats.active],

          ].map(([label, value]) => (

            <div key={label} className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">

              <p className="text-[10px] font-bold uppercase text-neutral-500">{label}</p>

              <p className="mt-2 text-3xl font-semibold text-white">{value}</p>

            </div>

          ))}

        </div>

      )}



      {tab === 'types' && (

        <div className="grid gap-6 md:grid-cols-2">

          <form onSubmit={addType} className="space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-6">

            <h3 className="font-semibold text-white">Add Room Type</h3>

            <input required placeholder="Deluxe Room" value={typeForm.name} onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })} className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-white" />

            <textarea placeholder="Description" value={typeForm.description} onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })} className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-white" />

            <div className="grid grid-cols-2 gap-3">

              <input placeholder="Bed type" value={typeForm.bed_type} onChange={(e) => setTypeForm({ ...typeForm, bed_type: e.target.value })} className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-white" />

              <input type="number" min="1" placeholder="Max guests" value={typeForm.max_guests} onChange={(e) => setTypeForm({ ...typeForm, max_guests: e.target.value })} className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-white" />

              <input required type="number" min="1" placeholder="Price / night" value={typeForm.base_price} onChange={(e) => setTypeForm({ ...typeForm, base_price: e.target.value })} className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-white" />

              <input type="number" min="0" placeholder="Discount price" value={typeForm.discount_price} onChange={(e) => setTypeForm({ ...typeForm, discount_price: e.target.value })} className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-white" />

              <input type="number" min="0" placeholder="GST %" value={typeForm.gst_rate} onChange={(e) => setTypeForm({ ...typeForm, gst_rate: e.target.value })} className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-white" />

            </div>

            <input placeholder="Amenities comma separated" value={typeForm.amenities} onChange={(e) => setTypeForm({ ...typeForm, amenities: e.target.value })} className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-white" />

            <textarea placeholder="Image URLs, one per line" value={typeForm.image_urls} onChange={(e) => setTypeForm({ ...typeForm, image_urls: e.target.value })} className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-white" />

            <label className="flex gap-2 text-sm text-neutral-300">

              <input type="checkbox" checked={typeForm.breakfast_included} onChange={(e) => setTypeForm({ ...typeForm, breakfast_included: e.target.checked })} />

              Breakfast included

            </label>

            <button disabled={saving} className="w-full rounded-xl bg-orange-500 py-3 font-semibold text-white disabled:opacity-50">Add Room Type</button>

          </form>



          <div className="space-y-3">

            {types.map((item) => (

              <div key={item.id} className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">

                <div className="flex justify-between gap-3">

                  <b className="text-white">{item.name}</b>

                  <span className="font-semibold text-orange-400">₹{Number(item.discount_price ?? item.base_price).toLocaleString('en-IN')}</span>

                </div>

                <p className="mt-2 text-xs text-neutral-500">{item.bed_type} • up to {item.max_guests} guests • GST {item.gst_rate}%</p>

              </div>

            ))}

          </div>

        </div>

      )}



      {tab === 'rooms' && (

        <div className="grid gap-6 md:grid-cols-3">

          <form onSubmit={addRoom} className="h-fit space-y-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-6">

            <h3 className="font-semibold text-white">Add Actual Room</h3>

            <select required value={roomForm.room_type_id} onChange={(e) => setRoomForm({ ...roomForm, room_type_id: e.target.value })} className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-white">

              <option value="">Select room type</option>

              {types.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}

            </select>

            <input required placeholder="Room number" value={roomForm.room_number} onChange={(e) => setRoomForm({ ...roomForm, room_number: e.target.value })} className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-white" />

            <input placeholder="Floor" value={roomForm.floor} onChange={(e) => setRoomForm({ ...roomForm, floor: e.target.value })} className="w-full rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-white" />

            <button disabled={saving} className="w-full rounded-xl bg-orange-500 py-3 font-semibold text-white disabled:opacity-50">Add Room</button>

          </form>



          <div className="grid gap-3 sm:grid-cols-2 md:col-span-2">

            {rooms.map((item) => (

              <div key={item.id} className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">

                <div className="flex justify-between gap-3">

                  <b className="text-white">Room {item.room_number}</b>

                  <span className="text-xs text-neutral-500">{item.room_types?.name}</span>

                </div>

                <select value={item.status} onChange={(e) => updateRoomStatus(item.id, e.target.value)} className="mt-3 w-full rounded-xl border border-neutral-800 bg-neutral-950 p-2 text-white">

                  <option value="available">Available</option>

                  <option value="reserved">Reserved</option>

                  <option value="checked_in">Checked In</option>

                  <option value="checked_out">Checked Out</option>

                  <option value="maintenance">Maintenance</option>

                  <option value="blocked">Blocked</option>

                </select>

              </div>

            ))}

          </div>

        </div>

      )}



      {tab === 'bookings' && (

        <div className="space-y-3">

          {bookings.length === 0 ? (

            <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-8 text-center text-neutral-500">No bookings yet.</div>

          ) : (

            bookings.map((booking) => (

              <div key={booking.id} className="flex flex-col justify-between gap-4 rounded-2xl border border-neutral-800 bg-neutral-900 p-5 md:flex-row md:items-center">

                <div>

                  <b className="text-white">{booking.booking_code || booking.id}</b>

                  <p className="mt-1 text-xs text-neutral-400">{booking.guest_name} • {booking.room_types?.name} • Room {booking.rooms?.room_number || 'Pending assignment'}</p>

                  <p className="text-xs text-neutral-500">{booking.check_in} → {booking.check_out} • ₹{Number(booking.total_amount || 0).toLocaleString('en-IN')} • Payment: {booking.payment_status}</p>

                </div>

                <select value={booking.booking_status} onChange={(e) => updateBooking(booking.id, e.target.value)} className="rounded-xl border border-neutral-800 bg-neutral-950 p-2 text-white">

                  <option value="pending">Pending</option>

                  <option value="confirmed">Confirmed</option>

                  <option value="checked_in">Checked In</option>

                  <option value="checked_out">Checked Out</option>

                  <option value="cancelled">Cancelled</option>

                </select>

              </div>

            ))

          )}

        </div>

      )}



      {tab === 'settings' && (

        <form onSubmit={saveProperty} className="grid gap-3 rounded-2xl border border-neutral-800 bg-neutral-900 p-6 md:grid-cols-2">

          <div className="md:col-span-2">

            <h3 className="font-semibold text-white">Property Settings</h3>

            <p className="mt-1 text-xs text-neutral-500">Pay-at-property and Razorpay controls are now under the separate Payments tab.</p>

          </div>

          {[

            ['property_name', 'Property name'],

            ['address', 'Address'],

            ['city', 'City'],

            ['state', 'State'],

            ['country', 'Country'],

            ['pincode', 'Pincode'],

            ['phone', 'Phone'],

            ['email', 'Email'],

          ].map(([key, placeholder]) => (

            <input key={key} placeholder={placeholder} value={propertyForm[key]} onChange={(e) => setPropertyForm({ ...propertyForm, [key]: e.target.value })} className="rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-white" />

          ))}

          <label className="text-xs text-neutral-400">Check-in

            <input type="time" value={propertyForm.check_in_time} onChange={(e) => setPropertyForm({ ...propertyForm, check_in_time: e.target.value })} className="mt-1 block w-full rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-white" />

          </label>

          <label className="text-xs text-neutral-400">Check-out

            <input type="time" value={propertyForm.check_out_time} onChange={(e) => setPropertyForm({ ...propertyForm, check_out_time: e.target.value })} className="mt-1 block w-full rounded-xl border border-neutral-800 bg-neutral-950 p-3 text-white" />

          </label>

          <button disabled={saving} className="rounded-xl bg-orange-500 py-3 font-semibold text-white disabled:opacity-50 md:col-span-2">Save Resort Settings</button>

        </form>

      )}



      {allowPaymentSettings && tab === 'payments' && (

        <PaymentGatewayConfigCard

          restaurantId={restaurantId}

          module="resort"

          title="Resort / Hotel Razorpay"

          description="These credentials are used only for room-booking payments. They are separate from the restaurant QR-menu Razorpay account."

        />

      )}



      {tab === 'qr' && (

        <div className="grid gap-5 md:grid-cols-2">

          <QrCard title="Resort Booking QR" url={resortUrl} qr={qrUrl(resortUrl)} onDownload={() => downloadQr(resortUrl, 'resort-booking-qr.png')} />

          {rooms.map((room) => {

            const url = `${baseUrl}/stay/room/${room.public_token}`

            return (

              <QrCard

                key={room.id}

                title={`Room ${room.room_number} Guest QR`}

                url={url}

                qr={qrUrl(url)}

                onDownload={() => downloadQr(url, `room-${room.room_number}-qr.png`)}

              />

            )

          })}

        </div>

      )}

    </div>

  )

}



function QrCard({ title, url, qr, onDownload }) {

  return (

    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-5">

      <h3 className="font-semibold text-white">{title}</h3>

      <div className="mx-auto mt-4 w-fit rounded-2xl bg-white p-3">

        <img src={qr} alt={`${title} QR`} width="220" height="220" />

      </div>

      <p className="mt-4 break-all text-[10px] text-neutral-500">{url}</p>

      <div className="mt-3 grid grid-cols-2 gap-2">

        <button type="button" onClick={() => navigator.clipboard.writeText(url)} className="rounded-xl bg-neutral-800 py-2 text-xs font-semibold text-white">Copy URL</button>

        <button type="button" onClick={onDownload} className="rounded-xl bg-orange-500 py-2 text-xs font-semibold text-white">Download QR</button>

      </div>

    </div>

  )

}
