'use client'

export default function StoreError({ retry }) {
  return (
    <main className="commerce-store cs-unavailable">
      <p className="cs-eyebrow">Temporarily unavailable</p>
      <h1>We couldn’t load this store.</h1>
      <p>Please try again in a moment. No order has been placed by loading this page.</p>
      <button type="button" className="cs-primary" onClick={() => retry()}>Try again</button>
    </main>
  )
}
