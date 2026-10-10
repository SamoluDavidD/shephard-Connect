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
  qualifications = []
  documents = []
  reviews = []

  async connect() {
    return { query: this.query.bind(this), release() {} }
  }

  async query(sql, params = []) {
    const queryText = sql.replace(/\s+/g, " ").trim()

    if (queryText === "SELECT 1") return { rows: [{ "?column?": 1 }], rowCount: 1 }
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
    if (queryText.startsWith("INSERT INTO counselor_applications")) {
      this.application = {
        id: "application-id",
        public_ref: params[0],
        user_id: params[1],
        status: "PENDING_APPROVAL",
        full_legal_name: params[2],
        preferred_display_name: params[3],
        phone: params[4],
        country: params[5],
        general_location: params[6],
        professional_title: params[7],
        specialization: params[8],
        highest_qualification: params[9],
        institution: params[10],
        qualification_type: params[11],
        completion_year: params[12],
        certifications: params[13],
        years_experience: params[14],
        license_number: params[15],
        licensing_authority: params[16],
        license_expiry: params[17],
        biography: params[18],
        areas_of_expertise: params[19],
        languages: params[20],
        work_history: params[21],
        references_text: params[22],
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
      this.documents.push({
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
      })
      return { rows: [], rowCount: 1 }
    }
    if (queryText.startsWith("SELECT id, status FROM counselor_applications")) {
      return this.application?.public_ref === String(params[0]).toUpperCase() &&
        this.application.user_id === params[1]
        ? { rows: [this.application], rowCount: 1 }
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
        .map((review) => ({ reason: review.reason, created_at: review.created_at }))
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
      for (const session of this.sessions.values()) session.revoked = true
      return { rows: [], rowCount: this.sessions.size }
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

  it("accepts a counselor application without documents and leaves counselor access disabled", async () => {
    const pool = new FakePool()
    const app = createApp({ pool, allowedOrigins: origin, secureCookies: false })
    const submitted = await request(app)
      .post("/api/auth/counselor")
      .set("Origin", origin)
      .field("application", JSON.stringify({
        ...counselorApplication(),
        role: "counselor",
        approvalStatus: "APPROVED",
      }))

    expect(submitted.status).toBe(201)
    expect(submitted.body.user.accountType).toBe("counselor")
    expect(submitted.body.user.role).toBe("registered")
    expect(submitted.body.application.status).toBe("PENDING_APPROVAL")
    expect(pool.documents).toHaveLength(0)

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
  })

  it("requires SuperAdmin review and credential verification before granting counselor access", async () => {
    const pool = new FakePool()
    const app = createApp({ pool, allowedOrigins: origin, secureCookies: false })
    const submitted = await request(app)
      .post("/api/auth/counselor")
      .set("Origin", origin)
      .field("application", JSON.stringify(counselorApplication()))
    expect(submitted.status).toBe(201)

    const admin = {
      id: "admin-id",
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
    const adminCookie = `sc_session=${adminToken}`
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

    const earlyApproval = await request(app)
      .patch(`/api/admin/counselor-applications/${reference}/review`)
      .set("Origin", origin)
      .set("Cookie", adminCookie)
      .send({ action: "APPROVED", reason: "Review completed." })
    expect(earlyApproval.status).toBe(409)

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

    const verified = await request(app)
      .patch(`/api/admin/counselor-applications/${reference}/qualifications/20000000-0000-4000-8000-000000000001/verification`)
      .set("Origin", origin)
      .set("Cookie", adminCookie)
      .send({ verified: true, reason: "Credential verified with issuer." })
    expect(verified.status).toBe(200)

    const approved = await request(app)
      .patch(`/api/admin/counselor-applications/${reference}/review`)
      .set("Origin", origin)
      .set("Cookie", adminCookie)
      .send({ action: "APPROVED", reason: "Qualification verified and review completed." })
    expect(approved.status).toBe(200)
    expect(pool.application.status).toBe("APPROVED")
    expect(pool.users.get("internal-user-id").role).toBe("counselor")

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
