import { actionEnvelope, adminActions } from '@/lib/server/commerce/validation'
import { adminContext, CommerceError, dataResult, parse, readJson, run } from '@/lib/server/commerce/core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  return run(async () => {
    const { client } = adminContext(request)
    const [websites, applications, memberships, audit_logs] = await Promise.all([
      dataResult(client.from('commerce_websites').select('*').order('created_at', { ascending: false }).limit(500)),
      dataResult(client.from('commerce_applications').select('*').order('created_at', { ascending: false }).limit(500)),
      dataResult(client.from('commerce_memberships').select('*').eq('active', true).limit(1000)),
      dataResult(client.from('commerce_audit_logs').select('*').order('created_at', { ascending: false }).limit(100)),
    ])
    return { websites: websites || [], applications: applications || [], memberships: memberships || [], audit_logs: audit_logs || [] }
  })
}

export async function POST(request) {
  return run(async () => {
    const { client, session } = adminContext(request, true)
    const { action, payload } = parse(actionEnvelope, await readJson(request))
    if (!Object.hasOwn(adminActions, action)) throw new CommerceError('Unsupported administrator action.')
    const result = await dataResult(client.rpc('commerce_admin_action', { p_action: action, p_payload: parse(adminActions[action], payload), p_actor_email: session.email }))
    const key = { create_website: 'website', save_website: 'website', assign_owner: 'membership', review_application: 'application' }[action]
    return key ? { [key]: result } : result
  })
}
