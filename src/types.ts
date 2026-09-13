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

import type { ActivityEvent } from './shared/activity'
export type Activity = ActivityEvent
export type { ActivityKind } from './shared/activity'

export type Round = {
  id: number
  endsAt: number
  reward: bigint
  totalWeight: bigint
  closed: boolean
}

export type RewardRoundHistory = {
  id: number
  reward: bigint
  totalWeight: bigint
  closedAt: number
  commanderWeight: bigint
  claimed: boolean
}

export type GameSnapshot = {
  connected: boolean
  address?: `0x${string}`
  demo: boolean
  loading: boolean
  pendingAction?: string
  error?: string
  warBalance: bigint
  walletWarBalance?: bigint
  pltrBalance: bigint
  allowance: bigint
  minted: number
  maxSupply: number
  targetHp: bigint
  targetMaxHp: bigint
  targetCycle: number
  totalBurned: bigint
  totalLaunches: bigint
  rankPopulation: number[]
  creatorFees: bigint
  round: Round
  roundHistory: RewardRoundHistory[]
  commanders: Commander[]
  selectedId?: bigint
  claimable: bigint
  claimableByCommander: Record<string, bigint>
  activity: Activity[]
}
