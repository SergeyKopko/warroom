import type { VercelRequest, VercelResponse } from '@vercel/node'
import { getDb } from '../../src/server/db.js'
import { applyCors, checkRateLimit, setRateLimitHeaders } from '../../src/server/http.js'
import { NeonActivityRepository } from '../../src/server/activity/repository.js'
import { cursorFor, decodeCursor, markMine, validateActivityQuery } from '../../src/shared/activity.js'
import { catchUpActivity } from '../../src/server/indexer/catchup.js'
import { getServerEnv } from '../../src/server/env.js'

export const config = { maxDuration: 30 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!applyCors(req, res)) return
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })
  const rate = await checkRateLimit(req, 'activity-stream', 30)
  setRateLimitHeaders(res, rate)
  if (!rate.success) return res.status(429).json({ error: 'Too many stream connections' })

  let parsed
  try {
    parsed = validateActivityQuery({
      after: Array.isArray(req.query.cursor) ? req.query.cursor[0] : req.query.cursor,
      limit: '100',
      wallet: Array.isArray(req.query.wallet) ? req.query.wallet[0] : req.query.wallet,
      type: Array.isArray(req.query.type) ? req.query.type[0] : req.query.type,
      commanderId: Array.isArray(req.query.commanderId) ? req.query.commanderId[0] : req.query.commanderId,
      actor: Array.isArray(req.query.actor) ? req.query.actor[0] : req.query.actor,
    })
  } catch (error) {
    return res.status(400).json({ error: error instanceof Error ? error.message : 'Invalid request' })
  }

  res.statusCode = 200
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
  res.setHeader('Cache-Control', 'no-cache, no-transform')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()

  const configured = Boolean(process.env.WARROOM_GAME_ADDRESS?.trim() && process.env.DEPLOYMENT_BLOCK?.trim())
  const repository = configured
    ? new NeonActivityRepository(getDb(), 4663, getServerEnv().gameAddress)
    : undefined
  if (configured) await catchUpActivity().catch(() => undefined)
  let cursor = parsed.after
  let closed = false
  req.on('close', () => { closed = true })
  res.write('retry: 3000\n\n')
  const deadline = Date.now() + 22_000

  while (!closed && Date.now() < deadline) {
    const items = repository ? await repository.listAfter(100, cursor, parsed.filters) : []
    if (items.length) {
      for (const item of items) {
        const marked = markMine(item, parsed.wallet)
        res.write(`id: ${cursorFor(marked)}\n`)
        res.write(`event: activity\n`)
        res.write(`data: ${JSON.stringify(marked)}\n\n`)
      }
      cursor = decodeCursor(cursorFor(items[items.length - 1]) || undefined)
    } else {
      res.write(`event: heartbeat\ndata: ${Date.now()}\n\n`)
    }
    await new Promise((resolve) => setTimeout(resolve, 2_000))
  }
  res.end()
}
