import { redirect } from 'next/navigation'

// Old bookmarks remain valid. Ordering settings now live inside Admin Dashboard.
export default function RestaurantOrderingLegacyRedirect() {
  redirect('/admin/dashboard?section=restaurant-ordering')
}
