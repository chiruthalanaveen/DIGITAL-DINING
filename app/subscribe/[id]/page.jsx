'use client'

import {
  useState,
  use,
  useEffect,
  useMemo,
} from 'react'

import {
  useRouter,
} from 'next/navigation'

import {
  supabase,
} from '@/lib/supabase'


const PLANS = {
  restaurant_standard: {
    code:
      'restaurant_standard',

    name:
      'Restaurant Standard',

    legacyPlan:
      'Standard',

    businessType:
      'restaurant',

    resortEnabled:
      false,

    prices: {
      '1month': 799,
      '6months': 4315,
      '12months': 7670,
    },
  },

  restaurant_pro: {
    code:
      'restaurant_pro',

    name:
      'Restaurant Pro',

    legacyPlan:
      'Pro',

    businessType:
      'restaurant',

    resortEnabled:
      false,

    prices: {
      '1month': 1299,
      '6months': 7015,
      '12months': 12470,
    },
  },

  restaurant_resort_standard: {
    code:
      'restaurant_resort_standard',

    name:
      'Restaurant + Resort Standard',

    legacyPlan:
      'Standard',

    businessType:
      'restaurant_resort',

    resortEnabled:
      true,

    prices: {
      '1month': 1999,
      '6months': 10795,
      '12months': 19190,
    },
  },

  restaurant_resort_pro: {
    code:
      'restaurant_resort_pro',

    name:
      'Restaurant + Resort Pro',

    legacyPlan:
      'Pro+',

    businessType:
      'restaurant_resort',

    resortEnabled:
      true,

    prices: {
      '1month': 199,
      '6months': 16195,
      '12months': 28790,
    },
  },
}


const PLAN_ALIASES = {
  Standard:
    'restaurant_standard',

  Pro:
    'restaurant_pro',

  'Pro+':
    'restaurant_resort_pro',

  restaurant_standard:
    'restaurant_standard',

  restaurant_pro:
    'restaurant_pro',

  restaurant_resort_standard:
    'restaurant_resort_standard',

  restaurant_resort_pro:
    'restaurant_resort_pro',
}


export default function SubscriptionPage({
  params,
  searchParams,
}) {
  const unwrappedParams =
    use(params)

  const unwrappedSearchParams =
    use(searchParams)

  const restaurantId =
    String(
      unwrappedParams?.id ||
        ''
    ).trim()

  const router =
    useRouter()

  const requestedPlan =
    String(
      unwrappedSearchParams
        ?.plan ||
        ''
    )

  const initialPlan =
    PLAN_ALIASES[
      requestedPlan
    ] ||
    'restaurant_standard'

  const [
    selectedPlan,
    setSelectedPlan,
  ] =
    useState(
      initialPlan
    )

  const [
    billingCycle,
    setBillingCycle,
  ] =
    useState(
      '1month'
    )

  const [
    trialPasscode,
    setTrialPasscode,
  ] =
    useState('')

  const [
    isTrialUnlocked,
    setIsTrialUnlocked,
  ] =
    useState(false)

  const [
    loading,
    setLoading,
  ] =
    useState(false)

  const [
    scriptLoaded,
    setScriptLoaded,
  ] =
    useState(false)

  const [
    isActivated,
    setIsActivated,
  ] =
    useState(false)

  const [
    activatedRestaurant,
    setActivatedRestaurant,
  ] =
    useState(null)


  const selectedPlanData =
    useMemo(
      () =>
        PLANS[
          selectedPlan
        ] ||
        PLANS
          .restaurant_standard,

      [selectedPlan]
    )


  // ==================================================
  // LOAD RAZORPAY
  // ==================================================

  useEffect(() => {
    if (
      typeof window ===
      'undefined'
    ) {
      return
    }

    if (
      window.Razorpay
    ) {
      setScriptLoaded(
        true
      )

      return
    }

    const existing =
      document.querySelector(
        'script[data-digital-dining-razorpay="true"]'
      )

    if (existing) {
      const onLoad =
        () =>
          setScriptLoaded(
            true
          )

      existing
        .addEventListener(
          'load',
          onLoad
        )

      return () =>
        existing
          .removeEventListener(
            'load',
            onLoad
          )
    }

    const script =
      document.createElement(
        'script'
      )

    script.src =
      'https://checkout.razorpay.com/v1/checkout.js'

    script.async =
      true

    script.dataset
      .digitalDiningRazorpay =
      'true'

    script.onload =
      () =>
        setScriptLoaded(
          true
        )

    script.onerror =
      () =>
        setScriptLoaded(
          false
        )

    document.body
      .appendChild(
        script
      )
  }, [])


  // ==================================================
  // AUTH TOKEN
  // ==================================================

  const getAccessToken =
    async () => {
      const {
        data: {
          session,
        },

        error,
      } =
        await supabase
          .auth
          .getSession()

      if (
        error ||
        !session
          ?.access_token
      ) {
        throw new Error(
          'Your login session has expired. Please sign in again.'
        )
      }

      return session
        .access_token
    }


  // ==================================================
  // SAFE API RESPONSE
  // ==================================================

  const readJsonResponse =
    async (
      response
    ) => {
      const text =
        await response
          .text()

      if (
        !text?.trim()
      ) {
        throw new Error(
          'Server returned an empty response.'
        )
      }

      if (
        text
          .trim()
          .startsWith(
            '<'
          )
      ) {
        throw new Error(
          'API route returned an HTML error page. Check your server terminal.'
        )
      }

      let data

      try {
        data =
          JSON.parse(
            text
          )
      } catch {
        throw new Error(
          `Failed to parse server response: ${text}`
        )
      }

      if (
        !response.ok ||
        !data?.success
      ) {
        throw new Error(
          data?.message ||
            data?.error ||
            'Request failed.'
        )
      }

      return data
    }


  // ==================================================
  // TRIAL COUPON
  // ==================================================

  const handleApplyPasscode =
    () => {
      if (
        !trialPasscode
          .trim()
      ) {
        alert(
          '❌ Enter the coupon code.'
        )

        return
      }

      setIsTrialUnlocked(
        true
      )

      setSelectedPlan(
        'restaurant_pro'
      )

      setBillingCycle(
        '1month'
      )

      alert(
        '🎁 Coupon entered. Click Activate Free Trial to verify and activate it.'
      )
    }


  // ==================================================
  // ACTIVATE TRIAL
  // ==================================================

  const activateTrial =
    async () => {
      const accessToken =
        await getAccessToken()

      const response =
        await fetch(
          '/api/verify-subscription',
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',

              Authorization:
                `Bearer ${accessToken}`,
            },

            body:
              JSON.stringify(
                {
                  mode:
                    'trial',

                  restaurantId,

                  trialPasscode:
                    trialPasscode
                      .trim(),
                }
              ),
          }
        )

      const data =
        await readJsonResponse(
          response
        )

      setActivatedRestaurant(
        data.restaurant ||
          null
      )

      setIsActivated(
        true
      )
    }


  // ==================================================
  // VERIFY PAID SUBSCRIPTION
  // ==================================================

  const verifyPaidSubscription =
    async (
      razorpayResponse
    ) => {
      const accessToken =
        await getAccessToken()

      const response =
        await fetch(
          '/api/verify-subscription',
          {
            method:
              'POST',

            headers: {
              'Content-Type':
                'application/json',

              Authorization:
                `Bearer ${accessToken}`,
            },

            body:
              JSON.stringify(
                {
                  mode:
                    'payment',

                  restaurantId,

                  planCode:
                    selectedPlanData
                      .code,

                  billingCycle,

                  razorpay_order_id:
                    razorpayResponse
                      ?.razorpay_order_id,

                  razorpay_payment_id:
                    razorpayResponse
                      ?.razorpay_payment_id,

                  razorpay_signature:
                    razorpayResponse
                      ?.razorpay_signature,
                }
              ),
          }
        )

      const data =
        await readJsonResponse(
          response
        )

      setActivatedRestaurant(
        data.restaurant ||
          null
      )

      setIsActivated(
        true
      )
    }


  // ==================================================
  // CHECKOUT
  // ==================================================

  const handlePaymentCheckout =
    async () => {
      if (loading) {
        return
      }

      setLoading(true)

      try {
        if (
          !restaurantId
        ) {
          throw new Error(
            'Restaurant ID is missing.'
          )
        }

        // ----------------------------------------------
        // FREE TRIAL
        // ----------------------------------------------

        if (
          isTrialUnlocked
        ) {
          await activateTrial()

          return
        }

        // ----------------------------------------------
        // PAID PLAN
        // ----------------------------------------------

        const amountToPay =
          selectedPlanData
            .prices[
              billingCycle
            ]

        if (
          !Number.isFinite(
            amountToPay
          ) ||
          amountToPay <= 0
        ) {
          throw new Error(
            'Paid subscription price must be greater than ₹0. Use the free-trial option for zero-cost testing.'
          )
        }

        if (
          !scriptLoaded &&
          typeof window
            .Razorpay ===
            'undefined'
        ) {
          throw new Error(
            'Razorpay SDK is loading. Please try again in 3 seconds.'
          )
        }

        const accessToken =
          await getAccessToken()

        const response =
          await fetch(
            '/api/create-order',
            {
              method:
                'POST',

              headers: {
                'Content-Type':
                  'application/json',

                Authorization:
                  `Bearer ${accessToken}`,
              },

              body:
                JSON.stringify(
                  {
                    restaurantId,

                    plan:
                      selectedPlanData
                        .code,

                    billingCycle,
                  }
                ),
            }
          )

        const data =
          await readJsonResponse(
            response
          )

        const orderData =
          data.order ||
          data

        const orderAmount =
          orderData.amount ||
          data.amount

        const orderId =
          orderData.id ||
          data.orderId

        const razorpayKey =
          data.keyId ||
          data.key_id ||
          data.key

        if (
          !orderAmount ||
          !orderId
        ) {
          throw new Error(
            'Server returned invalid Razorpay order details.'
          )
        }

        if (
          !razorpayKey
        ) {
          throw new Error(
            'Razorpay Key ID is missing from the server response.'
          )
        }

        const paymentObject =
          new window.Razorpay(
            {
              key:
                razorpayKey,

              amount:
                orderAmount,

              currency:
                orderData
                  .currency ||
                'INR',

              name:
                'Digital Dining',

              description:
                `${selectedPlanData.name} (${billingCycle}) Subscription`,

              order_id:
                orderId,

              handler:
                async function (
                  razorpayResponse
                ) {
                  setLoading(
                    true
                  )

                  try {
                    await verifyPaidSubscription(
                      razorpayResponse
                    )
                  } catch (
                    error
                  ) {
                    console.error(
                      'Subscription verification failed:',
                      error
                    )

                    alert(
                      'Payment was received, but subscription verification failed: ' +
                        (
                          error
                            ?.message ||
                          'Unknown error'
                        )
                    )
                  } finally {
                    setLoading(
                      false
                    )
                  }
                },

              prefill: {
                name:
                  'Restaurant Partner',
              },

              theme: {
                color:
                  '#f97316',
              },

              modal: {
                ondismiss:
                  () =>
                    setLoading(
                      false
                    ),
              },
            }
          )

        paymentObject.on(
          'payment.failed',

          (response) => {
            setLoading(
              false
            )

            alert(
              'Payment Failed: ' +
                (
                  response
                    ?.error
                    ?.description ||
                  'Please try again.'
                )
            )
          }
        )

        paymentObject.open()
      } catch (
        error
      ) {
        console.error(
          'Payment initialization error:',
          error
        )

        alert(
          'Payment Initialization Error: ' +
            (
              error
                ?.message ||
              'Unknown error'
            )
        )

        setLoading(
          false
        )
      }
    }


  const currentPrice =
    isTrialUnlocked
      ? 0
      : (
          selectedPlanData
            .prices[
              billingCycle
            ] ?? 0
        )


  const cycles = [
    {
      id: '1month',
      label: '1 Month',
    },

    {
      id: '6months',
      label: '6 Months',
    },

    {
      id: '12months',
      label: '12 Months',
    },
  ]


  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-4 font-sans py-12">
      <div className="bg-neutral-900 border border-neutral-800 rounded-3xl max-w-3xl w-full p-8 shadow-2xl space-y-6">

        {isActivated ? (
          <div className="text-center space-y-6 py-6">

            <span className="text-4xl">
              🎉
            </span>

            <div className="space-y-2">

              <h1 className="text-2xl font-black text-white">
                Subscription Activated Successfully!
              </h1>

              {activatedRestaurant
                ?.plan_code && (
                <p className="text-xs font-bold text-emerald-400">
                  Active Plan:{' '}
                  {
                    activatedRestaurant
                      .plan_code
                  }
                </p>
              )}

              <p className="text-xs text-neutral-400">
                Your account is ready to go. If you need any assistance with your setup or support, please contact us anytime:
              </p>

            </div>

            <div className="bg-neutral-950 border border-neutral-800 p-6 rounded-3xl space-y-2 text-xs">

              <p className="text-neutral-300 font-bold">
                📧 Email:{' '}
                <span className="text-orange-400 font-mono">
                  digitaldining077@gmail.com
                </span>
              </p>

              <p className="text-neutral-300 font-bold">
                📞 Partner Helpline:{' '}
                <span className="text-emerald-400 font-mono">
                  +91 98765 43210
                </span>
              </p>

            </div>

            <button
              onClick={() =>
                router.push(
                  `/dashboard/${restaurantId}`
                )
              }
              className="w-full bg-orange-500 hover:bg-orange-600 text-white font-black py-4 rounded-xl text-xs uppercase tracking-wider transition shadow-lg shadow-orange-500/25"
            >
              Go to Dashboard 🚀
            </button>

          </div>
        ) : (
          <>

            <div className="text-center space-y-2">

              <span className="text-[10px] bg-orange-500/15 text-orange-400 border border-orange-500/20 px-3 py-1 rounded-full uppercase font-extrabold tracking-widest">
                Step 2 of 2: Secure Razorpay Checkout
              </span>

              <h1 className="text-2xl font-black text-white">
                Choose Your Subscription
              </h1>

              <p className="text-xs text-neutral-400">
                Complete payment via UPI, Card, or NetBanking to launch your dashboard.
              </p>

            </div>


            <div className="bg-neutral-950 border border-neutral-800 p-4 rounded-2xl space-y-2">

              <p className="text-xs font-bold text-amber-400">
                🎁 Have a Free Trial Coupon?
              </p>

              <div className="flex space-x-2">

                <input
                  type="password"
                  placeholder="Enter coupon code"
                  value={
                    trialPasscode
                  }
                  onChange={(
                    event
                  ) => {
                    setTrialPasscode(
                      event.target
                        .value
                    )

                    setIsTrialUnlocked(
                      false
                    )
                  }}
                  className="w-full bg-neutral-900 border border-neutral-700 rounded-xl px-3 py-2 text-white text-xs focus:outline-none focus:border-amber-500 font-mono"
                />

                <button
                  type="button"
                  onClick={
                    handleApplyPasscode
                  }
                  className="bg-amber-500 hover:bg-amber-600 text-neutral-950 font-black px-4 py-2 rounded-xl text-xs transition"
                >
                  Apply
                </button>

              </div>

              {isTrialUnlocked && (
                <p className="text-[10px] text-emerald-400 font-bold">
                  ✓ 14-days Restaurant Pro Free Trial Ready
                </p>
              )}

            </div>


            {!isTrialUnlocked && (
              <div className="space-y-4">

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">

                  {Object.values(
                    PLANS
                  ).map(
                    (
                      plan
                    ) => (
                      <button
                        key={
                          plan.code
                        }
                        type="button"
                        onClick={() =>
                          setSelectedPlan(
                            plan.code
                          )
                        }
                        className={`p-4 rounded-2xl border text-left transition ${
                          selectedPlan ===
                          plan.code
                            ? 'bg-orange-500/10 border-orange-500 text-white'
                            : 'bg-neutral-950 border-neutral-800 text-neutral-400'
                        }`}
                      >

                        <div className="flex items-center justify-between gap-2">

                          <p className="text-xs font-black">
                            {
                              plan.name
                            }
                          </p>

                          {plan.resortEnabled && (
                            <span className="text-[9px] bg-emerald-500/15 text-emerald-400 px-2 py-1 rounded-full font-black">
                              🏨 RESORT
                            </span>
                          )}

                        </div>

                        <p className="text-[10px] text-neutral-500 mt-1">
                          ₹
                          {plan.prices[
                            '1month'
                          ].toLocaleString(
                            'en-IN'
                          )}
                          /month
                        </p>

                      </button>
                    )
                  )}

                </div>


                <div className="grid grid-cols-3 gap-3">

                  {cycles.map(
                    (
                      cycle
                    ) => (
                      <button
                        key={
                          cycle.id
                        }
                        type="button"
                        onClick={() =>
                          setBillingCycle(
                            cycle.id
                          )
                        }
                        className={`p-3 rounded-2xl border text-center transition ${
                          billingCycle ===
                          cycle.id
                            ? 'bg-neutral-800 border-neutral-600 text-white'
                            : 'bg-neutral-950 border-neutral-800 text-neutral-400'
                        }`}
                      >

                        <p className="text-[11px] font-bold">
                          {
                            cycle.label
                          }
                        </p>

                        <p className="text-[10px] text-neutral-500 mt-1">
                          ₹
                          {selectedPlanData
                            .prices[
                              cycle.id
                            ]
                            .toLocaleString(
                              'en-IN'
                            )}
                        </p>

                      </button>
                    )
                  )}

                </div>

              </div>
            )}


            <div className="bg-neutral-950 border border-neutral-800 p-4 rounded-2xl flex items-center justify-between gap-4">

              <div>

                <p className="text-[10px] text-neutral-400 uppercase tracking-widest font-bold">
                  Total Payable
                </p>

                <p className="text-xl font-black text-white font-mono">
                  ₹
                  {currentPrice
                    .toLocaleString(
                      'en-IN'
                    )}
                </p>

                <p className="text-[10px] text-emerald-400 font-bold mt-1">
                  ✓ GST Included
                </p>

              </div>

              <button
                onClick={
                  handlePaymentCheckout
                }
                disabled={
                  loading
                }
                className="bg-orange-500 hover:bg-orange-600 text-white font-black px-6 py-4 rounded-xl text-xs uppercase tracking-wider transition shadow-lg shadow-orange-500/25 disabled:opacity-50"
              >
                {loading
                  ? 'Processing...'
                  : isTrialUnlocked
                    ? 'Activate Free Trial 🎁'
                    : 'Pay with Razorpay 💳'}
              </button>

            </div>

          </>
        )}

      </div>
    </div>
  )
}