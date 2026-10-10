import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import argon2 from "argon2"
import request from "supertest"
import { describe, expect, it } from "vitest"

import { createApp } from "../../server/app.js"
import {
  canAccessConversation,
  createPublicId,
  createRecoveryCode,
  createSessionToken,
  hashSessionToken,
  isAllowedOrigin,
  normalizeRecoveryCode,
  safeUser,
} from "../../server/security.js"

const origin = "http://localhost:8443"

class FakePool {
  user = null
  users = new Map()
  sessions = new Map()
  conversation = null
  application = null
  counselorProfile = null
  qualifications = []
  documents = []
  reviews = []
  siteSettings = {
    homepage_image: null,
    homepage_image_alt: null,
    homepage_image_type: null,
    homepage_image_updated_at: null,
  }

  async connect() {
    return { query: this.query.bind(this), release() {} }
  }

  async query(sql, params = []) {
    const queryText = sql.replace(/\s+/g, " ").trim()

    if (queryText === "SELECT 1") return { rows: [{ "?column?": 1 }], rowCount: 1 }
    if (queryText.startsWith("SELECT homepage_image_alt, homepage_image_updated_at")) {
      return {
        rows: [{
          homepage_image_alt: this.siteSettings.homepage_image_alt,
          homepage_image_updated_at: this.siteSettings.homepage_image_updated_at,
        }],
        rowCount: 1,
      }
    }
    if (queryText.startsWith("SELECT homepage_image_updated_at FROM site_settings")) {
      return { rows: [{ homepage_image_updated_at: this.siteSettings.homepage_image_updated_at }], rowCount: 1 }
    }
    if (queryText.startsWith("SELECT homepage_image IS NOT NULL AS has_homepage_image")) {
      return {
        rows: [{
          has_homepage_image: Boolean(this.siteSettings.homepage_image),
          homepage_image_alt: this.siteSettings.homepage_image_alt,
          homepage_image_type: this.siteSettings.homepage_image_type,
          homepage_image_updated_at: this.siteSettings.homepage_image_updated_at,
        }],
        rowCount: 1,
      }
    }
    if (queryText.startsWith("SELECT homepage_image, homepage_image_type")) {
      return { rows: [{ ...this.siteSettings }], rowCount: 1 }
    }
    if (queryText.startsWith("UPDATE site_settings SET homepage_image = $1")) {
      this.siteSettings.homepage_image = params[0]
      this.siteSettings.homepage_image_alt = params[1]
      this.siteSettings.homepage_image_type = params[2]
      this.siteSettings.homepage_image_updated_at = new Date().toISOString()
      return {
        rows: [{
          homepage_image_type: this.siteSettings.homepage_image_type,
          homepage_image_updated_at: this.siteSettings.homepage_image_updated_at,
        }],
        rowCount: 1,
      }
    }
    if (queryText.startsWith("UPDATE site_settings SET homepage_image = NULL")) {
      this.siteSettings = {
        homepage_image: null,
        homepage_image_alt: null,
        homepage_image_type: null,
        homepage_image_updated_at: null,
      }
      return { rows: [], rowCount: 1 }
    }
    if (queryText.startsWith("INSERT INTO users")) {
      this.user = {
        id: "internal-user-id",
        public_id: params[0],
        account_type: params[1],
        role: params[2],
        status: "active",
        display_name: null,
      }
      this.users.set(this.user.id, this.user)
      return { rows: [this.user], rowCount: 1 }
    }
    if (queryText.startsWith("INSERT INTO user_credentials")) {
      Object.assign(this.user, {
        email: params[1],
        email_normalized: params[2],
        password_hash: params[3],
        recovery_code_hash: params[4],
      })
      return { rows: [], rowCount: 1 }
    }
    if (queryText.startsWith("INSERT INTO user_profiles")) {
      this.user.display_name = params[1]
      return { rows: [], rowCount: 1 }
    }
    if (queryText.startsWith("UPDATE user_profiles SET display_name")) {
      const user = this.users.get(params[0])
      if (user) user.display_name = params[1]
      return { rows: [], rowCount: user ? 1 : 0 }
    }
    if (queryText.startsWith("UPDATE users SET account_type = 'counselor'")) {
      const user = this.users.get(params[0])
      if (user) user.account_type = "counselor"
      return { rows: [], rowCount: user ? 1 : 0 }
    }
    if (queryText.startsWith("UPDATE counselor_profiles SET headline")) {
      this.counselorProfile = {
        user_id: params[0],
        headline: params[1],
        bio: params[2],
        areas: params[3],
        languages: params[4],
        approved: true,
      }
      return { rows: [], rowCount: 1 }
    }
    if (queryText.startsWith("INSERT INTO counselor_profiles")) {
      this.counselorProfile = {
        user_id: params[0],
        headline: params[1],
        bio: params[2],
        areas: params[3],
        languages: params[4],
        approved: true,
      }
      return { rows: [], rowCount: 1 }
    }
    if (queryText.startsWith("UPDATE counselor_applications SET professional_title")) {
      if (this.application?.user_id !== params[0] || this.application.status !== "APPROVED") {
        return { rows: [], rowCount: 0 }
      }
      Object.assign(this.application, {
        professional_title: params[1],
        highest_qualification: params[2],
        institution: params[3],
        qualification_type: params[4],
        completion_year: params[5],
        certifications: params[6],
        years_experience: params[7],
        license_number: params[8],
        licensing_authority: params[9],
        license_expiry: params[10],
        biography: params[11],
        areas_of_expertise: params[12],
        languages: params[13],
        work_history: params[14],
        references_text: params[15],
      })
      return { rows: [{ id: this.application.id }], rowCount: 1 }
    }
    if (queryText.startsWith("UPDATE counselor_qualifications SET qualification")) {
      const qualification = this.qualifications.find((item) => item.application_id === params[0])
      if (!qualification) return { rows: [], rowCount: 0 }
      Object.assign(qualification, {
        qualification: params[1],
        institution: params[2],
        qualification_type: params[3],
        completion_year: params[4],
      })
      return { rows: [{ id: qualification.id }], rowCount: 1 }
    }
    if (queryText.startsWith("INSERT INTO counselor_applications")) {
      const existingAccountApplication = params.length === 5
      this.application = {
        id: "application-id",
        public_ref: params[0],
        user_id: params[1],
        status: "PENDING_APPROVAL",
        full_legal_name: params[2],
        preferred_display_name: params[3],
        phone: existingAccountApplication ? null : params[4],
        country: existingAccountApplication ? null : params[5],
        general_location: existingAccountApplication ? null : params[6],
        professional_title: existingAccountApplication ? null : params[7],
        specialization: existingAccountApplication ? params[4] : params[8],
        highest_qualification: existingAccountApplication ? null : params[9],
        institution: existingAccountApplication ? null : params[10],
        qualification_type: existingAccountApplication ? null : params[11],
        completion_year: existingAccountApplication ? null : params[12],
        certifications: existingAccountApplication ? null : params[13],
        years_experience: existingAccountApplication ? null : params[14],
        license_number: existingAccountApplication ? null : params[15],
        licensing_authority: existingAccountApplication ? null : params[16],
        license_expiry: existingAccountApplication ? null : params[17],
        biography: existingAccountApplication ? null : params[18],
        areas_of_expertise: existingAccountApplication ? [] : params[19],
        languages: existingAccountApplication ? [] : params[20],
        work_history: existingAccountApplication ? null : params[21],
        references_text: existingAccountApplication ? null : params[22],
        qualification_verified: false,
        license_verified: false,
        account_status: "active",
        submitted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
      return {
        rows: [{
          id: this.application.id,
          status: this.application.status,
          submitted_at: this.application.submitted_at,
        }],
        rowCount: 1,
      }
    }
    if (queryText.startsWith("INSERT INTO counselor_qualifications")) {
      const qualification = {
        id: "20000000-0000-4000-8000-000000000001",
        application_id: params[0],
        qualification: params[1],
        institution: params[2],
        qualification_type: params[3],
        completion_year: params[4],
        verification_status: "unverified",
      }
      this.qualifications.push(qualification)
      return { rows: [], rowCount: 1 }
    }
    if (queryText.startsWith("INSERT INTO counselor_documents")) {
      const requested = queryText.includes("'requested'")
      const document = {
        id: `10000000-0000-4000-8000-${String(this.documents.length + 1).padStart(12, "0")}`,
        application_id: params[0],
        category: params[1],
        status: requested ? "requested" : "uploaded",
        storage_key: requested ? null : params[2],
        original_name: requested ? null : params[3],
        mime_type: requested ? null : params[4],
        byte_size: requested ? null : params[5],
        uploaded_by: requested ? null : params[6],
        uploaded_at: requested ? null : new Date().toISOString(),
        requested_by: requested ? params[2] : null,
        requested_at: requested ? new Date().toISOString() : null,
      }
      this.documents.push(document)
      return {
        rows: queryText.includes("RETURNING id")
          ? [{
              id: document.id,
              category: document.category,
              status: document.status,
              original_name: document.original_name,
              mime_type: document.mime_type,
              byte_size: document.byte_size,
              uploaded_at: document.uploaded_at,
              requested_at: document.requested_at,
            }]
          : [],
        rowCount: 1,
      }
    }
    if (queryText.startsWith("SELECT id, status FROM counselor_applications")) {
      return this.application?.public_ref === String(params[0]).toUpperCase() &&
        this.application.user_id === params[1]
        ? { rows: [this.application], rowCount: 1 }
        : { rows: [], rowCount: 0 }
    }
    if (queryText.startsWith("SELECT id FROM counselor_applications WHERE user_id = $1")) {
      return this.application?.user_id === params[0]
        ? { rows: [{ id: this.application.id }], rowCount: 1 }
        : { rows: [], rowCount: 0 }
    }
    if (queryText.startsWith("SELECT id FROM counselor_documents") &&
      queryText.includes("status = 'requested'")) {
      const offset = params[2]
      const requested = this.documents.filter(
        (item) =>
          item.application_id === params[0] &&
          item.category === params[1] &&
          item.status === "requested",
      )
      return requested[offset]
        ? { rows: [{ id: requested[offset].id }], rowCount: 1 }
        : { rows: [], rowCount: 0 }
    }
    if (queryText.startsWith("UPDATE counselor_documents SET status = 'uploaded'")) {
      const document = this.documents.find((item) => item.id === params[0])
      if (!document) return { rows: [], rowCount: 0 }
      Object.assign(document, {
        status: "uploaded",
        storage_key: params[1],
        original_name: params[2],
        mime_type: params[3],
        byte_size: params[4],
        uploaded_by: params[5],
        uploaded_at: new Date().toISOString(),
      })
      return { rows: [document], rowCount: 1 }
    }
    if (queryText.startsWith("UPDATE counselor_applications SET updated_at")) {
      return { rows: [], rowCount: 1 }
    }
    if (queryText.startsWith("INSERT INTO counselor_application_responses")) {
      return { rows: [{ created_at: new Date().toISOString() }], rowCount: 1 }
    }
    if (queryText.startsWith("SELECT d.id, d.category, d.storage_key, d.original_name, d.mime_type")) {
      const document = this.documents.find(
        (item) =>
          item.id === params[1] &&
          this.application?.public_ref === String(params[0]).toUpperCase(),
      )
      return document
        ? {
            rows: [{
              ...document,
              applicant_id: this.application.user_id,
            }],
            rowCount: 1,
          }
        : { rows: [], rowCount: 0 }
    }
    if (queryText.startsWith("SELECT public_ref, status, submitted_at, updated_at FROM counselor_applications")) {
      return this.application?.user_id === params[0]
        ? { rows: [this.application], rowCount: 1 }
        : { rows: [], rowCount: 0 }
    }
    if (queryText.startsWith("SELECT a.*, u.id AS applicant_id, u.status AS account_status")) {
      return this.application?.public_ref === String(params[0]).toUpperCase()
        ? { rows: [this.application], rowCount: 1 }
        : { rows: [], rowCount: 0 }
    }
    if (queryText.startsWith("SELECT q.id, q.application_id, a.public_ref, a.qualification_verified")) {
      const qualification = this.qualifications.find(
        (item) => item.id === params[0] && this.application?.public_ref === String(params[1]).toUpperCase(),
      )
      return qualification
        ? { rows: [{
            ...qualification,
            public_ref: this.application.public_ref,
            qualification_verified: this.application.qualification_verified,
          }], rowCount: 1 }
        : { rows: [], rowCount: 0 }
    }
    if (queryText.startsWith("UPDATE counselor_qualifications SET verification_status")) {
      const qualification = this.qualifications.find((item) => item.id === params[0])
      if (qualification) qualification.verification_status = params[1]
      return { rows: [], rowCount: qualification ? 1 : 0 }
    }
    if (queryText.startsWith("UPDATE counselor_applications SET qualification_verified")) {
      if (this.application?.id === params[0]) {
        this.application.qualification_verified = params[1]
        return { rows: [], rowCount: 1 }
      }
      return { rows: [], rowCount: 0 }
    }
    if (queryText.startsWith("UPDATE counselor_applications SET status")) {
      if (this.application?.id === params[0]) {
        this.application.status = params[1]
        return { rows: [], rowCount: 1 }
      }
      return { rows: [], rowCount: 0 }
    }
    if (queryText.startsWith("UPDATE users SET role = 'counselor'")) {
      const user = this.users.get(params[0])
      if (user) user.role = "counselor"
      return { rows: [], rowCount: user ? 1 : 0 }
    }
    if (queryText.startsWith("SELECT a.id FROM counselor_applications a")) {
      return this.application?.user_id === params[0] && this.application.status === "APPROVED"
        ? { rows: [{ id: this.application.id }], rowCount: 1 }
        : { rows: [], rowCount: 0 }
    }
    if (queryText.startsWith("SELECT p.display_name, c.headline, c.bio, c.areas, c.languages")) {
      if (!this.application || this.application.user_id !== params[0] || this.application.status !== "APPROVED") {
        return { rows: [], rowCount: 0 }
      }
      return {
        rows: [{
          ...(this.counselorProfile || {}),
          display_name: this.users.get(params[0])?.display_name,
          public_ref: this.application.public_ref,
          application_id: this.application.id,
          professional_title: this.application.professional_title,
          highest_qualification: this.application.highest_qualification,
          institution: this.application.institution,
          qualification_type: this.application.qualification_type,
          completion_year: this.application.completion_year,
          certifications: this.application.certifications,
          years_experience: this.application.years_experience,
          license_number: this.application.license_number,
          licensing_authority: this.application.licensing_authority,
          license_expiry: this.application.license_expiry,
          work_history: this.application.work_history,
          references_text: this.application.references_text,
          qualification_verified: this.application.qualification_verified,
          license_verified: this.application.license_verified,
        }],
        rowCount: 1,
      }
    }
    if (queryText.startsWith("SELECT id, category, status, original_name, mime_type, byte_size, uploaded_at, requested_at") &&
      queryText.includes("FROM counselor_documents WHERE application_id")) {
      return {
        rows: this.documents.filter((item) => item.application_id === params[0]),
        rowCount: this.documents.length,
      }
    }
    if (queryText.startsWith("SELECT id, role, account_type FROM users WHERE public_id")) {
      const user = [...this.users.values()].find(
        (item) => item.public_id === String(params[0]).toUpperCase(),
      )
      return user ? { rows: [user], rowCount: 1 } : { rows: [], rowCount: 0 }
    }
    if (queryText.startsWith("UPDATE users SET role = $2")) {
      const user = this.users.get(params[0])
      if (user) user.role = params[1]
      return { rows: [], rowCount: user ? 1 : 0 }
    }
    if (queryText.startsWith("UPDATE users SET status = $2")) {
      const user = [...this.users.values()].find(
        (item) => item.public_id === String(params[0]).toUpperCase(),
      )
      if (user) {
        user.status = params[1]
        return { rows: [{ id: user.id, public_id: user.public_id, status: user.status }], rowCount: 1 }
      }
      return { rows: [], rowCount: 0 }
    }
    if (queryText.startsWith("INSERT INTO counselor_reviews")) {
      this.reviews.push({
        application_id: params[0],
        reviewer_id: params[1],
        action: params[2],
        reason: params[3],
        requested_document_categories: Array.isArray(params[4]) ? params[4] : [],
        created_at: new Date().toISOString(),
      })
      return { rows: [], rowCount: 1 }
    }
    if (queryText.includes("FROM counselor_documents WHERE application_id = (") &&
      queryText.includes("counselor_applications WHERE user_id")) {
      return { rows: this.documents.filter((item) => item.application_id === this.application?.id), rowCount: this.documents.length }
    }
    if (queryText.includes("FROM counselor_reviews") &&
      queryText.includes("action = 'REQUESTED_MORE_INFORMATION'")) {
      const requested = this.reviews
        .filter((review) => review.action === "REQUESTED_MORE_INFORMATION")
        .map((review) => ({
          reason: review.reason,
          requested_document_categories: review.requested_document_categories,
          created_at: review.created_at,
        }))
      return { rows: requested, rowCount: requested.length }
    }
    if (queryText.startsWith("INSERT INTO user_notifications")) {
      return { rows: [], rowCount: 1 }
    }
    if (queryText.startsWith("INSERT INTO sessions")) {
      this.sessions.set(Buffer.from(params[1]).toString("hex"), {
        revoked: false,
        user: this.users.get(params[0]) || this.user,
      })
      return { rows: [], rowCount: 1 }
    }
    if (queryText.includes("JOIN sessions s")) {
      const key = Buffer.from(params[0]).toString("hex")
      const session = this.sessions.get(key)
      const sessionUser = session?.user || this.user
      return session && !session.revoked && sessionUser?.status === "active"
        ? { rows: [sessionUser], rowCount: 1 }
        : { rows: [], rowCount: 0 }
    }
    if (queryText.startsWith("UPDATE sessions SET last_seen_at")) {
      return { rows: [], rowCount: 1 }
    }
    if (queryText.startsWith("UPDATE sessions SET revoked_at")) {
      if (queryText.includes("token_hash <> $2")) {
        const currentToken = Buffer.from(params[1]).toString("hex")
        for (const [key, session] of this.sessions) {
          if (key !== currentToken) session.revoked = true
        }
        return { rows: [], rowCount: this.sessions.size - 1 }
      }
      for (const session of this.sessions.values()) session.revoked = true
      return { rows: [], rowCount: this.sessions.size }
    }
    if (queryText.startsWith("SELECT password_hash FROM user_credentials")) {
      return this.user
        ? { rows: [{ password_hash: this.user.password_hash }], rowCount: 1 }
        : { rows: [], rowCount: 0 }
    }
    if (queryText.startsWith("UPDATE user_credentials SET password_hash = $2, updated_at")) {
      if (this.user) this.user.password_hash = params[1]
      return { rows: [], rowCount: this.user ? 1 : 0 }
    }
    if (queryText.includes("c.email_normalized = $1 OR u.public_id = upper($1)")) {
      const login = String(params[0]).toLowerCase()
      return this.user &&
        (this.user.email_normalized === login || this.user.public_id.toLowerCase() === login)
        ? { rows: [this.user], rowCount: 1 }
        : { rows: [], rowCount: 0 }
    }
    if (queryText.includes("WHERE u.public_id = upper($1)") && queryText.includes("FOR UPDATE")) {
      return this.user?.public_id === String(params[0]).toUpperCase()
        ? { rows: [this.user], rowCount: 1 }
        : { rows: [], rowCount: 0 }
    }
    if (queryText.startsWith("UPDATE user_credentials SET password_hash")) {
      this.user.password_hash = params[1]
      this.user.recovery_code_hash = params[2]
      return { rows: [], rowCount: 1 }
    }
    if (queryText.startsWith("INSERT INTO audit_logs")) {
      return { rows: [], rowCount: 1 }
    }
    if (queryText.startsWith("SELECT * FROM counseling_conversations")) {
      return this.conversation?.public_id === String(params[0]).toUpperCase()
        ? { rows: [this.conversation], rowCount: 1 }
        : { rows: [], rowCount: 0 }
    }
    if (queryText.startsWith("SELECT m.body")) {
      return { rows: [{ body: "Assigned message", sender_role: "counselor" }], rowCount: 1 }
    }
    return { rows: [], rowCount: 0 }
  }
}

function cookieFrom(response) {
  return response.headers["set-cookie"][0].split(";")[0]
}

function counselorApplication(overrides = {}) {
  return {
    email: "counselor@example.org",
    password: "a-long-private-password",
    fullLegalName: "Jordan Counselor",
    preferredDisplayName: "Jordan",
    phone: "",
    country: "Liberia",
    generalLocation: "Monrovia",
    professionalTitle: "Pastoral Counselor",
    specialization: "Family support",
    highestQualification: "Master of Counseling",
    institution: "Example University",
    qualificationType: "Degree",
    completionYear: 2020,
    certifications: "",
    yearsExperience: 4,
    licenseNumber: "",
    licensingAuthority: "",
    licenseExpiry: null,
    biography: "Experienced counselor providing compassionate and confidential support.",
    areasOfExpertise: ["Pastoral counseling", "Family support"],
    languages: ["English"],
    workHistory: "",
    referencesText: "",
    codeOfConductAccepted: true,
    confidentialityAccepted: true,
    safeguardingAccepted: true,
    ...overrides,
  }
}

function basicCounselorApplication(overrides = {}) {
  return counselorApplication({
    preferredDisplayName: "",
    phone: "",
    country: "",
    generalLocation: "",
    professionalTitle: "",
    highestQualification: "",
    institution: "",
    qualificationType: "",
    completionYear: null,
    certifications: "",
    yearsExperience: null,
    licenseNumber: "",
    licensingAuthority: "",
    licenseExpiry: null,
    areasOfExpertise: [],
    languages: [],
    biography: null,
    workHistory: "",
    referencesText: "",
    ...overrides,
  })
}

function addSuperAdmin(pool) {
  const admin = {
    id: "admin-id",
    public_id: "SA-23456789",
    account_type: "registered",
    role: "superadmin",
    status: "active",
    display_name: "Reviewer",
  }
  pool.users.set(admin.id, admin)
  const token = createSessionToken()
  pool.sessions.set(hashSessionToken(token).toString("hex"), {
    revoked: false,
    user: admin,
  })
  return `sc_session=${token}`
}

describe("account credential helpers", () => {
  it("creates unique-looking public IDs and high-entropy recovery codes", () => {
    const firstId = createPublicId("AN")
    const secondId = createPublicId("AN")
    const recoveryCode = createRecoveryCode()

    expect(firstId).toMatch(/^AN-[A-Z2-9]{8}$/)
    expect(secondId).not.toBe(firstId)
    expect(recoveryCode.replaceAll("-", "")).toHaveLength(43)
    expect(normalizeRecoveryCode(recoveryCode)).toMatch(/^[a-z0-9]{43}$/)
  })

  it("hashes opaque sessions and excludes internal credentials from user data", () => {
    const token = createSessionToken()
    expect(hashSessionToken(token)).not.toEqual(hashSessionToken(createSessionToken()))
    expect(hashSessionToken(token)).toHaveLength(32)
    expect(safeUser({
      id: "internal-id",
      public_id: "AN-23456789",
      account_type: "anonymous",
      role: "anonymous",
      status: "active",
      display_name: null,
      password_hash: "never-return",
      recovery_code_hash: "never-return",
    })).toEqual({
      publicId: "AN-23456789",
      accountType: "anonymous",
      role: "anonymous",
      status: "active",
      displayName: null,
    })
  })

  it("requires exact allowlisted origins and enforces assigned-only conversation access", () => {
    const allowed = new Set([origin])
    expect(isAllowedOrigin(origin, allowed)).toBe(true)
    expect(isAllowedOrigin("https://attacker.example", allowed)).toBe(false)
    const conversation = { seeker_id: "seeker", counselor_id: "assigned", status: "active" }
    expect(canAccessConversation({ id: "seeker", role: "anonymous", status: "active" }, conversation)).toBe(true)
    expect(canAccessConversation({ id: "assigned", role: "counselor", status: "active" }, conversation)).toBe(true)
    expect(canAccessConversation({ id: "other", role: "counselor", status: "active" }, conversation)).toBe(false)
    expect(canAccessConversation({ id: "admin", role: "superadmin", status: "active" }, conversation)).toBe(false)
  })
})

describe("Express authentication and authorization", () => {
  it("serves public site settings but limits homepage-image changes to SuperAdmins", async () => {
    const pool = new FakePool()
    const admin = {
      id: "site-admin-id",
      public_id: "SA-23456789",
      account_type: "registered",
      role: "superadmin",
      status: "active",
      display_name: "Site Administrator",
    }
    const adminToken = createSessionToken()
    pool.users.set(admin.id, admin)
    pool.sessions.set(hashSessionToken(adminToken).toString("hex"), {
      revoked: false,
      user: admin,
    })
    const app = createApp({ pool, allowedOrigins: origin, secureCookies: false })

    expect((await request(app).get("/api/site-settings")).body.homepageImageUrl).toBeNull()
    expect((await request(app).get("/api/site-settings/homepage-image")).status).toBe(404)
    expect((await request(app).get("/api/admin/site-settings")).status).toBe(401)

    const seeker = {
      ...admin,
      id: "site-seeker-id",
      public_id: "SC-23456789",
      role: "registered",
    }
    const seekerToken = createSessionToken()
    pool.users.set(seeker.id, seeker)
    pool.sessions.set(hashSessionToken(seekerToken).toString("hex"), {
      revoked: false,
      user: seeker,
    })
    const forbidden = await request(app)
      .post("/api/admin/site-settings/homepage-image")
      .set("Origin", origin)
      .set("Cookie", `sc_session=${seekerToken}`)
    expect(forbidden.status).toBe(403)

    const png = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x00,
    ])
    const uploaded = await request(app)
      .post("/api/admin/site-settings/homepage-image")
      .set("Origin", origin)
      .set("Cookie", `sc_session=${adminToken}`)
      .field("homepageImageAlt", "A welcoming ministry community")
      .attach("homepageImage", png, { filename: "homepage.png", contentType: "image/png" })
    expect(uploaded.status).toBe(200)
    expect(uploaded.body.homepageImageType).toBe("image/png")
    expect(uploaded.body.homepageImageAlt).toBe("A welcoming ministry community")

    const publicSettings = await request(app).get("/api/site-settings")
    expect(publicSettings.body.homepageImageUrl).toMatch(/^\/site-settings\/homepage-image\?v=/)
    expect(publicSettings.body.homepageImageAlt).toBe("A welcoming ministry community")
    const image = await request(app).get("/api/site-settings/homepage-image")
    expect(image.status).toBe(200)
    expect(image.headers["content-type"]).toMatch(/^image\/png/)
    expect(image.headers["x-content-type-options"]).toBe("nosniff")
    expect(image.headers["cache-control"]).toContain("immutable")

    const invalidImage = await request(app)
      .post("/api/admin/site-settings/homepage-image")
      .set("Origin", origin)
      .set("Cookie", `sc_session=${adminToken}`)
      .field("homepageImageAlt", "A different image description")
      .attach("homepageImage", Buffer.from("not an image"), {
        filename: "homepage.png",
        contentType: "image/png",
      })
    expect(invalidImage.status).toBe(400)
    expect((await request(app).get("/api/site-settings")).body.homepageImageAlt)
      .toBe("A welcoming ministry community")

    const removed = await request(app)
      .delete("/api/admin/site-settings/homepage-image")
      .set("Origin", origin)
      .set("Cookie", `sc_session=${adminToken}`)
    expect(removed.status).toBe(204)
    expect((await request(app).get("/api/site-settings")).body.homepageImageUrl).toBeNull()
  })

  it("changes an account password only after verifying the current password and revokes other sessions", async () => {
    const pool = new FakePool()
    const currentPassword = "a-long-private-password"
    const user = {
      id: "password-user-id",
      public_id: "SC-23456789",
      account_type: "registered",
      role: "registered",
      status: "active",
      display_name: "Account Holder",
      password_hash: await argon2.hash(currentPassword),
      recovery_code_hash: await argon2.hash("private-recovery-code-value"),
      email_normalized: "password@example.org",
    }
    pool.user = user
    pool.users.set(user.id, user)
    const currentToken = createSessionToken()
    const otherToken = createSessionToken()
    pool.sessions.set(hashSessionToken(currentToken).toString("hex"), {
      revoked: false,
      user,
    })
    pool.sessions.set(hashSessionToken(otherToken).toString("hex"), {
      revoked: false,
      user,
    })
    const app = createApp({ pool, allowedOrigins: origin, secureCookies: false })
    const change = (current, next) =>
      request(app)
        .patch("/api/me/password")
        .set("Origin", origin)
        .set("Cookie", `sc_session=${currentToken}`)
        .send({ currentPassword: current, newPassword: next })

    expect((await change("wrong-current-password", "a-different-long-password")).status).toBe(403)
    expect((await change(currentPassword, currentPassword)).status).toBe(400)
    const updated = await change(currentPassword, "a-different-long-password")
    expect(updated.status).toBe(200)
    expect(await argon2.verify(user.password_hash, "a-different-long-password")).toBe(true)
    expect((await request(app).get("/api/me").set("Cookie", `sc_session=${currentToken}`)).status)
      .toBe(200)
    expect((await request(app).get("/api/me").set("Cookie", `sc_session=${otherToken}`)).status)
      .toBe(401)
  })

  it("requires regular-user consent and creates only the submitted regular role", async () => {
    const pool = new FakePool()
    const app = createApp({ pool, allowedOrigins: origin, secureCookies: false })
    const missingConsent = await request(app)
      .post("/api/auth/register")
      .set("Origin", origin)
      .send({
        email: "regular@example.org",
        displayName: "Regular User",
        password: "a-long-private-password",
      })
    expect(missingConsent.status).toBe(400)

    const created = await request(app)
      .post("/api/auth/register")
      .set("Origin", origin)
      .send({
        email: "regular@example.org",
        displayName: "Regular User",
        password: "a-long-private-password",
        consent: true,
        role: "superadmin",
        status: "active",
      })
    expect(created.status).toBe(201)
    expect(created.body.user.accountType).toBe("registered")
    expect(created.body.user.role).toBe("registered")
    const cookie = cookieFrom(created)
    expect((await request(app).get("/api/journey").set("Cookie", cookie)).status).toBe(200)
    expect((await request(app).get("/api/counselor/cases").set("Cookie", cookie)).status).toBe(403)
    expect((await request(app).get("/api/admin/summary").set("Cookie", cookie)).status).toBe(403)
  })

  it("lets an existing regular account apply without creating a duplicate identity", async () => {
    const pool = new FakePool()
    const app = createApp({ pool, allowedOrigins: origin, secureCookies: false })
    const registered = await request(app)
      .post("/api/auth/register")
      .set("Origin", origin)
      .send({
        email: "existing-user@example.org",
        displayName: "Existing User",
        password: "a-long-private-password",
        consent: true,
      })
    expect(registered.status).toBe(201)
    const cookie = cookieFrom(registered)
    const invalidApplication = await request(app)
      .post("/api/counselor/applications")
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({
        fullLegalName: "Existing User",
        specialization: "",
        codeOfConductAccepted: true,
        confidentialityAccepted: true,
        safeguardingAccepted: true,
      })
    expect(invalidApplication.status).toBe(400)

    const submitted = await request(app)
      .post("/api/counselor/applications")
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({
        fullLegalName: "Existing User",
        preferredDisplayName: null,
        specialization: "Family support",
        codeOfConductAccepted: true,
        confidentialityAccepted: true,
        safeguardingAccepted: true,
      })
    expect(submitted.status).toBe(201)
    expect(submitted.body.user.publicId).toBe(registered.body.user.publicId)
    expect(submitted.body.user.accountType).toBe("counselor")
    expect(submitted.body.user.role).toBe("registered")
    expect(submitted.body.application.status).toBe("PENDING_APPROVAL")
    expect(pool.application.user_id).toBe("internal-user-id")
    expect(pool.application.biography).toBeNull()
    expect(pool.documents).toHaveLength(0)

    const status = await request(app)
      .get("/api/counselor/applications/me")
      .set("Cookie", cookie)
    expect(status.status).toBe(200)
    expect(status.body.application.publicRef).toBe(submitted.body.application.publicRef)

    const adminCookie = addSuperAdmin(pool)
    const approved = await request(app)
      .patch(`/api/admin/counselor-applications/${submitted.body.application.publicRef}/review`)
      .set("Origin", origin)
      .set("Cookie", adminCookie)
      .send({ action: "APPROVED" })
    expect(approved.status).toBe(200)
    expect(pool.users.get("internal-user-id").role).toBe("counselor")
  })

  it("accepts a counselor application without documents and leaves counselor access disabled", async () => {
    const pool = new FakePool()
    const app = createApp({ pool, allowedOrigins: origin, secureCookies: false })
    const submitted = await request(app)
      .post("/api/auth/counselor")
      .set("Origin", origin)
      .field("application", JSON.stringify({
        ...basicCounselorApplication(),
        role: "counselor",
        approvalStatus: "APPROVED",
      }))

    expect(submitted.status).toBe(201)
    expect(submitted.body.user.accountType).toBe("counselor")
    expect(submitted.body.user.role).toBe("registered")
    expect(submitted.body.application.status).toBe("PENDING_APPROVAL")
    expect(pool.documents).toHaveLength(0)
    expect(pool.qualifications).toHaveLength(0)
    expect(pool.application.preferred_display_name).toBe("Jordan Counselor")
    expect(pool.application.professional_title).toBeNull()

    const cookie = cookieFrom(submitted)
    const ownStatus = await request(app)
      .get("/api/counselor/applications/me")
      .set("Cookie", cookie)
    expect(ownStatus.status).toBe(200)
    expect(ownStatus.body.application.status).toBe("PENDING_APPROVAL")

    const counselorCases = await request(app)
      .get("/api/counselor/cases")
      .set("Cookie", cookie)
    expect(counselorCases.status).toBe(403)
    const seekerRequests = await request(app).get("/api/requests").set("Cookie", cookie)
    expect(seekerRequests.status).toBe(403)
    const applicationAdministration = await request(app)
      .get("/api/admin/counselor-applications")
      .set("Cookie", cookie)
    expect(applicationAdministration.status).toBe(403)

    const adminCookie = addSuperAdmin(pool)
    const approved = await request(app)
      .patch(`/api/admin/counselor-applications/${submitted.body.application.publicRef}/review`)
      .set("Origin", origin)
      .set("Cookie", adminCookie)
      .send({ action: "APPROVED" })
    expect(approved.status).toBe(200)
    expect(pool.application.status).toBe("APPROVED")
    expect(pool.application.qualification_verified).toBe(false)
    expect(pool.application.license_verified).toBe(false)
    expect(pool.users.get("internal-user-id").role).toBe("counselor")
    expect((await request(app).get("/api/counselor/cases").set("Cookie", cookie)).status).toBe(200)
  })

  it("permits approval with partially provided optional credentials without credential verification", async () => {
    const pool = new FakePool()
    const privateDirectory = await mkdtemp(path.join(os.tmpdir(), "shepherdconnect-optional-counselor-"))
    try {
      const app = createApp({
        pool,
        allowedOrigins: origin,
        secureCookies: false,
        privateDocumentPath: privateDirectory,
      })
      const submitted = await request(app)
        .post("/api/auth/counselor")
        .set("Origin", origin)
        .field("application", JSON.stringify(basicCounselorApplication({
          licenseNumber: "LIC-OPTIONAL-001",
          licensingAuthority: "Optional Board",
        })))
        .attach("qualificationDocuments", Buffer.from("%PDF-1.7\noptional"), {
          filename: "optional-credential.pdf",
          contentType: "application/pdf",
        })
      expect(submitted.status).toBe(201)
      expect(pool.documents).toHaveLength(1)
      expect(pool.documents[0].status).toBe("uploaded")
      expect(pool.application.license_verified).toBe(false)
      expect(pool.qualifications).toHaveLength(0)

      const adminCookie = addSuperAdmin(pool)
      const reference = submitted.body.application.publicRef
      const applicantCookie = cookieFrom(submitted)
      const beforeApprovalUpload = await request(app)
        .post("/api/counselor/profile/documents")
        .set("Origin", origin)
        .set("Cookie", applicantCookie)
        .attach("qualificationDocuments", Buffer.from("%PDF-1.7\noptional"), {
          filename: "optional-credential.pdf",
          contentType: "application/pdf",
        })
      expect(beforeApprovalUpload.status).toBe(403)

      const approved = await request(app)
        .patch(`/api/admin/counselor-applications/${reference}/review`)
        .set("Origin", origin)
        .set("Cookie", adminCookie)
        .send({ action: "APPROVED" })
      expect(approved.status).toBe(200)
      expect(pool.application.status).toBe("APPROVED")
      expect(pool.application.license_verified).toBe(false)

      const profileUpdate = await request(app)
        .patch("/api/counselor/profile")
        .set("Origin", origin)
        .set("Cookie", applicantCookie)
        .send({
          displayName: "Jordan Counselor",
          headline: "Family support",
          bio: "I offer compassionate, confidential support.",
          areas: ["Family support"],
          languages: ["English"],
          professionalTitle: "Pastoral Counselor",
          highestQualification: "Certificate in Counseling",
          institution: "Example Institute",
          qualificationType: "Certificate",
          completionYear: 2022,
          certifications: "Pastoral care",
          yearsExperience: 3,
          licenseNumber: "LIC-OPTIONAL-001",
          licensingAuthority: "Optional Board",
          licenseExpiry: null,
          workHistory: "Community counseling",
          referencesText: "Available on request",
        })
      expect(profileUpdate.status).toBe(200)
      expect(pool.application.biography).toBe("I offer compassionate, confidential support.")
      expect(pool.application.work_history).toBe("Community counseling")
      expect(pool.application.qualification_verified).toBe(false)
      expect(pool.qualifications).toHaveLength(1)

      const uploaded = await request(app)
        .post("/api/counselor/profile/documents")
        .set("Origin", origin)
        .set("Cookie", applicantCookie)
        .attach("qualificationDocuments", Buffer.from("%PDF-1.7\ncredential"), {
          filename: "qualification.pdf",
          contentType: "application/pdf",
        })
        .attach("profilePhoto", Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
          filename: "profile.jpg",
          contentType: "image/jpeg",
        })
      expect(uploaded.status).toBe(201)
      expect(uploaded.body.documents).toHaveLength(2)
      expect(pool.documents).toHaveLength(3)
      expect(pool.documents.slice(1).every((document) => document.status === "uploaded")).toBe(true)

      const profile = await request(app)
        .get("/api/counselor/profile")
        .set("Cookie", applicantCookie)
      expect(profile.status).toBe(200)
      expect(profile.body.profile.documents).toHaveLength(3)
    } finally {
      await rm(privateDirectory, { recursive: true, force: true })
    }
  })

  it("keeps specialization and biography required and records rejection reasons", async () => {
    const pool = new FakePool()
    const app = createApp({ pool, allowedOrigins: origin, secureCookies: false })
    const missingRequired = await request(app)
      .post("/api/auth/counselor")
      .set("Origin", origin)
      .field("application", JSON.stringify(basicCounselorApplication({
        fullLegalName: "",
        specialization: "",
        biography: "",
      })))
    expect(missingRequired.status).toBe(400)
    const invalidEmail = await request(app)
      .post("/api/auth/counselor")
      .set("Origin", origin)
      .field("application", JSON.stringify(basicCounselorApplication({ email: "not-an-email" })))
    expect(invalidEmail.status).toBe(400)
    expect(pool.application).toBeNull()

    const submitted = await request(app)
      .post("/api/auth/counselor")
      .set("Origin", origin)
      .field("application", JSON.stringify(basicCounselorApplication()))
    expect(submitted.status).toBe(201)
    const adminCookie = addSuperAdmin(pool)
    const reference = submitted.body.application.publicRef
    const missingReason = await request(app)
      .patch(`/api/admin/counselor-applications/${reference}/review`)
      .set("Origin", origin)
      .set("Cookie", adminCookie)
      .send({ action: "REJECTED" })
    expect(missingReason.status).toBe(400)

    const rejected = await request(app)
      .patch(`/api/admin/counselor-applications/${reference}/review`)
      .set("Origin", origin)
      .set("Cookie", adminCookie)
      .send({ action: "REJECTED", reason: "Please add the missing biography details." })
    expect(rejected.status).toBe(200)
    expect(pool.application.status).toBe("REJECTED")
    expect(pool.users.get("internal-user-id").role).toBe("registered")
  })

  it("requires SuperAdmin review and supports separate credential verification", async () => {
    const pool = new FakePool()
    const app = createApp({ pool, allowedOrigins: origin, secureCookies: false })
    const submitted = await request(app)
      .post("/api/auth/counselor")
      .set("Origin", origin)
      .field("application", JSON.stringify(counselorApplication()))
    expect(submitted.status).toBe(201)

    const adminCookie = addSuperAdmin(pool)
    const reference = submitted.body.application.publicRef
    const applicantCookie = cookieFrom(submitted)
    const registeredAccount = {
      id: "regular-id",
      public_id: "SC-23456789",
      account_type: "registered",
      role: "registered",
      status: "active",
      display_name: "Regular",
    }
    pool.users.set(registeredAccount.id, registeredAccount)
    const directPromotion = await request(app)
      .patch("/api/admin/users/SC-23456789/role")
      .set("Origin", origin)
      .set("Cookie", adminCookie)
      .send({ role: "counselor" })
    expect(directPromotion.status).toBe(409)

    const directApproval = await request(app)
      .patch(`/api/admin/counselors/${reference}/approval`)
      .set("Origin", origin)
      .set("Cookie", adminCookie)
      .send({ approved: true })
    expect(directApproval.status).toBe(409)

    const moreInformation = await request(app)
      .patch(`/api/admin/counselor-applications/${reference}/review`)
      .set("Origin", origin)
      .set("Cookie", adminCookie)
      .send({
        action: "MORE_INFORMATION_REQUIRED",
        reason: "Please provide the qualification document for verification.",
        requestedDocumentCategories: ["qualification"],
      })
    expect(moreInformation.status).toBe(200)

    const applicantStatus = await request(app)
      .get("/api/counselor/applications/me")
      .set("Cookie", applicantCookie)
    expect(applicantStatus.body.application.status).toBe("MORE_INFORMATION_REQUIRED")
    expect(applicantStatus.body.application.documents[0].status).toBe("requested")
    expect(applicantStatus.body.application.informationRequests).toHaveLength(1)

    const applicantResponse = await request(app)
      .post(`/api/counselor/applications/${reference}/responses`)
      .set("Origin", origin)
      .set("Cookie", applicantCookie)
      .send({ message: "I will provide the requested information." })
    expect(applicantResponse.status).toBe(201)

    const movedToReview = await request(app)
      .patch(`/api/admin/counselor-applications/${reference}/review`)
      .set("Origin", origin)
      .set("Cookie", adminCookie)
      .send({ action: "UNDER_REVIEW", reason: "Initial review started." })
    expect(movedToReview.status).toBe(200)
    expect(pool.application.status).toBe("UNDER_REVIEW")

    const approved = await request(app)
      .patch(`/api/admin/counselor-applications/${reference}/review`)
      .set("Origin", origin)
      .set("Cookie", adminCookie)
      .send({ action: "APPROVED", reason: "Application reviewed and approved." })
    expect(approved.status).toBe(200)
    expect(pool.application.status).toBe("APPROVED")
    expect(pool.users.get("internal-user-id").role).toBe("counselor")

    const verified = await request(app)
      .patch(`/api/admin/counselor-applications/${reference}/qualifications/20000000-0000-4000-8000-000000000001/verification`)
      .set("Origin", origin)
      .set("Cookie", adminCookie)
      .send({ verified: true, reason: "Credential verified with issuer." })
    expect(verified.status).toBe(200)
    expect(pool.application.qualification_verified).toBe(true)

    const counselorCases = await request(app)
      .get("/api/counselor/cases")
      .set("Cookie", applicantCookie)
    expect(counselorCases.status).toBe(200)

    const suspended = await request(app)
      .patch(`/api/admin/users/${submitted.body.user.publicId}/status`)
      .set("Origin", origin)
      .set("Cookie", adminCookie)
      .send({ status: "suspended" })
    expect(suspended.status).toBe(200)
    expect(pool.application.status).toBe("APPROVED")
    expect((await request(app).get("/api/counselor/cases").set("Cookie", applicantCookie)).status).toBe(401)
  })

  it("rejects forged counselor status and invalid document content", async () => {
    const pool = new FakePool()
    const app = createApp({ pool, allowedOrigins: origin, secureCookies: false })
    const rejected = await request(app)
      .post("/api/auth/counselor")
      .set("Origin", origin)
      .field("application", JSON.stringify(counselorApplication()))
      .attach("profilePhoto", Buffer.from("not an image"), {
        filename: "photo.png",
        contentType: "image/png",
      })

    expect(rejected.status).toBe(400)
    expect(pool.application).toBeNull()
  })

  it("stores counselor documents privately and denies access to unrelated users", async () => {
    const pool = new FakePool()
    const privateDirectory = await mkdtemp(path.join(os.tmpdir(), "shepherdconnect-docs-"))
    try {
      const app = createApp({
        pool,
        allowedOrigins: origin,
        secureCookies: false,
        privateDocumentPath: privateDirectory,
      })
      const submitted = await request(app)
        .post("/api/auth/counselor")
        .set("Origin", origin)
        .field("application", JSON.stringify(counselorApplication()))
        .attach("qualificationDocuments", Buffer.from("%PDF-1.7\nprivate document"), {
          filename: "credential.pdf",
          contentType: "application/pdf",
        })
      expect(submitted.status).toBe(201)
      expect(pool.documents).toHaveLength(1)
      expect(pool.documents[0].storage_key).toMatch(/^[a-f0-9]{64}$/)
      expect(submitted.body.user).not.toHaveProperty("storage_key")

      const reference = submitted.body.application.publicRef
      const documentId = pool.documents[0].id
      const ownerDownload = await request(app)
        .get(`/api/counselor/applications/${reference}/documents/${documentId}`)
        .set("Cookie", cookieFrom(submitted))
      expect(ownerDownload.status).toBe(200)
      expect(ownerDownload.headers["content-type"]).toContain("application/pdf")
      expect(ownerDownload.headers["cache-control"]).toContain("no-store")

      const unrelatedUser = {
        id: "unrelated-user",
        public_id: "SC-23456789",
        account_type: "registered",
        role: "registered",
        status: "active",
        display_name: "Unrelated",
      }
      pool.users.set(unrelatedUser.id, unrelatedUser)
      const unrelatedToken = createSessionToken()
      pool.sessions.set(hashSessionToken(unrelatedToken).toString("hex"), {
        revoked: false,
        user: unrelatedUser,
      })
      const unrelatedDownload = await request(app)
        .get(`/api/counselor/applications/${reference}/documents/${documentId}`)
        .set("Cookie", `sc_session=${unrelatedToken}`)
      expect(unrelatedDownload.status).toBe(404)
    } finally {
      await rm(privateDirectory, { recursive: true, force: true })
    }
  })

  it("allows only reviewer-requested additional documents from the applicant", async () => {
    const pool = new FakePool()
    const privateDirectory = await mkdtemp(path.join(os.tmpdir(), "shepherdconnect-extra-docs-"))
    try {
      const app = createApp({
        pool,
        allowedOrigins: origin,
        secureCookies: false,
        privateDocumentPath: privateDirectory,
      })
      const submitted = await request(app)
        .post("/api/auth/counselor")
        .set("Origin", origin)
        .field("application", JSON.stringify(counselorApplication()))
      const reference = submitted.body.application.publicRef
      const admin = {
        id: "reviewer-id",
        public_id: "SA-23456789",
        account_type: "registered",
        role: "superadmin",
        status: "active",
        display_name: "Reviewer",
      }
      pool.users.set(admin.id, admin)
      const adminToken = createSessionToken()
      pool.sessions.set(hashSessionToken(adminToken).toString("hex"), {
        revoked: false,
        user: admin,
      })
      const requested = await request(app)
        .patch(`/api/admin/counselor-applications/${reference}/review`)
        .set("Origin", origin)
        .set("Cookie", `sc_session=${adminToken}`)
        .send({
          action: "MORE_INFORMATION_REQUIRED",
          reason: "Please provide a qualification document.",
          requestedDocumentCategories: ["qualification"],
        })
      expect(requested.status).toBe(200)

      const ownerCookie = cookieFrom(submitted)
      const unrequestedUpload = await request(app)
        .post(`/api/counselor/applications/${reference}/documents`)
        .set("Origin", origin)
        .set("Cookie", ownerCookie)
        .attach("supportingDocuments", Buffer.from("%PDF-1.7\nextra"), {
          filename: "extra.pdf",
          contentType: "application/pdf",
        })
      expect(unrequestedUpload.status).toBe(400)
      expect(pool.documents[0].status).toBe("requested")

      const uploaded = await request(app)
        .post(`/api/counselor/applications/${reference}/documents`)
        .set("Origin", origin)
        .set("Cookie", ownerCookie)
        .attach("qualificationDocuments", Buffer.from("%PDF-1.7\ncredential"), {
          filename: "qualification.pdf",
          contentType: "application/pdf",
        })
      expect(uploaded.status).toBe(201)
      expect(uploaded.body.documents[0].status).toBe("uploaded")
      expect(pool.documents[0].storage_key).toMatch(/^[a-f0-9]{64}$/)
    } finally {
      await rm(privateDirectory, { recursive: true, force: true })
    }
  })

  it("creates a private account, authenticates a server session, and rotates recovery material", async () => {
    const pool = new FakePool()
    const app = createApp({ pool, allowedOrigins: origin, secureCookies: false })
    const created = await request(app)
      .post("/api/auth/anonymous")
      .set("Origin", origin)
      .send({ password: "a-long-private-password" })

    expect(created.status).toBe(201)
    expect(created.body.user.accountType).toBe("anonymous")
    expect(created.body.user.publicId).toMatch(/^AN-/)
    expect(created.body.user).not.toHaveProperty("id")
    expect(created.body.recoveryCode).toBeTruthy()
    expect(created.headers["set-cookie"][0]).toContain("HttpOnly")
    const oldCookie = cookieFrom(created)

    const session = await request(app).get("/api/me").set("Cookie", oldCookie)
    expect(session.status).toBe(200)
    expect(session.body.user.publicId).toBe(created.body.user.publicId)

    const recovered = await request(app)
      .post("/api/auth/recover")
      .set("Origin", origin)
      .send({
        publicId: created.body.user.publicId,
        recoveryCode: created.body.recoveryCode,
        newPassword: "a-different-secure-password",
      })
    expect(recovered.status).toBe(200)
    expect(recovered.body.recoveryCode).not.toBe(created.body.recoveryCode)
    expect((await request(app).get("/api/me").set("Cookie", oldCookie)).status).toBe(401)

    const oldCode = await request(app)
      .post("/api/auth/recover")
      .set("Origin", origin)
      .send({
        publicId: created.body.user.publicId,
        recoveryCode: created.body.recoveryCode,
        newPassword: "another-new-secure-password",
      })
    expect(oldCode.status).toBe(401)

    const login = await request(app)
      .post("/api/auth/login")
      .set("Origin", origin)
      .send({ login: created.body.user.publicId, password: "a-different-secure-password" })
    expect(login.status).toBe(200)
  }, 30_000)

  it("denies writes from unapproved origins and denies SuperAdmin access to conversations", async () => {
    const pool = new FakePool()
    const app = createApp({ pool, allowedOrigins: origin, secureCookies: false })
    const missingOrigin = await request(app)
      .post("/api/auth/anonymous")
      .send({ password: "a-long-private-password" })
    expect(missingOrigin.status).toBe(403)

    pool.user = {
      id: "admin-id",
      public_id: "SC-23456789",
      account_type: "registered",
      role: "superadmin",
      status: "active",
      display_name: "Admin",
    }
    const token = createSessionToken()
    pool.sessions.set(hashSessionToken(token).toString("hex"), { revoked: false })
    pool.conversation = {
      id: "conversation-id",
      public_id: "CV-23456789",
      seeker_id: "seeker-id",
      counselor_id: "counselor-id",
      status: "open",
    }
    const cookie = `sc_session=${token}`
    const messages = await request(app)
      .get("/api/conversations/CV-23456789/messages")
      .set("Cookie", cookie)
    expect(messages.status).toBe(404)

    const requests = await request(app).get("/api/requests").set("Cookie", cookie)
    expect(requests.status).toBe(403)
  })

  it("permits only the counselor assigned to a conversation", async () => {
    const pool = new FakePool()
    const app = createApp({ pool, allowedOrigins: origin, secureCookies: false })
    pool.user = {
      id: "other-counselor",
      public_id: "SC-23456789",
      account_type: "registered",
      role: "counselor",
      status: "active",
      display_name: "Counselor",
    }
    const token = createSessionToken()
    pool.sessions.set(hashSessionToken(token).toString("hex"), { revoked: false })
    pool.conversation = {
      id: "conversation-id",
      public_id: "CV-23456789",
      seeker_id: "seeker-id",
      counselor_id: "assigned-counselor",
      status: "open",
    }
    const response = await request(app)
      .get("/api/conversations/CV-23456789/messages")
      .set("Cookie", `sc_session=${token}`)
    expect(response.status).toBe(404)
  })
})
