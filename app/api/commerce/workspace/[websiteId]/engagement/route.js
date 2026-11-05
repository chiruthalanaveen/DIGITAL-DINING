import { uuid } from '@/lib/server/commerce/validation'
import { parse, readJson, requireSameOrigin, run } from '@/lib/server/commerce/core'
import { engagementEnvelope, engagementPayload, ownerEngagement, ownerEngagementActions, ownerEngagementContext } from '@/lib/server/commerce/engagement'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request, context) {
  return run(async () => {
    const { websiteId } = await context.params
    const { client, website } = await ownerEngagementContext(request, parse(uuid, websiteId))
    return ownerEngagement(client, website.id)
  })
}

export async function POST(request, context) {
  return run(async () => {
    requireSameOrigin(request)
    const { websiteId } = await context.params
    const { action, payload } = parse(engagementEnvelope, await readJson(request))
    const validated = engagementPayload(ownerEngagementActions, action, payload)
    const { client, website } = await ownerEngagementContext(request, parse(uuid, websiteId), action)
    return ownerEngagement(client, website.id, action, validated)
  })
}
