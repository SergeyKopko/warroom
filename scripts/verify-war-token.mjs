import { createPublicClient, getAddress, http, parseAbi } from 'viem'

const address = getAddress(process.env.WAR_TOKEN_ADDRESS || '')
const rpcUrl = process.env.ROBINHOOD_RPC_HTTP
if (!rpcUrl) throw new Error('ROBINHOOD_RPC_HTTP is required')

const client = createPublicClient({ transport: http(rpcUrl) })
const abi = parseAbi([
  'function name() view returns (string)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
  'function totalSupply() view returns (uint256)',
])
const [code, name, symbol, decimals, totalSupply] = await Promise.all([
  client.getCode({ address }),
  client.readContract({ address, abi, functionName: 'name' }),
  client.readContract({ address, abi, functionName: 'symbol' }),
  client.readContract({ address, abi, functionName: 'decimals' }),
  client.readContract({ address, abi, functionName: 'totalSupply' }),
])
if (!code || code === '0x') throw new Error('WAR_TOKEN_ADDRESS has no contract code')
if (decimals !== 18) throw new Error(`WARROOM prices require 18 decimals; token reports ${decimals}`)
console.log(JSON.stringify({ address, name, symbol, decimals, totalSupply: totalSupply.toString(), compatible: true }, null, 2))
