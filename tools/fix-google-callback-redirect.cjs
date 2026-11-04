// Save as tools/fix-google-callback-redirect.cjs and run from your project root.
// Surgical patch: preserves all unrelated delivery authentication code.
const fs = require('fs')
const path = require('path')

const callbackPath = path.join(process.cwd(), 'app/auth/delivery-callback/page.jsx')
const profilePath = path.join(process.cwd(), 'app/api/delivery/customer/google-profile/route.js')

const oldBlock = `        setMessage('Checking your saved delivery profile...')
        const profileResponse = await fetch('/api/delivery/customer/google-profile', {
          credentials: 'same-origin',
          cache: 'no-store',
          headers: { Authorization: \`Bearer \${session.access_token}\` },
        })
        const profileData = await profileResponse.json().catch(() => ({}))
        if (!profileResponse.ok || profileData?.success !== true) {
          throw new Error(profileData?.message || 'Unable to verify your Delivery profile.')
        }

        clearDeliveryGoogleContext()
        // First-time users (including users who signed in with Google but
        // have no complete contact/address record) finish setup once.
        return profileData?.profile?.complete
          ? intendedPath
          : \`/delivery/complete-profile?next=\${encodeURIComponent(intendedPath)}\``

const newBlock = `        // A successful Google OAuth session has already been verified above.
        // Optional profile setup must not block opening the Delivery storefront.
        setMessage('Opening your Delivery store...')
        try {
          const profileResponse = await fetch('/api/delivery/customer/google-profile', {
            credentials: 'same-origin',
            cache: 'no-store',
            headers: { Authorization: \`Bearer \${session.access_token}\` },
          })
          const profileData = await profileResponse.json().catch(() => ({}))
          if (!profileResponse.ok || profileData?.success !== true) {
            console.warn('[DELIVERY GOOGLE PROFILE] Optional setup lookup failed:', {
              status: profileResponse.status,
              code: String(profileData?.code || 'PROFILE_UNAVAILABLE'),
            })
          }
        } catch (profileError) {
          console.warn('[DELIVERY GOOGLE PROFILE] Optional setup lookup unavailable:',
            profileError?.message || 'Network error')
        }
        clearDeliveryGoogleContext()
        return intendedPath`

const oldApi = `  const { data: existing, error: lookupError } = await admin
    .from('delivery_customer_profiles')
    .select('id,full_name,date_of_birth')
    .eq('id', user.id)
    .maybeSingle()`

const newApi = `  // DOB is required only for Mobile + DOB accounts, not Google customers.
  const fields = type === 'phone' ? 'id,full_name,date_of_birth' : 'id,full_name'
  const { data: existing, error: lookupError } = await admin
    .from('delivery_customer_profiles')
    .select(fields)
    .eq('id', user.id)
    .maybeSingle()`

function edit(target, find, replacement, finishedMarker) {
  if (!fs.existsSync(target)) {
    throw new Error(`Missing target: ${target}. Install the existing auth package first.`)
  }
  const original = fs.readFileSync(target, 'utf8')
  if (original.includes(finishedMarker)) {
    console.log(`Already updated: ${path.relative(process.cwd(), target)}`)
    return
  }
  if (original.split(find).length !== 2) {
    throw new Error(`Expected code not found in ${target}. No changes made to that file; use the complete TXT replacement after reviewing your local modifications.`)
  }
  const backup = `${target}.before-google-callback-redirect.bak`
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, original)
  fs.writeFileSync(target, original.replace(find, replacement))
  console.log(`Updated: ${path.relative(process.cwd(), target)}`)
}

// Check all patches before modifying any file.
for (const [file, find, marker] of [
  [callbackPath, oldBlock, "[DELIVERY GOOGLE PROFILE] Optional setup lookup failed:"],
  [profilePath, oldApi, "const fields = type === 'phone'"],
]) {
  if (!fs.existsSync(file)) throw new Error(`Missing file: ${file}`)
  const content = fs.readFileSync(file, 'utf8')
  if (!content.includes(marker) && content.split(find).length !== 2) {
    throw new Error(`Version mismatch in ${file}. Nothing was changed.`)
  }
}

edit(callbackPath, oldBlock, newBlock, '[DELIVERY GOOGLE PROFILE] Optional setup lookup failed:')
edit(profilePath, oldApi, newApi, "const fields = type === 'phone'")
console.log('Google callback redirect fix complete. Run npm run build.')