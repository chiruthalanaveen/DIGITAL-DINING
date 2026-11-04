'use client'
// EXACT PATH: app/delivery/signup/page.jsx
// Both Login and Sign Up tabs appear inside the shared authentication screen.
import { Suspense } from 'react'
import DeliveryCustomerAuth from '@/app/components/DeliveryCustomerAuth'
export default function DeliverySignupPage() {
  return <Suspense fallback={<main className="min-h-dvh bg-[#f6f8f5] p-6">Loading Delivery sign-up…</main>}>
    <DeliveryCustomerAuth mode="signup" />
  </Suspense>
}
