import { Suspense } from 'react'
import CommerceAuthCallback from '@/app/components/commerce/CommerceAuthCallback'

export const metadata = {
  title: 'Complete Client Websites sign-in',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default function CommerceAuthCallbackPage() {
  return <Suspense fallback={<main className="min-h-dvh bg-[#f5f7f3] p-8 text-neutral-950" role="status">Opening your secure sign-in link…</main>}><CommerceAuthCallback /></Suspense>
}
