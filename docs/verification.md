# Verification

The template cleanup removes sample features and updates checks for the remaining infrastructure. Run npm run check, npm run test:ci and npm run build. Run npm run test:database for disposable PostgreSQL/Redis integration and HTTP tests, including authentication, CSRF, expiry, migrations and the removal of account endpoints.

Docker production and Watch configurations remain supported. Earlier sample-feature test counts are historical and do not describe this template.

Verified on 2026-10-15: 16 unit tests and 20 disposable PostgreSQL/Redis integration and HTTP tests passed. Strict TypeScript, ESLint, Prettier, native Nest build, and Docker image builds passed. Tests confirm authentication, CSRF, throttling, session expiry, archived table isolation and unavailable account routes.
