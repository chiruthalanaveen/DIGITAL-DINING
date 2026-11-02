import assert from 'node:assert/strict'
import test from 'node:test'
import { developmentEnvironment, LOCAL_SERVICE_KEY } from './helpers/commerce-fixture.mjs'

test('development subprocesses retain execution context without inheriting application credentials', t => {
  const values = {
    CODEX_TEST_EXECUTION_CONTEXT: 'execution-context-sentinel',
    CODEX_TEST_API_KEY: 'private-prefixed-api-credential-sentinel',
    SUPABASE_SERVICE_ROLE_KEY: 'private-service-credential-sentinel',
    NEXT_PUBLIC_SUPABASE_URL: 'https://production-must-not-be-used.example.test',
    VERCEL_TOKEN: 'private-hosting-token-sentinel',
    RAZORPAY_SECRET: 'private-provider-secret-sentinel',
    COMMERCE_MAIN_DATABASE_URL: 'postgresql://private-database-must-not-be-used.example.test/main',
  }
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]))
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  })
  Object.assign(process.env, values)
  const env = developmentEnvironment()
  assert.equal(env.CODEX_TEST_EXECUTION_CONTEXT, values.CODEX_TEST_EXECUTION_CONTEXT)
  assert.equal(env.SUPABASE_SERVICE_ROLE_KEY, LOCAL_SERVICE_KEY)
  assert.equal(env.NEXT_PUBLIC_SUPABASE_URL, 'http://127.0.0.1:4319')
  for (const key of ['CODEX_TEST_API_KEY', 'VERCEL_TOKEN', 'RAZORPAY_SECRET', 'COMMERCE_MAIN_DATABASE_URL']) assert.equal(env[key], undefined)
})
