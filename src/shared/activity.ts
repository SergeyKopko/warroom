export type ActivityKind = 'launch' | 'mint' | 'rank' | 'upgrade' | 'extra' | 'target' | 'fees' | 'reward' | 'round'
export type ActivityStatus = 'pending' | 'confirmed'

export type ActivityEvent = {
  id: string
  kind: ActivityKind
  eventName: string
  title: string
  detail: string
  commanderId?: string
  actor?: string
  timestamp: number
  txHash?: `0x${string}`
  blockNumber?: string
  logIndex?: number
  status: ActivityStatus
  confirmed: boolean
  mine?: boolean
}

export type ActivityFilters = {
  eventType?: string
  commanderId?: string
  actor?: string
}

export type ActivityCursor = {
  blockNumber: string
  logIndex: number
  id: string
}

export type ActivityPage = {
  items: ActivityEvent[]
  nextCursor: string | null
  headCursor: string | null
}

const ADDRESS = /^0x[a-fA-F0-9]{40}$/
const HASH = /^0x[a-fA-F0-9]{64}$/

export function encodeCursor(cursor: ActivityCursor): string {
  const binary = String.fromCharCode(...new TextEncoder().encode(JSON.stringify(cursor)))
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function decodeCursor(value: string | undefined): ActivityCursor | undefined {
  if (!value) return undefined
  if (value.length > 512) throw new Error('Invalid cursor')
  try {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - value.length % 4) % 4)
    const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
    const parsed = JSON.parse(new TextDecoder().decode(bytes)) as Partial<ActivityCursor>
    if (!parsed.blockNumber || !/^\d+$/.test(parsed.blockNumber) || !Number.isSafeInteger(parsed.logIndex) || parsed.logIndex! < 0 || typeof parsed.id !== 'string' || parsed.id.length < 1 || parsed.id.length > 160) {
      throw new Error('Invalid cursor')
    }
    return { blockNumber: parsed.blockNumber, logIndex: Number(parsed.logIndex), id: parsed.id }
  } catch {
    throw new Error('Invalid cursor')
  }
}

const KINDS = new Set<ActivityKind>(['launch', 'mint', 'rank', 'upgrade', 'extra', 'target', 'fees', 'reward', 'round'])
const EVENT_NAMES = new Set([
  'CommanderMinted',
  'MissileLaunched',
  'MissileUpgraded',
  'RankUpgraded',
  'TargetDestroyed',
  'CreatorFeesPulled',
  'RoundClosed',
  'RewardsClaimed',
])

export function validateActivityQuery(input: { cursor?: unknown; after?: unknown; limit?: unknown; wallet?: unknown; type?: unknown; commanderId?: unknown; actor?: unknown }) {
  const rawLimit = typeof input.limit === 'string' ? Number(input.limit) : 30
  if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 100) throw new Error('limit must be an integer from 1 to 100')
  const wallet = typeof input.wallet === 'string' && input.wallet ? input.wallet : undefined
  if (wallet && !ADDRESS.test(wallet)) throw new Error('wallet must be a valid EVM address')
  const actor = typeof input.actor === 'string' && input.actor ? input.actor : undefined
  if (actor && !ADDRESS.test(actor)) throw new Error('actor must be a valid EVM address')
  const commanderId = typeof input.commanderId === 'string' && input.commanderId ? input.commanderId : undefined
  if (commanderId && (!/^\d{1,78}$/.test(commanderId) || BigInt(commanderId) < 0n)) throw new Error('commanderId must be a non-negative integer')
  const eventType = typeof input.type === 'string' && input.type ? input.type : undefined
  if (eventType && !KINDS.has(eventType as ActivityKind) && !EVENT_NAMES.has(eventType)) throw new Error('type is not a supported Activity kind or contract event')
  if (input.cursor && input.after) throw new Error('Use cursor or after, not both')
  return {
    cursor: decodeCursor(typeof input.cursor === 'string' ? input.cursor : undefined),
    after: decodeCursor(typeof input.after === 'string' ? input.after : undefined),
    limit: rawLimit,
    wallet: wallet?.toLowerCase(),
    filters: {
      eventType,
      commanderId,
      actor: actor?.toLowerCase(),
    } satisfies ActivityFilters,
  }
}

export function cursorFor(event: ActivityEvent): string | null {
  if (!event.blockNumber || event.logIndex === undefined) return null
  return encodeCursor({ blockNumber: event.blockNumber, logIndex: event.logIndex, id: event.id })
}

export function markMine(event: ActivityEvent, wallet?: string): ActivityEvent {
  return { ...event, mine: Boolean(wallet && event.actor?.toLowerCase() === wallet.toLowerCase()) }
}

export function mergeActivityEvents(current: ActivityEvent[], incoming: ActivityEvent[], wallet?: string, max = 200): ActivityEvent[] {
  const confirmedHashes = new Set(incoming.filter((event) => event.status === 'confirmed' && event.txHash).map((event) => event.txHash!.toLowerCase()))
  const merged = new Map<string, ActivityEvent>()
  for (const event of current) {
    if (event.status === 'pending' && event.txHash && confirmedHashes.has(event.txHash.toLowerCase())) continue
    merged.set(event.id, markMine(event, wallet))
  }
  for (const event of incoming) merged.set(event.id, markMine(event, wallet))
  return [...merged.values()]
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === 'pending' ? -1 : 1
      const blockDiff = BigInt(b.blockNumber || '0') - BigInt(a.blockNumber || '0')
      if (blockDiff !== 0n) return blockDiff > 0n ? 1 : -1
      return (b.logIndex ?? Number.MAX_SAFE_INTEGER) - (a.logIndex ?? Number.MAX_SAFE_INTEGER)
    })
    .slice(0, max)
}

export function makePendingActivity(input: { txHash: `0x${string}`; kind: ActivityKind; title: string; detail: string; commanderId?: bigint; actor?: string }): ActivityEvent {
  if (!HASH.test(input.txHash)) throw new Error('Invalid transaction hash')
  return {
    id: `pending:${input.txHash.toLowerCase()}`,
    eventName: 'PendingTransaction',
    kind: input.kind,
    title: input.title,
    detail: input.detail,
    commanderId: input.commanderId?.toString(),
    actor: input.actor?.toLowerCase(),
    timestamp: Math.floor(Date.now() / 1000),
    txHash: input.txHash,
    status: 'pending',
    confirmed: false,
    mine: true,
  }
}

export function paginateActivity(events: ActivityEvent[], limit: number, cursor?: ActivityCursor) {
  const sorted = [...events].sort((a, b) => {
    const blockDiff = BigInt(b.blockNumber || '0') - BigInt(a.blockNumber || '0')
    if (blockDiff !== 0n) return blockDiff > 0n ? 1 : -1
    if ((b.logIndex ?? 0) !== (a.logIndex ?? 0)) return (b.logIndex ?? 0) - (a.logIndex ?? 0)
    return b.id.localeCompare(a.id)
  })
  const start = cursor ? sorted.findIndex((event) => event.id === cursor.id) + 1 : 0
  const items = sorted.slice(Math.max(0, start), Math.max(0, start) + limit)
  return { items, nextCursor: items.length === limit ? cursorFor(items[items.length - 1]) : null }
}

export function pendingDescriptor(functionName: string, args: readonly unknown[]) {
  const tokenId = typeof args[0] === 'bigint' ? args[0] : undefined
  switch (functionName) {
    case 'mint': return { kind: 'mint' as const, title: 'Commander mint submitted', detail: 'Waiting for on-chain confirmation' }
    case 'launch': return { kind: args[1] ? 'extra' as const : 'launch' as const, title: args[1] ? `Commander #${tokenId} extra launch submitted` : `Commander #${tokenId} launch submitted`, detail: 'Waiting for on-chain confirmation', commanderId: tokenId }
    case 'upgradeMissile': return { kind: 'upgrade' as const, title: `Commander #${tokenId} upgrade submitted`, detail: 'Waiting for on-chain confirmation', commanderId: tokenId }
    case 'buyNextRank':
    case 'promoteWithProgress':
    case 'enterGeneralTrial': return { kind: 'rank' as const, title: `Commander #${tokenId} rank transaction submitted`, detail: 'Waiting for on-chain confirmation', commanderId: tokenId }
    case 'closeRound': return { kind: 'round' as const, title: 'Round close submitted', detail: 'Waiting for on-chain confirmation' }
    case 'claimRewards':
    case 'claimRewardsBatch': return { kind: 'reward' as const, title: 'PLTR claim submitted', detail: 'Waiting for on-chain confirmation', commanderId: tokenId }
    default: return { kind: 'launch' as const, title: 'Transaction submitted', detail: 'Waiting for on-chain confirmation', commanderId: tokenId }
  }
}
