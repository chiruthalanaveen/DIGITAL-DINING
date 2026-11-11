'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import OwnerProductImages from './OwnerProductImages'

const input = 'w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-white focus:border-red-500 focus:outline-none'
const button = 'rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-40'
const panel = 'rounded-2xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5'
const slugify = value => String(value || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const money = value => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value || 0) / 100)
const rupees = value => (Number(value || 0) / 100).toFixed(2)
const emptyProduct = () => ({ name: '', slug: '', categoryId: '', description: '' })
const emptyVariant = () => ({ productId: '', sku: '', size: '', color: '', weight: '', option: '', price: '', compareAt: '', stock: '0' })
function toPaise(value, required = true) {
  const s = String(value ?? '').trim()
  if (!s && !required) return null
  if (!/^\d+(\.\d{1,2})?$/.test(s)) throw new Error('Enter a valid amount in rupees (up to two decimal places).')
  const n = Math.round(Number(s) * 100)
  if (!Number.isSafeInteger(n)) throw new Error('Amount is too large.')
  return n
}
function toStock(value) {
  const s = String(value ?? '').trim()
  if (!/^\d+$/.test(s) || !Number.isSafeInteger(Number(s))) throw new Error('Stock must be a non-negative whole number.')
  return Number(s)
}
function optionsFrom(form) {
  const options = {}
  for (const key of ['size', 'color', 'weight', 'option']) {
    const value = String(form[key] || '').trim()
    if (value) options[key] = value
  }
  return options
}
function variantForm(row) {
  const options = row.options && typeof row.options === 'object' ? row.options : {}
  return {
    productId: row.product_id, sku: row.sku || '',
    size: String(options.size || ''), color: String(options.color || options.colour || ''),
    weight: String(options.weight || ''), option: String(options.option || ''),
    price: rupees(row.price_paise), compareAt: row.compare_at_paise == null ? '' : rupees(row.compare_at_paise),
    stock: String(row.stock_quantity ?? 0),
  }
}
async function api(storeId, method = 'GET', body) {
  if (!storeId) throw new Error('Select a website.')
  const { data, error } = await supabase.auth.getSession()
  if (error || !data?.session?.access_token) throw new Error('Please sign in again.')
  const response = await fetch(`/api/ecommerce/owner/catalog?storeId=${encodeURIComponent(storeId)}`, {
    method, cache: 'no-store',
    headers: { Authorization: `Bearer ${data.session.access_token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify({ ...body, storeId }) } : {}),
  })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || !result.success) throw new Error(result.message || `Request failed (${response.status})`)
  return result
}

export default function OwnerProductManagement({ storeId, onChanged, storeCategory = '' }) {
  const [catalog, setCatalog] = useState({ categories: [], products: [], variants: [] })
  const [category, setCategory] = useState({ name: '', slug: '' })
  const [product, setProduct] = useState(emptyProduct)
  const [variant, setVariant] = useState(emptyVariant)
  const [editingProduct, setEditingProduct] = useState(null)
  const [editingVariant, setEditingVariant] = useState(null)
  const [photoProduct, setPhotoProduct] = useState(null)
  const [filter, setFilter] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const categories = useMemo(() => catalog.categories || [], [catalog.categories])
  const products = useMemo(() => catalog.products || [], [catalog.products])
  const variants = useMemo(() => catalog.variants || [], [catalog.variants])
  const grouped = useMemo(() => {
    const map = new Map()
    for (const item of variants) map.set(item.product_id, [...(map.get(item.product_id) || []), item])
    return map
  }, [variants])
  const visible = useMemo(() => products.filter(item => {
    const q = filter.trim().toLowerCase()
    const matchesText = `${item.name || ''} ${item.slug || ''} ${(grouped.get(item.id) || []).map(v => v.sku).join(' ')}`.toLowerCase().includes(q)
    return matchesText && (statusFilter === 'all' || item.status === statusFilter)
  }), [products, grouped, filter, statusFilter])
  const lowStock = variants.filter(v => v.is_active !== false && Number(v.stock_quantity || 0) <= 5).length

  const refresh = useCallback(async () => {
    if (!storeId) return
    const result = await api(storeId)
    setCatalog({ categories: result.categories || [], products: result.products || [], variants: result.variants || [] })
  }, [storeId])

  useEffect(() => {
    let active = true
    setLoading(true); setError(''); setNotice(''); setPhotoProduct(null)
    setEditingProduct(null); setEditingVariant(null)
    setCatalog({ categories: [], products: [], variants: [] })
    if (!storeId) { setLoading(false); return () => { active = false } }
    api(storeId).then(result => {
      if (active) setCatalog({ categories: result.categories || [], products: result.products || [], variants: result.variants || [] })
    }).catch(err => { if (active) setError(err.message) })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [storeId])

  async function act(work, message) {
    if (busy || loading || !storeId) return
    setBusy(true); setError(''); setNotice('')
    try { await work(); await refresh(); setNotice(message); onChanged?.() }
    catch (err) { setError(err.message || 'Request failed.') }
    finally { setBusy(false) }
  }

  async function addCategory(event) {
    event.preventDefault()
    await act(async () => {
      await api(storeId, 'POST', { entity: 'category', name: category.name, slug: category.slug })
      setCategory({ name: '', slug: '' })
    }, 'Category created.')
  }
  async function saveProduct(event) {
    event.preventDefault()
    const isEdit = Boolean(editingProduct)
    await act(async () => {
      await api(storeId, isEdit ? 'PATCH' : 'POST', {
        entity: 'product', ...(isEdit ? { productId: editingProduct.id } : {}),
        ...product, categoryId: product.categoryId || null,
      })
      setProduct(emptyProduct()); setEditingProduct(null)
    }, isEdit ? 'Product updated.' : 'Draft product created.')
  }
  async function saveVariant(event) {
    event.preventDefault()
    const isEdit = Boolean(editingVariant)
    await act(async () => {
      const pricePaise = toPaise(variant.price)
      const compareAtPaise = toPaise(variant.compareAt, false)
      if (compareAtPaise !== null && compareAtPaise < pricePaise) throw new Error('MRP cannot be less than selling price.')
      await api(storeId, isEdit ? 'PATCH' : 'POST', {
        entity: 'variant', ...(isEdit ? { variantId: editingVariant.id } : { productId: variant.productId }),
        sku: variant.sku.trim(), options: optionsFrom(variant),
        pricePaise, compareAtPaise, stockQuantity: toStock(variant.stock),
      })
      setVariant(emptyVariant()); setEditingVariant(null)
    }, isEdit ? 'Variant updated.' : 'Variant added.')
  }
  async function changeProduct(item, status) {
    if (!window.confirm(`Change ${item.name} to ${status}?`)) return
    await act(() => api(storeId, 'PATCH', { entity: 'product', productId: item.id, status }), 'Product status updated.')
  }
  async function toggleVariant(item) {
    await act(() => api(storeId, 'PATCH', { entity: 'variant', variantId: item.id, isActive: !item.is_active }), 'Variant availability updated.')
  }
  function startProductEdit(item) {
    setEditingProduct(item)
    setProduct({ name: item.name || '', slug: item.slug || '', categoryId: item.category_id || '', description: item.description || '' })
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  function startVariantEdit(item) {
    setEditingVariant(item)
    setVariant(variantForm(item))
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  const changeProductField = (key, value) => setProduct(old => ({ ...old, [key]: value }))
  const changeVariantField = (key, value) => setVariant(old => ({ ...old, [key]: value }))

  return (
    <div className="space-y-5 text-white">
      {photoProduct && <OwnerProductImages key={`photos-${photoProduct.id}`} storeId={storeId} productId={photoProduct.id} productName={photoProduct.name} onClose={() => setPhotoProduct(null)} />}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-bold">Manage products</h2><p className="text-sm text-neutral-400">Categories, products, photographs, variants and inventory</p></div>
        <button type="button" className={button} disabled={busy || loading} onClick={() => act(async () => {}, 'Catalog refreshed.')}>Refresh</button>
      </div>
      {error && <p role="alert" className="rounded-xl border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-800 bg-emerald-950/30 p-3 text-sm text-emerald-300">{notice}</p>}
      {loading && <p className="text-sm text-neutral-400">Loading catalog…</p>}
      <div className="grid gap-3 sm:grid-cols-3">
        {[['Products', products.length], ['Variants', variants.length], ['Low / zero stock variants', lowStock]].map(([label, count]) => (
          <div key={label} className={panel}><p className="text-xs text-neutral-400">{label}</p><p className="mt-1 text-2xl font-bold">{count}</p></div>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <section className={panel}>
          <h3 className="mb-3 font-bold">Add category</h3>
          <form onSubmit={addCategory} className="space-y-3">
            <input className={input} aria-label="Category name" placeholder="Category name" required maxLength={100} value={category.name} onChange={e => setCategory({ name: e.target.value, slug: slugify(e.target.value) })} />
            <input className={input} aria-label="Category slug" placeholder="Category slug" required value={category.slug} onChange={e => setCategory(old => ({ ...old, slug: slugify(e.target.value) }))} />
            <button className={button} disabled={busy || loading || !storeId}>Create category</button>
          </form>
          <div className="mt-3 flex flex-wrap gap-2">{categories.map(c => <span key={c.id} className="rounded-lg border border-neutral-700 px-2 py-1 text-xs">{c.name}</span>)}</div>
        </section>
        <section className={panel}>
          <div className="mb-3 flex items-center justify-between gap-3"><h3 className="font-bold">{editingProduct ? `Edit: ${editingProduct.name}` : 'Add product'}</h3>{editingProduct && <button type="button" className={button} onClick={() => { setEditingProduct(null); setProduct(emptyProduct()) }}>Cancel edit</button>}</div>
          <form onSubmit={saveProduct} className="space-y-3">
            <input className={input} aria-label="Product name" placeholder="Product name" required maxLength={200} value={product.name} onChange={e => setProduct(old => ({ ...old, name: e.target.value, ...(!editingProduct ? { slug: slugify(e.target.value) } : {}) }))} />
            <input className={input} aria-label="Product slug" placeholder="Product slug" required value={product.slug} onChange={e => changeProductField('slug', slugify(e.target.value))} />
            <select className={input} aria-label="Product category" value={product.categoryId} onChange={e => changeProductField('categoryId', e.target.value)}><option value="">No category</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            <textarea className={input} aria-label="Description" placeholder="Description" rows={3} maxLength={10000} value={product.description} onChange={e => changeProductField('description', e.target.value)} />
            <button className={button} disabled={busy || loading || !storeId}>{editingProduct ? 'Save product changes' : 'Create draft product'}</button>
          </form>
        </section>
      </div>
      <section className={panel}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">{editingVariant ? `Edit variant: ${editingVariant.sku}` : 'Add variant / stock'}</h3>{editingVariant && <button type="button" className={button} onClick={() => { setEditingVariant(null); setVariant(emptyVariant()) }}>Cancel edit</button>}</div>
        <p className="mb-3 text-xs text-neutral-400">Use size and color for fashion, weight for grocery/pickles, or custom option for other products. Each combination needs its own SKU.</p>
        <form onSubmit={saveVariant} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <select className={input} aria-label="Variant product" required disabled={Boolean(editingVariant)} value={variant.productId} onChange={e => changeVariantField('productId', e.target.value)}><option value="">Choose product</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
          <input className={input} aria-label="SKU" placeholder="Unique SKU" required maxLength={100} value={variant.sku} onChange={e => changeVariantField('sku', e.target.value)} />
          <input className={input} aria-label="Size" placeholder="Size (S, M, L, XL...)" value={variant.size} onChange={e => changeVariantField('size', e.target.value)} />
          <input className={input} aria-label="Color" placeholder="Color (Black, Blue...)" value={variant.color} onChange={e => changeVariantField('color', e.target.value)} />
          <input className={input} aria-label="Weight" placeholder="Weight (250g, 1kg...)" value={variant.weight} onChange={e => changeVariantField('weight', e.target.value)} />
          <input className={input} aria-label="Other option" placeholder="Other option (model, pack...)" value={variant.option} onChange={e => changeVariantField('option', e.target.value)} />
          <input className={input} aria-label="Price in rupees" placeholder="Selling price ₹" required inputMode="decimal" value={variant.price} onChange={e => changeVariantField('price', e.target.value)} />
          <input className={input} aria-label="MRP in rupees" placeholder="MRP ₹ (optional)" inputMode="decimal" value={variant.compareAt} onChange={e => changeVariantField('compareAt', e.target.value)} />
          <input className={input} aria-label="Stock" type="number" min="0" step="1" required value={variant.stock} onChange={e => changeVariantField('stock', e.target.value)} />
          <button className={button} disabled={busy || loading || !storeId}>{editingVariant ? 'Save variant changes' : 'Add variant'}</button>
        </form>
      </section>
      <section className={panel}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h3 className="font-bold">Products ({visible.length})</h3><div className="flex flex-wrap gap-2"><input className={`${input} max-w-xs`} aria-label="Search products" placeholder="Search name, slug or SKU" value={filter} onChange={e => setFilter(e.target.value)} /><select className={input} aria-label="Filter product status" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}><option value="all">All statuses</option><option value="active">Published</option><option value="draft">Draft</option><option value="archived">Archived</option></select></div></div>
        <div className="space-y-3">{visible.map(item => <div key={item.id} className="rounded-xl border border-neutral-800 bg-neutral-950 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-bold">{item.name}</p><p className="text-xs text-neutral-500">{item.slug} · {item.status} · {categories.find(c => c.id === item.category_id)?.name || 'Uncategorized'}</p></div><div className="flex flex-wrap gap-2">
            <button type="button" className={button} disabled={busy} onClick={() => startProductEdit(item)}>Edit</button>
            <button type="button" disabled={busy} onClick={() => { setPhotoProduct(item); window.scrollTo({ top: 0, behavior: 'smooth' }) }} className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-40">Manage Photos</button>
            {item.status !== 'active' && <button type="button" className={button} disabled={busy} onClick={() => changeProduct(item, 'active')}>Publish</button>}
            {item.status === 'active' && <button type="button" className={button} disabled={busy} onClick={() => changeProduct(item, 'draft')}>Unpublish</button>}
            {item.status !== 'archived' && <button type="button" className={button} disabled={busy} onClick={() => changeProduct(item, 'archived')}>Archive</button>}
          </div></div>
          <div className="mt-3 space-y-2">{(grouped.get(item.id) || []).map(v => <div key={v.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-800 pt-2 text-sm"><div><p>{v.sku} · {money(v.price_paise)} {v.compare_at_paise > v.price_paise ? `· MRP ${money(v.compare_at_paise)}` : ''}</p><p className="text-xs text-neutral-400">{Object.values(v.options || {}).filter(Boolean).join(' / ') || 'Standard'} · Stock: {v.stock_quantity} · {v.is_active ? 'Available' : 'Hidden'}</p></div><div className="flex flex-wrap gap-2"><button type="button" className={button} disabled={busy} onClick={() => startVariantEdit(v)}>Edit variant / stock / price</button><button type="button" className={button} disabled={busy} onClick={() => toggleVariant(v)}>{v.is_active ? 'Disable' : 'Enable'}</button></div></div>)}{!(grouped.get(item.id) || []).length && <p className="text-xs text-neutral-500">Add a variant to set price and stock.</p>}</div>
        </div>)}{!visible.length && !loading && <p className="text-sm text-neutral-400">No products found.</p>}</div>
        <p className="mt-4 text-xs text-neutral-500">Lists show up to 500 products and 1,500 variants. Use Manage Photos for customer-visible images. Checkout remains disabled.</p>
      </section>
    </div>
  )
}