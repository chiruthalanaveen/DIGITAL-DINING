import '@/app/components/commerce/storefront.css'
import '@/app/components/commerce/storefront-editorial.css'
import '@/app/components/commerce/product-gallery.css'

// A client storefront must not advertise the main application's install manifest.
export const metadata = {
  manifest: null,
  appleWebApp: null,
  icons: { icon: [], shortcut: [], apple: [] },
}

export default function ShopsLayout({ children }) {
  return children
}
