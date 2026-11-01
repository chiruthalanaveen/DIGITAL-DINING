import { dataResult, run, userContext } from '@/lib/server/commerce/core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  return run(async () => {
    const { client, user } = await userContext(request)
    const memberships = await dataResult(client.from('commerce_memberships').select('website_id,role,active').eq('user_id', user.id).eq('role', 'owner').eq('active', true).limit(100))
    if (!memberships?.length) return { websites: [] }
    const websites = await dataResult(client.from('commerce_websites').select('*').in('id', memberships.map(row => row.website_id)).order('created_at', { ascending: false }).limit(100))
    return { websites: websites || [] }
  })
}
