'use strict'

// Digital Dine-In: mobile viewport app + dedicated management screens.
// Run from the Next.js project root:
//   node tools/install-owner-mobile-app.cjs
// Required staging folder: dd-owner-mobile-update/
//   OwnerMobileWorkspaceLayer.jsx.txt
// Optional staging fallback: OwnerPremiumMobileHub.jsx.txt
//
// This installer patches existing files rather than replacing the large owner
// dashboard. All modifications are prepared and checked before any write.

const fs = require('node:fs')
const path = require('node:path')

const root = process.cwd()
const staging = path.join(root, 'dd-owner-mobile-update')
const parentCandidates = [
  'app/dashboard/[id]/page.jsx',
  'app/app/owner/[restaurantId]/page.jsx',
]
const hubPath = 'app/components/OwnerPremiumMobileHub.jsx'
const layerPath = 'app/components/OwnerMobileWorkspaceLayer.jsx'
const billingPath = 'app/components/OwnerMobileBillingOrders.jsx'

function fail(message) { throw new Error(`Owner mobile architecture: ${message}`) }
function read(file) {
  if (!fs.existsSync(file)) fail(`Missing file: ${file}`)
  return fs.readFileSync(file, 'utf8')
}
function replaceOne(source, before, after, label) {
  if (source.includes(after)) return source
  const matches = source.split(before).length - 1
  if (matches !== 1) fail(`${label}: expected one matching block; found ${matches}. No files changed.`)
  return source.replace(before, after)
}
function patchHub(original) {
  if (original.includes('data-owner-mobile="independent-app-20261111"')) return original
  let code = original.replace(/\r\n/g, '\n')

  if (!code.includes('data-owner-mobile="placements-20261111"')) {
    fail('Your OwnerPremiumMobileHub is a different version. Compare it with the supplied full JSX TXT before proceeding.')
  }
  if (!code.includes('OwnerDeliveryWallet') || !code.includes("screen === 'wallet'")) {
    fail('Expected the existing wallet screen; will not remove or replace your wallet.')
  }

  code = replaceOne(code,
    "import { useEffect, useMemo, useRef, useState } from 'react'",
    "import { useEffect, useMemo, useRef, useState } from 'react'\nimport { createPortal } from 'react-dom'",
    'Hub React portal import')

  code = replaceOne(code,
    "  const [screen, setScreen] = useState('home')",
    "  const [screen, setScreen] = useState('home')\n  const [portalReady, setPortalReady] = useState(false)\n  const [isMobile, setIsMobile] = useState(false)\n  const screenScrollRef = useRef(null)",
    'Hub viewport state')

  code = replaceOne(code,
    `  // Wallet is a dedicated mobile screen. Lock the page behind it while it is open.
  useEffect(() => {
    if (screen !== 'wallet') return undefined
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [screen])`,
    `  // Mobile navigation owns a viewport; the long desktop page cannot scroll behind it.
  useEffect(() => {
    const query = window.matchMedia('(max-width: 1023px)')
    const sync = () => setIsMobile(query.matches)
    sync()
    setPortalReady(true)
    query.addEventListener?.('change', sync)
    return () => query.removeEventListener?.('change', sync)
  }, [])

  useEffect(() => {
    if (!isMobile) return undefined
    const bodyOverflow = document.body.style.overflow
    const htmlOverflow = document.documentElement.style.overflow
    document.body.style.overflow = 'hidden'
    document.documentElement.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = bodyOverflow
      document.documentElement.style.overflow = htmlOverflow
    }
  }, [isMobile])`,
    'Hub independent scrolling')

  code = replaceOne(code,
    "    window.scrollTo({ top: 0, behavior: 'auto' })",
    "    screenScrollRef.current?.scrollTo({ top: 0, behavior: 'auto' })",
    'Hub navigation scroll')

  code = replaceOne(code,
    `  return (
    <div className="ddp-root lg:hidden" data-owner-mobile="placements-20261111">`,
    `  if (!portalReady || !isMobile) return null

  return createPortal(
    <div ref={screenScrollRef} className="ddp-root" data-owner-mobile="independent-app-20261111">`,
    'Hub independent viewport')

  code = replaceOne(code,
    '        .ddp-root{--ddp-bg:',
    '        .ddp-root{position:fixed;inset:0;z-index:90;overflow-y:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch;padding:calc(12px + env(safe-area-inset-top)) 12px calc(100px + env(safe-area-inset-bottom));background:var(--ddp-bg);--ddp-bg:',
    'Hub viewport CSS')

  code = replaceOne(code,
    '    </div>\n  )\n}\n',
    '    </div>,\n    document.body\n  )\n}\n',
    'Hub portal closing tag')

  return code
}

function patchParent(original, filename) {
  let code = original.replace(/\r\n/g, '\n')
  if (!code.includes('<OwnerPremiumMobileHub')) fail(`${filename}: OwnerPremiumMobileHub is missing`)

  if (!code.includes("import OwnerMobileWorkspaceLayer from '@/app/components/OwnerMobileWorkspaceLayer'")) {
    code = replaceOne(code,
      "import OwnerPremiumMobileHub from '@/app/components/OwnerPremiumMobileHub'",
      "import OwnerPremiumMobileHub from '@/app/components/OwnerPremiumMobileHub'\nimport OwnerMobileWorkspaceLayer from '@/app/components/OwnerMobileWorkspaceLayer'",
      `${filename} workspace import`)
  }

  code = replaceOne(code,
    '  const [mobileWorkspaceOpen, setMobileWorkspaceOpen] = useState(false)',
    "  const [mobileWorkspaceOpen, setMobileWorkspaceOpen] = useState(false)\n  const [mobileWorkspaceTitle, setMobileWorkspaceTitle] = useState('Management')",
    `${filename} workspace title`)

  code = replaceOne(code,
    "  const openMobileWorkspace = (nextMode, nextTab = 'overview') => {",
    "  const openMobileWorkspace = (nextMode, nextTab = 'overview', nextTitle = '') => {",
    `${filename} workspace function`)

  code = replaceOne(code,
    '    setMobileWorkspaceOpen(true)\n  }',
    '    setMobileWorkspaceTitle(String(nextTitle || `${nextMode} management`))\n    setMobileWorkspaceOpen(true)\n  }',
    `${filename} workspace title assignment`)

  code = replaceOne(code,
    `        <div id="dd-ws-live-module" className="scroll-mt-24" />
        <div className={mobileWorkspaceOpen ? 'block' : 'hidden lg:block'}>`,
    `        <OwnerMobileWorkspaceLayer
          open={mobileWorkspaceOpen}
          title={mobileWorkspaceTitle}
          onBack={() => setMobileWorkspaceOpen(false)}
        >
        <div id="dd-ws-live-module" className="scroll-mt-24" />
        <div className={mobileWorkspaceOpen ? 'dd-ws-live-content block' : 'dd-ws-live-content hidden lg:block'}>`,
    `${filename} dedicated workspace layer`)

  code = replaceOne(code,
    '        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">',
    '        <div className="dd-ws-metrics-grid grid grid-cols-1 md:grid-cols-4 gap-4">',
    `${filename} hide duplicated metrics on mobile`)

  code = replaceOne(code,
    '          </div>\n        )}\n        </div>\n      </main>',
    '          </div>\n        )}\n        </div>\n        </OwnerMobileWorkspaceLayer>\n      </main>',
    `${filename} close dedicated workspace layer`)

  code = replaceOne(code,
    'className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"',
    'className="fixed inset-0 z-[180] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"',
    `${filename} profile overlay above mobile app`)

  return code
}

function checkJSX(file, code) {
  let ts
  try { ts = require('typescript') } catch { return }
  const parsed = ts.createSourceFile(file, code, ts.ScriptTarget.Latest, true, ts.ScriptKind.JSX)
  if (parsed.parseDiagnostics.length) {
    const error = parsed.parseDiagnostics[0]
    const location = parsed.getLineAndCharacterOfPosition(error.start)
    fail(`${file}: JSX parse error on line ${location.line + 1}: ${ts.flattenDiagnosticMessageText(error.messageText, ' ')}`)
  }
}

function main() {
  const parents = parentCandidates.filter(name => fs.existsSync(path.join(root, name)))
  if (!parents.length) fail('No Owner Dashboard page found in the expected locations')

  const planned = []
  const hub = path.join(root, hubPath)
  planned.push({ file: hub, content: patchHub(read(hub)) })

  const layerContent = read(path.join(staging, 'OwnerMobileWorkspaceLayer.jsx.txt'))
  const layer = path.join(root, layerPath)
  if (fs.existsSync(layer) && read(layer) !== layerContent) {
    fail('OwnerMobileWorkspaceLayer already exists with different content. Compare it manually before installing.')
  }
  planned.push({ file: layer, content: layerContent })

  for (const relative of parents) {
    const file = path.join(root, relative)
    planned.push({ file, content: patchParent(read(file), relative) })
  }

  const billing = path.join(root, billingPath)
  if (!fs.existsSync(billing)) {
    planned.push({ file: billing, content: read(path.join(staging, 'OwnerMobileBillingOrders.jsx.txt')) })
  }

  for (const item of planned) checkJSX(item.file, item.content)

  const changed = planned.filter(item => !fs.existsSync(item.file) || read(item.file) !== item.content)
  if (!changed.length) { console.log('Already installed. No changes made.'); return }

  const backup = path.join(root, 'dd-owner-mobile-backups', new Date().toISOString().replace(/[:.]/g, '-'))
  for (const item of changed) {
    if (!fs.existsSync(item.file)) continue
    const destination = path.join(backup, path.relative(root, item.file))
    fs.mkdirSync(path.dirname(destination), { recursive: true })
    fs.copyFileSync(item.file, destination)
  }

  for (const item of changed) {
    fs.mkdirSync(path.dirname(item.file), { recursive: true })
    fs.writeFileSync(item.file, item.content, 'utf8')
    console.log('Updated:', path.relative(root, item.file))
  }
  console.log('Existing files backed up at:', path.relative(root, backup))
  console.log('Next: npm run build')
}

try { main() } catch (error) {
  console.error(error.message)
  process.exitCode = 1
}