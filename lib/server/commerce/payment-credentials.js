// Commerce merchant credentials are separate from restaurant/wallet credentials.
// Only server payment handlers import this module. Ciphertext is bound to its tenant/version.
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'
import { CommerceError } from './core'

function encryptionKey() {
  const value = process.env.COMMERCE_PAYMENT_ENCRYPTION_KEY || ''
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) throw new CommerceError('Commerce payment encryption is not configured.', 503)
  const key = Buffer.from(value, 'base64')
  if (key.length !== 32) throw new CommerceError('Commerce payment encryption is not configured.', 503)
  return key
}
export function paymentMode(keyId) {
  if (/^rzp_test_[A-Za-z0-9]{6,80}$/.test(keyId)) return 'test'
  if (/^rzp_live_[A-Za-z0-9]{6,80}$/.test(keyId)) return 'live'
  throw new CommerceError('Use a commerce merchant Razorpay key.', 400)
}
export function requireAllowedPaymentMode(mode) {
  if (!['test', 'live'].includes(mode) || (mode === 'live' && process.env.COMMERCE_ONLINE_PAYMENTS_ALLOW_LIVE !== 'true')) throw new CommerceError('Live commerce payments are not enabled.', 503)
}
export function sealPaymentCredentials(websiteId, version, credentials) {
  const mode = paymentMode(credentials.key_id)
  requireAllowedPaymentMode(mode)
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  cipher.setAAD(Buffer.from(`commerce-payments:${websiteId}:${version}`))
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(credentials), 'utf8'), cipher.final()])
  return { mode, ciphertext: [iv, cipher.getAuthTag(), encrypted].map(value => value.toString('base64url')).join('.') }
}
export function openPaymentCredentials(websiteId, version, ciphertext) {
  try {
    const [iv, tag, encrypted, extra] = String(ciphertext).split('.')
    if (!iv || !tag || !encrypted || extra) throw new Error('Invalid envelope')
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(iv, 'base64url'))
    decipher.setAAD(Buffer.from(`commerce-payments:${websiteId}:${version}`))
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    const result = JSON.parse(Buffer.concat([decipher.update(Buffer.from(encrypted, 'base64url')), decipher.final()]).toString('utf8'))
    const mode = paymentMode(result.key_id)
    requireAllowedPaymentMode(mode)
    if (typeof result.key_secret !== 'string' || result.key_secret.length < 16 || typeof result.webhook_secret !== 'string' || result.webhook_secret.length < 16) throw new Error('Invalid credentials')
    return result
  } catch (error) {
    if (error instanceof CommerceError) throw error
    throw new CommerceError('Commerce merchant credentials could not be opened.', 503)
  }
}
