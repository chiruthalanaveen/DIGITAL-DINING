import { actionEnvelope, uuid } from '@/lib/server/commerce/validation'
import { can, CommerceError, dataResult, feature, ownerContext, parse, readJson, requireSameOrigin, run } from '@/lib/server/commerce/core'
import { catalogActions, catalogPermission, catalogWorkspace, optionalCommerceRpc } from '@/lib/server/commerce/expansion'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request, context) {
  return run(async () => {
    const { websiteId } = await context.params
    const { client, website } = await ownerContext(request, parse(uuid, websiteId))
    const result = await optionalCommerceRpc(client, 'commerce_catalog_workspace', { p_website_id: website.id })
    if (!result.available) return { available: false, settings: null, product_profiles: [], images: [], variants: [], delivery_zones: [] }
    return { ...catalogWorkspace(result.data, website.id), available: true }
  })
}

export async function POST(request, context) {
  return run(async () => {
    requireSameOrigin(request)
    const { websiteId } = await context.params
    const { client, website } = await ownerContext(request, parse(uuid, websiteId))
    const { action, payload } = parse(actionEnvelope, await readJson(request))
    if (!Object.hasOwn(catalogActions, action)) throw new CommerceError('Unsupported store option.')
    if (!can(website, catalogPermission(action))) throw new CommerceError('This action is not enabled for your account.', 403)
    if (!['setup', 'active'].includes(website.status)) throw new CommerceError('This website is read-only.', 403)
    if (['save_product_options', 'save_variant', 'archive_variant'].includes(action) && !feature(website, 'catalog')) throw new CommerceError('Catalog management is disabled.', 403)
    if (action === 'adjust_variant_stock' && !feature(website, 'inventory')) throw new CommerceError('Inventory management is disabled.', 403)
    const result = await dataResult(client.rpc('commerce_catalog_owner_action', { p_website_id: website.id, p_action: action, p_payload: parse(catalogActions[action], payload) }))
    return { result }
  })
}
