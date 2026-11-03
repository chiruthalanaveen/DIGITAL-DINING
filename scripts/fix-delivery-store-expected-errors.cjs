/**
 * Digital Dine-In: one-time conservative client-side fix.
 *
 * Target:
 *   app/components/DeliveryStoreExperience.jsx
 *
 * Run from the project root after renaming this TXT file to:
 *   scripts/fix-delivery-store-expected-errors.cjs
 *
 * Usage:
 *   node scripts/fix-delivery-store-expected-errors.cjs
 *
 * It creates a backup and ONLY replaces exact source blocks.
 * It does not alter Supabase access rules, wallets, approval checks,
 * customer logins, checkout, or the store's underlying eligibility.
 */
const fs = require('node:fs')
const path = require('node:path')
const target = path.join(
  process.cwd(),
  'app', 'components', 'DeliveryStoreExperience.jsx'
)
const original = fs.readFileSync(target, 'utf8')
const source = original.replace(/\r\n/g, '\n')

const beforeReject = `      if (!data?.success) {
        throw new Error(data?.message || 'Delivery store is unavailable.')
      }`
const afterReject = `      if (!data?.success) {
        // Normal business-state denial, not a JavaScript exception.
        // If eligibility is revoked while browsing, discard the stale menu.
        setStoreData(null)
        setPlatformFeeQuote({ loaded: false, customerAmount: 0 })
        setError(
          String(data?.message || 'This Delivery store is currently unavailable.')
        )
        return
      }`

const beforeSuccess = `      setStoreData({
        ...data,
        coverage: coverageData,
      })`
const afterSuccess = `      setStoreData({
        ...data,
        coverage: coverageData,
      })
      setError('')`

function replaceExactlyOnce(text, oldValue, newValue) {
  const first = text.indexOf(oldValue)
  if (first < 0) {
    throw new Error(`Expected code was not found: ${oldValue.slice(0, 70)}`)
  }
  if (text.indexOf(oldValue, first + oldValue.length) >= 0) {
    throw new Error('Multiple matches found; the file was not modified.')
  }
  return text.replace(oldValue, newValue)
}

if (source.includes(afterReject)) {
  console.log('This fix has already been applied. No changes made.')
  process.exit(0)
}

// Compute every replacement before writing anything to disk.
let updated = replaceExactlyOnce(source, beforeReject, afterReject)
updated = replaceExactlyOnce(updated, beforeSuccess, afterSuccess)

// Never overwrite an existing backup. Keep an easy rollback path.
const backupPath = target + '.before-store-status-fix.bak'
if (!fs.existsSync(backupPath)) {
  fs.writeFileSync(backupPath, original, { flag: 'wx' })
}
fs.writeFileSync(target, updated, 'utf8')
console.log('Updated:', target)
console.log('Backup:', backupPath)
console.log('NOTE: Database store eligibility remains enforced.')
