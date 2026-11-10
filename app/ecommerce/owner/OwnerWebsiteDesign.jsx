
'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import {
  MOBILE_THEMES,
  getDefaultMobileTheme,
  getMobileTheme,
} from '@/lib/ecommerce/mobileThemes'

const CATEGORIES = [
  ['fashion', 'Fashion'],
  ['pickles', 'Pickles'],
  ['grocery', 'Groceries'],
  ['toys', 'Toys'],
  ['electronics', 'Electronics'],
]

const COLORS = [
  ['rose', 'Rose', '#b52e58'],
  ['green', 'Green', '#087f5b'],
  ['orange', 'Orange', '#c25b21'],
  ['blue', 'Blue', '#2563eb'],
]

const blankPromotion = () => ({
  title: '',
  subtitle: '',
  badgeText: '',
  imageUrl: '',
  buttonText: 'Shop Now',
  destinationPath: '',
  isActive: false,
  sortOrder: 0,
  startsAt: '',
  endsAt: '',
})

function toLocalDate(value) {
  if (!value) return ''

  const date = new Date(value)

  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const local = new Date(
    date.getTime() -
      date.getTimezoneOffset() * 60000
  )

  return local.toISOString().slice(0, 16)
}

function fromRecord(item) {
  return {
    title: item.title || '',
    subtitle: item.subtitle || '',
    badgeText: item.badge_text || '',
    imageUrl: item.image_url || '',
    buttonText: item.button_text || 'Shop Now',
    destinationPath: item.destination_path || '',
    isActive: item.is_active === true,
    sortOrder: item.sort_order || 0,
    startsAt: toLocalDate(item.starts_at),
    endsAt: toLocalDate(item.ends_at),
  }
}

async function designRequest(
  storeId,
  method = 'GET',
  body
) {
  const { data, error } =
    await supabase.auth.getSession()

  if (
    error ||
    !data?.session?.access_token
  ) {
    throw new Error(
      'Sign in again to continue.'
    )
  }

  const response = await fetch(
    `/api/ecommerce/owner/website-design?storeId=${encodeURIComponent(storeId)}`,
    {
      method,
      cache: 'no-store',
      headers: {
        Authorization:
          `Bearer ${data.session.access_token}`,
        ...(body
          ? {
              'Content-Type':
                'application/json',
            }
          : {}),
      },
      ...(body
        ? {
            body: JSON.stringify({
              ...body,
              storeId,
            }),
          }
        : {}),
    }
  )

  const result =
    await response.json().catch(() => ({}))

  if (!response.ok || !result.success) {
    throw new Error(
      result.message ||
      'Website design request failed.'
    )
  }

  return result
}

export default function OwnerWebsiteDesign({
  storeId,
  storeName = 'Your Store',
  storeSlug = '',
}) {
  const [category, setCategory] =
    useState('fashion')

  const [themeKey, setThemeKey] =
    useState('fashion-trend')

  const [accent, setAccent] =
    useState('rose')

  const [saved, setSaved] =
    useState(null)

  const [canEdit, setCanEdit] =
    useState(false)

  const [loading, setLoading] =
    useState(true)

  const [busy, setBusy] =
    useState(false)

  const [error, setError] =
    useState('')

  const [notice, setNotice] =
    useState('')

  const [promotions, setPromotions] =
    useState([])

  const [editingId, setEditingId] =
    useState(null)

  const [promotion, setPromotion] =
    useState(blankPromotion)

  const [promotionBusy, setPromotionBusy] =
    useState(false)

  const [
    previewPromotion,
    setPreviewPromotion,
  ] = useState(false)

  useEffect(() => {
    let active = true

    setLoading(true)
    setError('')
    setNotice('')
    setSaved(null)
    setPromotions([])
    setEditingId(null)
    setPromotion(blankPromotion())

    if (!storeId) {
      setLoading(false)

      return () => {
        active = false
      }
    }

    designRequest(storeId)
      .then(result => {
        if (!active) return

        const template =
          result.design?.template_key ||
          'fashion'

        const key =
          result.design?.mobile_theme_key ||
          getDefaultMobileTheme(template)

        const selected =
          getMobileTheme(key, template)

        const nextCategory =
          selected.category || 'fashion'

        const nextAccent =
          result.design?.accent_key ||
          'rose'

        setCategory(nextCategory)
        setThemeKey(selected.key)
        setAccent(nextAccent)

        setSaved(
          `${selected.key}:${nextAccent}`
        )

        setCanEdit(
          Boolean(result.canEdit)
        )

        setPromotions(
          Array.isArray(result.promotions)
            ? result.promotions
            : []
        )
      })
      .catch(err => {
        if (active) {
          setError(err.message)
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false)
        }
      })

    return () => {
      active = false
    }
  }, [storeId])

  const availableThemes = useMemo(
    () =>
      MOBILE_THEMES.filter(
        item => item.category === category
      ),
    [category]
  )

  const theme =
    getMobileTheme(themeKey, category)

  const selectedColor =
    COLORS.find(
      item => item[0] === accent
    )?.[2] || theme.accent

  const hasChanges =
    saved !== `${themeKey}:${accent}`

  const storeUrl = storeSlug
    ? `/shop/${encodeURIComponent(storeSlug)}`
    : ''

  const previewBanner =
    previewPromotion && promotion.title
      ? {
          ...promotion,
          badge_text: promotion.badgeText,
          button_text: promotion.buttonText,
          image_url: promotion.imageUrl,
        }
      : promotions.find(
          item => item.is_active
        ) || null

  function chooseCategory(next) {
    setCategory(next)

    setThemeKey(
      getDefaultMobileTheme(next)
    )

    setError('')
    setNotice('')
  }

  async function saveDesign() {
    if (
      !storeId ||
      !canEdit ||
      busy ||
      loading
    ) {
      return
    }

    setBusy(true)
    setError('')
    setNotice('')

    try {
      const result =
        await designRequest(
          storeId,
          'PATCH',
          {
            action: 'design',
            mobileThemeKey: themeKey,
            accentKey: accent,
          }
        )

      const nextKey =
        result.design.mobile_theme_key

      const nextAccent =
        result.design.accent_key

      setThemeKey(nextKey)
      setAccent(nextAccent)

      setSaved(
        `${nextKey}:${nextAccent}`
      )

      setNotice(
        'Mobile theme saved successfully. Refresh your storefront to see the changes.'
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  function resetDesign() {
    if (!saved) return

    const [key, color] =
      saved.split(':')

    setThemeKey(key)

    setCategory(
      getMobileTheme(key).category
    )

    setAccent(color)
    setError('')
    setNotice('')
  }

  function editPromotion(item) {
    setEditingId(item.id)

    setPromotion(
      fromRecord(item)
    )

    setPreviewPromotion(true)
    setError('')
    setNotice('')
  }

  function newPromotion() {
    setEditingId(null)

    setPromotion(
      blankPromotion()
    )

    setPreviewPromotion(false)
  }

  function setField(name, value) {
    setPromotion(previous => ({
      ...previous,
      [name]: value,
    }))

    setPreviewPromotion(true)
  }

  async function reloadPromotions() {
    const result =
      await designRequest(storeId)

    setPromotions(
      Array.isArray(result.promotions)
        ? result.promotions
        : []
    )
  }

  async function savePromotion(event) {
    event.preventDefault()

    if (!canEdit || promotionBusy) {
      return
    }

    setPromotionBusy(true)
    setError('')
    setNotice('')

    try {
      const toISO = value =>
        value
          ? new Date(value).toISOString()
          : null

      await designRequest(
        storeId,
        'PATCH',
        {
          action: 'promotion',

          ...(editingId
            ? {
                promotionId: editingId,
              }
            : {}),

          promotion: {
            ...promotion,

            sortOrder:
              Number(
                promotion.sortOrder
              ) || 0,

            startsAt:
              toISO(
                promotion.startsAt
              ),

            endsAt:
              toISO(
                promotion.endsAt
              ),
          },
        }
      )

      await reloadPromotions()

      newPromotion()

      setNotice(
        'Homepage advertisement saved successfully.'
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setPromotionBusy(false)
    }
  }

  async function deletePromotion(id) {
    if (
      !canEdit ||
      promotionBusy ||
      !window.confirm(
        'Delete this advertisement?'
      )
    ) {
      return
    }

    setPromotionBusy(true)
    setError('')
    setNotice('')

    try {
      await designRequest(
        storeId,
        'PATCH',
        {
          action: 'deletePromotion',
          promotionId: id,
        }
      )

      await reloadPromotions()

      if (editingId === id) {
        newPromotion()
      }

      setNotice(
        'Advertisement deleted successfully.'
      )
    } catch (err) {
      setError(err.message)
    } finally {
      setPromotionBusy(false)
    }
  }

  const fieldClass =
    'w-full rounded-xl border border-neutral-700 bg-neutral-950 px-3 py-3 text-sm text-white outline-none focus:border-rose-400'

  const fieldLabel =
    'mb-1.5 block text-sm font-semibold'

  return (
    <div className="space-y-6 text-white">
      <section className="space-y-6 rounded-2xl border border-neutral-800 bg-neutral-900 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-2xl font-bold">
              Website Design
            </h2>

            <p className="mt-1 text-sm text-neutral-400">
              Choose from 50 mobile-first themes for {storeName}.
            </p>
          </div>

          {storeUrl && (
            <a
              href={storeUrl}
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-neutral-700 px-4 py-3 text-sm font-semibold"
            >
              Open Storefront
            </a>
          )}
        </div>

        {error && (
          <p
            role="alert"
            className="rounded-lg border border-red-700 p-3 text-sm text-red-300"
          >
            {error}
          </p>
        )}

        {notice && (
          <p
            role="status"
            className="rounded-lg border border-green-700 p-3 text-sm text-green-300"
          >
            {notice}
          </p>
        )}

        {loading ? (
          <p className="text-sm text-neutral-400">
            Loading website design...
          </p>
        ) : (
          <>
            <div>
              <h3 className="mb-3 font-bold">
                Business Theme Collection
              </h3>

              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map(([key, title]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => chooseCategory(key)}
                    aria-pressed={category === key}
                    className={`rounded-xl border px-4 py-2.5 text-sm font-semibold ${
                      category === key
                        ? 'border-rose-400 bg-neutral-800 text-white'
                        : 'border-neutral-700 bg-neutral-950 text-neutral-300'
                    }`}
                  >
                    {title}
                  </button>
                ))}
              </div>

              <p className="mt-2 text-xs text-neutral-400">
                Each collection contains 10 themes.
                The owner API validates which theme
                can be saved for the store.
              </p>
            </div>

            <div>
              <h3 className="mb-3 font-bold">
                {
                  CATEGORIES.find(
                    item => item[0] === category
                  )?.[1]
                }
                {' — 10 Mobile Themes'}
              </h3>

              <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
                {availableThemes.map(item => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setThemeKey(item.key)}
                    aria-pressed={themeKey === item.key}
                    className={`overflow-hidden rounded-xl border-2 text-left transition ${
                      themeKey === item.key
                        ? 'border-rose-400 ring-1 ring-rose-400'
                        : 'border-neutral-700 hover:border-neutral-500'
                    }`}
                  >
                    <div
                      className="p-3"
                      style={{
                        background: item.background,
                        color: item.foreground,
                      }}
                    >
                      <div
                        className="min-h-20 p-3"
                        style={{
                          background: item.hero,
                          color: '#ffffff',
                          borderRadius: item.radius,
                        }}
                      >
                        <div
                          className="mb-2 h-1.5 w-10 rounded-full"
                          style={{
                            background: item.accent,
                          }}
                        />

                        <strong className="block text-xs">
                          {item.name}
                        </strong>

                        <span className="text-[10px]">
                          Discover more
                        </span>
                      </div>

                      <div className="mt-2 grid grid-cols-2 gap-2">
                        {[0, 1].map(number => (
                          <div
                            key={number}
                            className="overflow-hidden"
                            style={{
                              background: item.card,
                              borderRadius: item.radius,
                            }}
                          >
                            <div
                              className="h-12"
                              style={{
                                background: item.hero,
                              }}
                            />

                            <div className="space-y-1 p-2">
                              <div
                                className="h-1.5 rounded"
                                style={{
                                  background: item.foreground,
                                  opacity: 0.25,
                                }}
                              />

                              <div
                                className="h-1.5 w-1/2 rounded"
                                style={{
                                  background: item.accent,
                                }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="bg-neutral-950 p-3">
                      <strong className="block text-xs">
                        {item.name}
                      </strong>

                      <span className="mt-1 block text-[11px] text-neutral-400">
                        {item.layout} layout
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="mb-3 font-bold">
                Accent Color
              </h3>

              <div className="flex flex-wrap gap-3">
                {COLORS.map(([key, name, hex]) => (
                  <button
                    key={key}
                    type="button"
                    aria-pressed={accent === key}
                    onClick={() => setAccent(key)}
                    className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                      accent === key
                        ? 'border-white'
                        : 'border-neutral-700'
                    }`}
                  >
                    <span
                      className="h-5 w-5 rounded-full"
                      style={{
                        background: hex,
                      }}
                    />

                    {name}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <h3 className="mb-3 font-bold">
                Mobile Website Preview
              </h3>

              <div
                className="mx-auto max-w-[390px] overflow-hidden rounded-[26px] border-4 border-neutral-700 shadow-xl"
                style={{
                  background: theme.background,
                  color: theme.foreground,
                }}
              >
                <div className="flex items-center justify-between gap-2 px-4 py-4">
                  <strong className="truncate">
                    {storeName}
                  </strong>

                  <span className="text-xs">
                    Search · Cart
                  </span>
                </div>

                <div
                  className="mx-3 p-5"
                  style={{
                    background: theme.hero,
                    color: '#ffffff',
                    borderRadius: theme.radius,
                  }}
                >
                  <p className="text-[10px] font-bold uppercase tracking-widest">
                    {theme.name}
                  </p>

                  <h4 className="mt-2 text-xl font-bold">
                    Discover our collection
                  </h4>

                  <p className="mt-2 text-xs">
                    Shop quality products picked for you.
                  </p>

                  <span
                    className="mt-4 inline-block px-4 py-2 text-xs font-bold text-white"
                    style={{
                      background: selectedColor,
                      borderRadius: theme.radius,
                    }}
                  >
                    Shop Now
                  </span>
                </div>

                {previewBanner && (
                  <div
                    className="mx-3 mt-3 overflow-hidden"
                    style={{
                      background: theme.hero,
                      color: '#ffffff',
                      borderRadius: theme.radius,
                    }}
                  >
                    {previewBanner.image_url && (
                      <img
                        src={previewBanner.image_url}
                        alt="Promotion preview"
                        className="h-32 w-full object-cover"
                      />
                    )}

                    <div className="p-3">
                      <p className="text-[10px] font-semibold">
                        {previewBanner.badge_text}
                      </p>

                      <strong className="block text-sm">
                        {previewBanner.title}
                      </strong>

                      <p className="text-xs">
                        {previewBanner.subtitle}
                      </p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3 p-3">
                  {[1, 2].map(number => (
                    <div
                      key={number}
                      className="overflow-hidden"
                      style={{
                        background: theme.card,
                        borderRadius: theme.radius,
                      }}
                    >
                      <div
                        className="flex aspect-square items-center justify-center text-xs text-white"
                        style={{
                          background: theme.hero,
                        }}
                      >
                        Product photo
                      </div>

                      <div className="p-3">
                        <strong className="block text-xs">
                          Product {number}
                        </strong>

                        <span className="text-xs">
                          Catalog price
                        </span>

                        <div
                          className="mt-2 h-2 w-14 rounded-full"
                          style={{
                            background: selectedColor,
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {!canEdit && (
              <p className="text-sm text-amber-300">
                Super Admin approval and an active
                website are required to save changes.
              </p>
            )}

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={saveDesign}
                disabled={
                  !hasChanges ||
                  !canEdit ||
                  busy
                }
                className="rounded-xl bg-rose-600 px-5 py-3 font-semibold hover:bg-rose-500 disabled:opacity-40"
              >
                {busy
                  ? 'Saving...'
                  : hasChanges
                    ? 'Save Mobile Theme'
                    : 'Theme Saved'}
              </button>

              <button
                type="button"
                onClick={resetDesign}
                disabled={busy}
                className="rounded-xl border border-neutral-700 px-4 py-3 text-sm"
              >
                Reset to Saved
              </button>
            </div>
          </>
        )}
      </section>

      {!loading && (
        <section className="space-y-5 rounded-2xl border border-neutral-800 bg-neutral-900 p-4 sm:p-6">
          <div>
            <h2 className="text-2xl font-bold">
              Homepage Advertisements & Offers
            </h2>

            <p className="mt-1 text-sm text-neutral-400">
              Add banners, announcements and seasonal
              offers. These are promotional messages
              only; they do not change checkout prices.
            </p>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">
                  Saved Advertisements ({promotions.length}/20)
                </h3>

                <button
                  type="button"
                  onClick={newPromotion}
                  className="rounded-lg border border-neutral-700 px-3 py-2 text-xs"
                >
                  New
                </button>
              </div>

              {promotions.length === 0 && (
                <p className="rounded-xl border border-neutral-700 p-4 text-sm text-neutral-400">
                  No advertisements yet.
                  Create your first homepage banner.
                </p>
              )}

              {promotions.map(item => (
                <div
                  key={item.id}
                  className="flex gap-3 rounded-xl border border-neutral-700 bg-neutral-950 p-3"
                >
                  {item.image_url ? (
                    <img
                      src={item.image_url}
                      alt=""
                      className="h-20 w-20 shrink-0 rounded-lg object-cover"
                    />
                  ) : (
                    <div className="grid h-20 w-20 shrink-0 place-items-center rounded-lg bg-neutral-800 text-xs text-neutral-400">
                      Banner
                    </div>
                  )}

                  <div className="min-w-0 flex-1">
                    <strong className="block truncate text-sm">
                      {item.title}
                    </strong>

                    <p className="mt-1 text-xs text-neutral-400">
                      {item.is_active
                        ? 'Enabled'
                        : 'Disabled'}
                      {' · Order '}
                      {item.sort_order}
                    </p>

                    <div className="mt-2 flex gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          editPromotion(item)
                        }
                        className="rounded-lg border border-neutral-600 px-3 py-1.5 text-xs"
                      >
                        Edit
                      </button>

                      <button
                        type="button"
                        onClick={() =>
                          deletePromotion(item.id)
                        }
                        disabled={
                          !canEdit ||
                          promotionBusy
                        }
                        className="rounded-lg border border-red-800 px-3 py-1.5 text-xs text-red-300 disabled:opacity-40"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <form
              onSubmit={savePromotion}
              className="space-y-4 rounded-xl border border-neutral-700 bg-neutral-950 p-4"
            >
              <h3 className="font-semibold">
                {editingId
                  ? 'Edit Advertisement'
                  : 'Create Advertisement'}
              </h3>

              <div>
                <label
                  htmlFor="promo-title"
                  className={fieldLabel}
                >
                  Offer Title *
                </label>

                <input
                  id="promo-title"
                  required
                  maxLength={100}
                  className={fieldClass}
                  value={promotion.title}
                  onChange={event =>
                    setField(
                      'title',
                      event.target.value
                    )
                  }
                  placeholder="Festive Sale"
                />
              </div>

              <div>
                <label
                  htmlFor="promo-subtitle"
                  className={fieldLabel}
                >
                  Subtitle
                </label>

                <textarea
                  id="promo-subtitle"
                  maxLength={240}
                  rows={2}
                  className={fieldClass}
                  value={promotion.subtitle}
                  onChange={event =>
                    setField(
                      'subtitle',
                      event.target.value
                    )
                  }
                  placeholder="Explore our latest collection"
                />
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="promo-badge"
                    className={fieldLabel}
                  >
                    Badge
                  </label>

                  <input
                    id="promo-badge"
                    maxLength={50}
                    className={fieldClass}
                    value={promotion.badgeText}
                    onChange={event =>
                      setField(
                        'badgeText',
                        event.target.value
                      )
                    }
                    placeholder="Limited Time"
                  />
                </div>

                <div>
                  <label
                    htmlFor="promo-button"
                    className={fieldLabel}
                  >
                    Button Text *
                  </label>

                  <input
                    id="promo-button"
                    required
                    maxLength={40}
                    className={fieldClass}
                    value={promotion.buttonText}
                    onChange={event =>
                      setField(
                        'buttonText',
                        event.target.value
                      )
                    }
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="promo-image"
                  className={fieldLabel}
                >
                  Banner Image HTTPS URL
                </label>

                <input
                  id="promo-image"
                  type="url"
                  maxLength={2000}
                  className={fieldClass}
                  value={promotion.imageUrl}
                  onChange={event =>
                    setField(
                      'imageUrl',
                      event.target.value
                    )
                  }
                  placeholder="https://.../banner.jpg"
                />

                <p className="mt-1 text-xs text-neutral-400">
                  Use an image already hosted on a
                  trusted HTTPS storage service.
                </p>
              </div>

              <div>
                <label
                  htmlFor="promo-link"
                  className={fieldLabel}
                >
                  Button Destination
                </label>

                <input
                  id="promo-link"
                  maxLength={300}
                  className={fieldClass}
                  value={promotion.destinationPath}
                  onChange={event =>
                    setField(
                      'destinationPath',
                      event.target.value
                    )
                  }
                  placeholder={
                    storeUrl ||
                    '/shop/your-store'
                  }
                />

                <p className="mt-1 text-xs text-neutral-400">
                  Optional. Must be a path within
                  this storefront.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="promo-start"
                    className={fieldLabel}
                  >
                    Start Date
                  </label>

                  <input
                    id="promo-start"
                    type="datetime-local"
                    className={fieldClass}
                    value={promotion.startsAt}
                    onChange={event =>
                      setField(
                        'startsAt',
                        event.target.value
                      )
                    }
                  />
                </div>

                <div>
                  <label
                    htmlFor="promo-end"
                    className={fieldLabel}
                  >
                    End Date
                  </label>

                  <input
                    id="promo-end"
                    type="datetime-local"
                    className={fieldClass}
                    value={promotion.endsAt}
                    onChange={event =>
                      setField(
                        'endsAt',
                        event.target.value
                      )
                    }
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="promo-order"
                  className={fieldLabel}
                >
                  Display Order
                </label>

                <input
                  id="promo-order"
                  type="number"
                  min="0"
                  max="10000"
                  className={fieldClass}
                  value={promotion.sortOrder}
                  onChange={event =>
                    setField(
                      'sortOrder',
                      event.target.value
                    )
                  }
                />
              </div>

              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  checked={promotion.isActive}
                  onChange={event =>
                    setField(
                      'isActive',
                      event.target.checked
                    )
                  }
                />

                Enable this advertisement
              </label>

              <div className="flex flex-wrap gap-3">
                <button
                  type="submit"
                  disabled={
                    !canEdit ||
                    promotionBusy
                  }
                  className="rounded-xl bg-rose-600 px-5 py-3 text-sm font-bold disabled:opacity-40"
                >
                  {promotionBusy
                    ? 'Saving...'
                    : editingId
                      ? 'Update Advertisement'
                      : 'Create Advertisement'}
                </button>

                {editingId && (
                  <button
                    type="button"
                    onClick={newPromotion}
                    className="rounded-xl border border-neutral-700 px-4 py-3 text-sm"
                  >
                    Cancel Edit
                  </button>
                )}
              </div>
            </form>
          </div>
        </section>
      )}
    </div>
  )
}
