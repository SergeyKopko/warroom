import { timingSafeEqual } from 'node:crypto'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getServerEnv } from '../../src/server/env.js'
import { applyCors, checkRateLimit, setRateLimitHeaders } from '../../src/server/http.js'
import { catchUpActivity } from '../../src/server/indexer/catchup.js'

export const config = { maxDuration: 60 }

function secureEqual(left: string, right: string) {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.length === b.length && timingSafeEqual(a, b)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!applyCors(req, res)) return
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })
  const env = getServerEnv()
  const authorization = req.headers.authorization || ''
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : String(req.headers['x-indexer-secret'] || '')
  if (!supplied || !secureEqual(supplied, env.indexerSecret)) return res.status(401).json({ error: 'Unauthorized' })
  const rate = await checkRateLimit(req, 'indexer-catch-up', 12)
  setRateLimitHeaders(res, rate)
  if (!rate.success) return res.status(429).json({ error: 'Too many requests' })
  return res.status(200).json(await catchUpActivity())
}
