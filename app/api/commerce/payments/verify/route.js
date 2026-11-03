import { paymentVerifySchema, verifyPayment } from '@/lib/server/commerce/payments'
import { parse, readJson, requireSameOrigin, run, userContext } from '@/lib/server/commerce/core'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function POST(request) {
  return run(async () => {
    requireSameOrigin(request)
    const { client, user } = await userContext(request)
    return { payment: await verifyPayment(client, user, parse(paymentVerifySchema, await readJson(request))) }
  })
}
