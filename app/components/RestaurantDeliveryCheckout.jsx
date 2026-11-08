'use client'
import DeliveryAppAuthGate from '@/app/components/DeliveryAppAuthGate'
import DeliveryStoreExperience from '@/app/components/DeliveryStoreExperience'
export default function RestaurantDeliveryCheckout({ restaurantCode, onBack }) {
  const code = String(restaurantCode || '').trim()
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(code)) {
    return <div className="p-6 text-sm text-red-700">Delivery is not configured for this restaurant.</div>
  }
  return (
    <div className="min-h-dvh bg-[#f6f7fb] text-slate-900">
      <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <button type="button" onClick={onBack} className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold">← Restaurant menu</button>
        <div className="text-sm font-bold">Home Delivery</div>
      </header>
      <DeliveryAppAuthGate nextPath={`/delivery/${encodeURIComponent(code)}`}>
        <DeliveryStoreExperience restaurantCode={code} onBackToStores={onBack} />
      </DeliveryAppAuthGate>
    </div>
  )
}
