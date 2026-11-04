import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'

// Destructive fixtures are deliberately restricted to one disposable database.
// No environment/project URL is inferred and no hosted migration tool is used.
const root = fileURLToPath(new URL('../', import.meta.url))
const supplied = process.env.COMMERCE_TEST_DATABASE_URL
assert.ok(supplied, 'Set COMMERCE_TEST_DATABASE_URL explicitly to loopback commerce_test.')
const target = new URL(supplied)
assert.ok(['postgres:', 'postgresql:'].includes(target.protocol))
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname), 'Only loopback database hosts are allowed.')
assert.equal(target.pathname, '/commerce_test', 'Only the disposable commerce_test database may be reset.')
assert.equal(target.search, '', 'Connection-query overrides are not permitted.')
assert.equal(target.hash, '', 'Database URL fragments are not permitted.')

const migrations = [
  'supabase/migrations/20261102160000_commerce_catalog_fulfillment.sql',
  'supabase/migrations/20261102161000_commerce_customer_experience.sql',
  'supabase/migrations/20261102162000_commerce_growth_notifications.sql',
  'supabase/migrations/20261103090000_commerce_verified_domains.sql',
  'supabase/migrations/20261103091000_commerce_online_payments.sql',
  'supabase/migrations/20261104090000_commerce_payment_recovery_queue.sql',
]
const suites = [
  'supabase/tests/commerce_catalog_expansion.sql',
  'supabase/tests/commerce_customer_experience.sql',
  'supabase/tests/commerce_growth_notifications.sql',
  'supabase/tests/commerce_growth_analytics.sql',
  'supabase/tests/commerce_verified_domains.sql',
  'supabase/tests/commerce_online_payments.sql',
  'supabase/tests/commerce_payment_recovery_queue.sql',
]
// Later increments must be explicitly reviewed and added here. Never glob the
// migrations directory: it also contains a separate, unapplied platform ledger.

function connection(label) {
  return new Client({ connectionString: target.href, application_name: `commerce-expansion-${label}`, statement_timeout: 15000 })
}
async function verifyEndpoint(client) {
  const { rows: [row] } = await client.query('SELECT current_database() AS database,host(inet_server_addr()) AS address')
  assert.equal(row.database, 'commerce_test')
  assert.ok(['127.0.0.1', '::1'].includes(row.address), 'The connected server must be loopback.')
}

// The original guarded runner recreates only commerce_test, then runs all 88
// original SQL/concurrency/reapplication/grant checks without source changes.
await import('./test-commerce-db.mjs')
const db = connection('integration')
await db.connect()
await verifyEndpoint(db)
const schemas = ['public', 'commerce_private', 'auth', 'storage', 'cron']
const quoteIdentifier = value => `"${value.replaceAll('"', '""')}"`
const qualified = table => `${quoteIdentifier(table.schema)}.${quoteIdentifier(table.name)}`
async function check(label) {
  await db.query('SELECT commerce_test.check_true(true,$1)', [label])
  console.log(`PASS ${label}`)
}
async function tables() {
  return (await db.query(`SELECT n.nspname AS schema,c.relname AS name,
    (SELECT array_agg(a.attname::text ORDER BY a.attnum) FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
    c.relacl::text AS acl,c.relrowsecurity AS rls,c.relforcerowsecurity AS force_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname=ANY($1) AND c.relkind='r' ORDER BY 1,2`, [schemas])).rows
}
async function rowsFor(definitions) {
  const data = {}
  for (const table of definitions) {
    const columns = table.columns.map(quoteIdentifier).join(',')
    data[`${table.schema}.${table.name}`] = (await db.query(`SELECT coalesce(jsonb_agg(to_jsonb(record) ORDER BY to_jsonb(record)::text),'[]'::jsonb) AS value FROM (SELECT ${columns} FROM ${qualified(table)}) record`)).rows[0].value
  }
  return data
}
async function policies() {
  return (await db.query('SELECT * FROM pg_policies WHERE schemaname=ANY($1) ORDER BY schemaname,tablename,policyname', [schemas])).rows
}
async function definitions() {
  // Capture definitions, ACLs and RLS, not only object counts. A failed second
  // migration must preserve every installed definition and every business row.
  return (await db.query(`SELECT jsonb_build_object(
    'relations',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'kind',c.relkind,'owner',c.relowner,'acl',c.relacl::text,'rls',c.relrowsecurity,'force_rls',c.relforcerowsecurity) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($1)),
    'columns',(SELECT jsonb_agg(jsonb_build_object('table',a.attrelid::regclass::text,'number',a.attnum,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'not_null',a.attnotnull,'identity',a.attidentity,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY a.attrelid,a.attnum) FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname=ANY($1) AND a.attnum>0 AND NOT a.attisdropped),
    'constraints',(SELECT jsonb_agg(jsonb_build_object('table',c.conrelid::regclass::text,'name',c.conname,'definition',pg_get_constraintdef(c.oid)) ORDER BY c.conrelid,c.conname) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname=ANY($1)),
    'functions',(SELECT jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'owner',p.proowner,'acl',p.proacl::text,'security',p.prosecdef,'config',p.proconfig,'definition',pg_get_functiondef(p.oid)) ORDER BY p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=ANY($1) AND p.prokind='f'),
    'indexes',(SELECT jsonb_agg(to_jsonb(i) ORDER BY i.schemaname,i.tablename,i.indexname) FROM pg_indexes i WHERE i.schemaname=ANY($1)),
    'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY p.schemaname,p.tablename,p.policyname) FROM pg_policies p WHERE p.schemaname=ANY($1)),
    'triggers',(SELECT jsonb_agg(jsonb_build_object('table',t.tgrelid::regclass::text,'name',t.tgname,'enabled',t.tgenabled,'internal',t.tgisinternal,'definition',pg_get_triggerdef(t.oid)) ORDER BY t.tgrelid,t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($1)),
    'default_grants',(SELECT jsonb_agg(to_jsonb(d) ORDER BY d.oid) FROM pg_default_acl d WHERE d.defaclnamespace=0 OR d.defaclnamespace IN (SELECT oid FROM pg_namespace WHERE nspname=ANY($1)))
  ) AS value`, [schemas])).rows[0].value
}
async function functions() {
  return (await db.query(`SELECT n.nspname AS schema,p.proname AS name,pg_get_function_identity_arguments(p.oid) AS arguments,
    p.prosrc AS body,p.prosecdef AS security,p.proconfig AS config,p.proowner AS owner,p.proacl::text AS acl
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=ANY($1) AND p.prokind='f' ORDER BY 1,2,3`, [schemas])).rows
}
async function actor(user, sql, args = [], role = 'authenticated') {
  assert.ok(['authenticated', 'service_role'].includes(role))
  const client = connection('actor')
  await client.connect()
  try {
    await verifyEndpoint(client)
    await client.query('BEGIN')
    await client.query(`SET LOCAL ROLE ${role}`)
    await client.query("SELECT set_config('request.jwt.claim.sub',$1,true),set_config('request.jwt.claim.role',$2,true)", [user || '', role])
    const result = await client.query(sql, args)
    await client.query('COMMIT')
    return result.rows[0]?.result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally { await client.end() }
}
async function mustReject(user, sql, args, label, code = '22023', role = 'authenticated') {
  await assert.rejects(actor(user, sql, args, role), error => error.code === code, label)
  await check(label)
}
async function waitBlocked(pid) {
  for (let iteration = 0; iteration < 150; iteration++) {
    if ((await db.query('SELECT cardinality(pg_blocking_pids($1))>0 AS blocked', [pid])).rows[0].blocked) return
    await new Promise(resolve => setTimeout(resolve, 10))
  }
  throw new Error('Expected the independent connection to wait behind the uncommitted website lock.')
}
async function revokedWhileWaiting({ website, user, sql, args, change, restore, label }) {
  const admin = connection('revocation-admin'), pending = connection('revocation-actor')
  await Promise.all([admin.connect(), pending.connect()])
  let attempt
  try {
    await Promise.all([verifyEndpoint(admin), verifyEndpoint(pending)])
    await admin.query('BEGIN')
    await admin.query('SELECT id FROM public.commerce_websites WHERE id=$1 FOR UPDATE', [website])
    await admin.query(change.sql, change.args)
    await pending.query('BEGIN')
    await pending.query('SET LOCAL ROLE authenticated')
    await pending.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [user])
    const pid = (await pending.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
    attempt = pending.query(sql, args).then(result => ({ result }), error => ({ error }))
    await waitBlocked(pid)
    await admin.query('COMMIT')
    assert.equal((await attempt).error?.code, '42501', label)
    await pending.query('ROLLBACK')
    await check(label)
  } finally {
    await admin.query('ROLLBACK').catch(() => {})
    if (attempt) await attempt
    await pending.query('ROLLBACK').catch(() => {})
    await Promise.all([admin.end(), pending.end()])
    await db.query(restore.sql, restore.args)
  }
}

try {
  assert.equal((await db.query('SELECT count(*)::int AS count FROM commerce_test.results')).rows[0].count, 88)
  await db.query(await readFile(path.join(root, 'supabase/tests/commerce_expansion_preexisting_orders.sql'), 'utf8'))
  const originalTables = await tables(), originalPolicies = await policies(), originalFunctions = await functions()
  assert.equal(originalTables.length, 14, 'Preservation must cover all fourteen original fixture tables.')
  assert.equal(originalPolicies.length, 18, 'Preservation must cover all eighteen original policies.')
  const originalRows = await rowsFor(originalTables)
  for (const relative of migrations) {
    const recoveryQueue = relative.endsWith('_commerce_payment_recovery_queue.sql')
    const beforeQueueDefinitions = recoveryQueue ? await definitions() : null
    const beforeQueueRows = recoveryQueue ? await rowsFor(await tables()) : null
    await db.query(await readFile(path.join(root, relative), 'utf8'))
    console.log(`PASS ${relative}`)
    if (recoveryQueue) {
      const afterQueueDefinitions = await definitions()
      const addedFunction = afterQueueDefinitions.functions.filter(value => /^(public\.)?commerce_payment_reconciliation_queue\(uuid\)$/.test(value.signature))
      assert.equal(addedFunction.length, 1, 'Recovery migration must add exactly its one public queue function.')
      afterQueueDefinitions.functions = afterQueueDefinitions.functions.filter(value => !addedFunction.includes(value))
      assert.deepEqual(afterQueueDefinitions, beforeQueueDefinitions, 'Recovery queue must preserve all five-migration definitions, grants, RLS, tables, indexes, constraints and triggers.')
      assert.deepEqual(await rowsFor(await tables()), beforeQueueRows, 'Recovery queue installation must preserve all five-migration and legacy records.')
      await check('recovery queue migration adds only its function and preserves all five-migration definitions, policies, grants and rows')
    }
  }
  assert.deepEqual(await rowsFor(originalTables), originalRows, 'All original columns and business records must remain unchanged on installation.')
  await check('expansion installation preserves every row across all fourteen original tables')
  const installedPolicies = await policies()
  assert.deepEqual(installedPolicies.filter(policy => originalPolicies.some(original => original.schemaname === policy.schemaname && original.tablename === policy.tablename && original.policyname === policy.policyname)), originalPolicies)
  await check('expansion installation preserves all eighteen original RLS policy definitions')
  const installedTables = await tables()
  for (const original of originalTables) {
    const installed = installedTables.find(table => table.schema === original.schema && table.name === original.name)
    for (const attribute of ['acl', 'rls', 'force_rls']) assert.equal(installed[attribute], original[attribute])
  }
  await check('expansion installation preserves original table grants and RLS enablement')
  const installedFunctions = await functions()
  for (const original of originalFunctions) {
    const renamed = original.schema === 'public' && ['commerce_create_cod_order', 'commerce_owner_action'].includes(original.name)
    const expectedName = renamed ? `legacy_${original.name.slice('commerce_'.length)}` : original.name
    const installed = installedFunctions.find(value => value.schema === (renamed ? 'commerce_private' : original.schema) && value.name === expectedName && value.arguments === original.arguments)
    assert.ok(installed, `Existing function ${original.schema}.${original.name} must remain present.`)
    if (renamed) {
      for (const attribute of ['body', 'security', 'config', 'owner']) assert.deepEqual(installed[attribute], original[attribute])
    } else assert.deepEqual(installed, original)
  }
  await check('expansion installation preserves every original function and the exact privately retained checkout/owner bodies')

  // Re-execute the original 72 SQL behavior checks after RPC replacements. A
  // rollback-only clean fixture avoids changing or deleting recorded history.
  // TRUNCATE happens exclusively inside this verified disposable database and
  // the rollback restores all pre-existing rows, including immutable timelines.
  const beforeCompatibility = await rowsFor(await tables())
  const firstResult = (await db.query('SELECT coalesce(max(id),0)::int AS id FROM commerce_test.results')).rows[0].id
  const legacySql = await readFile(path.join(root, 'supabase/tests/commerce_rls_checkout.sql'), 'utf8')
  const body = legacySql.slice(legacySql.indexOf('SELECT commerce_test.check_true(')).replace(/COMMIT;\s*$/i, '')
  let compatibilityLabels
  await db.query('BEGIN')
  try {
    const commerceTables = (await tables()).filter(table => table.schema === 'public' && table.name.startsWith('commerce_'))
    await db.query(`TRUNCATE TABLE auth.users,storage.objects,commerce_test.state,${commerceTables.map(qualified).join(',')} CASCADE`)
    await db.query(body)
    compatibilityLabels = (await db.query('SELECT label FROM commerce_test.results WHERE id>$1 ORDER BY id', [firstResult])).rows.map(row => row.label)
    assert.equal(compatibilityLabels.length, 72)
  } finally { await db.query('ROLLBACK') }
  assert.deepEqual(await rowsFor(await tables()), beforeCompatibility)
  for (const label of compatibilityLabels) await check(`post-expansion baseline: ${label}`)
  await check('rollback-only baseline recheck restores every original and expansion record')

  for (const relative of suites) {
    const before = (await db.query('SELECT count(*)::int AS count FROM commerce_test.results')).rows[0].count
    await db.query(await readFile(path.join(root, relative), 'utf8'))
    const after = (await db.query('SELECT count(*)::int AS count FROM commerce_test.results')).rows[0].count
    console.log(`PASS ${relative} (${after - before} PostgreSQL assertions)`)
  }

  const readOnlyQueue = connection('readonly-recovery-queue')
  await readOnlyQueue.connect()
  try {
    await verifyEndpoint(readOnlyQueue)
    await readOnlyQueue.query('BEGIN READ ONLY')
    await readOnlyQueue.query('SET LOCAL ROLE service_role')
    const value = (await readOnlyQueue.query('SELECT public.commerce_payment_reconciliation_queue($1) AS value', ['42000000-0000-4000-8000-000000000001'])).rows[0].value
    assert.equal(value.total_count, 105)
    assert.equal(value.intents.length, 100)
    assert.equal(value.intents[0].state, 'captured_unfulfilled')
    await readOnlyQueue.query('COMMIT')
    await check('service-only recovery queue executes successfully inside a PostgreSQL READ ONLY transaction')
  } finally {
    await readOnlyQueue.query('ROLLBACK').catch(() => {})
    await readOnlyQueue.end()
  }

  const website = '92000000-0000-4000-8000-000000000001'
  const product = '94000000-0000-4000-8000-000000000001'
  const owner = '91000000-0000-4000-8000-000000000001'
  const buyer = '91000000-0000-4000-8000-000000000003'
  const variant = (await db.query("SELECT value->>'id' AS id FROM commerce_test.state WHERE key='catalog_variant'")).rows[0].id
  const customer = { name: 'Concurrent Buyer', phone: '9000000000', address: 'Local fixture address' }
  const items = [{ product_id: product, variant_id: variant, quantity: 1 }]
  const orderSql = 'SELECT public.commerce_create_cod_order_v2($1,$2,$3,$4,$5,$6) AS result'
  const checkout = (user, key, code = '', orderItems = items) => actor(user, orderSql, [website, JSON.stringify(orderItems), JSON.stringify(customer), 'pickup', key, code])
  const catalogSql = 'SELECT public.commerce_catalog_owner_action($1,$2,$3) AS result'
  const quoteSql = 'SELECT public.commerce_checkout_quote_v2($1,$2,$3,$4) AS result'

  const serviceTables = ['commerce_store_settings', 'commerce_product_profiles', 'commerce_product_images', 'commerce_product_variants', 'commerce_delivery_zones', 'commerce_saved_addresses', 'commerce_wishlist_items', 'commerce_reviews', 'commerce_order_requests', 'commerce_order_status_events', 'commerce_coupons', 'commerce_coupon_redemptions', 'commerce_notification_outbox']
  for (const table of serviceTables) {
    const privileges = (await db.query("SELECT has_table_privilege('service_role',$1,'INSERT,UPDATE,DELETE,TRUNCATE') AS mutation", [`public.${table}`])).rows[0]
    assert.equal(privileges.mutation, false, `Service clients must use validated RPCs for ${table}.`)
  }
  await check('all thirteen core/customer/growth tables deny direct service-role mutations')
  const adminWorkspace = await actor(null, 'SELECT public.commerce_catalog_admin_action($1,$2,$3) AS result', [website, 'get_workspace', '{}'], 'service_role')
  assert.deepEqual(Object.keys(adminWorkspace).sort(), ['delivery_zones', 'images', 'product_profiles', 'settings', 'variants'])
  assert.equal(adminWorkspace.settings.website_id, website)
  assert.ok(adminWorkspace.variants.length >= 2 && adminWorkspace.variants.every(row => row.website_id === website))
  await check('service-only Admin catalog workspace returns tenant-scoped extension records')
  await mustReject(owner, 'SELECT public.commerce_catalog_admin_action($1,$2,$3) AS result', [website, 'get_workspace', '{}'], 'authenticated owners cannot execute the Admin workspace action', '42501')

  await db.query('UPDATE public.commerce_product_variants SET active=true,stock_quantity=1 WHERE id=$1', [variant])
  const beforeRace = (await db.query('SELECT count(*)::int AS count FROM public.commerce_orders')).rows[0].count
  const race = await Promise.allSettled([checkout(buyer, '95100000-0000-4000-8000-000000000001'), checkout(owner, '95100000-0000-4000-8000-000000000002')])
  assert.equal(race.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(race.find(result => result.status === 'rejected').reason.code, '22023')
  assert.equal((await db.query('SELECT stock_quantity FROM public.commerce_product_variants WHERE id=$1', [variant])).rows[0].stock_quantity, 0)
  assert.equal((await db.query('SELECT count(*)::int AS count FROM public.commerce_orders')).rows[0].count, beforeRace + 1)
  await check('simultaneous variant checkouts consume the last unit once with no partial order')

  await db.query('UPDATE public.commerce_product_variants SET stock_quantity=1 WHERE id=$1', [variant])
  const replayKey = '95100000-0000-4000-8000-000000000003'
  const retry = await Promise.all([checkout(buyer, replayKey), checkout(buyer, replayKey)])
  assert.equal(retry[0].order.id, retry[1].order.id)
  assert.equal((await db.query('SELECT stock_quantity FROM public.commerce_product_variants WHERE id=$1', [variant])).rows[0].stock_quantity, 0)
  await check('simultaneous variant retries return one order and decrement stock once')
  const cancel = () => actor(owner, 'SELECT public.commerce_owner_action($1,$2,$3) AS result', [website, 'update_order_status', JSON.stringify({ order_id: retry[0].order.id, status: 'cancelled' })])
  await Promise.all([cancel(), cancel()])
  assert.equal((await db.query('SELECT stock_quantity FROM public.commerce_product_variants WHERE id=$1', [variant])).rows[0].stock_quantity, 1)
  assert.equal((await checkout(buyer, replayKey)).order.id, retry[0].order.id)
  await check('simultaneous cancellations restock once and a later idempotent replay never consumes stock')

  for (const badQuantity of ['1', true, null, 1.5, 0, 1000]) {
    await mustReject(buyer, quoteSql, [website, JSON.stringify([{ product_id: product, quantity: badQuantity }]), JSON.stringify(customer), 'pickup'], `checkout rejects invalid JSON quantity ${JSON.stringify(badQuantity)}`)
  }
  await mustReject(buyer, quoteSql, [website, JSON.stringify([{ product_id: product, variant_id: null, quantity: 1 }]), JSON.stringify(customer), 'pickup'], 'checkout rejects explicit null variant identifiers')
  for (const badId of [null, true, 94000000000040008000000000000001, '']) {
    await mustReject(owner, catalogSql, [website, 'save_product_options', JSON.stringify({ product_id: badId, variants_required: false, images: [] })], `catalog identifiers reject ${JSON.stringify(badId)}`)
    await mustReject(buyer, quoteSql, [website, JSON.stringify([{ product_id: product, quantity: 1 }]), JSON.stringify({ ...customer, saved_address_id: badId }), 'pickup'], `saved-address checkout identifiers reject ${JSON.stringify(badId)}`)
  }
  await mustReject(owner, catalogSql, [website, 'save_product_options', `{"product_id":${product.replaceAll('-', '')},"variants_required":false,"images":[]}`], 'catalog rejects an exact 32-digit JSON number that PostgreSQL could coerce to a compact UUID')
  for (const patch of [{ name: 'A' }, { phone: '-------' }, { address: 'x'.repeat(1001) }, { user_id: owner }, { address: null }, { pincode: 560001 }]) {
    await mustReject(buyer, quoteSql, [website, JSON.stringify([{ product_id: product, quantity: 1 }]), JSON.stringify({ ...customer, ...patch }), 'pickup'], `checkout validates customer field ${Object.keys(patch)[0]} and its JSON type`)
  }
  await mustReject(buyer, quoteSql, [website, JSON.stringify([{ product_id: product, quantity: 1 }]), JSON.stringify({ ...customer, address: 'tiny' }), 'delivery'], 'delivery checkout requires at least five address characters')
  await mustReject(owner, catalogSql, [website, 'save_settings', JSON.stringify({ policies: { returns_enabled: true, return_days: 7 } })], 'enabled returns require nonempty written return terms')

  const growthWebsite = '21000000-0000-4000-8000-000000000001', growthOwner = '11000000-0000-4000-8000-000000000001'
  const growthSql = 'SELECT public.commerce_growth_owner_action($1,$2,$3) AS result'
  const couponPayload = { code: 'STRICTJSON', kind: 'fixed', discount_value: 10, minimum_subtotal_paise: 0, per_customer_limit: 1 }
  for (const badId of [null, true, 21000000000040008000000000000001, '']) {
    await mustReject(growthOwner, growthSql, [growthWebsite, 'save_coupon', JSON.stringify({ ...couponPayload, id: badId })], `coupon identifiers reject ${JSON.stringify(badId)}`)
    await mustReject(null, 'SELECT public.commerce_notification_admin($1,$2) AS result', ['retry', JSON.stringify({ id: badId })], `notification retry identifiers reject ${JSON.stringify(badId)}`, '22023', 'service_role')
  }
  await mustReject(growthOwner, growthSql, [growthWebsite, null, JSON.stringify(couponPayload)], 'coupon action rejects SQL NULL')
  await mustReject(null, 'SELECT public.commerce_notification_admin($1,$2) AS result', [null, '{}'], 'notification admin rejects SQL NULL action', '22023', 'service_role')
  await mustReject(null, 'SELECT public.commerce_notification_admin($1,$2) AS result', ['status', null], 'notification status rejects SQL NULL payload', '22023', 'service_role')

  await revokedWhileWaiting({ website, user: owner, sql: catalogSql, args: [website, 'adjust_variant_stock', JSON.stringify({ variant_id: variant, delta: 1 })],
    change: { sql: 'UPDATE public.commerce_memberships SET active=false WHERE website_id=$1 AND user_id=$2', args: [website, owner] },
    restore: { sql: 'UPDATE public.commerce_memberships SET active=true WHERE website_id=$1 AND user_id=$2', args: [website, owner] },
    label: 'catalog mutation rechecks membership after concurrent Admin revocation' })
  await revokedWhileWaiting({ website, user: buyer, sql: orderSql, args: [website, JSON.stringify(items), JSON.stringify(customer), 'pickup', '95100000-0000-4000-8000-000000000004', ''],
    change: { sql: 'UPDATE auth.users SET email_confirmed_at=null WHERE id=$1', args: [buyer] },
    restore: { sql: 'UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1', args: [buyer] },
    label: 'checkout rechecks verified Auth identity after concurrent withdrawal' })
  await revokedWhileWaiting({ website, user: buyer, sql: 'SELECT public.commerce_customer_experience($1,$2,$3)', args: [website, 'wishlist_add', JSON.stringify({ product_id: product })],
    change: { sql: 'UPDATE auth.users SET email_confirmed_at=null WHERE id=$1', args: [buyer] },
    restore: { sql: 'UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1', args: [buyer] },
    label: 'customer mutation rechecks verified Auth identity after concurrent withdrawal' })
  await revokedWhileWaiting({ website: growthWebsite, user: growthOwner, sql: growthSql, args: [growthWebsite, 'save_coupon', JSON.stringify(couponPayload)],
    change: { sql: 'UPDATE public.commerce_memberships SET active=false WHERE website_id=$1 AND user_id=$2', args: [growthWebsite, growthOwner] },
    restore: { sql: 'UPDATE public.commerce_memberships SET active=true WHERE website_id=$1 AND user_id=$2', args: [growthWebsite, growthOwner] },
    label: 'growth mutation rechecks membership after concurrent Admin revocation' })
  await revokedWhileWaiting({ website, user: owner, sql: 'SELECT public.commerce_owner_engagement($1)', args: [website],
    change: { sql: 'UPDATE public.commerce_memberships SET active=false WHERE website_id=$1 AND user_id=$2', args: [website, owner] },
    restore: { sql: 'UPDATE public.commerce_memberships SET active=true WHERE website_id=$1 AND user_id=$2', args: [website, owner] },
    label: 'owner engagement rechecks membership after concurrent Admin revocation' })

  const raceCoupon = await actor(owner, growthSql, [website, 'save_coupon', JSON.stringify({ code: 'FINALUSE', kind: 'fixed', discount_value: 10, minimum_subtotal_paise: 0, usage_limit: 1, per_customer_limit: 1 })])
  await db.query('UPDATE public.commerce_product_variants SET stock_quantity=10 WHERE id=$1', [variant])
  const couponRace = await Promise.allSettled([checkout(buyer, '95100000-0000-4000-8000-000000000005', 'FINALUSE'), checkout(owner, '95100000-0000-4000-8000-000000000006', 'FINALUSE')])
  assert.equal(couponRace.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(couponRace.find(result => result.status === 'rejected').reason.code, '22023')
  assert.equal((await db.query('SELECT count(*)::int AS count FROM public.commerce_coupon_redemptions WHERE coupon_id=$1', [raceCoupon.id])).rows[0].count, 1)
  assert.equal((await db.query('SELECT stock_quantity FROM public.commerce_product_variants WHERE id=$1', [variant])).rows[0].stock_quantity, 9)
  await check('simultaneous final coupon use creates one redemption and rolls back losing order stock')
  const couponOrder = couponRace.find(result => result.status === 'fulfilled').value
  const couponBuyer = couponOrder.order.customer_user_id
  const requestSnapshot = await actor(couponBuyer, 'SELECT public.commerce_customer_experience($1,$2,$3) AS result', [website, 'request_create', JSON.stringify({ order_id: couponOrder.order.id, type: 'cancellation', reason: 'Cancel this synthetic discounted variant order.' })])
  const cancellation = requestSnapshot.requests.find(request => request.order_id === couponOrder.order.id)
  const approveCancellation = () => actor(owner, 'SELECT public.commerce_owner_engagement($1,$2,$3) AS result', [website, 'request_decide', JSON.stringify({ request_id: cancellation.id, decision: 'approved', note: 'Synthetic approval.' })])
  await Promise.all([approveCancellation(), approveCancellation()])
  assert.equal((await db.query('SELECT stock_quantity FROM public.commerce_product_variants WHERE id=$1', [variant])).rows[0].stock_quantity, 10)
  assert.equal((await db.query('SELECT count(*)::int AS count FROM public.commerce_coupon_redemptions WHERE coupon_id=$1', [raceCoupon.id])).rows[0].count, 1)
  assert.equal((await db.query('SELECT status,payment_status FROM public.commerce_orders WHERE id=$1', [couponOrder.order.id])).rows[0].status, 'cancelled')
  await check('simultaneous customer cancellation decisions restock variant once and retain coupon redemption history')

  const addressPayload = { label: 'Integration', name: 'Saved Buyer', phone: '9000000000', address: 'Stored shipping address', pincode: '560001', is_default: true }
  const saved = await actor(buyer, 'SELECT public.commerce_customer_experience($1,$2,$3) AS result', [website, 'address_save', JSON.stringify(addressPayload)])
  const address = saved.addresses.find(row => row.label === addressPayload.label)
  const savedCustomer = { name: 'Saved Buyer', phone: '9000000000', saved_address_id: address.id, address: 'Ignored submitted shipping address', pincode: '999999' }
  const savedQuote = await actor(buyer, quoteSql, [website, JSON.stringify(items), JSON.stringify(savedCustomer), 'delivery'])
  assert.equal(savedQuote.delivery_fee_paise, 125)
  assert.equal(savedQuote.delivery_zone.name, 'Local fixture zone')
  await check('v2 quote uses owned saved-address PIN and zone fee instead of caller-supplied shipping details')
  await mustReject(owner, quoteSql, [website, JSON.stringify(items), JSON.stringify(savedCustomer), 'delivery'], 'v2 quote cannot use another customer saved address', '42501')
  await mustReject(buyer, quoteSql, [website, JSON.stringify(items), JSON.stringify({ ...savedCustomer, address: false }), 'delivery'], 'saved-address checkout still rejects malformed submitted optional fields')
  const savedKey = '95100000-0000-4000-8000-000000000007'
  const savedOrder = await actor(buyer, orderSql, [website, JSON.stringify(items), JSON.stringify(savedCustomer), 'delivery', savedKey, ''])
  assert.equal(savedOrder.order.customer_details.address, addressPayload.address)
  await actor(buyer, 'SELECT public.commerce_customer_experience($1,$2,$3) AS result', [website, 'address_save', JSON.stringify({ ...addressPayload, id: address.id, address: 'Edited address after order', pincode: '560002' })])
  assert.equal((await actor(buyer, orderSql, [website, JSON.stringify(items), JSON.stringify(savedCustomer), 'delivery', savedKey, ''])).order.id, savedOrder.order.id)
  await actor(buyer, 'SELECT public.commerce_customer_experience($1,$2,$3) AS result', [website, 'address_delete', JSON.stringify({ address_id: address.id })])
  const afterAddressDeletion = await actor(buyer, orderSql, [website, JSON.stringify(items), JSON.stringify(savedCustomer), 'delivery', savedKey, ''])
  assert.equal(afterAddressDeletion.order.id, savedOrder.order.id)
  assert.equal(afterAddressDeletion.order.customer_details.address, addressPayload.address)
  assert.equal((await db.query('SELECT stock_quantity FROM public.commerce_product_variants WHERE id=$1', [variant])).rows[0].stock_quantity, 9)
  await check('saved-address order replay survives later address edits and deletion without changing shipping truth or consuming stock twice')
  await mustReject(buyer, orderSql, [website, JSON.stringify(items), JSON.stringify({ ...savedCustomer, name: 'Changed Buyer' }), 'delivery', savedKey, ''], 'saved-address replay rejects changed recipient instructions after address deletion')
  await mustReject(buyer, orderSql, [website, JSON.stringify([{ ...items[0], quantity: 2 }]), JSON.stringify(savedCustomer), 'delivery', savedKey, ''], 'saved-address replay rejects changed cart quantities after address deletion')
  const savedReplays = await Promise.all([actor(buyer, orderSql, [website, JSON.stringify(items), JSON.stringify(savedCustomer), 'delivery', savedKey, '']), actor(buyer, orderSql, [website, JSON.stringify(items), JSON.stringify(savedCustomer), 'delivery', savedKey, ''])])
  assert.ok(savedReplays.every(result => result.order.id === savedOrder.order.id && result.order.customer_details.address === addressPayload.address))
  assert.equal((await db.query('SELECT stock_quantity FROM public.commerce_product_variants WHERE id=$1', [variant])).rows[0].stock_quantity, 9)
  assert.equal((await db.query('SELECT count(*)::int AS count FROM public.commerce_orders WHERE website_id=$1 AND customer_user_id=$2 AND idempotency_key=$3', [website, buyer, savedKey])).rows[0].count, 1)
  await check('simultaneous saved-address retries after deletion retain one order and one stock decrement')

  const domainSites = ['22000000-0000-4000-8000-000000000001', '22000000-0000-4000-8000-000000000002']
  const domainOwners = ['12000000-0000-4000-8000-000000000001', '12000000-0000-4000-8000-000000000002']
  const claimDomain = (index, hostname) => actor(domainOwners[index], 'SELECT public.commerce_domain_owner_action($1,$2,$3) AS result', [domainSites[index], 'claim', JSON.stringify({ hostname })])
  const domainRace = await Promise.allSettled([claimDomain(0, 'race.customer-domain.org'), claimDomain(1, 'race.customer-domain.org')])
  assert.equal(domainRace.filter(result => result.status === 'fulfilled').length, 1)
  assert.equal(domainRace.find(result => result.status === 'rejected').reason.code, '23505')
  assert.equal((await db.query("SELECT count(*)::int AS count FROM public.commerce_domains WHERE hostname='race.customer-domain.org' AND released_at IS NULL")).rows[0].count, 1)
  await check('simultaneous cross-tenant domain claims produce one protected live hostname claim')
  const sameDomain = await Promise.all([claimDomain(0, 'same.customer-domain.org'), claimDomain(0, 'same.customer-domain.org')])
  assert.equal(sameDomain[0].id, sameDomain[1].id)
  assert.equal((await db.query("SELECT count(*)::int AS count FROM public.commerce_domains WHERE hostname='same.customer-domain.org' AND released_at IS NULL")).rows[0].count, 1)
  await check('simultaneous same-tenant domain retries return one claim')

  const paymentWebsite = '72000000-0000-4000-8000-000000000001'
  const paymentBuyer = '71000000-0000-4000-8000-000000000002'
  const paymentOwner = '71000000-0000-4000-8000-000000000001'
  const paymentOther = '71000000-0000-4000-8000-000000000003'
  const paymentProduct = '74000000-0000-4000-8000-000000000001'
  const paymentCredential = '75000000-0000-4000-8000-000000000001'
  const paymentItems = JSON.stringify([{ product_id: paymentProduct, quantity: 1 }])
  const paymentCustomer = JSON.stringify({ name: 'Method Race Buyer', phone: '9000000000' })
  const startSql = 'SELECT public.commerce_payment_start($1,$2,$3,$4,$5,$6) AS result'
  const paymentServiceSql = 'SELECT public.commerce_payment_service($1,$2) AS result'
  const paymentArgs = key => [paymentWebsite, paymentItems, paymentCustomer, 'pickup', key, '']
  async function methodRace(firstMethod, key) {
    const first = connection('method-first'), second = connection('method-second')
    await Promise.all([first.connect(), second.connect()])
    let pending, winning
    try {
      for (const client of [first, second]) {
        await verifyEndpoint(client)
        await client.query('BEGIN')
        await client.query('SET LOCAL ROLE authenticated')
        await client.query("SELECT set_config('request.jwt.claim.sub',$1,true)", [paymentBuyer])
      }
      winning = (await first.query(firstMethod === 'cod' ? orderSql : startSql, paymentArgs(key))).rows[0].result
      const pid = (await second.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
      pending = second.query(firstMethod === 'cod' ? startSql : orderSql, paymentArgs(key)).then(result => ({ result }), error => ({ error }))
      await waitBlocked(pid)
      await first.query('COMMIT')
      assert.equal((await pending).error?.code, '23505', 'The competing payment method must reject the established cart attempt.')
      await second.query('ROLLBACK')
      const counts = (await db.query(`SELECT
        (SELECT count(*)::int FROM public.commerce_orders WHERE website_id=$1 AND customer_user_id=$2 AND idempotency_key=$3) AS orders,
        (SELECT count(*)::int FROM commerce_private.payment_intents WHERE website_id=$1 AND buyer_id=$2 AND cart_key=$3) AS intents`, [paymentWebsite, paymentBuyer, key])).rows[0]
      assert.equal(counts.orders, firstMethod === 'cod' ? 1 : 0)
      assert.equal(counts.intents, firstMethod === 'cod' ? 0 : 1)
      await check(`${firstMethod} wins a simultaneous same-cart method race and the competing method leaves no second order or intent`)
      return winning
    } finally {
      await first.query('ROLLBACK').catch(() => {})
      if (pending) await pending
      await second.query('ROLLBACK').catch(() => {})
      await Promise.all([first.end(), second.end()])
    }
  }
  const paymentStock = (await db.query('SELECT stock_quantity FROM public.commerce_products WHERE id=$1', [paymentProduct])).rows[0].stock_quantity
  const codMethodKey = '76100000-0000-4000-8000-000000000001'
  const methodCod = await methodRace('cod', codMethodKey)
  const cancelPaidOrCod = orderId => actor(paymentOwner, 'SELECT public.commerce_owner_action($1,$2,$3) AS result', [paymentWebsite, 'update_order_status', JSON.stringify({ order_id: orderId, status: 'cancelled' })])
  await Promise.all([cancelPaidOrCod(methodCod.order.id), cancelPaidOrCod(methodCod.order.id)])
  assert.equal((await actor(paymentBuyer, orderSql, paymentArgs(codMethodKey))).order.id, methodCod.order.id)
  assert.equal((await db.query('SELECT stock_quantity FROM public.commerce_products WHERE id=$1', [paymentProduct])).rows[0].stock_quantity, paymentStock)
  await mustReject(paymentBuyer, startSql, paymentArgs(codMethodKey), 'cancelled COD cart retries retain the original method and cannot initiate another charge', '23505')
  const onlineMethodKey = '76100000-0000-4000-8000-000000000002'
  const methodOnline = await methodRace('online', onlineMethodKey)
  assert.equal((await actor(paymentBuyer, startSql, paymentArgs(onlineMethodKey))).id, methodOnline.id)
  assert.equal((await db.query('SELECT stock_quantity FROM public.commerce_products WHERE id=$1', [paymentProduct])).rows[0].stock_quantity, paymentStock)
  await check('online intent retry preserves the original attempt and does not reserve or consume inventory')

  async function bindProviderOrder(intent, suffix) {
    const lease = await actor(null, paymentServiceSql, ['claim_create', JSON.stringify({ intent_id: intent.id })], 'service_role')
    assert.equal(lease.claimed, true)
    await actor(null, paymentServiceSql, ['attach_create', JSON.stringify({ intent_id: intent.id, lease_token: lease.lease_token, provider_order_id: `order_${suffix}`, amount_paise: intent.amount_paise, currency: 'INR' })], 'service_role')
    return { intent_id: intent.id, credential_version: paymentCredential, provider_order_id: `order_${suffix}`, provider_payment_id: `pay_${suffix}`, amount_paise: intent.amount_paise, currency: 'INR' }
  }
  const capturePayload = await bindProviderOrder(methodOnline, 'integrated001')
  const capture = payload => actor(null, paymentServiceSql, ['capture', JSON.stringify(payload)], 'service_role')
  const captures = await Promise.all([capture(capturePayload), capture(capturePayload)])
  assert.ok(captures.every(result => result.state === 'fulfilled'))
  assert.equal(captures[0].receipt.id, captures[1].receipt.id)
  assert.equal(captures[0].order.id, captures[1].order.id)
  assert.equal((await db.query('SELECT stock_quantity FROM public.commerce_products WHERE id=$1', [paymentProduct])).rows[0].stock_quantity, paymentStock - 1)
  await check('simultaneous captured-payment retries retain one immutable receipt, one paid order and one stock decrement')
  await Promise.all([cancelPaidOrCod(captures[0].order.id), cancelPaidOrCod(captures[0].order.id)])
  const paidReplay = await capture(capturePayload)
  assert.equal(paidReplay.receipt.id, captures[0].receipt.id)
  assert.equal(paidReplay.order.id, captures[0].order.id)
  assert.equal(paidReplay.order.status, 'cancelled')
  assert.equal(paidReplay.order.payment_status, 'paid')
  assert.equal((await db.query('SELECT stock_quantity FROM public.commerce_products WHERE id=$1', [paymentProduct])).rows[0].stock_quantity, paymentStock)
  await check('paid-order cancellation and capture replay preserve captured history without fabricating refunds or changing stock twice')
  await revokedWhileWaiting({ website: paymentWebsite, user: paymentBuyer, sql: startSql, args: paymentArgs('76100000-0000-4000-8000-000000000003'),
    change: { sql: 'UPDATE auth.users SET email_confirmed_at=null WHERE id=$1', args: [paymentBuyer] },
    restore: { sql: 'UPDATE auth.users SET email_confirmed_at=now() WHERE id=$1', args: [paymentBuyer] },
    label: 'online intent creation rechecks verified Auth identity after concurrent withdrawal' })

  await db.query('UPDATE public.commerce_products SET stock_quantity=1 WHERE id=$1', [paymentProduct])
  const finalUnitIntents = await Promise.all([actor(paymentBuyer, startSql, paymentArgs('76100000-0000-4000-8000-000000000004')), actor(paymentOther, startSql, paymentArgs('76100000-0000-4000-8000-000000000005'))])
  const finalPayloads = await Promise.all(finalUnitIntents.map((intent, index) => bindProviderOrder(intent, `integratedstock00${index + 1}`)))
  const finalCaptures = await Promise.all(finalPayloads.map(capture))
  assert.equal(finalCaptures.filter(result => result.state === 'fulfilled').length, 1)
  assert.equal(finalCaptures.filter(result => result.state === 'captured_unfulfilled').length, 1)
  assert.equal((await db.query('SELECT stock_quantity FROM public.commerce_products WHERE id=$1', [paymentProduct])).rows[0].stock_quantity, 0)
  const heldCapture = finalCaptures.find(result => result.state === 'captured_unfulfilled')
  assert.equal(heldCapture.receipt.state, 'captured_unfulfilled')
  assert.equal(heldCapture.receipt.order_id, null)
  assert.equal(heldCapture.order, null)
  const retained = (await db.query('SELECT count(*)::int AS count FROM commerce_private.payment_receipts WHERE intent_id=ANY($1::uuid[])', [finalUnitIntents.map(intent => intent.id)])).rows[0].count
  assert.equal(retained, 2)
  await check('simultaneous independent captured payments cannot oversell and retain the losing captured receipt for reconciliation')

  // Both worker transactions remain open while claiming. SKIP LOCKED must
  // return different events without waiting for the first worker's commit.
  const workers = [connection('worker-one'), connection('worker-two')]
  await Promise.all(workers.map(client => client.connect()))
  try {
    for (const worker of workers) {
      await verifyEndpoint(worker)
      await worker.query('BEGIN')
      await worker.query('SET LOCAL ROLE service_role')
      await worker.query("SELECT set_config('request.jwt.claim.role','service_role',true)")
    }
    const claimSql = 'SELECT public.commerce_notification_claim(1,120) AS value'
    const first = (await workers[0].query(claimSql)).rows[0].value
    const second = (await workers[1].query(claimSql)).rows[0].value
    assert.equal(first.length, 1)
    assert.equal(second.length, 1)
    assert.notEqual(first[0].id, second[0].id)
    assert.notEqual(first[0].lease_token, second[0].lease_token)
    await check('independent notification workers skip locked events and obtain distinct leases')
  } finally {
    await Promise.all(workers.map(client => client.query('ROLLBACK').catch(() => {})))
    await Promise.all(workers.map(client => client.end()))
  }

  for (const relative of migrations) {
    const beforeDefinitions = await definitions(), beforeData = await rowsFor(await tables())
    let failed
    try { await db.query(await readFile(path.join(root, relative), 'utf8')) } catch (error) { failed = error }
    const duplicateState = /_(commerce_verified_domains|commerce_payment_recovery_queue)\.sql$/.test(relative) ? '42723' : '42P07'
    assert.equal(failed?.code, duplicateState, 'One-time expansion reapplication must reject the first existing object.')
    await assert.rejects(db.query('SELECT 1'), error => error.code === '25P02')
    await db.query('ROLLBACK')
    assert.deepEqual(await definitions(), beforeDefinitions)
    assert.deepEqual(await rowsFor(await tables()), beforeData)
    await check(`${path.basename(relative)} rejects reapplication atomically, preserving definitions, RLS, grants and all rows`)
  }
  const results = await db.query('SELECT label FROM commerce_test.results ORDER BY id')
  const version = (await db.query('SELECT version() AS version')).rows[0].version
  console.log(`${results.rowCount} PostgreSQL assertions passed, including all 88 original checks and 72 post-expansion baseline cases.`)
  console.log(`Verified disposable target: ${target.hostname}:${target.port || '5432'}/commerce_test; ${version}`)
  console.log('Synthetic local Auth/Storage primitives do not establish Supabase 17, hosted Auth/RLS/PostgREST or external-provider behavior. No hosted SQL or provider send was performed.')
} catch (error) {
  await db.query('ROLLBACK').catch(() => {})
  throw error
} finally { await db.end() }
