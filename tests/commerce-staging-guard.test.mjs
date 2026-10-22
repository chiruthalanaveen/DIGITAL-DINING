import assert from 'node:assert/strict'
import test from 'node:test'
import { PRODUCTION_PROJECT_REF, runStagingPreflight, validateStagingConfig } from '../scripts/test-commerce-staging.mjs'

const ref = 'abcdefghijklmnopqrst'
const jwt = (project, role) => `test.${Buffer.from(JSON.stringify({ ref: project, role })).toString('base64url')}.not-a-real-key`
const config = (overrides = {}) => ({
  COMMERCE_STAGING_PROJECT_REF: ref,
  COMMERCE_STAGING_SUPABASE_URL: `https://${ref}.supabase.co`,
  COMMERCE_STAGING_SUPABASE_ANON_KEY: jwt(ref, 'anon'),
  COMMERCE_STAGING_SUPABASE_SERVICE_ROLE_KEY: jwt(ref, 'service_role'),
  COMMERCE_STAGING_DATABASE_URL: `postgresql://postgres:synthetic-test-only@db.${ref}.supabase.co:5432/postgres?sslmode=require`,
  ...overrides,
})

test('staging preflight refuses missing explicit configuration before any connection', async () => {
  await assert.rejects(runStagingPreflight({}), /Missing: COMMERCE_STAGING_PROJECT_REF/)
})

test('production application environment values never become staging fallbacks', () => {
  assert.throws(() => validateStagingConfig({ NEXT_PUBLIC_SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`, NEXT_PUBLIC_SUPABASE_ANON_KEY: 'production-value-not-used', SUPABASE_SERVICE_ROLE_KEY: 'production-value-not-used', DATABASE_URL: 'production-value-not-used' }), /Hosted staging checks blocked/)
})

test('known production project is rejected even with consistently matching credentials', () => {
  assert.throws(() => validateStagingConfig(config({ COMMERCE_STAGING_PROJECT_REF: PRODUCTION_PROJECT_REF, COMMERCE_STAGING_SUPABASE_URL: `https://${PRODUCTION_PROJECT_REF}.supabase.co`, COMMERCE_STAGING_SUPABASE_ANON_KEY: jwt(PRODUCTION_PROJECT_REF, 'anon'), COMMERCE_STAGING_SUPABASE_SERVICE_ROLE_KEY: jwt(PRODUCTION_PROJECT_REF, 'service_role'), COMMERCE_STAGING_DATABASE_URL: `postgresql://postgres:test@db.${PRODUCTION_PROJECT_REF}.supabase.co/postgres` })), /known production/)
})

test('API hostname must match the explicitly selected staging project without alternate routes', () => {
  for (const url of [`https://${PRODUCTION_PROJECT_REF}.supabase.co`, 'http://127.0.0.1:54321', `https://${ref}.supabase.co.attacker.test`, `https://${ref}.supabase.co/rest/v1`, `https://${ref}.supabase.co?host=other`, `https://user:pass@${ref}.supabase.co`, `https://${ref}.supabase.co:444`]) {
    assert.throws(() => validateStagingConfig(config({ COMMERCE_STAGING_SUPABASE_URL: url })), /Staging API URL/)
  }
})

test('legacy JWT key project references and roles must match staging', () => {
  assert.throws(() => validateStagingConfig(config({ COMMERCE_STAGING_SUPABASE_ANON_KEY: jwt(PRODUCTION_PROJECT_REF, 'anon') })), /reference or role/)
  assert.throws(() => validateStagingConfig(config({ COMMERCE_STAGING_SUPABASE_SERVICE_ROLE_KEY: jwt(PRODUCTION_PROJECT_REF, 'service_role') })), /reference or role/)
  assert.throws(() => validateStagingConfig(config({ COMMERCE_STAGING_SUPABASE_SERVICE_ROLE_KEY: jwt(ref, 'anon') })), /must be different|reference or role/)
})

test('database host and session pooler identity cannot point at a different project', () => {
  for (const url of [`postgresql://postgres:test@db.${PRODUCTION_PROJECT_REF}.supabase.co/postgres`, 'postgresql://postgres:test@127.0.0.1/postgres', `postgresql://postgres.${PRODUCTION_PROJECT_REF}:test@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`, 'postgresql://postgres:test@example.test/postgres']) {
    assert.throws(() => validateStagingConfig(config({ COMMERCE_STAGING_DATABASE_URL: url })), /same staging project/)
  }
})

test('database URL overrides, transaction pooler and insecure TLS cannot bypass target checks', () => {
  const base = `postgresql://postgres:test@db.${ref}.supabase.co`
  for (const url of [`${base}/postgres?host=db.${PRODUCTION_PROJECT_REF}.supabase.co`, `${base}/postgres?hostaddr=1.2.3.4`, `${base}/postgres?options=-csearch_path=public`, `${base}/postgres?sslmode=disable`, `${base}:6543/postgres`, `${base}/other_database`, `${base}/postgres#fragment`]) {
    assert.throws(() => validateStagingConfig(config({ COMMERCE_STAGING_DATABASE_URL: url })))
  }
})

test('approved direct and session-pooler shapes always use verified TLS and explicit database options', () => {
  for (const url of [config().COMMERCE_STAGING_DATABASE_URL, `postgresql://postgres.${ref}:synthetic-test-only@aws-0-ap-south-1.pooler.supabase.com:5432/postgres`]) {
    const validated = validateStagingConfig(config({ COMMERCE_STAGING_DATABASE_URL: url }))
    assert.equal(validated.projectRef, ref)
    assert.equal(validated.database.ssl.rejectUnauthorized, true)
    assert.equal(validated.database.database, 'postgres')
    assert.equal(validated.database.port, 5432)
    assert.equal('connectionString' in validated.database, false)
  }
})
