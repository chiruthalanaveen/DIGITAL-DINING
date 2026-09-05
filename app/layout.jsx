import Script from 'next/script'
import './globals.css'

export const metadata = {
  title: 'Digital Dining',
  description: 'Secure SaaS Platform for Restaurants',
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