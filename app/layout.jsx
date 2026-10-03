import Script from 'next/script'
import PWARegister from '@/app/components/PWARegister'
import './globals.css'

export const metadata = {
  // =========================================================
  // BASE URL
  // =========================================================

  metadataBase: new URL(
    'https://digitaldine-in.online'
  ),

  // =========================================================
  // BASIC SEO
  // =========================================================

  title: {
    default:
      'Digital Dine-In | Smart QR Restaurant Ordering',

    template:
      '%s | Digital Dine-In',
  },

  description:
    'Digital Dine-In is a smart QR restaurant ordering platform for digital menus, dine-in and takeaway ordering, online payments, kitchen order management and digital billing.',

  applicationName:
    'Digital Dine-In',

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
      url:
        'https://digitaldine-in.online',
    },
  ],

  creator:
    'Digital Dine-In',

  publisher:
    'Digital Dine-In',

  // =========================================================
  // CANONICAL URL
  // =========================================================

  alternates: {
    canonical: '/',
  },

  // =========================================================
  // PWA
  //
  // IMPORTANT:
  // app/manifest.js is automatically served by Next.js as
  // /manifest.webmanifest
  // =========================================================

  manifest:
    '/manifest.webmanifest',

  appleWebApp: {
    capable: true,

    statusBarStyle:
      'black-translucent',

    title:
      'Digital Dine-In',
  },

  formatDetection: {
    telephone: false,
  },

  // =========================================================
  // ICONS
  // =========================================================

  icons: {
    icon: [
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
      '/icons/digital-dine-192.png',

    apple:
      '/icons/digital-dine-192.png',
  },

  // =========================================================
  // OPEN GRAPH
  // WhatsApp / Facebook / LinkedIn
  // =========================================================

  openGraph: {
    title:
      'Digital Dine-In | Smart QR Restaurant Ordering',

    description:
      'Smart QR menus, dine-in and takeaway ordering, online payments, kitchen management and digital billing for restaurants.',

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

        width: 512,

        height: 512,

        alt:
          'Digital Dine-In Logo',
      },
    ],
  },

  // =========================================================
  // X / TWITTER
  // =========================================================

  twitter: {
    card:
      'summary_large_image',

    title:
      'Digital Dine-In | Smart QR Restaurant Ordering',

    description:
      'Digital restaurant menus, QR ordering, online payments, kitchen management and digital billing.',

    images: [
      '/logo.png',
    ],
  },

  // =========================================================
  // GOOGLE / SEARCH ENGINE
  // =========================================================

  robots: {
    index: true,

    follow: true,

    googleBot: {
      index: true,

      follow: true,

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

// ===========================================================
// VIEWPORT
// ===========================================================

export const viewport = {
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

// ===========================================================
// THEME INITIALIZATION
// Existing functionality preserved
// ===========================================================

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

// ===========================================================
// PWA INSTALL EVENT
//
// Capture Chrome's install event BEFORE the customer Delivery
// page and InstallAppButton load.
// ===========================================================

const pwaInstallInit = `
(function () {

  try {

    if (
      window.__digitalDinePwaCaptureInstalled
    ) {
      return;
    }

    window.__digitalDinePwaCaptureInstalled =
      true;

    window.__digitalDineInstallPrompt =
      window.__digitalDineInstallPrompt ||
      null;

    window.addEventListener(
      'beforeinstallprompt',
      function (event) {

        console.log(
          '[PWA] beforeinstallprompt captured'
        );

        event.preventDefault();

        window.__digitalDineInstallPrompt =
          event;

        window.dispatchEvent(
          new CustomEvent(
            'digitaldine-install-ready'
          )
        );

      }
    );

    window.addEventListener(
      'appinstalled',
      function () {

        console.log(
          '[PWA] Digital Dine-In installed'
        );

        window.__digitalDineInstallPrompt =
          null;

        window.dispatchEvent(
          new CustomEvent(
            'digitaldine-app-installed'
          )
        );

      }
    );

  } catch (error) {

    console.warn(
      '[PWA] Early install capture failed:',
      error
    );

  }

})();
`

// ===========================================================
// ROOT LAYOUT
// ===========================================================

export default function RootLayout({
  children,
}) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
    >
      <head>

        {/* =============================================== */}
        {/* EXISTING THEME INITIALIZATION                   */}
        {/* =============================================== */}

        <Script
          id="digitaldining-theme-init"
          strategy="beforeInteractive"
        >
          {themeInit}
        </Script>

        {/* =============================================== */}
        {/* PWA INSTALL EVENT CAPTURE                       */}
        {/* =============================================== */}

        <Script
          id="digital-dine-pwa-install-init"
          strategy="beforeInteractive"
        >
          {pwaInstallInit}
        </Script>

      </head>

      <body className="antialiased">

        {/* =============================================== */}
        {/* EXISTING PWA SERVICE WORKER REGISTRATION        */}
        {/* =============================================== */}

        <PWARegister />

        {/* =============================================== */}
        {/* APPLICATION                                     */}
        {/* =============================================== */}

        {children}

        {/* =============================================== */}
        {/* EXISTING RAZORPAY                               */}
        {/* =============================================== */}

        <Script
          src="https://checkout.razorpay.com/v1/checkout.js"
          strategy="lazyOnload"
        />

      </body>
    </html>
  )
}