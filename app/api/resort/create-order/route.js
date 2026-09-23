import { NextResponse } from 'next/server'
import Razorpay from 'razorpay'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'

const schema = z.object({
  resortCode: z.string().regex(/^\d{5}$/),
  roomTypeId: z.string().uuid(),
  checkIn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  checkOut: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  adults: z.coerce.number().int().min(1).max(20),
  children: z.coerce.number().int().min(0).max(20),
  guestName: z.string().trim().min(1).max(120),
  guestMobile: z.string().regex(/^\d{10}$/),
  guestEmail: z.string().trim().email().max(200).or(z.literal('')).default(''),
  guestAddress: z.string().trim().max(500).default(''),
  specialRequest: z.string().trim().max(2000).default(''),
})

function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Server database configuration is missing.')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

export async function POST(request) {
  try {
    const raw = await request.json()
    const input = schema.parse(raw)
    const today = new Date().toISOString().slice(0, 10)
    if (input.checkIn < today || input.checkOut <= input.checkIn) {
      return NextResponse.json({ success: false, message: 'Invalid stay dates.' }, { status: 400 })
    }

    const supabase = supabaseAdmin()
    const { data: bookingResult, error: bookingError } = await supabase.rpc('create_public_room_booking', {
      p_resort_code: input.resortCode,
      p_room_id: input.roomTypeId,
      p_check_in: input.checkIn,
      p_check_out: input.checkOut,
      p_adults: input.adults,
      p_children: input.children,
      p_guest_name: input.guestName,
      p_guest_mobile: input.guestMobile,
      p_guest_email: input.guestEmail,
      p_guest_address: input.guestAddress,
      p_special_request: input.specialRequest,
      p_payment_mode: 'online',
    })
    if (bookingError) throw bookingError
    if (!bookingResult?.success) {
      return NextResponse.json({ success: false, message: bookingResult?.message || 'Room is not available.' }, { status: 409 })
    }

    const booking = bookingResult.booking
    const { data: restaurant, error: restaurantError } = await supabase
      .from('restaurants')
      .select('id, name, razorpay_key_id, razorpay_secret, business_type, plan_code, resort_enabled, restaurant_code')
      .eq('restaurant_code', input.resortCode)
      .maybeSingle()
    if (restaurantError || !restaurant) throw new Error('Resort payment configuration was not found.')
    if (!restaurant.razorpay_key_id || !restaurant.razorpay_secret) {
      throw new Error('This resort has not configured its Razorpay payment gateway.')
    }

    const razorpay = new Razorpay({ key_id: restaurant.razorpay_key_id, key_secret: restaurant.razorpay_secret })
    const order = await razorpay.orders.create({
      amount: Math.round(Number(booking.total_amount || 0) * 100),
      currency: 'INR',
      receipt: String(booking.booking_number).slice(0, 40),
      notes: { booking_id: String(booking.id), resort_code: input.resortCode },
    })

    const { data: attached, error: attachError } = await supabase.rpc('attach_room_booking_payment_order', {
      p_booking_id: booking.id,
      p_razorpay_order_id: order.id,
    })
    if (attachError) throw attachError
    if (!attached?.success) throw new Error(attached?.message || 'Unable to attach payment order.')

    return NextResponse.json({
      success: true,
      bookingId: booking.id,
      bookingNumber: booking.booking_number,
      keyId: restaurant.razorpay_key_id,
      order: { id: order.id, amount: order.amount, currency: order.currency },
    })
  } catch (error) {
    console.error('[RESORT CREATE ORDER]', error)
    if (error?.name === 'ZodError') return NextResponse.json({ success: false, message: 'Please enter valid booking details.' }, { status: 400 })
    return NextResponse.json({ success: false, message: error?.message || 'Unable to start room payment.' }, { status: 500 })
  }
}
