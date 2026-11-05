#!/usr/bin/env node
/* Optional: lower Delivery dashboard's background polling from 1s to 15s.
 * Supabase's existing delivery_orders Realtime subscription remains enabled.
 * Run from your Next.js project root.
 */
const fs = require('node:fs')
const path = require('node:path')
const filename = path.join(process.cwd(), 'app/components/OwnerDeliveryManagement.jsx')
const original = fs.readFileSync(filename, 'utf8')
const exact = /useLiveDeliveryRefresh\(\s*\(\)\s*=>\s*refreshOrdersOnly\(true\),\s*Boolean\(restaurantId\),\s*1000\s*\)/
const changed = 'useLiveDeliveryRefresh(\n    () => refreshOrdersOnly(true),\n    Boolean(restaurantId),\n    15000\n  )'
if (!exact.test(original)) {
  if (/useLiveDeliveryRefresh\(\s*\(\)\s*=>\s*refreshOrdersOnly\(true\),\s*Boolean\(restaurantId\),\s*15000\s*\)/.test(original)) {
    console.log('Already configured for 15-second refresh.')
    process.exit(0)
  }
  console.error('Expected original polling block not found; no change made.')
  process.exit(1)
}
fs.copyFileSync(filename, filename+'.backup-before-poll-tuning')
fs.writeFileSync(filename, original.replace(exact,changed), 'utf8')
console.log('Delivery background refresh: 15 seconds. Realtime order subscription kept.')
