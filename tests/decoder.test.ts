import { describe, expect, it } from 'vitest'
import { encodeAbiParameters, encodeEventTopics, getAddress, parseAbiParameters, type Hex } from 'viem'
import { gameAbi } from '../src/abi'
import { decodeActivityLog, type ChainLog } from '../src/server/activity/decoder'

const contract = getAddress('0x1111111111111111111111111111111111111111')
const owner = getAddress('0x2222222222222222222222222222222222222222')
const closer = getAddress('0x3333333333333333333333333333333333333333')
const txHash = `0x${'ab'.repeat(32)}` as Hex
const blockHash = `0x${'cd'.repeat(32)}` as Hex

function log(eventName: string, args: Record<string, unknown>, parameters: string, values: unknown[]): ChainLog {
  return {
    address: contract,
    blockNumber: 123n,
    blockHash,
    transactionHash: txHash,
    logIndex: 7,
    topics: encodeEventTopics({ abi: gameAbi, eventName: eventName as any, args: args as any }) as ChainLog['topics'],
    data: parameters ? encodeAbiParameters(parseAbiParameters(parameters), values as any) : '0x',
  }
}

describe('activity event decoder', () => {
  it.each([
    ['CommanderMinted', log('CommanderMinted', { tokenId: 42n, owner }, 'uint256,uint256', [100_000n * 10n ** 18n, 50_000n * 10n ** 18n]), 'mint'],
    ['MissileLaunched', log('MissileLaunched', { tokenId: 42n, owner }, 'bool,bool,uint256,uint256', [true, true, 250n, 9n]), 'extra'],
    ['MissileUpgraded', log('MissileUpgraded', { tokenId: 42n }, 'uint8,uint256,uint256', [2, 50_000n * 10n ** 18n, 25_000n * 10n ** 18n]), 'upgrade'],
    ['RankUpgraded', log('RankUpgraded', { tokenId: 42n }, 'uint8,bool,uint256,uint256', [2, true, 750_000n * 10n ** 18n, 375_000n * 10n ** 18n]), 'rank'],
    ['TargetDestroyed', log('TargetDestroyed', { completedCycle: 8n, newCycle: 9n }, '', []), 'target'],
    ['CreatorFeesPulled', log('CreatorFeesPulled', {}, 'uint256', [2n * 10n ** 18n]), 'fees'],
    ['RoundClosed', log('RoundClosed', { roundId: 12n, closer }, 'uint256,uint256,uint256', [2n * 10n ** 18n, 140n, 10n ** 16n]), 'round'],
    ['RewardsClaimed', log('RewardsClaimed', { tokenId: 42n, owner }, 'uint256', [5n * 10n ** 17n]), 'reward'],
  ])('decodes %s', (_name, chainLog, kind) => {
    const decoded = decodeActivityLog(chainLog)
    expect(decoded).toMatchObject({ kind, blockNumber: '123', logIndex: 7, txHash })
    expect(decoded?.id).toContain(contract.toLowerCase())
  })

  it('ignores unrelated logs', () => {
    expect(decodeActivityLog({ ...log('RewardsClaimed', { tokenId: 42n, owner }, 'uint256', [1n]), topics: [`0x${'00'.repeat(32)}`] })).toBeNull()
  })
})
