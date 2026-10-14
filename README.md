# Speckvue Finance API

Backend API for Speckvue Finance, handling personal financial data, transactions, budgets, accounts, and core financial management operations.

Private Speckvue source for a public-facing product. First-party code is proprietary; dependency licenses remain intact. This is the backend engineering foundation, with working authentication, user profiles, health, and representative account operations. Transactions, categories, budgets, savings goals, and reports are planned boundaries, not complete features.

## Stack and prerequisites

Node.js 24 LTS, npm, NestJS 12, strict TypeScript 6, PostgreSQL 18, Prisma 7 with the PostgreSQL driver adapter, class-validator, Zod, Argon2id, Winston, Redis, Swagger, Jest, Supertest, and Testcontainers. Docker is optional for application execution and required for the disposable database test runner. Docker Compose 5.5.1 is the CI toolchain; Watch requires a version supporting initial_sync.

## Install and configure

```powershell
npm ci --ignore-scripts
node scripts/configure-local.cjs
npm run prisma:generate
```

The initializer copies .env.example only when .env is absent and replaces placeholder secrets with cryptographic random values without printing them. Review .env before running. Do not use template secrets. Configure PostgreSQL roles as described in docs/database.md for a native installation. .env supplies settings for all execution modes. Native and container database URLs are derived and encoded rather than maintained separately. npm install lifecycle scripts are intentionally suppressed; generated Prisma artifacts and hooks are explicit setup steps. Enable local hooks with `node node_modules/husky/bin.js`.

## A: Native API and native PostgreSQL

```powershell
npm run db:deploy
npm run dev
```

Supply the dedicated runtime and migration role credentials in .env. For new schema development, npm run db:migrate -- --name descriptive_change uses Prisma's development migration workflow; the migration role needs a dedicated shadow database or development-only CREATEDB privileges. Never grant CREATEDB to the runtime user.

## B: Native API and Docker PostgreSQL

```powershell
npm run db:up
npm run db:deploy
npm run dev
```

The database binds to DOCKER_BIND_HOST (127.0.0.1 by default). POSTGRES_HOST/POSTGRES_PORT target this host port. Role creation happens only on the first initialization of the named PostgreSQL volume.

## C: Full Docker

```powershell
npm run docker:config
npm run docker:up
# Optional development Watch:
npm run docker:watch
npm run docker:down
```

Compose starts PostgreSQL, applies committed migrations in a single controlled job, and starts a non-root API. Container POSTGRES_HOST/POSTGRES_PORT are overridden with DOCKER_DATABASE_HOST/DOCKER_DATABASE_PORT. Other settings come from the same .env. Production requires verified database TLS and HTTPS; local defaults run in development mode even when using the compiled image. This stack is a local/deployment template; configure certificates and a reverse proxy before production. The existing finance web Docker app uses port 3000; the API defaults to 4000 and PostgreSQL to 5432.

## API and authentication

Default base URL: http://localhost:4000/api/v1. Swagger: http://localhost:4000/docs; machine-readable document: /openapi.json. Production public documentation is disabled by enforced validation. `npm run openapi:generate` after a build exports ignored openapi.json for generating frontend types. See docs/api.md for complete contracts.

Server-managed opaque sessions use HttpOnly cookies. Browser requests use credentials: include. Signin returns the session-bound csrfToken; authenticated mutations send X-CSRF-Token and an explicitly allowed Origin. No access token belongs in localStorage. Password reset, verification, and MFA have no endpoints until delivery and identity requirements are defined.

## Commands and verification

| Command                                    | Purpose                                                      |
| ------------------------------------------ | ------------------------------------------------------------ |
| npm run dev / start                        | Native development / Nest startup                            |
| npm run build / start:prod                 | Generate client, compile / execute dist/src/main.js          |
| npm run typecheck / lint / format:check    | Static checks                                                |
| npm run format / lint:fix                  | Formatting and lint repairs                                  |
| npm run test:ci / test:cov                 | Unit tests / coverage                                        |
| npm run test:database                      | Disposable PostgreSQL, migrations, integration and E2E tests |
| npm run test:integration / test:e2e        | Tests against explicitly isolated _test database settings    |
| npm run prisma:validate / prisma:generate  | Schema validation / client generation                        |
| npm run db:migrate / db:deploy / db:studio | Develop migrations / deploy migrations / inspect database    |
| npm run docker:build / docker:config       | Image build / Compose validation                             |

Integration/E2E tests refuse database names without the _test suffix and run only with NODE_ENV=test. The disposable runner creates randomized credentials and cleans up only its own container. CI runs static checks, unit tests, isolated database tests, production build, runtime dependency audit, and full Docker readiness.

## Structure

```text
src/
  config/             validated typed configuration
  database/           shared Prisma lifecycle
  common/             guards, contracts, errors, money utilities
  modules/auth/       passwords, database sessions, CSRF
  modules/users/      safe profile selection
  modules/accounts/   representative owned account operations
  modules/health/     minimal liveness/readiness
  generated/prisma/   ignored generated client
prisma/               schema and committed migrations
docker/               database initialization and build-only Prisma config
scripts/              configuration, migrations, health and tests
test/                 unit, integration and E2E suites
docs/                 architecture, API, database and deployment decisions
.github/workflows/    CI
```

## Troubleshooting and contributions

An invalid-configuration error reports field names and validation reasons, never values. Generate local secrets before starting. Database connection errors usually indicate the wrong host, missing roles, or a volume initialized with earlier credentials; update roles deliberately rather than deleting data. Changed PostgreSQL passwords in .env do not change existing database roles. Reapply migrations after pulling schema changes. Port conflicts are resolved in the central .env.

Use Conventional Commits (feat, fix, docs, test, ci). Hooks format and lint staged code without running database suites. NestJS and Next.js retain their idiomatic framework APIs; both repos use Prettier and ESLint without decorative source sections.

See docs/verification.md for executed checks, docs/security.md for limitations, and docs/deployment.md for production operations. Do not claim deployment readiness solely from a successful build.

## Product development order

Connect the frontend to the generated API contract and session/profile flow first. Confirm currency and rounding rules, then add categories and transaction posting/reconciliation with ownership and idempotency tests. Build budgets and savings goals on those records, followed by reporting. Select identity/email delivery and operational recovery requirements before opening public onboarding.

## Shared infrastructure and conventions

Both repos use the same Node 24/npm requirements, package metadata, formatting rules, and common check/test/format/audit scripts. Run `npm run env:setup` to initialize missing settings and secrets, and `npm run check` for static verification. Winston writes JSON console logs and daily/size-rotated application/error files with configurable retention. Redis is authenticated and used only on the server. See docs/infrastructure.md for configuration, Docker volumes, cache policy, and failure behavior.
