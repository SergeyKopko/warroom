import { neon } from '@neondatabase/serverless'

export type SqlClient = {
  query: <T extends Record<string, unknown> = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]>
}

let cached: SqlClient | undefined

export function getDb(databaseUrl = process.env.DATABASE_URL): SqlClient {
  if (!databaseUrl) throw new Error('DATABASE_URL is required')
  if (!cached) cached = neon(databaseUrl) as unknown as SqlClient
  return cached
}
