import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import ts from 'typescript'

const root = new URL('../', import.meta.url)
const sourceCache = new Map()

async function actualCallback(file, name, bindings = {}, initialState = {}) {
  if (!sourceCache.has(file)) {
    sourceCache.set(file, await readFile(new URL(file, root), 'utf8'))
  }
  const source = sourceCache.get(file)
  const tree = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX)
  let callback
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(tree) === name) {
      callback = node.initializer.arguments[0].getText(tree)
    }
    ts.forEachChild(node, visit)
  }
  visit(tree)
  assert.ok(callback, `Actual ${name} callback must exist in ${file}`)
  const state = { ...initialState }
  const writes = []
  const setters = {}
  for (const name of new Set(callback.match(/\bset[A-Z]\w*/g) || [])) {
    setters[name] = value => {
      const next = typeof value === 'function' ? value(state[name]) : value
      state[name] = next
      writes.push([name, next])
    }
  }
  const scope = { console: { error() {} }, ...setters, ...bindings }
  // Execute the real callback, with only its external I/O and React setters injected.
  const run = new Function(...Object.keys(scope), `return (${callback})`)(...Object.values(scope))
  return { run, state, writes, setters }
}

function deferred() {
  let resolve, reject
  const promise = new Promise((yes, no) => { resolve = yes; reject = no })
  return { promise, resolve, reject }
}

const managerFiles = [
  'app/components/ManagerDeliveryManagement.jsx',
  'app/app/components/ManagerDeliveryManagement.jsx',
]

for (const file of managerFiles) {
  test(`${file}: initial I/O, interactive busy state, success and stale-session response`, async () => {
    const response = deferred()
    const announcements = []
    let calls = 0
    const request = await actualCallback(file, 'requestData', {
      getData: () => { calls++; return response.promise },
      announceNewOrders: rows => announcements.push(rows),
    })
    let active = true
    const pending = request.run(() => active)
    assert.equal(calls, 1)
    assert.deepEqual(request.writes, [], 'Starting external I/O must not synchronously set component state')
    active = false
    response.resolve({ data: { success: true, orders: [{ id: 'old-session-order' }] }, error: null })
    await pending
    assert.deepEqual(request.writes, [], 'Expired restaurant/session scope cannot overwrite current UI')
    assert.deepEqual(announcements, [], 'Expired requests must not sound an order alarm')

    const nextResponse = deferred()
    const next = await actualCallback(file, 'requestData', {
      getData: () => nextResponse.promise,
      announceNewOrders: rows => announcements.push(rows),
    })
    const refresh = await actualCallback(file, 'loadData', { requestData: next.run })
    const refreshing = refresh.run(true)
    assert.equal(refresh.state.setRefreshing, true)
    assert.equal(refresh.state.setError, '')
    assert.deepEqual(next.writes, [])
    const order = { id: 'current-session-order' }
    nextResponse.resolve({ data: { success: true, orders: [order], managerName: 'Test Manager' }, error: null })
    await refreshing
    assert.deepEqual(next.state.setOrders, [order])
    assert.equal(next.state.setLoading, false)
    assert.equal(next.state.setRefreshing, false)
    assert.deepEqual(announcements, [[order]])
  })

  test(`${file}: rejected RPC, synchronous request errors and denied responses clear pending state`, async () => {
    for (const getData of [
      () => Promise.reject(new Error('Test transport unavailable')),
      () => { throw new Error('Test synchronous query failure') },
      () => Promise.resolve({ error: new Error('Test access denied') }),
      () => Promise.resolve({ data: { success: false, message: 'Test session expired' } }),
    ]) {
      const request = await actualCallback(file, 'requestData', { getData, announceNewOrders() {} })
      await request.run()
      assert.match(request.state.setError, /^Test /)
      assert.equal(request.state.setLoading, false)
      assert.equal(request.state.setRefreshing, false)
      assert.equal(request.state.setOrders, undefined)
    }
  })
}

test('Manager support preserves selected thread and ignores cancelled network results/errors', async () => {
  const file = 'app/components/DeliveryManagerSupportChat.jsx'
  const request = await actualCallback(file, 'requestSupport', {
    managerRpc: async () => ({ threads: [{ id: 'other' }, { id: 'current' }] }),
  }, { setSelectedId: 'current' })
  await request.run()
  assert.equal(request.state.setSelectedId, 'current')
  assert.equal(request.state.setLoading, false)
  const stale = await actualCallback(file, 'requestSupport', {
    managerRpc: async () => { throw new Error('Old session') },
  })
  await stale.run(false, () => false)
  assert.deepEqual(stale.writes, [])
  const silent = await actualCallback(file, 'requestSupport', {
    managerRpc: async () => { throw new Error('Polling failed') },
  })
  await silent.run(true)
  assert.deepEqual(silent.writes, [], 'Silent polling failure retains the visible conversation')
})

test('Return pickups retain session-scoped RPC contract and ignore expired-session results', async () => {
  const file = 'app/components/DeliveryReturnPickupTasks.jsx'
  const calls = []
  const request = await actualCallback(file, 'requestPickups', {
    sessionToken: 'development-session-only',
    supabase: { rpc: async (...args) => { calls.push(args); return { data: { success: true, pickups: [{ id: 'pickup' }] } } } },
  })
  await request.run()
  assert.deepEqual(calls, [['delivery_driver_get_return_pickups', { p_session_token: 'development-session-only' }]])
  assert.deepEqual(request.state.setPickups, [{ id: 'pickup' }])
  assert.equal(request.state.setLoading, false)
  const before = request.writes.length
  await request.run(false, () => false)
  assert.equal(request.writes.length, before)
})

const reportCases = [
  ['app/components/OwnerDeliveryManagement.jsx', 'requestInventoryReport', 'getOwnerInventoryReport', 'setInventoryReport', 'setInventoryReportError', 'setInventoryReportLoading'],
  ['app/components/ManagerDeliveryManagement.jsx', 'requestCodReconciliation', 'getManagerCodReconciliation', 'setCodReport', 'setCodError', 'setCodLoading'],
  ['app/components/ManagerDeliveryManagement.jsx', 'requestAfterSales', 'getManagerAfterSales', 'setAfterSalesReport', 'setAfterSalesError', 'setAfterSalesLoading'],
]
for (const [file, name, io, reportSetter, errorSetter, loadingSetter] of reportCases) {
  test(`${name}: report completion, cancellation and failure`, async () => {
    const response = deferred()
    const request = await actualCallback(file, name, { [io]: () => response.promise })
    const pending = request.run()
    assert.deepEqual(request.writes, [])
    response.resolve({ items: [{ id: 'development-report' }] })
    await pending
    assert.deepEqual(request.state[reportSetter], { items: [{ id: 'development-report' }] })
    assert.equal(request.state[loadingSetter], false)
    const failed = await actualCallback(file, name, { [io]: async () => { throw new Error('Test report failed') } })
    await failed.run()
    assert.equal(failed.state[errorSetter], 'Test report failed')
    assert.equal(failed.state[loadingSetter], false)
    const cancelled = await actualCallback(file, name, { [io]: async () => ({ items: ['old'] }) })
    await cancelled.run(() => false)
    assert.deepEqual(cancelled.writes, [])
  })
}

function queryFixture(dataByTable) {
  const calls = []
  return {
    calls,
    from(table) {
      calls.push(['from', table])
      const chain = new Proxy({}, {
        get(_target, method) {
          if (method === 'then') return (resolve, reject) => Promise.resolve(dataByTable[table] || { data: [], error: null }).then(resolve, reject)
          return (...args) => { calls.push([table, method, ...args]); return chain }
        },
      })
      return chain
    },
  }
}

for (const file of ['app/components/DeliveryManagement.jsx', 'app/components/OwnerDeliveryManagement.jsx']) {
  test(`${file}: delivery result keeps restaurant scope and payment visibility filter`, async () => {
    const supabase = queryFixture({ delivery_settings: { data: { store_name: 'Development store' } } })
    const request = await actualCallback(file, 'requestDelivery', {
      supabase, restaurantId: 'development-restaurant', restaurantName: 'Development', restaurantPhone: '',
      EMPTY_SETTINGS: {}, inspectNewOrders() {}, loadDeliveryProofs: async () => {},
    })
    await request.run()
    assert.equal(request.state.setLoading, false)
    assert.equal(request.state.setSettings.store_name, 'Development store')
    assert.deepEqual(supabase.calls.filter(row => row[1] === 'or'), [
      ['delivery_orders', 'or', 'payment_method.eq.cod,payment_status.eq.paid'],
    ])
    assert.equal(supabase.calls.some(row => row[1] === 'insert'), false)
    for (const row of supabase.calls.filter(row => row[1] === 'eq' && row[2] === 'restaurant_id')) {
      assert.equal(row[3], 'development-restaurant')
    }
    const stale = await actualCallback(file, 'requestDelivery', {
      supabase, restaurantId: 'old-restaurant', restaurantName: 'Old', restaurantPhone: '',
      EMPTY_SETTINGS: {}, inspectNewOrders() { assert.fail('Stale response sounded an alarm') }, loadDeliveryProofs: async () => assert.fail('Stale proofs loaded'),
    })
    await stale.run(false, () => false)
    assert.deepEqual(stale.writes, [])
  })
}

test('Resort reads retain restaurant filters and rejected reads finish loading without replacing data', async () => {
  const supabase = queryFixture({ resort_properties: { data: { property_name: 'Development resort' } } })
  const request = await actualCallback('app/components/ResortManagement.jsx', 'requestResort', {
    supabase, restaurantId: 'development-resort', emptyProperty: {}, appNotice() {},
  })
  await request.run()
  assert.equal(request.state.setProperty.property_name, 'Development resort')
  assert.equal(request.state.setLoading, false)
  assert.equal(supabase.calls.filter(row => row[1] === 'eq' && row[2] === 'restaurant_id' && row[3] === 'development-resort').length, 4)
  const notices = []
  const failed = await actualCallback('app/components/ResortManagement.jsx', 'requestResort', {
    supabase: { from() { throw new Error('Test resort unavailable') } }, restaurantId: 'development-resort',
    emptyProperty: {}, appNotice: text => notices.push(text),
  })
  await failed.run()
  assert.equal(failed.state.setProperty, undefined)
  assert.equal(failed.state.setLoading, false)
  assert.deepEqual(notices, ['Unable to load Resort Management: Test resort unavailable'])
})
