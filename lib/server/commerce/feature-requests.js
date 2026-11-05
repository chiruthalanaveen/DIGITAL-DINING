import { z } from 'zod'
import { CommerceError, parse } from './core'
import { optionalCommerceRpc } from './expansion'
import { uuid } from './validation'

const identifier = uuid.transform(value => value.toLowerCase())
const timestamp = z.string().max(40).datetime({ offset: true }).refine(value => Number.isFinite(Date.parse(value)) && (value.match(/\.(\d+)/)?.[1]?.length || 0) <= 6)
const status = z.enum(['submitted', 'under_review', 'approved', 'rejected', 'assigned'])
const transitions = { submitted: ['under_review', 'approved', 'rejected'], under_review: ['approved', 'rejected'], approved: ['assigned'], rejected: [], assigned: [] }
const revisions = { submitted: [1], under_review: [2], approved: [2, 3], rejected: [2, 3], assigned: [3, 4] }
const note = z.string().trim().max(2000)
const reference = z.string().trim().max(160)
const cursor = z.object({ created_at: timestamp, id: identifier })
// Mutation inputs normalize surrounding whitespace. SQL and this Zod version
// measure string limits in Unicode code points, including non-BMP characters.
const requestTitle = z.string().trim().min(5).max(180).refine(value => [...value].length >= 5, 'Use at least five characters for the request title.')
const requestDescription = z.string().trim().min(10).max(6000).refine(value => [...value].length >= 10, 'Use at least ten characters to describe the request.')
// Stored rows can also originate from the authenticated SQL RPC. Match SQL's
// code-point limits, without trimming or rewriting immutable request/history text.
const storedText = (minimum, maximum) => z.string().refine(value => {
  if (value.length < minimum || value.length > maximum * 2) return false
  const characters = [...value]
  return characters.length >= minimum && characters.length <= maximum && characters.every(character => {
    const point = character.codePointAt(0)
    return point !== 0 && (point < 0xD800 || point > 0xDFFF)
  })
})
const storedNote = storedText(0, 2000)
const storedReference = storedText(0, 160)
const hasStoredContent = value => /[^\t\n\v\f\r ]/.test(value)

export const featureRequestSubmitSchema = z.object({
  action: z.literal('submit'),
  payload: z.object({ submission_key: identifier, title: requestTitle, description: requestDescription }).strict(),
}).strict()

export const featureRequestReviewSchema = z.object({
  website_id: identifier, action: z.literal('review'),
  payload: z.object({
    request_id: identifier, expected_status: status, expected_revision: z.number().int().min(1).max(4),
    status: z.enum(['under_review', 'approved', 'rejected', 'assigned']), note: note.min(1),
    assignment_reference: reference, action_key: identifier,
  }).strict().superRefine((value, context) => {
    if (!transitions[value.expected_status].includes(value.status)) context.addIssue({ code: 'custom', message: 'Choose an allowed next request status.' })
    if (value.status === 'assigned' ? !value.assignment_reference : Boolean(value.assignment_reference)) context.addIssue({ code: 'custom', message: 'An assignment reference is required only when assigning development work.' })
  }),
}).strict()

/** Reject duplicate/unknown query fields before turning URLSearchParams into data. */
export function featureRequestQuery(request, admin = false) {
  const params = new URL(request.url).searchParams
  const allowed = new Set(['request_id', 'before_created_at', 'before_id', ...(admin ? ['website_id'] : [])])
  const input = {}
  for (const [key, value] of params) {
    if (!allowed.has(key) || Object.hasOwn(input, key)) throw new CommerceError('Check the feature request query fields.')
    input[key] = value
  }
  const query = parse(z.object({ request_id: identifier.optional(), before_created_at: timestamp.optional(), before_id: identifier.optional(), ...(admin ? { website_id: identifier.optional() } : {}) }).strict(), input)
  if (Boolean(query.before_created_at) !== Boolean(query.before_id) || query.request_id && query.before_id || admin && query.request_id && !query.website_id) throw new CommerceError('Use a request ID with its website, or a complete pagination cursor.')
  return { websiteId: admin ? query.website_id || null : null, action: query.request_id ? 'get' : 'list', payload: query.request_id ? { request_id: query.request_id } : query.before_id ? { before_created_at: query.before_created_at, before_id: query.before_id } : {} }
}

// PostgreSQL timestamps retain microseconds; Date alone would discard cursor
// ordering within the same millisecond and can falsely reject a valid page.
function time(value) {
  const fraction = value.match(/\.(\d+)/)?.[1] || ''
  return BigInt(Date.parse(value)) * 1000n + BigInt(fraction.padEnd(6, '0').slice(3, 6))
}
function compare(left, right) {
  const a = time(left.created_at), b = time(right.created_at)
  return a === b ? left.id === right.id ? 0 : left.id > right.id ? 1 : -1 : a > b ? 1 : -1
}
const sameTime = (a, b) => time(a) === time(b)
const malformed = () => { throw new CommerceError('Feature request state could not be verified. Refresh before taking action.', 503) }
const checked = (schema, raw) => { const result = schema.safeParse(raw); if (!result.success) malformed(); return result.data }
const record = z.object({
  id: identifier, website_id: identifier, title: storedText(5, 180), description: storedText(10, 6000), status,
  revision: z.number().int().min(1).max(4), review_note: storedNote, assignment_reference: storedReference, created_at: timestamp, updated_at: timestamp,
})
const event = z.object({
  id: identifier, request_id: identifier, revision: z.number().int().min(1).max(4), from_status: status.nullable(), to_status: status,
  note: storedNote, assignment_reference: storedReference, actor_kind: z.enum(['owner', 'admin']), created_at: timestamp,
})
function checkedRecord(raw, websiteId) {
  const value = checked(record, raw)
  if (websiteId && value.website_id !== websiteId || !hasStoredContent(value.title) || !hasStoredContent(value.description) || !revisions[value.status].includes(value.revision) || time(value.updated_at) < time(value.created_at) || (value.status === 'submitted' ? Boolean(value.review_note) : !hasStoredContent(value.review_note)) || (value.status === 'assigned' ? !hasStoredContent(value.assignment_reference) : Boolean(value.assignment_reference))) malformed()
  return value
}

function checkedList(raw, websiteId, payload) {
  const value = checked(z.object({ website_id: identifier.nullable(), requests: z.array(z.unknown()).max(50), has_more: z.boolean(), next_cursor: cursor.nullable() }), raw)
  if (value.website_id !== websiteId || value.has_more !== Boolean(value.next_cursor) || value.has_more && value.requests.length !== 50) malformed()
  const requests = value.requests.map(row => checkedRecord(row, websiteId))
  if (new Set(requests.map(row => row.id)).size !== requests.length || requests.some((row, index) => index && compare(requests[index - 1], row) <= 0)) malformed()
  if (payload.before_id && requests.some(row => compare(row, { id: payload.before_id, created_at: payload.before_created_at }) >= 0)) malformed()
  if (value.next_cursor && (!requests.length || compare(value.next_cursor, requests.at(-1)) !== 0)) malformed()
  return { website_id: websiteId, requests, has_more: value.has_more, next_cursor: value.next_cursor }
}

function checkedDetail(raw, websiteId, action, payload) {
  const value = checked(z.object({ website_id: identifier, request: z.unknown(), events: z.array(event).min(1).max(4), ...(action === 'submit' || action === 'review' ? { replayed: z.boolean() } : {}), ...(action === 'review' ? { action_event: event } : {}) }), raw)
  if (value.website_id !== websiteId) malformed()
  const request = checkedRecord(value.request, websiteId)
  if (payload.request_id && request.id !== payload.request_id || value.events.length !== request.revision || new Set(value.events.map(row => row.id)).size !== value.events.length) malformed()
  let previous = null
  for (const [index, row] of value.events.entries()) {
    if (row.request_id !== request.id || row.revision !== index + 1 || row.from_status !== previous?.to_status && !(index === 0 && row.from_status === null) || index && (!transitions[previous.to_status].includes(row.to_status) || time(row.created_at) < time(previous.created_at))) malformed()
    if (index === 0 ? row.actor_kind !== 'owner' || row.to_status !== 'submitted' || row.note || row.assignment_reference : row.actor_kind !== 'admin' || !hasStoredContent(row.note) || (row.to_status === 'assigned' ? !hasStoredContent(row.assignment_reference) : Boolean(row.assignment_reference))) malformed()
    previous = row
  }
  const last = value.events.at(-1)
  if (last.to_status !== request.status || last.note !== request.review_note || last.assignment_reference !== request.assignment_reference || !sameTime(request.created_at, value.events[0].created_at) || !sameTime(request.updated_at, last.created_at)) malformed()
  if (action === 'submit' && (request.title !== payload.title || request.description !== payload.description || !value.replayed && request.revision !== 1)) malformed()
  if (action === 'review') {
    const applied = value.action_event
    const original = value.events.find(row => row.id === applied.id)
    if (!original || JSON.stringify(original) !== JSON.stringify(applied) || applied.revision !== payload.expected_revision + 1 || applied.from_status !== payload.expected_status || applied.to_status !== payload.status || applied.note !== payload.note || applied.assignment_reference !== payload.assignment_reference || !value.replayed && applied.revision !== request.revision) malformed()
  }
  return { ...value, request }
}

/** Owner identity stays in its verified JWT; only signed Admin receives service RPCs. */
export async function featureRequests(client, websiteId, action, payload, adminSession = null) {
  const id = websiteId?.toLowerCase() || null
  const admin = Boolean(adminSession)
  if (!admin && !id || action !== 'list' && !id) throw new CommerceError('A website is required for this feature request.')
  const args = { p_website_id: id, p_action: action, p_payload: payload }
  if (admin) args.p_actor_email = parse(z.string().trim().toLowerCase().email().max(254), adminSession.email)
  const result = await optionalCommerceRpc(client, admin ? 'commerce_feature_requests_admin' : 'commerce_feature_requests_owner', args)
  if (!result.available) {
    if (action === 'submit' || action === 'review') throw new CommerceError('Feature requests are not available yet. Contact the platform team.', 503)
    return action === 'list' ? { available: false, website_id: id, requests: [], has_more: false, next_cursor: null } : { available: false, website_id: id, request: null, events: [] }
  }
  return { available: true, ...(action === 'list' ? checkedList(result.data, id, payload) : checkedDetail(result.data, id, action, payload)) }
}
