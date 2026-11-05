#!/usr/bin/env node
// Exact target: app/delivery/[restaurantCode]/track/[orderCode]/page.jsx
// Run: node tools/remove-delivery-tracking-map.cjs
// Safe to rerun; creates a one-time backup before modification.
const fs = require('node:fs');
const path = require('node:path');
const target = path.join(process.cwd(), 'app', 'delivery', '[restaurantCode]', 'track', '[orderCode]', 'page.jsx');
if (!fs.existsSync(target)) { console.error('Missing tracking page:', target); process.exit(1); }
let code = fs.readFileSync(target, 'utf8');
if (!code.includes('ddt-map-card') && !code.includes('LiveDeliveryTrackingMap') && !code.includes('DeliveryLocationMap')) {
  console.log('Already updated: no tracking map or rider GPS component was found.');
  process.exit(0);
}
if (!code.includes('ddt-map-card') || !code.includes('        {selectedOrder.driver && (')) {
  console.error('Your tracking page structure differs from the premium version. No files were changed. Use the complete JSX TXT replacement instead.');
  process.exit(1);
}
const before = code;
code = code.replace(/^import LiveDeliveryTrackingMap from ['"]@\/app\/components\/LiveDeliveryTrackingMap['"]\s*\n/m, '');
code = code.replace(/^import DeliveryLocationMap from ['"]@\/app\/components\/DeliveryLocationMap['"]\s*\n/m, '');
code = code.replace(/function distanceKm\(lat1, lng1, lat2, lng2\) \{[\s\S]*?\n\}\n\n(?=export default function DeliveryTrackingPage)/, '');
code = code.replace(/  const driverLiveLocation = selectedOrder\.driver_live_location \|\| null[\s\S]*?(?=  const orderItems = Array\.isArray\(selectedOrder\.items\))/, '');
code = code.replace(/      : status === 'out_for_delivery'\n\s*\? canShowLiveRider\n\s*\? 'Your delivery partner is on the way\. Follow the latest reported location on the map\.'\n\s*: 'Your order is on the way\. Rider location will appear when available\.'/, "      : status === 'out_for_delivery'\n        ? 'Your order is on the way. Delivery progress will update automatically.'");
const start = code.indexOf('        <section className="ddt-map-card"');
const end = code.indexOf('        {selectedOrder.driver && (', start);
if (start === -1 || end < start) { console.error('Map boundaries not found. No files changed.'); process.exit(1); }
code = code.slice(0,start) + '        {/* Map and real-time delivery-partner GPS intentionally not displayed. */}\n\n' + code.slice(end);
if (code.includes('LiveDeliveryTrackingMap') || code.includes('DeliveryLocationMap') || code.includes('driver_live_location') || code.includes('ddt-map-card')) {
  console.error('Some rider-GPS references remain. No files changed.'); process.exit(1);
}
if (!code.includes('180000') || !code.includes('Delivery journey') || !code.includes('Payment breakdown')) {
  console.error('An expected existing feature was not found. No files changed.'); process.exit(1);
}
const backup = target + '.before-no-map.bak';
if (!fs.existsSync(backup)) fs.copyFileSync(target, backup);
fs.writeFileSync(target, code);
console.log('Done: map and live rider GPS removed from customer tracking. Backup:', backup);