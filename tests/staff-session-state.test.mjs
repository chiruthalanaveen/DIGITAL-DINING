import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'
import ts from 'typescript'

const files = [
  'app/app/driver/[restaurantcode]/page.jsx',
  'app/delivery-driver/[restaurantCode]/page.jsx',
  'app/app/packer/[restaurantcode]/page.jsx',
  'app/delivery-packer/[restaurantCode]/page.jsx',
]

async function sessionHarness(relative) {
  const source = ts.createSourceFile(relative, await readFile(new URL(`../${relative}`, import.meta.url), 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX)
  const declarations = source.statements.filter(node => ts.isFunctionDeclaration(node) && ['readStoredSession', 'usePortalSession'].includes(node.name?.text))
  assert.equal(declarations.length, 2)
  const storage = new Map(), states = []
  let cursor = 0, changed = false, server = false, storageUnavailable = false
  const context = {
    localStorage: { getItem(key) { if (storageUnavailable) throw new Error('Storage disabled'); return storage.get(key) ?? null } },
    subscribeStoredSession() {},
    subscribeHydration() {},
    useSyncExternalStore(subscribe, snapshot, serverSnapshot) { return server ? serverSnapshot() : snapshot() },
    useState(initial) {
      const index = cursor++
      if (!(index in states)) states[index] = initial
      return [states[index], value => {
        states[index] = typeof value === 'function' ? value(states[index]) : value
        changed = true
      }]
    },
  }
  const hook = vm.runInNewContext(`${declarations.map(node => node.getText(source)).join('\n')}\nusePortalSession`, context)
  function render(key) {
    let result, attempts = 0
    do {
      changed = false
      cursor = 0
      result = hook(key)
      assert.ok(++attempts < 5, 'Session reset must settle without a render loop')
    } while (changed)
    return result
  }
  return { storage, render, setServer(value) { server = value }, disableStorage() { storageUnavailable = true } }
}

for (const file of files) {
  test(`${file}: store changes and external token changes cannot revive an in-memory session`, async () => {
    const fixture = await sessionHarness(file)
    fixture.storage.set('store-a', 'development-token-a')
    fixture.storage.set('store-b', 'development-token-b')
    let session = fixture.render('store-a')
    assert.equal(session[0], 'development-token-a')
    session[1]('development-token-a')
    assert.equal(fixture.render('store-a')[0], 'development-token-a')
    assert.equal(fixture.render('store-b')[0], 'development-token-b')
    fixture.storage.set('store-a', 'development-token-a-refreshed')
    session = fixture.render('store-a')
    assert.equal(session[0], 'development-token-a-refreshed')
    session[1]('development-token-a-refreshed')
    fixture.storage.delete('store-a')
    assert.equal(fixture.render('store-a')[0], '', 'External logout clears an overridden token')
    fixture.storage.set('store-a', 'development-token-new-login')
    assert.equal(fixture.render('store-a')[0], 'development-token-new-login')
  })

  test(`${file}: SSR stays logged out and temporary login works when storage is unavailable`, async () => {
    const fixture = await sessionHarness(file)
    fixture.storage.set('store-a', 'development-browser-only-token')
    fixture.setServer(true)
    let session = fixture.render('store-a')
    assert.equal(session[0], '')
    assert.equal(session[2], true)
    fixture.setServer(false)
    assert.equal(fixture.render('store-a')[0], 'development-browser-only-token')
    fixture.disableStorage()
    session = fixture.render('store-a')
    session[1]('development-memory-only-token')
    assert.equal(fixture.render('store-a')[0], 'development-memory-only-token')
    assert.equal(fixture.render('store-b')[0], '', 'Memory-only sessions remain store-scoped')
    assert.equal(fixture.render('store-a')[0], '', 'Returning to a store does not revive a discarded memory session')
  })
}
