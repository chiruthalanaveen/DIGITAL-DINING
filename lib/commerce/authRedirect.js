const CALLBACK_PATH = '/auth/callback/commerce'
const STORE_SLUG = /^[a-z0-9][a-z0-9-]{0,78}[a-z0-9]$/
const INVALID_CONTEXT = 'Invalid commerce authentication context.'

function validSlug(value) {
  return typeof value === 'string' && value.trim() === value && STORE_SLUG.test(value)
}

function single(params, name) {
  const values = params.getAll(name)
  if (!Array.isArray(values) || values.length > 1) throw new Error(INVALID_CONTEXT)
  return values.length ? values[0] : null
}

/** Keep commerce email links under the existing allowed callback prefix. */
export function commerceEmailRedirect(origin, options = {}) {
  if (typeof origin !== 'string' || /[\s\\]/.test(origin) ||
      !options || typeof options !== 'object' || Array.isArray(options)) {
    throw new Error(INVALID_CONTEXT)
  }
  let base
  try { base = new URL(origin) } catch { throw new Error(INVALID_CONTEXT) }
  if (!['http:', 'https:'].includes(base.protocol) || base.username || base.password ||
      base.pathname !== '/' || base.search || base.hash) {
    throw new Error(INVALID_CONTEXT)
  }
  const { audience, slug, recovery } = options
  if (!['owner', 'customer'].includes(audience) ||
      (recovery !== undefined && typeof recovery !== 'boolean') ||
      (audience === 'customer' ? !validSlug(slug) : slug !== undefined)) {
    throw new Error(INVALID_CONTEXT)
  }
  const callback = new URL(CALLBACK_PATH, base.origin)
  callback.searchParams.set('audience', audience)
  if (audience === 'customer') callback.searchParams.set('store', slug)
  if (recovery) callback.searchParams.set('recovery', '1')
  return callback.toString()
}

/** Return only fixed application paths and a validated, isolated client scope. */
export function parseCommerceCallback(searchParams) {
  try {
    const params = typeof searchParams === 'string' ? new URLSearchParams(searchParams) : searchParams
    if (!params || typeof params.getAll !== 'function') return null
    // Provider failures and caller-chosen redirects/scopes must never become a
    // successful callback. SDK metadata, including sb_flow_id, is left intact.
    for (const name of ['error', 'error_code', 'error_description', 'next', 'scope', 'redirect_to', 'redirectTo']) {
      if (params.getAll(name).length) return null
    }
    const audience = single(params, 'audience')
    const store = single(params, 'store')
    const recovery = single(params, 'recovery')
    if (!['owner', 'customer'].includes(audience) || (recovery !== null && recovery !== '1')) return null
    if (audience === 'owner') {
      if (store !== null) return null
      return {
        scope: 'owner',
        destination: recovery === '1' ? '/commerce/auth?recovery=1' : '/commerce/apply',
        signInPath: '/commerce/auth',
      }
    }
    if (!validSlug(store)) return null
    const account = `/shops/${store}/account`
    return {
      scope: `customer:${store}`,
      destination: recovery === '1' ? `${account}?recovery=1` : account,
      signInPath: account,
    }
  } catch {
    return null
  }
}
