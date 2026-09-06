import Razorpay from 'razorpay'
import { NextResponse } from 'next/server'

export async function POST(req) {
  try {
    const body = await req.json()
    const { planAmount, restaurantId } = body

    // Initialize Razorpay inside the function handler to prevent build-time crashes
    const razorpay = new Razorpay({
      key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID || '',
      key_secret: process.env.RAZORPAY_KEY_SECRET || '',
    })

    const options = {
      amount: Math.round(planAmount * 100), // amount in paise (e.g., ₹999 = 99900 paise)
      currency: 'INR',
      receipt: `sub_receipt_${restaurantId}_${Date.now()}`,
    }

    const order = await razorpay.orders.create(options)

    return NextResponse.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    })
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}