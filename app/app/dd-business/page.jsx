'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import DDAppInstall from '@/app/components/DDAppInstall'

const ROLES = [
  { icon: '👤', name: 'Owner', title: 'Control your business', detail: 'Sales, restaurant settings, wallet and reports' },
  { icon: '📋', name: 'Manager', title: 'Run daily operations', detail: 'Orders, inventory, packing and coordination' },
  { icon: '🧑‍🍳', name: 'Kitchen', title: 'Prepare every order', detail: 'Kitchen display and order preparation' },
  { icon: '🍽️', name: 'Waiter', title: 'Serve your tables', detail: 'Dine-in orders and waiter tasks' },
  { icon: '📦', name: 'Packer', title: 'Pack accurately', detail: 'Barcode scanning, stock and delivery packing' },
  { icon: '🚴', name: 'Driver', title: 'Keep orders moving', detail: 'Delivery tasks, proof and return pickups' },
]
const GOOD_CODE = /^\d{5}$/

function BusinessIcon({ name, size = 22 }) {
  const shapes = {
    arrow: <><path d="M4 12h16m-6-6 6 6-6 6"/></>,
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></>,
    grid: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    support: <><path d="M4 13v-1a8 8 0 0 1 16 0v1"/><rect x="2" y="12" width="4" height="8" rx="2"/><rect x="18" y="12" width="4" height="8" rx="2"/><path d="M20 20c0 2-3 3-7 3"/></>,
    shield: <><path d="m12 2 8 4v6c0 5-4 8-8 10-4-2-8-5-8-10V6z"/><path d="m9 12 2 2 4-4"/></>,
    chevron: <path d="m9 6 6 6-6 6"/>,
    restaurant: <><path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6M9 10h.01M15 10h.01"/></>,
  }
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name] || shapes.grid}</svg>
}

function planLabel(plan) {
  const map = {
    restaurant_pro: 'Restaurant Pro', delivery: 'Delivery', restaurant_resort_pro: 'Restaurant + Resort',
    restaurant_delivery: 'Restaurant + Delivery', restaurant_resort_delivery: 'Restaurant + Resort + Delivery',
    restaurant_standard: 'Restaurant', restaurant_resort_standard: 'Restaurant + Resort',
  }
  return map[plan] || 'Digital Dine-In plan'
}

export default function DDBusinessAppPage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [restaurant, setRestaurant] = useState(null)

  async function checkCode(event) {
    event.preventDefault()
    if (!GOOD_CODE.test(code)) {
      setError('Enter your 5-digit restaurant code to continue.')
      return
    }
    setLoading(true)
    setError('')
    setRestaurant(null)
    try {
      const { data, error: rpcError } = await supabase.rpc('get_app_restaurant_by_code', { p_restaurant_code: code })
      if (rpcError) throw rpcError
      if (data?.success !== true || !data?.restaurant?.id) throw new Error(data?.message || 'Restaurant code not found.')
      setRestaurant(data.restaurant)
    } catch (err) {
      setError(err?.message || 'Unable to verify the restaurant code. Try again.')
    } finally { setLoading(false) }
  }

  // Ownership, role, plan and password checks are performed again by the existing /app portal.
  // Never navigate directly to a privileged dashboard from a public lookup.
  function continueToSecureSignIn() {
    if (!GOOD_CODE.test(code) || !restaurant?.id) return
    router.push(`/app?code=${encodeURIComponent(code)}`)
  }

  return <div className="ddb">
    <header className="ddb-topbar"><div className="ddb-topinner">
      <a href="/dd-business" className="ddb-brand" aria-label="DD Business home"><span className="ddb-logo">dd<span>.</span></span><span className="ddb-brand-name">business<small>by Digital Dine-In</small></span></a>
      <span className="ddb-top-label"><span/> BUSINESS WORKSPACE</span><DDAppInstall className="ddb-install" label="Install Business app" swPath="/dd-business-sw.js" swScope="/dd-business"/>
    </div></header>

    <main className="ddb-main">
      <div className="ddb-hero-grid"><section className="ddb-intro"><span className="ddb-kicker"><span className="ddb-kicker-dot"/> YOUR ALL-IN-ONE OPERATIONS HUB</span><h1>Run your business.<br/><span>Beautifully simple.</span></h1><p>Restaurant orders, delivery operations, staff and insights — all connected in one secure workspace.</p><div className="ddb-intro-perks"><span><BusinessIcon name="shield" size={17}/> Secure role access</span><span><BusinessIcon name="grid" size={17}/> One connected platform</span></div></section>
        <section className="ddb-login-panel" aria-label="Restaurant portal sign in"><div className="ddb-form-top"><span className="ddb-form-icon"><BusinessIcon name="restaurant" size={25}/></span><span className="ddb-form-status"><span/> READY TO CONNECT</span></div>
          <h2>Welcome back</h2><p>Enter your restaurant code to access your authorized workspace.</p>
          <form onSubmit={checkCode}><label htmlFor="ddb-code">RESTAURANT CODE</label><div className="ddb-code-field"><span>#</span><input id="ddb-code" inputMode="numeric" autoComplete="off" maxLength={5} pattern="[0-9]{5}" value={code} onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 5)); setRestaurant(null); setError('') }} placeholder="Enter 5-digit code" required/></div><span className="ddb-form-hint">Your unique 5-digit code, provided during setup.</span>
            {error && <p className="ddb-form-error" role="alert">{error}</p>}
            <button className="ddb-continue" type="submit" disabled={loading}>{loading ? 'Verifying restaurant…' : 'Verify restaurant'}<BusinessIcon name="arrow" size={18}/></button>
          </form>
          {restaurant && <div className="ddb-verified" role="status"><div><span className="ddb-checkmark">✓</span><div><strong>{restaurant.name || 'Your restaurant'}</strong><small>{planLabel(restaurant.plan_code || restaurant.plan)}</small></div></div><p>Code verified. Choose Continue to complete your existing secure owner or staff sign-in.</p><button type="button" onClick={continueToSecureSignIn}>Continue to secure sign in <BusinessIcon name="arrow" size={17}/></button></div>}
          <div className="ddb-secure-note"><BusinessIcon name="lock" size={16}/> Your restaurant code does not sign you in automatically.</div>
        </section>
      </div>
      <section className="ddb-roles"><div className="ddb-section-head"><div><span>MADE FOR EVERY TEAM</span><h2>One platform. Every role.</h2></div><p>Each person sees only what their assigned role allows.</p></div><div className="ddb-role-grid">{ROLES.map((role, i) => <a key={role.name} className="ddb-role-card" href="/app"><span className={`ddb-role-image r${i}`}>{role.icon}</span><span className="ddb-role-content"><strong>{role.name}</strong><small>{role.title}</small><span>{role.detail}</span></span><span className="ddb-role-arrow"><BusinessIcon name="chevron" size={18}/></span></a>)}</div></section>
      <section className="ddb-feature-band"><div className="ddb-feature-emblem"><BusinessIcon name="grid" size={32}/></div><div><span>ALL YOUR TOOLS. ONE HOME.</span><h3>Less switching. More doing.</h3><p>Continue using the Digital Dine-In order management, KDS, inventory, wallet, delivery and team features you already rely on.</p></div><a href="/app">Open business portal <BusinessIcon name="arrow" size={19}/></a></section>
      <div className="ddb-footer-note"><BusinessIcon name="shield" size={16}/> Connected to your existing Digital Dine-In database. Owner approval and staff permissions remain enforced by your current portal.</div>
    </main>
    <nav className="ddb-bottom-nav" aria-label="Business app navigation"><a className="active" href="/dd-business"><BusinessIcon name="grid"/><span>Home</span></a><a href="/app"><BusinessIcon name="restaurant"/><span>Portal</span></a><a href="/app"><BusinessIcon name="lock"/><span>Sign in</span></a></nav>
  </div>
}
