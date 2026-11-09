'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

const base = '/api/admin/ecommerce'
const field = 'w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm text-white outline-none focus:border-red-500'
const btn = 'rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-xs font-bold text-white hover:bg-neutral-700 disabled:opacity-40'
const panel = 'rounded-2xl border border-neutral-800 bg-neutral-900 p-4 sm:p-6'
const money = n => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(n || 0) / 100)
const slugify = s => String(s || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const paise = value => {
  if (!/^\d+(\.\d{1,2})?$/.test(String(value))) throw new Error('Enter a valid amount in rupees.')
  const [whole, decimals = ''] = String(value).split('.')
  const result = Number(whole) * 100 + Number(decimals.padEnd(2, '0'))
  if (!Number.isSafeInteger(result)) throw new Error('Amount is too large.')
  return result
}
async function request(path, options = {}) {
  const response = await fetch(`${base}${path}`, { credentials: 'same-origin', cache: 'no-store', ...options })
  const data = await response.json().catch(() => ({}))
  if (!response.ok || data.success !== true) throw new Error(data.message || `Request failed (${response.status})`)
  return data
}
const json = (method, body) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })

export default function ProductManagementContent() {
  const [stores, setStores] = useState([])
  const [storeId, setStoreId] = useState('')
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [variants, setVariants] = useState([])
  const [category, setCategory] = useState({ name: '', slug: '' })
  const [product, setProduct] = useState({ name: '', slug: '', categoryId: '', description: '' })
  const [variant, setVariant] = useState({ productId: '', sku: '', size: '', price: '', mrp: '', stock: '0' })
  const [images, setImages] = useState({})
  const [files, setFiles] = useState({})
  const [alts, setAlts] = useState({})
  const [busy, setBusy] = useState(false)
  const [imageBusy, setImageBusy] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const refresh = useCallback(async id => {
    if (!id) return
    const q = `?storeId=${encodeURIComponent(id)}`
    const [c, p, v] = await Promise.all([request(`/categories${q}`), request(`/products${q}`), request(`/variants${q}`)])
    setCategories(c.categories || [])
    setProducts(p.products || [])
    setVariants(v.variants || [])
  }, [])

  useEffect(() => {
    let active = true
    request('/stores').then(result => {
      if (!active) return
      const items = result.stores || []
      setStores(items)
      setStoreId(items[0]?.id || '')
    }).catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [])

  useEffect(() => {
    let active = true
    setCategories([]); setProducts([]); setVariants([]); setImages({}); setFiles({})
    if (!storeId) return
    setLoading(true)
    refresh(storeId).catch(e => { if (active) setError(e.message) }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [storeId, refresh])

  const groupedVariants = useMemo(() => {
    const map = new Map()
    for (const v of variants) map.set(v.product_id, [...(map.get(v.product_id) || []), v])
    return map
  }, [variants])

  async function act(work, success) {
    if (busy || !storeId) return
    setBusy(true); setError(''); setNotice('')
    try { await work(); await refresh(storeId); setNotice(success) }
    catch (e) { setError(e.message) }
    finally { setBusy(false) }
  }

  async function createCategory(e) {
    e.preventDefault()
    await act(async () => {
      await request('/categories', json('POST', { storeId, ...category }))
      setCategory({ name: '', slug: '' })
    }, 'Category created.')
  }

  async function createProduct(e) {
    e.preventDefault()
    await act(async () => {
      await request('/products', json('POST', { storeId, ...product, categoryId: product.categoryId || null, attributes: {} }))
      setProduct({ name: '', slug: '', categoryId: '', description: '' })
    }, 'Draft product created.')
  }

  async function createVariant(e) {
    e.preventDefault()
    await act(async () => {
      const stockQuantity = Number(variant.stock)
      if (!Number.isSafeInteger(stockQuantity) || stockQuantity < 0) throw new Error('Invalid stock quantity.')
      await request('/variants', json('POST', {
        storeId, productId: variant.productId, sku: variant.sku,
        options: variant.size.trim() ? { size: variant.size.trim() } : {},
        pricePaise: paise(variant.price), compareAtPaise: variant.mrp ? paise(variant.mrp) : null,
        stockQuantity,
      }))
      setVariant({ productId: '', sku: '', size: '', price: '', mrp: '', stock: '0' })
    }, 'Variant created.')
  }

  async function status(productId, next) {
    if (!window.confirm(`Set product status to ${next}?`)) return
    await act(() => request('/products', json('PATCH', { storeId, productId, status: next })), 'Product status updated.')
  }

  async function updateStock(v) {
    const value = window.prompt(`Stock for ${v.sku}`, String(v.stock_quantity))
    if (value === null) return
    const stockQuantity = Number(value)
    if (!Number.isSafeInteger(stockQuantity) || stockQuantity < 0) { setError('Stock must be a non-negative integer.'); return }
    await act(() => request('/variants', json('PATCH', { storeId, variantId: v.id, stockQuantity })), 'Stock updated.')
  }

  async function updateVariant(v) {
    await act(() => request('/variants', json('PATCH', { storeId, variantId: v.id, isActive: !v.is_active })), 'Variant availability updated.')
  }

  async function loadImages(productId) {
    setImageBusy(productId); setError('')
    try {
      const q = new URLSearchParams({ storeId, productId })
      const data = await request(`/products/images?${q}`)
      setImages(old => ({ ...old, [productId]: data.images || [] }))
    } catch (e) { setError(e.message) }
    finally { setImageBusy('') }
  }

  async function uploadImage(productId) {
    const file = files[productId]
    if (!file) { setError('Select an image first.'); return }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) {
      setError('Only JPEG, PNG and WebP up to 5 MB are supported.'); return
    }
    setImageBusy(productId); setError(''); setNotice('')
    try {
      const form = new FormData()
      form.append('storeId', storeId); form.append('productId', productId)
      form.append('file', file); form.append('alt', alts[productId] || '')
      const data = await request('/products/images', { method: 'POST', body: form })
      setImages(old => ({ ...old, [productId]: data.images || [] }))
      setFiles(old => ({ ...old, [productId]: null }))
      setAlts(old => ({ ...old, [productId]: '' }))
      setNotice('Image uploaded.')
    } catch (e) { setError(e.message) }
    finally { setImageBusy('') }
  }

  async function removeImage(productId, imageId) {
    if (!window.confirm('Remove this image?')) return
    setImageBusy(productId); setError('')
    try {
      const data = await request('/products/images', json('DELETE', { storeId, productId, imageId }))
      setImages(old => ({ ...old, [productId]: data.images || [] }))
      setNotice(data.message || 'Image removed.')
    } catch (e) { setError(e.message) }
    finally { setImageBusy('') }
  }

  return (
    <div className="space-y-5 text-neutral-100">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="text-[10px] font-black uppercase tracking-widest text-red-400">E-Commerce / Catalog</p>
          <h1 className="mt-2 text-2xl font-black text-white">Product Management</h1>
          <p className="mt-2 text-xs text-neutral-400">Categories, products, prices, inventory and product images.</p>
        </div>
        <button className={btn} disabled={loading || busy || !storeId} onClick={() => act(async () => {}, 'Catalog refreshed.')}>Refresh</button>
      </div>
      {error && <p role="alert" className="rounded-xl border border-red-700 bg-red-950 p-3 text-sm text-red-200">{error}</p>}
      {notice && <p role="status" className="rounded-xl border border-emerald-800 bg-emerald-950 p-3 text-sm text-emerald-200">{notice}</p>}
      <section className={panel}>
        <label className="block space-y-2 text-xs font-bold text-neutral-300">Select E-Commerce website
          <select className={field} value={storeId} onChange={e => { setStoreId(e.target.value); setError(''); setNotice('') }}>
            {!stores.length && <option value="">No websites found</option>}
            {stores.map(s => <option key={s.id} value={s.id}>{s.name} ({s.slug})</option>)}
          </select>
        </label>
        {loading && <p className="mt-3 text-xs text-neutral-400">Loading…</p>}
      </section>
      {!!storeId && <>
        <div className="grid gap-4 lg:grid-cols-2">
          <section className={panel}>
            <h2 className="mb-4 text-lg font-bold">Create category</h2>
            <form className="space-y-3" onSubmit={createCategory}>
              <label className="block space-y-1 text-xs">Name<input className={field} required maxLength={100} value={category.name} onChange={e => setCategory({ name: e.target.value, slug: slugify(e.target.value) })} /></label>
              <label className="block space-y-1 text-xs">Slug<input className={field} required value={category.slug} onChange={e => setCategory(old => ({ ...old, slug: slugify(e.target.value) }))} /></label>
              <button className={btn} disabled={busy}>Add category</button>
            </form>
            <div className="mt-4 flex flex-wrap gap-2">{categories.map(c => <span key={c.id} className="rounded-lg border border-neutral-700 px-3 py-1 text-xs">{c.name}</span>)}</div>
          </section>
          <section className={panel}>
            <h2 className="mb-4 text-lg font-bold">Create product</h2>
            <form className="space-y-3" onSubmit={createProduct}>
              <label className="block space-y-1 text-xs">Name<input className={field} required maxLength={200} value={product.name} onChange={e => setProduct(old => ({ ...old, name: e.target.value, slug: slugify(e.target.value) }))} /></label>
              <label className="block space-y-1 text-xs">Slug<input className={field} required value={product.slug} onChange={e => setProduct(old => ({ ...old, slug: slugify(e.target.value) }))} /></label>
              <label className="block space-y-1 text-xs">Category<select className={field} value={product.categoryId} onChange={e => setProduct(old => ({ ...old, categoryId: e.target.value }))}><option value="">Uncategorized</option>{categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label className="block space-y-1 text-xs">Description<textarea className={field} rows={3} value={product.description} onChange={e => setProduct(old => ({ ...old, description: e.target.value }))} /></label>
              <button className={btn} disabled={busy}>Create draft</button>
            </form>
          </section>
        </div>
        <section className={panel}>
          <h2 className="mb-4 text-lg font-bold">Add product variant</h2>
          <form onSubmit={createVariant} className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <label className="space-y-1 text-xs">Product<select required className={field} value={variant.productId} onChange={e => setVariant(old => ({ ...old, productId: e.target.value }))}><option value="">Select product</option>{products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
            <label className="space-y-1 text-xs">SKU<input required className={field} value={variant.sku} onChange={e => setVariant(old => ({ ...old, sku: e.target.value }))} /></label>
            <label className="space-y-1 text-xs">Size / option<input className={field} placeholder="500 g" value={variant.size} onChange={e => setVariant(old => ({ ...old, size: e.target.value }))} /></label>
            <label className="space-y-1 text-xs">Price (₹)<input required className={field} inputMode="decimal" value={variant.price} onChange={e => setVariant(old => ({ ...old, price: e.target.value }))} /></label>
            <label className="space-y-1 text-xs">MRP (₹)<input className={field} inputMode="decimal" value={variant.mrp} onChange={e => setVariant(old => ({ ...old, mrp: e.target.value }))} /></label>
            <label className="space-y-1 text-xs">Stock<input required type="number" min="0" step="1" className={field} value={variant.stock} onChange={e => setVariant(old => ({ ...old, stock: e.target.value }))} /></label>
            <button className={btn} disabled={busy || !products.length}>Add variant</button>
          </form>
        </section>
        <section className="space-y-4">
          <h2 className="text-xl font-bold">Products ({products.length})</h2>
          {!products.length && <p className="text-sm text-neutral-400">No products yet. Create your first product above.</p>}
          {products.map(p => <article className={panel} key={p.id}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="text-lg font-bold text-white">{p.name}</h3><p className="mt-1 text-xs text-neutral-400">{categories.find(c => c.id === p.category_id)?.name || 'Uncategorized'} · {p.status}</p><p className="mt-2 text-xs text-neutral-300">{p.description}</p></div>
              <div className="flex flex-wrap gap-2">{p.status !== 'active' && <button className={btn} disabled={busy} onClick={() => status(p.id, 'active')}>Publish</button>}{p.status !== 'draft' && <button className={btn} disabled={busy} onClick={() => status(p.id, 'draft')}>Unpublish</button>}{p.status !== 'archived' && <button className={btn} disabled={busy} onClick={() => status(p.id, 'archived')}>Archive</button>}</div>
            </div>
            <div className="mt-4 overflow-x-auto"><table className="w-full min-w-[650px] text-left text-xs"><thead className="border-b border-neutral-700 text-neutral-400"><tr><th className="p-2">SKU</th><th className="p-2">Options</th><th className="p-2">Price</th><th className="p-2">MRP</th><th className="p-2">Stock</th><th className="p-2">Status</th><th className="p-2">Actions</th></tr></thead><tbody>{(groupedVariants.get(p.id) || []).map(v => <tr className="border-b border-neutral-800" key={v.id}><td className="p-2">{v.sku}</td><td className="p-2">{Object.values(v.options || {}).join(' / ') || 'Standard'}</td><td className="p-2">{money(v.price_paise)}</td><td className="p-2">{v.compare_at_paise == null ? '—' : money(v.compare_at_paise)}</td><td className="p-2">{v.stock_quantity}</td><td className="p-2">{v.is_active ? 'Active' : 'Disabled'}</td><td className="p-2"><div className="flex gap-2"><button className={btn} disabled={busy} onClick={() => updateStock(v)}>Stock</button><button className={btn} disabled={busy} onClick={() => updateVariant(v)}>{v.is_active ? 'Disable' : 'Enable'}</button></div></td></tr>)}</tbody></table></div>
            <div className="mt-5 border-t border-neutral-800 pt-4"><div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-bold">Product images</h4><button className={btn} disabled={imageBusy === p.id} onClick={() => loadImages(p.id)}>{imageBusy === p.id ? 'Loading…' : 'Load / Refresh images'}</button></div>
              <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">{(images[p.id] || []).map(img => <div className="rounded-xl border border-neutral-700 p-2" key={img.id}>{img.url ? <img src={img.url} alt={img.alt || p.name} className="aspect-square w-full rounded-lg object-cover" /> : <div className="aspect-square bg-neutral-800" />}<p className="my-2 truncate text-xs">{img.alt || p.name}</p><button className={btn} disabled={imageBusy === p.id} onClick={() => removeImage(p.id, img.id)}>Remove</button></div>)}</div>
              <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end"><label className="space-y-1 text-xs">Image (JPEG / PNG / WebP, max 5 MB)<input key={`${p.id}-${files[p.id] ? 'chosen' : 'empty'}`} className={field} type="file" accept="image/jpeg,image/png,image/webp" onChange={e => setFiles(old => ({ ...old, [p.id]: e.target.files?.[0] || null }))} /></label><label className="space-y-1 text-xs">Alt text<input className={field} value={alts[p.id] || ''} onChange={e => setAlts(old => ({ ...old, [p.id]: e.target.value }))} /></label><button className={btn} disabled={!files[p.id] || imageBusy === p.id} onClick={() => uploadImage(p.id)}>Upload image</button></div>
            </div>
          </article>)}
        </section>
      </>}
    </div>
  )
}