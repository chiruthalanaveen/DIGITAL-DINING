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

  // This versioned migration is intentionally one-time, not idempotent. A
  // second installation must fail without replacing definitions or losing the
  // already-created commerce history, bucket metadata or legacy fixture data.
  async function migrationSnapshot() {
    const schemas = ['public', 'commerce_private', 'auth', 'storage', 'cron']
    const definitions = await client.query(`
      SELECT jsonb_build_object(
        'schemas', (SELECT jsonb_agg(jsonb_build_object('name',n.nspname,'owner',n.nspowner,'acl',n.nspacl::text) ORDER BY n.nspname)
          FROM pg_namespace n WHERE n.nspname=ANY($1)),
        'relations', (SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'owner',c.relowner,'acl',c.relacl::text,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity) ORDER BY n.nspname,c.relname)
          FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($1)),
        'columns', (SELECT jsonb_agg(jsonb_build_object('table',a.attrelid::regclass::text,'number',a.attnum,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attrelid,a.attnum)
          FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
          WHERE n.nspname=ANY($1) AND a.attnum>0 AND NOT a.attisdropped),
        'constraints', (SELECT jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,'definition',pg_get_constraintdef(c.oid)) ORDER BY c.conrelid,c.conname)
          FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname=ANY($1)),
        'functions', (SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'owner',p.proowner,'acl',p.proacl::text,'definition',pg_get_functiondef(p.oid)) ORDER BY p.oid)
          FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=ANY($1) AND p.prokind='f'),
        'indexes', (SELECT jsonb_agg(to_jsonb(i) ORDER BY i.schemaname,i.tablename,i.indexname) FROM pg_indexes i WHERE i.schemaname=ANY($1)),
        'policies', (SELECT jsonb_agg(to_jsonb(p) ORDER BY p.schemaname,p.tablename,p.policyname) FROM pg_policies p WHERE p.schemaname=ANY($1)),
        'triggers', (SELECT jsonb_agg(jsonb_build_object('table',t.tgrelid::regclass::text,'name',t.tgname,'enabled',t.tgenabled,'internal',t.tgisinternal,'definition',pg_get_triggerdef(t.oid)) ORDER BY t.tgrelid,t.tgname)
          FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($1)),
        'default_grants', (SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid) FROM pg_default_acl d WHERE d.defaclnamespace=0 OR d.defaclnamespace IN (SELECT oid FROM pg_namespace WHERE nspname=ANY($1)))
      ) AS value
    `, [schemas])
    const tables = await client.query(`SELECT n.nspname AS schema,c.relname AS name FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($1) AND c.relkind='r' ORDER BY n.nspname,c.relname`, [schemas])
    const commerceRows = {}, legacyRows = {}
    let bucketRows
    for (const table of tables.rows) {
      // Identifiers come only from the fixed local fixture schemas. Quote them
      // independently instead of interpolating a URL or caller-supplied name.
      assert.match(table.schema, /^[a-z_][a-z0-9_]*$/)
      assert.match(table.name, /^[a-z_][a-z0-9_]*$/)
      const rows = await client.query(`SELECT coalesce(jsonb_agg(to_jsonb(record) ORDER BY to_jsonb(record)::text),'[]'::jsonb) AS value FROM "${table.schema}"."${table.name}" AS record`)
      const key = `${table.schema}.${table.name}`
      if (table.schema === 'public' && table.name.startsWith('commerce_')) commerceRows[key] = rows.rows[0].value
      else if (key === 'storage.buckets') bucketRows = rows.rows[0].value
      else legacyRows[key] = rows.rows[0].value
    }
    assert.equal(Object.keys(commerceRows).length, 9, 'The rerun snapshot must cover all nine commerce tables.')
    assert.ok(Array.isArray(bucketRows) && bucketRows.some(bucket => bucket.id === 'commerce-media'), 'Snapshot must include the installed commerce bucket.')
    return { definitions: definitions.rows[0].value, commerceRows, legacyRows, bucketRows }
  }

  const beforeReapplication = await migrationSnapshot()
  let reapplicationError
  try { await client.query(await readFile(path.join(root, 'supabase/migrations/20261022160000_commerce_foundation.sql'), 'utf8')) }
  catch (error) { reapplicationError = error }
  assert.equal(reapplicationError?.code, '42P06', 'Reapplying the one-time file must reject the existing schema, not silently replace it.')
  let abortedTransactionError
  try { await client.query('SELECT 1') }
  catch (error) { abortedTransactionError = error }
  await client.query('ROLLBACK')
  assert.equal(abortedTransactionError?.code, '25P02', 'A failed migration transaction must be rolled back before further statements can execute.')
  const afterReapplication = await migrationSnapshot()
  await client.query(`SELECT commerce_test.check_true(true,'second application of the one-time migration rejects the existing schema')`)
  await client.query(`SELECT commerce_test.check_true(true,'failed migration reapplication remains aborted until explicit rollback')`)
  assert.deepEqual(afterReapplication.definitions, beforeReapplication.definitions, 'Migration rerun must preserve schema definitions, constraints, functions, indexes, triggers, RLS and grants.')
  await client.query(`SELECT commerce_test.check_true(true,'failed migration reapplication preserves new and legacy definitions, RLS and grants')`)
  assert.deepEqual(afterReapplication.commerceRows, beforeReapplication.commerceRows, 'Migration rerun must preserve every existing commerce record.')
  await client.query(`SELECT commerce_test.check_true(true,'failed migration reapplication preserves all nine commerce tables data')`)
  assert.deepEqual(afterReapplication.legacyRows, beforeReapplication.legacyRows, 'Migration rerun must preserve legacy wallet/order, Auth, Storage object and cron fixtures.')
  await client.query(`SELECT commerce_test.check_true(true,'failed migration reapplication preserves Auth, legacy wallet-order, Storage object and cron fixtures')`)
  assert.deepEqual(afterReapplication.bucketRows, beforeReapplication.bucketRows, 'Migration rerun must not replace or reconfigure any existing bucket metadata.')
  await client.query(`SELECT commerce_test.check_true(true,'failed migration reapplication preserves commerce and legacy bucket metadata')`)

  // Exercise the actual read-only release-verification SQL, not a duplicated
  // expression: PostgreSQL treats comma-separated privilege lists as ANY, while
  // a healthy service-role result must require SELECT, INSERT, UPDATE and DELETE.
  const verificationSql = await readFile(path.join(root, 'supabase/tests/commerce_verify.sql'), 'utf8')
  async function inspectServiceGrants() {
    let statements
    try { statements = await client.query(verificationSql) }
    catch (error) {
      await client.query('ROLLBACK').catch(() => {})
      throw error
    }
    assert.ok(Array.isArray(statements), 'Verification must execute the complete multi-statement SQL file.')
    const grants = statements.find(statement => statement.fields.some(field => field.name === 'service_access'))
    assert.ok(grants, 'Verification must include its table privilege report.')
    assert.equal(grants.rows.length, 9, 'Verification must inspect all nine commerce tables.')
    assert.equal(new Set(grants.rows.map(row => row.table_name)).size, 9)
    return grants.rows
  }

  assert.ok((await inspectServiceGrants()).every(row => row.service_access === true))
  await client.query(`SELECT commerce_test.check_true(true,'release verification confirms all service privileges on all nine tables')`)
  for (const privilege of ['SELECT', 'INSERT', 'UPDATE', 'DELETE']) {
    try {
      await client.query(`REVOKE ${privilege} ON public.commerce_categories FROM service_role`)
      const rows = await inspectServiceGrants()
      assert.equal(rows.find(row => row.table_name === 'commerce_categories').service_access, false, `Missing ${privilege} must fail service access even while the other three grants remain.`)
      assert.ok(rows.filter(row => row.table_name !== 'commerce_categories').every(row => row.service_access === true), 'A single-table revocation must not affect the other eight reports.')
      await client.query('SELECT commerce_test.check_true(true,$1)', [`release verification detects missing service-role ${privilege} without failing unrelated tables`])
    } finally {
      // This runner is guarded to disposable loopback commerce_test. Always
      // restore the deliberate fixture grant before any later assertions.
      await client.query(`GRANT ${privilege} ON public.commerce_categories TO service_role`)
    }
  }
  assert.ok((await inspectServiceGrants()).every(row => row.service_access === true))
  await client.query(`SELECT commerce_test.check_true(true,'release verification returns healthy after every fixture privilege is restored')`)

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
