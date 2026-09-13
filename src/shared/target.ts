/** Returns how much of the current target has been destroyed, from 0 to 100. */
export function destroyedPercent(hp: bigint, maxHp: bigint) {
  if (maxHp <= 0n) return 0
  const safeHp = hp < 0n ? 0n : hp > maxHp ? maxHp : hp
  return Number((maxHp - safeHp) * 10_000n / maxHp) / 100
}
