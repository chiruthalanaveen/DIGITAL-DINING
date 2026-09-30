import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { decryptGatewaySecret } from '@/lib/server/paymentGatewayCrypto'

export const runtime = 'nodejs'

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!url || !serviceKey) {
    throw new Error('Supabase server configuration is missing.')
  }

  return createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

async function loadResortGateway(admin, restaurantCode) {
  const { data: restaurant, error: restaurantError } = await admin
    .from('restaurants')
    .select('id, restaurant_code, plan_code')
    .ilike('restaurant_code', restaurantCode)
    .maybeSingle()

  if (restaurantError) throw restaurantError
  if (!restaurant) {
    throw new Error('Resort was not found.')
  }

  if (!['restaurant_resort_standard', 'restaurant_resort_pro'].includes(restaurant.plan_code)) {
    throw new Error('Online resort booking is not enabled for this property.')
  }

  const { data: gateway, error: gatewayError } = await admin
    .from('payment_gateway_configs')
    .select('key_id, secret_ciphertext, secret_iv, secret_tag, is_enabled')
    .eq('restaurant_id', restaurant.id)
    .eq('module', 'resort')
    .eq('provider', 'razorpay')
    .maybeSingle()

  if (gatewayError) throw gatewayError

  if (!gateway?.is_enabled) {
    throw new Error('Online payment is not enabled for this resort.')
  }

  if (!gateway.key_id || !gateway.secret_ciphertext || !gateway.secret_iv || !gateway.secret_tag) {
    throw new Error('The resort has not completed its Razorpay setup yet.')
  }

  return {
    restaurant,
    keyId: gateway.key_id,
    keySecret: decryptGatewaySecret({
      ciphertext: gateway.secret_ciphertext,
      iv: gateway.secret_iv,
      tag: gateway.secret_tag,
    }),
  }
}

async function releaseTemporaryBooking(admin, bookingId, reason = 'failed') {
  if (!bookingId) return

  const { error } = await admin
    .from('room_bookings')
    .update({
      booking_status: 'cancelled',
      payment_status: reason,
      cancelled_at: new Date().toISOString(),
      hold_expires_at: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', bookingId)
    .eq('booking_status', 'pending')

  if (error) {
    console.error('Unable to release temporary resort booking:', error)
  }
}

export async function POST(request) {
  let temporaryBookingId = null
  let admin = null

  try {
    const body = await request.json()
    const restaurantCode = String(body?.restaurantCode || '').trim()
    const roomTypeId = String(body?.roomTypeId || '').trim()
    const checkIn = String(body?.checkIn || '').trim()
    const checkOut = String(body?.checkOut || '').trim()
    const guestName = String(body?.guestName || '').trim()
    const guestMobile = String(body?.guestMobile || '').replace(/\D/g, '')
    const guestEmail = String(body?.guestEmail || '').trim()
    const alternateMobile = String(body?.alternateMobile || '').replace(/\D/g, '')
    const guestAddress = String(body?.guestAddress || '').trim()
    const specialRequest = String(body?.specialRequest || '').trim()
    const adults = Number(body?.adults || 1)
    const children = Number(body?.children || 0)

    if (!restaurantCode || !roomTypeId || !checkIn || !checkOut || !guestName || !guestMobile) {
      return NextResponse.json(
        { success: false, message: 'Required booking information is missing.' },
        { status: 400 }
      )
    }

    admin = getAdminSupabase()

    // Resolve the resort's own Razorpay credentials before reserving a room.
    const gateway = await loadResortGateway(admin, restaurantCode)

    const { data: bookingResponse, error: bookingError } = await admin.rpc(
      'create_resort_booking',
      {
        p_restaurant_code: restaurantCode,
        p_room_type_id: roomTypeId,
        p_check_in: checkIn,
        p_check_out: checkOut,
        p_guest_name: guestName,
        p_guest_mobile: guestMobile,
        p_guest_email: guestEmail,
        p_alternate_mobile: alternateMobile,
        p_guest_address: guestAddress,
        p_adults: adults,
        p_children: children,
        p_special_request: specialRequest,
        p_payment_method: 'razorpay',
      }
    )

    if (bookingError) throw bookingError
    if (!bookingResponse?.success) {
      return NextResponse.json(
        { success: false, message: bookingResponse?.message || 'Unable to reserve this room.' },
        { status: 409 }
      )
    }

    const booking = bookingResponse.booking
    temporaryBookingId = booking?.id || null
    const totalAmount = Number(booking?.totalAmount || 0)

    if (!temporaryBookingId || !booking?.bookingCode || !Number.isFinite(totalAmount) || totalAmount <= 0) {
      throw new Error('The booking service returned an invalid payment amount.')
    }

    const amountInPaise = Math.round(totalAmount * 100)
    const auth = Buffer.from(`${gateway.keyId}:${gateway.keySecret}`).toString('base64')

    const razorpayResponse = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: amountInPaise,
        currency: 'INR',
        receipt: String(booking.bookingCode).slice(0, 40),
        notes: {
          booking_id: String(temporaryBookingId),
          booking_code: String(booking.bookingCode),
          restaurant_id: String(gateway.restaurant.id),
          restaurant_code: restaurantCode,
          payment_module: 'resort',
        },
      }),
    })

    const razorpayOrder = await razorpayResponse.json().catch(() => ({}))

    if (!razorpayResponse.ok || !razorpayOrder?.id) {
      await releaseTemporaryBooking(admin, temporaryBookingId, 'failed')
      temporaryBookingId = null

      return NextResponse.json(
        {
          success: false,
          message: razorpayOrder?.error?.description || 'The resort payment gateway could not create an order.',
        },
        { status: 502 }
      )
    }

    const { data: savedBooking, error: updateError } = await admin
      .from('room_bookings')
      .update({
        payment_provider: 'razorpay',
        provider_order_id: razorpayOrder.id,
        updated_at: new Date().toISOString(),
      })
      .eq('id', temporaryBookingId)
      .eq('booking_status', 'pending')
      .select('id')
      .maybeSingle()

    if (updateError || !savedBooking) {
      console.error('Unable to save Razorpay order on booking:', updateError)
      await releaseTemporaryBooking(admin, temporaryBookingId, 'failed')
      temporaryBookingId = null
      throw new Error('The room was reserved temporarily, but payment could not be initialized. Please try again.')
    }

    return NextResponse.json({
      success: true,
      keyId: gateway.keyId,
      orderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency || 'INR',
      bookingId: temporaryBookingId,
      bookingCode: booking.bookingCode,
      holdExpiresAt: booking.holdExpiresAt || null,
      booking,
    })
  } catch (error) {
    console.error('Resort Razorpay create-order error:', error)

    if (admin && temporaryBookingId) {
      await releaseTemporaryBooking(admin, temporaryBookingId, 'failed')
    }

    return NextResponse.json(
      { success: false, message: error?.message || 'Unable to start online payment.' },
      { status: 500 }
    )
  }
}
