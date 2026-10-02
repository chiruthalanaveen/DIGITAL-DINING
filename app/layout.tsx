import type {
  Metadata,
  Viewport,
} from 'next'

import type {
  ReactNode,
} from 'react'

import {
  Geist,
  Geist_Mono,
} from 'next/font/google'

import Script from 'next/script'

import PWARegister from '@/app/components/PWARegister'

import './globals.css'


const geistSans = Geist({
  variable:
    '--font-geist-sans',

  subsets: [
    'latin',
  ],
})


const geistMono =
  Geist_Mono({
    variable:
      '--font-geist-mono',

    subsets: [
      'latin',
    ],
  })


export const metadata: Metadata = {
  metadataBase:
    new URL(
      'https://digitaldine-in.online'
    ),

  title: {
    default:
      'Digital Dine-In | Restaurant, Delivery & Resort Platform',

    template:
      '%s | Digital Dine-In',
  },

  description:
    'Digital Dine-In is a smart hospitality platform for QR restaurant ordering, digital menus, delivery management, online payments, kitchen operations, billing and resort management.',

  applicationName:
    'Digital Dine',

  keywords: [
    'Digital Dine-In',
    'Digital Dining',
    'QR menu',
    'restaurant QR menu',
    'digital menu',
    'QR ordering system',
    'restaurant ordering software',
    'restaurant management software',
    'restaurant SaaS',
    'online restaurant ordering',
    'dine in ordering system',
    'takeaway ordering system',
    'delivery management software',
    'online food delivery',
    'restaurant delivery software',
    'restaurant payment system',
    'Razorpay restaurant payment',
    'restaurant billing software',
    'kitchen display system',
    'KDS restaurant',
    'resort management',
    'hospitality software',
    'Digital Dine India',
  ],

  authors: [
    {
      name:
        'Digital Dine-In',

      url:
        'https://digitaldine-in.online',
    },
  ],

  creator:
    'Digital Dine-In',

  publisher:
    'Digital Dine-In',

  alternates: {
    canonical:
      '/',
  },

  /*
   * Keep this if your manifest file is:
   *
   * public/manifest.json
   */
  manifest:
    '/manifest.json',

  appleWebApp: {
    capable:
      true,

    statusBarStyle:
      'black-translucent',

    title:
      'Digital Dine',
  },

  formatDetection: {
    telephone:
      false,
  },

  icons: {
    icon: [
      {
        url:
          '/logo.png',
      },

      {
        url:
          '/icons/digital-dine-192.png',

        sizes:
          '192x192',

        type:
          'image/png',
      },

      {
        url:
          '/icons/digital-dine-512.png',

        sizes:
          '512x512',

        type:
          'image/png',
      },
    ],

    shortcut:
      '/logo.png',

    apple:
      '/logo.png',
  },

  openGraph: {
    title:
      'Digital Dine-In | Restaurant, Delivery & Resort Platform',

    description:
      'Smart QR ordering, restaurant operations, local delivery management, online payments, kitchen management, digital billing and resort operations.',

    url:
      'https://digitaldine-in.online',

    siteName:
      'Digital Dine-In',

    locale:
      'en_IN',

    type:
      'website',

    images: [
      {
        url:
          '/logo.png',

        width:
          512,

        height:
          512,

        alt:
          'Digital Dine-In Logo',
      },
    ],
  },

  twitter: {
    card:
      'summary_large_image',

    title:
      'Digital Dine-In | Restaurant, Delivery & Resort Platform',

    description:
      'QR restaurant ordering, delivery management, online payments, kitchen operations, billing and resort management.',

    images: [
      '/logo.png',
    ],
  },

  robots: {
    index:
      true,

    follow:
      true,

    googleBot: {
      index:
        true,

      follow:
        true,

      'max-video-preview':
        -1,

      'max-image-preview':
        'large',

      'max-snippet':
        -1,
    },
  },

  category:
    'technology',

  referrer:
    'origin-when-cross-origin',
}


export const viewport: Viewport = {
  width:
    'device-width',

  initialScale:
    1,

  maximumScale:
    1,

  viewportFit:
    'cover',

  themeColor:
    '#f97316',
}


const themeInit = `
(function () {
  try {
    var saved =
      localStorage.getItem(
        'digitaldining-theme'
      );

    var theme =
      saved === 'light' ||
      saved === 'dark'
        ? saved
        : (
            window.matchMedia(
              '(prefers-color-scheme: light)'
            ).matches
              ? 'light'
              : 'dark'
          );

    document.documentElement.dataset.theme =
      theme;
  } catch (e) {
    document.documentElement.dataset.theme =
      'dark';
  }
})();
`


export default function RootLayout({
  children,
}: {
  children:
    ReactNode
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`
        ${geistSans.variable}
        ${geistMono.variable}
        h-full
        antialiased
      `}
    >
      <head>
        <Script
          id="digitaldining-theme-init"
          strategy="beforeInteractive"
        >
          {themeInit}
        </Script>
      </head>

      <body className="min-h-full flex flex-col">
        {/* Register Digital Dine PWA */}
        <PWARegister />

        {/* Website / App content */}
        {children}

        {/* Existing Razorpay checkout */}
        <Script
          src="https://checkout.razorpay.com/v1/checkout.js"
          strategy="lazyOnload"
        />
      </body>
    </html>
  )
}