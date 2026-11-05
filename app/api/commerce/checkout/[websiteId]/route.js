import { uuid } from '@/lib/server/commerce/validation'
import { checkoutRpc, expandedCheckoutSchema } from '@/lib/server/commerce/expansion'
import { CommerceError, parse, readJson, requireSameOrigin, run, userContext } from '@/lib/server/commerce/core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request, context) {
  return run(async () => {
    requireSameOrigin(request)
    const { client } = await userContext(request)
    const { websiteId } = await context.params
    const id = parse(uuid, websiteId)
    const payload = parse(expandedCheckoutSchema, await readJson(request))
    const result = await checkoutRpc(client, id, payload)
    if (!uuid.safeParse(result?.order?.id).success || !Array.isArray(result?.items)) {
      throw new CommerceError('The order response could not be verified. Retry with the same checkout attempt.', 503)
    }
    return { order: result.order, items: result.items }
  }, 201)
}
