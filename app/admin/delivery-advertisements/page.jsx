'use client'
// Destination: app/admin/delivery-advertisements/page.jsx
import Link from 'next/link'
import AdminDeliverySeasonalAds from '@/app/components/AdminDeliverySeasonalAds'
export default function DeliveryAdvertisementsAdminPage() {
  return <main className="min-h-screen bg-neutral-950 px-3 py-8 text-white sm:px-6">
    <div className="mx-auto max-w-6xl"><Link href="/admin" className="mb-6 inline-block rounded-xl border border-neutral-700 px-4 py-2 text-sm font-bold text-neutral-200">← Back to Admin</Link>
      <AdminDeliverySeasonalAds />
    </div>
  </main>
}