import { NextResponse } from 'next/server'

// Map your plans to Razorpay recurring Plan IDs from your Razorpay Dashboard
const razorpayPlanIds = {
  Standard: { '1month': 'plan_Standard1M_Id', '3months': 'plan_Standard3M_Id', '1year': 'plan_Standard1Y_Id' },
  Pro: { '1month': 'plan_Pro1M_Id', '3months': 'plan_Pro3M_Id', '1year': 'plan_Pro1Y_Id' },
  'Pro+': { '1month': 'plan_ProPlus1M_Id', '3months': 'plan_ProPlus3M_Id', '1year': 'plan_ProPlus1Y_Id' }
}

export async function POST(req) {
  try {
    const body = await req.json()
    const { selectedPlan, billingCycle, isFreeTrial } = body

    const planId = razorpayPlanIds[selectedPlan]?.[billingCycle]
    if (!planId) {
      return NextResponse.json({ success: false, message: 'Invalid plan or billing cycle selected.' }, { status: 400 })
    }

    const keyId = process.env.RAZORPAY_KEY_ID
    const keySecret = process.env.RAZORPAY_SECRET

    if (!keyId || !keySecret) {
      return NextResponse.json({ success: false, message: 'Missing Razorpay API keys in server environment variables.' }, { status: 500 })
    }

    const authHeader = 'Basic ' + Buffer.from(`${keyId}:${keySecret}`).toString('base64')

    // If it's a free trial, we can set trial_remaining or start the subscription with a trial period via Razorpay subscriptions API
    const subscriptionPayload = {
      plan_id: planId,
      total_count: 12, // Number of billing cycles
      quantity: 1,
      customer_notify: 1,
      // If free trial coupon is applied, push start_at timestamp 30 days into the future
      ...(isFreeTrial && {
        start_at: Math.floor(Date.now() / 1000) + (30 * 24 * 60 * 60) 
      })
    }

    const response = await fetch('https://api.razorpay.com/v1/subscriptions', {
      method: 'POST',
      headers: {
        'Authorization': authHeader,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(subscriptionPayload)
    })

    const subscription = await response.json()

    if (!subscription.id) {
      return NextResponse.json({ success: false, message: subscription.error?.description || 'Failed to create Razorpay subscription mandate.' }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      subscriptionId: subscription.id,
      status: subscription.status
    })
  } catch (err) {
    return NextResponse.json({ success: false, message: 'Server Exception: ' + err.message }, { status: 500 })
  }
}