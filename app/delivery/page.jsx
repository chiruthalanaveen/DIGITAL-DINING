'use client'
// VS Code: app/delivery/page.jsx
// Digital Dine-In: one app shell for all eligible stores and their complete catalogs.
// Keep marketplace mounted when viewing a store so Back does not repeat GPS discovery.
import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import DeliveryAppAuthGate from '@/app/components/DeliveryAppAuthGate'
import DeliveryMarketplaceHome from '@/app/components/DeliveryMarketplaceHome'
import DeliveryStoreExperience from '@/app/components/DeliveryStoreExperience'
import DeliveryAccountCenter from '@/app/components/DeliveryAccountCenter'
import '@/app/components/delivery-green-market.css'

const STORE_CODE = /^[A-Za-z0-9_-]{1,80}$/

function DeliveryContent() {
  const router = useRouter()
  const params = useSearchParams()
  const rawStore = String(params?.get('store') || '').trim()
  const selectedStore = STORE_CODE.test(rawStore) ? rawStore : ''
  const invalidStore = Boolean(rawStore) && !selectedStore
  const view = String(params?.get('view') || '')
  const appView = !selectedStore && ['orders', 'account'].includes(view) ? view : ''

  // Retain the nearby store list when a store is selected and opened.
  // When entering through a store deep-link, defer GPS until visiting Home.
  const [hasMountedMarketplace, setHasMountedMarketplace] = useState(
    () => !selectedStore && !appView && !invalidStore
  )
  useEffect(() => {
    if (!selectedStore && !appView && !invalidStore) setHasMountedMarketplace(true)
  }, [selectedStore, appView, invalidStore])

  const goHome = () => router.push('/delivery', { scroll: false })
  const intended = selectedStore
    ? `/delivery?store=${encodeURIComponent(selectedStore)}`
    : appView ? `/delivery?view=${appView}` : '/delivery'

  return (
    <DeliveryAppAuthGate nextPath={intended}>
      {invalidStore ? (
        <main className="min-h-[100dvh] bg-white p-8 text-center text-slate-900">
          <h1 className="text-lg font-bold">Invalid store link</h1>
          <button type="button" className="mt-5 rounded-xl bg-emerald-600 px-5 py-3 text-white" onClick={goHome}>
            Back to Digital Dine-In
          </button>
        </main>
      ) : (
        <>
          {/* Retain GPS position, store search and listings during store browsing.
              The selected store still owns its own complete product catalog, cart
              and checkout logic; we do NOT reuse the marketplace's 4-item preview. */}
          {hasMountedMarketplace && (
            <div hidden={Boolean(selectedStore || appView)} aria-hidden={Boolean(selectedStore || appView)}>
              <DeliveryMarketplaceHome />
            </div>
          )}

          {selectedStore && (
            <DeliveryStoreExperience
              key={selectedStore}
              restaurantCode={selectedStore}
              initialView={['orders', 'account'].includes(view) ? view : ''}
              onBackToStores={goHome}
            />
          )}

          {appView && (
            <DeliveryAccountCenter view={appView} onGoHome={goHome} />
          )}
        </>
      )}
    </DeliveryAppAuthGate>
  )
}

export default function DeliveryPage() {
  return (
    <Suspense fallback={<main className="min-h-[100dvh] bg-[#f6f7f5] p-8 text-center text-slate-600">Opening Digital Dine-In…</main>}>
      <DeliveryContent />
    </Suspense>
  )
}