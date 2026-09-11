import { defineChain, getAddress, zeroAddress } from 'viem'

export const robinhood = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: {
    default: { http: [import.meta.env.VITE_ROBINHOOD_RPC_URL || 'https://rpc.mainnet.chain.robinhood.com'] },
  },
  blockExplorers: {
    default: { name: 'Robinhood Chain Explorer', url: 'https://robinhoodchain.blockscout.com' },
  },
})

export const CONTRACTS = {
  game: import.meta.env.VITE_WARROOM_GAME_ADDRESS
    ? getAddress(import.meta.env.VITE_WARROOM_GAME_ADDRESS)
    : zeroAddress,
  pltr: getAddress('0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A'),
  ponsFeeEscrow: getAddress('0xd3AFEB2a57f70eF218Aa82451c51B2fb0416Ac9e'),
  ponsV2Factory: getAddress('0x7eD598BcEf8bd9Edd8C97A195C6d13f40801EC7e'),
} as const

export const EXPLORER = robinhood.blockExplorers.default.url
export const isConfigured = CONTRACTS.game !== zeroAddress

export const WAR = (value: number | bigint) => BigInt(value) * 10n ** 18n
export const RANKS = [
  { name: 'Recruit', multiplier: 100n, seats: null, buy: 0n, earned: 0n, hits: 0, days: 0 },
  { name: 'Captain', multiplier: 140n, seats: null, buy: WAR(250_000), earned: WAR(100_000), hits: 10, days: 1 },
  { name: 'Major', multiplier: 190n, seats: 100, buy: WAR(750_000), earned: WAR(300_000), hits: 30, days: 3 },
  { name: 'Colonel', multiplier: 250n, seats: 30, buy: WAR(2_250_000), earned: WAR(900_000), hits: 75, days: 7 },
  { name: 'General', multiplier: 400n, seats: 10, buy: 0n, earned: 0n, hits: 0, days: 0 },
] as const

export const MISSILES = [
  { level: 1, damage: 100n, hits: 0, cost: 0n },
  { level: 2, damage: 250n, hits: 10, cost: WAR(50_000) },
  { level: 3, damage: 600n, hits: 30, cost: WAR(150_000) },
  { level: 4, damage: 1_500n, hits: 75, cost: WAR(500_000) },
] as const

export const MINT_PRICE = WAR(100_000)
export const EXTRA_SHOT_PRICE = WAR(10_000)
export const ROUND_SECONDS = 5 * 60 * 60
export const FREE_SHOT_COOLDOWN = 4 * 60 * 60
