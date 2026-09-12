import type { Address, Hex } from 'viem'
import { decodeActivityLog, type ChainLog } from '../activity/decoder.js'
import type { ActivityRepository, IndexerState } from '../activity/repository.js'

export type ChainBlock = { number: bigint; hash: Hex; timestamp: bigint }

export interface ChainSource {
  getBlockNumber(): Promise<bigint>
  getBlock(blockNumber: bigint): Promise<ChainBlock>
  getLogs(input: { address: Address; fromBlock: bigint; toBlock: bigint }): Promise<ChainLog[]>
  getTransactionSender?(hash: Hex): Promise<Address>
}

export type IndexerConfig = {
  chainId: number
  contractAddress: Address
  deploymentBlock: bigint
  confirmations: bigint
  batchSize?: bigint
  reorgRewind?: bigint
}

export class ActivityIndexer {
  constructor(
    private readonly source: ChainSource,
    private readonly repository: ActivityRepository,
    private readonly config: IndexerConfig,
  ) {}

  async catchUp() {
    const head = await this.source.getBlockNumber()
    if (head < this.config.confirmations) return { inserted: 0, fromBlock: null, toBlock: null, reorg: false }
    const target = head - this.config.confirmations
    let state = await this.repository.getIndexerState(this.config.chainId, this.config.contractAddress)
    let reorg = false

    if (state) {
      const canonical = await this.source.getBlock(state.lastBlock)
      if (canonical.hash.toLowerCase() !== state.lastBlockHash.toLowerCase()) {
        reorg = true
        const rewindBy = this.config.reorgRewind ?? (this.config.confirmations * 2n + 16n)
        const rewind = state.lastBlock > rewindBy ? state.lastBlock - rewindBy : this.config.deploymentBlock
        const safeRewind = rewind < this.config.deploymentBlock ? this.config.deploymentBlock : rewind
        await this.repository.deleteFromBlock(this.config.chainId, this.config.contractAddress, safeRewind)
        if (safeRewind > this.config.deploymentBlock) {
          const previous = await this.source.getBlock(safeRewind - 1n)
          state = { lastBlock: previous.number, lastBlockHash: previous.hash }
          await this.repository.setIndexerState(this.config.chainId, this.config.contractAddress, state)
        } else {
          state = undefined
        }
      }
    }

    const first = state ? state.lastBlock + 1n : this.config.deploymentBlock
    if (first > target) return { inserted: 0, fromBlock: first, toBlock: target, reorg }

    const batchSize = this.config.batchSize ?? 1_800n
    let inserted = 0
    for (let fromBlock = first; fromBlock <= target; fromBlock += batchSize) {
      const toBlock = fromBlock + batchSize - 1n > target ? target : fromBlock + batchSize - 1n
      const logs = await this.source.getLogs({ address: this.config.contractAddress, fromBlock, toBlock })
      const decoded = logs.map((log) => decodeActivityLog(log, this.config.chainId)).filter((event): event is NonNullable<typeof event> => Boolean(event))
      if (this.source.getTransactionSender) {
        const missingActors = [...new Set(decoded.filter((event) => !event.actor).map((event) => event.txHash.toLowerCase() as Hex))]
        const senders = new Map<Hex, Address>()
        await Promise.all(missingActors.map(async (hash) => {
          senders.set(hash, (await this.source.getTransactionSender!(hash)).toLowerCase() as Address)
        }))
        for (const event of decoded) event.actor ||= senders.get(event.txHash.toLowerCase() as Hex)
      }
      const blockNumbers = [...new Set(decoded.map((event) => event.blockNumber))]
      const timestamps = new Map<string, number>()
      await Promise.all(blockNumbers.map(async (blockNumber) => {
        const block = await this.source.getBlock(BigInt(blockNumber))
        timestamps.set(blockNumber, Number(block.timestamp))
      }))
      inserted += await this.repository.insertMany(decoded.map((event) => ({ ...event, timestamp: timestamps.get(event.blockNumber) || 0 })))
      const finalBlock = await this.source.getBlock(toBlock)
      const nextState: IndexerState = { lastBlock: toBlock, lastBlockHash: finalBlock.hash }
      await this.repository.setIndexerState(this.config.chainId, this.config.contractAddress, nextState)
    }

    return { inserted, fromBlock: first, toBlock: target, reorg }
  }
}

export type RealtimeDependencies = {
  catchUp: () => Promise<unknown>
  connect: (onBlock: () => void) => Promise<() => void>
  sleep?: (ms: number) => Promise<void>
  maxBackoffMs?: number
}

export class RealtimeIndexerSupervisor {
  private stopped = false
  private unsubscribe?: () => void

  constructor(private readonly dependencies: RealtimeDependencies) {}

  stop() {
    this.stopped = true
    this.unsubscribe?.()
  }

  async run(maxCycles = Number.POSITIVE_INFINITY) {
    const sleep = this.dependencies.sleep || ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
    let attempt = 0
    let cycles = 0
    await this.dependencies.catchUp()
    while (!this.stopped && cycles < maxCycles) {
      cycles += 1
      try {
        this.unsubscribe = await this.dependencies.connect(() => void this.dependencies.catchUp())
        attempt = 0
        return
      } catch {
        await this.dependencies.catchUp()
        const delay = Math.min(this.dependencies.maxBackoffMs || 60_000, 1_000 * 2 ** attempt)
        attempt += 1
        await sleep(delay)
      }
    }
  }
}
