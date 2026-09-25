'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'

const CONTACT_EMAIL = 'digitaldining077@gmail.com'

const plans = [
  {
    name: 'Restaurant Standard',
    label: 'Restaurant',
    price: '₹799',
    featured: false,
    features: [
      'QR menu & table ordering',
      'Dine-In & Parcel',
      'GST-ready checkout',
      'Razorpay payments',
      'Digital invoices',
    ],
  },
  {
    name: 'Restaurant Pro',
    label: 'Restaurant',
    price: '₹1,299',
    featured: true,
    features: [
      'Everything in Standard',
      'Kitchen & waiter workflows',
      'Manager tools',
      'Live menu updates',
      'Reports & order visibility',
    ],
  },
  {
    name: 'Restaurant + Resort Standard',
    label: 'Restaurant + Resort',
    price: '₹1,999',
    featured: false,
    features: [
      'Restaurant Standard features',
      'Resort workspace',
      'Room booking tools',
      'Inventory support',
      'Guest digital workflows',
    ],
  },
  {
    name: 'Restaurant + Resort Pro',
    label: 'Restaurant + Resort',
    price: '₹2,999',
    featured: false,
    features: [
      'Restaurant Pro features',
      'Full resort access',
      'Connected staff workflows',
      'Advanced reports',
      'Live operational visibility',
    ],
  },
]

const featureItems = [
  {
    icon: '⌁',
    title: 'QR Ordering',
    text: 'Guests scan, browse and order from their phone.',
  },
  {
    icon: '₹',
    title: 'Online Payments',
    text: 'Restaurant-specific Razorpay checkout.',
  },
  {
    icon: '◉',
    title: 'Live Operations',
    text: 'Kitchen, waiter and manager workflows stay connected.',
  },
  {
    icon: '✓',
    title: 'GST Billing',
    text: 'Clear SGST, CGST, charges and digital invoices.',
  },
  {
    icon: '★',
    title: 'Smart Menu',
    text: 'Search, filters, offers and highly reordered items.',
  },
  {
    icon: '▣',
    title: 'Resort Ready',
    text: 'Optional restaurant + resort plans for combined operations.',
  },
]

export default function LandingPage() {
  const [privacyReady, setPrivacyReady] = useState(false)
  const [showPrivacyNotice, setShowPrivacyNotice] = useState(false)

  useEffect(() => {
    const accepted = localStorage.getItem(
      'digitaldining_privacy_accepted'
    )

    if (!accepted) {
      setShowPrivacyNotice(true)
    }

    setPrivacyReady(true)
  }, [])

  const acceptPrivacy = () => {
    localStorage.setItem(
      'digitaldining_privacy_accepted',
      'true'
    )
    setShowPrivacyNotice(false)
  }

  return (
    <div className="min-h-screen bg-[#090909] text-white selection:bg-orange-500 selection:text-white">
      <style jsx global>{`
        html {
          scroll-behavior: smooth;
        }

        body {
          margin: 0;
          background: #090909;
        }

        * {
          box-sizing: border-box;
        }

        @media (prefers-reduced-motion: reduce) {
          html {
            scroll-behavior: auto;
          }

          *,
          *::before,
          *::after {
            transition: none !important;
            animation: none !important;
          }
        }
      `}</style>

      {/* Offer */}
      <div className="border-b border-orange-400/20 bg-orange-500 px-4 py-2 text-center text-[11px] font-bold text-black">
        First-time partners get 1 month free
      </div>

      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#090909]/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-8">
          <a href="#" className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500 text-sm font-black text-black">
              D
            </span>

            <div>
              <div className="text-sm font-black tracking-tight">
                Digital Dining
              </div>
              <div className="text-[8px] font-bold uppercase tracking-[0.2em] text-neutral-600">
                Restaurant SaaS
              </div>
            </div>
          </a>

          <nav className="hidden items-center gap-7 text-[11px] font-bold text-neutral-400 md:flex">
            <a href="/demo" className="transition hover:text-white">
              Demo
            </a>
            <a href="#features" className="transition hover:text-white">
              Features
            </a>
            <a href="#pricing" className="transition hover:text-white">
              Pricing
            </a>
            <a href="#contact" className="transition hover:text-white">
              Contact
            </a>
          </nav>

          <Link
            href="/register"
            className="rounded-xl bg-white px-4 py-2.5 text-[10px] font-black text-black transition hover:bg-orange-500"
          >
            Start Free
          </Link>
        </div>
      </header>

      <main>
        {/* Hero */}
        <section className="relative overflow-hidden">
          <div className="pointer-events-none absolute left-1/2 top-[-260px] h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-orange-500/[0.08] blur-[100px]" />

          <div className="mx-auto grid max-w-7xl items-center gap-12 px-5 py-16 sm:px-6 sm:py-20 lg:grid-cols-[0.92fr_1.08fr] lg:px-8 lg:py-24">
            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-[9px] font-bold uppercase tracking-[0.16em] text-neutral-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Built for restaurants
              </div>

              <h1 className="mt-6 max-w-3xl text-4xl font-black leading-[1.02] tracking-[-0.04em] sm:text-5xl lg:text-6xl">
                Take orders.
                <br />
                <span className="text-orange-500">
                  Run the restaurant.
                </span>
                <br />
                Keep it simple.
              </h1>

              <p className="mt-6 max-w-xl text-sm leading-7 text-neutral-400 sm:text-base">
                QR menu, ordering, payments, kitchen, waiter and billing —
                connected in one clean system.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <a
                  href="/demo"
                  className="inline-flex items-center justify-center rounded-xl bg-orange-500 px-6 py-3.5 text-xs font-black text-black transition hover:bg-orange-400"
                >
                  View Live Demo
                </a>

                <a
                  href={`mailto:${CONTACT_EMAIL}?subject=Digital%20Dining%20Enquiry`}
                  className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/[0.03] px-6 py-3.5 text-xs font-black text-white transition hover:bg-white/[0.07]"
                >
                  Talk to Us
                </a>
              </div>

              <div className="mt-7 flex flex-wrap gap-2">
                {[
                  'QR ordering',
                  'Razorpay',
                  'GST billing',
                  'Staff app',
                ].map((item) => (
                  <span
                    key={item}
                    className="rounded-full border border-white/[0.07] bg-white/[0.025] px-3 py-1.5 text-[9px] font-bold text-neutral-500"
                  >
                    {item}
                  </span>
                ))}
              </div>
            </div>

            {/* Simple product preview */}
            <div className="relative">
              <div className="overflow-hidden rounded-[28px] border border-white/10 bg-[#111] shadow-2xl shadow-black/50">
                <div className="flex items-center justify-between border-b border-white/[0.07] px-4 py-3">
                  <div className="flex gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
                    <span className="h-2.5 w-2.5 rounded-full bg-green-400/70" />
                  </div>

                  <div className="text-[8px] font-bold text-neutral-600">
                    Digital Dining
                  </div>

                  <div className="text-[10px] text-neutral-700">•••</div>
                </div>

                <div className="p-5 sm:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="text-[9px] font-black uppercase tracking-[0.18em] text-orange-500">
                        Table 07
                      </div>
                      <div className="mt-1 text-lg font-black">
                        Today&apos;s Menu
                      </div>
                    </div>

                    <span className="rounded-xl bg-orange-500/10 px-3 py-2 text-[9px] font-black text-orange-400">
                      DINE-IN
                    </span>
                  </div>

                  <div className="mt-5 flex gap-2 overflow-hidden">
                    {['All', 'Veg', 'Non-Veg', 'Drinks'].map(
                      (item, index) => (
                        <span
                          key={item}
                          className={`whitespace-nowrap rounded-full px-3 py-1.5 text-[8px] font-bold ${
                            index === 0
                              ? 'bg-orange-500 text-black'
                              : 'border border-white/[0.07] text-neutral-500'
                          }`}
                        >
                          {item}
                        </span>
                      )
                    )}
                  </div>

                  <div className="mt-5 space-y-3">
                    {[
                      ['🍛', 'Butter Chicken', '₹320', 'Popular'],
                      ['🥘', 'Paneer Tikka', '₹280', 'Highly Reordered'],
                      ['🫓', 'Garlic Naan', '₹90', ''],
                    ].map(([emoji, name, price, badge]) => (
                      <div
                        key={name}
                        className="flex items-center gap-3 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-3"
                      >
                        <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-[#181818] text-xl">
                          {emoji}
                        </div>

                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-black">
                            {name}
                          </div>

                          {badge ? (
                            <div className="mt-1 text-[7px] font-bold uppercase tracking-wider text-orange-400">
                              {badge}
                            </div>
                          ) : (
                            <div className="mt-1 text-[8px] text-neutral-600">
                              Freshly prepared
                            </div>
                          )}
                        </div>

                        <div className="text-xs font-black">{price}</div>

                        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 text-sm font-black text-black">
                          +
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="mt-5 flex items-center justify-between rounded-2xl bg-orange-500 p-4 text-black">
                    <div>
                      <div className="text-[8px] font-bold uppercase">
                        Your cart
                      </div>
                      <div className="mt-1 text-sm font-black">
                        3 items · ₹690
                      </div>
                    </div>

                    <div className="rounded-xl bg-black px-4 py-2 text-[9px] font-black text-white">
                      Checkout →
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Simple trust strip */}
        <section className="border-y border-white/[0.06] bg-white/[0.015]">
          <div className="mx-auto grid max-w-7xl grid-cols-2 sm:grid-cols-4">
            {[
              ['QR', 'Table ordering'],
              ['LIVE', 'Staff operations'],
              ['GST', 'Billing ready'],
              ['₹', 'Online payments'],
            ].map(([value, label]) => (
              <div
                key={label}
                className="border-b border-r border-white/[0.05] px-5 py-5 text-center sm:border-b-0"
              >
                <div className="text-sm font-black text-white">{value}</div>
                <div className="mt-1 text-[8px] font-bold uppercase tracking-wider text-neutral-600">
                  {label}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Demo */}
        <section
          id="demo"
          className="mx-auto max-w-7xl scroll-mt-20 px-5 py-16 sm:px-6 lg:px-8"
        >
          <div className="flex flex-col gap-7 rounded-[26px] border border-white/[0.08] bg-white/[0.025] p-6 sm:p-8 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400">
                Product demo
              </div>

              <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">
                See every restaurant portal in one place.
              </h2>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-500">
                Owner, Manager, Waiter and Kitchen — switch between each portal
                from a single clean demo page.
              </p>
            </div>

            <Link
              href="/demo"
              className="inline-flex shrink-0 items-center justify-center rounded-xl bg-white px-6 py-3.5 text-xs font-black text-black transition hover:bg-orange-500"
            >
              Open Demo Center →
            </Link>
          </div>
        </section>

        {/* Features */}
        <section
          id="features"
          className="border-y border-white/[0.06] bg-[#0c0c0c]"
        >
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8">
            <div className="max-w-xl">
              <div className="text-[9px] font-black uppercase tracking-[0.2em] text-orange-400">
                What you get
              </div>

              <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                The essentials. Nothing noisy.
              </h2>
            </div>

            <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {featureItems.map((feature) => (
                <div
                  key={feature.title}
                  className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5"
                >
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10 text-sm font-black text-orange-400">
                    {feature.icon}
                  </div>

                  <h3 className="mt-4 text-sm font-black">
                    {feature.title}
                  </h3>

                  <p className="mt-2 text-[11px] leading-5 text-neutral-500">
                    {feature.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section
          id="pricing"
          className="mx-auto max-w-7xl scroll-mt-20 px-5 py-20 sm:px-6 lg:px-8"
        >
          <div className="text-center">
            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400">
              Pricing
            </div>

            <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
              Pick what fits your business.
            </h2>

            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-neutral-500">
              Simple monthly subscription pricing. GST included. First-time
              partners get 1 month free.
            </p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {plans.map((plan) => (
                <div
                  key={plan.name}
                  className={`relative flex flex-col rounded-[24px] border p-6 ${
                    plan.featured
                      ? 'border-orange-500 bg-orange-500/[0.07]'
                      : 'border-white/[0.07] bg-white/[0.02]'
                  }`}
                >
                  {plan.featured && (
                    <div className="absolute -top-3 left-5 rounded-full bg-orange-500 px-3 py-1 text-[8px] font-black uppercase tracking-wider text-black">
                      Most Popular
                    </div>
                  )}

                  <div className="text-[8px] font-black uppercase tracking-[0.16em] text-neutral-600">
                    {plan.label}
                  </div>

                  <h3 className="mt-2 min-h-[46px] text-lg font-black leading-tight">
                    {plan.name}
                  </h3>

                  <div className="mt-5 flex items-end gap-1">
                    <span className="text-3xl font-black tracking-tight">
                      {plan.price}
                    </span>
                    <span className="pb-1 text-[9px] font-bold text-neutral-600">
                      / month
                    </span>
                  </div>

                  <div className="my-5 h-px bg-white/[0.07]" />

                  <div className="flex-1 space-y-3">
                    {plan.features.map((feature) => (
                      <div
                        key={feature}
                        className="flex items-start gap-2 text-[10px] font-semibold leading-5 text-neutral-400"
                      >
                        <span className="mt-0.5 text-emerald-400">✓</span>
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>

                  <Link
                    href="/register"
                    className={`mt-7 flex items-center justify-center rounded-xl py-3 text-[10px] font-black transition ${
                      plan.featured
                        ? 'bg-orange-500 text-black hover:bg-orange-400'
                        : 'bg-white text-black hover:bg-neutral-200'
                    }`}
                  >
                    Start Free
                  </Link>
                </div>
            ))}
          </div>
        </section>

        {/* Contact CTA */}
        <section
          id="contact"
          className="border-t border-white/[0.06] bg-[#0c0c0c]"
        >
          <div className="mx-auto max-w-5xl px-5 py-20 text-center sm:px-6">
            <div className="text-[9px] font-black uppercase tracking-[0.2em] text-orange-400">
              Talk to us
            </div>

            <h2 className="mx-auto mt-3 max-w-3xl text-3xl font-black tracking-tight sm:text-5xl">
              Want Digital Dining for your restaurant?
            </h2>

            <p className="mx-auto mt-4 max-w-lg text-sm leading-6 text-neutral-500">
              See the demo, ask your questions, then decide.
            </p>

            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <a
                href={`mailto:${CONTACT_EMAIL}?subject=Digital%20Dining%20Demo%20Enquiry`}
                className="inline-flex items-center justify-center rounded-xl bg-orange-500 px-6 py-3.5 text-xs font-black text-black transition hover:bg-orange-400"
              >
                Message Digital Dining
              </a>

              <Link
                href="/register"
                className="inline-flex items-center justify-center rounded-xl border border-white/10 px-6 py-3.5 text-xs font-black text-white transition hover:bg-white/[0.05]"
              >
                Start Free
              </Link>
            </div>

            <a
              href={`mailto:${CONTACT_EMAIL}`}
              className="mt-5 inline-block text-[11px] font-semibold text-neutral-500 transition hover:text-white"
            >
              {CONTACT_EMAIL}
            </a>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-5 py-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 text-xs font-black text-black">
              D
            </span>
            <span className="text-xs font-black">Digital Dining</span>
          </div>

          <div className="flex flex-wrap gap-5 text-[9px] font-bold text-neutral-600">
            <a href="/demo" className="hover:text-white">Demo</a>
            <a href="#features" className="hover:text-white">Features</a>
            <a href="#pricing" className="hover:text-white">Pricing</a>
            <a href="#contact" className="hover:text-white">Contact</a>
            <Link href="/privacy-policy" className="hover:text-white">
              Privacy
            </Link>
          </div>

          <div className="text-[9px] font-bold text-neutral-700">
            © 2026 Digital Dining
          </div>
        </div>
      </footer>

      {/* Privacy notice */}
      {privacyReady && showPrivacyNotice && (
        <div className="fixed bottom-4 left-1/2 z-[9999] w-[calc(100%-2rem)] max-w-md -translate-x-1/2">
          <div className="rounded-2xl border border-white/10 bg-[#151515] p-4 shadow-2xl shadow-black/50">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-500/10 text-sm text-orange-400">
                🔒
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold">
                  Privacy
                </div>

                <p className="mt-1 text-[10px] leading-5 text-neutral-500">
                  We use essential storage and security technologies. Read our{' '}
                  <Link
                    href="/privacy-policy"
                    className="font-bold text-orange-400"
                  >
                    Privacy Policy
                  </Link>
                  .
                </p>

                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={acceptPrivacy}
                    className="rounded-lg bg-white px-4 py-2 text-[10px] font-black text-black transition hover:bg-orange-500"
                  >
                    Accept
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
