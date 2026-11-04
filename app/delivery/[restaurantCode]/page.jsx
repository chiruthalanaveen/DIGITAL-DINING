'use client'
// Destination: app/delivery/[restaurantCode]/page.jsx
// Existing QR, tracking and direct store links stay valid.
import { use } from 'react'
import { useRouter } from 'next/navigation'
import DeliveryAppAuthGate from '@/app/components/DeliveryAppAuthGate'
import DeliveryStoreExperience from '@/app/components/DeliveryStoreExperience'

export default function DeliveryStorePage({ params }) {
  const router = useRouter()
  const values = use(params)
  const restaurantCode = String(values?.restaurantCode || values?.restaurantcode || '').trim()
  return (
    <DeliveryAppAuthGate nextPath={/^[A-Za-z0-9_-]{1,80}$/.test(restaurantCode)
      ? `/delivery/${encodeURIComponent(restaurantCode)}` : '/delivery'}>
      <DeliveryStoreExperience key={restaurantCode} restaurantCode={restaurantCode}
        onBackToStores={() => router.push('/delivery', { scroll: false })} />
    </DeliveryAppAuthGate>
  )
}