import { uuid } from '@/lib/server/commerce/validation'
import { dataResult, parse, readJson, requireSameOrigin, run, userContext } from '@/lib/server/commerce/core'
import { checkedCheckoutQuote, quoteSchema } from '@/lib/server/commerce/expansion'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function POST(request, context) {
  return run(async () => {
    requireSameOrigin(request)
    const { client } = await userContext(request)
    const { websiteId } = await context.params
    const payload = parse(quoteSchema, await readJson(request))
    const quote = await dataResult(client.rpc('commerce_checkout_quote_v2', { p_website_id: parse(uuid, websiteId), p_items: payload.items, p_customer: payload.customer, p_fulfillment: payload.fulfillment_method, p_coupon_code: payload.coupon_code || '' }))
    return { quote: checkedCheckoutQuote(quote) }
  })
}
