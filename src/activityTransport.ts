import { cursorFor, mergeActivityEvents, type ActivityEvent, type ActivityPage } from './shared/activity'

export type StreamCallbacks = {
  onOpen: () => void
  onEvent: (event: ActivityEvent) => void
  onError: () => void
}

export type ActivityTransportDependencies = {
  fetchPage: (after?: string) => Promise<ActivityPage>
  openStream: (cursor: string | undefined, callbacks: StreamCallbacks) => { close: () => void }
  emit: (events: ActivityEvent[]) => void
  wallet?: string
  initial?: ActivityEvent[]
  schedule?: (callback: () => void, delay: number) => ReturnType<typeof setTimeout>
  cancel?: (timer: ReturnType<typeof setTimeout>) => void
  random?: () => number
}

export class ActivityTransport {
  private items: ActivityEvent[]
  private cursor?: string
  private stopped = true
  private failures = 0
  private stream?: { close: () => void }
  private reconnectTimer?: ReturnType<typeof setTimeout>
  private pollTimer?: ReturnType<typeof setTimeout>
  private readonly schedule: NonNullable<ActivityTransportDependencies['schedule']>
  private readonly cancel: NonNullable<ActivityTransportDependencies['cancel']>

  constructor(private readonly dependencies: ActivityTransportDependencies) {
    this.items = dependencies.initial || []
    this.schedule = dependencies.schedule || ((callback, delay) => setTimeout(callback, delay))
    this.cancel = dependencies.cancel || ((timer) => clearTimeout(timer))
  }

  async start() {
    this.stopped = false
    this.dependencies.emit(this.items)
    try {
      const page = await this.dependencies.fetchPage()
      this.items = mergeActivityEvents(this.items, page.items, this.dependencies.wallet)
      this.cursor = page.headCursor || this.cursor
      this.dependencies.emit(this.items)
    } catch {
      this.startPolling()
    }
    this.connect()
  }

  stop() {
    this.stopped = true
    this.stream?.close()
    if (this.reconnectTimer) this.cancel(this.reconnectTimer)
    if (this.pollTimer) this.cancel(this.pollTimer)
  }

  private connect() {
    if (this.stopped) return
    try {
      this.stream = this.dependencies.openStream(this.cursor, {
        onOpen: () => {
          this.failures = 0
          if (this.pollTimer) this.cancel(this.pollTimer)
          this.pollTimer = undefined
          void this.catchUp()
        },
        onEvent: (event) => {
          this.items = mergeActivityEvents(this.items, [event], this.dependencies.wallet)
          this.cursor = cursorFor(event) || this.cursor
          this.dependencies.emit(this.items)
        },
        onError: () => this.handleDisconnect(),
      })
    } catch {
      this.handleDisconnect()
    }
  }

  private handleDisconnect() {
    if (this.stopped) return
    this.stream?.close()
    this.stream = undefined
    this.startPolling()
    const delay = Math.min(30_000, 1_000 * 2 ** this.failures)
    this.failures += 1
    if (this.reconnectTimer) this.cancel(this.reconnectTimer)
    this.reconnectTimer = this.schedule(() => this.connect(), delay)
  }

  private async catchUp() {
    try {
      const page = await this.dependencies.fetchPage(this.cursor)
      this.items = mergeActivityEvents(this.items, page.items, this.dependencies.wallet)
      this.cursor = page.headCursor || this.cursor
      this.dependencies.emit(this.items)
    } catch {
      this.startPolling()
    }
  }

  private startPolling() {
    if (this.stopped || this.pollTimer) return
    const poll = async () => {
      if (this.stopped) return
      await this.catchUp()
      const random = this.dependencies.random || Math.random
      this.pollTimer = this.schedule(poll, 3_000 + Math.floor(random() * 2_001))
    }
    this.pollTimer = this.schedule(poll, 3_000)
  }
}

function query(wallet?: string, key?: 'after' | 'cursor', cursor?: string) {
  const params = new URLSearchParams({ limit: '100' })
  if (wallet) params.set('wallet', wallet)
  if (key && cursor) params.set(key, cursor)
  return params.toString()
}

export function createBrowserActivityTransport(input: { wallet?: string; initial: ActivityEvent[]; emit: (events: ActivityEvent[]) => void }) {
  return new ActivityTransport({
    ...input,
    fetchPage: async (after) => {
      const response = await fetch(`/api/activity?${query(input.wallet, after ? 'after' : undefined, after)}`, { headers: { Accept: 'application/json' } })
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('Activity API unavailable')
      return response.json() as Promise<ActivityPage>
    },
    openStream: (cursor, callbacks) => {
      const stream = new EventSource(`/api/activity/stream?${query(input.wallet, 'cursor', cursor)}`)
      stream.onopen = callbacks.onOpen
      stream.addEventListener('activity', (message) => {
        try { callbacks.onEvent(JSON.parse((message as MessageEvent).data) as ActivityEvent) } catch { /* Ignore malformed server frames. */ }
      })
      stream.onerror = callbacks.onError
      return { close: () => stream.close() }
    },
  })
}
