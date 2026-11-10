
import { NextResponse } from 'next/server'
import { getAdminSupabase } from '@/lib/server/adminSupabase'
import {
  MOBILE_THEME_MAP,
  getDefaultMobileTheme,
  normalizeCategory,
} from '@/lib/ecommerce/mobileThemes'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const TEMPLATES = [
  'fashion',
  'pickles',
  'grocery',
  'electronics',
  'general',
]

const ACCENTS = [
  'rose',
  'green',
  'orange',
  'blue',
]

const MAX_PROMOTIONS = 20

const PROMOTION_COLUMNS = [
  'id',
  'store_id',
  'title',
  'subtitle',
  'badge_text',
  'image_url',
  'button_text',
  'destination_path',
  'is_active',
  'sort_order',
  'starts_at',
  'ends_at',
  'created_at',
  'updated_at',
].join(',')

const json = (body, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
    },
  })

const fail = (message, status = 400) =>
  json(
    {
      success: false,
      message,
    },
    status
  )

function canEdit(store) {
  return (
    store?.approval_status === 'approved' &&
    store?.is_active === true
  )
}

async function authorize(request, storeId) {
  if (!UUID.test(storeId || '')) {
    return {
      response: fail('Invalid website ID.'),
    }
  }

  const match = /^Bearer\s+([^\s]+)$/i.exec(
    request.headers.get('authorization') || ''
  )

  if (!match) {
    return {
      response: fail(
        'Sign in to your owner account.',
        401
      ),
    }
  }

  const admin = getAdminSupabase()

  const {
    data: auth,
    error: authError,
  } = await admin.auth.getUser(match[1])

  if (authError || !auth?.user?.id) {
    return {
      response: fail('Session expired.', 401),
    }
  }

  const {
    data: member,
    error: memberError,
  } = await admin
    .from('ecommerce_store_members')
    .select('store_id')
    .eq('store_id', storeId)
    .eq('user_id', auth.user.id)
    .eq('role', 'owner')
    .maybeSingle()

  if (memberError) {
    throw memberError
  }

  if (!member) {
    return {
      response: fail(
        'This website is not assigned to your owner account.',
        403
      ),
    }
  }

  const {
    data: store,
    error: storeError,
  } = await admin
    .from('ecommerce_stores')
    .select(
      'id,name,slug,category,approval_status,is_active'
    )
    .eq('id', storeId)
    .maybeSingle()

  if (storeError) {
    throw storeError
  }

  if (!store) {
    return {
      response: fail('Website not found.', 404),
    }
  }

  return {
    admin,
    userId: auth.user.id,
    store,
  }
}

function defaultTemplate(category) {
  const normalized = normalizeCategory(category)

  return TEMPLATES.includes(normalized)
    ? normalized
    : 'general'
}

function validString(value, max, required = false) {
  if (typeof value !== 'string') {
    if (!required && (value === null || value === undefined)) {
      return ''
    }

    throw new Error('Invalid text field.')
  }

  const text = value.trim()

  if (text.length > max || (required && !text)) {
    throw new Error(
      `Text must contain ${required ? '1 to ' : 'at most '}${max} characters.`
    )
  }

  return text
}

function validateDate(value, label) {
  if (value === null || value === undefined || value === '') {
    return null
  }

  if (typeof value !== 'string') {
    throw new Error(`Invalid ${label}.`)
  }

  const date = new Date(value)

  if (!Number.isFinite(date.getTime())) {
    throw new Error(`Invalid ${label}.`)
  }

  return date.toISOString()
}

function validatePromotion(input, store) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input)
  ) {
    throw new Error('Invalid promotion details.')
  }

  const title = validString(input.title, 100, true)
  const subtitle = validString(input.subtitle, 240)
  const badgeText = validString(input.badgeText, 50)
  const buttonText = validString(
    input.buttonText ?? 'Shop Now',
    40,
    true
  )
  const imageUrl = validString(input.imageUrl, 2000)
  const destinationPath = validString(
    input.destinationPath,
    300
  )

  if (imageUrl) {
    let url

    try {
      url = new URL(imageUrl)
    } catch {
      throw new Error('Enter a valid HTTPS banner image URL.')
    }

    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      !url.hostname
    ) {
      throw new Error(
        'Banner images must use a valid HTTPS URL.'
      )
    }
  }

  const storePath = `/shop/${store.slug}`

  if (destinationPath) {
    if (
      !destinationPath.startsWith('/') ||
      destinationPath.startsWith('//') ||
      destinationPath.includes('\\') ||
      destinationPath.includes('?') ||
      destinationPath.includes('#') ||
      destinationPath.includes('%') ||
      destinationPath.includes('..') ||
      !(
        destinationPath === storePath ||
        destinationPath.startsWith(`${storePath}/`)
      )
    ) {
      throw new Error(
        'Offer links must remain within your own store.'
      )
    }
  }

  if (typeof input.isActive !== 'boolean') {
    throw new Error('Invalid promotion active status.')
  }

  const startsAt = validateDate(
    input.startsAt,
    'start date'
  )

  const endsAt = validateDate(
    input.endsAt,
    'end date'
  )

  if (
    startsAt &&
    endsAt &&
    new Date(endsAt) <= new Date(startsAt)
  ) {
    throw new Error(
      'Promotion end date must be after its start date.'
    )
  }

  const sortOrder = input.sortOrder ?? 0

  if (
    !Number.isInteger(sortOrder) ||
    sortOrder < 0 ||
    sortOrder > 10000
  ) {
    throw new Error('Invalid promotion display order.')
  }

  return {
    store_id: store.id,
    title,
    subtitle,
    badge_text: badgeText,
    button_text: buttonText,
    image_url: imageUrl || null,
    destination_path: destinationPath,
    is_active: input.isActive,
    sort_order: sortOrder,
    starts_at: startsAt,
    ends_at: endsAt,
    updated_at: new Date().toISOString(),
  }
}

async function saveDesign(access, body) {
  const {
    admin,
    store,
    userId,
  } = access

  let templateKey = body.templateKey
  let mobileThemeKey = body.mobileThemeKey

  if (
    mobileThemeKey !== undefined &&
    mobileThemeKey !== null
  ) {
    if (
      typeof mobileThemeKey !== 'string' ||
      !Object.prototype.hasOwnProperty.call(
        MOBILE_THEME_MAP,
        mobileThemeKey
      )
    ) {
      return fail('Select a supported mobile theme.')
    }

    const theme = MOBILE_THEME_MAP[mobileThemeKey]

    // A theme is selected from the website's business
    // category. This prevents unrelated category themes.
    const storeCategory = normalizeCategory(
      store.category
    )

    if (
      storeCategory !== 'general' &&
      theme.category !== storeCategory
    ) {
      return fail(
        'Choose a mobile theme for your website category.'
      )
    }

    templateKey = theme.category === 'toys'
      ? 'general'
      : theme.category
  } else {
    // Backward compatibility with the existing owner
    // component, which sends templateKey + accentKey.
    if (!TEMPLATES.includes(templateKey)) {
      return fail('Select a supported website template.')
    }

    const {
      data: existing,
      error: existingError,
    } = await admin
      .from('ecommerce_storefront_designs')
      .select('mobile_theme_key')
      .eq('store_id', store.id)
      .maybeSingle()

    if (existingError) throw existingError

    const existingTheme =
      MOBILE_THEME_MAP[existing?.mobile_theme_key]

    mobileThemeKey =
      existingTheme?.category === templateKey ||
      (templateKey === 'general' &&
        existingTheme?.category === 'toys')
        ? existingTheme.key
        : getDefaultMobileTheme(templateKey)
  }

  if (!ACCENTS.includes(body.accentKey)) {
    return fail('Select a supported accent color.')
  }

  const {
    data,
    error,
  } = await admin
    .from('ecommerce_storefront_designs')
    .upsert(
      {
        store_id: store.id,
        template_key: templateKey,
        accent_key: body.accentKey,
        mobile_theme_key: mobileThemeKey,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      {
        onConflict: 'store_id',
      }
    )
    .select(
      'template_key,accent_key,mobile_theme_key,updated_at'
    )
    .single()

  if (error) throw error

  return json({
    success: true,
    design: data,
    message: 'Website design saved successfully.',
  })
}

async function savePromotion(access, body) {
  const { admin, store } = access

  let promotion

  try {
    promotion = validatePromotion(
      body.promotion,
      store
    )
  } catch (error) {
    return fail(error.message)
  }

  let result

  if (body.promotionId) {
    if (!UUID.test(body.promotionId)) {
      return fail('Invalid promotion ID.')
    }

    result = await admin
      .from('ecommerce_storefront_promotions')
      .update(promotion)
      .eq('id', body.promotionId)
      .eq('store_id', store.id)
      .select(PROMOTION_COLUMNS)
      .maybeSingle()
  } else {
    const {
      count,
      error: countError,
    } = await admin
      .from('ecommerce_storefront_promotions')
      .select('id', {
        count: 'exact',
        head: true,
      })
      .eq('store_id', store.id)

    if (countError) throw countError

    if ((count || 0) >= MAX_PROMOTIONS) {
      return fail(
        `Maximum ${MAX_PROMOTIONS} promotions per website.`
      )
    }

    result = await admin
      .from('ecommerce_storefront_promotions')
      .insert(promotion)
      .select(PROMOTION_COLUMNS)
      .single()
  }

  if (result.error) throw result.error

  if (!result.data) {
    return fail('Promotion not found.', 404)
  }

  return json({
    success: true,
    promotion: result.data,
    message: 'Homepage promotion saved successfully.',
  })
}

async function deletePromotion(access, body) {
  if (!UUID.test(body.promotionId || '')) {
    return fail('Invalid promotion ID.')
  }

  const {
    data,
    error,
  } = await access.admin
    .from('ecommerce_storefront_promotions')
    .delete()
    .eq('id', body.promotionId)
    .eq('store_id', access.store.id)
    .select('id')
    .maybeSingle()

  if (error) throw error

  if (!data) {
    return fail('Promotion not found.', 404)
  }

  return json({
    success: true,
    message: 'Promotion deleted successfully.',
  })
}

export async function GET(request) {
  try {
    const storeId = new URL(request.url)
      .searchParams.get('storeId')

    const access = await authorize(request, storeId)

    if (access.response) {
      return access.response
    }

    const [designResult, promotionsResult] =
      await Promise.all([
        access.admin
          .from('ecommerce_storefront_designs')
          .select(
            'template_key,accent_key,mobile_theme_key,updated_at'
          )
          .eq('store_id', storeId)
          .maybeSingle(),

        access.admin
          .from('ecommerce_storefront_promotions')
          .select(PROMOTION_COLUMNS)
          .eq('store_id', storeId)
          .order('sort_order', {
            ascending: true,
          })
          .order('created_at', {
            ascending: false,
          })
          .limit(MAX_PROMOTIONS),
      ])

    if (designResult.error) {
      throw designResult.error
    }

    if (promotionsResult.error) {
      throw promotionsResult.error
    }

    const defaultKey = defaultTemplate(
      access.store.category
    )

    const design = designResult.data || {
      template_key: defaultKey,
      accent_key: 'rose',
      mobile_theme_key: getDefaultMobileTheme(
        access.store.category
      ),
      updated_at: null,
    }

    return json({
      success: true,
      store: access.store,
      design: {
        ...design,
        mobile_theme_key:
          design.mobile_theme_key ||
          getDefaultMobileTheme(
            access.store.category
          ),
      },
      promotions: promotionsResult.data || [],
      saved: Boolean(designResult.data),
      canEdit: canEdit(access.store),
    })
  } catch (error) {
    console.error(
      '[WEBSITE DESIGN GET]',
      error
    )

    return fail(
      'Unable to load website design. Check that the required migrations are installed.',
      500
    )
  }
}

export async function PATCH(request) {
  try {
    const body = await request
      .json()
      .catch(() => null)

    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body)
    ) {
      return fail('Invalid request body.')
    }

    const access = await authorize(
      request,
      body.storeId
    )

    if (access.response) {
      return access.response
    }

    if (!canEdit(access.store)) {
      return fail(
        'Only approved and active websites can update their design.',
        403
      )
    }

    const action = body.action || 'design'

    if (action === 'design') {
      return saveDesign(access, body)
    }

    if (action === 'promotion') {
      return savePromotion(access, body)
    }

    if (action === 'deletePromotion') {
      return deletePromotion(access, body)
    }

    return fail('Unsupported website design action.')
  } catch (error) {
    console.error(
      '[WEBSITE DESIGN PATCH]',
      error
    )

    return fail(
      'Unable to save website design.',
      500
    )
  }
}
