'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useMobileViewportLock } from '@/lib/useMobileViewportLock'

const CONTACT_EMAIL = 'digitaldining077@gmail.com'

const productModules = [
  {
    eyebrow: 'Restaurant',
    title: 'Run dine-in and takeaway from one workspace.',
    text:
      'QR menu ordering, Dine-In and Parcel, GST-ready billing, restaurant Razorpay, offers, reports and connected staff workflows.',
    points: [
      'Owner, Manager, Waiter and KDS access',
      'Live menu, offers and Highly Reordered items',
      'Digital invoices and daily order visibility',
    ],
    tone: 'orange',
  },
  {
    eyebrow: 'Delivery',
    title: 'Own your delivery workflow instead of depending on an aggregator.',
    text:
      'Give customers a direct ordering experience with COD or prepaid checkout, location pinning, delivery radius rules and live order tracking.',
    points: [
      'Packer and Delivery Boy portals',
      'Automatic driver assignment by batch',
      'Delivery result, failure reason and proof photos',
    ],
    tone: 'emerald',
  },
  {
    eyebrow: 'Resort',
    title: 'Keep rooms and restaurant operations connected.',
    text:
      'Manage resort properties, room types, rooms, bookings and guest-facing operations alongside your restaurant workspace.',
    points: [
      'Room and booking management',
      'Owner and Manager operational visibility',
      'Available in combined Restaurant + Resort plans',
    ],
    tone: 'sky',
  },
]

const featureItems = [
  {
    number: '01',
    title: 'QR-first ordering',
    text:
      'Guests scan, browse the live menu, choose Dine-In or Parcel and place orders from their own phone.',
  },
  {
    number: '02',
    title: 'Restaurant operations',
    text:
      'Owner, Manager, Waiter and KDS workflows stay connected to the same restaurant and order data.',
  },
  {
    number: '03',
    title: 'Direct delivery',
    text:
      'Customer ordering, COD and Razorpay, address capture, live-location pinning and order tracking in your own system.',
  },
  {
    number: '04',
    title: 'Delivery dispatch',
    text:
      'Packer and Delivery Boy portals, assignment controls, order status flow, delivery proof and driver details.',
  },
  {
    number: '05',
    title: 'Resort workspace',
    text:
      'Room types, rooms and booking operations can sit alongside Restaurant management when the selected plan includes Resort.',
  },
  {
    number: '06',
    title: 'Mobile staff access',
    text:
      'The app opens role-based portals from a Restaurant Code so staff see only the access available for that plan.',
  },
  {
    number: '07',
    title: 'Payments and billing',
    text:
      'Restaurant-specific Razorpay, Delivery Razorpay, GST-ready restaurant billing and digital invoices.',
  },
  {
    number: '08',
    title: 'Owner controls',
    text:
      'Manage menus, staff, QR codes, delivery settings, service radius, payment configuration and operational reports.',
  },
]

const workflowSteps = [
  {
    step: '01',
    title: 'Create the business account',
    text:
      'Register the restaurant, choose the right plan and configure the business workspace.',
  },
  {
    step: '02',
    title: 'Configure each module',
    text:
      'Add the restaurant menu, staff access, payment settings, Delivery controls or Resort room data as needed.',
  },
  {
    step: '03',
    title: 'Share customer entry points',
    text:
      'Use QR ordering for restaurant guests and the direct Delivery storefront for local delivery customers.',
  },
  {
    step: '04',
    title: 'Operate from role-based portals',
    text:
      'Owner, Manager, Waiter, KDS, Packer and Delivery Boy access stays separated by plan and role.',
  },
]

const plans = [
  {
    key: 'restaurant',
    name: 'Restaurant',
    label: 'Restaurant operations',
    monthly: '₹1,499',
    sixMonths: '₹8,095',
    annual: '₹14,390',
    description:
      'For restaurants that want QR ordering, staff operations, billing and payments.',
    features: [
      'QR menu & table ordering',
      'Dine-In & Parcel',
      'Owner, Manager, Waiter & KDS',
      'GST-ready billing & invoices',
      'Restaurant Razorpay',
      'Offers, menu controls & reports',
    ],
    featured: false,
  },
  {
    key: 'delivery',
    name: 'Delivery',
    label: 'Direct local delivery',
    monthly: '₹1,499',
    sixMonths: '₹8,095',
    annual: '₹14,390',
    description:
      'For businesses that need their own Delivery ordering and dispatch workflow.',
    features: [
      'Customer Delivery storefront',
      'COD & prepaid Razorpay',
      'Live-location pin & service radius',
      'Packer & Delivery Boy portals',
      'Automatic driver assignment',
      'Tracking & delivery proof',
    ],
    featured: false,
  },
  {
    key: 'restaurant_resort',
    name: 'Restaurant + Resort',
    label: 'Hospitality operations',
    monthly: '₹2,999',
    sixMonths: '₹16,195',
    annual: '₹28,790',
    description:
      'For properties that run a restaurant and resort from the same operating system.',
    features: [
      'Everything in Restaurant',
      'Resort workspace',
      'Room types & rooms',
      'Booking operations',
      'Guest workflow support',
      'Combined operational visibility',
    ],
    featured: false,
  },
  {
    key: 'restaurant_delivery',
    name: 'Restaurant + Delivery',
    label: 'Restaurant + dispatch',
    monthly: '₹2,999',
    sixMonths: '₹16,195',
    annual: '₹28,790',
    description:
      'For restaurants that want dine-in operations and their own Delivery channel together.',
    features: [
      'Everything in Restaurant',
      'Everything in Delivery',
      'Restaurant staff portals',
      'Delivery dispatch workflow',
      'Separate payment configuration',
      'One Owner / Manager operation',
    ],
    featured: true,
  },
  {
    key: 'all',
    name: 'Restaurant + Resort + Delivery',
    label: 'Complete platform',
    monthly: '₹3,999',
    sixMonths: '₹21,595',
    annual: '₹38,390',
    description:
      'For businesses that need Restaurant, Resort and Delivery operations in one platform.',
    features: [
      'Restaurant module',
      'Delivery module',
      'Resort module',
      'All role-based portals',
      'Payments, tracking & reports',
      'Complete operational access',
    ],
    featured: false,
  },
]

const toneClasses = {
  orange: {
    border: 'border-orange-500/20',
    chip: 'border-orange-500/20 bg-orange-500/10 text-orange-300',
    dot: 'bg-orange-400',
  },
  emerald: {
    border: 'border-emerald-500/20',
    chip: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
    dot: 'bg-emerald-400',
  },
  sky: {
    border: 'border-sky-500/20',
    chip: 'border-sky-500/20 bg-sky-500/10 text-sky-300',
    dot: 'bg-sky-400',
  },
}

function SectionHeading({ eyebrow, title, text, centered = false }) {
  return (
    <div className={centered ? 'mx-auto max-w-2xl text-center' : 'max-w-2xl'}>
      <p className="text-[10px] font-black uppercase tracking-[0.22em] text-orange-400">
        {eyebrow}
      </p>

      <h2 className="mt-3 text-3xl font-black tracking-[-0.035em] text-white sm:text-4xl">
        {title}
      </h2>

      {text && (
        <p className="mt-4 text-sm leading-7 text-neutral-400 sm:text-[15px]">
          {text}
        </p>
      )}
    </div>
  )
}

function ProductModuleCard({ item }) {
  const tone = toneClasses[item.tone] || toneClasses.orange

  return (
    <article
      className={`rounded-2xl border ${tone.border} bg-[#101010] p-6 sm:p-7`}
    >
      <div
        className={`inline-flex rounded-full border px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] ${tone.chip}`}
      >
        {item.eyebrow}
      </div>

      <h3 className="mt-5 text-xl font-black leading-snug tracking-tight text-white">
        {item.title}
      </h3>

      <p className="mt-3 text-[12px] leading-6 text-neutral-400">
        {item.text}
      </p>

      <div className="mt-6 space-y-3 border-t border-white/[0.07] pt-5">
        {item.points.map((point) => (
          <div key={point} className="flex items-start gap-3">
            <span
              className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${tone.dot}`}
            />
            <span className="text-[11px] font-semibold leading-5 text-neutral-300">
              {point}
            </span>
          </div>
        ))}
      </div>
    </article>
  )
}

function PlanCard({ plan }) {
  return (
    <article
      className={`relative flex h-full flex-col rounded-2xl border p-6 ${
        plan.featured
          ? 'border-orange-500/35 bg-orange-500/[0.055]'
          : 'border-white/[0.08] bg-[#101010]'
      }`}
    >
      {plan.featured && (
        <div className="absolute -top-3 left-5 rounded-full border border-orange-300/20 bg-orange-500 px-3 py-1 text-[8px] font-black uppercase tracking-[0.16em] text-black">
          Restaurant + Delivery
        </div>
      )}

      <p className="text-[9px] font-black uppercase tracking-[0.18em] text-neutral-500">
        {plan.label}
      </p>

      <h3 className="mt-2 text-xl font-black tracking-tight text-white">
        {plan.name}
      </h3>

      <p className="mt-3 min-h-[60px] text-[11px] leading-5 text-neutral-500">
        {plan.description}
      </p>

      <div className="mt-5 border-t border-white/[0.07] pt-5">
        <div className="flex items-end gap-2">
          <span className="text-3xl font-black tracking-[-0.04em] text-white">
            {plan.monthly}
          </span>
          <span className="pb-1 text-[10px] font-bold text-neutral-500">
            / month
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
            <div className="text-[8px] font-black uppercase tracking-wider text-neutral-600">
              6 months
            </div>
            <div className="mt-1 text-sm font-black text-neutral-200">
              {plan.sixMonths}
            </div>
          </div>

          <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
            <div className="text-[8px] font-black uppercase tracking-wider text-neutral-600">
              12 months
            </div>
            <div className="mt-1 text-sm font-black text-neutral-200">
              {plan.annual}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 flex-1 space-y-3">
        {plan.features.map((feature) => (
          <div key={feature} className="flex items-start gap-2.5">
            <span className="mt-0.5 text-[11px] font-black text-emerald-400">
              ✓
            </span>
            <span className="text-[10px] font-semibold leading-5 text-neutral-400">
              {feature}
            </span>
          </div>
        ))}
      </div>

      <Link
        href="/register"
        className={`mt-7 inline-flex min-h-11 items-center justify-center rounded-xl px-4 text-[10px] font-black transition ${
          plan.featured
            ? 'bg-orange-500 text-black hover:bg-orange-400'
            : 'bg-white text-black hover:bg-neutral-200'
        }`}
      >
        Start with this plan
      </Link>
    </article>
  )
}

export default function LandingPage() {
  useMobileViewportLock()

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
    <div className="min-h-[100dvh] w-full max-w-full overflow-x-hidden bg-[#090909] text-white selection:bg-orange-500 selection:text-white">
      <style jsx global>{`
        html {
          scroll-behavior: smooth;
          background: #090909;
        }

        body {
          margin: 0;
          background: #090909;
        }

        * {
          box-sizing: border-box;
        }

        ::selection {
          background: #f97316;
          color: #090909;
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

      <div className="border-b border-orange-400/20 bg-orange-500 px-4 py-2 text-center text-[10px] font-black tracking-wide text-black">
        First-time partners get 1 month free
      </div>

      <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#090909]/95 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
          <a href="#" className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-orange-500 text-sm font-black text-black">
              D
            </span>

            <div className="min-w-0">
              <div className="truncate text-sm font-black tracking-tight">
                Digital Dining
              </div>
              <div className="truncate text-[8px] font-bold uppercase tracking-[0.18em] text-neutral-600">
                Restaurant · Delivery · Resort
              </div>
            </div>
          </a>

          <nav className="hidden items-center gap-7 text-[11px] font-bold text-neutral-400 md:flex">
            <a href="#platform" className="transition hover:text-white">
              Platform
            </a>
            <a href="#features" className="transition hover:text-white">
              Features
            </a>
            <a href="#pricing" className="transition hover:text-white">
              Pricing
            </a>
            <Link href="/demo" className="transition hover:text-white">
              Demo
            </Link>
            <a href="#contact" className="transition hover:text-white">
              Contact
            </a>
          </nav>

          <Link
            href="/register"
            className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-white px-4 text-[10px] font-black text-black transition hover:bg-orange-500"
          >
            Start Free
          </Link>
        </div>
      </header>

      <main>
        <section className="relative overflow-hidden border-b border-white/[0.06]">
          <div className="pointer-events-none absolute left-1/2 top-[-320px] h-[620px] w-[620px] -translate-x-1/2 rounded-full bg-orange-500/[0.08] blur-[120px]" />

          <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[0.92fr_1.08fr] lg:px-8 lg:py-24">
            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.035] px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.16em] text-neutral-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                Hospitality operations, in one place
              </div>

              <h1 className="mt-6 max-w-3xl text-4xl font-black leading-[1.03] tracking-[-0.045em] sm:text-5xl lg:text-6xl">
                Restaurant, delivery
                <br />
                <span className="text-orange-500">and resort operations</span>
                <br />
                without the clutter.
              </h1>

              <p className="mt-6 max-w-xl text-sm leading-7 text-neutral-400 sm:text-base">
                Digital Dining brings customer ordering, staff workflows,
                payments, Delivery dispatch and Resort operations into one
                practical platform.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/register"
                  className="inline-flex min-h-12 items-center justify-center rounded-xl bg-orange-500 px-6 text-xs font-black text-black transition hover:bg-orange-400"
                >
                  Start Free
                </Link>

                <Link
                  href="/demo"
                  className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/10 bg-white/[0.025] px-6 text-xs font-black text-white transition hover:bg-white/[0.06]"
                >
                  View Live Demo
                </Link>
              </div>

              <div className="mt-7 flex flex-wrap gap-2">
                {[
                  'QR ordering',
                  'Staff app',
                  'Direct Delivery',
                  'Resort bookings',
                  'Razorpay',
                  'GST-ready billing',
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

            <div className="relative">
              <div className="overflow-hidden rounded-[26px] border border-white/10 bg-[#101010] shadow-2xl shadow-black/50">
                <div className="flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
                  <div>
                    <p className="text-[9px] font-black uppercase tracking-[0.18em] text-neutral-600">
                      Operations overview
                    </p>
                    <p className="mt-1 text-sm font-black">
                      Digital Dining workspace
                    </p>
                  </div>

                  <span className="rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1.5 text-[8px] font-black uppercase tracking-wider text-emerald-300">
                    Live
                  </span>
                </div>

                <div className="grid gap-3 p-4 sm:grid-cols-3 sm:p-5">
                  {[
                    ['Restaurant', '42', 'Orders today', 'orange'],
                    ['Delivery', '08', 'Active orders', 'emerald'],
                    ['Resort', '14', 'Rooms tracked', 'sky'],
                  ].map(([name, value, label, tone]) => {
                    const styles = toneClasses[tone]

                    return (
                      <div
                        key={name}
                        className={`rounded-2xl border ${styles.border} bg-white/[0.02] p-4`}
                      >
                        <div
                          className={`inline-flex rounded-full border px-2.5 py-1 text-[7px] font-black uppercase tracking-[0.14em] ${styles.chip}`}
                        >
                          {name}
                        </div>

                        <div className="mt-5 text-3xl font-black tracking-[-0.04em]">
                          {value}
                        </div>
                        <div className="mt-1 text-[9px] font-bold text-neutral-600">
                          {label}
                        </div>
                      </div>
                    )
                  })}
                </div>

                <div className="border-t border-white/[0.07] p-4 sm:p-5">
                  <div className="rounded-2xl border border-white/[0.07] bg-black/20">
                    {[
                      ['12:08', 'Restaurant', 'New table order received'],
                      ['12:10', 'Delivery', 'Batch ready for driver assignment'],
                      ['12:14', 'Resort', 'Room booking updated'],
                    ].map(([time, module, text]) => (
                      <div
                        key={`${time}-${module}`}
                        className="grid grid-cols-[52px_74px_1fr] gap-2 border-b border-white/[0.06] px-4 py-3 last:border-b-0"
                      >
                        <span className="text-[8px] font-bold text-neutral-600">
                          {time}
                        </span>
                        <span className="text-[8px] font-black text-neutral-400">
                          {module}
                        </span>
                        <span className="text-[9px] font-semibold text-neutral-300">
                          {text}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="absolute -bottom-5 -left-3 hidden w-48 rounded-2xl border border-white/10 bg-[#151515] p-4 shadow-xl lg:block">
                <p className="text-[8px] font-black uppercase tracking-[0.16em] text-neutral-600">
                  App access
                </p>
                <p className="mt-2 text-[11px] font-black">
                  Restaurant Code → Role
                </p>
                <p className="mt-1 text-[9px] leading-4 text-neutral-500">
                  Show only the portals included in that plan.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="border-b border-white/[0.06] bg-[#0c0c0c]">
          <div className="mx-auto grid max-w-7xl grid-cols-2 sm:grid-cols-4">
            {[
              ['QR', 'Customer ordering'],
              ['LIVE', 'Role-based operations'],
              ['COD', 'Delivery payments'],
              ['ROOMS', 'Resort bookings'],
            ].map(([value, label]) => (
              <div
                key={label}
                className="border-b border-r border-white/[0.05] px-4 py-5 text-center sm:border-b-0"
              >
                <div className="text-sm font-black text-white">{value}</div>
                <div className="mt-1 text-[8px] font-bold uppercase tracking-wider text-neutral-600">
                  {label}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section
          id="platform"
          className="mx-auto max-w-7xl scroll-mt-24 px-4 py-20 sm:px-6 lg:px-8"
        >
          <SectionHeading
            eyebrow="The platform"
            title="Choose the modules your business actually needs."
            text="Restaurant, Delivery and Resort are separate operational modules. Your subscription decides which workspaces and staff portals are available."
          />

          <div className="mt-10 grid gap-4 lg:grid-cols-3">
            {productModules.map((item) => (
              <ProductModuleCard key={item.eyebrow} item={item} />
            ))}
          </div>
        </section>

        <section
          id="features"
          className="border-y border-white/[0.06] bg-[#0c0c0c]"
        >
          <div className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
            <SectionHeading
              eyebrow="What is included"
              title="Built around the work your team does every day."
              text="The interface stays simple for each role while the underlying restaurant, Delivery and Resort data remains connected."
            />

            <div className="mt-10 grid gap-px overflow-hidden rounded-2xl border border-white/[0.07] bg-white/[0.07] sm:grid-cols-2 lg:grid-cols-4">
              {featureItems.map((feature) => (
                <article
                  key={feature.number}
                  className="min-h-[210px] bg-[#101010] p-6"
                >
                  <div className="text-[9px] font-black tracking-[0.18em] text-orange-400">
                    {feature.number}
                  </div>

                  <h3 className="mt-8 text-base font-black tracking-tight">
                    {feature.title}
                  </h3>

                  <p className="mt-3 text-[11px] leading-6 text-neutral-500">
                    {feature.text}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-7xl px-4 py-20 sm:px-6 lg:px-8">
          <SectionHeading
            eyebrow="How it works"
            title="One setup, then role-based daily operations."
            text="Digital Dining separates customer access from staff access so each person sees the tools they need."
          />

          <div className="mt-10 grid gap-4 lg:grid-cols-4">
            {workflowSteps.map((item) => (
              <article
                key={item.step}
                className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-5"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500/10 text-[10px] font-black text-orange-400">
                  {item.step}
                </div>

                <h3 className="mt-5 text-sm font-black">{item.title}</h3>

                <p className="mt-2 text-[10px] leading-5 text-neutral-500">
                  {item.text}
                </p>
              </article>
            ))}
          </div>
        </section>

        <section className="border-y border-white/[0.06] bg-[#0c0c0c]">
          <div className="mx-auto grid max-w-7xl items-center gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] lg:px-8">
            <div>
              <SectionHeading
                eyebrow="Mobile operations"
                title="Restaurant Code first. The right portal second."
                text="The staff application starts with the Restaurant Code, verifies the business plan, then shows only the login types available for that restaurant."
              />

              <div className="mt-6 space-y-3">
                {[
                  'Delivery plan → Owner, Manager, Packer, Delivery Boy',
                  'Restaurant plans → Owner, Manager, Waiter, KDS',
                  'Combined plans keep Owner and Manager access to the included workspaces',
                ].map((item) => (
                  <div
                    key={item}
                    className="flex items-start gap-3 text-[11px] font-semibold leading-5 text-neutral-400"
                  >
                    <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-orange-400" />
                    <span>{item}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="rounded-[26px] border border-white/[0.08] bg-[#101010] p-5 sm:p-7">
              <div className="mx-auto max-w-sm">
                <p className="text-center text-[9px] font-black uppercase tracking-[0.18em] text-orange-400">
                  Digital Dine App
                </p>

                <h3 className="mt-2 text-center text-xl font-black">
                  Enter Restaurant Code
                </h3>

                <div className="mt-5 rounded-2xl border border-orange-500/25 bg-black/30 px-4 py-4 text-center text-2xl font-black tracking-[0.35em] text-white">
                  37647
                </div>

                <div className="mt-4 grid grid-cols-2 gap-3">
                  {['Owner', 'Manager', 'Packer', 'Delivery Boy'].map(
                    (role) => (
                      <div
                        key={role}
                        className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4 text-center text-[10px] font-black text-neutral-300"
                      >
                        {role}
                      </div>
                    )
                  )}
                </div>

                <p className="mt-4 text-center text-[8px] font-semibold leading-4 text-neutral-600">
                  Example shown for a Delivery-only subscription.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section
          id="pricing"
          className="mx-auto max-w-7xl scroll-mt-24 px-4 py-20 sm:px-6 lg:px-8"
        >
          <SectionHeading
            eyebrow="Pricing"
            title="Five plans. Pick the operating model that matches your business."
            text="Monthly, 6-month and 12-month subscription options are shown below. First-time partners get 1 month free."
            centered
          />

          <div className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {plans.map((plan) => (
              <PlanCard key={plan.key} plan={plan} />
            ))}
          </div>

          <div className="mt-5 rounded-2xl border border-white/[0.07] bg-white/[0.02] px-5 py-4 text-center text-[9px] font-semibold leading-5 text-neutral-600">
            Plan access is enforced by the selected subscription. Payment
            details and applicable billing information are shown before
            checkout.
          </div>
        </section>

        <section
          id="demo"
          className="border-y border-white/[0.06] bg-[#0c0c0c]"
        >
          <div className="mx-auto flex max-w-7xl flex-col gap-7 px-4 py-16 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
            <div>
              <p className="text-[9px] font-black uppercase tracking-[0.2em] text-emerald-400">
                Product demo
              </p>

              <h2 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">
                See the role-based experience before you start.
              </h2>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-neutral-500">
                Explore the existing demo experience, then choose the plan
                that matches your Restaurant, Delivery or Resort operation.
              </p>
            </div>

            <Link
              href="/demo"
              className="inline-flex min-h-12 shrink-0 items-center justify-center rounded-xl bg-white px-6 text-xs font-black text-black transition hover:bg-orange-500"
            >
              Open Demo Center
            </Link>
          </div>
        </section>

        <section id="contact" className="scroll-mt-24">
          <div className="mx-auto max-w-5xl px-4 py-20 text-center sm:px-6">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-orange-400">
              Talk to us
            </p>

            <h2 className="mx-auto mt-3 max-w-3xl text-3xl font-black tracking-[-0.035em] sm:text-5xl">
              Tell us how your business operates.
            </h2>

            <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-neutral-500">
              Restaurant only, Delivery only, Resort operations or a combined
              setup — we can help you choose the right Digital Dining plan.
            </p>

            <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
              <a
                href={`mailto:${CONTACT_EMAIL}?subject=Digital%20Dining%20Enquiry`}
                className="inline-flex min-h-12 items-center justify-center rounded-xl bg-orange-500 px-6 text-xs font-black text-black transition hover:bg-orange-400"
              >
                Message Digital Dining
              </a>

              <Link
                href="/register"
                className="inline-flex min-h-12 items-center justify-center rounded-xl border border-white/10 px-6 text-xs font-black text-white transition hover:bg-white/[0.05]"
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

      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-7xl flex-col gap-5 px-4 py-8 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500 text-xs font-black text-black">
              D
            </span>
            <div>
              <div className="text-xs font-black">Digital Dining</div>
              <div className="mt-0.5 text-[8px] font-bold uppercase tracking-[0.16em] text-neutral-700">
                Restaurant · Delivery · Resort
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-5 text-[9px] font-bold text-neutral-600">
            <a href="#platform" className="hover:text-white">
              Platform
            </a>
            <a href="#features" className="hover:text-white">
              Features
            </a>
            <a href="#pricing" className="hover:text-white">
              Pricing
            </a>
            <Link href="/demo" className="hover:text-white">
              Demo
            </Link>
            <a href="#contact" className="hover:text-white">
              Contact
            </a>
            <Link href="/privacy-policy" className="hover:text-white">
              Privacy
            </Link>
          </div>

          <div className="text-[9px] font-bold text-neutral-700">
            © 2026 Digital Dining
          </div>
        </div>
      </footer>

      {privacyReady && showPrivacyNotice && (
        <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] left-1/2 z-[9999] w-[calc(100%-2rem)] max-w-md -translate-x-1/2">
          <div className="rounded-2xl border border-white/10 bg-[#151515] p-4 shadow-2xl shadow-black/50">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-orange-500/20 bg-orange-500/10 text-[10px] font-black text-orange-400">
                PR
              </div>

              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold">Privacy</div>

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
                    className="min-h-10 rounded-lg bg-white px-4 text-[10px] font-black text-black transition hover:bg-orange-500"
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
