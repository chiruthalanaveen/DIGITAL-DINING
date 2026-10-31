import '@/app/components/commerce/storefront.css'

// A client storefront must not advertise the main application's install manifest.
export const metadata = {
  manifest: null,
  appleWebApp: null,
  icons: { icon: [], shortcut: [], apple: [] },
}

export default function ShopsLayout({ children }) {
  return children
}
