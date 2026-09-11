export type Screen = 'battle' | 'arsenal' | 'rank' | 'rewards' | 'activity' | 'docs'

export type Rank = 0 | 1 | 2 | 3 | 4

export type Commander = {
  id: bigint
  rank: Rank
  missileLevel: number
  hits: number
  launches: number
  totalDamage: bigint
  warSpent: bigint
  warBurned: bigint
  mintedAt: number
  lastLaunchAt: number
  extraDay: number
  extraCount: number
  activeRound: number
}

export type ActivityKind = 'launch' | 'mint' | 'rank' | 'upgrade' | 'extra' | 'reward' | 'round'

export type Activity = {
  id: string
  kind: ActivityKind
  title: string
  detail: string
  commanderId?: bigint
  timestamp: number
  txHash?: `0x${string}`
  mine?: boolean
}

export type Round = {
  id: number
  endsAt: number
  reward: bigint
  totalWeight: bigint
  closed: boolean
}

export type GameSnapshot = {
  connected: boolean
  address?: `0x${string}`
  demo: boolean
  loading: boolean
  pendingAction?: string
  error?: string
  warBalance: bigint
  pltrBalance: bigint
  allowance: bigint
  minted: number
  maxSupply: number
  targetHp: bigint
  targetMaxHp: bigint
  targetCycle: number
  totalBurned: bigint
  totalLaunches: bigint
  creatorFees: bigint
  round: Round
  commanders: Commander[]
  selectedId?: bigint
  claimable: bigint
  activity: Activity[]
}
