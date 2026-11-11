'use client'

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { useParams } from 'next/navigation'
import './storefront-themes.css'
import './storefront-mobile-themes.css'
import { getMobileTheme, getDefaultMobileTheme } from '@/lib/ecommerce/mobileThemes'
import useStorefrontCart from '@/lib/ecommerce/useStorefrontCart'

import {
  resolveStoreTemplate,
  STORE_TEMPLATES,
} from './storefront-templates'

const money = paise =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
  }).format(Number(paise || 0) / 100)

const uniqueById = values => {
  const seen = new Set()

  return (Array.isArray(values) ? values : [])
    .filter((value, index) => {
      const id = value?.id || `missing-${index}`

      if (seen.has(id)) return false

      seen.add(id)
      return true
    })
}

function formatOption(options) {
  return Object.values(options || {})
    .filter(
      value =>
        value !== null &&
        value !== undefined &&
        value !== ''
    )
    .map(String)
    .join(' / ') || 'Standard'
}

function priceInfo(variant) {
  const price =
    Number(variant?.price_paise || 0)

  const mrp =
    Number(variant?.compare_at_paise || 0)

  const discount =
    mrp > price && mrp > 0
      ? Math.round(
          ((mrp - price) / mrp) * 100
        )
      : 0

  return {
    price,
    mrp,
    discount,
  }
}

function variantAttributes(variant) {
  const options =
    variant?.options &&
    typeof variant.options === 'object'
      ? variant.options
      : {}

  const values =
    Object.fromEntries(
      Object.entries(options).map(
        ([key, value]) => [
          key.toLowerCase(),
          String(value ?? '').trim(),
        ]
      )
    )

  let size =
    values.size ||
    values.sizes ||
    values.fit ||
    ''

  let color =
    values.color ||
    values.colour ||
    ''

  const combined =
    values.option ||
    values.variant ||
    ''

  if (combined) {
    const parts =
      combined
        .split(/\s*[/|,]\s*/)
        .filter(Boolean)

    if (!size && parts.length) {
      size = parts[0]
    }

    if (!color && parts.length > 1) {
      color = parts.slice(1).join(' / ')
    }
  }

  if (
    /^(free\s*size|one\s*size|onesize|os|freesize|free)$/i.test(
      size
    )
  ) {
    size = 'Free Size'
  }

  return {
    size,
    color,
  }
}

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

function ProductCard({
  product,
  onOpen,
}) {
  const variant =
    product.variants.find(
      item =>
        Number(item.stock_quantity || 0) > 0
    ) || product.variants[0]

  const {
    price,
    mrp,
    discount,
  } = priceInfo(variant)

  const image = product.images[0]

  const available =
    product.variants.some(
      item =>
        Number(item.stock_quantity || 0) > 0
    )

  return (
    <article className="store-product-card min-w-0 overflow-hidden rounded-xl bg-white">
      <button
        type="button"
        onClick={() => onOpen(product.id)}
        className="block w-full text-left"
        aria-label={`View ${product.name}`}
      >
        <div className="store-product-photo relative aspect-[4/5] overflow-hidden bg-slate-100">
          {image?.url ? (
            <img
              src={image.url}
              alt={image.alt || product.name}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full flex-col items-center justify-center gap-2 text-slate-400">
              <StoreIcon size={42} />
              <span className="text-xs">
                No photo
              </span>
            </div>
          )}

          {discount > 0 && (
            <span className="absolute left-2 top-2 rounded-md bg-rose-600 px-2 py-1 text-[11px] font-bold text-white">
              {discount}% OFF
            </span>
          )}
        </div>

        <div className="p-3">
          <h3 className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-5">
            {product.name}
          </h3>

          {product.description && (
            <p className="mt-1 line-clamp-2 text-xs text-slate-500">
              {product.description}
            </p>
          )}

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <strong className="text-base">
              {variant
                ? money(price)
                : 'Price unavailable'}
            </strong>

            {mrp > price && (
              <del className="text-xs text-slate-400">
                {money(mrp)}
              </del>
            )}
          </div>

          <p
            className={`mt-1 text-xs ${
              available


                ? 'text-green-700'
                : 'text-red-600'
            }`}
          >
            {available
              ? 'In stock'
              : 'Out of stock'}
          </p>

          <span className="mt-3 block rounded-lg border border-slate-200 px-2 py-2 text-center text-xs font-bold">
            View details
          </span>
        </div>
      </button>
    </article>
  )
}

function ProductDetails({
  product,
  selectedVariantId,
  onSelectVariant,
  cart,
  onAdd,
  onBack,
  template,
}) {
  const images = product.images
  const variants = product.variants

  const selected =
    variants.find(
      item =>
        item.id === selectedVariantId
    ) ||
    variants.find(
      item =>
        Number(item.stock_quantity || 0) > 0
    ) ||
    variants[0]

  const [index, setIndex] =
    useState(0)

  const touchX = useRef(null)

  const stock =
    Math.max(
      0,
      Number(selected?.stock_quantity || 0)
    )

  const inCart =
    selected
      ? cart.find(
          item =>
            item.variantId === selected.id
        )?.quantity || 0
      : 0

  const {
    price,
    mrp,
    discount,
  } = priceInfo(selected)

  const shift = useCallback(
    delta => {
      if (images.length > 1) {
        setIndex(
          previous =>
            (previous +
              delta +
              images.length) %
            images.length
        )
      }
    },
    [images.length]
  )

  const activeImage =
    images[index] || images[0]

  const attributes =
    variants.map(variant => ({
      variant,
      ...variantAttributes(variant),
    }))

  const sizes = [
    ...new Set(
      attributes
        .map(item => item.size)
        .filter(Boolean)
    ),
  ]

  const colors = [
    ...new Set(
      attributes
        .map(item => item.color)
        .filter(Boolean)
    ),
  ]

  const chosen =
    variantAttributes(selected)

  function choose(attribute, value) {
    const matching =
      attributes.filter(
        item =>
          item[attribute] === value
      )

    const other =
      attribute === 'size'
        ? 'color'
        : 'size'

    const compatible =
      matching.filter(
        item =>
          !chosen[other] ||
          item[other] === chosen[other]
      )

    const candidates =
      compatible.length
        ? compatible
        : matching

    const next =
      candidates.find(
        item =>
          Number(
            item.variant.stock_quantity || 0
          ) > 0
      ) || candidates[0]

    if (next) {
      onSelectVariant(
        product.id,
        next.variant.id
      )
    }
  }

  function hasStock(attribute, value) {
    return attributes.some(
      item =>
        item[attribute] === value &&
        Number(
          item.variant.stock_quantity || 0
        ) > 0
    )
  }

  function optionButton(
    attribute,
    value,
    active
  ) {
    return (
      <button
        key={`${attribute}-${value}`}
        type="button"
        onClick={() =>
          choose(attribute, value)
        }
        aria-pressed={active}
        disabled={
          !hasStock(attribute, value)
        }
        className={`min-w-12 rounded-xl border-2 px-4 py-3 text-sm font-semibold transition ${
          active
            ? 'border-rose-600 bg-rose-50 text-rose-800'
            : 'border-slate-200 bg-white text-slate-800 hover:border-rose-500'
        } disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 disabled:line-through`}
      >
        {value}
      </button>
    )
  }

  return (
    <div className="mx-auto max-w-6xl pb-10">
      <button
        type="button"
        onClick={onBack}
        className="mb-4 rounded-lg bg-white px-4 py-2 text-sm font-semibold shadow-sm"
      >
        ← Back to products
      </button>

      <div className="grid gap-5 rounded-2xl bg-white p-3 shadow-sm sm:p-6 md:grid-cols-2 md:gap-8">
        <div className="min-w-0">
          <div
            className="relative aspect-[4/5] overflow-hidden rounded-xl bg-slate-100"
            onTouchStart={event => {
              touchX.current =
                event.touches[0]?.clientX ??
                null
            }}
            onTouchEnd={event => {
              if (touchX.current === null) {
                return
              }

              const distance =
                (event.changedTouches[0]
                  ?.clientX ??
                  touchX.current) -
                touchX.current

              if (
                Math.abs(distance) > 45
              ) {
                shift(
                  distance < 0 ? 1 : -1
                )
              }

              touchX.current = null
            }}
          >
            {activeImage?.url ? (
              <img
                src={activeImage.url}
                alt={
                  activeImage.alt ||
                  product.name
                }
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
                <StoreIcon size={54} />
                No product photograph
              </div>
            )}

            {images.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous image"
                  onClick={() => shift(-1)}
                  className="absolute left-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white text-2xl shadow"
                >
                  ‹
                </button>

                <button
                  type="button"
                  aria-label="Next image"
                  onClick={() => shift(1)}
                  className="absolute right-2 top-1/2 grid h-10 w-10 -translate-y-1/2 place-items-center rounded-full bg-white text-2xl shadow"
                >


                  ›
                </button>

                <span className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/70 px-3 py-1 text-xs text-white">
                  {index + 1} / {images.length}
                </span>
              </>
            )}
          </div>

          {images.length > 1 && (
            <div className="mt-3 flex gap-2 overflow-x-auto pb-2">
              {images.map(
                (image, imageIndex) => (
                  <button
                    key={
                      image.id ||
                      `${image.url}-${imageIndex}`
                    }
                    type="button"
                    onClick={() =>
                      setIndex(imageIndex)
                    }
                    className={`h-16 w-16 shrink-0 overflow-hidden rounded-lg border-2 ${
                      index === imageIndex
                        ? 'border-rose-600'
                        : 'border-slate-200'
                    }`}
                    aria-label={`Show image ${imageIndex + 1}`}
                  >
                    <img
                      src={image.url}
                      alt={
                        image.alt ||
                        product.name
                      }
                      className="h-full w-full object-cover"
                    />
                  </button>
                )
              )}
            </div>
          )}
        </div>

        <div className="min-w-0">
          <h1 className="text-2xl font-bold leading-tight sm:text-3xl">
            {product.name}
          </h1>

          {discount > 0 && (
            <span className="mt-3 inline-block rounded-md bg-rose-100 px-2 py-1 text-xs font-bold text-rose-800">
              {discount}% OFF
            </span>
          )}

          <div className="mt-4 flex flex-wrap items-baseline gap-3">
            <strong className="text-3xl">
              {selected
                ? money(price)
                : 'Price unavailable'}
            </strong>

            {mrp > price && (
              <del className="text-base text-slate-400">
                {money(mrp)}
              </del>
            )}
          </div>

          <p
            className={`mt-3 text-sm font-semibold ${
              stock > 0
                ? 'text-green-700'
                : 'text-red-600'
            }`}
          >
            {stock > 0
              ? `${stock} available`
              : 'Out of stock'}
          </p>

          {sizes.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-3 text-sm font-bold">
                {template === 'pickles'
                  ? 'Select pack size'
                  : 'Select size'}

                {': '}

                <span className="font-medium text-slate-600">
                  {chosen.size ||
                    'Choose an option'}
                </span>
              </h2>

              <div className="flex flex-wrap gap-2">
                {sizes.map(size =>
                  optionButton(
                    'size',
                    size,
                    chosen.size === size
                  )
                )}
              </div>

              {sizes.length === 1 &&
                sizes[0] ===
                  'Free Size' && (
                  <p className="mt-2 text-xs text-green-700">
                    One size available
                  </p>
                )}
            </section>
          )}

          {colors.length > 0 && (
            <section className="mt-6">
              <h2 className="mb-3 text-sm font-bold">
                Select color: {chosen.color}
              </h2>

              <div className="flex flex-wrap gap-2">
                {colors.map(color =>
                  optionButton(
                    'color',
                    color,
                    chosen.color === color
                  )
                )}
              </div>
            </section>
          )}

          {!sizes.length &&
            !colors.length &&
            variants.length > 1 && (
              <label className="mt-6 block text-sm font-semibold">
                Choose product option

                <select
                  value={selected?.id || ''}
                  onChange={event =>
                    onSelectVariant(
                      product.id,
                      event.target.value
                    )
                  }
                  className="mt-2 w-full rounded-xl border border-slate-300 bg-white p-3"
                >
                  {variants.map(
                    variant => (
                      <option
                        key={variant.id}
                        value={variant.id}
                      >
                        {formatOption(
                          variant.options
                        )}
                        {' — '}
                        {money(
                          variant.price_paise
                        )}
                      </option>
                    )
                  )}
                </select>
              </label>
            )}

          {selected && (
            <p className="mt-4 text-xs text-slate-500">
              Selected:{' '}
              {formatOption(
                selected.options
              )}
            </p>
          )}

          <button
            type="button"
            disabled={
              !selected ||
              stock <= 0 ||
              inCart >= stock
            }
            onClick={() =>
              onAdd(product, selected)
            }
            className="mt-6 w-full rounded-xl bg-rose-600 px-5 py-4 text-base font-bold text-white hover:bg-rose-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {stock <= 0
              ? 'Unavailable'
              : inCart >= stock
                ? 'Stock limit reached'
                : inCart > 0
                  ? `Add more (${inCart} in cart)`
                  : 'Add to Cart'}
          </button>

          <div className="mt-7 border-t border-slate-200 pt-5">
            <h2 className="text-lg font-bold">
              Product Description
            </h2>

            <p className="mt-3 whitespace-pre-line break-words text-sm leading-7 text-slate-600">
              {product.description?.trim() ||
                'No additional description provided.'}
            </p>
          </div>

          {selected?.options &&
            Object.keys(
              selected.options
            ).length > 0 && (
              <div className="mt-6 border-t border-slate-200 pt-5">
                <h2 className="text-base font-bold">
                  Product Information
                </h2>

                <dl className="mt-3 space-y-2">
                  {Object.entries(
                    selected.options
                  ).map(
                    ([key, value]) => (
                      <div
                        key={key}
                        className="flex justify-between gap-3 text-sm"
                      >
                        <dt className="capitalize text-slate-500">
                          {key}
                        </dt>

                        <dd className="text-right font-medium">
                          {String(value)}
                        </dd>
                      </div>
                    )
                  )}
                </dl>
              </div>
            )}
        </div>
      </div>
    </div>
  )
}

export default function EcommerceStorefrontPage() {
  const params = useParams()

  const slug =
    typeof params?.slug === 'string'
      ? params.slug
      : ''

  const [store, setStore] =
    useState(null)

  const [storeDesign, setStoreDesign] =
    useState(null)

  const [promotions, setPromotions] = useState([])
  const [bannerIndex, setBannerIndex] = useState(0)

  const [categories, setCategories] =
    useState([])

  const [products, setProducts] =
    useState([])

  const [loading, setLoading] =
    useState(true)

  const [error, setError] =
    useState('')

  const [search, setSearch] =
    useState('')

  const [categoryId, setCategoryId] =
    useState('all')
  const [sortBy, setSortBy] = useState('newest')
  const [stockOnly, setStockOnly] = useState(false)
  const [discountOnly, setDiscountOnly] = useState(false)
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [showFilters, setShowFilters] = useState(false)

  const [
    selectedVariants,
    setSelectedVariants,
  ] = useState({})

  
const {
  cart,
  setCart,
} = useStorefrontCart(slug)


  const [cartOpen, setCartOpen] =
    useState(false)

  const [notice, setNotice] =
    useState('')

  const [detailId, setDetailId] =
    useState(null)

  const requestedTemplate =
    storeDesign?.template_key ||
    resolveStoreTemplate(store)

  const template =
    STORE_TEMPLATES[requestedTemplate]
      ? requestedTemplate
      : 'general'

  const templateInfo =
    STORE_TEMPLATES[template]

  const accent =
    ['rose', 'green', 'orange', 'blue']
      .includes(
        storeDesign?.accent_key
      )
      ? storeDesign.accent_key
      : 'rose'

  const mobileTheme = getMobileTheme(
    storeDesign?.mobile_theme_key || getDefaultMobileTheme(template),
    template
  )
  const themeStyle = {
    '--mobile-accent': mobileTheme.accent || '#b52e58',
    '--mobile-background': mobileTheme.background || '#ffffff',
    '--mobile-card': mobileTheme.card || '#ffffff',
    '--mobile-ink': mobileTheme.foreground || '#172033',
    '--mobile-hero': mobileTheme.hero || mobileTheme.accent || '#29233b',
  }
  const activeBanner = promotions.length
    ? promotions[bannerIndex % promotions.length]
    : null

  const loadCatalog =
    useCallback(
      async signal => {
        if (!slug) {
          throw new Error(
            'Invalid storefront address.'
          )
        }

        const response = await fetch(
          `/api/ecommerce/store/${encodeURIComponent(slug)}`,
          {
            cache: 'no-store',
            signal,
          }
        )

        const data =
          await response.json()
            .catch(() => null)

        if (
          !response.ok ||
          !data?.success
        ) {
          throw new Error(
            data?.message ||
            'Unable to load the store.'
          )
        }

        const designResponse =
          await fetch(
            `/api/ecommerce/store/${encodeURIComponent(slug)}/design`,
            {
              cache: 'no-store',
              signal,
            }
          )

        const designData =
          designResponse.ok
            ? await designResponse
                .json()
                .catch(() => null)
            : null

        const variantsByProduct =
          new Map()

        for (
          const variant of
          uniqueById(data.variants)
        ) {
          if (
            !variant?.product_id ||
            variant.is_active === false
          ) {
            continue
          }

          const current =
            variantsByProduct.get(
              variant.product_id
            ) || []

          current.push(variant)

          variantsByProduct.set(
            variant.product_id,
            current
          )
        }

        const imagesByProduct =
          new Map()

        for (
          const image of
          uniqueById(data.images)
        ) {
          if (
            !image?.product_id ||
            !image?.url
          ) {
            continue
          }

          const current =
            imagesByProduct.get(
              image.product_id
            ) || []

          current.push(image)

          imagesByProduct.set(
            image.product_id,
            current
          )
        }

        for (
          const images of
          imagesByProduct.values()
        ) {
          images.sort(
            (a, b) =>
              Number(
                a.sort_order || 0
              ) -
              Number(
                b.sort_order || 0
              )
          )
        }

        const normalizedProducts =
          uniqueById(data.products)
            .filter(
              product =>
                !product.status ||
                product.status === 'active'
            )
            .map(product => ({
              ...product,

              categoryId:
                product.category_id ??
                product.categoryId ??
                null,

              variants:
                Array.isArray(
                  product.variants
                )
                  ? uniqueById(
                      product.variants
                    ).filter(
                      item =>
                        item.is_active !== false
                    )
                  : variantsByProduct.get(
                      product.id
                    ) || [],

              images:
                imagesByProduct.get(
                  product.id
                ) ||
                uniqueById(
                  product.images
                ).filter(
                  image => image?.url
                ),
            }))

        return {
          store: data.store,

          design:
            designData?.success
              ? designData.design
              : null,
          promotions:
            designData?.success && Array.isArray(designData.promotions)
              ? designData.promotions
              : [],

          categories:
            uniqueById(
              data.categories
            ),

          products:
            normalizedProducts,
        }
      },
      [slug]
    )

  useEffect(() => {
    const controller =
      new AbortController()

    let active = true

    setLoading(true)
    setError('')
    setStore(null)
    setStoreDesign(null)
    setPromotions([])
    setBannerIndex(0)
    setProducts([])
    setCategories([])
    setCartOpen(false)
    setSelectedVariants({})
    setCategoryId('all')
    setSearch('')
    setSortBy('newest')
    setStockOnly(false)
    setDiscountOnly(false)
    setMinPrice('')
    setMaxPrice('')
    setShowFilters(false)
    setNotice('')

    setDetailId(
      new URLSearchParams(
        window.location.search
      ).get('product')
    )

    loadCatalog(
      controller.signal
    )
      .then(data => {
        if (!active) return

        setStore(data.store)
        setStoreDesign(data.design)
        setPromotions(data.promotions)
        setBannerIndex(0)
        setProducts(data.products)
        setCategories(data.categories)
      })
      .catch(err => {
        if (
          active &&
          err.name !== 'AbortError'
        ) {
          setError(
            err.message ||
            'Unable to load store.'
          )
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    return () => {
      active = false
      controller.abort()
    }
  }, [loadCatalog])

  useEffect(() => {
    const onPopState = () => {
      setDetailId(
        new URLSearchParams(
          window.location.search
        ).get('product')
      )
    }

    window.addEventListener(
      'popstate',
      onPopState
    )

    return () => {
      window.removeEventListener(
        'popstate',
        onPopState
      )
    }
  }, [])

  function openProduct(productId) {
    const url =
      new URL(window.location.href)

    url.searchParams.set(
      'product',
      productId
    )

    window.history.pushState(
      { productId },
      '',
      url
    )

    setDetailId(productId)
    setCartOpen(false)

    window.scrollTo({
      top: 0,
      behavior: 'instant',
    })
  }

  function closeProduct() {
    const url =
      new URL(window.location.href)

    url.searchParams.delete(
      'product'
    )

    window.history.pushState(
      {},
      '',
      url
    )

    setDetailId(null)

    window.scrollTo({
      top: 0,
      behavior: 'instant',
    })
  }

  const variantMap =
    useMemo(() => {
      const map = new Map()

      for (const product of products) {
        for (
          const variant of
          product.variants || []
        ) {
          map.set(
            variant.id,
            {
              product,
              variant,
            }
          )
        }
      }

      return map
    }, [products])

  const validCart =
    useMemo(
      () =>
        cart.flatMap(item => {
          const entry =
            variantMap.get(
              item.variantId
            )

          if (!entry) return []

          const stock =
            Math.max(
              0,
              Number(
                entry.variant
                  .stock_quantity || 0
              )
            )

          const quantity =
            Math.min(
              stock,
              Math.max(
                0,
                Number(
                  item.quantity || 0
                )
              )
            )

          if (!quantity) return []

          return [{
            variantId:
              item.variantId,

            quantity,

            stock,

            name:
              entry.product.name,
            image: entry.product.images?.[0]?.url || '',

            option:
              formatOption(
                entry.variant.options
              ),

            pricePaise:
              Number(
                entry.variant
                  .price_paise || 0
              ),
          }]
        }),
      [cart, variantMap]
    )

  const totalQuantity =
    validCart.reduce(
      (sum, item) =>
        sum + item.quantity,
      0
    )

  const subtotalPaise =
    validCart.reduce(
      (sum, item) =>
        sum +
        item.pricePaise *
          item.quantity,
      0
    )

  const productStats = useCallback(product => {
    const variants = product.variants || []
    const available = variants.filter(v => Number(v.stock_quantity || 0) > 0)
    const prices = (available.length ? available : variants)
      .map(v => Number(v.price_paise))
      .filter(Number.isFinite)
    const discounts = variants.map(v => priceInfo(v).discount)
    return {
      inStock: available.length > 0,
      price: prices.length ? Math.min(...prices) : Infinity,
      discount: Math.max(0, ...discounts),
    }
  }, [])

  const filteredProducts = useMemo(() => {
    const query = search.trim().toLowerCase()
    const minimum = minPrice.trim() === '' ? null : Number(minPrice) * 100
    const maximum = maxPrice.trim() === '' ? null : Number(maxPrice) * 100
    return products.filter(product => {
      if (categoryId !== 'all' && product.categoryId !== categoryId) return false
      const stats = productStats(product)
      if (stockOnly && !stats.inStock) return false
      if (discountOnly && stats.discount <= 0) return false
      if (minimum !== null && Number.isFinite(minimum) && stats.price < minimum) return false
      if (maximum !== null && Number.isFinite(maximum) && stats.price > maximum) return false
      if (!query) return true
      return [product.name, product.description, product.slug,
        ...(product.variants || []).map(v => v.sku),
      ].some(value => String(value || '').toLowerCase().includes(query))
    }).sort((a, b) => {
      const aa = productStats(a)
      const bb = productStats(b)
      if (sortBy === 'price-low') return aa.price - bb.price
      if (sortBy === 'price-high') return bb.price - aa.price
      if (sortBy === 'discount') return bb.discount - aa.discount
      if (sortBy === 'name') return String(a.name).localeCompare(String(b.name))
      return (Date.parse(b.created_at || '') || 0) - (Date.parse(a.created_at || '') || 0)
    })
  }, [products, categoryId, search, stockOnly, discountOnly, minPrice, maxPrice, sortBy, productStats])

  const clearFilters = () => {
    setSearch('')
    setCategoryId('all')
    setSortBy('newest')
    setStockOnly(false)
    setDiscountOnly(false)
    setMinPrice('')
    setMaxPrice('')
  }

  const detailProduct =
    products.find(
      product =>
        product.id === detailId
    )

  function addToCart(
    product,
    variant
  ) {
    if (
      !variant ||
      Number(
        variant.stock_quantity || 0
      ) <= 0
    ) {
      return
    }

    const stock =
      Number(
        variant.stock_quantity
      )

    const existing =
      validCart.find(
        item =>
          item.variantId ===
          variant.id
      )

    if (
      existing &&
      existing.quantity >= stock
    ) {
      setNotice(
        'Maximum available stock reached.'
      )
      return
    }

    setCart(previous => {
      const found =
        previous.find(
          item =>
            item.variantId ===
            variant.id
        )

      if (found) {
        return previous.map(
          item =>
            item.variantId ===
              variant.id
              ? {
                  ...item,
                  quantity:
                    Math.min(
                      item.quantity + 1,
                      stock
                    ),
                }
              : item
        )
      }

      return [
        ...previous,
        {
          variantId:
            variant.id,
          quantity: 1,
        },
      ]
    })

    setNotice(
      `${product.name} added to cart.`
    )
  }

  function removeItem(variantId) {
    setCart(previous => previous.filter(item => item.variantId !== variantId))
  }

  function clearCart() {
    if (window.confirm('Remove all products from your cart?')) setCart([])
  }

  function changeQuantity(
    variantId,
    change
  ) {
    const current =
      variantMap.get(variantId)

    if (!current) return

    setCart(previous =>
      previous
        .map(item =>
          item.variantId !== variantId
            ? item
            : {
                ...item,

                quantity:
                  Math.min(
                    Math.max(
                      item.quantity +
                        change,
                      0
                    ),

                    Number(
                      current.variant
                        .stock_quantity ||
                        0
                    )
                  ),
              }
        )
        .filter(
          item =>
            item.quantity > 0
        )
    )
  }

  async function refreshStore() {
    setLoading(true)
    setError('')

    try {
      const data =
        await loadCatalog()

      setStore(data.store)
      setStoreDesign(data.design)
      setPromotions(data.promotions)
      setBannerIndex(0)
      setProducts(data.products)
      setCategories(data.categories)

      setNotice(
        'Products refreshed.'
      )
    } catch (err) {
      setError(
        err.message ||
        'Unable to refresh store.'
      )
    } finally {
      setLoading(false)
    }
  }

  if (
    loading &&
    !store
  ) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        Loading store...
      </div>
    )
  }

  if (
    error &&
    !store
  ) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-5 text-center">
        <StoreIcon size={44} />

        <h2 className="text-2xl font-bold">
          Store unavailable
        </h2>

        <p className="text-sm text-slate-500">
          {error}
        </p>

        <button
          type="button"
          onClick={refreshStore}
          className="rounded-xl bg-rose-600 px-5 py-3 font-semibold text-white"
        >
          Try Again
        </button>
      </div>
    )
  }

  return (
    <div
      className={`storefront-template store-template-${template} store-accent-${accent} mobile-storefront mobile-theme-${mobileTheme.key} min-h-screen pb-24`}
      style={themeStyle}
    >
      <header className="store-header sticky top-0 z-20 border-b bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-3 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-rose-50 text-rose-700">
              <StoreIcon />
            </div>

            <div className="min-w-0">
              <strong className="block truncate text-base sm:text-lg">
                {store?.name ||
                  'Online Store'}
              </strong>

              <span className="text-xs text-slate-500">
                Shop Online
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              setCartOpen(true)
            }
            aria-label={`Open cart, ${totalQuantity} items`}
            className="store-cart-button flex items-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-white"
          >
            <CartIcon />

            <span>Cart</span>

            {totalQuantity > 0 && (
              <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-800">
                {totalQuantity}
              </span>
            )}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-3 py-4 sm:px-6 sm:py-6">
        {detailId ? (
          detailProduct ? (
            <ProductDetails
              key={detailProduct.id}
              product={detailProduct}
              selectedVariantId={
                selectedVariants[
                  detailProduct.id
                ]
              }
              onSelectVariant={(
                productId,
                variantId
              ) =>
                setSelectedVariants(
                  previous => ({
                    ...previous,
                    [productId]:
                      variantId,
                  })
                )
              }
              cart={validCart}
              onAdd={addToCart}
              onBack={closeProduct}
              template={template}
            />

          ) : (
            <div className="rounded-xl bg-white p-8 text-center">
              <p>
                Product not found or
                no longer published.
              </p>

              <button
                type="button"
                onClick={closeProduct}
                className="mt-4 rounded-lg bg-rose-600 px-4 py-2 text-white"
              >
                Back to Products
              </button>
            </div>
          )
        ) : (
          <>
            <section className="store-hero px-5 py-6 text-white sm:px-9 sm:py-9">
              <p className="text-xs font-bold uppercase tracking-widest">
                {templateInfo.eyebrow}
              </p>

              <h1 className="mt-2 text-2xl font-black sm:text-4xl">
                {store?.name}
              </h1>

              <p className="mt-2 max-w-lg text-sm leading-relaxed">
                {templateInfo.description}
              </p>
            </section>

             {activeBanner && (
               <section className="mobile-offer-banner mt-4 overflow-hidden rounded-2xl" aria-label="Store offers">
                 <div className="relative min-h-44 p-5 sm:p-8" style={{
                   background: activeBanner.image_url
                     ? `linear-gradient(90deg, rgba(0,0,0,.76), rgba(0,0,0,.25)), url("${activeBanner.image_url.replaceAll('"', '%22')}") center/cover`
                     : 'linear-gradient(120deg, var(--mobile-hero), var(--mobile-accent))',
                 }}>
                   <div className="relative z-10 max-w-md text-white">
                     {activeBanner.badge_text && (
                       <span className="inline-block rounded-full bg-white/20 px-3 py-1 text-xs font-bold">
                         {activeBanner.badge_text}
                       </span>
                     )}
                     <h2 className="mt-2 text-2xl font-black sm:text-3xl">{activeBanner.title}</h2>
                     {activeBanner.subtitle && <p className="mt-2 text-sm">{activeBanner.subtitle}</p>}
                     {activeBanner.destination_path && (
                       <a href={activeBanner.destination_path} className="mt-4 inline-block rounded-lg bg-white px-4 py-2 text-sm font-bold text-slate-900">
                         {activeBanner.button_text || 'Shop Now'}
                       </a>
                     )}
                   </div>
                 </div>
                 {promotions.length > 1 && (
                   <div className="flex items-center justify-between gap-3 bg-white px-4 py-2 text-sm">
                     <button type="button" onClick={() => setBannerIndex(i => (i - 1 + promotions.length) % promotions.length)} aria-label="Previous offer">← Previous</button>
                     <span>{(bannerIndex % promotions.length) + 1} / {promotions.length}</span>
                     <button type="button" onClick={() => setBannerIndex(i => (i + 1) % promotions.length)} aria-label="Next offer">Next →</button>
                   </div>
                 )}
               </section>
             )}

            <div className="mt-5 flex gap-3">
              <div className="flex min-w-0 flex-1 items-center gap-3 rounded-xl border border-slate-200 bg-white px-4">
                <span aria-hidden="true">
                  ⌕
                </span>

                <input
                  type="search"
                  aria-label="Search products"
                  placeholder="Search products"
                  value={search}
                  onChange={event =>
                    setSearch(
                      event.target.value
                    )
                  }
                  className="w-full min-w-0 bg-transparent py-3.5 text-sm outline-none"
                />
              </div>

              <button
                type="button"
                onClick={refreshStore}
                disabled={loading}
                className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm font-semibold disabled:opacity-50"
              >
                {loading
                  ? 'Refreshing...'
                  : 'Refresh'}
              </button>
            </div>

            <section className="mt-4 rounded-2xl border border-slate-200 bg-white p-3 sm:p-4" aria-label="Sort and filter products">
              <div className="flex flex-wrap items-center gap-2">
                <label className="min-w-0 flex-1 text-xs font-semibold text-slate-600">
                  Sort products
                  <select value={sortBy} onChange={event => setSortBy(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900">
                    <option value="newest">Newest first</option>
                    <option value="price-low">Price: low to high</option>
                    <option value="price-high">Price: high to low</option>
                    <option value="discount">Biggest discount</option>
                    <option value="name">Name A–Z</option>
                  </select>
                </label>
                <button type="button" onClick={() => setShowFilters(value => !value)} aria-expanded={showFilters} className="self-end rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold">
                  {showFilters ? 'Hide filters' : 'Filters'}
                </button>
                <button type="button" onClick={clearFilters} className="self-end rounded-xl px-3 py-2 text-sm font-semibold text-rose-700">Clear</button>
              </div>
              {showFilters && (
                <div className="mt-4 grid grid-cols-2 gap-3 border-t border-slate-100 pt-4">
                  <label className="text-xs font-semibold text-slate-600">Min price (₹)
                    <input type="number" min="0" step="0.01" inputMode="decimal" value={minPrice} onChange={e => setMinPrice(e.target.value)} placeholder="0" className="mt-1 w-full rounded-xl border border-slate-200 p-2 text-sm" />
                  </label>
                  <label className="text-xs font-semibold text-slate-600">Max price (₹)
                    <input type="number" min="0" step="0.01" inputMode="decimal" value={maxPrice} onChange={e => setMaxPrice(e.target.value)} placeholder="Any" className="mt-1 w-full rounded-xl border border-slate-200 p-2 text-sm" />
                  </label>
                  <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={stockOnly} onChange={e => setStockOnly(e.target.checked)} /> In stock only</label>
                  <label className="col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={discountOnly} onChange={e => setDiscountOnly(e.target.checked)} /> Discounted products only</label>
                </div>
              )}
            </section>

            <nav
              aria-label="Product categories"
              className="mt-4 flex gap-2 overflow-x-auto pb-4"
            >
              <button
                type="button"
                onClick={() =>
                  setCategoryId('all')
                }
                className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold ${
                  categoryId === 'all'
                    ? 'bg-rose-600 text-white'
                    : 'border border-slate-200 bg-white'
                }`}
              >
                All Products
              </button>

              {categories.map(
                category => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() =>
                      setCategoryId(
                        category.id
                      )
                    }
                    className={`shrink-0 rounded-full px-4 py-2.5 text-sm font-semibold ${
                      categoryId ===
                      category.id
                        ? 'bg-rose-600 text-white'
                        : 'border border-slate-200 bg-white'
                    }`}
                  >
                    {category.name}
                  </button>
                )
              )}
            </nav>

            <div className="mb-5">
              <h2 className="text-2xl font-bold">
                {templateInfo.catalogTitle}
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                {filteredProducts.length}
                {' '}products
              </p>
            </div>

            {filteredProducts.length ===
            0 ? (
              <div className="rounded-2xl border border-slate-200 bg-white px-5 py-14 text-center">
                <h3 className="text-lg font-bold">
                  No Products Found
                </h3>

                <p className="mt-2 text-sm text-slate-500">
                  Try another search
                  or category.
                </p>
              </div>
            ) : (
              <div className="store-product-grid grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
                {filteredProducts.map(
                  product => (
                    <ProductCard
                      key={product.id}
                      product={product}
                      onOpen={
                        openProduct
                      }
                    />
                  )
                )}
              </div>
            )}
          </>
        )}

        {notice && (
          <div
            role="status"
            className="mt-5 flex items-center justify-between gap-3 rounded-xl bg-green-100 px-4 py-3 text-sm text-green-900"
          >
            <span>{notice}</span>

            <button
              type="button"
              onClick={() =>
                setNotice('')
              }
              aria-label="Dismiss message"
              className="text-xl"
            >
              ×
            </button>
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="mt-5 rounded-xl bg-red-100 p-4 text-sm text-red-800"
          >
            {error}
          </p>
        )}
      </main>

      {totalQuantity > 0 &&
        !cartOpen && (
          <button
            type="button"
            onClick={() =>
              setCartOpen(true)
            }
            className="store-floating-cart fixed bottom-4 left-1/2 z-30 flex w-[calc(100%-32px)] max-w-xl -translate-x-1/2 items-center justify-between gap-2 rounded-2xl px-5 py-4 text-sm font-bold text-white shadow-xl"
          >
            <span>
              {totalQuantity}
              {' '}items
            </span>

            <strong>
              {money(
                subtotalPaise
              )}
            </strong>

            <span>
              View Cart →
            </span>
          </button>
        )}

      {cartOpen && (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-black/60"
          onClick={() =>
            setCartOpen(false)
          }
        >
          <aside
            role="dialog"
            aria-modal="true"
            aria-label="Shopping cart"
            onClick={event =>
              event.stopPropagation()
            }
            className="flex h-full w-full max-w-md flex-col bg-white shadow-2xl"
          >
            <div className="flex items-center justify-between border-b p-5">
              <div>
                <h2 className="text-xl font-bold">
                  Your Cart
                </h2>

                <p className="mt-1 text-xs text-slate-500">
                  {totalQuantity}
                  {' '}items
                </p>
              </div>

              <button
                type="button"
                onClick={() =>
                  setCartOpen(false)
                }
                aria-label="Close cart"
                className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5">
              {validCart.length ===
              0 ? (
                <div className="py-16 text-center">
                  <CartIcon size={44} />

                  <h3 className="mt-4 font-bold">
                    Your Cart Is Empty
                  </h3>

                  <p className="mt-2 text-sm text-slate-500">
                    Add products to get
                    started.
                  </p>
                </div>
              ) : (
                validCart.map(item => (
                  <div
                    key={item.variantId}
                    className="flex items-center justify-between gap-3 border-b border-slate-100 py-5"
                  >
                    {item.image ? <img src={item.image} alt="" loading="lazy" className="h-16 w-14 shrink-0 rounded-lg object-cover" /> : <div className="h-16 w-14 shrink-0 rounded-lg bg-slate-100" />}
                    <div className="min-w-0 flex-1">
                      <strong className="block text-sm">
                        {item.name}
                      </strong>

                      <small className="mt-1 block text-slate-500">
                        {item.option}
                      </small>

                      <span className="mt-2 block text-sm font-bold text-rose-700">
                        {money(
                          item.pricePaise
                        )}
                      </span>
                      <button type="button" onClick={() => removeItem(item.variantId)} className="mt-2 text-xs font-semibold text-rose-700 underline">Remove</button>
                    </div>

                    <div className="flex shrink-0 items-center overflow-hidden rounded-lg border border-rose-600">
                      <button
                        type="button"
                        onClick={() =>
                          changeQuantity(
                            item.variantId,
                            -1
                          )
                        }
                        aria-label={`Decrease ${item.name}`}
                        className="bg-rose-50 px-3 py-2 text-lg"
                      >
                        −
                      </button>

                      <strong className="px-3 text-sm">
                        {item.quantity}
                      </strong>

                      <button
                        type="button"
                        disabled={
                          item.quantity >=
                          item.stock
                        }
                        onClick={() =>
                          changeQuantity(
                            item.variantId,
                            1
                          )
                        }
                        aria-label={`Increase ${item.name}`}
                        className="bg-rose-50 px-3 py-2 text-lg disabled:opacity-40"
                      >
                        +
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="border-t p-5">
               {validCart.length > 0 && <button type="button" onClick={clearCart} className="mb-4 text-sm font-semibold text-rose-700 underline">Clear cart</button>}
               <div className="flex items-center justify-between text-lg">
                <span>
                  Subtotal
                </span>

                <strong>
                  {money(
                    subtotalPaise
                  )}
                </strong>
              </div>

              <p className="my-4 text-xs leading-relaxed text-slate-500">
                Shipping, taxes and
                payment options will
                be calculated when
                checkout becomes available.
              </p>

              <button
                type="button"
                disabled
                className="w-full cursor-not-allowed rounded-xl bg-slate-400 px-5 py-4 font-bold text-white"
              >
                Checkout Coming Soon
              </button>

              <p className="mt-3 text-center text-xs text-slate-500">
                Orders and payments
                are not enabled yet.
              </p>
            </div>
          </aside>
        </div>
      )}
    </div>
  )
}