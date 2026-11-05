import { z } from 'zod'
import { CommerceError } from './core'
import { optionalCommerceRpc } from './expansion'
import { uuid } from './validation'

const receipt = z.object({ id: uuid, state: z.enum(['captured_unfulfilled', 'fulfilled']), order_id: uuid.nullable(), reconciliation_code: z.string().max(100).nullable() })
const intent = z.object({
  id: uuid, website_id: uuid, cart_key: uuid,
  state: z.enum(['new', 'creating', 'provider_unknown', 'ready', 'captured_unfulfilled']),
  amount_paise: z.number().int().min(1).max(1000000000000), currency: z.literal('INR'), mode: z.enum(['test', 'live']),
  provider_order_id: z.string().regex(/^order_[A-Za-z0-9]{4,100}$/).nullable(),
  created_at: z.string().datetime({ offset: true }), receipt: receipt.nullable(),
})
const queue = z.object({ website_id: uuid, intents: z.array(intent).max(100), total_count: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER), has_more: z.boolean() })

export async function paymentRecoveryQueue(client, websiteId) {
  const response = await optionalCommerceRpc(client, 'commerce_payment_reconciliation_queue', { p_website_id: websiteId })
  if (!response.available) return { available: false, website_id: websiteId, intents: [], total_count: null, has_more: false }
  const parsed = queue.safeParse(response.data)
  if (!parsed.success || parsed.data.website_id !== websiteId || parsed.data.intents.some(row => row.website_id !== websiteId) || new Set(parsed.data.intents.map(row => row.id)).size !== parsed.data.intents.length || parsed.data.intents.length !== Math.min(parsed.data.total_count, 100) || parsed.data.has_more !== (parsed.data.total_count > 100)) throw new CommerceError('The payment recovery queue could not be verified. Please refresh before taking action.', 503)
  return { available: true, ...parsed.data }
}
