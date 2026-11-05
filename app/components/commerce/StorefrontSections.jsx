'use client'

import Image from 'next/image'
import { useState } from 'react'

export const TEMPLATE_COPY = {
  general: { collection: 'The collection', browse: 'Explore the collection', category: 'Shop by category' },
  sarees: { collection: 'Saree collection', browse: 'Browse sarees', category: 'Explore the collections' },
  fashion: { collection: 'The edit', browse: 'Shop the edit', category: 'Find your style' },
  grocery: { collection: 'Shop groceries', browse: 'Shop products', category: 'Browse the aisles' },
  food: { collection: 'Our menu', browse: 'View the menu', category: 'Menu categories' },
}

function SectionImage({ url, alt = '', className = '', eager = false }) {
  const [failed, setFailed] = useState(false)
  if (!url || failed || !/^https?:\/\//i.test(url) && !url.startsWith('/') || url.startsWith('//') || url.includes('\\')) return null
  return <Image src={url} alt={alt} className={className} width={1440} height={1100} unoptimized loading={eager ? 'eager' : 'lazy'} fetchPriority={eager ? 'high' : undefined} onError={() => setFailed(true)} />
}

function Hero({ website, section, template }) {
  const branding = website.branding || {}
  const fulfillment = website.fulfillment || {}
  const image = section.image_url || branding.banner_url
  return <section className={`cs-hero cs-container cs-template-hero ${image ? 'cs-hero-with-image' : ''}`} aria-labelledby="store-title">
    <div className="cs-hero-copy">
      <p className="cs-eyebrow">{website.name}</p>
      <h1 id="store-title">{section.title || branding.headline || website.name}</h1>
      {(section.body || branding.description) && <p className="cs-hero-description">{section.body || branding.description}</p>}
      <a className="cs-primary" href="#collection">{TEMPLATE_COPY[template].browse} <span aria-hidden="true">↗</span></a>
      <div className="cs-hero-notes">{fulfillment.pickup !== false && <span>Store pickup</span>}{fulfillment.delivery === true && <span>Local delivery</span>}{website.features?.cod !== false && (fulfillment.pickup !== false || fulfillment.delivery === true) && <span>{fulfillment.pickup !== false && fulfillment.delivery !== true ? 'Pay at pickup' : 'Cash on delivery'}</span>}</div>
    </div>
    <div className="cs-hero-art" aria-hidden="true">{image ? <SectionImage key={image} url={image} eager /> : <><span className="cs-hero-orbit" /><span className="cs-hero-initial">{website.name.slice(0, 1).toUpperCase()}</span></>}</div>
  </section>
}

function CategorySection({ categories, onCategory, title, template }) {
  if (!categories.length) return null
  return <section className="cs-config-section cs-container cs-category-directory"><h2>{title || TEMPLATE_COPY[template].category}</h2><div>{categories.map((category, index) => <a href="#collection" key={category.id} onClick={() => onCategory(category.id)}><span aria-hidden="true">{String(index + 1).padStart(2, '0')}</span><strong>{category.name}</strong><span aria-hidden="true">↗</span></a>)}</div></section>
}

export function StorefrontFAQ({ faq = [], title = 'Frequently asked questions' }) {
  const entries = (Array.isArray(faq) ? faq : []).filter(entry => entry && typeof entry.question === 'string' && entry.question.trim() && typeof entry.answer === 'string' && entry.answer.trim())
  if (!entries.length) return null
  return <section className="cs-config-section cs-container cs-faq"><h2>{title}</h2>{entries.map((entry, index) => <details key={`${index}:${entry.question}`}><summary>{entry.question}</summary><p>{entry.answer}</p></details>)}</section>
}

/** Only known section types render; all copy stays plain text. Array order is preserved. */
export default function StorefrontSections({ website, categories, products, template, onCategory, renderProduct }) {
  const settings = website.settings || {}
  const configured = Array.isArray(settings.sections) && settings.sections.length > 0
  const sections = configured ? settings.sections : [{ id: 'default-hero', type: 'hero', enabled: true }]
  const firstHero = sections.findIndex(section => section?.type === 'hero' && section.enabled !== false)
  return <div className="cs-home-sections">{sections.map((section, index) => {
    if (!section || section.enabled === false) return null
    const key = section.id || `section-${index}`
    if (section.type === 'hero') {
      if (index !== firstHero) return null
      return <Hero key={key} website={website} section={section} template={template} />
    }
    if (section.type === 'categories') return <CategorySection key={key} categories={section.category_id ? categories.filter(category => category.id === section.category_id) : categories} onCategory={onCategory} title={section.title} template={template} />
    if (section.type === 'faq') return <StorefrontFAQ key={key} faq={settings.faq} title={section.title || undefined} />
    if (section.type === 'featured_products') {
      const ids = Array.isArray(section.product_ids) ? section.product_ids : []
      const selected = ids.length ? ids.map(id => products.find(product => product.id === id)).filter(Boolean) : section.category_id ? products.filter(product => product.category_id === section.category_id) : []
      if (!selected.length) return null
      return <section key={key} className="cs-config-section cs-container"><h2>{section.title || 'Featured products'}</h2>{section.body && <p>{section.body}</p>}<div className="cs-product-grid">{selected.map(renderProduct)}</div></section>
    }
    if (['banner', 'text'].includes(section.type) && (section.title || section.body || section.image_url)) return <section key={key} className={`cs-config-section cs-container cs-content-section cs-content-${section.type}`}>
      {section.image_url && <SectionImage key={section.image_url} url={section.image_url} alt={section.title || ''} />}
      <div>{section.title && <h2>{section.title}</h2>}{section.body && <p>{section.body}</p>}</div>
    </section>
    return null
  })}{!sections.some(section => section?.type === 'hero' && section.enabled !== false) && <h1 id="store-title" className="cs-sr-only">{website.name}</h1>}</div>
}

export function StorefrontPolicies({ settings = {} }) {
  const policies = settings?.policies || {}
  const labels = { shipping: 'Shipping policy', returns: 'Returns policy', privacy: 'Privacy policy', terms: 'Terms and conditions' }
  const rows = Object.entries(labels).filter(([key]) => typeof policies[key] === 'string' && policies[key].trim())
  const returnDays = policies.returns_enabled === true && typeof policies.returns === 'string' && policies.returns.trim() && Number.isInteger(policies.return_days) && policies.return_days >= 1 && policies.return_days <= 365 ? policies.return_days : null
  if (!rows.length && returnDays === null) return null
  return <section className="cs-config-section cs-container cs-policies" aria-label="Store policies"><h2>Store policies</h2>{returnDays !== null && <p>Return requests are accepted within {returnDays} {returnDays === 1 ? 'day' : 'days'}, subject to the store’s return policy.</p>}{rows.map(([key, label]) => <details key={key}><summary>{label}</summary><p>{policies[key]}</p></details>)}</section>
}
