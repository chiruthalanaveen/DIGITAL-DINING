// Exact destination for this script: tools/patch-delivery-profile.cjs
// Run: node tools/patch-delivery-profile.cjs
// This script touches ONLY app/components/DeliveryStoreExperience.jsx.
const fs = require('node:fs')
const path = require('node:path')
const target = path.resolve(process.cwd(), 'app/components/DeliveryStoreExperience.jsx')
const newComponent = path.resolve(process.cwd(), 'app/components/DeliveryAccountProfileSheet.jsx')

if (!fs.existsSync(target)) {
  console.error(`Storefront file not found: ${target}`)
  process.exit(1)
}
if (!fs.existsSync(newComponent)) {
  console.error(`New profile component not found: ${newComponent}`)
  process.exit(1)
}
let src = fs.readFileSync(target, 'utf8')
if (src.includes('<DeliveryAccountProfileSheet')) {
  console.log('Already installed: account profile sheet is present. No changes made.')
  process.exit(0)
}
const importAnchor = "import DeliverySavedAddressPicker from '@/app/components/DeliverySavedAddressPicker'"
const startMarker = '      {/* ===== ACCOUNT SHEET ===== */}'
const endMarker = '\n    </main>'
const start = src.indexOf(startMarker)
const end = start < 0 ? -1 : src.indexOf(endMarker, start)
if (!src.includes(importAnchor) || start < 0 || end < 0 ||
    !src.slice(start, end).includes('{accountOpen && isCustomerSignedIn && (')) {
  console.error('The existing storefront layout differs from the expected structure. No changes made. Please check the original code.')
  process.exit(1)
}
const updatedSheet = `      {/* ===== ACCOUNT SHEET ===== */}
      {accountOpen && isCustomerSignedIn && (
        <DeliveryAccountProfileSheet
          restaurantCode={restaurantCode}
          activeAccountType={activeAccountType}
          customerUser={customerUser}
          customerProfile={customerProfile}
          mobileCustomer={mobileCustomer}
          onClose={() => setAccountOpen(false)}
          onOrders={() => {
            setAccountOpen(false)
            openTracking()
          }}
          onSignOut={signOutDeliveryCustomer}
          onReturns={() => {
            setAccountOpen(false)
            openAfterSales({ mobile: mobileCustomer?.mobile || '', tab: 'request' })
          }}
          signingOut={customerAuthLoading}
          onProfileUpdated={({ name, mobile }) => {
            setCustomerProfile((current) => ({
              ...(current || {}),
              full_name: name,
              phone: mobile,
            }))
          }}
          onAddressSelected={async (point) => {
            setLocationConfirmed(false)
            setSelectedSavedAddressId('')
            const ok = await selectSavedAddressAtCheckout(point)
            if (ok) {
              setSelectedSavedAddressId(point.savedAddressId)
              setAccountOpen(false)
            }
            return ok
          }}
        />
      )}
`
const backup = `${target}.before-profile-upgrade.bak`
if (!fs.existsSync(backup)) fs.copyFileSync(target, backup)
src = src.replace(importAnchor, importAnchor + "\nimport DeliveryAccountProfileSheet from '@/app/components/DeliveryAccountProfileSheet'")
const adjustedStart = src.indexOf(startMarker)
const adjustedEnd = src.indexOf(endMarker, adjustedStart)
src = src.slice(0, adjustedStart) + updatedSheet + src.slice(adjustedEnd)
fs.writeFileSync(target, src, 'utf8')
console.log('Installed richer Delivery account sheet:', target)
console.log('Backup:', backup)