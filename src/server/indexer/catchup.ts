import { randomUUID } from 'node:crypto'
import { createPublicClient, http, type Hex } from 'viem'
import { getDb, type SqlClient } from '../db.js'
import { getServerEnv } from '../env.js'
import { NeonActivityRepository } from '../activity/repository.js'
import { ActivityIndexer, type ChainSource } from './service.js'

const CHAIN_ID = 4663

async function acquireLease(db: SqlClient, contractAddress: string, ownerToken: string, seconds = 55) {
  const rows = await db.query<{ owner_token: string }>(
    `INSERT INTO indexer_locks (chain_id, contract_address, owner_token, locked_until)
     VALUES ($1,$2,$3,now() + ($4 * interval '1 second'))
     ON CONFLICT (chain_id, contract_address) DO UPDATE
       SET owner_token=EXCLUDED.owner_token, locked_until=EXCLUDED.locked_until
       WHERE indexer_locks.locked_until < now()
     RETURNING owner_token`,
    [CHAIN_ID, contractAddress.toLowerCase(), ownerToken, seconds],
  )
  return rows[0]?.owner_token === ownerToken
}

async function releaseLease(db: SqlClient, contractAddress: string, ownerToken: string) {
  await db.query('DELETE FROM indexer_locks WHERE chain_id=$1 AND contract_address=$2 AND owner_token=$3', [CHAIN_ID, contractAddress.toLowerCase(), ownerToken])
}

export function createActivityIndexer() {
  const env = getServerEnv()
  const db = getDb(env.databaseUrl)
  const chain = {
    id: CHAIN_ID,
    name: 'Robinhood Chain',
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
    rpcUrls: { default: { http: [env.rpcHttp] } },
  } as const
  const client = createPublicClient({ chain, transport: http(env.rpcHttp) })
  const source: ChainSource = {
    getBlockNumber: () => client.getBlockNumber(),
    getBlock: (blockNumber) => client.getBlock({ blockNumber }).then((block) => ({ number: block.number, hash: block.hash, timestamp: block.timestamp })),
    getLogs: (input) => client.getLogs(input),
    getTransactionSender: (hash: Hex) => client.getTransaction({ hash }).then((transaction) => transaction.from),
  }
  return {
    db,
    env,
    indexer: new ActivityIndexer(source, new NeonActivityRepository(db, CHAIN_ID, env.gameAddress), {
      chainId: CHAIN_ID,
      contractAddress: env.gameAddress,
      deploymentBlock: env.deploymentBlock,
      confirmations: env.confirmations,
    }),
  }
}

export async function catchUpActivity() {
  const runtime = createActivityIndexer()
  const ownerToken = randomUUID()
  if (!await acquireLease(runtime.db, runtime.env.gameAddress, ownerToken)) return { acquired: false, inserted: 0 }
  try {
    return { acquired: true, ...await runtime.indexer.catchUp() }
  } finally {
    await releaseLease(runtime.db, runtime.env.gameAddress, ownerToken)
  }
}
