// Shared e-commerce fee arithmetic. Use on the server for authoritative amounts.
// All values are integer paise. This module does not debit wallets.
export const DEFAULT_ECOMMERCE_FEE_PAISE = 500
export const DEFAULT_ECOMMERCE_BLOCKING_THRESHOLD_PAISE = 50000
export const MINIMUM_ECOMMERCE_TOPUP_PAISE = 200000

export function validatePaise(value, name = 'amount') {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer in paise`)
  }
  return value
}

export function calculatePendingFees(deliveredUnchargedCount, feePaise = DEFAULT_ECOMMERCE_FEE_PAISE) {
  validatePaise(deliveredUnchargedCount, 'deliveredUnchargedCount')
  validatePaise(feePaise, 'feePaise')
  const total = deliveredUnchargedCount * feePaise
  if (!Number.isSafeInteger(total)) throw new RangeError('Fee total exceeds safe integer range')
  return total
}

export function calculateSpendableBalance(balancePaise, pendingFeesPaise) {
  validatePaise(balancePaise, 'balancePaise')
  validatePaise(pendingFeesPaise, 'pendingFeesPaise')
  return balancePaise - pendingFeesPaise
}

export function canAcceptEcommerceOrder(balancePaise, pendingFeesPaise, thresholdPaise = DEFAULT_ECOMMERCE_BLOCKING_THRESHOLD_PAISE) {
  validatePaise(thresholdPaise, 'thresholdPaise')
  return calculateSpendableBalance(balancePaise, pendingFeesPaise) > thresholdPaise
}

export function isMinimumTopup(amountPaise) {
  return validatePaise(amountPaise) >= MINIMUM_ECOMMERCE_TOPUP_PAISE
}
