'use client'

import Link from 'next/link'

export default function RegistrationPendingPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-16 text-slate-900">
      <section className="mx-auto max-w-lg rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-2xl" aria-hidden="true">✓</div>
        <p className="text-xs font-bold uppercase tracking-widest text-amber-700">Digital Dine Partner</p>
        <h1 className="mt-3 text-3xl font-bold tracking-tight">Registration received</h1>
        <p className="mt-4 text-sm leading-7 text-slate-600">Your restaurant account has been created. Please wait for Digital Dine to review your registration before activating business operations.</p>
        <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-5">
          <h2 className="font-semibold">What happens next?</h2>
          <p className="mt-2 text-sm leading-6 text-slate-600">After admin approval, you will be able to activate your prepaid wallet with an initial recharge of ₹5,000 once secure recharge is enabled. No monthly subscription is required.</p>
        </div>
        <p className="mt-4 text-xs leading-5 text-slate-500">Account creation does not confirm approval, payment, or wallet activation.</p>
        <Link href="/login" className="mt-7 inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-900 px-6 text-sm font-semibold text-white hover:bg-slate-800">Go to login</Link>
      </section>
    </main>
  )
}
