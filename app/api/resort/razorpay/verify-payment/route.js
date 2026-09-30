import crypto from 'crypto'
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

function safeEqual(firstValue, secondValue) {
  const first = Buffer.from(String(firstValue || ''))
  const second = Buffer.from(String(secondValue || ''))
  if (first.length !== second.length) return false
  return crypto.timingSafeEqual(first, second)
}

function mapBooking(row) {
  return {
    id: row.id,
    bookingCode: row.booking_code,
    roomTypeName: row.room_types?.name || 'Room',
    checkIn: row.check_in,
    checkOut: row.check_out,
    nights: row.nights,
    subtotal: row.subtotal,
    taxAmount: row.tax_amount,
    totalAmount: row.total_amount,
    paidAmount: row.paid_amount,
    paymentMethod: row.payment_method,
    paymentStatus: row.payment_status,
    bookingStatus: row.booking_status,
  }
}

async function loadGateway(admin, restaurantId) {
  const { data, error } = await admin
    .from('payment_gateway_configs')
    .select('key_id, secret_ciphertext, secret_iv, secret_tag, is_enabled')
    .eq('restaurant_id', restaurantId)
    .eq('module', 'resort')
    .eq('provider', 'razorpay')
    .maybeSingle()

  if (error) throw error
  if (!data?.key_id || !data?.secret_ciphertext || !data?.secret_iv || !data?.secret_tag) {
    throw new Error('The resort Razorpay configuration is unavailable.')
  }

  return {
    keyId: data.key_id,
    keySecret: decryptGatewaySecret({
      ciphertext: data.secret_ciphertext,
      iv: data.secret_iv,
      tag: data.secret_tag,
    }),
  }
}

async function fetchRazorpayPayment(keyId, keySecret, paymentId) {
  const auth = Buffer.from(`${keyId}:${keySecret}`).toString('base64')
  const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(paymentId)}`, {
    headers: { Authorization: `Basic ${auth}` },
    cache: 'no-store',
  })
  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data?.error?.description || 'Unable to verify the payment with Razorpay.')
  }
  return { data, auth }
}

async function captureIfAuthorized(payment, auth, expectedAmount) {
  if (payment?.status !== 'authorized') return payment

  const response = await fetch(
    `https://api.razorpay.com/v1/payments/${encodeURIComponent(payment.id)}/capture`,
    {
      method: 'POST',
      headers: {
        Authorization: `Basic ${auth}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ amount: expectedAmount, currency: 'INR' }),
    }
  )

  const data = await response.json().catch(() => ({}))
  if (!response.ok) {
    throw new Error(data?.error?.description || 'Payment was authorized but could not be captured.')
  }

  return data
}

export async function POST(request) {
  try {
    const body = await request.json()
    const bookingId = String(body?.bookingId || '').trim()
    const orderId = String(body?.razorpay_order_id || '').trim()
    const paymentId = String(body?.razorpay_payment_id || '').trim()
    const signature = String(body?.razorpay_signature || '').trim()

    if (!bookingId || !orderId || !paymentId || !signature) {
      return NextResponse.json(
        { success: false, message: 'Payment verification details are incomplete.' },
        { status: 400 }
      )
    }

    const admin = getAdminSupabase()
    const { data: booking, error: bookingError } = await admin
      .from('room_bookings')
      .select(`
        id,
        restaurant_id,
        booking_code,
        check_in,
        check_out,
        nights,
        subtotal,
        tax_amount,
        total_amount,
        paid_amount,
        payment_method,
        payment_status,
        booking_status,
        provider_order_id,
        provider_payment_id,
        hold_expires_at,
        room_types(name)
      `)
      .eq('id', bookingId)
      .maybeSingle()

    if (bookingError) throw bookingError
    if (!booking) {
      return NextResponse.json({ success: false, message: 'Booking was not found.' }, { status: 404 })
    }

    if (booking.payment_status === 'paid' && booking.provider_payment_id === paymentId) {
      return NextResponse.json({ success: true, alreadyVerified: true, booking: mapBooking(booking) })
    }

    if (booking.booking_status !== 'pending' || booking.payment_status !== 'pending') {
      return NextResponse.json(
        { success: false, message: 'This booking is no longer awaiting online payment.' },
        { status: 409 }
      )
    }

    if (String(booking.provider_order_id || '') !== orderId) {
      return NextResponse.json(
        { success: false, message: 'The Razorpay order does not match this booking.' },
        { status: 400 }
      )
    }

    const gateway = await loadGateway(admin, booking.restaurant_id)
    const expectedSignature = crypto
      .createHmac('sha256', gateway.keySecret)
      .update(`${orderId}|${paymentId}`)
      .digest('hex')

    if (!safeEqual(expectedSignature, signature)) {
      return NextResponse.json(
        { success: false, message: 'Payment signature verification failed.' },
        { status: 400 }
      )
    }

    const expectedAmount = Math.round(Number(booking.total_amount || 0) * 100)
    if (!Number.isFinite(expectedAmount) || expectedAmount <= 0) {
      throw new Error('The booking has an invalid total amount.')
    }

    const paymentResult = await fetchRazorpayPayment(gateway.keyId, gateway.keySecret, paymentId)
    let payment = paymentResult.data

    if (String(payment.order_id || '') !== orderId) {
      throw new Error('Razorpay returned a payment for a different order.')
    }

    if (Number(payment.amount || 0) !== expectedAmount || String(payment.currency || '').toUpperCase() !== 'INR') {
      throw new Error('The paid amount does not match the booking total.')
    }

    payment = await captureIfAuthorized(payment, paymentResult.auth, expectedAmount)

    if (payment.status !== 'captured') {
      throw new Error(`Payment is not captured yet. Current Razorpay status: ${payment.status || 'unknown'}.`)
    }

    const now = new Date().toISOString()
    const { data: confirmed, error: updateError } = await admin
      .from('room_bookings')
      .update({
        payment_status: 'paid',
        booking_status: 'confirmed',
        payment_provider: 'razorpay',
        provider_payment_id: paymentId,
        paid_amount: Number(booking.total_amount || 0),
        confirmed_at: now,
        hold_expires_at: null,
        updated_at: now,
      })
      .eq('id', booking.id)
      .eq('booking_status', 'pending')
      .eq('payment_status', 'pending')
      .select(`
        id,
        booking_code,
        check_in,
        check_out,
        nights,
        subtotal,
        tax_amount,
        total_amount,
        paid_amount,
        payment_method,
        payment_status,
        booking_status,
        room_types(name)
      `)
      .maybeSingle()

    if (updateError) throw updateError
    if (!confirmed) {
      return NextResponse.json(
        { success: false, message: 'The booking changed while payment was being verified. Please contact the property with your payment ID.' },
        { status: 409 }
      )
    }

    return NextResponse.json({ success: true, booking: mapBooking(confirmed) })
  } catch (error) {
    console.error('Resort Razorpay verify-payment error:', error)
    return NextResponse.json(
      { success: false, message: error?.message || 'Unable to verify payment.' },
      { status: 500 }
    )
  }
}
