import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from '../src/server/db.js'
import { applyCors, checkRateLimit, setRateLimitHeaders } from '../src/server/http.js'
import { NeonActivityRepository, pageCursors } from '../src/server/activity/repository.js'
import { cursorFor, markMine, validateActivityQuery } from '../src/shared/activity.js'
import { catchUpActivity } from '../src/server/indexer/catchup.js'
import { getServerEnv } from '../src/server/env.js'

export const config = { maxDuration: 60 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!applyCors(req, res)) return
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const rate = await checkRateLimit(req, 'activity-history')
  setRateLimitHeaders(res, rate)
  if (!rate.success) return res.status(429).json({ error: 'Too many requests' })

  try {
    const query = validateActivityQuery({
      cursor: Array.isArray(req.query.cursor) ? req.query.cursor[0] : req.query.cursor,
      after: Array.isArray(req.query.after) ? req.query.after[0] : req.query.after,
      limit: Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit,
      wallet: Array.isArray(req.query.wallet) ? req.query.wallet[0] : req.query.wallet,
      type: Array.isArray(req.query.type) ? req.query.type[0] : req.query.type,
      commanderId: Array.isArray(req.query.commanderId) ? req.query.commanderId[0] : req.query.commanderId,
      actor: Array.isArray(req.query.actor) ? req.query.actor[0] : req.query.actor,
    })
    if (!process.env.WARROOM_GAME_ADDRESS?.trim() || !process.env.DEPLOYMENT_BLOCK?.trim()) {
      res.setHeader('Cache-Control', 'private, no-store')
      return res.status(200).json({ items: [], nextCursor: null, headCursor: null })
    }
    await catchUpActivity().catch(() => undefined)
    const env = getServerEnv()
    const repository = new NeonActivityRepository(getDb(), 4663, env.gameAddress)
    const items = query.after
      ? await repository.listAfter(query.limit, query.after, query.filters)
      : await repository.listBefore(query.limit, query.cursor, query.filters)
    const marked = items.map((event) => markMine(event, query.wallet))
    const cursors = pageCursors(marked)
    res.setHeader('Cache-Control', 'private, no-store')
    return res.status(200).json({
      items: marked,
      nextCursor: !query.after && marked.length === query.limit ? cursors.nextCursor : null,
      headCursor: query.after ? (marked.length ? cursorFor(marked[marked.length - 1]) : null) : cursors.headCursor,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid request'
    const status = /cursor|limit|wallet|actor|commanderId|type|Use cursor/.test(message) ? 400 : 500
    return res.status(status).json({ error: status === 500 ? 'Activity is temporarily unavailable' : message })
  }
}
