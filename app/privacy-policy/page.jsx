import Link from 'next/link'

export const metadata = {
  title: 'Privacy Policy | Digital Dine-In',
  description:
    'How Digital Dine-In collects, uses, shares, protects and retains personal data across restaurant, staff and delivery services.',
  alternates: { canonical: '/privacy-policy' },
}

const UPDATED = '20 October 2026'

// Configure an email address that your team actually receives before deployment.
// Set PRIVACY_CONTACT_EMAIL in your server environment (do not put secrets here).
const PRIVACY_EMAIL = String(process.env.PRIVACY_CONTACT_EMAIL || '').trim()

const sections = [
  {
    title: '1. Who this policy covers',
    paragraphs: [
      'Digital Dine-In (also referred to as Digital Dine or the Platform) provides restaurant and hospitality tools, including QR ordering, restaurant operations, DD MART delivery, staff applications, billing, wallet and payment-related features, and support.',
      'This policy covers restaurant owners, managers, waiters, kitchen/KDS staff, packers, delivery drivers, delivery customers, QR-menu customers, and people who contact our support team. A restaurant may also independently decide how to use customer and employee information within its business; please contact that restaurant for questions about its separate practices.',
    ],
  },
  {
    title: '2. Personal data we collect',
    bullets: [
      'Account and identity details: name, restaurant or business name, email, phone number, date of birth where requested, role, restaurant/store association, and account identifiers.',
      'Authentication information: sign-in identifiers, account session information, Google/Apple sign-in identifiers where used, and passkey public-key/credential metadata where supported. Authentication providers manage passwords or device-based biometric authentication; the Platform does not need your fingerprint or face image to verify a passkey.',
      'Restaurant and staff activity: menu changes, assigned staff roles, order actions, kitchen activity, table/QR operations, attendance or operational records where those features are enabled.',
      'Ordering and delivery information: order items, contact details, delivery address, customer instructions, status, assignment details, and location information when you choose to share it or when required for an enabled delivery feature.',
      'Payment and wallet records: order totals, payment status, transaction references, wallet balances, recharge and platform-fee ledgers, invoices and settlement details. Payment processors such as Razorpay may collect additional payment information under their own policies.',
      'Support and safety information: help-centre chats, support messages, attachments, proof-of-delivery files or images where enabled, fraud or security reports, and communications with us.',
      'Technical information: IP address, device/browser information, timestamps, session events, error and security logs, push-notification identifiers where used, and necessary cookies or local storage for sign-in and preferences.',
    ],
  },
  {
    title: '3. How we use the information',
    bullets: [
      'Create and verify accounts, assign appropriate owner, manager, staff, driver, packer or customer permissions, and manage registration review.',
      'Provide QR menus, orders, kitchen workflows, payments, billing, staff operations, delivery tracking, and wallet/recharge management.',
      'Send operational messages, order updates, security alerts, account information, and customer support responses.',
      'Prevent fraudulent activity, investigate misuse, protect accounts and systems, diagnose technical problems, and maintain service reliability.',
      'Meet applicable accounting, tax, payment, recordkeeping, security, and legal obligations.',
      'Use optional location, notification and marketing features only when they are applicable and appropriately enabled or authorized.',
    ],
  },
  {
    title: '4. Who may access and receive data',
    paragraphs: [
      'People should only see the information needed for their authorized duties. For example, a restaurant owner or permitted manager may need operational and order details for their own business; kitchen staff may need order preparation details; a driver may need the delivery information for an assigned order; and customers may access their own account and order details. These are intended access boundaries, and the underlying authorization policies must be implemented and tested.',
      'Information may be processed by infrastructure, authentication, payment, hosting, notification and support service providers used to operate Digital Dine-In, including Supabase, Razorpay, and Google or Apple when you select those sign-in methods. We may disclose information when required by law or to protect users and the Platform.',
      'We do not intend to sell personal data to advertisers. We do not authorize one restaurant tenant to browse another restaurant tenant’s private account, staff, order, or customer records.',
    ],
  },
  {
    title: '5. Security and tenant separation',
    paragraphs: [
      'We use or plan to apply appropriate account authentication, least-privilege role permissions, tenant-based access checks, database Row Level Security where applicable, protected server-side APIs, restricted service-role credentials, monitoring, and secure transport. No system can be guaranteed completely secure.',
      'A URL or restaurant ID alone must not grant access to private records. Operational access rules are enforced by the server and database—not merely by hiding buttons in an app. If you suspect unauthorized access, notify us promptly.',
    ],
  },
  {
    title: '6. Your choices and rights',
    paragraphs: [
      'Subject to applicable law and appropriate identity verification, you may ask about the data we hold, request correction or updating, withdraw consent where applicable, raise a privacy concern, or request deletion of your account and data that is no longer needed.',
      'For account deletion, use the Delete My Account page linked below. Requests involving staff, driver, packer or business accounts may require verification and review of outstanding orders, wallet activity, access responsibilities, and legal retention obligations.',
    ],
  },
  {
    title: '7. Account deletion and data retention',
    paragraphs: [
      'After an authorized deletion request is verified and approved for processing, we will remove or anonymize account information that is no longer required, revoke relevant access, and work through applicable operational databases and service providers. Personal data within short-lived caches and backups may expire under controlled retention schedules rather than being instantly removable.',
      'Some records, including payment, tax, transaction, dispute, fraud-prevention, and security records, may need to remain for periods required by applicable law. Where such retention is necessary, access should be restricted and the information should not be reused for unrelated purposes. We will explain applicable exceptions when handling the request.',
      'Deleting a staff member’s account must not silently delete the restaurant’s order history or another person’s records. Business ownership transfers and deletion of an entire restaurant require separate verification and administrative controls.',
    ],
  },
  {
    title: '8. Location, notifications and external services',
    paragraphs: [
      'When delivery or tracking features use location, collection should be limited to the enabled purpose and permissions available on the device. You can manage operating-system permissions, although some delivery functions may not work without required access.',
      'Third-party services may have their own privacy notices. We encourage you to review them when using Google, Apple, Razorpay, and other external services presented in the Platform.',
    ],
  },
  {
    title: '9. Data breaches',
    paragraphs: [
      'If we learn of a personal-data incident, we will investigate, contain the incident, assess affected accounts, preserve relevant evidence, and provide notices to affected people and competent authorities as required by the laws in force at that time. A notice may describe what happened, likely consequences, protective steps, remediation, and how to contact us.',
      'Incident notification timelines and recipients may differ depending on the type of incident and the laws currently in force. The Indian CERT-In reporting rules and phased Digital Personal Data Protection framework are considered in our incident-response process.',
    ],
  },
  {
    title: '10. Policy updates',
    paragraphs: [
      'We may update this policy when features, data practices or legal requirements change. Material changes should be communicated through the website, application, or other suitable channels. The updated date appears at the top.',
    ],
  },
]

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-slate-50 px-4 py-8 text-slate-900 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-3xl">
        <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="text-sm font-bold tracking-tight text-slate-900 hover:text-orange-600">
            Digital Dine-In
          </Link>
          <div className="flex items-center gap-4 text-xs font-semibold text-slate-600">
            <Link href="/register" className="hover:text-orange-600">Sign up</Link>
            <Link href="/login" className="hover:text-orange-600">Log in</Link>
          </div>
        </header>

        <article className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-5 py-7 sm:px-10 sm:py-9">
            <p className="text-xs font-bold uppercase tracking-widest text-orange-600">Privacy and data rights</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight sm:text-4xl">Privacy Policy</h1>
            <p className="mt-3 text-sm leading-6 text-slate-600">
              What data we collect, why we use it, who can access it, and how to request changes or deletion.
            </p>
            <p className="mt-3 text-xs text-slate-500">Last updated: {UPDATED}</p>
          </div>

          <div className="space-y-8 px-5 py-7 sm:px-10 sm:py-10">
            {sections.map((section) => (
              <section key={section.title}>
                <h2 className="text-base font-bold text-slate-900">{section.title}</h2>
                {section.paragraphs?.map((paragraph) => (
                  <p key={paragraph} className="mt-3 text-sm leading-7 text-slate-600">{paragraph}</p>
                ))}
                {section.bullets && (
                  <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-7 text-slate-600">
                    {section.bullets.map((bullet) => <li key={bullet}>{bullet}</li>)}
                  </ul>
                )}
              </section>
            ))}

            <section className="rounded-xl border border-orange-200 bg-orange-50 p-5">
              <h2 className="text-base font-bold text-slate-900">11. Contact and deletion requests</h2>
              <p className="mt-2 text-sm leading-6 text-slate-700">
                For privacy questions, access or correction requests, deletion requests, and concerns about personal data, contact the Digital Dine-In privacy contact.
              </p>
              {PRIVACY_EMAIL ? (
                <a className="mt-3 inline-block break-all text-sm font-semibold text-orange-700 underline underline-offset-4" href={`mailto:${PRIVACY_EMAIL}`}>
                  {PRIVACY_EMAIL}
                </a>
              ) : (
                <p className="mt-3 text-sm font-semibold text-amber-800">
                  Privacy contact email is not configured. Please use the in-app Help Centre. A verified public contact must be added before production publication.
                </p>
              )}
              <div className="mt-4">
                <Link href="/delete-account" className="inline-flex min-h-11 items-center rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
                  Delete My Account / Request Deletion
                </Link>
              </div>
            </section>
          </div>
        </article>
      </div>
    </main>
  )
}