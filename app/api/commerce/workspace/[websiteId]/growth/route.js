import { z } from 'zod'
import { actionEnvelope, uuid } from '@/lib/server/commerce/validation'
import { can, CommerceError, dataResult, ownerContext, parse, readJson, requireSameOrigin, run } from '@/lib/server/commerce/core'
import { growthActions } from '@/lib/server/commerce/growth'
import { notificationConfiguration } from '@/lib/server/commerce/notifications'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request, context) {
  return run(async () => {
    const { websiteId } = await context.params
    const { client, website } = await ownerContext(request, parse(uuid, websiteId))
    if (!can(website, 'orders')) throw new CommerceError('Order management permission is required.', 403)
    const days = Number(parse(z.enum(['7', '30', '90']), new URL(request.url).searchParams.get('days') || '30'))
    const result = await dataResult(client.rpc('commerce_growth_workspace', { p_website_id: website.id }))
    const analytics = days === 30 ? result?.analytics : await dataResult(client.rpc('commerce_growth_analytics', { p_website_id: website.id, p_days: days }))
    return { ...result, analytics, notifications_enabled: notificationConfiguration().enabled }
  })
}

export async function POST(request, context) {
  return run(async () => {
    requireSameOrigin(request)
    const { websiteId } = await context.params
    const { client, website } = await ownerContext(request, parse(uuid, websiteId))
    if (!can(website, 'orders')) throw new CommerceError('Order management permission is required.', 403)
    if (!['setup', 'active'].includes(website.status)) throw new CommerceError('This website is read-only.', 403)
    const { action, payload } = parse(actionEnvelope, await readJson(request))
    if (!Object.hasOwn(growthActions, action)) throw new CommerceError('Unsupported growth action.')
    const result = await dataResult(client.rpc('commerce_growth_owner_action', { p_website_id: website.id, p_action: action, p_payload: parse(growthActions[action], payload) }))
    return { result }
  })
}
