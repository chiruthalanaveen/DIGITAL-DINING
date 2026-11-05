import { paymentRollout, paymentStatus, paymentStatusSchema, reconcilePayment, resumePayment } from '@/lib/server/commerce/payments'
import { parse, readJson, requireSameOrigin, run, userContext } from '@/lib/server/commerce/core'
import { uuid } from '@/lib/server/commerce/validation'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function GET(request) {
  return run(async () => {
    const { client } = await userContext(request)
    return { payment: await paymentStatus(client, parse(uuid, new URL(request.url).searchParams.get('intent_id'))), rollout: paymentRollout() }
  })
}
export async function POST(request) {
  return run(async () => {
    requireSameOrigin(request)
    const { client, user } = await userContext(request)
    const { intent_id: id, resume } = parse(paymentStatusSchema, await readJson(request))
    if (resume) return resumePayment(client, user, id)
    const original = await paymentStatus(client, id)
    if (original.state === 'fulfilled' || !original.provider_order_id) return { payment: original, reconciliation_required: ['creating','provider_unknown','captured_unfulfilled'].includes(original.state) }
    const result = await reconcilePayment(id, { buyerId: user.id })
    return { ...result, payment: result.payment || await paymentStatus(client, id) }
  })
}
