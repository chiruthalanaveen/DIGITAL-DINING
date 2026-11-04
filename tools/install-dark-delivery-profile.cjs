// Save as tools/install-dark-delivery-profile.cjs in the Digital Dine-In project.
// Requires app/components/DeliveryAccountProfileSheet.jsx to have been copied first.
// Patches only app/components/DeliveryStoreExperience.jsx; never the /dd-delivery app.
const fs = require('node:fs');
const path = require('node:path');
const root = process.cwd();
const target = path.resolve(root, 'app/components/DeliveryStoreExperience.jsx');
const component = path.resolve(root, 'app/components/DeliveryAccountProfileSheet.jsx');
const requiredImport = "import DeliverySavedAddressPicker from '@/app/components/DeliverySavedAddressPicker'";
const addImport = "import DeliveryAccountProfileSheet from '@/app/components/DeliveryAccountProfileSheet'";
const marker = '      {/* ===== ACCOUNT SHEET ===== */}';
const sheetEnd = '\n    </main>';
const prefKey = 'dd_delivery_veg_mode_v1';
function requireMatch(condition, message) { if (!condition) throw new Error(message + ' No files were changed.'); }
function replaceOne(src, needle, replacement, label) {
  requireMatch(src.includes(needle), 'Missing ' + label);
  requireMatch(src.split(needle).length === 2, 'Duplicate ' + label);
  return src.replace(needle, replacement);
}
try {
  requireMatch(fs.existsSync(target) && fs.existsSync(component), 'Storefront or new profile component is missing. Copy component to its exact path.');
  let src = fs.readFileSync(target, 'utf8');
  requireMatch(src.includes(requiredImport), 'This storefront differs from the expected DeliveryStoreExperience.');
  let out = src;
  if (!out.includes(addImport)) out = replaceOne(out, requiredImport, requiredImport + '\n' + addImport, 'saved address import');

  // User's name initial on the top-right header Profile icon.
  const buttonStart = out.indexOf('onClick={openCustomerAccount}\n            aria-label="Open account"');
  requireMatch(buttonStart >= 0, 'main account header button');
  const buttonEnd = out.indexOf('</button>', buttonStart);
  requireMatch(buttonEnd > buttonStart && buttonEnd - buttonStart < 2300, 'main account header button closing tag');
  let header = out.slice(buttonStart, buttonEnd);
  const beforeIcon = '<Icon name="user" className="h-5 w-5" />';
  if (!header.includes('isCustomerSignedIn ? (')) {
    requireMatch(header.includes(beforeIcon), 'old profile header icon');
    const nameExpression = `
            {isCustomerSignedIn ? (
              <span className="text-base font-black" aria-hidden="true">
                {Array.from(String(
                  activeAccountType === 'mobile'
                    ? mobileCustomer?.name || 'Customer'
                    : customerProfile?.full_name || customerUser?.user_metadata?.full_name ||
                      customerUser?.user_metadata?.name || customerUser?.email?.split('@')[0] || 'Customer'
                ).trim())[0]?.toLocaleUpperCase() || 'C'}
              </span>
            ) : <Icon name="user" className="h-5 w-5" />}
          `;
    header = header.replace(beforeIcon, nameExpression);
    header = header.replace('className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-slate-900 text-white transition active:scale-95"',
      'className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition active:scale-95 ${isCustomerSignedIn ? \'border-2 border-[#d0ae70] bg-[#fff5d8] text-[#94712e]\' : \'bg-slate-900 text-white\'}`}');
    out = out.slice(0, buttonStart) + header + out.slice(buttonEnd);
  }

  // Optional vegetarian filter affects product browsing, not cart, saved orders or checkout security.
  if (!out.includes('const [vegMode, setVegMode]')) {
    out = replaceOne(out, "  const [category, setCategory] = useState('All')", "  const [category, setCategory] = useState('All')\n  const [vegMode, setVegMode] = useState(false)", 'category state');
  }
  if (!out.includes('dd_delivery_veg_mode_v1')) {
    const prep = `  // Device-level preference only. Never infer dietary attributes for untagged products.
  useEffect(() => {
    try { setVegMode(window.localStorage.getItem('${prefKey}') === '1') } catch { /* optional */ }
  }, [])
  const updateVegMode = (enabled) => {
    const next = Boolean(enabled)
    setVegMode(next)
    try { window.localStorage.setItem('${prefKey}', next ? '1' : '0') } catch { /* optional */ }
  }

`;
    out = replaceOne(out, '  const categories = useMemo(() => {', prep + '  const categories = useMemo(() => {', 'category hook');
  }
  const filterStart = out.indexOf('  const filteredItems = useMemo(() => {');
  const filterEnd = out.indexOf('  const displayItems = useMemo(() => {', filterStart);
  requireMatch(filterStart >= 0 && filterEnd > filterStart, 'menu filter');
  let filterSection = out.slice(filterStart, filterEnd);
  if (!filterSection.includes('if (vegMode) {')) {
    filterSection = replaceOne(filterSection, 'return menuItems.filter((item) => {',
`return menuItems.filter((item) => {
      if (vegMode) {
        const foodType = String(item.food_type || item.foodType || item.dietary_type || '')
          .toLowerCase().replace(/[\\s_-]/g, '')
        if (item.is_veg === false || item.isVeg === false ||
            ['nonveg', 'nonvegetarian', 'egg', 'eggs', 'eggetarian'].includes(foodType)) return false
      }`, 'menuItems filter');
    filterSection = replaceOne(filterSection, '}, [menuItems, search, category])', '}, [menuItems, search, category, vegMode])', 'menu filter dependency');
    out = out.slice(0, filterStart) + filterSection + out.slice(filterEnd);
  }

  // Existing upgraded version only needs the new preference props.
  if (out.includes('<DeliveryAccountProfileSheet')) {
    const compStart = out.indexOf('<DeliveryAccountProfileSheet');
    const compEnd = out.indexOf('/>', compStart);
    requireMatch(compEnd > compStart && compEnd - compStart < 4000, 'installed profile component props');
    let call = out.slice(compStart, compEnd + 2);
    if (!call.includes('vegMode={vegMode}')) {
      call = call.replace('restaurantCode={restaurantCode}',
        'restaurantCode={restaurantCode}\n          vegMode={vegMode}\n          onVegModeChange={updateVegMode}');
      requireMatch(call.includes('vegMode={vegMode}'), 'profile component restaurant code prop');
      out = out.slice(0, compStart) + call + out.slice(compEnd + 2);
    }
  } else {
    const start = out.indexOf(marker);
    const end = start < 0 ? -1 : out.indexOf(sheetEnd, start);
    requireMatch(start >= 0 && end > start && out.slice(start, end).includes('{accountOpen && isCustomerSignedIn && ('), 'old profile sheet block');
    const replacement = `      {/* ===== ACCOUNT SHEET ===== */}
      {accountOpen && isCustomerSignedIn && (
        <DeliveryAccountProfileSheet
          restaurantCode={restaurantCode}
          vegMode={vegMode}
          onVegModeChange={updateVegMode}
          activeAccountType={activeAccountType}
          customerUser={customerUser}
          customerProfile={customerProfile}
          mobileCustomer={mobileCustomer}
          onClose={() => setAccountOpen(false)}
          onOrders={() => { setAccountOpen(false); openTracking() }}
          onReturns={() => {
            setAccountOpen(false)
            openAfterSales({ mobile: mobileCustomer?.mobile || '', tab: 'request' })
          }}
          onSignOut={signOutDeliveryCustomer}
          signingOut={customerAuthLoading}
          onProfileUpdated={({ name, mobile }) => {
            setCustomerProfile(current => ({ ...(current || {}), full_name: name, phone: mobile }))
          }}
          onAddressSelected={async point => {
            setLocationConfirmed(false)
            setSelectedSavedAddressId('')
            const ok = await selectSavedAddressAtCheckout(point)
            if (ok) { setSelectedSavedAddressId(point.savedAddressId); setAccountOpen(false) }
            return ok
          }}
        />
      )}
`;
    out = out.slice(0, start) + replacement + out.slice(end);
  }
  if (out === src) { console.log('Already installed. No changes needed.'); process.exit(0); }
  const backup = target + '.before-dark-profile.bak';
  if (!fs.existsSync(backup)) fs.writeFileSync(backup, src, 'utf8');
  fs.writeFileSync(target, out, 'utf8');
  console.log('Updated:', target);
  console.log('Backup:', backup);
  console.log('Profile badge: first letter of verified customer display name.');
  console.log('Preserved cart, checkout and authenticated address/order handlers.');
} catch (error) { console.error(error.message); process.exit(1); }