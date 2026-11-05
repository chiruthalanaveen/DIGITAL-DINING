'use client'

import { useEffect, useRef, useState } from 'react'
import { commerceFetch } from '@/lib/commerce/client'
import './commerce-domains.css'

const actionMessages = {
  provision: 'Domain registration completed. Review the remaining ownership and connection checks below.',
  verify: 'Ownership verification requested. Review the updated checks below.',
  check: 'Domain checks refreshed.', activate: 'Domain activated.', deactivate: 'Domain deactivated.',
}
const checked = value => value ? 'Passed' : 'Pending'

export default function CommerceAdminDomainsPanel({ website, readOnly = false }) {
  const [snapshot, setSnapshot] = useState(null)
  const [feedback, setFeedback] = useState(null)
  const [busy, setBusy] = useState(false)
  const pending = useRef(false)
  const websiteId = website.id
  const path = `/api/commerce/admin/domains?website_id=${websiteId}`
  const data = snapshot?.websiteId === websiteId ? snapshot.data : null
  const message = feedback?.websiteId === websiteId ? feedback : null

  useEffect(() => {
    const controller = new AbortController()
    // No browser Supabase client or owner token: the signed Admin cookie authorizes this route.
    commerceFetch(path, { signal: controller.signal }).then(data => {
      if (!controller.signal.aborted) setSnapshot({ websiteId, data })
    }).catch(error => {
      if (!controller.signal.aborted) setFeedback({ websiteId, error: error.message })
    })
    return () => controller.abort()
  }, [path, websiteId])

  async function refresh() {
    if (pending.current) return
    pending.current = true; setBusy(true); setFeedback(null)
    try { setSnapshot({ websiteId, data: await commerceFetch(path) }) }
    catch (error) { setFeedback({ websiteId, error: error.message }) }
    finally { pending.current = false; setBusy(false) }
  }

  async function action(action, id) {
    if (pending.current || readOnly || !data) return
    pending.current = true; setBusy(true); setFeedback(null)
    try {
      const result = await commerceFetch('/api/commerce/admin/domains', { method: 'POST', body: { website_id: websiteId, action, payload: { id } } })
      setSnapshot({ websiteId, data: result })
      setFeedback({ websiteId, notice: actionMessages[action] })
    } catch (error) {
      setFeedback({ websiteId, error: `${error.message} Refresh checks before retrying an uncertain change.` })
      // Failed checks can deactivate a domain, so replace the displayed state when possible.
      try { setSnapshot({ websiteId, data: await commerceFetch(path) }) } catch { /* Preserve the original actionable error. */ }
    } finally { pending.current = false; setBusy(false) }
  }

  const checksReady = data?.enabled === true && data?.provider_configured === true
  const registrationReady = checksReady && data?.provisioning_enabled === true
  return <section className="ac-editor cad-panel" aria-label="Domain administration" aria-busy={busy}>
    <div className="ac-panel-heading"><div><h2>Store domains</h2><p className="ac-muted">Review and connect domains claimed for {website.name}.</p></div><button className="ac-button ac-secondary" disabled={busy} onClick={() => void refresh()}>Refresh status</button></div>
    {message?.error && <p className="ac-feedback ac-error" role="alert">{message.error}</p>}
    {message?.notice && <p className="ac-feedback ac-success" role="status">{message.notice}</p>}
    {!data && !message?.error && <p className="ac-loading" role="status">Loading domain status…</p>}
    {data && <>
      {!data.enabled && <p className="ac-warning">Custom domains are disabled. Existing connections can be deactivated; connecting new domains requires platform activation.</p>}
      {data.enabled && !data.provider_configured && <p className="ac-warning">Domain connection credentials are incomplete. Configure the approved hosting project before running checks.</p>}
      {checksReady && !data.provisioning_enabled && <p className="ac-management-note">Registration and ownership verification are disabled pending separate approval. Status checks and verified activation remain available.</p>}
      <p className="ac-muted">Register reserves the domain with the hosting project. After the owner adds the displayed DNS records, verify ownership and check the connection. Activate connects only a domain with passing ownership, Production deployment and certificate checks.</p>
      <div className="cad-list">{data.domains?.map(domain => <article key={domain.id} className="cad-domain">
        <div className="cad-heading"><h3>{domain.hostname}</h3><span className={`ac-status ac-status-${domain.status}`}>{domain.status}</span></div>
        <dl className="ac-details"><div><dt>Ownership</dt><dd>{checked(domain.ownership_verified)}</dd></div><div><dt>Production connection</dt><dd>{checked(domain.deployment_verified)}</dd></div><div><dt>HTTPS certificate</dt><dd>{checked(domain.tls_verified)}</dd></div><div><dt>Last checked</dt><dd>{domain.last_checked_at ? <time dateTime={domain.last_checked_at}>{new Date(domain.last_checked_at).toLocaleString()}</time> : 'Not checked'}</dd></div></dl>
        {domain.status !== 'released' && domain.verification?.length > 0 && <details><summary>Owner DNS instructions</summary><p className="ac-muted">Share these records privately with the owner. Preserve existing mail and other DNS records.</p><dl className="cad-proof">{domain.verification.map((proof, index) => <div key={`${proof.domain}-${index}`}><dt>{proof.type} · {proof.domain}</dt><dd><code>{proof.value}</code></dd></div>)}</dl></details>}
        {domain.status !== 'released' && <div className="ac-actions cad-actions">
          <button className="ac-button ac-secondary" disabled={readOnly || busy || !registrationReady || domain.status === 'active'} onClick={() => void action('provision', domain.id)}>Register domain</button>
          <button className="ac-button ac-secondary" disabled={readOnly || busy || !registrationReady} onClick={() => void action('verify', domain.id)}>Verify ownership</button>
          <button className="ac-button ac-secondary" disabled={readOnly || busy || !checksReady} onClick={() => void action('check', domain.id)}>Check connection</button>
          {domain.status === 'active' ? <button className="ac-button ac-secondary" disabled={readOnly || busy} onClick={() => void action('deactivate', domain.id)}>Deactivate domain</button> : <button className="ac-button" disabled={readOnly || busy || !checksReady || domain.status !== 'verified' || website.status !== 'active'} onClick={() => void action('activate', domain.id)}>Activate domain</button>}
        </div>}
        {website.status !== 'active' && domain.status !== 'released' && <p className="ac-muted">Activate the website before connecting its domain.</p>}
      </article>)}</div>
      {!data.domains?.length && <p className="ac-empty">No domains claimed for this website. The owner can claim a name when custom domains are enabled.</p>}
    </>}
  </section>
}

export { CommerceAdminDomainsPanel }
