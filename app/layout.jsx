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

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-neutral-950 text-neutral-100 antialiased">
        {children}
        {/* Load Razorpay checkout script globally */}
        <Script 
          src="https://checkout.razorpay.com/v1/checkout.js" 
          strategy="lazyOnload" 
        />
      </body>
    </html>
  )
}