import fs from 'node:fs/promises'
import path from 'node:path'
import { neon } from '@neondatabase/serverless'

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required')
const sql = neon(process.env.DATABASE_URL)
await sql.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())')

const directory = path.join(process.cwd(), 'db', 'migrations')
const files = (await fs.readdir(directory)).filter((name) => /^\d+.*\.sql$/.test(name)).sort()
for (const name of files) {
  const [applied] = await sql.query('SELECT name FROM schema_migrations WHERE name=$1', [name])
  if (applied) continue
  const source = await fs.readFile(path.join(directory, name), 'utf8')
  const statements = source.split(';').map((statement) => statement.trim()).filter(Boolean)
  for (const statement of statements) await sql.query(statement)
  await sql.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name])
  console.log(`Applied ${name}`)
}
