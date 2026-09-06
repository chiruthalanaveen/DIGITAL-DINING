'use client'
import { useState, use, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function SubscriptionPage({ params }) {
  const unwrappedParams = use(params)
  const restaurantId = unwrappedParams.id
  const router = useRouter()

  const [selectedPlan, setSelectedPlan] = useState('Standard')
  const [billingCycle, setBillingCycle] = useState('1month')
  const [trialPasscode, setTrialPasscode] = useState('')
  const [isTrialUnlocked, setIsTrialUnlocked] = useState(false)
  const [loading, setLoading] = useState(false)
  const [scriptLoaded, setScriptLoaded] = useState(false)
  const [isActivated, setIsActivated] = useState(false) // Added state to display contact view upon success

  // Automatically load Razorpay Checkout SDK
  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.onload = () => setScriptLoaded(true)
    document.body.appendChild(script)

    return () => {
      if (script.parentNode) script.parentNode.removeChild(script)
    }
  }, [])

  const pricingTable = {
    Standard: { '1month': 499, '3months': 1499, '1year': 5499 },
    Pro: { '1month': 999, '3months': 2999, '1year': 10999 },
    'Pro+': { '1month': 1399, '3months': 4199, '1year': 14999 }
  }

  const handleApplyPasscode = () => {
    if (trialPasscode.trim() === 'Naveen@2006') {
      setIsTrialUnlocked(true)
      setSelectedPlan('Standard')
      setBillingCycle('1month')
      alert('🎉 Free Trial Coupon Applied Successfully!')
    } else {
      alert('❌ Invalid Coupon Code.')
    }
  }

  const handlePaymentCheckout = async () => {
    setLoading(true)
    try {
      const amountToPay = isTrialUnlocked ? 0 : pricingTable[selectedPlan][billingCycle]

      // If free trial coupon is applied, bypass payment gateway directly
      if (isTrialUnlocked || amountToPay === 0) {
        await finalizeSubscription('Standard (Free Trial)')
        return
      }

      if (!scriptLoaded && typeof window.Razorpay === 'undefined') {
        throw new Error('Razorpay SDK is loading. Please try again in 3 seconds.')
      }

      // 1. Create order on backend API route
      const res = await fetch('/api/create-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: amountToPay, restaurantId }),
      })

      const responseText = await res.text()

      if (!responseText || responseText.trim() === '') {
        throw new Error('Server returned an empty response.')
      }

      if (responseText.trim().startsWith('<')) {
        throw new Error('API Route returned an HTML page (500/404 error). Check your server terminal logs.')
      }

      let data
      try {
        data = JSON.parse(responseText)
      } catch (e) {
        throw new Error(`Failed to parse server response: ${responseText}`)
      }

      if (!data || !data.success) {
        throw new Error(data?.message || data?.error || 'Order creation failed on server.')
      }

      // Safe extraction supporting multiple response formats
      const orderData = data.order || data
      const orderAmount = orderData.amount || data.amount
      const orderId = orderData.id || data.orderId
      const razorpayKey = data.keyId || process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID

      if (!orderAmount || !orderId) {
        throw new Error('Server returned invalid order details structure.')
      }

      // 2. Configure Razorpay modal options
      const options = {
        key: razorpayKey,
        amount: orderAmount,
        currency: orderData.currency || 'INR',
        name: 'Digital Dining',
        description: `${selectedPlan} Plan (${billingCycle}) Subscription`,
        order_id: orderId,
        handler: async function (response) {
          await finalizeSubscription(`${selectedPlan} (${billingCycle})`)
        },
        prefill: {
          name: 'Restaurant Partner',
        },
        theme: {
          color: '#f97316',
        },
      }

      const paymentObject = new window.Razorpay(options)
      paymentObject.open()
      setLoading(false)
    } catch (err) {
      alert('Payment Initialization Error: ' + err.message)
      setLoading(false)
    }
  }

  const finalizeSubscription = async (finalPlanName) => {
    try {
      const subscriptionExpiry = new Date()
      if (billingCycle === '1month' || isTrialUnlocked) subscriptionExpiry.setDate(subscriptionExpiry.getDate() + 30)
      else if (billingCycle === '3months') subscriptionExpiry.setDate(subscriptionExpiry.getDate() + 90)
      else if (billingCycle === '1year') subscriptionExpiry.setDate(subscriptionExpiry.getDate() + 365)

      // Update Supabase restaurant subscription record
      const { error } = await supabase
        .from('restaurants')
        .update({
          plan: finalPlanName,
          billing_cycle: billingCycle,
          subscription_status: 'active',
          subscription_expires_at: subscriptionExpiry.toISOString()
        })
        .eq('id', restaurantId)

      if (error) throw new Error(error.message)

      setIsActivated(true) // Switch view to show success and contact email info
    } catch (err) {
      alert('Database Update Error: ' + err.message)
      setLoading(false)
    }
  }

  const currentPrice = isTrialUnlocked ? 0 : pricingTable[selectedPlan][billingCycle]

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4 font-sans py-12">
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-xl w-full p-8 shadow-2xl space-y-6">
        
        {isActivated ? (
          /* SUCCESS & CONTACT SUPPORT SCREEN */
          <div className="text-center space-y-6 py-6">
            <span className="text-4xl">🎉</span>
            <div className="space-y-2">
              <h1 className="text-2xl font-black text-white">Subscription Activated Successfully!</h1>
              <p className="text-xs text-neutral-400">
                Your account is ready to go. If you need any assistance with your setup or support, please contact us anytime:
              </p>
            </div>

            <div className="bg-neutral-950 border border-neutral-800 p-6 rounded-3xl space-y-2 text-xs">
              <p className="text-neutral-300 font-bold">📧 Email: <span className="text-orange-400 font-mono">digitaldining077@gmail.com</span></p>
              <p className="text-neutral-300 font-bold">📞 Partner Helpline: <span className="text-emerald-400 font-mono">+91 98765 43210</span></p>
            </div>

            <button 
              onClick={() => router.push(`/dashboard/${restaurantId}`)}
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-4 rounded-xl text-xs uppercase tracking-wider transition shadow-lg shadow-orange-500/25"
            >
              Go to Dashboard 🚀
            </button>
          </div>
        ) : (
          /* REGULAR SUBSCRIPTION & CHECKOUT SCREEN */
          <>
            <div className="text-center space-y-2">
              <span className="text-[10px] bg-orange-500/15 text-orange-400 border border-orange-500/20 px-3 py-1 rounded-full uppercase font-extrabold tracking-widest">
                Step 2 of 2: Secure Razorpay Checkout
              </span>
              <h1 className="text-2xl font-black text-white">Choose Your Subscription</h1>
              <p className="text-xs text-neutral-400">Complete payment via UPI, Card, or NetBanking to launch your dashboard.</p>
            </div>

            {/* FREE TRIAL COUPON */}
            <div className="bg-neutral-950 border border-neutral-800 p-4 rounded-2xl space-y-2">
              <p className="text-xs font-bold text-amber-400">🎁 Have a Free Trial Coupon?</p>
              <div className="flex space-x-2">
                <input 
                  type="text" 
                  placeholder="Enter coupon code" 
                  value={trialPasscode}
                  onChange={(e) => setTrialPasscode(e.target.value)}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-amber-500 font-mono"
                />
                <button 
                  type="button" 
                  onClick={handleApplyPasscode}
                  className="bg-amber-500 hover:bg-amber-600 text-neutral-950 font-black px-4 py-2 rounded-xl text-xs transition"
                >
                  Apply
                </button>
              </div>
              {isTrialUnlocked && <p className="text-[10px] text-emerald-400 font-bold">✓ 1-Month Free Trial Active (₹0)</p>}
            </div>

            {!isTrialUnlocked && (
              <div className="space-y-4">
                {/* PLAN SELECTION */}
                <div className="grid grid-cols-3 gap-3">
                  {['Standard', 'Pro', 'Pro+'].map((plan) => (
                    <button
                      key={plan}
                      type="button"
                      onClick={() => setSelectedPlan(plan)}
                      className={`p-3 rounded-2xl border text-left transition ${selectedPlan === plan ? 'bg-orange-500/10 border-orange-500 text-white' : 'bg-neutral-950 border-neutral-800 text-neutral-400'}`}
                    >
                      <p className="text-xs font-black">{plan}</p>
                      <p className="text-[10px] text-neutral-500 mt-1">₹{pricingTable[plan]['1month']}/mo</p>
                    </button>
                  ))}
                </div>

                {/* BILLING CYCLE SELECTION */}
                <div className="grid grid-cols-3 gap-3">
                  {[
                    { id: '1month', label: '1 Month' },
                    { id: '3months', label: '3 Months (10% Off)' },
                    { id: '1year', label: '1 Year (20% Off)' }
                  ].map((cycle) => (
                    <button
                      key={cycle.id}
                      type="button"
                      onClick={() => setBillingCycle(cycle.id)}
                      className={`p-3 rounded-2xl border text-center transition ${billingCycle === cycle.id ? 'bg-neutral-800 border-neutral-600 text-white' : 'bg-neutral-950 border-neutral-800 text-neutral-400'}`}
                    >
                      <p className="text-[11px] font-bold">{cycle.label}</p>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* SUMMARY & CHECKOUT BUTTON */}
            <div className="bg-neutral-950 border border-neutral-800 p-4 rounded-2xl flex items-center justify-between">
              <div>
                <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">Total Payable</p>
                <p className="text-xl font-black text-white font-mono">₹{currentPrice}</p>
              </div>
              <button 
                onClick={handlePaymentCheckout}
                disabled={loading}
                className="bg-orange-500 hover:bg-orange-600 text-white font-black px-6 py-4 rounded-xl text-xs uppercase tracking-wider transition shadow-lg shadow-orange-500/25 disabled:opacity-50"
              >
                {loading ? 'Opening Gateway...' : 'Pay with Razorpay 💳'}
              </button>
            </div>
          </>
        )}

      </div>
    </div>
  )
}