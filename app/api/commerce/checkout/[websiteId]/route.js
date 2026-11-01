import { checkoutSchema, uuid } from '@/lib/server/commerce/validation'
import { CommerceError, dataResult, parse, readJson, requireSameOrigin, run, userContext } from '@/lib/server/commerce/core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request, context) {
  return run(async () => {
    requireSameOrigin(request)
    const { client } = await userContext(request)
    const { websiteId } = await context.params
    const id = parse(uuid, websiteId)
    const payload = parse(checkoutSchema, await readJson(request))
    const result = await dataResult(client.rpc('commerce_create_cod_order', {
      p_website_id: id, p_items: payload.items, p_customer: payload.customer,
      p_fulfillment: payload.fulfillment_method, p_idempotency_key: payload.idempotency_key,
    }))
    if (!uuid.safeParse(result?.order?.id).success || !Array.isArray(result?.items)) {
      throw new CommerceError('The order response could not be verified. Retry with the same checkout attempt.', 503)
    }
    return { order: result.order, items: result.items }
  }, 201)
}
