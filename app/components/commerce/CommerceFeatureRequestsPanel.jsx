'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { commerceFetch } from '@/lib/commerce/client'
import './commerce-feature-requests.css'

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const label = value => value === 'assigned' ? 'Assigned for development' : String(value || '').replaceAll('_', ' ')
const date = value => new Date(value).toLocaleString('en-IN')

function storedSubmission(key) {
  let raw, value
  try { raw = sessionStorage.getItem(key); if (raw === null) return null; value = JSON.parse(raw) }
  catch { throw new Error('Your saved feature request could not be accessed. Allow browser storage or contact the platform team before submitting another request.') }
  if (!value || !uuid.test(value.submission_key || '') || typeof value.title !== 'string' || Array.from(value.title.trim()).length < 5 || value.title.length > 180 || typeof value.description !== 'string' || Array.from(value.description.trim()).length < 10 || value.description.length > 6000) throw new Error('The saved feature request could not be checked. Keep this tab and contact the platform team before submitting another request.')
  return { submission_key: value.submission_key, title: value.title, description: value.description }
}

function sameSubmission(left, right) {
  return left?.submission_key === right?.submission_key && left?.title === right?.title && left?.description === right?.description
}

function OwnerFeatureRequests({ website, client, session, readOnly }) {
  const userId = session.user.id
  const storageKey = `commerce-feature-request:${website.id}:${userId}`
  const path = `/api/commerce/workspace/${website.id}/feature-requests`
  const [data, setData] = useState(null)
  const [detail, setDetail] = useState(null)
  const [draft, setDraft] = useState({ title: '', description: '' })
  const [pending, setPending] = useState(null)
  const [storageReady, setStorageReady] = useState(false)
  const [storageError, setStorageError] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [accountChanged, setAccountChanged] = useState(false)
  const mounted = useRef(false)
  const scope = useRef(0)
  const sequence = useRef(0)
  const inFlight = useRef(false)
  const pendingRef = useRef(null)
  const abortRef = useRef(null)
  const detailHeading = useRef(null)
  const focusDetail = useRef(false)
  const validScope = useCallback(version => mounted.current && scope.current === version, [])
  const current = useCallback((version, request) => validScope(version) && sequence.current === request, [validScope])
  const boundClient = useMemo(() => ({ auth: { getSession: async () => {
    const version = scope.current
    const result = await client.auth.getSession()
    if (!validScope(version) || result.data?.session?.user?.id !== userId || !result.data.session.user.email_confirmed_at) throw new Error('Your owner account changed. Refresh the workspace before continuing.')
    return result
  } } }), [client, userId, validScope])

  const loadList = useCallback(async (cursor = null) => {
    if (inFlight.current) return
    inFlight.current = true
    const version = scope.current, request = ++sequence.current
    const controller = new AbortController()
    abortRef.current?.abort(); abortRef.current = controller
    setBusy(true); setLoading(true); setError('')
    if (!cursor) { setDetail(null); setNotice('') }
    try {
      const query = cursor ? `?${new URLSearchParams({ before_created_at: cursor.created_at, before_id: cursor.id })}` : ''
      const result = await commerceFetch(path + query, { client: boundClient, signal: controller.signal })
      if (!current(version, request)) return
      if (result.website_id !== website.id) throw new Error('The request list did not match this website. Please refresh.')
      setData(previous => cursor && result.available ? { ...result, requests: [...new Map([...(previous?.requests || []), ...result.requests].map(row => [row.id, row])).values()] } : result)
    } catch (failure) { if (current(version, request) && !controller.signal.aborted) setError(failure.message || 'Unable to load feature requests.') }
    finally { if (current(version, request)) { inFlight.current = false; setBusy(false); setLoading(false) } }
  }, [boundClient, current, path, website.id])

  useEffect(() => {
    mounted.current = true
    const subscription = client.auth.onAuthStateChange((_event, next) => {
      if (!mounted.current || next?.user?.id === userId && next.user.email_confirmed_at) return
      scope.current += 1; sequence.current += 1; abortRef.current?.abort()
      inFlight.current = false; setAccountChanged(true); setData(null); setDetail(null); setError(''); setNotice(''); setBusy(false); setLoading(false)
    }).data.subscription
    Promise.resolve().then(() => {
      if (!mounted.current) return
      try {
        const saved = storedSubmission(storageKey)
        pendingRef.current = saved
        setPending(saved)
        if (saved) setDraft({ title: saved.title, description: saved.description })
      } catch (failure) { setStorageError(failure.message || 'Browser storage is unavailable. Allow storage before submitting a request.') }
      setStorageReady(true)
      void loadList()
    })
    return () => { mounted.current = false; scope.current += 1; sequence.current += 1; abortRef.current?.abort(); subscription.unsubscribe() }
  }, [client, loadList, storageKey, userId])

  useEffect(() => {
    if (!detail || !focusDetail.current) return
    focusDetail.current = false
    detailHeading.current?.focus({ preventScroll: true })
  }, [detail])

  async function openRequest(id) {
    if (inFlight.current) return
    inFlight.current = true
    const version = scope.current, request = ++sequence.current
    const controller = new AbortController()
    abortRef.current?.abort(); abortRef.current = controller
    setBusy(true); setError(''); setNotice('')
    try {
      const result = await commerceFetch(`${path}?request_id=${encodeURIComponent(id)}`, { client: boundClient, signal: controller.signal })
      if (!current(version, request)) return
      if (!result.available) throw new Error('Feature request details are not available right now.')
      if (result.website_id !== website.id || result.request?.website_id !== website.id || result.request.id !== id) throw new Error('The request did not match this website. Please refresh.')
      focusDetail.current = true; setDetail(result)
      setData(previous => previous?.available ? { ...previous, requests: previous.requests.map(row => row.id === result.request.id ? result.request : row) } : previous)
    } catch (failure) { if (current(version, request) && !controller.signal.aborted) setError(failure.message || 'Unable to open this feature request.') }
    finally { if (current(version, request)) { inFlight.current = false; setBusy(false) } }
  }

  async function submit(event) {
    event.preventDefault()
    if (inFlight.current || readOnly && !pendingRef.current || !storageReady || storageError || data?.available !== true) return
    const payload = pendingRef.current || { submission_key: crypto.randomUUID(), title: draft.title.trim(), description: draft.description.trim() }
    if (Array.from(payload.title).length < 5 || payload.title.length > 180 || Array.from(payload.description).length < 10 || payload.description.length > 6000) { setError('Use 5–180 characters for the title and 10–6000 for the description.'); return }
    inFlight.current = true
    const version = scope.current, request = ++sequence.current
    const controller = new AbortController()
    abortRef.current?.abort(); abortRef.current = controller
    setBusy(true); setError(''); setNotice('')
    try {
      const saved = storedSubmission(storageKey)
      if (saved && !sameSubmission(saved, payload)) throw new Error('A different request is saved in this tab. Refresh before continuing.')
      try { sessionStorage.setItem(storageKey, JSON.stringify(payload)) }
      catch { throw new Error('Your request could not be saved in this browser. Allow browser storage and retry before continuing.') }
      pendingRef.current = payload; setPending(payload); setDraft({ title: payload.title, description: payload.description })
      const result = await commerceFetch(path, { client: boundClient, method: 'POST', body: { action: 'submit', payload }, signal: controller.signal })
      if (!current(version, request)) return
      const row = result.request
      if (!result.available || result.website_id !== website.id || row?.website_id !== website.id || !uuid.test(row.id || '') || row.title !== payload.title || row.description !== payload.description || !Array.isArray(result.events) || typeof result.replayed !== 'boolean') throw new Error('The original request could not be confirmed. Retry this saved request before submitting another.')
      const latest = storedSubmission(storageKey)
      if (latest && !sameSubmission(latest, payload)) throw new Error('The saved request changed. Refresh before continuing.')
      sessionStorage.removeItem(storageKey)
      pendingRef.current = null; setPending(null); setDraft({ title: '', description: '' })
      setData(previous => ({ ...previous, requests: [...new Map([...(previous?.requests || []), row].map(item => [item.id, item])).values()].sort((left, right) => right.created_at.localeCompare(left.created_at) || right.id.localeCompare(left.id)) }))
      focusDetail.current = true; setDetail(result)
      setNotice(result.replayed ? 'Your original feature request is confirmed.' : 'Feature request submitted for review.')
    } catch (failure) { if (current(version, request) && !controller.signal.aborted) setError(`${failure.message || 'Unable to confirm this request.'}${pendingRef.current ? ' Retry this saved request with the same details.' : ''}`) }
    finally { if (current(version, request)) { inFlight.current = false; setBusy(false) } }
  }

  if (accountChanged) return <section className="co-card cfr-panel"><h2>Feature requests</h2><p role="status">Your owner account changed. Refresh the workspace to view its feature requests.</p></section>
  const locked = Boolean(pending)
  const unavailable = data?.available === false
  return <section className="co-card cfr-panel" aria-label="Website feature requests">
    <div className="co-panel-title"><div><h2>Feature requests</h2><p>Ask the platform team for a change to {website.name} and follow its review.</p></div><button type="button" className="co-button co-button-outline co-button-small" disabled={busy} onClick={() => void loadList()}>Refresh feature requests</button></div>
    <p className="co-form-note">Approval records a review decision. Feature settings, access permissions and any development release are handled separately.</p>
    {error && <p className="co-message co-message-error" role="alert">{error}</p>}{notice && <p className="co-message co-message-success" role="status">{notice}</p>}
    {loading && <p role="status">Loading feature requests…</p>}
    {unavailable && <p className="co-message co-message-info" role="status">Feature requests are not available for this website yet.</p>}
    {storageError && <p className="co-message co-message-error" role="alert">{storageError}</p>}
    {!storageReady && <p role="status">Checking your saved request…</p>}
    {pending && <p className="co-message co-message-info" role="status">This request is saved until its result is confirmed. Retry the same request before submitting another; keep this tab if you need help.</p>}
    <form className="co-form cfr-form" onSubmit={submit}>
      <fieldset disabled={busy || readOnly && !locked || unavailable || data?.available !== true || !storageReady || Boolean(storageError)}><legend>New feature request</legend><label>Request title<input required minLength={5} maxLength={180} value={draft.title} readOnly={locked} onChange={event => setDraft(value => ({ ...value, title: event.target.value }))} /></label><label>Describe the change<textarea aria-label="Describe the change" required minLength={10} maxLength={6000} rows={5} value={draft.description} readOnly={locked} onChange={event => setDraft(value => ({ ...value, description: event.target.value }))} /></label><p className="co-form-note">Describe the business need. Do not include passwords, payment keys or customer records.</p><button className="co-button co-button-primary" type="submit">{busy ? 'Checking request…' : pending ? 'Retry this request' : 'Send feature request'}</button></fieldset>
    </form>
    {readOnly && <p className="co-form-note">New requests are paused while this website is {label(website.status)}. Existing requests remain visible.</p>}
    {data?.available && <section className="cfr-list" aria-label="Submitted feature requests"><h3>Your requests</h3>{!loading && !error && !data.requests.length && <p>No feature requests yet.</p>}<ul>{data.requests.map(row => <li key={row.id}><div><strong>{row.title}</strong><p>{label(row.status)} · Submitted {date(row.created_at)}</p></div><button type="button" className="co-button co-button-outline co-button-small" disabled={busy} aria-label={`View request ${row.title}`} onClick={() => void openRequest(row.id)}>View request</button></li>)}</ul>{data.has_more && <button type="button" className="co-button co-button-outline" disabled={busy} onClick={() => void loadList(data.next_cursor)}>Load more requests</button>}</section>}
    {detail && <section className="cfr-detail" aria-label="Feature request details"><div className="co-panel-title"><h3 tabIndex={-1} ref={detailHeading}>{detail.request.title}</h3><button type="button" className="co-button co-button-outline co-button-small" disabled={busy} onClick={() => void openRequest(detail.request.id)}>Refresh request</button></div><p className="cfr-status">{label(detail.request.status)}</p><p className="cfr-copy">{detail.request.description}</p><p className="co-form-note">Request reference: <code>{detail.request.id}</code></p>{detail.request.assignment_reference && <p>Development reference: <span className="cfr-copy">{detail.request.assignment_reference}</span></p>}<ol className="cfr-timeline" aria-label="Feature request timeline">{detail.events.map(item => <li key={item.id}><strong>{label(item.to_status)}</strong><p>{item.actor_kind === 'admin' ? 'Platform team' : 'Owner'} · <time dateTime={item.created_at}>{date(item.created_at)}</time></p>{item.note && <p className="cfr-copy">{item.note}</p>}{item.assignment_reference && <p className="cfr-copy">Development reference: {item.assignment_reference}</p>}</li>)}</ol></section>}
  </section>
}

export default function CommerceFeatureRequestsPanel(props) {
  if (!props.session?.user?.email_confirmed_at || !props.client) return null
  return <OwnerFeatureRequests key={`${props.website.id}:${props.session.user.id}`} {...props} />
}
