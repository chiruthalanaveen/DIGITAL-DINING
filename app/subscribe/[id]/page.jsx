'use client'

import { use, useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const PLANS = {
  restaurant_pro: {
    code: 'restaurant_pro',
    name: 'Restaurant',
    legacyPlan: 'Pro',
    businessType: 'restaurant',
    restaurantEnabled: true,
    resortEnabled: false,
    deliveryEnabled: false,
    badge: '🍽️ RESTAURANT',
    description: 'Complete restaurant operations with all Restaurant features.',
    prices: {
      '1month': 1499,
      '6months': 8095,
      '12months': 14390,
    },
  },

  delivery: {
    code: 'delivery',
    name: 'Delivery',
    legacyPlan: 'Pro',
    businessType: 'delivery',
    restaurantEnabled: false,
    resortEnabled: false,
    deliveryEnabled: true,
    badge: '🚚 DELIVERY',
    description: 'Complete delivery operations with all Delivery features.',
    prices: {
      '1month': 1499,
      '6months': 8095,
      '12months': 14390,
    },
  },

  restaurant_resort_pro: {
    code: 'restaurant_resort_pro',
    name: 'Restaurant + Resort',
    legacyPlan: 'Pro+',
    businessType: 'restaurant_resort',
    restaurantEnabled: true,
    resortEnabled: true,
    deliveryEnabled: false,
    badge: '🍽️ + 🏨',
    description: 'All Restaurant and Resort / Hotel features in one subscription.',
    prices: {
      '1month': 2999,
      '6months': 16195,
      '12months': 28790,
    },
  },

  restaurant_delivery: {
    code: 'restaurant_delivery',
    name: 'Restaurant + Delivery',
    legacyPlan: 'Pro',
    businessType: 'restaurant_delivery',
    restaurantEnabled: true,
    resortEnabled: false,
    deliveryEnabled: true,
    badge: '🍽️ + 🚚',
    description: 'All Restaurant and Delivery features in one subscription.',
    prices: {
      '1month': 2999,
      '6months': 16195,
      '12months': 28790,
    },
  },

  restaurant_resort_delivery: {
    code: 'restaurant_resort_delivery',
    name: 'Restaurant + Resort + Delivery',
    legacyPlan: 'Pro+',
    businessType: 'restaurant_resort_delivery',
    restaurantEnabled: true,
    resortEnabled: true,
    deliveryEnabled: true,
    badge: '🍽️ + 🏨 + 🚚',
    description: 'The complete Digital Dining suite with every available module.',
    prices: {
      '1month': 3999,
      '6months': 21595,
      '12months': 38390,
    },
  },
}

const PLAN_ALIASES = {
  // Legacy aliases kept so older links do not break.
  Standard: 'restaurant_pro',
  Pro: 'restaurant_pro',
  'Pro+': 'restaurant_resort_pro',
  restaurant_standard: 'restaurant_pro',
  restaurant_resort_standard: 'restaurant_resort_pro',

  restaurant_pro: 'restaurant_pro',
  delivery: 'delivery',
  restaurant_resort_pro: 'restaurant_resort_pro',
  restaurant_delivery: 'restaurant_delivery',
  restaurant_resort_delivery: 'restaurant_resort_delivery',
}

const CYCLES = [
  { id: '1month', label: '1 Month', note: 'Monthly billing' },
  { id: '6months', label: '6 Months', note: 'About 10% lower' },
  { id: '12months', label: '12 Months', note: 'About 20% lower' },
]

const money = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', {
    maximumFractionDigits: 0,
  })}`

export default function SubscriptionPage({ params, searchParams }) {
  const unwrappedParams = use(params)
  const unwrappedSearchParams = use(searchParams)

  const restaurantId = String(unwrappedParams?.id || '').trim()
  const router = useRouter()

  const requestedPlan = String(unwrappedSearchParams?.plan || '').trim()
  const initialPlan =
    PLAN_ALIASES[requestedPlan] ||
    PLAN_ALIASES[requestedPlan.toLowerCase()] ||
    'restaurant_pro'

  const [selectedPlan, setSelectedPlan] = useState(initialPlan)
  const [billingCycle, setBillingCycle] = useState('1month')
  const [couponCode, setCouponCode] = useState('')
  const [couponLoading, setCouponLoading] = useState(false)
  const [loading, setLoading] = useState(false)
  const [scriptLoaded, setScriptLoaded] = useState(false)
  const [isActivated, setIsActivated] = useState(false)
  const [activatedRestaurant, setActivatedRestaurant] = useState(null)

  const selectedPlanData = useMemo(
    () => PLANS[selectedPlan] || PLANS.restaurant_pro,
    [selectedPlan]
  )

  const currentPrice = Number(
    selectedPlanData.prices[billingCycle] || 0
  )

  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    if (window.Razorpay) {
      setScriptLoaded(true)
      return undefined
    }

    const selector = 'script[data-digital-dining-razorpay="true"]'
    let script = document.querySelector(selector)

    const onLoad = () => setScriptLoaded(true)
    const onError = () => setScriptLoaded(false)

    if (!script) {
      script = document.createElement('script')
      script.src = 'https://checkout.razorpay.com/v1/checkout.js'
      script.async = true
      script.dataset.digitalDiningRazorpay = 'true'
      document.body.appendChild(script)
    }

    script.addEventListener('load', onLoad)
    script.addEventListener('error', onError)

    if (window.Razorpay) {
      setScriptLoaded(true)
    }

    return () => {
      script?.removeEventListener('load', onLoad)
      script?.removeEventListener('error', onError)
    }
  }, [])

  const getAccessToken = async () => {
    const {
      data: { session },
      error,
    } = await supabase.auth.getSession()

    if (error || !session?.access_token) {
      throw new Error(
        'Your login session has expired. Please sign in again.'
      )
    }

    return session.access_token
  }

  const readJsonResponse = async (response) => {
    const text = await response.text()

    if (!text?.trim()) {
      throw new Error('Server returned an empty response.')
    }

    if (text.trim().startsWith('<')) {
      throw new Error(
        'API route returned an HTML error page. Check your server terminal.'
      )
    }

    let data

    try {
      data = JSON.parse(text)
    } catch {
      throw new Error(`Failed to parse server response: ${text}`)
    }

    if (!response.ok || !data?.success) {
      throw new Error(
        data?.message ||
          data?.error ||
          'The subscription request failed.'
      )
    }

    return data
  }

  const activateCoupon = async () => {
    if (couponLoading || loading) return

    const cleanCoupon = couponCode.trim()

    if (!cleanCoupon) {
      alert('Enter a subscription coupon code.')
      return
    }

    setCouponLoading(true)

    try {
      const accessToken = await getAccessToken()

      const response = await fetch('/api/verify-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          mode: 'coupon',
          restaurantId,
          couponCode: cleanCoupon,
        }),
      })

      const data = await readJsonResponse(response)

      setActivatedRestaurant(data.restaurant || null)
      setIsActivated(true)
    } catch (error) {
      console.error('Coupon activation error:', error)

      alert(
        error?.message ||
          'Unable to activate this subscription coupon.'
      )
    } finally {
      setCouponLoading(false)
    }
  }

  const verifyPaidSubscription = async (razorpayResponse) => {
    const accessToken = await getAccessToken()

    const response = await fetch('/api/verify-subscription', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        mode: 'payment',
        restaurantId,
        planCode: selectedPlanData.code,
        billingCycle,
        razorpay_order_id: razorpayResponse?.razorpay_order_id,
        razorpay_payment_id: razorpayResponse?.razorpay_payment_id,
        razorpay_signature: razorpayResponse?.razorpay_signature,
      }),
    })

    const data = await readJsonResponse(response)

    setActivatedRestaurant(data.restaurant || null)
    setIsActivated(true)
  }

  const handlePaymentCheckout = async () => {
    if (loading) return

    setLoading(true)

    try {
      if (!restaurantId) {
        throw new Error('Restaurant ID is missing.')
      }

      if (!Number.isFinite(currentPrice) || currentPrice <= 0) {
        throw new Error('Invalid subscription amount.')
      }

      if (!scriptLoaded && typeof window.Razorpay === 'undefined') {
        throw new Error(
          'Razorpay Checkout is still loading. Please try again in a few seconds.'
        )
      }

      const accessToken = await getAccessToken()

      const response = await fetch('/api/create-order', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          restaurantId,
          plan: selectedPlanData.code,
          billingCycle,
        }),
      })

      const data = await readJsonResponse(response)
      const orderData = data.order || data

      const orderAmount = Number(orderData.amount || data.amount || 0)
      const orderId = String(orderData.id || data.orderId || '').trim()
      const razorpayKey = String(
        data.keyId || data.key_id || data.key || ''
      ).trim()

      if (!orderAmount || !orderId || !razorpayKey) {
        throw new Error(
          'Server returned incomplete Razorpay order details.'
        )
      }

      const paymentObject = new window.Razorpay({
        key: razorpayKey,
        amount: orderAmount,
        currency: orderData.currency || 'INR',
        name: 'Digital Dining',
        description: `${selectedPlanData.name} (${billingCycle}) Subscription`,
        order_id: orderId,

        handler: async function (razorpayResponse) {
          setLoading(true)

          try {
            await verifyPaidSubscription(razorpayResponse)
          } catch (error) {
            console.error('Subscription verification failed:', error)

            alert(
              'Payment was received, but subscription verification failed: ' +
                (error?.message || 'Please contact support.')
            )
          } finally {
            setLoading(false)
          }
        },

        prefill: {
          name: 'Digital Dining Partner',
        },

        theme: {
          color: '#f97316',
        },

        modal: {
          ondismiss: () => setLoading(false),
        },
      })

      paymentObject.on('payment.failed', (response) => {
        setLoading(false)

        alert(
          'Payment Failed: ' +
            (response?.error?.description || 'Please try again.')
        )
      })

      paymentObject.open()
    } catch (error) {
      console.error('Subscription payment error:', error)

      alert(
        'Payment Initialization Error: ' +
          (error?.message || 'Please try again.')
      )

      setLoading(false)
    }
  }

  if (isActivated) {
    const activePlanCode =
      activatedRestaurant?.plan_code || selectedPlanData.code

    return (
      <main className="min-h-screen bg-neutral-950 px-4 py-12 text-neutral-100">
        <div className="mx-auto max-w-xl rounded-3xl border border-neutral-800 bg-neutral-900 p-6 text-center shadow-2xl sm:p-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-500/10 text-3xl">
            ✓
          </div>

          <h1 className="mt-5 text-2xl font-black text-white">
            Subscription activated
          </h1>

          <p className="mt-2 text-sm text-neutral-400">
            Your Digital Dining workspace has been updated successfully.
          </p>

          <div className="mt-6 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
            <p className="text-[10px] font-black uppercase tracking-wider text-neutral-500">
              Active plan
            </p>
            <p className="mt-1 text-sm font-black text-emerald-400">
              {PLANS[activePlanCode]?.name ||
                selectedPlanData.name}
            </p>
          </div>

          <button
            type="button"
            onClick={() => router.push(`/dashboard/${restaurantId}`)}
            className="mt-6 w-full rounded-xl bg-orange-500 px-5 py-4 text-xs font-black uppercase tracking-wider text-white transition hover:bg-orange-600"
          >
            Go to Dashboard
          </button>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-10 text-neutral-100">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="text-center">
          <span className="inline-flex rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-orange-400">
            Digital Dining Subscription
          </span>

          <h1 className="mt-4 text-3xl font-black tracking-tight text-white">
            Choose the modules your business needs
          </h1>

          <p className="mx-auto mt-2 max-w-2xl text-sm leading-6 text-neutral-400">
            There are no Standard / Pro feature restrictions anymore. Every
            module in your selected subscription includes its full feature set.
          </p>
        </header>

        <section className="rounded-3xl border border-amber-500/20 bg-amber-500/5 p-5 sm:p-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-wider text-amber-400">
                Testing Coupon · 1 Month Free
              </p>

              <h2 className="mt-1 text-lg font-black text-white">
                Activate the subscription linked to your coupon
              </h2>

              <p className="mt-1 max-w-xl text-xs leading-5 text-neutral-400">
                Each coupon is mapped to one of the five subscriptions.
                The server decides the plan from the coupon code; no Razorpay
                payment is created for a valid test coupon.
              </p>
            </div>

            <div className="flex w-full gap-2 lg:max-w-md">
              <input
                type="password"
                value={couponCode}
                onChange={(event) =>
                  setCouponCode(
                    event.target.value.toUpperCase()
                  )
                }
                placeholder="Enter 1-month coupon"
                autoComplete="off"
                className="min-w-0 flex-1 rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-xs font-mono text-white outline-none focus:border-amber-500"
              />

              <button
                type="button"
                onClick={activateCoupon}
                disabled={couponLoading || loading}
                className="rounded-xl bg-amber-500 px-4 py-3 text-xs font-black text-neutral-950 transition hover:bg-amber-400 disabled:opacity-50"
              >
                {couponLoading ? 'Checking...' : 'Activate'}
              </button>
            </div>
          </div>

          <p className="mt-3 text-[10px] font-bold text-amber-300/80">
            Testing coupons grant 1 month free and can be redeemed once per
            restaurant for that coupon.
          </p>
        </section>

            <section>
              <div className="mb-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
                  Plans
                </p>
                <h2 className="mt-1 text-xl font-black text-white">
                  Five simple subscriptions
                </h2>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {Object.values(PLANS).map((plan) => {
                  const selected = selectedPlan === plan.code

                  return (
                    <button
                      key={plan.code}
                      type="button"
                      onClick={() => setSelectedPlan(plan.code)}
                      className={`rounded-3xl border p-5 text-left transition ${
                        selected
                          ? 'border-orange-500 bg-orange-500/10 shadow-lg shadow-orange-500/10'
                          : 'border-neutral-800 bg-neutral-900 hover:border-neutral-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p
                            className={`text-[9px] font-black uppercase tracking-wider ${
                              selected
                                ? 'text-orange-400'
                                : 'text-neutral-500'
                            }`}
                          >
                            {plan.badge}
                          </p>

                          <h3 className="mt-2 text-base font-black text-white">
                            {plan.name}
                          </h3>
                        </div>

                        <div
                          className={`mt-0.5 flex h-5 w-5 items-center justify-center rounded-full border ${
                            selected
                              ? 'border-orange-500 bg-orange-500 text-white'
                              : 'border-neutral-700'
                          }`}
                        >
                          {selected ? '✓' : ''}
                        </div>
                      </div>

                      <p className="mt-3 min-h-[40px] text-xs leading-5 text-neutral-400">
                        {plan.description}
                      </p>

                      <div className="mt-4">
                        <span className="text-2xl font-black text-white">
                          {money(plan.prices['1month'])}
                        </span>
                        <span className="text-xs font-bold text-neutral-500">
                          {' '}
                          / month
                        </span>
                      </div>

                      <p className="mt-2 text-[10px] font-bold text-emerald-400">
                        All included module features unlocked
                      </p>
                    </button>
                  )
                })}
              </div>
            </section>

            <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5 sm:p-6">
              <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
                Billing cycle
              </p>

              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                {CYCLES.map((cycle) => {
                  const selected = billingCycle === cycle.id

                  return (
                    <button
                      key={cycle.id}
                      type="button"
                      onClick={() => setBillingCycle(cycle.id)}
                      className={`rounded-2xl border p-4 text-left transition ${
                        selected
                          ? 'border-orange-500 bg-orange-500/10'
                          : 'border-neutral-800 bg-neutral-950'
                      }`}
                    >
                      <p className="text-xs font-black text-white">
                        {cycle.label}
                      </p>

                      <p className="mt-1 text-[10px] text-neutral-500">
                        {cycle.note}
                      </p>

                      <p className="mt-3 text-base font-black text-orange-400">
                        {money(selectedPlanData.prices[cycle.id])}
                      </p>
                    </button>
                  )
                })}
              </div>
            </section>

        <section className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5 sm:p-6">
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-widest text-neutral-500">
                Total payable
              </p>

              <p className="mt-1 text-3xl font-black text-white">
                {money(currentPrice)}
              </p>

              <p className="mt-1 text-[10px] font-bold text-emerald-400">
                GST included
              </p>

              <p className="mt-2 text-xs text-neutral-400">
                {`${selectedPlanData.name} · ${
                  CYCLES.find((item) => item.id === billingCycle)?.label
                }`}
              </p>
            </div>

            <button
              type="button"
              onClick={handlePaymentCheckout}
              disabled={loading}
              className="w-full rounded-xl bg-orange-500 px-6 py-4 text-xs font-black uppercase tracking-wider text-white transition hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {loading
                ? 'Processing...'
                : 'Continue to Razorpay'}
            </button>
          </div>
        </section>

        <p className="text-center text-[10px] leading-5 text-neutral-600">
          Paid subscriptions are activated only after the server verifies the
          Razorpay payment. Customer payment-gateway credentials for Restaurant,
          Resort and Delivery remain separate from this SaaS subscription
          checkout.
        </p>
      </div>
    </main>
  )
}
