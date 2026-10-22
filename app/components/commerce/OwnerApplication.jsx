'use client'

import Link from 'next/link'
import { useState } from 'react'
import { commerceFetch } from '@/lib/commerce/client'
import { OWNER_BUSINESSES, OwnerAccess, slugify, useOwnerSession } from './OwnerSession'

const requestedFeatures = [
  ['catalog', 'Product catalog'], ['inventory', 'Inventory management'], ['cod', 'Cash on delivery'],
  ['pickup', 'Store pickup'], ['delivery', 'Local delivery'], ['branding', 'Brand customization'],
  ['online_payments', 'Online payments (review request)'],
]

function Application({ state }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [application, setApplication] = useState(null)
  const [slug, setSlug] = useState('')
  const [businessType, setBusinessType] = useState('general')

  async function submit(event) {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setError('')
    const form = new FormData(event.currentTarget)
    try {
      const result = await commerceFetch('/api/commerce/applications', {
        client: state.client,
        method: 'POST',
        body: {
          owner_name: String(form.get('owner_name') || '').trim(),
          business_name: String(form.get('business_name') || '').trim(),
          business_type: businessType,
          phone: String(form.get('phone') || '').trim(),
          address: String(form.get('address') || '').trim(),
          preferred_slug: slug,
          description: String(form.get('description') || '').trim(),
          required_features: form.getAll('features').map(String),
          product_categories: String(form.get('product_categories') || '').split(',').map(value => value.trim()).filter(Boolean),
          fulfillment: { pickup: form.get('pickup') === 'on', delivery: form.get('delivery') === 'on' },
          branding_preferences: String(form.get('branding_preferences') || '').trim(),
          payment_requirements: String(form.get('payment_requirements') || '').trim(),
        },
      })
      setApplication(result.application)
    } catch (requestError) { setError(requestError.message || 'Unable to submit your application. Please try again.') }
    finally { setBusy(false) }
  }

  return (
    <main className="co-main">
      <div className="co-page-heading"><div><span className="co-eyebrow">Let’s build your next chapter</span><h1>Tell us about your business.</h1><p>Your answers help our team set up the right storefront. Applying does not create a subscription charge or activate payment processing.</p></div><Link className="co-text-link" href="/commerce/dashboard">View my applications →</Link></div>
      <OwnerAccess state={state}>
        {application ? <section className="co-card co-empty"><span className="co-empty-icon" aria-hidden="true">✓</span><span className="co-eyebrow">Application received</span><h2>Thank you, {application.owner_name || 'business owner'}.</h2><p>Your application for {application.business_name} has been submitted. Our team will review your requirements before assigning and activating a website.</p><p><span className={`co-badge co-badge-${application.status}`}>{String(application.status).replaceAll('_', ' ')}</span></p><Link className="co-button co-button-primary" href="/commerce/dashboard">Track your application →</Link></section> : <div className="co-application-layout">
          <section className="co-card">
            <form className="co-form" onSubmit={submit}>
              <div className="co-form-section"><h2>Business details</h2><p>The basics about you and the store you want to create.</p><div className="co-form-grid">
                <label>Owner name<input name="owner_name" required autoComplete="name" maxLength={120} placeholder="Your full name" /></label>
                <label>Business / store name<input name="business_name" required maxLength={160} placeholder="The name customers know" /></label>
                <label>Business category<select value={businessType} onChange={event => setBusinessType(event.target.value)}>{OWNER_BUSINESSES.map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>
                <label>Mobile number<input name="phone" type="tel" autoComplete="tel" required maxLength={30} placeholder="Include your country code" /></label>
                <label>Email address<input type="email" value={state.session?.user.email || ''} readOnly disabled /><span className="co-form-note">From your verified owner account.</span></label>
                <label>Preferred website slug<input name="preferred_slug" value={slug} onChange={event => setSlug(slugify(event.target.value).slice(0, 48))} required minLength={3} maxLength={48} pattern="[a-z0-9]+(?:-[a-z0-9]+)*" placeholder="your-store" /><span className="co-form-note">Preview path: /shops/{slug || 'your-store'}. Final availability is confirmed by Admin.</span></label>
                <label className="co-span-full">Business address<textarea name="address" autoComplete="street-address" required maxLength={1000} placeholder="Street address, city, state and postal code" /></label>
                <label className="co-span-full">Describe your business<textarea name="description" required maxLength={3000} placeholder="What do you sell, who do you serve, and what makes your store special?" /></label>
              </div></div>
              <div className="co-form-section"><h2>Your storefront requirements</h2><p>Choose what you need. Our team reviews the features available for your website.</p>
                <fieldset><legend>Features you would like</legend><div className="co-checks">{requestedFeatures.map(([value, title]) => <label key={value}><input type="checkbox" name="features" value={value} defaultChecked={value === 'catalog' || value === 'cod'} />{title}</label>)}</div></fieldset>
                <label style={{ marginTop: 20 }}>Product categories<input name="product_categories" maxLength={1000} placeholder="For example: Sarees, Blouses, Accessories" /><span className="co-form-note">Separate category names with commas.</span></label>
                <fieldset style={{ marginTop: 20 }}><legend>How will customers receive orders?</legend><div className="co-checks"><label><input type="checkbox" name="pickup" defaultChecked />Store pickup</label><label><input type="checkbox" name="delivery" />Local delivery</label></div></fieldset>
              </div>
              <div className="co-form-section"><h2>Make it feel like your business</h2><p>Tell us about your visual style and payment requirements.</p><div className="co-form-grid">
                <label>Branding preferences<textarea name="branding_preferences" maxLength={2000} placeholder="Preferred colors, your logo, and the feeling you want your store to have" /></label>
                <label>Payment requirements<textarea name="payment_requirements" maxLength={1000} defaultValue="Cash on delivery / pay at pickup" /><span className="co-form-note">Online payments require a separate reviewed provider integration. They are not enabled by this application.</span></label>
              </div></div>
              {businessType === 'pharmacy' && <p className="co-message co-message-info">Pharmacy websites require licensing and regulatory review. Medication sales and pharmacy website activation are not available in this release.</p>}
              {error && <p className="co-message co-message-error" role="alert">{error}</p>}
              <div className="co-form-row"><p className="co-form-note">You can track the review from your owner workspace.</p><button className="co-button co-button-primary" type="submit" disabled={busy}>{busy ? 'Submitting…' : 'Submit application'} <span aria-hidden="true">→</span></button></div>
            </form>
          </section>
          <aside className="co-side-note"><span className="co-eyebrow">What happens next</span><h3>A little guidance,<br />every step of the way.</h3><ol className="co-status-list">{['Application submitted', 'Requirements reviewed', 'Admin approval', 'Website setup', 'Store activation'].map((title, index) => <li key={title}><b>{index + 1}</b>{title}</li>)}</ol><p>Every website has its own catalog, orders and owner permissions. Our team controls activation and feature availability.</p><p>The shared storefront is included in this foundation. Industry-specific layouts and verified custom domains will be added separately.</p></aside>
        </div>}
      </OwnerAccess>
    </main>
  )
}

export default function OwnerApplication() {
  const state = useOwnerSession()
  return <Application key={state.session?.user.id || 'signed-out'} state={state} />
}
