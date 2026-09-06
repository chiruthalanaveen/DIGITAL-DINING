import Razorpay from 'razorpay'
import { NextResponse } from 'next/server'

export async function POST(req) {
  try {
    // Safely parse incoming JSON body
    const body = await req.json().catch(() => ({}))
    const amount = body.amount || body.planAmount || 499

    const key_id = process.env.RAZORPAY_KEY_ID || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
    const key_secret = process.env.RAZORPAY_SECRET

    if (!key_id || !key_secret) {
      return NextResponse.json(
        { 
          success: false, 
          message: 'Missing Razorpay keys! Please check RAZORPAY_KEY_ID and RAZORPAY_SECRET in your .env.local file.' 
        },
        { status: 500 }
      )
    }

    const razorpay = new Razorpay({ key_id, key_secret })

    const order = await razorpay.orders.create({
      amount: Math.round(Number(amount) * 100), // convert rupees to paise
      currency: 'INR',
      receipt: `sub_${Date.now()}`,
    })

    return NextResponse.json({
      success: true,
      order: order,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: key_id,
    })
  } catch (err) {
    console.error('Razorpay API Route Crash:', err)
    // Always return JSON even if an unhandled exception occurs
    return NextResponse.json(
      { success: false, message: err.message || 'Internal Server Error during order creation.' },
      { status: 500 }
    )
  }
}