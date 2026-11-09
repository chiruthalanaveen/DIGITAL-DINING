
'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import { useParams } from 'next/navigation'

const money = paise =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(Number(paise || 0) / 100)

function StoreIcon({ size = 24 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 10h18l-2-6H5l-2 6Z" />
      <path d="M5 10v10h14V10" />
      <path d="M9 20v-7h6v7" />
    </svg>
  )
}

function CartIcon({ size = 23 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="9" cy="21" r="1" />
      <circle cx="20" cy="21" r="1" />
      <path d="M1 1h4l2.5 13h12l2.5-9H6" />
    </svg>
  )
}

function SearchIcon() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m16 16 5 5" />
    </svg>
  )
}

function formatOption(options) {
  const values = Object.entries(options || {})
    .map(([key, value]) => {
      if (value == null) return ''
      return String(value)
    })
    .filter(Boolean)

  return values.join(' / ') || 'Standard'
}

function ProductCard({
  product,
  cart,
  selectedVariantId,
  onSelectVariant,
  onAdd,
}) {
  const variants = product.variants || []
  const selected = variants.find(
    variant => variant.id === selectedVariantId
  ) || variants[0]

  const image = product.images?.[0]
  const available = !!selected && selected.stock_quantity > 0
  const inCart = selected
    ? cart.find(item => item.variantId === selected.id)?.quantity || 0
    : 0

  const price = Number(selected?.price_paise || 0)
  const mrp = Number(selected?.compare_at_paise || 0)
  const discount = mrp > price && mrp > 0
    ? Math.round(((mrp - price) / mrp) * 100)
    : 0

  return (
    <article className="dd-product">
      <div className="dd-product-image">
        {image?.url ? (
          <img
            src={image.url}
            alt={image.alt || product.name}
            loading="lazy"
          />
        ) : (
          <div className="dd-placeholder">
            <StoreIcon size={42} />
            <span>No image</span>
          </div>
        )}
        {discount > 0 && (
          <span className="dd-discount">{discount}% OFF</span>
        )}
      </div>

      <div className="dd-product-info">
        <h3>{product.name}</h3>

        {product.description && (
          <p className="dd-description">{product.description}</p>
        )}

        {variants.length > 1 ? (
          <label className="dd-variant-label">
            Choose option
            <select
              value={selected?.id || ''}
              onChange={event =>
                onSelectVariant(product.id, event.target.value)
              }
            >
              {variants.map(variant => (
                <option key={variant.id} value={variant.id}>
                  {formatOption(variant.options)} — {money(variant.price_paise)}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <span className="dd-size">
            {formatOption(selected?.options)}
          </span>
        )}

        <div className="dd-price-row">
          <strong>{money(price)}</strong>
          {mrp > price && (
            <del>{money(mrp)}</del>
          )}
        </div>

        <p className={available ? 'dd-stock' : 'dd-out'}>
          {available
            ? `${selected.stock_quantity} available`
            : 'Out of stock'}
        </p>

        <button
          type="button"
          className="dd-add"
          disabled={!available || inCart >= selected.stock_quantity}
          onClick={() => onAdd(product, selected)}
        >
          {!available
            ? 'Unavailable'
            : inCart >= selected.stock_quantity
              ? 'Stock limit reached'
              : inCart > 0
                ? `Add more (${inCart} in cart)`
                : 'Add to cart'}
        </button>
      </div>
    </article>
  )
}

export default function EcommerceStorefrontPage() {
  const params = useParams()
  const slug = typeof params?.slug === 'string'
    ? params.slug
    : ''

  const [store, setStore] = useState(null)
  const [categories, setCategories] = useState([])
  const [products, setProducts] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [categoryId, setCategoryId] = useState('all')
  const [selectedVariants, setSelectedVariants] = useState({})
  const [cart, setCart] = useState([])
  const [cartOpen, setCartOpen] = useState(false)
  const [notice, setNotice] = useState('')

  const loadCatalog = useCallback(async (signal) => {
    if (!slug) return

    const response = await fetch(
      `/api/ecommerce/store/${encodeURIComponent(slug)}/products`,
      {
        cache: 'no-store',
        signal,
      }
    )

    const data = await response.json().catch(() => null)

    if (!response.ok || !data?.success) {
      throw new Error(
        data?.message || 'Unable to load the store.'
      )
    }

    return data
  }, [slug])

  useEffect(() => {
    if (!slug) return

    const controller = new AbortController()
    let active = true

    setLoading(true)
    setError('')
    setStore(null)
    setProducts([])
    setCategories([])
    setCart([])
    setCartOpen(false)
    setSelectedVariants({})
    setCategoryId('all')
    setSearch('')

    loadCatalog(controller.signal)
      .then(data => {
        if (!active) return
        setStore(data.store)
        setProducts(data.products || [])
        setCategories(data.categories || [])
      })
      .catch(err => {
        if (!active || err.name === 'AbortError') return
        setError(err.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [slug, loadCatalog])

  const variantMap = useMemo(() => {
    const map = new Map()

    for (const product of products) {
      for (const variant of product.variants || []) {
        map.set(variant.id, {
          product,
          variant,
        })
      }
    }

    return map
  }, [products])

  const validCart = useMemo(() => {
    return cart
      .map(item => {
        const current = variantMap.get(item.variantId)
        if (!current) return null

        const stock = Number(current.variant.stock_quantity || 0)
        const quantity = Math.min(item.quantity, stock)

        if (quantity <= 0) return null

        return {
          variantId: item.variantId,
          productId: current.product.id,
          name: current.product.name,
          option: formatOption(current.variant.options),
          pricePaise: Number(current.variant.price_paise),
          quantity,
          stock,
        }
      })
      .filter(Boolean)
  }, [cart, variantMap])

  const totalQuantity = validCart.reduce(
    (sum, item) => sum + item.quantity,
    0
  )

  const subtotalPaise = validCart.reduce(
    (sum, item) => sum + item.pricePaise * item.quantity,
    0
  )

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase()

    return products.filter(product => {
      if (categoryId !== 'all' &&
          product.categoryId !== categoryId) {
        return false
      }

      if (!query) return true

      return (
        product.name.toLowerCase().includes(query) ||
        (product.description || '').toLowerCase().includes(query)
      )
    })
  }, [products, search, categoryId])

  function addToCart(product, variant) {
    if (!variant || variant.stock_quantity <= 0) return

    const existing = validCart.find(
      item => item.variantId === variant.id
    )

    if (existing &&
        existing.quantity >= variant.stock_quantity) {
      setNotice('Maximum available stock reached.')
      return
    }

    setCart(previous => {
      const found = previous.find(
        item => item.variantId === variant.id
      )

      if (found) {
        return previous.map(item =>
          item.variantId === variant.id
            ? {
                ...item,
                quantity: Math.min(
                  item.quantity + 1,
                  variant.stock_quantity
                ),
              }
            : item
        )
      }

      return [
        ...previous,
        {
          variantId: variant.id,
          quantity: 1,
        },
      ]
    })

    setNotice(`${product.name} added to cart.`)
  }

  function changeQuantity(variantId, change) {
    const current = variantMap.get(variantId)
    if (!current) return

    setCart(previous => previous
      .map(item => {
        if (item.variantId !== variantId) return item

        return {
          ...item,
          quantity: Math.min(
            Math.max(item.quantity + change, 0),
            current.variant.stock_quantity
          ),
        }
      })
      .filter(item => item.quantity > 0)
    )
  }

  async function refreshStore() {
    setLoading(true)
    setError('')

    try {
      const data = await loadCatalog()
      setStore(data.store)
      setProducts(data.products || [])
      setCategories(data.categories || [])
      setNotice('Products refreshed.')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  if (loading && !store) {
    return (
      <div className="dd-center">
        <p>Loading store…</p>
      </div>
    )
  }

  if (error && !store) {
    return (
      <div className="dd-center">
        <h2>Store unavailable</h2>
        <p>{error}</p>
        <button type="button" onClick={refreshStore}>
          Try again
        </button>
      </div>
    )
  }

  return (
    <div className="dd-shop">
      <header className="dd-header">
        <div className="dd-header-inner">
          <div className="dd-brand">
            <div className="dd-brand-icon">
              <StoreIcon />
            </div>
            <div>
              <strong>{store?.name || 'Online Store'}</strong>
              <small>Shop online</small>
            </div>
          </div>

          <button
            type="button"
            className="dd-cart-button"
            onClick={() => setCartOpen(true)}
            aria-label={`Open cart, ${totalQuantity} items`}
          >
            <CartIcon />
            <span>Cart</span>
            {totalQuantity > 0 && (
              <b>{totalQuantity}</b>
            )}
          </button>
        </div>
      </header>

      <main className="dd-main">
        <section className="dd-hero">
          <div>
            <span className="dd-eyebrow">WELCOME TO OUR STORE</span>
            <h1>{store?.name}</h1>
            <p>
              Discover our collection of products.
              Browse sizes, compare prices and build your cart.
            </p>
          </div>
          <div className="dd-hero-symbol">
            <StoreIcon size={72} />
          </div>
        </section>

        <div className="dd-toolbar">
          <div className="dd-search">
            <SearchIcon />
            <input
              type="search"
              placeholder="Search products"
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </div>
          <button
            type="button"
            className="dd-refresh"
            onClick={refreshStore}
            disabled={loading}
          >
            {loading ? 'Refreshing…' : 'Refresh'}
          </button>
        </div>

        <nav className="dd-categories" aria-label="Product categories">
          <button
            type="button"
            className={categoryId === 'all' ? 'selected' : ''}
            onClick={() => setCategoryId('all')}
          >
            All products
          </button>

          {categories.map(category => (
            <button
              type="button"
              key={category.id}
              className={categoryId === category.id ? 'selected' : ''}
              onClick={() => setCategoryId(category.id)}
            >
              {category.name}
            </button>
          ))}
        </nav>

        {notice && (
          <div className="dd-notice" role="status">
            {notice}
            <button
              type="button"
              onClick={() => setNotice('')}
              aria-label="Dismiss message"
            >
              ×
            </button>
          </div>
        )}

        {error && (
          <p className="dd-error" role="alert">{error}</p>
        )}

        <div className="dd-section-heading">
          <div>
            <h2>Explore products</h2>
            <p>{filteredProducts.length} products</p>
          </div>
        </div>

        {filteredProducts.length === 0 ? (
          <div className="dd-empty">
            <StoreIcon size={44} />
            <h3>No products found</h3>
            <p>
              Try another search or category.
              Products may also be awaiting publication.
            </p>
          </div>
        ) : (
          <div className="dd-products">
            {filteredProducts.map(product => (
              <ProductCard
                key={product.id}
                product={product}
                cart={validCart}
                selectedVariantId={selectedVariants[product.id]}
                onSelectVariant={(productId, variantId) =>
                  setSelectedVariants(previous => ({
                    ...previous,
                    [productId]: variantId,
                  }))
                }
                onAdd={addToCart}
              />
            ))}
          </div>
        )}
      </main>

      {totalQuantity > 0 && !cartOpen && (
        <button
          type="button"
          className="dd-bottom-cart"
          onClick={() => setCartOpen(true)}
        >
          <span>{totalQuantity} item{totalQuantity !== 1 ? 's' : ''}</span>
          <strong>{money(subtotalPaise)}</strong>
          <span>View cart →</span>
        </button>
      )}

      {cartOpen && (
        <div className="dd-overlay" onClick={() => setCartOpen(false)}>
          <aside
            className="dd-drawer"
            role="dialog"
            aria-modal="true"
            aria-label="Shopping cart"
            onClick={event => event.stopPropagation()}
          >
            <div className="dd-drawer-head">
              <div>
                <h2>Your cart</h2>
                <p>{totalQuantity} items</p>
              </div>
              <button
                type="button"
                onClick={() => setCartOpen(false)}
                aria-label="Close cart"
              >
                ×
              </button>
            </div>

            <div className="dd-cart-items">
              {validCart.length === 0 ? (
                <div className="dd-empty">
                  <CartIcon size={44} />
                  <h3>Your cart is empty</h3>
                  <p>Add some products to get started.</p>
                </div>
              ) : (
                validCart.map(item => (
                  <div key={item.variantId} className="dd-cart-item">
                    <div className="dd-cart-item-info">
                      <strong>{item.name}</strong>
                      <small>{item.option}</small>
                      <span>{money(item.pricePaise)}</span>
                    </div>
                    <div className="dd-quantity">
                      <button
                        type="button"
                        onClick={() => changeQuantity(item.variantId, -1)}
                        aria-label={`Decrease ${item.name}`}
                      >
                        −
                      </button>
                      <strong>{item.quantity}</strong>
                      <button
                        type="button"
                        disabled={item.quantity >= item.stock}
                        onClick={() => changeQuantity(item.variantId, 1)}
                        aria-label={`Increase ${item.name}`}
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="dd-cart-footer">
              <div className="dd-total">
                <span>Subtotal</span>
                <strong>{money(subtotalPaise)}</strong>
              </div>
              <p>
                Shipping charges, taxes and payment options
                will be calculated when checkout is available.
              </p>
              <button type="button" disabled className="dd-checkout">
                Checkout coming soon
              </button>
              <small>
                Orders and payments are not enabled yet.
              </small>
            </div>
          </aside>
        </div>
      )}

      <style jsx>{`
        * { box-sizing: border-box; }
        .dd-shop {
          min-height: 100vh;
          background: #f8fafc;
          color: #172033;
          padding-bottom: 90px;
          font-family: Arial, sans-serif;
        }
        button, input, select { font: inherit; }
        button { cursor: pointer; }
        button:disabled { cursor: not-allowed; opacity: .55; }
        .dd-header {
          background: white;
          border-bottom: 1px solid #e7ebef;
          position: sticky;
          top: 0;
          z-index: 20;
        }
        .dd-header-inner {
          max-width: 1200px;
          margin: auto;
          padding: 13px 20px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
        }
        .dd-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }
        .dd-brand-icon {
          width: 43px;
          height: 43px;
          border-radius: 12px;
          background: #dcfce7;
          color: #15803d;
          display: grid;
          place-items: center;
          flex-shrink: 0;
        }
        .dd-brand strong {
          display: block;
          font-size: 17px;
          overflow-wrap: anywhere;
        }
        .dd-brand small {
          display: block;
          color: #64748b;
          margin-top: 3px;
        }
        .dd-cart-button {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 14px;
          background: #166534;
          border: 0;
          color: white;
          border-radius: 11px;
          font-weight: 700;
        }
        .dd-cart-button b {
          background: white;
          color: #166534;
          padding: 3px 7px;
          border-radius: 20px;
        }
        .dd-main {
          max-width: 1200px;
          padding: 20px;
          margin: auto;
        }
        .dd-hero {
          background: linear-gradient(120deg, #14532d, #15803d);
          border-radius: 20px;
          padding: 32px;
          color: white;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
        }
        .dd-eyebrow {
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 1.5px;
          color: #bbf7d0;
        }
        .dd-hero h1 {
          font-size: clamp(26px, 5vw, 40px);
          margin: 10px 0;
        }
        .dd-hero p {
          max-width: 480px;
          line-height: 1.6;
          color: #dcfce7;
          margin-bottom: 0;
        }
        .dd-hero-symbol {
          opacity: .65;
          padding: 20px;
        }
        .dd-toolbar {
          display: flex;
          gap: 10px;
          margin: 23px 0 15px;
        }
        .dd-search {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 10px;
          border: 1px solid #dbe2e8;
          background: white;
          border-radius: 12px;
          padding: 0 14px;
        }
        .dd-search input {
          width: 100%;
          border: 0;
          outline: 0;
          padding: 14px 0;
          background: transparent;
          color: #172033;
        }
        .dd-refresh {
          border: 1px solid #dbe2e8;
          border-radius: 12px;
          background: white;
          padding: 0 15px;
          color: #166534;
          font-weight: 700;
        }
        .dd-categories {
          display: flex;
          overflow-x: auto;
          gap: 9px;
          padding: 5px 0 18px;
          scrollbar-width: thin;
        }
        .dd-categories button {
          border: 1px solid #dbe2e8;
          background: white;
          padding: 10px 17px;
          border-radius: 30px;
          white-space: nowrap;
          color: #475569;
          font-weight: 600;
        }
        .dd-categories button.selected {
          background: #166534;
          color: white;
          border-color: #166534;
        }
        .dd-section-heading {
          display: flex;
          justify-content: space-between;
          align-items: center;
          margin-bottom: 16px;
        }
        .dd-section-heading h2 {
          margin: 0 0 5px;
          font-size: 23px;
        }
        .dd-section-heading p {
          color: #64748b;
          margin: 0;
          font-size: 13px;
        }
        .dd-products {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 16px;
        }
        .dd-product {
          background: white;
          border: 1px solid #e5eaf0;
          border-radius: 15px;
          overflow: hidden;
          display: flex;
          flex-direction: column;
          min-width: 0;
        }
        .dd-product-image {
          position: relative;
          aspect-ratio: 1 / 1;
          background: #f1f5f9;
        }
        .dd-product-image img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }
        .dd-placeholder {
          height: 100%;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 10px;
          color: #94a3b8;
          font-size: 13px;
        }
        .dd-discount {
          position: absolute;
          top: 10px;
          left: 10px;
          background: #dcfce7;
          color: #166534;
          padding: 5px 9px;
          font-size: 11px;
          font-weight: 800;
          border-radius: 6px;
        }
        .dd-product-info {
          padding: 15px;
          display: flex;
          flex-direction: column;
          flex: 1;
        }
        .dd-product-info h3 {
          font-size: 15px;
          line-height: 1.45;
          margin: 0 0 8px;
        }
        .dd-description {
          font-size: 12px;
          color: #64748b;
          line-height: 1.5;
          margin: 0 0 12px;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }
        .dd-variant-label {
          font-size: 12px;
          color: #64748b;
          margin-top: auto;
        }
        .dd-variant-label select {
          width: 100%;
          margin-top: 5px;
          padding: 9px;
          border-radius: 8px;
          border: 1px solid #dbe2e8;
          background: white;
          color: #172033;
        }
        .dd-size {
          display: inline-block;
          align-self: flex-start;
          font-size: 12px;
          color: #475569;
          background: #f1f5f9;
          padding: 6px 9px;
          border-radius: 6px;
          margin-top: auto;
        }
        .dd-price-row {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 9px;
          margin-top: 13px;
        }
        .dd-price-row strong { font-size: 19px; }
        .dd-price-row del {
          color: #94a3b8;
          font-size: 13px;
        }
        .dd-stock, .dd-out {
          font-size: 12px;
          margin: 8px 0 12px;
        }
        .dd-stock { color: #15803d; }
        .dd-out { color: #b91c1c; }
        .dd-add {
          width: 100%;
          border: 1px solid #16a34a;
          background: #f0fdf4;
          color: #166534;
          border-radius: 9px;
          padding: 11px;
          font-weight: 800;
          margin-top: auto;
        }
        .dd-add:not(:disabled):hover {
          background: #dcfce7;
        }
        .dd-empty {
          text-align: center;
          padding: 50px 20px;
          color: #64748b;
        }
        .dd-empty h3 { color: #172033; }
        .dd-notice {
          background: #dcfce7;
          color: #166534;
          padding: 12px 15px;
          border-radius: 10px;
          margin-bottom: 18px;
          display: flex;
          justify-content: space-between;
          gap: 12px;
        }
        .dd-notice button {
          border: 0;
          background: transparent;
          color: inherit;
          font-size: 22px;
        }
        .dd-error {
          padding: 12px;
          background: #fee2e2;
          color: #991b1b;
          border-radius: 10px;
        }
        .dd-bottom-cart {
          position: fixed;
          bottom: 16px;
          left: 50%;
          transform: translateX(-50%);
          z-index: 25;
          width: min(560px, calc(100% - 32px));
          display: flex;
          justify-content: space-between;
          gap: 12px;
          align-items: center;
          padding: 16px 20px;
          background: #166534;
          border: 0;
          border-radius: 13px;
          color: white;
          box-shadow: 0 8px 25px #0002;
        }
        .dd-overlay {
          position: fixed;
          inset: 0;
          z-index: 50;
          background: #0008;
          display: flex;
          justify-content: flex-end;
        }
        .dd-drawer {
          width: min(440px, 100%);
          background: white;
          display: flex;
          flex-direction: column;
          height: 100%;
        }
        .dd-drawer-head {
          padding: 20px;
          border-bottom: 1px solid #e2e8f0;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }
        .dd-drawer-head h2 { margin: 0 0 5px; }
        .dd-drawer-head p {
          margin: 0;
          color: #64748b;
          font-size: 13px;
        }
        .dd-drawer-head button {
          border: 0;
          background: #f1f5f9;
          width: 36px;
          height: 36px;
          border-radius: 50%;
          font-size: 24px;
        }
        .dd-cart-items {
          flex: 1;
          overflow-y: auto;
          padding: 16px 20px;
        }
        .dd-cart-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          padding: 15px 0;
          border-bottom: 1px solid #e2e8f0;
        }
        .dd-cart-item-info {
          display: flex;
          flex-direction: column;
          gap: 6px;
          min-width: 0;
        }
        .dd-cart-item-info small { color: #64748b; }
        .dd-cart-item-info span { color: #166534; }
        .dd-quantity {
          display: flex;
          align-items: center;
          border: 1px solid #16a34a;
          border-radius: 8px;
          overflow: hidden;
          flex-shrink: 0;
        }
        .dd-quantity button {
          border: 0;
          background: #f0fdf4;
          color: #166534;
          padding: 8px 12px;
          font-size: 18px;
        }
        .dd-quantity strong {
          padding: 0 10px;
        }
        .dd-cart-footer {
          border-top: 1px solid #e2e8f0;
          padding: 20px;
        }
        .dd-total {
          display: flex;
          justify-content: space-between;
          font-size: 18px;
        }
        .dd-cart-footer p, .dd-cart-footer small {
          color: #64748b;
          font-size: 12px;
          line-height: 1.6;
        }
        .dd-cart-footer small {
          display: block;
          text-align: center;
          margin-top: 10px;
        }
        .dd-checkout {
          width: 100%;
          padding: 15px;
          border: 0;
          border-radius: 10px;
          background: #94a3b8;
          color: white;
          font-weight: 800;
        }
        .dd-center {
          min-height: 75vh;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          text-align: center;
          padding: 24px;
          color: #172033;
        }
        .dd-center button {
          padding: 12px 20px;
          border-radius: 10px;
          background: #166534;
          color: white;
          border: 0;
        }
        @media (max-width: 950px) {
          .dd-products {
            grid-template-columns: repeat(3, minmax(0, 1fr));
          }
        }
        @media (max-width: 650px) {
          .dd-products {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 10px;
          }
          .dd-main { padding: 12px; }
          .dd-header-inner { padding: 10px 12px; }
          .dd-hero {
            padding: 24px 20px;
            border-radius: 14px;
          }
          .dd-hero-symbol { display: none; }
          .dd-product-info { padding: 11px; }
          .dd-product-info h3 { font-size: 14px; }
          .dd-price-row strong { font-size: 16px; }
          .dd-add { font-size: 12px; padding: 10px 6px; }
          .dd-toolbar { margin-top: 16px; }
        }
      `}</style>
    </div>
  )
}
