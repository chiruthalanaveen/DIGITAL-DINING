const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process')
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dd-ordering-test-'))
const files = {
  'app/menu/[id]/page.jsx': `import { useMobileViewportLock } from '@/lib/useMobileViewportLock'
  const [orderType, setOrderType] = useState('dine-in')
  const createPublicOrder = async ({
    const response = await fetch('/api/restaurant/qr-counter-order', {
        totalAmount: Number(totalAmount || 0),
      }),
      console.error('Counter payment error:', error)
      const createResponse = await fetch('/api/restaurant/qr-payment/create', {
          items: finalItems,
          totalAmount
        })
      console.error('[QR MENU] Secure checkout error:', error)
  if (loading) {
    return (
          {/* ORDER MODE */}
          <section>old</section>
          {/* OFFERS */}
                      <div className="mt-5">
                        <p className="mb-2 text-[9px] font-black uppercase tracking-wider text-neutral-400">
                          Order type
                          old
                      </div>
                      <div className="mt-5 rounded-[24px] bg-neutral-950 p-4 text-white">`,
  'app/api/[restaurantid]/qr-counter-order/route.js': `import { qrAdmin, abc } from '@/lib/server/qrPaymentServer'
    const { snapshot, subtotalPaise } = await qrBuildVerifiedCart(admin, restaurantId, payload.items)
    return qrSafeError(error)`,
  'app/api/[restaurantid]/qr-payment/create/route.js': `import { qrAdmin, abc } from '@/lib/server/qrPaymentServer'
    const { snapshot, subtotalPaise } = await qrBuildVerifiedCart(admin, restaurantId, payload.items)
    return qrSafeError(error)`,
  'app/app/owner/[restaurantId]/page.jsx': `        {dashboardMode === 'delivery' && deliveryModuleEnabled && (`,
  'app/app/manager/[restaurantId]/page.jsx': `        {dashboardMode === 'resort' && hasResortAccess && (`,
  'app/app/kitchen/[restaurantId]/page.jsx': `<nav aria-label="Kitchen mobile navigation"`,
  'app/app/waiter/[restaurantId]/page.jsx': `<nav aria-label="Waiter mobile navigation"`,
}
for (const [f, content] of Object.entries(files)) { const p=path.join(root,f);fs.mkdirSync(path.dirname(p),{recursive:true});fs.writeFileSync(p,content) }
const run = cp.spawnSync(process.execPath,[path.join(__dirname,'../tools/apply-ordering-update.cjs')],{cwd:root,encoding:'utf8'})
if (run.status !== 0) { console.error(run.stderr); process.exit(1) }
for (const f of Object.keys(files)) {
  const patched = fs.readFileSync(path.join(root,f),'utf8')
  if (!patched.includes('DD_ORDERING_MODES_20261108')) throw Error('No patch marker in '+f)
  if (f.includes('qr-counter-order') || f.includes('qr-payment/create')) {
    if (!patched.includes('await assertDineInCheckout')) throw Error('Missing server geofence guard in '+f)
  }
  if (f.includes('menu/[id]')) {
    if (!patched.includes('...dineInProof') || !patched.includes('RestaurantDeliveryCheckout')) throw Error('Missing client integration')
  }
  if (!fs.existsSync(path.join(root,'dd-ordering-full-code-txt',f+'.txt'))) throw Error('No TXT for '+f)
  if (!fs.existsSync(path.join(root,'dd-ordering-backups/20261108',f))) throw Error('No backup for '+f)
}
console.log('PASS: 7 integration files patched, backed up, exported to TXT')
fs.rmSync(root,{recursive:true,force:true})
