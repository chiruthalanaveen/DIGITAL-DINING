import { z } from 'zod'

export const uuid = z.string().uuid()
export const slug = z.string().trim().min(2).max(80).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, 'Use lowercase letters, numbers and hyphens.')
const shortText = z.string().trim().max(180)
const money = z.number().int().min(0).max(100000000)
const imageUrl = z.string().max(2048).refine((value) => {
  if (!value) return true
  try {
    const url = new URL(value)
    return !url.username && !url.password && (url.protocol === 'https:' || (url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname)))
  } catch { return false }
}, 'Use an HTTPS image URL.')
const phone = z.string().trim().min(7).max(30).regex(/^\+?[0-9][0-9 ()-]+$/, 'Enter a valid phone number.')
const businessType = z.enum(['general', 'sarees', 'fashion', 'grocery', 'food', 'toys', 'electronics', 'beauty', 'pharmacy', 'footwear'])
const color = z.string().regex(/^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i, 'Use a valid hex color.')

export const brandingSchema = z.object({
  primary_color: color.optional(), background_color: color.optional(), text_color: color.optional(),
  logo_url: imageUrl.optional(), banner_url: imageUrl.optional(), headline: z.string().trim().max(200).optional(),
  description: z.string().trim().max(2000).optional(), contact_email: z.union([z.literal(''), z.string().email().max(254)]).optional(),
  contact_phone: z.string().trim().max(30).optional(),
}).strict()
const featureSchema = z.object({ catalog: z.boolean().optional(), inventory: z.boolean().optional(), cod: z.boolean().optional() }).strict()
const fulfillmentSchema = z.object({
  pickup: z.boolean().optional(), delivery: z.boolean().optional(), delivery_fee_paise: money.optional(),
  minimum_order_paise: money.optional(), pickup_address: z.string().trim().max(1000).optional(),
}).strict()
const permissionSchema = z.object(Object.fromEntries(['products', 'categories', 'inventory', 'orders', 'branding', 'customers'].map(key => [key, z.boolean().optional()]))).strict()
const websiteFields = z.object({
  slug, name: shortText.min(2), business_type: businessType, template: z.literal('general').optional(),
  status: z.enum(['setup', 'active', 'suspended', 'archived']).optional(), branding: brandingSchema.optional(),
  features: featureSchema.optional(), fulfillment: fulfillmentSchema.optional(), owner_permissions: permissionSchema.optional(),
  subscription_plan: z.string().trim().min(1).max(80).optional(), subscription_status: z.enum(['trial', 'active', 'past_due', 'cancelled']).optional(),
  monthly_price_paise: money.optional(),
}).strict()
const applicationSchema = z.object({
  owner_name: shortText.min(2), business_name: shortText.min(2), business_type: businessType, phone,
  address: z.string().trim().min(5).max(1000), preferred_slug: slug, description: z.string().trim().max(3000).optional(),
  required_features: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
  product_categories: z.array(z.string().trim().min(1).max(100)).max(30).optional(),
  fulfillment: z.object({ pickup: z.boolean().optional(), delivery: z.boolean().optional() }).strict().optional(),
  branding_preferences: z.string().trim().max(2000).optional(), payment_requirements: z.string().trim().max(1000).optional(),
}).strict()
const attributesSchema = z.record(z.string().min(1).max(60), z.union([
  z.string().max(500), z.number().finite(), z.boolean(), z.array(z.string().max(100)).max(30),
])).refine(value => Object.keys(value).length <= 30, 'Too many product attributes.')
const productSchema = z.object({
  id: uuid.optional(), category_id: uuid.nullable().optional(), name: shortText.min(1), slug,
  description: z.string().trim().max(3000).optional(), price_paise: money,
  image_url: imageUrl.optional(), attributes: attributesSchema.optional(), active: z.boolean().optional(),
}).strict()
const categorySchema = z.object({ id: uuid.optional(), name: z.string().trim().min(1).max(120), slug, active: z.boolean().optional() }).strict()

export const ownerActions = {
  save_product: productSchema,
  archive_product: z.object({ id: uuid }).strict(),
  save_category: categorySchema,
  archive_category: z.object({ id: uuid }).strict(),
  adjust_stock: z.object({ product_id: uuid, delta: z.number().int().min(-1000000).max(1000000).refine(value => value !== 0), reason: z.string().trim().max(500).optional() }).strict(),
  update_branding: z.object({ branding: brandingSchema }).strict(),
  update_order_status: z.object({ order_id: uuid, status: z.enum(['confirmed', 'preparing', 'ready', 'completed', 'cancelled']) }).strict(),
}
export const adminActions = {
  create_website: websiteFields.extend({ owner_user_id: uuid.optional(), application_id: uuid.optional() }).strict(),
  save_website: websiteFields.partial().extend({ id: uuid }).strict(),
  assign_owner: z.object({ website_id: uuid, user_id: uuid }).strict(),
  review_application: z.object({ application_id: uuid, status: z.enum(['under_review', 'approved', 'rejected']), review_note: z.string().trim().max(2000).optional(), website_id: uuid.optional() }).strict(),
  open_management_view: z.object({ website_id: uuid }).strict(),
}
export const actionEnvelope = z.object({ action: z.string().min(1).max(50), payload: z.unknown() }).strict()
export const checkoutSchema = z.object({
  items: z.array(z.object({ product_id: uuid, quantity: z.number().int().min(1).max(999) }).strict()).min(1).max(50),
  customer: z.object({ name: shortText.min(2), phone, address: z.string().trim().max(1000).optional() }).strict(),
  fulfillment_method: z.enum(['pickup', 'delivery']), idempotency_key: uuid, payment_method: z.literal('cod'),
}).strict().refine(value => value.fulfillment_method !== 'delivery' || (value.customer.address || '').length >= 5, 'Enter a delivery address.')

export { applicationSchema }
