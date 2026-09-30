import crypto from 'crypto'

function getEncryptionKey() {
  const value = String(process.env.PAYMENT_CREDENTIAL_ENCRYPTION_KEY || '').trim()

  if (!/^[a-fA-F0-9]{64}$/.test(value)) {
    throw new Error(
      'PAYMENT_CREDENTIAL_ENCRYPTION_KEY must be a 64-character hex value (32 bytes).'
    )
  }

  return Buffer.from(value, 'hex')
}

export function encryptGatewaySecret(secret) {
  const cleanSecret = String(secret || '')
  if (!cleanSecret) throw new Error('Gateway secret is required.')

  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(), iv)
  const encrypted = Buffer.concat([
    cipher.update(cleanSecret, 'utf8'),
    cipher.final(),
  ])
  const tag = cipher.getAuthTag()

  return {
    ciphertext: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
  }
}

export function decryptGatewaySecret({ ciphertext, iv, tag }) {
  if (!ciphertext || !iv || !tag) {
    throw new Error('Stored gateway secret is incomplete.')
  }

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(),
    Buffer.from(iv, 'base64')
  )

  decipher.setAuthTag(Buffer.from(tag, 'base64'))

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final(),
  ]).toString('utf8')
}
