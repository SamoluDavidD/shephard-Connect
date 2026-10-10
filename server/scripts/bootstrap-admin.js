import argon2 from "argon2"

import { createPool, inTransaction } from "../db.js"
import { createPublicId, createRecoveryCode, normalizeRecoveryCode } from "../security.js"

const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim()
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD
const displayName = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "Administrator"

if (!email || !password || password.length < 12) {
  throw new Error(
    "Set BOOTSTRAP_ADMIN_EMAIL and a BOOTSTRAP_ADMIN_PASSWORD of at least 12 characters.",
  )
}

const pool = createPool()
try {
  const recoveryCode = createRecoveryCode()
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id })
  const recoveryCodeHash = await argon2.hash(normalizeRecoveryCode(recoveryCode), {
    type: argon2.argon2id,
  })
  const publicId = createPublicId("SC")
  await inTransaction(pool, async (client) => {
    const existing = await client.query(
      "SELECT 1 FROM users WHERE role = 'superadmin' AND status = 'active' LIMIT 1",
    )
    if (existing.rowCount) {
      throw new Error("An active SuperAdmin already exists; bootstrap can only run once.")
    }
    const user = await client.query(
      `INSERT INTO users (public_id, account_type, role)
       VALUES ($1, 'registered', 'superadmin') RETURNING id`,
      [publicId],
    )
    await client.query(
      `INSERT INTO user_credentials
         (user_id, email, email_normalized, password_hash, recovery_code_hash)
       VALUES ($1, $2, $3, $4, $5)`,
      [user.rows[0].id, email, email.toLowerCase(), passwordHash, recoveryCodeHash],
    )
    await client.query(
      "INSERT INTO user_profiles (user_id, display_name) VALUES ($1, $2)",
      [user.rows[0].id, displayName],
    )
    await client.query(
      `INSERT INTO discipleship_progress (user_id, stage)
       SELECT $1, unnest($2::text[])`,
      [user.rows[0].id, ["Come", "Connect", "Counsel", "Follow Up", "Disciple", "Grow"]],
    )
    await client.query(
      `INSERT INTO audit_logs (actor_id, action, target_type, target_id)
       VALUES ($1, 'admin.bootstrap_created', 'user', $1)`,
      [user.rows[0].id],
    )
  })
  console.log(`SuperAdmin created. Public ID: ${publicId}`)
  console.log(`One-time recovery code (store securely): ${recoveryCode}`)
} finally {
  await pool.end()
}
