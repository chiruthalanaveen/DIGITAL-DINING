import { redirect } from 'next/navigation'

const CURRENT_PLANS = new Set([
  'restaurant_pro',
  'delivery',
  'restaurant_resort_pro',
  'restaurant_delivery',
  'restaurant_resort_delivery',
])

// Keep bookmarked billing URLs on the same authenticated, server-verified
// subscription flow used by the dashboard and onboarding.
export default async function SubscriptionBilling({ params, searchParams }) {
  const { id } = await params
  const { plan } = (await searchParams) || {}
  const query = CURRENT_PLANS.has(plan)
    ? `?plan=${encodeURIComponent(plan)}`
    : ''

  redirect(`/subscribe/${encodeURIComponent(id)}${query}`)
}
