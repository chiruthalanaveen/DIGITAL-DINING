import { Redis } from '@upstash/redis'

const redisUrl = process.env.UPSTASH_REDIS_REST_URL
const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN

const redisConfigured = Boolean(redisUrl && redisToken)

export const redis = redisConfigured
  ? new Redis({
      url: redisUrl,
      token: redisToken,
    })
  : null

export function isRedisConfigured() {
  return redisConfigured
}