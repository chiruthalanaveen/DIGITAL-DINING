import { applicationSchema } from '@/lib/server/commerce/validation'
import { dataResult, parse, readJson, requireSameOrigin, run, userContext } from '@/lib/server/commerce/core'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request) {
  return run(async () => {
    const { client, user } = await userContext(request)
    const applications = await dataResult(client.from('commerce_applications').select('*').eq('applicant_user_id', user.id).order('created_at', { ascending: false }).limit(100))
    return { applications: applications || [] }
  })
}

export async function POST(request) {
  return run(async () => {
    requireSameOrigin(request)
    const { client } = await userContext(request)
    const payload = parse(applicationSchema, await readJson(request))
    const application = await dataResult(client.rpc('commerce_submit_application', { p_payload: payload }))
    return { application }
  }, 201)
}
