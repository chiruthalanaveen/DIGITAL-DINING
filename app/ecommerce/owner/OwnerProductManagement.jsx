
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'

import { supabase } from '@/lib/supabase'
import OwnerProductImages from './OwnerProductImages'

const input =
  'w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-2.5 text-sm text-white focus:border-red-500 focus:outline-none'

const button =
  'rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-40'

const panel =
  'rounded-2xl border border-neutral-800 bg-neutral-900 p-4 sm:p-5'

const emptyCategory = () => ({ name: '', slug: '' })
const emptyProduct = () => ({
  name: '',
  slug: '',
  categoryId: '',
  description: '',
})
const emptyVariant = () => ({
  productId: '',
  sku: '',
  option: '',
  price: '',
  compareAt: '',
  stock: '0',
})

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

function money(value) {
  return `₹${(Number(value || 0) / 100).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

function paise(value) {
  const text = String(value).trim()

  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    throw new Error('Enter a valid rupee amount.')
  }

  const amount = Math.round(Number(text) * 100)

  if (!Number.isSafeInteger(amount)) {
    throw new Error('Amount too large.')
  }

  return amount
}

function uniqueById(items) {
  const map = new Map()

  for (const item of Array.isArray(items) ? items : []) {
    if (item?.id && !map.has(item.id)) {
      map.set(item.id, item)
    }
  }

  return Array.from(map.values())
}

async function api(storeId, method = 'GET', body) {
  if (!storeId) throw new Error('Select a website.')

  const { data, error } = await supabase.auth.getSession()

  if (error || !data?.session?.access_token) {
    throw new Error('Please sign in again.')
  }

  const response = await fetch(
    `/api/ecommerce/owner/catalog?storeId=${encodeURIComponent(storeId)}`,
    {
      method,
      cache: 'no-store',
      headers: {
        Authorization: `Bearer ${data.session.access_token}`,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body
        ? { body: JSON.stringify({ ...body, storeId }) }
        : {}),
    }
  )

  const result = await response.json().catch(() => ({}))

  if (!response.ok || !result.success) {
    throw new Error(
      result.message || `Request failed (${response.status})`
    )
  }

  return result
}

export default function OwnerProductManagement({
  storeId,
  onChanged,
  storeCategory = '',
}) {
  const [catalog, setCatalog] = useState({
    categories: [],
    products: [],
    variants: [],
  })

  const [category, setCategory] = useState(emptyCategory)
  const [product, setProduct] = useState(emptyProduct)
  const [variant, setVariant] = useState(emptyVariant)

  const [filter, setFilter] = useState('')
  const [photoProduct, setPhotoProduct] = useState(null)

  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const categories = useMemo(
    () => uniqueById(catalog.categories),
    [catalog.categories]
  )

  const products = useMemo(
    () => uniqueById(catalog.products),
    [catalog.products]
  )

  const variants = useMemo(
    () => uniqueById(catalog.variants),
    [catalog.variants]
  )

  const grouped = useMemo(() => {
    const map = new Map()

    for (const item of variants) {
      if (!item.product_id) continue

      const list = map.get(item.product_id) || []
      list.push(item)
      map.set(item.product_id, list)
    }

    return map
  }, [variants])

  const visible = useMemo(() => {
    const query = filter.trim().toLowerCase()

    return products.filter(item =>
      `${item.name || ''} ${item.slug || ''}`
        .toLowerCase()
        .includes(query)
    )
  }, [products, filter])

  const refresh = useCallback(async () => {
    if (!storeId) return

    const result = await api(storeId)

    setCatalog({
      categories: result.categories || [],
      products: result.products || [],
      variants: result.variants || [],
    })
  }, [storeId])

  useEffect(() => {
    let active = true

    setLoading(true)
    setError('')
    setNotice('')
    setPhotoProduct(null)
    setCatalog({
      categories: [],
      products: [],
      variants: [],
    })

    if (!storeId) {
      setLoading(false)
      return () => { active = false }
    }

    api(storeId)
      .then(result => {
        if (!active) return

        setCatalog({
          categories: result.categories || [],
          products: result.products || [],
          variants: result.variants || [],
        })
      })
      .catch(err => {
        if (active) setError(err.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => { active = false }
  }, [storeId])

  async function act(work, message) {
    if (busy || loading || !storeId) return

    setBusy(true)
    setError('')
    setNotice('')

    try {
      await work()
      await refresh()
      setNotice(message)
      onChanged?.()
    } catch (err) {
      setError(err.message || 'Request failed.')
    } finally {
      setBusy(false)
    }
  }

  async function addCategory(event) {
    event.preventDefault()

    await act(async () => {
      await api(storeId, 'POST', {
        entity: 'category',
        ...category,
      })
      setCategory(emptyCategory())
    }, 'Category created.')
  }

  async function addProduct(event) {
    event.preventDefault()

    await act(async () => {
      await api(storeId, 'POST', {
        entity: 'product',
        ...product,
        categoryId: product.categoryId || null,
      })
      setProduct(emptyProduct())
    }, 'Draft product created.')
  }

  async function addVariant(event) {
    event.preventDefault()

    await act(async () => {
      const stockText = String(variant.stock).trim()

      if (!/^\d+$/.test(stockText)) {
        throw new Error('Stock must be a non-negative integer.')
      }

      const stockQuantity = Number(stockText)

      if (!Number.isSafeInteger(stockQuantity)) {
        throw new Error('Invalid stock quantity.')
      }

      await api(storeId, 'POST', {
        entity: 'variant',
        productId: variant.productId,
        sku: variant.sku,
        options: variant.option.trim()
          ? { option: variant.option.trim() }
          : {},
        pricePaise: paise(variant.price),
        compareAtPaise: variant.compareAt.trim()
          ? paise(variant.compareAt)
          : null,
        stockQuantity,
      })

      setVariant(emptyVariant())
    }, 'Variant added.')
  }

  async function changeProduct(item, status) {
    if (!window.confirm(`Change ${item.name} to ${status}?`)) {
      return
    }

    await act(
      () => api(storeId, 'PATCH', {
        entity: 'product',
        productId: item.id,
        status,
      }),
      'Product status updated.'
    )
  }

  async function editProduct(item) {
    const name = window.prompt('Product name', item.name)
    if (name === null) return

    const description = window.prompt(
      'Description',
      item.description || ''
    )
    if (description === null) return

    await act(
      () => api(storeId, 'PATCH', {
        entity: 'product',
        productId: item.id,
        name,
        description,
      }),
      'Product updated.'
    )
  }

  async function editStock(item) {
    const value = window.prompt(
      `Stock for ${item.sku}`,
      String(item.stock_quantity)
    )

    if (value === null) return

    const stockText = value.trim()

    if (!/^\d+$/.test(stockText) ||
        !Number.isSafeInteger(Number(stockText))) {
      setError('Stock must be a non-negative whole number.')
      return
    }

    await act(
      () => api(storeId, 'PATCH', {
        entity: 'variant',
        variantId: item.id,
        stockQuantity: Number(stockText),
      }),
      'Stock updated.'
    )
  }

  async function editPrice(item) {
    const value = window.prompt(
      `Price in rupees for ${item.sku}`,
      (Number(item.price_paise || 0) / 100).toFixed(2)
    )

    if (value === null) return

    await act(
      () => api(storeId, 'PATCH', {
        entity: 'variant',
        variantId: item.id,
        pricePaise: paise(value),
      }),
      'Price updated.'
    )
  }

  async function toggleVariant(item) {
    await act(
      () => api(storeId, 'PATCH', {
        entity: 'variant',
        variantId: item.id,
        isActive: !item.is_active,
      }),
      'Variant updated.'
    )
  }

  return (
    <div className="space-y-5 text-white">

      {photoProduct && (
        <OwnerProductImages
          key={`photos-${photoProduct.id}`}
          storeId={storeId}
          productId={photoProduct.id}
          productName={photoProduct.name}
          onClose={() => setPhotoProduct(null)}
        />
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold">
            Manage products
          </h2>
          <p className="text-sm text-neutral-400">
            Manage products, variants, stock and photographs
            for your selected website.
          </p>
        </div>

        <button
          type="button"
          className={button}
          disabled={busy || loading}
          onClick={() => act(
            async () => {},
            'Catalog refreshed.'
          )}
        >
          Refresh
        </button>
      </div>

      {error && (
        <p role="alert" className="rounded-xl border border-red-800 bg-red-950/40 p-3 text-sm text-red-300">
          {error}
        </p>
      )}

      {notice && (
        <p role="status" className="rounded-xl border border-emerald-800 bg-emerald-950/30 p-3 text-sm text-emerald-300">
          {notice}
        </p>
      )}

      {loading && (
        <p className="text-sm text-neutral-400">
          Loading catalog…
        </p>
      )}

      <div className="grid gap-4 lg:grid-cols-2">

        <section className={panel}>
          <h3 className="mb-3 font-bold">Add category</h3>

          <form onSubmit={addCategory} className="space-y-3">
            <input
              aria-label="Category name"
              className={input}
              placeholder="Category name"
              required
              maxLength={100}
              value={category.name}
              onChange={event => setCategory({
                name: event.target.value,
                slug: slugify(event.target.value),
              })}
            />

            <input
              aria-label="Category slug"
              className={input}
              placeholder="Category slug"
              required
              value={category.slug}
              onChange={event => setCategory(current => ({
                ...current,
                slug: slugify(event.target.value),
              }))}
            />

            <button
              className={button}
              disabled={busy || loading || !storeId}
            >
              Create category
            </button>
          </form>

          <div className="mt-3 flex flex-wrap gap-2">
            {categories.map(item => (
              <span
                key={item.id}
                className="rounded-lg border border-neutral-700 px-2 py-1 text-xs"
              >
                {item.name}
              </span>
            ))}
          </div>
        </section>

        <section className={panel}>
          <h3 className="mb-3 font-bold">Add product</h3>

          <form onSubmit={addProduct} className="space-y-3">
            <input
              aria-label="Product name"
              className={input}
              placeholder="Product name"
              required
              maxLength={200}
              value={product.name}
              onChange={event => setProduct(current => ({
                ...current,
                name: event.target.value,
                slug: slugify(event.target.value),
              }))}
            />

            <input
              aria-label="Product slug"
              className={input}
              placeholder="Product slug"
              required
              value={product.slug}
              onChange={event => setProduct(current => ({
                ...current,
                slug: slugify(event.target.value),
              }))}
            />

            <select
              aria-label="Product category"
              className={input}
              value={product.categoryId}
              onChange={event => setProduct(current => ({
                ...current,
                categoryId: event.target.value,
              }))}
            >
              <option value="">No category</option>
              {categories.map(item => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>

            <textarea
              aria-label="Description"
              className={input}
              rows={2}
              placeholder="Description"
              value={product.description}
              onChange={event => setProduct(current => ({
                ...current,
                description: event.target.value,
              }))}
            />

            <button
              className={button}
              disabled={busy || loading || !storeId}
            >
              Create draft product
            </button>
          </form>
        </section>
      </div>

      <section className={panel}>
        <h3 className="mb-3 font-bold">
          Add variant / stock
        </h3>

        <form
          onSubmit={addVariant}
          className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3"
        >
          <select
            aria-label="Variant product"
            className={input}
            required
            value={variant.productId}
            onChange={event => setVariant(current => ({
              ...current,
              productId: event.target.value,
            }))}
          >
            <option value="">Choose product</option>
            {products.map(item => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>

          <input
            className={input}
            aria-label="SKU"
            placeholder="Unique SKU"
            required
            maxLength={100}
            value={variant.sku}
            onChange={event => setVariant(current => ({
              ...current,
              sku: event.target.value,
            }))}
          />

          <input
            className={input}
            aria-label="Size, color or weight"
            placeholder="Size / color / weight"
            value={variant.option}
            onChange={event => setVariant(current => ({
              ...current,
              option: event.target.value,
            }))}
          />

          <input
            className={input}
            aria-label="Price in rupees"
            placeholder="Price ₹"
            required
            value={variant.price}
            onChange={event => setVariant(current => ({
              ...current,
              price: event.target.value,
            }))}
          />

          <input
            className={input}
            aria-label="Compare at price"
            placeholder="MRP ₹ (optional)"
            value={variant.compareAt}
            onChange={event => setVariant(current => ({
              ...current,
              compareAt: event.target.value,
            }))}
          />

          <input
            className={input}
            aria-label="Stock"
            type="number"
            min="0"
            step="1"
            required
            value={variant.stock}
            onChange={event => setVariant(current => ({
              ...current,
              stock: event.target.value,
            }))}
          />

          <button
            className={button}
            disabled={busy || loading || !storeId}
          >
            Add variant
          </button>
        </form>
      </section>

      <section className={panel}>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-bold">
            Products ({visible.length})
          </h3>

          <input
            className={`${input} max-w-xs`}
            aria-label="Search products"
            placeholder="Search products"
            value={filter}
            onChange={event => setFilter(event.target.value)}
          />
        </div>

        <div className="space-y-3">
          {visible.map(item => (
            <div
              key={item.id}
              className="rounded-xl border border-neutral-800 bg-neutral-950 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-bold">{item.name}</p>
                  <p className="text-xs text-neutral-500">
                    {item.slug} · {item.status}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={button}
                    disabled={busy}
                    onClick={() => editProduct(item)}
                  >
                    Edit
                  </button>

                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => {
                      setPhotoProduct(item)
                      window.scrollTo({
                        top: 0,
                        behavior: 'smooth',
                      })
                    }}
                    className="rounded-xl bg-red-600 px-4 py-2.5 text-sm font-bold text-white hover:bg-red-500 disabled:opacity-40"
                  >
                    Manage Photos
                  </button>

                  {item.status !== 'active' && (
                    <button
                      type="button"
                      className={button}
                      disabled={busy}
                      onClick={() => changeProduct(item, 'active')}
                    >
                      Publish
                    </button>
                  )}

                  {item.status === 'active' && (
                    <button
                      type="button"
                      className={button}
                      disabled={busy}
                      onClick={() => changeProduct(item, 'draft')}
                    >
                      Unpublish
                    </button>
                  )}

                  {item.status !== 'archived' && (
                    <button
                      type="button"
                      className={button}
                      disabled={busy}
                      onClick={() => changeProduct(item, 'archived')}
                    >
                      Archive
                    </button>
                  )}
                </div>
              </div>

              <div className="mt-3 space-y-2">
                {(grouped.get(item.id) || []).map(v => (
                  <div
                    key={v.id}
                    className="flex flex-wrap items-center justify-between gap-2 border-t border-neutral-800 pt-2 text-sm"
                  >
                    <span>
                      {v.sku} · {money(v.price_paise)} ·
                      {' '}Stock: {v.stock_quantity} ·
                      {' '}{v.is_active ? 'Available' : 'Hidden'}
                    </span>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        className={button}
                        disabled={busy}
                        onClick={() => editStock(v)}
                      >
                        Stock
                      </button>

                      <button
                        type="button"
                        className={button}
                        disabled={busy}
                        onClick={() => editPrice(v)}
                      >
                        Price
                      </button>

                      <button
                        type="button"
                        className={button}
                        disabled={busy}
                        onClick={() => toggleVariant(v)}
                      >
                        {v.is_active ? 'Disable' : 'Enable'}
                      </button>
                    </div>
                  </div>
                ))}

                {!(grouped.get(item.id) || []).length && (
                  <p className="text-xs text-neutral-500">
                    Add a variant to set price and stock.
                  </p>
                )}
              </div>
            </div>
          ))}

          {!visible.length && !loading && (
            <p className="text-sm text-neutral-400">
              No products found.
            </p>
          )}
        </div>

        <p className="mt-4 text-xs text-neutral-500">
          Lists show up to 500 products and 1,500 variants.
          Use Manage Photos to upload customer-visible
          product photographs.
        </p>
      </section>
    </div>
  )
}
