import { uuid } from '@/lib/server/commerce/validation'
import { can, CommerceError, ownerContext, parse, run } from '@/lib/server/commerce/core'
import { optionalCommerceRpc } from '@/lib/server/commerce/expansion'
import { paymentRollout } from '@/lib/server/commerce/payments'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request, context) {
  return run(async () => {
    const { websiteId } = await context.params
    const { client, website } = await ownerContext(request, parse(uuid, websiteId))
    if (!can(website, 'orders')) throw new CommerceError('Order management permission is required.', 403)
    const result = await optionalCommerceRpc(client, 'commerce_payment_readiness', { p_website_id: website.id })
    const rollout = paymentRollout()
    if (!result.available) return { available: false, readiness: null, rollout, status: 'unavailable', blocked_reason: null }
    const raw = result.data
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || typeof raw.configured !== 'boolean' || typeof raw.merchant_enabled !== 'boolean' || (raw.configured ? !['test', 'live'].includes(raw.mode) : raw.merchant_enabled || raw.mode != null)) throw new CommerceError('Payment configuration status could not be verified. Refresh or contact the platform team.', 503)
    const readiness = { configured: raw.configured, merchant_enabled: raw.merchant_enabled, mode: raw.configured ? raw.mode : null }
    const storeAcceptsOrders = website.status === 'active' && website.business_type !== 'pharmacy' && website.features?.catalog === true && (website.fulfillment?.pickup === true || website.fulfillment?.delivery === true)
    const blockedReason = !rollout.enabled ? 'platform_disabled' : !readiness.merchant_enabled ? 'merchant_disabled' : readiness.mode === 'live' && !rollout.live_allowed ? 'live_mode_not_allowed' : !storeAcceptsOrders ? 'store_unavailable' : null
    const status = !readiness.configured ? 'not_configured' : blockedReason ? 'disabled' : readiness.mode === 'test' ? 'test' : 'available'
    return { available: true, readiness, rollout, status, blocked_reason: readiness.configured ? blockedReason : null }
  })
}
