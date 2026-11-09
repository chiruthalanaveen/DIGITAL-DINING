'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import './wallets.css'

const money = paise => new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(paise || 0) / 100)

export default function EcommerceWalletAdminPage() {
  const [stores, setStores] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('all')
  const [lastUpdated, setLastUpdated] = useState(null)

  const refresh = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const response = await fetch('/api/admin/ecommerce/wallets', { cache: 'no-store', credentials: 'same-origin' })
      const data = await response.json().catch(() => ({}))
      if (!response.ok || data.success !== true) throw new Error(data.message || 'Unable to load wallets')
      setStores(Array.isArray(data.stores) ? data.stores : [])
      setLastUpdated(new Date())
    } catch (err) {
      setError(err.message || 'Unable to load wallets')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { refresh() }, [refresh])

  const summary = useMemo(() => ({
    total: stores.length,
    balance: stores.reduce((sum, s) => sum + Number(s.balancePaise || 0), 0),
    pending: stores.reduce((sum, s) => sum + Number(s.pendingFeePaise || 0), 0),
    low: stores.filter(s => s.walletExists && Number(s.spendablePaise || 0) <= Number(s.orderBlockThresholdPaise || 0)).length,
  }), [stores])

  const filtered = useMemo(() => stores.filter(s => {
    const matchesSearch = `${s.name || ''} ${s.slug || ''}`.toLowerCase().includes(search.toLowerCase().trim())
    const low = s.walletExists && Number(s.spendablePaise || 0) <= Number(s.orderBlockThresholdPaise || 0)
    const matchesFilter = filter === 'all' || (filter === 'low' && low) || (filter === 'missing' && !s.walletExists) || (filter === 'ready' && s.walletExists && !low)
    return matchesSearch && matchesFilter
  }), [stores, search, filter])

  return (
    <main className="ecw-root">
      <header className="ecw-header">
        <div><p className="ecw-eyebrow">E-COMMERCE MANAGEMENT</p><h1>Store Wallets</h1><p>Monitor wallet balances, pending platform fees and order-block thresholds.</p></div>
        <button className="ecw-refresh" type="button" onClick={refresh} disabled={loading}>{loading ? 'Refreshing…' : '↻ Refresh wallets'}</button>
      </header>
      <div className="ecw-metrics">
        <div className="ecw-metric"><span>Stores</span><strong>{summary.total}</strong><small>All E-Commerce websites</small></div>
        <div className="ecw-metric"><span>Total wallet balance</span><strong>{money(summary.balance)}</strong><small>Across all listed stores</small></div>
        <div className="ecw-metric"><span>Pending platform fees</span><strong>{money(summary.pending)}</strong><small>Not yet deducted</small></div>
        <div className="ecw-metric"><span>At / below threshold</span><strong>{summary.low}</strong><small>Wallets requiring attention</small></div>
      </div>
      <section className="ecw-panel">
        <div className="ecw-panel-top"><div><h2>Wallet overview</h2><p>Read-only view. Existing fees and balances cannot be changed here.</p></div>{lastUpdated && <small>Updated {lastUpdated.toLocaleTimeString('en-IN')}</small>}</div>
        <div className="ecw-filters"><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by store name or slug" aria-label="Search stores"/><select value={filter} onChange={e => setFilter(e.target.value)} aria-label="Wallet status filter"><option value="all">All wallets</option><option value="ready">Healthy wallets</option><option value="low">Low balance</option><option value="missing">Missing wallets</option></select></div>
        {error && <p className="ecw-error" role="alert">{error}</p>}
        {loading && <p className="ecw-muted" role="status">Loading wallets…</p>}
        {!loading && !error && filtered.length === 0 && <div className="ecw-empty">No wallets match your filters.</div>}
        {!loading && !error && filtered.length > 0 && <div className="ecw-table-scroll"><table><thead><tr><th>Website</th><th>Approval</th><th>Balance</th><th>Pending fees</th><th>Spendable</th><th>Fee / order</th><th>Block threshold</th><th>Status</th></tr></thead><tbody>{filtered.map(s => {
          const low = s.walletExists && Number(s.spendablePaise || 0) <= Number(s.orderBlockThresholdPaise || 0)
          return <tr key={s.id}><td><strong>{s.name}</strong><small>{s.slug}</small></td><td><span className="ecw-tag">{s.approval_status || '—'}</span></td><td>{money(s.balancePaise)}</td><td>{money(s.pendingFeePaise)}</td><td className={low ? 'ecw-danger-text' : 'ecw-good-text'}>{money(s.spendablePaise)}</td><td>{money(s.platformFeePaise)}</td><td>{money(s.orderBlockThresholdPaise)}</td><td><span className={`ecw-status ${!s.walletExists ? 'missing' : low ? 'low' : 'ready'}`}>{!s.walletExists ? 'Missing' : low ? 'Low balance' : 'Ready'}</span></td></tr>
        })}</tbody></table></div>}
        <p className="ecw-footnote">Spendable balance = balance minus pending fees. This screen displays backend values; it does not deduct fees, top up wallets or modify order eligibility.</p>
      </section>
    </main>
  )
}