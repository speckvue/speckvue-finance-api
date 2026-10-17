# Verification

Verified on 2026-10-16 for authentication, onboarding and preferences.

16 API unit tests and 23 real PostgreSQL/Redis integration and HTTP tests passed. Tests covered migrations, authentication, strict preferences, user isolation, stable onboarding timestamps, session ownership and revocation, password changes and expiry.

Strict TypeScript, ESLint, Prettier and native production builds passed. Docker production image builds passed during the account implementation. The final checkout is running in Docker development mode: Next.js uses webpack development mode and Nest uses --watch. Compose Watch processes are active in both repositories; temporary file synchronization probes were verified and removed. PostgreSQL and both Redis services are healthy.

No SMTP service is configured. Email verification and forgotten-password delivery remain unavailable. No test accounts remain in the regular application database.

## Financial accounts

The financial-account migration was applied to development without removing users or sessions. The API build, strict TypeScript, ESLint, Prettier, and 16 unit tests passed. Thirty HTTP/database tests passed against disposable PostgreSQL and Redis, covering exact decimals, supported account types, currency precision, invalid dates and payloads, owner isolation, archiving/restoration, pagination, and normal CSRF token request limits alongside strict signin limits.

The sibling frontend's latest production build and 53 unit tests passed. Financial account browser review uses temporary unique users; the review runner removes those users and their accounts afterward.

## Accounts completion — 2026-10-16

The completed Accounts phase passed 19 API unit tests and 33 HTTP/database tests against disposable PostgreSQL and Redis. Added checks cover local-date boundaries, authoritative currency metadata, immutable account currency, optional details and clearing, and profile-currency changes without revaluation. Existing checks still cover exact decimals, all six account types, owner isolation, validation, pagination, and archive/restore.

Native production build, strict TypeScript, ESLint, Prettier and whitespace checks passed. Both additive migrations were applied to development without resetting data. The API development container is healthy and Compose Watch synchronization was verified with a temporary probe that was removed. Financial rules and requirements for future ledger ownership are documented in [financial foundation](financial-foundation.md).

The frontend passed 59 unit tests, its production build and static checks. Live browser checks passed account creation, optional institution/notes, detail navigation, edit dialogs with locked currency, persistence, archive/restore, missing-account handling, mobile/desktop layouts and accessibility in light/dark themes. Temporary browser-review users and their accounts were removed. This was targeted live Docker verification, not a new run of the full standalone Playwright suite.

## Categories — 2026-10-17

Nineteen API unit tests and 45 real PostgreSQL/Redis HTTP/database tests passed. The category suite covers strict inputs, session/CSRF protections, owner isolation for every action and parent assignment, normalized sibling-name uniqueness, customization, immutable type, hierarchy/cycle restrictions, root/child ordering, archive timestamps, branch archival, explicit restoration, assignment guard, database owner/type foreign keys, concurrent duplicates and archive/create races, and the 500-category bound. Test databases are disposable; regular application data was not reset.

Prisma generation, native API production build, TypeScript, ESLint and Prettier passed. The Category migration and runtime-role grant were applied to development. Its exported assignment guard is ready for the later ledger step; no transaction module or sample usage data was introduced. The sibling frontend passed 75 unit tests and its production build. Live mobile/dark and desktop/light review checked the complete category flow and accessibility. Temporary review users were removed after every run. Both development services remain healthy with Compose Watch processes running.

## Payees — 2026-10-17

Nineteen API unit tests and 59 real PostgreSQL/Redis HTTP/database tests passed. Payee checks cover all three types, legitimate duplicate display names, strict inputs and owner isolation, literal wildcard search, notes/name filters, tied-timestamp pagination, rename/type correction, idempotent archive/restore, merge-source retention, idempotent merges, target constraints, flattened chains, canonical assignment/historical resolution, database ownership constraints and concurrent opposing-merge/archive races.

Prisma generation, production build, TypeScript, ESLint and Prettier passed. The additive Payee migration and runtime grants preserved existing records. Docker Desktop became unavailable during the first database-run attempt; its engine was restarted, the development services and Watch processes recovered, and the disposable database tests then completed successfully. No application data was reset.

The frontend passed 89 tests and its production build. Live desktop/light and mobile/dark checks covered all payee types, rename/persistence, merge selection and acknowledgement, source notes and IDs, searching retained names, status/type filters, archive/restore, keyboard behavior, accessibility and responsive layout. All temporary browser-review users and their payees were removed. Transaction guards are ready for the next phase; the ledger is not yet implemented.

## Manual transactions — 2026-10-17

Nineteen API unit tests, 77 real PostgreSQL/Redis HTTP/database tests and 98 frontend tests passed. The ledger tests cover signed income/expense/refund movements, exact large/fractional values, zero/three-decimal currencies, balanced allocations, strict validation, owner isolation at each reference, duplicate-create retries, concurrent stale edits, immutable revisions and history pagination, same-currency account moves, opening locks after moved/deleted history, archived references, merged payees, overflow rollback on create/delete, retained deletions, keyset pagination and runtime audit permissions. Account metadata and derived balances are read in a repeatable snapshot; list balance queries are batched by account.

Production builds, TypeScript, ESLint, Prettier and whitespace checks passed in both repositories. Additive ledger/constraint/index migrations and runtime grants were applied without resetting application data. Test-suite Redis prefixes are assigned before configuration import, isolating deliberate throttle tests from other suites.

Targeted live Docker browser review passed at 1440px/light and 390px/dark for split creation, pending form/dismissal locks, refund editing, deletion and retained history, income creation, account moves, balance persistence, opening-field locks, stationary headers/drawer and accessibility. Additional mobile/desktop checks passed maximum exact amounts and long payee names/notes without overflow. Axe WCAG 2 A/AA, 2.1 AA and 2.2 AA checks passed on inspected pages/dialogs. Temporary review users and their records were removed. The browser review caught and fixed an edit form sending response-only fields; a regression test now verifies its writable payload.

The connected Transactions Playwright scenario was added for the isolated browser runner. The full standalone Playwright suite was not rerun for this phase. Next's development compiler restarted once at its memory threshold during initial browser setup; verification was repeated after compilation settled. Both Docker development services remain healthy with Compose Watch enabled.

## Transfers — 2026-10-17

Nineteen API unit tests, 96 real PostgreSQL/Redis HTTP/database tests and 112 frontend tests passed. Transfer checks cover linked same-currency and cross-currency principal movements, source/destination/third-account fees, separate expense classification, exact tiny/large rates and currency precision, all involved opening dates, strict fields and owner/type constraints, same-account rejection, retries and stale concurrent edits, atomic account/fee reassignment, archived references, immutable and paginated history, deleted records and account filters, balance overflow rollback, and manual transaction bounds that include transfer effects. Existing authentication, accounts, categories, payees and manual transaction tests still pass.

The transfer migration and runtime grants were applied additively without resetting application data. Account balance derivation is now shared by accounts, manual transactions and transfers. It preserves per-account currencies and all past account links for opening-field locks. Both production builds, TypeScript, ESLint, Prettier and whitespace checks passed. Jest's intended 30-second timeout now lives at the root of its multi-project configuration; interaction tests use a bounded 15-second budget for slower development hosts.

Live Docker review passed at 1440px/light and 390px/dark for both principals, pending control/dismissal locks, FX amounts and rates, all fee locations, atomic editing/deletion and complete balance restoration, retained history, active/deleted filters, archive/restore, opening locks, the stationary frame and mobile navigation. Maximum supported amounts, tiny rates and long names/notes passed compact overflow checks. Axe WCAG 2 A/AA, 2.1 AA and 2.2 AA checks passed on inspected pages/dialogs. Temporary review users were removed, including a stalled review session. Idempotent review reads retry transient connection resets; financial UI submissions retain their own create keys.

Docker Desktop was started, a stale API startup recovered after Redis readiness, and stale Compose Watch PID files were removed only after verifying their PIDs belonged to unrelated processes. Fresh Watch processes are active for both repositories. The connected Transfers Playwright scenario was added; the full standalone Playwright suite was not rerun in this phase. No SMTP, demo data, live FX feed or financial reporting module was introduced.
