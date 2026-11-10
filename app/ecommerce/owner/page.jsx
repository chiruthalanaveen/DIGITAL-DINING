
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import OwnerProductManagement from './OwnerProductManagement'
import OwnerWebsiteDesign from './OwnerWebsiteDesign'

const money = value =>
  `₹${(Number(value || 0) / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`

const card =
  'rounded-2xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5'

const button =
  'rounded-xl border border-neutral-700 px-4 py-2 text-sm font-semibold hover:bg-neutral-800 disabled:opacity-40'

const tabs = [
  ['overview', 'Overview'],
  ['products', 'Products'],
  ['design', 'Website Design'],
  ['orders', 'Orders'],
  ['wallet', 'Wallet'],
  ['settings', 'Website settings'],
]

function uniqueById(items) {
  const seen = new Set()

  return (Array.isArray(items) ? items : []).filter(item => {
    if (!item?.id || seen.has(item.id)) return false
    seen.add(item.id)
    return true
  })
}

export default function EcommerceOwnerDashboard() {
  const router = useRouter()

  const [signingOut, setSigningOut] = useState(false)
  const [data, setData] = useState(null)
  const [selectedId, setSelectedId] = useState('')
  const [tab, setTab] = useState('overview')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const requestId = useRef(0)

  const load = useCallback(
    async (storeId = '') => {
      const currentRequest = ++requestId.current

      setLoading(true)
      setError('')

      try {
        const {
          data: sessionData,
          error: sessionError,
        } = await supabase.auth.getSession()

        if (
          sessionError ||
          !sessionData?.session?.access_token
        ) {
          if (currentRequest === requestId.current) {
            router.replace('/ecommerce/owner/login')
          }
          return
        }

        const query = storeId
          ? `?storeId=${encodeURIComponent(storeId)}`
          : ''

        const response = await fetch(
          `/api/ecommerce/owner/overview${query}`,
          {
            cache: 'no-store',
            headers: {
              Authorization:
                `Bearer ${sessionData.session.access_token}`,
            },
          }
        )

        const body = await response
          .json()
          .catch(() => ({}))

        if (!response.ok || !body.success) {
          throw new Error(
            body.message || 'Unable to load dashboard.'
          )
        }

        if (currentRequest !== requestId.current) return

        // Remove duplicate records only from the client-side
        // response. No database rows are modified.
        const stores = uniqueById(body.stores)
        const overview = body.overview || {}

        const selected =
          stores.find(s => s.id === body.selected?.id) ||
          stores.find(s => s.id === storeId) ||
          stores[0] ||
          null

        // Preserve the server-selected store's details when
        // the matching store is present in the response.
        const selectedStore =
          selected?.id === body.selected?.id
            ? { ...selected, ...body.selected }
            : selected

        setData({
          ...body,
          stores,
          selected: selectedStore,
          overview: {
            ...overview,
            products: uniqueById(overview.products),
            orders: uniqueById(overview.orders),
            transactions: uniqueById(
              overview.transactions
            ),
          },
        })

        setSelectedId(selectedStore?.id || '')
      } catch (err) {
        if (currentRequest === requestId.current) {
          setError(
            err?.message || 'Unable to load dashboard.'
          )
        }
      } finally {
        if (currentRequest === requestId.current) {
          setLoading(false)
        }
      }
    },
    [router]
  )

  useEffect(() => {
    load()

    return () => {
      requestId.current += 1
    }
  }, [load])

  async function logout() {
    if (signingOut) return

    setSigningOut(true)
    setError('')

    try {
      const { error: signOutError } =
        await supabase.auth.signOut()

      if (signOutError) throw signOutError

      requestId.current += 1

      setData(null)
      setSelectedId('')

      router.replace('/ecommerce/owner/login')
      router.refresh()
    } catch (err) {
      setError(
        err?.message || 'Could not sign out.'
      )
      setSigningOut(false)
    }
  }

  const stores = data?.stores || []
  const store = data?.selected
  const overview = data?.overview

  const metrics = overview?.metrics || {}
  const wallet = overview?.wallet

  const orders = overview?.orders || []
  const transactions = overview?.transactions || []

  const productNames = useMemo(
    () =>
      Object.fromEntries(
        (overview?.products || []).map(product => [
          product.id,
          product.name,
        ])
      ),
    [overview]
  )

  function selectStore(nextStoreId) {
    if (!nextStoreId || nextStoreId === selectedId) return

    // Clear the previous website's data before loading the
    // newly selected website.
    setData(null)
    setSelectedId(nextStoreId)

    load(nextStoreId)
  }

  return (
    <main className="min-h-screen bg-neutral-950 px-4 py-6 text-white sm:px-8">
      <div className="mx-auto max-w-7xl space-y-6">

        {/* HEADER */}

        <header className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[.2em] text-red-400">
              Digital Dine-In · E-Commerce
            </p>

            <h1 className="mt-2 text-3xl font-black">
              Owner Dashboard
            </h1>

            <p className="mt-1 text-sm text-neutral-400">
              Manage your assigned websites securely
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              className={button}
              type="button"
              disabled={loading || signingOut}
              onClick={() => load(selectedId)}
            >
              Refresh
            </button>

            <button
              className="rounded-xl bg-red-600 px-4 py-2 text-sm font-bold hover:bg-red-500 disabled:opacity-50"
              type="button"
              disabled={signingOut}
              onClick={logout}
            >
              {signingOut ? 'Signing out…' : 'Logout'}
            </button>
          </div>
        </header>

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-800 bg-red-950/40 p-4 text-sm text-red-200"
          >
            {error}
          </div>
        )}

        {loading && (
          <p className="text-neutral-400">
            Loading your website dashboard…
          </p>
        )}

        {!loading && data && !stores.length && (
          <div className={card}>
            No E-Commerce website is assigned to this account.
            Ask Super Admin to assign your Supabase Auth user
            and approve the website.
          </div>
        )}

        {store && (
          <>
            {/* WEBSITE SELECTION */}

            <div
              className={`${card} flex flex-wrap items-center justify-between gap-4`}
            >
              <div>
                <h2 className="text-xl font-bold">
                  {store.name}
                </h2>

                <p className="mt-1 text-sm text-neutral-400">
                  {store.slug}.digitaldine-in.online
                  {' · '}
                  {store.category}
                </p>

                <p className="mt-2 text-xs text-neutral-400">
                  Approval: {store.approval_status}
                  {' · '}
                  {store.is_active ? 'Active' : 'Inactive'}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <label
                  className="text-xs text-neutral-400"
                  htmlFor="owner-store"
                >
                  Website
                </label>

                <select
                  id="owner-store"
                  value={selectedId}
                  disabled={loading || signingOut}
                  onChange={event =>
                    selectStore(event.target.value)
                  }
                  className="rounded-xl border border-neutral-700 bg-neutral-950 p-3 text-sm"
                >
                  {stores.map(item => (
                    <option
                      key={`owner-store-${item.id}`}
                      value={item.id}
                    >
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* NAVIGATION */}

            <nav
              aria-label="E-Commerce owner sections"
              className="flex gap-2 overflow-x-auto pb-1"
            >
              {tabs.map(([id, label]) => (
                <button
                  key={`owner-tab-${id}`}
                  type="button"
                  onClick={() => setTab(id)}
                  aria-current={
                    tab === id ? 'page' : undefined
                  }
                  className={
                    `whitespace-nowrap rounded-xl px-4 py-3 text-sm font-bold ${
                      tab === id
                        ? 'bg-red-600 text-white'
                        : 'border border-neutral-800 bg-neutral-900 text-neutral-300'
                    }`
                  }
                >
                  {label}
                </button>
              ))}
            </nav>

            {/* OVERVIEW */}

            {tab === 'overview' && (
              <>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {[
                    [
                      'Products (first 100)',
                      metrics.productCountShown,
                    ],
                    [
                      'Orders (latest 100)',
                      metrics.ordersShown,
                    ],
                    [
                      'Awaiting fulfillment (latest 100)',
                      metrics.awaitingFulfillmentShown,
                    ],
                    [
                      'Wallet spendable',
                      wallet
                        ? money(wallet.spendable_paise)
                        : 'Not initialized',
                    ],
                  ].map(([label, value]) => (
                    <div
                      key={`metric-${label}`}
                      className={card}
                    >
                      <p className="text-xs text-neutral-400">
                        {label}
                      </p>

                      <p className="mt-3 text-2xl font-black">
                        {value ?? '—'}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="grid gap-4 lg:grid-cols-2">
                  <section className={card}>
                    <h3 className="mb-4 text-lg font-bold">
                      Recent orders
                    </h3>

                    {orders.slice(0, 6).map(order => (
                      <div
                        key={`recent-order-${order.id}`}
                        className="flex justify-between gap-3 border-t border-neutral-800 py-3 text-sm"
                      >
                        <span className="truncate">
                          #{order.id.slice(0, 8)}
                          {' · '}
                          {order.order_status}
                        </span>

                        <span>
                          {money(order.total_paise)}
                        </span>
                      </div>
                    ))}

                    {!orders.length && (
                      <p className="text-neutral-400">
                        No orders yet.
                      </p>
                    )}
                  </section>

                  <section className={card}>
                    <h3 className="mb-4 text-lg font-bold">
                      Inventory overview
                    </h3>

                    <p className="text-neutral-300">
                      Active products (first 100):{' '}
                      {metrics.activeProductsShown}
                    </p>

                    <p className="mt-2 text-neutral-300">
                      Low-stock variants (first 1000):{' '}
                      {metrics.lowStockVariantsShown}
                    </p>

                    <p className="mt-4 text-xs text-neutral-500">
                      Counts are limited to the loaded
                      records, not lifetime totals.
                    </p>
                  </section>
                </div>
              </>
            )}

            {/* PRODUCT MANAGEMENT */}

            {tab === 'products' && (
              <OwnerProductManagement
                key={`product-management-${selectedId}`}
                storeId={selectedId}
                storeCategory={store.category}
                onChanged={() => load(selectedId)}
              />
            )}

            {/* WEBSITE DESIGN */}

            {tab === 'design' && (
              <OwnerWebsiteDesign
                key={`website-design-${selectedId}`}
                storeId={selectedId}
                storeName={store.name}
                storeSlug={store.slug}
              />
            )}

            {/* ORDERS */}

            {tab === 'orders' && (
              <section className={card}>
                <h3 className="text-lg font-bold">
                  Orders
                </h3>

                <p className="mb-4 text-sm text-neutral-400">
                  Latest 100 orders. Order-status updates
                  will be enabled after secure fulfillment
                  rules are implemented.
                </p>

                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="text-neutral-400">
                        {[
                          'Order',
                          'Status',
                          'Payment',
                          'Total',
                          'Created',
                        ].map(label => (
                          <th
                            key={`order-column-${label}`}
                            className="border-b border-neutral-700 p-3"
                          >
                            {label}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody>
                      {orders.map(order => (
                        <tr
                          key={`order-row-${order.id}`}
                        >
                          <td className="border-b border-neutral-800 p-3">
                            {order.id.slice(0, 8)}
                          </td>

                          <td className="border-b border-neutral-800 p-3">
                            {order.order_status}
                          </td>

                          <td className="border-b border-neutral-800 p-3">
                            {order.payment_status}
                          </td>

                          <td className="border-b border-neutral-800 p-3">
                            {money(order.total_paise)}
                          </td>

                          <td className="border-b border-neutral-800 p-3">
                            {new Date(
                              order.created_at
                            ).toLocaleDateString('en-IN')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  {!orders.length && (
                    <p className="p-3 text-neutral-400">
                      No orders yet.
                    </p>
                  )}
                </div>
              </section>
            )}

            {/* WALLET */}

            {tab === 'wallet' && (
              <div className="grid gap-4 lg:grid-cols-2">
                <section className={card}>
                  <h3 className="mb-4 text-lg font-bold">
                    Wallet balance
                  </h3>

                  {wallet ? (
                    <div className="space-y-3 text-sm">
                      <p>
                        Balance:{' '}
                        <strong>
                          {money(wallet.balance_paise)}
                        </strong>
                      </p>

                      <p>
                        Pending fees:{' '}
                        <strong>
                          {money(wallet.pending_fee_paise)}
                        </strong>
                      </p>

                      <p>
                        Spendable:{' '}
                        <strong>
                          {money(wallet.spendable_paise)}
                        </strong>
                      </p>

                      <p>
                        Fee per delivered order:{' '}
                        <strong>
                          {money(wallet.platform_fee_paise)}
                        </strong>
                      </p>

                      <p>
                        Order block threshold:{' '}
                        <strong>
                          {money(
                            wallet.order_block_threshold_paise
                          )}
                        </strong>
                      </p>

                      <p>
                        Minimum top-up:{' '}
                        <strong>
                          {money(wallet.min_topup_paise)}
                        </strong>
                      </p>
                    </div>
                  ) : (
                    <p className="text-neutral-400">
                      Wallet not initialized.
                      Contact Super Admin.
                    </p>
                  )}

                  <p className="mt-4 text-xs text-neutral-500">
                    Read-only. Top-up integration is not
                    yet enabled.
                  </p>
                </section>

                <section className={card}>
                  <h3 className="mb-4 text-lg font-bold">
                    Recent wallet activity
                  </h3>

                  {transactions.map(transaction => (
                    <div
                      key={`wallet-transaction-${transaction.id}`}
                      className="flex justify-between gap-2 border-t border-neutral-800 py-3 text-sm"
                    >
                      <span>
                        {transaction.transaction_type}
                      </span>

                      <span>
                        {money(transaction.amount_paise)}
                      </span>
                    </div>
                  ))}

                  {!transactions.length && (
                    <p className="text-neutral-400">
                      No transactions yet.
                    </p>
                  )}
                </section>
              </div>
            )}

            {/* WEBSITE SETTINGS */}

            {tab === 'settings' && (
              <section className={card}>
                <h3 className="text-lg font-bold">
                  Website settings
                </h3>

                <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                  {[
                    ['Website', store.name],
                    ['Slug', store.slug],
                    ['Category', store.category],
                    ['Theme', store.theme],
                    ['Payments', store.payment_mode],
                    ['Fulfillment', store.fulfillment_mode],
                    ['Approval', store.approval_status],
                    ['Active', String(store.is_active)],
                  ].map(([label, value]) => (
                    <div
                      key={`website-setting-${label}`}
                      className="rounded-xl bg-neutral-950 p-3"
                    >
                      <p className="text-xs text-neutral-500">
                        {label}
                      </p>

                      <p className="mt-1 font-semibold">
                        {value ?? '—'}
                      </p>
                    </div>
                  ))}
                </div>

                <p className="mt-4 text-xs text-neutral-400">
                  Settings are read-only until owner-scoped
                  update APIs are available.
                </p>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  )
}
