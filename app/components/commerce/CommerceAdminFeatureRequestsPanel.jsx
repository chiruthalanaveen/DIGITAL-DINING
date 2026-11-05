'use client'

import { useEffect, useRef, useState } from 'react'
import './commerce-feature-requests.css'

const endpoint = '/api/commerce/admin/feature-requests'
const transitions = { submitted: ['under_review', 'approved', 'rejected'], under_review: ['approved', 'rejected'], approved: ['assigned'] }
const words = value => String(value || '').replaceAll('_', ' ')
const date = value => new Date(value).toLocaleString('en-IN')

async function request(path, { body, signal } = {}) {
  const response = await fetch(path, { method: body ? 'POST' : 'GET', credentials: 'same-origin', cache: 'no-store', signal, headers: body ? { 'Content-Type': 'application/json' } : {}, ...(body ? { body: JSON.stringify(body) } : {}) })
  const result = await response.json().catch(() => ({}))
  if (!response.ok || result.success !== true) {
    const error = new Error(result.message || 'Feature requests could not be loaded. Please retry.')
    error.status = response.status
    throw error
  }
  return result
}

function Requests({ websites }) {
  const [data, setData] = useState(null)
  const [detail, setDetail] = useState(null)
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [pending, setPending] = useState(null)
  const [conflict, setConflict] = useState(false)
  const [draft, setDraft] = useState({ status: '', note: '', assignment_reference: '' })
  const [refresh, setRefresh] = useState(0)
  const alive = useRef(false)
  const sequence = useRef(0)
  const busy = useRef(true)
  const controller = useRef(null)
  const selected = useRef(null)
  const detailHeading = useRef(null)
  const listHeading = useRef(null)
  const focusDetail = useRef(false)
  const current = value => alive.current && sequence.current === value

  useEffect(() => {
    alive.current = true
    return () => { alive.current = false; sequence.current += 1; controller.current?.abort() }
  }, [])

  useEffect(() => {
    const cancellation = new AbortController()
    controller.current = cancellation
    const version = ++sequence.current
    busy.current = true
    Promise.resolve().then(async () => {
      if (!current(version)) return
      setLoading(true); setError(''); setNotice('')
      try {
        const result = await request(endpoint, { signal: cancellation.signal })
        if (current(version) && !cancellation.signal.aborted) setData(result)
      } catch (failure) {
        if (current(version) && !cancellation.signal.aborted) setError(failure.message)
      } finally {
        if (current(version) && !cancellation.signal.aborted) { busy.current = false; setLoading(false) }
      }
    })
    return () => cancellation.abort()
  }, [refresh])

  useEffect(() => {
    if (!detail || !focusDetail.current) return
    focusDetail.current = false
    detailHeading.current?.focus({ preventScroll: true })
  }, [detail])

  function refreshList() {
    if (busy.current || pending) return
    busy.current = true
    selected.current = null; setDetail(null); setConflict(false); setRefresh(value => value + 1)
  }

  async function loadMore() {
    if (busy.current || pending || !data?.next_cursor) return
    busy.current = true; setWorking(true); setError('')
    const version = ++sequence.current
    const cancellation = new AbortController()
    controller.current?.abort(); controller.current = cancellation
    try {
      const query = new URLSearchParams({ before_created_at: data.next_cursor.created_at, before_id: data.next_cursor.id })
      const result = await request(`${endpoint}?${query}`, { signal: cancellation.signal })
      if (!current(version) || cancellation.signal.aborted) return
      if (!result.available) throw new Error('Feature requests are currently unavailable. Refresh before continuing.')
      setData(previous => ({ ...result, requests: [...new Map([...previous.requests, ...result.requests].map(row => [row.id, row])).values()] }))
    } catch (failure) { if (current(version) && !cancellation.signal.aborted) setError(failure.message) }
    finally { if (current(version) && !cancellation.signal.aborted) { busy.current = false; setWorking(false) } }
  }

  async function open(row, focus = true) {
    if (busy.current || pending) return
    busy.current = true; setWorking(true); setError(''); setNotice(''); setDetail(null)
    const version = ++sequence.current
    selected.current = `${row.website_id}:${row.id}`
    const cancellation = new AbortController()
    controller.current?.abort(); controller.current = cancellation
    try {
      const query = new URLSearchParams({ website_id: row.website_id, request_id: row.id })
      const result = await request(`${endpoint}?${query}`, { signal: cancellation.signal })
      if (!current(version) || cancellation.signal.aborted) return
      if (!result.available || !result.request) throw new Error('This request could not be checked. Refresh the queue before continuing.')
      if (result.request.id !== row.id || result.request.website_id !== row.website_id) throw new Error('This request could not be verified for the selected website.')
      setDetail(result); setConflict(false)
      setDraft({ status: transitions[result.request.status]?.[0] || '', note: '', assignment_reference: '' })
      setData(previous => previous?.available ? { ...previous, requests: previous.requests.map(item => item.id === result.request.id ? result.request : item) } : previous)
      focusDetail.current = focus
    } catch (failure) { if (current(version) && !cancellation.signal.aborted) setError(failure.message) }
    finally { if (current(version) && !cancellation.signal.aborted) { busy.current = false; setWorking(false) } }
  }

  async function review(event) {
    event.preventDefault()
    if (busy.current || !detail?.request || conflict) return
    const row = detail.request
    const operation = pending || { website_id: row.website_id, action: 'review', payload: { request_id: row.id, expected_status: row.status, expected_revision: row.revision, status: draft.status, note: draft.note.trim(), assignment_reference: draft.status === 'assigned' ? draft.assignment_reference.trim() : '', action_key: crypto.randomUUID() } }
    if (!pending && (!transitions[row.status]?.includes(operation.payload.status) || !operation.payload.note || operation.payload.note.length > 2000 || operation.payload.status === 'assigned' && !operation.payload.assignment_reference)) { setError('Choose an available decision and add its review note. Assignment also needs a work reference.'); return }
    busy.current = true; setWorking(true); setError(''); setNotice(''); setPending(operation)
    const version = ++sequence.current
    const selection = selected.current
    const cancellation = new AbortController()
    controller.current?.abort(); controller.current = cancellation
    try {
      const result = await request(endpoint, { body: operation, signal: cancellation.signal })
      if (!current(version) || cancellation.signal.aborted || selected.current !== selection) return
      const evidence = result.action_event
      if (!result.available || result.request?.id !== row.id || result.request?.website_id !== row.website_id || evidence?.request_id !== row.id || evidence?.revision !== operation.payload.expected_revision + 1 || evidence?.from_status !== operation.payload.expected_status || evidence?.to_status !== operation.payload.status || evidence?.note !== operation.payload.note || evidence?.assignment_reference !== operation.payload.assignment_reference) throw new Error('The saved decision could not be confirmed. Retry this same decision to check its result.')
      // An identical retry can return a later current state and the original
      // immutable action event. Never rewind the current record to our draft.
      setDetail(result); setPending(null); setConflict(false)
      setDraft({ status: transitions[result.request.status]?.[0] || '', note: '', assignment_reference: '' })
      setData(previous => ({ ...previous, requests: previous.requests.map(item => item.id === result.request.id ? result.request : item) }))
      setNotice('Request review recorded. Features and permissions are unchanged.')
    } catch (failure) {
      if (!current(version) || cancellation.signal.aborted || selected.current !== selection) return
      if (failure.status === 409) { setPending(null); setConflict(true); setError('This request changed or the decision conflicts with its history. Refresh this request before making another decision.') }
      else setError(`${failure.message} Keep this view open and retry the same decision to confirm its outcome.`)
    } finally { if (current(version) && !cancellation.signal.aborted) { busy.current = false; setWorking(false) } }
  }

  const row = detail?.request
  const choices = row ? transitions[row.status] || [] : []
  const locked = working || Boolean(pending)
  const websiteName = websiteId => websites.find(website => website.id === websiteId)?.name || `Website ${websiteId.slice(0, 8)}`
  return <section className="cfr-panel cfr-admin-panel" aria-labelledby="cfr-admin-title" aria-busy={loading || working}>
    <div className="cfr-heading"><div><h2 id="cfr-admin-title" ref={listHeading} tabIndex={-1}>Owner feature requests</h2><p>Review requirements from client websites and track decisions in their request history.</p></div><button className="ac-button ac-secondary" type="button" disabled={loading || locked} onClick={refreshList}>Refresh feature requests</button></div>
    {error && <p className="ac-feedback ac-error" role="alert">{error}</p>}{notice && <p className="ac-feedback ac-success" role="status">{notice}</p>}
    {loading ? <p role="status">Loading owner feature requests…</p> : data?.available === false ? <p>Feature requests are unavailable until the reviewed database capability is installed.</p> : data?.available === true ? <>
      <p className="cfr-note">Approval records a review decision. Assignment queues a separate development task; it does not mean work is released or a feature is enabled.</p>
      {!data.requests.length && <p>No owner feature requests yet.</p>}
      <ul className="cfr-list" aria-label="Owner feature request queue">{data.requests.map(item => <li className="cfr-list-item" key={item.id}><div><span className="cfr-status">{words(item.status)}</span><h3>{item.title}</h3><p>{websiteName(item.website_id)} · <time dateTime={item.created_at}>{date(item.created_at)}</time></p></div><button className="ac-button ac-secondary" type="button" disabled={locked} onClick={() => void open(item)}>Review request {item.title}</button></li>)}</ul>
      {data.has_more && <button className="ac-button ac-secondary" type="button" disabled={locked} onClick={() => void loadMore()}>Load more feature requests</button>}
    </> : !error && <button className="ac-button ac-secondary" type="button" onClick={refreshList}>Retry feature requests</button>}
    {row && <section className="cfr-detail" aria-labelledby="cfr-admin-detail-title"><div className="cfr-heading"><div><p>{websiteName(row.website_id)} · {words(row.status)}</p><h3 id="cfr-admin-detail-title" tabIndex={-1} ref={detailHeading}>{row.title}</h3></div><button className="ac-button ac-secondary" type="button" disabled={locked} onClick={() => void open(row, false)}>Refresh request</button></div><p className="cfr-description">{row.description}</p><p>Request reference: <code>{row.id}</code></p>
      <ol className="cfr-timeline" aria-label={`Request history for ${row.title}`}>{detail.events.map(item => <li key={item.id}><strong>{words(item.to_status)}</strong><time dateTime={item.created_at}>{date(item.created_at)}</time><span>{item.actor_kind === 'admin' ? 'Platform team' : 'Website owner'}</span>{item.note && <p>{item.note}</p>}{item.assignment_reference && <p>Work reference: <span>{item.assignment_reference}</span></p>}</li>)}</ol>
      {!!choices.length && <form className="cfr-form" onSubmit={review}><h4>Record a review decision</h4><fieldset disabled={locked || conflict}><label>Decision<select aria-label="Decision" value={draft.status} onChange={event => setDraft(previous => ({ ...previous, status: event.target.value, assignment_reference: '' }))}>{choices.map(status => <option key={status} value={status}>{words(status)}</option>)}</select></label><label>Review note<textarea aria-label="Review note" required minLength={1} maxLength={2000} value={draft.note} onChange={event => setDraft(previous => ({ ...previous, note: event.target.value }))} /></label>{draft.status === 'assigned' && <label>Development work reference<input required minLength={1} maxLength={160} value={draft.assignment_reference} onChange={event => setDraft(previous => ({ ...previous, assignment_reference: event.target.value }))} /></label>}</fieldset>{pending && <p role="status">This decision needs confirmation. Retry its original contents before making another decision. If you reopen this view, refresh the request history first.</p>}<button className="ac-button" type="submit" disabled={working || conflict}>{working ? 'Saving decision…' : pending ? 'Retry same decision' : 'Save review decision'}</button></form>}
      {!choices.length && <p>{row.status === 'assigned' ? 'Assigned for a separately controlled development task. Release and activation are confirmed separately.' : 'This request is closed.'}</p>}
    </section>}
  </section>
}

export default function CommerceAdminFeatureRequestsPanel({ websites = [] }) {
  const [open, setOpen] = useState(false)
  return <details className="cfr-admin" onToggle={event => setOpen(event.currentTarget.open)}><summary>Owner feature requests</summary>{open && <Requests websites={websites} />}</details>
}
