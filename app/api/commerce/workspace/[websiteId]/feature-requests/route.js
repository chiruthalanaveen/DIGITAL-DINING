import { ownerContext, parse, readJson, requireSameOrigin, run } from '@/lib/server/commerce/core'
import { featureRequestQuery, featureRequestSubmitSchema, featureRequests } from '@/lib/server/commerce/feature-requests'
import { uuid } from '@/lib/server/commerce/validation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request, context) {
  return run(async () => {
    const { websiteId } = await context.params
    const id = parse(uuid, websiteId).toLowerCase()
    const { client } = await ownerContext(request, id)
    const query = featureRequestQuery(request)
    return featureRequests(client, id, query.action, query.payload)
  })
}

export async function POST(request, context) {
  return run(async () => {
    requireSameOrigin(request)
    const { websiteId } = await context.params
    const id = parse(uuid, websiteId).toLowerCase()
    const { client } = await ownerContext(request, id)
    // SQL checks website status under its lock for a new submission, while an
    // identical saved-key replay may still recover after the store is archived.
    const body = parse(featureRequestSubmitSchema, await readJson(request))
    return featureRequests(client, id, body.action, body.payload)
  })
}
