'use client'

import Link from 'next/link'
import { useEffect, useRef, useState, type ReactNode } from 'react'

const features = [
  {
    icon: '⌁',
    label: 'Ordering',
    title: 'QR-first digital ordering',
    description:
      'Give every table a fast, mobile-first menu experience. Guests scan, browse, add items and place their order without waiting for paper menus.',
    accent: 'orange',
  },
  {
    icon: '₹',
    label: 'Payments',
    title: 'Razorpay online payments',
    description:
      'Accept secure online payments directly from the restaurant menu with restaurant-specific Razorpay gateway configuration.',
    accent: 'emerald',
  },
  {
    icon: '⌂',
    label: 'Restaurant',
    title: 'Dine-in & takeaway',
    description:
      'Let guests choose Dine-In or Parcel/Takeaway at checkout, with configurable parcel packing charges.',
    accent: 'blue',
  },
  {
    icon: '≡',
    label: 'Menu',
    title: 'Smart digital menu',
    description:
      'Search your menu, browse categories, filter by Veg, Non-Veg, Egg, Beverage and Other, and showcase item images.',
    accent: 'violet',
  },
  {
    icon: '★',
    label: 'Discovery',
    title: 'Highly Reordered items',
    description:
      'Automatically surface popular items using actual order activity, helping guests discover dishes that customers reorder frequently.',
    accent: 'amber',
  },
  {
    icon: '◌',
    label: 'Live Data',
    title: 'Real-time menu sync',
    description:
      'Menu and restaurant changes can be reflected in the customer experience in real time, keeping the digital menu current.',
    accent: 'cyan',
  },
  {
    icon: '✓',
    label: 'Checkout',
    title: 'GST-ready billing',
    description:
      'Calculate SGST and CGST with restaurant-configurable rates and clearly show taxes, packing charges and the final payable amount.',
    accent: 'rose',
  },
  {
    icon: '#',
    label: 'Operations',
    title: 'Daily order numbering',
    description:
      'Every successful order receives a daily order number, making it easier for restaurant teams to identify and process orders.',
    accent: 'orange',
  },
  {
    icon: '▣',
    label: 'Receipts',
    title: 'Digital paid invoice',
    description:
      'After successful payment, guests receive a clear digital bill summary with payment details, taxes, charges and order information.',
    accent: 'emerald',
  },
]

const workflow = [
  {
    number: '01',
    title: 'Guest scans the table QR',
    text: 'The guest opens the restaurant-specific digital menu from their table QR code.',
  },
  {
    number: '02',
    title: 'Browse & build the cart',
    text: 'Search dishes, filter food types, explore categories and add quantities to the cart.',
  },
  {
    number: '03',
    title: 'Verify guest details',
    text: 'The guest provides their name and 10-digit mobile number for order and receipt communication.',
  },
  {
    number: '04',
    title: 'Choose dining mode',
    text: 'Select Dine-In or Parcel/Takeaway, with packing charges calculated automatically when applicable.',
  },
  {
    number: '05',
    title: 'Pay securely',
    text: 'The order total is calculated with GST and Razorpay opens the secure online payment experience.',
  },
  {
    number: '06',
    title: 'Order is placed',
    text: 'The paid order is recorded with its daily order number, item snapshot, taxes, charges and payment details.',
  },
]

const plans = [
  {
    name: 'Standard',
    eyebrow: 'For small restaurants',
    price: '₹799',
    description:
      'A simple starting point for restaurants moving from paper menus to digital ordering.',
    featured: false,
    features: [
      'Digital restaurant menu',
      'QR / table-based access',
      'Menu search & categories',
      'Food-type filters',
      'Dine-In & Parcel ordering',
      'Cart & quantity management',
      'GST calculation',
      'Razorpay online payments',
      'Digital paid invoice',
    ],
  },
  {
    name: 'Pro',
    eyebrow: 'For growing restaurants',
    price: '₹1,299',
    description:
      'A stronger digital ordering experience for restaurants handling more customer activity.',
    featured: true,
    features: [
      'Everything in Standard',
      'Real-time restaurant/menu updates',
      'Highly Reordered items',
      'Customer mobile capture',
      'Daily order numbering',
      'Restaurant-specific Razorpay setup',
      'Smart menu discovery',
      'Mobile-first ordering experience',
      'Detailed paid order summary',
    ],
  },
  {
    name: 'Pro+',
    eyebrow: 'For high-volume operations',
    price: '₹1,999',
    description:
      'A premium Digital Dining experience built around smoother restaurant operations.',
    featured: false,
    features: [
      'Everything in Pro',
      'Full digital ordering workflow',
      'Popular-item discovery',
      'Dine-In & takeaway support',
      'Configurable packing charges',
      'GST-ready checkout',
      'Secure online payment flow',
      'Digital receipts & invoices',
      'Restaurant-ready customer experience',
    ],
  },
]

type Accent =
  | 'orange'
  | 'emerald'
  | 'blue'
  | 'violet'
  | 'amber'
  | 'cyan'
  | 'rose'

type AccentIconProps = {
  children: ReactNode
  accent?: Accent | string
}

function AccentIcon({
  children,
  accent = 'orange',
}: AccentIconProps) {
  const styles: Record<Accent, string> = {
    orange: 'bg-orange-500/10 border-orange-500/20 text-orange-400',
    emerald: 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400',
    blue: 'bg-blue-500/10 border-blue-500/20 text-blue-400',
    violet: 'bg-violet-500/10 border-violet-500/20 text-violet-400',
    amber: 'bg-amber-500/10 border-amber-500/20 text-amber-400',
    cyan: 'bg-cyan-500/10 border-cyan-500/20 text-cyan-400',
    rose: 'bg-rose-500/10 border-rose-500/20 text-rose-400',
  }

  const accentStyle =
    accent in styles ? styles[accent as Accent] : styles.orange

  return (
    <div
      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border text-sm font-black ${accentStyle}`}
    >
      {children}
    </div>
  )
}

export default function LandingPage() {
  const [showPrivacyNotice, setShowPrivacyNotice] = useState(false)
  const [privacyReady, setPrivacyReady] = useState(false)

  const heroPreviewRef = useRef<HTMLDivElement | null>(null)
  const pointerFrameRef = useRef<number | null>(null)
  const pointerPositionRef = useRef({
    x: 0,
    y: 0,
  })

  useEffect(() => {
    const privacyAccepted = localStorage.getItem(
      'digitaldining_privacy_accepted'
    )

    if (!privacyAccepted) {
      setShowPrivacyNotice(true)
    }

    setPrivacyReady(true)
  }, [])

  /*
   * Performance-friendly hero parallax:
   * - Does not use React state.
   * - Does not re-render the complete page.
   * - Uses requestAnimationFrame.
   * - Runs only on desktop.
   * - Uses CSS variables directly on the hero element.
   */
  useEffect(() => {
    const heroPreview = heroPreviewRef.current

    if (!heroPreview) {
      return
    }

    const reducedMotionQuery = window.matchMedia(
      '(prefers-reduced-motion: reduce)'
    )

    const updateParallax = () => {
      pointerFrameRef.current = null

      if (
        window.innerWidth < 1024 ||
        reducedMotionQuery.matches
      ) {
        heroPreview.style.setProperty('--hero-rotate-x', '0deg')
        heroPreview.style.setProperty('--hero-rotate-y', '0deg')
        return
      }

      const rotateX = pointerPositionRef.current.y * -5
      const rotateY = pointerPositionRef.current.x * 7

      heroPreview.style.setProperty(
        '--hero-rotate-x',
        `${rotateX}deg`
      )

      heroPreview.style.setProperty(
        '--hero-rotate-y',
        `${rotateY}deg`
      )
    }

    const handlePointerMove = (event: PointerEvent) => {
      if (
        window.innerWidth < 1024 ||
        reducedMotionQuery.matches ||
        event.pointerType === 'touch'
      ) {
        return
      }

      pointerPositionRef.current = {
        x: event.clientX / window.innerWidth - 0.5,
        y: event.clientY / window.innerHeight - 0.5,
      }

      if (pointerFrameRef.current === null) {
        pointerFrameRef.current = window.requestAnimationFrame(
          updateParallax
        )
      }
    }

    const resetParallax = () => {
      pointerPositionRef.current = {
        x: 0,
        y: 0,
      }

      if (pointerFrameRef.current === null) {
        pointerFrameRef.current = window.requestAnimationFrame(
          updateParallax
        )
      }
    }

    window.addEventListener('pointermove', handlePointerMove, {
      passive: true,
    })

    document.addEventListener('mouseleave', resetParallax)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      document.removeEventListener('mouseleave', resetParallax)

      if (pointerFrameRef.current !== null) {
        window.cancelAnimationFrame(pointerFrameRef.current)
        pointerFrameRef.current = null
      }
    }
  }, [])

  const handleAcceptPrivacy = () => {
    localStorage.setItem(
      'digitaldining_privacy_accepted',
      'true'
    )

    setShowPrivacyNotice(false)
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-[#070707] font-sans text-white selection:bg-orange-500 selection:text-white">
      <style jsx global>{`
        @keyframes dd-float {
          0%,
          100% {
            transform: translate3d(0, 0, 0);
          }

          50% {
            transform: translate3d(0, -8px, 0);
          }
        }

        @keyframes dd-float-slow {
          0%,
          100% {
            transform: translate3d(0, 0, 0);
          }

          50% {
            transform: translate3d(0, -5px, 0);
          }
        }

        @keyframes dd-pulse-glow {
          0%,
          100% {
            opacity: 0.35;
          }

          50% {
            opacity: 0.6;
          }
        }

        @keyframes dd-scan {
          0% {
            transform: translate3d(0, -100%, 0);
            opacity: 0;
          }

          15% {
            opacity: 0.8;
          }

          85% {
            opacity: 0.8;
          }

          100% {
            transform: translate3d(0, 500%, 0);
            opacity: 0;
          }
        }

        .dd-hero-float {
          animation: dd-float 7s ease-in-out infinite;
          will-change: transform;
        }

        .dd-hero-float-slow {
          animation: dd-float-slow 9s ease-in-out infinite;
          will-change: transform;
        }

        .dd-pulse-glow {
          animation: dd-pulse-glow 5s ease-in-out infinite;
        }

        .dd-scan-line {
          animation: dd-scan 7s linear infinite;
          will-change: transform, opacity;
        }

        .dd-grid {
          background-image:
            linear-gradient(
              rgba(255, 255, 255, 0.018) 1px,
              transparent 1px
            ),
            linear-gradient(
              90deg,
              rgba(255, 255, 255, 0.018) 1px,
              transparent 1px
            );
          background-size: 60px 60px;
        }

        .dd-glass {
          background:
            linear-gradient(
              135deg,
              rgba(255, 255, 255, 0.075),
              rgba(255, 255, 255, 0.025)
            );
          border: 1px solid rgba(255, 255, 255, 0.11);
          box-shadow:
            inset 0 1px 0 rgba(255, 255, 255, 0.06),
            0 18px 45px rgba(0, 0, 0, 0.28);
        }

        .dd-hero-parallax {
          transform:
            perspective(1400px)
            rotateX(var(--hero-rotate-x, 0deg))
            rotateY(var(--hero-rotate-y, 0deg));
          transition: transform 180ms ease-out;
          transform-style: preserve-3d;
          will-change: transform;
        }

        .dd-3d-card {
          transition:
            transform 220ms ease,
            border-color 220ms ease,
            background-color 220ms ease;
        }

        .dd-3d-card:hover {
          transform: translate3d(0, -4px, 0);
          border-color: rgba(255, 255, 255, 0.14);
        }

        .dd-depth-layer {
          transform: translateZ(12px);
        }

        .dd-depth-layer-small {
          transform: translateZ(6px);
        }

        @media (hover: none), (max-width: 1023px) {
          .dd-hero-parallax {
            transform: none !important;
            transition: none !important;
          }

          .dd-hero-float,
          .dd-hero-float-slow {
            animation: none !important;
            will-change: auto;
          }

          .dd-depth-layer,
          .dd-depth-layer-small {
            transform: none;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          *,
          *::before,
          *::after {
            scroll-behavior: auto !important;
          }

          .dd-hero-float,
          .dd-hero-float-slow,
          .dd-pulse-glow,
          .dd-scan-line,
          .dd-grid {
            animation: none !important;
            will-change: auto !important;
          }

          .dd-hero-parallax,
          .dd-3d-card {
            transform: none !important;
            transition: none !important;
          }

          .dd-depth-layer,
          .dd-depth-layer-small {
            transform: none !important;
          }
        }

        @media (max-width: 767px) {
          .dd-glass {
            box-shadow:
              inset 0 1px 0 rgba(255, 255, 255, 0.05),
              0 12px 30px rgba(0, 0, 0, 0.2);
          }
        }
      `}</style>

      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute left-1/2 top-[-280px] h-[560px] w-[560px] -translate-x-1/2 rounded-full bg-orange-500/[0.055] blur-[80px]" />

        <div className="absolute right-[-180px] top-[35%] h-[420px] w-[420px] rounded-full bg-blue-500/[0.025] blur-[80px]" />

        <div className="absolute bottom-[-220px] left-[-130px] h-[420px] w-[420px] rounded-full bg-emerald-500/[0.025] blur-[80px]" />

        <div className="dd-grid absolute inset-0 opacity-25" />

        <div className="absolute left-[12%] top-[22%] h-1 w-1 rounded-full bg-orange-300/60" />

        <div className="absolute right-[18%] top-[48%] h-1 w-1 rounded-full bg-white/40" />

        <div className="absolute bottom-[18%] left-[45%] h-1 w-1 rounded-full bg-emerald-300/50" />
      </div>

      {/* Launch banner */}
      <div className="relative z-50 border-b border-orange-400/20 bg-gradient-to-r from-orange-500 via-amber-400 to-orange-500 px-4 py-2.5 text-center text-[10px] font-black uppercase tracking-[0.18em] text-black sm:text-xs">
        <span>🎁 First-time restaurant partners get 14 Days free</span>
      </div>

      {/* Navigation */}
      <header className="sticky top-0 z-50 border-b border-white/[0.07] bg-[#070707]/95">
        <div className="mx-auto flex h-[72px] max-w-7xl items-center justify-between px-5 sm:px-6 lg:px-8">
          <a href="#" className="flex items-center gap-3">
            <span className="relative flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 text-lg font-black shadow-lg shadow-orange-500/20">
              <span className="relative z-10">D</span>
              <span className="absolute inset-0 rounded-2xl bg-orange-300/15 blur-md" />
            </span>

            <div>
              <div className="text-sm font-black tracking-tight sm:text-base">
                Digital Dining
              </div>

              <div className="hidden text-[9px] font-bold uppercase tracking-[0.2em] text-neutral-500 sm:block">
                Restaurant SaaS
              </div>
            </div>
          </a>

          <nav className="hidden items-center gap-7 text-xs font-bold text-neutral-400 lg:flex">
            <a href="#features" className="transition hover:text-white">
              Features
            </a>

            <a href="#experience" className="transition hover:text-white">
              Experience
            </a>

            <a href="#how-it-works" className="transition hover:text-white">
              How It Works
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
            className="rounded-xl bg-white px-4 py-2.5 text-[10px] font-black uppercase tracking-wider text-black transition hover:bg-orange-500 hover:text-white sm:px-5"
          >
            Start Free
          </Link>
        </div>
      </header>

      {/* Hero */}
      <main className="relative">
        <section className="mx-auto max-w-7xl px-5 pb-20 pt-20 sm:px-6 sm:pt-28 lg:px-8 lg:pb-28">
          <div className="grid items-center gap-14 lg:grid-cols-[1.05fr_0.95fr]">
            {/* Hero copy */}
            <div className="relative z-10">
              <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/[0.07] px-3 py-1.5 text-[9px] font-black uppercase tracking-[0.18em] text-orange-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-orange-400" />
                Built for modern restaurants
              </div>

              <h1 className="max-w-4xl text-5xl font-black leading-[0.96] tracking-[-0.045em] text-white sm:text-6xl lg:text-7xl">
                Your restaurant.
                <br />
                <span className="bg-gradient-to-r from-orange-400 via-amber-300 to-orange-500 bg-clip-text text-transparent">
                  Digitally connected.
                </span>
              </h1>

              <p className="mt-7 max-w-2xl text-sm leading-7 text-neutral-400 sm:text-base sm:leading-8">
                Digital Dining brings your restaurant menu, QR ordering,
                payments, GST billing and customer ordering experience into
                one fast, beautifully designed SaaS platform.
              </p>

              <div className="mt-9 flex flex-col gap-3 sm:flex-row">
                <Link
                  href="/register"
                  className="group flex items-center justify-center gap-3 rounded-2xl bg-orange-500 px-7 py-4 text-xs font-black uppercase tracking-wider text-white shadow-xl shadow-orange-500/15 transition hover:-translate-y-0.5 hover:bg-orange-400"
                >
                  Register your restaurant
                  <span className="transition group-hover:translate-x-1">
                    →
                  </span>
                </Link>

                <a
                  href="#features"
                  className="flex items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03] px-7 py-4 text-xs font-black uppercase tracking-wider text-neutral-300 transition hover:border-white/20 hover:bg-white/[0.06] hover:text-white"
                >
                  Explore platform
                </a>
              </div>

              <div className="mt-9 flex flex-wrap gap-x-6 gap-y-3 text-[10px] font-bold uppercase tracking-wider text-neutral-500">
                <span className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span>
                  QR Ordering
                </span>

                <span className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span>
                  Razorpay
                </span>

                <span className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span>
                  GST Billing
                </span>

                <span className="flex items-center gap-2">
                  <span className="text-emerald-400">✓</span>
                  Dine-In + Parcel
                </span>
              </div>
            </div>

            {/* Product preview */}
            <div className="relative [perspective:1400px]">
              <div className="pointer-events-none absolute -inset-8 rounded-[50px] bg-orange-500/[0.045] blur-2xl" />

              <div
                ref={heroPreviewRef}
                className="dd-hero-parallax relative"
                style={
                  {
                    '--hero-rotate-x': '0deg',
                    '--hero-rotate-y': '0deg',
                  } as React.CSSProperties
                }
              >
                {/* Holographic back layer */}
                <div className="dd-hero-float-slow absolute -right-5 -top-7 hidden h-32 w-48 rounded-3xl border border-orange-300/10 bg-orange-400/[0.025] sm:block">
                  <div className="p-4">
                    <div className="flex items-center justify-between">
                      <span className="text-[7px] font-black uppercase tracking-widest text-orange-300/70">
                        Spatial Layer
                      </span>

                      <span className="h-1.5 w-1.5 rounded-full bg-orange-400" />
                    </div>

                    <div className="mt-5 h-1 rounded-full bg-white/5">
                      <div className="h-1 w-2/3 rounded-full bg-gradient-to-r from-orange-500/50 to-amber-300/70" />
                    </div>

                    <div className="mt-3 h-1 w-1/2 rounded-full bg-white/5" />
                  </div>
                </div>

                {/* Main 3D product frame */}
                <div className="relative">
                  <div className="absolute -inset-1 rounded-[32px] bg-gradient-to-br from-orange-400/15 via-transparent to-blue-400/5 opacity-70 blur-sm" />

                  <div className="dd-glass relative overflow-hidden rounded-[30px] bg-[#0d0d0d]">
                    {/* Top reflection */}
                    <div className="pointer-events-none absolute inset-x-0 top-0 h-32 bg-gradient-to-b from-white/[0.045] to-transparent" />

                    {/* Scanning line */}
                    <div className="dd-scan-line pointer-events-none absolute left-0 right-0 top-0 z-20 h-px bg-gradient-to-r from-transparent via-orange-300/60 to-transparent" />

                    {/* Browser bar */}
                    <div className="relative flex items-center justify-between border-b border-white/[0.07] px-5 py-4">
                      <div className="flex gap-1.5">
                        <span className="h-2.5 w-2.5 rounded-full bg-red-400/70" />
                        <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/70" />
                        <span className="h-2.5 w-2.5 rounded-full bg-green-400/70" />
                      </div>

                      <div className="rounded-lg border border-white/[0.06] bg-white/[0.03] px-8 py-1.5 text-[8px] font-bold text-neutral-600">
                        restaurant.digitaldining
                      </div>

                      <div className="text-neutral-600">•••</div>
                    </div>

                    <div className="relative p-5 sm:p-7">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-[9px] font-black uppercase tracking-[0.2em] text-orange-400">
                            Digital Menu
                          </div>

                          <div className="mt-1 text-xl font-black">
                            Welcome to your table
                          </div>

                          <div className="mt-1 text-[8px] font-bold uppercase tracking-widest text-neutral-600">
                            Spatial dining interface · 2050 ready
                          </div>
                        </div>

                        <div className="dd-depth-layer flex h-11 w-11 items-center justify-center rounded-2xl border border-orange-400/20 bg-orange-500/10 text-lg">
                          ◫
                        </div>
                      </div>

                      <div className="mt-6 grid grid-cols-2 gap-2">
                        <div className="rounded-xl border border-orange-500/20 bg-orange-500/10 px-3 py-2 text-center text-[9px] font-black text-orange-300">
                          DINE-IN
                        </div>

                        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-center text-[9px] font-black text-neutral-500">
                          PARCEL
                        </div>
                      </div>

                      <div className="mt-4 flex gap-2 overflow-hidden">
                        {['All', 'Veg', 'Non-Veg', 'Beverage'].map(
                          (item, index) => (
                            <div
                              key={item}
                              className={`whitespace-nowrap rounded-full border px-3 py-1.5 text-[8px] font-bold ${
                                index === 0
                                  ? 'border-orange-500/30 bg-orange-500/10 text-orange-300'
                                  : 'border-white/[0.07] text-neutral-600'
                              }`}
                            >
                              {item}
                            </div>
                          )
                        )}
                      </div>

                      <div className="mt-5 space-y-3">
                        {[
                          ['Butter Chicken', '₹320', 'Highly Reordered'],
                          ['Paneer Tikka', '₹280', 'Popular'],
                          ['Garlic Naan', '₹90', ''],
                        ].map(([name, price, badge], index) => (
                          <div
                            key={name}
                            className="dd-depth-layer-small flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3 transition duration-300 hover:border-orange-500/20 hover:bg-orange-500/[0.04]"
                          >
                            <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500/20 to-amber-400/5 text-xl">
                              {index === 0
                                ? '🍛'
                                : index === 1
                                  ? '🥘'
                                  : '🫓'}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="truncate text-xs font-black text-white">
                                {name}
                              </div>

                              {badge && (
                                <div className="mt-1 text-[7px] font-black uppercase tracking-wider text-orange-400">
                                  ★ {badge}
                                </div>
                              )}

                              <div className="mt-1 text-[10px] font-bold text-neutral-500">
                                Freshly prepared
                              </div>
                            </div>

                            <div className="text-xs font-black text-white">
                              {price}
                            </div>

                            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-orange-500 text-xs font-black">
                              +
                            </div>
                          </div>
                        ))}
                      </div>

                      <div className="mt-5 rounded-2xl border border-orange-500/20 bg-gradient-to-r from-orange-500/10 to-amber-500/5 p-4">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="text-[8px] font-bold uppercase tracking-wider text-neutral-500">
                              Your cart
                            </div>

                            <div className="mt-1 text-sm font-black">
                              3 items · ₹690
                            </div>
                          </div>

                          <div className="rounded-xl bg-orange-500 px-4 py-2 text-[9px] font-black uppercase tracking-wider">
                            Pay online →
                          </div>
                        </div>
                      </div>

                      {/* Tiny system status */}
                      <div className="mt-5 flex items-center justify-between border-t border-white/[0.05] pt-4">
                        <div className="flex items-center gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />

                          <span className="text-[8px] font-bold uppercase tracking-wider text-neutral-600">
                            Live system connected
                          </span>
                        </div>

                        <span className="text-[8px] font-black uppercase tracking-wider text-neutral-700">
                          DD / 2050
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Floating status card */}
                  <div className="dd-hero-float-slow absolute -bottom-7 -left-4 z-30 hidden rounded-2xl border border-white/10 bg-[#111] p-4 shadow-xl sm:block lg:-left-8">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                        ✓
                      </div>

                      <div>
                        <div className="text-[8px] font-black uppercase tracking-wider text-emerald-400">
                          Payment successful
                        </div>

                        <div className="mt-1 text-xs font-black text-white">
                          Order #047
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Floating analytics card */}
                  <div className="dd-hero-float absolute -right-4 top-16 z-30 hidden w-44 rounded-2xl border border-white/10 bg-[#111] p-4 shadow-xl sm:block lg:-right-10">
                    <div className="flex items-center justify-between">
                      <div className="text-[8px] font-black uppercase tracking-wider text-neutral-500">
                        Live analytics
                      </div>

                      <span className="text-[8px] text-emerald-400">
                        +18.4%
                      </span>
                    </div>

                    <div className="mt-3 flex items-end gap-1">
                      <div className="text-2xl font-black text-white">
                        ₹24.8K
                      </div>
                    </div>

                    <div className="mt-3 flex h-10 items-end gap-1">
                      {[25, 42, 32, 55, 45, 72, 64, 88, 75, 100].map(
                        (height, index) => (
                          <div
                            key={index}
                            className="flex-1 rounded-t-sm bg-gradient-to-t from-orange-500/30 to-orange-300/80"
                            style={{ height: `${height}%` }}
                          />
                        )
                      )}
                    </div>

                    <div className="mt-2 text-[7px] font-bold uppercase tracking-wider text-neutral-700">
                      Orders processed today
                    </div>
                  </div>

                  {/* Smart discovery badge */}
                  <div className="absolute -right-3 -top-5 z-30 hidden rounded-2xl border border-white/10 bg-[#111] p-4 shadow-xl sm:block lg:-right-7">
                    <div className="text-[8px] font-black uppercase tracking-wider text-neutral-500">
                      Smart discovery
                    </div>

                    <div className="mt-1 text-xs font-black text-orange-400">
                      ★ Highly Reordered
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Trust strip */}
        <section className="border-y border-white/[0.06] bg-white/[0.015]">
          <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-white/[0.06] sm:grid-cols-4">
            {[
              ['01', 'QR-based', 'Table access'],
              ['02', 'Razorpay', 'Online payments'],
              ['03', 'GST ready', 'SGST + CGST'],
              ['04', 'Real-time', 'Menu updates'],
            ].map(([number, title, subtitle]) => (
              <div key={number} className="px-5 py-6 text-center sm:py-8">
                <div className="text-[8px] font-black uppercase tracking-[0.2em] text-orange-400">
                  {number}
                </div>

                <div className="mt-1 text-sm font-black text-white">
                  {title}
                </div>

                <div className="mt-1 text-[9px] font-bold text-neutral-600">
                  {subtitle}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Features */}
        <section
          id="features"
          className="mx-auto max-w-7xl scroll-mt-20 px-5 py-24 sm:px-6 lg:px-8"
        >
          <div className="max-w-2xl">
            <div className="text-[9px] font-black uppercase tracking-[0.25em] text-orange-400">
              Everything your menu needs
            </div>

            <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">
              More than a digital menu.
              <br />
              <span className="text-neutral-500">
                A complete ordering experience.
              </span>
            </h2>

            <p className="mt-5 text-sm leading-7 text-neutral-500">
              Digital Dining connects the guest-facing restaurant experience
              from the first QR scan all the way through payment and the final
              digital bill.
            </p>
          </div>

          <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="dd-3d-card group rounded-[26px] border border-white/[0.07] bg-white/[0.025] p-6 transition duration-300 hover:bg-white/[0.04]"
              >
                <div className="dd-depth-layer-small">
                  <AccentIcon accent={feature.accent}>
                    {feature.icon}
                  </AccentIcon>
                </div>

                <div className="mt-6 text-[8px] font-black uppercase tracking-[0.2em] text-neutral-600">
                  {feature.label}
                </div>

                <h3 className="mt-2 text-lg font-black text-white">
                  {feature.title}
                </h3>

                <p className="mt-3 text-xs leading-6 text-neutral-500">
                  {feature.description}
                </p>

                <div className="mt-5 h-px w-0 bg-orange-500 transition-all duration-300 group-hover:w-10" />
              </div>
            ))}
          </div>
        </section>

        {/* Experience */}
        <section
          id="experience"
          className="border-y border-white/[0.06] bg-[#0a0a0a] scroll-mt-20"
        >
          <div className="mx-auto grid max-w-7xl gap-16 px-5 py-24 sm:px-6 lg:grid-cols-2 lg:px-8">
            <div>
              <div className="text-[9px] font-black uppercase tracking-[0.25em] text-emerald-400">
                Designed for guests
              </div>

              <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">
                Make ordering feel
                <br />
                <span className="text-neutral-500">effortless.</span>
              </h2>

              <p className="mt-6 max-w-xl text-sm leading-7 text-neutral-500">
                Your customers should spend their time choosing great food,
                not figuring out complicated ordering systems. Digital Dining
                keeps the journey simple from menu discovery to payment.
              </p>

              <div className="mt-8 space-y-4">
                {[
                  [
                    '01',
                    'Personalized welcome',
                    'A guest-friendly experience starts with their name and table context.',
                  ],
                  [
                    '02',
                    'Fast menu discovery',
                    'Search, categories and food-type filters make finding dishes simple.',
                  ],
                  [
                    '03',
                    'Clear checkout',
                    'Subtotal, SGST, CGST, packing charge and total are shown before payment.',
                  ],
                  [
                    '04',
                    'Instant confirmation',
                    'Successful orders receive an order number and digital payment summary.',
                  ],
                ].map(([number, title, text]) => (
                  <div
                    key={number}
                    className="dd-3d-card flex gap-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4"
                  >
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/10 text-[9px] font-black text-emerald-400">
                      {number}
                    </div>

                    <div>
                      <h3 className="text-xs font-black text-white">
                        {title}
                      </h3>

                      <p className="mt-1 text-[10px] leading-5 text-neutral-600">
                        {text}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Bill preview */}
            <div className="flex items-center justify-center [perspective:1000px]">
              <div className="dd-3d-card relative w-full max-w-md rounded-[30px] border border-white/[0.08] bg-[#111] p-5 shadow-2xl sm:p-7">
                <div className="absolute -inset-1 -z-10 rounded-[32px] bg-emerald-500/[0.035] blur-xl" />

                <div className="flex items-center justify-between border-b border-dashed border-white/10 pb-5">
                  <div>
                    <div className="text-[8px] font-black uppercase tracking-[0.2em] text-orange-400">
                      Paid invoice
                    </div>

                    <div className="mt-2 text-lg font-black">
                      Order #047
                    </div>
                  </div>

                  <div className="rounded-full bg-emerald-500/10 px-3 py-1.5 text-[8px] font-black uppercase tracking-wider text-emerald-400">
                    Paid
                  </div>
                </div>

                <div className="space-y-4 py-6">
                  <div className="flex justify-between text-xs">
                    <span className="text-neutral-500">
                      Butter Chicken × 1
                    </span>

                    <span className="font-bold">₹320</span>
                  </div>

                  <div className="flex justify-between text-xs">
                    <span className="text-neutral-500">
                      Paneer Tikka × 1
                    </span>

                    <span className="font-bold">₹280</span>
                  </div>

                  <div className="flex justify-between text-xs">
                    <span className="text-neutral-500">
                      Garlic Naan × 1
                    </span>

                    <span className="font-bold">₹90</span>
                  </div>

                  <div className="border-t border-white/[0.07] pt-4">
                    <div className="flex justify-between text-[10px] text-neutral-500">
                      <span>Subtotal</span>
                      <span>₹690</span>
                    </div>

                    <div className="mt-2 flex justify-between text-[10px] text-neutral-500">
                      <span>SGST + CGST</span>
                      <span>₹124.20</span>
                    </div>

                    <div className="mt-2 flex justify-between text-[10px] text-neutral-500">
                      <span>Packing fee</span>
                      <span>₹0</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-2xl bg-gradient-to-r from-orange-500/10 to-amber-500/5 p-4">
                  <div className="flex items-end justify-between">
                    <div>
                      <div className="text-[8px] font-black uppercase tracking-wider text-neutral-600">
                        Total paid
                      </div>

                      <div className="mt-1 text-2xl font-black">
                        ₹814.20
                      </div>
                    </div>

                    <div className="text-right text-[8px] font-bold text-neutral-600">
                      Razorpay
                      <br />
                      Secure Gateway
                    </div>
                  </div>
                </div>

                <div className="mt-5 flex items-center justify-between rounded-xl border border-white/[0.06] px-4 py-3">
                  <span className="text-[8px] font-bold uppercase tracking-wider text-neutral-600">
                    Dining mode
                  </span>

                  <span className="text-[9px] font-black text-orange-400">
                    Dine-In · Table 07
                  </span>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* How it works */}
        <section
          id="how-it-works"
          className="mx-auto max-w-7xl scroll-mt-20 px-5 py-24 sm:px-6 lg:px-8"
        >
          <div className="text-center">
            <div className="text-[9px] font-black uppercase tracking-[0.25em] text-blue-400">
              Simple by design
            </div>

            <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">
              From QR scan to paid order.
            </h2>

            <p className="mx-auto mt-5 max-w-2xl text-sm leading-7 text-neutral-500">
              A clean customer journey designed to reduce friction and help
              restaurants move orders through the digital workflow faster.
            </p>
          </div>

          <div className="relative mt-16">
            <div className="absolute left-[8.33%] right-[8.33%] top-8 hidden h-px bg-gradient-to-r from-orange-500/40 via-blue-500/30 to-emerald-500/40 lg:block" />

            <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-6">
              {workflow.map((step) => (
                <div key={step.number} className="relative text-center">
                  <div className="dd-3d-card mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-[#0b0b0b] text-xs font-black text-orange-400 shadow-xl">
                    {step.number}
                  </div>

                  <h3 className="mt-5 text-xs font-black text-white">
                    {step.title}
                  </h3>

                  <p className="mt-2 text-[10px] leading-5 text-neutral-600">
                    {step.text}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Smart ordering highlight */}
        <section className="mx-auto max-w-7xl px-5 pb-24 sm:px-6 lg:px-8">
          <div className="relative overflow-hidden rounded-[34px] border border-orange-500/15 bg-gradient-to-br from-orange-500/[0.10] via-[#101010] to-[#0a0a0a]">
            <div className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full bg-orange-500/[0.05] blur-2xl" />

            <div className="grid items-center gap-10 p-7 sm:p-10 lg:grid-cols-2 lg:p-14">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/10 px-3 py-1.5 text-[8px] font-black uppercase tracking-[0.2em] text-orange-300">
                  ★ Smart ordering
                </div>

                <h2 className="mt-5 text-3xl font-black tracking-tight sm:text-4xl">
                  Help customers discover what people love.
                </h2>

                <p className="mt-5 text-sm leading-7 text-neutral-500">
                  Digital Dining can identify frequently ordered menu items
                  from actual order activity and surface them as{' '}
                  <span className="font-bold text-orange-400">
                    Highly Reordered
                  </span>{' '}
                  dishes.
                </p>

                <div className="mt-7 grid grid-cols-2 gap-3">
                  <div className="dd-3d-card rounded-2xl border border-white/[0.07] bg-black/20 p-4">
                    <div className="text-xl font-black text-orange-400">
                      25%
                    </div>

                    <div className="mt-1 text-[8px] font-bold uppercase tracking-wider text-neutral-600">
                      Top ranked items
                    </div>
                  </div>

                  <div className="dd-3d-card rounded-2xl border border-white/[0.07] bg-black/20 p-4">
                    <div className="text-xl font-black text-emerald-400">
                      5+
                    </div>

                    <div className="mt-1 text-[8px] font-bold uppercase tracking-wider text-neutral-600">
                      Minimum order activity
                    </div>
                  </div>
                </div>
              </div>

              <div className="dd-3d-card rounded-[28px] border border-white/[0.08] bg-black/30 p-5">
                <div className="mb-4 flex items-center justify-between">
                  <span className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-600">
                    Popular today
                  </span>

                  <span className="text-[8px] font-bold text-orange-400">
                    Based on orders
                  </span>
                </div>

                <div className="space-y-3">
                  {[
                    ['Butter Chicken', '142 orders', '₹320'],
                    ['Paneer Tikka', '119 orders', '₹280'],
                    ['Chicken Biryani', '97 orders', '₹260'],
                  ].map(([name, orders, price], index) => (
                    <div
                      key={name}
                      className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.025] p-3"
                    >
                      <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-xs font-black text-orange-400">
                        0{index + 1}
                      </div>

                      <div className="flex-1">
                        <div className="text-xs font-black">{name}</div>

                        <div className="mt-1 text-[8px] text-neutral-600">
                          {orders}
                        </div>
                      </div>

                      <div className="text-[8px] font-black uppercase text-orange-400">
                        ★ Highly Reordered
                      </div>

                      <div className="text-xs font-black">{price}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Pricing */}
        <section
          id="pricing"
          className="border-y border-white/[0.06] bg-[#090909] scroll-mt-20"
        >
          <div className="mx-auto max-w-7xl px-5 py-24 sm:px-6 lg:px-8">
            <div className="text-center">
              <div className="text-[9px] font-black uppercase tracking-[0.25em] text-emerald-400">
                Simple SaaS pricing
              </div>

              <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-5xl">
                Start small. Grow with Digital Dining.
              </h2>

              <p className="mx-auto mt-5 max-w-xl text-sm leading-7 text-neutral-500">
                Choose the restaurant tier that fits your operation. First-time
                partners can claim the current launch offer during registration.
              </p>
            </div>

            <div className="mt-14 grid gap-5 lg:grid-cols-3">
              {plans.map((plan) => (
                <div
                  key={plan.name}
                  className={`dd-3d-card relative flex flex-col rounded-[30px] p-7 ${
                    plan.featured
                      ? 'border-2 border-orange-500 bg-gradient-to-b from-orange-500/[0.10] to-[#111] shadow-2xl shadow-orange-500/10'
                      : 'border border-white/[0.07] bg-white/[0.025]'
                  }`}
                >
                  {plan.featured && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-orange-500 px-4 py-1.5 text-[8px] font-black uppercase tracking-[0.18em] text-white">
                      Most Popular
                    </div>
                  )}

                  <div className="text-[9px] font-black uppercase tracking-[0.2em] text-neutral-600">
                    {plan.eyebrow}
                  </div>

                  <div className="mt-3 flex items-end gap-2">
                    <h3 className="text-2xl font-black">{plan.name}</h3>
                  </div>

                  <div className="mt-5 flex items-end gap-1">
                    <span className="text-4xl font-black tracking-tight">
                      {plan.price}
                    </span>

                    <span className="pb-1 text-[10px] font-bold text-neutral-600">
                      / month
                    </span>
                  </div>

                  <p className="mt-4 min-h-[48px] text-xs leading-6 text-neutral-500">
                    {plan.description}
                  </p>

                  <div className="my-6 h-px bg-white/[0.07]" />

                  <div className="flex-1 space-y-3">
                    {plan.features.map((feature) => (
                      <div
                        key={feature}
                        className="flex items-start gap-3 text-[10px] font-bold text-neutral-300"
                      >
                        <span className="mt-0.5 text-emerald-400">✓</span>
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>

                  <Link
                    href="/register"
                    className={`mt-8 flex items-center justify-center rounded-2xl py-3.5 text-[10px] font-black uppercase tracking-wider transition ${
                      plan.featured
                        ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20 hover:bg-orange-400'
                        : 'border border-white/10 bg-white/[0.04] text-white hover:bg-white/[0.08]'
                    }`}
                  >
                    Choose {plan.name}
                  </Link>
                </div>
              ))}
            </div>

            <div className="mt-7 text-center text-[9px] font-bold text-neutral-700">
              Pricing shown for the current Digital Dining launch offering.
            </div>
          </div>
        </section>

        {/* About / CTA */}
        <section id="about" className="scroll-mt-20">
          <div className="mx-auto max-w-5xl px-5 py-24 text-center sm:px-6">
            <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-orange-500/10 text-xl text-orange-400">
              <span className="relative z-10">D</span>
              <span className="absolute inset-0 rounded-2xl bg-orange-500/10 blur-lg" />
            </div>

            <div className="mt-7 text-[9px] font-black uppercase tracking-[0.25em] text-orange-400">
              About Digital Dining
            </div>

            <h2 className="mx-auto mt-4 max-w-3xl text-3xl font-black tracking-tight sm:text-5xl">
              Restaurant technology should feel simple.
            </h2>

            <p className="mx-auto mt-6 max-w-2xl text-sm leading-8 text-neutral-500">
              Digital Dining is designed to replace disconnected restaurant
              ordering experiences with one streamlined digital journey —
              from QR menu discovery and smart item browsing to GST-aware
              checkout, secure online payment and digital billing.
            </p>

            <Link
              href="/register"
              className="mt-9 inline-flex items-center gap-3 rounded-2xl bg-white px-7 py-4 text-[10px] font-black uppercase tracking-wider text-black transition hover:bg-orange-500 hover:text-white"
            >
              Build your digital restaurant
              <span>→</span>
            </Link>
          </div>
        </section>

        {/* Contact */}
        <section
          id="contact"
          className="border-t border-white/[0.06] scroll-mt-20"
        >
          <div className="mx-auto max-w-7xl px-5 py-20 sm:px-6 lg:px-8">
            <div className="grid gap-10 lg:grid-cols-2 lg:items-center">
              <div>
                <div className="text-[9px] font-black uppercase tracking-[0.25em] text-emerald-400">
                  Partner support
                </div>

                <h2 className="mt-4 text-3xl font-black tracking-tight sm:text-4xl">
                  Ready to take your restaurant digital?
                </h2>

                <p className="mt-5 max-w-xl text-sm leading-7 text-neutral-500">
                  Register your restaurant and start building a faster,
                  cleaner customer ordering experience with Digital Dining.
                </p>
              </div>

              <div className="dd-3d-card rounded-[28px] border border-white/[0.07] bg-white/[0.025] p-6">
                <div className="space-y-4">
                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-500/10 text-orange-400">
                      @
                    </div>

                    <div>
                      <div className="text-[8px] font-black uppercase tracking-wider text-neutral-600">
                        Email
                      </div>

                      <div className="mt-1 text-xs font-black text-white">
                        digitaldining077@gmail.com
                      </div>
                    </div>
                  </div>

                  <div className="h-px bg-white/[0.06]" />

                  <div className="flex items-center gap-4">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-400">
                      ☎
                    </div>

                    <div>
                      <div className="text-[8px] font-black uppercase tracking-wider text-neutral-600">
                        Partner helpline
                      </div>

                      <div className="mt-1 text-xs font-black text-white">
                        +91 98765 43210
                      </div>
                    </div>
                  </div>
                </div>

                <Link
                  href="/register"
                  className="mt-6 flex w-full items-center justify-center rounded-xl bg-orange-500 py-3 text-[10px] font-black uppercase tracking-wider text-white transition hover:bg-orange-400"
                >
                  Register Restaurant
                </Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/[0.06]">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-10 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-500 text-sm font-black">
              D
            </span>

            <div>
              <div className="text-xs font-black">Digital Dining</div>

              <div className="mt-0.5 text-[8px] font-bold uppercase tracking-wider text-neutral-700">
                Restaurant SaaS
              </div>
            </div>
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-3 text-[9px] font-bold uppercase tracking-wider text-neutral-600">
            <a href="#features" className="transition hover:text-white">
              Features
            </a>

            <a href="#pricing" className="transition hover:text-white">
              Pricing
            </a>

            <a href="#about" className="transition hover:text-white">
              About
            </a>

            <a href="#contact" className="transition hover:text-white">
              Contact
            </a>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-[9px] font-bold text-neutral-700">
            <Link
              href="/privacy-policy"
              className="transition hover:text-white"
            >
              Privacy Policy
            </Link>

            <span>© 2026 Digital Dining SaaS</span>
          </div>
        </div>
      </footer>

      {/* Small Privacy Policy Popup */}
      {privacyReady && showPrivacyNotice && (
        <div className="fixed bottom-4 left-1/2 z-[9999] w-[calc(100%-2rem)] max-w-md -translate-x-1/2">
          <div className="rounded-2xl border border-white/10 bg-[#151515] p-4 shadow-2xl shadow-black/50">
            <div className="flex items-start gap-3">
              <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-500/10 text-sm text-orange-400">
                🔒
              </div>

              <div className="min-w-0 flex-1">
                <h3 className="text-xs font-bold text-white">
                  Your privacy matters
                </h3>

                <p className="mt-1.5 text-[11px] leading-5 text-neutral-400">
                  We use essential storage and security technologies to
                  improve your experience. By continuing, you agree to our{' '}
                  <Link
                    href="/privacy-policy"
                    className="font-semibold text-orange-400 underline-offset-2 hover:underline"
                  >
                    Privacy Policy
                  </Link>
                  .
                </p>

                <div className="mt-3 flex items-center justify-end gap-3">
                  <Link
                    href="/privacy-policy"
                    className="text-[10px] font-bold text-neutral-500 transition hover:text-white"
                  >
                    Learn more
                  </Link>

                  <button
                    type="button"
                    onClick={handleAcceptPrivacy}
                    className="rounded-lg bg-orange-500 px-4 py-2 text-[10px] font-black text-black transition hover:bg-orange-400"
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