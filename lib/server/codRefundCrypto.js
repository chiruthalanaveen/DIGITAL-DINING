import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
} from 'node:crypto'

const ALGORITHM =
  'aes-256-gcm'

const AAD =
  Buffer.from(
    'digital-dine-in:cod-refund-bank:v1',
    'utf8'
  )

function getEncryptionKey() {
  const raw =
    String(
      process.env
        .COD_REFUND_BANK_ENCRYPTION_KEY ||
        ''
    ).trim()

  if (!raw) {
    throw new Error(
      'Missing COD_REFUND_BANK_ENCRYPTION_KEY.'
    )
  }

  let key

  if (
    /^[0-9a-fA-F]{64}$/.test(
      raw
    )
  ) {
    key =
      Buffer.from(
        raw,
        'hex'
      )
  } else {
    try {
      key =
        Buffer.from(
          raw,
          'base64'
        )
    } catch {
      key = null
    }
  }

  if (
    !key ||
    key.length !== 32
  ) {
    throw new Error(
      'COD_REFUND_BANK_ENCRYPTION_KEY must be exactly 32 bytes (64 hex characters or a 32-byte base64 value).'
    )
  }

  return key
}

export function encryptCodRefundAccountNumber(
  accountNumber
) {
  const value =
    String(
      accountNumber || ''
    ).trim()

  if (
    !/^[0-9]{6,20}$/.test(
      value
    )
  ) {
    throw new Error(
      'Bank account number must contain 6 to 20 digits.'
    )
  }

  const key =
    getEncryptionKey()

  const iv =
    randomBytes(12)

  const cipher =
    createCipheriv(
      ALGORITHM,
      key,
      iv
    )

  cipher.setAAD(AAD)

  const ciphertext =
    Buffer.concat([
      cipher.update(
        value,
        'utf8'
      ),
      cipher.final(),
    ])

  const tag =
    cipher.getAuthTag()

  return {
    ciphertext:
      ciphertext.toString(
        'base64'
      ),

    iv:
      iv.toString(
        'base64'
      ),

    tag:
      tag.toString(
        'base64'
      ),

    last4:
      value.slice(-4),
  }
}

export function decryptCodRefundAccountNumber({
  ciphertext,
  iv,
  tag,
}) {
  const key =
    getEncryptionKey()

  const decipher =
    createDecipheriv(
      ALGORITHM,
      key,
      Buffer.from(
        String(iv || ''),
        'base64'
      )
    )

  decipher.setAAD(AAD)

  decipher.setAuthTag(
    Buffer.from(
      String(tag || ''),
      'base64'
    )
  )

  const plaintext =
    Buffer.concat([
      decipher.update(
        Buffer.from(
          String(
            ciphertext || ''
          ),
          'base64'
        )
      ),
      decipher.final(),
    ])

  const accountNumber =
    plaintext.toString(
      'utf8'
    )

  if (
    !/^[0-9]{6,20}$/.test(
      accountNumber
    )
  ) {
    throw new Error(
      'Unable to decrypt a valid bank account number.'
    )
  }

  return accountNumber
}