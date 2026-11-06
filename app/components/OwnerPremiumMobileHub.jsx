'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import ThemeToggle from '@/app/components/ThemeToggle'

const RESTAURANT = [
  ['settlements','Reports & analytics','Revenue, orders and downloads','chart'],
  ['menu','Menu & categories','Dishes, photos, availability','grid'],
  ['tables','Tables & QR','QR ordering and table setup','qr'],
  ['staff','Managers','Manager roles and access','users',true],
  ['staff-access','Kitchen, waiter & staff','Staff login QR and access','users'],
  ['offers','Offers & promotions','Daily discounts and campaigns','spark'],
  ['taxes','GST & packing','Tax rates and packing charges','settings'],
  ['billing','Invoices & billing','Bills, signatures and branding','receipt'],
  ['gateway','Payment gateways','Razorpay and counter payments','wallet'],
  ['alarm-settings','Order alarms','Kitchen and waiter sound controls','bell',true],
  ['swiggy-sync','Menu import / sync','Catalogue import tools','refresh',true],
]
const DELIVERY = [
  ['Delivery orders','Orders and statuses','box'],['Products & inventory','Catalogue and stock','grid'],
  ['Packer management','Packing workflow','users'],['Driver assignment','Delivery team and auto assignment','truck'],
  ['Delivery tracking','Order location and progress','pin'],['Coverage & radius','Serviceable delivery area','pin'],
  ['Fees & surge','Handling, minimum order and surge','settings'],['Wallet & recharge','Balance, debits and recharge','wallet'],
  ['Returns & replacements','Pickup and customer issues','refresh'],['Delivery reports','Operations and performance','chart'],
]
const RESORT = [
  ['Bookings & reservations','Upcoming and past bookings','box'],['Room management','Room setup and details','grid'],
  ['Availability','Rooms and occupancy','calendar'],['Guests','Guest information','users'],
  ['Check-in / check-out','Guest stay operations','calendar'],['Resort payments','Charges and collections','wallet'],
  ['Occupancy & revenue','Reports and insights','chart'],
]
const SHAPES = {
  home:<><path d="m3 10 9-7 9 7v11H3z"/><path d="M9 21v-8h6v8"/></>,
  box:<><path d="m3 7 9-4 9 4v11l-9 4-9-4zM3 7l9 5 9-5M12 12v10"/></>,
  grid:<><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
  chart:<><path d="M3 20h18M6 16v-6m6 6V5m6 11V9"/></>,
  settings:<><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3m0 14v3M2 12h3m14 0h3"/></>,
  support:<><path d="M4 14v-3a8 8 0 0 1 16 0v3M4 14H2v6h5v-6zM20 14h2v6h-5v-6zM17 21c-1 1-3 1-5 1"/></>,
  wallet:<><rect x="2" y="5" width="20" height="16" rx="3"/><path d="M2 10h20m-5 5h3"/></>,
  receipt:<><path d="M5 3h14v18l-3-2-4 2-4-2-3 2zM8 8h8M8 12h8"/></>,
  users:<><circle cx="9" cy="8" r="3"/><path d="M3 21v-2a6 6 0 0 1 12 0v2M17 8a3 3 0 0 1 0 6m1 2c2 1 3 3 3 5"/></>,
  bell:<><path d="M18 8a6 6 0 0 0-12 0c0 6-3 7-3 9h18c0-2-3-3-3-9M10 21h4"/></>,
  search:<><circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/></>,
  close:<><path d="M5 5 19 19M19 5 5 19"/></>,
  arrow:<><path d="m9 5 7 7-7 7"/></>,
  qr:<><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><path d="M15 15h3v3h-3m5-4v7m-6 0h3"/></>,
  spark:<><path d="m12 2 2.7 7.3L22 12l-7.3 2.7L12 22l-2.7-7.3L2 12l7.3-2.7z"/></>,
  refresh:<><path d="M20 7v5h-5M4 17v-5h5M6 8a7 7 0 0 1 12-2l2 1M4 17l2 1a7 7 0 0 0 12-2"/></>,
  truck:<><path d="M3 6h12v12H3zM15 10h4l3 4v4h-7"/><circle cx="7" cy="18" r="2"/><circle cx="19" cy="18" r="2"/></>,
  pin:<><path d="M19 10c0 5-7 12-7 12S5 15 5 10a7 7 0 1 1 14 0z"/><circle cx="12" cy="10" r="2"/></>,
  calendar:<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M7 3v4m10-4v4M3 10h18"/></>,
  profile:<><circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/></>,
  layers:<><path d="m12 3 9 5-9 5-9-5zM3 12l9 5 9-5M3 16l9 5 9-5"/></>,
}
function Icon({ name, size=20 }) {return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{SHAPES[name]||SHAPES.grid}</svg>}
const MONEY = new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0})
function fmt(n){return MONEY.format(Number(n)||0)}
const fmtDate=v=>{const d=new Date(v);return Number.isNaN(d.getTime())?'':d.toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'})}

export default function OwnerPremiumMobileHub({
  businessName='My business',businessCode='',mode='restaurant',hasRestaurant=true,hasDelivery=false,hasResort=false,
  advanced=true,storeOpen=true,savingStore=false,onStoreToggle,onModeChange,onRestaurantTab,onProfile,onQR,onSupport,
  orders=[],ordersLoaded=false,ordersError='',todayRevenue=0,totalRevenue=0,activeCount=0,todayCount=0,
  graphData=[],onRefresh,
}){
  const [screen,setScreen]=useState('home')
  const [query,setQuery]=useState('')
  const [searchOpen,setSearchOpen]=useState(false)
  const [selectedOrder,setSelectedOrder]=useState(null)
  const dialogRef=useRef(null)
  const enabled=[...(hasRestaurant?[{key:'restaurant',label:'Restaurant',icon:'receipt'}]:[]),...(hasDelivery?[{key:'delivery',label:'Delivery',icon:'truck'}]:[]),...(hasResort?[{key:'resort',label:'Resort',icon:'layers'}]:[])]
  const section=enabled.find(x=>x.key===mode)||enabled[0]
  const safeOrders=Array.isArray(orders)?orders:[]
  const recent=useMemo(()=>[...safeOrders].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0)).slice(0,25),[orders])
  const tools=useMemo(()=>[
    ...(hasRestaurant?RESTAURANT.filter(t=>advanced||!t[4]).map(t=>({name:t[1],detail:t[2],icon:t[3],group:'Restaurant',go:()=>openRestaurant(t[0])})):[]),
    ...(hasDelivery?DELIVERY.map(t=>({name:t[0],detail:t[1],icon:t[2],group:'Delivery',go:()=>switchMode('delivery')})):[]),
    ...(hasResort?RESORT.map(t=>({name:t[0],detail:t[1],icon:t[2],group:'Resort',go:()=>switchMode('resort')})):[]),
    {name:'Owner profile',detail:'Personal information and contacts',icon:'profile',group:'Account',go:()=>run(onProfile)},
    {name:'Staff access',detail:'Managers, waiters and staff',icon:'users',group:'Account',go:()=>hasRestaurant?openRestaurant('staff-access'):switchMode(mode)},
    {name:'Live Support',detail:'Contact your Super Admin team',icon:'support',group:'Help & Support',go:()=>run(onSupport)},
    {name:'AI Support',detail:'Ask the Digital Dine-In assistant',icon:'spark',group:'Help & Support',go:()=>run(onSupport)},
    ...(hasRestaurant?[{name:'QR management',detail:'Share restaurant QR codes',icon:'qr',group:'Account',go:()=>run(onQR)}]:[]),
  // Existing owner settings are in the parent portal. Avoid creating unsupported settings pages.
  ],[hasRestaurant,hasDelivery,hasResort,advanced,onRestaurantTab,onModeChange,onProfile,onQR,onSupport,mode])
  const filtered=tools.filter(x=>(x.name+' '+x.detail+' '+x.group).toLowerCase().includes(query.trim().toLowerCase()))
  const groups=['Restaurant','Delivery','Resort','Account','Help & Support']
  const graph=Array.isArray(graphData)?graphData:[]
  const maxGraph=Math.max(1,...graph.map(d=>Number(d.revenue)||0))
  const line=graph.length>1?graph.map((d,i)=>`${(i/(graph.length-1))*100},${47-((Number(d.revenue)||0)/maxGraph)*39}`).join(' '):''
  function run(fn){setSearchOpen(false);fn?.()}
  function switchMode(next){if(!enabled.some(x=>x.key===next))return;setScreen('home');setSearchOpen(false);onModeChange?.(next);window.requestAnimationFrame(()=>window.scrollTo({top:0,behavior:'smooth'}))}
  function openRestaurant(tab){setSearchOpen(false);setScreen(tab==='settlements'?'insights':'business');onModeChange?.('restaurant');onRestaurantTab?.(tab);window.requestAnimationFrame(()=>document.getElementById('dd-ws-live-module')?.scrollIntoView({behavior:'smooth',block:'start'}))}
  function chooseScreen(next){setScreen(next);window.scrollTo({top:0,behavior:'smooth'})}
  useEffect(()=>{if(!searchOpen)return;const previous=document.body.style.overflow;document.body.style.overflow='hidden';dialogRef.current?.focus();return()=>{document.body.style.overflow=previous}},[searchOpen])
  useEffect(()=>{function esc(e){if(e.key==='Escape'){setSearchOpen(false);setSelectedOrder(null)}}document.addEventListener('keydown',esc);return()=>document.removeEventListener('keydown',esc)},[])
  const NavButton=({id,icon,title})=><button type="button" onClick={()=>chooseScreen(id)} aria-current={screen===id?'page':undefined} className={'ddp-nav-item '+(screen===id?'ddp-nav-current':'')}><Icon name={icon} size={21}/><span>{title}</span></button>
  return <div className="ddp-root lg:hidden" data-owner-mobile="premium">
    <style jsx global>{`
      .ddp-root{--ddp-bg:#f8fafc;--ddp-card:#fff;--ddp-text:#142035;--ddp-muted:#64748b;--ddp-border:#e9edf5;--ddp-accent:#ea580c;color:var(--ddp-text);font-family:inherit}
      :root[data-theme='dark'] .ddp-root{--ddp-bg:#10131b;--ddp-card:#1b202d;--ddp-text:#f1f5f9;--ddp-muted:#a0aec0;--ddp-border:#343b4b;--ddp-accent:#fb923c}
      .ddp-root .ddp-surface{background:var(--ddp-card);border:1px solid var(--ddp-border);border-radius:22px;box-shadow:0 12px 35px rgba(17,24,39,.035)}
      .ddp-root .ddp-muted{color:var(--ddp-muted)}
      .ddp-root .ddp-icon{display:flex;align-items:center;justify-content:center;width:41px;height:41px;border-radius:14px;background:var(--ddp-bg);flex-shrink:0}
      .ddp-root .ddp-entry{display:flex;width:100%;align-items:center;gap:12px;padding:13px 14px;text-align:left;min-height:66px;border-bottom:1px solid var(--ddp-border)}
      .ddp-root .ddp-entry:last-child{border-bottom:0}
      .ddp-root .ddp-entry:active{background:var(--ddp-bg)}
      .ddp-root .ddp-nav{position:fixed;bottom:0;left:0;right:0;z-index:90;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));min-height:calc(69px + env(safe-area-inset-bottom));padding:5px 7px env(safe-area-inset-bottom);background:var(--ddp-card);border-top:1px solid var(--ddp-border);box-shadow:0 -12px 32px rgba(15,23,42,.09)}
      .ddp-root .ddp-nav-item{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;min-height:58px;font-size:10px;font-weight:700;color:var(--ddp-muted);border-radius:14px}
      .ddp-root .ddp-nav-current{color:var(--ddp-accent);background:color-mix(in srgb,var(--ddp-accent) 9%,transparent)}
      .ddp-root button:focus-visible,.ddp-root input:focus-visible{outline:3px solid #fb923c;outline-offset:2px}
      .ddp-root .ddp-fade{animation:ddp-rise .22s ease both}
      @keyframes ddp-rise{from{opacity:.55;transform:translateY(7px)}to{opacity:1;transform:translateY(0)}}
      @media(prefers-reduced-motion:reduce){.ddp-root *{animation:none!important;scroll-behavior:auto!important;transition:none!important}}
      @media(max-width:1023px){.dd-owner-dashboard .dd-dashboard-header{display:none!important}.dd-owner-dashboard .dd-dashboard-intro{display:none!important}.dd-owner-dashboard .dd-dashboard-sidebar{display:none!important}.dd-owner-dashboard .dd-owner-mobile-bottom-nav{display:none!important}.dd-owner-dashboard{padding-bottom:calc(84px + env(safe-area-inset-bottom))!important}}
    `}</style>
    <header className="ddp-surface sticky top-0 z-[45] mb-4 overflow-hidden !rounded-[24px]" style={{background:'var(--ddp-card)'}}>
      <div className="flex items-center gap-3 p-4">
        <span className="flex h-11 w-11 flex-none items-center justify-center rounded-2xl text-lg font-black text-white shadow-lg" style={{background:'linear-gradient(145deg,#fb923c,#ea580c)'}}>{businessName.slice(0,1).toUpperCase()}</span>
        <div className="min-w-0 flex-1"><p className="ddp-muted text-[10px] font-bold uppercase tracking-[.15em]">Digital Dine-In · Owner</p><h1 className="truncate text-lg font-extrabold tracking-tight">{businessName}</h1><p className="ddp-muted text-[11px]">{section?.label||'Owner'} workspace {businessCode?`· ${businessCode}`:''}</p></div>
        <button type="button" aria-label="Open owner profile" onClick={()=>run(onProfile)} className="ddp-icon"><Icon name="profile"/></button>
      </div>
      <div className="flex items-center justify-between gap-3 border-t px-4 py-2.5" style={{borderColor:'var(--ddp-border)'}}>
        <button type="button" onClick={onStoreToggle} disabled={savingStore} aria-label={storeOpen?'Close restaurant':'Open restaurant'} className="flex min-h-10 items-center gap-2 text-xs font-bold disabled:opacity-50"><span className={'h-2.5 w-2.5 rounded-full '+(storeOpen?'bg-emerald-500':'bg-rose-500')}/>{savingStore?'Updating...':storeOpen?'Restaurant open':'Restaurant closed'}</button>
        <div className="flex items-center gap-2"><span className="ddp-muted text-[10px]">Appearance</span><ThemeToggle/></div>
      </div>
    </header>
    {enabled.length>1&&<div className="mb-4 flex gap-2 overflow-x-auto pb-1" aria-label="Business portals">{enabled.map(m=><button key={m.key} type="button" aria-current={mode===m.key?'page':undefined} onClick={()=>switchMode(m.key)} className={'flex min-h-11 shrink-0 items-center gap-2 rounded-2xl border px-4 text-xs font-bold '+(mode===m.key?'border-orange-400 bg-orange-500 text-white':'ddp-surface')}><Icon name={m.icon} size={17}/>{m.label}</button>)}</div>}
    {screen==='home'&&<div className="ddp-fade space-y-4">
      <div className="relative overflow-hidden rounded-[26px] p-5 text-white shadow-xl" style={{background:'linear-gradient(120deg,#401a67 0%,#8a35b3 48%,#f17b4c 100%)'}}><div className="absolute -right-7 -top-12 h-44 w-44 rounded-full border border-white/20 bg-white/5"/><p className="text-[11px] font-bold uppercase tracking-[.18em] text-white/80">{section?.label} insights</p><h2 className="mt-2 text-2xl font-extrabold">Your business, at a glance</h2><p className="mt-1 text-xs leading-5 text-white/85">Live operations, revenue and key shortcuts in one workspace.</p><button onClick={()=>chooseScreen('insights')} className="mt-4 flex min-h-10 items-center gap-2 rounded-xl bg-white/20 px-4 text-xs font-bold backdrop-blur-md">View insights <Icon name="arrow" size={16}/></button></div>
      {mode==='restaurant'?<><div className="grid grid-cols-2 gap-3">{[
        ['Revenue today',ordersLoaded&&!ordersError?fmt(todayRevenue):'—','wallet'],
        ['Orders today',ordersLoaded&&!ordersError?String(todayCount):'—','box'],
        ['Active kitchen',ordersLoaded&&!ordersError?String(activeCount):'—','bell'],
        ['Total revenue',ordersLoaded&&!ordersError?fmt(totalRevenue):'—','chart'],
      ].map(([label,value,ico])=><div key={label} className="ddp-surface min-h-28 p-4"><span className="ddp-icon"><Icon name={ico}/></span><p className="mt-3 text-lg font-extrabold">{value}</p><p className="ddp-muted text-[11px]">{label}</p></div>)}</div>{ordersError&&<p role="alert" className="rounded-xl bg-rose-500/10 p-3 text-xs text-rose-600">Reports unavailable: {ordersError}</p>}</>:<div className="ddp-surface p-4"><h3 className="text-sm font-bold">{section?.label} operations</h3><p className="ddp-muted mt-1 text-xs leading-5">Your {section?.label.toLowerCase()} orders, payments and reports remain in the full workspace below.</p><button type="button" className="mt-3 rounded-xl bg-orange-500 px-4 py-3 text-xs font-bold text-white" onClick={()=>document.getElementById('dd-ws-live-module')?.scrollIntoView({behavior:'smooth'})}>Go to {section?.label} dashboard</button></div>}
      <div className="ddp-surface p-4"><div className="mb-3 flex justify-between"><h3 className="text-sm font-bold">Quick actions</h3><button className="text-xs font-bold text-orange-500" onClick={()=>chooseScreen('settings')}>All settings</button></div><div className="grid grid-cols-3 gap-2">{(mode==='restaurant'?[['Menu','grid',()=>openRestaurant('menu')],['Billing','receipt',()=>openRestaurant('billing')],['QR codes','qr',()=>run(onQR)],['Staff','users',()=>openRestaurant('staff-access')],['Offers','spark',()=>openRestaurant('offers')],['Orders','box',()=>chooseScreen('orders')]]:[[`${section?.label} tools`,'grid',()=>chooseScreen('business')],['Reports','chart',()=>chooseScreen('insights')],['Settings','settings',()=>chooseScreen('settings')]]).map(([label,icon,go])=><button type="button" key={label} onClick={go} className="flex min-h-[84px] flex-col items-center justify-center gap-2 rounded-2xl p-2 text-[11px] font-semibold" style={{background:'var(--ddp-bg)'}}><Icon name={icon}/>{label}</button>)}</div></div>
      {mode==='restaurant'&&<div className="ddp-surface p-4"><div className="flex items-center justify-between"><h3 className="text-sm font-bold">Sales trend</h3><button type="button" onClick={()=>openRestaurant('settlements')} className="text-xs font-bold text-orange-500">Detailed reports</button></div>{ordersLoaded&&!ordersError&&line?<svg className="mt-3 h-28 w-full" viewBox="0 0 100 52" preserveAspectRatio="none" role="img" aria-label="Revenue trend for your selected reporting period"><polyline points={line} fill="none" stroke="#e879f9" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke"/></svg>:<p className="ddp-muted py-8 text-center text-xs">Sales trend is available when orders finish syncing.</p>}</div>}
      {mode==='restaurant'&&activeCount>0&&<button type="button" onClick={()=>chooseScreen('orders')} className="flex min-h-12 w-full items-center gap-3 rounded-2xl bg-amber-500/10 px-4 text-left text-xs font-bold text-amber-700"><Icon name="bell"/>{activeCount} order(s) need attention <Icon name="arrow" size={16}/></button>}
    </div>}
    {screen==='orders'&&<section className="ddp-fade space-y-3"><h2 className="text-xl font-extrabold">Orders</h2>{mode!=='restaurant'?<div className="ddp-surface p-5"><p className="ddp-muted text-sm">Open {section?.label} Management below to view and update your orders securely.</p><button className="mt-3 rounded-xl bg-orange-500 px-4 py-3 text-xs font-bold text-white" onClick={()=>document.getElementById('dd-ws-live-module')?.scrollIntoView({behavior:'smooth'})}>Open management</button></div>:ordersError?<p role="alert" className="rounded-xl bg-rose-500/10 p-4 text-sm text-rose-600">{ordersError}</p>:!ordersLoaded?<p className="ddp-muted text-sm">Synchronizing your orders...</p>:recent.length?recent.map((o,i)=><button type="button" key={String(o.id||i)} onClick={()=>setSelectedOrder(o)} className="ddp-surface flex w-full items-center gap-3 p-4 text-left"><div className="ddp-icon"><Icon name="box"/></div><div className="min-w-0 flex-1"><div className="truncate text-sm font-bold">Order #{String(o.order_number||o.order_code||o.id||i+1).slice(0,18)}</div><p className="ddp-muted mt-1 text-[11px]">{fmtDate(o.created_at)}</p></div><div className="text-right"><p className="text-sm font-bold">{fmt(o.total_amount)}</p><p className="mt-1 text-[11px] capitalize text-orange-500">{String(o.status||'Unknown').replaceAll('_',' ')}</p></div><Icon name="arrow" size={17}/></button>):<div className="ddp-surface p-6 text-center text-sm">No orders to display yet.</div>}</section>}
    {screen==='business'&&<section className="ddp-fade space-y-3"><h2 className="text-xl font-extrabold">My businesses</h2><p className="ddp-muted text-xs">Each enabled module keeps its existing management screens.</p>{enabled.map(m=><button key={m.key} type="button" onClick={()=>switchMode(m.key)} className="ddp-surface flex w-full items-center gap-3 p-4 text-left"><span className="ddp-icon"><Icon name={m.icon}/></span><span className="flex-1"><span className="block text-sm font-bold">{m.label} portal</span><span className="ddp-muted text-[11px]">Orders, tools and management</span></span><Icon name="arrow"/></button>)}<p className="ddp-muted text-xs">To open a specific tool, select it from Settings.</p></section>}
    {screen==='insights'&&<section className="ddp-fade space-y-3"><h2 className="text-xl font-extrabold">Analytics & reports</h2>{mode==='restaurant'?<><div className="ddp-surface p-5"><p className="ddp-muted text-xs">Revenue across loaded restaurant orders</p><p className="mt-1 text-3xl font-extrabold">{ordersLoaded&&!ordersError?fmt(totalRevenue):'—'}</p><p className="ddp-muted mt-2 text-xs">{safeOrders.length} orders loaded</p></div><button type="button" onClick={()=>openRestaurant('settlements')} className="ddp-surface flex w-full items-center justify-between p-4 text-sm font-bold">Full restaurant reports <Icon name="arrow"/></button></>:<button type="button" onClick={()=>document.getElementById('dd-ws-live-module')?.scrollIntoView({behavior:'smooth'})} className="ddp-surface flex w-full items-center justify-between p-4 text-sm font-bold">Open {section?.label} reports <Icon name="arrow"/></button>}</section>}
    {screen==='settings'&&<section className="ddp-fade space-y-3"><h2 className="text-xl font-extrabold">Tools & settings</h2><button type="button" onClick={()=>{setQuery('');setSearchOpen(true)}} className="ddp-surface flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm ddp-muted"><Icon name="search"/>Search settings, fees, staff, support... <span className="ml-auto"><Icon name="arrow" size={17}/></span></button>{groups.map(group=>{const list=tools.filter(t=>t.group===group);return list.length?<div key={group}><h3 className="ddp-muted px-1 pb-2 pt-3 text-[11px] font-extrabold uppercase tracking-widest">{group}</h3><div className="ddp-surface overflow-hidden">{list.map(t=><button type="button" className="ddp-entry" key={t.group+t.name} onClick={t.go}><span className="ddp-icon"><Icon name={t.icon}/></span><span className="min-w-0 flex-1"><strong className="block text-[13px]">{t.name}</strong><span className="ddp-muted block text-[11px]">{t.detail}</span></span><Icon name="arrow" size={16}/></button>)}</div></div>:null})}</section>}
    <nav className="ddp-nav" aria-label="Owner mobile navigation"><NavButton id="home" icon="home" title="Home"/><NavButton id="orders" icon="box" title="Orders"/><NavButton id="business" icon="grid" title="Business"/><NavButton id="insights" icon="chart" title="Insights"/><NavButton id="settings" icon="settings" title="Settings"/></nav>
    {searchOpen&&<div className="fixed inset-0 z-[140] flex items-end justify-center bg-black/65" onMouseDown={e=>{if(e.target===e.currentTarget)setSearchOpen(false)}}><section ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Search owner settings" className="flex max-h-[92dvh] w-full max-w-xl flex-col rounded-t-[28px] p-4 outline-none" style={{background:'var(--ddp-card)',color:'var(--ddp-text)'}}><div className="flex items-center justify-between"><h2 className="text-lg font-extrabold">Find a setting</h2><button className="ddp-icon" onClick={()=>setSearchOpen(false)} aria-label="Close search"><Icon name="close"/></button></div><div className="my-3 flex items-center gap-2 rounded-xl p-3" style={{background:'var(--ddp-bg)'}}><Icon name="search"/><input autoFocus value={query} onChange={e=>setQuery(e.target.value)} className="min-w-0 flex-1 bg-transparent text-sm outline-none" placeholder="Search tools, settings, help..." aria-label="Search terms"/></div><div className="min-h-0 flex-1 overflow-y-auto pb-[calc(1rem+env(safe-area-inset-bottom))]">{filtered.length?filtered.map(t=><button key={t.group+t.name} type="button" className="ddp-entry" onClick={t.go}><span className="ddp-icon"><Icon name={t.icon}/></span><span className="min-w-0 flex-1"><strong className="block text-xs">{t.name}</strong><span className="ddp-muted block text-[11px]">{t.group} · {t.detail}</span></span><Icon name="arrow" size={16}/></button>):<p className="ddp-muted py-8 text-center text-sm">No settings match that search.</p>}</div></section></div>}
    {selectedOrder&&<div className="fixed inset-0 z-[145] flex items-end justify-center bg-black/60" onMouseDown={e=>{if(e.target===e.currentTarget)setSelectedOrder(null)}}><section className="w-full max-w-xl rounded-t-[28px] p-5" role="dialog" aria-modal="true" aria-label="Order details" style={{background:'var(--ddp-card)',color:'var(--ddp-text)'}}><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Order details</h2><button className="ddp-icon" onClick={()=>setSelectedOrder(null)} aria-label="Close order"><Icon name="close"/></button></div><p className="ddp-muted mt-3 text-sm">Order ID: {String(selectedOrder.id||'—')}</p><p className="mt-2 text-sm">Status: <strong className="capitalize">{String(selectedOrder.status||'Unknown').replaceAll('_',' ')}</strong></p><p className="mt-2 text-sm">Amount: <strong>{fmt(selectedOrder.total_amount)}</strong></p><p className="ddp-muted mt-2 text-xs">{fmtDate(selectedOrder.created_at)}</p><button type="button" className="mt-5 min-h-12 w-full rounded-xl bg-orange-500 px-4 text-sm font-bold text-white" onClick={()=>{setSelectedOrder(null);openRestaurant('billing')}}>Open billing and existing order tools</button></section></div>}
  </div>
}