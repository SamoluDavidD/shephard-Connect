import { createHash, randomBytes, randomInt } from "node:crypto"

const publicIdAlphabet = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"

export function createPublicId(prefix) {
  const suffix = Array.from(
    { length: 8 },
    () => publicIdAlphabet[randomInt(publicIdAlphabet.length)],
  ).join("")
  return `${prefix}-${suffix}`
}

export function createRecoveryCode() {
  let raw = ""

  while (raw.length < 43) {
    raw += randomBytes(32).toString("base64url").toUpperCase().replace(/[^A-Z0-9]/g, "")
  }

  return raw.slice(0, 43).match(/.{1,4}/g).join("-")
}

export function normalizeRecoveryCode(value) {
  return value.replace(/[\s-]/g, "").toLowerCase()
}

export function hashSessionToken(token) {
  return createHash("sha256").update(token).digest()
}

export function createSessionToken() {
  return randomBytes(32).toString("base64url")
}

export function safeUser(row) {
  return {
    publicId: row.public_id,
    accountType: row.account_type,
    role: row.role,
    status: row.status,
    displayName: row.display_name || null,
  }
}

export function canAccessConversation(user, conversation) {
  if (user.status !== "active") return false
  if (user.account_type === "counselor" && user.role !== "counselor") return false
  if (
    (user.role === "anonymous" || user.role === "registered") &&
    conversation.seeker_id === user.id
  ) {
    return true
  }
  return user.role === "counselor" && conversation.counselor_id === user.id
}

export function isAllowedOrigin(origin, allowedOrigins) {
  return typeof origin === "string" && allowedOrigins.has(origin)
}
