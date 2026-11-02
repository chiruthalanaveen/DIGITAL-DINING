import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { Client } from 'pg'

const root = fileURLToPath(new URL('../', import.meta.url))
const supplied = process.env.SUBSCRIPTION_TEST_DATABASE_URL
assert.ok(supplied, 'Set SUBSCRIPTION_TEST_DATABASE_URL explicitly; production credentials are never inferred.')
const target = new URL(supplied)
assert.ok(['postgres:', 'postgresql:'].includes(target.protocol))
assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(target.hostname), 'Only loopback PostgreSQL is permitted.')
assert.equal(target.pathname, '/subscription_test', 'Only the disposable subscription_test database may be reset.')
assert.ok(!target.searchParams.has('host') && !target.searchParams.has('hostaddr'), 'Host overrides are forbidden.')
const managementUrl = new URL(target)
managementUrl.pathname = '/postgres'
const management = new Client({ connectionString: managementUrl.href, application_name: 'subscription-local-test-bootstrap' })
await management.connect()
try {
  const result = await management.query('SELECT host(inet_server_addr()) AS address')
  assert.ok(['127.0.0.1', '::1'].includes(result.rows[0].address))
  await management.query('DROP DATABASE IF EXISTS subscription_test WITH (FORCE)')
  await management.query('CREATE DATABASE subscription_test')
} finally { await management.end() }

const client = new Client({ connectionString: target.href, application_name: 'subscription-isolated-sql-tests' })
await client.connect()
const restaurant = '11111111-1111-4111-8111-111111111111'
const owner = '22222222-2222-4222-8222-222222222222'
const otherRestaurant = '33333333-3333-4333-8333-333333333333'
const otherOwner = '44444444-4444-4444-8444-444444444444'
const key = 'rzp_test_subscription_fixture'
const results = []
const migrationPath = 'supabase/migrations/20261101123000_subscription_payment_ledger.sql'
const schemas = ['public', 'auth', 'cron', 'subscription_test', 'subscription_private']
const signature = {
  open: { name: 'subscription_open_checkout', types: ['uuid', 'uuid', 'uuid', 'text', 'text', 'bigint', 'text', 'text'] },
  bind: { name: 'subscription_bind_checkout', types: ['uuid', 'uuid', 'uuid', 'text'] },
  activate: { name: 'subscription_activate_payment', types: ['uuid', 'uuid', 'uuid', 'text', 'text', 'bigint', 'text', 'text', 'text', 'text'] },
}
const terms = {
  restaurant_pro: { prices: [149900, 809500, 1439000], legacy: 'Pro', business: 'restaurant', resort: false, delivery: false },
  delivery: { prices: [149900, 809500, 1439000], legacy: 'Pro', business: 'delivery', resort: false, delivery: true },
  restaurant_resort_pro: { prices: [299900, 1619500, 2879000], legacy: 'Pro+', business: 'restaurant_resort', resort: true, delivery: false },
  restaurant_delivery: { prices: [299900, 1619500, 2879000], legacy: 'Pro', business: 'restaurant_delivery', resort: false, delivery: true },
  restaurant_resort_delivery: { prices: [399900, 2159500, 3839000], legacy: 'Pro+', business: 'restaurant_resort_delivery', resort: true, delivery: true },
}
function pass(label) { results.push(label); console.log(`PASS ${label}`) }
function sqlCall(action) {
  const item = signature[action]
  return `SELECT public.${item.name}(${item.types.map((type, index) => `$${index + 1}::${type}`).join(',')}) AS result`
}
async function invoke(action, values, { role = 'service_role', settings = {} } = {}) {
  assert.ok(['service_role', 'authenticated', 'anon'].includes(role))
  const connection = new Client({ connectionString: target.href, application_name: 'subscription-local-role-case' })
  await connection.connect()
  try {
    await connection.query('BEGIN')
    await connection.query(`SET LOCAL ROLE ${role}`)
    for (const [name, value] of Object.entries(settings)) await connection.query('SELECT set_config($1,$2,true)', [name, value])
    const result = await connection.query(sqlCall(action), values)
    await connection.query('COMMIT')
    return result.rows[0].result
  } catch (error) { await connection.query('ROLLBACK'); throw error }
  finally { await connection.end() }
}
function purchase(plan = 'restaurant_pro', cycle = '1month', overrides = {}) {
  const cycleIndex = ['1month', '6months', '12months'].indexOf(cycle)
  return { id: randomUUID(), restaurant, owner, plan, cycle, amount: terms[plan]?.prices[cycleIndex] ?? 149900,
    currency: 'INR', key, order: `order_${randomUUID()}`, payment: `pay_${randomUUID()}`, ...overrides }
}
function openArgs(p) { return [p.id, p.restaurant, p.owner, p.plan, p.cycle, p.amount, p.currency, p.key] }
function bindArgs(p) { return [p.id, p.restaurant, p.owner, p.order] }
function activateArgs(p) { return [p.id, p.restaurant, p.owner, p.order, p.payment, p.amount, p.currency, p.plan, p.cycle, p.key] }
async function enrolled(p) { await invoke('open', openArgs(p)); await invoke('bind', bindArgs(p)); return p }
async function state() {
  const result = await client.query(`SELECT jsonb_build_object(
    'restaurants',(SELECT jsonb_agg(to_jsonb(r) ORDER BY id) FROM public.restaurants r),
    'intents',(SELECT coalesce(jsonb_agg(to_jsonb(i) ORDER BY id),'[]'::jsonb) FROM subscription_private.checkout_intents i),
    'receipts',(SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY checkout_id),'[]'::jsonb) FROM subscription_private.activation_receipts r),
    'audit',(SELECT coalesce(jsonb_agg(to_jsonb(a) ORDER BY id),'[]'::jsonb) FROM subscription_test.activation_audit a)) AS value`)
  return result.rows[0].value
}
async function rejects(label, action, codes = ['42501', '22023', '23505', '55000']) {
  const before = await state()
  let failure
  try { await action() } catch (error) { failure = error }
  assert.ok(failure, `${label}: expected denial`)
  assert.ok(codes.includes(failure.code), `${label}: unexpected SQLSTATE ${failure.code}`)
  assert.deepEqual(await state(), before, `${label}: denial must have no business effect`)
  pass(label)
}
async function catalog() {
  const queries = {
    schemas: `SELECT nspname AS key,nspowner,nspacl::text AS acl FROM pg_namespace WHERE nspname=ANY($1) ORDER BY 1`,
    relations: `SELECT n.nspname||'.'||c.relname AS key,c.relkind,c.relowner,c.relacl::text AS acl,c.relrowsecurity,c.relforcerowsecurity,c.relpersistence FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($1) ORDER BY 1`,
    columns: `SELECT n.nspname||'.'||c.relname||'.'||a.attnum AS key,a.attname,format_type(a.atttypid,a.atttypmod) AS type,a.attnotnull,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid) AS default_value FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum WHERE n.nspname=ANY($1) AND a.attnum>0 AND NOT a.attisdropped ORDER BY 1`,
    constraints: `SELECT n.nspname||'.'||coalesce(c.conrelid::regclass::text,'')||'.'||c.conname AS key,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname=ANY($1) ORDER BY 1`,
    functions: `SELECT n.nspname||'.'||p.oid::regprocedure::text AS key,p.proowner,p.proacl::text AS acl,pg_get_functiondef(p.oid) AS definition FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=ANY($1) AND p.prokind='f' ORDER BY 1`,
    indexes: `SELECT schemaname||'.'||indexname AS key,tablename,indexdef FROM pg_indexes WHERE schemaname=ANY($1) ORDER BY 1`,
    policies: `SELECT schemaname||'.'||tablename||'.'||policyname AS key,to_jsonb(p) AS definition FROM pg_policies p WHERE schemaname=ANY($1) ORDER BY 1`,
    triggers: `SELECT n.nspname||'.'||c.relname||'.'||t.tgname AS key,t.tgenabled,t.tgisinternal,pg_get_triggerdef(t.oid) AS definition FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($1) ORDER BY 1`,
    default_grants: `SELECT d.oid::text AS key,d.defaclrole,d.defaclnamespace,d.defaclobjtype,d.defaclacl::text AS acl FROM pg_default_acl d WHERE d.defaclnamespace=0 OR d.defaclnamespace IN (SELECT oid FROM pg_namespace WHERE nspname=ANY($1)) ORDER BY 1`,
    types: `SELECT n.nspname||'.'||t.typname AS key,t.typtype,t.typbasetype,t.typnotnull,t.typdefault FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname=ANY($1) ORDER BY 1`,
  }
  const answer = {}
  for (const [name, query] of Object.entries(queries)) answer[name] = (await client.query(query, [schemas])).rows
  return answer
}
async function rowSnapshot() {
  const tables = await client.query(`SELECT n.nspname AS schema,c.relname AS name,c.relkind AS kind FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=ANY($1) AND c.relkind IN ('r','S') ORDER BY n.nspname,c.relname`, [schemas])
  const answer = {}
  for (const table of tables.rows) {
    assert.match(table.schema, /^[a-z_][a-z0-9_]*$/); assert.match(table.name, /^[a-z_][a-z0-9_]*$/)
    const relation = `"${table.schema}"."${table.name}"`
    answer[`${table.schema}.${table.name}`] = table.kind === 'S'
      ? (await client.query(`SELECT last_value,is_called FROM ${relation}`)).rows
      : (await client.query(`SELECT coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text),'[]'::jsonb) AS value FROM ${relation} r`)).rows[0].value
  }
  return answer
}
function preserved(before, after, label) {
  for (const [category, entries] of Object.entries(before)) {
    const current = new Map(after[category].map(entry => [entry.key, entry]))
    for (const entry of entries) assert.deepEqual(current.get(entry.key), entry, `${label}: ${category} ${entry.key}`)
  }
}
async function checkCalendar() {
  for (const date of ['2023-01-31T12:34:56.789Z', '2024-01-31T12:34:56.789Z', '2024-02-29T12:34:56.789Z', '2026-08-31T00:00:00.000Z']) {
    for (const cycle of ['1month', '6months', '12months']) {
      const expected = new Date(date)
      if (cycle === '12months') expected.setUTCFullYear(expected.getUTCFullYear() + 1)
      else expected.setUTCMonth(expected.getUTCMonth() + (cycle === '1month' ? 1 : 6))
      const actual = await client.query('SELECT subscription_private.term_expiry($1::timestamptz,$2::text) AS expiry', [date, cycle])
      assert.equal(actual.rows[0].expiry.toISOString(), expected.toISOString())
    }
  }
  pass('UTC calendar terms preserve JavaScript month-end and leap-year rollover for twelve boundary cases')
}

try {
  await client.query(await readFile(path.join(root, 'supabase/tests/subscription_bootstrap.sql'), 'utf8'))
  const migration = await readFile(path.join(root, migrationPath), 'utf8')
  // These defaults belong exclusively to a synthetic NOLOGIN/BYPASSRLS role in
  // the guarded local fixture. Migration installation must reject unexpected
  // inherited grantees atomically, never rewrite the installer's existing ACLs.
  const extraDefaultGrants = {
    schema: ['USAGE', 'SCHEMAS'],
    table: ['SELECT, INSERT', 'TABLES'],
    function: ['EXECUTE', 'FUNCTIONS'],
  }
  for (const categories of [['schema', 'table', 'function'], ['table'], ['function']]) {
    for (const category of categories) {
      const [privileges, objects] = extraDefaultGrants[category]
      await client.query(`ALTER DEFAULT PRIVILEGES GRANT ${privileges} ON ${objects} TO subscription_fixture_extra_acl`)
    }
    try {
      const badInstallCatalog = await catalog(), badInstallRows = await rowSnapshot()
      let failure
      try { await client.query(migration) } catch (error) { failure = error }
      assert.equal(failure?.code, '42501', 'Unexpected inherited grantees must fail installation closed')
      let aborted
      try { await client.query('SELECT 1') } catch (error) { aborted = error }
      assert.equal(aborted?.code, '25P02')
      await client.query('ROLLBACK')
      assert.deepEqual(await catalog(), badInstallCatalog, 'Rejected installation must not alter any prior object or default ACL')
      assert.deepEqual(await rowSnapshot(), badInstallRows, 'Rejected installation must preserve every pre-existing fixture row')
      assert.equal((await client.query("SELECT to_regnamespace('subscription_private') IS NULL AS absent")).rows[0].absent, true)
      pass(`unexpected inherited ${categories.join('/')} ACLs reject installation and roll back all new objects without changing prior grants/data`)
    } finally {
      await client.query('ROLLBACK').catch(() => {})
      for (const category of categories) {
        const [privileges, objects] = extraDefaultGrants[category]
        await client.query(`ALTER DEFAULT PRIVILEGES REVOKE ${privileges} ON ${objects} FROM subscription_fixture_extra_acl`)
      }
    }
  }
  const beforeCatalog = await catalog(), beforeRows = await rowSnapshot()
  await client.query(migration)
  const installedCatalog = await catalog(), installedRows = await rowSnapshot()
  preserved(beforeCatalog, installedCatalog, 'migration installation')
  for (const [name, rows] of Object.entries(beforeRows)) assert.deepEqual(installedRows[name], rows, name)
  pass('installation preserves every pre-existing fixture relation, column, constraint, function, trigger, policy, grant, type and row')
  const externalReferences = await client.query(`SELECT count(*)::int AS count
    FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
    JOIN pg_class referenced ON referenced.oid=c.confrelid
    JOIN pg_namespace rn ON rn.oid=referenced.relnamespace
    WHERE n.nspname='subscription_private' AND c.contype='f' AND rn.nspname<>'subscription_private'`)
  assert.equal(externalReferences.rows[0].count, 0)
  pass('new receipt constraints do not add deletion-blocking foreign keys to legacy or Auth tables')
  await checkCalendar()

  const probe = purchase()
  for (const role of ['anon', 'authenticated']) {
    await rejects(`${role} cannot open a checkout or forge a service JWT role`, () => invoke('open', openArgs(probe), { role, settings: { 'request.jwt.claim.role': 'service_role', 'request.jwt.claim.sub': owner } }), ['42501'])
    await rejects(`${role} cannot bind a checkout`, () => invoke('bind', bindArgs(probe), { role }), ['42501'])
    await rejects(`${role} cannot activate a payment`, () => invoke('activate', activateArgs(probe), { role }), ['42501'])
  }
  for (const role of ['anon', 'authenticated', 'service_role']) {
    const connection = new Client({ connectionString: target.href })
    await connection.connect()
    try {
      await connection.query(`SET ROLE ${role}`)
      for (const table of ['checkout_intents', 'activation_receipts']) {
        for (const statement of [`SELECT * FROM subscription_private.${table}`, `DELETE FROM subscription_private.${table}`, `UPDATE subscription_private.${table} SET amount_paise=1`]) {
          await assert.rejects(connection.query(statement), error => error.code === '42501')
        }
      }
    } finally { await connection.end() }
    pass(`${role} cannot directly read or mutate private checkout/payment data`)
  }
  for (const change of [{ plan: 'admin_plan' }, { cycle: 'unlimited' }, { amount: 1 }, { currency: 'USD' }, { key: '' }]) {
    await rejects('opening rejects invalid or forged terms: ' + Object.keys(change)[0], () => invoke('open', openArgs(purchase('restaurant_pro', '1month', change))))
  }
  await rejects('opening cannot attach another owner to a restaurant', () => invoke('open', openArgs(purchase('restaurant_pro', '1month', { owner: otherOwner }))), ['42501'])

  const purchases = []
  for (const [plan, values] of Object.entries(terms)) {
    for (const cycle of ['1month', '6months', '12months']) {
      const p = await enrolled(purchase(plan, cycle)); const activated = await invoke('activate', activateArgs(p))
      assert.equal(activated.success, true); assert.equal(activated.replayed, false)
      assert.equal(activated.restaurant.plan, values.legacy); assert.equal(activated.restaurant.plan_code, plan)
      assert.equal(activated.restaurant.billing_cycle, cycle); assert.equal(activated.restaurant.business_type, values.business)
      assert.equal(activated.restaurant.delivery_enabled, values.delivery); assert.equal(activated.restaurant.resort_enabled, values.resort)
      assert.equal(activated.restaurant.subscription_status, 'active')
      assert.equal(Number(activated.receipt.amount_paise), p.amount)
      assert.equal(activated.receipt.subscription_expires_at, activated.restaurant.subscription_expires_at)
      purchases.push({ p, activated }); pass(`authoritative ${plan}/${cycle} price, flags and one frozen activation receipt`)
    }
  }
  const original = purchases[0], beforeReplay = await state()
  const replay = await invoke('activate', activateArgs(original.p))
  assert.equal(replay.replayed, true); assert.deepEqual(replay.receipt, original.activated.receipt)
  assert.deepEqual(replay.restaurant, original.activated.restaurant); assert.deepEqual(await state(), beforeReplay)
  pass('old captured callback returns original frozen result without overwriting a later subscription')

  const concurrent = await enrolled(purchase('restaurant_delivery'))
  const beforeConcurrent = await state()
  const both = await Promise.all([invoke('activate', activateArgs(concurrent)), invoke('activate', activateArgs(concurrent))])
  assert.equal(both.filter(result => result.replayed === false).length, 1)
  assert.deepEqual(both[0].receipt, both[1].receipt)
  const afterConcurrent = await state()
  assert.equal(afterConcurrent.receipts.length, beforeConcurrent.receipts.length + 1)
  assert.equal(afterConcurrent.audit.length, beforeConcurrent.audit.length + 1)
  pass('two concurrent identical callbacks append one receipt and update the restaurant exactly once')

  const reusable = await enrolled(purchase())
  const sameOpen = await invoke('open', openArgs(reusable)); assert.equal(sameOpen.checkout.id, reusable.id)
  const sameBind = await invoke('bind', bindArgs(reusable)); assert.equal(sameBind.checkout.provider_order_id, reusable.order)
  pass('identical open/bind retries retain the same immutable checkout identity')
  await rejects('bound checkout cannot switch provider orders', () => invoke('bind', bindArgs({ ...reusable, order: 'order_different' })))
  const conflictingOrder = purchase('restaurant_pro', '1month', { order: reusable.order })
  await invoke('open', openArgs(conflictingOrder))
  await rejects('one provider order cannot be bound to two checkouts', () => invoke('bind', bindArgs(conflictingOrder)))
  const reusedPayment = await enrolled(purchase('restaurant_pro', '1month', { payment: original.p.payment }))
  await rejects('one provider payment cannot activate a different checkout/order', () => invoke('activate', activateArgs(reusedPayment)))
  await rejects('a consumed checkout cannot switch payment references', () => invoke('activate', activateArgs({ ...original.p, payment: 'pay_different' })))
  await rejects('unregistered historical captured order cannot activate', () => invoke('activate', activateArgs(purchase())), ['55000'])
  const unbound = purchase(); await invoke('open', openArgs(unbound))
  await rejects('an unbound checkout cannot activate', () => invoke('activate', activateArgs(unbound)), ['55000'])
  for (const change of [{ restaurant: otherRestaurant }, { owner: otherOwner }, { amount: 1 }, { currency: 'USD' }, { plan: 'delivery' }, { cycle: '12months' }, { key: 'rzp_test_another_merchant' }, { order: 'order_foreign' }]) {
    await rejects('activation rejects mismatched ' + Object.keys(change)[0], () => invoke('activate', activateArgs({ ...reusable, ...change })))
  }

  // Receipt failure must leave no partial activation. A separate existing
  // AFTER UPDATE trigger failure proves a later error rolls back the already
  // inserted receipt, restaurant update and legacy audit side effects together.
  await client.query('CREATE TRIGGER fixture_fail_receipt BEFORE INSERT ON subscription_private.activation_receipts FOR EACH ROW EXECUTE FUNCTION subscription_test.fail_receipt()')
  try {
    await rejects('receipt-write failure rolls back restaurant, receipt and audit atomically', () => invoke('activate', activateArgs(reusable), { settings: { 'subscription_test.fail_receipt': 'on' } }), ['P0001'])
  } finally { await client.query('DROP TRIGGER fixture_fail_receipt ON subscription_private.activation_receipts') }
  await rejects('existing AFTER UPDATE trigger failure rolls back claimed receipt, restaurant and audit atomically', () => invoke('activate', activateArgs(reusable), { settings: { 'subscription_test.fail_audit': 'on' } }), ['P0001'])
  for (const override of ['plan', 'approval']) {
    await rejects(`existing AFTER UPDATE ${override} override is detected and rolls back receipt, restaurant and audit`, () => invoke('activate', activateArgs(reusable), { settings: { 'subscription_test.override_after': override } }), ['55000'])
  }
  const committed = await invoke('activate', activateArgs(reusable))
  const committedState = await state()
  const recovered = await invoke('activate', activateArgs(reusable))
  assert.deepEqual(recovered.receipt, committed.receipt); assert.equal(recovered.replayed, true)
  assert.deepEqual(await state(), committedState)
  pass('retry after a lost committed response returns the receipt without a second activation')

  async function revokedWhileWaiting(column, value, label) {
    const p = await enrolled(purchase())
    const admin = new Client({ connectionString: target.href }), waiting = new Client({ connectionString: target.href })
    await Promise.all([admin.connect(), waiting.connect()]); let attempt
    const before = await state()
    try {
      await admin.query('BEGIN')
      assert.ok(['approval_status', 'owner_id'].includes(column))
      await admin.query(`UPDATE public.restaurants SET ${column}=$1 WHERE id=$2`, [value, restaurant])
      await waiting.query('BEGIN'); await waiting.query('SET LOCAL ROLE service_role')
      const pid = (await waiting.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
      attempt = waiting.query(sqlCall('activate'), activateArgs(p)).then(result => ({ result }), error => ({ error }))
      let blocked = false
      for (let i = 0; i < 100 && !blocked; i++) {
        blocked = (await client.query('SELECT cardinality(pg_blocking_pids($1))>0 AS blocked', [pid])).rows[0].blocked
        if (!blocked) await new Promise(resolve => setTimeout(resolve, 10))
      }
      assert.ok(blocked, 'Activation must wait behind the administrator restaurant lock')
      await admin.query('COMMIT')
      const outcome = await attempt; assert.equal(outcome.error?.code, '42501')
      await waiting.query('ROLLBACK')
      const after = await state(); assert.deepEqual(after.receipts, before.receipts); assert.deepEqual(after.audit, before.audit)
      assert.deepEqual(after.intents, before.intents)
      pass(label)
    } finally {
      await admin.query('ROLLBACK').catch(() => {})
      if (attempt) await attempt
      await waiting.query('ROLLBACK').catch(() => {})
      await Promise.all([admin.end(), waiting.end()])
      await client.query(`UPDATE public.restaurants SET ${column}=$1 WHERE id=$2`, [column === 'owner_id' ? owner : 'approved', restaurant])
    }
  }
  await revokedWhileWaiting('approval_status', 'suspended', 'activation rechecks approval after waiting for concurrent Admin suspension')
  await revokedWhileWaiting('owner_id', otherOwner, 'activation rechecks identity after waiting for concurrent ownership reassignment')

  for (const statement of [
    'UPDATE subscription_private.activation_receipts SET amount_paise=1',
    'DELETE FROM subscription_private.activation_receipts',
    'TRUNCATE subscription_private.activation_receipts',
  ]) await rejects('append-only receipts reject ' + statement.split(' ')[0] + ' even for the fixture administrator', () => client.query(statement), ['42501', '55000', 'P0001'])

  const beforeRerunCatalog = await catalog(), beforeRerunRows = await rowSnapshot()
  let reapplicationError
  try { await client.query(migration) } catch (error) { reapplicationError = error }
  assert.ok(reapplicationError, 'One-time migration must reject reapplication')
  let aborted
  try { await client.query('SELECT 1') } catch (error) { aborted = error }
  assert.equal(aborted?.code, '25P02'); await client.query('ROLLBACK')
  assert.deepEqual(await catalog(), beforeRerunCatalog)
  assert.deepEqual(await rowSnapshot(), beforeRerunRows)
  pass('failed reapplication is transactional and preserves all legacy/new definitions, grants, rows and receipts')

  const finalRows = await rowSnapshot()
  for (const [name, rows] of Object.entries(beforeRows)) {
    if (['public.restaurants', 'subscription_test.activation_audit', 'subscription_test.activation_audit_id_seq'].includes(name)) continue
    assert.deepEqual(finalRows[name], rows, `unrelated legacy state changed: ${name}`)
  }
  preserved(beforeCatalog, await catalog(), 'runtime activation')
  pass('runtime activation preserves unrelated wallet, order, customer, payment, resort, delivery and cron fixtures')

  const reports = await client.query(await readFile(path.join(root, 'supabase/tests/subscription_ledger_verify.sql'), 'utf8'))
  const tables = reports.find(result => result.fields.some(field => field.name === 'anon_schema_denied'))
  assert.equal(tables.rows.length, 2)
  for (const row of tables.rows) {
    assert.equal(row.rls_enabled, true)
    for (const field of ['anon_schema_denied', 'authenticated_schema_denied', 'service_schema_denied', 'anon_table_denied', 'authenticated_table_denied', 'service_table_denied']) assert.equal(row[field], true, `${row.table_name}: ${field}`)
  }
  const functions = reports.find(result => result.fields.some(field => field.name === 'service_execute'))
  assert.equal(functions.rows.filter(row => row.schema_name === 'public').length, 3)
  for (const row of functions.rows) {
    assert.equal(row.anon_execute, false); assert.equal(row.authenticated_execute, false)
    assert.equal(row.service_execute, row.schema_name === 'public')
    if (row.schema_name === 'public') { assert.equal(row.security_definer, true); assert.ok(row.configuration.includes('search_path=pg_catalog')) }
  }
  const aclReport = reports.find(result => result.fields.some(field => field.name === 'unexpected_acl_count'))
  assert.equal(aclReport.rows.length, 9, 'All new schema/table/function objects must be inspected')
  assert.ok(aclReport.rows.every(row => Number(row.unexpected_acl_count) === 0), 'No unexpected role may retain access through inherited ACLs')
  const aggregate = reports.find(result => result.fields.some(field => field.name === 'receipt_binding_mismatches')).rows[0]
  assert.equal(Number(aggregate.receipt_binding_mismatches), 0)
  assert.equal(Number(aggregate.duplicate_payment_count), 0); assert.equal(Number(aggregate.duplicate_order_count), 0)
  pass('actual read-only verification SQL confirms private ACLs, service-only RPCs and consistent unique receipts')

  const catalogCounts = await client.query(`SELECT
    (SELECT count(*)::int FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='subscription_private' AND c.relkind='r') AS tables,
    (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='subscription_private' OR p.oid IN (
      to_regprocedure('public.subscription_open_checkout(uuid,uuid,uuid,text,text,bigint,text,text)'),
      to_regprocedure('public.subscription_bind_checkout(uuid,uuid,uuid,text)'),
      to_regprocedure('public.subscription_activate_payment(uuid,uuid,uuid,text,text,bigint,text,text,text,text)'))) AS functions,
    (SELECT count(*)::int FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='subscription_private' AND NOT t.tgisinternal) AS triggers,
    (SELECT count(*)::int FROM pg_indexes WHERE schemaname='subscription_private') AS indexes,
    (SELECT count(*)::int FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='subscription_private' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped) AS columns,
    (SELECT count(*)::int FROM pg_policies WHERE schemaname='subscription_private') AS policies,
    (SELECT coalesce(jsonb_object_agg(k.contype,k.amount),'{}'::jsonb) FROM (
      SELECT c.contype,count(*)::int AS amount FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace
      WHERE n.nspname='subscription_private' GROUP BY c.contype) k) AS constraint_types`)
  const objectCounts = catalogCounts.rows[0]
  assert.deepEqual(Object.fromEntries(Object.entries(objectCounts).filter(([name]) => name !== 'constraint_types')),
    { tables: 2, functions: 6, triggers: 2, indexes: 5, columns: 24, policies: 0 })
  // Constraint counts are reported as observed; PostgreSQL 18 also catalogs
  // NOT NULL constraints, so a global constraint total must not be hard-coded.
  if (process.env.SUBSCRIPTION_TEST_VERIFY_ARTIFACT) await writeFile(process.env.SUBSCRIPTION_TEST_VERIFY_ARTIFACT,
    JSON.stringify({ scope: 'Read-only catalog and aggregate evidence; no raw business/payment rows', objectCounts,
      reports: reports.filter(result => result.fields.length).map(result => ({ fields: result.fields.map(field => field.name), rows: result.rows })) }, null, 2) + '\n', { mode: 0o600 })

  const summary = { result: 'PASS', assertions: results.length, labels: results, target: 'isolated loopback subscription_test',
    fixtureScope: 'Representative legacy tables and Supabase primitives; not real hosted Auth/RLS, installed trigger compatibility or provider proof',
    migration: migrationPath, objectCounts, hostedConnections: 0, productionWrites: false }
  if (process.env.SUBSCRIPTION_TEST_SUMMARY) await writeFile(process.env.SUBSCRIPTION_TEST_SUMMARY, JSON.stringify(summary, null, 2) + '\n', { mode: 0o600 })
  console.log(`${results.length} subscription PostgreSQL assertions passed on representative isolated fixtures.`)
  console.log('Hosted Supabase compatibility, real provider verification and production installation remain unverified; no production connection was used.')
} catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error }
finally { await client.end() }
