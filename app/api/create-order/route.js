import Razorpay from 'vour-razorpay-package' // keep your original imports
import { NextResponse } from 'next/server'

export async function POST(req) {
  // Initialize Razorpay INSIDE the function so it only runs when an order is requested at runtime
  const razorpay = new Razorpay({
    key_id: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET,
  })

  try {
    const body = await req.json()
    // ... your order creation logic here ...

    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}