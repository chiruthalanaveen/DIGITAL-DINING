import Link from 'next/link'

export default function CommercePage() {
  return (
    <main className="co-main co-welcome">
      <section className="co-hero">
        <div className="co-hero-copy">
          <span className="co-eyebrow">Your business. Your storefront.</span>
          <h1>A home for your next<br /><em>great little business.</em></h1>
          <p>Bring your products, your story and your customers together. We set up your online store; you make it your own.</p>
          <div className="co-actions"><Link className="co-button co-button-primary" href="/commerce/auth?mode=signup&next=/commerce/apply">Start your application <span aria-hidden="true">→</span></Link><Link className="co-button co-button-outline" href="/commerce/auth">Sign in</Link></div>
          <div className="co-hero-note"><span aria-hidden="true">✓</span> Your own catalog <span aria-hidden="true">✓</span> Separate owner workspace <span aria-hidden="true">✓</span> Admin-assisted setup</div>
        </div>
        <div className="co-store-preview" aria-label="Illustration of a customizable storefront">
          <div className="co-preview-toolbar"><span><i /> <i /> <i /></span><span>your-store · preview</span><span>◦ ◦ ◦</span></div>
          <div className="co-preview-content">
            <div className="co-preview-brand"><strong>Your everyday favourites.</strong><span>Thoughtfully picked. Made for you.</span></div>
            <div className="co-preview-products"><div className="co-preview-product co-preview-lime"><span aria-hidden="true">◒</span><small>Your collection</small></div><div className="co-preview-product co-preview-peach"><span aria-hidden="true">✳</span><small>Your bestsellers</small></div><div className="co-preview-product co-preview-blue"><span aria-hidden="true">✦</span><small>Your new arrivals</small></div></div>
            <div className="co-preview-bottom"><span>One store. Entirely yours.</span><span aria-hidden="true">↗</span></div>
          </div>
          <div className="co-preview-badge"><span aria-hidden="true">✦</span><strong>Built around your brand<small>A shared platform, an independent identity</small></strong></div>
        </div>
      </section>
      <section className="co-section" aria-labelledby="co-how-title">
        <div className="co-section-title"><div><span className="co-eyebrow">From idea to opening day</span><h2 id="co-how-title">A straightforward start.</h2></div><p>Tell us what you need. We will review your business and help configure your store.</p></div>
        <div className="co-three-grid">{[
          ['01', 'Tell us your story', 'Create an owner account, verify your email and share your business requirements.'],
          ['02', 'Get your store set up', 'Our team reviews your application, assigns your website and enables the right features.'],
          ['03', 'Make it yours', 'Add products and categories, manage inventory and fulfil orders from your own workspace.'],
        ].map(([step, title, description]) => <article className="co-step" key={step}><span>{step}</span><h3>{title}</h3><p>{description}</p></article>)}</div>
      </section>
      <section className="co-ready"><div><span className="co-eyebrow">Already part of the family?</span><h2>Your store is waiting.</h2><p>Sign in to view your application or manage an assigned website.</p></div><Link className="co-button co-button-primary" href="/commerce/dashboard">Open owner workspace <span aria-hidden="true">→</span></Link></section>
    </main>
  )
}
