import { z } from 'zod'
import { uuid } from './validation'

const paise = z.number().int().min(0).max(1000000000000)
const date = z.string().datetime({ offset: true }).refine(value => !/\.\d{4,}/.test(value), 'Use timestamp precision of at most milliseconds.').nullable().optional()
export const couponSchema = z.object({
  id: uuid.optional(), code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{2,31}$/, 'Use 3–32 letters, numbers, underscores or hyphens.'),
  kind: z.enum(['fixed', 'percentage']), discount_value: z.number().int().min(1).max(100000000),
  maximum_discount_paise: z.number().int().min(1).max(100000000).nullable().optional(),
  minimum_subtotal_paise: paise, starts_at: date, ends_at: date,
  usage_limit: z.number().int().min(1).max(1000000).nullable().optional(),
  per_customer_limit: z.number().int().min(1).max(1000000), active: z.boolean().optional(),
}).strict().superRefine((value, ctx) => {
  if (value.kind === 'percentage' && value.discount_value > 10000) ctx.addIssue({ code: 'custom', path: ['discount_value'], message: 'Percentage must be between 0.01% and 100% (basis points).' })
  if (value.starts_at && value.ends_at && Date.parse(value.ends_at) <= Date.parse(value.starts_at)) ctx.addIssue({ code: 'custom', path: ['ends_at'], message: 'End time must follow start time.' })
})
export const growthActions = { save_coupon: couponSchema, archive_coupon: z.object({ id: uuid }).strict() }

// Parse decimal form values without binary floating-point multiplication.
export function decimalToPaise(value, maximum = 100000000) {
  if (typeof value !== 'string' || !/^\d+(?:\.\d{1,2})?$/.test(value)) throw new Error('Enter an amount with at most two decimal places.')
  const [whole, fraction = ''] = value.split('.')
  const result = BigInt(whole) * 100n + BigInt(fraction.padEnd(2, '0'))
  if (result > BigInt(maximum)) throw new Error('Amount exceeds the permitted limit.')
  return Number(result)
}
