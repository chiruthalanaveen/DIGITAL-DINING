import Script from 'next/script'
import './globals.css'

export const metadata = {
  title: 'Digital Dining | Smart QR Contactless Ordering',
  description: 'Scan, explore dishes in 3D, order directly from your table, and pay seamlessly.',
  openGraph: {
    title: 'Digital Dining | Interactive 3D QR Menu',
    description: 'Experience contactless digital dining right from your table.',
    url: 'https://www.digitaldine-in.online',
    siteName: 'Digital Dining',
  },
}

const themeInit = `
(function () {
  try {
    var saved = localStorage.getItem('digitaldining-theme');
    var theme = saved === 'light' || saved === 'dark'
      ? saved
      : (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
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
        <Script id="digitaldining-theme-init" strategy="beforeInteractive">
          {themeInit}
        </Script>
      </head>
      <body className="antialiased">
        {children}
        <Script
          src="https://checkout.razorpay.com/v1/checkout.js"
          strategy="lazyOnload"
        />
      </body>
    </html>
  )
}
