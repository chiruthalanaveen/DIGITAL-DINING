export const RESORT_PLANS = {
  restaurant_standard: {
    code: 'restaurant_standard',
    name: 'Restaurant Standard',
    legacyPlan: 'Standard',
    businessType: 'restaurant',
    prices: { '1month': 799, '6months': 4315, '12months': 7670 },
    resortEnabled: false,
    resortPro: false,
  },
  restaurant_pro: {
    code: 'restaurant_pro',
    name: 'Restaurant Pro',
    legacyPlan: 'Pro',
    businessType: 'restaurant',
    prices: { '1month': 1299, '6months': 7015, '12months': 12470 },
    resortEnabled: false,
    resortPro: false,
  },
  restaurant_resort_standard: {
    code: 'restaurant_resort_standard',
    name: 'Restaurant + Resort Standard',
    legacyPlan: 'Standard',
    businessType: 'restaurant_resort',
    prices: { '1month': 1999, '6months': 10795, '12months': 19190 },
    resortEnabled: true,
    resortPro: false,
  },
  restaurant_resort_pro: {
    code: 'restaurant_resort_pro',
    name: 'Restaurant + Resort Pro',
    legacyPlan: 'Pro+',
    businessType: 'restaurant_resort',
    prices: { '1month': 2999, '6months': 16195, '12months': 28790 },
    resortEnabled: true,
    resortPro: true,
  },
}

export const PLAN_ALIASES = {
  Standard: 'restaurant_standard',
  Pro: 'restaurant_pro',
  'Pro+': 'restaurant_pro',
}

export function normalizePlanCode(restaurant) {
  const explicit = String(restaurant?.plan_code || '').trim()
  if (explicit && RESORT_PLANS[explicit]) return explicit

  const legacy = String(restaurant?.plan || '').trim()
  return PLAN_ALIASES[legacy] || 'restaurant_standard'
}

export function isResortEnabled(restaurant) {
  const type = String(restaurant?.business_type || '').trim().toLowerCase()
  if (type === 'resort' || type === 'restaurant_resort') return true
  const code = normalizePlanCode(restaurant)
  return Boolean(RESORT_PLANS[code]?.resortEnabled)
}

export function isResortPro(restaurant) {
  const code = normalizePlanCode(restaurant)
  return Boolean(RESORT_PLANS[code]?.resortPro)
}

export function getCanonicalPlan(code) {
  return RESORT_PLANS[code] || RESORT_PLANS.restaurant_standard
}

export function getLegacyPlanForCode(code) {
  return getCanonicalPlan(code).legacyPlan
}
