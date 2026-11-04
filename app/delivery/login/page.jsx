'use client'
// EXACT PATH: app/delivery/login/page.jsx
import { Suspense } from 'react'
import DeliveryCustomerAuth from '@/app/components/DeliveryCustomerAuth'
export default function DeliveryLoginPage() {
  return <Suspense fallback={<main className="min-h-dvh bg-[#f6f8f5] p-6">Loading Delivery login…</main>}>
    <DeliveryCustomerAuth mode="login" />
  </Suspense>
}
