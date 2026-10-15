/**
 * Digital Dine-In: remove ONLY the separate DD Business and DD Delivery app routes.
 *
 * Does NOT touch /delivery, /app, /admin, /stay, shared APIs, Supabase, or wallets.
 *
 * USAGE (from Next.js project root):
 *   node remove-separate-dd-apps.cjs           # dry run: show what will change
 *   node remove-separate-dd-apps.cjs --apply   # back up then remove specific folders
 *
 * Paste this TXT file's complete contents into remove-separate-dd-apps.cjs.
 */

'use strict'
const fs = require('node:fs')
const path = require('node:path')

const root = process.cwd()
const mode = process.argv.includes('--apply') ? 'apply' : 'dry-run'
const allowedArgs = new Set(['--apply', '--dry-run'])
const invalid = process.argv.slice(2).filter((arg) => !allowedArgs.has(arg))
if (invalid.length) {
  console.error(`Unknown option(s): ${invalid.join(', ')}`)
  process.exit(1)
}

const manifestPath = path.join(root, 'package.json')
if (!fs.existsSync(manifestPath)) {
  console.error('ERROR: Run from the Next.js project root (the folder with package.json).')
  process.exit(1)
}
let packageJson
try { packageJson = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) } catch {
  console.error('ERROR: Could not read package.json.')
  process.exit(1)
}
if (!(packageJson.dependencies?.next || packageJson.devDependencies?.next)) {
  console.error('ERROR: This does not appear to be a Next.js project. Nothing was removed.')
  process.exit(1)
}

// EXACT whitelisted route folders. No wildcard or broad "dd*" deletion.
const targets = [
  'app/dd-bussiness', // existing spelling in build error
  'app/dd-business',  // alternative route spelling
  'app/dd-delivery',  // separate old Delivery entry (NOT app/delivery)
]

const existing = []
for (const relative of targets) {
  const absolute = path.resolve(root, relative)
  const relativeCheck = path.relative(root, absolute)
  if (relativeCheck.startsWith('..') || path.isAbsolute(relativeCheck)) {
    console.error(`Safety check failed for ${relative}.`)
    process.exit(1)
  }
  if (!fs.existsSync(absolute)) continue
  const stat = fs.lstatSync(absolute)
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    console.error(`ERROR: ${relative} isn't a normal directory; inspect it manually.`)
    process.exit(1)
  }
  existing.push({ relative, absolute })
}

console.log('\nDigital Dine-In separate-app route cleanup')
console.log(`Mode: ${mode}`)
if (existing.length === 0) console.log('No separate DD app route folders found. Nothing to remove.')
for (const target of existing) console.log(`  ${mode === 'apply' ? 'BACK UP + REMOVE' : 'WOULD REMOVE'}: ${target.relative}`)
console.log('Protected: app/delivery, app/components/DeliveryStoreExperience.jsx, app/app, app/admin, app/stay, and all APIs.')

if (mode === 'apply' && existing.length > 0) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupRoot = path.join(root, '.dd-app-route-backups', stamp)
  // Back up EVERY target successfully before deleting ANY target.
  for (const target of existing) {
    const dest = path.join(backupRoot, target.relative)
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.cpSync(target.absolute, dest, { recursive: true, errorOnExist: true, force: false })
    console.log(`  Backed up: ${target.relative} -> ${path.relative(root, dest)}`)
  }
  for (const target of existing) {
    fs.rmSync(target.absolute, { recursive: true, force: false })
    console.log(`  Removed: ${target.relative}`)
  }
  console.log(`\nBackup location: ${path.relative(root, backupRoot)}`)
}

// Find remaining references so navigation doesn't lead to deleted routes.
// We intentionally do NOT rewrite unrelated files or remove shared assets.
const searchDirs = ['app', 'pages', 'components', 'lib', 'public']
const searchFiles = ['next.config.ts', 'next.config.js', 'next.config.mjs', 'middleware.ts', 'middleware.js', 'vercel.json']
const allowedExt = new Set(['.js', '.jsx', '.ts', '.tsx', '.json', '.html', '.webmanifest', '.css', '.md'])
const ignoreDirs = new Set(['node_modules', '.next', '.git', '.dd-app-route-backups', 'dist', 'build'])
const refPattern = /(?:\/dd-delivery|\/dd-business|\/dd-bussiness|dd-business\.css|dd-delivery-sw\.js|dd-business\.webmanifest|dd-delivery\.webmanifest)/i
const refs = []
const skipTarget = (filePath) => targets.some((target) => filePath === target || filePath.startsWith(target + path.sep))
function scanFile(fullPath) {
  const rel = path.relative(root, fullPath)
  if (skipTarget(rel) || !allowedExt.has(path.extname(fullPath).toLowerCase())) return
  let contents
  try {
    if (fs.statSync(fullPath).size > 2_000_000) return
    contents = fs.readFileSync(fullPath, 'utf8')
  } catch { return }
  contents.split(/\r?\n/).forEach((line, index) => {
    if (refPattern.test(line)) refs.push(`${rel}:${index + 1}`)
  })
}
function walk(dir) {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const current = path.join(dir, entry.name)
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) {
      if (!ignoreDirs.has(entry.name)) walk(current)
    } else if (entry.isFile()) scanFile(current)
  }
}
for (const dir of searchDirs) walk(path.join(root, dir))
for (const file of searchFiles) if (fs.existsSync(path.join(root, file))) scanFile(path.join(root, file))

console.log('\nRemaining references (review these to remove outdated links/imports):')
if (refs.length === 0) console.log('  No known separate-app URL or manifest references found in scanned files.')
else {
  for (const ref of refs.slice(0, 70)) console.log(`  ${ref}`)
  if (refs.length > 70) console.log(`  ...and ${refs.length - 70} more.`)
}
console.log('\nNext: manually update listed links to /delivery or your existing business portal, only where appropriate.')
