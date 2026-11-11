
'use client'

import { useCallback, useEffect, useState } from 'react'

const PREFIX = 'digital-dine:ecommerce-cart:v1:'
const MAX_LINES = 100
const MAX_QUANTITY = 999

function normalizeCart(value) {
  if (!Array.isArray(value)) return []

  const seen = new Set()
  const result = []

  for (const item of value) {
    if (!item || typeof item.variantId !== 'string') continue

    const variantId = item.variantId.trim()
    const quantity = Number(item.quantity)

    if (
      !variantId ||
      variantId.length > 150 ||
      seen.has(variantId) ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1
    ) {
      continue
    }

    seen.add(variantId)
    result.push({
      variantId,
      quantity: Math.min(quantity, MAX_QUANTITY),
    })

    if (result.length >= MAX_LINES) break
  }

  return result
}

function storageKey(slug) {
  return `${PREFIX}${encodeURIComponent(slug)}`
}

export default function useStorefrontCart(slug) {
  const [state, setState] = useState({
    slug: '',
    cart: [],
    loaded: false,
  })

  useEffect(() => {
    if (!slug) return

    let saved = []

    try {
      const raw = window.localStorage.getItem(storageKey(slug))

      if (raw) {
        saved = normalizeCart(JSON.parse(raw))
      }
    } catch {
      saved = []
    }

    setState({
      slug,
      cart: saved,
      loaded: true,
    })
  }, [slug])

  const setCart = useCallback((updater) => {
    setState(previous => {
      if (!previous.loaded || previous.slug !== slug) {
        return previous
      }

      const next = typeof updater === 'function'
        ? updater(previous.cart)
        : updater

      return {
        ...previous,
        cart: normalizeCart(next),
      }
    })
  }, [slug])

  useEffect(() => {
    if (!slug || !state.loaded || state.slug !== slug) return

    try {
      window.localStorage.setItem(
        storageKey(slug),
        JSON.stringify(state.cart)
      )
    } catch {
      // Cart still works in memory if storage is unavailable.
    }
  }, [slug, state])

  return {
    cart: state.slug === slug && state.loaded
      ? state.cart
      : [],
    setCart,
    cartLoaded: state.loaded && state.slug === slug,
  }
}
