import { Pool } from 'pg'
import { drizzle } from 'drizzle-orm/node-postgres'
import * as schema from './schema'
import { logger } from '../lib/logger'

const connectionString =
  process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/resuchat'

export const pool = new Pool({
  connectionString,
  max: Number(process.env.DB_POOL_MAX) || 10,
  idleTimeoutMillis: Number(process.env.DB_POOL_IDLE) || 10000,
  connectionTimeoutMillis: Number(process.env.DB_POOL_TIMEOUT) || 5000
})

pool.on('error', (err) => {
  logger.error('DB pool idle client error', { error: err })
})

export const db = drizzle(pool, { schema })

export async function closeDb(): Promise<void> {
  await pool.end()
}

export type DbClient = typeof db
