# ShepherdConnect

ShepherdConnect is a responsive Vue 3 application for the Great Commission Movement of Liberia (GCML), based on ShepherdConnect SRS v3.0 and the Prototype Blueprint.

## Implemented

- Profile and Private-mode entry flows with plain-language privacy limits
- Regular, anonymous, and counselor registration with server-validated account types
- Counselor application status, SuperAdmin credential review, and approval-gated permissions
- Optional private counselor document uploads and later responses to document requests
- Need selection, category-matched approved counselor directory, filters, and profiles
- Validated counseling request workflow with idempotency and rate limiting
- Seeker and counselor dashboards with request status handling
- Counselor Disciples workspace listing only their own accepted/completed counseling relationships, with anonymous users kept pseudonymous
- PostgreSQL-backed conversation history with participant-only access and anonymous-safe sender labels
- Sender-only message editing, per-participant hiding, sender-authorized global deletion, and persisted read receipts
- Engagement-scoped messaging API and participant-authorized chat history
- Quick Exit to a neutral screen and safeguarding concern submission
- Guidance route shows an explicit empty state until resources are published; counselors can prepare HTTPS resources for an assigned open conversation and send them through participant-only messaging
- User-owned six-stage discipleship journey with saved in-progress and completed steps, progress summaries, and dashboard shortcuts
- Administration and aggregate-reporting interfaces with privacy boundaries
- SuperAdmin analytics with 7/30/90-day filters, periodic activity trends, request/category summaries, journey-stage totals, five-person cohort suppression, and 30-second refresh
- Express authentication with Argon2id credentials and database-backed HttpOnly sessions
- PostgreSQL migrations, role authorization, application audit history, and role-aware in-app notifications for counselor applications, request updates, and new messages
- Account settings for editing a display name, optional short profile bio, and optional private profile picture
- Optional private age-range and male/female gender fields on registration and account settings; demographics are never exposed in counselor or public profile responses and are not used for matching
- Stable support-category IDs connect user needs, counselor application specialties, approved counselor matches, and counseling requests; "Other" requires a preferred category or an explicit all-counselors browse choice
- Approved counselors are discoverable with their permitted profile details and optional profile picture; registered users' permitted names and pictures are visible only to their assigned conversation partner, while anonymous users remain pseudonymous and use the private-mode avatar
- Responsive mobile, tablet, and desktop layouts; focus states and reduced-motion support

Demo logins, role simulation, and fabricated dashboard records are not included in the application.

## Stack

- Vue 3 Composition API, TypeScript, Vite 8
- Vue Router
- Lucide Vue icons
- Tailwind CSS v4 plus product CSS tokens
- Node.js and Express API
- PostgreSQL
- Private filesystem storage for counselor application documents
- Vitest

## Setup

1. Use Node and pnpm versions from `.mise.toml`.
2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Configure PostgreSQL and the API in `.env`:

   ```dotenv
   DATABASE_URL=postgres://user:password@localhost:5432/shepherdconnect
   DATABASE_SSL=true
   DATABASE_SSL_CA_FILE=C:/secure/supabase-prod-ca-2021.crt
   API_PORT=3000
   APP_ORIGINS=http://localhost:8443,http://127.0.0.1:8443
   PRIVATE_DOCUMENT_DIR=C:/secure/shepherdconnect-documents
   ```

   For a Supabase database, copy the PostgreSQL connection string from the project dashboard's **Connect** dialog. Download that project's database CA certificate from **Database Settings → SSL Configuration**, store it outside the repository, and set `DATABASE_SSL_CA_FILE` to its absolute path. The API verifies both the certificate chain and hostname; do not disable certificate verification. `PRIVATE_DOCUMENT_DIR` is optional for development. The default document directory is outside the public Vite assets and is excluded from version control.
4. Apply the versioned PostgreSQL migrations and create the initial SuperAdmin account using the secure bootstrap script:

   ```bash
   pnpm db:migrate
   pnpm admin:create
   ```

   Before running `pnpm admin:create`, set `BOOTSTRAP_ADMIN_EMAIL`, `BOOTSTRAP_ADMIN_PASSWORD` (at least 12 characters), and optionally `BOOTSTRAP_ADMIN_NAME` in `.env`. The script refuses to run after an active SuperAdmin already exists.
5. Set `VITE_API_BASE_URL` only when the API is not served through the same-origin Vite `/api` proxy. Configure `.env.example` values for the target environment.

## Commands

```bash
pnpm test
pnpm typecheck
pnpm run build
pnpm api
pnpm dev
pnpm run format
```

Run `pnpm api` and `pnpm dev` in separate terminals for local development. The development Vite server proxies `/api` to `API_PROXY_TARGET` (default `http://127.0.0.1:3000`).

## Counselor registration and API

The registration form exposes exactly three public account types: Regular User, Anonymous User, and Counselor. Age range and gender are optional for registered users and counselor applicants; anonymous registration does not collect these demographics. New counselor registrations require a valid email, password, full name, at least one configured support category, and acceptance of counselor conduct, confidentiality, and safeguarding requirements. Selected categories remain pending until a SuperAdmin approves the application. A signed-in regular user can instead apply from Account settings using the existing account, email, and password; the application keeps counselor access disabled until SuperAdmin approval. Biography, preferred display name, location, professional title, experience, qualifications, license details, expertise lists, languages, work history, references, and supporting documents are optional and can be added after approval.

A counselor application starts as `PENDING_APPROVAL`; a SuperAdmin can approve an active applicant directly from the application summary, or request information / reject with a reason. Approval grants platform counselor access but does not represent professional credential or license verification. Optional credentials can be reviewed and verified separately, including after platform approval. Account suspension is stored separately from application status.

| Method | Path | Access |
| --- | --- | --- |
| POST | `/api/auth/register` | Public regular-user registration; consent required |
| POST | `/api/auth/anonymous` | Public anonymous registration |
| POST | `/api/auth/counselor` | Public counselor application; documents optional |
| POST | `/api/counselor/applications` | Signed-in regular user applying with the existing account |
| GET | `/api/counselor/applications/me` | Applicant's own status and documents |
| POST | `/api/counselor/applications/:ref/responses` | Applicant responding to an information request |
| POST | `/api/counselor/applications/:ref/documents` | Applicant; only documents requested by a reviewer |
| GET | `/api/admin/counselor-applications` | SuperAdmin |
| GET | `/api/admin/counselor-applications/:ref` | SuperAdmin |
| PATCH | `/api/admin/counselor-applications/:ref/review` | SuperAdmin; rejection / information-request reason required |
| PATCH | `/api/admin/users/:publicId/specialties` | SuperAdmin; set approved matching categories for an active approved counselor |
| DELETE | `/api/admin/users/:publicId` | SuperAdmin; irreversibly anonymizes and deactivates a non-SuperAdmin account while retaining linked historical records |
| PATCH | `/api/admin/counselor-applications/:ref/qualifications/:id/verification` | SuperAdmin |
| PATCH | `/api/admin/counselor-applications/:ref/license-verification` | SuperAdmin |
| GET | `/api/admin/analytics?days=7` (also 30 or 90) | SuperAdmin; aggregate-only analytics with small-cohort suppression |
| GET | `/api/counselor/disciples` | Assigned counselor; own accepted and completed counseling relationships |
| GET | `/api/counselors/:publicId/picture` | Public; active, approved counselors only |
| GET | `/api/support-categories` | Public active support-category list |
| GET | `/api/counselors/matches?categoryId=:id` | Public active and approved counselors with the approved specialty and its stable ID |
| GET | `/api/counselors/matches?all=true` | Explicit browse of all active, approved counselors; request flow requires choosing one of that counselor's approved categories |
| GET | `/api/counselor/applications/:ref/documents/:id` | Applicant or SuperAdmin; private download |
| GET | `/api/notifications` | Own notifications |
| PATCH | `/api/notifications/:id/read` | Own notification |
| GET | `/api/site-settings` | Public homepage image metadata |
| GET | `/api/site-settings/homepage-image` | Public configured homepage image |
| GET | `/api/admin/site-settings` | SuperAdmin |
| POST | `/api/admin/site-settings/homepage-image` | SuperAdmin; JPEG, PNG, or WebP up to 5 MB |
| DELETE | `/api/admin/site-settings/homepage-image` | SuperAdmin |
| GET | `/api/me/profile` | Own profile, including private demographics |
| PATCH | `/api/me` | Own display name, bio, and private age/gender settings |
| PATCH | `/api/me/password` | Own account; current password required |
| GET | `/api/conversations/:publicId/messages` | Assigned conversation participant |
| GET | `/api/conversations/:publicId/other-party-picture` | Assigned participant; anonymous users' pictures are never served |
| POST | `/api/conversations/:publicId/receipts` | Assigned recipient; acknowledges message IDs as delivered or read |
| PATCH | `/api/messages/:id` | Original sender; edit text |
| DELETE | `/api/messages/:id` | Participant; `{ "scope": "for_me" }` or original sender with `{ "scope": "for_everyone" }` |

Message editing and deletion have no time-window restriction. “Delete for me” stores a participant-specific hide record. “Delete for everyone” replaces the stored body with a neutral deletion notice; the original text is not copied to the audit log. Read receipts are recorded when the authenticated recipient opens the conversation. Delivery means the recipient account fetched the message history and acknowledged the message IDs; it does not prove device-level or push-notification delivery.

Approved, active counselor profiles are listed automatically; no separate publishing or visibility toggle is required. Their public directory exposes only the existing public counselor details and an optional picture. Registered user profile names and pictures are available only to the other participant in an assigned conversation. Anonymous users' pictures and identity details are not exposed to counselors or other users. Existing profiles follow these same rules automatically; no data migration is needed.

SuperAdmins can anonymize and deactivate accounts from **Administration → Manage users**. This revokes sessions, removes sign-in credentials and account profile contact details, and removes the profile picture. Counseling, counselor profile/application details, application documents, conversations, messages, and audit records remain linked to the deactivated account for service and compliance history; counselor application details and documents may contain identifying information. SuperAdmin accounts are protected, anonymized accounts cannot be reactivated, and the operation cannot be undone.

Conversation updates use authenticated polling while the chat is open (every five seconds); the counselor disciples list and admin analytics refresh every 30 seconds. There is no WebSocket transport, so these views provide periodic live refresh rather than push-based real-time delivery.

## Persistence and migrations

See [the Supabase migration audit](./docs/SUPABASE_MIGRATION_AUDIT.md) for the route-by-route migration checklist, current staging/deployment blockers, legacy-account strategy, verified checks, and rollback guidance. The partial Edge API's public read and rejection paths have staging smoke coverage, but most routes and authenticated workflows remain unverified; keep Express as the active API.

Migrations in `server/migrations/` apply in filename order. Migration `002_counselor_applications.sql` extends account types and adds applications, qualification verification, private-document metadata, review history, notifications, and applicant responses. Migration `003_site_settings.sql` adds a singleton setting for the public homepage image and its accessible description; migration `004_optional_counselor_information.sql` makes nonessential counselor-profile and professional details nullable and removes the license-authority dependency while preserving existing records and uploaded documents. Migration `006_user_notification_kinds.sql` enables notification events for counseling requests and messages; migration `007_user_profile_bio.sql` adds the optional short bio to user profiles; migration `008_user_profile_pictures.sql` adds nullable storage-key and MIME metadata for profile pictures without changing existing accounts. Migration `009_message_controls_and_receipts.sql` adds message edit/deletion/receipt timestamps and participant-specific message hiding without removing existing messages. Migration `010_user_anonymization_marker.sql` adds an account-anonymization timestamp without modifying existing user records. Migration `011_demographics_and_counselor_categories.sql` adds nullable private demographics, stable support categories, normalized approved counselor-specialty links (backfilled only for existing specialties that match configured category labels/aliases), and an optional category reference on counseling requests. Migration `012_gender_options_male_female.sql` restricts newly stored gender values to `male` or `female` (or null). Profile pictures use opaque names in the private document directory, accept signature-validated JPEG, PNG, and WebP images up to 5 MB, and are served to account owners, to assigned conversation counterparts when the account is registered, or publicly for active approved counselors only. Anonymous users' pictures are never exposed to conversation partners. Homepage image bytes are stored in PostgreSQL, so they persist across API restarts. Homepage image uploads are restricted to SuperAdmins and validated by file signature and a 5 MB size limit. The homepage image is publicly readable and versioned for cache invalidation. No migration constraint requires supporting-document records.

Migration `013_lock_down_supabase_data_api.sql` enables RLS on all existing `public` tables, revokes table and sequence privileges from the Supabase `anon` and `authenticated` roles, and removes their default privileges for future tables and sequences. It intentionally creates no client policies: the current application accesses data only through its Express API. Direct Supabase client access remains disabled until a reviewed Supabase Auth/RLS implementation is in place.

Migration `014_lock_down_supabase_rpc.sql` revokes public-schema function execution from those client roles and removes their default function-execution privileges for future functions. Migration `015_lock_down_public_function_defaults.sql` revokes `PUBLIC` execution on existing public-schema functions; migration `016_revoke_global_public_function_default.sql` removes PostgreSQL's global default `PUBLIC` function-execution grant for future functions.

The Supabase-managed migration is in progress; the Vue application still uses the Express `/api` service for its active workflows. Do not point the frontend at the new Edge Function or deploy it as a replacement API yet. The `api` function currently implements health, active support-category, counselor directory/matching, authenticated account/profile reads and profile updates, owner-scoped notifications, role-scoped request/conversation lists, request creation/status changes, participant-scoped message reads/sends, and delivery/read receipts. Workflow writes are performed by service-role-only transactional database functions in migrations `018` and `020`; migration `019` configures their safe extension search path. These workflows and execution grants were transaction-tested against the configured hosted database, with test records rolled back. Profile and counselor picture URLs are intentionally returned as null until private Supabase Storage and its authorization rules are implemented. Registration, sign-in, edit/delete/hide messaging, administrative workflows, legacy account migration, remaining API routes, and live Edge Function/Auth end-to-end tests are not complete.

Edge Function static checks and the isolated routing/CORS tests can be run with Deno:

```bash
deno check --node-modules-dir=auto supabase/functions/api/index.ts
deno test --node-modules-dir=auto --allow-env --allow-net --allow-read supabase/functions/api/index_test.ts
```

The Edge Function tests cover health, origin rejection/preflight, missing authentication on all protected route families, and unknown routes. They do not verify live Edge Function credentials, PostgREST query relationships, Supabase Auth integration, or end-to-end browser workflows.

Migration `017_supabase_auth_identity_link.sql` adds an optional unique `users.auth_user_id` link and its foreign key to Supabase Auth. It has been applied to the configured hosted database and the column, foreign key, and unique index were verified. Existing Express password hashes and sessions are not automatically transferred to Supabase Auth; preserve legacy accounts and define a verified account-linking/migration process before enabling Supabase sign-in.

Deploy the Edge Function only after setting `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` as server-side Supabase function secrets and `APP_ORIGINS` to the exact permitted browser origins. The service-role key is privileged and must never use a `VITE_` variable, enter the browser bundle, or be configured as a Vercel client environment variable. Keep Express as the active API until all required Edge Function routes and frontend authentication changes are implemented and verified.

Uploaded files are stored under `PRIVATE_DOCUMENT_DIR` using random opaque names; original names and storage paths are never exposed as public URLs. Production deployments should use a private persistent volume with encryption at rest, restricted service access, backups, and a tested retention/deletion policy. The authenticated API streams file contents only to the applicant or a SuperAdmin reviewer.

## Security and privacy notes

- Express checks an active server-side session for protected requests.
- Administrative roles do not automatically receive message access.
- SuperAdmins can update public homepage artwork; these changes are recorded in the append-only audit log.
- Password changes require the current password and revoke the account's other active sessions.
- Message content is not copied into audit events or notification helpers.
- Conversation messages are stored in PostgreSQL without automatic expiration; only assigned participants can retrieve them. Per-participant hiding and sender-authorized global message deletion are available; deleting a conversation is not supported.
- The service does not claim end-to-end encryption.
- State-changing requests require an exact configured `APP_ORIGINS` match.
- Private mode minimizes displayed identity but is not a guarantee of technical anonymity.
- Automated test fixtures are confined to test runs and are not seeded at startup or exposed as production accounts.
- Application notifications are in-app database notifications; external email or SMS delivery is not configured.

## Verification completed

- `npm run typecheck` passed.
- `npm run build` passed the Vue typecheck and Vite production build.
- `npm test` passed: 35 tests across 2 test files. The API tests use an in-memory fake pool; they do not establish live Supabase Auth, Storage, or end-to-end workflow coverage.
- The configured database was confirmed as Supabase PostgreSQL 17.11. All 20 app migrations are recorded as applied; migration 017's identity column, foreign key, and unique index were verified. Transaction tests exercised request creation, request acceptance/conversation creation, message sending, idempotent read receipts, unauthorized receipt rejection, and service-role-only RPC grants; all fixture data was rolled back.
- Read-only schema checks found 23 public tables. Migration 013 was applied; all 23 now have RLS enabled, and checks confirmed that `anon` and `authenticated` cannot read or delete application rows.
- The Express `/health` route returned HTTP 200 after the access lockdown. The Vite frontend returned HTTP 200 and remains available locally.
- `.env` is not tracked by Git, and `.env.example` is present. The current example documents the Express/PostgreSQL setup, not a Vercel/Supabase Auth deployment.
- No live Supabase Auth/Storage workflow, private-bucket access policy, Vercel deployment, or authenticated browser workflow was verified in this audit.

External penetration testing, accessibility audit, legal review, safeguarding operational exercises, backup restoration, retention/deletion tests, and cross-browser device testing have not been completed.

## Production readiness

This build is **not approved for public production use or real sensitive counseling data**. Production release depends on:

- Decisions in [`docs/GCML_APPROVALS.md`](docs/GCML_APPROVALS.md)
- Supabase Auth is not integrated into the application; accounts and sessions currently use custom Express-managed credentials and cookies. Supabase Auth users, password recovery, and app-role mapping must be designed and tested before the requested Supabase-first deployment.
- Counselor documents and profile pictures use local filesystem storage. Configure Supabase Storage with private buckets, authorization policies, migration of existing files, and tested retention before deploying to Vercel/serverless infrastructure.
- The Vite app calls the Express `/api` service. No Vercel API deployment or rewrite configuration exists; configure a supported API host or migrate the API workflows to Supabase Edge Functions before production deployment.
- RLS is enabled on current public tables but has no user-facing policies by design. Do not grant Supabase client roles table access until least-privilege policies are implemented and tested.
- The configured API database role is `postgres` and has `BYPASSRLS`; production must use a dedicated least-privilege service role and verify its exact grants.
- SRS workflows remain incomplete or partial: prayer requests/team handling, administrator resource publishing/retirement, user data export/deletion requests, per-engagement identity-sharing consent, administrator need-area management, pending-request expiry, and full safeguarding case assignment/status handling. Add requirements traceability and tested acceptance evidence before release.
- Add target-environment Supabase/Vercel variables and a matching deployment example only after the backend migration and API endpoint are selected.
- Production-grade private document storage and retention controls
- Provisioned SuperAdmin and safeguarding roles
- PostgreSQL access policy, backups, retention, and deletion procedures
- Retention, deletion, export, backup, and incident-response implementation
- Staffed safeguarding procedures and escalation testing
- Threat model, privacy impact assessment, legal review, and security testing
- Monitoring, alerting, disaster recovery, deployment rollback, and API integration tests
- Performance and accessibility verification on target low-cost Android devices
