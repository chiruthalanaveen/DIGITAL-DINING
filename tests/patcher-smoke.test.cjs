'use strict'
const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { spawnSync } = require('node:child_process')
const patcher = path.resolve(__dirname, '../tools/integrate-admin-restaurant-ordering.cjs')
const embeddedControls = fs.readFileSync(path.resolve(__dirname, '../TXT_CODE/app/components/AdminRestaurantOrderingControls.jsx.txt'), 'utf8')
const originalPage = embeddedControls
  .replace('return <div className="min-w-0 rounded-2xl bg-slate-50 p-4 text-slate-900 sm:p-6">', 'return <main className="min-h-dvh bg-slate-50 p-4 text-slate-900">')
  .replace('<div className="mx-auto max-w-3xl space-y-5">', '<div className="mx-auto max-w-xl space-y-5">')
  .replace('</div></div>', '</div></main>')
const dashboard = `'use client'
import AdminErrorHistory from '@/app/components/AdminErrorHistory'
const NAV = [
  ['delivery-orders', 'Delivery Orders'],
]
const NAV_GROUPS = [
  { title: 'Commerce', items: ['operations', 'delivery-orders', 'payments', 'inventory'] },
]
const NAV_ICONS = { operations: 'activity', 'delivery-orders': 'package', people: 'users' }
const NAV_DESCRIPTIONS = {
  'delivery-orders': 'Delivery order history and reports',
}
function AdminControlCenter() {
  const [section, setSection] = useState('overview')
  // Only the interface changes here; selecting a section never mutates tenant data.
  const switchSection = (key) => {
    if (!NAV.some(([navKey]) => navKey === key)) return
    setSection(key)
    setNavigationOpen(false)
    setCommandOpen(false)
    setCommandQuery('')
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }
  return <main>
          {section === 'delivery-orders' && (
            <DeliveryOrdersReport />
          )}
  </main>
}
`
function write(root, rel, content) { const p=path.join(root,rel); fs.mkdirSync(path.dirname(p),{recursive:true}); fs.writeFileSync(p,content) }
function setup() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'dd-ordering-nav-'))
  write(root,'app/admin/dashboard/page.jsx',dashboard)
  write(root,'app/admin/restaurant-ordering/page.jsx',originalPage)
  return root
}
function run(root) {return spawnSync(process.execPath,[patcher],{cwd:root,encoding:'utf8'})}
test('patches admin sidebar and embeds ordering controls, with full TXT exports and backups',()=>{
  const root=setup()
  try {
    const r=run(root)
    assert.equal(r.status,0,r.stderr)
    const updated=fs.readFileSync(path.join(root,'app/admin/dashboard/page.jsx'),'utf8')
    assert.match(updated,/AdminRestaurantOrderingControls/)
    assert.match(updated,/\['restaurant-ordering', 'Restaurant Ordering'\]/)
    assert.match(updated,/section === 'restaurant-ordering'/)
    assert.match(updated,/window\.history\.replaceState/)
    assert.match(fs.readFileSync(path.join(root,'app/admin/restaurant-ordering/page.jsx'),'utf8'),/redirect\('\/admin\/dashboard\?section=restaurant-ordering'\)/)
    const component=fs.readFileSync(path.join(root,'app/components/AdminRestaurantOrderingControls.jsx'),'utf8')
    assert.match(component,/Save policy/)
    assert.match(component,/Add table/)
    assert.doesNotMatch(component,/<main/)
    assert.equal(fs.readFileSync(path.join(root,'dd-admin-ordering-backups/app/admin/dashboard/page.jsx'),'utf8'),dashboard)
    assert.equal(fs.readFileSync(path.join(root,'dd-admin-ordering-backups/app/admin/restaurant-ordering/page.jsx'),'utf8'),originalPage)
    for (const p of ['app/admin/dashboard/page.jsx','app/admin/restaurant-ordering/page.jsx','app/components/AdminRestaurantOrderingControls.jsx']) {
      assert.ok(fs.existsSync(path.join(root,'dd-admin-ordering-full-code-txt',p+'.txt')))
    }
    const repeat=run(root)
    assert.notEqual(repeat.status,0,'Second run must not overwrite existing changes')
  } finally {fs.rmSync(root,{recursive:true,force:true})}
})
test('missing anchor fails without changing any source files',()=>{
  const root=setup()
  try {
    const broken=dashboard.replace('Delivery order history and reports','History')
    write(root,'app/admin/dashboard/page.jsx',broken)
    const r=run(root)
    assert.notEqual(r.status,0)
    assert.equal(fs.readFileSync(path.join(root,'app/admin/dashboard/page.jsx'),'utf8'),broken)
    assert.equal(fs.readFileSync(path.join(root,'app/admin/restaurant-ordering/page.jsx'),'utf8'),originalPage)
    assert.equal(fs.existsSync(path.join(root,'app/components/AdminRestaurantOrderingControls.jsx')),false)
  } finally {fs.rmSync(root,{recursive:true,force:true})}
})
