import Script from 'next/script'
import PWARegister from '@/app/components/PWARegister'
import './globals.css'


export const metadata = {
  title: 'Digital Dining | Smart QR Contactless Ordering',
  description:
    'Scan, explore dishes in 3D, order directly from your table, and pay seamlessly.',

  manifest: '/manifest.json',

  applicationName: 'Digital Dine',

  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Digital Dine',
  },

  formatDetection: {
    telephone: false,
  },

  icons: {
    icon: [
      {
        url: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
      {
        url: '/icons/icon-512.png',
        sizes: '512x512',
        type: 'image/png',
      },
    ],
    apple: [
      {
        url: '/icons/icon-192.png',
        sizes: '192x192',
        type: 'image/png',
      },
    ],
  },

  openGraph: {
    title: 'Digital Dining | Interactive 3D QR Menu',
    description:
      'Experience contactless digital dining right from your table.',
    url: 'https://www.digitaldine-in.online',
    siteName: 'Digital Dining',
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
  themeColor: '#f97316',
}

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

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <Script
          id="digitaldining-theme-init"
          strategy="beforeInteractive"
        >
          {themeInit}
        </Script>
      </head>

     <body className="antialiased">
  <PWARegister />

  {children}

  <Script
    src="https://checkout.razorpay.com/v1/checkout.js"
    strategy="lazyOnload"
  />
</body>
    </html>
  )
}