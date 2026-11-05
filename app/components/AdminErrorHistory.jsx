'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'

// Expected secured backend: GET /api/admin/error-history?page=0&limit=30
// Response: { success: true, items: [...], count: number }
// This component never writes to the database or exposes service-role credentials.
const ENDPOINT = '/api/admin/error-history'
const PAGE_SIZE = 30

function dateText(value) {
  if (!value) return '—'
  const date = new Date(value)
  return Number.isNaN(date.getTime())
    ? '—'
    : date.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

function plain(value, fallback = '—') {
  if (value === null || value === undefined || value === '') return fallback
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

function normalize(row, index) {
  const metadata = row.metadata && typeof row.metadata === 'object' ? row.metadata : {}
  return {
    id: row.id ?? `${index}-${row.created_at ?? 'unknown'}`,
    time: row.created_at ?? row.occurred_at ?? row.timestamp ?? null,
    level: String(row.severity ?? row.level ?? metadata.severity ?? 'error').toLowerCase(),
    title: plain(row.message ?? row.error_message ?? row.title ?? metadata.message, 'Unspecified error'),
    source: plain(row.source ?? row.module ?? row.component ?? metadata.source, 'Unknown'),
    route: plain(row.path ?? row.route ?? row.url ?? metadata.path, '—'),
    actor: plain(row.actor_email ?? row.user_email ?? row.actor_name ?? metadata.actor_email, '—'),
    code: plain(row.error_code ?? row.code ?? metadata.code, '—'),
    stack: plain(row.stack ?? row.stack_trace ?? metadata.stack, ''),
    details: row,
  }
}

function ErrorDetails({ entry, onClose }) {
  if (!entry) return null
  return (
    <div style={styles.details} aria-label="Error details">
      <div style={styles.spaceBetween}>
        <h3 style={{ margin: 0, fontSize: 17 }}>Error details</h3>
        <button type="button" onClick={onClose} style={styles.button}>Close</button>
      </div>
      <p style={{ overflowWrap: 'anywhere', fontWeight: 600 }}>{entry.title}</p>
      <dl style={styles.definitionList}>
        <dt>Recorded</dt><dd>{dateText(entry.time)}</dd>
        <dt>Severity</dt><dd>{entry.level}</dd>
        <dt>Source</dt><dd>{entry.source}</dd>
        <dt>Route</dt><dd style={styles.breakWord}>{entry.route}</dd>
        <dt>Actor</dt><dd style={styles.breakWord}>{entry.actor}</dd>
        <dt>Code</dt><dd>{entry.code}</dd>
      </dl>
      {entry.stack ? <><h4>Stack trace</h4><pre style={styles.pre}>{entry.stack}</pre></> : null}
      <h4>Recorded fields</h4>
      <pre style={styles.pre}>{JSON.stringify(entry.details, null, 2)}</pre>
      <p style={styles.muted}>Error records may contain personal data. Share diagnostic details only with authorized staff.</p>
    </div>
  )
}

export default function AdminErrorHistory() {
  const [page, setPage] = useState(0)
  const [rows, setRows] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [severity, setSeverity] = useState('all')
  const [selected, setSelected] = useState(null)
  const [reload, setReload] = useState(0)

  const load = useCallback(async (signal) => {
    setLoading(true)
    setError('')
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) })
      const response = await fetch(`${ENDPOINT}?${params}`, {
        method: 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        headers: { Accept: 'application/json' },
        signal,
      })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data || data.success === false) {
        if (response.status === 404) {
          throw new Error('The error-history API is not installed. Add a secured GET /api/admin/error-history endpoint to load recorded errors.')
        }
        if (response.status === 401 || response.status === 403) {
          throw new Error('Access denied. Sign in as an authorized Super Admin to view error history.')
        }
        throw new Error(data?.message || data?.error || `Unable to load error history (HTTP ${response.status}).`)
      }
      const list = Array.isArray(data.items) ? data.items
        : Array.isArray(data.errors) ? data.errors
          : Array.isArray(data.records) ? data.records : null
      if (!list) throw new Error('The error-history API returned an unexpected response. Expected an items array.')
      if (signal.aborted) return
      setRows(list.map(normalize))
      setTotal(Number.isFinite(Number(data.count ?? data.total)) ? Number(data.count ?? data.total) : list.length)
    } catch (caught) {
      if (signal.aborted) return
      setRows([])
      setTotal(0)
      setError(caught?.message || 'Unable to load error history.')
    } finally {
      if (!signal.aborted) setLoading(false)
    }
  }, [page])

  useEffect(() => {
    const controller = new AbortController()
    load(controller.signal)
    return () => controller.abort()
  }, [load, reload])

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase()
    return rows.filter(row => {
      if (severity !== 'all' && row.level !== severity) return false
      if (!q) return true
      return [row.title, row.source, row.route, row.actor, row.code, row.level]
        .some(value => String(value).toLowerCase().includes(q))
    })
  }, [rows, search, severity])

  const lastPage = Math.max(0, Math.ceil(total / PAGE_SIZE) - 1)

  return (
    <section style={styles.root} aria-label="Admin error and crash history">
      <div style={styles.spaceBetween}>
        <div>
          <h2 style={{ margin: '0 0 5px', fontSize: 22 }}>Error &amp; Crash History</h2>
          <p style={{ ...styles.muted, margin: 0 }}>Review recorded application errors and investigate affected routes.</p>
        </div>
        <button type="button" style={styles.button} disabled={loading} onClick={() => { setSelected(null); setReload(n => n + 1) }}>
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      <div style={styles.toolbar}>
        <label style={styles.label}>
          Search loaded records
          <input style={styles.input} value={search} onChange={event => setSearch(event.target.value)} placeholder="Message, page, user, source…" />
        </label>
        <label style={styles.label}>
          Severity
          <select style={styles.input} value={severity} onChange={event => setSeverity(event.target.value)}>
            <option value="all">All severities</option>
            <option value="fatal">Fatal</option>
            <option value="critical">Critical</option>
            <option value="error">Error</option>
            <option value="warning">Warning</option>
            <option value="info">Info</option>
          </select>
        </label>
      </div>

      {error ? <div role="alert" style={styles.alert}>{error}</div> : null}
      <div style={styles.tableWrap}>
        <table style={styles.table}>
          <thead><tr>
            <th style={styles.th}>Time</th>
            <th style={styles.th}>Severity</th>
            <th style={styles.th}>Error</th>
            <th style={styles.th}>Source / Route</th>
            <th style={styles.th}>Details</th>
          </tr></thead>
          <tbody>
            {!loading && visible.map(row => (
              <tr key={row.id}>
                <td style={styles.td}>{dateText(row.time)}</td>
                <td style={styles.td}><span style={styles.level}>{row.level}</span></td>
                <td style={{ ...styles.td, maxWidth: 330, overflowWrap: 'anywhere' }}>{row.title}</td>
                <td style={{ ...styles.td, overflowWrap: 'anywhere' }}>{row.source}<div style={styles.muted}>{row.route}</div></td>
                <td style={styles.td}><button type="button" style={styles.button} onClick={() => setSelected(row)}>View</button></td>
              </tr>
            ))}
            {loading ? <tr><td style={styles.empty} colSpan={5}>Loading error records…</td></tr> : null}
            {!loading && visible.length === 0 ? <tr><td style={styles.empty} colSpan={5}>{error ? 'Error records could not be loaded.' : 'No matching errors on this page.'}</td></tr> : null}
          </tbody>
        </table>
      </div>

      <div style={styles.spaceBetween}>
        <small style={styles.muted}>{total} total records reported by server · Page {page + 1} of {Math.max(1, lastPage + 1)} · Search and severity filter apply to the current page only</small>
        <div style={{ display: 'flex', gap: 8 }}>
          <button style={styles.button} type="button" disabled={loading || page === 0} onClick={() => { setPage(n => Math.max(0, n - 1)); setSelected(null) }}>Previous</button>
          <button style={styles.button} type="button" disabled={loading || page >= lastPage} onClick={() => { setPage(n => n + 1); setSelected(null) }}>Next</button>
        </div>
      </div>
      <ErrorDetails entry={selected} onClose={() => setSelected(null)} />
    </section>
  )
}

const styles = {
  root: { display: 'grid', gap: 18, width: '100%', color: 'inherit' },
  spaceBetween: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 },
  toolbar: { display: 'flex', gap: 12, flexWrap: 'wrap' },
  label: { display: 'grid', gap: 6, flex: '1 1 210px', fontSize: 13, fontWeight: 600 },
  input: { width: '100%', boxSizing: 'border-box', border: '1px solid #cbd5e1', borderRadius: 9, padding: '10px 12px', background: '#fff', color: '#0f172a', fontSize: 14 },
  button: { border: '1px solid #cbd5e1', borderRadius: 9, background: '#fff', color: '#0f172a', padding: '9px 12px', fontSize: 13, cursor: 'pointer' },
  alert: { padding: 14, border: '1px solid #fecaca', background: '#fff1f2', borderRadius: 9, color: '#9f1239', overflowWrap: 'anywhere' },
  muted: { color: '#64748b', fontSize: 12 },
  tableWrap: { width: '100%', overflowX: 'auto', border: '1px solid #e2e8f0', borderRadius: 12 },
  table: { width: '100%', borderCollapse: 'collapse', minWidth: 690, fontSize: 13 },
  th: { padding: 12, textAlign: 'left', borderBottom: '1px solid #e2e8f0', background: '#f8fafc', color: '#334155' },
  td: { padding: 12, borderBottom: '1px solid #e2e8f0', verticalAlign: 'top' },
  level: { textTransform: 'capitalize', fontWeight: 700 },
  empty: { padding: 28, textAlign: 'center', color: '#64748b' },
  details: { padding: 18, border: '1px solid #cbd5e1', borderRadius: 12, display: 'grid', gap: 8 },
  definitionList: { display: 'grid', gridTemplateColumns: '100px minmax(0, 1fr)', gap: 10, fontSize: 13, margin: 0 },
  breakWord: { overflowWrap: 'anywhere', margin: 0 },
  pre: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', maxHeight: 360, overflowY: 'auto', padding: 12, background: '#0f172a', color: '#f8fafc', borderRadius: 9, fontSize: 12 },
}