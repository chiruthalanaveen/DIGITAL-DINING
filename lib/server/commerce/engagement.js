import { z } from 'zod'
import { uuid } from './validation'
import { CommerceError, can, dataResult, ownerContext, parse } from './core'

const empty = z.object({}).strict()
const phone = z.string().trim().min(7).max(30).regex(/^\+?[0-9][0-9 ()-]+$/, 'Enter a valid phone number.')
export const customerExperienceEnvelope = z.object({ website_id: uuid, action: z.string().min(1).max(50), payload: z.unknown() }).strict()
export const engagementEnvelope = z.object({ action: z.string().min(1).max(50), payload: z.unknown() }).strict()

export const customerExperienceActions = {
  get: empty,
  wishlist_add: z.object({ product_id: uuid }).strict(),
  wishlist_remove: z.object({ product_id: uuid }).strict(),
  address_save: z.object({
    id: uuid.optional(), label: z.string().trim().min(1).max(60), name: z.string().trim().min(2).max(180), phone,
    address: z.string().trim().min(5).max(1000), pincode: z.string().trim().regex(/^[0-9]{6}$/, 'Enter a six-digit pincode.'), is_default: z.boolean().optional(),
  }).strict(),
  address_delete: z.object({ address_id: uuid }).strict(),
  review_save: z.object({ order_id: uuid, product_id: uuid, rating: z.number().int().min(1).max(5), title: z.string().trim().max(120), body: z.string().trim().min(1).max(3000) }).strict(),
  request_create: z.object({ order_id: uuid, type: z.enum(['cancellation', 'return']), reason: z.string().trim().min(5).max(2000) }).strict(),
}

export const ownerEngagementActions = {
  get: empty,
  review_moderate: z.object({ review_id: uuid, status: z.enum(['approved', 'rejected']) }).strict(),
  request_decide: z.object({ request_id: uuid, decision: z.enum(['approved', 'rejected']), note: z.string().trim().max(2000) }).strict(),
}

export function engagementPayload(actions, action, payload) {
  if (!Object.hasOwn(actions, action)) throw new CommerceError('Unsupported customer experience action.')
  return parse(actions[action], payload)
}

export async function ownerEngagementContext(request, websiteId, action = 'get') {
  const context = await ownerContext(request, websiteId)
  const allowed = action === 'get' ? can(context.website, 'products') || can(context.website, 'orders') : can(context.website, action === 'review_moderate' ? 'products' : 'orders')
  if (!allowed) throw new CommerceError('This action is not enabled for your account.', 403)
  if (action !== 'get' && !['setup', 'active'].includes(context.website.status)) throw new CommerceError('This website is read-only.', 403)
  return context
}

export async function customerExperience(client, websiteId, action = 'get', payload = {}) {
  return await dataResult(client.rpc('commerce_customer_experience', { p_website_id: websiteId, p_action: action, p_payload: payload })) || {}
}

export async function ownerEngagement(client, websiteId, action = 'get', payload = {}) {
  return await dataResult(client.rpc('commerce_owner_engagement', { p_website_id: websiteId, p_action: action, p_payload: payload })) || {}
}
