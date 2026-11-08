const fs = require('fs'), vm = require('vm'), assert = require('node:assert/strict'), crypto = require('node:crypto')
let code = fs.readFileSync(require('node:path').join(__dirname, '../lib/server/restaurantOrdering.js'),'utf8')
code = code.replace("import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'", "const { createHmac, randomBytes, timingSafeEqual } = require('node:crypto')")
code = code.replace(/\bexport\s+(?=(?:const|class|function|async))/g,'')
code += '\nmodule.exports = { distanceMeters, issueTableToken, verifyTableToken, assertDineInCheckout, OrderingError, getOrderingCapabilities }'
const moduleObj = { exports: {} }
const context = { module: moduleObj, require, Buffer, process: { env: { DINE_IN_QR_SIGNING_SECRET: 'test-signing-secret-longer-than-32-characters' } }, Date, console, Response, Set, Number, Math, String, Promise }
vm.runInNewContext(code, context)
const x = moduleObj.exports
const id = 'b489cf07-e19d-4d28-ab33-3cbf5871f5e1'
const tables = {
  restaurants: { id, plan_code: 'restaurant_delivery', restaurant_code: '37647', approval_status: 'approved', is_open: true },
  tenant_feature_controls: { restaurant_enabled: true, qr_menu_enabled: true, dine_in_enabled: true, takeaway_enabled: true, delivery_enabled: true, delivery_customer_ordering_enabled: true },
  restaurant_ordering_policies: { restaurant_id: id, origin_latitude: 14.5, origin_longitude: 77.6, geofence_enabled: true, signed_table_qr_required: true, home_delivery_entry_enabled: true, radius_m: 40, max_accuracy_m: 50 },
  restaurant_ordering_tables: { restaurant_id: id, table_label: '1', enabled: true },
}
const admin = { from(table) { return {
  select() { return this }, eq() { return this }, maybeSingle: async () => ({ data: tables[table] || null, error: null }),
} } }
async function test() {
  assert.equal(x.distanceMeters(14.5,77.6,14.5,77.6),0)
  assert.ok(x.distanceMeters(14.5,77.6,14.5005,77.6)>50)
  const token=x.issueTableToken(id,'1')
  assert.ok(x.verifyTableToken(token,id,'1'))
  assert.equal(x.verifyTableToken(token,id,'2'),false)
  assert.equal(x.verifyTableToken(token.slice(0,-2)+'xx',id,'1'),false)
  const body = { orderType:'dine-in', latitude:14.5, longitude:77.6, locationAccuracy:10, locationTimestamp:Date.now(), tableQrToken:token }
  await x.assertDineInCheckout(admin,id,'1',body)
  for (const [name, change, code] of [
    ['no GPS',{latitude:undefined},'DINE_IN_LOCATION_REQUIRED'],
    ['uncertain',{locationAccuracy:51},'DINE_IN_LOCATION_UNCERTAIN'],
    ['stale',{locationTimestamp:Date.now()-40000},'DINE_IN_LOCATION_UNCERTAIN'],
    ['outside',{latitude:14.5005},'DINE_IN_OUTSIDE'],
    ['wrong table',{tableQrToken:token},'TABLE_QR_REQUIRED'],
  ]) {
    const tableLabel = name==='wrong table'?'2':'1'
    await assert.rejects(x.assertDineInCheckout(admin,id,tableLabel,{...body,...change}), e=>e.code===code, name)
  }
  tables.restaurants.plan_code='delivery'
  await assert.rejects(x.assertDineInCheckout(admin,id,'1',body),e=>e.code==='RESTAURANT_MODE_DISABLED')
  console.log('PASS: 11 security/geofence checks')
}
test().catch(e=>{console.error(e);process.exitCode=1})
