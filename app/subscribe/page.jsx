'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function SubscribePage() {
  const [loading, setLoading] = useState(false)
  const [scriptLoaded, setScriptLoaded] = useState(false)
  const router = useRouter()

  useEffect(() => {
    const script = document.createElement('script')
    script.src = 'https://checkout.razorpay.com/v1/checkout.js'
    script.async = true
    script.onload = () => setScriptLoaded(true)
    document.body.appendChild(script)

    return () => {
      if (script.parentNode) {
        script.parentNode.removeChild(script)
      }
    }
  }, [])

  const handleSubscribe = async () => {
    if (!scriptLoaded) {
      alert('Razorpay SDK is still loading. Please try again in a moment.')
      return
    }

    setLoading(true)
    try {
      const { data: authData, error: userError } = await supabase.auth.getUser()
      if (userError || !authData?.user) {
        throw new Error('Please log in first before subscribing.')
      }
      const user = authData.user

      // Call backend API to create the subscription order
     const res = await fetch('/api/create-subscription-order', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ planAmount: 999, restaurantId: user.id }),
})
      const responseText = await res.text()

      // If the response starts with '<' (like an HTML error page), throw a clear message
      if (responseText.trim().startsWith('<')) {
        throw new Error(`API Route not found or crashed (HTML returned instead of JSON). Check if /app/api/create-subscription-order/route.js exists.`)
      }

      let data
      try {
        data = JSON.parse(responseText)
      } catch (e) {
        throw new Error(`Invalid JSON response: ${responseText}`)
      }

      if (!data.success) {
        throw new Error(data.error || 'Failed to initialize payment order.')
      }

      // Razorpay Checkout Options
      const options = {
        key: data.keyId,
        amount: data.amount,
        currency: data.currency,
        name: 'Digital Dining SaaS',
        description: 'Monthly Platform Subscription',
        order_id: data.orderId,
        handler: async function (response) {
          const { error: updateError } = await supabase
            .from('restaurants')
            .update({ subscription_status: 'active' })
            .eq('id', user.id)

          if (updateError) {
            alert('Payment successful, but failed to update status in database.')
          } else {
            alert('Subscription activated successfully!')
            router.push('/dashboard')
          }
        },
        prefill: {
          email: user.email,
        },
        theme: { color: '#ea580c' },
      }

      const rzp = new window.Razorpay(options)
      rzp.open()
    } catch (err) {
      alert(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 p-6">
      <div className="max-w-md w-full bg-white p-8 rounded-xl shadow-md text-center space-y-6">
        <h1 className="text-2xl font-bold text-gray-900">Activate Your SaaS Subscription</h1>
        <p className="text-gray-600">
          Get full access to your digital restaurant menu, order management, and custom domain hosting for just <span className="font-bold text-orange-600">₹999/month</span>.
        </p>
        <button
          onClick={handleSubscribe}
          disabled={loading || !scriptLoaded}
          className="w-full bg-orange-600 text-white py-3 rounded-lg font-semibold hover:bg-orange-700 transition disabled:opacity-50"
        >
          {loading ? 'Processing...' : 'Pay ₹999 & Activate Now'}
        </button>
      </div>
    </div>
  )
}