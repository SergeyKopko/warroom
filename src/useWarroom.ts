import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createPublicClient,
  createWalletClient,
  custom,
  formatUnits,
  getContract,
  http,
  maxUint256,
  parseEventLogs,
  type Address,
  type Hex,
} from 'viem'
import { gameAbi, erc20Abi } from './abi'
import {
  CONTRACTS,
  DEPLOYMENT_BLOCK,
  EXTRA_SHOT_PRICE,
  FREE_SHOT_COOLDOWN,
  MINT_PRICE,
  MISSILES,
  RANKS,
  ROUND_SECONDS,
  WAR,
  isConfigured,
  robinhood,
} from './config'
import type { Activity, Commander, GameSnapshot, Rank } from './types'

const publicClient = createPublicClient({ chain: robinhood, transport: http() })
const DAY = 86_400
const now = () => Math.floor(Date.now() / 1000)

function newCommander(id: bigint): Commander {
  return {
    id,
    rank: 0,
    missileLevel: 1,
    hits: 0,
    launches: 0,
    totalDamage: 0n,
    warSpent: MINT_PRICE,
    warBurned: MINT_PRICE / 2n,
    mintedAt: now(),
    lastLaunchAt: 0,
    extraDay: 0,
    extraCount: 0,
    activeRound: 0,
  }
}

const initialActivity: Activity[] = [
  { id: 'a1', kind: 'launch', title: 'Commander #174 launched a rocket', detail: 'Level 3 · hit · 600 damage', commanderId: 174n, timestamp: now() - 22 },
  { id: 'a2', kind: 'extra', title: 'Commander #091 made an extra shot', detail: '10,000 WAR spent · 5,000 WAR burned', commanderId: 91n, timestamp: now() - 74 },
  { id: 'a3', kind: 'rank', title: 'Commander #288 reached Major', detail: 'Reward weight increased to 1.9×', commanderId: 288n, timestamp: now() - 133 },
  { id: 'a4', kind: 'mint', title: 'Commander #342 joined the war', detail: '100,000 WAR spent · 50,000 WAR burned', commanderId: 342n, timestamp: now() - 218 },
]

const initialSnapshot: GameSnapshot = {
  connected: false,
  demo: !isConfigured,
  loading: false,
  warBalance: WAR(2_400_000),
  pltrBalance: 0n,
  allowance: 0n,
  minted: 341,
  maxSupply: 1200,
  targetHp: 64_200_000n,
  targetMaxHp: 100_000_000n,
  targetCycle: 11,
  totalBurned: WAR(38_421_000),
  totalLaunches: 214_800n,
  rankPopulation: [203, 88, 37, 12, 1],
  creatorFees: 1_482_000_000_000_000_000n,
  round: { id: 47, endsAt: now() + ROUND_SECONDS, reward: 0n, totalWeight: 152_000n, closed: false },
  commanders: [],
  claimable: 0n,
  claimableByCommander: {},
  activity: initialActivity,
}

function deserializeDemo(): GameSnapshot | undefined {
  try {
    const raw = localStorage.getItem('warroom-demo-v1')
    if (!raw) return undefined
    return JSON.parse(raw, (_, value) => typeof value === 'string' && /^bigint:\d+$/.test(value) ? BigInt(value.slice(7)) : value)
  } catch {
    return undefined
  }
}

function serializeDemo(snapshot: GameSnapshot) {
  localStorage.setItem('warroom-demo-v1', JSON.stringify(snapshot, (_, value) => typeof value === 'bigint' ? `bigint:${value}` : value))
}

function mapCommander(id: bigint, raw: any): Commander {
  return {
    id,
    rank: Number(raw.rank ?? raw[0]) as Rank,
    missileLevel: Number(raw.missileLevel ?? raw[1]),
    hits: Number(raw.hits ?? raw[2]),
    launches: Number(raw.launches ?? raw[3]),
    mintedAt: Number(raw.mintedAt ?? raw[4]),
    lastLaunchAt: Number(raw.lastLaunchAt ?? raw[5]),
    extraDay: Number(raw.extraDay ?? raw[6]),
    extraCount: Number(raw.extraCount ?? raw[7]),
    activeRound: Number(raw.activeRound ?? raw[8]),
    totalDamage: (raw.totalDamage ?? raw[9]) as bigint,
    warSpent: (raw.warSpent ?? raw[10]) as bigint,
    warBurned: (raw.warBurned ?? raw[11]) as bigint,
  }
}

function messageFromError(error: unknown) {
  const text = error instanceof Error ? error.message : String(error)
  if (/rejected|denied/i.test(text)) return 'Transaction was rejected in the wallet.'
  if (/insufficient/i.test(text)) return 'Not enough balance to complete this transaction.'
  if (/StillReloading/.test(text)) return 'The free launcher is still reloading.'
  if (/DailyExtraLimit/.test(text)) return 'Three extra shots have already been used today.'
  return text.split('\n')[0].slice(0, 180)
}

function activityFromLogs(logs: readonly any[], account?: Address, blockTimes = new Map<string, number>()): Activity[] {
  return logs.flatMap((log): Activity[] => {
    const args = log.args as Record<string, any>
    const common = {
      id: `${log.transactionHash}-${log.logIndex}`,
      timestamp: blockTimes.get(String(log.blockNumber)) ?? now(),
      txHash: log.transactionHash as Hex,
      commanderId: args.tokenId as bigint | undefined,
      mine: Boolean(account && args.owner?.toLowerCase() === account.toLowerCase()),
    }
    switch (log.eventName) {
      case 'CommanderMinted':
        return [{ ...common, kind: 'mint', title: `Commander #${args.tokenId} joined the war`, detail: '100,000 WAR spent · 50,000 WAR burned' }]
      case 'MissileLaunched':
        return [{ ...common, kind: args.paid ? 'extra' : 'launch', title: `Commander #${args.tokenId} launched a rocket`, detail: `${args.paid ? 'Extra shot · 10,000 WAR' : 'Free shot'} · ${args.hit ? `hit · ${args.damage} damage` : 'intercepted'}` }]
      case 'MissileUpgraded':
        return [{ ...common, kind: 'upgrade', title: `Commander #${args.tokenId} upgraded the launcher`, detail: `Missile level ${args.level} · ${formatUnits(args.burned, 18)} WAR burned` }]
      case 'RankUpgraded':
        return [{ ...common, kind: 'rank', title: `Commander #${args.tokenId} reached ${RANKS[Number(args.rank)].name}`, detail: `${args.purchased ? 'Purchased rank' : 'Earned rank'} · ${formatUnits(args.burned, 18)} WAR burned` }]
      case 'RewardsClaimed':
        return [{ ...common, kind: 'reward', title: `Commander #${args.tokenId} claimed rewards`, detail: `${Number(formatUnits(args.amount, 18)).toFixed(4)} PLTR` }]
      case 'RoundClosed':
        return [{ ...common, kind: 'round', title: `Round #${args.roundId} closed`, detail: `${Number(formatUnits(args.reward, 18)).toFixed(4)} PLTR distributed` }]
      default:
        return []
    }
  }).reverse()
}

export function useWarroom() {
  const [state, setState] = useState<GameSnapshot>(() => (!isConfigured ? deserializeDemo() : undefined) || initialSnapshot)
  const accountRef = useRef<Address | undefined>(undefined)

  const selected = useMemo(
    () => state.commanders.find((commander) => commander.id === state.selectedId) || state.commanders[0],
    [state.commanders, state.selectedId],
  )

  useEffect(() => {
    if (state.demo) serializeDemo(state)
  }, [state])

  const addActivity = useCallback((activity: Omit<Activity, 'id' | 'timestamp'>) => {
    setState((current) => ({
      ...current,
      activity: [{ ...activity, id: crypto.randomUUID(), timestamp: now(), mine: true }, ...current.activity].slice(0, 80),
    }))
  }, [])

  const refresh = useCallback(async (account = accountRef.current) => {
    if (!isConfigured || !account) return
    setState((current) => ({ ...current, loading: true, error: undefined }))
    try {
      const game = getContract({ address: CONTRACTS.game, abi: gameAbi, client: publicClient })
      const [warAddress, tokenIds, minted, maxSupply, targetHp, targetMaxHp, targetCycle, totalBurned, totalLaunches, roundId, roundEnds, roundWeight, fees] = await Promise.all([
        game.read.war(),
        game.read.ownedTokens([account]),
        game.read.totalSupply(),
        game.read.maxSupply(),
        game.read.targetHp(),
        game.read.TARGET_MAX_HP(),
        game.read.targetCycle(),
        game.read.totalWarBurned(),
        game.read.totalLaunches(),
        game.read.currentRoundId(),
        game.read.currentRoundEndsAt(),
        game.read.currentRoundWeight(),
        game.read.creatorFeesAvailable(),
      ])
      const [warBalance, pltrBalance, allowance, rawCommanders, rankPopulationRaw] = await Promise.all([
        publicClient.readContract({ address: warAddress, abi: erc20Abi, functionName: 'balanceOf', args: [account] }),
        publicClient.readContract({ address: CONTRACTS.pltr, abi: erc20Abi, functionName: 'balanceOf', args: [account] }),
        publicClient.readContract({ address: warAddress, abi: erc20Abi, functionName: 'allowance', args: [account, CONTRACTS.game] }),
        Promise.all(tokenIds.map((id) => game.read.getCommander([id]))),
        Promise.all([0, 1, 2, 3, 4].map((rank) => game.read.rankPopulation([rank]))),
      ])
      const latestBlock = await publicClient.getBlockNumber()
      const rpcWindowStart = latestBlock > 1_900n ? latestBlock - 1_900n : 0n
      const fromBlock = DEPLOYMENT_BLOCK > rpcWindowStart ? DEPLOYMENT_BLOCK : rpcWindowStart
      const rawLogs = await publicClient.getLogs({ address: CONTRACTS.game, fromBlock, toBlock: 'latest' })
      const parsed = parseEventLogs({ abi: gameAbi, logs: rawLogs, strict: false })
      const commanders = rawCommanders.map((raw, index) => mapCommander(tokenIds[index], raw))
      const roundIds = Array.from({ length: Math.min(48, Number(roundId) - 1) }, (_, index) => BigInt(Number(roundId) - 1 - index))
      const claimableEntries = roundIds.length
        ? await Promise.all(commanders.map(async (commander) => [commander.id.toString(), await game.read.claimableRewards([commander.id, roundIds])] as const))
        : commanders.map((commander) => [commander.id.toString(), 0n] as const)
      const claimableByCommander = Object.fromEntries(claimableEntries)
      const recentParsed = parsed.slice(-80)
      const uniqueBlocks = [...new Set(recentParsed.map((log) => log.blockNumber).filter((value): value is bigint => typeof value === 'bigint'))]
      const blockTimes = new Map<string, number>()
      await Promise.all(uniqueBlocks.map(async (blockNumber) => {
        const block = await publicClient.getBlock({ blockNumber })
        blockTimes.set(blockNumber.toString(), Number(block.timestamp))
      }))
      setState((current) => ({
        ...current,
        connected: true,
        address: account,
        loading: false,
        demo: false,
        warBalance,
        pltrBalance,
        allowance,
        minted: Number(minted),
        maxSupply: Number(maxSupply),
        targetHp,
        targetMaxHp,
        targetCycle: Number(targetCycle),
        totalBurned,
        totalLaunches,
        rankPopulation: rankPopulationRaw.map(Number),
        creatorFees: fees,
        round: { id: Number(roundId), endsAt: Number(roundEnds), reward: 0n, totalWeight: roundWeight, closed: now() >= Number(roundEnds) },
        commanders,
        selectedId: current.selectedId && commanders.some((c) => c.id === current.selectedId) ? current.selectedId : commanders[0]?.id,
        claimable: claimableByCommander[(current.selectedId && commanders.some((c) => c.id === current.selectedId) ? current.selectedId : commanders[0]?.id)?.toString() ?? ''] ?? 0n,
        claimableByCommander,
        activity: activityFromLogs(recentParsed, account, blockTimes),
      }))
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: messageFromError(error) }))
    }
  }, [])

  const connect = useCallback(async () => {
    if (!isConfigured) {
      setState((current) => ({ ...current, connected: true, address: '0xDEmo00000000000000000000000000000000bEEF' as Address }))
      return
    }
    if (!window.ethereum) {
      setState((current) => ({ ...current, error: 'Install Robinhood Wallet, MetaMask or another EVM wallet to continue.' }))
      return
    }
    try {
      const wallet = createWalletClient({ chain: robinhood, transport: custom(window.ethereum) })
      const [account] = await wallet.requestAddresses()
      const chainId = await wallet.getChainId()
      if (chainId !== robinhood.id) {
        try {
          await wallet.switchChain({ id: robinhood.id })
        } catch {
          await wallet.addChain({ chain: robinhood })
          await wallet.switchChain({ id: robinhood.id })
        }
      }
      accountRef.current = account
      await refresh(account)
    } catch (error) {
      setState((current) => ({ ...current, error: messageFromError(error) }))
    }
  }, [refresh])

  const runDemo = useCallback(async (label: string, fn: () => void) => {
    setState((current) => ({ ...current, pendingAction: label, error: undefined }))
    await new Promise((resolve) => setTimeout(resolve, 420))
    fn()
    setState((current) => ({ ...current, pendingAction: undefined }))
  }, [])

  const write = useCallback(async (label: string, functionName: string, args: readonly unknown[], spend = 0n) => {
    const account = accountRef.current
    if (!window.ethereum || !account) throw new Error('Connect your wallet first.')
    setState((current) => ({ ...current, pendingAction: label, error: undefined }))
    try {
      const wallet = createWalletClient({ account, chain: robinhood, transport: custom(window.ethereum) })
      if (spend > state.allowance) {
        const warAddress = await publicClient.readContract({ address: CONTRACTS.game, abi: gameAbi, functionName: 'war' })
        const approval = await wallet.writeContract({ address: warAddress, abi: erc20Abi, functionName: 'approve', args: [CONTRACTS.game, maxUint256] })
        await publicClient.waitForTransactionReceipt({ hash: approval })
      }
      const { request } = await publicClient.simulateContract({ address: CONTRACTS.game, abi: gameAbi, functionName: functionName as any, args: args as any, account })
      const hash = await wallet.writeContract(request)
      await publicClient.waitForTransactionReceipt({ hash })
      await refresh(account)
    } catch (error) {
      setState((current) => ({ ...current, error: messageFromError(error) }))
      throw error
    } finally {
      setState((current) => ({ ...current, pendingAction: undefined }))
    }
  }, [refresh, state.allowance])

  const actions = useMemo(() => ({
    connect,
    select(id: bigint) { setState((current) => ({ ...current, selectedId: id, claimable: current.claimableByCommander[id.toString()] ?? 0n })) },
    dismissError() { setState((current) => ({ ...current, error: undefined })) },
    resetDemo() { localStorage.removeItem('warroom-demo-v1'); setState(initialSnapshot) },
    async mint(quantity: number) {
      if (!state.demo) return write('Minting Commander', 'mint', [BigInt(quantity)], MINT_PRICE * BigInt(quantity))
      await runDemo('Minting Commander', () => {
        const ids = Array.from({ length: quantity }, (_, index) => BigInt(state.minted + index + 1))
        const commanders = ids.map(newCommander)
        setState((current) => ({
          ...current,
          minted: current.minted + quantity,
          warBalance: current.warBalance - MINT_PRICE * BigInt(quantity),
          totalBurned: current.totalBurned + MINT_PRICE / 2n * BigInt(quantity),
          commanders: [...current.commanders, ...commanders],
          selectedId: current.selectedId || ids[0],
        }))
        ids.forEach((id) => addActivity({ kind: 'mint', title: `Commander #${id} joined the war`, detail: '100,000 WAR spent · 50,000 WAR burned', commanderId: id }))
      })
    },
    async launch(paid: boolean) {
      if (!selected) return
      if (!state.demo) return write(paid ? 'Authorizing extra shot' : 'Launching rocket', 'launch', [selected.id, paid], paid ? EXTRA_SHOT_PRICE : 0n)
      await runDemo(paid ? 'Firing extra rocket' : 'Launching rocket', () => {
        const hit = Math.random() >= 0.3
        const damage = hit ? MISSILES[selected.missileLevel - 1].damage : 0n
        const today = Math.floor(now() / DAY)
        setState((current) => ({
          ...current,
          warBalance: current.warBalance - (paid ? EXTRA_SHOT_PRICE : 0n),
          totalBurned: current.totalBurned + (paid ? EXTRA_SHOT_PRICE / 2n : 0n),
          totalLaunches: current.totalLaunches + 1n,
          targetHp: damage >= current.targetHp ? current.targetMaxHp : current.targetHp - damage,
          targetCycle: damage >= current.targetHp ? current.targetCycle + 1 : current.targetCycle,
          commanders: current.commanders.map((c) => c.id === selected.id ? {
            ...c,
            hits: c.hits + (hit ? 1 : 0),
            launches: c.launches + 1,
            totalDamage: c.totalDamage + damage,
            lastLaunchAt: paid ? c.lastLaunchAt : now(),
            extraDay: paid ? today : c.extraDay,
            extraCount: paid ? (c.extraDay === today ? c.extraCount + 1 : 1) : c.extraCount,
            activeRound: current.round.id,
            warSpent: c.warSpent + (paid ? EXTRA_SHOT_PRICE : 0n),
            warBurned: c.warBurned + (paid ? EXTRA_SHOT_PRICE / 2n : 0n),
          } : c),
        }))
        addActivity({ kind: paid ? 'extra' : 'launch', title: `Commander #${selected.id} launched a rocket`, detail: `${paid ? 'Extra shot · 10,000 WAR' : 'Free shot'} · ${hit ? `hit · ${damage} damage` : 'intercepted'}`, commanderId: selected.id })
      })
    },
    async upgrade() {
      if (!selected || selected.missileLevel >= 4) return
      const next = MISSILES[selected.missileLevel]
      if (!state.demo) return write('Upgrading missile', 'upgradeMissile', [selected.id], next.cost)
      await runDemo('Upgrading missile', () => {
        setState((current) => ({ ...current, warBalance: current.warBalance - next.cost, totalBurned: current.totalBurned + next.cost / 2n, commanders: current.commanders.map((c) => c.id === selected.id ? { ...c, missileLevel: c.missileLevel + 1, warSpent: c.warSpent + next.cost, warBurned: c.warBurned + next.cost / 2n } : c) }))
        addActivity({ kind: 'upgrade', title: `Commander #${selected.id} upgraded the launcher`, detail: `Missile level ${next.level} · ${formatUnits(next.cost / 2n, 18)} WAR burned`, commanderId: selected.id })
      })
    },
    async rankUp(purchased: boolean) {
      if (!selected || selected.rank >= 4) return
      const next = RANKS[selected.rank + 1]
      const price = selected.rank === 3 ? WAR(800_000) : purchased ? next.buy : next.earned
      const method = selected.rank === 3 ? 'enterGeneralTrial' : purchased ? 'buyNextRank' : 'promoteWithProgress'
      if (!state.demo) return write('Upgrading rank', method, [selected.id], price)
      await runDemo('Upgrading rank', () => {
        setState((current) => ({ ...current, warBalance: current.warBalance - price, totalBurned: current.totalBurned + price / 2n, commanders: current.commanders.map((c) => c.id === selected.id ? { ...c, rank: (c.rank + 1) as Rank, warSpent: c.warSpent + price, warBurned: c.warBurned + price / 2n } : c) }))
        addActivity({ kind: 'rank', title: `Commander #${selected.id} reached ${next.name}`, detail: `${purchased ? 'Purchased rank' : selected.rank === 3 ? 'General trial completed' : 'Earned rank'} · ${formatUnits(price / 2n, 18)} WAR burned`, commanderId: selected.id })
      })
    },
    async closeRound() {
      if (!state.demo) return write('Closing reward round', 'closeRound', [])
      if (now() < state.round.endsAt) return
      await runDemo('Closing reward round', () => {
        const fee = state.creatorFees * 5n / 1000n
        setState((current) => {
          const eligible = current.commanders.filter((commander) => commander.activeRound === current.round.id)
          const totalWeight = eligible.reduce((sum, commander) => sum + RANKS[commander.rank].multiplier, 0n)
          const reward = current.creatorFees - fee
          const claimableByCommander = { ...current.claimableByCommander }
          for (const commander of eligible) {
            const credit = totalWeight > 0n ? reward * RANKS[commander.rank].multiplier / totalWeight : 0n
            const key = commander.id.toString()
            claimableByCommander[key] = (claimableByCommander[key] ?? 0n) + credit
          }
          return {
            ...current,
            pltrBalance: current.pltrBalance + (totalWeight > 0n ? fee : 0n),
            creatorFees: 0n,
            claimableByCommander,
            claimable: current.selectedId ? claimableByCommander[current.selectedId.toString()] ?? 0n : 0n,
            round: { ...current.round, id: current.round.id + 1, endsAt: now() + ROUND_SECONDS, closed: false },
          }
        })
        addActivity({ kind: 'round', title: `Round #${state.round.id} closed`, detail: `${Number(formatUnits(state.creatorFees - fee, 18)).toFixed(4)} PLTR distributed` })
      })
    },
    async claim() {
      if (!selected) return
      if (!state.demo) {
        const ids = Array.from({ length: Math.min(48, state.round.id - 1) }, (_, index) => BigInt(state.round.id - 1 - index))
        return write('Claiming PLTR', 'claimRewards', [selected.id, ids])
      }
      const amount = state.claimableByCommander[selected.id.toString()] ?? state.claimable
      if (!amount) return
      await runDemo('Claiming PLTR', () => {
        setState((current) => ({ ...current, pltrBalance: current.pltrBalance + amount, claimable: 0n, claimableByCommander: { ...current.claimableByCommander, [selected.id.toString()]: 0n } }))
        addActivity({ kind: 'reward', title: `Commander #${selected.id} claimed rewards`, detail: `${Number(formatUnits(amount, 18)).toFixed(4)} PLTR`, commanderId: selected.id })
      })
    },
    async claimAll() {
      const tokenIds = state.commanders.filter((commander) => (state.claimableByCommander[commander.id.toString()] ?? 0n) > 0n).map((commander) => commander.id)
      if (!tokenIds.length) return
      const ids = Array.from({ length: Math.min(48, state.round.id - 1) }, (_, index) => BigInt(state.round.id - 1 - index))
      if (!state.demo) return write('Claiming all PLTR', 'claimRewardsBatch', [tokenIds, ids])
      const total = tokenIds.reduce((sum, tokenId) => sum + (state.claimableByCommander[tokenId.toString()] ?? 0n), 0n)
      await runDemo('Claiming all PLTR', () => {
        const cleared = { ...state.claimableByCommander }
        tokenIds.forEach((tokenId) => { cleared[tokenId.toString()] = 0n })
        setState((current) => ({ ...current, pltrBalance: current.pltrBalance + total, claimable: 0n, claimableByCommander: cleared }))
        addActivity({ kind: 'reward', title: `${tokenIds.length} Commanders claimed rewards`, detail: `${Number(formatUnits(total, 18)).toFixed(4)} PLTR` })
      })
    },
  }), [addActivity, connect, runDemo, selected, state, write])

  useEffect(() => {
    if (!isConfigured || !window.ethereum) return
    const provider = window.ethereum
    const onAccounts = (accounts: unknown) => {
      const next = Array.isArray(accounts) ? accounts[0] as Address | undefined : undefined
      accountRef.current = next
      if (next) refresh(next)
      else setState((current) => ({ ...current, connected: false, address: undefined, commanders: [] }))
    }
    provider.on?.('accountsChanged', onAccounts)
    provider.on?.('chainChanged', () => window.location.reload())
    return () => provider.removeListener?.('accountsChanged', onAccounts)
  }, [refresh])

  useEffect(() => {
    if (!isConfigured || !state.connected || !accountRef.current) return
    const timer = window.setInterval(() => void refresh(accountRef.current), 15_000)
    return () => window.clearInterval(timer)
  }, [refresh, state.connected])

  return { state, selected, actions }
}
