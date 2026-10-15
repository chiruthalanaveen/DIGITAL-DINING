'use client'

import { use } from 'react'
import DeliveryStoreExperience from '@/app/components/DeliveryStoreExperience'

// Legacy deep links, login redirects, tracking and return links remain valid.
// The /delivery homepage embeds the exact same store component in-place.
export default function DeliveryStorePage({ params }) {
  const values = use(params)
  const restaurantCode = String(values?.restaurantcode || values?.restaurantCode || '').trim()
  return <DeliveryStoreExperience key={restaurantCode} restaurantCode={restaurantCode} />
}