import { decodeEventLog, formatUnits, type Address, type Hex, type Log } from 'viem'
import { gameAbi } from '../../abi.js'
import type { ActivityEvent, ActivityKind } from '../../shared/activity.js'

const rankNames = ['Recruit', 'Captain', 'Major', 'Colonel', 'General'] as const
const activityEventNames = [
  'CommanderMinted',
  'MissileLaunched',
  'MissileUpgraded',
  'RankUpgraded',
  'TargetDestroyed',
  'CreatorFeesPulled',
  'RoundClosed',
  'RewardsClaimed',
] as const
type ActivityEventName = typeof activityEventNames[number]
type ParsedActivityLog = { eventName: ActivityEventName; args: Record<string, unknown> }

export type ChainLog = Pick<Log, 'address' | 'blockHash' | 'blockNumber' | 'data' | 'logIndex' | 'topics' | 'transactionHash'>

export type DecodedActivity = Omit<ActivityEvent, 'timestamp' | 'status' | 'confirmed'> & {
  blockNumber: string
  blockHash: Hex
  logIndex: number
  txHash: Hex
  contractAddress: Address
  payload: Record<string, string | number | boolean | null>
}

function serializedArgs(args: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(args).map(([key, value]) => [key, typeof value === 'bigint' ? value.toString() : value as string | number | boolean | null]))
}

export function decodeActivityLog(log: ChainLog, chainId = 4663): DecodedActivity | null {
  if (log.blockNumber === null || log.blockHash === null || log.logIndex === null || log.transactionHash === null) return null
  let decoded: ParsedActivityLog
  try {
    decoded = decodeEventLog({ abi: gameAbi, data: log.data, topics: log.topics }) as ParsedActivityLog
  } catch {
    return null
  }
  const args = decoded.args as Record<string, unknown>
  const tokenId = typeof args.tokenId === 'bigint' ? args.tokenId.toString() : undefined
  const actor = typeof args.owner === 'string'
    ? args.owner.toLowerCase()
    : typeof args.closer === 'string'
      ? args.closer.toLowerCase()
      : undefined
  let kind: ActivityKind
  let title: string
  let detail: string

  switch (decoded.eventName) {
    case 'CommanderMinted':
      kind = 'mint'
      title = `Commander #${tokenId} joined the war`
      detail = `${formatUnits(args.paid as bigint, 18)} WAR spent · ${formatUnits(args.burned as bigint, 18)} WAR burned`
      break
    case 'MissileLaunched':
      kind = args.paid ? 'extra' : 'launch'
      title = `Commander #${tokenId} launched a rocket`
      detail = `${args.paid ? 'Extra shot · 10,000 WAR' : 'Free shot'} · ${args.hit ? `hit · ${(args.damage as bigint).toString()} damage` : 'intercepted'}`
      break
    case 'MissileUpgraded':
      kind = 'upgrade'
      title = `Commander #${tokenId} upgraded the launcher`
      detail = `Missile level ${args.level} · ${formatUnits(args.burned as bigint, 18)} WAR burned`
      break
    case 'RankUpgraded':
      kind = 'rank'
      title = `Commander #${tokenId} reached ${rankNames[Number(args.rank)] || 'Unknown rank'}`
      detail = `${args.purchased ? 'Purchased rank' : 'Earned rank'} · ${formatUnits(args.burned as bigint, 18)} WAR burned`
      break
    case 'TargetDestroyed':
      kind = 'target'
      title = `Target #${String(args.completedCycle)} destroyed`
      detail = `Target #${String(args.newCycle)} is now active`
      break
    case 'CreatorFeesPulled':
      kind = 'fees'
      title = 'Creator Fees added to rewards'
      detail = `${Number(formatUnits(args.amount as bigint, 18)).toFixed(4)} PLTR pulled from Pons`
      break
    case 'RoundClosed':
      kind = 'round'
      title = `Round #${String(args.roundId)} closed`
      detail = `${Number(formatUnits(args.reward as bigint, 18)).toFixed(4)} PLTR distributed`
      break
    case 'RewardsClaimed':
      kind = 'reward'
      title = `Commander #${tokenId} claimed rewards`
      detail = `${Number(formatUnits(args.amount as bigint, 18)).toFixed(4)} PLTR`
      break
    default:
      return null
  }

  return {
    id: `${chainId}:${log.address.toLowerCase()}:${log.transactionHash.toLowerCase()}:${log.logIndex}`,
    eventName: decoded.eventName,
    kind,
    title,
    detail,
    commanderId: tokenId,
    actor,
    txHash: log.transactionHash,
    blockNumber: log.blockNumber.toString(),
    blockHash: log.blockHash,
    logIndex: log.logIndex,
    contractAddress: log.address,
    payload: serializedArgs(args),
  }
}
