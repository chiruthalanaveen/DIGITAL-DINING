import { uuid } from '@/lib/server/commerce/validation'
import { adminContext, CommerceError, dataResult, parse, readJson, run } from '@/lib/server/commerce/core'
import { domainAdminSchema, domainConfiguration, domainWorkspace, inspectCommerceDomain, provisionCommerceDomain, verifyCommerceDomain } from '@/lib/server/commerce/domains'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const workspace = (client, websiteId) => dataResult(client.rpc('commerce_domain_admin_action', { p_website_id: websiteId, p_action: 'status', p_payload: {} }))
const readiness = () => {
  const configuration = domainConfiguration()
  return { enabled: configuration.enabled, provider_configured: configuration.configured, provisioning_enabled: configuration.provisioningEnabled }
}

export async function GET(request) {
  return run(async () => {
    const { client } = adminContext(request)
    const websiteId = parse(uuid, new URL(request.url).searchParams.get('website_id'))
    return { ...domainWorkspace(await workspace(client, websiteId)), ...readiness() }
  })
}

export async function POST(request) {
  return run(async () => {
    const { client } = adminContext(request, true)
    const { website_id: websiteId, action, payload } = parse(domainAdminSchema, await readJson(request))
    if (action === 'deactivate') {
      await dataResult(client.rpc('commerce_domain_admin_action', { p_website_id: websiteId, p_action: action, p_payload: payload }))
    } else {
      const configuration = domainConfiguration()
      if (!configuration.enabled || !configuration.configured) throw new CommerceError('Custom domains are disabled pending verified provider configuration and separate activation.', 503)
      const result = await workspace(client, websiteId)
      const domain = result?.domains?.find(row => row.id === payload.id && !row.released_at)
      if (!domain) throw new CommerceError('Domain claim not found for this website.', 404)
      if (['provision', 'verify'].includes(action) && !configuration.provisioningEnabled) throw new CommerceError('Domain provisioning is disabled pending separate provider activation.', 503)
      let verification
      try {
        if (action === 'provision') await provisionCommerceDomain(domain.hostname, { configuration })
        if (action === 'verify') await verifyCommerceDomain(domain.hostname, { configuration })
        verification = await inspectCommerceDomain(domain.hostname, { configuration })
      }
      catch (error) {
        // An ambiguous provider mutation/current check cannot leave an old claim live.
        await dataResult(client.rpc('commerce_domain_admin_action', { p_website_id: websiteId, p_action: 'record_verification', p_payload: {
          ...payload, ownership_verified: false, deployment_verified: false, tls_verified: false, verification: [], provider_project_id: configuration.projectId,
        } }))
        throw error
      }
      await dataResult(client.rpc('commerce_domain_admin_action', { p_website_id: websiteId, p_action: 'record_verification', p_payload: { ...payload, ...verification } }))
      if (action === 'activate') {
        if (!verification.ownership_verified || !verification.deployment_verified || !verification.tls_verified) throw new CommerceError('Ownership, Production deployment, DNS and TLS verification must all pass before activation.', 409)
        await dataResult(client.rpc('commerce_domain_admin_action', { p_website_id: websiteId, p_action: 'activate', p_payload: payload }))
      }
    }
    return { ...domainWorkspace(await workspace(client, websiteId)), ...readiness() }
  })
}
