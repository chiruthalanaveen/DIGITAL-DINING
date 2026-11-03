/**
 * Digital Dine-In - iPhone Driver Portal safe-area/mobile layout fix.
 * Source route: app/app/driver/[restaurantcode]/page.jsx
 *
 * This script changes ONLY the mobile container, header and the empty
 * delivery card. It does not edit Supabase RPCs, driver order controls,
 * COD, GPS, session logic, alarms or the desktop layout.
 *
 * Install as tools/fix-driver-mobile-header.cjs and run from project root:
 *   node tools/fix-driver-mobile-header.cjs
 */
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')

const filename = path.resolve(
  process.cwd(),
  'app', 'app', 'driver', '[restaurantcode]', 'page.jsx'
)

if (!fs.existsSync(filename)) {
  console.error('Driver page not found:', filename)
  console.error('Run this script from the DIGITAL-DINING project root.')
  process.exit(1)
}

const original = fs.readFileSync(filename, 'utf8')
let updated = original
let patches = 0

const previousMobileContainer =
  '<div className="min-h-[100dvh] bg-[#f5f6f8] px-3 pb-44 pt-4 lg:hidden">'
const fixedMobileContainer = `\
<div
        className="min-h-[100dvh] min-w-0 bg-[#f5f6f8] px-3 lg:hidden"
        style={{
          // Keep the header below iPhone Dynamic Island / an ongoing call.
          // A real safe area is used, not a hard-coded iPhone screen size.
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.5rem)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 7.5rem)',
        }}
      >`

if (updated.includes(previousMobileContainer)) {
  updated = updated.replace(previousMobileContainer, fixedMobileContainer)
  patches++
} else if (!updated.includes('Keep the header below iPhone Dynamic Island')) {
  console.error('Mobile container differs from the audited version. No file was changed.')
  process.exit(1)
}

const oldHeaderStart = '<header className="mb-4 flex items-center justify-between gap-3">'
const newHeaderMarker = '<header className="mb-4 rounded-[24px] border border-neutral-200 bg-white px-4 py-3 shadow-sm">'
const newHeader = `<header className="mb-4 rounded-[24px] border border-neutral-200 bg-white px-4 py-3 shadow-sm">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-50 text-xl" aria-hidden="true">
              🚚
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-black leading-6 text-neutral-900">
                {restaurant.name || 'Delivery'}
              </p>
              <p className="truncate text-[10px] font-extrabold uppercase tracking-[0.16em] text-emerald-700">
                Driver Portal
              </p>
            </div>
            <span className="hidden shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1.5 text-[10px] font-bold text-emerald-700 min-[390px]:inline-flex">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" aria-hidden="true" />
              On shift
            </span>
          </div>

          <div className="mt-3 flex min-w-0 items-center justify-between gap-2 border-t border-neutral-100 pt-3">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-wider text-neutral-600">
                Delivery alerts
              </p>
              <p className="truncate text-[11px] text-neutral-500">
                {driverAlarmEnabled ? 'Alarm enabled' : 'Enable alerts for new trips'}
              </p>
            </div>
            <button
              type="button"
              aria-pressed={driverAlarmEnabled}
              onClick={driverAlarmEnabled ? disableDriverAlarm : enableDriverAlarm}
              className={\`min-h-[44px] max-w-[52%] shrink-0 whitespace-nowrap rounded-xl px-3 text-xs font-black transition active:scale-[0.98] \${
                driverAlarmEnabled
                  ? 'bg-emerald-600 text-white'
                  : 'border border-neutral-300 bg-neutral-50 text-neutral-800'
              }\`}
            >
              {driverAlarmEnabled ? '🔔 Alarm On' : '🔕 Enable Alarm'}
            </button>
          </div>
        </header>`

if (updated.includes(oldHeaderStart)) {
  const start = updated.indexOf(oldHeaderStart)
  const end = updated.indexOf('</header>', start)
  if (end < 0 || end - start > 2000) {
    console.error('Could not safely identify the mobile header. No file was changed.')
    process.exit(1)
  }
  updated = updated.slice(0, start) + newHeader + updated.slice(end + '</header>'.length)
  patches++
} else if (!updated.includes(newHeaderMarker)) {
  console.error('Mobile header differs from the audited version. No file was changed.')
  process.exit(1)
}

const oldEmptyCard = `      <div className="rounded-2xl border border-dashed border-neutral-300 bg-white px-5 py-14 text-center">
        <div className="text-4xl">◎</div>
        <p className="mt-3 text-base font-black text-neutral-800">No active delivery</p>
        <p className="mt-1 text-sm text-neutral-500">Assigned orders will appear here.</p>
      </div>`
const newEmptyCard = `      <div className="rounded-3xl border border-dashed border-neutral-200 bg-white px-5 py-10 text-center shadow-sm">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-sky-50 text-3xl" aria-hidden="true">🚚</div>
        <h3 className="mt-4 text-lg font-black text-neutral-900">No active delivery</h3>
        <p className="mx-auto mt-2 max-w-xs text-sm leading-6 text-neutral-500">
          You're all caught up. New assigned orders will appear here automatically.
        </p>
        <div className="mx-auto mt-5 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700">
          <span className="h-2 w-2 rounded-full bg-emerald-500" aria-hidden="true" />
          Waiting for assignments
        </div>
      </div>`

if (updated.includes(oldEmptyCard)) {
  updated = updated.replace(oldEmptyCard, newEmptyCard)
  patches++
} else if (!updated.includes("You're all caught up. New assigned orders")) {
  console.error('Empty delivery card differs from the audited version. No file was changed.')
  process.exit(1)
}

// Reject incomplete transformation rather than silently shipping a broken UI.
if (!updated.includes('Keep the header below iPhone Dynamic Island') ||
    !updated.includes(newHeaderMarker) ||
    !updated.includes("You're all caught up. New assigned orders")) {
  console.error('UI patch validation failed. No file was changed.')
  process.exit(1)
}

if (patches === 0) {
  console.log('Already updated. No changes needed:', filename)
  process.exit(0)
}

const backupDirectory = path.join(os.tmpdir(), 'digitaldine-driver-page-backups')
fs.mkdirSync(backupDirectory, { recursive: true })
const backupPath = path.join(backupDirectory, `driver-page-${Date.now()}.jsx`)
fs.writeFileSync(backupPath, original)
fs.writeFileSync(filename, updated)
console.log('Updated mobile Driver Portal:', filename)
console.log('Changes applied:', patches)
console.log('Backup:', backupPath)
console.log('Next: npm run build')
