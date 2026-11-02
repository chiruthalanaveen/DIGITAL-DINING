import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

// Execute the real functions/guards extracted from JSX, with I/O and React
// setters injected. No application module or hosted credential is imported.
async function sourceFile(relative) {
  const file = new URL(`../${relative}`, import.meta.url)
  const text = await readFile(file, 'utf8')
  return ts.createSourceFile(relative, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX)
}
function nodeText(source, predicate) {
  let found
  function visit(node) {
    if (!found && predicate(node)) found = node
    if (!found) ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(found, 'Expected executable source node was found')
  return found.getText(source)
}
function variableFunction(source, name, context) {
  let expression
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === name) expression = node.initializer.getText(source)
    if (!expression) ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(expression, `${name} exists in the actual source`)
  return vm.runInNewContext(`(${expression})`, context)
}
function json(value) { return JSON.parse(JSON.stringify(value)) }
const storeFiles = [
  'app/components/DeliveryStoreExperience.jsx',
  'app/app/delivery/[restaurantcode]/page.jsx',
]

for (const filename of storeFiles) {
  test(`${filename}: actual public-store completion reconciles inventory without a synchronous loading write`, async () => {
    const source = await sourceFile(filename)
    const writes = []
    const rpcCalls = []
    let resolveStore
    const pendingStore = new Promise(resolve => { resolveStore = resolve })
    let cart = { available: 9, soldOut: 1, removed: 2, untracked: 4 }
    const context = {
      restaurantCode: 'isolated-store',
      console: { warn() {}, error() {} },
      supabase: { rpc(name, args) {
        rpcCalls.push({ name, args })
        if (name === 'get_public_delivery_store') return pendingStore
        if (name === 'get_public_delivery_coverage') return Promise.resolve({ data: { success: true }, error: null })
        if (name === 'get_public_delivery_platform_fee_quote') return Promise.resolve({ data: { success: true, customerAmount: 7 }, error: null })
        throw new Error(`Unexpected RPC ${name}`)
      } },
      setCart(update) { cart = update(cart); writes.push('cart') },
      setStoreData(data) { writes.push(['store', data]) },
      setPlatformFeeQuote(data) { writes.push(['fee', data]) },
      setPaymentMethod(method) { writes.push(['method', method]) },
      setError(error) { writes.push(['error', error]) },
      setLoading(loading) { writes.push(['loading', loading]) },
    }
    const stockSource = nodeText(source, node => ts.isFunctionDeclaration(node) && node.name?.text === 'deliveryStockInfo')
    context.deliveryStockInfo = vm.runInNewContext(`(${stockSource})`)
    const request = variableFunction(source, 'requestStore', context)
    const completion = request()
    assert.deepEqual(writes, [], 'No setter runs before the real RPC resolves')
    resolveStore({ data: {
      success: true,
      menu_items: [
        { id: 'available', track_stock: true, available_stock: 3 },
        { id: 'soldOut', track_stock: true, available_stock: 0 },
        { id: 'untracked', track_stock: false },
      ],
      settings: { cod_enabled: true, online_payment_enabled: true },
    }, error: null })
    await completion
    assert.deepEqual(json(cart), { available: 3, untracked: 4 })
    assert.equal(writes.filter(value => value === 'cart').length, 1)
    assert.deepEqual(json(writes.find(value => value[0] === 'method')), ['method', 'cod'])
    assert.deepEqual(json(writes.find(value => value[0] === 'fee')), ['fee', { loaded: true, customerAmount: 7 }])
    assert.deepEqual(rpcCalls.map(call => call.name), [
      'get_public_delivery_store', 'get_public_delivery_coverage', 'get_public_delivery_platform_fee_quote',
    ])
    assert.equal(rpcCalls.every(call => call.args.p_restaurant_code === 'isolated-store'), true)
  })

  test(`${filename}: quiet refresh preserves the user's selected payment and skips fee reload`, async () => {
    const source = await sourceFile(filename)
    const calls = []
    let cart = { unchanged: 2 }
    const context = {
      restaurantCode: 'isolated-store', console: { warn() {}, error() {} },
      supabase: { rpc(name) {
        calls.push(name)
        return Promise.resolve({ data: name === 'get_public_delivery_store'
          ? { success: true, menu_items: [{ id: 'unchanged', track_stock: false }], settings: { online_payment_enabled: true } }
          : { success: true }, error: null })
      } },
      setCart(update) { cart = update(cart) }, setStoreData() {},
      setPlatformFeeQuote() { assert.fail('Quiet refresh must preserve checkout fee state') },
      setPaymentMethod() { assert.fail('Quiet refresh must preserve the selected payment') },
      setError() { assert.fail('Quiet refresh must preserve visible error state') },
      setLoading() { assert.fail('Quiet refresh must not start/stop the main loader') },
    }
    context.deliveryStockInfo = vm.runInNewContext(`(${nodeText(source, node => ts.isFunctionDeclaration(node) && node.name?.text === 'deliveryStockInfo')})`)
    await variableFunction(source, 'requestStore', context)(true)
    assert.deepEqual(json(cart), { unchanged: 2 })
    assert.deepEqual(calls, ['get_public_delivery_store', 'get_public_delivery_coverage'])
  })
}

test('Actual identity guard clears private views on account changes and leaves a stable identity untouched', async () => {
  const source = await sourceFile(storeFiles[0])
  const guard = nodeText(source, node => ts.isIfStatement(node) && node.expression.getText(source) === 'previousIdentityKey !== activeIdentityKey')
  const calls = []
  const context = { previousIdentityKey: 'google:owner-a', activeIdentityKey: 'mobile:customer-b:store-b' }
  for (const name of ['setPreviousIdentityKey', 'setTrackingOrders', 'setTrackingAccountEmail', 'setTrackingOpen', 'setAfterSalesOrder', 'setAfterSalesOpen', 'setLocationConfirmed', 'setSelectedSavedAddressId']) {
    context[name] = value => calls.push([name, value])
  }
  vm.runInNewContext(guard, context)
  assert.deepEqual(json(calls), [
    ['setPreviousIdentityKey', 'mobile:customer-b:store-b'], ['setTrackingOrders', []],
    ['setTrackingAccountEmail', ''], ['setTrackingOpen', false], ['setAfterSalesOrder', null],
    ['setAfterSalesOpen', false], ['setLocationConfirmed', false], ['setSelectedSavedAddressId', ''],
  ])
  calls.length = 0
  context.previousIdentityKey = context.activeIdentityKey
  vm.runInNewContext(guard, context)
  assert.deepEqual(calls, [])
})

test('Actual return-link guard waits for authentication and store policy and preserves disabled-store tracking', async () => {
  const source = await sourceFile(storeFiles[0])
  const guard = nodeText(source, node => ts.isIfStatement(node) && node.expression.getText(source).startsWith('restaurantCode && returnOrderCode && !isCustomerSessionLoading'))
  const calls = []
  const context = {
    restaurantCode: 'store-b', returnOrderCode: 'ORDER_42', isCustomerSessionLoading: true,
    returnsPolicyLoaded: true, handledReturnLink: '', returnLinkKey: 'store-b:ORDER_42',
    isCustomerSignedIn: true, returnsEnabled: true, mobileCustomer: { mobile: '9999900000' },
    setHandledReturnLink: value => calls.push(['handled', value]),
    openAfterSales: value => calls.push(['return', value]),
    setTrackingError: value => calls.push(['error', value]),
    setTrackingOpen: value => calls.push(['tracking', value]),
  }
  vm.runInNewContext(guard, context)
  assert.deepEqual(calls, [])
  context.isCustomerSessionLoading = false
  context.returnsPolicyLoaded = false
  vm.runInNewContext(guard, context)
  assert.deepEqual(calls, [])
  context.returnsPolicyLoaded = true
  vm.runInNewContext(guard, context)
  assert.deepEqual(json(calls), [['handled', 'store-b:ORDER_42'], ['return', { orderCode: 'ORDER_42', mobile: '9999900000', tab: 'request' }]])
  calls.length = 0
  context.returnsEnabled = false
  vm.runInNewContext(guard, context)
  assert.equal(calls.some(([kind]) => kind === 'return'), false)
  assert.deepEqual(calls.find(([kind]) => kind === 'tracking'), ['tracking', true])
  calls.length = 0
  context.isCustomerSignedIn = false
  vm.runInNewContext(guard, context)
  assert.deepEqual(calls, [['handled', 'store-b:ORDER_42']], 'Guests receive no private return modal')
})

test('Actual return-link URL effect consumes the request once and redirects a guest with the same store/order', async () => {
  const source = await sourceFile(storeFiles[0])
  let callback
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === 'useEffect' && node.arguments[0]?.getText(source).includes('handledReturnLink !== returnLinkKey')) callback = node.arguments[0].getText(source)
    ts.forEachChild(node, visit)
  }
  visit(source)
  assert.ok(callback)
  const pushes = [], replacements = [], events = []
  const window = {
    location: { href: 'https://local.example.test/delivery/store-b?returnOrder=ORDER_42&keep=1#status' },
    history: { state: { internal: true }, replaceState(state, title, path) {
      replacements.push({ state, title, path })
      window.location.href = new URL(path, window.location.href).href
    } },
    dispatchEvent(event) { events.push(event.type) },
  }
  const effect = vm.runInNewContext(`(${callback})`, {
    returnOrderCode: 'ORDER_42', handledReturnLink: 'store-b:ORDER_42', returnLinkKey: 'store-b:ORDER_42',
    restaurantCode: 'store-b', isCustomerSignedIn: false, window, URL, Event,
    router: { push: value => pushes.push(value) },
  })
  effect()
  effect()
  assert.equal(replacements.length, 1)
  assert.equal(replacements[0].path, '/delivery/store-b?keep=1#status')
  assert.deepEqual(events, ['digitaldine:store-url'])
  assert.deepEqual(pushes, ['/delivery/login?next=%2Fdelivery%2Fstore-b%3FreturnOrder%3DORDER_42'])
})

test('Actual returns-settings loading guard blocks saving a different store until its own request resolves', async () => {
  const source = await sourceFile('app/components/DeliveryCustomerReturnsControl.jsx')
  const declaration = nodeText(source, node => ts.isVariableDeclaration(node) && node.name.getText(source) === 'loading')
  const loading = context => vm.runInNewContext(`const ${declaration}; loading`, context)
  assert.equal(loading({ requestLoading: false, loadedRequestKey: 'admin::store-a', requestKey: 'admin::store-b' }), true)
  assert.equal(loading({ requestLoading: false, loadedRequestKey: 'admin::store-b', requestKey: 'admin::store-b' }), false)
  assert.equal(loading({ requestLoading: true, loadedRequestKey: 'admin::store-b', requestKey: 'admin::store-b' }), true)
})
