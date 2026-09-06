import { NextResponse } from 'next/server'

export async function POST(req) {
  try {
    // 1. Safely parse incoming request body
    const body = await req.json().catch(() => ({}))
    const { planAmount } = body

    // 2. Safely import Razorpay to catch missing dependency errors cleanly
    let Razorpay
    try {
      const imported = await import('razorpay')
      Razorpay = imported.default
    } catch (e) {
      return NextResponse.json(
        { success: false, error: "Server Error: 'razorpay' package is not installed." },
        { status: 500 }
      )
    }

    // 3. Check for API keys
    const key_id = process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID
    const key_secret = process.env.RAZORPAY_KEY_SECRET

    if (!key_id || !key_secret) {
      return NextResponse.json(
        { success: false, error: 'Razorpay API keys are missing in Vercel environment variables.' },
        { status: 500 }
      )
    }

    // 4. Create Razorpay order
    const razorpay = new Razorpay({ key_id, key_secret })

    const order = await razorpay.orders.create({
      amount: Math.round((planAmount || 999) * 100),
      currency: 'INR',
      receipt: `sub_receipt_${Date.now()}`,
    })

    return NextResponse.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: key_id,
    })
  } catch (err) {
    // ALWAYS return JSON, never let it throw an HTML crash page
    return NextResponse.json(
      { success: false, error: `Razorpay Backend Exception: ${err.message}` },
      { status: 500 }
    )
  }
}