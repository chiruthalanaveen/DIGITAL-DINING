import { processPaymentWebhook } from '@/lib/server/commerce/payments'
import { run } from '@/lib/server/commerce/core'
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export async function POST(request) {
  return run(() => processPaymentWebhook(request))
}
