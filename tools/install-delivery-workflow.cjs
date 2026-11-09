#!/usr/bin/env node
'use strict'
// Safe additive patcher: backs up original pages and exports full patched JSX as TXT.
// Run from project root after placing the individual TXT assets into DD_DRIVER_WORKFLOW_ASSETS/.
const fs = require('node:fs')
const path = require('node:path')

const root = process.cwd()
const SOURCE_DIR = 'DD_DRIVER_WORKFLOW_ASSETS'
const BACKUP_DIR = 'dd-driver-workflow-backups'
const EXPORT_DIR = 'dd-driver-workflow-full-code-txt'
const pages = [
  'app/delivery-driver/[restaurantCode]/page.jsx',
  'app/app/driver/[restaurantcode]/page.jsx',
  'app/components/OwnerDeliveryManagement.jsx',
  'app/components/ManagerDeliveryManagement.jsx',
]
const newFiles = [
  'app/components/DeliveryDriverWorkflowBoard.jsx',
  'app/components/DeliveryFailedReturnDesk.jsx',
  'app/api/delivery/failed-return/route.js',
]
const marker = 'DD_DRIVER_WORKFLOW_20261108'

function exactlyOnce(src, pattern, replacement, label) {
  const matches = [...src.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'))]
  if (matches.length !== 1) throw new Error(`${label}: expected exactly one anchor, found ${matches.length}. No files were changed.`)
  return src.replace(pattern, replacement)
}

function optionalOnce(src, pattern, replacement, label) {
  const matches = [...src.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g'))]
  if (matches.length > 1) throw new Error(`${label}: ambiguous anchor (${matches.length}). No files were changed.`)
  return matches.length ? src.replace(pattern, replacement) : src
}

function patchDriver(src, filename) {
  let out = src
  if (out.includes(marker)) throw new Error(`${filename}: workflow already installed. No files changed.`)
  out = exactlyOnce(out, /import DeliveryReturnPickupTasks from ['"]@\/app\/components\/DeliveryReturnPickupTasks['"]/, m =>
    `${m}\n// ${marker}\nimport DeliveryDriverWorkflowBoard from '@/app/components/DeliveryDriverWorkflowBoard'`, `${filename} import`)
  out = exactlyOnce(out, /'get_delivery_driver_portal_data'/, "'get_delivery_driver_portal_data_workflow'", `${filename} portal RPC`)
  out = optionalOnce(out, /(\{driverView\s*===\s*'orders'\s*&&\s*\(\s*<div className="space-y-(?:3|4)">)/,
    m => `${m}\n            <DeliveryDriverWorkflowBoard sessionToken={sessionToken} onGoToTracking={() => setDriverView('tracking')} onChanged={() => loadPortal()} />`, `${filename} mobile Orders`)
  out = exactlyOnce(out, /(\{driverView\s*===\s*'orders'\s*&&\s*\(\s*<div className="mt-5 grid gap-4 xl:grid-cols-2">)/,
    m => `${m}\n                  <div className="xl:col-span-2"><DeliveryDriverWorkflowBoard sessionToken={sessionToken} onGoToTracking={() => setDriverView('tracking')} onChanged={() => loadPortal()} /></div>`, `${filename} desktop Orders`)
  return out
}

function patchStore(src, filename, isManager) {
  let out = src
  if (out.includes(marker)) throw new Error(`${filename}: workflow already installed. No files changed.`)
  out = exactlyOnce(out, /import \{ supabase \} from ['"]@\/lib\/supabase['"]/, m =>
    `${m}\n// ${marker}\nimport DeliveryFailedReturnDesk from '@/app/components/DeliveryFailedReturnDesk'`, `${filename} import`)
  const tag = isManager
    ? `<DeliveryFailedReturnDesk mode="manager" restaurantId={restaurantId} restaurantCode={restaurantCode} sessionToken={sessionToken} sessionMode={sessionMode} userId={userId} password={password} />`
    : `<DeliveryFailedReturnDesk mode="owner" restaurantId={restaurantId} />`
  out = exactlyOnce(out, /(\{tab\s*===\s*'orders'\s*&&\s*\(\s*<div className="space-y-4">)/,
    m => `${m}\n          ${tag}`, `${filename} Orders tab`)
  return out
}

function planInstall() {
  const patches = []
  for (const p of pages) {
    const abs = path.join(root,p)
    if (!fs.existsSync(abs)) throw new Error(`Missing project file: ${p}. No files changed.`)
    const src = fs.readFileSync(abs,'utf8')
    const content = p.includes('/driver/') || p.includes('/delivery-driver/')
      ? patchDriver(src,p) : patchStore(src,p,p.includes('ManagerDeliveryManagement'))
    patches.push({ relative:p, content, original:src })
  }
  for (const p of newFiles) {
    const dest = path.join(root,p)
    const asset = path.join(root,SOURCE_DIR,p+'.txt')
    if (!fs.existsSync(asset)) throw new Error(`Missing individual TXT asset: ${SOURCE_DIR}/${p}.txt. Download the individual TXT assets to their exact paths.`)
    if (fs.existsSync(dest)) throw new Error(`New component/API already exists: ${p}. No files changed.`)
    patches.push({ relative:p, content:fs.readFileSync(asset,'utf8'), original:null })
  }
  for (const p of pages) {
    if (fs.existsSync(path.join(root,BACKUP_DIR,p))) throw new Error(`Backup already exists for ${p}. No files changed.`)
  }
  return patches
}

function install() {
  const patches = planInstall()
  for (const p of patches) {
    const dest = path.join(root,p.relative)
    if (p.original !== null) {
      const backup = path.join(root,BACKUP_DIR,p.relative)
      fs.mkdirSync(path.dirname(backup),{recursive:true})
      fs.writeFileSync(backup,p.original,'utf8')
    }
    fs.mkdirSync(path.dirname(dest),{recursive:true})
    fs.writeFileSync(dest,p.content,'utf8')
    const exportPath = path.join(root,EXPORT_DIR,p.relative+'.txt')
    fs.mkdirSync(path.dirname(exportPath),{recursive:true})
    fs.writeFileSync(exportPath,p.content,'utf8')
    console.log(`Installed: ${p.relative}`)
  }
  console.log(`\nFull updated code TXT: ${EXPORT_DIR}/`)
  console.log(`Original backups: ${BACKUP_DIR}/`)
  console.log('Next: confirm Supabase migration is applied, then npm run build.')
}

if (require.main === module) {
  try { install() } catch (err) { console.error('SAFE INSTALL STOPPED:',err.message);process.exitCode=1 }
}
module.exports = { patchDriver,patchStore,planInstall }