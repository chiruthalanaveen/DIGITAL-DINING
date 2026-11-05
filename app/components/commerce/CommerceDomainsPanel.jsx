'use client'

import { useEffect, useState } from 'react'
import { commerceFetch } from '@/lib/commerce/client'
import './commerce-domains.css'

export function CommerceDomainsPanel({ website, client, readOnly = false }) {
  const [data, setData] = useState(null)
  const [hostname, setHostname] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const path = !client && readOnly ? `/api/commerce/admin/domains?website_id=${website.id}` : `/api/commerce/workspace/${website.id}/domains`
  useEffect(() => {
    const controller = new AbortController()
    commerceFetch(path, { client, signal: controller.signal }).then(result => { setData(result); setError('') })
      .catch(error => { if (error.name !== 'AbortError') setError(error.message) })
    return () => controller.abort()
  }, [client, path])
  async function action(action, payload) {
    setBusy(true); setError('')
    try {
      await commerceFetch(path, { client, method: 'POST', body: { action, payload } })
      setData(await commerceFetch(path, { client }))
      setHostname(''); setLabel('')
    } catch (error) { setError(error.message) } finally { setBusy(false) }
  }
  return <section className="cd-panel" aria-label="Store domains">
    <div className="co-panel-title"><div><h2>Store domains</h2><p>Connect a domain you control to this website.</p></div></div>
    {error && <p className="co-message co-message-error" role="alert">{error}</p>}
    {!data && !error && <p role="status">Loading domains…</p>}
    {data && <>
      {!data.enabled && <p className="cd-notice" role="status">Custom domains are disabled pending platform activation. Your existing store link remains available.</p>}
      <p className="cd-note">Claiming a name keeps it reserved while Super Admin checks ownership, DNS, the Production deployment and its certificate. A pending claim does not connect your store.</p>
      <form className="cd-claim" onSubmit={event => { event.preventDefault(); void action('claim', { hostname }) }}>
        <label htmlFor={`domain-${website.id}`}>Your domain<input id={`domain-${website.id}`} required maxLength={253} placeholder="shop.yourbusiness.com" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={hostname} onChange={event => setHostname(event.target.value)} disabled={readOnly || busy || !data.enabled} /></label>
        <button className="co-button co-button-primary" disabled={readOnly || busy || !data.enabled}>Claim domain</button>
      </form>
      {data.generated_base ? <form className="cd-claim" onSubmit={event => { event.preventDefault(); void action('claim_generated', { label }) }}>
        <label htmlFor={`subdomain-${website.id}`}>Store subdomain<input id={`subdomain-${website.id}`} required maxLength={63} pattern="[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?" placeholder="your-store" value={label} onChange={event => setLabel(event.target.value.toLowerCase())} disabled={readOnly || busy || !data.enabled} /><span className="cd-note">.{data.generated_base} · base and wildcard DNS verified</span></label>
        <button className="co-button co-button-outline" disabled={readOnly || busy || !data.enabled}>Claim subdomain</button>
      </form> : <p className="cd-note">Generated store subdomains become available after the platform base and wildcard DNS are verified.</p>}
      <div className="cd-list">{data.domains?.map(domain => <article className="cd-domain" key={domain.id}>
        <div className="cd-domain-heading"><div><h3>{domain.hostname}</h3><span className={`cd-status cd-status-${domain.status}`}>{domain.status}</span></div>
          {domain.status !== 'released' && <button className="co-button co-button-danger co-button-small" disabled={readOnly || busy} onClick={() => void action('remove', { id: domain.id })}>Release domain</button>}
        </div>
        {domain.status === 'active' && <p>Your verified domain is connected to this store.</p>}
        {domain.status === 'verified' && <p>Provider checks passed. Super Admin activation is still required.</p>}
        {domain.status === 'pending' && <p>Awaiting verified configuration and Super Admin activation.</p>}
        {domain.status !== 'released' && domain.verification?.length > 0 && <details><summary>Ownership DNS instructions</summary><p>Add these records with your DNS provider, then ask Super Admin to recheck. Keep your existing mail and other records.</p><dl className="cd-proof">{domain.verification.map((proof, index) => <div key={`${proof.domain}-${index}`}><dt>{proof.type} · {proof.domain}</dt><dd><code>{proof.value}</code></dd></div>)}</dl></details>}
        {domain.last_checked_at && <p className="cd-note">Last checked: <time dateTime={domain.last_checked_at}>{new Date(domain.last_checked_at).toLocaleString()}</time></p>}
      </article>)}</div>
      {!data.domains?.length && <p className="co-table-empty">No domains claimed yet.</p>}
    </>}
  </section>
}

export default CommerceDomainsPanel
