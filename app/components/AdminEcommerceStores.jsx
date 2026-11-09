'use client'

import { useMemo, useState } from 'react'

// Planning-only interface: no Supabase writes, no service-role credentials in browser.
// Production creation requires an authenticated admin API and verified SQL column schema.
const CATEGORY_FEATURES = {
  "pickles": [
    "Weight variants",
    "Spice level",
    "Veg/non-veg filters",
    "Ingredients",
    "Allergen information",
    "Shelf life",
    "Batch tracking",
    "FSSAI details",
    "Combo packs",
    "Quick add-to-cart",
    "Repeat order",
    "Bulk ordering",
    "Festival gift packs",
    "Delivery availability",
    "Subscription orders",
    "Customer reviews"
  ],
  "clothing": [
    "Size variants",
    "Color variants",
    "Saree material",
    "Blouse details",
    "Model photo gallery",
    "Size chart",
    "Virtual try-on",
    "New collections",
    "Festive lookbook",
    "Wishlist",
    "Reviews with photos",
    "Exchange management",
    "Preorder collections",
    "Custom tailoring",
    "Fabric care guide",
    "Fashion filters"
  ],
  "toys": [
    "Brand filters",
    "Scale variants",
    "Model specifications",
    "360° product gallery",
    "Limited editions",
    "Preorders",
    "Stock alerts",
    "Collector wishlist",
    "Condition grading",
    "Serial or edition numbers",
    "Bundles",
    "Product comparison",
    "Age suitability",
    "Reviews",
    "Related models",
    "Authenticity details"
  ],
  "groceries": [
    "Weight and quantity variants",
    "Fast add-to-cart",
    "Category navigation",
    "Search and filters",
    "Stock visibility",
    "Low-stock alerts",
    "Delivery slots",
    "Minimum order amount",
    "Delivery charges",
    "Handling charges",
    "Substitutions",
    "Repeat order",
    "Bundle discounts",
    "Barcode inventory",
    "Expiry tracking",
    "Local delivery zones"
  ],
  "snacks": [
    "Pack size variants",
    "Flavor variants",
    "Freshness dates",
    "Ingredient labels",
    "FSSAI details",
    "Gift hampers",
    "Combo offers",
    "Party bulk orders",
    "Preorder scheduling",
    "Fresh stock badges",
    "Delivery scheduling",
    "Quick add-to-cart",
    "Repeat order",
    "Reviews",
    "Seasonal specials",
    "Inventory alerts"
  ],
  "gifts": [
    "Photo upload",
    "Custom text",
    "Font and color options",
    "Live preview",
    "Gift wrapping",
    "Gift messages",
    "Occasion categories",
    "Delivery date selection",
    "Custom price calculation",
    "Design proof approval",
    "Made-to-order status",
    "Bulk corporate orders",
    "Digital file delivery",
    "Gift recipient address",
    "Reference image upload",
    "Custom order notes"
  ]
}
const SHARED_FEATURES = [
  "Product catalog",
  "Product images",
  "Inventory management",
  "Shopping cart",
  "Razorpay checkout",
  "Customer accounts",
  "Order management",
  "Shipment tracking",
  "Returns and refunds",
  "Sales dashboard",
  "Coupons and discounts",
  "Seasonal homepage banners",
  "SEO and social sharing",
  "WhatsApp sharing",
  "Invoice generation",
  "Store branding",
  "Revenue reports",
  "Admin approval",
  "Store access controls",
  "Audit logs"
]
const CATEGORIES = [
  ['pickles', 'Pickles', 'quick'],
  ['clothing', 'Clothing & Sarees', 'boutique'],
  ['toys', 'Diecast Cars & Toys', 'catalog'],
  ['groceries', 'Groceries', 'quick'],
  ['snacks', 'Snacks & Bakery', 'quick'],
  ['gifts', 'Custom Gifts', 'personalized'],
]
const inputClass = 'w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm text-white outline-none focus:border-red-500'

export default function AdminEcommerceStores() {
  const [name, setName] = useState('Ramu Pickles')
  const [slug, setSlug] = useState('ramu-pickles')
  const [category, setCategory] = useState('pickles')
  const [theme, setTheme] = useState('quick')
  const [payments, setPayments] = useState('razorpay_cod')
  const [shipping, setShipping] = useState('shipping')
  const [selected, setSelected] = useState({})
  const [shared, setShared] = useState({})
  const [copied, setCopied] = useState(false)
  const [exampleTotal, setExampleTotal] = useState(1000)
  const [platformFee, setPlatformFee] = useState('5.00')
  const [walletThreshold, setWalletThreshold] = useState('500.00')
  const [estimatedDeliveries, setEstimatedDeliveries] = useState('20')
  const slugValid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
  const features = CATEGORY_FEATURES[category]
  const chosen = (key) => selected[category]?.[key] !== false
  const selectedFeatures = useMemo(() => features.filter(chosen), [features, selected, category])
  const spec = {
    name: name.trim(), slug, category, theme, payment_mode: payments, fulfillment_mode: shipping,
    cod_advance_percent: payments === 'razorpay_cod' ? 20 : null,
    cod_collection_percent: payments === 'razorpay_cod' ? 80 : null,
    cod_advance_required_before_confirmation: payments === 'razorpay_cod', approval_status: 'pending', is_active: false,
    enabled_category_features: selectedFeatures,
    enabled_shared_features: SHARED_FEATURES.filter(x => shared[x] !== false),
    tracking: 'Ekart tracking URL; live events only via authorized provider API',
    wallet_policy: {
      platform_fee_paise: /^\d+(?:\.\d{1,2})?$/.test(platformFee) ? Math.round(Number(platformFee) * 100) : null,
      minimum_topup_paise: 200000,
      blocking_threshold_paise: /^\d+(?:\.\d{1,2})?$/.test(walletThreshold) ? Math.round(Number(walletThreshold) * 100) : null,
      daily_deduction_time: '23:00',
      timezone: 'Asia/Kolkata',
      charge_event: 'delivered',
      spendable_balance_formula: 'wallet_balance - pending_fees',
    },
  }
  const chooseCategory = (next) => {
    setCategory(next)
    setTheme(CATEGORIES.find(x => x[0] === next)?.[2] || 'quick')
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(spec, null, 2))
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div className="space-y-5">
      <div>
        <p className="text-[10px] font-black uppercase tracking-widest text-red-400">Super Admin / E-Commerce</p>
        <h1 className="mt-1 text-2xl font-black text-white">E-Commerce Stores</h1>
        <p className="mt-2 text-xs text-neutral-400">Configure stores for all six categories. This preview does not save to Supabase or activate a website.</p>
      </div>
      <div className="rounded-2xl border border-amber-600/30 bg-amber-500/10 p-4 text-xs text-amber-200" role="status">
        Step 2 UI preview only. Store creation, approvals and feature updates require a secure server API and schema verification before activation.
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <label className="space-y-2 text-xs font-bold text-neutral-300">Store name
          <input className={inputClass} value={name} onChange={e => { setName(e.target.value); setSlug(e.target.value.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')) }} />
        </label>
        <label className="space-y-2 text-xs font-bold text-neutral-300">Subdomain prefix
          <input className={inputClass} value={slug} onChange={e => setSlug(e.target.value.toLowerCase())} aria-invalid={!slugValid} />
          <span className={slugValid ? 'block text-neutral-400' : 'block text-red-400'}>{slugValid ? `${slug}.digitaldine-in.online` : 'Use lowercase letters, numbers and hyphens.'}</span>
        </label>
        <label className="space-y-2 text-xs font-bold text-neutral-300">Business category
          <select className={inputClass} value={category} onChange={e => chooseCategory(e.target.value)}>{CATEGORIES.map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select>
        </label>
        <label className="space-y-2 text-xs font-bold text-neutral-300">Storefront theme
          <select className={inputClass} value={theme} onChange={e => setTheme(e.target.value)}><option value="quick">Quick Shopping</option><option value="boutique">Fashion Boutique</option><option value="catalog">Amazon-style Catalog</option><option value="personalized">Custom Gifts</option></select>
        </label>
        <label className="space-y-2 text-xs font-bold text-neutral-300">Payment methods
          <select className={inputClass} value={payments} onChange={e => setPayments(e.target.value)}><option value="razorpay_cod">Razorpay + COD</option><option value="razorpay">Razorpay only</option></select>
        </label>
        <label className="space-y-2 text-xs font-bold text-neutral-300">Fulfillment
          <select className={inputClass} value={shipping} onChange={e => setShipping(e.target.value)}><option value="shipping">Courier shipping</option><option value="local">Local delivery</option><option value="both">Courier + local</option><option value="pickup">Store pickup</option></select>
        </label>
      </div>
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="font-bold text-white">E-Commerce COD payment policy</h2>
        <p className="mt-2 text-xs text-neutral-300">For COD orders, the customer must pay 20% online through Razorpay first. The remaining 80% is collected in cash on delivery. COD is unavailable if the advance payment is not verified.</p>
        <label className="mt-4 block text-xs font-bold text-neutral-300">Example order total (₹)
          <input className={inputClass + ' mt-2'} type="number" min="0" max="10000000" step="0.01" value={exampleTotal} onChange={e => setExampleTotal(e.target.value)} />
        </label>
        {(() => {
          const raw = String(exampleTotal).trim()
          const valid = /^\d+(?:\.\d{1,2})?$/.test(raw) && Number(raw) <= 10000000
          if (!valid) return <p className="mt-3 text-xs text-red-300">Enter a valid total with up to two decimal places.</p>
          const paise = Math.round(Number(raw) * 100)
          const advance = Math.ceil(paise * 20 / 100)
          const cash = paise - advance
          return <div className="mt-3 grid grid-cols-2 gap-3 text-sm text-white"><div className="rounded-xl bg-neutral-950 p-3">Razorpay advance: ₹{(advance / 100).toFixed(2)}</div><div className="rounded-xl bg-neutral-950 p-3">Cash due: ₹{(cash / 100).toFixed(2)}</div></div>
        })()}
        <p className="mt-3 text-xs text-amber-300">This page previews the policy only. The production checkout must calculate amounts server-side and verify Razorpay payments before confirming orders.</p>
      </div>
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="font-bold text-white">Owner wallet and platform fees</h2>
        <p className="mt-2 text-xs text-neutral-300">Preview of the e-commerce wallet policy. Charge once for each successfully delivered order. Deduct pending fees at 11:00 PM IST daily; never charge undelivered or cancelled orders.</p>
        <div className="mt-4 grid gap-4 sm:grid-cols-3">
          <label className="text-xs font-bold text-neutral-300">Fee per delivered order (₹)
            <input className={inputClass + ' mt-2'} type="number" min="0" max="100000" step="0.01" value={platformFee} onChange={e => setPlatformFee(e.target.value)} />
          </label>
          <label className="text-xs font-bold text-neutral-300">Order blocking threshold (₹)
            <input className={inputClass + ' mt-2'} type="number" min="0" max="10000000" step="0.01" value={walletThreshold} onChange={e => setWalletThreshold(e.target.value)} />
          </label>
          <label className="text-xs font-bold text-neutral-300">Example delivered orders
            <input className={inputClass + ' mt-2'} type="number" min="0" max="1000000" step="1" value={estimatedDeliveries} onChange={e => setEstimatedDeliveries(e.target.value)} />
          </label>
        </div>
        {/^\d+(?:\.\d{1,2})?$/.test(platformFee) && Number(platformFee) <= 100000 && /^\d+$/.test(estimatedDeliveries) && Number(estimatedDeliveries) <= 1000000 ? (
          <p className="mt-4 rounded-xl bg-neutral-950 p-3 text-sm font-bold text-white">Estimated nightly fee: ₹{(Math.round(Number(platformFee) * 100) * Number(estimatedDeliveries) / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</p>
        ) : <p className="mt-3 text-xs text-red-300">Enter valid fee and delivered-order counts.</p>}
        <p className="mt-3 text-xs text-amber-300">Minimum recharge ₹2,000. This is configuration only: no balance, order status, or wallet transaction is read or changed here. Nightly debit requires integration with your existing wallet tables and a verified scheduler.</p>
      </div>
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="font-bold text-white">Category features ({selectedFeatures.length}/{features.length})</h2><button type="button" className="text-xs font-bold text-red-300" onClick={() => setSelected(p => ({ ...p, [category]: Object.fromEntries(features.map(f => [f, true])) }))}>Select all</button></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{features.map(feature => <label key={feature} className="flex items-center gap-2 text-xs text-neutral-200"><input type="checkbox" checked={chosen(feature)} onChange={e => setSelected(p => ({ ...p, [category]: { ...p[category], [feature]: e.target.checked } }))} />{feature}</label>)}</div>
      </div>
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="font-bold text-white">Shared store features</h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">{SHARED_FEATURES.map(feature => <label key={feature} className="flex items-center gap-2 text-xs text-neutral-200"><input type="checkbox" checked={shared[feature] !== false} onChange={e => setShared(p => ({ ...p, [feature]: e.target.checked }))} />{feature}</label>)}</div>
        <p className="mt-3 text-xs text-neutral-500">Security, audit logging and payment verification cannot be disabled on the backend.</p>
      </div>
      <div className="rounded-2xl border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="font-bold text-white">Store configuration preview</h2>
        <pre className="mt-3 max-h-72 overflow-auto rounded-xl bg-neutral-950 p-3 text-xs text-neutral-300">{JSON.stringify(spec, null, 2)}</pre>
        <button type="button" onClick={copy} disabled={!slugValid || !name.trim()} className="mt-4 rounded-xl bg-red-600 px-5 py-3 text-xs font-bold text-white disabled:opacity-40">{copied ? 'Copied configuration' : 'Copy configuration JSON'}</button>
        <p className="mt-2 text-xs text-neutral-500">Copy is a planning action only. No store has been created.</p>
      </div>
    </div>
  )
}
