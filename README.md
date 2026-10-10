# ShepherdConnect

ShepherdConnect is a responsive Vue 3 application for the Great Commission Movement of Liberia (GCML), based on ShepherdConnect SRS v3.0 and the Prototype Blueprint.

## Implemented

- Profile and Private-mode entry flows with plain-language privacy limits
- Regular, anonymous, and counselor registration with server-validated account types
- Counselor application status, SuperAdmin credential review, and approval-gated permissions
- Optional private counselor document uploads and later responses to document requests
- Need selection, approved counselor directory, filters, and profiles
- Validated counseling request workflow with idempotency and rate limiting
- Seeker and counselor dashboards with request status handling
- Engagement-scoped messaging API and functional synthetic chat preview
- Quick Exit to a neutral screen and safeguarding concern submission
- Approved-resource presentation, saving, and Scripture licensing notice
- Canonical six-stage discipleship journey
- Administration and aggregate-reporting interfaces with privacy boundaries
- Express authentication with Argon2id credentials and database-backed HttpOnly sessions
- PostgreSQL migrations, role authorization, application audit history, and in-app notifications
- Responsive mobile, tablet, and desktop layouts; focus states and reduced-motion support

The role switcher appears only in the **synthetic demo workspace**. It does not change server permissions.

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

The registration form exposes exactly three public account types: Regular User, Anonymous User, and Counselor. A counselor application starts as `PENDING_APPROVAL`; counselor permissions are assigned only after a SuperAdmin records the decision and verifies the required qualification (and any license provided). Account suspension is stored separately from application status.

| Method | Path | Access |
| --- | --- | --- |
| POST | `/api/auth/register` | Public regular-user registration; consent required |
| POST | `/api/auth/anonymous` | Public anonymous registration |
| POST | `/api/auth/counselor` | Public counselor application; documents optional |
| GET | `/api/counselor/applications/me` | Applicant's own status and documents |
| POST | `/api/counselor/applications/:ref/responses` | Applicant responding to an information request |
| POST | `/api/counselor/applications/:ref/documents` | Applicant; only documents requested by a reviewer |
| GET | `/api/admin/counselor-applications` | SuperAdmin |
| GET | `/api/admin/counselor-applications/:ref` | SuperAdmin |
| PATCH | `/api/admin/counselor-applications/:ref/review` | SuperAdmin; reason required |
| PATCH | `/api/admin/counselor-applications/:ref/qualifications/:id/verification` | SuperAdmin |
| PATCH | `/api/admin/counselor-applications/:ref/license-verification` | SuperAdmin |
| GET | `/api/counselor/applications/:ref/documents/:id` | Applicant or SuperAdmin; private download |
| GET | `/api/notifications` | Own notifications |
| PATCH | `/api/notifications/:id/read` | Own notification |

## Persistence and migrations

Migrations in `server/migrations/` apply in filename order. Migration `002_counselor_applications.sql` extends account types and adds applications, qualification verification, private-document metadata, review history, notifications, and applicant responses. No migration constraint requires supporting-document records.

Uploaded files are stored under `PRIVATE_DOCUMENT_DIR` using random opaque names; original names and storage paths are never exposed as public URLs. Production deployments should use a private persistent volume with encryption at rest, restricted service access, backups, and a tested retention/deletion policy. The authenticated API streams file contents only to the applicant or a SuperAdmin reviewer.

## Security and privacy notes

- Express checks an active server-side session for protected requests.
- Administrative roles do not automatically receive message access.
- Message content is not copied into audit events or notification helpers.
- The service does not claim end-to-end encryption.
- State-changing requests require an exact configured `APP_ORIGINS` match.
- Private mode minimizes displayed identity but is not a guarantee of technical anonymity.
- Never enter real counseling disclosures into the synthetic demo workspace.
- Application notifications are in-app database notifications; external email or SMS delivery is not configured.

## Verification completed

- `pnpm build` completed successfully, including the Vue TypeScript check and production Vite build.
- `pnpm test` passed: 16 tests across 2 test files, covering counselor registration, SuperAdmin review and credential verification, applicant responses, requested-document uploads, and authorization boundaries.
- Both PostgreSQL migrations were applied successfully to the configured Supabase PostgreSQL 17.11 database. A repeat migration run completed without reapplying either migration.
- Live schema verification confirmed 19 public tables, 108 primary-key, foreign-key, unique, and check constraints, and both migration ledger entries.
- The Express `/health` route and public counselor API succeeded against the live database; unauthenticated `/api/me` returned 401 as expected.
- The bootstrap SuperAdmin authenticated through the live API, received the expected SuperAdmin role, and successfully logged out; the revoked session then returned 401.
- The database contained no pre-existing application users or counselor applications at migration time.
- A live Supabase-backed API workflow passed 67 assertions across signup, account recovery, journey progress, safeguarding reports, counselor application review and credential verification, role-based access, counseling requests, conversations, messaging, suspension, session revocation, reactivation, and fresh login.
- Temporary workflow accounts and related application/request content were scrubbed or deactivated after testing. Append-only audit events are intentionally retained; do not disable the audit immutability trigger or delete those records.

External penetration testing, accessibility audit, legal review, safeguarding operational exercises, backup restoration, retention/deletion tests, and cross-browser device testing have not been completed.

## Production readiness

This build is **not approved for public production use or real sensitive counseling data**. Production release depends on:

- Decisions in [`docs/GCML_APPROVALS.md`](docs/GCML_APPROVALS.md)
- Production-grade private document storage and retention controls
- Provisioned SuperAdmin and safeguarding roles
- PostgreSQL access policy, backups, retention, and deletion procedures
- Retention, deletion, export, backup, and incident-response implementation
- Staffed safeguarding procedures and escalation testing
- Threat model, privacy impact assessment, legal review, and security testing
- Monitoring, alerting, disaster recovery, deployment rollback, and API integration tests
- Performance and accessibility verification on target low-cost Android devices
