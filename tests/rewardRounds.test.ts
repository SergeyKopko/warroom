import { describe, expect, it } from 'vitest'
import { chunkRoundIds, closedRoundIds } from '../src/shared/rewardRounds'

describe('reward round history', () => {
  it('covers every closed round, newest first', () => {
    expect(closedRoundIds(1)).toEqual([])
    expect(closedRoundIds(5)).toEqual([4n, 3n, 2n, 1n])
  })

  it('splits long histories into gas-safe batches without losing a round', () => {
    const rounds = closedRoundIds(251)
    const batches = chunkRoundIds(rounds, 100)
    expect(batches.map((batch) => batch.length)).toEqual([100, 100, 50])
    expect(batches.flat()).toEqual(rounds)
  })
})
