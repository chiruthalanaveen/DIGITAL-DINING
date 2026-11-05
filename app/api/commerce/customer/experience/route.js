import { uuid } from '@/lib/server/commerce/validation'
import { dataResult, parse, publicClient, readJson, requireSameOrigin, run, userContext } from '@/lib/server/commerce/core'
import { customerExperience, customerExperienceActions, customerExperienceEnvelope, engagementPayload } from '@/lib/server/commerce/engagement'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  return run(async () => {
    const params = new URL(request.url).searchParams
    const websiteId = parse(uuid, params.get('website_id'))
    if (params.has('product_id')) {
      const productId = parse(uuid, params.get('product_id'))
      const raw = await dataResult(publicClient().rpc('commerce_public_product_reviews', { p_website_id: websiteId, p_product_id: productId }))
      // Keep this public branch independent of all private experience records.
      return { reviews: (Array.isArray(raw?.reviews) ? raw.reviews : []).map(row => ({ id: row.id, rating: row.rating, title: row.title, body: row.body, created_at: row.created_at })), rating_count: raw?.rating_count || 0, average_rating: raw?.average_rating || 0 }
    }
    const { client } = await userContext(request)
    return customerExperience(client, websiteId)
  })
}

export async function POST(request) {
  return run(async () => {
    requireSameOrigin(request)
    const { client } = await userContext(request)
    const { website_id, action, payload } = parse(customerExperienceEnvelope, await readJson(request))
    return customerExperience(client, website_id, action, engagementPayload(customerExperienceActions, action, payload))
  })
}
