import { parse, readJson, requireSameOrigin, run, userContext } from '@/lib/server/commerce/core'
import { paymentAttemptControl, paymentAttemptSchema } from '@/lib/server/commerce/payment-attempt-control'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request) {
  return run(async () => {
    requireSameOrigin(request)
    const { client } = await userContext(request)
    const body = parse(paymentAttemptSchema, await readJson(request))
    return paymentAttemptControl(client, body.website_id, body.cart_key, body.action, body.intent_id)
  })
}
