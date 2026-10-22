import Link from 'next/link'

export default function StoreNotFound() {
  return (
    <main className="commerce-store cs-unavailable">
      <p className="cs-eyebrow">Store unavailable</p>
      <h1>This storefront is not open.</h1>
      <p>The website may still be in setup or temporarily unavailable. Please check the link with the business owner.</p>
      <Link className="cs-primary" href="/commerce">Digital Dine-In Client Websites</Link>
    </main>
  )
}
