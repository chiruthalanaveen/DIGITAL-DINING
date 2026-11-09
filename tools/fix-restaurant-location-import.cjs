#!/usr/bin/env node
'use strict'

/**
 * Repairs the RestaurantLocationPicker React component import/export mismatch.
 * It changes ONLY the import in AdminRestaurantOrderingControls.jsx and
 * the function export in RestaurantLocationPicker.jsx. All other code remains.
 *
 * Usage: node tools/fix-restaurant-location-import.cjs
 */
const fs = require('node:fs')
const path = require('node:path')

const root = process.cwd()
const controlsRel = 'app/components/AdminRestaurantOrderingControls.jsx'
const pickerRel = 'app/components/RestaurantLocationPicker.jsx'
const oldImport = "import RestaurantLocationPicker from '@/app/components/RestaurantLocationPicker'"
const newImport = "import { RestaurantLocationPicker } from '@/app/components/RestaurantLocationPicker'"
const oldExport = 'export default function RestaurantLocationPicker('
const newExport = 'export function RestaurantLocationPicker('

function count(text, needle) {
  return text.split(needle).length - 1
}

function fixFiles(projectRoot = root) {
  const controlsPath = path.join(projectRoot, controlsRel)
  const pickerPath = path.join(projectRoot, pickerRel)
  for (const [file, description] of [[controlsPath, controlsRel], [pickerPath, pickerRel]]) {
    if (!fs.existsSync(file)) throw new Error(`Missing ${description}. Install the live-location picker first.`)
  }

  const originalControls = fs.readFileSync(controlsPath, 'utf8')
  const originalPicker = fs.readFileSync(pickerPath, 'utf8')
  const alreadyFixed = count(originalControls, newImport) === 1 &&
    count(originalPicker, newExport) === 1 &&
    count(originalPicker, 'export default RestaurantLocationPicker') === 1

  if (alreadyFixed) {
    console.log('PASS: RestaurantLocationPicker already uses the named React component import. No changes made.')
    return { changed: false }
  }

  if (count(originalControls, oldImport) !== 1 ||
      count(originalPicker, oldExport) !== 1 ||
      count(originalPicker, 'export default RestaurantLocationPicker') !== 0 ||
      count(originalControls, newImport) !== 0 ||
      count(originalPicker, newExport) !== 0) {
    throw new Error('Unexpected import/export structure. No files changed. Please share the current two JSX files for a safe merge.')
  }

  const updatedControls = originalControls.replace(oldImport, newImport)
  const newline = originalPicker.includes('\r\n') ? '\r\n' : '\n'
  const updatedPicker = originalPicker.replace(oldExport, newExport).trimEnd() +
    newline + newline + '// Retain default export for any existing consumers.' + newline +
    'export default RestaurantLocationPicker' + newline

  // Make backups before writing; never overwrite an earlier backup.
  const backupDir = path.join(projectRoot, 'dd-location-component-fix-backups',
    new Date().toISOString().replace(/[:.]/g, '-'))
  fs.mkdirSync(backupDir, { recursive: true })
  const backupControls = path.join(backupDir, 'AdminRestaurantOrderingControls.jsx')
  const backupPicker = path.join(backupDir, 'RestaurantLocationPicker.jsx')
  fs.writeFileSync(backupControls, originalControls, 'utf8')
  fs.writeFileSync(backupPicker, originalPicker, 'utf8')

  try {
    fs.writeFileSync(controlsPath, updatedControls, 'utf8')
    fs.writeFileSync(pickerPath, updatedPicker, 'utf8')
  } catch (error) {
    // Roll back both files if either write fails.
    fs.writeFileSync(controlsPath, originalControls, 'utf8')
    fs.writeFileSync(pickerPath, originalPicker, 'utf8')
    throw error
  }

  console.log('PASS: Named React component import and export fixed.')
  console.log('PASS: GPS/map, tenant access, ordering policy, table QR, and other code left intact.')
  console.log(`Backups: ${path.relative(projectRoot, backupDir)}`)
  console.log('Next: npm run build && npm run dev')
  return { changed: true, backupDir }
}

if (require.main === module) {
  try {
    fixFiles()
  } catch (error) {
    console.error('FIX FAILED:', error.message)
    process.exitCode = 1
  }
}

module.exports = { fixFiles }
