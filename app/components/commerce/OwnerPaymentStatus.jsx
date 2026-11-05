'use client'

import { useEffect, useState } from 'react'
import { commerceFetch } from '@/lib/commerce/client'

const labels = {
  unavailable: ['Status unavailable', 'Online payment configuration is unavailable for this website. Contact the platform team.'],
  not_configured: ['Not configured', 'A commerce merchant account has not been configured for this website.'],
  disabled: ['Checkout disabled', 'Online checkout is disabled by the current configuration.'],
  test: ['Provider test mode', 'Checkout is configured with provider test credentials. Test mode does not collect real payments.'],
  available: ['Checkout configured', 'Live-mode checkout is enabled in the saved configuration.'],
}
const reasons = {
  platform_disabled: 'Platform online checkout is disabled.',
  merchant_disabled: 'Merchant checkout is disabled for this website.',
  live_mode_not_allowed: 'Live-mode checkout is not permitted by the platform.',
  store_unavailable: 'This website is not currently configured to accept orders.',
}

export function OwnerPaymentStatusDetails({ result }) {
  const readiness = result?.readiness
  const rollout = result?.rollout
  const known = result && Object.hasOwn(labels, result.status) && typeof result.available === 'boolean' && typeof rollout?.enabled === 'boolean' && typeof rollout?.live_allowed === 'boolean'
    && (result.status === 'unavailable' ? result.available === false && readiness === null : result.available === true && typeof readiness?.configured === 'boolean' && typeof readiness?.merchant_enabled === 'boolean' && (readiness.configured ? ['test', 'live'].includes(readiness.mode) : readiness.merchant_enabled === false && readiness.mode === null))
  const consistent = known && (result.status === 'unavailable' ? result.blocked_reason === null
    : result.status === 'not_configured' ? readiness.configured === false && result.blocked_reason === null
      : result.status === 'disabled' ? readiness.configured === true && Object.hasOwn(reasons, result.blocked_reason)
        : readiness.configured === true && readiness.merchant_enabled === true && rollout.enabled === true && result.blocked_reason === null && (result.status === 'test' ? readiness.mode === 'test' : readiness.mode === 'live' && rollout.live_allowed === true))
  if (!consistent) return <p className="co-message co-message-error" role="alert">Payment configuration status could not be verified. Refresh or contact the platform team.</p>
  const [title, description] = labels[result.status]
  return <><p role="status"><strong>{title}</strong> · {description}</p>{result.status === 'disabled' && reasons[result.blocked_reason] && <p>{reasons[result.blocked_reason]}</p>}{readiness && <dl className="co-detail-list"><div><dt>Merchant configuration</dt><dd>{readiness.configured ? 'Configured' : 'Not configured'}</dd></div><div><dt>Merchant checkout</dt><dd>{readiness.merchant_enabled ? 'Enabled in configuration' : 'Disabled in configuration'}</dd></div><div><dt>Credential mode</dt><dd>{readiness.mode === 'test' ? 'Test' : readiness.mode === 'live' ? 'Live' : 'Not configured'}</dd></div><div><dt>Platform checkout</dt><dd>{rollout.enabled ? 'Enabled in configuration' : 'Disabled'}</dd></div><div><dt>Live mode permitted</dt><dd>{rollout.live_allowed ? 'Yes' : 'No'}</dd></div></dl>}<p className="co-form-note">Configuration status only. This view does not verify provider connectivity, payment capture or settlement. Super Admin manages merchant settings and activation.</p></>
}

function PaymentStatus({ website, client }) {
  const [record, setRecord] = useState(null)
  const [revision, setRevision] = useState(0)
  const endpoint = `/api/commerce/workspace/${encodeURIComponent(website.id)}/payments`
  const current = record?.client === client && record.revision === revision ? record : null
  useEffect(() => {
    const controller = new AbortController()
    commerceFetch(endpoint, { client, signal: controller.signal }).then(result => {
      if (!controller.signal.aborted) setRecord({ client, revision, result })
    }).catch(error => {
      if (!controller.signal.aborted) setRecord({ client, revision, error: error.message || 'Payment configuration status could not be loaded.' })
    })
    return () => controller.abort()
  }, [client, endpoint, revision])
  return <section aria-labelledby={`owner-payment-status-${website.id}`}><div className="co-panel-title" style={{ flexWrap: 'wrap' }}><div><h3 id={`owner-payment-status-${website.id}`}>Online payment configuration</h3><p>Read-only status for {website.name}.</p></div><button className="co-button co-button-outline co-button-small" type="button" disabled={!current} onClick={() => setRevision(value => value + 1)}>Refresh payment status</button></div>{!current ? <p role="status">Loading payment status…</p> : current.error ? <p className="co-message co-message-error" role="alert">{current.error} Refresh to check the current configuration.</p> : <OwnerPaymentStatusDetails result={current.result} />}</section>
}

export default function OwnerPaymentStatus(props) {
  return <PaymentStatus key={props.website.id} {...props} />
}
