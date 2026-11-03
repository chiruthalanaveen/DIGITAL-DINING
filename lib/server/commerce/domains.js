import { z } from 'zod'
import { slug, uuid } from './validation'
import { CommerceError, publicClient } from './core'

// Keep in sync with the six published aliases in production-release-20261102.md.
export const commercePrimaryHosts = new Set([
  'www.digitaldine-in.online', 'digitaldine-in.online',
  'www.digitaldine-in.store', 'digitaldine-in.store',
  'digital-dining-alpha.vercel.app', 'digital-dining-digital-dining.vercel.app',
])
const reservedLabels = new Set(['admin', 'api', 'auth', 'login', 'signup', 'owner', 'workspace', 'dashboard', 'www-admin', 'system', 'mail', 'smtp', 'ftp', 'ns1', 'ns2', 'localhost', 'local', 'internal', 'metadata', 'vercel'])
const blockedSuffix = /\.(?:localhost|local|internal|lan|home|test|invalid|example|arpa|onion|vercel\.app)$/

export function normalizeCommerceHostname(value) {
  if (typeof value !== 'string') return null
  const hostname = value.trim().toLowerCase()
  if (hostname.length > 253 || !hostname.includes('.') || !/^[a-z0-9.-]+$/.test(hostname)) return null
  const labels = hostname.split('.')
  if (labels.some(label => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) return null
  if (!/^[a-z][a-z0-9-]*$/.test(labels.at(-1)) || labels.at(-1).length < 2) return null
  if (reservedLabels.has(labels[0]) || blockedSuffix.test(hostname) || hostname === 'vercel.app') return null
  if ([...commercePrimaryHosts].some(host => hostname === host || hostname.endsWith(`.${host}`))) return null
  return hostname
}

export const commerceHostnameSchema = z.string().max(253).transform(value => value.trim().toLowerCase())
  .refine(value => normalizeCommerceHostname(value) === value, 'Enter a public domain name without a scheme, port or path.')
export const domainOwnerActions = {
  claim: z.object({ hostname: commerceHostnameSchema }).strict(),
  claim_generated: z.object({ label: z.string().trim().toLowerCase().regex(/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/).refine(label => !reservedLabels.has(label) && label !== 'www', 'Choose another store subdomain.') }).strict(),
  remove: z.object({ id: uuid }).strict(),
}
export const domainAdminSchema = z.object({
  website_id: uuid, action: z.enum(['provision', 'verify', 'check', 'activate', 'deactivate']), payload: z.object({ id: uuid }).strict(),
}).strict()

export function domainConfiguration(env = process.env) {
  const enabled = env.COMMERCE_CUSTOM_DOMAINS_ENABLED === 'true'
  const projectId = env.COMMERCE_VERCEL_PROJECT_ID || ''
  const teamId = env.COMMERCE_VERCEL_TEAM_ID || ''
  const token = env.COMMERCE_VERCEL_API_TOKEN || ''
  const configured = /^prj_[a-zA-Z0-9]+$/.test(projectId) && /^team_[a-zA-Z0-9]+$/.test(teamId) && Boolean(token.trim())
  const provisioningEnabled = env.COMMERCE_DOMAIN_PROVISIONING_ENABLED === 'true'
  const baseHostname = normalizeCommerceHostname(env.COMMERCE_DOMAIN_BASE_HOSTNAME) || null
  return { enabled, configured, projectId, teamId, token, provisioningEnabled, baseHostname }
}

export function domainPublicStatus(domain) {
  if (domain.released_at) return 'released'
  if (domain.active && domain.ownership_verified && domain.deployment_verified && domain.tls_verified) return 'active'
  if (domain.ownership_verified && domain.deployment_verified && domain.tls_verified) return 'verified'
  return 'pending'
}

// Only authorized callers receive this projection, including the private TXT proof.
export function domainWorkspace(result) {
  return { domains: (Array.isArray(result?.domains) ? result.domains : []).map(domain => ({
    id: domain.id, hostname: domain.hostname, status: domainPublicStatus(domain),
    ownership_verified: domain.ownership_verified === true, deployment_verified: domain.deployment_verified === true, tls_verified: domain.tls_verified === true,
    verification: Array.isArray(domain.verification) ? domain.verification : [],
    verified_at: domain.verified_at, last_checked_at: domain.verification_checked_at,
  })) }
}

async function vercelRead(path, configuration, fetchImpl) {
  const url = new URL(path, 'https://api.vercel.com')
  url.searchParams.set('teamId', configuration.teamId)
  let response
  try {
    response = await fetchImpl(url.href, { method: 'GET', headers: { Authorization: `Bearer ${configuration.token}` },
      cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000) })
  } catch { throw new CommerceError('Domain provider verification is temporarily unavailable.', 503) }
  if (response.status === 404) return null
  if (!response.ok) throw new CommerceError('Domain provider verification is temporarily unavailable.', 503)
  try { return await response.json() } catch { throw new CommerceError('Domain provider verification returned an invalid response.', 503) }
}

async function vercelMutation(path, body, configuration, fetchImpl) {
  if (!configuration.enabled || !configuration.configured || !configuration.provisioningEnabled) throw new CommerceError('Domain provisioning is disabled pending separate provider activation.', 503)
  const url = new URL(path, 'https://api.vercel.com')
  url.searchParams.set('teamId', configuration.teamId)
  let response
  try {
    response = await fetchImpl(url.href, { method: 'POST', headers: { Authorization: `Bearer ${configuration.token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}), cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(8000) })
  } catch { throw new CommerceError('Domain provisioning could not be confirmed. Recheck its status before retrying.', 503) }
  if (!response.ok) throw new CommerceError('Domain provisioning was rejected or could not be confirmed. Recheck its status before retrying.', response.status === 409 ? 409 : 503)
  try { return await response.json() } catch { throw new CommerceError('Domain provisioning could not be confirmed. Recheck its status before retrying.', 503) }
}

/** Admin-only call sites bind registration to a saved tenant claim and configured project. */
export async function provisionCommerceDomain(hostname, { configuration = domainConfiguration(), fetchImpl = fetch } = {}) {
  if (normalizeCommerceHostname(hostname) !== hostname) throw new CommerceError('Invalid custom domain.')
  // A successful registration does not establish ownership, DNS, TLS or activation.
  const result = await vercelMutation(`/v10/projects/${encodeURIComponent(configuration.projectId)}/domains`, { name: hostname }, configuration, fetchImpl)
  if (result?.name !== hostname || result?.projectId !== configuration.projectId) throw new CommerceError('Domain registration could not be confirmed for this project.', 503)
}

export async function verifyCommerceDomain(hostname, { configuration = domainConfiguration(), fetchImpl = fetch } = {}) {
  if (normalizeCommerceHostname(hostname) !== hostname) throw new CommerceError('Invalid custom domain.')
  const result = await vercelMutation(`/v9/projects/${encodeURIComponent(configuration.projectId)}/domains/${encodeURIComponent(hostname)}/verify`, null, configuration, fetchImpl)
  if (result?.name !== hostname || result?.projectId !== configuration.projectId) throw new CommerceError('Domain verification could not be confirmed for this project.', 503)
}

/** Generated names require actual configured wildcard metadata and certificate;
 * an environment variable alone is never treated as proof of DNS readiness. */
export async function verifiedCommerceDomainBase({ configuration = domainConfiguration(), fetchImpl = fetch, now = Date.now() } = {}) {
  const base = configuration.baseHostname
  if (!configuration.enabled || !configuration.configured || !base) return null
  const project = encodeURIComponent(configuration.projectId)
  const wildcard = `*.${base}`
  const [domain, dns, certificates] = await Promise.all([
    vercelRead(`/v9/projects/${project}/domains/${encodeURIComponent(wildcard)}`, configuration, fetchImpl),
    vercelRead(`/v6/domains/${encodeURIComponent(wildcard)}/config?projectIdOrName=${project}`, configuration, fetchImpl),
    vercelRead('/v8/certs', configuration, fetchImpl),
  ])
  return domain?.name === wildcard && domain.projectId === configuration.projectId && domain.verified === true &&
    !domain.redirect && !domain.gitBranch && !domain.customEnvironmentId && dns?.misconfigured === false &&
    ['A', 'CNAME', 'http'].includes(dns?.configuredBy) && Array.isArray(certificates?.certs) &&
    certificates.certs.some(cert => Number.isFinite(cert.expiresAt) && cert.expiresAt > now && Array.isArray(cert.cns) && cert.cns.includes(wildcard)) ? base : null
}

const matchingCertificate = (hostname, cert, now) => Number.isFinite(cert.expiresAt) && cert.expiresAt > now &&
  Array.isArray(cert.cns) && cert.cns.some(name => name === hostname ||
    (typeof name === 'string' && name.startsWith('*.') && hostname.split('.').length === name.split('.').length && hostname.endsWith(name.slice(1))))

/** Read-only contracts from the official Vercel SDK: project domain, DNS config,
 * alias, deployment and certificate metadata. Never provisions or verifies by POST. */
export async function inspectCommerceDomain(hostname, { configuration = domainConfiguration(), fetchImpl = fetch, now = Date.now() } = {}) {
  if (!configuration.enabled || !configuration.configured) throw new CommerceError('Custom domains are disabled pending verified provider configuration and separate activation.', 503)
  if (normalizeCommerceHostname(hostname) !== hostname) throw new CommerceError('Invalid custom domain.')
  const project = encodeURIComponent(configuration.projectId)
  const name = encodeURIComponent(hostname)
  const [domain, dns, alias, certificates] = await Promise.all([
    vercelRead(`/v9/projects/${project}/domains/${name}`, configuration, fetchImpl),
    vercelRead(`/v6/domains/${name}/config?projectIdOrName=${project}`, configuration, fetchImpl),
    vercelRead(`/v4/aliases/${name}?projectId=${project}`, configuration, fetchImpl),
    vercelRead('/v8/certs', configuration, fetchImpl),
  ])
  const ownership = domain?.name === hostname && domain?.projectId === configuration.projectId && domain?.verified === true &&
    !domain.redirect && !domain.gitBranch && !domain.customEnvironmentId
  const aliasMatches = alias?.alias === hostname && alias?.projectId === configuration.projectId &&
    !alias.redirect && !alias.deletedAt && typeof alias.deploymentId === 'string' && /^dpl_[a-zA-Z0-9]+$/.test(alias.deploymentId)
  const deployment = aliasMatches ? await vercelRead(`/v13/deployments/${encodeURIComponent(alias.deploymentId)}`, configuration, fetchImpl) : null
  const deploymentVerified = ownership && dns?.misconfigured === false && ['A', 'CNAME', 'http'].includes(dns?.configuredBy) &&
    aliasMatches && deployment?.id === alias.deploymentId && deployment?.projectId === configuration.projectId &&
    deployment?.readyState === 'READY' && deployment?.target === 'production' && deployment?.aliasAssigned === true && !deployment.aliasError
  const tls = Array.isArray(certificates?.certs) && certificates.certs.some(cert => matchingCertificate(hostname, cert, now))
  const apex = normalizeCommerceHostname(domain?.apexName)
  const validApex = apex && (hostname === apex || hostname.endsWith(`.${apex}`))
  const verification = domain?.name === hostname && domain?.projectId === configuration.projectId && Array.isArray(domain.verification)
    ? domain.verification.filter(proof => proof.type === 'TXT' && typeof proof.domain === 'string' && proof.domain.length <= 253 &&
      /^[a-zA-Z0-9_.-]+$/.test(proof.domain) && (proof.domain === hostname || proof.domain.endsWith(`.${hostname}`) ||
        (validApex && (proof.domain === apex || proof.domain.endsWith(`.${apex}`)))) &&
      typeof proof.value === 'string' && proof.value.length > 0 && proof.value.length <= 2048 && !/[\r\n\0]/.test(proof.value))
      .slice(0, 10).map(({ type, domain, value }) => ({ type, domain, value })) : []
  return { ownership_verified: ownership, deployment_verified: Boolean(deploymentVerified), tls_verified: Boolean(tls),
    verification, provider_project_id: configuration.projectId }
}

/** Authority comes from Host only; forwarded-host headers never select a tenant. */
export function commerceRequestHostname(request) {
  const authority = request.headers.get('host')
  if (!authority || authority.length > 260 || /[\s,@/\\]/.test(authority)) return null
  const match = /^([^:]+)(?::([0-9]{1,5}))?$/.exec(authority.toLowerCase())
  if (!match || (match[2] && (Number(match[2]) < 1 || Number(match[2]) > 65535))) return null
  return normalizeCommerceHostname(match[1])
}

export async function resolveCommerceDomain(request, { configuration = domainConfiguration(), clientFactory = publicClient } = {}) {
  if (!configuration.enabled) return null
  const hostname = commerceRequestHostname(request)
  if (!hostname) return null
  // No service key, token, private domain row or TXT proof is used by host routing.
  try {
    const query = clientFactory().rpc('commerce_resolve_domain', { p_hostname: hostname })
    const { data, error } = await (typeof query?.abortSignal === 'function' ? query.abortSignal(AbortSignal.timeout(2000)) : query)
    const parsed = slug.safeParse(data)
    return !error && parsed.success && parsed.data === data ? data : null
  } catch { return null }
}
