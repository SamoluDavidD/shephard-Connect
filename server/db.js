import { readFileSync } from "node:fs"
import pg from "pg"

const { Pool } = pg

export function createPool(connectionString = process.env.DATABASE_URL) {
  if (!connectionString) {
    throw new Error("DATABASE_URL must be configured before starting the API.")
  }
  const sslEnabled = process.env.DATABASE_SSL === "true"
  const caFile = process.env.DATABASE_SSL_CA_FILE?.trim()
  if (caFile && !sslEnabled) {
    throw new Error("DATABASE_SSL must be true when DATABASE_SSL_CA_FILE is configured.")
  }
  const ssl = sslEnabled
    ? {
        rejectUnauthorized: true,
        ...(caFile ? { ca: readFileSync(caFile, "utf8") } : {}),
      }
    : undefined

  const pool = new Pool({
    connectionString,
    max: Number(process.env.DATABASE_POOL_SIZE || 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    ssl,
  })
  pool.on("error", (error) => {
    console.error("PostgreSQL idle connection error:", error.message)
  })
  return pool
}

export async function inTransaction(pool, callback) {
  const client = await pool.connect()
  try {
    await client.query("BEGIN")
    const result = await callback(client)
    await client.query("COMMIT")
    return result
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}
