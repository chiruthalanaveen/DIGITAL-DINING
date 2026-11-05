import { actionEnvelope, uuid } from '@/lib/server/commerce/validation'
import { can, CommerceError, dataResult, ownerContext, parse, readJson, requireSameOrigin, run } from '@/lib/server/commerce/core'
import { domainConfiguration, domainOwnerActions, domainWorkspace, verifiedCommerceDomainBase } from '@/lib/server/commerce/domains'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request, context) {
  return run(async () => {
    const { websiteId } = await context.params
    const { client, website } = await ownerContext(request, parse(uuid, websiteId))
    if (!can(website, 'branding')) throw new CommerceError('Branding permission is required.', 403)
    const result = await dataResult(client.rpc('commerce_domain_workspace', { p_website_id: website.id }))
    const configuration = domainConfiguration()
    const generatedBase = configuration.enabled && configuration.baseHostname
      ? await verifiedCommerceDomainBase({ configuration }).catch(() => null) : null
    return { ...domainWorkspace(result), enabled: configuration.enabled, generated_base: generatedBase }
  })
}

export async function POST(request, context) {
  return run(async () => {
    requireSameOrigin(request)
    const { websiteId } = await context.params
    const { client, website } = await ownerContext(request, parse(uuid, websiteId))
    if (!can(website, 'branding')) throw new CommerceError('Branding permission is required.', 403)
    if (!['setup', 'active'].includes(website.status)) throw new CommerceError('This website is read-only.', 403)
    const { action, payload } = parse(actionEnvelope, await readJson(request))
    if (!Object.hasOwn(domainOwnerActions, action)) throw new CommerceError('Unsupported domain action.')
    let validated = parse(domainOwnerActions[action], payload)
    // Release remains available when activation/routing is switched off.
    if (action !== 'remove' && !domainConfiguration().enabled) throw new CommerceError('Custom domains are disabled pending separate activation.', 503)
    if (action === 'claim_generated') {
      const base = await verifiedCommerceDomainBase()
      if (!base) throw new CommerceError('Generated store domains are unavailable until the configured base, wildcard DNS and certificate are verified.', 503)
      validated = parse(domainOwnerActions.claim, { hostname: `${validated.label}.${base}` })
    }
    await dataResult(client.rpc('commerce_domain_owner_action', { p_website_id: website.id, p_action: action === 'claim_generated' ? 'claim' : action, p_payload: validated }))
    return { ...domainWorkspace(await dataResult(client.rpc('commerce_domain_workspace', { p_website_id: website.id }))), enabled: domainConfiguration().enabled }
  })
}
