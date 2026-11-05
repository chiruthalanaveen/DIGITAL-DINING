import { adminContext, parse, readJson, run } from '@/lib/server/commerce/core'
import { featureRequestQuery, featureRequestReviewSchema, featureRequests } from '@/lib/server/commerce/feature-requests'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  return run(async () => {
    const { client, session } = adminContext(request)
    const query = featureRequestQuery(request, true)
    return featureRequests(client, query.websiteId, query.action, query.payload, session)
  })
}

export async function POST(request) {
  return run(async () => {
    const { client, session } = adminContext(request, true)
    const body = parse(featureRequestReviewSchema, await readJson(request))
    return featureRequests(client, body.website_id, body.action, body.payload, session)
  })
}
