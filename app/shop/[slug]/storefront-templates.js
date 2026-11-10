
export const STORE_TEMPLATES = {
  fashion: {
    eyebrow:
      'NEW SEASON · EVERYDAY STYLE',

    description:
      'Discover looks you love. Explore the latest styles, sizes and colours.',

    catalogTitle:
      'Shop the collection',
  },

  pickles: {
    eyebrow:
      'TRADITIONAL TASTE · MADE WITH CARE',

    description:
      'Explore our range of flavourful pickles and homemade favourites.',

    catalogTitle:
      'Shop our pickles',
  },

  grocery: {
    eyebrow:
      'FRESH PICKS · DAILY ESSENTIALS',

    description:
      'Find everyday essentials, pantry favourites and more.',

    catalogTitle:
      'Shop essentials',
  },

  electronics: {
    eyebrow:
      'TECH · EVERYDAY INNOVATION',

    description:
      'Discover useful technology and accessories for daily life.',

    catalogTitle:
      'Explore electronics',
  },

  general: {
    eyebrow:
      'WELCOME TO OUR STORE',

    description:
      'Explore products, compare prices and find your favourites.',

    catalogTitle:
      'Explore products',
  },
}

export function resolveStoreTemplate(store) {
  const explicit =
    String(
      store?.storefront_template ||
      store?.template_key ||
      ''
    )
      .toLowerCase()
      .trim()

  if (
    Object.hasOwn(
      STORE_TEMPLATES,
      explicit
    )
  ) {
    return explicit
  }

  const category =
    String(store?.category || '')
      .toLowerCase()

  if (
    /cloth|fashion|apparel|saree|textile|garment|boutique/.test(
      category
    )
  ) {
    return 'fashion'
  }

  if (
    /pickle|homemade|homely|achar|food/.test(
      category
    )
  ) {
    return 'pickles'
  }

  if (
    /grocery|vegetable|daily|supermarket|kirana/.test(
      category
    )
  ) {
    return 'grocery'
  }

  if (
    /electronic|mobile|computer|gadget|accessor/.test(
      category
    )
  ) {
    return 'electronics'
  }

  return 'general'
}