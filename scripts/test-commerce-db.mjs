import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'

const root = fileURLToPath(new URL('../', import.meta.url))
const supplied = process.env.COMMERCE_TEST_DATABASE_URL
if (!supplied) throw new Error('Set COMMERCE_TEST_DATABASE_URL explicitly to a local commerce_test database. Production URLs are never inferred.')
const target = new URL(supplied)
assert.ok(['postgres:', 'postgresql:'].includes(target.protocol), 'Use a PostgreSQL development URL.')
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname), 'This destructive fixture runner permits loopback hosts only.')
assert.equal(target.pathname, '/commerce_test', 'Only the isolated database named commerce_test may be reset.')
assert.ok(!target.searchParams.has('host') && !target.searchParams.has('hostaddr'), 'Host overrides are not allowed.')
const managementUrl = new URL(target)
managementUrl.pathname = '/postgres'
const management = new Client({ connectionString: managementUrl.href, application_name: 'digital-dining-commerce-test-bootstrap' })
await management.connect()
try {
  const address = await management.query('select host(inet_server_addr()) as address')
  assert.ok(['127.0.0.1', '::1'].includes(address.rows[0].address), 'The database server must be local.')
  await management.query('DROP DATABASE IF EXISTS commerce_test WITH (FORCE)')
  await management.query('CREATE DATABASE commerce_test')
} finally {
  await management.end()
}

const client = new Client({ connectionString: target.href, application_name: 'digital-dining-commerce-sql-tests' })
await client.connect()
try {
  for (const relative of [
    'supabase/tests/commerce_bootstrap.sql',
    'supabase/migrations/20261022160000_commerce_foundation.sql',
    'supabase/tests/commerce_rls_checkout.sql',
  ]) {
    await client.query(await readFile(path.join(root, relative), 'utf8'))
    console.log(`PASS ${relative}`)
  }

  // Separate database connections exercise the row/advisory locks rather than
  // merely checking that a sequential implementation appears idempotent.
  const website = '20000000-0000-4000-8000-000000000001'
  const product = '40000000-0000-4000-8000-000000000001'
  const buyer = '10000000-0000-4000-8000-000000000003'
  const otherBuyer = '10000000-0000-4000-8000-000000000004'
  await client.query(`UPDATE public.commerce_websites SET features='{"catalog":true,"inventory":true,"cod":true}' WHERE id=$1`, [website])

  async function checkout(userId, key) {
    const connection = new Client({ connectionString: target.href, application_name: 'digital-dining-commerce-concurrency-test' })
    await connection.connect()
    try {
      await connection.query('BEGIN')
      await connection.query('SET LOCAL ROLE authenticated')
      await connection.query(`SELECT set_config('request.jwt.claim.sub',$1,true)`, [userId])
      const result = await connection.query('SELECT public.commerce_create_cod_order($1,$2,$3,$4,$5) AS result', [
        website,
        JSON.stringify([{ product_id: product, quantity: 1 }]),
        JSON.stringify({ name: 'Concurrent Buyer', phone: '9000000000', address: 'Local test address' }),
        'pickup', key,
      ])
      await connection.query('COMMIT')
      return result.rows[0].result
    } catch (error) {
      await connection.query('ROLLBACK')
      throw error
    } finally {
      await connection.end()
    }
  }

  await client.query('UPDATE public.commerce_products SET stock_quantity=1 WHERE id=$1', [product])
  const beforeRace = await client.query('SELECT count(*)::int AS count FROM public.commerce_orders')
  const competing = await Promise.allSettled([
    checkout(buyer, '50000000-0000-4000-8000-000000000101'),
    checkout(otherBuyer, '50000000-0000-4000-8000-000000000102'),
  ])
  assert.equal(competing.filter(result => result.status === 'fulfilled').length, 1, 'Only one competing checkout may consume the last unit.')
  const raceState = await client.query('SELECT stock_quantity,(SELECT count(*)::int FROM public.commerce_orders) AS count FROM public.commerce_products WHERE id=$1', [product])
  assert.equal(raceState.rows[0].stock_quantity, 0)
  assert.equal(raceState.rows[0].count, beforeRace.rows[0].count + 1)
  await client.query(`SELECT commerce_test.check_true(true,'concurrent checkouts cannot oversell the last unit')`)

  await client.query('UPDATE public.commerce_products SET stock_quantity=1 WHERE id=$1', [product])
  const identical = await Promise.all([
    checkout(buyer, '50000000-0000-4000-8000-000000000103'),
    checkout(buyer, '50000000-0000-4000-8000-000000000103'),
  ])
  assert.equal(identical[0].order.id, identical[1].order.id, 'Concurrent identical retries must return one order.')
  const replayStock = await client.query('SELECT stock_quantity FROM public.commerce_products WHERE id=$1', [product])
  assert.equal(replayStock.rows[0].stock_quantity, 0)
  await client.query(`SELECT commerce_test.check_true(true,'concurrent identical requests return one order and consume stock once')`)

  // An owner RPC must re-check authority after waiting for an Admin's website
  // lock. A check made only before the wait authorizes a recently revoked owner.
  async function rejectedAfterAdminChange(action, payload, label) {
    const admin = new Client({ connectionString: target.href, application_name: 'digital-dining-commerce-admin-revocation-test' })
    const owner = new Client({ connectionString: target.href, application_name: 'digital-dining-commerce-owner-revocation-test' })
    await Promise.all([admin.connect(), owner.connect()])
    let attempt
    try {
      const before = await client.query('SELECT stock_quantity FROM public.commerce_products WHERE id=$1', [product])
      await admin.query('BEGIN')
      await admin.query('SET LOCAL ROLE service_role')
      await admin.query('SELECT public.commerce_admin_action($1,$2,$3)', [action, JSON.stringify(payload), 'development-admin@example.test'])
      await owner.query('BEGIN')
      await owner.query('SET LOCAL ROLE authenticated')
      await owner.query(`SELECT set_config('request.jwt.claim.sub',$1,true)`, ['10000000-0000-4000-8000-000000000001'])
      const pid = (await owner.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
      attempt = owner.query('SELECT public.commerce_owner_action($1,$2,$3)', [website, 'adjust_stock', JSON.stringify({ product_id: product, delta: 1 })])
        .then(result => ({ result }), error => ({ error }))
      let blocked = false
      for (let iteration = 0; iteration < 100 && !blocked; iteration++) {
        const state = await client.query('SELECT cardinality(pg_blocking_pids($1)) > 0 AS blocked', [pid])
        blocked = state.rows[0].blocked
        if (!blocked) await new Promise(resolve => setTimeout(resolve, 10))
      }
      assert.ok(blocked, 'Owner mutation must wait behind the uncommitted Admin update.')
      await admin.query('COMMIT')
      const { error } = await attempt
      assert.equal(error?.code, '42501', 'Permission revocation must be observed after the website lock is acquired.')
      await owner.query('ROLLBACK')
      const after = await client.query('SELECT stock_quantity FROM public.commerce_products WHERE id=$1', [product])
      assert.equal(after.rows[0].stock_quantity, before.rows[0].stock_quantity)
      await client.query('SELECT commerce_test.check_true(true,$1)', [label])
    } finally {
      await admin.query('ROLLBACK').catch(() => {})
      if (attempt) await attempt
      await owner.query('ROLLBACK').catch(() => {})
      await Promise.all([admin.end(), owner.end()])
    }
  }

  await rejectedAfterAdminChange('assign_owner', { website_id: website, user_id: '10000000-0000-4000-8000-000000000002' }, 'owner mutation rechecks membership after concurrent Admin revocation')
  await client.query('SELECT public.commerce_admin_action($1,$2,$3)', ['assign_owner', JSON.stringify({ website_id: website, user_id: '10000000-0000-4000-8000-000000000001' }), 'development-admin@example.test'])
  await rejectedAfterAdminChange('save_website', { id: website, owner_permissions: { inventory: false } }, 'owner mutation rechecks permission after concurrent Admin restriction')

  const results = await client.query('select label from commerce_test.results order by id')
  for (const { label } of results.rows) console.log(`PASS ${label}`)
  console.log(`${results.rowCount} PostgreSQL assertions passed on an isolated local database.`)
  console.log('Hosted Supabase Auth hooks, Storage HTTP behavior and deployed RLS compatibility remain unverified; no production connection was used.')
} catch (error) {
  await client.query('ROLLBACK').catch(() => {})
  throw error
} finally {
  await client.end()
}
