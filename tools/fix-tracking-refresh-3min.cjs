// DIGITAL DINE-IN — tracking status refresh every 3 minutes.
// Patch in place without replacing any of the latest tracking UI changes.
// Destination: app/delivery/[restaurantCode]/track/[orderCode]/page.jsx
// Run from project root: node tools/fix-tracking-refresh-3min.cjs
const fs = require('node:fs');
const path = require('node:path');

const target = path.join(process.cwd(), 'app', 'delivery', '[restaurantCode]', 'track', '[orderCode]', 'page.jsx');
if (!fs.existsSync(target)) {
  console.error('Tracking page not found at: ' + target);
  process.exit(1);
}
const source = fs.readFileSync(target, 'utf8');
const hits = [...source.matchAll(/\buseLiveDeliveryRefresh\s*\(/g)];
if (hits.length !== 1) {
  console.error(`Expected one tracking refresh hook; found ${hits.length}. No changes made.`);
  process.exit(1);
}
const start = hits[0].index;
const end = source.indexOf('\n  )', start);
if (end < start) {
  console.error('Unable to find the end of the tracking refresh call. No changes made.');
  process.exit(1);
}
const block = source.slice(start, end + '\n  )'.length);
if (!block.includes('loadAccountOrders') || !block.includes('loadOrder')) {
  console.error('Unexpected tracking refresh logic. No changes made.');
  process.exit(1);
}
if (/\b180000\b/.test(block)) {
  console.log('Already set to 3 minutes. No changes needed.');
  process.exit(0);
}
if (!/\b15000\b/.test(block)) {
  console.error('The refresh interval is not 15000ms. Check manually; no changes made.');
  process.exit(1);
}
const revisedBlock = block.replace(/\b15000\b/, '180000');
const revisedSource = source.slice(0, start) + revisedBlock + source.slice(end + '\n  )'.length);
fs.copyFileSync(target, target + '.backup-before-3min');
fs.writeFileSync(target, revisedSource, 'utf8');
console.log('Updated tracking data refresh from 15s to 3min (180000ms).');
console.log('Backup created: ' + target + '.backup-before-3min');
