import { access, mkdtemp, rm } from "node:fs/promises"
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
  conversations = []
  messages = []
  hiddenMessages = []
  lastQuery = ""
  application = null
  counselorProfile = null
  qualifications = []
  documents = []
  reviews = []
  notifications = []
  userProfile = { display_name: null, bio: "" }
  userProfiles = new Map()
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
    this.lastQuery = queryText

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
      this.userProfile = {
        user_id: params[0],
        display_name: params[1],
        bio: "",
        picture_storage_key: null,
        picture_mime_type: null,
        updated_at: new Date().toISOString(),
      }
      this.userProfiles.set(params[0], this.userProfile)
      return { rows: [], rowCount: 1 }
    }
    if (queryText.startsWith("SELECT display_name, bio, picture_storage_key, updated_at FROM user_profiles")) {
      const profile = this.userProfiles.get(params[0])
      return { rows: profile ? [{ ...profile }] : [], rowCount: profile ? 1 : 0 }
    }
    if (queryText.startsWith("SELECT picture_storage_key, picture_mime_type FROM user_profiles")) {
      const profile = this.userProfiles.get(params[0])
      return { rows: profile ? [{ ...profile }] : [], rowCount: profile ? 1 : 0 }
    }
    if (queryText.startsWith("SELECT picture_storage_key FROM user_profiles")) {
      const profile = this.userProfiles.get(params[0])
      return { rows: profile ? [{ picture_storage_key: profile.picture_storage_key }] : [], rowCount: profile ? 1 : 0 }
    }
    if (queryText.startsWith("UPDATE user_profiles SET picture_storage_key = $2")) {
      const profile = this.userProfiles.get(params[0])
      if (profile) {
        profile.picture_storage_key = params[1]
        profile.picture_mime_type = params[2]
        profile.updated_at = new Date().toISOString()
        this.userProfile = profile
      }
      return { rows: [], rowCount: profile ? 1 : 0 }
    }
    if (queryText.startsWith("UPDATE user_profiles SET picture_storage_key = NULL")) {
      const profile = this.userProfiles.get(params[0])
      if (profile) {
        profile.picture_storage_key = null
        profile.picture_mime_type = null
        profile.updated_at = new Date().toISOString()
        this.userProfile = profile
      }
      return { rows: [], rowCount: profile ? 1 : 0 }
    }
    if (queryText.startsWith("UPDATE user_profiles SET display_name = $2, bio = COALESCE")) {
      const profile = this.userProfiles.get(params[0])
      if (!profile) return { rows: [], rowCount: 0 }
      profile.display_name = params[1]
      if (params[2] !== null) profile.bio = params[2]
      profile.updated_at = new Date().toISOString()
      this.userProfile = profile
      const user = this.users.get(params[0])
      if (user) user.display_name = profile.display_name
      return {
        rows: [{ display_name: profile.display_name }],
        rowCount: user ? 1 : 0,
      }
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
      this.notifications.push({
        user_id: params[0],
        kind: params[1],
        title: params[2],
        message: params[3],
        id: `notification-${this.notifications.length + 1}`,
        created_at: new Date().toISOString(),
        read_at: null,
      })
      return { rows: [], rowCount: 1 }
    }
    if (queryText.startsWith("SELECT id, kind, title, message, created_at, read_at FROM user_notifications")) {
      const rows = this.notifications.filter((item) => item.user_id === params[0])
      return { rows, rowCount: rows.length }
    }
    if (queryText.startsWith("UPDATE user_notifications SET read_at")) {
      const notification = this.notifications.find(
        (item) => item.id === params[0] && item.user_id === params[1],
      )
      if (notification) notification.read_at = new Date().toISOString()
      return { rows: notification ? [{ id: notification.id }] : [], rowCount: notification ? 1 : 0 }
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
    if (queryText.startsWith("SELECT c.public_id, c.status, c.updated_at")) {
      return { rows: this.conversations, rowCount: this.conversations.length }
    }
    if (queryText.startsWith("SELECT m.id, m.body")) {
      const visible = this.messages.filter((message) =>
        !this.hiddenMessages.some(
          (hidden) => hidden.message_id === message.id && hidden.user_id === params[1],
        ),
      )
      return { rows: visible, rowCount: visible.length }
    }
    if (queryText.startsWith("SELECT m.id, m.sender_id")) {
      const message = this.messages.find((item) => item.id === params[0])
      return message
        ? {
            rows: [{
              ...message,
              conversation_id: this.conversation.id,
              seeker_id: this.conversation.seeker_id,
              counselor_id: this.conversation.counselor_id,
            }],
            rowCount: 1,
          }
        : { rows: [], rowCount: 0 }
    }
    if (queryText.startsWith("INSERT INTO messages (conversation_id, sender_id, body)")) {
      const message = {
        id: `message-${this.messages.length + 1}`,
        body: params[2],
        created_at: new Date().toISOString(),
        sender_public_id: this.user.public_id,
        sender_role: this.user.role,
        sender_display_name: this.user.display_name || this.user.public_id,
      }
      this.messages.push(message)
      return { rows: [message], rowCount: 1 }
    }
    if (queryText.startsWith("UPDATE messages SET body = $2")) {
      const message = this.messages.find((item) => item.id === params[0])
      if (!message) return { rows: [], rowCount: 0 }
      message.body = params[1]
      message.edited_at = new Date().toISOString()
      return { rows: [{ ...message }], rowCount: 1 }
    }
    if (queryText.startsWith("UPDATE messages SET body = 'This message was deleted'")) {
      const message = this.messages.find((item) => item.id === params[0])
      if (!message) return { rows: [], rowCount: 0 }
      message.body = "This message was deleted"
      message.deleted_at = new Date().toISOString()
      return { rows: [], rowCount: 1 }
    }
    if (queryText.startsWith("INSERT INTO message_user_hides")) {
      if (!this.hiddenMessages.some(
        (hidden) => hidden.message_id === params[0] && hidden.user_id === params[1],
      )) {
        this.hiddenMessages.push({ message_id: params[0], user_id: params[1] })
      }
      return { rows: [], rowCount: 1 }
    }
    if (queryText.startsWith("UPDATE messages SET delivered_at = COALESCE")) {
      const timestamp = new Date().toISOString()
      const updated = this.messages.filter(
        (message) => params[1].includes(message.id) && message.sender_id !== params[2],
      )
      for (const message of updated) {
        message.delivered_at ||= timestamp
        if (queryText.includes("read_at = COALESCE")) message.read_at ||= timestamp
      }
      return { rows: updated.map(({ id }) => ({ id })), rowCount: updated.length }
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

  it("persists the user's optional profile bio and scopes notifications to their owner", async () => {
    const pool = new FakePool()
    const app = createApp({ pool, allowedOrigins: origin, secureCookies: false })
    const created = await request(app)
      .post("/api/auth/anonymous")
      .set("Origin", origin)
      .send({ password: "a-long-private-password" })
    expect(created.status).toBe(201)
    const cookie = cookieFrom(created)

    const profile = await request(app).get("/api/me/profile").set("Cookie", cookie)
    expect(profile.status).toBe(200)
    expect(profile.body.profile.bio).toBe("")

    const saved = await request(app)
      .patch("/api/me")
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({ displayName: "Jordan", bio: "A little about me." })
    expect(saved.status).toBe(200)
    expect(saved.body.user.displayName).toBe("Jordan")
    expect(pool.userProfile).toMatchObject({
      display_name: "Jordan",
      bio: "A little about me.",
    })

    pool.notifications = [
      {
        id: "91b2a435-f881-4657-b1de-8c7c43e118ec",
        user_id: "internal-user-id",
        kind: "conversation_message",
        title: "New counseling message",
        message: "You have a new message in a counseling conversation.",
        created_at: new Date().toISOString(),
        read_at: null,
      },
      {
        id: "52bbbcdf-bef2-44ce-a799-8fa6c6c56300",
        user_id: "another-user",
        kind: "conversation_message",
        title: "Private notification",
        message: "Not for this user.",
        created_at: new Date().toISOString(),
        read_at: null,
      },
    ]
    const notifications = await request(app).get("/api/notifications").set("Cookie", cookie)
    expect(notifications.status).toBe(200)
    expect(notifications.body.notifications).toHaveLength(1)
    expect(notifications.body.notifications[0].id).toBe(pool.notifications[0].id)

    const otherUsersNotification = await request(app)
      .patch("/api/notifications/52bbbcdf-bef2-44ce-a799-8fa6c6c56300/read")
      .set("Origin", origin)
      .set("Cookie", cookie)
    expect(otherUsersNotification.status).toBe(404)
    expect(pool.notifications[1].read_at).toBeNull()

    const markedRead = await request(app)
      .patch("/api/notifications/91b2a435-f881-4657-b1de-8c7c43e118ec/read")
      .set("Origin", origin)
      .set("Cookie", cookie)
    expect(markedRead.status).toBe(204)
    expect(pool.notifications[0].read_at).toBeTruthy()
  })

  it("stores, serves, replaces, and removes a private profile picture for its owner", async () => {
    const pool = new FakePool()
    const privateDirectory = await mkdtemp(path.join(os.tmpdir(), "shepherd-profile-picture-test-"))
    const app = createApp({
      pool,
      allowedOrigins: origin,
      secureCookies: false,
      privateDocumentPath: privateDirectory,
    })

    try {
      const created = await request(app)
        .post("/api/auth/register")
        .set("Origin", origin)
        .send({
          email: "profile-picture@example.com",
          displayName: "Profile Picture User",
          password: "a-long-secure-password",
          consent: true,
        })
      expect(created.status).toBe(201)
      const cookie = cookieFrom(created)
      expect(pool.userProfiles.has("internal-user-id")).toBe(true)

      const noPicture = await request(app)
        .get("/api/me/profile/picture")
        .set("Cookie", cookie)
      expect(noPicture.status).toBe(404)

      const uploaded = await request(app)
        .put("/api/me/profile/picture")
        .set("Origin", origin)
        .set("Cookie", cookie)
        .attach("picture", Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
          filename: "first.jpg",
          contentType: "image/jpeg",
        })
      expect(uploaded.status, JSON.stringify(uploaded.body)).toBe(200)
      expect(pool.userProfile.picture_mime_type).toBe("image/jpeg")
      expect(pool.userProfile.picture_storage_key).toMatch(/^[a-f0-9]{64}$/)
      await expect(access(path.join(privateDirectory, pool.userProfile.picture_storage_key))).resolves.toBeUndefined()

      const served = await request(app).get("/api/me/profile/picture").set("Cookie", cookie)
      expect(served.status).toBe(200)
      expect(served.headers["content-type"]).toContain("image/jpeg")
      expect(served.body).toEqual(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))

      const oldStorageKey = pool.userProfile.picture_storage_key
      const replaced = await request(app)
        .put("/api/me/profile/picture")
        .set("Origin", origin)
        .set("Cookie", cookie)
        .field("targetUserId", "another-user")
        .attach("picture", Buffer.from([
          0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
          0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
          0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
        ]), {
          filename: "replacement.png",
          contentType: "image/png",
        })
      expect(replaced.status).toBe(200)
      expect(pool.userProfile.picture_mime_type).toBe("image/png")
      expect(pool.userProfile.picture_storage_key).not.toBe(oldStorageKey)
      await expect(access(path.join(privateDirectory, oldStorageKey))).rejects.toMatchObject({ code: "ENOENT" })

      const removed = await request(app)
        .delete("/api/me/profile/picture")
        .set("Origin", origin)
        .set("Cookie", cookie)
      expect(removed.status).toBe(204)
      expect(pool.userProfile.picture_storage_key).toBeNull()
      expect(pool.userProfile.picture_mime_type).toBeNull()
      const unavailable = await request(app).get("/api/me/profile/picture").set("Cookie", cookie)
      expect(unavailable.status).toBe(404)

      const unsupported = await request(app)
        .put("/api/me/profile/picture")
        .set("Origin", origin)
        .set("Cookie", cookie)
        .attach("picture", Buffer.from("not an image"), {
          filename: "photo.png",
          contentType: "image/png",
        })
      expect(unsupported.status).toBe(400)

      const mismatchedMime = await request(app)
        .put("/api/me/profile/picture")
        .set("Origin", origin)
        .set("Cookie", cookie)
        .attach("picture", Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
          filename: "mismatched.png",
          contentType: "image/png",
        })
      expect(mismatchedMime.status).toBe(400)

      const oversized = await request(app)
        .put("/api/me/profile/picture")
        .set("Origin", origin)
        .set("Cookie", cookie)
        .attach("picture", Buffer.alloc(5 * 1024 * 1024 + 1), {
          filename: "oversized.jpg",
          contentType: "image/jpeg",
        })
      expect(oversized.status).toBe(413)
      expect(oversized.body.error).toContain("5 MB")
    } finally {
      await rm(privateDirectory, { recursive: true, force: true })
    }
  })

  it("accepts an optional registration picture and keeps it owner-private", async () => {
    const pool = new FakePool()
    const privateDirectory = await mkdtemp(path.join(os.tmpdir(), "shepherd-registration-picture-test-"))
    const app = createApp({
      pool,
      allowedOrigins: origin,
      secureCookies: false,
      privateDocumentPath: privateDirectory,
    })

    try {
      const created = await request(app)
        .post("/api/auth/register")
        .set("Origin", origin)
        .field("profile", JSON.stringify({
          email: "registered-picture@example.com",
          displayName: "Registered Picture",
          password: "a-long-secure-password",
          consent: true,
        }))
        .attach("profilePicture", Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
          filename: "picture.jpg",
          contentType: "image/jpeg",
        })
      expect(created.status).toBe(201)
      const cookie = cookieFrom(created)
      expect(pool.userProfile.picture_mime_type).toBe("image/jpeg")
      expect(pool.userProfile.picture_storage_key).toMatch(/^[a-f0-9]{64}$/)

      const privatePicture = await request(app)
        .get("/api/me/profile/picture")
        .set("Cookie", cookie)
      expect(privatePicture.status).toBe(200)
      expect(privatePicture.body).toEqual(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))

      const logout = await request(app)
        .post("/api/auth/logout")
        .set("Origin", origin)
        .set("Cookie", cookie)
      expect(logout.status).toBe(204)
      const login = await request(app)
        .post("/api/auth/login")
        .set("Origin", origin)
        .send({
          login: "registered-picture@example.com",
          password: "a-long-secure-password",
        })
      expect(login.status).toBe(200)
      const afterLogin = await request(app)
        .get("/api/me/profile/picture")
        .set("Cookie", cookieFrom(login))
      expect(afterLogin.status).toBe(200)
      expect(afterLogin.body).toEqual(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))

      const restartedApp = createApp({
        pool,
        allowedOrigins: origin,
        secureCookies: false,
        privateDocumentPath: privateDirectory,
      })
      const afterRestart = await request(restartedApp)
        .get("/api/me/profile/picture")
        .set("Cookie", cookieFrom(login))
      expect(afterRestart.status).toBe(200)
      expect(afterRestart.body).toEqual(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))

      const otherUser = {
        id: "unrelated-user-id",
        public_id: "SC-23456789",
        account_type: "registered",
        role: "registered",
        status: "active",
        display_name: "Unrelated user",
      }
      pool.users.set(otherUser.id, otherUser)
      const otherToken = createSessionToken()
      pool.sessions.set(hashSessionToken(otherToken).toString("hex"), {
        revoked: false,
        user: otherUser,
      })
      const otherCookie = `sc_session=${otherToken}`
      const unrelatedPicture = await request(app)
        .get("/api/me/profile/picture?userId=internal-user-id")
        .set("Cookie", otherCookie)
      expect(unrelatedPicture.status).toBe(404)

      const unauthorizedReplacement = await request(app)
        .put("/api/me/profile/picture")
        .set("Origin", origin)
        .set("Cookie", otherCookie)
        .field("targetUserId", "internal-user-id")
        .attach("picture", Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
          filename: "attempt.jpg",
          contentType: "image/jpeg",
        })
      expect(unauthorizedReplacement.status).toBe(404)
      expect(pool.userProfile.picture_storage_key).toMatch(/^[a-f0-9]{64}$/)
      expect((await request(app).get("/api/me/profile/picture")).status).toBe(401)
    } finally {
      await rm(privateDirectory, { recursive: true, force: true })
    }
  })

  it("allows counselor registration with a profile picture and no supporting documents", async () => {
    const pool = new FakePool()
    const privateDirectory = await mkdtemp(path.join(os.tmpdir(), "shepherd-counselor-picture-test-"))
    const app = createApp({
      pool,
      allowedOrigins: origin,
      secureCookies: false,
      privateDocumentPath: privateDirectory,
    })

    try {
      const submitted = await request(app)
        .post("/api/auth/counselor")
        .set("Origin", origin)
        .field("application", JSON.stringify(basicCounselorApplication()))
        .attach("profilePicture", Buffer.from([0xff, 0xd8, 0xff, 0xd9]), {
          filename: "counselor.jpg",
          contentType: "image/jpeg",
        })
      expect(submitted.status).toBe(201)
      expect(pool.documents).toHaveLength(0)
      expect(pool.userProfile.picture_mime_type).toBe("image/jpeg")
      expect(pool.userProfile.picture_storage_key).toMatch(/^[a-f0-9]{64}$/)

      const cookie = cookieFrom(submitted)
      const picture = await request(app)
        .get("/api/me/profile/picture")
        .set("Cookie", cookie)
      expect(picture.status).toBe(200)
      expect(picture.body).toEqual(Buffer.from([0xff, 0xd8, 0xff, 0xd9]))

      const approved = await request(app)
        .patch(`/api/admin/counselor-applications/${submitted.body.application.publicRef}/review`)
        .set("Origin", origin)
        .set("Cookie", addSuperAdmin(pool))
        .send({ action: "APPROVED" })
      expect(approved.status).toBe(200)
      expect(pool.application.status).toBe("APPROVED")
    } finally {
      await rm(privateDirectory, { recursive: true, force: true })
    }
  })

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

  it("returns persisted conversation history to its participants with privacy-safe sender labels", async () => {
    const pool = new FakePool()
    const app = createApp({ pool, allowedOrigins: origin, secureCookies: false })
    pool.user = {
      id: "assigned-counselor",
      public_id: "CO-23456789",
      account_type: "counselor",
      role: "counselor",
      status: "active",
      display_name: "Counselor",
    }
    pool.conversation = {
      id: "conversation-id",
      public_id: "CV-23456789",
      seeker_id: "anonymous-seeker",
      counselor_id: "assigned-counselor",
      status: "open",
    }
    pool.conversations = [{
      public_id: pool.conversation.public_id,
      status: "open",
      updated_at: "2026-10-10T07:00:00.000Z",
      other_party_public_id: "AN-23456789",
      other_party_display_name: "AN-23456789",
    }]
    pool.messages = [
      {
        id: "message-1",
        body: "Thank you for reaching out.",
        created_at: "2026-10-09T10:12:00.000Z",
        sender_public_id: "CO-23456789",
        sender_role: "counselor",
        sender_display_name: "Counselor",
      },
      {
        id: "message-2",
        body: "I have been carrying a lot of worry.",
        created_at: "2026-10-09T10:14:00.000Z",
        sender_public_id: "AN-23456789",
        sender_role: "anonymous",
        sender_display_name: "AN-23456789",
      },
    ]
    const token = createSessionToken()
    pool.sessions.set(hashSessionToken(token).toString("hex"), {
      revoked: false,
      user: pool.user,
    })
    const cookie = `sc_session=${token}`

    const conversations = await request(app)
      .get("/api/conversations")
      .set("Cookie", cookie)
    expect(conversations.status).toBe(200)
    expect(conversations.body.conversations[0].other_party_display_name).toBe("AN-23456789")
    expect(pool.lastQuery).toContain(
      "CASE WHEN other.account_type = 'anonymous' THEN other.public_id",
    )

    const history = await request(app)
      .get("/api/conversations/CV-23456789/messages")
      .set("Cookie", cookie)
    expect(history.status).toBe(200)
    expect(history.body.messages).toHaveLength(2)
    expect(history.body.messages[0]).toMatchObject({
      id: "message-1",
      sender_public_id: "CO-23456789",
      created_at: "2026-10-09T10:12:00.000Z",
    })
    expect(history.body.messages[1].sender_display_name).toBe("AN-23456789")
    expect(pool.lastQuery).toContain(
      "CASE WHEN sender.account_type = 'anonymous' THEN sender.public_id",
    )

    const sent = await request(app)
      .post("/api/conversations/CV-23456789/messages")
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({ body: "I am here and ready to listen." })
    expect(sent.status).toBe(201)
    expect(pool.messages[2].body).toBe("I am here and ready to listen.")

    const refreshedHistory = await request(app)
      .get("/api/conversations/CV-23456789/messages")
      .set("Cookie", cookie)
    expect(refreshedHistory.status).toBe(200)
    expect(refreshedHistory.body.messages).toHaveLength(3)
    expect(refreshedHistory.body.messages[2].sender_public_id).toBe("CO-23456789")

    pool.user = {
      id: "unrelated-user",
      public_id: "AN-99999999",
      account_type: "anonymous",
      role: "anonymous",
      status: "active",
    }
    pool.sessions.set(hashSessionToken(token).toString("hex"), {
      revoked: false,
      user: pool.user,
    })
    const unrelatedHistory = await request(app)
      .get("/api/conversations/CV-23456789/messages")
      .set("Cookie", cookie)
    expect(unrelatedHistory.status).toBe(404)
  })

  it("authorizes message edits, participant-only hiding, global deletion, and read receipts", async () => {
    const pool = new FakePool()
    const app = createApp({ pool, allowedOrigins: origin, secureCookies: false })
    pool.user = {
      id: "assigned-counselor",
      public_id: "CO-23456789",
      account_type: "counselor",
      role: "counselor",
      status: "active",
      display_name: "Counselor",
    }
    pool.conversation = {
      id: "conversation-id",
      public_id: "CV-23456789",
      seeker_id: "anonymous-seeker",
      counselor_id: "assigned-counselor",
      status: "open",
    }
    const ownMessageId = "11111111-1111-4111-8111-111111111111"
    const otherMessageId = "22222222-2222-4222-8222-222222222222"
    pool.messages = [
      {
        id: ownMessageId,
        conversation_id: pool.conversation.id,
        sender_id: pool.user.id,
        body: "Original counselor message",
        created_at: "2026-10-09T10:12:00.000Z",
      },
      {
        id: otherMessageId,
        conversation_id: pool.conversation.id,
        sender_id: pool.conversation.seeker_id,
        body: "Anonymous message",
        created_at: "2026-10-09T10:14:00.000Z",
      },
    ]
    const token = createSessionToken()
    pool.sessions.set(hashSessionToken(token).toString("hex"), {
      revoked: false,
      user: pool.user,
    })
    const cookie = `sc_session=${token}`

    const edited = await request(app)
      .patch(`/api/messages/${ownMessageId}`)
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({ body: "Updated counselor message" })
    expect(edited.status).toBe(200)
    expect(pool.messages[0].body).toBe("Updated counselor message")
    expect(pool.messages[0].edited_at).toBeTruthy()

    const unauthorizedEdit = await request(app)
      .patch(`/api/messages/${otherMessageId}`)
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({ body: "Attempt to edit someone else's message" })
    expect(unauthorizedEdit.status).toBe(403)

    const hidden = await request(app)
      .delete(`/api/messages/${otherMessageId}`)
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({ scope: "for_me" })
    expect(hidden.status).toBe(200)
    expect(pool.hiddenMessages).toContainEqual({
      message_id: otherMessageId,
      user_id: pool.user.id,
    })
    expect(pool.messages[1].body).toBe("Anonymous message")

    pool.user = {
      id: pool.conversation.seeker_id,
      public_id: "AN-23456789",
      account_type: "anonymous",
      role: "anonymous",
      status: "active",
    }
    pool.sessions.set(hashSessionToken(token).toString("hex"), {
      revoked: false,
      user: pool.user,
    })
    const otherParticipantHistory = await request(app)
      .get("/api/conversations/CV-23456789/messages")
      .set("Cookie", cookie)
    expect(otherParticipantHistory.status).toBe(200)
    expect(otherParticipantHistory.body.messages.some((item) => item.id === otherMessageId)).toBe(true)

    pool.user = {
      id: "assigned-counselor",
      public_id: "CO-23456789",
      account_type: "counselor",
      role: "counselor",
      status: "active",
      display_name: "Counselor",
    }
    pool.sessions.set(hashSessionToken(token).toString("hex"), {
      revoked: false,
      user: pool.user,
    })
    const unauthorizedGlobalDelete = await request(app)
      .delete(`/api/messages/${otherMessageId}`)
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({ scope: "for_everyone" })
    expect(unauthorizedGlobalDelete.status).toBe(403)

    const globallyDeleted = await request(app)
      .delete(`/api/messages/${ownMessageId}`)
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({ scope: "for_everyone" })
    expect(globallyDeleted.status).toBe(200)
    expect(pool.messages[0].body).toBe("This message was deleted")
    expect(pool.messages[0].deleted_at).toBeTruthy()

    const receipt = await request(app)
      .post("/api/conversations/CV-23456789/receipts")
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({ messageIds: [otherMessageId, ownMessageId], state: "read" })
    expect(receipt.status).toBe(200)
    expect(pool.messages[1].delivered_at).toBeTruthy()
    expect(pool.messages[1].read_at).toBeTruthy()
    expect(pool.messages[0].read_at).toBeUndefined()

    const deliveryReceipt = await request(app)
      .post("/api/conversations/CV-23456789/receipts")
      .set("Origin", origin)
      .set("Cookie", cookie)
      .send({ messageIds: [otherMessageId], state: "delivered" })
    expect(deliveryReceipt.status).toBe(200)
  })
})
