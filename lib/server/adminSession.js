import crypto from 'crypto'

export const ADMIN_COOKIE_NAME =
  'digitaldine_admin_session'

const SESSION_HOURS = 4

function getConfig() {
  const email =
    String(
      process.env.ADMIN_EMAIL ||
        ''
    )
      .trim()
      .toLowerCase()

  const password =
    String(
      process.env.ADMIN_PASSWORD ||
        ''
    )

  const secret =
    String(
      process.env.ADMIN_SESSION_SECRET ||
        ''
    )

  if (
    !email ||
    !password ||
    secret.length < 32
  ) {
    throw new Error(
      'Admin server configuration is incomplete. Set ADMIN_EMAIL, ADMIN_PASSWORD and an ADMIN_SESSION_SECRET of at least 32 characters.'
    )
  }

  return {
    email,
    password,
    secret,
  }
}

export function safeEqual(
  first,
  second
) {
  const firstBuffer =
    Buffer.from(
      String(first ?? '')
    )

  const secondBuffer =
    Buffer.from(
      String(second ?? '')
    )

  if (
    firstBuffer.length !==
    secondBuffer.length
  ) {
    return false
  }

  return crypto.timingSafeEqual(
    firstBuffer,
    secondBuffer
  )
}

function signPayload(
  encodedPayload,
  secret
) {
  return crypto
    .createHmac(
      'sha256',
      secret
    )
    .update(
      encodedPayload
    )
    .digest(
      'base64url'
    )
}

export function validateAdminCredentials(
  email,
  password
) {
  const config =
    getConfig()

  const cleanEmail =
    String(email || '')
      .trim()
      .toLowerCase()

  return (
    safeEqual(
      cleanEmail,
      config.email
    ) &&
    safeEqual(
      String(password || ''),
      config.password
    )
  )
}

export function createAdminSession() {
  const config =
    getConfig()

  const now =
    Math.floor(
      Date.now() / 1000
    )

  const payload = {
    v: 1,
    email:
      config.email,
    iat: now,
    exp:
      now +
      SESSION_HOURS *
        60 *
        60,
    nonce:
      crypto
        .randomBytes(12)
        .toString('hex'),
  }

  const encodedPayload =
    Buffer.from(
      JSON.stringify(
        payload
      )
    ).toString(
      'base64url'
    )

  const signature =
    signPayload(
      encodedPayload,
      config.secret
    )

  return {
    token:
      `${encodedPayload}.${signature}`,

    maxAge:
      SESSION_HOURS *
      60 *
      60,
  }
}

export function verifyAdminToken(
  token
) {
  try {
    const config =
      getConfig()

    const [
      encodedPayload,
      signature,
    ] =
      String(token || '')
        .split('.')

    if (
      !encodedPayload ||
      !signature
    ) {
      return null
    }

    const expectedSignature =
      signPayload(
        encodedPayload,
        config.secret
      )

    if (
      !safeEqual(
        signature,
        expectedSignature
      )
    ) {
      return null
    }

    const payload =
      JSON.parse(
        Buffer.from(
          encodedPayload,
          'base64url'
        ).toString(
          'utf8'
        )
      )

    const now =
      Math.floor(
        Date.now() / 1000
      )

    if (
      payload?.v !== 1 ||
      !payload?.email ||
      Number(
        payload?.exp || 0
      ) <= now ||
      !safeEqual(
        String(
          payload.email
        ).toLowerCase(),
        config.email
      )
    ) {
      return null
    }

    return payload
  } catch {
    return null
  }
}

export function requireAdmin(
  request
) {
  const token =
    request.cookies.get(
      ADMIN_COOKIE_NAME
    )?.value || ''

  return verifyAdminToken(
    token
  )
}
