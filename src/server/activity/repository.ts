import type { Address, Hex } from 'viem'
import type { ActivityCursor, ActivityEvent, ActivityFilters } from '../../shared/activity.js'
import { cursorFor } from '../../shared/activity.js'
import type { DecodedActivity } from './decoder.js'
import type { SqlClient } from '../db.js'

export type IndexerState = { lastBlock: bigint; lastBlockHash: Hex }

export interface ActivityRepository {
  listBefore(limit: number, cursor?: ActivityCursor, filters?: ActivityFilters): Promise<ActivityEvent[]>
  listAfter(limit: number, cursor?: ActivityCursor, filters?: ActivityFilters): Promise<ActivityEvent[]>
  insertMany(events: Array<DecodedActivity & { timestamp: number }>): Promise<number>
  getIndexerState(chainId: number, contractAddress: Address): Promise<IndexerState | undefined>
  setIndexerState(chainId: number, contractAddress: Address, state: IndexerState): Promise<void>
  deleteFromBlock(chainId: number, contractAddress: Address, blockNumber: bigint): Promise<void>
}

type ActivityRow = {
  id: string
  event_name: string
  kind: ActivityEvent['kind']
  title: string
  detail: string
  commander_id: string | null
  actor: string | null
  transaction_hash: Hex
  block_number: string
  log_index: number
  block_timestamp: string | Date
  confirmed: boolean
}

function fromRow(row: ActivityRow): ActivityEvent {
  return {
    id: row.id,
    eventName: row.event_name,
    kind: row.kind,
    title: row.title,
    detail: row.detail,
    commanderId: row.commander_id || undefined,
    actor: row.actor || undefined,
    txHash: row.transaction_hash,
    blockNumber: row.block_number,
    logIndex: Number(row.log_index),
    timestamp: Math.floor(new Date(row.block_timestamp).getTime() / 1000),
    status: row.confirmed ? 'confirmed' : 'pending',
    confirmed: row.confirmed,
  }
}

const selectColumns = 'id, event_name, kind, title, detail, commander_id::text, actor, transaction_hash, block_number::text, log_index, block_timestamp, confirmed'

export class NeonActivityRepository implements ActivityRepository {
  constructor(private readonly db: SqlClient, private readonly chainId = 4663, private readonly contractAddress?: Address) {}

  async listBefore(limit: number, cursor?: ActivityCursor, filters: ActivityFilters = {}) {
    const rows = await this.db.query<ActivityRow>(
      `SELECT ${selectColumns} FROM activity_events
       WHERE ($1::bigint IS NULL OR block_number < $1::bigint OR (block_number = $1::bigint AND log_index < $2) OR (block_number = $1::bigint AND log_index = $2 AND id < $3))
         AND ($4::text IS NULL OR kind = $4 OR event_name = $4)
         AND ($5::numeric IS NULL OR commander_id = $5::numeric)
         AND ($6::text IS NULL OR actor = $6)
         AND chain_id = $8
         AND ($9::text IS NULL OR contract_address = $9)
       ORDER BY block_number DESC, log_index DESC, id DESC LIMIT $7`,
      [cursor?.blockNumber || null, cursor?.logIndex ?? null, cursor?.id || null, filters.eventType || null, filters.commanderId || null, filters.actor || null, limit, this.chainId, this.contractAddress?.toLowerCase() || null],
    )
    return rows.map(fromRow)
  }

  async listAfter(limit: number, cursor?: ActivityCursor, filters: ActivityFilters = {}) {
    if (!cursor) return (await this.listBefore(limit, undefined, filters)).reverse()
    const rows = await this.db.query<ActivityRow>(
      `SELECT ${selectColumns} FROM activity_events
       WHERE (block_number > $1::bigint OR (block_number = $1::bigint AND log_index > $2) OR (block_number = $1::bigint AND log_index = $2 AND id > $3))
         AND ($4::text IS NULL OR kind = $4 OR event_name = $4)
         AND ($5::numeric IS NULL OR commander_id = $5::numeric)
         AND ($6::text IS NULL OR actor = $6)
         AND chain_id = $8
         AND ($9::text IS NULL OR contract_address = $9)
       ORDER BY block_number ASC, log_index ASC, id ASC LIMIT $7`,
      [cursor.blockNumber, cursor.logIndex, cursor.id, filters.eventType || null, filters.commanderId || null, filters.actor || null, limit, this.chainId, this.contractAddress?.toLowerCase() || null],
    )
    return rows.map(fromRow)
  }

  async insertMany(events: Array<DecodedActivity & { timestamp: number }>) {
    let inserted = 0
    for (const event of events) {
      const rows = await this.db.query<{ id: string }>(
        `INSERT INTO activity_events (id, chain_id, contract_address, transaction_hash, log_index, block_number, block_hash, event_name, kind, actor, commander_id, title, detail, payload, block_timestamp, confirmed)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,to_timestamp($15),true)
         ON CONFLICT (chain_id, contract_address, transaction_hash, log_index) DO NOTHING RETURNING id`,
        [event.id, this.chainId, event.contractAddress.toLowerCase(), event.txHash.toLowerCase(), event.logIndex, event.blockNumber, event.blockHash.toLowerCase(), event.eventName, event.kind, event.actor || null, event.commanderId || null, event.title, event.detail, JSON.stringify(event.payload), event.timestamp],
      )
      inserted += rows.length
    }
    return inserted
  }

  async getIndexerState(chainId: number, contractAddress: Address) {
    const [row] = await this.db.query<{ last_scanned_block: string; last_block_hash: Hex }>('SELECT last_scanned_block::text, last_block_hash FROM indexer_state WHERE chain_id=$1 AND contract_address=$2', [chainId, contractAddress.toLowerCase()])
    return row ? { lastBlock: BigInt(row.last_scanned_block), lastBlockHash: row.last_block_hash } : undefined
  }

  async setIndexerState(chainId: number, contractAddress: Address, state: IndexerState) {
    await this.db.query('INSERT INTO indexer_state (chain_id, contract_address, last_scanned_block, last_block_hash, updated_at) VALUES ($1,$2,$3,$4,now()) ON CONFLICT (chain_id, contract_address) DO UPDATE SET last_scanned_block=EXCLUDED.last_scanned_block,last_block_hash=EXCLUDED.last_block_hash,updated_at=now()', [chainId, contractAddress.toLowerCase(), state.lastBlock.toString(), state.lastBlockHash.toLowerCase()])
  }

  async deleteFromBlock(chainId: number, contractAddress: Address, blockNumber: bigint) {
    await this.db.query('DELETE FROM activity_events WHERE chain_id=$1 AND contract_address=$2 AND block_number >= $3::bigint', [chainId, contractAddress.toLowerCase(), blockNumber.toString()])
  }
}

export function pageCursors(items: ActivityEvent[]) {
  return {
    headCursor: items[0] ? cursorFor(items[0]) : null,
    nextCursor: items.length ? cursorFor(items[items.length - 1]) : null,
  }
}
