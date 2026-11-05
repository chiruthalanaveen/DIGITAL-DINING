import { z } from 'zod'
import { uuid } from '@/lib/server/commerce/validation'
import { adminContext, CommerceError, dataResult, parse, readJson, run } from '@/lib/server/commerce/core'
import { catalogWorkspace, optionalCommerceRpc, publicStoreSettings, templates } from '@/lib/server/commerce/expansion'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
const envelope = z.object({ website_id: uuid, action: z.literal('save_template'), payload: z.object({ template: templates }).strict() }).strict()

export async function GET(request) {
  return run(async () => {
    const { client } = adminContext(request)
    const params = new URL(request.url).searchParams
    const id = parse(uuid, params.get('website_id'))
    const workspace = params.get('workspace') === '1'
    const result = await optionalCommerceRpc(client, 'commerce_catalog_admin_action', { p_website_id: id, p_action: workspace ? 'get_workspace' : 'get_settings', p_payload: {} })
    if (!result.available) return { available: false, settings: null }
    if (workspace) return { available: true, ...catalogWorkspace(result.data, id) }
    if (!templates.safeParse(result.data?.template).success) throw new CommerceError('Store options could not be verified.', 503)
    return { available: true, settings: publicStoreSettings(result.data) }
  })
}
export async function POST(request) {
  return run(async () => {
    const { client } = adminContext(request, true)
    const body = parse(envelope, await readJson(request))
    const settings = await dataResult(client.rpc('commerce_catalog_admin_action', { p_website_id: body.website_id, p_action: body.action, p_payload: body.payload }))
    if (!settings || Array.isArray(settings) || settings.template !== body.payload.template) throw new CommerceError('The template assignment could not be confirmed.', 503)
    const result = publicStoreSettings(settings)
    return { result, settings: result }
  })
}
