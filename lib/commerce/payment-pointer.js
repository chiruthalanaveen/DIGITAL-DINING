const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const changedMessage = 'The saved checkout changed in another tab. Refresh to open the current checkout before paying again.'
const changed = () => { const error = new Error(changedMessage); error.code = 'COMMERCE_ATTEMPT_CHANGED'; throw error }
const validId = value => typeof value === 'string' && uuid.test(value)

function checkedPointer(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !validId(value.cart_key) || value.intent_id !== null && !validId(value.intent_id)) changed()
  return { cart_key: value.cart_key, intent_id: value.intent_id }
}

function storedPointer(storage, storageKey) {
  const raw = storage.getItem(storageKey)
  if (raw === null) return null
  let value
  try { value = JSON.parse(raw) } catch { changed() }
  return checkedPointer(value)
}

/** Every cooperating tab checks and changes this account/store pointer in one lock. */
export async function mutatePaymentPointer({ storageKey, cartKey, intentId = null, operation, next = null, isCurrent, storage = globalThis.localStorage, locks = globalThis.navigator?.locks }) {
  // A compare-then-write fallback cannot exclude a second tab between its steps.
  if (!locks || typeof locks.request !== 'function') throw new Error('Online payment requires a secure browser with checkout locking. Open this store in a supported browser before paying again.')
  return locks.request(`commerce-payment-pointer:${storageKey}`, { mode: 'exclusive' }, () => {
    if (!isCurrent()) return { applied: false, pointer: null }
    if (typeof storageKey !== 'string' || !storageKey || !validId(cartKey) || intentId !== null && !validId(intentId) || !['create', 'write', 'remove', 'read'].includes(operation)) changed()
    if (!storage || typeof storage.getItem !== 'function') throw new Error('The saved checkout could not be accessed. Allow browser storage and check this payment before continuing.')
    const existing = storedPointer(storage, storageKey)
    if (existing && (existing.cart_key !== cartKey || existing.intent_id && intentId && existing.intent_id !== intentId)) changed()
    if (!existing && (operation === 'write' || operation === 'read')) changed()
    if (operation === 'read') return { applied: true, pointer: existing }
    if (operation === 'remove') {
      if (!isCurrent()) return { applied: false, pointer: null }
      if (existing) storage.removeItem(storageKey)
      return { applied: true, pointer: null }
    }
    const requested = checkedPointer(next ?? (operation === 'create' ? { cart_key: cartKey, intent_id: intentId } : null))
    if (requested.cart_key !== cartKey || requested.intent_id && intentId && requested.intent_id !== intentId || existing?.intent_id && requested.intent_id && existing.intent_id !== requested.intent_id) changed()
    // Creation never replaces an existing pointer, and a write cannot erase an
    // already recovered intent ID by replaying its original pending pointer.
    const pointer = existing && (operation === 'create' || !requested.intent_id && existing.intent_id) ? existing : requested
    if (!isCurrent()) return { applied: false, pointer: null }
    if (!existing || pointer.cart_key !== existing.cart_key || pointer.intent_id !== existing.intent_id) storage.setItem(storageKey, JSON.stringify(pointer))
    return { applied: true, pointer }
  })
}
