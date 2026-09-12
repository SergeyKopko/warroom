import { describe, expect, it, vi } from 'vitest'
import { getAddress, type Hex } from 'viem'
import type { ActivityRepository, IndexerState } from '../src/server/activity/repository'
import { ActivityIndexer, RealtimeIndexerSupervisor, type ChainSource } from '../src/server/indexer/service'

const address = getAddress('0x1111111111111111111111111111111111111111')
const hashFor = (block: bigint) => `0x${block.toString(16).padStart(64, '0')}` as Hex

class MemoryRepository implements ActivityRepository {
  state?: IndexerState
  deletedFrom?: bigint
  states: IndexerState[] = []
  async listBefore() { return [] }
  async listAfter() { return [] }
  async insertMany(events: any[]) { return events.length }
  async getIndexerState() { return this.state }
  async setIndexerState(_chainId: number, _contract: typeof address, state: IndexerState) { this.state = state; this.states.push(state) }
  async deleteFromBlock(_chainId: number, _contract: typeof address, block: bigint) { this.deletedFrom = block }
}

function source(head = 120n): ChainSource & { ranges: Array<[bigint, bigint]>; overrides: Map<bigint, Hex> } {
  const ranges: Array<[bigint, bigint]> = []
  const overrides = new Map<bigint, Hex>()
  return {
    ranges,
    overrides,
    getBlockNumber: async () => head,
    getBlock: async (blockNumber) => ({ number: blockNumber, hash: overrides.get(blockNumber) || hashFor(blockNumber), timestamp: blockNumber }),
    getLogs: async ({ fromBlock, toBlock }) => { ranges.push([fromBlock, toBlock]); return [] },
  }
}

describe('activity indexer continuity', () => {
  it('continues from the block after the persisted checkpoint', async () => {
    const chain = source()
    const repository = new MemoryRepository()
    repository.state = { lastBlock: 105n, lastBlockHash: hashFor(105n) }
    const indexer = new ActivityIndexer(chain, repository, { chainId: 4663, contractAddress: address, deploymentBlock: 100n, confirmations: 10n })
    const result = await indexer.catchUp()
    expect(chain.ranges).toEqual([[106n, 110n]])
    expect(repository.state?.lastBlock).toBe(110n)
    expect(result.reorg).toBe(false)
  })

  it('rewinds and deletes orphaned rows when the checkpoint hash changed', async () => {
    const chain = source()
    const repository = new MemoryRepository()
    repository.state = { lastBlock: 105n, lastBlockHash: `0x${'ff'.repeat(32)}` }
    const indexer = new ActivityIndexer(chain, repository, { chainId: 4663, contractAddress: address, deploymentBlock: 100n, confirmations: 10n, reorgRewind: 3n })
    const result = await indexer.catchUp()
    expect(repository.deletedFrom).toBe(102n)
    expect(chain.ranges[0]).toEqual([102n, 110n])
    expect(result.reorg).toBe(true)
  })
})

describe('indexer realtime recovery', () => {
  it('runs catch-up after disconnects and reconnects with exponential backoff', async () => {
    const catchUp = vi.fn(async () => undefined)
    const sleeps: number[] = []
    let attempts = 0
    const supervisor = new RealtimeIndexerSupervisor({
      catchUp,
      connect: async () => { attempts += 1; if (attempts < 3) throw new Error('offline'); return () => undefined },
      sleep: async (milliseconds) => { sleeps.push(milliseconds) },
    })
    await supervisor.run(3)
    expect(attempts).toBe(3)
    expect(catchUp).toHaveBeenCalledTimes(3)
    expect(sleeps).toEqual([1_000, 2_000])
  })
})
