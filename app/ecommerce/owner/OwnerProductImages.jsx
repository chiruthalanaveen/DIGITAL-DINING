
'use client'

import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'

import { supabase } from '@/lib/supabase'

const button =
  'rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2.5 text-sm font-semibold text-white hover:bg-neutral-700 disabled:opacity-40'

const MAX_IMAGES = 10
const MAX_SIZE = 5 * 1024 * 1024
const ALLOWED = [
  'image/jpeg',
  'image/png',
  'image/webp',
]

async function request(storeId, productId, method = 'GET', body) {
  const { data, error } = await supabase.auth.getSession()

  if (error || !data?.session?.access_token) {
    throw new Error('Sign in again.')
  }

  const url =
    `/api/ecommerce/owner/product-images?storeId=${encodeURIComponent(storeId)}&productId=${encodeURIComponent(productId)}`

  const isForm = body instanceof FormData

  const response = await fetch(url, {
    method,
    cache: 'no-store',
    headers: {
      Authorization: `Bearer ${data.session.access_token}`,
      ...(!isForm && body
        ? { 'Content-Type': 'application/json' }
        : {}),
    },
    ...(body
      ? { body: isForm ? body : JSON.stringify(body) }
      : {}),
  })

  const result = await response.json().catch(() => ({}))

  if (!response.ok || !result.success) {
    throw new Error(
      result.message || 'Image request failed.'
    )
  }

  return result
}

export default function OwnerProductImages({
  storeId,
  productId,
  productName,
  onClose,
}) {
  const [images, setImages] = useState([])
  const [files, setFiles] = useState([])
  const [previews, setPreviews] = useState([])
  const [alt, setAlt] = useState(productName || '')
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')

  const inputRef = useRef(null)

  const refresh = useCallback(async () => {
    const result = await request(storeId, productId)
    setImages(result.images || [])
  }, [storeId, productId])

  useEffect(() => {
    let active = true

    setLoading(true)

    request(storeId, productId)
      .then(result => {
        if (active) setImages(result.images || [])
      })
      .catch(err => {
        if (active) setError(err.message)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
    }
  }, [storeId, productId])

  useEffect(() => {
    const urls = files.map(file => ({
      key: `${file.name}-${file.size}-${file.lastModified}`,
      url: URL.createObjectURL(file),
      name: file.name,
    }))

    setPreviews(urls)

    return () => {
      urls.forEach(item => URL.revokeObjectURL(item.url))
    }
  }, [files])

  function chooseFiles(event) {
    const selected = Array.from(event.target.files || [])

    setError('')
    setNotice('')

    if (!selected.length) {
      setFiles([])
      return
    }

    if (selected.length + images.length > MAX_IMAGES) {
      setFiles([])
      event.target.value = ''
      setError(
        `You can upload up to ${MAX_IMAGES} photos per product.`
      )
      return
    }

    const invalid = selected.find(file =>
      !ALLOWED.includes(file.type) ||
      file.size < 100 ||
      file.size > MAX_SIZE
    )

    if (invalid) {
      setFiles([])
      event.target.value = ''
      setError(
        'Every photo must be JPG, PNG or WebP and 5 MB or smaller.'
      )
      return
    }

    setFiles(selected)
  }

  async function upload(event) {
    event.preventDefault()

    if (!files.length || busy) return

    setBusy(true)
    setError('')
    setNotice('')

    let uploaded = 0

    try {
      for (const file of files) {
        setProgress(
          `Uploading ${uploaded + 1} of ${files.length}…`
        )

        const form = new FormData()
        form.append('storeId', storeId)
        form.append('productId', productId)
        form.append('image', file)
        form.append('alt', alt || productName || '')

        await request(
          storeId,
          productId,
          'POST',
          form
        )

        uploaded += 1
      }

      setFiles([])

      if (inputRef.current) {
        inputRef.current.value = ''
      }

      setNotice(
        `${uploaded} photo${uploaded === 1 ? '' : 's'} uploaded successfully.`
      )
    } catch (err) {
      setError(
        `${uploaded} uploaded. ${err.message || 'Upload failed.'}`
      )
    } finally {
      setProgress('')

      try {
        await refresh()
      } catch (err) {
        setError(current =>
          current
            ? `${current} Refresh failed: ${err.message}`
            : err.message
        )
      }

      setBusy(false)
    }
  }

  async function remove(imageId) {
    if (
      busy ||
      !window.confirm('Delete this product photo?')
    ) {
      return
    }

    setBusy(true)
    setError('')
    setNotice('')

    try {
      await request(storeId, productId, 'DELETE', {
        storeId,
        productId,
        imageId,
      })

      await refresh()

      setNotice('Photo deleted.')
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  const remaining = Math.max(
    0,
    MAX_IMAGES - images.length
  )

  return (
    <section className="space-y-5 rounded-2xl border border-neutral-700 bg-neutral-900 p-4 text-white sm:p-6">

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold">
            Manage Product Photos
          </h3>

          <p className="mt-1 text-sm text-neutral-400">
            {productName}
          </p>

          <p className="mt-2 text-xs text-neutral-400">
            {images.length} of {MAX_IMAGES} photos uploaded
          </p>
        </div>

        <button
          type="button"
          className={button}
          disabled={busy}
          onClick={() => onClose?.()}
        >
          Close
        </button>
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-xl border border-red-800 bg-red-950/40 p-3 text-sm text-red-300"
        >
          {error}
        </p>
      )}

      {notice && (
        <p
          role="status"
          className="rounded-xl border border-emerald-800 bg-emerald-950/30 p-3 text-sm text-emerald-300"
        >
          {notice}
        </p>
      )}

      <form
        onSubmit={upload}
        className="space-y-4 rounded-xl border border-neutral-800 bg-neutral-950 p-4"
      >
        <div>
          <label
            htmlFor="product-photos"
            className="mb-2 block text-sm font-semibold"
          >
            Select product photographs
          </label>

          <input
            ref={inputRef}
            id="product-photos"
            type="file"
            multiple
            accept="image/jpeg,image/png,image/webp"
            disabled={busy || remaining === 0}
            onChange={chooseFiles}
            className="w-full rounded-xl border border-neutral-700 bg-neutral-900 p-3 text-sm"
          />

          <p className="mt-2 text-xs text-neutral-400">
            Select multiple photos at once. JPG, PNG or
            WebP, maximum 5 MB each. {remaining} slots
            remaining.
          </p>
        </div>

        <div>
          <label
            htmlFor="product-photo-description"
            className="mb-2 block text-sm font-semibold"
          >
            Photo description
          </label>

          <input
            id="product-photo-description"
            type="text"
            maxLength={200}
            value={alt}
            disabled={busy}
            onChange={event => setAlt(event.target.value)}
            placeholder="Describe the product"
            className="w-full rounded-xl border border-neutral-700 bg-neutral-900 px-4 py-3 text-sm outline-none"
          />
        </div>

        {!!previews.length && (
          <div>
            <p className="mb-3 text-sm font-semibold">
              Selected photos
            </p>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {previews.map((item, index) => (
                <div
                  key={`${item.key}-${index}`}
                  className="rounded-xl border border-neutral-700 p-2"
                >
                  <img
                    src={item.url}
                    alt={item.name}
                    className="aspect-square w-full rounded-lg object-contain"
                  />

                  <p className="mt-2 truncate text-xs text-neutral-400">
                    {item.name}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        <button
          type="submit"
          disabled={
            busy ||
            !files.length ||
            remaining < files.length
          }
          className="w-full rounded-xl bg-red-600 px-4 py-3 font-bold text-white hover:bg-red-500 disabled:opacity-40"
        >
          {busy
            ? progress || 'Uploading…'
            : `Upload ${files.length || ''} Photo${files.length === 1 ? '' : 's'}`}
        </button>
      </form>

      <div>
        <h4 className="mb-3 text-lg font-bold">
          Uploaded Photos
        </h4>

        {loading && (
          <p className="text-sm text-neutral-400">
            Loading photos…
          </p>
        )}

        {!loading && !images.length && (
          <p className="rounded-xl border border-neutral-800 p-5 text-sm text-neutral-400">
            No product photographs uploaded yet.
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {images.map((item, index) => (
            <article
              key={item.id}
              className="space-y-2 rounded-xl border border-neutral-700 bg-neutral-950 p-2"
            >
              <div className="relative">
                <img
                  src={item.url}
                  alt={item.alt || productName}
                  className="aspect-square w-full rounded-lg object-contain"
                />

                {index === 0 && (
                  <span className="absolute left-2 top-2 rounded-lg bg-emerald-700 px-2 py-1 text-xs font-bold text-white">
                    Main Photo
                  </span>
                )}
              </div>

              <p className="truncate text-xs text-neutral-400">
                {item.alt || productName}
              </p>

              <button
                type="button"
                disabled={busy}
                onClick={() => remove(item.id)}
                className="w-full rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-xs font-semibold text-red-300 hover:bg-red-950 disabled:opacity-40"
              >
                Delete
              </button>
            </article>
          ))}
        </div>
      </div>

      <p className="border-t border-neutral-800 pt-4 text-xs leading-5 text-neutral-500">
        The first image returned by the product-images API
        is treated as the main photograph. Additional
        photographs form the product gallery.
      </p>
    </section>
  )
}
