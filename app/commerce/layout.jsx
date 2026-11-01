import Link from 'next/link'
import '@/app/components/commerce/owner.css'

export const metadata = {
  title: { absolute: 'Client Websites | Digital Dine-In' },
  description: 'Apply for and manage your independently branded online store with Digital Dine-In.',
  robots: { index: false, follow: false },
}

export default function CommerceLayout({ children }) {
  return (
    <div className="commerce-owner">
      <header className="co-header">
        <Link className="co-brand" href="/commerce" aria-label="Client Websites home">
          <span className="co-brand-mark" aria-hidden="true">DD</span>
          <span>Client Websites<small>by Digital Dine-In</small></span>
        </Link>
        <nav className="co-top-nav" aria-label="Client website navigation">
          <Link href="/commerce/apply">Apply for a website</Link>
          <Link className="co-nav-workspace" href="/commerce/dashboard">Owner workspace <span aria-hidden="true">↗</span></Link>
        </nav>
      </header>
      {children}
      <footer className="co-footer">
        <span>Digital Dine-In · Client Websites</span>
        <span><Link href="/privacy-policy">Privacy</Link><a href="mailto:digitaldining077@gmail.com">Contact support</a></span>
      </footer>
    </div>
  )
}
