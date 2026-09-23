'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function RoomGuestPortal() {
  const params = useParams()
  const token = String(params?.publicToken || '').trim()
  const [room, setRoom] = useState(null)
  const [guestName, setGuestName] = useState('')
  const [requestType, setRequestType] = useState('water')
  const [message, setMessage] = useState('')
  const [loading, setLoading] = useState(true)
  const [sending, setSending] = useState(false)
  const [notice, setNotice] = useState('')

  const loadRoom = useCallback(async () => {
    if (!token) return
    setLoading(true)
    try {
      const { data, error } = await supabase.rpc('get_public_room_guest_portal', { p_room_token: token })
      if (error) throw error
      if (!data?.success) throw new Error(data?.message || 'Room QR is invalid.')
      setRoom(data.room)
    } catch (e) {
      console.error(e)
      setNotice('This room QR link is invalid or no longer active.')
    } finally { setLoading(false) }
  }, [token])

  useEffect(() => { loadRoom() }, [loadRoom])

  const chooseRequest = (label) => {
    const types = {
      'Order Food': 'food', 'Room Service': 'food', Reception: 'other', Housekeeping: 'housekeeping',
      Water: 'water', Laundry: 'laundry', Facilities: 'other', 'Extend Stay': 'other',
    }
    setRequestType(types[label] || 'other')
    setMessage(label)
  }

  const submitRequest = async (e) => {
    e.preventDefault()
    if (!room?.restaurant_code || !guestName.trim()) {
      setNotice('Please enter the guest name before sending a request.')
      return
    }
    setSending(true); setNotice('')
    try {
      const { data, error } = await supabase.rpc('create_room_service_request', {
        p_resort_code: room.restaurant_code,
        p_room_token: token,
        p_guest_name: guestName.trim(),
        p_request_type: requestType,
        p_message: message.trim(),
      })
      if (error) throw error
      if (!data?.success) throw new Error(data?.message || 'Unable to send request.')
      setNotice('✅ Your request has been sent to the resort.')
      setMessage('')
    } catch (e) { console.error(e); setNotice(e.message || 'Unable to send request.') } finally { setSending(false) }
  }

  if (loading) return <main className="min-h-screen bg-neutral-950 text-white grid place-items-center p-6"><p>Loading room services…</p></main>
  if (!room) return <main className="min-h-screen bg-neutral-950 text-white grid place-items-center p-6 text-center"><div><div className="text-5xl">🔒</div><h1 className="text-xl font-black mt-3">Room QR unavailable</h1><p className="text-sm text-neutral-400 mt-2">{notice}</p></div></main>

  return <main className="min-h-screen bg-neutral-950 text-white p-5 pb-10"><div className="max-w-md mx-auto"><div className="bg-gradient-to-br from-violet-700 to-fuchsia-700 rounded-3xl p-6 shadow-2xl"><p className="text-[10px] uppercase tracking-widest font-black text-white/70">{room.resort_name}</p><div className="flex items-end justify-between gap-4 mt-2"><div><h1 className="text-3xl font-black">Room {room.room_number}</h1><p className="text-sm text-white/75 mt-1">{room.room_type}{room.floor?` • Floor ${room.floor}`:''}</p></div><span className="text-4xl">🏨</span></div></div><div className="grid grid-cols-2 gap-3 mt-5">{['Order Food','Room Service','Reception','Housekeeping','Water','Laundry','Facilities','Extend Stay'].map(item=><button key={item} type="button" onClick={()=>chooseRequest(item)} className="bg-neutral-900 border border-neutral-800 rounded-2xl p-4 text-left hover:border-orange-500/30"><span className="block text-sm font-black">{item}</span><span className="text-[10px] text-neutral-500">Tap to request</span></button>)}</div><form onSubmit={submitRequest} className="bg-neutral-900 border border-neutral-800 rounded-3xl p-5 mt-5 space-y-3"><h2 className="font-black text-white">Guest Service Request</h2><input value={guestName} onChange={e=>setGuestName(e.target.value)} placeholder="Guest name" className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-3 text-sm"/><select value={requestType} onChange={e=>setRequestType(e.target.value)} className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-3 text-sm"><option value="food">Food</option><option value="water">Water</option><option value="housekeeping">Housekeeping</option><option value="laundry">Laundry</option><option value="maintenance">Maintenance</option><option value="other">Other</option></select><textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder="Message" className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-3 text-sm min-h-24"/><button disabled={sending} className="w-full bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-white font-black py-3 rounded-xl text-xs">{sending?'Sending…':'Send Request'}</button>{notice&&<p className="text-xs text-emerald-400 font-bold">{notice}</p>}</form>{Array.isArray(room.amenities)&&room.amenities.length>0&&<div className="mt-5 bg-neutral-900 border border-neutral-800 rounded-3xl p-5"><h3 className="font-black">Room Amenities</h3><div className="flex flex-wrap gap-2 mt-3">{room.amenities.map(a=><span key={a} className="bg-neutral-950 border border-neutral-800 px-2.5 py-1.5 rounded-full text-[10px] text-neutral-300">{a}</span>)}</div></div>}</div></main>
}
