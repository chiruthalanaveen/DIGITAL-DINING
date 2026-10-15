import './dd-business.css'

export const metadata = {
  title: 'DD Business | Digital Dine-In',
  description: 'Secure restaurant, delivery and staff operations from Digital Dine-In.',
  applicationName: 'DD Business',
  manifest: '/manifests/dd-business.webmanifest',
  appleWebApp: { capable: true, title: 'DD Business', statusBarStyle: 'default' },
  icons: {
    icon: '/dd-apps/business-192.png',
    apple: '/dd-apps/business-192.png',
  },
}

export default function DDBusinessLayout({ children }) {
  return children
}
