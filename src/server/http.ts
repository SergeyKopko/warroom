import type { VercelRequest, VercelResponse } from '@vercel/node'
import { Redis } from '@upstash/redis'
import { Ratelimit } from '@upstash/ratelimit'

const localBuckets = new Map<string, { count: number; resetAt: number }>()
const distributedLimiters = new Map<string, Ratelimit>()

function allowedOrigins() {
  const configured = (process.env.ALLOWED_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean)
  const vercel = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : undefined
  return new Set([...configured, ...(vercel ? [vercel] : [])])
}

export function applyCors(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin
  if (!origin) return true
  if (!allowedOrigins().has(origin)) {
    res.status(403).json({ error: 'Origin is not allowed' })
    return false
  }
  res.setHeader('Access-Control-Allow-Origin', origin)
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Last-Event-ID')
  res.setHeader('Vary', 'Origin')
  return true
}

export function requestIp(req: VercelRequest) {
  const forwarded = req.headers['x-forwarded-for']
  const value = Array.isArray(forwarded) ? forwarded[0] : forwarded
  return (value?.split(',')[0] || req.socket.remoteAddress || 'unknown').trim()
}

export async function checkRateLimit(req: VercelRequest, scope: string, limit = 120) {
  const identifier = `${scope}:${requestIp(req)}`
  if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
    const key = `${scope}:${limit}`
    let limiter = distributedLimiters.get(key)
    if (!limiter) {
      limiter = new Ratelimit({
        redis: new Redis({ url: process.env.UPSTASH_REDIS_REST_URL, token: process.env.UPSTASH_REDIS_REST_TOKEN }),
        limiter: Ratelimit.slidingWindow(limit, '1 m'),
        prefix: `warroom:ratelimit:${scope}`,
      })
      distributedLimiters.set(key, limiter)
    }
    return limiter.limit(identifier)
  }
  const timestamp = Date.now()
  const bucket = localBuckets.get(identifier)
  if (!bucket || bucket.resetAt <= timestamp) {
    localBuckets.set(identifier, { count: 1, resetAt: timestamp + 60_000 })
    return { success: true, limit, remaining: limit - 1, reset: timestamp + 60_000 }
  }
  bucket.count += 1
  return { success: bucket.count <= limit, limit, remaining: Math.max(0, limit - bucket.count), reset: bucket.resetAt }
}

export function setRateLimitHeaders(res: VercelResponse, result: { limit: number; remaining: number; reset: number }) {
  res.setHeader('X-RateLimit-Limit', String(result.limit))
  res.setHeader('X-RateLimit-Remaining', String(result.remaining))
  res.setHeader('X-RateLimit-Reset', String(result.reset))
}
