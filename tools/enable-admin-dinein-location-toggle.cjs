
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const FILE =
  'app/components/AdminRestaurantOrderingControls.jsx'

const MARKER = 'DD_ADMIN_DINEIN_GPS_TOGGLE_20261111'

function count(haystack, needle) {
  return haystack.split(needle).length - 1
}

function patch(source) {
  if (source.includes(MARKER)) {
    throw new Error(
      'Admin GPS toggle is already installed. No files changed.'
    )
  }

  if (!source.includes('changePolicy(key, value)')) {
    throw new Error(
      'Cannot find existing admin policy editor.'
    )
  }

  if (
    !source.includes(
      'geofenceEnabled: policy.geofence_enabled === true'
    )
  ) {
    throw new Error(
      'Admin save does not send geofenceEnabled.'
    )
  }

  if (!source.includes("['signed_table_qr_required'")) {
    throw new Error(
      'Cannot verify signed-table-QR control.'
    )
  }

  if (
    source.includes(
      'Signed table QR requires the dine-in geofence'
    )
  ) {
    throw new Error(
      'Install the previous signed-QR-without-GPS fix first.'
    )
  }

  const normalized = source.replace(/\r\n/g, '\n')

  const oldLine =
    "                    ['geofence_enabled', 'Verify live GPS for Dine-In', 'Customers must provide a fresh, sufficiently accurate location inside the restaurant.'],\n"

  const anchor =
    '                <div className="space-y-3">\n' +
    '                  {[\n' +
    oldLine

  if (count(normalized, anchor) !== 1) {
    throw new Error(
      'The ordering-policy layout has changed. ' +
      'No files changed. Share your current admin JSX for a safe merge.'
    )
  }

  const card = `                {/* ${MARKER}: Existing geofence_enabled policy. */}
                <section
                  className="rounded-2xl border border-sky-500/30 bg-sky-500/5 p-4"
                  aria-label="Customer Dine-In GPS control"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <h5 className="text-xs font-black text-white">
                        Customer Dine-In Location Check
                      </h5>
                      <p className="mt-1 text-[10px] leading-5 text-neutral-400">
                        Super Admin controls whether customers must verify GPS inside the restaurant.
                      </p>
                    </div>

                    <button
                      type="button"
                      role="switch"
                      aria-label="Require customer GPS for dine-in ordering"
                      aria-checked={displayedPolicy.geofence_enabled === true}
                      disabled={busy}
                      onClick={() =>
                        changePolicy(
                          'geofence_enabled',
                          displayedPolicy.geofence_enabled !== true
                        )
                      }
                      className={\`shrink-0 rounded-full border px-5 py-2.5 text-xs font-black transition disabled:cursor-not-allowed disabled:opacity-40 \${displayedPolicy.geofence_enabled === true ? 'border-emerald-500/40 bg-emerald-600 text-white hover:bg-emerald-500' : 'border-neutral-600 bg-neutral-800 text-neutral-200 hover:bg-neutral-700'}\`}
                    >
                      {displayedPolicy.geofence_enabled === true
                        ? 'ON Â· GPS Required'
                        : 'OFF Â· No GPS'}
                    </button>
                  </div>

                  <p className="mt-3 text-[10px] leading-5 text-neutral-300">
                    {displayedPolicy.geofence_enabled === true
                      ? 'ON: The customer sees Check my Dine-In location, and checkout verifies GPS.'
                      : 'OFF: The location-check button is hidden, and dine-in checkout does not request GPS.'}
                  </p>

                  <p className="mt-1 text-[10px] leading-5 text-neutral-400">
                    Signed table QR verification remains independent.
                    Click Save restaurant ordering policy below to apply this change.
                  </p>
                </section>

                <div className="space-y-3">
                  {[
`

  let result = normalized.replace(anchor, card)

  if (
    !result.includes("['signed_table_qr_required'") ||
    !result.includes("['home_delivery_entry_enabled'")
  ) {
    throw new Error(
      'Ordering controls failed preservation check.'
    )
  }

  if (result.includes(oldLine)) {
    throw new Error(
      'Old GPS checkbox was not removed.'
    )
  }

  if (count(result, MARKER) !== 1) {
    throw new Error(
      'Unexpected GPS toggle patch count.'
    )
  }

  if (source.includes('\r\n')) {
    result = result.replace(/\n/g, '\r\n')
  }

  return result
}

function install(root = process.cwd()) {
  const target = path.join(root, FILE)

  if (!fs.existsSync(target)) {
    throw new Error(
      `Missing ${FILE}. Run from your table-pay project root.`
    )
  }

  const original = fs.readFileSync(target, 'utf8')
  const updated = patch(original)

  const stamp = new Date()
    .toISOString()
    .replace(/[:.]/g, '-')

  const backup = path.join(
    root,
    'dd-admin-gps-toggle-backups',
    stamp,
    FILE
  )

  const txt = path.join(
    root,
    'dd-admin-gps-toggle-full-code-txt',
    `${FILE}.txt`
  )

  fs.mkdirSync(path.dirname(backup), {
    recursive: true,
  })

  fs.mkdirSync(path.dirname(txt), {
    recursive: true,
  })

  fs.writeFileSync(backup, original, {
    flag: 'wx',
  })

  try {
    fs.writeFileSync(target, updated)
    fs.writeFileSync(txt, updated)
  } catch (error) {
    fs.writeFileSync(target, original)
    throw error
  }

  console.log(
    'PASS: Super Admin Dine-In GPS ON/OFF switch installed.'
  )
  console.log('Updated:', FILE)
  console.log('Backup:', path.relative(root, backup))
  console.log(
    'Complete JSX as TXT:',
    path.relative(root, txt)
  )
  console.log('Next: npm run build')
}

if (require.main === module) {
  try {
    install()
  } catch (error) {
    console.error('INSTALL STOPPED:', error.message)
    process.exitCode = 1
  }
}

module.exports = {
  patch,
  install,
  FILE,
  MARKER,
}
