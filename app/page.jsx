'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useMobileViewportLock } from '@/lib/useMobileViewportLock'

const CONTACT_EMAIL = 'digitaldining077@gmail.com'

// Replace this one value with your real Digital Dine-In support number.
const SUPPORT_PHONE = '+91XXXXXXXXXX'
const SUPPORT_PHONE_LINK = SUPPORT_PHONE.replace(/[^\d+]/g, '')

const modules = [
  {
    name: 'Restaurant',
    description:
      'QR ordering, Dine-In and Parcel, staff operations, billing, Razorpay and menu management.',
    features: [
      'QR menu & mobile ordering',
      'Dine-In & Parcel',
      'Owner, Manager, Waiter & KDS',
      'Restaurant-specific Razorpay',
      'GST-ready billing & invoices',
      'Offers, reports & Highly Reordered items',
    ],
  },
  {
    name: 'Delivery',
    description:
      'Run your own local Delivery storefront, inventory, packing, dispatch, tracking and support.',
    features: [
      'Food, Groceries, Fruits & Vegetables',
      'COD & Razorpay',
      'Live-location & delivery radius',
      'Inventory & barcode scanning',
      'Packer & Delivery Boy portals',
      'Automatic assignment & live tracking',
      'Returns, replacements & Live Support',
      'COD cash reconciliation',
    ],
  },
  {
    name: 'Resort',
    description:
      'Manage Resort operations beside Restaurant and Delivery from the same business account.',
    features: [
      'Resort workspace',
      'Room types & rooms',
      'Booking management',
      'Guest workflows',
      'Owner / Manager visibility',
      'Combined hospitality operations',
    ],
  },
]

const platformFeatures = [
  {
    title: 'Restaurant Code Login',
    text:
      'Enter the 5-digit Restaurant Code and show only the portals included in that active subscription.',
  },
  {
    title: 'Installable Web App',
    text:
      'Digital Dine-In can be installed as a PWA for faster Owner, Manager and staff access.',
  },
  {
    title: 'Inventory & Opening Stock',
    text:
      'Add packaged products with barcode, opening stock, available stock, low-stock threshold and restocking.',
  },
  {
    title: 'Barcode Packing',
    text:
      'Packer verifies packaged products before an order can be marked packed.',
  },
  {
    title: 'Stock Protection',
    text:
      'Server-side stock reservation, consumption and release reduces overselling risk.',
  },
  {
    title: 'Delivery Pricing Controls',
    text:
      'Minimum-order delivery fee, packing charge, handling charge, CGST/SGST and demand-based surge pricing.',
  },
  {
    title: 'Live Delivery Operations',
    text:
      'Automatic rider assignment, customer tracking, delivery proof and driver contact details.',
  },
  {
    title: 'Live Support',
    text:
      'Customers contact the Manager through Live Support instead of directly creating return or replacement requests.',
  },
  {
    title: 'Return Pickup Workflow',
    text:
      'Manager-approved returns become pickup tasks for the Delivery Boy before store verification and restocking.',
  },
  {
    title: 'Replacement Workflow',
    text:
      'Manager-controlled replacement flow with inventory protection for replacement stock.',
  },
  {
    title: 'Delivery Billing',
    text:
      'Owner and Manager can generate Delivery bills using authoritative server-side order values.',
  },
  {
    title: 'COD Cash Reconciliation',
    text:
      'Track rider COD liability, cash handover requests and Owner / Manager settlement approval.',
  },
]

const plans = [
  {
    code: 'restaurant_pro',
    name: 'Restaurant',
    monthly: '₹1,499',
    sixMonths: '₹8,095',
    annual: '₹14,390',
    description:
      'Complete Restaurant operations.',
    features: [
      'QR menu & table ordering',
      'Dine-In & Parcel',
      'Owner / Manager / Waiter / KDS',
      'Restaurant Razorpay',
      'GST billing & digital invoices',
      'Offers, menu controls & reports',
    ],
  },
  {
    code: 'delivery',
    name: 'Delivery',
    monthly: '₹1,499',
    sixMonths: '₹8,095',
    annual: '₹14,390',
    description:
      'Direct local ordering and dispatch.',
    features: [
      'Customer Delivery storefront',
      'Food / Grocery / Fruits & Vegetables',
      'COD & Razorpay',
      'Live location & delivery radius',
      'Inventory & barcode workflow',
      'Packer & Delivery Boy portals',
      'Tracking, returns & Live Support',
    ],
  },
  {
    code: 'restaurant_resort_pro',
    name: 'Restaurant + Resort',
    monthly: '₹2,999',
    sixMonths: '₹16,195',
    annual: '₹28,790',
    description:
      'Restaurant and hospitality operations.',
    features: [
      'Everything in Restaurant',
      'Resort workspace',
      'Room types & rooms',
      'Booking operations',
      'Guest workflows',
      'Combined operational visibility',
    ],
  },
  {
    code: 'restaurant_delivery',
    name: 'Restaurant + Delivery',
    monthly: '₹2,999',
    sixMonths: '₹16,195',
    annual: '₹28,790',
    description:
      'Restaurant plus your own Delivery operation.',
    featured: true,
    features: [
      'Everything in Restaurant',
      'Everything in Delivery',
      'Restaurant staff portals',
      'Delivery inventory & dispatch',
      'Separate payment configuration',
      'One Owner / Manager workspace',
    ],
  },
  {
    code: 'restaurant_resort_delivery',
    name: 'Restaurant + Resort + Delivery',
    monthly: '₹3,999',
    sixMonths: '₹21,595',
    annual: '₹38,390',
    description:
      'Complete Digital Dine-In platform.',
    features: [
      'Restaurant module',
      'Delivery module',
      'Resort module',
      'All role-based portals',
      'Payments, billing & inventory',
      'Tracking, support & operational reports',
    ],
  },
]

function SectionTitle({
  eyebrow,
  title,
  text,
}) {
  return (
    <div className="max-w-2xl">
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-400">
        {eyebrow}
      </p>

      <h2 className="mt-3 text-2xl font-black tracking-tight text-white sm:text-4xl">
        {title}
      </h2>

      {text && (
        <p className="mt-3 text-sm leading-7 text-neutral-400">
          {text}
        </p>
      )}
    </div>
  )
}

function PlanCard({ plan }) {
  return (
    <article
      className={`flex h-full flex-col rounded-[26px] border p-5 ${
        plan.featured
          ? 'border-orange-500/40 bg-orange-500/[0.05]'
          : 'border-white/[0.08] bg-white/[0.025]'
      }`}
    >
      {plan.featured && (
        <span className="mb-4 w-fit rounded-full bg-orange-500 px-3 py-1 text-[8px] font-black uppercase tracking-[0.16em] text-black">
          Popular
        </span>
      )}

      <h3 className="text-xl font-black text-white">
        {plan.name}
      </h3>

      <p className="mt-2 min-h-10 text-[11px] leading-5 text-neutral-500">
        {plan.description}
      </p>

      <div className="mt-5">
        <p className="text-3xl font-black tracking-tight text-white">
          {plan.monthly}
          <span className="ml-1 text-[10px] font-bold text-neutral-600">
            / month
          </span>
        </p>

        <div className="mt-3 grid grid-cols-2 gap-2 text-[9px]">
          <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3">
            <p className="font-black text-neutral-300">
              {plan.sixMonths}
            </p>
            <p className="mt-1 text-neutral-600">
              6 months
            </p>
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-black/20 p-3">
            <p className="font-black text-neutral-300">
              {plan.annual}
            </p>
            <p className="mt-1 text-neutral-600">
              12 months
            </p>
          </div>
        </div>
      </div>

      <div className="mt-5 flex-1 space-y-2.5">
        {plan.features.map(
          (feature) => (
            <div
              key={feature}
              className="flex gap-2"
            >
              <span className="mt-0.5 text-[10px] font-black text-orange-400">
                ✓
              </span>

              <span className="text-[10px] leading-5 text-neutral-400">
                {feature}
              </span>
            </div>
          )
        )}
      </div>

      <Link
        href={`/register?plan=${encodeURIComponent(
          plan.code
        )}`}
        className={`mt-6 inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-[10px] font-black transition ${
          plan.featured
            ? 'bg-orange-500 text-black hover:bg-orange-400'
            : 'bg-white text-black hover:bg-neutral-200'
        }`}
      >
        Register for this plan
      </Link>
    </article>
  )
}

export default function LandingPage() {
  useMobileViewportLock()

  const [
    privacyReady,
    setPrivacyReady,
  ] = useState(false)

  const [
    showPrivacyNotice,
    setShowPrivacyNotice,
  ] = useState(false)

  useEffect(() => {
    try {
      const accepted =
        localStorage.getItem(
          'digitaldining_privacy_accepted'
        )

      if (!accepted) {
        setShowPrivacyNotice(true)
      }
    } catch {
      // Ignore unavailable storage.
    }

    setPrivacyReady(true)
  }, [])

  const acceptPrivacy = () => {
    try {
      localStorage.setItem(
        'digitaldining_privacy_accepted',
        'true'
      )
    } catch {
      // Ignore unavailable storage.
    }

    setShowPrivacyNotice(false)
  }

  return (
    <div className="min-h-screen bg-[#090909] text-white selection:bg-orange-500 selection:text-black">
      {/* =================================================== */}
      {/* FREE MONTH BANNER                                   */}
      {/* =================================================== */}

      <div className="border-b border-orange-500/20 bg-orange-500/[0.08]">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-center gap-2 px-4 py-2.5 text-center sm:flex-row sm:px-6">
          <span className="text-[10px] font-black uppercase tracking-[0.16em] text-orange-300">
            Launch Offer
          </span>

          <span className="text-[10px] font-bold text-neutral-300">
            New Digital Dine-In customers get their first month free.
          </span>

          <Link
            href="/register?offer=one-month-free"
            className="text-[10px] font-black text-white underline decoration-orange-500 underline-offset-4"
          >
            Claim 1 Month Free
          </Link>
        </div>
      </div>

      {/* =================================================== */}
      {/* HEADER                                              */}
      {/* =================================================== */}

      <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-[#090909]/95 backdrop-blur-xl">
        <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex min-w-0 items-center gap-3"
          >
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-[10px] font-black text-black">
              DD
            </div>

            <div className="min-w-0">
              <p className="truncate text-sm font-black">
                Digital Dine-In
              </p>

              <p className="hidden text-[8px] font-bold uppercase tracking-[0.16em] text-neutral-600 sm:block">
                Restaurant · Delivery · Resort
              </p>
            </div>
          </Link>

          <nav className="hidden items-center gap-6 text-[10px] font-bold text-neutral-500 lg:flex">
            <a
              href="#platform"
              className="transition hover:text-white"
            >
              Platform
            </a>

            <a
              href="#features"
              className="transition hover:text-white"
            >
              Features
            </a>

            <a
              href="#pricing"
              className="transition hover:text-white"
            >
              Pricing
            </a>

            <a
              href="#contact"
              className="transition hover:text-white"
            >
              Support
            </a>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/app"
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-white/10 px-3 text-[9px] font-black text-white transition hover:border-orange-500/30 hover:bg-orange-500/[0.07] sm:px-4 sm:text-[10px]"
            >
              Restaurant Login
            </Link>

            <Link
              href="/app"
              className="inline-flex min-h-10 items-center justify-center rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 text-[9px] font-black text-orange-300 transition hover:bg-orange-500/15 sm:px-4 sm:text-[10px]"
            >
              APP
            </Link>

            <Link
              href="/register"
              className="inline-flex min-h-10 items-center justify-center rounded-xl bg-white px-3 text-[9px] font-black text-black transition hover:bg-orange-500 sm:px-4 sm:text-[10px]"
            >
              Register
            </Link>
          </div>
        </div>
      </header>

      <main>
        {/* ================================================= */}
        {/* HERO                                              */}
        {/* ================================================= */}

        <section className="border-b border-white/[0.06]">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:px-8 lg:py-24">
            <div className="flex flex-col justify-center">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-400">
                One operational platform
              </p>

              <h1 className="mt-4 max-w-3xl text-4xl font-black leading-[1.03] tracking-[-0.045em] sm:text-5xl lg:text-6xl">
                Restaurant, Delivery
                <br />
                <span className="text-neutral-500">
                  and Resort operations.
                </span>
              </h1>

              <p className="mt-6 max-w-2xl text-sm leading-7 text-neutral-400 sm:text-base">
                Digital Dine-In connects QR ordering, staff operations,
                inventory, direct Delivery, dispatch, payments, billing,
                support and Resort workflows in one simple platform.
              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/register?offer=one-month-free"
                  className="inline-flex min-h-12 items-center justify-center rounded-xl bg-orange-500 px-6 text-xs font-black text-black transition hover:bg-orange-400"
                >
                  Start 1 Month Free
                </Link>

                <Link
                  href="/app"
                  className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/10 px-6 text-xs font-black text-white transition hover:bg-white/[0.04]"
                >
                  Restaurant Login
                </Link>

                <Link
                  href="/app"
                  className="inline-flex min-h-12 items-center justify-center rounded-xl border border-orange-500/30 bg-orange-500/10 px-6 text-xs font-black text-orange-300 transition hover:bg-orange-500/15"
                >
                  Open APP
                </Link>
              </div>

              <div className="mt-6 flex flex-wrap gap-x-5 gap-y-2 text-[9px] font-bold text-neutral-600">
                <span>✓ QR ordering</span>
                <span>✓ COD & Razorpay</span>
                <span>✓ Inventory</span>
                <span>✓ Role-based portals</span>
                <span>✓ Installable PWA</span>
              </div>
            </div>

            <div className="rounded-[30px] border border-white/[0.08] bg-white/[0.025] p-5 sm:p-6">
              <p className="text-[9px] font-black uppercase tracking-[0.18em] text-neutral-600">
                What Digital Dine-In connects
              </p>

              <div className="mt-5 space-y-3">
                {[
                  [
                    'Restaurant',
                    'QR menu · Staff · Billing · Razorpay',
                  ],
                  [
                    'Delivery',
                    'Storefront · Inventory · Dispatch · Tracking',
                  ],
                  [
                    'Resort',
                    'Rooms · Bookings · Guest operations',
                  ],
                  [
                    'App Access',
                    'Restaurant Code · Plan-aware portals',
                  ],
                ].map(
                  ([title, text]) => (
                    <div
                      key={title}
                      className="rounded-2xl border border-white/[0.06] bg-black/20 p-4"
                    >
                      <div className="flex items-center justify-between gap-4">
                        <p className="text-xs font-black text-white">
                          {title}
                        </p>

                        <span className="text-orange-400">
                          →
                        </span>
                      </div>

                      <p className="mt-1 text-[10px] leading-5 text-neutral-500">
                        {text}
                      </p>
                    </div>
                  )
                )}
              </div>
            </div>
          </div>
        </section>

        {/* ================================================= */}
        {/* MODULES                                           */}
        {/* ================================================= */}

        <section
          id="platform"
          className="border-b border-white/[0.06]"
        >
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
            <SectionTitle
              eyebrow="Platform"
              title="Three modules. One business account."
              text="Use the modules your business needs today and keep operations connected as you grow."
            />

            <div className="mt-8 grid gap-4 lg:grid-cols-3">
              {modules.map(
                (module) => (
                  <article
                    key={module.name}
                    className="rounded-[26px] border border-white/[0.08] bg-white/[0.02] p-5"
                  >
                    <h3 className="text-lg font-black">
                      {module.name}
                    </h3>

                    <p className="mt-2 min-h-16 text-[11px] leading-6 text-neutral-500">
                      {module.description}
                    </p>

                    <div className="mt-4 space-y-2.5 border-t border-white/[0.06] pt-4">
                      {module.features.map(
                        (feature) => (
                          <div
                            key={feature}
                            className="flex gap-2"
                          >
                            <span className="text-[10px] font-black text-orange-400">
                              ✓
                            </span>

                            <span className="text-[10px] leading-5 text-neutral-400">
                              {feature}
                            </span>
                          </div>
                        )
                      )}
                    </div>
                  </article>
                )
              )}
            </div>
          </div>
        </section>

        {/* ================================================= */}
        {/* FEATURES / RECENT UPGRADES                        */}
        {/* ================================================= */}

        <section
          id="features"
          className="border-b border-white/[0.06]"
        >
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
            <SectionTitle
              eyebrow="Current Platform"
              title="Built for real daily operations."
              text="The platform now goes well beyond QR menus, with inventory, Delivery controls, support, returns, billing and plan-aware staff access."
            />

            <div className="mt-8 grid gap-px overflow-hidden rounded-[26px] border border-white/[0.07] bg-white/[0.07] sm:grid-cols-2 lg:grid-cols-3">
              {platformFeatures.map(
                (feature) => (
                  <article
                    key={feature.title}
                    className="bg-[#0d0d0d] p-5"
                  >
                    <h3 className="text-xs font-black text-white">
                      {feature.title}
                    </h3>

                    <p className="mt-2 text-[10px] leading-5 text-neutral-500">
                      {feature.text}
                    </p>
                  </article>
                )
              )}
            </div>
          </div>
        </section>

        {/* ================================================= */}
        {/* FREE MONTH                                        */}
        {/* ================================================= */}

        <section className="border-b border-white/[0.06]">
          <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
            <div className="rounded-[28px] border border-orange-500/20 bg-orange-500/[0.06] p-6 sm:p-8">
              <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-center">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-400">
                    New Customer Offer
                  </p>

                  <h2 className="mt-2 text-2xl font-black sm:text-3xl">
                    First month free.
                  </h2>

                  <p className="mt-3 max-w-2xl text-sm leading-7 text-neutral-400">
                    New Digital Dine-In customers can start with a 1-month free subscription offer and experience the platform before continuing with a paid plan.
                  </p>
                </div>

                <Link
                  href="/register?offer=one-month-free"
                  className="inline-flex min-h-12 items-center justify-center rounded-xl bg-orange-500 px-6 text-xs font-black text-black transition hover:bg-orange-400"
                >
                  Claim Free Month
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* ================================================= */}
        {/* PRICING                                           */}
        {/* ================================================= */}

        <section
          id="pricing"
          className="border-b border-white/[0.06]"
        >
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
            <SectionTitle
              eyebrow="Subscription Plans"
              title="Choose the modules your business needs."
              text="All five plans use the same Digital Dine-In account and role-based access model."
            />

            <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-5">
              {plans.map(
                (plan) => (
                  <PlanCard
                    key={plan.code}
                    plan={plan}
                  />
                )
              )}
            </div>

            <p className="mt-5 text-center text-[9px] leading-5 text-neutral-600">
              New-customer free-month eligibility and final subscription activation should be confirmed during registration/subscription checkout.
            </p>
          </div>
        </section>

        {/* ================================================= */}
        {/* LOGIN                                             */}
        {/* ================================================= */}

        <section className="border-b border-white/[0.06]">
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
            <div className="grid gap-8 rounded-[28px] border border-white/[0.08] bg-white/[0.02] p-6 sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-400">
                  Existing Customer
                </p>

                <h2 className="mt-2 text-2xl font-black sm:text-3xl">
                  Open your business portals.
                </h2>

                <p className="mt-3 max-w-2xl text-sm leading-7 text-neutral-500">
                  Enter your Restaurant Code. Digital Dine-In checks the active subscription and shows only the Owner, Manager, Waiter, Kitchen, Packer or Delivery Boy portals included in that plan.
                </p>
              </div>

              <Link
                href="/app"
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-white px-6 text-xs font-black text-black transition hover:bg-neutral-200"
              >
                Restaurant Login
              </Link>
            </div>
          </div>
        </section>

        {/* ================================================= */}
        {/* CONTACT                                           */}
        {/* ================================================= */}

        <section
          id="contact"
          className="border-b border-white/[0.06]"
        >
          <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
            <SectionTitle
              eyebrow="Support"
              title="Need help choosing or running a plan?"
              text="Contact Digital Dine-In for registration, subscription and platform support."
            />

            <div className="mt-7 grid gap-3 sm:grid-cols-2">
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 transition hover:border-white/15"
              >
                <p className="text-[9px] font-black uppercase tracking-[0.17em] text-neutral-600">
                  Email
                </p>

                <p className="mt-2 break-all text-sm font-black text-white">
                  {CONTACT_EMAIL}
                </p>
              </a>

              <a
                href={`tel:${SUPPORT_PHONE_LINK}`}
                className="rounded-2xl border border-white/[0.08] bg-white/[0.02] p-5 transition hover:border-white/15"
              >
                <p className="text-[9px] font-black uppercase tracking-[0.17em] text-neutral-600">
                  Support Number
                </p>

                <p className="mt-2 text-sm font-black text-white">
                  {SUPPORT_PHONE}
                </p>
              </a>
            </div>

            <div className="mt-5 flex flex-col gap-3 sm:flex-row">
              <Link
                href="/register"
                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-orange-500 px-5 text-[10px] font-black text-black"
              >
                Register
              </Link>

              <Link
                href="/app"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-white/10 px-5 text-[10px] font-black text-white"
              >
                Restaurant Login
              </Link>
            </div>
          </div>
        </section>
      </main>

      {/* =================================================== */}
      {/* FOOTER                                              */}
      {/* =================================================== */}

      <footer>
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-7 text-center sm:px-6 md:flex-row md:items-center md:justify-between md:text-left lg:px-8">
          <div>
            <p className="text-xs font-black">
              Digital Dine-In
            </p>

            <p className="mt-1 text-[9px] text-neutral-700">
              Restaurant · Delivery · Resort Operations
            </p>
          </div>

          <p className="text-[9px] text-neutral-700">
            © {new Date().getFullYear()} Digital Dine-In. All rights reserved.
          </p>
        </div>
      </footer>

      {/* =================================================== */}
      {/* PRIVACY NOTICE                                      */}
      {/* =================================================== */}

      {privacyReady &&
        showPrivacyNotice && (
          <div className="fixed inset-x-3 bottom-3 z-50 mx-auto max-w-xl rounded-2xl border border-white/10 bg-[#151515] p-4 shadow-2xl sm:bottom-5">
            <p className="text-[10px] leading-5 text-neutral-400">
              Digital Dine-In uses necessary browser storage for preferences and application functionality.
            </p>

            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={acceptPrivacy}
                className="rounded-xl bg-white px-4 py-2 text-[9px] font-black text-black"
              >
                Continue
              </button>
            </div>
          </div>
        )}
    </div>
  )
}
