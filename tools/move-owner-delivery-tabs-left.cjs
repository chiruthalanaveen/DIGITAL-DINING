#!/usr/bin/env node
'use strict'
// Digital Dine-In: update Delivery owner navigation to a left sidebar.
// Does not overwrite unrelated work; creates a backup; safe to run again.
const fs=require('fs')
const path=require('path')
const target=path.join(process.cwd(),'app','components','OwnerDeliveryManagement.jsx')
if(!fs.existsSync(target)){console.error('File not found: '+target);process.exit(1)}
let raw=fs.readFileSync(target,'utf8')
const crlf=raw.includes('\r\n')
let s=raw.replace(/\r\n/g,'\n')
if(s.includes('dd-owner-delivery-side-navigation')){console.log('Already installed; no changes.');process.exit(0)}
const state="  const [tab, setTab] = useState('overview')"
const tabs="    ['settings-home', 'Settings'],"
const helperCandidates = [
  "  const showFocusedView = Boolean(focusedSetting) || tab === 'wallet' || tab === 'support-chat'",
  "  const showFocusedView = Boolean(focusedSetting) || tab === 'wallet'",
]
const helper=helperCandidates.find((item)=>s.includes(item)) || helperCandidates[0]
const nav="      {!focusedSetting && (\n        <nav className=\"dd-dashboard-sidebar flex gap-2 overflow-x-auto border-b border-neutral-800 pb-3\" aria-label=\"Delivery owner sidebar\">"
const navEnd="\n      )}\n\n      {focusedSetting && ("
const close="    </section>\n  )\n}\n\n\n\nfunction AfterSalesWorkspace("
const oldRoot="  return (\n    <section className=\"space-y-5\">\n"
const newRoot="  return (\n    <section className=\"w-full min-w-0\">\n      {/* Mobile: a compact toggle instead of squeezing the workspace horizontally. */}\n      <div className=\"mb-4 flex items-center justify-between gap-3 rounded-2xl border border-neutral-800 bg-neutral-900 px-4 py-3 lg:hidden\">\n        <div className=\"min-w-0\">\n          <p className=\"text-[10px] font-extrabold uppercase tracking-[0.16em] text-emerald-400\">Delivery workspace</p>\n          <p className=\"mt-1 truncate text-sm font-black text-white\">{currentDeliveryTabLabel}</p>\n        </div>\n        <button\n          type=\"button\"\n          onClick={() => setDeliveryNavOpen((current) => !current)}\n          aria-expanded={deliveryNavOpen}\n          aria-controls=\"dd-owner-delivery-side-navigation\"\n          aria-label={deliveryNavOpen ? 'Hide delivery navigation' : 'Show delivery navigation'}\n          className=\"inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl border border-neutral-700 bg-neutral-800 px-4 py-2 text-xs font-bold text-white\"\n        >\n          <span aria-hidden=\"true\">{deliveryNavOpen ? '\u2715' : '\u2630'}</span>\n          {deliveryNavOpen ? 'Close' : 'Menu'}\n        </button>\n      </div>\n\n      <div className=\"grid min-w-0 grid-cols-1 items-start gap-5 lg:grid-cols-[234px_minmax(0,1fr)] lg:gap-6 xl:grid-cols-[252px_minmax(0,1fr)]\">\n        <aside\n          id=\"dd-owner-delivery-side-navigation\"\n          aria-label=\"Delivery dashboard navigation\"\n          className={`${deliveryNavOpen ? 'block' : 'hidden'} min-w-0 overflow-hidden rounded-[22px] border border-neutral-800 bg-[#111720] p-3 shadow-lg lg:sticky lg:top-4 lg:block lg:max-h-[calc(100dvh-2rem)] lg:overflow-y-auto`}\n        >\n          <div className=\"mb-3 rounded-2xl bg-gradient-to-br from-emerald-500/15 via-neutral-900 to-neutral-950 px-3 py-4\">\n            <div className=\"mb-2 flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-sm font-black text-white\">D</div>\n            <p className=\"text-[10px] font-black uppercase tracking-[0.16em] text-emerald-400\">Delivery dashboard</p>\n            <p className=\"mt-1 truncate text-sm font-black text-white\" title={settings.store_name || restaurant?.name || 'Delivery store'}>\n              {settings.store_name || restaurant?.name || 'Delivery store'}\n            </p>\n            <p className=\"mt-1 text-[10px] font-bold text-neutral-500\">Choose a workspace section</p>\n          </div>\n\n          <nav className=\"flex flex-col gap-1\" aria-label=\"Delivery management sections\">\n            {tabs.map(([id, label]) => {\n              const isActive = tab === id || (id === 'settings-home' && Boolean(focusedSetting) && !['service_area', 'billing'].includes(tab))\n              return (\n                <button\n                  key={id}\n                  type=\"button\"\n                  onClick={() => {\n                    setTab(id)\n                    setDeliveryNavOpen(false)\n                  }}\n                  aria-current={isActive ? 'page' : undefined}\n                  className={`group flex w-full min-w-0 items-center gap-3 rounded-xl border px-3 py-3 text-left text-xs font-black transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-400 ${\n                    isActive\n                      ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'\n                      : 'border-transparent text-neutral-300 hover:border-neutral-700 hover:bg-neutral-800 hover:text-white'\n                  }`}\n                >\n                  <span aria-hidden=\"true\" className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-sm ${isActive ? 'bg-emerald-500/20 text-emerald-300' : 'bg-neutral-800 text-neutral-400'}`}>\n                    {deliveryTabIcons[id] || '\u25a4'}\n                  </span>\n                  <span className=\"min-w-0 flex-1 whitespace-normal break-words leading-4\">{label}</span>\n                  {isActive && <span aria-hidden=\"true\" className=\"h-2 w-2 shrink-0 rounded-full bg-emerald-400\" />}\n                </button>\n              )\n            })}\n          </nav>\n          <div className=\"mt-4 border-t border-neutral-800 px-3 pt-3 text-[10px] leading-5 text-neutral-500\">\n            Owner Delivery management \u00b7 Digital Dine-In\n          </div>\n        </aside>\n\n        {/* All original dashboard content remains here; only the navigation moved. */}\n        <div className=\"min-w-0 space-y-5\">\n"
const extra="\n\n  const deliveryTabIcons = {\n    overview: '\u25a6', orders: '\u2637', menu: '\u25a4', inventory: '\u25a3',\n    cod: '\u20b9', after_sales: '\u21a9', offers: '\u2726', drivers: '\u2197',\n    packers: '\u25b1', wallet: '\u25c8', 'settings-home': '\u2699',\n    service_area: '\u2316', billing: '\u25a7', 'support-chat': '\u25c9',\n    website: '\u2197',\n  }\n  const currentDeliveryTabLabel = tabs.find(([id]) => id === tab)?.[1] ||\n    focusedSetting?.title || 'Delivery Management'\n\n\n"
for(const [name,v] of [['state',state],['tabs',tabs],['helper',helper],['horizontal navigation',nav],['component end',close],['component root',oldRoot]]){
 if(!s.includes(v)){console.error('Unsupported source format ('+name+'). No files changed.');process.exit(1)}
}
function one(from,to,name){const a=s.indexOf(from);if(a<0||s.indexOf(from,a+1)>=0){throw new Error('Expected one '+name+' match; no files changed')}s=s.replace(from,to)}
try {
 one(state,state+"\n  const [deliveryNavOpen, setDeliveryNavOpen] = useState(false)",'active state')
 one(tabs,tabs+"\n    ['service_area', 'Delivery Area'],\n    ['billing', 'Billing'],",'tab list')
 one(helper,helper+extra,'tab helpers')
 one(oldRoot,newRoot,'root layout')
 const a=s.indexOf(nav,s.indexOf('dd-owner-delivery-side-navigation'))
 const b=s.indexOf(navEnd,a)
 if(a<0||b<0)throw new Error('Horizontal navigation end missing')
 s=s.slice(0,a)+s.slice(b+'\n      )}\n'.length)
 one(close,'        </div>\n      </div>\n    </section>\n  )\n}\n\n\n\nfunction AfterSalesWorkspace(','component closing')
 if(!s.includes('dd-owner-delivery-side-navigation')||s.includes('dd-dashboard-sidebar flex gap-2 overflow-x-auto')) throw new Error('Validation failed')
 const backup=target+'.backup-'+new Date().toISOString().replace(/[:.]/g,'-')
 fs.copyFileSync(target,backup)
 fs.writeFileSync(target,crlf?s.replace(/\n/g,'\r\n'):s)
 console.log('Delivery left sidebar installed. Updated: '+target)
 console.log('Backup: '+backup)
} catch(error){console.error(String(error?.message||error));process.exit(1)}