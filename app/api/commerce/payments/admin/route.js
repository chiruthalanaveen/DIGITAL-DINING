import { configurePaymentMerchant, paymentAdminSchema, paymentRollout } from '@/lib/server/commerce/payments'
import { adminContext, dataResult, parse, readJson, run } from '@/lib/server/commerce/core'
import { uuid } from '@/lib/server/commerce/validation'
import { paymentRecoveryQueue } from '@/lib/server/commerce/payment-recovery'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(request) {
  return run(async () => {
    const { client } = adminContext(request)
    const id = parse(uuid, new URL(request.url).searchParams.get('website_id')).toLowerCase()
    const [readiness, recovery] = await Promise.all([
      dataResult(client.rpc('commerce_payment_admin', { p_website_id: id, p_action: 'readiness', p_payload: {} })),
      paymentRecoveryQueue(client, id),
    ])
    return { readiness, recovery, rollout: paymentRollout() }
  })
}
export async function POST(request) {
  return run(async () => {
    const { client, session } = adminContext(request, true)
    return configurePaymentMerchant(client, session, parse(paymentAdminSchema, await readJson(request)))
  })
}
