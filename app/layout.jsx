import Script from 'next/script'
import PWARegister from '@/app/components/PWARegister'
import './globals.css'

export const metadata = {
  // Base URL used by Next.js for canonical/Open Graph URLs
  metadataBase: new URL('https://digitaldine-in.online'),

  // =========================================================
  // BASIC SEO
  // =========================================================
  title: {
    default: 'Digital Dine-In | Smart QR Restaurant Ordering',
    template: '%s | Digital Dine-In',
  },

  description:
    'Digital Dine-In is a smart QR restaurant ordering platform for digital menus, dine-in and takeaway ordering, online payments, kitchen order management and digital billing.',

  applicationName: 'Digital Dine',

  keywords: [
    'Digital Dine-In',
    'Digital Dining',
    'QR menu',
    'restaurant QR menu',
    'digital menu',
    'contactless restaurant menu',
    'QR ordering system',
    'restaurant ordering software',
    'restaurant management software',
    'digital restaurant menu',
    'QR menu India',
    'restaurant SaaS',
    'online restaurant ordering',
    'dine in ordering system',
    'takeaway ordering system',
    'restaurant payment system',
    'restaurant billing software',
    'kitchen display system',
    'KDS restaurant',
    'digital food menu',
    'contactless ordering',
  ],

  authors: [
    {
      name: 'Digital Dine-In',
      url: 'https://digitaldine-in.online',
    },
  ],

  creator: 'Digital Dine-In',
  publisher: 'Digital Dine-In',

  // =========================================================
  // CANONICAL URL
  // =========================================================
  alternates: {
    canonical: '/',
  },

  // =========================================================
  // PWA
  // =========================================================
  manifest: '/manifest.json',

  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Digital Dine',
  },

  formatDetection: {
    telephone: false,
  },

  // =========================================================
  // ICONS
  // Existing logo setup preserved
  // =========================================================
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/logo.png',
  },

  // =========================================================
  // OPEN GRAPH
  // WhatsApp / Facebook / LinkedIn previews
  // =========================================================
  openGraph: {
    title: 'Digital Dine-In | Smart QR Restaurant Ordering',
    description:
      'Smart QR menus, dine-in and takeaway ordering, online payments, kitchen management and digital billing for restaurants.',

    url: 'https://digitaldine-in.online',

    siteName: 'Digital Dine-In',

    locale: 'en_IN',

    type: 'website',

    images: [
      {
        url: '/logo.png',
        width: 512,
        height: 512,
        alt: 'Digital Dine-In Logo',
      },
    ],
  },

  // =========================================================
  // X / TWITTER PREVIEW
  // =========================================================
  twitter: {
    card: 'summary_large_image',

    title: 'Digital Dine-In | Smart QR Restaurant Ordering',

    description:
      'Digital restaurant menus, QR ordering, online payments, kitchen management and digital billing.',

    images: ['/logo.png'],
  },

  // =========================================================
  // GOOGLE / SEARCH ENGINE CRAWLING
  // =========================================================
  robots: {
    index: true,
    follow: true,

    googleBot: {
      index: true,
      follow: true,

      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },

  // =========================================================
  // OPTIONAL CATEGORY INFORMATION
  // =========================================================
  category: 'technology',

  // =========================================================
  // REFERRER POLICY
  // =========================================================
  referrer: 'origin-when-cross-origin',
}

// ===========================================================
// VIEWPORT
// Existing mobile/PWA configuration preserved
// ===========================================================

export const viewport = {
  width: 'device-width',

  initialScale: 1,

  maximumScale: 1,

  viewportFit: 'cover',

  themeColor: '#f97316',
}

// ===========================================================
// THEME INITIALIZATION
// Existing functionality preserved
// ===========================================================

const themeInit = `
(function () {
  try {
    var saved = localStorage.getItem('digitaldining-theme');

    var theme = saved === 'light' || saved === 'dark'
      ? saved
      : (
          window.matchMedia('(prefers-color-scheme: light)').matches
            ? 'light'
            : 'dark'
        );

    document.documentElement.dataset.theme = theme;
  } catch (e) {
    document.documentElement.dataset.theme = 'dark';
  }
})();
`

// ===========================================================
// ROOT LAYOUT
// ===========================================================

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>

      <head>
        {/* Existing theme initialization */}
        <Script
          id="digitaldining-theme-init"
          strategy="beforeInteractive"
        >
          {themeInit}
        </Script>
      </head>

      <body className="antialiased">

        {/* Existing PWA registration */}
        <PWARegister />

        {/* Application */}
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