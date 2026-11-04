// Digital Dine-In /delivery: avoid legacy Mobile+PIN 401 checks after
// Google OAuth or verified Mobile+DOB SMS OTP authentication.
//
// Usage (from the Next.js project root):
//   node tools/fix-delivery-auth-session-401.cjs
//
// Exact destinations changed:
//  app/components/DeliveryStoreExperience.jsx
//  app/api/delivery/customer/session/route.js
//
// This patch does not bypass authentication or change protected API contracts.
// It requests an optional non-authenticated probe ONLY from the storefront.
'use strict'
const fs = require('node:fs')
const path = require('node:path')

const root = process.cwd()
const files = {
  store: path.join(root, 'app/components/DeliveryStoreExperience.jsx'),
  session: path.join(root, 'app/api/delivery/customer/session/route.js'),
}
const found = {}
for (const [key, filename] of Object.entries(files)) {
  if (!fs.existsSync(filename)) {
    console.error(`Required file missing: ${path.relative(root, filename)}`)
    process.exit(1)
  }
  found[key] = fs.readFileSync(filename, 'utf8')
}

const replacement = (source, before, after, label) => {
  if (source.includes(after)) {
    console.log(`Already applied: ${label}`)
    return source
  }
  if (!source.includes(before)) {
    throw new Error(`Could not find expected code for ${label}. No files were changed. Please review any local modifications.`)
  }
  const count = source.split(before).length - 1
  if (count !== 1) throw new Error(`Expected one match for ${label}; found ${count}. No files were changed.`)
  console.log(`Applying: ${label}`)
  return source.replace(before, after)
}

try {
  // 1) Avoid probing for a cookie-only session when the user already has
  //    a Supabase Auth session (Google or SMS OTP). This still supports an
  //    existing legacy Mobile+PIN cookie in browsers without Auth sessions.
  found.store = replacement(
    found.store,
    `        const response = await fetch(\n          \`/api/delivery/customer/session?restaurantCode=\${encodeURIComponent(restaurantCode)}\`,\n          { credentials: 'same-origin', cache: 'no-store' }\n        )\n        const result = await response.json().catch(() => ({}))`,
    `        // Modern Delivery Google and Mobile+DOB OTP accounts use Supabase\n        // Auth, not the old Mobile+PIN cookie session. Do not probe it.\n        const { data: authData } = await supabase.auth.getSession()\n        if (!active || authData?.session?.access_token) return\n\n        // For older Mobile+PIN accounts only, ask for a non-authenticated\n        // probe. A missing cookie is normal and returns success:false/200.\n        const response = await fetch(\n          \`/api/delivery/customer/session?restaurantCode=\${encodeURIComponent(restaurantCode)}&optional=1\`,\n          { credentials: 'same-origin', cache: 'no-store' }\n        )\n        const result = await response.json().catch(() => ({}))`,
    'skip legacy session probe for modern Auth accounts'
  )

  // 2) Legacy cookie status must not decide whether a Google/phone OTP
  //    Auth user can hydrate their OWN previously saved address. Exact UID
  //    and Supabase RLS still decide access to any protected row.
  found.store = replacement(
    found.store,
    `          const sessionCheck = await fetch(\n            \`/api/delivery/customer/session?restaurantCode=\${encodeURIComponent(restaurantCode)}\`,\n            { credentials: 'same-origin', cache: 'no-store' }\n          ).catch(() => null)\n          if (!sessionCheck || sessionCheck.status !== 401) return\n          const { data, error } = await supabase.auth.getUser()`,
    `          // Only Supabase Auth-owned saved addresses belong here.\n          // The old Mobile+PIN session endpoint is not applicable.\n          if (!selected.ownerUserId) return\n          const { data, error } = await supabase.auth.getUser()`,
    'remove redundant legacy-session request for saved Auth addresses'
  )

  // 3) In optional-probe mode only, absence of a legacy cookie is NOT an
  //    authentication failure for the storefront. All existing callers
  //    without optional=1 keep receiving 401 as before.
  found.session = replacement(
    found.session,
    `    const rawToken = request.cookies.get(DELIVERY_MOBILE_SESSION_COOKIE)?.value || ''\n    if (!TOKEN.test(rawToken)) {\n      return response({ success: false, code: 'NOT_SIGNED_IN' }, 401)\n    }`,
    `    const rawToken = request.cookies.get(DELIVERY_MOBILE_SESSION_COOKIE)?.value || ''\n    const optionalProbe = new URL(request.url).searchParams.get('optional') === '1'\n    if (!TOKEN.test(rawToken)) {\n      return response({ success: false, code: 'NOT_SIGNED_IN' }, optionalProbe ? 200 : 401)\n    }`,
    'optional probe for absent legacy cookie'
  )
  found.session = replacement(
    found.session,
    `    if (!customer) {\n      return response({ success: false, code: 'NOT_SIGNED_IN' }, 401)\n    }`,
    `    if (!customer) {\n      return response({ success: false, code: 'NOT_SIGNED_IN' }, optionalProbe ? 200 : 401)\n    }`,
    'optional probe for expired legacy cookie'
  )
} catch (error) {
  console.error(`Patch stopped: ${error.message}`)
  process.exit(1)
}

// All pattern checks passed; only now write outputs.
for (const [key, filename] of Object.entries(files)) {
  const before = fs.readFileSync(filename, 'utf8')
  if (found[key] !== before) {
    const backup = filename + '.before-delivery-auth-session-401.bak'
    if (!fs.existsSync(backup)) fs.writeFileSync(backup, before, 'utf8')
    fs.writeFileSync(filename, found[key], 'utf8')
    console.log(`Updated ${path.relative(root, filename)} (backup: ${path.relative(root, backup)})`)
  }
}
console.log('Complete. Run npm run build and test Google/Mobile+DOB sign-in, My Orders and saved addresses.')