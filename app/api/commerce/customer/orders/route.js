import { uuid } from '@/lib/server/commerce/validation'
import { dataResult, parse, run, userContext } from '@/lib/server/commerce/core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  return run(async () => {
    const { client, user } = await userContext(request)
    const websiteId = parse(uuid, new URL(request.url).searchParams.get('website_id'))
    const orders = await dataResult(client.from('commerce_orders').select('*').eq('website_id', websiteId).eq('customer_user_id', user.id).order('created_at', { ascending: false }).limit(200))
    const order_items = orders?.length ? await dataResult(client.from('commerce_order_items').select('*').eq('website_id', websiteId).in('order_id', orders.map(row => row.id)).limit(5000)) : []
    return { orders: orders || [], order_items: order_items || [] }
  })
}
