# Supabase Migration Audit

**Audit date:** 2026-10-10
**Repository revision:** `d5daa3a`
**Status:** Migration is partial. Express remains the active application API and must remain the rollback path.

## Findings and release blockers

1. **Only the partial API is deployed to staging.** The Supabase CLI works through `npx`, the linked ref is `betmgthvdehtitqyydpt`, and the user identified that project as staging with sanitized test data. The `api` function is deployed and `APP_ORIGINS` is configured for local smoke tests. Supabase runtime credentials were confirmed operational by the live database-backed public routes. This is not a production deployment or a complete replacement API.
2. **The frontend is still Express-backed.** `src/lib/api.ts` sends requests to `/api` with Express cookies. `src/lib/supabase.ts` is not imported by the active application modules. Switching `VITE_API_BASE_URL` to the partial Edge Function would break sign-in and many account workflows.
3. **Auth migration has not started.** The hosted database has 23 application users and zero `auth_user_id` links. Current password hashes and sessions are Express-managed Argon2id records. An identity-link column alone does not implement Supabase Auth.
4. **Private Storage is not migrated.** The hosted project has zero Storage buckets and zero Storage RLS policies. The database contains two counselor-document storage references and one profile-picture reference. In the configured local private directory, the picture file exists but both counselor-document files referenced by the database are missing. The references must be investigated and reconciled from verified backups before migration; do not delete or overwrite their metadata.
5. **The server-side role remains privileged.** The configured database connection is `postgres`, which has `BYPASSRLS`. The Edge Function currently uses the service-role key for data access. Both bypass table RLS by design and require strict server-only credentials, verified request authentication, explicit ownership/role checks, and audited route behavior.
6. **Migration histories are not aligned.** The existing runner records `server/migrations/*.sql` in `schema_migrations`; Supabase CLI migrations live in a different history. Do not run `supabase db push` against the existing hosted database until a reviewed baseline/adoption plan reconciles these histories.
7. **Replacement coverage is incomplete.** The Express API has 67 route handlers; only 16 currently have Edge Function handlers. Private file operations, registration/sign-in/account recovery, admin, safeguarding, journey, counselor application review and profile workflows remain absent.

## Verified checks

- Hosted database is Supabase PostgreSQL 17.11; migration records 001–020 are present.
- All 23 public tables have RLS enabled. No `anon`/`authenticated` table grants were found, and no public functions were executable by those client roles at audit time.
- The `auth_user_id` UUID column, unique index, and FK to `auth.users` exist. No existing application users are linked to Auth users.
- Service-side transaction tests, rolled back after execution, passed for request creation, acceptance and conversation creation, message sending, idempotent read receipts, unauthorized receipt rejection, and RPC grants (service role only; not `anon` or `authenticated`).
- Latest available local checks before this audit: frontend production build passed; 35 Vitest tests passed; 5 Deno Edge Function tests passed; Edge Function type-check passed; `git diff --check` passed.
- A prior full-suite run once timed out in an Argon2 password-change test while concurrent checks were running; a subsequent non-concurrent `npm test` passed all 35 tests.
- Local frontend `/sign-in` and Express `/health` returned HTTP 200.
- No valid-token Supabase Auth workflow or authenticated browser workflow was tested.

### Staging follow-up (2026-10-10)

- The user confirmed `betmgthvdehtitqyydpt` (project name `ShepherdConnect`, status `ACTIVE_HEALTHY`) is the separate staging project and that its data is sanitized. The Supabase CLI reports it linked. CLI commands were run through `npx`; no dependency was added to the repository.
- `supabase migration list --linked` returned no CLI-managed migrations. This does **not** mean the database is empty: read-only table statistics show a populated `public` schema, including approximately 23 users, 1,481 audit-log rows, and 20 rows in the existing custom `schema_migrations` ledger.
- `supabase functions list` initially returned no functions. The existing partial `api` function was deployed to staging only. `APP_ORIGINS` was configured for the local test origins; no service-role key was added as a custom secret. Supabase documents its API keys as runtime defaults, and their availability was confirmed by the working live database-backed endpoints.
- The first deployed smoke test found every route returned 404 because the gateway URL prefix was not normalized before Hono routing. The function now strips the gateway/function prefix, with regression tests for both deployed URL forms. The corrected function was redeployed to staging.
- Staging HTTP smoke results: health 200; support categories 200 (5 returned); counselor directory 200 (2 returned); counselor matches 200 (2 returned); `/me` with an invalid bearer token 401; `/requests` without a token 401; allowed preflight 204; disallowed origin 403; unknown route 404.
- Read-only database verification: 23/23 public tables have RLS, zero `anon`/`authenticated` table grants, zero Auth-linked app users, 20 custom migration records, zero Storage buckets, and zero Storage policies. No schema migration or data-write test was run in this follow-up.
- `npx --yes deno check --no-lock --node-modules-dir=auto supabase/functions/api/index.ts` passed. The isolated Edge tests passed: 6/6. The frontend production build passed, and the project suite passed: 35/35. The deployed smoke tests verify only public reads and rejection paths; valid-token authorization and complete workflows remain unverified.

## Express-to-Edge route checklist

Status meanings:

- **Edge code; not staging-verified:** Handler exists, but cannot be counted as migrated until its success path is verified against staging Supabase Auth/PostgREST/Storage.
- **Not migrated:** Express fallback only; no equivalent Edge handler exists.
- Express remains the production/local fallback for every row until an explicit cutover.

| Express route | Supabase replacement status |
|---|---|
| `GET /health` | Staging smoke-verified (200) |
| `GET /api/site-settings` | Not migrated |
| `GET /api/site-settings/homepage-image` | Not migrated |
| `POST /api/auth/anonymous` | Not migrated |
| `POST /api/auth/register` | Not migrated |
| `POST /api/auth/counselor` | Not migrated |
| `POST /api/counselor/applications` | Not migrated |
| `POST /api/auth/login` | Not migrated |
| `POST /api/auth/recover` | Not migrated |
| `POST /api/auth/logout` | Not migrated |
| `GET /api/me` | Edge code; invalid bearer rejected in staging; valid linked account path unverified |
| `GET /api/me/profile` | Edge code; not staging-verified |
| `GET /api/me/profile/picture` | Not migrated |
| `PUT /api/me/profile/picture` | Not migrated |
| `DELETE /api/me/profile/picture` | Not migrated |
| `GET /api/counselor/applications/me` | Not migrated |
| `POST /api/counselor/applications/:publicRef/responses` | Not migrated |
| `GET /api/notifications` | Edge code; not staging-verified |
| `PATCH /api/notifications/:id/read` | Edge code; not staging-verified |
| `POST /api/counselor/applications/:publicRef/documents` | Not migrated |
| `PATCH /api/me` | Edge code; not staging-verified |
| `PATCH /api/me/password` | Not migrated |
| `POST /api/auth/recovery-code/rotate` | Not migrated |
| `POST /api/me/upgrade` | Not migrated |
| `POST /api/me/deactivate` | Not migrated |
| `GET /api/support-categories` | Staging smoke-verified (200, 5 categories) |
| `GET /api/counselors/matches` | Staging smoke-verified (200, 2 matches) |
| `GET /api/counselors` | Staging smoke-verified (200, 2 counselors) |
| `GET /api/counselors/:publicId/picture` | Not migrated |
| `GET /api/admin/site-settings` | Not migrated |
| `POST /api/admin/site-settings/homepage-image` | Not migrated |
| `DELETE /api/admin/site-settings/homepage-image` | Not migrated |
| `PATCH /api/counselor/profile` | Not migrated |
| `GET /api/counselor/profile` | Not migrated |
| `POST /api/counselor/profile/documents` | Not migrated |
| `GET /api/requests` | Edge code; missing bearer rejected in staging; valid account path unverified |
| `POST /api/requests` | Edge code and SQL RPC; RPC transaction-tested, Edge integration not staging-verified |
| `PATCH /api/requests/:publicRef/status` | Edge code and SQL RPC; RPC transaction-tested, Edge integration not staging-verified |
| `GET /api/counselor/cases` | Not migrated |
| `GET /api/counselor/disciples` | Not migrated |
| `GET /api/conversations` | Edge code; not staging-verified |
| `GET /api/conversations/:publicId/other-party-picture` | Not migrated |
| `GET /api/conversations/:publicId/messages` | Edge code; not staging-verified |
| `POST /api/conversations/:publicId/receipts` | Edge code and SQL RPC; RPC transaction-tested, Edge integration not staging-verified |
| `POST /api/conversations/:publicId/messages` | Edge code and SQL RPC; RPC transaction-tested, Edge integration not staging-verified |
| `PATCH /api/messages/:id` | Not migrated |
| `DELETE /api/messages/:id` | Not migrated |
| `GET /api/journey` | Not migrated |
| `PATCH /api/journey/:stage` | Not migrated |
| `POST /api/concerns` | Not migrated |
| `GET /api/admin/counselor-applications` | Not migrated |
| `GET /api/admin/counselor-applications/:publicRef` | Not migrated |
| `PATCH /api/admin/counselor-applications/:publicRef/qualifications/:qualificationId/verification` | Not migrated |
| `PATCH /api/admin/counselor-applications/:publicRef/license-verification` | Not migrated |
| `PATCH /api/admin/counselor-applications/:publicRef/review` | Not migrated |
| `GET /api/counselor/applications/:publicRef/documents/:documentId` | Not migrated |
| `GET /api/safeguarding/concerns` | Not migrated |
| `PATCH /api/admin/users/:publicId/specialties` | Not migrated |
| `GET /api/admin/users` | Not migrated |
| `DELETE /api/admin/users/:publicId` | Not migrated |
| `PATCH /api/admin/users/:publicId/status` | Not migrated |
| `PATCH /api/admin/users/:publicId/role` | Not migrated |
| `PATCH /api/admin/counselors/:publicId/approval` | Not migrated |
| `PATCH /api/admin/requests/:publicRef/assignment` | Not migrated |
| `POST /api/admin/users/:publicId/safeguarding-permission` | Not migrated |
| `GET /api/admin/summary` | Not migrated |
| `GET /api/admin/analytics` | Not migrated |

## Existing-account migration strategy

1. Keep existing `users` rows and all request, conversation, message, audit, and application foreign keys. Populate `users.auth_user_id` in place; never recreate users or remap relationships.
2. Do not copy or expose Express Argon2 hashes as Supabase Auth credentials. Treat migration as verified account linking, followed by a Supabase Auth credential setup/reset.
3. For registered accounts, require proof of control of the existing account (valid legacy password/session) and verified control of the email address. Link the existing user to the new Auth UUID in a server-side transaction. Resolve email collisions explicitly and audit the operation.
4. For anonymous accounts, preserve pseudonymity. Offer a migration link only after proof using an already-valid legacy session and a one-time, hash-stored recovery secret; do not require or infer an email identity. If proof is unavailable, preserve the old account in Express until an approved recovery policy exists.
5. Keep legacy sign-in available during a staged dual-auth period. Never allow a caller to choose another user's application UUID or role. The Edge Function must derive the application identity only from a verified Supabase Auth UUID lookup.
6. Revoke legacy sessions only after successful linking and verified Supabase sign-in. Record an auditable completion marker. Define tested rollback before migrating any credentials or changing account status.

## Required external setup and staging procedure

The staging project has been linked and verified by ref. Before destructive or account-level tests, the operator must confirm that its existing user/audit data is sanitized staging data or restore a separate sanitized test dataset. The CLI is usable through `npx supabase`; no global install is required. Never use production data for destructive tests.

Before applying migrations to staging:

1. Export a staging backup and confirm the project ref in the CLI.
2. Reconcile `server/migrations` with Supabase CLI migration history. Establish a reviewed baseline for an existing schema; do not replay `001`–`020` over the existing database without checking each migration's idempotency and effect.
3. Apply the schema to an empty staging project and compare tables, constraints, indexes, functions, grants, and RLS to the expected schema.
4. Configure Supabase Auth redirect URLs and SMTP/test delivery for staging. Keep public signup disabled unless the intended registration flow is implemented.
5. Configure Edge Function secrets server-side (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and exact `APP_ORIGINS`). Never prefix privileged credentials with `VITE_`, commit them, or send them in chat.
6. Deploy the function to staging only, then test invalid/expired tokens, identity-link edge cases, role boundaries, RLS/Data API denials, storage owner/participant/admin access, file size/type validation, every route in the checklist, and complete browser workflows.
7. Migrate verified file objects to private buckets with narrowly scoped policies and byte/hash verification. Investigate the two already-missing local document objects before claiming file migration completeness.
8. Run the production frontend build, all tests, dependency audit, end-to-end tests, and backup/restore and rollback exercises.

### Rollback

- Do not remove Express, legacy session tables, credentials, or local private files during migration.
- Keep `VITE_API_BASE_URL`/the same-origin `/api` route pointed at Express until staging passes and a separately approved cutover is scheduled.
- During cutover, retain the prior frontend artifact, Express service, database backup, and migration ledger. If health, Auth, privacy, or workflow checks fail, revert the frontend/API routing to Express; do not reverse destructive schema changes or unlink accounts automatically.
- Production `supabase db push` and Edge Function deploy require explicit approval after staging sign-off. Neither has been performed as part of this audit.
