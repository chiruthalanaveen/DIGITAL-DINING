import './dd-delivery.css'

export const metadata = {
  title: 'DD Delivery | Digital Dine-In',
  description: 'Shop food, groceries, fruits and vegetables from local Digital Dine-In stores.',
  applicationName: 'DD Delivery',
  manifest: '/manifests/dd-delivery.webmanifest',
  appleWebApp: { capable: true, title: 'DD Delivery', statusBarStyle: 'default' },
  icons: {
    icon: '/dd-apps/delivery-192.png',
    apple: '/dd-apps/delivery-192.png',
  },
}

export default function DDDeliveryLayout({ children }) {
  return children
}
