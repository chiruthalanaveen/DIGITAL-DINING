/**
 * Digital Dine-In — safer install of named support chat and admin owner drilldown.
 * Usage (from repository root):
 * node "<extracted-folder>/DigitalDine_LiveSupport_OwnerDetails_Upgrade/tools/install-support-owner-details.cjs"
 * The installer reads its own package dir, preserves unrelated dashboard code,
 * creates backups, and is safe to rerun. Apply SQL in staging first.
 */
const fs = require('node:fs')
const path = require('node:path')

const ROOT = process.cwd()
const PKG = path.resolve(__dirname, '..')
const replacements = [
  'app/components/OwnerSupportChat.jsx',
  'app/api/owner/live-support/route.js',
  'app/api/admin/live-support/route.js',
  'app/api/admin/live-support/owner-profile/route.js',
  'app/components/AdminSupportOwnerDetails.jsx',
]

function getSource(file) {
  const payload = path.join(PKG, `${file}.txt`)
  if (!fs.existsSync(payload)) throw new Error(`Package is incomplete: ${payload}`)
  return fs.readFileSync(payload, 'utf8')
}

function patchAdminDashboard(source) {
  if (source.includes('AdminSupportOwnerDetails') && source.includes('supportOwnerProfileId')) return source
  const lineEnding = source.includes('\r\n') ? '\r\n' : '\n'
  let out = source.replace(/\r\n/g, '\n')

  const importAnchor = "import AdminWalletControls from '@/app/components/AdminWalletControls'"
  if (!out.includes(importAnchor)) throw new Error('Admin import anchor not found; do not overwrite your newer dashboard.')
  out = out.replace(importAnchor, "import AdminSupportOwnerDetails from '@/app/components/AdminSupportOwnerDetails'\n" + importAnchor)

  const functionAnchor = 'export default function AdminControlCenter() {'
  if (!out.includes(functionAnchor)) throw new Error('Admin dashboard component anchor not found.')
  out = out.replace(functionAnchor, functionAnchor + "\n  const [supportOwnerProfileId, setSupportOwnerProfileId] = useState('')")

  const title = /(<p className="text-lg font-black text-white">\s*\{selectedLiveSupport\.restaurant_name\s*\|\|\s*'Restaurant'\}\s*<\/p>)/
  if (!title.test(out)) throw new Error('Admin selected support session title anchor not found.')
  out = out.replace(title, `$1
                            <button type="button" onClick={() => setSupportOwnerProfileId(String(selectedLiveSupport.restaurant_id || ''))}
                              className="mt-2 inline-flex items-center gap-2 rounded-xl border border-emerald-500/40 bg-emerald-500/10 px-3 py-2 text-[11px] font-extrabold text-emerald-300 hover:bg-emerald-500/20"
                              title="View this owner, their business, and ongoing orders">👤 View owner details and active orders ↗</button>`)

  const olderLabel = /\{adminMessage\s*\?\s*'Admin'\s*:\s*'Restaurant \/ Manager'\}/g
  const namedLabel = /\{message\.sender_name\s*\|\|\s*\(adminMessage\s*\?\s*'Super Admin'\s*:\s*'Restaurant owner'\)\}/g
  const replacement = `{adminMessage
                                        ? (message.sender_name || 'Super Admin')
                                        : <button type="button" className="underline decoration-emerald-400/60 underline-offset-2 hover:text-emerald-300"
                                            onClick={() => setSupportOwnerProfileId(String(selectedLiveSupport?.restaurant_id || ''))}
                                            title="View verified owner details and order activity">
                                            {message.sender_name || 'Owner / Manager (older message)'}
                                          </button>}`
  let count = [...out.matchAll(olderLabel)].length
  if (count === 1) out = out.replace(olderLabel, replacement)
  else {
    count = [...out.matchAll(namedLabel)].length
    if (count !== 1) throw new Error('Admin message sender anchor not found or ambiguous: ' + count)
    out = out.replace(namedLabel, replacement)
  }

  const lastMainClose = out.lastIndexOf('    </main>')
  if (lastMainClose < 0) throw new Error('Admin main closing tag not found; cannot insert profile drawer.')
  out = out.slice(0, lastMainClose) +
    `      {supportOwnerProfileId && <AdminSupportOwnerDetails restaurantId={supportOwnerProfileId}
        onClose={() => setSupportOwnerProfileId('')} />}
` + out.slice(lastMainClose)

  return lineEnding === '\r\n' ? out.replace(/\n/g, '\r\n') : out
}

try {
  const plans = replacements.map(file => {
    const target = path.join(ROOT, file)
    const next = getSource(file)
    const old = fs.existsSync(target) ? fs.readFileSync(target, 'utf8') : null
    return { target, old, next }
  })
  const adminTarget = path.join(ROOT, 'app/admin/dashboard/page.jsx')
  if (!fs.existsSync(adminTarget)) throw new Error('Missing app/admin/dashboard/page.jsx')
  const adminOld = fs.readFileSync(adminTarget, 'utf8')
  plans.push({ target: adminTarget, old: adminOld, next: patchAdminDashboard(adminOld) })

  // No write occurs until all source anchors are verified.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  for (const plan of plans) {
    if (plan.next === plan.old) {
      console.log(`Already updated: ${path.relative(ROOT, plan.target)}`)
      continue
    }
    fs.mkdirSync(path.dirname(plan.target), { recursive: true })
    if (plan.old !== null) fs.copyFileSync(plan.target, `${plan.target}.before-owner-details-${stamp}.bak`)
    fs.writeFileSync(plan.target, plan.next)
    console.log(`Installed: ${path.relative(ROOT, plan.target)}`)
  }
  console.log('Complete. Apply SQL migration, then run npm run build and test signed-in Owner/Admin.')
} catch (error) {
  console.error('No files changed: ' + error.message)
  process.exitCode = 1
}