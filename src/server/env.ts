import { getAddress, type Address } from 'viem'

export type ServerEnv = {
  databaseUrl: string
  rpcHttp: string
  rpcWs?: string
  gameAddress: Address
  deploymentBlock: bigint
  confirmations: bigint
  indexerSecret: string
  allowedOrigins: string[]
}

function required(name: string) {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`${name} is required`)
  return value
}

export function getServerEnv(): ServerEnv {
  const deploymentBlockValue = process.env.DEPLOYMENT_BLOCK?.trim()
  if (!deploymentBlockValue) throw new Error('DEPLOYMENT_BLOCK is required')
  const deploymentBlock = BigInt(deploymentBlockValue)
  const confirmations = BigInt(process.env.INDEXER_CONFIRMATIONS || '12')
  if (deploymentBlock < 0n) throw new Error('DEPLOYMENT_BLOCK must be non-negative')
  if (confirmations < 0n || confirmations > 1_000n) throw new Error('INDEXER_CONFIRMATIONS must be from 0 to 1000')
  return {
    databaseUrl: required('DATABASE_URL'),
    rpcHttp: required('ROBINHOOD_RPC_HTTP'),
    rpcWs: process.env.ROBINHOOD_RPC_WS?.trim() || undefined,
    gameAddress: getAddress(required('WARROOM_GAME_ADDRESS')),
    deploymentBlock,
    confirmations,
    indexerSecret: required('INDEXER_SECRET'),
    allowedOrigins: (process.env.ALLOWED_ORIGINS || '').split(',').map((origin) => origin.trim()).filter(Boolean),
  }
}
