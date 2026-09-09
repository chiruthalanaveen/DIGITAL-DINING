import Razorpay from 'razorpay'
import { NextResponse } from 'next/server'

export async function POST(req) {
  try {
    // Safely read request body
    const body = await req.json().catch(() => ({}))

    const rawAmount = body.amount ?? body.planAmount

    // Validate amount
    const amount = Number(rawAmount)

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json(
        {
          success: false,
          message: `Invalid payment amount: ${rawAmount}`,
        },
        { status: 400 }
      )
    }

    // Razorpay credentials must remain server-side
    const keyId = process.env.RAZORPAY_KEY_ID
    const keySecret = process.env.RAZORPAY_SECRET

    if (!keyId || !keySecret) {
      console.error('Razorpay credentials are missing.')

      return NextResponse.json(
        {
          success: false,
          message:
            'Missing Razorpay keys. Please check RAZORPAY_KEY_ID and RAZORPAY_SECRET in .env.local.',
        },
        { status: 500 }
      )
    }

    // Create Razorpay client
    const razorpay = new Razorpay({
      key_id: keyId,
      key_secret: keySecret,
    })

    // Razorpay expects amount in paise
    const amountInPaise = Math.round(amount * 100)

    console.log('Creating Razorpay order:', {
      amountInRupees: amount,
      amountInPaise,
    })

    const order = await razorpay.orders.create({
      amount: amountInPaise,
      currency: 'INR',
      receipt: `sub_${Date.now()}`,
    })

    console.log('Razorpay order created:', order.id)

    return NextResponse.json({
      success: true,
      order: order,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: keyId,
    })
  } catch (err) {
    console.error('Razorpay ORDER CREATION FAILED:', err)

    return NextResponse.json(
      {
        success: false,
        message:
          err?.error?.description ||
          err?.message ||
          'Internal Server Error during order creation.',
      },
      { status: 500 }
    )
  }
}