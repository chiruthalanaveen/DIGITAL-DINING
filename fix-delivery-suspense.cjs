/**
 * Minimal Next.js 16 /delivery Suspense patch.
 * Run: node fix-delivery-suspense.cjs app/delivery/page.jsx
 * Creates a .backup-before-suspense file and preserves all existing UI.
 */
const fs = require('node:fs')
const path = require('node:path')
const file = path.resolve(process.argv[2] || 'app/delivery/page.jsx')
if (!fs.existsSync(file)) {
  console.error('File not found:', file)
  process.exit(1)
}
const original = fs.readFileSync(file, 'utf8')
if (original.includes('<DeliveryCustomerHomeContent />') && original.includes('<Suspense')) {
  console.log('Suspense fix is already installed:', file)
  process.exit(0)
}
if (!original.startsWith("'use client'") && !original.startsWith('"use client"')) {
  console.error('Expected a client page. No changes made.')
  process.exit(1)
}
const declaration = /export default function DeliveryCustomerHome\s*\(\s*\)\s*\{/g
const matches = [...original.matchAll(declaration)]
if (matches.length !== 1) {
  console.error('Could not find a unique default DeliveryCustomerHome() function. No changes made.')
  process.exit(1)
}
const reactImport = /import\s*\{([^}]+)\}\s*from\s*['"]react['"]/m
if (!reactImport.test(original)) {
  console.error('Expected a named import from react. No changes made.')
  process.exit(1)
}
let updated = original.replace(reactImport, (entire, names) => {
  const parts = names.split(',').map(s => s.trim()).filter(Boolean)
  if (!parts.includes('Suspense')) parts.unshift('Suspense')
  return `import { ${parts.join(', ')} } from 'react'`
})
updated = updated.replace(declaration, 'function DeliveryCustomerHomeContent() {')
updated += `

// Next.js 16: useSearchParams needs a Suspense boundary.
function DeliveryHomeLoadingFallback() {
  return (
    <main className="min-h-[100dvh] bg-[#f5f7f6] text-slate-950">
      <div className="mx-auto w-full max-w-[540px] px-4 py-7">
        <p className="rounded-2xl border border-slate-200 bg-white p-6 text-center text-sm font-semibold" role="status">Loading delivery locations…</p>
      </div>
    </main>
  )
}

export default function DeliveryCustomerHome() {
  return (
    <Suspense fallback={<DeliveryHomeLoadingFallback />}>
      <DeliveryCustomerHomeContent />
    </Suspense>
  )
}
`
fs.writeFileSync(file + '.backup-before-suspense', original, { flag: 'wx' })
fs.writeFileSync(file, updated)
console.log('Fixed:', file)
console.log('Backup:', file + '.backup-before-suspense')
