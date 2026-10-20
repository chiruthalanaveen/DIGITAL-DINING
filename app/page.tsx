'use client'

import Link from 'next/link'
import { useEffect, useState, type ReactNode } from 'react'
import InstallAppButton from '@/app/components/InstallAppButton'

const CONTACT_EMAIL = 'digitaldining077@gmail.com'

// Add your support number here when ready.
const SUPPORT_PHONE = ' +91 8499076735'
const SUPPORT_PHONE_LINK = SUPPORT_PHONE.replace(/[^\d+]/g, '')

const restaurantFeatures = [
  'QR menu & mobile ordering',
  'Dine-In & Parcel orders',
  'Owner, Manager, Waiter & Kitchen (KDS) access',
  'Restaurant-specific Razorpay payments',
  'GST-ready billing & digital invoices',
  'Offers, reports & highly reordered items',
  'Realtime staff operations',
]

const martFeatures = [
  'Food, groceries, fruits & vegetables',
  'COD & Razorpay payments',
  'Live location & delivery radius',
  'Packer & Delivery Boy portals',
  'Automatic driver assignment',
  'Live tracking & delivery proof',
  'Inventory & barcode scanning',
  'Returns, replacements & live support',
  'COD cash reconciliation',
]

const steps = [
  { title: 'Register', text: 'Create your restaurant account with your business details.' },
  { title: 'Get approved', text: 'Our team reviews your registration and sets up your workspace.' },
  { title: 'Start operating', text: 'Invite your team, share your menu and start taking orders.' },
]

const roles = ['Owner', 'Manager', 'Waiter', 'Kitchen', 'Packer', 'Delivery Boy']

function Container({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className={`mx-auto w-full max-w-6xl px-5 sm:px-8 ${className}`}>{children}</div>
}

function Eyebrow({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <p
      className={`text-xs font-bold uppercase tracking-[0.18em] ${
        light ? 'text-orange-400' : 'text-orange-600'
      }`}
    >
      {children}
    </p>
  )
}

function CheckItem({ children, light = false }: { children: ReactNode; light?: boolean }) {
  return (
    <li className="flex items-start gap-3">
      <span
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-black ${
          light ? 'bg-orange-500/20 text-orange-400' : 'bg-orange-100 text-orange-700'
        }`}
        aria-hidden="true"
      >
        ✓
      </span>
      <span className={`text-sm leading-6 ${light ? 'text-neutral-300' : 'text-neutral-700'}`}>
        {children}
      </span>
    </li>
  )
}

export default function LandingPage() {
  const [privacyReady, setPrivacyReady] = useState(false)
  const [showPrivacyNotice, setShowPrivacyNotice] = useState(false)

  useEffect(() => {
    try {
      const accepted = localStorage.getItem('digitaldining_privacy_accepted')
      if (!accepted) setShowPrivacyNotice(true)
    } catch {
      // Ignore unavailable localStorage.
    }
    setPrivacyReady(true)
  }, [])

  const acceptPrivacy = () => {
    try {
      localStorage.setItem('digitaldining_privacy_accepted', 'true')
    } catch {
      // Ignore unavailable localStorage.
    }
    setShowPrivacyNotice(false)
  }

  return (
    <div className="min-h-screen bg-[#f7f7f5] text-neutral-950 selection:bg-orange-200">
      <style jsx global>{`
        html {
          scroll-behavior: smooth;
        }
        body {
          margin: 0;
          background: #f7f7f5;
        }
        *,
        *::before,
        *::after {
          box-sizing: border-box;
        }
        @media (prefers-reduced-motion: reduce) {
          html {
            scroll-behavior: auto;
          }
        }
      `}</style>

      {/* HEADER */}
      <header className="sticky top-0 z-50 border-b border-neutral-200 bg-[#f7f7f5]/95 backdrop-blur-md">
        <Container className="flex h-16 items-center justify-between gap-3">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neutral-950 text-xs font-black text-white">
              DD
            </span>
            <span className="truncate text-sm font-black">Digital Dine-In</span>
          </Link>

          <nav className="hidden items-center gap-6 text-sm font-semibold text-neutral-600 md:flex">
            <a href="#how" className="hover:text-neutral-950">How it works</a>
            <a href="#features" className="hover:text-neutral-950">Features</a>
            <a href="#support" className="hover:text-neutral-950">Support</a>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <Link
              href="/login"
              className="inline-flex h-10 items-center rounded-xl border border-neutral-300 bg-white px-3.5 text-xs font-bold hover:border-neutral-400 sm:px-4 sm:text-sm"
            >
              Login
            </Link>
            <Link
              href="/register"
              className="inline-flex h-10 items-center rounded-xl bg-orange-500 px-3.5 text-xs font-bold text-neutral-950 hover:bg-orange-400 sm:px-4 sm:text-sm"
            >
              Register
            </Link>
          </div>
        </Container>
      </header>

      <main>
        {/* HERO */}
        <section className="border-b border-neutral-200">
          <Container className="grid gap-12 py-16 sm:py-20 lg:grid-cols-2 lg:items-center lg:py-28">
            <div>
              <Eyebrow>One platform for restaurants</Eyebrow>
              <h1 className="mt-4 text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                Run your restaurant and local delivery <span className="text-orange-500">from one place.</span>
              </h1>
              <p className="mt-6 max-w-xl text-base leading-7 text-neutral-600">
                Digital Dine-In brings QR ordering, staff workflows, billing, payments and direct
                delivery through DD MART into one simple system your whole team can use.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/register"
                  className="inline-flex h-12 items-center justify-center rounded-xl bg-orange-500 px-6 text-sm font-bold text-neutral-950 shadow-sm hover:bg-orange-400"
                >
                  Get started
                </Link>
                <Link
                  href="/login"
                  className="inline-flex h-12 items-center justify-center rounded-xl border border-neutral-300 bg-white px-6 text-sm font-bold hover:bg-neutral-50"
                >
                  Restaurant login
                </Link>
                <InstallAppButton
                  label="Install app"
                  className="h-12 rounded-xl bg-neutral-950 px-6 text-sm font-bold text-white hover:bg-neutral-800 disabled:cursor-default disabled:opacity-70"
                />
              </div>
            </div>

            {/* Summary card */}
            <div className="rounded-3xl border border-neutral-200 bg-white p-6 shadow-xl shadow-neutral-200/60 sm:p-8">
              <p className="text-sm font-bold text-neutral-500">Business overview</p>
              <div className="mt-5 space-y-3">
                {[
                  ['Restaurant', 'QR menu, billing and staff tools'],
                  ['DD MART', 'Local storefronts, dispatch and tracking'],
                  ['Partner app', 'Role-based access for your team'],
                ].map(([title, desc]) => (
                  <div key={title} className="flex items-center justify-between gap-4 rounded-2xl bg-neutral-50 p-4">
                    <div>
                      <p className="font-bold">{title}</p>
                      <p className="mt-1 text-sm text-neutral-500">{desc}</p>
                    </div>
                    <span className="text-lg font-bold text-neutral-300" aria-hidden="true">→</span>
                  </div>
                ))}
              </div>
            </div>
          </Container>
        </section>

        {/* ABOUT / WHO IT'S FOR */}
        <section className="border-b border-neutral-200 bg-white">
          <Container className="py-16 sm:py-20">
            <div className="max-w-2xl">
              <Eyebrow>What we do</Eyebrow>
              <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                Built for restaurants and the customers they serve.
              </h2>
              <p className="mt-4 text-base leading-7 text-neutral-600">
                Restaurant owners get the tools to take orders, manage their team and get paid.
                Customers get a simple way to order food and groceries nearby and track every delivery.
              </p>
            </div>

            <div className="mt-12 grid gap-6 md:grid-cols-2">
              <article className="rounded-3xl border border-neutral-200 bg-[#fafaf8] p-7 sm:p-8">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-400">For restaurants</p>
                <h3 className="mt-3 text-2xl font-black">Digital Dine-In</h3>
                <p className="mt-3 text-sm leading-7 text-neutral-600">
                  Everything your restaurant needs to run daily operations in one connected workspace.
                </p>
                <ul className="mt-6 space-y-3">
                  {restaurantFeatures.map((f) => (
                    <CheckItem key={f}>{f}</CheckItem>
                  ))}
                </ul>
              </article>

              <article className="rounded-3xl border border-neutral-200 bg-[#fafaf8] p-7 sm:p-8">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-400">For local delivery</p>
                <h3 className="mt-3 text-2xl font-black">DD MART</h3>
                <p className="mt-3 text-sm leading-7 text-neutral-600">
                  A direct delivery storefront connecting local stores with customers nearby.
                </p>
                <ul className="mt-6 space-y-3">
                  {martFeatures.map((f) => (
                    <CheckItem key={f}>{f}</CheckItem>
                  ))}
                </ul>
              </article>
            </div>
          </Container>
        </section>

        {/* HOW IT WORKS */}
        <section id="how" className="scroll-mt-20 border-b border-neutral-200">
          <Container className="py-16 sm:py-20">
            <div className="max-w-2xl">
              <Eyebrow>How it works</Eyebrow>
              <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Three steps to get started.</h2>
            </div>
            <ol className="mt-12 grid gap-5 md:grid-cols-3">
              {steps.map((step, i) => (
                <li key={step.title} className="rounded-3xl border border-neutral-200 bg-white p-7">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-neutral-950 text-sm font-black text-white">
                    {i + 1}
                  </span>
                  <h3 className="mt-5 text-lg font-black">{step.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-neutral-600">{step.text}</p>
                </li>
              ))}
            </ol>
          </Container>
        </section>

        {/* PARTNER APP */}
        <section className="border-b border-neutral-200 bg-neutral-950 text-white">
          <Container className="grid gap-10 py-16 sm:py-20 lg:grid-cols-2 lg:items-center">
            <div>
              <Eyebrow light>Digital Dine Partner app</Eyebrow>
              <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                A dedicated portal for every member of your team.
              </h2>
              <p className="mt-4 text-base leading-7 text-neutral-400">
                Open the app, enter your 5-digit restaurant code, and you will see only the portals
                your role is allowed to use.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                {roles.map((role) => (
                  <span key={role} className="rounded-full border border-white/15 bg-white/5 px-3.5 py-1.5 text-xs font-semibold text-neutral-200">
                    {role}
                  </span>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/5 p-6 sm:p-8">
              <InstallAppButton
                label="Install app"
                className="h-12 rounded-xl bg-orange-500 px-6 text-sm font-bold text-neutral-950 hover:bg-orange-400 disabled:cursor-default disabled:opacity-70"
              />
              <Link
                href="/app"
                className="inline-flex h-12 items-center justify-center rounded-xl bg-white px-6 text-sm font-bold text-neutral-950 hover:bg-neutral-100"
              >
                Open partner portal
              </Link>
            </div>
          </Container>
        </section>

        {/* FEATURES / CUSTOM PLAN */}
        <section id="features" className="scroll-mt-20 border-b border-neutral-200 bg-white">
          <Container className="py-16 sm:py-20">
            <div className="grid gap-8 md:grid-cols-[1fr_auto] md:items-center">
              <div className="max-w-2xl">
                <Eyebrow>Flexible setup</Eyebrow>
                <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">
                  Use only the parts your business needs.
                </h2>
                <p className="mt-4 text-base leading-7 text-neutral-600">
                  Start with restaurant ordering, add DD MART delivery when you are ready, or tell us
                  what you need and we will help you set it up.
                </p>
              </div>
              <div className="flex flex-col gap-3 sm:flex-row md:flex-col">
                <Link
                  href="/custom-plan"
                  className="inline-flex h-12 items-center justify-center rounded-xl bg-neutral-950 px-6 text-sm font-bold text-white hover:bg-neutral-800"
                >
                  Build my plan
                </Link>
                <Link
                  href="/delivery"
                  className="inline-flex h-12 items-center justify-center rounded-xl border border-neutral-300 bg-white px-6 text-sm font-bold hover:bg-neutral-50"
                >
                  Explore DD MART
                </Link>
              </div>
            </div>
          </Container>
        </section>

        {/* SUPPORT */}
        <section id="support" className="scroll-mt-20 bg-[#f7f7f5]">
          <Container className="py-16 sm:py-20">
            <div className="max-w-2xl">
              <Eyebrow>Contact & support</Eyebrow>
              <h2 className="mt-3 text-3xl font-black tracking-tight sm:text-4xl">Need help getting started?</h2>
              <p className="mt-4 text-base leading-7 text-neutral-600">
                Reach out for registration, onboarding, setup or platform support.
              </p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-2">
              <a
                href={`mailto:${CONTACT_EMAIL}`}
                className="rounded-3xl border border-neutral-200 bg-white p-6 transition hover:border-neutral-300 hover:shadow-md"
              >
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-400">Email</p>
                <p className="mt-3 break-all text-base font-bold">{CONTACT_EMAIL}</p>
                <p className="mt-3 text-sm font-bold text-orange-600">Send email →</p>
              </a>

              <a
                href={SUPPORT_PHONE_LINK ? `tel:${SUPPORT_PHONE_LINK}` : `mailto:${CONTACT_EMAIL}`}
                className="rounded-3xl border border-neutral-200 bg-white p-6 transition hover:border-neutral-300 hover:shadow-md"
              >
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-neutral-400">Support number</p>
                <p className="mt-3 text-base font-bold">{SUPPORT_PHONE || 'Contact us by email'}</p>
                <p className="mt-3 text-sm font-bold text-orange-600">Contact support →</p>
              </a>
            </div>
          </Container>
        </section>
      </main>

      {/* FOOTER */}
      <footer className="border-t border-neutral-200 bg-white">
        <Container className="flex flex-col gap-6 py-8 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-neutral-950 text-[10px] font-black text-white">
              DD
            </span>
            <div>
              <p className="text-sm font-bold">Digital Dine-In</p>
              <p className="text-xs text-neutral-400">Restaurant · DD MART</p>
            </div>
          </div>

          <nav className="flex flex-wrap gap-x-6 gap-y-2 text-sm font-semibold text-neutral-500">
            <Link href="/login" className="hover:text-neutral-950">Login</Link>
            <Link href="/register" className="hover:text-neutral-950">Register</Link>
            <a href="#support" className="hover:text-neutral-950">Support</a>
            <Link href="/privacy-policy" className="hover:text-neutral-950">Privacy</Link>
          </nav>

          <p className="text-xs text-neutral-400">© {new Date().getFullYear()} Digital Dine-In</p>
        </Container>
      </footer>

      {/* Mobile floating install button */}
      <div className="fixed bottom-4 right-4 z-40 md:hidden">
        <InstallAppButton
          label="Install app"
          className="h-11 rounded-xl bg-neutral-950 px-4 text-xs font-bold text-white shadow-xl hover:bg-neutral-800 disabled:cursor-default disabled:opacity-70"
        />
      </div>

      {/* Privacy notice */}
      {privacyReady && showPrivacyNotice ? (
        <div className="fixed inset-x-3 bottom-3 z-[9999] mx-auto max-w-md">
          <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-2xl">
            <div className="flex items-start gap-3">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-neutral-100 text-sm" aria-hidden="true">
                🔒
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold">Privacy</p>
                <p className="mt-1 text-xs leading-5 text-neutral-500">
                  We use essential browser storage and security technologies required for Digital Dine-In.
                  Read our{' '}
                  <Link href="/privacy-policy" className="font-bold text-orange-600">
                    Privacy Policy
                  </Link>
                  .
                </p>
                <div className="mt-3 flex justify-end">
                  <button
                    type="button"
                    onClick={acceptPrivacy}
                    className="rounded-lg bg-neutral-950 px-4 py-2 text-xs font-bold text-white"
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