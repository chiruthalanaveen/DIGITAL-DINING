'use client'
import { use } from 'react'
import RestaurantOperationsHub from '@/app/components/RestaurantOperationsHub'
export default function RestaurantOperationsPage({ params }) {
  const { restaurantId } = use(params)
  return <RestaurantOperationsHub restaurantId={String(restaurantId || '')} />
}
