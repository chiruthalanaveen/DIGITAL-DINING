'use client'

import Link from 'next/link'

import { useEffect, useState, type ReactNode } from 'react'

import InstallAppButton from '@/app/components/InstallAppButton'

const CONTACT_EMAIL = 'digitaldining077@gmail.com'

// Replace this with your actual support number.

const SUPPORT_PHONE = ''

const SUPPORT_PHONE_LINK = SUPPORT_PHONE.replace(/[^\d+]/g, '')

const modules = [

  {

    number: '01',

    name: 'Restaurant',

    eyebrow: 'Restaurant operations',

    description:

      'QR ordering, Dine-In, Parcel, staff workflows, payments, billing and menu management in one connected workspace.',

    features: [

      'QR menu & mobile ordering',

      'Dine-In & Parcel',

      'Owner, Manager, Waiter & KDS',

      'Restaurant-specific Razorpay',

      'GST-ready billing & digital invoices',

      'Offers, reports & Highly Reordered items',

      'Realtime staff operations',

    ],

  },

  {

    number: '02',

    name: 'DD MART Delivery',

    eyebrow: 'Direct local delivery',

    description:

      'Sell through DD MART with a connected delivery storefront, inventory, packing, riders, payments, tracking, support and returns.',

    features: [

      'Food, Groceries, Fruits & Vegetables',

      'COD & Razorpay',

      'Customer address & two mobile numbers',

      'Live location & delivery radius',

      'Minimum order delivery fee',

      'Transparent platform fees and packing charges',

      'Demand-based surge pricing',

      'Packer & Delivery Boy portals',

      'Automatic driver assignment',

      'Live tracking & delivery proof',

      'Inventory & barcode scanning',

      'Returns, replacements & Live Support',

      'COD cash reconciliation',

    ],

  },


]

const featureItems = [
  { title: 'Effortless QR Ordering', text: 'A smooth digital menu and ordering experience for dine-in and takeaway guests.' },
  { title: 'One Connected Workspace', text: 'Bring your owners, managers, kitchen and service teams together.' },
  { title: 'Smart Inventory', text: 'Keep stock, product availability and packing workflows organized.' },
  { title: 'Delivery, Simplified', text: 'Manage local orders, dispatch and delivery tracking with DD MART.' },
  { title: 'Payments & Billing', text: 'Support secure checkout, billing records and COD reconciliation.' },
  { title: 'Built for Your Business', text: 'Access the right tools for each team through dedicated business portals.' },
]

type ContainerProps = {
  children: ReactNode
  className?: string
}

type SectionHeadingProps = {
  eyebrow: string
  title: string
  text?: string
  centered?: boolean
}

function Container({ children, className = '' }: ContainerProps) {

  return (

    <div

      className={`mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8 ${className}`}

    >

      {children}

    </div>

  )

}

function SectionHeading({ eyebrow, title, text, centered = false }: SectionHeadingProps) {

  return (

    <div

      className={

        centered

          ? 'mx-auto max-w-2xl text-center'

          : 'max-w-2xl'

      }

    >

      <p className="text-[10px] font-black uppercase tracking-[0.24em] text-orange-600">

        {eyebrow}

      </p>

      <h2 className="mt-3 text-3xl font-black tracking-[-0.04em] text-neutral-950 sm:text-4xl">

        {title}

      </h2>

      {text ? (

        <p className="mt-4 text-sm leading-7 text-neutral-600">

          {text}

        </p>

      ) : null}

    </div>

  )

}

export default function LandingPage() {

  const [privacyReady, setPrivacyReady] =

    useState(false)

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

      // Ignore unavailable localStorage.

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

      // Ignore unavailable localStorage.

    }

    setShowPrivacyNotice(false)

  }

  return (

    <div className="min-h-screen bg-[#f7f7f5] text-neutral-950 selection:bg-orange-200 selection:text-neutral-950">

      <style jsx global>{`

        html {

          scroll-behavior: smooth;

        }

        body {

          margin: 0;

          background: #f7f7f5;

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

      {/* Header */}

      <header className="sticky top-0 z-50 border-b border-neutral-200/80 bg-[#f7f7f5]/95 backdrop-blur-xl">

        <Container className="flex min-h-16 items-center justify-between gap-2">

          <Link

            href="/"

            className="flex min-w-0 items-center gap-2.5"

          >

            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neutral-950 text-[10px] font-black text-white">

              DD

            </div>

            <div className="min-w-0">

              <p className="truncate text-xs font-black sm:text-sm">

                Digital Dine-In

              </p>

              <p className="hidden text-[8px] font-bold uppercase tracking-[0.14em] text-neutral-400 sm:block">

                Restaurant · DD MART

              </p>

            </div>

          </Link>

          <nav className="hidden items-center gap-6 text-[10px] font-bold text-neutral-500 lg:flex">

            <a

              href="#platform"

              className="transition hover:text-neutral-950"

            >

              Platform

            </a>

            <a

              href="#features"

              className="transition hover:text-neutral-950"

            >

              Features

            </a>

            <a

              href="#pricing"

              className="transition hover:text-neutral-950"

            >

              Pricing

            </a>

            <a

              href="#support"

              className="transition hover:text-neutral-950"

            >

              Support

            </a>

          </nav>

          <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">

            <Link

              href="/login"

              className="inline-flex min-h-9 items-center justify-center rounded-lg border border-neutral-300 bg-white px-2.5 text-[8px] font-black text-neutral-900 transition hover:border-neutral-400 sm:min-h-10 sm:rounded-xl sm:px-4 sm:text-[10px]"

            >

              Login

            </Link>

            <InstallAppButton

              label="Install APP"

              className="min-h-9 rounded-lg bg-neutral-950 px-2.5 text-[8px] font-black text-white transition hover:bg-neutral-800 disabled:cursor-default disabled:opacity-70 sm:min-h-10 sm:rounded-xl sm:px-4 sm:text-[10px]"

            />

            <Link

              href="/register"

              className="inline-flex min-h-9 items-center justify-center rounded-lg bg-orange-500 px-2.5 text-[8px] font-black text-neutral-950 transition hover:bg-orange-400 sm:min-h-10 sm:rounded-xl sm:px-4 sm:text-[10px]"

            >

              Register

            </Link>

          </div>

        </Container>

      </header>

      <main>

        {/* Hero */}

        <section className="border-b border-neutral-200">

          <Container className="grid gap-10 py-14 sm:py-20 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-24">

            <div>

              <div className="inline-flex items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 py-1.5 shadow-sm">

                <span className="h-1.5 w-1.5 rounded-full bg-orange-500" />

                <span className="text-[9px] font-black uppercase tracking-[0.16em] text-neutral-600">

                  One operations platform

                </span>

              </div>

              <h1 className="mt-6 max-w-3xl text-4xl font-black leading-[1.02] tracking-[-0.05em] text-neutral-950 sm:text-5xl lg:text-6xl">

                Restaurant,

                <br />

                DD MART Delivery

                <br />

                <span className="text-neutral-400">

                  without the clutter.

                </span>

              </h1>

              <p className="mt-6 max-w-2xl text-sm leading-7 text-neutral-600 sm:text-base">

                Digital Dine-In connects QR ordering, staff operations,

                inventory, direct Delivery, dispatch, payments, billing,

                support and connected business workflows in one clean system.

              </p>

              <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:flex-wrap">

                <Link

                  href="/register"

                  className="inline-flex min-h-12 items-center justify-center rounded-xl bg-orange-500 px-6 text-xs font-black text-neutral-950 transition hover:bg-orange-400"

                >

                  Get Started

                </Link>

                <InstallAppButton

                  label="Install APP"

                  className="min-h-12 rounded-xl bg-neutral-950 px-6 text-xs font-black text-white transition hover:bg-neutral-800 disabled:cursor-default disabled:opacity-70"

                />

                <Link

                  href="/login"

                  className="inline-flex min-h-12 items-center justify-center rounded-xl border border-neutral-300 bg-white px-6 text-xs font-black text-neutral-900 transition hover:bg-neutral-50"

                >

                  Restaurant Login

                </Link>

              </div>

              <div className="mt-7 flex flex-wrap gap-2">

                {[

                  'QR ordering',

                  'COD & Razorpay',

                  'Inventory',

                  'Role portals',

                  'Digital Dine Partner',
                  'DD MART customer app',

                ].map((item) => (

                  <span

                    key={item}

                    className="rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-[9px] font-bold text-neutral-500"

                  >

                    {item}

                  </span>

                ))}

              </div>

            </div>

            <div className="rounded-[32px] border border-neutral-200 bg-white p-5 shadow-[0_20px_60px_rgba(0,0,0,0.06)] sm:p-6">

              <div className="flex items-center justify-between border-b border-neutral-100 pb-4">

                <div>

                  <p className="text-[9px] font-black uppercase tracking-[0.17em] text-orange-600">

                    Digital Dine-In

                  </p>

                  <h2 className="mt-1 text-lg font-black">

                    Business Overview

                  </h2>

                </div>

                <span className="rounded-full bg-emerald-50 px-3 py-1.5 text-[8px] font-black text-emerald-700">

                  OVERVIEW

                </span>

              </div>

              <div className="mt-4 grid gap-3">

                {[

                  ['Restaurant', 'QR menu · Billing · Staff'],

                  ['DD MART', 'Stores · Dispatch · Tracking'],


                  ['Partner Portal', 'Restaurant Code · Role access'],

                ].map(([title, description]) => (

                  <div

                    key={title}

                    className="flex items-center justify-between gap-4 rounded-2xl bg-neutral-50 p-4"

                  >

                    <div>

                      <p className="text-xs font-black text-neutral-950">

                        {title}

                      </p>

                      <p className="mt-1 text-[9px] font-medium text-neutral-500">

                        {description}

                      </p>

                    </div>

                    <span className="text-sm font-black text-neutral-300">

                      →

                    </span>

                  </div>

                ))}

              </div>

            </div>

          </Container>

        </section>

        {/* Platform */}

        <section

          id="platform"

          className="scroll-mt-20 border-b border-neutral-200 bg-white"

        >

          <Container className="py-14 sm:py-20">

            <SectionHeading

              eyebrow="Platform"

              title="Two connected solutions. One platform."

              text="Use only the modules your business needs while keeping operations connected."

            />

            <div className="mt-8 grid gap-4 lg:grid-cols-2">

              {modules.map((module) => (

                <article

                  key={module.name}

                  className="rounded-[28px] border border-neutral-200 bg-[#fafaf8] p-6"

                >

                  <div className="flex items-start justify-between gap-4">

                    <span className="text-[10px] font-black text-neutral-400">

                      {module.number}

                    </span>

                    <span className="rounded-full border border-neutral-200 bg-white px-3 py-1 text-[8px] font-black uppercase tracking-[0.14em] text-neutral-500">

                      {module.eyebrow}

                    </span>

                  </div>

                  <h3 className="mt-5 text-2xl font-black tracking-tight">

                    {module.name}

                  </h3>

                  <p className="mt-3 text-[11px] leading-6 text-neutral-500">

                    {module.description}

                  </p>

                  <div className="mt-5 space-y-2.5 border-t border-neutral-200 pt-5">

                    {module.features.map((feature) => (

                      <div

                        key={feature}

                        className="flex items-start gap-2.5"

                      >

                        <span className="mt-[2px] text-[10px] font-black text-orange-600">

                          ✓

                        </span>

                        <span className="text-[10px] leading-5 text-neutral-600">

                          {feature}

                        </span>

                      </div>

                    ))}

                  </div>

                </article>

              ))}

            </div>

          </Container>

        </section>

        {/* Features */}

        <section

          id="features"

          className="scroll-mt-20 border-b border-neutral-200"

        >

          <Container className="py-14 sm:py-20">

            <SectionHeading

              eyebrow="Current Platform"

              title="Everything works better together."

              text="A practical operational system for ordering, inventory, dispatch, staff access, customer support and billing."

            />

            <div className="mt-8 grid overflow-hidden rounded-[28px] border border-neutral-200 bg-neutral-200 sm:grid-cols-2 lg:grid-cols-3">

              {featureItems.map(

                (feature, index) => (

                  <article

                    key={feature.title}

                    className="bg-white p-5"

                  >

                    <p className="text-[9px] font-black text-orange-600">

                      {String(

                        index + 1

                      ).padStart(

                        2,

                        '0'

                      )}

                    </p>

                    <h3 className="mt-3 text-sm font-black text-neutral-950">

                      {feature.title}

                    </h3>

                    <p className="mt-2 text-[10px] leading-5 text-neutral-500">

                      {feature.text}

                    </p>

                  </article>

                )

              )}

            </div>

          </Container>

        </section>

        {/* Offer */}

        <section className="border-b border-neutral-200 bg-neutral-950 text-white">

          <Container className="grid gap-6 py-12 lg:grid-cols-[1fr_auto] lg:items-center">

            <div>

              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-400">

                Digital Dine Business Platform

              </p>

              <h2 className="mt-2 text-3xl font-black tracking-tight">

                Manage your business from one platform.

              </h2>

              <p className="mt-3 max-w-2xl text-sm leading-7 text-neutral-400">

                Bring restaurant operations, customer ordering, delivery and staff workflows together with Digital Dine.

              </p>

            </div>

            <Link

              href="/register"

              className="inline-flex min-h-12 items-center justify-center rounded-xl bg-orange-500 px-6 text-xs font-black text-neutral-950 transition hover:bg-orange-400"

            >

              Start Registration

            </Link>

          </Container>

        </section>

        {/* Flexible plans and onboarding — no public per-order rates */}
        <section id="pricing" className="scroll-mt-20 border-b border-neutral-200 bg-white">
          <Container className="py-14 sm:py-20">
            <SectionHeading
              eyebrow="Solutions"
              title="Designed around your business."
              text="A refined, connected experience for restaurants and local commerce."
              centered
            />
            <div className="mx-auto mt-10 grid max-w-5xl gap-5 md:grid-cols-2">
              {[
                { name: 'Restaurant QR Ordering', detail: 'QR menus, dine-in and parcel ordering, restaurant dashboards, kitchen and staff workflows.' },
                { name: 'DD MART Delivery', detail: 'Local food and grocery storefronts with inventory, packing, dispatch, payments and tracking.' },
              ].map((item) => (
                <article key={item.name} className="flex flex-col rounded-[28px] border border-neutral-200 bg-[#fafaf8] p-7 shadow-sm">
                  <h3 className="text-xl font-black text-neutral-950">{item.name}</h3>
                  <p className="mt-4 flex-1 text-sm leading-7 text-neutral-600">{item.detail}</p>
                  <Link href="/register" className="mt-7 inline-flex min-h-12 items-center justify-center rounded-xl bg-neutral-950 px-6 text-xs font-black text-white transition hover:bg-neutral-800">Get Started →</Link>
                </article>
              ))}
            </div>
            <div className="mx-auto mt-5 flex max-w-5xl flex-col items-start justify-between gap-4 rounded-[24px] border border-neutral-200 p-6 sm:flex-row sm:items-center">
              <div><h3 className="text-lg font-black">Need a custom setup?</h3><p className="mt-1 text-xs text-neutral-600">Tell us which business features you need and our team will help you get started.</p></div>
              <Link href="/custom-plan" className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-xl bg-orange-500 px-5 text-xs font-black text-neutral-950">Build My Plan →</Link>
            </div>
          </Container>
        </section>

        {/* Two application experiences */}
        <section id="apps" className="border-b border-neutral-200 bg-neutral-950 text-white">
          <Container className="py-14 sm:py-20">
            <div className="max-w-2xl"><p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-400">Connected applications</p><h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Two apps. One connected platform.</h2><p className="mt-4 text-sm leading-7 text-neutral-400">Separate experiences for business teams and customers, connected to the same Digital Dine operations platform. Android releases are in preparation.</p></div>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <article className="rounded-[26px] border border-white/15 bg-white/5 p-6"><span className="text-xs font-black text-orange-400">DIGITAL DINE PARTNER</span><h3 className="mt-3 text-xl font-black">Your business, organized.</h3><p className="mt-3 text-sm leading-7 text-neutral-300">Restaurant owners, managers, kitchen teams, waiters, packers and riders access the portals allowed for their business.</p><Link href="/app" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-white px-5 text-xs font-black text-neutral-950">Open Partner Portal →</Link></article>
              <article className="rounded-[26px] border border-white/15 bg-white/5 p-6"><span className="text-xs font-black text-orange-400">DD MART</span><h3 className="mt-3 text-xl font-black">Local shopping, made easy.</h3><p className="mt-3 text-sm leading-7 text-neutral-300">Customers browse available stores, order food or groceries, choose supported payment methods and track their deliveries.</p><Link href="/delivery" className="mt-6 inline-flex min-h-11 items-center rounded-xl bg-orange-500 px-5 text-xs font-black text-neutral-950">Explore DD MART →</Link></article>
            </div>
          </Container>
        </section>

        {/* APP */}

        <section className="border-b border-neutral-200">

          <Container className="py-14 sm:py-20">

            <div className="grid overflow-hidden rounded-[32px] border border-neutral-200 bg-white lg:grid-cols-[1fr_360px]">

              <div className="p-6 sm:p-8 lg:p-10">

                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-orange-600">

                  Digital Dine Partner

                </p>

                <h2 className="mt-3 max-w-2xl text-3xl font-black tracking-[-0.04em]">

                  A dedicated Partner portal for your team.

                </h2>

                <p className="mt-4 max-w-2xl text-sm leading-7 text-neutral-600">

                  Open the APP, enter the 5-digit Restaurant Code and Digital

                  Dine-In shows the allowed portals for that active

                  subscription.

                </p>

                <div className="mt-5 flex flex-wrap gap-2">

                  {[

                    'Owner',

                    'Manager',

                    'Waiter',

                    'Kitchen',

                    'Packer',

                    'Delivery Boy',

                  ].map((role) => (

                    <span

                      key={role}

                      className="rounded-full border border-neutral-200 bg-neutral-50 px-3 py-1.5 text-[9px] font-bold text-neutral-600"

                    >

                      {role}

                    </span>

                  ))}

                </div>

              </div>

              <div className="flex flex-col justify-center gap-3 border-t border-neutral-200 bg-neutral-50 p-6 lg:border-l lg:border-t-0">

                <InstallAppButton

                  label="Install APP"

                  className="min-h-12 rounded-xl bg-neutral-950 px-6 text-xs font-black text-white disabled:cursor-default disabled:opacity-70"

                />

                <Link

                  href="/login"

                  className="inline-flex min-h-12 items-center justify-center rounded-xl border border-neutral-300 bg-white px-6 text-xs font-black text-neutral-900"

                >

                  Restaurant Login

                </Link>

              </div>

            </div>

          </Container>

        </section>

        {/* Support */}

        <section

          id="support"

          className="scroll-mt-20"

        >

          <Container className="py-14 sm:py-20">

            <SectionHeading

              eyebrow="Contact & Support"

              title="Need help getting started?"

              text="Contact Digital Dine-In for registration, onboarding, setup and platform support."

            />

            <div className="mt-8 grid gap-4 md:grid-cols-2">

              <a

                href={`mailto:${CONTACT_EMAIL}`}

                className="group rounded-[24px] border border-neutral-200 bg-white p-6 transition hover:border-neutral-300 hover:shadow-md"

              >

                <p className="text-[9px] font-black uppercase tracking-[0.16em] text-neutral-400">

                  Email

                </p>

                <p className="mt-3 break-all text-sm font-black text-neutral-950">

                  {CONTACT_EMAIL}

                </p>

                <p className="mt-3 text-[10px] font-bold text-orange-600">

                  Send email →

                </p>

              </a>

              <a

                href={`tel:${SUPPORT_PHONE_LINK}`}

                className="group rounded-[24px] border border-neutral-200 bg-white p-6 transition hover:border-neutral-300 hover:shadow-md"

              >

                <p className="text-[9px] font-black uppercase tracking-[0.16em] text-neutral-400">

                  Support Number

                </p>

                <p className="mt-3 text-sm font-black text-neutral-950">

                  {SUPPORT_PHONE || 'Contact us by email'}

                </p>

                <p className="mt-3 text-[10px] font-bold text-orange-600">

                  Contact support →

                </p>

              </a>

            </div>

            <div className="mt-6 flex flex-col gap-3 sm:flex-row">

              <Link

                href="/register"

                className="inline-flex min-h-11 items-center justify-center rounded-xl bg-orange-500 px-5 text-[10px] font-black text-neutral-950"

              >

                Register

              </Link>

              <InstallAppButton

                label="Install APP"

                className="min-h-11 rounded-xl bg-neutral-950 px-5 text-[10px] font-black text-white disabled:cursor-default disabled:opacity-70"

              />

              <Link

                href="/login"

                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-neutral-300 bg-white px-5 text-[10px] font-black text-neutral-900"

              >

                Restaurant Login

              </Link>

            </div>

          </Container>

        </section>

      </main>

      {/* Footer */}

      <footer className="border-t border-neutral-200 bg-white">

        <Container className="flex flex-col gap-5 py-8 text-center md:flex-row md:items-center md:justify-between md:text-left">

          <div className="flex items-center justify-center gap-3 md:justify-start">

            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-950 text-[9px] font-black text-white">

              DD

            </div>

            <div>

              <p className="text-xs font-black">

                Digital Dine-In

              </p>

              <p className="mt-0.5 text-[8px] font-bold text-neutral-400">

                Restaurant · DD MART

              </p>

            </div>

          </div>

          <div className="flex flex-wrap justify-center gap-5 text-[9px] font-bold text-neutral-500">

            <Link

              href="/login"

              className="hover:text-neutral-950"

            >

              Open APP

            </Link>

            <Link

              href="/register"

              className="hover:text-neutral-950"

            >

              Register

            </Link>

            <a

              href="#pricing"

              className="hover:text-neutral-950"

            >

              Pricing

            </a>

            <a

              href="#support"

              className="hover:text-neutral-950"

            >

              Support

            </a>

            <Link

              href="/privacy-policy"

              className="hover:text-neutral-950"

            >

              Privacy

            </Link>

          </div>

          <p className="text-[9px] font-medium text-neutral-400">

            © {new Date().getFullYear()} Digital Dine-In

          </p>

        </Container>

      </footer>

      {/* Floating side Install APP button */}

      <div className="fixed bottom-5 right-4 z-40 sm:bottom-auto sm:right-0 sm:top-1/2 sm:-translate-y-1/2">

        <InstallAppButton

          label="Install APP"

          className="min-h-11 rounded-xl bg-neutral-950 px-4 text-[10px] font-black text-white shadow-xl transition hover:bg-neutral-800 disabled:cursor-default disabled:opacity-70 sm:rounded-l-xl sm:rounded-r-none sm:px-3 sm:py-4 sm:[writing-mode:vertical-rl]"

        />

      </div>

      {/* Privacy */}

      {privacyReady &&

      showPrivacyNotice ? (

        <div className="fixed inset-x-3 bottom-3 z-[9999] mx-auto max-w-md">

          <div className="rounded-[22px] border border-neutral-200 bg-white p-4 shadow-2xl">

            <div className="flex items-start gap-3">

              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-sm">

                🔒

              </div>

              <div className="min-w-0 flex-1">

                <p className="text-xs font-black">

                  Privacy

                </p>

                <p className="mt-1 text-[10px] leading-5 text-neutral-500">

                  We use essential browser storage and security technologies

                  required for Digital Dine-In. Read our{' '}

                  <Link

                    href="/privacy-policy"

                    className="font-black text-orange-600"

                  >

                    Privacy Policy

                  </Link>

                  .

                </p>

                <div className="mt-3 flex justify-end">

                  <button

                    type="button"

                    onClick={acceptPrivacy}

                    className="rounded-lg bg-neutral-950 px-4 py-2 text-[10px] font-black text-white"

                  >

                    Accept

                  </button>

                </div>

              </div>

            </div>

          </div>

        </div>

      ) : null}

    </div>

  )

}
