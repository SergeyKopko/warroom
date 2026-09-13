import type { VercelRequest, VercelResponse } from '@vercel/node'
import {
  concat,
  createPublicClient,
  decodeAbiParameters,
  defineChain,
  encodeAbiParameters,
  getAddress,
  http,
  parseAbiParameters,
  toFunctionSelector,
} from 'viem'
import { applyCors, checkRateLimit, setRateLimitHeaders } from '../../src/server/http.js'

const APP_URL = 'https://www.war-room.tech'
const ranks = ['Recruit', 'Captain', 'Major', 'Colonel', 'General'] as const
const uint256Input = parseAbiParameters('uint256')
const commanderOutput = parseAbiParameters('uint8,uint8,uint32,uint32,uint64,uint64,uint32,uint8,uint32,uint256,uint256,uint256')
const robinhood = defineChain({
  id: 4663,
  name: 'Robinhood Chain',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.chain.robinhood.com'] } },
})

export const config = { maxDuration: 10 }

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!applyCors(req, res)) return
  if (req.method === 'OPTIONS') return res.status(204).end()
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' })

  const rate = await checkRateLimit(req, 'nft-metadata', 120)
  setRateLimitHeaders(res, rate)
  if (!rate.success) return res.status(429).json({ error: 'Too many requests' })

  const rawId = Array.isArray(req.query.tokenId) ? req.query.tokenId[0] : req.query.tokenId
  if (!rawId || !/^[1-9][0-9]{0,3}$/.test(rawId)) return res.status(400).json({ error: 'Invalid Commander ID' })
  const tokenId = BigInt(rawId)
  if (tokenId > 1_200n) return res.status(400).json({ error: 'Invalid Commander ID' })

  const rpc = process.env.ROBINHOOD_RPC_HTTP?.trim()
  const game = process.env.WARROOM_GAME_ADDRESS?.trim()
  if (!rpc || !game) return res.status(503).json({ error: 'WARROOM is awaiting contract deployment' })

  try {
    const client = createPublicClient({ chain: robinhood, transport: http(rpc) })
    const data = concat([
      toFunctionSelector('getCommander(uint256)'),
      encodeAbiParameters(uint256Input, [tokenId]),
    ])
    const result = await client.call({ to: getAddress(game), data })
    if (!result.data) throw new Error('Empty contract response')
    const [rank, missileLevel, hits, launches, , , , , , totalDamage, warSpent, warBurned] = decodeAbiParameters(commanderOutput, result.data)

    res.setHeader('Cache-Control', 'public, max-age=15, s-maxage=30, stale-while-revalidate=300')
    return res.status(200).json({
      name: `WARROOM Commander #${rawId}`,
      description: 'A WARROOM Commander NFT. Rank, launcher level and battle history live on the NFT and follow it between wallets.',
      image: `${APP_URL}/commander-nft.png`,
      external_url: `${APP_URL}/#battle`,
      attributes: [
        { trait_type: 'Rank', value: ranks[Number(rank)] || 'Unknown' },
        { trait_type: 'Missile Level', value: Number(missileLevel) },
        { trait_type: 'Successful Hits', value: Number(hits) },
        { trait_type: 'Launches', value: Number(launches) },
        { trait_type: 'Total Damage', value: totalDamage.toString() },
        { trait_type: 'WAR Spent', value: warSpent.toString(), display_type: 'number' },
        { trait_type: 'WAR Burned', value: warBurned.toString(), display_type: 'number' },
      ],
    })
  } catch {
    return res.status(404).json({ error: 'Commander not found' })
  }
}
