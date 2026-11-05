import { CommerceError, dataResult, parse, readJson, requireSameOrigin, run, userContext } from '@/lib/server/commerce/core'
import { checkedCheckoutQuote, onlineQuoteSchema } from '@/lib/server/commerce/expansion'
import { paymentRollout } from '@/lib/server/commerce/payments'
import { uuid } from '@/lib/server/commerce/validation'
import { z } from 'zod'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const schema = z.object({ website_id: uuid, checkout: onlineQuoteSchema }).strict()

export async function POST(request) {
  return run(async () => {
    requireSameOrigin(request)
    const { client } = await userContext(request)
    if (!paymentRollout().enabled) throw new CommerceError('Online store payments are currently disabled.', 503)
    const { website_id: websiteId, checkout } = parse(schema, await readJson(request))
    const quote = await dataResult(client.rpc('commerce_payment_quote', { p_website_id: websiteId, p_items: checkout.items, p_customer: checkout.customer, p_fulfillment: checkout.fulfillment_method, p_coupon_code: checkout.coupon_code || '' }))
    return { quote: checkedCheckoutQuote(quote) }
  })
}
