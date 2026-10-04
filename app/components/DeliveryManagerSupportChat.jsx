'use client'



import {

  useCallback,

  useEffect,

  useMemo,

  useRef,

  useState,

} from 'react'



import { supabase } from '@/lib/supabase'

import {

  appConfirm,

  appNotice,

} from '@/lib/appDialog'



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



function cleanQty(value, max) {

  const next = Math.floor(

    Number(value || 0)

  )



  return Math.max(

    0,

    Math.min(

      Number(max || 0),

      Number.isFinite(next)

        ? next

        : 0

    )

  )

}



export default function DeliveryManagerSupportChat({

  restaurantId,

  restaurantCode,

  sessionToken,

  sessionMode,

  userId,

  password,

  drivers = [],

  onOpenAfterSales,

}) {

  const [threads, setThreads] =

    useState([])



  const [selectedId, setSelectedId] =

    useState('')



  const [loading, setLoading] =

    useState(true)



  const [error, setError] =

    useState('')



  const [reply, setReply] =

    useState('')



  const [sending, setSending] =

    useState(false)



  const [decisionType, setDecisionType] =

    useState('return')



  const [decisionReason, setDecisionReason] =

    useState('')



  const [decisionItems, setDecisionItems] =

    useState({})



  const [driverId, setDriverId] =

    useState('')



  const [deciding, setDeciding] =

    useState(false)



  const [closing, setClosing] =

    useState(false)



  const endRef = useRef(null)



  const activeDrivers =

    useMemo(

      () =>

        (

          Array.isArray(drivers)

            ? drivers

            : []

        ).filter(

          (row) =>

            row?.is_active !== false

        ),

      [drivers]

    )



  const selected =

    useMemo(

      () =>

        threads.find(

          (row) =>

            String(row.id) ===

            String(selectedId)

        ) || null,

      [threads, selectedId]

    )



  const managerRpc =

    useCallback(

      async (

        sessionFunction,

        manualFunction,

        sessionArgs,

        manualArgs

      ) => {

        const response =

          sessionMode &&

          sessionToken

            ? await supabase.rpc(

                sessionFunction,

                {

                  p_session_token:

                    sessionToken,

                  ...sessionArgs,

                }

              )

            : await supabase.rpc(

                manualFunction,

                {

                  p_restaurant_id:

                    String(

                      restaurantId

                    ),



                  p_restaurant_code:

                    String(

                      restaurantCode ||

                        ''

                    ),



                  p_user_id:

                    String(

                      userId || ''

                    ),



                  p_password:

                    String(

                      password || ''

                    ),



                  ...manualArgs,

                }

              )



        if (response.error) {

          throw response.error

        }



        if (

          response.data

            ?.success === false

        ) {

          throw new Error(

            response.data

              ?.message ||

              'Manager support action failed.'

          )

        }



        return response.data

      },

      [

        sessionMode,

        sessionToken,

        restaurantId,

        restaurantCode,

        userId,

        password,

      ]

    )



  const loadSupport =

    useCallback(

      async (

        silent = false

      ) => {

        if (!silent) {

          setLoading(true)

        }



        setError('')



        try {

          const data =

            await managerRpc(

              'manager_delivery_get_support_session',

              'manager_delivery_get_support',

              {

                p_thread_id:

                  null,

              },

              {

                p_thread_id:

                  null,

              }

            )



          const next =

            Array.isArray(

              data?.threads

            )

              ? data.threads

              : []



          setThreads(next)



          setSelectedId(

            (current) => {

              if (

                current &&

                next.some(

                  (row) =>

                    String(

                      row.id

                    ) ===

                    String(

                      current

                    )

                )

              ) {

                return current

              }



              return String(

                next?.[0]?.id ||

                  ''

              )

            }

          )

        } catch (loadError) {

          console.error(

            'Manager live support load error:',

            loadError

          )



          if (!silent) {

            setError(

              loadError?.message ||

                'Unable to load customer support chats.'

            )

          }

        } finally {

          if (!silent) {

            setLoading(false)

          }

        }

      },

      [managerRpc]

    )



  useEffect(() => {

    loadSupport(false)



    const timer =

      window.setInterval(

        () => {

          if (

            document.visibilityState ===

            'visible'

          ) {

            loadSupport(true)

          }

        },

        2000

      )



    return () =>

      window.clearInterval(

        timer

      )

  }, [loadSupport])



  useEffect(() => {

    endRef.current?.scrollIntoView?.(

      {

        behavior: 'smooth',

      }

    )

  }, [

    selected?.messages?.length,

    selectedId,

  ])



  useEffect(() => {

    if (!selected) {

      return

    }



    const initial = {}



    ;(

      Array.isArray(

        selected?.order?.items

      )

        ? selected.order.items

        : []

    ).forEach((item) => {

      const id =

        String(

          item?.id ||

            item?.menu_item_id ||

            ''

        )



      if (id) {

        initial[id] = 0

      }

    })



    setDecisionItems(

      initial

    )



    setDecisionReason('')

    setDecisionType('return')



    const preferred =

      activeDrivers.find(

        (row) =>

          String(

            row.status ||

              ''

          ).toLowerCase() ===

          'available'

      ) ||

      activeDrivers[0]



    setDriverId(

      String(

        preferred?.id || ''

      )

    )

  }, [

    selected?.id,

    activeDrivers,

  ])



  const sendReply =

    async (event) => {

      event.preventDefault()



      const clean =

        String(

          reply || ''

        ).trim()



      if (

        !selected?.id ||

        !clean ||

        sending

      ) {

        return

      }



      setSending(true)

      setError('')



      try {

        await managerRpc(

          'manager_delivery_support_send_session',

          'manager_delivery_support_send',

          {

            p_thread_id:

              selected.id,

            p_message:

              clean,

          },

          {

            p_thread_id:

              selected.id,

            p_message:

              clean,

          }

        )



        setReply('')



        await loadSupport(true)

      } catch (sendError) {

        setError(

          sendError?.message ||

            'Unable to send reply.'

        )

      } finally {

        setSending(false)

      }

    }



  const changeQty = (

    item,

    amount

  ) => {

    const id =

      String(

        item?.id ||

          item?.menu_item_id ||

          ''

      )



    if (!id) return



    const ordered =

      Math.max(

        1,

        Math.floor(

          Number(

            item?.quantity ||

              item?.qty ||

              1

          )

        )

      )



    setDecisionItems(

      (current) => ({

        ...current,

        [id]:

          cleanQty(

            Number(

              current?.[id] ||

                0

            ) +

              amount,

            ordered

          ),

      })

    )

  }



  const acceptDecision =

    async () => {

      if (

        !selected?.id ||

        deciding

      ) {

        return

      }



      const reason =

        String(

          decisionReason || ''

        ).trim()



      if (reason.length < 3) {

        appNotice(

          'Enter a short reason / resolution note.'

        )

        return

      }



      const items =

        (

          Array.isArray(

            selected?.order?.items

          )

            ? selected.order.items

            : []

        )

          .map((item) => {

            const id =

              String(

                item?.id ||

                  item?.menu_item_id ||

                  ''

              )



            return {

              id,

              quantity:

                cleanQty(

                  decisionItems?.[

                    id

                  ],

                  Number(

                    item?.quantity ||

                      item?.qty ||

                      1

                  )

                ),

            }

          })

          .filter(

            (item) =>

              item.id &&

              item.quantity > 0

          )



      if (!items.length) {

        appNotice(

          'Select at least one affected item and quantity.'

        )

        return

      }



      if (

        decisionType ===

          'return' &&

        !driverId

      ) {

        appNotice(

          'Select a Delivery Driver for the return pickup.'

        )

        return

      }



      const confirmed =

        await appConfirm(

          decisionType ===

          'return'

            ? 'Approve this return and send the Return Pickup task to the selected Delivery Driver?'

            : 'Approve this replacement and reserve the required stock?'

        )



      if (!confirmed) {

        return

      }



      setDeciding(true)

      setError('')



      try {

        const result =

          await managerRpc(

            'manager_delivery_support_accept_case_session',

            'manager_delivery_support_accept_case',

            {

              p_thread_id:

                selected.id,



              p_case_type:

                decisionType,



              p_items:

                items,



              p_reason:

                reason,



              p_driver_id:

                decisionType ===

                'return'

                  ? driverId

                  : null,

            },

            {

              p_thread_id:

                selected.id,



              p_case_type:

                decisionType,



              p_items:

                items,



              p_reason:

                reason,



              p_driver_id:

                decisionType ===

                'return'

                  ? driverId

                  : null,

            }

          )



        appNotice(

          decisionType ===

          'return'

            ? `Return approved. Pickup ${result?.pickup?.pickup_code || ''} was sent to the Delivery Driver.`

            : 'Replacement approved and stock reserved.'

        )



        await loadSupport(true)

      } catch (decisionError) {

        setError(

          decisionError?.message ||

            'Unable to approve the customer resolution.'

        )



        appNotice(

          decisionError?.message ||

            'Unable to approve the customer resolution.'

        )

      } finally {

        setDeciding(false)

      }

    }



  const closeThread =

    async () => {

      if (

        !selected?.id ||

        closing

      ) {

        return

      }



      const confirmed =

        await appConfirm(

          'Close this customer support chat?'

        )



      if (!confirmed) return



      setClosing(true)



      try {

        await managerRpc(

          'manager_delivery_support_close_session',

          'manager_delivery_support_close',

          {

            p_thread_id:

              selected.id,

          },

          {

            p_thread_id:

              selected.id,

          }

        )



        await loadSupport(true)

      } catch (closeError) {

        appNotice(

          closeError?.message ||

            'Unable to close support chat.'

        )

      } finally {

        setClosing(false)

      }

    }



  const openCount =

    threads.filter(

      (row) =>

        row.status === 'open'

    ).length



  return (

    <div className="grid min-h-[620px] gap-4 xl:grid-cols-[330px_minmax(0,1fr)]">

      <section className="overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900">

        <div className="border-b border-neutral-800 p-4">

          <div className="flex items-start justify-between gap-3">

            <div>

              <p className="text-[10px] font-black uppercase tracking-wider text-violet-400">

                Customer Live Support

              </p>



              <h3 className="mt-1 text-lg font-black text-white">

                Support Inbox

              </h3>

            </div>



            <span className="rounded-full bg-violet-500/10 px-2.5 py-1 text-[9px] font-black text-violet-300">

              {openCount} open

            </span>

          </div>



          <button

            type="button"

            onClick={() =>

              loadSupport(false)

            }

            className="mt-3 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-[10px] font-black text-neutral-300"

          >

            ↻ Refresh Chats

          </button>

        </div>



        <div className="max-h-[680px] overflow-y-auto p-2">

          {loading && (

            <p className="px-3 py-8 text-center text-xs text-neutral-500">

              Loading customer chats...

            </p>

          )}



          {!loading &&

            threads.map(

              (row) => {

                const active =

                  String(

                    row.id

                  ) ===

                  String(

                    selectedId

                  )



                const last =

                  Array.isArray(

                    row.messages

                  )

                    ? row.messages[

                        row.messages

                          .length - 1

                      ]

                    : null



                return (

                  <button

                    key={row.id}

                    type="button"

                    onClick={() =>

                      setSelectedId(

                        String(

                          row.id

                        )

                      )

                    }

                    className={`mb-2 w-full rounded-2xl border p-3 text-left transition ${

                      active

                        ? 'border-violet-500/40 bg-violet-500/10'

                        : 'border-neutral-800 bg-neutral-950 hover:border-neutral-700'

                    }`}

                  >

                    <div className="flex items-start justify-between gap-2">

                      <div className="min-w-0">

                        <p className="truncate text-xs font-black text-white">

                          {row.customer_name ||

                            'Customer'}

                        </p>



                        <p className="mt-1 font-mono text-[9px] font-bold text-neutral-500">

                          {

                            row.order

                              ?.order_code

                          }

                        </p>

                      </div>



                      <span

                        className={`rounded-full px-2 py-1 text-[8px] font-black uppercase ${

                          row.status ===

                          'open'

                            ? 'bg-emerald-500/10 text-emerald-300'

                            : 'bg-neutral-800 text-neutral-500'

                        }`}

                      >

                        {

                          row.status

                        }

                      </span>

                    </div>



                    <p className="mt-2 line-clamp-2 text-[10px] leading-4 text-neutral-400">

                      {last?.message ||

                        'No messages yet'}

                    </p>



                    <p className="mt-2 text-[8px] font-semibold text-neutral-600">

                      {formatTime(

                        row.latest_message_at

                      )}

                    </p>

                  </button>

                )

              }

            )}



          {!loading &&

            !threads.length && (

              <p className="px-4 py-12 text-center text-xs text-neutral-500">

                No customer support chats yet.

              </p>

            )}

        </div>

      </section>



      <section className="overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900">

        {!selected ? (

          <div className="flex min-h-[620px] items-center justify-center p-6 text-center text-sm text-neutral-500">

            Select a customer chat.

          </div>

        ) : (

          <div className="flex min-h-[620px] flex-col">

            <div className="border-b border-neutral-800 p-4">

              <div className="flex flex-wrap items-start justify-between gap-3">

                <div>

                  <p className="text-sm font-black text-white">

                    {selected.customer_name ||

                      'Customer'}

                  </p>



                  <p className="mt-1 text-[10px] font-semibold text-neutral-500">

                    📞{' '}

                    {selected.customer_mobile ||

                      selected.order

                        ?.customer_mobile ||

                      'N/A'}

                  </p>



                  <p className="mt-1 font-mono text-[10px] font-black text-violet-300">

                    {

                      selected.order

                        ?.order_code

                    }

                  </p>

                </div>



                <div className="text-right">

                  <p className="text-sm font-black text-emerald-300">

                    {money(

                      selected.order

                        ?.total_amount

                    )}

                  </p>



                  <p className="mt-1 text-[9px] font-black uppercase text-neutral-500">

                    {String(

                      selected.order

                        ?.order_status ||

                        ''

                    ).replaceAll(

                      '_',

                      ' '

                    )}

                  </p>

                </div>

              </div>



              <div className="mt-3 rounded-2xl border border-neutral-800 bg-neutral-950 p-3 text-[10px] leading-5 text-neutral-400">

                <p>

                  <b className="text-neutral-200">

                    Address:

                  </b>{' '}

                  {[

                    selected.order

                      ?.address_line1,

                    selected.order

                      ?.address_line2,

                    selected.order

                      ?.landmark,

                    selected.order?.city,

                    selected.order?.state,

                    selected.order

                      ?.pincode,

                  ]

                    .filter(Boolean)

                    .join(', ') ||

                    'Not available'}

                </p>

              </div>

            </div>



            <div className="grid min-h-0 flex-1 gap-0 lg:grid-cols-[minmax(0,1fr)_360px]">

              <div className="flex min-h-[500px] flex-col border-r-0 border-neutral-800 lg:border-r">

                <div className="min-h-0 flex-1 overflow-y-auto bg-neutral-950 p-4">

                  <div className="space-y-2">

                    {(Array.isArray(

                      selected.messages

                    )

                      ? selected.messages

                      : []

                    ).map(

                      (row) => {

                        const manager =

                          row.sender ===

                          'manager'



                        const system =

                          row.sender ===

                          'system'



                        return (

                          <div

                            key={

                              row.id

                            }

                            className={`flex ${

                              system

                                ? 'justify-center'

                                : manager

                                  ? 'justify-end'

                                  : 'justify-start'

                            }`}

                          >

                            {system ? (

                              <div className="max-w-[92%] rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-center text-[10px] font-bold leading-4 text-neutral-500">

                                {

                                  row.message

                                }

                              </div>

                            ) : (

                              <div

                                className={`max-w-[84%] rounded-2xl px-3.5 py-2.5 ${

                                  manager

                                    ? 'rounded-br-md bg-violet-600 text-white'

                                    : 'rounded-bl-md border border-neutral-800 bg-neutral-900 text-neutral-100'

                                }`}

                              >

                                <p className="text-[9px] font-black opacity-70">

                                  {manager

                                    ? 'Manager'

                                    : row.sender_name ||

                                      'Customer'}

                                </p>



                                <p className="mt-1 whitespace-pre-wrap text-xs leading-5">

                                  {

                                    row.message

                                  }

                                </p>



                                <p className="mt-1 text-[8px] opacity-60">

                                  {formatTime(

                                    row.created_at

                                  )}

                                </p>

                              </div>

                            )}

                          </div>

                        )

                      }

                    )}



                    <div

                      ref={endRef}

                    />

                  </div>

                </div>



                {error && (

                  <div className="border-t border-red-500/20 bg-red-500/10 px-4 py-2 text-[10px] font-bold text-red-300">

                    {error}

                  </div>

                )}



                {selected.status ===

                'open' ? (

                  <form

                    onSubmit={

                      sendReply

                    }

                    className="flex gap-2 border-t border-neutral-800 bg-neutral-900 p-3"

                  >

                    <textarea

                      rows={1}

                      maxLength={1500}

                      value={reply}

                      onChange={(

                        event

                      ) =>

                        setReply(

                          event.target.value

                        )

                      }

                      placeholder="Reply to customer..."

                      className="min-h-[44px] flex-1 resize-none rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-xs text-white outline-none focus:border-violet-500"

                    />



                    <button

                      type="submit"

                      disabled={

                        sending ||

                        !reply.trim()

                      }

                      className="rounded-xl bg-violet-600 px-4 text-xs font-black text-white disabled:opacity-50"

                    >

                      {sending

                        ? '...'

                        : 'Send'}

                    </button>

                  </form>

                ) : (

                  <div className="border-t border-neutral-800 p-3 text-center text-[10px] font-bold text-neutral-500">

                    Chat closed

                  </div>

                )}

              </div>



              <div className="overflow-y-auto p-4">

                {selected.case ? (

                  <div className="space-y-3">

                    <div className="rounded-2xl border border-violet-500/20 bg-violet-500/10 p-4">

                      <p className="text-[9px] font-black uppercase tracking-wider text-violet-300">

                        Manager Decision

                      </p>



                      <p className="mt-1 text-sm font-black capitalize text-white">

                        {String(

                          selected.case

                            .case_type ||

                            ''

                        ).replaceAll(

                          '_',

                          ' '

                        )}

                      </p>



                      <p className="mt-1 text-[10px] font-semibold capitalize text-violet-200">

                        {String(

                          selected.case

                            .status ||

                            ''

                        ).replaceAll(

                          '_',

                          ' '

                        )}

                      </p>

                    </div>



                    {selected.return_pickup && (

                      <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">

                        <p className="text-[9px] font-black uppercase tracking-wider text-amber-300">

                          Return Pickup

                        </p>



                        <p className="mt-1 font-mono text-xs font-black text-white">

                          {

                            selected

                              .return_pickup

                              .pickup_code

                          }

                        </p>



                        <p className="mt-2 text-xs font-black capitalize text-amber-200">

                          {String(

                            selected

                              .return_pickup

                              .status ||

                              ''

                          ).replaceAll(

                            '_',

                            ' '

                          )}

                        </p>



                        <p className="mt-1 text-[10px] text-neutral-400">

                          Driver:{' '}

                          {

                            selected

                              .return_pickup

                              .driver_name

                          }

                          {selected

                            .return_pickup

                            .driver_mobile

                            ? ` · ${selected.return_pickup.driver_mobile}`

                            : ''}

                        </p>

                      </div>

                    )}



                    {selected

                      .return_pickup

                      ?.status ===

                      'returned_to_store' && (

                      <button

                        type="button"

                        onClick={

                          onOpenAfterSales

                        }

                        className="w-full rounded-xl bg-emerald-500 px-4 py-3 text-xs font-black text-neutral-950"

                      >

                        Verify Return & Restock

                      </button>

                    )}



                    {selected.case

                      .case_type ===

                      'replacement' && (

                      <button

                        type="button"

                        onClick={

                          onOpenAfterSales

                        }

                        className="w-full rounded-xl bg-sky-500 px-4 py-3 text-xs font-black text-neutral-950"

                      >

                        Continue Replacement

                      </button>

                    )}

                  </div>

                ) : (

                  <div>

                    <p className="text-[10px] font-black uppercase tracking-wider text-violet-400">

                      Manager Resolution

                    </p>



                    <p className="mt-1 text-xs leading-5 text-neutral-400">

                      After discussing the issue, choose Return or Replacement. The customer cannot approve this themselves.

                    </p>



                    {String(

                      selected.order

                        ?.order_status ||

                        ''

                    ).toLowerCase() !==

                    'delivered' ? (

                      <div className="mt-4 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-[10px] font-bold leading-5 text-amber-200">

                        Return / Replacement can be accepted only after this order is marked Delivered. You can still continue chatting with the customer.

                      </div>

                    ) : (

                      <>

                        <div className="mt-4 grid grid-cols-2 gap-2">

                          <button

                            type="button"

                            onClick={() =>

                              setDecisionType(

                                'return'

                              )

                            }

                            className={`rounded-xl border px-3 py-3 text-[10px] font-black ${

                              decisionType ===

                              'return'

                                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'

                                : 'border-neutral-800 bg-neutral-950 text-neutral-400'

                            }`}

                          >

                            ↩ Accept Return

                          </button>



                          <button

                            type="button"

                            onClick={() =>

                              setDecisionType(

                                'replacement'

                              )

                            }

                            className={`rounded-xl border px-3 py-3 text-[10px] font-black ${

                              decisionType ===

                              'replacement'

                                ? 'border-sky-500/40 bg-sky-500/10 text-sky-300'

                                : 'border-neutral-800 bg-neutral-950 text-neutral-400'

                            }`}

                          >

                            🔁 Replacement

                          </button>

                        </div>



                        <div className="mt-4">

                          <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500">

                            Affected Items

                          </p>



                          <div className="mt-2 space-y-2">

                            {(Array.isArray(

                              selected.order

                                ?.items

                            )

                              ? selected.order

                                  .items

                              : []

                            ).map(

                              (

                                item,

                                index

                              ) => {

                                const id =

                                  String(

                                    item?.id ||

                                      item?.menu_item_id ||

                                      ''

                                  )



                                const ordered =

                                  Math.max(

                                    1,

                                    Math.floor(

                                      Number(

                                        item?.quantity ||

                                          item?.qty ||

                                          1

                                      )

                                    )

                                  )



                                const qty =

                                  Number(

                                    decisionItems?.[

                                      id

                                    ] || 0

                                  )



                                return (

                                  <div

                                    key={

                                      id ||

                                      index

                                    }

                                    className="rounded-xl border border-neutral-800 bg-neutral-950 p-3"

                                  >

                                    <p className="text-xs font-black text-white">

                                      {item?.name ||

                                        'Order item'}

                                    </p>



                                    <p className="mt-1 text-[9px] text-neutral-500">

                                      Ordered ×

                                      {

                                        ordered

                                      }

                                    </p>



                                    <div className="mt-2 flex items-center gap-2">

                                      <button

                                        type="button"

                                        onClick={() =>

                                          changeQty(

                                            item,

                                            -1

                                          )

                                        }

                                        disabled={

                                          qty <=

                                          0

                                        }

                                        className="h-8 w-8 rounded-lg border border-neutral-700 text-xs font-black text-white disabled:opacity-30"

                                      >

                                        −

                                      </button>



                                      <span className="w-8 text-center text-xs font-black text-white">

                                        {

                                          qty

                                        }

                                      </span>



                                      <button

                                        type="button"

                                        onClick={() =>

                                          changeQty(

                                            item,

                                            1

                                          )

                                        }

                                        disabled={

                                          qty >=

                                          ordered

                                        }

                                        className="h-8 w-8 rounded-lg bg-neutral-800 text-xs font-black text-white disabled:opacity-30"

                                      >

                                        +

                                      </button>

                                    </div>

                                  </div>

                                )

                              }

                            )}

                          </div>

                        </div>



                        {decisionType ===

                          'return' && (

                          <label className="mt-4 block">

                            <span className="mb-1.5 block text-[9px] font-black uppercase tracking-wider text-neutral-500">

                              Return Pickup Driver

                            </span>



                            <select

                              value={

                                driverId

                              }

                              onChange={(

                                event

                              ) =>

                                setDriverId(

                                  event

                                    .target

                                    .value

                                )

                              }

                              className="w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-xs text-white outline-none"

                            >

                              <option value="">

                                Select Delivery Driver

                              </option>



                              {activeDrivers.map(

                                (

                                  driver

                                ) => (

                                  <option

                                    key={

                                      driver.id

                                    }

                                    value={

                                      driver.id

                                    }

                                  >

                                    {driver.name ||

                                      'Driver'}{' '}

                                    ·{' '}

                                    {driver.status ||

                                      'active'}

                                  </option>

                                )

                              )}

                            </select>

                          </label>

                        )}



                        <label className="mt-4 block">

                          <span className="mb-1.5 block text-[9px] font-black uppercase tracking-wider text-neutral-500">

                            Resolution Note

                          </span>



                          <textarea

                            value={

                              decisionReason

                            }

                            onChange={(

                              event

                            ) =>

                              setDecisionReason(

                                event

                                  .target

                                  .value

                              )

                            }

                            rows={3}

                            maxLength={1000}

                            placeholder="Example: Customer received damaged bottle; approve return pickup."

                            className="w-full resize-none rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-xs text-white outline-none focus:border-violet-500"

                          />

                        </label>



                        <button

                          type="button"

                          onClick={

                            acceptDecision

                          }

                          disabled={

                            deciding

                          }

                          className={`mt-3 w-full rounded-xl px-4 py-3 text-xs font-black disabled:opacity-50 ${

                            decisionType ===

                            'return'

                              ? 'bg-emerald-500 text-neutral-950'

                              : 'bg-sky-500 text-neutral-950'

                          }`}

                        >

                          {deciding

                            ? 'Processing...'

                            : decisionType ===

                                'return'

                              ? '✓ Approve Return & Send Pickup'

                              : '✓ Approve Replacement'}

                        </button>

                      </>

                    )}

                  </div>

                )}



                {selected.status ===

                  'open' && (

                  <button

                    type="button"

                    onClick={

                      closeThread

                    }

                    disabled={

                      closing

                    }

                    className="mt-5 w-full rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-[10px] font-black text-neutral-400 disabled:opacity-50"

                  >

                    {closing

                      ? 'Closing...'

                      : 'Close Support Chat'}

                  </button>

                )}

              </div>

            </div>

          </div>

        )}

      </section>

    </div>

  )

}
