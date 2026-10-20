import Link from 'next/link'
import OwnerDeletionRequestClient from '@/app/components/OwnerDeletionRequestClient'

export const metadata = {
  title: 'Delete My Account | Digital Dine-In',
  description: 'How to request verified deletion of a Digital Dine-In account and personal information.',
  alternates: { canonical: '/delete-account' },
}

const PRIVACY_EMAIL = String(process.env.PRIVACY_CONTACT_EMAIL || '').trim()
const roles = ['Restaurant owner', 'Manager', 'Waiter', 'Kitchen / KDS', 'Packer', 'Delivery driver', 'Delivery customer / user']

export default function DeleteAccountPage() {
  const subject = encodeURIComponent('Digital Dine-In: Account deletion request')
  const body = encodeURIComponent(
    'Please help me delete my Digital Dine-In account.\n\nMy account role (owner/manager/waiter/KDS/packer/driver/customer): \nEmail or phone associated with my account: \nRestaurant/store name (if applicable): \n\nPlease tell me how to verify my identity securely. I will not send passwords, OTPs, payment card data, or government IDs by email.'
  )
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:py-12">
      <div className="mx-auto max-w-xl">
        <Link href="/privacy-policy" className="text-xs font-semibold text-orange-700 hover:underline">← Privacy Policy</Link>
        <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <p className="text-xs font-bold uppercase tracking-widest text-orange-600">Account and privacy</p>
          <h1 className="mt-2 text-2xl font-bold">Delete My Account</h1>
          <p className="mt-3 text-sm leading-7 text-slate-600">
            This page starts a <strong>deletion request</strong>; it does not instantly remove your account.
            Our team must verify account ownership and check the status of orders, payments and legal retention requirements before carrying out deletion.
          </p>
          <h2 className="mt-6 text-sm font-bold">Supported account types</h2>
          <ul className="mt-3 grid grid-cols-2 gap-2 text-xs text-slate-700">
            {roles.map(role => <li key={role} className="rounded-lg bg-slate-50 px-3 py-2">{role}</li>)}
          </ul>
          <h2 className="mt-6 text-sm font-bold">What happens next?</h2>
          <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-6 text-slate-600">
            <li>Request deletion using the privacy contact below or the in-app Help Centre.</li>
            <li>We will ask you to verify ownership through an appropriate secure method. Do not send passwords or OTPs.</li>
            <li>We will assess active orders, disputes, business ownership and any mandatory data-retention obligations.</li>
            <li>Once eligible, access will be revoked and removable personal records will be deleted or anonymized across relevant systems according to the approved process.</li>
            <li>We will explain any records that must be retained under law and when remaining backup copies are expected to expire.</li>
          </ol>
          <OwnerDeletionRequestClient />
          {PRIVACY_EMAIL ? (
            <a
              href={`mailto:${PRIVACY_EMAIL}?subject=${subject}&body=${body}`}
              className="mt-6 flex min-h-12 items-center justify-center rounded-xl bg-slate-900 px-4 text-center text-sm font-semibold text-white hover:bg-slate-800"
            >
              Email account deletion request
            </a>
          ) : (
            <p className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
              The privacy request email has not been configured yet. Use the in-app Help Centre to contact support. The public deletion email must be configured before launch.
            </p>
          )}
          <p className="mt-4 text-xs leading-5 text-slate-500">
            This is a request and verification path, <strong>not an automated deletion service</strong>. No account is deleted by opening this page, submitting the verified request, or sending an email.
          </p>
        </section>
      </div>
    </main>
  )
}