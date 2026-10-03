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

export default function DeliveryCustomerSupportChat({
  restaurantCode,
}) {
  const [open, setOpen] =
    useState(false)

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

          return
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
                'Unable to load Live Support.'
            )
          }

          setThread(
            data?.thread || null
          )

          saveIdentity(
            cleanOrderCode,
            cleanMobile
          )
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
            return
          }

          console.error(
            'Customer delivery support load error:',
            loadError
          )

          setError(
            loadError?.message ||
              'Unable to load Live Support.'
          )
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
          'This support chat is closed. Start a new chat for another query.'
        )
        return
      }

      setSending(true)
      setError('')

      try {
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
                String(
                  orderCode || ''
                ).trim(),

              p_customer_mobile:
                digits(
                  mobile,
                  10
                ),

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
              'Unable to send message.'
          )
        }

        setMessage('')

        await loadChat({
          silent: true,
        })
      } catch (sendError) {
        console.error(
          'Customer support send error:',
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
          💬
        </span>
        Live Support
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-end justify-center bg-black/60 p-0 backdrop-blur-[3px] sm:items-center sm:p-4">
          <div className="flex max-h-[92dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-[28px] border border-neutral-200 bg-white shadow-2xl sm:rounded-[28px]">
            <div className="flex items-start justify-between gap-3 border-b border-neutral-200 px-4 py-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.15em] text-violet-600">
                  Customer ↔ Manager
                </p>

                <h2 className="mt-1 text-lg font-black text-neutral-950">
                  Digital Dine-In Live Support
                </h2>

                <p className="mt-1 text-[11px] leading-5 text-neutral-500">
                  For order issues, returns, replacements or other queries, chat directly with the store Manager.
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

            {!thread ? (
              <div className="overflow-y-auto p-4">
                <div className="rounded-2xl border border-violet-100 bg-violet-50 p-4">
                  <p className="text-xs font-black text-violet-950">
                    Verify your order
                  </p>

                  <p className="mt-1 text-[10px] leading-5 text-violet-700">
                    This prevents another customer from opening or reading your support conversation.
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
                      }}
                      autoCapitalize="characters"
                      placeholder="DEL-20261003-0018"
                      className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 font-mono text-sm font-bold outline-none focus:border-violet-500 focus:bg-white"
                    />
                  </label>

                  <label className="block">
                    <span className="mb-1.5 block text-[10px] font-black uppercase tracking-wider text-neutral-500">
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
                      }}
                      placeholder="10-digit mobile"
                      className="w-full rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm font-bold outline-none focus:border-violet-500 focus:bg-white"
                    />
                  </label>

                  <button
                    type="button"
                    disabled={
                      loading ||
                      !orderCode.trim() ||
                      mobile.length !== 10
                    }
                    onClick={() =>
                      loadChat({
                        createIfMissing:
                          true,
                      })
                    }
                    className="w-full rounded-xl bg-violet-600 px-4 py-4 text-sm font-black text-white disabled:opacity-50"
                  >
                    {loading
                      ? 'Connecting...'
                      : 'Open Live Support'}
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="border-b border-neutral-200 bg-neutral-50 px-4 py-3">
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
                        ? '● Live'
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
                        {pickup.pickup_code}{' '}
                        ·{' '}
                        {String(
                          pickup.status ||
                            ''
                        ).replaceAll(
                          '_',
                          ' '
                        )}
                      </p>

                      {pickup.driver_name && (
                        <p className="mt-1 text-[10px] font-semibold text-amber-800">
                          Rider:{' '}
                          {
                            pickup.driver_name
                          }
                          {pickup.driver_mobile
                            ? ` · ${pickup.driver_mobile}`
                            : ''}
                        </p>
                      )}
                    </div>
                  )}
                </div>

                <div className="min-h-0 flex-1 overflow-y-auto bg-neutral-100 p-4">
                  <div className="space-y-2">
                    {(
                      Array.isArray(
                        thread.messages
                      )
                        ? thread.messages
                        : []
                    ).map(
                      (
                        row
                      ) => {
                        const fromCustomer =
                          row.sender ===
                          'customer'

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
                                : fromCustomer
                                  ? 'justify-end'
                                  : 'justify-start'
                            }`}
                          >
                            {system ? (
                              <div className="max-w-[92%] rounded-xl border border-neutral-200 bg-white px-3 py-2 text-center text-[10px] font-bold leading-4 text-neutral-500">
                                {
                                  row.message
                                }
                              </div>
                            ) : (
                              <div
                                className={`max-w-[84%] rounded-2xl px-3.5 py-2.5 ${
                                  fromCustomer
                                    ? 'rounded-br-md bg-violet-600 text-white'
                                    : 'rounded-bl-md border border-neutral-200 bg-white text-neutral-900'
                                }`}
                              >
                                <p className="text-[9px] font-black opacity-70">
                                  {fromCustomer
                                    ? 'You'
                                    : row.sender_name ||
                                      'Manager'}
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

                    {!thread
                      ?.messages
                      ?.length && (
                      <p className="py-8 text-center text-xs text-neutral-400">
                        Send a message to the Manager.
                      </p>
                    )}

                    <div
                      ref={endRef}
                    />
                  </div>
                </div>

                {error && (
                  <div className="border-t border-red-100 bg-red-50 px-4 py-2 text-[10px] font-bold text-red-700">
                    {error}
                  </div>
                )}

                {thread.status ===
                'open' ? (
                  <form
                    onSubmit={
                      sendMessage
                    }
                    className="flex gap-2 border-t border-neutral-200 bg-white p-3"
                  >
                    <textarea
                      value={message}
                      onChange={(
                        event
                      ) =>
                        setMessage(
                          event.target.value
                        )
                      }
                      rows={1}
                      maxLength={1500}
                      placeholder="Type your query..."
                      className="min-h-[44px] flex-1 resize-none rounded-xl border border-neutral-200 bg-neutral-50 px-3 py-3 text-xs outline-none focus:border-violet-500"
                    />

                    <button
                      type="submit"
                      disabled={
                        sending ||
                        !message.trim()
                      }
                      className="rounded-xl bg-violet-600 px-4 text-xs font-black text-white disabled:opacity-50"
                    >
                      {sending
                        ? '...'
                        : 'Send'}
                    </button>
                  </form>
                ) : (
                  <div className="border-t border-neutral-200 bg-white p-3">
                    <button
                      type="button"
                      onClick={
                        resetChat
                      }
                      className="w-full rounded-xl bg-neutral-950 px-4 py-3 text-xs font-black text-white"
                    >
                      Start New Support Chat
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
