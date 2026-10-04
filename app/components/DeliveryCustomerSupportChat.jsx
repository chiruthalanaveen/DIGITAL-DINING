'use client'



import {

  useCallback,

  useEffect,

  useMemo,

  useRef,

  useState,

} from 'react'



import { supabase } from '@/lib/supabase'



function digits(value, max = 15) {

  return String(value || '')

    .replace(/\D/g, '')

    .slice(0, max)

}



function formatTime(value) {

  if (!value) return ''



  try {

    return new Intl.DateTimeFormat(

      'en-IN',

      {

        day: '2-digit',

        month: 'short',

        hour: '2-digit',

        minute: '2-digit',

      }

    ).format(

      new Date(value)

    )

  } catch {

    return ''

  }

}



function money(value) {

  return `₹${Number(value || 0).toLocaleString(

    'en-IN',

    {

      maximumFractionDigits: 2,

    }

  )}`

}



const REQUEST_TYPES = [

  ['order_issue', 'Order issue'],

  ['return', 'Return request'],

  ['refund', 'Refund request'],

  ['replacement', 'Replacement request'],

  ['delivery_issue', 'Delivery issue'],

  ['payment_issue', 'Payment issue'],

  ['other', 'Other'],

]



const requestLabel = (value) =>

  REQUEST_TYPES.find(

    ([key]) => key === value

  )?.[1] || 'Order issue'



function Stars({

  value,

  onChange,

  disabled = false,

}) {

  return (

    <div className="flex gap-1">

      {[1, 2, 3, 4, 5].map(

        (star) => (

          <button

            key={star}

            type="button"

            disabled={disabled}

            onClick={() =>

              onChange?.(star)

            }

            className={`text-2xl leading-none transition ${

              star <= Number(value || 0)

                ? 'text-amber-400'

                : 'text-neutral-300'

            } disabled:cursor-default`}

            aria-label={`${star} star${star === 1 ? '' : 's'}`}

          >

            ★

          </button>

        )

      )}

    </div>

  )

}



export default function DeliveryCustomerSupportChat({

  restaurantCode,

  onReviewSubmitted,

}) {

  const [open, setOpen] =

    useState(false)



  const [activeTab, setActiveTab] =

    useState('support')



  const [orderCode, setOrderCode] =

    useState('')



  const [mobile, setMobile] =

    useState('')



  const [thread, setThread] =

    useState(null)



  const [loading, setLoading] =

    useState(false)



  const [sending, setSending] =

    useState(false)



  const [message, setMessage] =

    useState('')



  const [error, setError] =

    useState('')



  const [

    requestType,

    setRequestType,

  ] = useState('order_issue')



  const [

    requestDetails,

    setRequestDetails,

  ] = useState('')



  const [

    raisingRequest,

    setRaisingRequest,

  ] = useState(false)



  const [codRefundStatus, setCodRefundStatus] = useState(null)
  const [codRefundLoading, setCodRefundLoading] = useState(false)
  const [codRefundSubmitting, setCodRefundSubmitting] = useState(false)
  const [codRefundError, setCodRefundError] = useState('')
  const [codRefundMessage, setCodRefundMessage] = useState('')
  const [codRefundConfirmed, setCodRefundConfirmed] = useState(false)
  const [codRefundForm, setCodRefundForm] = useState({
    accountHolderName: '',
    bankName: '',
    ifscCode: '',
    accountNumber: '',
    confirmAccountNumber: '',
  })

  const [

    reviewOrder,

    setReviewOrder,

  ] = useState(null)



  const [

    reviewItems,

    setReviewItems,

  ] = useState([])



  const [

    reviewLoading,

    setReviewLoading,

  ] = useState(false)



  const [

    reviewError,

    setReviewError,

  ] = useState('')



  const [

    reviewDrafts,

    setReviewDrafts,

  ] = useState({})



  const [

    reviewSubmittingId,

    setReviewSubmittingId,

  ] = useState('')



  const endRef = useRef(null)



  const storageKey =

    useMemo(

      () =>

        `digitaldine_delivery_support_${restaurantCode}`,

      [restaurantCode]

    )



  useEffect(() => {

    if (

      typeof window ===

      'undefined'

    ) {

      return

    }



    try {

      const saved =

        JSON.parse(

          localStorage.getItem(

            storageKey

          ) || '{}'

        )



      if (saved?.orderCode) {

        setOrderCode(

          String(

            saved.orderCode

          )

        )

      }



      if (saved?.mobile) {

        setMobile(

          digits(

            saved.mobile,

            10

          )

        )

      }

    } catch {

      // Ignore invalid local storage.

    }

  }, [storageKey])



  const saveIdentity =

    useCallback(

      (

        nextOrderCode,

        nextMobile

      ) => {

        if (

          typeof window ===

          'undefined'

        ) {

          return

        }



        try {

          localStorage.setItem(

            storageKey,

            JSON.stringify({

              orderCode:

                nextOrderCode,

              mobile:

                nextMobile,

            })

          )

        } catch {

          // Ignore unavailable local storage.

        }

      },

      [storageKey]

    )



  const getIdentity = () => {

    const cleanOrderCode =

      String(

        orderCode || ''

      ).trim()



    const cleanMobile =

      digits(

        mobile,

        10

      )



    if (

      !cleanOrderCode ||

      cleanMobile.length !== 10

    ) {

      return null

    }



    return {

      orderCode:

        cleanOrderCode,

      mobile:

        cleanMobile,

    }

  }



  const loadChat =

    useCallback(

      async ({

        createIfMissing = false,

        silent = false,

      } = {}) => {

        const cleanOrderCode =

          String(

            orderCode || ''

          ).trim()



        const cleanMobile =

          digits(

            mobile,

            10

          )



        if (

          !cleanOrderCode ||

          cleanMobile.length !== 10

        ) {

          if (!silent) {

            setError(

              'Enter your Delivery Order Code and the same 10-digit mobile number used for the order.'

            )

          }



          return null

        }



        if (!silent) {

          setLoading(true)

        }



        setError('')



        try {

          const {

            data,

            error: rpcError,

          } =

            await supabase.rpc(

              createIfMissing

                ? 'open_public_delivery_support_chat'

                : 'get_public_delivery_support_chat',

              {

                p_restaurant_code:

                  restaurantCode,



                p_order_code:

                  cleanOrderCode,



                p_customer_mobile:

                  cleanMobile,

              }

            )



          if (rpcError) {

            throw rpcError

          }



          if (!data?.success) {

            throw new Error(

              data?.message ||

                'Unable to load Help Centre.'

            )

          }



          const nextThread =

            data?.thread || null



          setThread(

            nextThread

          )



          saveIdentity(

            cleanOrderCode,

            cleanMobile

          )



          return nextThread

        } catch (loadError) {

          if (

            silent &&

            String(

              loadError?.message ||

                ''

            ).includes(

              'No support chat'

            )

          ) {

            return null

          }



          console.error(

            'Customer Help Centre load error:',

            loadError

          )



          setError(

            loadError?.message ||

              'Unable to load Help Centre.'

          )



          return null

        } finally {

          if (!silent) {

            setLoading(false)

          }

        }

      },

      [

        orderCode,

        mobile,

        restaurantCode,

        saveIdentity,

      ]

    )



  useEffect(() => {

    if (

      !open ||

      activeTab !== 'support' ||

      !thread?.id

    ) {

      return undefined

    }



    const timer =

      window.setInterval(

        () => {

          if (

            document.visibilityState ===

            'visible'

          ) {

            loadChat({

              createIfMissing:

                false,

              silent: true,

            })

          }

        },

        2000

      )



    return () =>

      window.clearInterval(

        timer

      )

  }, [

    open,

    activeTab,

    thread?.id,

    loadChat,

  ])



  useEffect(() => {

    endRef.current?.scrollIntoView?.(

      {

        behavior: 'smooth',

      }

    )

  }, [

    thread?.messages?.length,

  ])



  const sendSupportMessage =

    async (

      text

    ) => {

      const identity =

        getIdentity()



      const cleanMessage =

        String(

          text || ''

        ).trim()



      if (

        !identity ||

        !cleanMessage

      ) {

        throw new Error(

          'Order verification is required.'

        )

      }



      const {

        data,

        error: rpcError,

      } =

        await supabase.rpc(

          'send_public_delivery_support_message',

          {

            p_restaurant_code:

              restaurantCode,



            p_order_code:

              identity.orderCode,



            p_customer_mobile:

              identity.mobile,



            p_message:

              cleanMessage,

          }

        )



      if (rpcError) {

        throw rpcError

      }



      if (!data?.success) {

        throw new Error(

          data?.message ||

            'Unable to send Help Centre message.'

        )

      }



      return data

    }



  const raiseRequest =

    async () => {

      if (raisingRequest) {

        return

      }



      const identity =

        getIdentity()



      if (!identity) {

        setError(

          'Enter your Delivery Order Code and the same 10-digit mobile number used for the order.'

        )

        return

      }



      const details =

        String(

          requestDetails || ''

        ).trim()



      if (details.length < 5) {

        setError(

          'Describe your request in at least a few words.'

        )

        return

      }



      setRaisingRequest(true)

      setError('')



      try {

        const nextThread =

          await loadChat({

            createIfMissing: true,

            silent: false,

          })



        if (!nextThread) {

          return

        }



        const label =

          requestLabel(

            requestType

          )



        await sendSupportMessage(

          `[${label}]\n${details}`

        )



        setRequestDetails('')

        setThread(nextThread)



        await loadChat({

          createIfMissing:

            false,

          silent: true,

        })

      } catch (requestError) {

        console.error(

          'Help Centre request error:',

          requestError

        )



        setError(

          requestError?.message ||

            'Unable to raise your request.'

        )

      } finally {

        setRaisingRequest(false)

      }

    }



  const sendMessage =

    async (event) => {

      event.preventDefault()



      const cleanMessage =

        String(

          message || ''

        ).trim()



      if (

        !cleanMessage ||

        sending ||

        !thread?.id

      ) {

        return

      }



      if (

        thread.status ===

        'closed'

      ) {

        setError(

          'This Help Centre conversation is closed. Start a new request for another issue.'

        )

        return

      }



      setSending(true)

      setError('')



      try {

        await sendSupportMessage(

          cleanMessage

        )



        setMessage('')



        await loadChat({

          silent: true,

        })

      } catch (sendError) {

        console.error(

          'Customer Help Centre send error:',

          sendError

        )



        setError(

          sendError?.message ||

            'Unable to send message.'

        )

      } finally {

        setSending(false)

      }

    }



  const resetChat = () => {

    setThread(null)

    setMessage('')

    setError('')

    setRequestDetails('')

    setRequestType(

      'order_issue'

    )

  }



  const loadCodRefundStatus = async ({ silent = false } = {}) => {
    const identity = getIdentity()

    if (!identity) {
      if (!silent) {
        setCodRefundError(
          'Enter the Delivery Order Code and the same 10-digit mobile number used for the order.'
        )
      }
      return null
    }

    if (!silent) setCodRefundLoading(true)
    setCodRefundError('')
    setCodRefundMessage('')

    try {
      const response = await fetch('/api/delivery/cod-refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          action: 'status',
          restaurantCode,
          orderCode: identity.orderCode,
          customerMobile: identity.mobile,
        }),
      })

      const data = await response.json().catch(() => ({}))

      if (!response.ok || !data?.success) {
        throw new Error(data?.message || 'Unable to check COD refund status.')
      }

      setCodRefundStatus(data)
      saveIdentity(identity.orderCode, identity.mobile)
      return data
    } catch (statusError) {
      console.error('COD refund status error:', statusError)
      setCodRefundStatus(null)
      if (!silent) {
        setCodRefundError(
          statusError?.message || 'Unable to check COD refund status.'
        )
      }
      return null
    } finally {
      if (!silent) setCodRefundLoading(false)
    }
  }

  const updateCodRefundForm = (key, value) => {
    setCodRefundForm((current) => ({
      ...current,
      [key]: value,
    }))
    setCodRefundError('')
    setCodRefundMessage('')
  }

  const submitCodRefundBankDetails = async (event) => {
    event.preventDefault()

    if (codRefundSubmitting) return

    const identity = getIdentity()
    if (!identity) {
      setCodRefundError(
        'Enter the Delivery Order Code and the same mobile number used for the order.'
      )
      return
    }

    const accountHolderName = String(
      codRefundForm.accountHolderName || ''
    ).trim()
    const bankName = String(codRefundForm.bankName || '').trim()
    const ifscCode = String(codRefundForm.ifscCode || '')
      .trim()
      .toUpperCase()
    const accountNumber = digits(codRefundForm.accountNumber, 20)
    const confirmAccountNumber = digits(
      codRefundForm.confirmAccountNumber,
      20
    )

    if (accountHolderName.length < 2) {
      setCodRefundError('Enter the account holder name.')
      return
    }
    if (bankName.length < 2) {
      setCodRefundError('Enter the bank name.')
      return
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifscCode)) {
      setCodRefundError('Enter a valid IFSC code, for example SBIN0001234.')
      return
    }
    if (!/^[0-9]{6,20}$/.test(accountNumber)) {
      setCodRefundError(
        'Enter a valid bank account number containing 6 to 20 digits.'
      )
      return
    }
    if (accountNumber !== confirmAccountNumber) {
      setCodRefundError('Account numbers do not match.')
      return
    }
    if (!codRefundConfirmed) {
      setCodRefundError('Confirm that the bank details are correct.')
      return
    }

    setCodRefundSubmitting(true)
    setCodRefundError('')
    setCodRefundMessage('')

    try {
      const response = await fetch('/api/delivery/cod-refund', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          action: 'submit_bank_details',
          restaurantCode,
          orderCode: identity.orderCode,
          customerMobile: identity.mobile,
          accountHolderName,
          bankName,
          ifscCode,
          accountNumber,
          confirmAccountNumber,
        }),
      })

      const data = await response.json().catch(() => ({}))
      if (!response.ok || !data?.success) {
        throw new Error(data?.message || 'Unable to submit bank details.')
      }

      setCodRefundMessage(
        data?.message || 'Bank details submitted securely.'
      )
      setCodRefundForm((current) => ({
        ...current,
        accountNumber: '',
        confirmAccountNumber: '',
      }))
      setCodRefundConfirmed(false)
      await loadCodRefundStatus({ silent: false })
    } catch (submitError) {
      console.error('COD refund bank details error:', submitError)
      setCodRefundError(
        submitError?.message || 'Unable to submit bank details.'
      )
    } finally {
      setCodRefundSubmitting(false)
    }
  }

  const loadReviewOrder =

    async () => {

      if (reviewLoading) {

        return

      }



      const identity =

        getIdentity()



      if (!identity) {

        setReviewError(

          'Enter the delivered Order Code and the same 10-digit mobile number used for that order.'

        )

        return

      }



      setReviewLoading(true)

      setReviewError('')

      setReviewOrder(null)

      setReviewItems([])



      try {

        const {

          data,

          error: rpcError,

        } =

          await supabase.rpc(

            'get_public_delivery_review_order',

            {

              p_restaurant_code:

                restaurantCode,



              p_order_code:

                identity.orderCode,



              p_customer_mobile:

                identity.mobile,

            }

          )



        if (rpcError) {

          throw rpcError

        }



        if (!data?.success) {

          throw new Error(

            data?.message ||

              'Unable to load products for review.'

          )

        }



        const items =

          Array.isArray(

            data?.items

          )

            ? data.items

            : []



        const drafts = {}



        items.forEach((item) => {

          drafts[

            String(item.id)

          ] = {

            rating:

              Number(

                item?.existing_review

                  ?.rating || 0

              ),



            review:

              String(

                item?.existing_review

                  ?.review || ''

              ),

          }

        })



        setReviewOrder(

          data?.order || null

        )

        setReviewItems(items)

        setReviewDrafts(drafts)



        saveIdentity(

          identity.orderCode,

          identity.mobile

        )

      } catch (reviewLoadError) {

        console.error(

          'Delivery review order load error:',

          reviewLoadError

        )



        setReviewError(

          reviewLoadError?.message ||

            'Unable to load products for review.'

        )

      } finally {

        setReviewLoading(false)

      }

    }



  const updateReviewDraft =

    (

      itemId,

      patch

    ) => {

      setReviewDrafts(

        (current) => ({

          ...current,



          [itemId]: {

            rating:

              Number(

                current?.[

                  itemId

                ]?.rating || 0

              ),



            review:

              String(

                current?.[

                  itemId

                ]?.review || ''

              ),



            ...patch,

          },

        })

      )

    }



  const submitReview =

    async (

      item

    ) => {

      const itemId =

        String(

          item?.id || ''

        ).trim()



      if (

        !itemId ||

        reviewSubmittingId

      ) {

        return

      }



      const identity =

        getIdentity()



      if (!identity) {

        setReviewError(

          'Order verification is required.'

        )

        return

      }



      const draft =

        reviewDrafts?.[

          itemId

        ] || {}



      const rating =

        Number(

          draft.rating || 0

        )



      if (

        rating < 1 ||

        rating > 5

      ) {

        setReviewError(

          `Choose a star rating for ${item?.name || 'this product'}.`

        )

        return

      }



      setReviewSubmittingId(

        itemId

      )

      setReviewError('')



      try {

        const {

          data,

          error: rpcError,

        } =

          await supabase.rpc(

            'submit_public_delivery_product_review',

            {

              p_restaurant_code:

                restaurantCode,



              p_order_code:

                identity.orderCode,



              p_customer_mobile:

                identity.mobile,



              p_menu_item_id:

                itemId,



              p_rating:

                rating,



              p_review_text:

                String(

                  draft.review ||

                    ''

                )

                  .trim()

                  .slice(0, 500),

            }

          )



        if (rpcError) {

          throw rpcError

        }



        if (!data?.success) {

          throw new Error(

            data?.message ||

              'Unable to save review.'

          )

        }



        setReviewItems(

          (current) =>

            current.map(

              (row) =>

                String(

                  row.id

                ) === itemId

                  ? {

                      ...row,



                      existing_review: {

                        rating,



                        review:

                          String(

                            draft.review ||

                              ''

                          )

                            .trim()

                            .slice(

                              0,

                              500

                            ),



                        updated_at:

                          new Date().toISOString(),

                      },

                    }

                  : row

            )

        )



        if (

          typeof onReviewSubmitted ===

          'function'

        ) {

          await onReviewSubmitted()

        }

      } catch (submitError) {

        console.error(

          'Delivery product review submit error:',

          submitError

        )



        setReviewError(

          submitError?.message ||

            'Unable to save review.'

        )

      } finally {

        setReviewSubmittingId('')

      }

    }



  const caseRow =

    thread?.case || null



  const pickup =

    thread?.return_pickup ||

    null



  return (

    <>

      <button

        type="button"

        onClick={() =>

          setOpen(true)

        }

        className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-3 z-40 flex items-center gap-2 rounded-full bg-violet-600 px-4 py-3 text-xs font-black text-white shadow-2xl shadow-violet-900/30 transition active:scale-[0.98] sm:right-5"

      >

        <span aria-hidden="true">

          ?

        </span>



        Help Centre

      </button>



      {open && (

        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-0 backdrop-blur-[3px] sm:items-center sm:p-4">

          <div className="flex max-h-[94dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] border border-neutral-200 bg-white shadow-2xl sm:rounded-[28px]">

            <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-4 py-4">

              <div>

                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-violet-600">

                  Digital Dine-In

                </p>



                <h2 className="mt-1 text-lg font-black text-neutral-950">

                  Help Centre

                </h2>



                <p className="mt-1 text-[11px] leading-5 text-neutral-500">

                  Raise an order request, chat with the Manager, or review products from a delivered order.

                </p>

              </div>



              <button

                type="button"

                onClick={() =>

                  setOpen(false)

                }

                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-neutral-50 text-xs font-black text-neutral-600"

              >

                ✕

              </button>

            </div>



            <div className="grid grid-cols-3 border-b border-neutral-200 bg-neutral-50 p-1">

              <button

                type="button"

                onClick={() => {

                  setActiveTab(

                    'support'

                  )

                  setReviewError('')

                }}

                className={`rounded-xl px-3 py-2.5 text-[10px] font-black ${

                  activeTab ===

                  'support'

                    ? 'bg-white text-violet-700 shadow-sm'

                    : 'text-neutral-500'

                }`}

              >

                Raise Request

              </button>



              <button

                type="button"

                onClick={() => {

                  setActiveTab(

                    'refund'

                  )

                  setError('')

                  setReviewError('')

                  setCodRefundError('')

                  setCodRefundMessage('')

                }}

                className={`rounded-xl px-3 py-2.5 text-[10px] font-black ${

                  activeTab ===

                  'refund'

                    ? 'bg-white text-emerald-700 shadow-sm'

                    : 'text-neutral-500'

                }`}

              >

                COD Refund

              </button>



              <button

                type="button"

                onClick={() => {

                  setActiveTab(

                    'reviews'

                  )

                  setError('')

                }}

                className={`rounded-xl px-3 py-2.5 text-[10px] font-black ${

                  activeTab ===

                  'reviews'

                    ? 'bg-white text-amber-700 shadow-sm'

                    : 'text-neutral-500'

                }`}

              >

                Rate Products

              </button>

            </div>



            <div className="overflow-y-auto">

              <div className="border-b border-neutral-100 p-4">

                <div className="grid gap-3 sm:grid-cols-2">

                  <label className="block">

                    <span className="mb-1.5 block text-[9px] font-black uppercase tracking-wider text-neutral-500">

                      Delivery Order Code

                    </span>



                    <input

                      value={orderCode}

                      onChange={(

                        event

                      ) => {

                        setOrderCode(

                          event.target.value

                        )

                        setError('')

                        setReviewError('')

                        setCodRefundStatus(null)

                        setCodRefundError('')

                        setCodRefundMessage('')

                      }}

                      autoCapitalize="characters"

                      placeholder="DEL-20261003-0018"

                      className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3 font-mono text-xs font-bold outline-none focus:border-violet-500 focus:bg-white"

                    />

                  </label>



                  <label className="block">

                    <span className="mb-1.5 block text-[9px] font-black uppercase tracking-wider text-neutral-500">

                      Order Mobile Number

                    </span>



                    <input

                      type="tel"

                      inputMode="numeric"

                      value={mobile}

                      onChange={(

                        event

                      ) => {

                        setMobile(

                          digits(

                            event.target.value,

                            10

                          )

                        )

                        setError('')

                        setReviewError('')

                        setCodRefundStatus(null)

                        setCodRefundError('')

                        setCodRefundMessage('')

                      }}

                      placeholder="10-digit mobile"

                      className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3 text-xs font-bold outline-none focus:border-violet-500 focus:bg-white"

                    />

                  </label>

                </div>

              </div>



              {activeTab ===

              'support' ? (

                <div className="p-4">

                  {!thread ? (

                    <>

                      <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">

                        <p className="text-xs font-black text-violet-950">

                          Raise everything through Help Centre

                        </p>



                        <p className="mt-1 text-[10px] leading-5 text-violet-700">

                          Return, refund and replacement are no longer shown as direct customer actions. Submit the request here and the store Manager will review it.

                        </p>

                      </div>



                      {error && (

                        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-xs font-bold text-red-700">

                          {error}

                        </div>

                      )}



                      <div className="mt-4 space-y-3">

                        <label className="block">

                          <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-neutral-500">

                            Request Type

                          </span>



                          <select

                            value={

                              requestType

                            }

                            onChange={(

                              event

                            ) =>

                              setRequestType(

                                event.target.value

                              )

                            }

                            className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-bold outline-none focus:border-violet-500 focus:bg-white"

                          >

                            {REQUEST_TYPES.map(

                              ([

                                value,

                                label,

                              ]) => (

                                <option

                                  key={

                                    value

                                  }

                                  value={

                                    value

                                  }

                                >

                                  {

                                    label

                                  }

                                </option>

                              )

                            )}

                          </select>

                        </label>



                        <label className="block">

                          <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-neutral-500">

                            Describe Your Request

                          </span>



                          <textarea

                            value={

                              requestDetails

                            }

                            onChange={(

                              event

                            ) =>

                              setRequestDetails(

                                event.target.value.slice(

                                  0,

                                  1200

                                )

                              )

                            }

                            rows={4}

                            placeholder="Explain the issue clearly..."

                            className="w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none focus:border-violet-500 focus:bg-white"

                          />



                          <p className="mt-1 text-right text-[9px] text-neutral-400">

                            {

                              requestDetails.length

                            }

                            /1200

                          </p>

                        </label>



                        <button

                          type="button"

                          disabled={

                            raisingRequest ||

                            loading ||

                            !orderCode.trim() ||

                            mobile.length !==

                              10 ||

                            requestDetails.trim()

                              .length < 5

                          }

                          onClick={

                            raiseRequest

                          }

                          className="w-full rounded-xl bg-violet-600 px-4 py-4 text-sm font-black text-white disabled:opacity-50"

                        >

                          {raisingRequest ||

                          loading

                            ? 'Submitting Request...'

                            : 'Raise Request'}

                        </button>



                        <button

                          type="button"

                          disabled={

                            loading ||

                            !orderCode.trim() ||

                            mobile.length !==

                              10

                          }

                          onClick={() =>

                            loadChat({

                              createIfMissing:

                                true,

                            })

                          }

                          className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-xs font-black text-neutral-700 disabled:opacity-50"

                        >

                          Open Existing Help Conversation

                        </button>

                      </div>

                    </>

                  ) : (

                    <>

                      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-3">

                        <div className="flex flex-wrap items-center justify-between gap-2">

                          <div>

                            <p className="font-mono text-[10px] font-black text-neutral-950">

                              {

                                thread

                                  ?.order

                                  ?.order_code

                              }

                            </p>



                            <p className="mt-1 text-[9px] font-semibold text-neutral-500">

                              {money(

                                thread

                                  ?.order

                                  ?.total_amount

                              )}{' '}

                              ·{' '}

                              {String(

                                thread

                                  ?.order

                                  ?.order_status ||

                                  ''

                              ).replaceAll(

                                '_',

                                ' '

                              )}

                            </p>

                          </div>



                          <span

                            className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${

                              thread.status ===

                              'open'

                                ? 'bg-emerald-100 text-emerald-700'

                                : 'bg-neutral-200 text-neutral-600'

                            }`}

                          >

                            {thread.status ===

                            'open'

                              ? '● Open'

                              : 'Closed'}

                          </span>

                        </div>



                        {caseRow && (

                          <div className="mt-3 rounded-xl border border-violet-200 bg-violet-50 px-3 py-2.5">

                            <p className="text-[9px] font-black uppercase tracking-wider text-violet-700">

                              Manager Decision

                            </p>



                            <p className="mt-1 text-xs font-black capitalize text-violet-950">

                              {String(

                                caseRow.case_type ||

                                  ''

                              ).replaceAll(

                                '_',

                                ' '

                              )}{' '}

                              ·{' '}

                              {String(

                                caseRow.status ||

                                  ''

                              ).replaceAll(

                                '_',

                                ' '

                              )}

                            </p>

                          </div>

                        )}



                        {pickup && (

                          <div className="mt-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5">

                            <p className="text-[9px] font-black uppercase tracking-wider text-amber-700">

                              Return Pickup

                            </p>



                            <p className="mt-1 text-xs font-black text-amber-950">

                              {

                                pickup.pickup_code

                              }{' '}

                              ·{' '}

                              {String(

                                pickup.status ||

                                  ''

                              ).replaceAll(

                                '_',

                                ' '

                              )}

                            </p>

                          </div>

                        )}

                      </div>



                      {error && (

                        <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-xs font-bold text-red-700">

                          {error}

                        </div>

                      )}



                      <div className="mt-4 space-y-2">

                        {(

                          Array.isArray(

                            thread?.messages

                          )

                            ? thread.messages

                            : []

                        ).map(

                          (

                            row

                          ) => {

                            const customer =

                              row.sender ===

                              'customer'



                            return (

                              <div

                                key={

                                  row.id ||

                                  `${row.sender}-${row.created_at}`

                                }

                                className={`flex ${

                                  customer

                                    ? 'justify-end'

                                    : 'justify-start'

                                }`}

                              >

                                <div

                                  className={`max-w-[86%] rounded-2xl px-3 py-2.5 ${

                                    customer

                                      ? 'bg-violet-600 text-white'

                                      : row.sender ===

                                          'system'

                                        ? 'border border-amber-200 bg-amber-50 text-amber-900'

                                        : 'border border-neutral-200 bg-neutral-50 text-neutral-800'

                                  }`}

                                >

                                  <p className="whitespace-pre-wrap text-[11px] leading-5">

                                    {

                                      row.message

                                    }

                                  </p>



                                  <p

                                    className={`mt-1 text-[8px] font-semibold ${

                                      customer

                                        ? 'text-violet-200'

                                        : 'text-neutral-400'

                                    }`}

                                  >

                                    {row.sender_name ||

                                      (customer

                                        ? 'You'

                                        : 'Manager')}

                                    {' · '}

                                    {formatTime(

                                      row.created_at

                                    )}

                                  </p>

                                </div>

                              </div>

                            )

                          }

                        )}



                        <div

                          ref={

                            endRef

                          }

                        />

                      </div>



                      {thread.status ===

                      'open' ? (

                        <form

                          onSubmit={

                            sendMessage

                          }

                          className="mt-4"

                        >

                          <textarea

                            value={

                              message

                            }

                            onChange={(

                              event

                            ) =>

                              setMessage(

                                event.target.value.slice(

                                  0,

                                  1500

                                )

                              )

                            }

                            rows={3}

                            placeholder="Message the Manager..."

                            className="w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm outline-none focus:border-violet-500 focus:bg-white"

                          />



                          <button

                            type="submit"

                            disabled={

                              sending ||

                              !message.trim()

                            }

                            className="mt-2 w-full rounded-xl bg-violet-600 px-4 py-3 text-xs font-black text-white disabled:opacity-50"

                          >

                            {sending

                              ? 'Sending...'

                              : 'Send Message'}

                          </button>

                        </form>

                      ) : null}



                      <button

                        type="button"

                        onClick={

                          resetChat

                        }

                        className="mt-3 w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-xs font-black text-neutral-600"

                      >

                        Start Another Request

                      </button>

                    </>

                  )}

                </div>

              ) : activeTab ===
                'refund' ? (

                <div className="p-4">

                  <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-4">

                    <p className="text-xs font-black text-emerald-950">

                      COD Refund Bank Details

                    </p>

                    <p className="mt-1 text-[10px] leading-5 text-emerald-800">

                      This is only for an approved COD refund. For Return + Refund, the store must first receive and verify the returned item.

                    </p>

                  </div>

                  {codRefundError && (

                    <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-xs font-bold text-red-700">

                      {codRefundError}

                    </div>

                  )}

                  {codRefundMessage && (

                    <div className="mt-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-3 text-xs font-bold text-emerald-700">

                      {codRefundMessage}

                    </div>

                  )}

                  {!codRefundStatus ? (

                    <button

                      type="button"

                      onClick={() =>
                        loadCodRefundStatus({
                          silent: false,
                        })
                      }

                      disabled={
                        codRefundLoading ||
                        !orderCode.trim() ||
                        mobile.length !== 10
                      }

                      className="mt-4 w-full rounded-xl bg-emerald-600 px-4 py-4 text-sm font-black text-white disabled:opacity-50"

                    >

                      {codRefundLoading
                        ? 'Checking Refund...'
                        : 'Check COD Refund'}

                    </button>

                  ) : (

                    <div className="mt-4 space-y-4">

                      <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4">

                        <div className="grid grid-cols-2 gap-3">

                          <div>
                            <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Refund Case</p>
                            <p className="mt-1 font-mono text-[10px] font-black text-neutral-900">{codRefundStatus?.case?.caseCode || '—'}</p>
                          </div>

                          <div>
                            <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Status</p>
                            <p className="mt-1 text-[10px] font-black capitalize text-neutral-900">{String(codRefundStatus?.case?.refundStatus || '').replaceAll('_', ' ')}</p>
                          </div>

                          <div>
                            <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Approved Refund</p>
                            <p className="mt-1 text-sm font-black text-neutral-950">{money(codRefundStatus?.case?.refundAmount)}</p>
                          </div>

                          <div>
                            <p className="text-[9px] font-black uppercase tracking-wider text-neutral-400">Remaining</p>
                            <p className="mt-1 text-sm font-black text-emerald-700">{money(codRefundStatus?.case?.remainingAmount)}</p>
                          </div>

                        </div>

                      </div>

                      {codRefundStatus?.refundPayment ? (

                        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">

                          <p className="text-[10px] font-black uppercase tracking-wider text-emerald-700">✓ Refund Completed</p>
                          <p className="mt-2 text-lg font-black text-emerald-950">{money(codRefundStatus.refundPayment.amount)}</p>
                          <p className="mt-2 text-[10px] text-emerald-800">Bank Reference: <span className="font-mono font-black">{codRefundStatus.refundPayment.transactionReference}</span></p>
                          {codRefundStatus.refundPayment.paidAt && (
                            <p className="mt-1 text-[9px] text-emerald-700">Paid {formatTime(codRefundStatus.refundPayment.paidAt)}</p>
                          )}

                        </div>

                      ) : codRefundStatus?.bankDetailsSubmitted ? (

                        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4">

                          <p className="text-[10px] font-black uppercase tracking-wider text-sky-700">✓ Bank Details Submitted</p>
                          <div className="mt-3 space-y-1 text-[10px] text-sky-950">
                            <p><span className="font-black">Account Holder:</span> {codRefundStatus?.bank?.accountHolderName || '—'}</p>
                            <p><span className="font-black">Bank:</span> {codRefundStatus?.bank?.bankName || '—'}</p>
                            <p><span className="font-black">IFSC:</span> <span className="font-mono">{codRefundStatus?.bank?.ifscCode || '—'}</span></p>
                            <p><span className="font-black">Account:</span> <span className="font-mono">{codRefundStatus?.bank?.maskedAccountNumber || '—'}</span></p>
                          </div>
                          <p className="mt-3 text-[10px] leading-5 text-sky-800">The full account number is stored encrypted. The Manager can now process the approved refund.</p>

                        </div>

                      ) : codRefundStatus?.eligibleForBankDetails ? (

                        <form
                          onSubmit={submitCodRefundBankDetails}
                          className="space-y-3 rounded-2xl border border-neutral-200 bg-white p-4"
                        >

                          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-[10px] leading-5 text-amber-800">
                            Enter the bank account that should receive the refund. Check every detail carefully.
                          </div>

                          <label className="block">
                            <span className="mb-1.5 block text-[9px] font-black uppercase tracking-wider text-neutral-500">Account Holder Name</span>
                            <input
                              value={codRefundForm.accountHolderName}
                              onChange={(event) => updateCodRefundForm('accountHolderName', event.target.value.slice(0, 120))}
                              autoComplete="name"
                              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3 text-sm font-bold outline-none focus:border-emerald-500 focus:bg-white"
                            />
                          </label>

                          <label className="block">
                            <span className="mb-1.5 block text-[9px] font-black uppercase tracking-wider text-neutral-500">Bank Name</span>
                            <input
                              value={codRefundForm.bankName}
                              onChange={(event) => updateCodRefundForm('bankName', event.target.value.slice(0, 120))}
                              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3 text-sm font-bold outline-none focus:border-emerald-500 focus:bg-white"
                            />
                          </label>

                          <label className="block">
                            <span className="mb-1.5 block text-[9px] font-black uppercase tracking-wider text-neutral-500">IFSC Code</span>
                            <input
                              value={codRefundForm.ifscCode}
                              onChange={(event) => updateCodRefundForm(
                                'ifscCode',
                                String(event.target.value || '')
                                  .toUpperCase()
                                  .replace(/[^A-Z0-9]/g, '')
                                  .slice(0, 11)
                              )}
                              autoCapitalize="characters"
                              placeholder="SBIN0001234"
                              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3 font-mono text-sm font-black uppercase outline-none focus:border-emerald-500 focus:bg-white"
                            />
                          </label>

                          <label className="block">
                            <span className="mb-1.5 block text-[9px] font-black uppercase tracking-wider text-neutral-500">Account Number</span>
                            <input
                              type="password"
                              inputMode="numeric"
                              autoComplete="off"
                              value={codRefundForm.accountNumber}
                              onChange={(event) => updateCodRefundForm('accountNumber', digits(event.target.value, 20))}
                              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3 font-mono text-sm font-black outline-none focus:border-emerald-500 focus:bg-white"
                            />
                          </label>

                          <label className="block">
                            <span className="mb-1.5 block text-[9px] font-black uppercase tracking-wider text-neutral-500">Re-enter Account Number</span>
                            <input
                              type="password"
                              inputMode="numeric"
                              autoComplete="off"
                              value={codRefundForm.confirmAccountNumber}
                              onChange={(event) => updateCodRefundForm('confirmAccountNumber', digits(event.target.value, 20))}
                              className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3 font-mono text-sm font-black outline-none focus:border-emerald-500 focus:bg-white"
                            />
                          </label>

                          {codRefundForm.confirmAccountNumber && (
                            <div className={`rounded-xl border px-3 py-2.5 text-[10px] font-black ${
                              codRefundForm.accountNumber === codRefundForm.confirmAccountNumber
                                ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                : 'border-red-200 bg-red-50 text-red-700'
                            }`}>
                              {codRefundForm.accountNumber === codRefundForm.confirmAccountNumber
                                ? '✓ Account numbers match'
                                : '✕ Account numbers do not match'}
                            </div>
                          )}

                          <label className="flex items-start gap-2 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
                            <input
                              type="checkbox"
                              checked={codRefundConfirmed}
                              onChange={(event) => setCodRefundConfirmed(event.target.checked)}
                              className="mt-0.5 h-4 w-4"
                            />
                            <span className="text-[10px] leading-5 text-neutral-600">
                              I confirm that these bank details are correct and should receive my COD refund.
                            </span>
                          </label>

                          <button
                            type="submit"
                            disabled={
                              codRefundSubmitting ||
                              !codRefundConfirmed ||
                              codRefundForm.accountNumber.length < 6 ||
                              codRefundForm.accountNumber !== codRefundForm.confirmAccountNumber
                            }
                            className="w-full rounded-xl bg-emerald-600 px-4 py-4 text-sm font-black text-white disabled:opacity-50"
                          >
                            {codRefundSubmitting ? 'Submitting Securely...' : 'Submit Refund Bank Details'}
                          </button>

                          <p className="text-[9px] leading-4 text-neutral-400">
                            The full account number is not stored in this browser and is not shown publicly after submission.
                          </p>

                        </form>

                      ) : (

                        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
                          <p className="text-[10px] font-black uppercase tracking-wider text-amber-700">Bank Details Not Required Yet</p>
                          <p className="mt-1 text-[10px] leading-5 text-amber-800">{codRefundStatus?.bankDetailsReason || 'The Manager has not made this COD refund ready for bank details yet.'}</p>
                        </div>

                      )}

                      <button
                        type="button"
                        onClick={() => loadCodRefundStatus({ silent: false })}
                        disabled={codRefundLoading}
                        className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-xs font-black text-neutral-600 disabled:opacity-50"
                      >
                        {codRefundLoading ? 'Refreshing...' : '↻ Refresh Refund Status'}
                      </button>

                    </div>

                  )}

                </div>

              ) : (

                <div className="p-4">

                  <div className="rounded-2xl border border-amber-100 bg-amber-50 p-4">

                    <p className="text-xs font-black text-amber-950">

                      Verified product reviews

                    </p>



                    <p className="mt-1 text-[10px] leading-5 text-amber-800">

                      Reviews are available only for products from a delivered order verified with the Order Code and mobile number.

                    </p>

                  </div>



                  {reviewError && (

                    <div className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-3 text-xs font-bold text-red-700">

                      {reviewError}

                    </div>

                  )}



                  {!reviewOrder ? (

                    <button

                      type="button"

                      onClick={

                        loadReviewOrder

                      }

                      disabled={

                        reviewLoading ||

                        !orderCode.trim() ||

                        mobile.length !==

                          10

                      }

                      className="mt-4 w-full rounded-xl bg-amber-500 px-4 py-4 text-sm font-black text-neutral-950 disabled:opacity-50"

                    >

                      {reviewLoading

                        ? 'Checking Delivered Order...'

                        : 'Load Products to Review'}

                    </button>

                  ) : (

                    <>

                      <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3">

                        <p className="font-mono text-[10px] font-black text-neutral-900">

                          {

                            reviewOrder.order_code

                          }

                        </p>



                        <p className="mt-1 text-[9px] font-bold text-emerald-700">

                          ✓ Delivered order verified

                        </p>

                      </div>



                      <div className="mt-4 space-y-3">

                        {reviewItems.map(

                          (item) => {

                            const itemId =

                              String(

                                item.id

                              )



                            const draft =

                              reviewDrafts?.[

                                itemId

                              ] || {

                                rating:

                                  0,

                                review:

                                  '',

                              }



                            return (

                              <article

                                key={

                                  itemId

                                }

                                className="rounded-2xl border border-neutral-200 bg-white p-4"

                              >

                                <div className="flex items-center gap-3">

                                  {item.image_url ? (

                                    <img

                                      src={

                                        item.image_url

                                      }

                                      alt={

                                        item.name

                                      }

                                      className="h-12 w-12 rounded-xl border border-neutral-200 object-cover"

                                    />

                                  ) : (

                                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-neutral-100 text-lg">

                                      🍽️

                                    </div>

                                  )}



                                  <div className="min-w-0">

                                    <p className="truncate text-sm font-black text-neutral-950">

                                      {

                                        item.name

                                      }

                                    </p>



                                    <p className="mt-1 text-[9px] font-semibold text-neutral-400">

                                      Qty{' '}

                                      {

                                        item.quantity

                                      }

                                    </p>

                                  </div>

                                </div>



                                <div className="mt-3">

                                  <Stars

                                    value={

                                      draft.rating

                                    }

                                    onChange={(

                                      rating

                                    ) =>

                                      updateReviewDraft(

                                        itemId,

                                        {

                                          rating,

                                        }

                                      )

                                    }

                                    disabled={

                                      reviewSubmittingId ===

                                      itemId

                                    }

                                  />

                                </div>



                                <textarea

                                  value={

                                    draft.review

                                  }

                                  onChange={(

                                    event

                                  ) =>

                                    updateReviewDraft(

                                      itemId,

                                      {

                                        review:

                                          event.target.value.slice(

                                            0,

                                            500

                                          ),

                                      }

                                    )

                                  }

                                  rows={3}

                                  placeholder="Write an optional review..."

                                  className="mt-3 w-full resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3 text-xs outline-none focus:border-amber-500 focus:bg-white"

                                />



                                <button

                                  type="button"

                                  disabled={

                                    reviewSubmittingId ===

                                      itemId ||

                                    Number(

                                      draft.rating ||

                                        0

                                    ) <

                                      1

                                  }

                                  onClick={() =>

                                    submitReview(

                                      item

                                    )

                                  }

                                  className="mt-2 w-full rounded-xl bg-neutral-950 px-4 py-3 text-xs font-black text-white disabled:opacity-40"

                                >

                                  {reviewSubmittingId ===

                                  itemId

                                    ? 'Saving...'

                                    : item

                                          ?.existing_review

                                          ? 'Update Review'

                                          : 'Submit Review'}

                                </button>

                              </article>

                            )

                          }

                        )}

                      </div>



                      <button

                        type="button"

                        onClick={() => {

                          setReviewOrder(

                            null

                          )

                          setReviewItems(

                            []

                          )

                          setReviewDrafts(

                            {}

                          )

                          setReviewError(

                            ''

                          )

                        }}

                        className="mt-3 w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-xs font-black text-neutral-600"

                      >

                        Review Another Order

                      </button>

                    </>

                  )}

                </div>

              )}

            </div>

          </div>

        </div>

      )}

    </>

  )

}
