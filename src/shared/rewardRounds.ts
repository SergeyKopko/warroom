export const REWARD_ROUND_BATCH_SIZE = 100

/** Closed reward rounds, newest first. The current round is never claimable. */
export function closedRoundIds(currentRoundId: number): bigint[] {
  if (!Number.isSafeInteger(currentRoundId) || currentRoundId <= 1) return []
  return Array.from({ length: currentRoundId - 1 }, (_, index) => BigInt(currentRoundId - 1 - index))
}

export function chunkRoundIds(roundIds: bigint[], size = REWARD_ROUND_BATCH_SIZE): bigint[][] {
  if (!Number.isSafeInteger(size) || size < 1) throw new Error('Reward round batch size must be a positive integer.')
  const chunks: bigint[][] = []
  for (let index = 0; index < roundIds.length; index += size) chunks.push(roundIds.slice(index, index + size))
  return chunks
}
