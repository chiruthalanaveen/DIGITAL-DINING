import { redis } from '@/lib/redis'

const MAX_FAILED_ATTEMPTS = 5
const LOCKOUT_SECONDS = 15 * 60 // 15 minutes

const FAILED_ATTEMPT_WINDOW_SECONDS = 15 * 60 // 15 minutes
const IP_RATE_LIMIT_WINDOW_SECONDS = 60 // 1 minute
const IP_RATE_LIMIT_MAX_REQUESTS = 10

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase()
}

function normalizeIp(ip) {
  return String(ip || 'unknown')
    .replace(/[^a-zA-Z0-9:._-]/g, '_')
    .slice(0, 100)
}

/**
 * Checks whether the IP address is sending too many login requests.
 */
export async function checkIpRateLimit(ip) {
  const safeIp = normalizeIp(ip)
  const key = `digital-dining:login:ip:${safeIp}`

  const currentCount = await redis.incr(key)

  if (currentCount === 1) {
    await redis.expire(key, IP_RATE_LIMIT_WINDOW_SECONDS)
  }

  if (currentCount > IP_RATE_LIMIT_MAX_REQUESTS) {
    const ttl = await redis.ttl(key)

    return {
      allowed: false,
      retryAfter: ttl > 0 ? ttl : IP_RATE_LIMIT_WINDOW_SECONDS,
      message: 'Too many login requests. Please try again shortly.',
    }
  }

  return {
    allowed: true,
    retryAfter: 0,
    message: null,
  }
}

/**
 * Returns the current failed-login count for an email.
 */
export async function getFailedLoginAttempts(email) {
  const safeEmail = normalizeEmail(email)

  if (!safeEmail) {
    return 0
  }

  const key = `digital-dining:login:failed:${safeEmail}`
  const attempts = await redis.get(key)

  return Number(attempts || 0)
}

/**
 * Checks whether an email account is currently locked.
 */
export async function getLoginLockStatus(email) {
  const safeEmail = normalizeEmail(email)

  if (!safeEmail) {
    return {
      locked: false,
      retryAfter: 0,
    }
  }

  const lockKey = `digital-dining:login:locked:${safeEmail}`
  const isLocked = await redis.get(lockKey)

  if (!isLocked) {
    return {
      locked: false,
      retryAfter: 0,
    }
  }

  const ttl = await redis.ttl(lockKey)

  return {
    locked: true,
    retryAfter: ttl > 0 ? ttl : LOCKOUT_SECONDS,
  }
}

/**
 * Records one failed login attempt.
 */
export async function recordFailedLogin(email) {
  const safeEmail = normalizeEmail(email)

  if (!safeEmail) {
    return {
      attempts: 0,
      locked: false,
      retryAfter: 0,
    }
  }

  const failedKey = `digital-dining:login:failed:${safeEmail}`
  const lockKey = `digital-dining:login:locked:${safeEmail}`

  const attempts = await redis.incr(failedKey)

  if (attempts === 1) {
    await redis.expire(failedKey, FAILED_ATTEMPT_WINDOW_SECONDS)
  }

  if (attempts >= MAX_FAILED_ATTEMPTS) {
    await redis.set(lockKey, 'locked', {
      ex: LOCKOUT_SECONDS,
    })

    await redis.del(failedKey)

    return {
      attempts,
      locked: true,
      retryAfter: LOCKOUT_SECONDS,
    }
  }

  return {
    attempts,
    locked: false,
    retryAfter: 0,
  }
}

/**
 * Clears failed-login attempts after successful login.
 */
export async function clearFailedLoginAttempts(email) {
  const safeEmail = normalizeEmail(email)

  if (!safeEmail) {
    return
  }

  await redis.del(
    `digital-dining:login:failed:${safeEmail}`,
    `digital-dining:login:locked:${safeEmail}`
  )
}

export {
  MAX_FAILED_ATTEMPTS,
  LOCKOUT_SECONDS,
}