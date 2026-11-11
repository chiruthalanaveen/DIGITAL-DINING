
'use strict'

const fs = require('node:fs')
const path = require('node:path')

const root = process.cwd()
const relative = 'app/menu/[id]/page.jsx'
const destination = path.join(root, relative)

function fail(message) {
  throw new Error(`QR platform fee UI: ${message}`)
}

function replaceExactOnce(source, before, after, label) {
  if (source.includes(after)) return source
  const count = source.split(before).length - 1
  if (count !== 1) {
    fail(`${label}: expected 1 match, found ${count}. No file changed.`)
  }
  return source.replace(before, after)
}

function main() {
  if (!fs.existsSync(destination)) fail(`Missing ${relative}`)

  const original = fs.readFileSync(destination, 'utf8')
  const newline = original.includes('\r\n') ? '\r\n' : '\n'
  let code = original.replace(/\r\n/g, '\n')

  const defaultAfter =
    'loaded: false, customerAmountPaise: 0, feePaise: 0, ownerChargeCustomer: false, rolloutEnabled: false'

  const unpatchedDefaults =
    /loaded: false, customerAmountPaise: 0, feePaise: 0(?!, ownerChargeCustomer:)/g

  const count = [...code.matchAll(unpatchedDefaults)].length
  if (count !== 3 && count !== 0) {
    fail(`Fee quote defaults: expected 3 or 0 matches, found ${count}.`)
  }
  if (count === 3) {
    code = code.replace(unpatchedDefaults, defaultAfter)
  }

  const quoteBefore = [
    '      customerAmountPaise: Number(data.customerAmountPaise),',
    '      feePaise: Number(data.feePaise || 0),',
  ].join('\n')

  const quoteAfter = [
    '      customerAmountPaise: Number(data.customerAmountPaise),',
    '      feePaise: Number(data.feePaise || 0),',
    '      ownerChargeCustomer: data.ownerChargeCustomer === true,',
    '      rolloutEnabled: data.rolloutEnabled === true,',
  ].join('\n')

  code = replaceExactOnce(
    code, quoteBefore, quoteAfter, 'Fresh fee quote'
  )

  const initialBefore = [
    '          customerAmountPaise: Number(data.customerAmountPaise),',
    '          feePaise: Number(data.feePaise || 0),',
  ].join('\n')

  const initialAfter = [
    '          customerAmountPaise: Number(data.customerAmountPaise),',
    '          feePaise: Number(data.feePaise || 0),',
    '          ownerChargeCustomer: data.ownerChargeCustomer === true,',
    '          rolloutEnabled: data.rolloutEnabled === true,',
  ].join('\n')

  code = replaceExactOnce(
    code, initialBefore, initialAfter, 'Initial fee quote'
  )

  const pendingBefore = [
    '                          {!restaurantFeeQuote.loaded && (',
    '                            <div className="rounded-lg bg-amber-950/50 p-2 text-[10px] text-amber-200">',
  ].join('\n')

  const pendingAfter = [
    '                          {restaurantFeeQuote.loaded &&',
    '                            restaurantFeeQuote.ownerChargeCustomer &&',
    '                            !restaurantFeeQuote.rolloutEnabled && (',
    '                              <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-2.5">',
    '                                <div className="flex items-center justify-between gap-3 text-[11px]">',
    '                                  <span className="text-neutral-300">Restaurant platform fee (not charged)</span>',
    '                                  <span className="font-bold text-white">{money(0)}</span>',
    '                                </div>',
    '                                <p className="mt-1 text-[10px] leading-4 text-neutral-400">',
    '                                  Customer-fee activation is pending. No platform fee has been added to this bill.',
    '                                </p>',
    '                              </div>',
    '                            )}',
    '                          {!restaurantFeeQuote.loaded && (',
    '                            <div className="rounded-lg bg-amber-950/50 p-2 text-[10px] text-amber-200">',
  ].join('\n')

  code = replaceExactOnce(
    code, pendingBefore, pendingAfter, 'Customer QR fee status'
  )

  const oldLabel = 'Platform fee (ERP rate)'
  const newLabel = 'Restaurant platform fee'
  const labelCount = code.split(oldLabel).length - 1

  if (labelCount !== 2 && labelCount !== 0) {
    fail(`Fee label: expected 2 or 0 matches, found ${labelCount}.`)
  }

  if (labelCount === 2) {
    code = code.split(oldLabel).join(newLabel)
  }

  const required = [
    'qr-platform-fee',
    'refreshRestaurantFeeQuote()',
    'qr-payment/create',
    'qr-counter-order',
    'getDineInProof',
    'pendingQrVerification',
  ]

  if (required.some(item => !code.includes(item))) {
    fail('An existing QR payment or signed-table safety hook is missing.')
  }

  const output = newline === '\r\n'
    ? code.replace(/\n/g, '\r\n')
    : code

  if (output === original) {
    console.log('QR platform fee UI is already updated.')
    return
  }

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backup = path.join(
    root, 'dd-qr-fee-backups', stamp, relative
  )

  fs.mkdirSync(path.dirname(backup), { recursive: true })
  fs.copyFileSync(destination, backup)
  fs.writeFileSync(destination, output, 'utf8')

  console.log(`Updated: ${relative}`)
  console.log(`Backup: ${path.relative(root, backup)}`)
  console.log('Next: npm run build')
}

try {
  main()
} catch (error) {
  console.error(error.message)
  process.exitCode = 1
}
