import argon2 from "argon2"
import { randomBytes } from "node:crypto"
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import express from "express"
import multer from "multer"
import rateLimit from "express-rate-limit"
import helmet from "helmet"
import { z } from "zod"

import { inTransaction } from "./db.js"
import {
  canAccessConversation,
  createPublicId,
  createRecoveryCode,
  createSessionToken,
  hashSessionToken,
  isAllowedOrigin,
  normalizeRecoveryCode,
  safeUser,
} from "./security.js"

const COOKIE_NAME = "sc_session"
const SESSION_DAYS = 14
const privateDocumentDirectory = path.resolve(
  process.env.PRIVATE_DOCUMENT_DIR ||
    path.join(path.dirname(fileURLToPath(import.meta.url)), "../private-counselor-documents"),
)
const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024,
    files: 6,
    fields: 32,
    fieldSize: 32 * 1024,
  },
})
const homepageImageUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
})
const profilePictureUpload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024,
    files: 1,
  },
})
const passwordOptions = {
  type: argon2.argon2id,
  memoryCost: 65_536,
  timeCost: 3,
  parallelism: 1,
}
const stages = ["Come", "Connect", "Counsel", "Follow Up", "Disciple", "Grow"]
const userSelect = `
  SELECT u.id, u.public_id, u.account_type, u.role, u.status,
         p.display_name, c.password_hash, c.recovery_code_hash
  FROM users u
  JOIN user_credentials c ON c.user_id = u.id
  LEFT JOIN user_profiles p ON p.user_id = u.id
`
const authSchema = z.object({
  password: z.string().min(12).max(128),
})
const registeredSchema = authSchema.extend({
  email: z.string().trim().email().max(254),
  displayName: z.string().trim().min(1).max(80),
})
const optionalText = (max) =>
  z.union([z.string().trim().max(max), z.null()])
    .optional()
    .transform((value) => typeof value === "string" && value ? value : null)
const counselorApplicationSchema = authSchema.extend({
  email: z.string().trim().email().max(254),
  fullLegalName: z.string().trim().min(1).max(160),
  preferredDisplayName: optionalText(80),
  phone: optionalText(40),
  country: optionalText(100),
  generalLocation: optionalText(160),
  professionalTitle: optionalText(120),
  specialization: z.string().trim().min(1).max(160),
  highestQualification: optionalText(180),
  institution: optionalText(180),
  qualificationType: optionalText(120),
  completionYear: z.number().int().min(1900).max(2100).nullable().optional().transform((value) => value ?? null),
  certifications: optionalText(3000),
  yearsExperience: z.number().int().min(0).max(80).nullable().optional().transform((value) => value ?? null),
  licenseNumber: optionalText(160),
  licensingAuthority: optionalText(180),
  licenseExpiry: z.string().date().nullable().optional().transform((value) => value ?? null),
  biography: optionalText(5000),
  areasOfExpertise: z.array(z.string().trim().min(1).max(80)).max(12).nullable().optional().transform((value) => value ?? []),
  languages: z.array(z.string().trim().min(1).max(80)).max(12).nullable().optional().transform((value) => value ?? []),
  workHistory: optionalText(5000),
  referencesText: optionalText(3000),
  codeOfConductAccepted: z.literal(true),
  confidentialityAccepted: z.literal(true),
  safeguardingAccepted: z.literal(true),
})
const existingCounselorApplicationSchema = z.object({
  fullLegalName: z.string().trim().min(1).max(160),
  preferredDisplayName: optionalText(80),
  specialization: z.string().trim().min(1).max(160),
  codeOfConductAccepted: z.literal(true),
  confidentialityAccepted: z.literal(true),
  safeguardingAccepted: z.literal(true),
})
const recoverySchema = z.object({
  publicId: z.string().trim().min(4).max(24),
  recoveryCode: z.string().trim().min(24).max(128),
  newPassword: z.string().min(12).max(128),
})
const accountStatusSchema = z.object({
  status: z.enum(["active", "suspended", "deactivated"]),
})
const accountRoleSchema = z.object({
  role: z.enum(["registered", "counselor", "superadmin"]),
})

function getCookie(req, name) {
  const entry = req.headers.cookie
    ?.split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`))
  if (!entry) return null
  try {
    return decodeURIComponent(entry.slice(name.length + 1))
  } catch {
    return null
  }
}

function validateProfilePicture(file) {
  const bytes = file.buffer
  let detectedMime = null
  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    detectedMime = "image/jpeg"
  } else if (
    bytes.length >= 24 &&
    bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
    bytes.toString("ascii", 12, 16) === "IHDR"
  ) {
    detectedMime = "image/png"
  } else if (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  ) {
    detectedMime = "image/webp"
  }
  return detectedMime && file.mimetype === detectedMime ? detectedMime : null
}

function writeSessionCookie(res, token, secure) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/api",
    maxAge: SESSION_DAYS * 24 * 60 * 60 * 1000,
  })
}

function clearSessionCookie(res, secure) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure,
    sameSite: "strict",
    path: "/api",
  })
}

function sendInvalid(res) {
  return res.status(401).json({ error: "The supplied credentials could not be verified." })
}

function detectedHomepageImageType(buffer) {
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png"
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg"
  }
  if (
    buffer.length >= 12 &&
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WEBP"
  ) {
    return "image/webp"
  }
  return null
}

function validateBody(schema, req, res) {
  const result = schema.safeParse(req.body)
  if (!result.success) {
    res.status(400).json({ error: "Check the submitted information and try again." })
    return null
  }
  return result.data
}

async function appendAudit(client, actorId, action, targetType, targetId = null, metadata = {}) {
  await client.query(
    `INSERT INTO audit_logs (actor_id, action, target_type, target_id, metadata)
     VALUES ($1, $2, $3, $4, $5::jsonb)`,
    [actorId, action, targetType, targetId, JSON.stringify(metadata)],
  )
}

async function issueSession(client, userId, res, secure) {
  const token = createSessionToken()
  await client.query(
    `INSERT INTO sessions (user_id, token_hash, expires_at)
     VALUES ($1, $2, now() + ($3 * interval '1 day'))`,
    [userId, hashSessionToken(token), SESSION_DAYS],
  )
  writeSessionCookie(res, token, secure)
}

async function createAccount(client, { accountType, email, displayName, password }) {
  const publicId = createPublicId(
    accountType === "anonymous" ? "AN" : accountType === "counselor" ? "CA" : "SC",
  )
  const role = accountType === "counselor" ? "registered" : accountType
  const recoveryCode = createRecoveryCode()
  const [passwordHash, recoveryCodeHash] = await Promise.all([
    argon2.hash(password, passwordOptions),
    argon2.hash(normalizeRecoveryCode(recoveryCode), passwordOptions),
  ])
  const userResult = await client.query(
    `INSERT INTO users (public_id, account_type, role)
     VALUES ($1, $2, $3)
     RETURNING id, public_id, account_type, role, status`,
    [publicId, accountType, role],
  )
  const user = userResult.rows[0]
  const normalizedEmail = email ? email.trim().toLowerCase() : null
  await client.query(
    `INSERT INTO user_credentials
       (user_id, email, email_normalized, password_hash, recovery_code_hash)
     VALUES ($1, $2, $3, $4, $5)`,
    [user.id, email || null, normalizedEmail, passwordHash, recoveryCodeHash],
  )
  await client.query(
    `INSERT INTO user_profiles (user_id, display_name) VALUES ($1, $2)`,
    [user.id, displayName || null],
  )
  await client.query(
    `INSERT INTO discipleship_progress (user_id, stage)
     SELECT $1, unnest($2::text[])`,
    [user.id, stages],
  )
  await appendAudit(client, user.id, "account.created", "user", user.id, {
    accountType,
  })
  return { user: { ...user, display_name: displayName || null }, recoveryCode }
}

function uploadedFiles(files) {
  return Object.values(files || {}).flat()
}

function validateDocumentFile(file, category) {
  const bytes = file.buffer
  let detectedMime = null
  if (bytes.subarray(0, 5).toString("ascii") === "%PDF-") detectedMime = "application/pdf"
  else if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    detectedMime = "image/jpeg"
  } else if (bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    detectedMime = "image/png"
  }
  if (
    !detectedMime ||
    file.mimetype !== detectedMime ||
    (category === "profile_photo" && !detectedMime.startsWith("image/"))
  ) {
    return null
  }
  return detectedMime
}

function safeDocumentName(name) {
  return path.basename(name).replace(/[\r\n"]/g, "_").slice(0, 180) || "document"
}

async function savePrivateDocument(file, directory = privateDocumentDirectory) {
  const storageKey = randomBytes(32).toString("hex")
  await mkdir(directory, { recursive: true, mode: 0o700 })
  await writeFile(path.join(directory, storageKey), file.buffer, {
    flag: "wx",
    mode: 0o600,
  })
  return storageKey
}

async function removePrivateDocuments(storageKeys, directory = privateDocumentDirectory) {
  await Promise.all(
    storageKeys.map(async (key) => {
      try {
        await unlink(path.join(directory, key))
      } catch (error) {
        if (error.code !== "ENOENT") throw error
      }
    }),
  )
}

function publicDocumentMetadata(row) {
  return {
    id: row.id,
    category: row.category,
    status: row.status,
    originalName: row.original_name || null,
    mimeType: row.mime_type || null,
    byteSize: row.byte_size || null,
    uploadedAt: row.uploaded_at || null,
    requestedAt: row.requested_at || null,
  }
}

function safeAccountRecord(row) {
  return {
    publicId: row.public_id,
    accountType: row.account_type,
    role: row.role,
    status: row.status,
    displayName: row.display_name || null,
    createdAt: row.created_at,
    approved: row.approved ?? undefined,
    areas: row.areas ?? undefined,
    safeguardingReview: row.safeguarding_review ?? undefined,
  }
}

export function createApp({
  pool,
  allowedOrigins = process.env.APP_ORIGINS ||
    "http://localhost:8443,http://127.0.0.1:8443",
  secureCookies = process.env.NODE_ENV === "production",
  logger = console,
  privateDocumentPath = privateDocumentDirectory,
} = {}) {
  if (!pool) throw new Error("A PostgreSQL pool is required to create the API.")
  if (secureCookies && !process.env.APP_ORIGINS) {
    throw new Error("APP_ORIGINS must be configured when production cookies are enabled.")
  }

  const origins = new Set(
    allowedOrigins.split(",").map((origin) => origin.trim()).filter(Boolean),
  )
  const app = express()
  app.disable("x-powered-by")
  app.use(helmet())
  app.use(express.json({ limit: "32kb", strict: true }))
  app.use((req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method) || req.path === "/health") {
      return next()
    }
    if (!isAllowedOrigin(req.get("origin"), origins)) {
      return res.status(403).json({ error: "This request origin is not allowed." })
    }
    next()
  })

  app.get("/health", async (_req, res, next) => {
    try {
      await pool.query("SELECT 1")
      res.json({ status: "ok" })
    } catch (error) {
      next(error)
    }
  })

  app.get("/api/site-settings", async (_req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT homepage_image_alt, homepage_image_updated_at
         FROM site_settings WHERE id = true`,
      )
      const updatedAt = result.rows[0]?.homepage_image_updated_at || null
      res.json({
        homepageImageUrl: updatedAt
          ? `/site-settings/homepage-image?v=${encodeURIComponent(new Date(updatedAt).toISOString())}`
          : null,
        homepageImageUpdatedAt: updatedAt,
        homepageImageAlt: result.rows[0]?.homepage_image_alt || "",
      })
    } catch (error) {
      next(error)
    }
  })

  app.get("/api/site-settings/homepage-image", async (_req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT homepage_image, homepage_image_type, homepage_image_updated_at
         FROM site_settings WHERE id = true`,
      )
      const setting = result.rows[0]
      if (!setting?.homepage_image) {
        return res.status(404).json({ error: "No homepage image has been configured." })
      }
      res.set({
        "Cache-Control": "public, max-age=31536000, immutable",
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "X-Content-Type-Options": "nosniff",
      })
      res.type(setting.homepage_image_type).send(setting.homepage_image)
    } catch (error) {
      next(error)
    }
  })

  const authLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 8,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many attempts. Please wait before trying again." },
  })
  app.use("/api/auth", authLimit)

  const requireAuth = async (req, res, next) => {
    try {
      const token = getCookie(req, COOKIE_NAME)
      if (!token) return sendInvalid(res)
      const result = await pool.query(
        `${userSelect}
         JOIN sessions s ON s.user_id = u.id
         WHERE s.token_hash = $1 AND s.revoked_at IS NULL
           AND s.expires_at > now() AND u.status = 'active'`,
        [hashSessionToken(token)],
      )
      const user = result.rows[0]
      if (!user) return sendInvalid(res)
      req.user = user
      req.sessionTokenHash = hashSessionToken(token)
      await pool.query(
        "UPDATE sessions SET last_seen_at = now() WHERE token_hash = $1",
        [req.sessionTokenHash],
      )
      next()
    } catch (error) {
      next(error)
    }
  }

  const requireRole = (...roles) => (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "You are not permitted to perform this action." })
    }
    next()
  }

  const requireSeeker = (req, res, next) => {
    if (req.user.account_type === "counselor") {
      return res.status(403).json({ error: "Counselor applicants may only use their application account features." })
    }
    return requireRole("anonymous", "registered")(req, res, next)
  }
  const requireAdmin = requireRole("superadmin")
  const authUser = (req) => safeUser(req.user)

  app.post("/api/auth/anonymous", async (req, res, next) => {
    const input = validateBody(authSchema, req, res)
    if (!input) return
    try {
      const result = await inTransaction(pool, async (client) => {
        const account = await createAccount(client, {
          accountType: "anonymous",
          password: input.password,
        })
        await issueSession(client, account.user.id, res, secureCookies)
        return account
      })
      res.status(201).json({
        user: safeUser(result.user),
        recoveryCode: result.recoveryCode,
        recoveryCodeWarning: "Save this code privately. It is shown once and cannot be restored.",
      })
    } catch (error) {
      if (error.code === "23505") {
        return res.status(503).json({ error: "An account could not be created right now." })
      }
      next(error)
    }
  })

  app.post("/api/auth/register", profilePictureUpload.single("profilePicture"), async (req, res, next) => {
    let payload = req.body
    if (req.file) {
      try {
        payload = JSON.parse(req.body.profile)
      } catch {
        return res.status(400).json({ error: "Check the submitted account information." })
      }
    }
    const parsed = registeredSchema.extend({ consent: z.literal(true) }).safeParse(payload)
    if (!parsed.success) {
      return res.status(400).json({ error: "Check the submitted account information." })
    }
    const input = parsed.data
    const pictureMimeType = req.file ? validateProfilePicture(req.file) : null
    if (req.file && !pictureMimeType) {
      return res.status(400).json({ error: "Profile pictures must be valid JPEG, PNG, or WebP images." })
    }
    const storedKeys = []
    try {
      const result = await inTransaction(pool, async (client) => {
        const account = await createAccount(client, {
          accountType: "registered",
          email: input.email,
          displayName: input.displayName,
          password: input.password,
        })
        if (req.file && pictureMimeType) {
          const storageKey = await savePrivateDocument(req.file, privateDocumentPath)
          storedKeys.push(storageKey)
          await client.query(
            `UPDATE user_profiles
             SET picture_storage_key = $2, picture_mime_type = $3, updated_at = now()
             WHERE user_id = $1`,
            [account.user.id, storageKey, pictureMimeType],
          )
        }
        await issueSession(client, account.user.id, res, secureCookies)
        return account
      })
      res.status(201).json({
        user: safeUser(result.user),
        recoveryCode: result.recoveryCode,
        recoveryCodeWarning: "Save this code privately. It is shown once and cannot be restored.",
      })
    } catch (error) {
      if (storedKeys.length) await removePrivateDocuments(storedKeys, privateDocumentPath)
      if (error.code === "23505") {
        return res.status(409).json({ error: "An account could not be created with those details." })
      }
      next(error)
    }
  })

  app.post(
    "/api/auth/counselor",
    documentUpload.fields([
      { name: "qualificationDocuments", maxCount: 5 },
      { name: "licenseDocuments", maxCount: 5 },
      { name: "supportingDocuments", maxCount: 5 },
      { name: "profilePhoto", maxCount: 1 },
      { name: "profilePicture", maxCount: 1 },
    ]),
    async (req, res, next) => {
      let payload
      try {
        payload = JSON.parse(req.body.application)
      } catch {
        return res.status(400).json({ error: "Check the submitted counselor application." })
      }
      const parsed = counselorApplicationSchema.safeParse(payload)
      if (!parsed.success) {
        return res.status(400).json({ error: "Check the submitted counselor application." })
      }

      const categoryByField = {
        qualificationDocuments: "qualification",
        licenseDocuments: "license",
        supportingDocuments: "supporting",
        profilePhoto: "profile_photo",
      }
      const files = uploadedFiles(req.files)
      const profilePicture = req.files?.profilePicture?.[0]
      const profilePictureMimeType = profilePicture
        ? validateProfilePicture(profilePicture)
        : null
      if (profilePicture?.size > 5 * 1024 * 1024) {
        return res.status(413).json({ error: "Profile pictures must be 5 MB or smaller." })
      }
      if (profilePicture && !profilePictureMimeType) {
        return res.status(400).json({
          error: "Profile pictures must be valid JPEG, PNG, or WebP images.",
        })
      }
      const preparedFiles = files.filter((file) => file.fieldname !== "profilePicture").map((file) => ({
        file,
        category: categoryByField[file.fieldname],
        mimeType: validateDocumentFile(file, categoryByField[file.fieldname]),
      }))
      if (preparedFiles.some(({ mimeType }) => !mimeType)) {
        return res.status(400).json({
          error: "Documents must be valid PDF, JPEG, or PNG files; profile photos must be images.",
        })
      }

      const input = {
        ...parsed.data,
        preferredDisplayName: parsed.data.preferredDisplayName || parsed.data.fullLegalName,
      }
      const storedKeys = []
      try {
        const result = await inTransaction(pool, async (client) => {
          const account = await createAccount(client, {
            accountType: "counselor",
            email: input.email,
            displayName: input.preferredDisplayName,
            password: input.password,
          })
          if (profilePicture && profilePictureMimeType) {
            const storageKey = await savePrivateDocument(profilePicture, privateDocumentPath)
            storedKeys.push(storageKey)
            await client.query(
              `UPDATE user_profiles
               SET picture_storage_key = $2, picture_mime_type = $3, updated_at = now()
               WHERE user_id = $1`,
              [account.user.id, storageKey, profilePictureMimeType],
            )
          }
          const applicationRef = createPublicId("CA")
          const applicationResult = await client.query(
            `INSERT INTO counselor_applications (
               public_ref, user_id, full_legal_name, preferred_display_name, phone,
               country, general_location, professional_title, specialization,
               highest_qualification, institution, qualification_type, completion_year,
               certifications, years_experience, license_number, licensing_authority,
               license_expiry, biography, areas_of_expertise, languages, work_history,
               references_text, code_of_conduct_accepted, confidentiality_accepted,
               safeguarding_accepted
             ) VALUES (
               $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
               $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
             ) RETURNING id, status, submitted_at`,
            [
              applicationRef,
              account.user.id,
              input.fullLegalName,
              input.preferredDisplayName,
              input.phone,
              input.country,
              input.generalLocation,
              input.professionalTitle,
              input.specialization,
              input.highestQualification,
              input.institution,
              input.qualificationType,
              input.completionYear,
              input.certifications,
              input.yearsExperience,
              input.licenseNumber,
              input.licensingAuthority,
              input.licenseExpiry,
              input.biography,
              input.areasOfExpertise,
              input.languages,
              input.workHistory,
              input.referencesText,
              input.codeOfConductAccepted,
              input.confidentialityAccepted,
              input.safeguardingAccepted,
            ],
          )
          const application = applicationResult.rows[0]
          if (input.highestQualification && input.institution && input.qualificationType) {
            await client.query(
              `INSERT INTO counselor_qualifications
                 (application_id, qualification, institution, qualification_type, completion_year)
               VALUES ($1, $2, $3, $4, $5)`,
              [
                application.id,
                input.highestQualification,
                input.institution,
                input.qualificationType,
                input.completionYear,
              ],
            )
          }

          for (const item of preparedFiles) {
            const storageKey = await savePrivateDocument(item.file, privateDocumentPath)
            storedKeys.push(storageKey)
            await client.query(
              `INSERT INTO counselor_documents
                 (application_id, category, status, storage_key, original_name,
                  mime_type, byte_size, uploaded_by, uploaded_at)
               VALUES ($1, $2, 'uploaded', $3, $4, $5, $6, $7, now())`,
              [
                application.id,
                item.category,
                storageKey,
                safeDocumentName(item.file.originalname),
                item.mimeType,
                item.file.size,
                account.user.id,
              ],
            )
          }
          await client.query(
            `INSERT INTO user_notifications (user_id, application_id, kind, title, message)
             SELECT id, $1, 'counselor_application', 'New counselor application',
                    'A counselor application is ready for review (' || $2 || ').'
             FROM users WHERE role = 'superadmin' AND status = 'active'`,
            [application.id, applicationRef],
          )
          await issueSession(client, account.user.id, res, secureCookies)
          await appendAudit(client, account.user.id, "counselor.application_submitted", "counselor_application", application.id)
          return {
            user: account.user,
            recoveryCode: account.recoveryCode,
            application: {
              publicRef: applicationRef,
              status: application.status,
              submittedAt: application.submitted_at,
            },
          }
        })
        res.status(201).json({
          user: safeUser(result.user),
          recoveryCode: result.recoveryCode,
          recoveryCodeWarning: "Save your recovery code privately. Your counselor application is not approval to provide counseling.",
          application: result.application,
        })
      } catch (error) {
        if (storedKeys.length) await removePrivateDocuments(storedKeys, privateDocumentPath)
        if (error.code === "23505") {
          if (error.constraint === "user_credentials_email_normalized_key") {
            return res.status(409).json({
              error: "This email is already attached to an account. Sign in to that account, then apply from Account settings.",
            })
          }
          return res.status(409).json({ error: "An account could not be created with those details." })
        }
        next(error)
      }
    },
  )

  app.post("/api/counselor/applications", requireAuth, requireRole("registered"), async (req, res, next) => {
    if (req.user.account_type !== "registered") {
      return res.status(403).json({ error: "Only regular user accounts can apply for counselor access." })
    }
    const input = validateBody(existingCounselorApplicationSchema, req, res)
    if (!input) return
    try {
      const result = await inTransaction(pool, async (client) => {
        const existing = await client.query(
          "SELECT id FROM counselor_applications WHERE user_id = $1",
          [req.user.id],
        )
        if (existing.rowCount) return { conflict: true }

        const applicationRef = createPublicId("CA")
        const preferredDisplayName = input.preferredDisplayName || input.fullLegalName
        const created = await client.query(
          `INSERT INTO counselor_applications (
             public_ref, user_id, full_legal_name, preferred_display_name, phone,
             country, general_location, professional_title, specialization,
             highest_qualification, institution, qualification_type, completion_year,
             certifications, years_experience, license_number, licensing_authority,
             license_expiry, biography, areas_of_expertise, languages, work_history,
             references_text, code_of_conduct_accepted, confidentiality_accepted,
             safeguarding_accepted
           ) VALUES (
             $1, $2, $3, $4, NULL, NULL, NULL, NULL, $5, NULL, NULL, NULL, NULL,
             NULL, NULL, NULL, NULL, NULL, NULL, '{}', '{}', NULL, NULL, true, true, true
           ) RETURNING id, status, submitted_at`,
          [
            applicationRef,
            req.user.id,
            input.fullLegalName,
            preferredDisplayName,
            input.specialization,
          ],
        )
        const application = created.rows[0]
        const promoted = await client.query(
          `UPDATE users SET account_type = 'counselor', updated_at = now()
           WHERE id = $1 AND account_type = 'registered' AND role = 'registered'`,
          [req.user.id],
        )
        if (!promoted.rowCount) throw new Error("The applicant account could not be updated.")
        await client.query(
          `UPDATE user_profiles SET display_name = $2, updated_at = now()
           WHERE user_id = $1`,
          [req.user.id, preferredDisplayName],
        )
        await client.query(
          `INSERT INTO user_notifications (user_id, application_id, kind, title, message)
           SELECT id, $1, 'counselor_application', 'New counselor application',
                  'A counselor application is ready for review (' || $2 || ').'
           FROM users WHERE role = 'superadmin' AND status = 'active'`,
          [application.id, applicationRef],
        )
        await appendAudit(
          client,
          req.user.id,
          "counselor.application_submitted",
          "counselor_application",
          application.id,
        )
        return { application, preferredDisplayName, publicRef: applicationRef }
      })
      if (result.conflict) {
        return res.status(409).json({ error: "A counselor application already exists for this account." })
      }
      res.status(201).json({
        user: safeUser({
          ...req.user,
          account_type: "counselor",
          display_name: result.preferredDisplayName,
        }),
        application: {
          publicRef: result.publicRef,
          status: result.application.status,
          submittedAt: result.application.submitted_at,
        },
      })
    } catch (error) {
      next(error)
    }
  })

  const loginSchema = z.object({
    login: z.string().trim().min(1).max(254),
    password: z.string().min(1).max(128),
  })
  const dummyHash = argon2.hash(randomBytes(32).toString("hex"), passwordOptions)

  app.post("/api/auth/login", async (req, res, next) => {
    const input = validateBody(loginSchema, req, res)
    if (!input) return
    try {
      const login = input.login.trim()
      const result = await pool.query(
        `${userSelect}
         WHERE (c.email_normalized = $1 OR u.public_id = upper($1))
         LIMIT 1`,
        [login.toLowerCase()],
      )
      const user = result.rows[0]
      const valid = await argon2.verify(
        user?.password_hash || (await dummyHash),
        input.password,
      )
      if (!user || !valid || user.status !== "active") return sendInvalid(res)
      await inTransaction(pool, async (client) => {
        await issueSession(client, user.id, res, secureCookies)
        await appendAudit(client, user.id, "session.created", "session", null)
      })
      res.json({ user: safeUser(user) })
    } catch (error) {
      next(error)
    }
  })

  app.post("/api/auth/recover", async (req, res, next) => {
    const input = validateBody(recoverySchema, req, res)
    if (!input) return
    try {
      const result = await inTransaction(pool, async (client) => {
        const lookup = await client.query(
          `${userSelect}
           WHERE u.public_id = upper($1)
           FOR UPDATE OF u, c`,
          [input.publicId],
        )
        const user = lookup.rows[0]
        const valid = await argon2.verify(
          user?.recovery_code_hash || (await dummyHash),
          normalizeRecoveryCode(input.recoveryCode),
        )
        if (!user || !valid || user.status !== "active") return null
        const replacementCode = createRecoveryCode()
        const [passwordHash, recoveryHash] = await Promise.all([
          argon2.hash(input.newPassword, passwordOptions),
          argon2.hash(normalizeRecoveryCode(replacementCode), passwordOptions),
        ])
        await client.query(
          `UPDATE user_credentials SET password_hash = $2, recovery_code_hash = $3,
             updated_at = now() WHERE user_id = $1`,
          [user.id, passwordHash, recoveryHash],
        )
        await client.query(
          "UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
          [user.id],
        )
        await issueSession(client, user.id, res, secureCookies)
        await appendAudit(client, user.id, "account.recovered", "user", user.id)
        return { user, recoveryCode: replacementCode }
      })
      if (!result) return sendInvalid(res)
      res.json({
        user: safeUser(result.user),
        recoveryCode: result.recoveryCode,
        recoveryCodeWarning: "Your previous recovery code is now invalid. Save this replacement privately.",
      })
    } catch (error) {
      next(error)
    }
  })

  app.post("/api/auth/logout", requireAuth, async (req, res, next) => {
    try {
      await pool.query(
        "UPDATE sessions SET revoked_at = now() WHERE token_hash = $1 AND revoked_at IS NULL",
        [req.sessionTokenHash],
      )
      clearSessionCookie(res, secureCookies)
      res.status(204).end()
    } catch (error) {
      next(error)
    }
  })

  app.get("/api/me", requireAuth, (req, res) => {
    res.json({ user: authUser(req) })
  })

  app.get("/api/me/profile", requireAuth, async (req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT display_name, bio, picture_storage_key, updated_at
         FROM user_profiles WHERE user_id = $1`,
        [req.user.id],
      )
      if (!result.rows[0]) return res.status(404).json({ error: "Profile was not found." })
      const profile = result.rows[0]
      res.json({
        profile: {
          displayName: profile.display_name,
          bio: profile.bio,
          pictureUrl: profile.picture_storage_key
            ? `/me/profile/picture?v=${encodeURIComponent(new Date(profile.updated_at).toISOString())}`
            : null,
        },
      })
    } catch (error) {
      next(error)
    }
  })

  app.get("/api/me/profile/picture", requireAuth, async (req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT picture_storage_key, picture_mime_type
         FROM user_profiles WHERE user_id = $1`,
        [req.user.id],
      )
      const profile = result.rows[0]
      if (!profile?.picture_storage_key) {
        return res.status(404).json({ error: "No profile picture is set." })
      }
      if (!/^[a-f0-9]{64}$/.test(profile.picture_storage_key)) {
        throw new Error("Stored profile picture key is invalid.")
      }
      const contents = await readFile(path.join(privateDocumentPath, profile.picture_storage_key))
      res.set({
        "Cache-Control": "private, no-store",
        "Content-Type": profile.picture_mime_type,
        "X-Content-Type-Options": "nosniff",
      })
      res.send(contents)
    } catch (error) {
      if (error.code === "ENOENT") {
        return res.status(404).json({ error: "Profile picture is unavailable." })
      }
      next(error)
    }
  })

  app.put("/api/me/profile/picture", requireAuth, profilePictureUpload.single("picture"), async (req, res, next) => {
    if (!req.file) return res.status(400).json({ error: "Choose a profile picture to upload." })
    const mimeType = validateProfilePicture(req.file)
    if (!mimeType) {
      return res.status(400).json({ error: "Profile pictures must be valid JPEG, PNG, or WebP images." })
    }
    let storageKey
    let updated = false
    try {
      storageKey = await savePrivateDocument(req.file, privateDocumentPath)
      const result = await inTransaction(pool, async (client) => {
        const current = await client.query(
          `SELECT picture_storage_key FROM user_profiles
           WHERE user_id = $1 FOR UPDATE`,
          [req.user.id],
        )
        if (!current.rows[0]) return null
        await client.query(
          `UPDATE user_profiles
           SET picture_storage_key = $2, picture_mime_type = $3, updated_at = now()
           WHERE user_id = $1`,
          [req.user.id, storageKey, mimeType],
        )
        return { previousKey: current.rows[0].picture_storage_key }
      })
      if (result === null) {
        await removePrivateDocuments([storageKey], privateDocumentPath)
        return res.status(404).json({ error: "Profile was not found." })
      }
      updated = true
      if (result.previousKey) {
        try {
          await removePrivateDocuments([result.previousKey], privateDocumentPath)
        } catch (error) {
          logger.error?.("Replaced profile picture could not be removed:", error.message)
        }
      }
      res.json({ pictureUrl: `/me/profile/picture?v=${Date.now()}` })
    } catch (error) {
      if (storageKey && !updated) await removePrivateDocuments([storageKey], privateDocumentPath)
      next(error)
    }
  })

  app.delete("/api/me/profile/picture", requireAuth, async (req, res, next) => {
    try {
      const previousKey = await inTransaction(pool, async (client) => {
        const current = await client.query(
          `SELECT picture_storage_key FROM user_profiles
           WHERE user_id = $1 FOR UPDATE`,
          [req.user.id],
        )
        if (!current.rows[0]) return undefined
        await client.query(
          `UPDATE user_profiles
           SET picture_storage_key = NULL, picture_mime_type = NULL, updated_at = now()
           WHERE user_id = $1`,
          [req.user.id],
        )
        return current.rows[0].picture_storage_key
      })
      if (previousKey === undefined) return res.status(404).json({ error: "Profile was not found." })
      if (previousKey) {
        try {
          await removePrivateDocuments([previousKey], privateDocumentPath)
        } catch (error) {
          logger.error?.("Removed profile picture file could not be deleted:", error.message)
        }
      }
      res.status(204).end()
    } catch (error) {
      next(error)
    }
  })

  app.get("/api/counselor/applications/me", requireAuth, async (req, res, next) => {
    if (req.user.account_type !== "counselor") {
      return res.status(404).json({ error: "The requested record was not found." })
    }
    try {
      const result = await pool.query(
        `SELECT public_ref, status, submitted_at, updated_at
         FROM counselor_applications WHERE user_id = $1`,
        [req.user.id],
      )
      const application = result.rows[0]
      if (!application) return res.status(404).json({ error: "The requested record was not found." })
      const [documents, requests] = await Promise.all([
        pool.query(
          `SELECT id, category, status, original_name, mime_type, byte_size, uploaded_at, requested_at
           FROM counselor_documents WHERE application_id = (
             SELECT id FROM counselor_applications WHERE user_id = $1
           ) ORDER BY created_at`,
          [req.user.id],
        ),
        pool.query(
          `SELECT reason, requested_document_categories, created_at FROM counselor_reviews
           WHERE application_id = (
             SELECT id FROM counselor_applications WHERE user_id = $1
           ) AND action = 'REQUESTED_MORE_INFORMATION'
           ORDER BY created_at DESC`,
          [req.user.id],
        ),
      ])
      const requestedDocumentCategories = requests.rows.flatMap((row) =>
        Array.isArray(row.requested_document_categories)
          ? row.requested_document_categories
          : [],
      )
      const fallbackDocuments = requestedDocumentCategories.map((category, index) => ({
        id: `${application.public_ref}-${category}-${index}`,
        category,
        status: "requested",
        original_name: null,
        mime_type: null,
        byte_size: null,
        uploaded_at: null,
        requested_at: requests.rows[0]?.created_at || null,
      }))
      res.json({
        application: {
          publicRef: application.public_ref,
          status: application.status,
          submittedAt: application.submitted_at,
          updatedAt: application.updated_at,
          documents: documents.rows.length
            ? documents.rows.map(publicDocumentMetadata)
            : fallbackDocuments.map(publicDocumentMetadata),
          informationRequests: requests.rows,
        },
      })
    } catch (error) {
      next(error)
    }
  })

  app.post("/api/counselor/applications/:publicRef/responses", requireAuth, async (req, res, next) => {
    if (req.user.account_type !== "counselor") {
      return res.status(404).json({ error: "The requested record was not found." })
    }
    const input = validateBody(
      z.object({ message: z.string().trim().min(1).max(3000) }),
      req,
      res,
    )
    if (!input) return
    try {
      const result = await inTransaction(pool, async (client) => {
        const found = await client.query(
          `SELECT id, status FROM counselor_applications
           WHERE public_ref = upper($1) AND user_id = $2 FOR UPDATE`,
          [req.params.publicRef, req.user.id],
        )
        const application = found.rows[0]
        if (!application) return { missing: true }
        if (application.status !== "MORE_INFORMATION_REQUIRED") return { conflict: true }
        const response = await client.query(
          `INSERT INTO counselor_application_responses (application_id, applicant_id, message)
           VALUES ($1, $2, $3) RETURNING created_at`,
          [application.id, req.user.id, input.message],
        )
        await client.query(
          `INSERT INTO user_notifications (user_id, application_id, kind, title, message)
           SELECT id, $1, 'counselor_application_update', 'Applicant response received',
                  'An applicant has responded to a request for more information.'
           FROM users WHERE role = 'superadmin' AND status = 'active'`,
          [application.id],
        )
        await appendAudit(
          client,
          req.user.id,
          "counselor.application_information_submitted",
          "counselor_application",
          application.id,
        )
        return { createdAt: response.rows[0].created_at }
      })
      if (result.missing) return res.status(404).json({ error: "The requested record was not found." })
      if (result.conflict) {
        return res.status(409).json({ error: "The application is not awaiting additional information." })
      }
      res.status(201).json({ response: result })
    } catch (error) {
      next(error)
    }
  })

  app.get("/api/notifications", requireAuth, async (req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT id, kind, title, message, created_at, read_at
         FROM user_notifications WHERE user_id = $1
         ORDER BY created_at DESC LIMIT 50`,
        [req.user.id],
      )
      res.json({ notifications: result.rows })
    } catch (error) {
      next(error)
    }
  })

  app.patch("/api/notifications/:id/read", requireAuth, async (req, res, next) => {
    const id = z.string().uuid().safeParse(req.params.id)
    if (!id.success) return res.status(400).json({ error: "Invalid notification identifier." })
    try {
      const result = await pool.query(
        `UPDATE user_notifications SET read_at = COALESCE(read_at, now())
         WHERE id = $1 AND user_id = $2 RETURNING id`,
        [id.data, req.user.id],
      )
      if (!result.rowCount) return res.status(404).json({ error: "The requested record was not found." })
      res.status(204).end()
    } catch (error) {
      next(error)
    }
  })

  app.post(
    "/api/counselor/applications/:publicRef/documents",
    requireAuth,
    documentUpload.fields([
      { name: "qualificationDocuments", maxCount: 5 },
      { name: "licenseDocuments", maxCount: 5 },
      { name: "supportingDocuments", maxCount: 5 },
    ]),
    async (req, res, next) => {
      if (req.user.account_type !== "counselor") {
        return res.status(404).json({ error: "The requested record was not found." })
      }
      const categoryByField = {
        qualificationDocuments: "qualification",
        licenseDocuments: "license",
        supportingDocuments: "supporting",
      }
      const files = uploadedFiles(req.files)
      if (!files.length) {
        return res.status(400).json({ error: "Select at least one requested document to upload." })
      }
      const preparedFiles = files.map((file) => ({
        file,
        category: categoryByField[file.fieldname],
        mimeType: validateDocumentFile(file, categoryByField[file.fieldname]),
      }))
      if (preparedFiles.some(({ mimeType }) => !mimeType)) {
        return res.status(400).json({ error: "Documents must be valid PDF, JPEG, or PNG files." })
      }

      const storedKeys = []
      try {
        const result = await inTransaction(pool, async (client) => {
          const found = await client.query(
            `SELECT id, status FROM counselor_applications
             WHERE public_ref = upper($1) AND user_id = $2 FOR UPDATE`,
            [req.params.publicRef, req.user.id],
          )
          const application = found.rows[0]
          if (!application) return { missing: true }
          if (application.status !== "MORE_INFORMATION_REQUIRED") return { conflict: true }

          const matchedRequests = []
          const categoryOffsets = new Map()
          for (const item of preparedFiles) {
            const offset = categoryOffsets.get(item.category) || 0
            const requested = await client.query(
              `SELECT id FROM counselor_documents
               WHERE application_id = $1 AND category = $2 AND status = 'requested'
              ORDER BY requested_at LIMIT 1 OFFSET $3 FOR UPDATE`,
              [application.id, item.category, offset],
            )
            if (!requested.rows[0]) return { unrequested: true }
            matchedRequests.push(requested.rows[0].id)
            categoryOffsets.set(item.category, offset + 1)
          }

          const uploaded = []
          for (const [index, item] of preparedFiles.entries()) {
            const storageKey = await savePrivateDocument(item.file, privateDocumentPath)
            storedKeys.push(storageKey)
            const updated = await client.query(
              `UPDATE counselor_documents SET status = 'uploaded', storage_key = $2,
                 original_name = $3, mime_type = $4, byte_size = $5,
                 uploaded_by = $6, uploaded_at = now()
               WHERE id = $1
               RETURNING id, category, status, original_name, mime_type,
                         byte_size, uploaded_at, requested_at`,
              [
                matchedRequests[index],
                storageKey,
                safeDocumentName(item.file.originalname),
                item.mimeType,
                item.file.size,
                req.user.id,
              ],
            )
            uploaded.push(updated.rows[0])
          }
          await client.query(
            "UPDATE counselor_applications SET updated_at = now() WHERE id = $1",
            [application.id],
          )
          await appendAudit(client, req.user.id, "counselor.documents_submitted", "counselor_application", application.id, {
            documentCount: uploaded.length,
          })
          return { uploaded }
        })
        if (result.missing) return res.status(404).json({ error: "The requested record was not found." })
        if (result.conflict) {
          return res.status(409).json({ error: "The application has no outstanding document request." })
        }
        if (result.unrequested) {
          return res.status(400).json({ error: "Only documents requested for this application may be uploaded." })
        }
        res.status(201).json({ documents: result.uploaded.map(publicDocumentMetadata) })
      } catch (error) {
        if (storedKeys.length) await removePrivateDocuments(storedKeys, privateDocumentPath)
        next(error)
      }
    },
  )

  app.patch("/api/me", requireAuth, async (req, res, next) => {
    const input = validateBody(
      z.object({
        displayName: z.string().trim().min(1).max(80).nullable(),
        bio: z.string().trim().max(1000).optional(),
      }),
      req,
      res,
    )
    if (!input) return
    try {
      const result = await pool.query(
        `UPDATE user_profiles
         SET display_name = $2, bio = COALESCE($3, bio), updated_at = now()
         WHERE user_id = $1 RETURNING display_name`,
        [req.user.id, input.displayName, input.bio ?? null],
      )
      await appendAudit(pool, req.user.id, "profile.updated", "user", req.user.id)
      res.json({ user: { ...authUser(req), displayName: result.rows[0].display_name } })
    } catch (error) {
      next(error)
    }
  })

  app.patch("/api/me/password", requireAuth, async (req, res, next) => {
    const input = validateBody(
      z.object({
        currentPassword: z.string().min(1).max(128),
        newPassword: z.string().min(12).max(128),
      }),
      req,
      res,
    )
    if (!input) return
    if (input.currentPassword === input.newPassword) {
      return res.status(400).json({ error: "Choose a new password different from your current password." })
    }
    try {
      const updated = await inTransaction(pool, async (client) => {
        const credentials = await client.query(
          `SELECT password_hash FROM user_credentials
           WHERE user_id = $1 FOR UPDATE`,
          [req.user.id],
        )
        const currentHash = credentials.rows[0]?.password_hash
        if (!currentHash || !(await argon2.verify(currentHash, input.currentPassword))) {
          return false
        }
        const passwordHash = await argon2.hash(input.newPassword, passwordOptions)
        await client.query(
          `UPDATE user_credentials SET password_hash = $2, updated_at = now()
           WHERE user_id = $1`,
          [req.user.id, passwordHash],
        )
        await client.query(
          `UPDATE sessions SET revoked_at = now()
           WHERE user_id = $1 AND token_hash <> $2 AND revoked_at IS NULL`,
          [req.user.id, req.sessionTokenHash],
        )
        await appendAudit(client, req.user.id, "password.changed", "user", req.user.id)
        return true
      })
      if (!updated) {
        return res.status(403).json({ error: "The current password could not be verified." })
      }
      res.json({ updated: true })
    } catch (error) {
      next(error)
    }
  })

  app.post("/api/auth/recovery-code/rotate", requireAuth, async (req, res, next) => {
    try {
      const recoveryCode = createRecoveryCode()
      const recoveryHash = await argon2.hash(
        normalizeRecoveryCode(recoveryCode),
        passwordOptions,
      )
      await inTransaction(pool, async (client) => {
        await client.query(
          `UPDATE user_credentials SET recovery_code_hash = $2, updated_at = now()
           WHERE user_id = $1`,
          [req.user.id, recoveryHash],
        )
        await appendAudit(client, req.user.id, "recovery_code.rotated", "user", req.user.id)
      })
      res.json({
        recoveryCode,
        recoveryCodeWarning: "Your previous recovery code is now invalid. Save this replacement privately.",
      })
    } catch (error) {
      next(error)
    }
  })

  app.post("/api/me/upgrade", requireAuth, async (req, res, next) => {
    const input = validateBody(
      registeredSchema.extend({ consent: z.literal(true) }),
      req,
      res,
    )
    if (!input) return
    if (req.user.account_type !== "anonymous") {
      return res.status(409).json({ error: "Only a private-mode account can be upgraded." })
    }
    try {
      const result = await inTransaction(pool, async (client) => {
        const current = await client.query(
          "SELECT id, account_type FROM users WHERE id = $1 FOR UPDATE",
          [req.user.id],
        )
        if (current.rows[0]?.account_type !== "anonymous") return null
        const recoveryCode = createRecoveryCode()
        const [passwordHash, recoveryHash] = await Promise.all([
          argon2.hash(input.password, passwordOptions),
          argon2.hash(normalizeRecoveryCode(recoveryCode), passwordOptions),
        ])
        await client.query(
          `UPDATE user_credentials SET email = $2, email_normalized = $3,
             password_hash = $4, recovery_code_hash = $5, updated_at = now()
           WHERE user_id = $1`,
          [
            req.user.id,
            input.email.trim(),
            input.email.trim().toLowerCase(),
            passwordHash,
            recoveryHash,
          ],
        )
        await client.query(
          `UPDATE users SET account_type = 'registered', role = 'registered',
             updated_at = now() WHERE id = $1`,
          [req.user.id],
        )
        await client.query(
          `UPDATE user_profiles SET display_name = $2, updated_at = now()
           WHERE user_id = $1`,
          [req.user.id, input.displayName],
        )
        await appendAudit(client, req.user.id, "account.upgraded", "user", req.user.id, {
          consented: true,
        })
        return { recoveryCode }
      })
      if (!result) return res.status(409).json({ error: "This account has already been upgraded." })
      res.json({
        user: { ...authUser(req), accountType: "registered", role: "registered", displayName: input.displayName },
        recoveryCode: result.recoveryCode,
        recoveryCodeWarning: "Save your new recovery code privately. Your previous code is now invalid.",
      })
    } catch (error) {
      if (error.code === "23505") {
        return res.status(409).json({ error: "An account could not be created with those details." })
      }
      next(error)
    }
  })

  app.post("/api/me/deactivate", requireAuth, async (req, res, next) => {
    try {
      await inTransaction(pool, async (client) => {
        await client.query(
          `UPDATE users SET status = 'deactivated', updated_at = now() WHERE id = $1`,
          [req.user.id],
        )
        await client.query(
          "UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
          [req.user.id],
        )
        await appendAudit(client, req.user.id, "account.deactivated", "user", req.user.id)
      })
      clearSessionCookie(res, secureCookies)
      res.status(204).end()
    } catch (error) {
      next(error)
    }
  })

  app.get("/api/counselors", async (_req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT u.public_id, p.display_name, c.headline, c.bio, c.areas, c.languages
         FROM counselor_profiles c
         JOIN users u ON u.id = c.user_id
         LEFT JOIN user_profiles p ON p.user_id = u.id
         WHERE c.approved = true AND u.status = 'active' AND u.role = 'counselor'
         ORDER BY p.display_name`,
      )
      res.json({
        counselors: result.rows.map((row) => ({
          publicId: row.public_id,
          displayName: row.display_name,
          headline: row.headline,
          bio: row.bio,
          areas: row.areas,
          languages: row.languages,
        })),
      })
    } catch (error) {
      next(error)
    }
  })

  app.get("/api/admin/site-settings", requireAuth, requireAdmin, async (_req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT homepage_image IS NOT NULL AS has_homepage_image,
                homepage_image_alt,
                homepage_image_type, homepage_image_updated_at
         FROM site_settings WHERE id = true`,
      )
      const settings = result.rows[0]
      if (!settings) return res.status(503).json({ error: "Site settings are not initialized." })
      res.json({
        homepageImageUrl: settings.homepage_image_updated_at
          ? `/site-settings/homepage-image?v=${encodeURIComponent(new Date(settings.homepage_image_updated_at).toISOString())}`
          : null,
        homepageImageType: settings.homepage_image_type,
        homepageImageUpdatedAt: settings.homepage_image_updated_at,
        homepageImageAlt: settings.homepage_image_alt || "",
      })
    } catch (error) {
      next(error)
    }
  })

  app.post(
    "/api/admin/site-settings/homepage-image",
    requireAuth,
    requireAdmin,
    homepageImageUpload.single("homepageImage"),
    async (req, res, next) => {
      if (!req.file) {
        return res.status(400).json({ error: "Choose a JPEG, PNG, or WebP image to upload." })
      }
      const parsedAlt = z.string().trim().min(3).max(160).safeParse(req.body.homepageImageAlt)
      if (!parsedAlt.success) {
        return res.status(400).json({ error: "Provide descriptive alt text between 3 and 160 characters." })
      }
      const imageType = detectedHomepageImageType(req.file.buffer)
      if (!imageType || imageType !== req.file.mimetype) {
        return res.status(400).json({ error: "The selected file is not a valid JPEG, PNG, or WebP image." })
      }
      try {
        const result = await inTransaction(pool, async (client) => {
          const updated = await client.query(
            `UPDATE site_settings
             SET homepage_image = $1, homepage_image_alt = $2,
                 homepage_image_type = $3, homepage_image_updated_at = now(),
                 updated_by = $4
             WHERE id = true
             RETURNING homepage_image_type, homepage_image_updated_at`,
            [req.file.buffer, parsedAlt.data, imageType, req.user.id],
          )
          if (!updated.rowCount) throw new Error("Site settings are not initialized.")
          await appendAudit(client, req.user.id, "site.homepage_image_updated", "site_settings", null, {
            imageType,
            byteSize: req.file.size,
          })
          return updated.rows[0]
        })
        res.json({
          homepageImageUrl: `/site-settings/homepage-image?v=${encodeURIComponent(new Date(result.homepage_image_updated_at).toISOString())}`,
          homepageImageType: result.homepage_image_type,
          homepageImageUpdatedAt: result.homepage_image_updated_at,
          homepageImageAlt: parsedAlt.data,
        })
      } catch (error) {
        next(error)
      }
    },
  )

  app.delete("/api/admin/site-settings/homepage-image", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      await inTransaction(pool, async (client) => {
        const updated = await client.query(
          `UPDATE site_settings
           SET homepage_image = NULL, homepage_image_alt = NULL, homepage_image_type = NULL,
               homepage_image_updated_at = NULL, updated_by = $1
           WHERE id = true AND homepage_image IS NOT NULL`,
          [req.user.id],
        )
        if (updated.rowCount) {
          await appendAudit(client, req.user.id, "site.homepage_image_removed", "site_settings")
        }
      })
      res.status(204).end()
    } catch (error) {
      next(error)
    }
  })

  app.patch("/api/counselor/profile", requireAuth, requireRole("counselor"), async (req, res, next) => {
    const input = validateBody(
      z.object({
        displayName: z.string().trim().min(1).max(80),
        headline: z.string().trim().max(120),
        bio: z.string().trim().max(5000),
        areas: z.array(z.string().trim().min(1).max(80)).max(12),
        languages: z.array(z.string().trim().min(1).max(80)).max(12),
        professionalTitle: optionalText(120),
        highestQualification: optionalText(180),
        institution: optionalText(180),
        qualificationType: optionalText(120),
        completionYear: z.number().int().min(1900).max(2100).nullable(),
        certifications: optionalText(3000),
        yearsExperience: z.number().int().min(0).max(80).nullable(),
        licenseNumber: optionalText(160),
        licensingAuthority: optionalText(180),
        licenseExpiry: z.string().date().nullable(),
        workHistory: optionalText(5000),
        referencesText: optionalText(3000),
      }),
      req,
      res,
    )
    if (!input) return
    try {
      await inTransaction(pool, async (client) => {
        await client.query(
          `UPDATE user_profiles SET display_name = $2, updated_at = now()
           WHERE user_id = $1`,
          [req.user.id, input.displayName],
        )
        await client.query(
          `UPDATE counselor_profiles
           SET headline = $2, bio = $3, areas = $4, languages = $5, updated_at = now()
           WHERE user_id = $1`,
          [req.user.id, input.headline || "Counselor", input.bio, input.areas, input.languages],
        )
        const application = await client.query(
          `UPDATE counselor_applications
           SET professional_title = $2,
               highest_qualification = $3,
               institution = $4,
               qualification_type = $5,
               completion_year = $6,
               certifications = $7,
               years_experience = $8,
               license_number = $9,
               licensing_authority = $10,
               license_expiry = $11,
               biography = $12,
               areas_of_expertise = $13,
               languages = $14,
               work_history = $15,
               references_text = $16,
               qualification_verified = CASE
                 WHEN (highest_qualification, institution, qualification_type, completion_year)
                   IS DISTINCT FROM ($3, $4, $5, $6) THEN false
                 ELSE qualification_verified
               END,
               license_verified = CASE
                 WHEN (license_number, licensing_authority, license_expiry)
                   IS DISTINCT FROM ($9, $10, $11) THEN false
                 ELSE license_verified
               END,
               updated_at = now()
           WHERE user_id = $1 AND status = 'APPROVED'
           RETURNING id`,
          [
            req.user.id,
            input.professionalTitle,
            input.highestQualification,
            input.institution,
            input.qualificationType,
            input.completionYear,
            input.certifications,
            input.yearsExperience,
            input.licenseNumber,
            input.licensingAuthority,
            input.licenseExpiry,
            input.bio || null,
            input.areas,
            input.languages,
            input.workHistory,
            input.referencesText,
          ],
        )
        if (!application.rowCount) throw new Error("Approved counselor application was not found.")
        if (input.highestQualification && input.institution && input.qualificationType) {
          const existing = await client.query(
            `UPDATE counselor_qualifications
             SET qualification = $2, institution = $3, qualification_type = $4,
                 completion_year = $5, verification_status = CASE
                   WHEN (qualification, institution, qualification_type, completion_year)
                     IS DISTINCT FROM ($2, $3, $4, $5) THEN 'unverified'
                   ELSE verification_status
                 END,
                 verified_at = CASE
                   WHEN (qualification, institution, qualification_type, completion_year)
                     IS DISTINCT FROM ($2, $3, $4, $5) THEN NULL
                   ELSE verified_at
                 END,
                 verified_by = CASE
                   WHEN (qualification, institution, qualification_type, completion_year)
                     IS DISTINCT FROM ($2, $3, $4, $5) THEN NULL
                   ELSE verified_by
                 END
             WHERE id = (
               SELECT id FROM counselor_qualifications
               WHERE application_id = $1 ORDER BY created_at LIMIT 1
             )
             RETURNING id`,
            [
              application.rows[0].id,
              input.highestQualification,
              input.institution,
              input.qualificationType,
              input.completionYear,
            ],
          )
          if (!existing.rowCount) {
            await client.query(
              `INSERT INTO counselor_qualifications
                 (application_id, qualification, institution, qualification_type, completion_year)
               VALUES ($1, $2, $3, $4, $5)`,
              [
                application.rows[0].id,
                input.highestQualification,
                input.institution,
                input.qualificationType,
                input.completionYear,
              ],
            )
          }
        }
        await appendAudit(client, req.user.id, "counselor.profile_updated", "user", req.user.id)
      })
      res.json({ updated: true })
    } catch (error) {
      next(error)
    }
  })

  app.get("/api/counselor/profile", requireAuth, requireRole("counselor"), async (req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT p.display_name, c.headline, c.bio, c.areas, c.languages, c.approved,
                a.public_ref,
                a.id AS application_id, a.professional_title, a.highest_qualification,
                a.institution, a.qualification_type, a.completion_year, a.certifications,
                a.years_experience, a.license_number, a.licensing_authority, a.license_expiry,
                a.work_history, a.references_text, a.qualification_verified, a.license_verified
         FROM counselor_profiles c
         JOIN user_profiles p ON p.user_id = c.user_id
         JOIN counselor_applications a ON a.user_id = c.user_id AND a.status = 'APPROVED'
         WHERE c.user_id = $1`,
        [req.user.id],
      )
      if (!result.rows[0]) {
        return res.status(404).json({ error: "Counselor profile was not found." })
      }
      const documents = await pool.query(
        `SELECT id, category, status, original_name, mime_type, byte_size, uploaded_at, requested_at
         FROM counselor_documents WHERE application_id = $1 ORDER BY created_at`,
        [result.rows[0].application_id],
      )
      const { application_id: _applicationId, ...profile } = result.rows[0]
      res.json({ profile: { ...profile, documents: documents.rows.map(publicDocumentMetadata) } })
    } catch (error) {
      next(error)
    }
  })

  app.post(
    "/api/counselor/profile/documents",
    requireAuth,
    requireRole("counselor"),
    documentUpload.fields([
      { name: "qualificationDocuments", maxCount: 5 },
      { name: "licenseDocuments", maxCount: 5 },
      { name: "supportingDocuments", maxCount: 5 },
      { name: "profilePhoto", maxCount: 1 },
    ]),
    async (req, res, next) => {
      const categoryByField = {
        qualificationDocuments: "qualification",
        licenseDocuments: "license",
        supportingDocuments: "supporting",
        profilePhoto: "profile_photo",
      }
      const files = uploadedFiles(req.files)
      if (!files.length) return res.status(400).json({ error: "Select at least one profile document to upload." })
      const preparedFiles = files.map((file) => ({
        file,
        category: categoryByField[file.fieldname],
        mimeType: validateDocumentFile(file, categoryByField[file.fieldname]),
      }))
      if (preparedFiles.some(({ mimeType }) => !mimeType)) {
        return res.status(400).json({
          error: "Documents must be valid PDF, JPEG, or PNG files; profile photos must be images.",
        })
      }

      const storedKeys = []
      try {
        const documents = await inTransaction(pool, async (client) => {
          const application = await client.query(
            `SELECT a.id FROM counselor_applications a
             JOIN counselor_profiles c ON c.user_id = a.user_id AND c.approved = true
             WHERE a.user_id = $1 AND a.status = 'APPROVED' FOR UPDATE OF a`,
            [req.user.id],
          )
          if (!application.rows[0]) return null
          const uploaded = []
          for (const item of preparedFiles) {
            const storageKey = await savePrivateDocument(item.file, privateDocumentPath)
            storedKeys.push(storageKey)
            const result = await client.query(
              `INSERT INTO counselor_documents
                 (application_id, category, status, storage_key, original_name,
                  mime_type, byte_size, uploaded_by, uploaded_at)
               VALUES ($1, $2, 'uploaded', $3, $4, $5, $6, $7, now())
               RETURNING id, category, status, original_name, mime_type, byte_size, uploaded_at, requested_at`,
              [
                application.rows[0].id,
                item.category,
                storageKey,
                safeDocumentName(item.file.originalname),
                item.mimeType,
                item.file.size,
                req.user.id,
              ],
            )
            uploaded.push(publicDocumentMetadata(result.rows[0]))
          }
          await appendAudit(client, req.user.id, "counselor.profile_documents_uploaded", "counselor_application", application.rows[0].id)
          return uploaded
        })
        if (!documents) return res.status(409).json({ error: "Only approved counselors can update profile documents." })
        res.status(201).json({ documents })
      } catch (error) {
        if (storedKeys.length) await removePrivateDocuments(storedKeys, privateDocumentPath)
        next(error)
      }
    },
  )

  app.get("/api/requests", requireAuth, async (req, res, next) => {
    if (
      !["anonymous", "registered", "counselor"].includes(req.user.role) ||
      (req.user.account_type === "counselor" && req.user.role !== "counselor")
    ) {
      return res.status(403).json({ error: "You are not permitted to view counseling requests." })
    }
    try {
      const seeker = req.user.role === "anonymous" || req.user.role === "registered"
      const result = await pool.query(
        `SELECT r.public_ref, r.need, r.topic, r.description, r.status, r.created_at,
                seeker.public_id AS seeker_public_id,
                counselor.public_id AS counselor_public_id,
                counselor_profile.display_name AS counselor_name
         FROM counseling_requests r
         JOIN users seeker ON seeker.id = r.seeker_id
         JOIN users counselor ON counselor.id = r.counselor_id
         LEFT JOIN user_profiles counselor_profile ON counselor_profile.user_id = counselor.id
         WHERE r.${seeker ? "seeker_id" : "counselor_id"} = $1
         ORDER BY r.created_at DESC`,
        [req.user.id],
      )
      res.json({ requests: result.rows })
    } catch (error) {
      next(error)
    }
  })

  app.post("/api/requests", requireAuth, requireSeeker, async (req, res, next) => {
    const input = validateBody(
      z.object({
        counselorPublicId: z.string().trim().min(4).max(24),
        need: z.string().trim().min(1).max(120),
        topic: z.string().trim().min(3).max(160),
        description: z.string().trim().max(4000).default(""),
      }),
      req,
      res,
    )
    if (!input) return
    try {
      const result = await inTransaction(pool, async (client) => {
        const counselor = await client.query(
          `SELECT c.user_id FROM counselor_profiles c
           JOIN users u ON u.id = c.user_id
           WHERE u.public_id = upper($1) AND u.status = 'active'
             AND u.role = 'counselor' AND c.approved = true`,
          [input.counselorPublicId],
        )
        if (!counselor.rows[0]) return null
        const created = await client.query(
          `INSERT INTO counseling_requests
             (public_ref, seeker_id, counselor_id, need, topic, description)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING public_ref, need, topic, status, created_at`,
          [
            createPublicId("CR"),
            req.user.id,
            counselor.rows[0].user_id,
            input.need,
            input.topic,
            input.description,
          ],
        )
        await client.query(
          `INSERT INTO user_notifications (user_id, kind, title, message)
           VALUES ($1, 'counseling_request', 'New counseling request',
                   'A new request is ready for your review (' || $2 || ').')`,
          [counselor.rows[0].user_id, created.rows[0].public_ref],
        )
        await appendAudit(client, req.user.id, "counseling_request.created", "counseling_request", null)
        return created.rows[0]
      })
      if (!result) return res.status(404).json({ error: "That counselor is not available." })
      res.status(201).json({ request: result })
    } catch (error) {
      next(error)
    }
  })

  app.patch("/api/requests/:publicRef/status", requireAuth, async (req, res, next) => {
    const input = validateBody(
      z.object({ status: z.enum(["Accepted", "Declined", "Cancelled", "Closed"]) }),
      req,
      res,
    )
    if (!input) return
    try {
      const result = await inTransaction(pool, async (client) => {
        const lookup = await client.query(
          "SELECT * FROM counseling_requests WHERE public_ref = $1 FOR UPDATE",
          [req.params.publicRef.toUpperCase()],
        )
        const request = lookup.rows[0]
        if (!request) return { missing: true }
        const isSeeker = request.seeker_id === req.user.id
        const isAssignedCounselor = request.counselor_id === req.user.id && req.user.role === "counselor"
        if (!isSeeker && !isAssignedCounselor) return { missing: true }
        const allowed =
          (request.status === "Pending" &&
            ((input.status === "Cancelled" && isSeeker) ||
              (["Accepted", "Declined"].includes(input.status) && isAssignedCounselor))) ||
          (request.status === "Accepted" && input.status === "Closed")
        if (!allowed) return { conflict: true }
        const updated = await client.query(
          `UPDATE counseling_requests SET status = $2, updated_at = now()
           WHERE id = $1 RETURNING public_ref, status`,
          [request.id, input.status],
        )
        let conversation = null
        if (input.status === "Accepted") {
          const created = await client.query(
            `INSERT INTO counseling_conversations
               (public_id, request_id, seeker_id, counselor_id)
             VALUES ($1, $2, $3, $4) RETURNING public_id`,
            [createPublicId("CV"), request.id, request.seeker_id, request.counselor_id],
          )
          conversation = created.rows[0].public_id
        }
        if (input.status === "Closed") {
          await client.query(
            `UPDATE counseling_conversations SET status = 'resolved', updated_at = now()
             WHERE request_id = $1`,
            [request.id],
          )
        }
        const recipientId = isSeeker ? request.counselor_id : request.seeker_id
        await client.query(
          `INSERT INTO user_notifications (user_id, kind, title, message)
           VALUES ($1, 'counseling_request', 'Counseling request updated',
                   'Request ' || $2 || ' is now ' || lower($3) || '.')`,
          [recipientId, updated.rows[0].public_ref, input.status],
        )
        await appendAudit(client, req.user.id, "counseling_request.status_changed", "counseling_request", request.id, {
          status: input.status,
        })
        return { request: updated.rows[0], conversation }
      })
      if (result.missing) return res.status(404).json({ error: "The requested record was not found." })
      if (result.conflict) return res.status(409).json({ error: "That status change is not allowed." })
      res.json(result)
    } catch (error) {
      next(error)
    }
  })

  app.get("/api/counselor/cases", requireAuth, requireRole("counselor"), async (req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT r.public_ref, r.need, r.topic, r.description, r.status, r.created_at,
                seeker.public_id AS seeker_public_id,
                conversation.public_id AS conversation_public_id
         FROM counseling_requests r
         JOIN users seeker ON seeker.id = r.seeker_id
         LEFT JOIN counseling_conversations conversation ON conversation.request_id = r.id
         WHERE r.counselor_id = $1 ORDER BY r.created_at DESC`,
        [req.user.id],
      )
      res.json({ cases: result.rows })
    } catch (error) {
      next(error)
    }
  })

  app.get("/api/conversations", requireAuth, async (req, res, next) => {
    if (
      !["anonymous", "registered", "counselor"].includes(req.user.role) ||
      (req.user.account_type === "counselor" && req.user.role !== "counselor")
    ) {
      return res.status(403).json({ error: "You are not permitted to view conversations." })
    }
    if (!["anonymous", "registered", "counselor"].includes(req.user.role)) {
      return res.status(403).json({ error: "You are not permitted to view conversations." })
    }
    try {
      const seeker = req.user.role !== "counselor"
      const result = await pool.query(
        `SELECT c.public_id, c.status, c.updated_at,
                other.public_id AS other_party_public_id,
                CASE WHEN other.account_type = 'anonymous' THEN other.public_id
                     ELSE COALESCE(profile.display_name, other.public_id)
                END AS other_party_display_name
         FROM counseling_conversations c
         JOIN users other ON other.id = c.${seeker ? "counselor_id" : "seeker_id"}
         LEFT JOIN user_profiles profile ON profile.user_id = other.id
         WHERE c.${seeker ? "seeker_id" : "counselor_id"} = $1
         ORDER BY c.updated_at DESC`,
        [req.user.id],
      )
      res.json({ conversations: result.rows })
    } catch (error) {
      next(error)
    }
  })

  app.get("/api/conversations/:publicId/messages", requireAuth, async (req, res, next) => {
    try {
      const conversation = await pool.query(
        "SELECT * FROM counseling_conversations WHERE public_id = upper($1)",
        [req.params.publicId],
      )
      const record = conversation.rows[0]
      if (!record || !canAccessConversation(req.user, record)) {
        return res.status(404).json({ error: "The requested record was not found." })
      }
      await appendAudit(pool, req.user.id, "conversation.messages_viewed", "conversation", record.id)
      const result = await pool.query(
        `SELECT m.id, m.body, m.created_at, m.edited_at, m.deleted_at,
                CASE WHEN m.sender_id = $2 THEN m.delivered_at ELSE NULL END AS delivered_at,
                CASE WHEN m.sender_id = $2 THEN m.read_at ELSE NULL END AS read_at,
                sender.public_id AS sender_public_id,
                sender.role AS sender_role,
                CASE WHEN sender.account_type = 'anonymous' THEN sender.public_id
                     ELSE COALESCE(sender_profile.display_name, sender.public_id)
                END AS sender_display_name
         FROM messages m
         JOIN users sender ON sender.id = m.sender_id
         LEFT JOIN user_profiles sender_profile ON sender_profile.user_id = sender.id
         WHERE m.conversation_id = $1
           AND NOT EXISTS (
             SELECT 1 FROM message_user_hides hidden
             WHERE hidden.message_id = m.id AND hidden.user_id = $2
           )
         ORDER BY m.created_at, m.id`,
        [record.id, req.user.id],
      )
      res.json({ messages: result.rows })
    } catch (error) {
      next(error)
    }
  })

  app.post("/api/conversations/:publicId/receipts", requireAuth, async (req, res, next) => {
    const input = validateBody(z.object({
      messageIds: z.array(z.string().uuid()).min(1).max(100),
      state: z.enum(["delivered", "read"]),
    }), req, res)
    if (!input) return
    try {
      const conversation = await pool.query(
        "SELECT * FROM counseling_conversations WHERE public_id = upper($1)",
        [req.params.publicId],
      )
      const record = conversation.rows[0]
      if (!record || !canAccessConversation(req.user, record)) {
        return res.status(404).json({ error: "The requested record was not found." })
      }
      const receiptUpdate = input.state === "read"
        ? `SET delivered_at = COALESCE(delivered_at, now()),
               read_at = COALESCE(read_at, now())`
        : "SET delivered_at = COALESCE(delivered_at, now())"
      const result = await pool.query(
        `UPDATE messages
         ${receiptUpdate}
         WHERE conversation_id = $1 AND id = ANY($2::uuid[]) AND sender_id <> $3
         RETURNING id`,
        [record.id, input.messageIds, req.user.id],
      )
      res.json({ updated: result.rowCount })
    } catch (error) {
      next(error)
    }
  })

  app.post("/api/conversations/:publicId/messages", requireAuth, async (req, res, next) => {
    const input = validateBody(z.object({ body: z.string().trim().min(1).max(4000) }), req, res)
    if (!input) return
    try {
      const result = await inTransaction(pool, async (client) => {
        const lookup = await client.query(
          "SELECT * FROM counseling_conversations WHERE public_id = upper($1) FOR UPDATE",
          [req.params.publicId],
        )
        const conversation = lookup.rows[0]
        if (!conversation || !canAccessConversation(req.user, conversation)) return { missing: true }
        if (conversation.status !== "open") return { closed: true }
        const message = await client.query(
          `INSERT INTO messages (conversation_id, sender_id, body)
           VALUES ($1, $2, $3) RETURNING id, body, created_at`,
          [conversation.id, req.user.id, input.body],
        )
        await client.query(
          "UPDATE counseling_conversations SET updated_at = now() WHERE id = $1",
          [conversation.id],
        )
        const recipientId =
          conversation.seeker_id === req.user.id
            ? conversation.counselor_id
            : conversation.seeker_id
        await client.query(
          `INSERT INTO user_notifications (user_id, kind, title, message)
           VALUES ($1, 'conversation_message', 'New counseling message',
                   'You have a new message in a counseling conversation.')`,
          [recipientId],
        )
        await appendAudit(client, req.user.id, "conversation.message_created", "conversation", conversation.id)
        return { message: message.rows[0] }
      })
      if (result.missing) return res.status(404).json({ error: "The requested record was not found." })
      if (result.closed) return res.status(409).json({ error: "This conversation is closed." })
      res.status(201).json(result)
    } catch (error) {
      next(error)
    }
  })

  app.patch("/api/messages/:id", requireAuth, async (req, res, next) => {
        if (!z.string().uuid().safeParse(req.params.id).success) {
          return res.status(400).json({ error: "The message ID is invalid." })
        }
        const input = validateBody(z.object({ body: z.string().trim().min(1).max(4000) }), req, res)
        if (!input) return
        try {
          const result = await inTransaction(pool, async (client) => {
            const lookup = await client.query(
              `SELECT m.id, m.sender_id, m.body, m.deleted_at,
                      c.id AS conversation_id, c.seeker_id, c.counselor_id
               FROM messages m
               JOIN counseling_conversations c ON c.id = m.conversation_id
               WHERE m.id = $1 FOR UPDATE OF m`,
              [req.params.id],
            )
            const message = lookup.rows[0]
            if (!message || !canAccessConversation(req.user, message)) return { missing: true }
            if (message.sender_id !== req.user.id) return { forbidden: true }
            if (message.deleted_at) return { deleted: true }
            const updated = await client.query(
              `UPDATE messages SET body = $2, edited_at = now()
               WHERE id = $1 RETURNING id, body, created_at, edited_at`,
              [message.id, input.body],
            )
            await appendAudit(client, req.user.id, "conversation.message_edited", "message", message.id)
            return { message: updated.rows[0] }
          })
          if (result.missing) return res.status(404).json({ error: "The requested record was not found." })
          if (result.forbidden) return res.status(403).json({ error: "You can edit only your own messages." })
          if (result.deleted) return res.status(409).json({ error: "This message has been deleted." })
          res.json(result)
        } catch (error) {
          next(error)
        }
  })

  app.delete("/api/messages/:id", requireAuth, async (req, res, next) => {
        if (!z.string().uuid().safeParse(req.params.id).success) {
          return res.status(400).json({ error: "The message ID is invalid." })
        }
        const input = validateBody(z.object({ scope: z.enum(["for_me", "for_everyone"]) }), req, res)
        if (!input) return
        try {
          const result = await inTransaction(pool, async (client) => {
            const lookup = await client.query(
              `SELECT m.id, m.sender_id, m.deleted_at,
                      c.id AS conversation_id, c.seeker_id, c.counselor_id
               FROM messages m
               JOIN counseling_conversations c ON c.id = m.conversation_id
               WHERE m.id = $1 FOR UPDATE OF m`,
              [req.params.id],
            )
            const message = lookup.rows[0]
            if (!message || !canAccessConversation(req.user, message)) return { missing: true }
            if (input.scope === "for_everyone") {
              if (message.sender_id !== req.user.id) return { forbidden: true }
              if (!message.deleted_at) {
                await client.query(
                  `UPDATE messages SET body = 'This message was deleted', deleted_at = now()
                   WHERE id = $1`,
                  [message.id],
                )
                await appendAudit(client, req.user.id, "conversation.message_deleted_for_everyone", "message", message.id)
              }
            } else {
              await client.query(
                `INSERT INTO message_user_hides (message_id, user_id)
                 VALUES ($1, $2) ON CONFLICT DO NOTHING`,
                [message.id, req.user.id],
              )
              await appendAudit(client, req.user.id, "conversation.message_hidden", "message", message.id)
            }
            return { deleted: true }
          })
          if (result.missing) return res.status(404).json({ error: "The requested record was not found." })
          if (result.forbidden) return res.status(403).json({ error: "You can delete for everyone only your own messages." })
          res.json(result)
        } catch (error) {
          next(error)
        }
  })

  app.get("/api/journey", requireAuth, requireSeeker, async (req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT stage, status, updated_at, completed_at
         FROM discipleship_progress WHERE user_id = $1
         ORDER BY array_position($2::text[], stage)`,
        [req.user.id, stages],
      )
      res.json({ progress: result.rows })
    } catch (error) {
      next(error)
    }
  })

  app.patch("/api/journey/:stage", requireAuth, requireSeeker, async (req, res, next) => {
    if (!stages.includes(req.params.stage)) {
      return res.status(400).json({ error: "That journey stage is not recognized." })
    }
    const input = validateBody(
      z.object({ status: z.enum(["not_started", "in_progress", "completed"]) }),
      req,
      res,
    )
    if (!input) return
    try {
      const result = await pool.query(
        `INSERT INTO discipleship_progress (user_id, stage, status, completed_at)
         VALUES ($1, $2, $3, CASE WHEN $3 = 'completed' THEN now() ELSE NULL END)
         ON CONFLICT (user_id, stage) DO UPDATE
         SET status = EXCLUDED.status, updated_at = now(),
             completed_at = CASE WHEN EXCLUDED.status = 'completed' THEN now() ELSE NULL END
         RETURNING stage, status, updated_at, completed_at`,
        [req.user.id, req.params.stage, input.status],
      )
      await appendAudit(pool, req.user.id, "journey.progress_updated", "journey", req.user.id)
      res.json({ progress: result.rows[0] })
    } catch (error) {
      next(error)
    }
  })

  app.post("/api/concerns", requireAuth, requireSeeker, async (req, res, next) => {
    const input = validateBody(z.object({ summary: z.string().trim().min(5).max(4000) }), req, res)
    if (!input) return
    try {
      const result = await inTransaction(pool, async (client) => {
        const concern = await client.query(
          `INSERT INTO safeguarding_concerns (public_ref, reporter_id, summary)
           VALUES ($1, $2, $3) RETURNING public_ref, status, created_at`,
          [createPublicId("SG"), req.user.id, input.summary],
        )
        await appendAudit(client, req.user.id, "safeguarding_concern.created", "safeguarding_concern")
        return concern.rows[0]
      })
      res.status(201).json({ concern: result })
    } catch (error) {
      next(error)
    }
  })

  app.get("/api/admin/counselor-applications", requireAuth, requireAdmin, async (req, res, next) => {
    const query = z.object({
      status: z.enum([
        "PENDING_APPROVAL",
        "UNDER_REVIEW",
        "MORE_INFORMATION_REQUIRED",
        "APPROVED",
        "REJECTED",
      ]).optional(),
    }).safeParse(req.query)
    if (!query.success) return res.status(400).json({ error: "Invalid application status filter." })
    try {
      const result = await pool.query(
        `SELECT a.public_ref, a.status, a.full_legal_name, a.preferred_display_name,
                a.professional_title, a.specialization, a.submitted_at,
                u.public_id, u.status AS account_status
         FROM counselor_applications a
         JOIN users u ON u.id = a.user_id
         WHERE ($1::text IS NULL OR a.status = $1)
         ORDER BY a.submitted_at DESC`,
        [query.data.status || null],
      )
      res.json({
        applications: result.rows.map((row) => ({
          publicRef: row.public_ref,
          status: row.status,
          fullLegalName: row.full_legal_name,
          preferredDisplayName: row.preferred_display_name,
          professionalTitle: row.professional_title,
          specialization: row.specialization,
          submittedAt: row.submitted_at,
          publicId: row.public_id,
          accountStatus: row.account_status,
        })),
      })
    } catch (error) {
      next(error)
    }
  })

  app.get("/api/admin/counselor-applications/:publicRef", requireAuth, requireAdmin, async (req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT a.*, u.public_id, u.status AS account_status,
                c.email, p.display_name
         FROM counselor_applications a
         JOIN users u ON u.id = a.user_id
         JOIN user_credentials c ON c.user_id = u.id
         LEFT JOIN user_profiles p ON p.user_id = u.id
         WHERE a.public_ref = upper($1)`,
        [req.params.publicRef],
      )
      const application = result.rows[0]
      if (!application) return res.status(404).json({ error: "The requested record was not found." })
      const [documents, qualifications, reviews, responses] = await Promise.all([
        pool.query(
          `SELECT id, category, status, original_name, mime_type, byte_size, uploaded_at, requested_at
           FROM counselor_documents WHERE application_id = $1 ORDER BY created_at`,
          [application.id],
        ),
        pool.query(
          `SELECT id, qualification, institution, qualification_type, completion_year,
                  verification_status, verification_note, verified_at
           FROM counselor_qualifications WHERE application_id = $1 ORDER BY created_at`,
          [application.id],
        ),
        pool.query(
          `SELECT r.action, r.reason, r.requested_document_categories, r.created_at,
                  u.public_id AS reviewer_public_id, p.display_name AS reviewer_name
           FROM counselor_reviews r
           JOIN users u ON u.id = r.reviewer_id
           LEFT JOIN user_profiles p ON p.user_id = u.id
           WHERE r.application_id = $1 ORDER BY r.created_at DESC`,
          [application.id],
        ),
        pool.query(
          `SELECT message, created_at FROM counselor_application_responses
           WHERE application_id = $1 ORDER BY created_at DESC`,
          [application.id],
        ),
      ])
      const {
        id: _id,
        user_id: _userId,
        code_of_conduct_accepted: codeOfConductAccepted,
        confidentiality_accepted: confidentialityAccepted,
        safeguarding_accepted: safeguardingAccepted,
        qualification_verified: qualificationVerified,
        license_verified: licenseVerified,
        full_legal_name: fullLegalName,
        preferred_display_name: preferredDisplayName,
        general_location: generalLocation,
        professional_title: professionalTitle,
        highest_qualification: highestQualification,
        qualification_type: qualificationType,
        completion_year: completionYear,
        years_experience: yearsExperience,
        license_number: licenseNumber,
        licensing_authority: licensingAuthority,
        license_expiry: licenseExpiry,
        areas_of_expertise: areasOfExpertise,
        references_text: referencesText,
        work_history: workHistory,
        submitted_at: submittedAt,
        updated_at: updatedAt,
        public_ref: publicRef,
        status,
        phone,
        country,
        specialization,
        institution,
        certifications,
        biography,
        languages,
        email,
        public_id: publicId,
        account_status: accountStatus,
        display_name: displayName,
      } = application
      const requestedDocumentCategories = reviews.rows.flatMap((row) =>
        Array.isArray(row.requested_document_categories)
          ? row.requested_document_categories
          : [],
      )
      const fallbackDocuments = requestedDocumentCategories.map((category, index) => ({
        id: `${publicRef}-${category}-${index}`,
        category,
        status: "requested",
        original_name: null,
        mime_type: null,
        byte_size: null,
        uploaded_at: null,
        requested_at: reviews.rows[0]?.created_at || null,
      }))
      res.json({
        application: {
          publicRef,
          status,
          submittedAt,
          updatedAt,
          publicId,
          accountStatus,
          email,
          fullLegalName,
          preferredDisplayName,
          displayName,
          phone,
          country,
          generalLocation,
          professionalTitle,
          specialization,
          highestQualification,
          institution,
          qualificationType,
          completionYear,
          certifications,
          yearsExperience,
          licenseNumber,
          licensingAuthority,
          licenseExpiry,
          biography,
          areasOfExpertise: areasOfExpertise || [],
          languages: languages || [],
          workHistory,
          referencesText,
          codeOfConductAccepted,
          confidentialityAccepted,
          safeguardingAccepted,
          qualificationVerified,
          licenseVerified,
          documents: documents.rows.length
            ? documents.rows.map(publicDocumentMetadata)
            : fallbackDocuments.map(publicDocumentMetadata),
          qualifications: qualifications.rows.map((row) => ({
            id: row.id,
            qualification: row.qualification,
            institution: row.institution,
            qualificationType: row.qualification_type,
            completionYear: row.completion_year,
            verificationStatus: row.verification_status,
            verificationNote: row.verification_note,
            verifiedAt: row.verified_at,
          })),
          reviews: reviews.rows.map((row) => ({
            action: row.action,
            reason: row.reason,
            requestedDocumentCategories: row.requested_document_categories,
            createdAt: row.created_at,
            reviewerPublicId: row.reviewer_public_id,
            reviewerName: row.reviewer_name,
          })),
          responses: responses.rows,
        },
      })
    } catch (error) {
      next(error)
    }
  })

  app.patch(
    "/api/admin/counselor-applications/:publicRef/qualifications/:qualificationId/verification",
    requireAuth,
    requireAdmin,
    async (req, res, next) => {
      const input = validateBody(
        z.object({
          verified: z.boolean(),
          reason: z.string().trim().min(5).max(1000),
        }),
        req,
        res,
      )
      if (!input) return
      const qualificationId = z.string().uuid().safeParse(req.params.qualificationId)
      if (!qualificationId.success) {
        return res.status(400).json({ error: "Invalid qualification identifier." })
      }
      try {
        const result = await inTransaction(pool, async (client) => {
          const qualification = await client.query(
            `SELECT q.id, q.application_id, a.public_ref, a.qualification_verified, a.status
             FROM counselor_qualifications q
             JOIN counselor_applications a ON a.id = q.application_id
             WHERE q.id = $1 AND a.public_ref = upper($2)
             FOR UPDATE OF q, a`,
            [qualificationId.data, req.params.publicRef],
          )
          const record = qualification.rows[0]
          if (!record) return { missing: true }
          if (record.status === "REJECTED") return { conflict: true }
          await client.query(
            `UPDATE counselor_qualifications SET verification_status = $2,
               verified_by = $3, verified_at = CASE WHEN $4 THEN now() ELSE NULL END,
               verification_note = $5
             WHERE id = $1`,
            [
              record.id,
              input.verified ? "verified" : "not_verified",
              req.user.id,
              input.verified,
              input.reason,
            ],
          )
          await client.query(
            `UPDATE counselor_applications SET qualification_verified = $2, updated_at = now()
             WHERE id = $1`,
            [record.application_id, input.verified],
          )
          await client.query(
            `INSERT INTO counselor_reviews (application_id, reviewer_id, action, reason)
             VALUES ($1, $2, $3, $4)`,
            [
              record.application_id,
              req.user.id,
              input.verified ? "QUALIFICATION_VERIFIED" : "QUALIFICATION_NOT_VERIFIED",
              input.reason,
            ],
          )
          await appendAudit(
            client,
            req.user.id,
            "counselor.qualification_verification_changed",
            "counselor_application",
            record.application_id,
            { verified: input.verified },
          )
          return { verified: input.verified }
        })
        if (result.missing) return res.status(404).json({ error: "The requested record was not found." })
        if (result.conflict) return res.status(409).json({ error: "Credentials cannot be changed after an application is rejected." })
        res.json({ qualification: result })
      } catch (error) {
        next(error)
      }
    },
  )

  app.patch(
    "/api/admin/counselor-applications/:publicRef/license-verification",
    requireAuth,
    requireAdmin,
    async (req, res, next) => {
      const input = validateBody(
        z.object({
          verified: z.boolean(),
          reason: z.string().trim().min(5).max(1000),
        }),
        req,
        res,
      )
      if (!input) return
      try {
        const result = await inTransaction(pool, async (client) => {
          const found = await client.query(
            `SELECT id, license_number, status FROM counselor_applications
             WHERE public_ref = upper($1) FOR UPDATE`,
            [req.params.publicRef],
          )
          const application = found.rows[0]
          if (!application) return { missing: true }
          if (application.status === "REJECTED") return { conflict: true }
          if (!application.license_number && input.verified) return { noLicense: true }
          await client.query(
            `UPDATE counselor_applications SET license_verified = $2, updated_at = now()
             WHERE id = $1`,
            [application.id, input.verified],
          )
          await client.query(
            `INSERT INTO counselor_reviews (application_id, reviewer_id, action, reason)
             VALUES ($1, $2, $3, $4)`,
            [
              application.id,
              req.user.id,
              input.verified ? "LICENSE_VERIFIED" : "LICENSE_NOT_VERIFIED",
              input.reason,
            ],
          )
          await appendAudit(
            client,
            req.user.id,
            "counselor.license_verification_changed",
            "counselor_application",
            application.id,
            { verified: input.verified },
          )
          return { verified: input.verified }
        })
        if (result.missing) return res.status(404).json({ error: "The requested record was not found." })
        if (result.conflict) return res.status(409).json({ error: "Credentials cannot be changed after an application is rejected." })
        if (result.noLicense) return res.status(409).json({ error: "No license was supplied for verification." })
        res.json({ license: result })
      } catch (error) {
        next(error)
      }
    },
  )

  app.patch(
    "/api/admin/counselor-applications/:publicRef/review",
    requireAuth,
    requireAdmin,
    async (req, res, next) => {
      const input = validateBody(
        z.object({
          action: z.enum(["UNDER_REVIEW", "MORE_INFORMATION_REQUIRED", "APPROVED", "REJECTED"]),
          reason: z.string().trim().max(3000).optional(),
          requestedDocumentCategories: z.array(
            z.enum(["qualification", "license", "supporting"]),
          ).max(3).default([]),
        }),
        req,
        res,
      )
      if (!input) return
      if (
        ["MORE_INFORMATION_REQUIRED", "REJECTED", "UNDER_REVIEW"].includes(input.action) &&
        (input.reason || "").trim().length < 5
      ) {
        return res.status(400).json({ error: "Provide a reason for this application decision." })
      }
      const reason = input.reason?.trim() || "Counselor application approved."
      try {
        const result = await inTransaction(pool, async (client) => {
          const found = await client.query(
            `SELECT a.*, u.id AS applicant_id, u.status AS account_status
             FROM counselor_applications a JOIN users u ON u.id = a.user_id
             WHERE a.public_ref = upper($1) FOR UPDATE OF a, u`,
            [req.params.publicRef],
          )
          const application = found.rows[0]
          if (!application) return { missing: true }
          if (application.user_id === req.user.id) return { selfReview: true }
          if (["APPROVED", "REJECTED"].includes(application.status)) return { conflict: true }
          if (input.action === "UNDER_REVIEW" &&
            !["PENDING_APPROVAL", "MORE_INFORMATION_REQUIRED"].includes(application.status)) {
            return { conflict: true }
          }
          if (input.action === "MORE_INFORMATION_REQUIRED" &&
            !["PENDING_APPROVAL", "UNDER_REVIEW", "MORE_INFORMATION_REQUIRED"].includes(application.status)) {
            return { conflict: true }
          }
          if (input.action === "APPROVED") {
            if (!["PENDING_APPROVAL", "UNDER_REVIEW", "MORE_INFORMATION_REQUIRED"].includes(application.status)) {
              return { conflict: true }
            }
            if (application.account_status !== "active") return { suspended: true }
          }
          if (input.action === "APPROVED") {
             const promoted = await client.query(
               `UPDATE users SET role = 'counselor', updated_at = now()
                WHERE id = $1 AND account_type = 'counselor' AND status = 'active'`,
               [application.user_id],
             )
             if (!promoted.rowCount) throw new Error("Approved counselor account could not be promoted.")
          }
          const status = input.action
          await client.query(
             `UPDATE counselor_applications SET status = $2, updated_at = now()
             WHERE id = $1`,
             [application.id, status],
          )
          if (input.action === "APPROVED") {
             await client.query(
              `INSERT INTO counselor_profiles
                 (user_id, approved, headline, bio, areas, languages)
               VALUES ($1, true, $2, $3, $4, $5)
               ON CONFLICT (user_id) DO UPDATE SET approved = true, headline = EXCLUDED.headline,
                 bio = EXCLUDED.bio, areas = EXCLUDED.areas, languages = EXCLUDED.languages,
                 updated_at = now()`,
              [
                application.user_id,
                application.professional_title || application.specialization,
                application.biography || "",
                application.areas_of_expertise || [],
                application.languages || [],
              ],
            )
            await client.query(
              `UPDATE user_profiles SET display_name = $2, updated_at = now()
               WHERE user_id = $1`,
              [application.user_id, application.preferred_display_name],
            )
          }
          if (input.action === "MORE_INFORMATION_REQUIRED") {
            for (const category of input.requestedDocumentCategories) {
              await client.query(
                `INSERT INTO counselor_documents
                   (application_id, category, status, requested_by, requested_at)
                 VALUES ($1, $2, 'requested', $3, now())`,
                [application.id, category, req.user.id],
              )
            }
          }
          await client.query(
            `INSERT INTO counselor_reviews
               (application_id, reviewer_id, action, reason, requested_document_categories)
             VALUES ($1, $2, $3, $4, $5)`,
            [
              application.id,
              req.user.id,
              input.action === "MORE_INFORMATION_REQUIRED"
                ? "REQUESTED_MORE_INFORMATION"
                : input.action,
              reason,
              input.action === "MORE_INFORMATION_REQUIRED"
                ? input.requestedDocumentCategories
                : [],
            ],
          )
          await client.query(
            `INSERT INTO user_notifications (user_id, application_id, kind, title, message)
             VALUES ($1, $2, 'counselor_application_update', $3, $4)`,
            [
              application.user_id,
              application.id,
              input.action === "APPROVED"
                ? "Counselor application approved"
                : input.action === "REJECTED"
                  ? "Counselor application update"
                  : input.action === "MORE_INFORMATION_REQUIRED"
                    ? "More information requested"
                    : "Counselor application under review",
              reason,
            ],
          )
          await appendAudit(
            client,
            req.user.id,
            `counselor.application_${input.action.toLowerCase()}`,
            "counselor_application",
            application.id,
            { requestedDocumentCategories: input.requestedDocumentCategories },
          )
          return { status }
        })
        if (result.missing) return res.status(404).json({ error: "The requested record was not found." })
        if (result.selfReview) return res.status(403).json({ error: "Administrators may not review their own application." })
        if (result.conflict) return res.status(409).json({ error: "That application decision is not allowed in its current state." })
        if (result.suspended) return res.status(409).json({ error: "Suspended applicants cannot be approved." })
        res.json({ application: result })
      } catch (error) {
        next(error)
      }
    },
  )

  app.get(
    "/api/counselor/applications/:publicRef/documents/:documentId",
    requireAuth,
    async (req, res, next) => {
      const documentId = z.string().uuid().safeParse(req.params.documentId)
      if (!documentId.success) {
        return res.status(400).json({ error: "Invalid document identifier." })
      }
      try {
        const found = await pool.query(
          `SELECT d.id, d.category, d.storage_key, d.original_name, d.mime_type,
                  a.user_id AS applicant_id
           FROM counselor_documents d
           JOIN counselor_applications a ON a.id = d.application_id
           WHERE a.public_ref = upper($1) AND d.id = $2 AND d.status = 'uploaded'`,
          [req.params.publicRef, documentId.data],
        )
        const document = found.rows[0]
        if (
          !document ||
          (document.applicant_id !== req.user.id && req.user.role !== "superadmin")
        ) {
          return res.status(404).json({ error: "The requested record was not found." })
        }
        const storageKey = document.storage_key
        if (!/^[a-f0-9]{64}$/.test(storageKey)) {
          return res.status(404).json({ error: "The requested record was not found." })
        }
        const contents = await readFile(path.join(privateDocumentPath, storageKey))
        await appendAudit(pool, req.user.id, "counselor.document_viewed", "counselor_document", document.id)
        res.set({
          "Cache-Control": "private, no-store",
          "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(document.original_name)}`,
          "Content-Type": document.mime_type,
          "X-Content-Type-Options": "nosniff",
        })
        res.send(contents)
      } catch (error) {
        next(error)
      }
    },
  )

  app.get("/api/safeguarding/concerns", requireAuth, async (req, res, next) => {
    try {
      const permission = await pool.query(
        `SELECT 1 FROM user_permissions
         WHERE user_id = $1 AND permission = 'safeguarding:review'`,
        [req.user.id],
      )
      if (!permission.rowCount) {
        return res.status(403).json({ error: "You are not permitted to review safeguarding reports." })
      }
      const result = await pool.query(
        `SELECT c.public_ref, c.summary, c.status, c.created_at,
                reporter.public_id AS reporter_public_id
         FROM safeguarding_concerns c
         JOIN users reporter ON reporter.id = c.reporter_id
         ORDER BY c.created_at DESC LIMIT 100`,
      )
      await appendAudit(pool, req.user.id, "safeguarding_concerns.viewed", "safeguarding_concern")
      res.json({ concerns: result.rows })
    } catch (error) {
      next(error)
    }
  })

  app.get("/api/admin/users", requireAuth, requireAdmin, async (req, res, next) => {
    const query = z.object({
      publicId: z.string().trim().max(24).optional(),
      status: z.enum(["active", "suspended", "deactivated"]).optional(),
      role: z.enum(["anonymous", "registered", "counselor", "superadmin"]).optional(),
      limit: z.coerce.number().int().min(1).max(100).default(50),
      offset: z.coerce.number().int().min(0).default(0),
    }).safeParse(req.query)
    if (!query.success) return res.status(400).json({ error: "Invalid search filters." })
    try {
      const result = await pool.query(
        `SELECT u.public_id, u.account_type, u.role, u.status, u.created_at,
                p.display_name, c.approved, c.areas,
                EXISTS (
                  SELECT 1 FROM user_permissions permission
                  WHERE permission.user_id = u.id
                    AND permission.permission = 'safeguarding:review'
                ) AS safeguarding_review
         FROM users u LEFT JOIN user_profiles p ON p.user_id = u.id
         LEFT JOIN counselor_profiles c ON c.user_id = u.id
         WHERE ($1::text IS NULL OR u.public_id = upper($1))
           AND ($2::text IS NULL OR u.status = $2)
           AND ($3::text IS NULL OR u.role = $3)
         ORDER BY u.created_at DESC LIMIT $4 OFFSET $5`,
        [
          query.data.publicId || null,
          query.data.status || null,
          query.data.role || null,
          query.data.limit,
          query.data.offset,
        ],
      )
      res.json({ users: result.rows.map(safeAccountRecord) })
    } catch (error) {
      next(error)
    }
  })

  app.patch("/api/admin/users/:publicId/status", requireAuth, requireAdmin, async (req, res, next) => {
    const input = validateBody(accountStatusSchema, req, res)
    if (!input) return
    try {
      const result = await inTransaction(pool, async (client) => {
        const updated = await client.query(
          `UPDATE users SET status = $2, updated_at = now()
           WHERE public_id = upper($1) RETURNING id, public_id, status`,
          [req.params.publicId, input.status],
        )
        if (!updated.rows[0]) return null
        if (input.status !== "active") {
          await client.query(
            "UPDATE sessions SET revoked_at = now() WHERE user_id = $1 AND revoked_at IS NULL",
            [updated.rows[0].id],
          )
        }
        await appendAudit(client, req.user.id, "account.status_changed", "user", updated.rows[0].id, {
          status: input.status,
        })
        return updated.rows[0]
      })
      if (!result) return res.status(404).json({ error: "The requested record was not found." })
      res.json({ account: { publicId: result.public_id, status: result.status } })
    } catch (error) {
      next(error)
    }
  })

  app.patch("/api/admin/users/:publicId/role", requireAuth, requireAdmin, async (req, res, next) => {
    const input = validateBody(accountRoleSchema, req, res)
    if (!input) return
    try {
      const result = await inTransaction(pool, async (client) => {
        const target = await client.query(
          "SELECT id, role, account_type FROM users WHERE public_id = upper($1) FOR UPDATE",
          [req.params.publicId],
        )
        if (!target.rows[0] || target.rows[0].account_type !== "registered") return null
        const userId = target.rows[0].id
        if (input.role === "counselor" && target.rows[0].role !== "counselor") {
          return { applicationRequired: true }
        }
        if (target.rows[0].role === "counselor" && input.role !== "counselor") {
          return { applicationManaged: true }
        }
        await client.query("UPDATE users SET role = $2, updated_at = now() WHERE id = $1", [
          userId,
          input.role,
        ])
        await appendAudit(client, req.user.id, "account.role_changed", "user", userId, {
          role: input.role,
        })
        return { publicId: req.params.publicId.toUpperCase(), role: input.role }
      })
      if (!result) return res.status(404).json({ error: "The requested record was not found." })
      if (result.applicationRequired) {
        return res.status(409).json({ error: "Counselor access can only be granted after an approved application." })
      }
      if (result.applicationManaged) {
        return res.status(409).json({ error: "Counselor access is managed through the application review workflow." })
      }
      res.json({ account: result })
    } catch (error) {
      next(error)
    }
  })

  app.patch("/api/admin/counselors/:publicId/approval", requireAuth, requireAdmin, async (req, res, next) => {
    res.status(409).json({
      error: "Direct counselor approval is disabled. Review the counselor application first.",
    })
  })

  app.patch("/api/admin/requests/:publicRef/assignment", requireAuth, requireAdmin, async (req, res, next) => {
    const input = validateBody(z.object({ counselorPublicId: z.string().trim().min(4).max(24) }), req, res)
    if (!input) return
    try {
      const result = await inTransaction(pool, async (client) => {
        const request = await client.query(
          `SELECT id, counselor_id, status FROM counseling_requests
           WHERE public_ref = upper($1) FOR UPDATE`,
          [req.params.publicRef],
        )
        if (!request.rows[0]) return null
        if (request.rows[0].status !== "Pending") return { conflict: true }
        const counselor = await client.query(
          `SELECT c.user_id FROM counselor_profiles c
           JOIN users u ON u.id = c.user_id
           WHERE u.public_id = upper($1) AND u.status = 'active'
             AND u.role = 'counselor' AND c.approved = true`,
          [input.counselorPublicId],
        )
        if (!counselor.rows[0]) return { counselorMissing: true }
        await client.query(
          "UPDATE counseling_requests SET counselor_id = $2, updated_at = now() WHERE id = $1",
          [request.rows[0].id, counselor.rows[0].user_id],
        )
        await appendAudit(client, req.user.id, "counseling_request.assigned", "counseling_request", request.rows[0].id)
        return { assigned: true }
      })
      if (!result) return res.status(404).json({ error: "The requested record was not found." })
      if (result.conflict) return res.status(409).json({ error: "Only pending requests can be reassigned." })
      if (result.counselorMissing) return res.status(404).json({ error: "That counselor is not available." })
      res.json({ status: "assigned" })
    } catch (error) {
      next(error)
    }
  })

  app.post("/api/admin/users/:publicId/safeguarding-permission", requireAuth, requireAdmin, async (req, res, next) => {
    const input = validateBody(z.object({ granted: z.boolean() }), req, res)
    if (!input) return
    try {
      const result = await inTransaction(pool, async (client) => {
        const target = await client.query(
          "SELECT id FROM users WHERE public_id = upper($1) FOR UPDATE",
          [req.params.publicId],
        )
        if (!target.rows[0]) return null
        if (input.granted) {
          await client.query(
            `INSERT INTO user_permissions (user_id, permission, granted_by)
             VALUES ($1, 'safeguarding:review', $2)
             ON CONFLICT (user_id, permission) DO UPDATE
             SET granted_by = EXCLUDED.granted_by, granted_at = now()`,
            [target.rows[0].id, req.user.id],
          )
        } else {
          await client.query(
            `DELETE FROM user_permissions
             WHERE user_id = $1 AND permission = 'safeguarding:review'`,
            [target.rows[0].id],
          )
        }
        await appendAudit(client, req.user.id, "safeguarding.permission_changed", "user", target.rows[0].id, {
          granted: input.granted,
        })
        return { publicId: req.params.publicId.toUpperCase(), granted: input.granted }
      })
      if (!result) return res.status(404).json({ error: "The requested record was not found." })
      res.json({ permission: result })
    } catch (error) {
      next(error)
    }
  })

  app.get("/api/admin/summary", requireAuth, requireAdmin, async (_req, res, next) => {
    try {
      const result = await pool.query(
        `SELECT
           (SELECT count(*) FROM users) AS accounts,
           (SELECT count(*) FROM users WHERE account_type = 'anonymous') AS anonymous_accounts,
           (SELECT count(*) FROM users WHERE account_type = 'registered') AS registered_accounts,
           (SELECT count(*) FROM users WHERE status = 'active') AS active_accounts,
           (SELECT count(*) FROM counseling_requests WHERE status = 'Pending') AS pending_requests,
           (SELECT count(*) FROM counseling_requests WHERE status = 'Accepted') AS accepted_requests,
           (SELECT count(*) FROM counseling_conversations WHERE status = 'open') AS open_conversations,
           (SELECT count(*) FROM discipleship_progress WHERE status = 'completed') AS completed_stages`,
      )
      const counts = result.rows[0]
      const threshold = 5
      const report = Object.fromEntries(
        Object.entries(counts).map(([key, value]) => {
          const count = Number(value)
          return [
            key,
            count < threshold
              ? { value: null, suppressed: true }
              : { value: count, suppressed: false },
          ]
        }),
      )
      res.json({ minimumCohort: threshold, summary: report })
    } catch (error) {
      next(error)
    }
  })

  app.use((req, res) => {
    res.status(404).json({ error: "API route not found." })
  })

  app.use((error, _req, res, _next) => {
    logger.error?.("API request failed:", error.message)
    if (res.headersSent) return
    if (error instanceof multer.MulterError) {
      const tooLarge = error.code === "LIMIT_FILE_SIZE"
      const profilePicture = error.field === "profilePicture" || error.field === "picture"
      return res.status(tooLarge ? 413 : 400).json({
        error: tooLarge
          ? profilePicture
            ? "Profile pictures must be 5 MB or smaller."
            : "Each upload must be 10 MB or smaller."
          : "Check the uploaded files and try again.",
      })
    }
    if (error.type === "entity.too.large") {
      return res.status(413).json({ error: "The submitted data is too large." })
    }
    res.status(500).json({ error: "The request could not be completed right now." })
  })

  return app
}
