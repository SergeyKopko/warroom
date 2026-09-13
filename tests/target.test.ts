import { describe, expect, it } from 'vitest'
import { destroyedPercent } from '../src/shared/target'

describe('target destruction progress', () => {
  it('starts empty and fills as HP is removed', () => {
    expect(destroyedPercent(200_000n, 200_000n)).toBe(0)
    expect(destroyedPercent(150_000n, 200_000n)).toBe(25)
    expect(destroyedPercent(100_000n, 200_000n)).toBe(50)
    expect(destroyedPercent(0n, 200_000n)).toBe(100)
  })

  it('clamps malformed values to the visual range', () => {
    expect(destroyedPercent(300_000n, 200_000n)).toBe(0)
    expect(destroyedPercent(-1n, 200_000n)).toBe(100)
    expect(destroyedPercent(1n, 0n)).toBe(0)
  })
})
