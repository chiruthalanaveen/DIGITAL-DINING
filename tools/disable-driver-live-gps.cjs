'use strict'

/**
 * Digital Dine-In: Disable driver live GPS sharing.
 *
 * Removes:
 * - Driver browser GPS watcher
 * - Live GPS update RPC calls
 * - Customer Live Tracking card
 * - Live GPS status and retry controls
 *
 * Preserves:
 * - Order status tracking
 * - Customer address navigation
 * - Delivery proof and unsuccessful deliveries
 * - COD reconciliation
 * - Existing delivery workflow
 */

const fs = require('node:fs')
const path = require('node:path')

const MARKER = 'DD_DRIVER_LIVE_GPS_DISABLED_20261109'

const DRIVER_PAGES = [
  'app/delivery-driver/[restaurantCode]/page.jsx',
  'app/app/driver/[restaurantcode]/page.jsx',
]

function assertOne(source, needle, label) {
  const first = source.indexOf(needle)

  if (
    first < 0 ||
    source.indexOf(needle, first + needle.length) >= 0
  ) {
    throw new Error(
      `${label}: expected exactly one anchor. No files changed.`
    )
  }

  return first
}

function patchDriver(source, fileLabel = 'driver page') {
  if (source.includes(MARKER)) {
    throw new Error(
      `${fileLabel}: live GPS is already disabled by this patch.`
    )
  }

  assertOne(
    source,
    '  const liveTrackingOrderIds =',
    `${fileLabel} GPS block start`
  )

  assertOne(
    source,
    '  const renderGpsCard =',
    `${fileLabel} GPS card start`
  )

  assertOne(
    source,
    '  const renderTrackingCard =',
    `${fileLabel} trip card`
  )

  if (
    !source.includes('delivery_driver_update_live_location') ||
    !source.includes('navigator.geolocation.watchPosition') ||
    !source.includes('delivery_driver_stop_live_location')
  ) {
    throw new Error(
      `${fileLabel}: live GPS implementation not recognized. No files changed.`
    )
  }

  let out = source

  // Remove GPS watcher, broadcasting and cleanup effect.
  const gpsStart = assertOne(
    out,
    '  const liveTrackingOrderIds =',
    `${fileLabel} GPS start`
  )

  const loadingStart = out.indexOf(
    '  if (loading) {',
    gpsStart
  )

  if (loadingStart < 0) {
    throw new Error(
      `${fileLabel}: missing post-GPS loading anchor.`
    )
  }

  const gpsCode = out.slice(gpsStart, loadingStart)

  if (
    !gpsCode.includes('delivery_driver_update_live_location') ||
    !gpsCode.includes('delivery_driver_stop_live_location') ||
    !gpsCode.includes('navigator.geolocation.watchPosition')
  ) {
    throw new Error(
      `${fileLabel}: unexpected GPS block boundaries.`
    )
  }

  out =
    out.slice(0, gpsStart) +
    `  // ${MARKER}\n` +
    '  // Delivery progress remains status-based.\n' +
    '  // No driver GPS watcher or broadcast.\n\n' +
    out.slice(loadingStart)

  // Remove GPS status card but preserve delivery trip card.
  const cardStart = assertOne(
    out,
    '  const renderGpsCard =',
    `${fileLabel} GPS card`
  )

  const tripStart = out.indexOf(
    '  const renderTrackingCard =',
    cardStart
  )

  if (
    tripStart < 0 ||
    !out.slice(cardStart, tripStart).includes(
      'Customer Live Tracking'
    )
  ) {
    throw new Error(
      `${fileLabel}: unexpected GPS card boundaries.`
    )
  }

  out = out.slice(0, cardStart) + out.slice(tripStart)

  // Remove unused GPS state.
  for (const name of [
    'gpsStatus',
    'gpsMessage',
    'gpsLastSentAt',
    'gpsAccuracy',
    'gpsRestartNonce',
  ]) {
    const regex = new RegExp(
      `^[ \\t]*const \\[${name},[ \\t]*set[A-Za-z]+\\]` +
      `[ \\t]*=[ \\t]*useState\\([^\\r\\n]*\\)` +
      `[ \\t]*\\r?\\n`,
      'gm'
    )

    const matches = [...out.matchAll(regex)]

    if (matches.length !== 1) {
      throw new Error(
        `${fileLabel}: GPS state ${name} did not match exactly once.`
      )
    }

    out = out.replace(regex, '')
  }

  // Remove unused GPS refs.
  for (const name of [
    'gpsWatchRef',
    'gpsSendingRef',
    'gpsLastSentRef',
    'gpsLastCoordsRef',
  ]) {
    const regex = new RegExp(
      `^[ \\t]*const ${name}[ \\t]*=[ \\t]*` +
      `useRef\\([^\\r\\n]*\\)[ \\t]*\\r?\\n`,
      'gm'
    )

    const matches = [...out.matchAll(regex)]

    if (matches.length !== 1) {
      throw new Error(
        `${fileLabel}: GPS ref ${name} did not match exactly once.`
      )
    }

    out = out.replace(regex, '')
  }

  // Remove GPS card call.
  const gpsCardCalls = [
    ...out.matchAll(/\{renderGpsCard\(\)\}/g),
  ]

  if (gpsCardCalls.length !== 1) {
    throw new Error(
      `${fileLabel}: expected one GPS card call.`
    )
  }

  out = out.replace(/\{renderGpsCard\(\)\}/, '')

  // Remove live GPS alert.
  const liveBadge =
    /\{liveTrackingOrder\s*&&\s*\(\s*<div className="rounded-xl border border-sky-200 bg-sky-50 px-4 py-3">[\s\S]*?Live GPS active[\s\S]*?<\/div>\s*\)\}/g

  const badgeMatches = [...out.matchAll(liveBadge)]

  if (badgeMatches.length !== 1) {
    throw new Error(
      `${fileLabel}: expected one live GPS alert.`
    )
  }

  out = out.replace(liveBadge, '')

  // Remove GPS help text.
  out = out.replace(
    /\[\s*'GPS',\s*'Allow precise location when an order is Out for Delivery\. Use Retry GPS if location permission or signal fails\.',\s*\],/g,
    ''
  )

  out = out.replace(
    'Quick guidance for delivery, GPS, COD and order issues.',
    'Quick guidance for delivery, COD and order issues.'
  )

  out = out.replace(
    '● Live Location Sharing',
    '● Out for Delivery'
  )

  out = out.replace(
    'No live-tracked delivery',
    'No order out for delivery'
  )

  out = out.replace(
    "Start Delivery from Assigned Deliveries. When this portal begins sharing the Delivery Boy's GPS location for that order, it will appear here automatically.",
    'Start Delivery from Assigned Deliveries. Orders that are Out for Delivery will appear here automatically.'
  )

  // Update grouping comment.
  const groupingAnchor = out.indexOf(
    '  const liveTrackingOrders ='
  )

  const commentStart = out.lastIndexOf(
    '  /*',
    groupingAnchor
  )

  const commentEnd = out.indexOf(
    '*/',
    commentStart
  )

  if (
    commentStart >= 0 &&
    commentEnd >= 0 &&
    out.slice(commentStart, commentEnd).includes(
      "share this Driver's GPS"
    )
  ) {
    out =
      out.slice(0, commentStart) +
      '  /* Group simultaneous orders for the same customer without GPS sharing. */\n' +
      out.slice(commentEnd + 2)
  }

  // Remove distance calculator only if unused.
  if (
    (out.match(/distanceMeters\s*\(/g) || []).length === 1
  ) {
    const distanceStart = out.indexOf(
      'function distanceMeters('
    )

    const distanceEnd = out.indexOf(
      'const DELIVERY_FAILURE_REASONS',
      distanceStart
    )

    if (
      distanceStart >= 0 &&
      distanceEnd > distanceStart &&
      out.slice(distanceStart, distanceEnd).includes(
        'earthRadiusMeters'
      )
    ) {
      out =
        out.slice(0, distanceStart) +
        out.slice(distanceEnd)
    }
  }

  // Safety checks.
  for (const forbidden of [
    'navigator.geolocation.watchPosition',
    'delivery_driver_update_live_location',
    'delivery_driver_stop_live_location',
    'Customer Live Tracking',
    'Live GPS active',
    'Retry GPS',
    'Live Location Sharing',
    'renderGpsCard',
  ]) {
    if (out.includes(forbidden)) {
      throw new Error(
        `${fileLabel}: found leftover GPS code/text: ${forbidden}`
      )
    }
  }

  if (
    !out.includes('DeliveryDriverWorkflowBoard') &&
    !out.includes('get_delivery_driver_portal_data')
  ) {
    throw new Error(
      `${fileLabel}: cannot verify existing delivery workflow was preserved.`
    )
  }

  return out
}

function install(root = process.cwd()) {
  // Validate both files before changing either.
  const changes = DRIVER_PAGES.map((relative) => {
    const abs = path.join(root, relative)

    if (!fs.existsSync(abs)) {
      throw new Error(
        `Missing ${relative}. No files changed.`
      )
    }

    const original = fs.readFileSync(abs, 'utf8')
    const updated = patchDriver(original, relative)

    return {
      relative,
      abs,
      original,
      updated,
    }
  })

  const backupRoot = path.join(
    root,
    'dd-driver-live-gps-backups'
  )

  const exportRoot = path.join(
    root,
    'dd-driver-live-gps-full-code-txt'
  )

  // Check backup destinations first.
  for (const item of changes) {
    const backup = path.join(
      backupRoot,
      item.relative
    )

    fs.mkdirSync(
      path.dirname(backup),
      { recursive: true }
    )

    if (fs.existsSync(backup)) {
      throw new Error(
        `Backup already exists: ${backup}. No files changed.`
      )
    }
  }

  // Save original files.
  for (const item of changes) {
    const backup = path.join(
      backupRoot,
      item.relative
    )

    fs.writeFileSync(
      backup,
      item.original,
      { flag: 'wx' }
    )
  }

  try {
    for (const item of changes) {
      // Update original JSX.
      fs.writeFileSync(
        item.abs,
        item.updated
      )

      // Export complete updated JSX as TXT.
      const txt = path.join(
        exportRoot,
        `${item.relative}.txt`
      )

      fs.mkdirSync(
        path.dirname(txt),
        { recursive: true }
      )

      fs.writeFileSync(
        txt,
        item.updated
      )

      process.stdout.write(
        `Updated: ${item.relative}\n` +
        `Full TXT: ${path.relative(root, txt)}\n`
      )
    }
  } catch (error) {
    // Attempt to restore both originals.
    for (const item of changes) {
      try {
        fs.writeFileSync(
          item.abs,
          item.original
        )
      } catch {
        // Original backups remain available.
      }
    }

    throw new Error(
      `Write failed; attempted to restore original pages: ${error.message}`
    )
  }

  process.stdout.write(
    'Driver live GPS watcher and UI disabled in both portals. ' +
    'COD and status tracking unchanged.\n'
  )
}

if (require.main === module) {
  try {
    install()
  } catch (error) {
    console.error(
      `Installation stopped: ${error.message}`
    )
    process.exitCode = 1
  }
}

module.exports = {
  patchDriver,
  install,
}
