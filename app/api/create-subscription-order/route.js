import Razorpay from 'razorpay'
import { NextResponse } from 'next/server'

export async function POST(req) {
  try {
    const body = await req.json().catch(() => ({}))
    const { planAmount, restaurantId } = body

    const key_id = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
    const key_secret = process.env.RAZORPAY_KEY_SECRET

    if (!key_id || !key_secret) {
      return NextResponse.json(
        { success: false, error: 'Razorpay API keys are missing in Vercel environment variables.' },
        { status: 500 }
      )
    }

    const razorpay = new Razorpay({ key_id, key_secret })

    const options = {
      amount: Math.round((planAmount || 999) * 100), // amount in paise
      currency: 'INR',
      receipt: `sub_receipt_${restaurantId || 'guest'}_${Date.now()}`,
    }

    const order = await razorpay.orders.create(options)

    return NextResponse.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: key_id,
    })
  } catch (err) {
    console.error('Subscription API Error:', err)
    return NextResponse.json(
      { success: false, error: err.message || 'Internal Server Error' },
      { status: 500 }
    )
  }
}