import { readFile, readdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { createPool } from "../db.js"

const directory = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../migrations")
const pool = createPool()

try {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `)
  const migrations = (await readdir(directory))
    .filter((name) => name.endsWith(".sql"))
    .sort()
  for (const name of migrations) {
    const exists = await pool.query("SELECT 1 FROM schema_migrations WHERE name = $1", [name])
    if (exists.rowCount) continue
    const sql = await readFile(path.join(directory, name), "utf8")
    const client = await pool.connect()
    try {
      await client.query("BEGIN")
      await client.query(sql)
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [name])
      await client.query("COMMIT")
      console.log(`Applied ${name}`)
    } catch (error) {
      await client.query("ROLLBACK")
      throw error
    } finally {
      client.release()
    }
  }
} catch (error) {
  console.error("Database migration failed:", error.message)
  process.exitCode = 1
} finally {
  await pool.end()
}
