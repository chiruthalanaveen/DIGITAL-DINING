'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { supabase } from '@/lib/supabase'
import {
  appConfirm,
  appNotice,
  appPrompt,
} from '@/lib/appDialog'

function formatDate(value) {
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

function statusTone(status) {
  const value =
    String(
      status || ''
    ).toLowerCase()

  if (
    value ===
    'returned_to_store'
  ) {
    return 'bg-emerald-500/10 text-emerald-300'
  }

  if (
    value ===
    'picked_up'
  ) {
    return 'bg-sky-500/10 text-sky-300'
  }

  return 'bg-amber-500/10 text-amber-300'
}

export default function DeliveryReturnPickupTasks({
  sessionToken,
}) {
  const [pickups, setPickups] =
    useState([])

  const [loading, setLoading] =
    useState(false)

  const [error, setError] =
    useState('')

  const [updatingId, setUpdatingId] =
    useState('')

  const loadPickups =
    useCallback(
      async (
        silent = false
      ) => {
        const token =
          String(
            sessionToken || ''
          ).trim()

        if (!token) {
          setPickups([])
          return
        }

        if (!silent) {
          setLoading(true)
        }

        try {
          const {
            data,
            error: rpcError,
          } =
            await supabase.rpc(
              'delivery_driver_get_return_pickups',
              {
                p_session_token:
                  token,
              }
            )

          if (rpcError) {
            throw rpcError
          }

          if (!data?.success) {
            throw new Error(
              data?.message ||
                'Unable to load return pickups.'
            )
          }

          setPickups(
            Array.isArray(
              data?.pickups
            )
              ? data.pickups
              : []
          )

          setError('')
        } catch (loadError) {
          console.error(
            'Driver return pickup load error:',
            loadError
          )

          if (!silent) {
            setError(
              loadError?.message ||
                'Unable to load return pickups.'
            )
          }
        } finally {
          if (!silent) {
            setLoading(false)
          }
        }
      },
      [sessionToken]
    )

  useEffect(() => {
    if (!sessionToken) {
      return undefined
    }

    loadPickups(false)

    const timer =
      window.setInterval(
        () => {
          if (
            document.visibilityState ===
            'visible'
          ) {
            loadPickups(true)
          }
        },
        4000
      )

    return () =>
      window.clearInterval(
        timer
      )
  }, [
    sessionToken,
    loadPickups,
  ])

  const active =
    useMemo(
      () =>
        pickups.filter(
          (row) =>
            row.status !==
            'returned_to_store'
        ),
      [pickups]
    )

  const updatePickup =
    async (
      row,
      nextStatus
    ) => {
      if (
        !row?.id ||
        updatingId
      ) {
        return
      }

      const confirmed =
        await appConfirm(
          nextStatus ===
          'picked_up'
            ? 'Confirm that you physically collected the approved return item(s) from the customer?'
            : 'Confirm that you physically returned the collected item(s) to the store/Manager?'
        )

      if (!confirmed) {
        return
      }

      const note =
        await appPrompt(
          nextStatus ===
          'picked_up'
            ? 'Optional pickup note:'
            : 'Optional store handover note:',
          ''
        )

      if (note === null) {
        return
      }

      setUpdatingId(
        row.id
      )

      try {
        const {
          data,
          error: rpcError,
        } =
          await supabase.rpc(
            'delivery_driver_update_return_pickup',
            {
              p_session_token:
                sessionToken,

              p_pickup_id:
                row.id,

              p_new_status:
                nextStatus,

              p_note:
                String(
                  note || ''
                ).trim(),
            }
          )

        if (rpcError) {
          throw rpcError
        }

        if (!data?.success) {
          throw new Error(
            data?.message ||
              'Unable to update return pickup.'
          )
        }

        appNotice(
          nextStatus ===
          'picked_up'
            ? 'Return item marked Picked Up.'
            : 'Return item marked Returned to Store. Manager must now verify quantity and condition before inventory is restored.'
        )

        await loadPickups(true)
      } catch (updateError) {
        appNotice(
          updateError?.message ||
            'Unable to update return pickup.'
        )
      } finally {
        setUpdatingId('')
      }
    }

  if (
    !loading &&
    !pickups.length
  ) {
    return null
  }

  return (
    <section className="rounded-3xl border border-violet-500/20 bg-neutral-900 p-4 sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-violet-400">
            Return Pickup
          </p>

          <h2 className="mt-1 text-lg font-black text-white">
            Customer Return Tasks
          </h2>

          <p className="mt-1 text-xs leading-5 text-neutral-400">
            Collect only the return items approved by the Manager. Inventory is updated later after the Manager checks the returned items at the store.
          </p>
        </div>

        <button
          type="button"
          onClick={() =>
            loadPickups(false)
          }
          disabled={loading}
          className="w-fit rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-[10px] font-black text-neutral-300 disabled:opacity-50"
        >
          {loading
            ? 'Refreshing...'
            : `↻ Refresh (${active.length} active)`}
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-3 text-xs font-bold text-red-300">
          {error}
        </div>
      )}

      <div className="mt-4 space-y-3">
        {pickups.map(
          (row) => {
            const address =
              [
                row.address_line1,
                row.address_line2,
                row.landmark,
                row.city,
                row.state,
                row.pincode,
              ]
                .filter(Boolean)
                .join(', ')

            return (
              <article
                key={row.id}
                className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-mono text-[10px] font-black text-violet-300">
                      {row.pickup_code}
                    </p>

                    <p className="mt-1 text-sm font-black text-white">
                      {row.customer_name ||
                        'Customer'}
                    </p>

                    <p className="mt-1 font-mono text-[9px] font-semibold text-neutral-500">
                      Order{' '}
                      {row.order_code ||
                        ''}
                    </p>
                  </div>

                  <span
                    className={`rounded-full px-2.5 py-1 text-[9px] font-black uppercase ${statusTone(
                      row.status
                    )}`}
                  >
                    {String(
                      row.status || ''
                    ).replaceAll(
                      '_',
                      ' '
                    )}
                  </span>
                </div>

                <div className="mt-3 rounded-xl border border-neutral-800 bg-neutral-900 p-3">
                  <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500">
                    Pickup Address
                  </p>

                  <p className="mt-1 text-xs font-semibold leading-5 text-neutral-200">
                    {address ||
                      'Address unavailable'}
                  </p>

                  <div className="mt-2 flex flex-wrap gap-2">
                    {row.customer_mobile && (
                      <a
                        href={`tel:${row.customer_mobile}`}
                        className="rounded-lg bg-emerald-500/10 px-2.5 py-2 text-[10px] font-black text-emerald-300"
                      >
                        📞{' '}
                        {
                          row.customer_mobile
                        }
                      </a>
                    )}

                    {row.latitude != null &&
                      row.longitude != null && (
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
                            `${row.latitude},${row.longitude}`
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          className="rounded-lg bg-sky-500/10 px-2.5 py-2 text-[10px] font-black text-sky-300"
                        >
                          🗺 Open Location
                        </a>
                      )}
                  </div>
                </div>

                <div className="mt-3">
                  <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500">
                    Approved Return Items
                  </p>

                  <div className="mt-2 space-y-1.5">
                    {(Array.isArray(
                      row.items
                    )
                      ? row.items
                      : []
                    ).map(
                      (
                        item,
                        index
                      ) => (
                        <div
                          key={`${item.name || 'item'}-${index}`}
                          className="flex items-center justify-between gap-3 rounded-lg bg-neutral-900 px-3 py-2 text-xs"
                        >
                          <span className="text-neutral-300">
                            {item.name ||
                              'Item'}
                          </span>

                          <span className="font-black text-white">
                            ×
                            {Number(
                              item.quantity ||
                                0
                            )}
                          </span>
                        </div>
                      )
                    )}
                  </div>
                </div>

                {row.manager_note && (
                  <div className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-[10px] leading-5 text-amber-200">
                    <b>Manager note:</b>{' '}
                    {row.manager_note}
                  </div>
                )}

                <div className="mt-3 flex flex-wrap gap-2">
                  {row.status ===
                    'assigned' && (
                    <button
                      type="button"
                      disabled={
                        updatingId ===
                        row.id
                      }
                      onClick={() =>
                        updatePickup(
                          row,
                          'picked_up'
                        )
                      }
                      className="flex-1 rounded-xl bg-violet-500 px-4 py-3 text-xs font-black text-white disabled:opacity-50"
                    >
                      {updatingId ===
                      row.id
                        ? 'Updating...'
                        : '✓ Mark Picked Up'}
                    </button>
                  )}

                  {row.status ===
                    'picked_up' && (
                    <button
                      type="button"
                      disabled={
                        updatingId ===
                        row.id
                      }
                      onClick={() =>
                        updatePickup(
                          row,
                          'returned_to_store'
                        )
                      }
                      className="flex-1 rounded-xl bg-emerald-500 px-4 py-3 text-xs font-black text-neutral-950 disabled:opacity-50"
                    >
                      {updatingId ===
                      row.id
                        ? 'Updating...'
                        : '🏪 Returned to Store'}
                    </button>
                  )}

                  {row.status ===
                    'returned_to_store' && (
                    <div className="w-full rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-3 text-[10px] font-bold leading-5 text-emerald-200">
                      Returned to store {formatDate(
                        row.returned_to_store_at
                      )}. Manager must now verify the physical quantity and condition.
                    </div>
                  )}
                </div>
              </article>
            )
          }
        )}
      </div>
    </section>
  )
}
