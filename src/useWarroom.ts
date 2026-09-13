import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  createPublicClient,
  createWalletClient,
  custom,
  decodeEventLog,
  formatUnits,
  getContract,
  http,
  type Address,
} from 'viem'
import { gameAbi, erc20Abi } from './abi'
import {
  CONTRACTS,
  EXTRA_SHOT_PRICE,
  FREE_SHOT_COOLDOWN,
  MINT_PRICE,
  MISSILES,
  RANKS,
  ROUND_SECONDS,
  WAR,
  isConfigured,
  isLocalDemo,
  isWarConfigured,
  robinhood,
} from './config'
import type { Activity, Commander, GameSnapshot, Rank } from './types'
import { createBrowserActivityTransport } from './activityTransport'
import { makePendingActivity, mergeActivityEvents, pendingDescriptor } from './shared/activity'
import { getInjectedProvider } from './wallet'
import { chunkRoundIds, closedRoundIds } from './shared/rewardRounds'

const publicClient = createPublicClient({ chain: robinhood, transport: http() })
const DAY = 86_400
const now = () => Math.floor(Date.now() / 1000)

async function readWalletWarBalance(account: Address) {
  if (!isWarConfigured) return undefined
  return publicClient.readContract({ address: CONTRACTS.war, abi: erc20Abi, functionName: 'balanceOf', args: [account] })
}

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
  { id: 'a1', eventName: 'DemoLaunch', status: 'confirmed', confirmed: true, kind: 'launch', title: 'Commander #174 launched a rocket', detail: 'Level 3 · hit · 600 damage', commanderId: '174', timestamp: now() - 22 },
  { id: 'a2', eventName: 'DemoExtraLaunch', status: 'confirmed', confirmed: true, kind: 'extra', title: 'Commander #091 made an extra shot', detail: '10,000 WAR spent · 5,000 WAR burned', commanderId: '91', timestamp: now() - 74 },
  { id: 'a3', eventName: 'DemoRank', status: 'confirmed', confirmed: true, kind: 'rank', title: 'Commander #288 reached Major', detail: 'Reward weight increased to 1.9×', commanderId: '288', timestamp: now() - 133 },
  { id: 'a4', eventName: 'DemoMint', status: 'confirmed', confirmed: true, kind: 'mint', title: 'Commander #342 joined the war', detail: '100,000 WAR spent · 50,000 WAR burned', commanderId: '342', timestamp: now() - 218 },
]

const initialSnapshot: GameSnapshot = {
  connected: false,
  demo: isLocalDemo,
  loading: false,
  warBalance: isLocalDemo ? WAR(2_400_000) : 0n,
  pltrBalance: 0n,
  allowance: 0n,
  minted: isLocalDemo ? 341 : 0,
  maxSupply: 1200,
  targetHp: isLocalDemo ? 64_200_000n : 100_000_000n,
  targetMaxHp: 100_000_000n,
  targetCycle: isLocalDemo ? 11 : 0,
  totalBurned: isLocalDemo ? WAR(38_421_000) : 0n,
  totalLaunches: isLocalDemo ? 214_800n : 0n,
  rankPopulation: isLocalDemo ? [203, 88, 37, 12, 1] : [0, 0, 0, 0, 0],
  creatorFees: isLocalDemo ? 1_482_000_000_000_000_000n : 0n,
  round: { id: isLocalDemo ? 47 : 0, endsAt: isLocalDemo ? now() + ROUND_SECONDS : 0, reward: 0n, totalWeight: isLocalDemo ? 152_000n : 0n, closed: false },
  roundHistory: [],
  commanders: [],
  claimable: 0n,
  claimableByCommander: {},
  activity: isLocalDemo ? initialActivity : [],
}

function deserializeDemo(): GameSnapshot | undefined {
  try {
    const raw = localStorage.getItem('warroom-demo-v1')
    if (!raw) return undefined
    const saved = JSON.parse(raw, (_, value) => typeof value === 'string' && /^bigint:\d+$/.test(value) ? BigInt(value.slice(7)) : value) as Partial<GameSnapshot>
    return {
      ...initialSnapshot,
      ...saved,
      round: { ...initialSnapshot.round, ...saved.round },
      claimableByCommander: { ...initialSnapshot.claimableByCommander, ...saved.claimableByCommander },
      rankPopulation: Array.isArray(saved.rankPopulation) && saved.rankPopulation.length >= 5
        ? saved.rankPopulation
        : initialSnapshot.rankPopulation,
      commanders: Array.isArray(saved.commanders) ? saved.commanders : initialSnapshot.commanders,
      activity: Array.isArray(saved.activity) ? saved.activity : initialSnapshot.activity,
    }
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

export function useWarroom() {
  const [state, setState] = useState<GameSnapshot>(() => (isLocalDemo ? deserializeDemo() : undefined) || initialSnapshot)
  const accountRef = useRef<Address | undefined>(undefined)
  const providerRef = useRef<ReturnType<typeof getInjectedProvider>>(undefined)

  const selected = useMemo(
    () => state.commanders.find((commander) => commander.id === state.selectedId) || state.commanders[0],
    [state.commanders, state.selectedId],
  )

  useEffect(() => {
    if (state.demo) serializeDemo(state)
  }, [state])

  const addActivity = useCallback((activity: Pick<Activity, 'kind' | 'title' | 'detail'> & { commanderId?: bigint | string }) => {
    setState((current) => ({
      ...current,
      activity: mergeActivityEvents(current.activity, [{ ...activity, commanderId: activity.commanderId?.toString(), id: crypto.randomUUID(), eventName: 'DemoEvent', status: 'confirmed', confirmed: true, timestamp: now(), mine: true }], current.address),
    }))
  }, [])

  useEffect(() => {
    const transport = createBrowserActivityTransport({
      wallet: state.address,
      initial: state.activity,
      emit: (activity) => setState((current) => ({ ...current, activity: mergeActivityEvents(current.activity, activity, current.address) })),
    })
    void transport.start()
    return () => transport.stop()
    // Reconnect with a new mine marker only when the wallet identity changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.address])

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
      if (isWarConfigured && warAddress.toLowerCase() !== CONTRACTS.war.toLowerCase()) {
        throw new Error('Configured WAR token does not match the deployed WarroomGame contract.')
      }
      const commanders = rawCommanders.map((raw, index) => mapCommander(tokenIds[index], raw))
      const historyCommanderId = state.selectedId && tokenIds.some((id) => id === state.selectedId) ? state.selectedId : tokenIds[0]
      const recentRoundIds = Array.from({ length: Math.min(10, Math.max(0, Number(roundId) - 1)) }, (_, index) => Number(roundId) - 1 - index)
      const roundHistory = historyCommanderId && recentRoundIds.length
        ? await Promise.all(recentRoundIds.map(async (id) => {
          const [result, commanderWeight, claimed] = await Promise.all([
            game.read.rounds([BigInt(id)]),
            game.read.roundWeightOf([BigInt(id), historyCommanderId]),
            game.read.rewardClaimed([BigInt(id), historyCommanderId]),
          ])
          return {
            id,
            reward: result[0],
            totalWeight: result[1],
            closedAt: Number(result[2]),
            commanderWeight,
            claimed,
          }
        }))
        : []
      const rewardRoundBatches = chunkRoundIds(closedRoundIds(Number(roundId)))
      const claimableEntries = rewardRoundBatches.length
        ? await Promise.all(commanders.map(async (commander) => {
          const amounts = await Promise.all(rewardRoundBatches.map((ids) => game.read.claimableRewards([commander.id, ids])))
          return [commander.id.toString(), amounts.reduce((sum, amount) => sum + amount, 0n)] as const
        }))
        : commanders.map((commander) => [commander.id.toString(), 0n] as const)
      const claimableByCommander = Object.fromEntries(claimableEntries)
      setState((current) => ({
        ...current,
        connected: true,
        address: account,
        loading: false,
        demo: false,
        warBalance,
        walletWarBalance: warBalance,
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
        roundHistory,
        commanders,
        selectedId: current.selectedId && commanders.some((c) => c.id === current.selectedId) ? current.selectedId : commanders[0]?.id,
        claimable: claimableByCommander[(current.selectedId && commanders.some((c) => c.id === current.selectedId) ? current.selectedId : commanders[0]?.id)?.toString() ?? ''] ?? 0n,
        claimableByCommander,
      }))
    } catch (error) {
      setState((current) => ({ ...current, loading: false, error: messageFromError(error) }))
    }
  }, [state.selectedId])

  const connect = useCallback(async () => {
    const provider = getInjectedProvider()
    if (!provider) {
      if (isLocalDemo) {
        setState((current) => ({ ...current, connected: true, address: '0xDEmo00000000000000000000000000000000bEEF' as Address }))
        return
      }
      setState((current) => ({ ...current, error: 'Install Robinhood Wallet, MetaMask or another EVM wallet to continue.' }))
      return
    }
    try {
      providerRef.current = provider
      const wallet = createWalletClient({ chain: robinhood, transport: custom(provider) })
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
      if (isConfigured) await refresh(account)
      else {
        const walletWarBalance = await readWalletWarBalance(account)
        setState((current) => ({ ...current, connected: true, address: account, warBalance: walletWarBalance ?? 0n, walletWarBalance, error: undefined }))
      }
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

  const unavailable = useCallback((): never => {
    const error = new Error('WARROOM contract is awaiting deployment. No transaction was sent.')
    setState((current) => ({ ...current, error: error.message }))
    throw error
  }, [])

  const revokeWarAllowance = useCallback(async () => {
    const account = accountRef.current
    const provider = providerRef.current ?? getInjectedProvider()
    if (!isConfigured || !provider || !account) throw new Error('Connect your wallet first.')
    setState((current) => ({ ...current, pendingAction: 'Revoking WAR allowance', error: undefined }))
    try {
      const wallet = createWalletClient({ account, chain: robinhood, transport: custom(provider) })
      const chainId = await wallet.getChainId()
      if (chainId !== robinhood.id) {
        try {
          await wallet.switchChain({ id: robinhood.id })
        } catch {
          await wallet.addChain({ chain: robinhood })
          await wallet.switchChain({ id: robinhood.id })
        }
      }
      const hash = await wallet.writeContract({ address: CONTRACTS.war, abi: erc20Abi, functionName: 'approve', args: [CONTRACTS.game, 0n] })
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('WAR allowance revocation reverted.')
      await refresh(account)
      return receipt
    } catch (error) {
      setState((current) => ({ ...current, error: messageFromError(error) }))
      throw error
    } finally {
      setState((current) => ({ ...current, pendingAction: undefined }))
    }
  }, [refresh])

  const write = useCallback(async (label: string, functionName: string, args: readonly unknown[], spend = 0n) => {
    const account = accountRef.current
    const provider = providerRef.current ?? getInjectedProvider()
    if (!provider || !account) throw new Error('Connect your wallet first.')
    setState((current) => ({ ...current, pendingAction: label, error: undefined }))
    try {
      const wallet = createWalletClient({ account, chain: robinhood, transport: custom(provider) })
      const chainId = await wallet.getChainId()
      if (chainId !== robinhood.id) {
        try {
          await wallet.switchChain({ id: robinhood.id })
        } catch {
          await wallet.addChain({ chain: robinhood })
          await wallet.switchChain({ id: robinhood.id })
        }
      }
      if (spend > state.allowance) {
        const warAddress = await publicClient.readContract({ address: CONTRACTS.game, abi: gameAbi, functionName: 'war' })
        // Limit approval to this action's exact cost. This deliberately causes
        // another approval for later paid actions instead of leaving a blanket
        // allowance over the wallet's entire WAR balance.
        const approval = await wallet.writeContract({ address: warAddress, abi: erc20Abi, functionName: 'approve', args: [CONTRACTS.game, spend] })
        const approvalReceipt = await publicClient.waitForTransactionReceipt({ hash: approval })
        if (approvalReceipt.status !== 'success') throw new Error('WAR approval transaction reverted.')
      }
      const { request } = await publicClient.simulateContract({ address: CONTRACTS.game, abi: gameAbi, functionName: functionName as any, args: args as any, account })
      // launch() has a random hit/miss branch. Estimating on a miss and mining a
      // hit can otherwise under-estimate gas because the hit writes more state.
      const hash = await wallet.writeContract({ ...request, gas: functionName === 'launch' ? 700_000n : request.gas })
      const descriptor = pendingDescriptor(functionName, args)
      const pending = makePendingActivity({ txHash: hash, ...descriptor, actor: account })
      setState((current) => ({ ...current, activity: mergeActivityEvents(current.activity, [pending], account) }))
      const receipt = await publicClient.waitForTransactionReceipt({ hash })
      if (receipt.status !== 'success') throw new Error('Game transaction reverted.')
      await refresh(account)
      return receipt
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
    revokeWarAllowance,
    resetDemo() { localStorage.removeItem('warroom-demo-v1'); setState(initialSnapshot) },
    async mint(quantity: number) {
      if (isConfigured) return write('Minting Commander', 'mint', [BigInt(quantity)], MINT_PRICE * BigInt(quantity))
      if (!state.demo) return unavailable()
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
      if (isConfigured) {
        const receipt = await write(paid ? 'Authorizing extra shot' : 'Launching rocket', 'launch', [selected.id, paid], paid ? EXTRA_SHOT_PRICE : 0n)
        for (const log of receipt.logs) {
          try {
            const decoded = decodeEventLog({ abi: gameAbi, data: log.data, topics: log.topics })
            if (decoded.eventName === 'MissileLaunched') {
              const args = decoded.args as { hit: boolean; damage: bigint }
              return { hit: args.hit, damage: args.damage }
            }
          } catch { /* Another contract's log from the same receipt. */ }
        }
        return
      }
      if (!state.demo) return unavailable()
      let result: { hit: boolean; damage: bigint } | undefined
      await runDemo(paid ? 'Firing extra rocket' : 'Launching rocket', () => {
        const hit = Math.random() >= 0.3
        const damage = hit ? MISSILES[selected.missileLevel - 1].damage : 0n
        result = { hit, damage }
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
      return result
    },
    async upgrade() {
      if (!selected || selected.missileLevel >= 4) return
      const next = MISSILES[selected.missileLevel]
      if (isConfigured) return write('Upgrading missile', 'upgradeMissile', [selected.id], next.cost)
      if (!state.demo) return unavailable()
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
      if (isConfigured) return write('Upgrading rank', method, [selected.id], price)
      if (!state.demo) return unavailable()
      await runDemo('Upgrading rank', () => {
        setState((current) => ({ ...current, warBalance: current.warBalance - price, totalBurned: current.totalBurned + price / 2n, commanders: current.commanders.map((c) => c.id === selected.id ? { ...c, rank: (c.rank + 1) as Rank, warSpent: c.warSpent + price, warBurned: c.warBurned + price / 2n } : c) }))
        addActivity({ kind: 'rank', title: `Commander #${selected.id} reached ${next.name}`, detail: `${purchased ? 'Purchased rank' : selected.rank === 3 ? 'General trial completed' : 'Earned rank'} · ${formatUnits(price / 2n, 18)} WAR burned`, commanderId: selected.id })
      })
    },
    async closeRound() {
      if (isConfigured) return write('Closing reward round', 'closeRound', [])
      if (!state.demo) return unavailable()
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
      if (isConfigured) {
        const game = getContract({ address: CONTRACTS.game, abi: gameAbi, client: publicClient })
        for (const ids of chunkRoundIds(closedRoundIds(state.round.id))) {
          if (await game.read.claimableRewards([selected.id, ids]) > 0n) {
            return write('Claiming PLTR', 'claimRewards', [selected.id, ids])
          }
        }
        return
      }
      if (!state.demo) return unavailable()
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
      if (isConfigured) {
        const game = getContract({ address: CONTRACTS.game, abi: gameAbi, client: publicClient })
        for (const ids of chunkRoundIds(closedRoundIds(state.round.id))) {
          const amounts = await Promise.all(tokenIds.map((tokenId) => game.read.claimableRewards([tokenId, ids])))
          if (amounts.some((amount) => amount > 0n)) {
            return write('Claiming all PLTR', 'claimRewardsBatch', [tokenIds, ids])
          }
        }
        return
      }
      const ids = closedRoundIds(state.round.id)
      if (!state.demo) return unavailable()
      const total = tokenIds.reduce((sum, tokenId) => sum + (state.claimableByCommander[tokenId.toString()] ?? 0n), 0n)
      await runDemo('Claiming all PLTR', () => {
        const cleared = { ...state.claimableByCommander }
        tokenIds.forEach((tokenId) => { cleared[tokenId.toString()] = 0n })
        setState((current) => ({ ...current, pltrBalance: current.pltrBalance + total, claimable: 0n, claimableByCommander: cleared }))
        addActivity({ kind: 'reward', title: `${tokenIds.length} Commanders claimed rewards`, detail: `${Number(formatUnits(total, 18)).toFixed(4)} PLTR` })
      })
    },
  }), [addActivity, connect, revokeWarAllowance, runDemo, selected, state, unavailable, write])

  useEffect(() => {
    const provider = getInjectedProvider()
    if (!provider) return
    providerRef.current = provider
    let disposed = false
    const onAccounts = (accounts: unknown) => {
      const next = Array.isArray(accounts) ? accounts[0] as Address | undefined : undefined
      accountRef.current = next
      if (next && isConfigured) refresh(next)
      else if (next) void readWalletWarBalance(next).then((walletWarBalance) => {
        if (!disposed && accountRef.current === next) setState((current) => ({ ...current, connected: true, address: next, warBalance: walletWarBalance ?? 0n, walletWarBalance }))
      }).catch(() => undefined)
      else setState((current) => ({ ...current, connected: false, address: undefined, walletWarBalance: undefined, commanders: [] }))
    }
    provider.on?.('accountsChanged', onAccounts)
    provider.on?.('chainChanged', () => window.location.reload())
    void provider.request({ method: 'eth_accounts' }).then((accounts) => {
      if (!disposed) onAccounts(accounts)
    }).catch(() => undefined)
    return () => {
      disposed = true
      provider.removeListener?.('accountsChanged', onAccounts)
    }
  }, [refresh])

  useEffect(() => {
    if (!isConfigured || !state.connected || !accountRef.current) return
    const timer = window.setInterval(() => void refresh(accountRef.current), 15_000)
    return () => window.clearInterval(timer)
  }, [refresh, state.connected])

  return { state, selected, actions }
}
