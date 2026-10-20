import Link from 'next/link'

// Reusable, public links for website, owner, staff and delivery login screens.
// Add <PrivacyAndDeletionLinks /> below the sign-in form in each page.
export default function PrivacyAndDeletionLinks({ compact = false }) {
  return (
    <nav aria-label="Privacy and account choices" className={`text-center text-slate-500 ${compact ? 'mt-3' : 'mt-5 border-t border-slate-200 pt-4'}`}>
      <p className="text-xs leading-6">
        <Link href="/privacy-policy" className="font-semibold text-slate-700 underline underline-offset-4 hover:text-orange-600">
          Privacy Policy
        </Link>
        <span aria-hidden="true" className="mx-2 text-slate-300">·</span>
        <Link href="/delete-account" className="font-semibold text-slate-700 underline underline-offset-4 hover:text-orange-600">
          Delete My Account
        </Link>
      </p>
    </nav>
  )
}