import { describe, expect, it } from 'vitest'
import { ActivityTransport, type StreamCallbacks } from '../src/activityTransport'
import { cursorFor, type ActivityEvent } from '../src/shared/activity'

function event(id: string, block: number): ActivityEvent {
  return { id, eventName: 'MissileLaunched', kind: 'launch', title: id, detail: 'hit', timestamp: block, blockNumber: String(block), logIndex: 0, status: 'confirmed', confirmed: true }
}

describe('browser realtime transport', () => {
  it('falls back to 3–5 second polling and catches up from the last cursor', async () => {
    const first = event('first', 10)
    const missed = event('missed', 11)
    const scheduled: Array<{ callback: () => void; delay: number }> = []
    const afterValues: Array<string | undefined> = []
    const emissions: ActivityEvent[][] = []
    let streamCallbacks: StreamCallbacks | undefined
    const transport = new ActivityTransport({
      fetchPage: async (after) => {
        afterValues.push(after)
        return after ? { items: [missed], nextCursor: null, headCursor: cursorFor(missed) } : { items: [first], nextCursor: null, headCursor: cursorFor(first) }
      },
      openStream: (_cursor, callbacks) => { streamCallbacks = callbacks; return { close: () => undefined } },
      emit: (items) => emissions.push(items),
      schedule: (callback, delay) => { scheduled.push({ callback, delay }); return scheduled.length as unknown as ReturnType<typeof setTimeout> },
      cancel: () => undefined,
      random: () => 0.5,
    })
    await transport.start()
    streamCallbacks?.onError()
    expect(scheduled.map((entry) => entry.delay)).toContain(3_000)
    expect(scheduled.map((entry) => entry.delay)).toContain(1_000)
    const poll = scheduled.find((entry) => entry.delay === 3_000)
    poll?.callback()
    await Promise.resolve()
    await Promise.resolve()
    expect(afterValues[1]).toBe(cursorFor(first))
    expect(emissions.at(-1)?.map((item) => item.id)).toEqual(['missed', 'first'])
    expect(scheduled.some((entry) => entry.delay === 4_000)).toBe(true)
    transport.stop()
  })

  it('requests cursor catch-up immediately after realtime reconnect', async () => {
    const first = event('first', 20)
    const afterValues: Array<string | undefined> = []
    let callbacks: StreamCallbacks | undefined
    const transport = new ActivityTransport({
      fetchPage: async (after) => { afterValues.push(after); return { items: after ? [] : [first], nextCursor: null, headCursor: after ? null : cursorFor(first) } },
      openStream: (_cursor, next) => { callbacks = next; return { close: () => undefined } },
      emit: () => undefined,
    })
    await transport.start()
    callbacks?.onOpen()
    await Promise.resolve()
    expect(afterValues).toEqual([undefined, cursorFor(first)])
    transport.stop()
  })
})
