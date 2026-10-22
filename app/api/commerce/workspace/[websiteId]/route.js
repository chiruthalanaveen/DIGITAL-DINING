import { actionEnvelope, ownerActions, uuid } from '@/lib/server/commerce/validation'
import { can, CommerceError, dataResult, feature, ownerContext, parse, readJson, requireSameOrigin, run } from '@/lib/server/commerce/core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request, context) {
  return run(async () => {
    const { websiteId } = await context.params
    const { client, website, membership } = await ownerContext(request, parse(uuid, websiteId))
    const allowedProducts = feature(website, 'catalog') && (can(website, 'products') || can(website, 'inventory'))
    const [categories, products, orders, customers] = await Promise.all([
      feature(website, 'catalog') && (can(website, 'categories') || can(website, 'products')) ? dataResult(client.from('commerce_categories').select('*').eq('website_id', website.id).order('name').limit(500)) : [],
      allowedProducts ? dataResult(client.from('commerce_products').select('*').eq('website_id', website.id).order('created_at', { ascending: false }).limit(1000)) : [],
      can(website, 'orders') ? dataResult(client.from('commerce_orders').select('*').eq('website_id', website.id).order('created_at', { ascending: false }).limit(200)) : [],
      can(website, 'customers') ? dataResult(client.from('commerce_customers').select('*').eq('website_id', website.id).order('created_at', { ascending: false }).limit(500)) : [],
    ])
    const order_items = orders?.length ? await dataResult(client.from('commerce_order_items').select('*').eq('website_id', website.id).in('order_id', orders.map(row => row.id)).limit(5000)) : []
    return { website, membership, categories: categories || [], products: products || [], orders: orders || [], order_items: order_items || [], customers: customers || [] }
  })
}

export async function POST(request, context) {
  return run(async () => {
    requireSameOrigin(request)
    const { websiteId } = await context.params
    const { client, website } = await ownerContext(request, parse(uuid, websiteId))
    const { action, payload } = parse(actionEnvelope, await readJson(request))
    if (!Object.hasOwn(ownerActions, action)) throw new CommerceError('Unsupported owner action.')
    const permission = { save_product: 'products', archive_product: 'products', save_category: 'categories', archive_category: 'categories', adjust_stock: 'inventory', update_branding: 'branding', update_order_status: 'orders' }[action]
    if (!can(website, permission)) throw new CommerceError('This action is not enabled for your account.', 403)
    if ((['save_product', 'archive_product', 'save_category', 'archive_category'].includes(action) && !feature(website, 'catalog')) || (action === 'adjust_stock' && !feature(website, 'inventory'))) throw new CommerceError('This feature is disabled for your website.', 403)
    const result = await dataResult(client.rpc('commerce_owner_action', { p_website_id: website.id, p_action: action, p_payload: parse(ownerActions[action], payload) }))
    return { result }
  })
}
