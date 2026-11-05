import { adminContext, dataResult, parse, readJson, run } from '@/lib/server/commerce/core'
import { notificationAction, notificationConfiguration, processCommerceNotifications } from '@/lib/server/commerce/notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  return run(async () => {
    const { client } = adminContext(request)
    const status = await dataResult(client.rpc('commerce_notification_admin', { p_action: 'status', p_payload: {} }))
    return { status, enabled: notificationConfiguration().enabled }
  })
}

export async function POST(request) {
  return run(async () => {
    const { client } = adminContext(request, true)
    const { action, payload } = parse(notificationAction, await readJson(request))
    if (action === 'retry') return { result: await dataResult(client.rpc('commerce_notification_admin', { p_action: action, p_payload: payload })) }
    return { result: await processCommerceNotifications(client, { limit: payload.limit }) }
  })
}
