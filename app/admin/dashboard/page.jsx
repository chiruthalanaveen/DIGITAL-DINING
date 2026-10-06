'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import {
  useRouter,
} from 'next/navigation'

const NAV = [
  ['overview', 'Overview'],
  ['custom-plans', 'Custom Plans'],
  ['tenants', 'Tenants & Access'],
  ['operations', 'Operations'],
  ['people', 'Users & Staff'],
  ['inventory', 'Inventory'],
  ['live-support', 'Live Support'],
  ['support', 'Help Centre'],
  ['reviews', 'Reviews'],
  ['payments', 'Payments'],
  ['system', 'System'],
  ['audit', 'Audit Log'],
]

const PLAN_OPTIONS = [
  [
    'restaurant_pro',
    'Restaurant',
  ],
  [
    'delivery',
    'Delivery',
  ],
  [
    'restaurant_resort_pro',
    'Restaurant + Resort',
  ],
  [
    'restaurant_delivery',
    'Restaurant + Delivery',
  ],
  [
    'restaurant_resort_delivery',
    'Restaurant + Resort + Delivery',
  ],
]

const STATUS_OPTIONS = [
  'active',
  'trial',
  'trialing',
  'pending',
  'inactive',
  'expired',
  'suspended',
  'cancelled',
]

const BILLING_OPTIONS = [
  '1month',
  '6months',
  '12months',
]

function money(value) {
  return `₹${Number(
    value || 0
  ).toLocaleString(
    'en-IN',
    {
      maximumFractionDigits:
        2,
    }
  )}`
}

function formatDate(
  value
) {
  if (!value) {
    return '—'
  }

  const date =
    new Date(value)

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return '—'
  }

  return date.toLocaleString(
    'en-IN',
    {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }
  )
}

function shortDate(
  value
) {
  if (!value) {
    return ''
  }

  const date =
    new Date(value)

  if (
    Number.isNaN(
      date.getTime()
    )
  ) {
    return ''
  }

  return date
    .toISOString()
    .slice(
      0,
      10
    )
}

function label(
  value
) {
  return String(
    value || ''
  )
    .replaceAll(
      '_',
      ' '
    )
    .replace(
      /\b\w/g,
      (char) =>
        char.toUpperCase()
    )
}

function Metric({
  label:
    metricLabel,
  value,
  hint = '',
}) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
      <p className="text-[9px] font-black uppercase tracking-[0.15em] text-neutral-500">
        {metricLabel}
      </p>

      <p className="mt-2 text-2xl font-black text-white">
        {value}
      </p>

      {hint && (
        <p className="mt-1 text-[10px] text-neutral-500">
          {hint}
        </p>
      )}
    </div>
  )
}

function Empty({
  children,
}) {
  return (
    <div className="rounded-2xl border border-dashed border-neutral-800 bg-neutral-950/50 px-5 py-10 text-center text-xs text-neutral-500">
      {children}
    </div>
  )
}

function StatusPill({
  value,
}) {
  const normalized =
    String(
      value || ''
    ).toLowerCase()

  const positive =
    [
      'active',
      'trial',
      'trialing',
      'open',
      'paid',
      'delivered',
      'working',
      'completed',
    ].includes(
      normalized
    )

  const warning =
    [
      'pending',
      'received',
      'confirmed',
      'preparing',
      'packed',
      'out_for_delivery',
      'assigned',
      'picked_up',
    ].includes(
      normalized
    )

  return (
    <span
      className={`inline-flex rounded-full border px-2.5 py-1 text-[9px] font-black uppercase ${
        positive
          ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400'
          : warning
            ? 'border-amber-500/25 bg-amber-500/10 text-amber-400'
            : 'border-red-500/25 bg-red-500/10 text-red-400'
      }`}
    >
      {label(
        value ||
          'unknown'
      )}
    </span>
  )
}


function CustomPlanRequestCard({
  request,
  action,
  actionLoading,
}) {
  const [
    status,
    setStatus,
  ] = useState(
    request?.status ||
      'new'
  )

  const [
    quotedMonthlyPrice,
    setQuotedMonthlyPrice,
  ] = useState(
    request?.quoted_monthly_price ??
      ''
  )

  const [
    adminNotes,
    setAdminNotes,
  ] = useState(
    request?.admin_notes ||
      ''
  )

  const requirements = [
    {
      key: 'Restaurant',
      selected:
        request?.restaurant_selected,
      items:
        request?.restaurant_requirements,
    },
    {
      key: 'Delivery',
      selected:
        request?.delivery_selected,
      items:
        request?.delivery_requirements,
    },
    {
      key: 'Resort',
      selected:
        request?.resort_selected,
      items:
        request?.resort_requirements,
    },
  ].filter(
    (module) =>
      module.selected ||
      (
        Array.isArray(
          module.items
        ) &&
        module.items.length > 0
      )
  )

  const save =
    async () => {
      await action({
        action:
          'update_custom_plan_request',
        requestId:
          request.id,
        status,
        quotedMonthlyPrice:
          quotedMonthlyPrice === ''
            ? null
            : quotedMonthlyPrice,
        adminNotes,
      })
    }

  return (
    <article className="rounded-3xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-base font-black text-white">
              {request.customer_name ||
                'Customer'}
            </h2>

            <StatusPill
              value={
                request.status ||
                'new'
              }
            />
          </div>

          <p className="mt-1 text-[10px] text-neutral-500">
            Submitted{' '}
            {formatDate(
              request.created_at
            )}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            {request.contact_number && (
              <a
                href={`tel:${request.contact_number}`}
                className="rounded-xl bg-emerald-600 px-3 py-2 text-[9px] font-black text-white"
              >
                Call {request.contact_number}
              </a>
            )}

            {request.email && (
              <a
                href={`mailto:${request.email}`}
                className="rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2 text-[9px] font-black text-neutral-300"
              >
                Email
              </a>
            )}
          </div>
        </div>

        <div className="grid min-w-0 gap-1 text-[10px] text-neutral-400 xl:text-right">
          <p>
            <span className="font-black text-neutral-600">
              Business:
            </span>{' '}
            {request.business_name ||
              '—'}
          </p>

          <p>
            <span className="font-black text-neutral-600">
              City:
            </span>{' '}
            {request.business_city ||
              '—'}
          </p>

          <p className="font-mono text-[9px] text-neutral-600">
            {request.id}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 xl:grid-cols-3">
        {requirements.map(
          (module) => (
            <div
              key={module.key}
              className="rounded-2xl border border-neutral-800 bg-neutral-950 p-4"
            >
              <p className="text-[9px] font-black uppercase tracking-wider text-red-400">
                {module.key}
              </p>

              <div className="mt-3 space-y-2">
                {Array.isArray(
                  module.items
                ) &&
                module.items.length ? (
                  module.items.map(
                    (
                      item,
                      index
                    ) => (
                      <div
                        key={
                          item?.id ||
                          `${module.key}-${index}`
                        }
                        className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-[10px] font-bold leading-5 text-neutral-300"
                      >
                        ✓{' '}
                        {item?.title ||
                          item?.id ||
                          'Requirement'}
                      </div>
                    )
                  )
                ) : (
                  <p className="text-[10px] text-neutral-600">
                    Module selected.
                  </p>
                )}
              </div>
            </div>
          )
        )}
      </div>

      {request.additional_requirements && (
        <div className="mt-4 rounded-2xl border border-neutral-800 bg-neutral-950 p-4">
          <p className="text-[9px] font-black uppercase tracking-wider text-neutral-600">
            Additional Requirements
          </p>

          <p className="mt-2 whitespace-pre-wrap text-xs leading-6 text-neutral-300">
            {request.additional_requirements}
          </p>
        </div>
      )}

      <div className="mt-4 grid gap-3 lg:grid-cols-[220px_220px_minmax(0,1fr)]">
        <label className="block">
          <span className="text-[9px] font-black uppercase tracking-wider text-neutral-600">
            Status
          </span>

          <select
            value={status}
            onChange={(
              event
            ) =>
              setStatus(
                event.target.value
              )
            }
            className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-xs font-bold text-white outline-none focus:border-red-500"
          >
            {[
              'new',
              'reviewing',
              'contacted',
              'quoted',
              'accepted',
              'rejected',
            ].map(
              (option) => (
                <option
                  key={option}
                  value={option}
                >
                  {label(option)}
                </option>
              )
            )}
          </select>
        </label>

        <label className="block">
          <span className="text-[9px] font-black uppercase tracking-wider text-neutral-600">
            Monthly Quote ₹
          </span>

          <input
            type="number"
            min="0"
            step="1"
            value={
              quotedMonthlyPrice
            }
            onChange={(
              event
            ) =>
              setQuotedMonthlyPrice(
                event.target.value
              )
            }
            placeholder="Enter amount"
            className="mt-2 w-full rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-xs font-bold text-white outline-none focus:border-red-500"
          />
        </label>

        <label className="block">
          <span className="text-[9px] font-black uppercase tracking-wider text-neutral-600">
            Admin / Manager Notes
          </span>

          <textarea
            value={adminNotes}
            onChange={(
              event
            ) =>
              setAdminNotes(
                event.target.value
              )
            }
            rows={3}
            placeholder="Discussion, quotation notes, follow-up details..."
            className="mt-2 w-full resize-y rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-3 text-xs leading-5 text-white outline-none focus:border-red-500"
          />
        </label>
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-neutral-800 pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-[9px] text-neutral-600">
          <span>
            Contacted:{' '}
            {formatDate(
              request.contacted_at
            )}
          </span>

          <span>
            Quoted:{' '}
            {formatDate(
              request.quoted_at
            )}
          </span>

          <span>
            Accepted:{' '}
            {formatDate(
              request.accepted_at
            )}
          </span>
        </div>

        <button
          type="button"
          disabled={
            actionLoading
          }
          onClick={save}
          className="rounded-xl bg-red-600 px-5 py-3 text-[10px] font-black text-white disabled:opacity-50"
        >
          {actionLoading
            ? 'Saving...'
            : 'Save Request'}
        </button>
      </div>
    </article>
  )
}

export default function AdminControlCenter() {
  const router =
    useRouter()

  const [
    section,
    setSection,
  ] =
    useState('overview')

  const [
    data,
    setData,
  ] =
    useState(null)

  const [
    loading,
    setLoading,
  ] =
    useState(true)

  const [
    refreshing,
    setRefreshing,
  ] =
    useState(false)

  const [
    timedOut,
    setTimedOut,
  ] =
    useState(false)

  const [
    error,
    setError,
  ] =
    useState('')

  const [
    search,
    setSearch,
  ] =
    useState('')

  const [
    tenantEditor,
    setTenantEditor,
  ] =
    useState(null)

  const [
    actionLoading,
    setActionLoading,
  ] =
    useState(false)

  const [
    liveSupportSessions,
    setLiveSupportSessions,
  ] =
    useState([])

  const [
    selectedLiveSupport,
    setSelectedLiveSupport,
  ] =
    useState(null)

  const [
    liveSupportMessages,
    setLiveSupportMessages,
  ] =
    useState([])

  const [
    liveSupportLoading,
    setLiveSupportLoading,
  ] =
    useState(false)

  const [
    liveSupportActionLoading,
    setLiveSupportActionLoading,
  ] =
    useState(false)

  const [
    liveSupportError,
    setLiveSupportError,
  ] =
    useState('')

  const [
    liveSupportReply,
    setLiveSupportReply,
  ] =
    useState('')

  const [
    liveSupportCounts,
    setLiveSupportCounts,
  ] =
    useState({
      pending: 0,
      connected: 0,
      total: 0,
    })

  const loadData =
    useCallback(
      async (
        quiet = false
      ) => {
        if (quiet) {
          setRefreshing(true)
        } else {
          setLoading(true)
        }

        setTimedOut(false)
        setError('')

        const controller =
          new AbortController()

        const timeoutId =
          window.setTimeout(
            () => {
              setTimedOut(true)
              controller.abort()
            },
            15000
          )

        try {
          const response =
            await fetch(
              '/api/admin/control-center',
              {
                cache:
                  'no-store',
                signal:
                  controller.signal,
              }
            )

          const payload =
            await response
              .json()
              .catch(
                () => ({})
              )

          if (
            response.status ===
            401
          ) {
            router.replace(
              '/admin'
            )
            return
          }

          if (
            !response.ok ||
            !payload?.success
          ) {
            throw new Error(
              payload?.message ||
                'Unable to load Admin Control Center.'
            )
          }

          setData(
            payload
          )
        } catch (loadError) {
          const aborted =
            loadError?.name ===
            'AbortError'

          setError(
            aborted
              ? 'Admin data request took longer than 15 seconds. The page stopped waiting instead of staying on an infinite loader. Check the terminal for /api/admin/control-center and press Retry.'
              : loadError?.message ||
                  'Unable to load Admin Control Center.'
          )
        } finally {
          window.clearTimeout(
            timeoutId
          )

          setLoading(false)
          setRefreshing(false)
        }
      },
      [router]
    )

  useEffect(() => {
    loadData()
  }, [loadData])

  const action =
    async (
      payload
    ) => {
      if (actionLoading) {
        return null
      }

      setActionLoading(
        true
      )
      setError('')

      try {
        const response =
          await fetch(
            '/api/admin/control-center',
            {
              method:
                'POST',
              headers: {
                'Content-Type':
                  'application/json',
              },
              body:
                JSON.stringify(
                  payload
                ),
            }
          )

        const result =
          await response
            .json()
            .catch(
              () => ({})
            )

        if (
          response.status ===
          401
        ) {
          router.replace(
            '/admin'
          )
          return null
        }

        if (
          !response.ok ||
          !result?.success
        ) {
          throw new Error(
            result?.message ||
              'Admin action failed.'
          )
        }

        await loadData(
          true
        )

        return result
      } catch (actionError) {
        setError(
          actionError?.message ||
            'Admin action failed.'
        )

        return null
      } finally {
        setActionLoading(
          false
        )
      }
    }

  const logout =
    async () => {
      try {
        await fetch(
          '/api/admin/logout',
          {
            method:
              'POST',
          }
        )
      } finally {
        router.replace(
          '/admin'
        )
      }
    }

  const loadLiveSupport =
    useCallback(
      async (
        sessionId = '',
        quiet = false
      ) => {
        if (!quiet) {
          setLiveSupportLoading(
            true
          )
        }

        try {
          const query =
            sessionId
              ? `?sessionId=${encodeURIComponent(
                  sessionId
                )}`
              : ''

          const response =
            await fetch(
              `/api/admin/live-support${query}`,
              {
                cache:
                  'no-store',
              }
            )

          const payload =
            await response
              .json()
              .catch(
                () => ({})
              )

          if (
            response.status ===
            401
          ) {
            window.location.replace(
              '/admin'
            )
            return
          }

          if (
            !response.ok ||
            !payload?.success
          ) {
            throw new Error(
              payload?.message ||
                'Unable to load Live Support.'
            )
          }

          const sessions =
            Array.isArray(
              payload?.sessions
            )
              ? payload.sessions
              : []

          setLiveSupportSessions(
            sessions
          )

          setLiveSupportCounts(
            payload?.counts || {
              pending: 0,
              connected: 0,
              total:
                sessions.length,
            }
          )

          if (sessionId) {
            setSelectedLiveSupport(
              payload
                ?.selectedSession ||
                sessions.find(
                  (row) =>
                    String(
                      row.id
                    ) ===
                    String(
                      sessionId
                    )
                ) ||
                null
            )

            setLiveSupportMessages(
              Array.isArray(
                payload?.messages
              )
                ? payload.messages
                : []
            )
          } else {
            setSelectedLiveSupport(
              (current) => {
                if (!current) {
                  return null
                }

                return (
                  sessions.find(
                    (row) =>
                      String(
                        row.id
                      ) ===
                      String(
                        current.id
                      )
                  ) ||
                  current
                )
              }
            )
          }

          setLiveSupportError(
            ''
          )
        } catch (supportError) {
          setLiveSupportError(
            supportError?.message ||
              'Unable to load Live Support.'
          )
        } finally {
          if (!quiet) {
            setLiveSupportLoading(
              false
            )
          }
        }
      },
      []
    )

  const runLiveSupportAction =
    async ({
      action:
        supportAction,
      sessionId,
      message = '',
    }) => {
      if (
        liveSupportActionLoading
      ) {
        return false
      }

      setLiveSupportActionLoading(
        true
      )
      setLiveSupportError(
        ''
      )

      try {
        const response =
          await fetch(
            '/api/admin/live-support',
            {
              method:
                'POST',
              headers: {
                'Content-Type':
                  'application/json',
              },
              body:
                JSON.stringify({
                  action:
                    supportAction,
                  sessionId,
                  restaurantId:
                    selectedLiveSupport?.restaurant_id ||
                    '',
                  message,
                }),
            }
          )

        const payload =
          await response
            .json()
            .catch(
              () => ({})
            )

        if (
          response.status ===
          401
        ) {
          window.location.replace(
            '/admin'
          )
          return false
        }

        if (
          !response.ok ||
          !payload?.success
        ) {
          throw new Error(
            payload?.message ||
              'Live Support action failed.'
          )
        }

        await loadLiveSupport(
          sessionId,
          true
        )

        return true
      } catch (supportError) {
        setLiveSupportError(
          supportError?.message ||
            'Live Support action failed.'
        )

        return false
      } finally {
        setLiveSupportActionLoading(
          false
        )
      }
    }

  const openLiveSupport =
    async (session) => {
      if (!session?.id) {
        return
      }

      setSelectedLiveSupport(
        session
      )

      setLiveSupportMessages(
        []
      )

      await loadLiveSupport(
        session.id
      )
    }

  const acceptLiveSupport =
    async () => {
      if (
        !selectedLiveSupport?.id
      ) {
        return
      }

      await runLiveSupportAction({
        action:
          'accept',
        sessionId:
          selectedLiveSupport.id,
      })
    }

  const closeLiveSupport =
    async () => {
      if (
        !selectedLiveSupport?.id
      ) {
        return
      }

      const confirmed =
        window.confirm(
          `Close Live Support for ${
            selectedLiveSupport.restaurant_name ||
            'this restaurant'
          }?`
        )

      if (!confirmed) {
        return
      }

      await runLiveSupportAction({
        action:
          'close',
        sessionId:
          selectedLiveSupport.id,
      })
    }

  const sendLiveSupportReply =
    async (event) => {
      event.preventDefault()

      const message =
        liveSupportReply
          .trim()

      if (
        !message ||
        !selectedLiveSupport?.id
      ) {
        return
      }

      const sent =
        await runLiveSupportAction({
          action:
            'send',
          sessionId:
            selectedLiveSupport.id,
          message,
        })

      if (sent) {
        setLiveSupportReply(
          ''
        )
      }
    }

  useEffect(() => {
    if (
      section !==
      'live-support'
    ) {
      return undefined
    }

    let active = true

    const refresh =
      async () => {
        if (!active) {
          return
        }

        await loadLiveSupport(
          selectedLiveSupport?.id ||
            '',
          true
        )
      }

    loadLiveSupport(
      selectedLiveSupport?.id ||
        '',
      false
    )

    const timer =
      window.setInterval(
        refresh,
        2500
      )

    return () => {
      active = false
      window.clearInterval(
        timer
      )
    }
  }, [
    section,
    selectedLiveSupport?.id,
    loadLiveSupport,
  ])

  const tenants =
    useMemo(
      () => {
        const rows =
          Array.isArray(
            data?.tenants
          )
            ? data.tenants
            : []

        const term =
          search
            .trim()
            .toLowerCase()

        if (!term) {
          return rows
        }

        return rows.filter(
          (row) =>
            [
              row.name,
              row.email,
              row.phone,
              row.restaurant_code,
              row.plan_code,
              row.subscription_status,
            ]
              .join(' ')
              .toLowerCase()
              .includes(
                term
              )
        )
      },
      [
        data?.tenants,
        search,
      ]
    )

  const summary =
    data?.summary || {}

  const customPlanRequests =
    Array.isArray(
      data?.customPlanRequests
    )
      ? data.customPlanRequests
      : []

  const openTenantEditor =
    (
      tenant
    ) => {
      setTenantEditor({
        ...tenant,
        planCode:
          tenant.plan_code ||
          'restaurant_pro',
        subscriptionStatus:
          tenant.subscription_status ||
          'active',
        billingCycle:
          tenant.billing_cycle ||
          '1month',
        subscriptionExpiresAt:
          shortDate(
            tenant.subscription_expires_at
          ),
      })
    }

  const saveTenant =
    async () => {
      if (!tenantEditor) {
        return
      }

      const result =
        await action({
          action:
            'update_tenant_access',
          restaurantId:
            tenantEditor.id,
          planCode:
            tenantEditor.planCode,
          subscriptionStatus:
            tenantEditor.subscriptionStatus,
          billingCycle:
            tenantEditor.billingCycle,
          subscriptionExpiresAt:
            tenantEditor.subscriptionExpiresAt
              ? `${tenantEditor.subscriptionExpiresAt}T23:59:59+05:30`
              : null,
        })

      if (result) {
        setTenantEditor(
          null
        )
      }
    }

  const recentOrders =
    Array.isArray(
      data?.orders
    )
      ? data.orders
      : []

  const supportThreads =
    Array.isArray(
      data?.supportThreads
    )
      ? data.supportThreads
      : []

  const reviews =
    Array.isArray(
      data?.reviews
    )
      ? data.reviews
      : []

  if (loading) {
    return (
      <main className="min-h-[100dvh] bg-neutral-950 p-6 text-white">
        <div className="mx-auto flex min-h-[70dvh] max-w-lg items-center justify-center">
          <div className="w-full rounded-3xl border border-neutral-800 bg-neutral-900 p-6 text-center">
            <div className="mx-auto h-10 w-10 animate-spin rounded-full border-4 border-neutral-800 border-t-red-500" />

            <p className="mt-4 text-sm font-black text-white">
              Loading Admin Control Center...
            </p>

            <p className="mt-2 text-[10px] leading-5 text-neutral-500">
              Maximum wait: 15 seconds.
            </p>
          </div>
        </div>
      </main>
    )
  }

  if (
    !data &&
    error
  ) {
    return (
      <main className="min-h-[100dvh] bg-neutral-950 p-6 text-white">
        <div className="mx-auto flex min-h-[70dvh] max-w-xl items-center justify-center">
          <section className="w-full rounded-3xl border border-red-500/25 bg-neutral-900 p-6">
            <p className="text-[9px] font-black uppercase tracking-[0.18em] text-red-400">
              Admin ERP Load Error
            </p>

            <h1 className="mt-2 text-xl font-black text-white">
              Control Center could not load
            </h1>

            <p className="mt-3 text-xs leading-6 text-neutral-400">
              {error}
            </p>

            <div className="mt-5 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() =>
                  loadData()
                }
                className="rounded-xl bg-red-600 px-4 py-3 text-xs font-black text-white"
              >
                Retry
              </button>

              <button
                type="button"
                onClick={
                  logout
                }
                className="rounded-xl border border-neutral-700 bg-neutral-950 px-4 py-3 text-xs font-black text-neutral-300"
              >
                Back to Login
              </button>
            </div>

            <p className="mt-4 font-mono text-[9px] text-neutral-600">
              API: /api/admin/control-center
            </p>
          </section>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-[100dvh] bg-[#080808] text-neutral-100">
      <header className="sticky top-0 z-40 border-b border-neutral-800 bg-neutral-950/95 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[1600px] items-center gap-3 px-4 py-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-600 font-black text-white">
            D
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-black text-white">
              Digital Dine-In
            </p>

            <p className="text-[9px] font-black uppercase tracking-[0.15em] text-red-400">
              ERP Admin Control Center
            </p>
          </div>

          <button
            type="button"
            onClick={() =>
              loadData(
                true
              )
            }
            disabled={
              refreshing
            }
            className="rounded-xl border border-neutral-800 bg-neutral-900 px-3 py-2 text-[10px] font-black text-neutral-300 disabled:opacity-50"
          >
            {refreshing
              ? 'Refreshing...'
              : 'Refresh'}
          </button>

          <button
            type="button"
            onClick={
              logout
            }
            className="rounded-xl bg-red-600 px-3 py-2 text-[10px] font-black text-white"
          >
            Logout
          </button>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-[1600px] lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="border-b border-neutral-800 bg-neutral-950 p-3 lg:sticky lg:top-[65px] lg:h-[calc(100dvh-65px)] lg:border-b-0 lg:border-r">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:grid-cols-1">
            {NAV.map(
              ([
                key,
                navLabel,
              ]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() =>
                    setSection(
                      key
                    )
                  }
                  className={`rounded-xl px-3 py-2.5 text-left text-[10px] font-black transition ${
                    section ===
                    key
                      ? 'bg-red-600 text-white'
                      : 'bg-neutral-900 text-neutral-400 hover:text-white'
                  }`}
                >
                  {navLabel}
                </button>
              )
            )}
          </div>

          <div className="mt-4 hidden rounded-2xl border border-neutral-800 bg-neutral-900 p-3 lg:block">
            <p className="text-[9px] font-black uppercase tracking-wider text-neutral-600">
              Signed in as
            </p>

            <p className="mt-2 break-all text-[10px] font-bold text-neutral-300">
              {data?.admin
                ?.email ||
                'Admin'}
            </p>
          </div>
        </aside>

        <section className="min-w-0 p-4 sm:p-5 lg:p-6">
          {error && (
            <div className="mb-4 rounded-2xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-xs font-bold text-red-300">
              {error}
            </div>
          )}

          {Array.isArray(
            data?.warnings
          ) &&
            data.warnings
              .length > 0 && (
              <details className="mb-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
                <summary className="cursor-pointer text-xs font-black text-amber-300">
                  System warnings ({data.warnings.length})
                </summary>

                <div className="mt-3 space-y-1">
                  {data.warnings.map(
                    (
                      warning,
                      index
                    ) => (
                      <p
                        key={`${warning}-${index}`}
                        className="text-[10px] text-amber-200/70"
                      >
                        {warning}
                      </p>
                    )
                  )}
                </div>
              </details>
            )}

          {section ===
            'overview' && (
            <div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-400">
                  Third Eye
                </p>

                <h1 className="mt-1 text-2xl font-black text-white sm:text-3xl">
                  Platform Overview
                </h1>

                <p className="mt-2 max-w-3xl text-xs leading-6 text-neutral-500">
                  One-screen operational view across Restaurant, Delivery, Resort, subscriptions, users, Help Centre, reviews and the installed application.
                </p>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-6">
                <Metric
                  label="Registered Users"
                  value={
                    summary.authUsers ||
                    0
                  }
                  hint="Supabase Auth"
                />

                <Metric
                  label="Tenants"
                  value={
                    summary.tenants ||
                    0
                  }
                />

                <Metric
                  label="Active Subs"
                  value={
                    summary.activeSubscriptions ||
                    0
                  }
                />

                <Metric
                  label="Expiring ≤7d"
                  value={
                    summary.expiringSoon ||
                    0
                  }
                />

                <Metric
                  label="Orders Today"
                  value={
                    summary.ordersToday ||
                    0
                  }
                />

                <Metric
                  label="Revenue Today"
                  value={money(
                    summary.revenueToday
                  )}
                />

                <Metric
                  label="Restaurant"
                  value={
                    summary.restaurantEnabled ||
                    0
                  }
                />

                <Metric
                  label="Delivery"
                  value={
                    summary.deliveryEnabled ||
                    0
                  }
                />

                <Metric
                  label="Resort"
                  value={
                    summary.resortEnabled ||
                    0
                  }
                />

                <Metric
                  label="Open Help"
                  value={
                    summary.openHelpCentre ||
                    0
                  }
                />

                <Metric
                  label="Low Stock"
                  value={
                    summary.lowStock ||
                    0
                  }
                />

                <Metric
                  label="Avg Rating"
                  value={
                    Number(
                      summary.averageRating ||
                        0
                    ).toFixed(
                      1
                    )
                  }
                  hint={`${summary.reviews || 0} verified reviews`}
                />
                <Metric
                  label="Custom Leads"
                  value={
                    summary.customPlanRequests ||
                    0
                  }
                  hint={`${summary.newCustomPlanRequests || 0} new`}
                />
              </div>

              <div className="mt-6 grid gap-4 xl:grid-cols-2">
                <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500">
                        Live Platform Status
                      </p>

                      <h2 className="mt-1 text-lg font-black text-white">
                        Website + Application
                      </h2>
                    </div>

                    <StatusPill
                      value={
                        data?.platform
                          ?.websiteStatus ||
                        'Working'
                      }
                    />
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-2xl bg-neutral-950 p-4">
                      <p className="text-[9px] font-black uppercase text-neutral-600">
                        Installed App Start
                      </p>

                      <p className="mt-2 font-mono text-sm font-black text-emerald-400">
                        /app
                      </p>

                      <p className="mt-2 text-[10px] leading-5 text-neutral-500">
                        The installed PWA opens the app/app login portal, not the public website.
                      </p>
                    </div>

                    <div className="rounded-2xl bg-neutral-950 p-4">
                      <p className="text-[9px] font-black uppercase text-neutral-600">
                        App Scope
                      </p>

                      <p className="mt-2 font-mono text-sm font-black text-emerald-400">
                        /app/
                      </p>

                      <p className="mt-2 text-[10px] leading-5 text-neutral-500">
                        Owner, Manager, Waiter, Kitchen, Packer and Driver application portals stay inside this scope.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                  <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500">
                    Latest Modules
                  </p>

                  <h2 className="mt-1 text-lg font-black text-white">
                    Current Website Capability
                  </h2>

                  <div className="mt-4 grid grid-cols-2 gap-2 text-[10px] font-bold">
                    {[
                      '5-plan subscriptions',
                      'Plan-aware /app portals',
                      'Restaurant QR ordering',
                      'Delivery COD + Razorpay',
                      'Delivery radius + live pin',
                      'Inventory + barcode packing',
                      'COD reconciliation',
                      'Help Centre',
                      'Return pickup workflow',
                      'Verified product reviews',
                      'Resort booking',
                      'App-only PWA install',
                    ].map(
                      (item) => (
                        <div
                          key={item}
                          className="rounded-xl border border-neutral-800 bg-neutral-950 px-3 py-2.5 text-neutral-300"
                        >
                          ✓ {item}
                        </div>
                      )
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {section ===
            'custom-plans' && (
            <div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-400">
                    Sales Pipeline
                  </p>

                  <h1 className="mt-1 text-2xl font-black text-white sm:text-3xl">
                    Custom Plan Requests
                  </h1>

                  <p className="mt-2 max-w-3xl text-xs leading-6 text-neutral-500">
                    Review customer-selected Restaurant, Delivery and Resort requirements, record the quotation and manage the follow-up status.
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    loadData(
                      true
                    )
                  }
                  disabled={
                    refreshing
                  }
                  className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-[10px] font-black text-neutral-300 disabled:opacity-50"
                >
                  {refreshing
                    ? 'Refreshing...'
                    : 'Refresh Requests'}
                </button>
              </div>

              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Metric
                  label="Total Requests"
                  value={
                    summary.customPlanRequests ||
                    customPlanRequests.length
                  }
                />

                <Metric
                  label="New"
                  value={
                    summary.newCustomPlanRequests ||
                    0
                  }
                />

                <Metric
                  label="Quoted"
                  value={
                    customPlanRequests.filter(
                      (row) =>
                        row.status ===
                        'quoted'
                    ).length
                  }
                />

                <Metric
                  label="Accepted"
                  value={
                    customPlanRequests.filter(
                      (row) =>
                        row.status ===
                        'accepted'
                    ).length
                  }
                />
              </div>

              <div className="mt-5 space-y-4">
                {!customPlanRequests.length ? (
                  <Empty>
                    No Custom Plan requests have been submitted yet.
                  </Empty>
                ) : (
                  customPlanRequests.map(
                    (request) => (
                      <CustomPlanRequestCard
                        key={
                          request.id
                        }
                        request={
                          request
                        }
                        action={
                          action
                        }
                        actionLoading={
                          actionLoading
                        }
                      />
                    )
                  )
                )}
              </div>
            </div>
          )}

          {section ===
            'tenants' && (
            <div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-400">
                    Access Control
                  </p>

                  <h1 className="mt-1 text-2xl font-black text-white">
                    Tenants & Subscriptions
                  </h1>
                </div>

                <input
                  value={
                    search
                  }
                  onChange={(
                    event
                  ) =>
                    setSearch(
                      event.target.value
                    )
                  }
                  placeholder="Search tenant, email, code, plan..."
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-xs outline-none focus:border-red-500 sm:max-w-sm"
                />
              </div>

              <div className="mt-5 overflow-x-auto rounded-3xl border border-neutral-800 bg-neutral-900">
                <table className="min-w-[1050px] w-full text-left">
                  <thead className="border-b border-neutral-800 bg-neutral-950 text-[9px] uppercase tracking-wider text-neutral-600">
                    <tr>
                      <th className="p-4">
                        Tenant
                      </th>
                      <th className="p-4">
                        Code
                      </th>
                      <th className="p-4">
                        Plan
                      </th>
                      <th className="p-4">
                        Status
                      </th>
                      <th className="p-4">
                        Modules
                      </th>
                      <th className="p-4">
                        Expires
                      </th>
                      <th className="p-4 text-right">
                        Action
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-neutral-800 text-xs">
                    {tenants.map(
                      (tenant) => (
                        <tr
                          key={
                            tenant.id
                          }
                          className="hover:bg-neutral-800/30"
                        >
                          <td className="p-4">
                            <p className="font-black text-white">
                              {tenant.name ||
                                'Tenant'}
                            </p>

                            <p className="mt-1 text-[9px] text-neutral-500">
                              {tenant.email ||
                                '—'}
                            </p>
                          </td>

                          <td className="p-4 font-mono text-[10px] text-neutral-400">
                            {tenant.restaurant_code ||
                              '—'}
                          </td>

                          <td className="p-4">
                            <p className="font-bold text-neutral-300">
                              {label(
                                tenant.plan_code ||
                                  tenant.plan
                              )}
                            </p>

                            <p className="mt-1 text-[9px] text-neutral-600">
                              {tenant.billing_cycle ||
                                '—'}
                            </p>
                          </td>

                          <td className="p-4">
                            <StatusPill
                              value={
                                tenant.subscription_status
                              }
                            />
                          </td>

                          <td className="p-4">
                            <div className="flex flex-wrap gap-1">
                              {tenant.plan_code !==
                                'delivery' && (
                                <span className="rounded-lg bg-blue-500/10 px-2 py-1 text-[8px] font-black text-blue-400">
                                  RESTAURANT
                                </span>
                              )}

                              {(tenant.delivery_enabled ||
                                [
                                  'delivery',
                                  'restaurant_delivery',
                                  'restaurant_resort_delivery',
                                ].includes(
                                  tenant.plan_code
                                )) && (
                                <span className="rounded-lg bg-emerald-500/10 px-2 py-1 text-[8px] font-black text-emerald-400">
                                  DELIVERY
                                </span>
                              )}

                              {tenant.resort_enabled && (
                                <span className="rounded-lg bg-violet-500/10 px-2 py-1 text-[8px] font-black text-violet-400">
                                  RESORT
                                </span>
                              )}
                            </div>
                          </td>

                          <td className="p-4 text-[10px] text-neutral-400">
                            {formatDate(
                              tenant.subscription_expires_at
                            )}
                          </td>

                          <td className="p-4 text-right">
                            <button
                              type="button"
                              onClick={() =>
                                openTenantEditor(
                                  tenant
                                )
                              }
                              className="rounded-xl bg-red-600 px-3 py-2 text-[9px] font-black text-white"
                            >
                              Manage Access
                            </button>
                          </td>
                        </tr>
                      )
                    )}
                  </tbody>
                </table>

                {!tenants.length && (
                  <div className="p-8 text-center text-xs text-neutral-500">
                    No tenants found.
                  </div>
                )}
              </div>
            </div>
          )}

          {section ===
            'operations' && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-400">
                Operations
              </p>

              <h1 className="mt-1 text-2xl font-black text-white">
                Restaurant · Delivery · Resort
              </h1>

              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Metric
                  label="Restaurant Orders"
                  value={
                    summary.restaurantOrders ||
                    0
                  }
                />

                <Metric
                  label="Delivery Orders"
                  value={
                    summary.deliveryOrders ||
                    0
                  }
                />

                <Metric
                  label="Resort Bookings"
                  value={
                    summary.resortBookings ||
                    0
                  }
                />

                <Metric
                  label="Return Pickups"
                  value={
                    summary.returnPickupsOpen ||
                    0
                  }
                />
              </div>

              <div className="mt-5 rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                <div className="flex items-end justify-between gap-3">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500">
                      Delivery Stores
                    </p>

                    <h2 className="mt-1 text-sm font-black text-white">
                      Open / Close Store
                    </h2>
                  </div>

                  <p className="text-[9px] text-neutral-600">
                    Uses existing Delivery action engine
                  </p>
                </div>

                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {!(data?.deliverySettings || []).length ? (
                    <div className="md:col-span-2 xl:col-span-3">
                      <Empty>
                        No Delivery store settings found.
                      </Empty>
                    </div>
                  ) : (
                    data.deliverySettings.map(
                      (store) => (
                        <div
                          key={
                            store.id ||
                            store.restaurant_id
                          }
                          className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="text-xs font-black text-white">
                                {store.store_name ||
                                  store.restaurant_name ||
                                  'Delivery Store'}
                              </p>

                              <p className="mt-1 text-[9px] text-neutral-600">
                                Delivery ₹{Number(store.delivery_fee || 0)}
                                {' · '}
                                Handling ₹{Number(store.handling_charge || 0)}
                              </p>
                            </div>

                            <StatusPill
                              value={
                                store.is_open
                                  ? 'active'
                                  : 'inactive'
                              }
                            />
                          </div>

                          <button
                            type="button"
                            disabled={
                              actionLoading
                            }
                            onClick={() =>
                              action({
                                action:
                                  'set_delivery_store_open',
                                restaurantId:
                                  store.restaurant_id,
                                isOpen:
                                  !store.is_open,
                              })
                            }
                            className={`mt-3 w-full rounded-xl px-3 py-2.5 text-[9px] font-black text-white ${
                              store.is_open
                                ? 'bg-red-600'
                                : 'bg-emerald-600'
                            }`}
                          >
                            {store.is_open
                              ? 'Close Delivery Store'
                              : 'Open Delivery Store'}
                          </button>
                        </div>
                      )
                    )
                  )}
                </div>
              </div>

              <div className="mt-5 overflow-x-auto rounded-3xl border border-neutral-800 bg-neutral-900">
                <table className="min-w-[900px] w-full text-left">
                  <thead className="border-b border-neutral-800 bg-neutral-950 text-[9px] uppercase tracking-wider text-neutral-600">
                    <tr>
                      <th className="p-4">
                        Module
                      </th>
                      <th className="p-4">
                        Tenant
                      </th>
                      <th className="p-4">
                        Order / Booking
                      </th>
                      <th className="p-4">
                        Customer
                      </th>
                      <th className="p-4">
                        Status
                      </th>
                      <th className="p-4">
                        Payment
                      </th>
                      <th className="p-4 text-right">
                        Total
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-neutral-800 text-xs">
                    {recentOrders
                      .slice(
                        0,
                        100
                      )
                      .map(
                        (row) => (
                          <tr
                            key={`${row.module}-${row.id}`}
                          >
                            <td className="p-4 font-black uppercase text-neutral-400">
                              {row.module}
                            </td>

                            <td className="p-4 font-bold text-white">
                              {row.restaurant_name ||
                                'Tenant'}
                            </td>

                            <td className="p-4 font-mono text-[10px] text-neutral-400">
                              {row.order_code ||
                                row.id}
                            </td>

                            <td className="p-4 text-neutral-300">
                              {row.customer_name ||
                                '—'}
                            </td>

                            <td className="p-4">
                              <StatusPill
                                value={
                                  row.status
                                }
                              />
                            </td>

                            <td className="p-4">
                              <StatusPill
                                value={
                                  row.payment_status ||
                                  row.payment_method
                                }
                              />
                            </td>

                            <td className="p-4 text-right font-black text-white">
                              {money(
                                row.total_amount
                              )}
                            </td>
                          </tr>
                        )
                      )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {section ===
            'people' && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-400">
                People
              </p>

              <h1 className="mt-1 text-2xl font-black text-white">
                Users & Staff
              </h1>

              <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
                <Metric
                  label="Registered Users"
                  value={
                    summary.authUsers ||
                    0
                  }
                />

                <Metric
                  label="Staff Accounts"
                  value={
                    summary.staff ||
                    0
                  }
                />

                <Metric
                  label="Drivers"
                  value={
                    summary.drivers ||
                    0
                  }
                />

                <Metric
                  label="Packers"
                  value={
                    summary.packers ||
                    0
                  }
                />
              </div>

              <div className="mt-5 rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                <h2 className="text-sm font-black text-white">
                  Staff Directory
                </h2>

                <p className="mt-1 text-[10px] text-neutral-500">
                  Passwords are intentionally never returned to this dashboard.
                </p>

                <div className="mt-4 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                  {(data?.staff ||
                    [])
                    .slice(
                      0,
                      150
                    )
                    .map(
                      (row) => (
                        <div
                          key={
                            row.id
                          }
                          className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3"
                        >
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-xs font-black text-white">
                                {row.name ||
                                  row.user_id ||
                                  'Staff'}
                              </p>

                              <p className="mt-1 text-[9px] uppercase text-neutral-500">
                                {row.role ||
                                  'staff'}
                              </p>
                            </div>

                            <StatusPill
                              value={
                                row.is_active
                                  ? 'active'
                                  : 'inactive'
                              }
                            />
                          </div>
                        </div>
                      )
                    )}
                </div>
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                  <h2 className="text-sm font-black text-white">
                    Delivery Drivers
                  </h2>

                  <p className="mt-1 text-[10px] text-neutral-500">
                    Enable or disable Driver access from the ERP.
                  </p>

                  <div className="mt-4 space-y-2">
                    {!(data?.drivers || []).length ? (
                      <Empty>
                        No Delivery drivers found.
                      </Empty>
                    ) : (
                      data.drivers.slice(0, 100).map(
                        (worker) => (
                          <div
                            key={worker.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-950 p-3"
                          >
                            <div>
                              <p className="text-xs font-black text-white">
                                {worker.name || 'Driver'}
                              </p>

                              <p className="mt-1 text-[9px] text-neutral-600">
                                {worker.mobile || 'No mobile'}
                              </p>
                            </div>

                            <button
                              type="button"
                              disabled={actionLoading}
                              onClick={() =>
                                action({
                                  action:
                                    'set_worker_active',
                                  workerType:
                                    'driver',
                                  workerId:
                                    worker.id,
                                  active:
                                    !worker.is_active,
                                })
                              }
                              className={`rounded-lg px-3 py-2 text-[9px] font-black text-white ${
                                worker.is_active
                                  ? 'bg-red-600'
                                  : 'bg-emerald-600'
                              }`}
                            >
                              {worker.is_active
                                ? 'Disable'
                                : 'Enable'}
                            </button>
                          </div>
                        )
                      )
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                  <h2 className="text-sm font-black text-white">
                    Delivery Packers
                  </h2>

                  <p className="mt-1 text-[10px] text-neutral-500">
                    Enable or disable Packer access from the ERP.
                  </p>

                  <div className="mt-4 space-y-2">
                    {!(data?.packers || []).length ? (
                      <Empty>
                        No Delivery packers found.
                      </Empty>
                    ) : (
                      data.packers.slice(0, 100).map(
                        (worker) => (
                          <div
                            key={worker.id}
                            className="flex items-center justify-between gap-3 rounded-xl border border-neutral-800 bg-neutral-950 p-3"
                          >
                            <div>
                              <p className="text-xs font-black text-white">
                                {worker.name || 'Packer'}
                              </p>

                              <p className="mt-1 text-[9px] text-neutral-600">
                                {worker.mobile || 'No mobile'}
                              </p>
                            </div>

                            <button
                              type="button"
                              disabled={actionLoading}
                              onClick={() =>
                                action({
                                  action:
                                    'set_worker_active',
                                  workerType:
                                    'packer',
                                  workerId:
                                    worker.id,
                                  active:
                                    !worker.is_active,
                                })
                              }
                              className={`rounded-lg px-3 py-2 text-[9px] font-black text-white ${
                                worker.is_active
                                  ? 'bg-red-600'
                                  : 'bg-emerald-600'
                              }`}
                            >
                              {worker.is_active
                                ? 'Disable'
                                : 'Enable'}
                            </button>
                          </div>
                        )
                      )
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {section ===
            'inventory' && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-400">
                Inventory
              </p>

              <h1 className="mt-1 text-2xl font-black text-white">
                Stock Risk Monitor
              </h1>

              <div className="mt-5">
                {!(
                  data?.lowStock ||
                  []
                ).length ? (
                  <Empty>
                    No low-stock items detected.
                  </Empty>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {data.lowStock.map(
                      (row) => {
                        const available =
                          Math.max(
                            0,
                            Number(
                              row.stock_quantity ||
                                0
                            ) -
                              Number(
                                row.reserved_quantity ||
                                  0
                              )
                          )

                        return (
                          <article
                            key={
                              row.id
                            }
                            className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4"
                          >
                            <p className="text-sm font-black text-white">
                              {row.name}
                            </p>

                            <p className="mt-1 text-[9px] text-neutral-500">
                              {row.category ||
                                'Other'}
                            </p>

                            <div className="mt-3 flex items-end justify-between gap-3">
                              <div>
                                <p className="text-[9px] uppercase text-neutral-600">
                                  Available
                                </p>

                                <p className="mt-1 text-xl font-black text-amber-400">
                                  {available}
                                </p>
                              </div>

                              <p className="text-[9px] text-neutral-500">
                                Threshold{' '}
                                {row.low_stock_threshold}
                              </p>
                            </div>

                            <button
                              type="button"
                              disabled={
                                actionLoading
                              }
                              onClick={async () => {
                                const raw =
                                  window.prompt(
                                    `Add stock for ${row.name}:`,
                                    '1'
                                  )

                                if (raw === null) {
                                  return
                                }

                                const quantity =
                                  Number(
                                    String(raw).trim()
                                  )

                                if (
                                  !Number.isInteger(quantity) ||
                                  quantity <= 0
                                ) {
                                  window.alert(
                                    'Enter a positive whole-number quantity.'
                                  )
                                  return
                                }

                                await action({
                                  action:
                                    'restock_inventory',
                                  restaurantId:
                                    row.restaurant_id,
                                  itemId:
                                    row.id,
                                  quantity,
                                })
                              }}
                              className="mt-3 w-full rounded-xl bg-emerald-600 px-3 py-2.5 text-[9px] font-black text-white disabled:opacity-50"
                            >
                              Restock Item
                            </button>
                          </article>
                        )
                      }
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {section ===
            'live-support' && (
            <div>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-400">
                    Admin Live Support
                  </p>

                  <h1 className="mt-1 text-2xl font-black text-white">
                    Restaurant / Manager Live Chat
                  </h1>

                  <p className="mt-2 max-w-3xl text-xs leading-5 text-neutral-500">
                    Accept support requests raised from Restaurant/Manager portals and reply from the ERP. This is separate from the customer Delivery Help Centre.
                  </p>
                </div>

                <button
                  type="button"
                  disabled={
                    liveSupportLoading
                  }
                  onClick={() =>
                    loadLiveSupport(
                      selectedLiveSupport?.id ||
                        ''
                    )
                  }
                  className="rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-[10px] font-black text-neutral-300 disabled:opacity-50"
                >
                  {liveSupportLoading
                    ? 'Refreshing...'
                    : 'Refresh Live Support'}
                </button>
              </div>

              <div className="mt-5 grid grid-cols-3 gap-3">
                <Metric
                  label="Pending"
                  value={
                    liveSupportCounts.pending ||
                    0
                  }
                />

                <Metric
                  label="Connected"
                  value={
                    liveSupportCounts.connected ||
                    0
                  }
                />

                <Metric
                  label="Total Sessions"
                  value={
                    liveSupportCounts.total ||
                    0
                  }
                />
              </div>

              {liveSupportError && (
                <div className="mt-4 rounded-2xl border border-red-500/25 bg-red-500/10 px-4 py-3 text-xs font-bold leading-5 text-red-300">
                  {liveSupportError}
                </div>
              )}

              <div className="mt-5 grid min-h-[620px] gap-4 xl:grid-cols-[360px_minmax(0,1fr)]">
                <aside className="overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900">
                  <div className="border-b border-neutral-800 p-4">
                    <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500">
                      Live Support Inbox
                    </p>

                    <p className="mt-1 text-sm font-black text-white">
                      Support Requests
                    </p>
                  </div>

                  <div className="max-h-[650px] space-y-2 overflow-y-auto p-3">
                    {!liveSupportSessions.length ? (
                      <Empty>
                        No Live Support sessions yet.
                      </Empty>
                    ) : (
                      liveSupportSessions.map(
                        (session) => {
                          const active =
                            String(
                              selectedLiveSupport?.id ||
                                ''
                            ) ===
                            String(
                              session.id
                            )

                          return (
                            <button
                              key={
                                session.id
                              }
                              type="button"
                              onClick={() =>
                                openLiveSupport(
                                  session
                                )
                              }
                              className={`w-full rounded-2xl border p-3 text-left transition ${
                                active
                                  ? 'border-red-500/50 bg-red-500/10'
                                  : 'border-neutral-800 bg-neutral-950 hover:border-neutral-700'
                              }`}
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-xs font-black text-white">
                                    {session.restaurant_name ||
                                      'Restaurant'}
                                  </p>

                                  <p className="mt-1 font-mono text-[9px] text-neutral-600">
                                    {session.restaurant_code ||
                                      '-----'}
                                  </p>
                                </div>

                                <StatusPill
                                  value={
                                    session.status
                                  }
                                />
                              </div>

                              {session.issue_category && (
                                <p className="mt-2 line-clamp-1 text-[9px] font-bold text-amber-400">
                                  {session.issue_category}
                                </p>
                              )}

                              <p className="mt-2 text-[8px] text-neutral-600">
                                Requested{' '}
                                {formatDate(
                                  session.requested_at
                                )}
                              </p>
                            </button>
                          )
                        }
                      )
                    )}
                  </div>
                </aside>

                <section className="flex min-h-[620px] flex-col overflow-hidden rounded-3xl border border-neutral-800 bg-neutral-900">
                  {!selectedLiveSupport ? (
                    <div className="flex flex-1 items-center justify-center p-8">
                      <div className="max-w-sm text-center">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-neutral-950 text-xl">
                          💬
                        </div>

                        <h2 className="mt-4 text-lg font-black text-white">
                          Select a support request
                        </h2>

                        <p className="mt-2 text-xs leading-6 text-neutral-500">
                          Pending and connected Restaurant/Manager support sessions appear in the inbox automatically.
                        </p>
                      </div>
                    </div>
                  ) : (
                    <>
                      <header className="border-b border-neutral-800 p-4 sm:p-5">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="text-lg font-black text-white">
                              {selectedLiveSupport.restaurant_name ||
                                'Restaurant'}
                            </p>

                            <p className="mt-1 font-mono text-[9px] text-neutral-500">
                              {selectedLiveSupport.restaurant_code ||
                                '-----'}
                              {' · '}
                              {selectedLiveSupport.id}
                            </p>

                            <div className="mt-2">
                              <StatusPill
                                value={
                                  selectedLiveSupport.status
                                }
                              />
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-2">
                            {selectedLiveSupport.status ===
                              'pending' && (
                              <button
                                type="button"
                                disabled={
                                  liveSupportActionLoading
                                }
                                onClick={
                                  acceptLiveSupport
                                }
                                className="rounded-xl bg-emerald-600 px-4 py-2.5 text-[10px] font-black text-white disabled:opacity-50"
                              >
                                Accept Chat
                              </button>
                            )}

                            {selectedLiveSupport.status !==
                              'closed' && (
                              <button
                                type="button"
                                disabled={
                                  liveSupportActionLoading
                                }
                                onClick={
                                  closeLiveSupport
                                }
                                className="rounded-xl bg-red-600 px-4 py-2.5 text-[10px] font-black text-white disabled:opacity-50"
                              >
                                Close Chat
                              </button>
                            )}
                          </div>
                        </div>

                        {selectedLiveSupport.ai_summary && (
                          <div className="mt-4 rounded-2xl border border-violet-500/20 bg-violet-500/10 p-3">
                            <p className="text-[9px] font-black uppercase tracking-wider text-violet-300">
                              AI Escalation Summary
                            </p>

                            <p className="mt-2 whitespace-pre-wrap text-[10px] leading-5 text-violet-100/80">
                              {selectedLiveSupport.ai_summary}
                            </p>
                          </div>
                        )}
                      </header>

                      <div className="flex-1 space-y-2 overflow-y-auto bg-neutral-950/40 p-4 sm:p-5">
                        {!liveSupportMessages.length ? (
                          <div className="py-12 text-center text-xs text-neutral-600">
                            No chat messages yet.
                          </div>
                        ) : (
                          liveSupportMessages.map(
                            (message) => {
                              const adminMessage =
                                String(
                                  message.sender ||
                                    ''
                                ).toLowerCase() ===
                                'admin'

                              return (
                                <div
                                  key={
                                    message.id
                                  }
                                  className={`flex ${
                                    adminMessage
                                      ? 'justify-end'
                                      : 'justify-start'
                                  }`}
                                >
                                  <div
                                    className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                                      adminMessage
                                        ? 'bg-red-600 text-white'
                                        : 'border border-neutral-800 bg-neutral-900 text-neutral-200'
                                    }`}
                                  >
                                    <p className="whitespace-pre-wrap text-xs leading-5">
                                      {message.message}
                                    </p>

                                    <p
                                      className={`mt-1 text-[8px] font-bold ${
                                        adminMessage
                                          ? 'text-red-200'
                                          : 'text-neutral-600'
                                      }`}
                                    >
                                      {adminMessage
                                        ? 'Admin'
                                        : 'Restaurant / Manager'}
                                      {' · '}
                                      {formatDate(
                                        message.created_at
                                      )}
                                    </p>
                                  </div>
                                </div>
                              )
                            }
                          )
                        )}
                      </div>

                      <div className="border-t border-neutral-800 p-4">
                        {selectedLiveSupport.status ===
                        'connected' ? (
                          <form
                            onSubmit={
                              sendLiveSupportReply
                            }
                            className="flex gap-2"
                          >
                            <textarea
                              rows={2}
                              value={
                                liveSupportReply
                              }
                              onChange={(
                                event
                              ) =>
                                setLiveSupportReply(
                                  event.target.value.slice(
                                    0,
                                    2000
                                  )
                                )
                              }
                              placeholder="Reply to Restaurant / Manager..."
                              className="min-h-[52px] flex-1 resize-none rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-xs text-white outline-none focus:border-red-500"
                            />

                            <button
                              type="submit"
                              disabled={
                                liveSupportActionLoading ||
                                !liveSupportReply.trim()
                              }
                              className="rounded-xl bg-red-600 px-5 py-3 text-[10px] font-black text-white disabled:opacity-50"
                            >
                              Send
                            </button>
                          </form>
                        ) : selectedLiveSupport.status ===
                          'pending' ? (
                          <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-[10px] font-bold text-amber-300">
                            Accept this request before replying.
                          </div>
                        ) : (
                          <div className="rounded-xl border border-neutral-800 bg-neutral-950 px-4 py-3 text-[10px] font-bold text-neutral-500">
                            This Live Support chat is closed.
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </section>
              </div>
            </div>
          )}

          {section ===
            'support' && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-400">
                Help Centre
              </p>

              <h1 className="mt-1 text-2xl font-black text-white">
                Customer Requests & Return Pickups
              </h1>

              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                  <h2 className="text-sm font-black text-white">
                    Delivery Help Centre
                  </h2>

                  <div className="mt-4 space-y-2">
                    {!supportThreads.length ? (
                      <Empty>
                        No Help Centre threads.
                      </Empty>
                    ) : (
                      supportThreads
                        .slice(
                          0,
                          100
                        )
                        .map(
                          (thread) => (
                            <div
                              key={
                                thread.id
                              }
                              className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-mono text-[10px] font-black text-white">
                                    {thread.thread_code ||
                                      thread.id}
                                  </p>

                                  <p className="mt-1 text-[10px] font-bold text-neutral-400">
                                    {thread.restaurant_name}
                                  </p>

                                  <p className="mt-1 text-[9px] text-neutral-600">
                                    {thread.customer_name ||
                                      'Customer'}{' '}
                                    ·{' '}
                                    {thread.customer_mobile ||
                                      '—'}
                                  </p>
                                </div>

                                <StatusPill
                                  value={
                                    thread.status
                                  }
                                />
                              </div>

                              <button
                                type="button"
                                disabled={
                                  actionLoading
                                }
                                onClick={() =>
                                  action({
                                    action:
                                      'set_support_status',
                                    threadId:
                                      thread.id,
                                    status:
                                      thread.status ===
                                      'open'
                                        ? 'closed'
                                        : 'open',
                                  })
                                }
                                className="mt-3 rounded-lg border border-neutral-800 px-3 py-2 text-[9px] font-black text-neutral-300"
                              >
                                {thread.status ===
                                'open'
                                  ? 'Close Thread'
                                  : 'Reopen Thread'}
                              </button>
                            </div>
                          )
                        )
                    )}
                  </div>
                </div>

                <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                  <h2 className="text-sm font-black text-white">
                    Return Pickups
                  </h2>

                  <div className="mt-4 space-y-2">
                    {!(
                      data?.returnPickups ||
                      []
                    ).length ? (
                      <Empty>
                        No return pickups.
                      </Empty>
                    ) : (
                      data.returnPickups
                        .slice(
                          0,
                          100
                        )
                        .map(
                          (pickup) => (
                            <div
                              key={
                                pickup.id
                              }
                              className="rounded-2xl border border-neutral-800 bg-neutral-950 p-3"
                            >
                              <div className="flex items-start justify-between gap-3">
                                <div>
                                  <p className="font-mono text-[10px] font-black text-white">
                                    {pickup.pickup_code ||
                                      pickup.id}
                                  </p>

                                  <p className="mt-1 text-[10px] font-bold text-neutral-400">
                                    {pickup.restaurant_name}
                                  </p>

                                  <p className="mt-1 text-[9px] text-neutral-600">
                                    {pickup.customer_name ||
                                      'Customer'}
                                  </p>
                                </div>

                                <StatusPill
                                  value={
                                    pickup.status
                                  }
                                />
                              </div>
                            </div>
                          )
                        )
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {section ===
            'reviews' && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-400">
                Customer Voice
              </p>

              <h1 className="mt-1 text-2xl font-black text-white">
                Verified Product Reviews
              </h1>

              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {!reviews.length ? (
                  <div className="md:col-span-2 xl:col-span-3">
                    <Empty>
                      No verified product reviews yet.
                    </Empty>
                  </div>
                ) : (
                  reviews.map(
                    (review) => (
                      <article
                        key={
                          review.id
                        }
                        className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-black text-white">
                              {review.product_name ||
                                'Product'}
                            </p>

                            <p className="mt-1 text-amber-400">
                              {'★'.repeat(
                                Math.max(
                                  0,
                                  Math.min(
                                    5,
                                    Number(
                                      review.rating ||
                                        0
                                    )
                                  )
                                )
                              )}
                            </p>
                          </div>

                          <StatusPill
                            value={
                              review.is_visible
                                ? 'active'
                                : 'inactive'
                            }
                          />
                        </div>

                        {review.review_text && (
                          <p className="mt-3 text-xs leading-5 text-neutral-400">
                            “{review.review_text}”
                          </p>
                        )}

                        <p className="mt-3 text-[9px] text-neutral-600">
                          {review.customer_display_name ||
                            'Verified customer'}{' '}
                          ·{' '}
                          {formatDate(
                            review.created_at
                          )}
                        </p>

                        <button
                          type="button"
                          disabled={
                            actionLoading
                          }
                          onClick={() =>
                            action({
                              action:
                                'set_review_visibility',
                              reviewId:
                                review.id,
                              visible:
                                !review.is_visible,
                            })
                          }
                          className="mt-3 rounded-lg border border-neutral-800 px-3 py-2 text-[9px] font-black text-neutral-300"
                        >
                          {review.is_visible
                            ? 'Hide Review'
                            : 'Show Review'}
                        </button>
                      </article>
                    )
                  )
                )}
              </div>
            </div>
          )}

          {section ===
            'payments' && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-400">
                Payments
              </p>

              <h1 className="mt-1 text-2xl font-black text-white">
                Gateway Readiness
              </h1>

              <p className="mt-2 max-w-3xl text-xs leading-5 text-neutral-500">
                Admin can verify which tenant/module gateways are configured. Secret keys are never returned to the browser.
              </p>

              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {!(
                  data?.gateways ||
                  []
                ).length ? (
                  <div className="md:col-span-2 xl:col-span-3">
                    <Empty>
                      No payment gateway configurations found.
                    </Empty>
                  </div>
                ) : (
                  data.gateways.map(
                    (gateway) => (
                      <div
                        key={
                          gateway.id
                        }
                        className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-sm font-black uppercase text-white">
                              {gateway.module ||
                                'module'}
                            </p>

                            <p className="mt-1 text-[9px] uppercase text-neutral-500">
                              {gateway.provider ||
                                'provider'}
                            </p>
                          </div>

                          <StatusPill
                            value={
                              gateway.is_enabled
                                ? 'active'
                                : 'inactive'
                            }
                          />
                        </div>

                        <p className="mt-3 font-mono text-[10px] text-neutral-400">
                          {gateway.key_id_masked ||
                            'Key ID not configured'}
                        </p>

                        <button
                          type="button"
                          disabled={
                            actionLoading
                          }
                          onClick={() =>
                            action({
                              action:
                                'set_gateway_enabled',
                              gatewayId:
                                gateway.id,
                              enabled:
                                !gateway.is_enabled,
                            })
                          }
                          className={`mt-3 w-full rounded-xl px-3 py-2.5 text-[9px] font-black text-white ${
                            gateway.is_enabled
                              ? 'bg-red-600'
                              : 'bg-emerald-600'
                          }`}
                        >
                          {gateway.is_enabled
                            ? 'Disable Gateway'
                            : 'Enable Gateway'}
                        </button>
                      </div>
                    )
                  )
                )}
              </div>
            </div>
          )}

          {section ===
            'system' && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-400">
                System
              </p>

              <h1 className="mt-1 text-2xl font-black text-white">
                Platform Control & Health
              </h1>

              <div className="mt-5 grid gap-4 xl:grid-cols-2">
                <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500">
                        Public Website
                      </p>

                      <h2 className="mt-1 text-lg font-black text-white">
                        Website Status
                      </h2>
                    </div>

                    <StatusPill
                      value={
                        data?.platform
                          ?.websiteStatus ||
                        'Working'
                      }
                    />
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={
                        actionLoading
                      }
                      onClick={() =>
                        action({
                          action:
                            'set_website_status',
                          status:
                            'Working',
                        })
                      }
                      className="rounded-xl bg-emerald-600 px-4 py-3 text-xs font-black text-white"
                    >
                      Working
                    </button>

                    <button
                      type="button"
                      disabled={
                        actionLoading
                      }
                      onClick={() =>
                        action({
                          action:
                            'set_website_status',
                          status:
                            'Not Working',
                        })
                      }
                      className="rounded-xl bg-red-600 px-4 py-3 text-xs font-black text-white"
                    >
                      Not Working
                    </button>
                  </div>
                </div>

                <div className="rounded-3xl border border-neutral-800 bg-neutral-900 p-5">
                  <p className="text-[9px] font-black uppercase tracking-wider text-neutral-500">
                    PWA Architecture
                  </p>

                  <h2 className="mt-1 text-lg font-black text-white">
                    Installed Application
                  </h2>

                  <div className="mt-4 rounded-2xl bg-neutral-950 p-4 font-mono text-xs text-emerald-400">
                    <p>
                      start_url: /app
                    </p>
                    <p className="mt-2">
                      scope: /app/
                    </p>
                  </div>

                  <p className="mt-3 text-[10px] leading-5 text-neutral-500">
                    This matches the latest architecture: physical app/app/ contains the installed application portals, while the root app/ routes remain the website.
                  </p>
                </div>
              </div>
            </div>
          )}

          {section ===
            'audit' && (
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-red-400">
                Accountability
              </p>

              <h1 className="mt-1 text-2xl font-black text-white">
                Admin Audit Log
              </h1>

              <div className="mt-5 space-y-2">
                {!(
                  data?.auditLogs ||
                  []
                ).length ? (
                  <Empty>
                    No Admin actions recorded yet.
                  </Empty>
                ) : (
                  data.auditLogs.map(
                    (row) => (
                      <div
                        key={
                          row.id
                        }
                        className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4"
                      >
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                          <div>
                            <p className="text-xs font-black text-white">
                              {label(
                                row.action
                              )}
                            </p>

                            <p className="mt-1 font-mono text-[9px] text-neutral-500">
                              {row.entity_type}:{' '}
                              {row.entity_id ||
                                'platform'}
                            </p>
                          </div>

                          <div className="text-left sm:text-right">
                            <p className="text-[9px] font-bold text-neutral-400">
                              {row.actor_email ||
                                'Admin'}
                            </p>

                            <p className="mt-1 text-[9px] text-neutral-600">
                              {formatDate(
                                row.created_at
                              )}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  )
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {tenantEditor && (
        <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/70 p-0 backdrop-blur-sm sm:items-center sm:p-4">
          <div className="max-h-[94dvh] w-full max-w-lg overflow-y-auto rounded-t-[30px] border border-neutral-800 bg-neutral-950 p-5 shadow-2xl sm:rounded-[30px]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[9px] font-black uppercase tracking-wider text-red-400">
                  Tenant Access
                </p>

                <h2 className="mt-1 text-xl font-black text-white">
                  {tenantEditor.name ||
                    'Tenant'}
                </h2>

                <p className="mt-1 font-mono text-[9px] text-neutral-600">
                  {tenantEditor.restaurant_code ||
                    tenantEditor.id}
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setTenantEditor(
                    null
                  )
                }
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-neutral-800 text-neutral-400"
              >
                ✕
              </button>
            </div>

            <div className="mt-5 space-y-4">
              <label className="block">
                <span className="mb-2 block text-[9px] font-black uppercase tracking-wider text-neutral-500">
                  Plan / Module Access
                </span>

                <select
                  value={
                    tenantEditor.planCode
                  }
                  onChange={(
                    event
                  ) =>
                    setTenantEditor(
                      (
                        current
                      ) => ({
                        ...current,
                        planCode:
                          event.target.value,
                      })
                    )
                  }
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-xs text-white outline-none"
                >
                  {PLAN_OPTIONS.map(
                    ([
                      value,
                      optionLabel,
                    ]) => (
                      <option
                        key={
                          value
                        }
                        value={
                          value
                        }
                      >
                        {optionLabel}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-[9px] font-black uppercase tracking-wider text-neutral-500">
                  Subscription Status
                </span>

                <select
                  value={
                    tenantEditor.subscriptionStatus
                  }
                  onChange={(
                    event
                  ) =>
                    setTenantEditor(
                      (
                        current
                      ) => ({
                        ...current,
                        subscriptionStatus:
                          event.target.value,
                      })
                    )
                  }
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-xs text-white outline-none"
                >
                  {STATUS_OPTIONS.map(
                    (value) => (
                      <option
                        key={
                          value
                        }
                        value={
                          value
                        }
                      >
                        {label(
                          value
                        )}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-[9px] font-black uppercase tracking-wider text-neutral-500">
                  Billing Cycle
                </span>

                <select
                  value={
                    tenantEditor.billingCycle
                  }
                  onChange={(
                    event
                  ) =>
                    setTenantEditor(
                      (
                        current
                      ) => ({
                        ...current,
                        billingCycle:
                          event.target.value,
                      })
                    )
                  }
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-xs text-white outline-none"
                >
                  {BILLING_OPTIONS.map(
                    (value) => (
                      <option
                        key={
                          value
                        }
                        value={
                          value
                        }
                      >
                        {value}
                      </option>
                    )
                  )}
                </select>
              </label>

              <label className="block">
                <span className="mb-2 block text-[9px] font-black uppercase tracking-wider text-neutral-500">
                  Subscription Expiry
                </span>

                <input
                  type="date"
                  value={
                    tenantEditor.subscriptionExpiresAt ||
                    ''
                  }
                  onChange={(
                    event
                  ) =>
                    setTenantEditor(
                      (
                        current
                      ) => ({
                        ...current,
                        subscriptionExpiresAt:
                          event.target.value,
                      })
                    )
                  }
                  className="w-full rounded-xl border border-neutral-800 bg-neutral-900 px-4 py-3 text-xs text-white outline-none"
                />
              </label>

              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-[10px] leading-5 text-amber-200">
                Changing the plan updates Restaurant / Delivery / Resort module flags together. Setting status to suspended, expired or inactive removes access from the current plan-aware application resolver.
              </div>

              <button
                type="button"
                disabled={
                  actionLoading
                }
                onClick={
                  saveTenant
                }
                className="w-full rounded-xl bg-red-600 px-5 py-4 text-xs font-black text-white disabled:opacity-50"
              >
                {actionLoading
                  ? 'Saving...'
                  : 'Save Access & Subscription'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}