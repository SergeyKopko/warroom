import { describe, expect, it } from 'vitest'
import { decodeCursor, encodeCursor, makePendingActivity, markMine, mergeActivityEvents, paginateActivity, validateActivityQuery, type ActivityEvent } from '../src/shared/activity'

const hash = `0x${'12'.repeat(32)}` as `0x${string}`
const owner = '0x2222222222222222222222222222222222222222'

function event(id: string, blockNumber: number, logIndex = 0): ActivityEvent {
  return { id, eventName: 'MissileLaunched', kind: 'launch', title: id, detail: 'hit', timestamp: blockNumber, txHash: hash, blockNumber: String(blockNumber), logIndex, actor: owner, status: 'confirmed', confirmed: true }
}

describe('activity merging and identity', () => {
  it('deduplicates events by stable id', () => {
    expect(mergeActivityEvents([event('same', 10)], [event('same', 10)])).toHaveLength(1)
  })

  it('replaces a local pending row with the confirmed contract event', () => {
    const pending = makePendingActivity({ txHash: hash, kind: 'launch', title: 'Pending', detail: 'Waiting', actor: owner })
    const merged = mergeActivityEvents([pending], [event('confirmed', 11)], owner)
    expect(merged).toHaveLength(1)
    expect(merged[0]).toMatchObject({ id: 'confirmed', status: 'confirmed', mine: true })
  })

  it('works without a connected wallet and marks mine only when one is present', () => {
    expect(markMine(event('one', 1)).mine).toBe(false)
    expect(markMine(event('one', 1), owner.toUpperCase()).mine).toBe(true)
  })
})

describe('cursor pagination and validation', () => {
  it('round-trips a cursor and returns the next page without overlap', () => {
    const events = [event('e5', 5), event('e4', 4), event('e3', 3), event('e2', 2), event('e1', 1)]
    const first = paginateActivity(events, 2)
    const cursor = decodeCursor(first.nextCursor || undefined)
    const second = paginateActivity(events, 2, cursor)
    expect(first.items.map((item) => item.id)).toEqual(['e5', 'e4'])
    expect(second.items.map((item) => item.id)).toEqual(['e3', 'e2'])
    expect(new Set([...first.items, ...second.items].map((item) => item.id)).size).toBe(4)
  })

  it('rejects malformed query parameters', () => {
    expect(() => validateActivityQuery({ limit: '101' })).toThrow(/limit/)
    expect(() => validateActivityQuery({ wallet: '0x1234' })).toThrow(/wallet/)
    expect(() => validateActivityQuery({ actor: '0x1234' })).toThrow(/actor/)
    expect(() => validateActivityQuery({ commanderId: '-1' })).toThrow(/commanderId/)
    expect(() => validateActivityQuery({ type: 'AnythingFromTheBrowser' })).toThrow(/type/)
    expect(() => decodeCursor('not-a-cursor')).toThrow(/cursor/)
  })

  it('validates supported API filters', () => {
    expect(validateActivityQuery({ type: 'TargetDestroyed', commanderId: '174', actor: owner })).toMatchObject({
      filters: { eventType: 'TargetDestroyed', commanderId: '174', actor: owner },
    })
  })

  it('encodes cursor positions deterministically', () => {
    const value = { blockNumber: '123', logIndex: 9, id: 'x' }
    expect(decodeCursor(encodeCursor(value))).toEqual(value)
  })
})
