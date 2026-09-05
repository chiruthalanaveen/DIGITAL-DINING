'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function SubscriptionBilling({ restaurantId, currentPlan }) {
  const [loading, setLoading] = useState(false)

  // Plan pricing structure in INR
  const plans = {
    Starter: { name: 'Starter Plan', price: 500 },
    Pro: { name: 'Pro Plan', price: 799 },
    Enterprise: { name: 'Enterprise Plan', price: 999 }
  }

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      const script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.onload = () => resolve(true)
      script.onerror = () => resolve(false)
      document.body.appendChild(script)
    })
  }

  const handleSubscribe = async (planKey) => {
    const plan = plans[planKey]
    setLoading(true)

    const res = await loadRazorpayScript()
    if (!res) {
      alert('Razorpay SDK failed to load. Check your internet connection.')
      setLoading(false)
      return
    }

    try {
      // 1. Create order on backend
      const response = await fetch('/api/create-subscription-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          planName: plan.name, 
          amount: plan.price, 
          restaurantId 
        }),
      })

      const data = await response.json()
      if (!data.success) throw new Error(data.message)

      // 2. Configure Razorpay Options
      const options = {
        key: process.env.NEXT_PUBLIC_RAZORPAY_KEY_ID,
        amount: data.order.amount,
        currency: 'INR',
        name: 'DIGITAL DINING',
        description: `Subscription for ${plan.name}`,
        order_id: data.order.id,
        handler: async function (response) {
          // SUCCESSFUL PAYMENT HANDLER
          const { error } = await supabase
            .from('restaurants')
            .update({ plan: planKey })
            .eq('id', restaurantId)

          if (error) {
            alert('Payment successful, but failed to update subscription tier: ' + error.message)
          } else {
            alert(`Payment Successful! Your account has been upgraded to the ${plan.name}.`)
            window.location.reload()
          }
        },
        prefill: {
          name: 'Restaurant Partner',
          email: 'partner@digitaldining.com',
        },
        theme: {
          color: '#f97316',
        },
        modal: {
          ondismiss: function () {
            alert('Payment window closed or transaction failed.')
            setLoading(false)
          }
        }
      }

      const paymentWindow = new window.Razorpay(options)
      
      paymentWindow.on('payment.failed', function (response) {
        alert(`Payment Failed! Reason: ${response.error.description}`)
        setLoading(false)
      })

      paymentWindow.open()
    } catch (err) {
      alert('Error initializing payment: ' + err.message)
      setLoading(false)
    }
  }

  return (
    <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-3xl space-y-6">
      <div>
        <h2 className="text-xl font-black text-white">Subscription & Billing</h2>
        <p className="text-xs text-neutral-400 mt-1">Current Active Plan: <strong className="text-orange-400 uppercase">{currentPlan || 'Starter'}</strong></p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Object.entries(plans).map(([key, plan]) => (
          <div key={key} className="bg-neutral-950 border border-neutral-800 p-5 rounded-2xl flex flex-col justify-between space-y-4">
            <div>
              <h3 className="font-bold text-white text-base">{plan.name}</h3>
              <p className="text-2xl font-black text-emerald-400 mt-2">₹{plan.price}<span className="text-xs text-neutral-500 font-normal">/month</span></p>
            </div>
            <button
              onClick={() => handleSubscribe(key)}
              disabled={loading || currentPlan === key}
              className={`w-full py-3 rounded-xl text-xs font-bold transition ${
                currentPlan === key 
                  ? 'bg-neutral-800 text-neutral-500 cursor-not-allowed' 
                  : 'bg-gradient-to-r from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/20 hover:opacity-95'
              }`}
            >
              {currentPlan === key ? 'Active Plan' : `Upgrade to ${key}`}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}