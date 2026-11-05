import { z } from 'zod'
import { CommerceError, dataResult } from './core'
import { uuid } from './validation'

export const notificationAction = z.discriminatedUnion('action', [
  z.object({ action: z.literal('process'), payload: z.object({ limit: z.number().int().min(1).max(25).optional() }).strict() }).strict(),
  z.object({ action: z.literal('retry'), payload: z.object({ id: uuid }).strict() }).strict(),
])

// These server-only flags require separately verified provider configuration.
// Missing/partial configuration never claims work and never opens a connection.
export function notificationConfiguration(env = process.env) {
  const from = env.COMMERCE_NOTIFICATION_FROM || ''
  const enabled = env.COMMERCE_NOTIFICATIONS_ENABLED === 'true' &&
    env.COMMERCE_NOTIFICATION_PROVIDER === 'resend' &&
    env.COMMERCE_NOTIFICATION_SENDER_VERIFIED === 'true' &&
    /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(from) && from.length <= 254 &&
    typeof env.COMMERCE_NOTIFICATION_API_KEY === 'string' && env.COMMERCE_NOTIFICATION_API_KEY.length >= 10
  return { enabled: Boolean(enabled), provider: 'resend', from, apiKey: env.COMMERCE_NOTIFICATION_API_KEY || '' }
}

export async function sendCommerceNotification(job, { configuration = notificationConfiguration(), fetchImpl = fetch } = {}) {
  if (!configuration.enabled) throw new CommerceError('Notification delivery is disabled pending verified configuration.', 503)
  if (!job?.recipient_email || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(job.recipient_email)) throw new Error('recipient_unverified')
  const event = { order_placed: 'placed', order_confirmed: 'confirmed', order_preparing: 'being prepared', order_ready: 'ready', order_completed: 'completed', order_cancelled: 'cancelled' }[job.event_type]
  if (!event || !/^[0-9a-f-]{36}$/i.test(job.order_id || '') || !/^[0-9a-f-]{36}$/i.test(job.id || '')) throw new Error('provider_rejected')
  const name = String(job.website_name || 'Your store').replace(/[\r\n\u0000-\u001f]/g, ' ').slice(0, 180)
  const response = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST', headers: { Authorization: `Bearer ${configuration.apiKey}`, 'Content-Type': 'application/json', 'Idempotency-Key': `commerce:${job.id}` },
    body: JSON.stringify({ from: configuration.from, to: [job.recipient_email], subject: `${name}: order ${event}`, text: `Your order ${job.order_id} at ${name} is ${event}. View your order in your store account. Cash on delivery order status does not confirm a captured payment or refund.` }),
    signal: AbortSignal.timeout(10000),
  })
  if (!response.ok) throw new Error(response.status >= 500 || response.status === 429 ? 'provider_unavailable' : 'provider_rejected')
  const result = await response.json().catch(() => ({}))
  if (typeof result.id !== 'string' || !/^[A-Za-z0-9_-]{1,200}$/.test(result.id)) throw new Error('provider_unavailable')
  return { providerMessageId: result.id }
}

export async function processCommerceNotifications(client, { limit = 10, configuration = notificationConfiguration(), send = sendCommerceNotification } = {}) {
  if (!configuration.enabled) throw new CommerceError('Notification delivery is disabled pending verified configuration.', 503)
  const jobs = await dataResult(client.rpc('commerce_notification_claim', { p_limit: limit, p_lease_seconds: 120 }))
  const counts = { claimed: jobs.length, sent: 0, retried_or_failed: 0 }
  for (const job of jobs) {
    let result
    try { result = await send(job, { configuration }) } catch (error) {
      const code = ['recipient_unverified', 'provider_rejected'].includes(error?.message) ? error.message : 'provider_unavailable'
      await dataResult(client.rpc('commerce_notification_ack', { p_id: job.id, p_lease_token: job.lease_token, p_sent: false, p_error_code: code }))
      counts.retried_or_failed++
      continue
    }
    // An ambiguous ACK is left leased for recovery, never converted to a failed
    // send. The provider receives the same idempotency key on a later attempt.
    await dataResult(client.rpc('commerce_notification_ack', { p_id: job.id, p_lease_token: job.lease_token, p_sent: true, p_provider_message_id: result.providerMessageId }))
    counts.sent++
  }
  return counts
}
