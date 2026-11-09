
'use strict'

// Add the location picker to the installed AdminRestaurantOrderingControls.
// This script intentionally leaves the Admin Dashboard untouched.
const fs = require('node:fs')
const path = require('node:path')

const root = process.cwd()
const controlsRel = 'app/components/AdminRestaurantOrderingControls.jsx'
const pickerRel = 'app/components/RestaurantLocationPicker.jsx'
const controlsPath = path.join(root, controlsRel)
const pickerPath = path.join(root, pickerRel)
const pickerTxt = path.join(__dirname, '..', 'TXT_CODE', pickerRel + '.txt')

const IMPORT_ANCHOR = "import { useCallback, useEffect, useMemo, useState } from 'react'"
const SAVE_ANCHOR = '  async function savePolicy() {'
const FIELD_LIST_ANCHOR = `  const fieldList = [
    ['origin_latitude', 'Restaurant latitude', 'any', -90, 90],
    ['origin_longitude', 'Restaurant longitude', 'any', -180, 180],
    ['radius_m', 'Dine-in radius (metres)', 1, 20, 200],`
const GRID_ANCHOR = `                <div className="grid gap-3 sm:grid-cols-2">
                  {fieldList.map(([key, title, step, min, max]) => (`

function fail(message) {
  throw new Error(message)
}

function onlyOnce(source, anchor, description) {
  if (source.split(anchor).length !== 2) {
    fail(`Cannot safely locate ${description}. No files were changed. Share your current ${controlsRel} for a merge.`)
  }
}

function patchControls(source) {
  const crlf = source.includes('\r\n')
  source = source.replace(/\r\n/g, '\n')

  if (source.includes("from '@/app/components/RestaurantLocationPicker'")) {
    fail('The live-location picker is already integrated. No files changed.')
  }

  for (const [anchor, description] of [
    [IMPORT_ANCHOR, 'React import'],
    [SAVE_ANCHOR, 'savePolicy function'],
    [FIELD_LIST_ANCHOR, 'coordinate field list'],
    [GRID_ANCHOR, 'ordering policy field grid'],
  ]) {
    onlyOnce(source, anchor, description)
  }

  let output = source.replace(
    IMPORT_ANCHOR,
    IMPORT_ANCHOR + "\nimport RestaurantLocationPicker from '@/app/components/RestaurantLocationPicker'",
  )

  output = output.replace(SAVE_ANCHOR, `  // A selected GPS/map point is a draft until the admin explicitly saves policy.
  // Never auto-approve an owner's pending coordinate-change request.
  function applySelectedLocation({ latitude, longitude }) {
    if (!validId || busy || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return
    if (latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) return

    setPolicy((current) => current ? {
      ...current,
      origin_latitude: latitude,
      origin_longitude: longitude,
    } : current)

    setApproveRequested(false)
    setNotice({
      type: 'success',
      message: 'Location selected. Review it and click Save restaurant ordering policy to persist it.',
    })
  }

` + SAVE_ANCHOR)

  output = output.replace(
    FIELD_LIST_ANCHOR,
    `  const fieldList = [
    ['radius_m', 'Dine-in radius (metres)', 1, 20, 200],`
  )

  const locationUI = `                <RestaurantLocationPicker
                  key={activeId}
                  latitude={displayedPolicy.origin_latitude}
                  longitude={displayedPolicy.origin_longitude}
                  radiusMeters={Number(displayedPolicy.radius_m) || 40}
                  maxAccuracyMeters={Number(displayedPolicy.max_accuracy_m) || 50}
                  disabled={busy}
                  onApply={applySelectedLocation}
                />

                <details className="rounded-xl border border-neutral-800 bg-neutral-950/70 p-3">
                  <summary className="cursor-pointer text-[10px] font-black text-neutral-300">
                    Manual latitude / longitude (optional fallback)
                  </summary>

                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {[
                      ['origin_latitude', 'Restaurant latitude', -90, 90],
                      ['origin_longitude', 'Restaurant longitude', -180, 180],
                    ].map(([key, title, min, max]) => (
                      <label
                        key={key}
                        className="block text-[10px] font-bold text-neutral-300"
                      >
                        {title}
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min={min}
                          max={max}
                          value={displayedPolicy[key] ?? ''}
                          onChange={(event) => changePolicy(key, event.target.value)}
                          disabled={busy}
                          className={inputClass}
                        />
                      </label>
                    ))}
                  </div>
                </details>

`

  output = output.replace(GRID_ANCHOR, locationUI + GRID_ANCHOR)

  return crlf ? output.replace(/\n/g, '\r\n') : output
}

function writeFile(rel, data) {
  const dest = path.join(root, rel)
  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, data, 'utf8')
}

function run() {
  if (!fs.existsSync(controlsPath)) {
    fail(`Missing ${controlsRel}. Install the earlier Tenants & Access update first.`)
  }

  if (!fs.existsSync(pickerTxt)) {
    fail(`Missing ${pickerTxt}. Extract the full ZIP directly into the table-pay root.`)
  }

  if (fs.existsSync(pickerPath)) {
    fail(`Existing ${pickerRel} detected. No files changed; inspect it before overwriting.`)
  }

  const original = fs.readFileSync(controlsPath, 'utf8')
  const updated = patchControls(original)
  const picker = fs.readFileSync(pickerTxt, 'utf8')

  if (!picker.includes('export default function RestaurantLocationPicker')) {
    fail('Invalid location picker asset. No files changed.')
  }

  // Back up the working component before changing it.
  const backupRel =
    'dd-location-picker-backups/app/components/AdminRestaurantOrderingControls.jsx'

  if (fs.existsSync(path.join(root, backupRel))) {
    fail(`Backup already exists at ${backupRel}. No files changed; preserve the previous backup before retrying.`)
  }

  writeFile(backupRel, original)
  writeFile(controlsRel, updated)
  writeFile(pickerRel, picker)

  writeFile(
    'dd-location-picker-full-code-txt/app/components/AdminRestaurantOrderingControls.jsx.txt',
    updated
  )

  writeFile(
    'dd-location-picker-full-code-txt/app/components/RestaurantLocationPicker.jsx.txt',
    picker
  )

  console.log('PASS: Live GPS and interactive pin selection added to Tenants & Access → Ordering.')
  console.log('PASS: Existing Admin Dashboard, API, QR, wallet, delivery, approval and payment files untouched.')
  console.log('PASS: Manual coordinates kept as an optional fallback.')
  console.log(`Backup: ${backupRel}`)
  console.log('Full updated JSX in TXT: dd-location-picker-full-code-txt/app/components/')
  console.log('Next: npm install leaflet@1.9.4 && npm run build')
}

if (require.main === module) {
  try {
    run()
  } catch (error) {
    console.error('INSTALL FAILED:', error.message)
    process.exitCode = 1
  }
}

module.exports = { patchControls }
