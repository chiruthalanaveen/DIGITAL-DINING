import process from 'node:process'
import { pathToFileURL } from 'node:url'

export const PRODUCTION_PROJECT_REF = 'wispidcdmunqzahjacws'
const REQUIRED = [
  'COMMERCE_STAGING_PROJECT_REF',
  'COMMERCE_STAGING_SUPABASE_URL',
  'COMMERCE_STAGING_SUPABASE_ANON_KEY',
  'COMMERCE_STAGING_SUPABASE_SERVICE_ROLE_KEY',
  'COMMERCE_STAGING_DATABASE_URL',
]
const TABLES = ['commerce_websites', 'commerce_memberships', 'commerce_applications', 'commerce_categories', 'commerce_products', 'commerce_customers', 'commerce_orders', 'commerce_order_items', 'commerce_audit_logs']

function requireValue(condition, message) {
  if (!condition) throw new Error(message)
}

function parseUrl(value, label) {
  try { return new URL(value) }
  catch { throw new Error(`${label} must be a valid URL. Credentials are never printed.`) }
}

function validateKey(key, ref, role, label) {
  const opaquePrefix = role === 'anon' ? 'sb_publishable_' : 'sb_secret_'
  if (key.startsWith(opaquePrefix) && key.length > opaquePrefix.length + 10) return
  let claims
  try { claims = JSON.parse(Buffer.from(key.split('.')[1], 'base64url').toString('utf8')) }
  catch { throw new Error(`${label} must be a staging Supabase key of the correct type.`) }
  requireValue(claims.ref === ref && claims.role === role, `${label} project reference or role does not match staging.`)
}

/** Only explicit staging variables are consumed; existing application credentials are never a fallback. */
export function validateStagingConfig(env) {
  const missing = REQUIRED.filter(key => !env[key] || !String(env[key]).trim())
  requireValue(!missing.length, `Hosted staging checks blocked. Missing: ${missing.join(', ')}. No connection was attempted.`)
  const ref = env.COMMERCE_STAGING_PROJECT_REF
  requireValue(/^[a-z]{20}$/.test(ref), 'COMMERCE_STAGING_PROJECT_REF must be the exact hosted project reference.')
  requireValue(ref !== PRODUCTION_PROJECT_REF, 'The known production Supabase project is forbidden in this staging runner.')

  const api = parseUrl(env.COMMERCE_STAGING_SUPABASE_URL, 'Staging Supabase URL')
  requireValue(api.protocol === 'https:' && api.hostname === `${ref}.supabase.co` && !api.port && api.pathname === '/' && !api.search && !api.hash && !api.username && !api.password,
    'Staging API URL must be exactly https://<staging-project-ref>.supabase.co, without credentials or overrides.')

  const anonKey = env.COMMERCE_STAGING_SUPABASE_ANON_KEY
  const serviceKey = env.COMMERCE_STAGING_SUPABASE_SERVICE_ROLE_KEY
  requireValue(anonKey !== serviceKey, 'Staging anon and service-role keys must be different.')
  validateKey(anonKey, ref, 'anon', 'Staging anon key')
  validateKey(serviceKey, ref, 'service_role', 'Staging service-role key')

  const db = parseUrl(env.COMMERCE_STAGING_DATABASE_URL, 'Staging database URL')
  const username = decodeURIComponent(db.username)
  requireValue(['postgres:', 'postgresql:'].includes(db.protocol) && db.pathname === '/postgres' && !db.hash,
    'Use the staging PostgreSQL postgres database, with no URL fragment.')
  requireValue(!db.port || db.port === '5432', 'Use direct PostgreSQL or the session pooler on port 5432, not a transaction pooler.')
  for (const [key, value] of db.searchParams) {
    requireValue(key === 'sslmode' && ['require', 'verify-full'].includes(value), 'Database URL host/options overrides and insecure SSL modes are forbidden.')
  }
  const direct = db.hostname === `db.${ref}.supabase.co` && username === 'postgres'
  const sessionPooler = /^[a-z0-9-]+\.pooler\.supabase\.com$/.test(db.hostname) && username === `postgres.${ref}`
  requireValue(direct || sessionPooler, 'Database hostname/session-pooler username must identify the same staging project as the API URL.')
  requireValue(Boolean(db.password), 'A staging-only database password must be supplied securely.')
  return {
    projectRef: ref,
    apiUrl: api.origin,
    anonKey,
    serviceKey,
    // Build explicit options so URI query parameters cannot override hostname or TLS verification.
    database: {
      host: db.hostname, port: 5432, user: username, password: decodeURIComponent(db.password), database: 'postgres',
      ssl: { rejectUnauthorized: true }, connectionTimeoutMillis: 10000,
      application_name: 'digital-dining-commerce-staging-read-only-preflight',
    },
  }
}

/** Metadata and connectivity only. This script never applies SQL, creates fixtures or validates business workflows. */
export async function runStagingPreflight(env = process.env) {
  const config = validateStagingConfig(env)
  const { Client } = await import('pg')
  const client = new Client(config.database)
  let transaction = false
  let identity, tables
  try {
    await client.connect()
    await client.query('BEGIN READ ONLY')
    transaction = true
    await client.query("SET LOCAL statement_timeout = '10s'")
    identity = (await client.query('SELECT current_database() AS database_name, current_user AS database_role, version() AS postgres_version')).rows[0]
    tables = (await client.query(`SELECT c.relname AS name, c.relrowsecurity AS rls_enabled
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r' AND c.relname = ANY($1::text[]) ORDER BY c.relname`, [TABLES])).rows
    await client.query('ROLLBACK')
    transaction = false
  } finally {
    if (transaction) await client.query('ROLLBACK').catch(() => {})
    await client.end().catch(() => {})
  }
  const auth = await fetch(`${config.apiUrl}/auth/v1/settings`, { headers: { apikey: config.anonKey }, redirect: 'error', signal: AbortSignal.timeout(10000) })
  requireValue(auth.ok, `Staging Auth settings request failed with HTTP ${auth.status}.`)
  const metadata = await fetch(`${config.apiUrl}/rest/v1/`, {
    headers: { apikey: config.serviceKey, Authorization: `Bearer ${config.serviceKey}`, Accept: 'application/openapi+json' },
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  })
  requireValue(metadata.ok, `Staging REST metadata request failed with HTTP ${metadata.status}.`)
  const catalog = await metadata.json()
  return {
    projectRef: config.projectRef,
    apiHost: new URL(config.apiUrl).hostname,
    database: identity,
    commerceTables: tables,
    restCommerceTables: Object.keys(catalog.definitions || {}).filter(name => TABLES.includes(name)).sort(),
    schemaInstalled: tables.length === TABLES.length && tables.every(table => table.rls_enabled),
    authSettingsReachable: true,
    migrationAppliedByThisScript: false,
    hostedWorkflowTestsCompleted: false,
    note: 'Read-only connectivity/schema preflight only. Real hosted owner/customer, Storage, cart, checkout and admin tests remain a separate release gate.',
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.slice(2).length) {
    console.error('This runner accepts no mutation flags. It is read-only and never applies a migration.')
    process.exitCode = 1
  } else {
    try { console.log(JSON.stringify(await runStagingPreflight(), null, 2)) }
    catch (error) {
      // Do not print upstream connection messages, URLs, stack traces or credentials.
      console.error(error.message.startsWith('Hosted staging checks blocked.') ? error.message : 'Staging preflight failed. Check the explicitly configured staging target and secure credentials; no migration was applied.')
      process.exitCode = 1
    }
  }
}
