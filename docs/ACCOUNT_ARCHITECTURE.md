# ShepherdConnect account architecture

## Current implementation

- The application is Vue 3 with Vue Router and Vite. The client uses an Express API and HttpOnly database-backed sessions.
- PostgreSQL migrations `001_account_platform.sql` and `002_counselor_applications.sql` define account/session data and the counselor application workflow.
- The existing Supabase key-value schema remains separate and is not modified or migrated by these PostgreSQL migrations.
- The synthetic demo role switcher is not an authorization boundary.
- PostgreSQL credentials are not configured in this workspace; migrations and production database behavior must be verified against an operator-provided database.

## Account and application architecture

- The Vue/Vite frontend calls the Node.js/Express API in `server/`.
- PostgreSQL stores users, credentials, profiles, sessions, counselor applications and qualifications, private-document metadata, reviews, notifications, requests, conversations, messages, discipleship progress, safeguarding concerns, permissions, and audit events.
- Use UUIDs for internal references and independently generated public identifiers. Never accept public IDs as authentication secrets.
- Use Argon2id password hashes, one-time high-entropy recovery codes stored only as Argon2id hashes, and random opaque session cookies whose SHA-256 digests alone are persisted.
- Counselor applicants have `account_type = counselor` and remain `role = registered` until an authorized SuperAdmin records approval. An approved application, verified qualification, and any supplied license verification are required before promotion to the counselor role.
- Keep application status separate from account suspension. Suspending an approved counselor revokes sessions without deleting or changing the application history.
- Require active database-backed sessions and enforce account ownership, counselor assignment, role, and separate safeguarding permission on the API. SuperAdmin access to aggregate administration data does not grant message access.
- Keep PostgreSQL schema changes additive and versioned. Do not modify the existing Supabase key/value schema or migrate its data as part of initial setup.
- Configure Vite to proxy `/api` to the Express server for local development. Deploy behind a same-origin HTTPS reverse proxy so the HttpOnly session cookie and Origin checks remain effective.
- Store uploaded counselor files in a private server directory under random opaque names. Serve contents only through an authenticated owner-or-SuperAdmin endpoint; never return storage paths or public URLs.

## Initial database model

| Table | Purpose |
| --- | --- |
| `users` | Internal UUID, unique public ID, account type, role, status, and timestamps |
| `user_credentials` | Password and recovery-code hashes; optional unique email for registered accounts |
| `user_profiles` | Optional display name and minimal profile data, separate from core identity |
| `sessions` | Hashed opaque session token, expiry, revocation, and user reference |
| `counselor_profiles` | Vetted counselor status and assignment metadata |
| `counselor_applications` | Applicant-provided personal/professional details, workflow status, consent, and verification flags |
| `counselor_qualifications` | Submitted qualification details and reviewer verification decisions |
| `counselor_documents` | Optional uploaded files or document requests; file metadata and private storage keys |
| `counselor_reviews` | Reviewer, application decision, reason, requested document categories, and timestamp |
| `counselor_application_responses` | Applicant's response to a request for additional information |
| `user_notifications` | In-app notifications for application submission and status updates |
| `counseling_requests` | Seeker-owned request, counselor assignment, status, and workflow timestamps |
| `counseling_conversations` | Seeker ownership, counselor assignment, status, and timestamps |
| `messages` | Conversation, sender, private message body, and timestamp |
| `discipleship_progress` | Seeker-owned journey and milestone state |
| `user_permissions` | Separately granted capabilities such as safeguarding review |
| `safeguarding_concerns` | Restricted reports; ordinary administrators do not receive report access |
| `audit_logs` | Security-sensitive actor/action/target metadata without message or concern content |

Foreign keys, unique constraints, check constraints, and indexes are defined in migrations. Supporting-document rows are optional. Queries use parameterized SQL and transactions for multi-record state changes.

## API and authorization boundaries

The API exposes anonymous, regular, and counselor registration; counselor application status and response; private requested-document upload/download; SuperAdmin application review and verification; login/recovery; own-account settings; own/assigned requests and conversations; assigned counselor cases; own discipleship progress; restricted safeguarding review; and SuperAdmin account management/aggregate reports.

- Anonymous and registered users can read or change only their own permitted records.
- Pending counselor applicants can access only their own application, respond to information requests, and upload requested documents. They do not receive counselor permissions or seeker endpoints.
- Approved counselors can read and update only currently assigned cases.
- Counselor permissions are granted by the approval transaction only after qualification verification and, when supplied, license verification.
- Applicant documents are optional at application submission. Subsequent document upload is limited to reviewer-requested categories.
- Only the applicant and SuperAdmins can retrieve uploaded documents; response bodies do not disclose file paths.
- SuperAdmins can manage account status and staff assignment and read suitably aggregated reports; they cannot read conversation messages by virtue of their role.
- Safeguarding records require an explicit `safeguarding:review` permission, including for SuperAdmins.
- Authorization failures are denied by default and logged without recording private content.

## Security considerations

- Rate-limit account creation, sign-in, and recovery; return generic authentication/recovery failures to reduce enumeration.
- Use Argon2id, random recovery material, constant-time hash verification through the password-hashing library, cookie flags (`HttpOnly`, `SameSite=Lax`, `Secure` in production), short-lived server-side sessions, and session revocation after recovery/deactivation.
- Require an approved browser `Origin` for cookie-authenticated state-changing requests and configure a narrow origin allowlist; do not use wildcard credentialed CORS.
- Never return internal UUIDs, password hashes, recovery hashes, raw session tokens, or private audit data to clients.
- Anonymous mode does not guarantee technical untraceability. Avoid collecting IP addresses or device fingerprints in application records.
- In-app notifications are implemented; external email/SMS delivery is not configured.
- Configure TLS, encrypted/private document storage, backups, retention/deletion, monitoring, operational safeguarding, legal approvals, and production origins before handling real sensitive data.

## Files expected to change

- `package.json`, `pnpm-lock.yaml`, `.env.example`, `vite.config.ts`, and `README.md` for scripts, dependencies, local proxy, environment, and setup.
- `server/` for Express middleware, configuration, database access, routes, authorization, CLI bootstrap, and migrations.
- `src/lib/` for a cookie-based API client and account service.
- `src/App.vue` and shared Vue components for account creation/sign-in/recovery, account identity, and role-specific API-backed screens while retaining demo mode.
- `tests/` for unit and API authorization tests.

## Deployment boundary

No production database is configured in this workspace. Migrations must be reviewed and run explicitly by the operator against a configured PostgreSQL instance; this implementation does not connect to or alter the existing Supabase project. Private file storage requires a persistent protected volume in production. Deployment, external email delivery, legal/safeguarding policy, retention schedules, and production security testing remain operator approvals.
