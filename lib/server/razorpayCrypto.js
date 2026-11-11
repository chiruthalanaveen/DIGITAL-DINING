
import 'server-only'

import crypto from 'node:crypto'

const VERSION = 'v1'
const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12
const TAG_BYTES = 16

function getEncryptionKey() {
  const encoded = process.env
    .ECOMMERCE_RAZORPAY_ENCRYPTION_KEY

  if (!encoded) {
    throw new Error(
      'ECOMMERCE_RAZORPAY_ENCRYPTION_KEY is not configured.'
    )
  }

  // Require canonical base64 for exactly 32 bytes.
  if (
    !/^[A-Za-z0-9+/]{43}=$/.test(encoded)
  ) {
    throw new Error(
      'Razorpay encryption key must be 32 bytes encoded as base64.'
    )
  }

  const key = Buffer.from(encoded, 'base64')

  if (
    key.length !== 32 ||
    key.toString('base64') !== encoded
  ) {
    throw new Error(
      'Invalid Razorpay encryption key.'
    )
  }

  return key
}

function associatedData(storeId) {
  return Buffer.from(
    `digital-dine:ecommerce:razorpay:${storeId}`,
    'utf8'
  )
}

export function encryptRazorpaySecret(
  secret,
  storeId
) {
  if (
    typeof secret !== 'string' ||
    !secret.trim() ||
    typeof storeId !== 'string' ||
    !storeId
  ) {
    throw new Error(
      'A Razorpay secret and store ID are required.'
    )
  }

  const key = getEncryptionKey()
  const iv = crypto.randomBytes(IV_BYTES)

  const cipher = crypto.createCipheriv(
    ALGORITHM,
    key,
    iv
  )

  cipher.setAAD(associatedData(storeId))

  const ciphertext = Buffer.concat([
    cipher.update(secret, 'utf8'),
    cipher.final(),
  ])

  const tag = cipher.getAuthTag()

  // Stored format:
  // v1:base64url(iv):base64url(tag):base64url(ciphertext)
  return [
    VERSION,
    iv.toString('base64url'),
    tag.toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':')
}

export function decryptRazorpaySecret(
  encryptedValue,
  storeId
) {
  if (
    typeof encryptedValue !== 'string' ||
    typeof storeId !== 'string' ||
    !storeId
  ) {
    throw new Error(
      'Invalid encrypted Razorpay secret.'
    )
  }

  const parts = encryptedValue.split(':')

  if (
    parts.length !== 4 ||
    parts[0] !== VERSION
  ) {
    throw new Error(
      'Unsupported Razorpay encryption format.'
    )
  }

  const [, ivEncoded, tagEncoded, dataEncoded] =
    parts

  if (
    !/^[A-Za-z0-9_-]+$/.test(ivEncoded) ||
    !/^[A-Za-z0-9_-]+$/.test(tagEncoded) ||
    !/^[A-Za-z0-9_-]+$/.test(dataEncoded)
  ) {
    throw new Error(
      'Invalid encrypted Razorpay payload.'
    )
  }

  const iv = Buffer.from(
    ivEncoded,
    'base64url'
  )

  const tag = Buffer.from(
    tagEncoded,
    'base64url'
  )

  const ciphertext = Buffer.from(
    dataEncoded,
    'base64url'
  )

  if (
    iv.length !== IV_BYTES ||
    tag.length !== TAG_BYTES ||
    ciphertext.length === 0
  ) {
    throw new Error(
      'Invalid Razorpay encryption metadata.'
    )
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getEncryptionKey(),
    iv
  )

  decipher.setAAD(associatedData(storeId))
  decipher.setAuthTag(tag)

  const plaintext = Buffer.concat([
    decipher.update(ciphertext),
    decipher.final(),
  ])

  return plaintext.toString('utf8')
}
