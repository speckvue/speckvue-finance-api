# API contracts

The default base is http://localhost:4000/api/v1; prefix and URI version come from .env. The API exposes authentication, current-user preferences, health, and owner-scoped financial accounts, categories, payees and manual transactions. Timestamps use ISO 8601 UTC; financial calendar dates use YYYY-MM-DD.

| Endpoint           | Access                | Behavior                                                                 |
| ------------------ | --------------------- | ------------------------------------------------------------------------ |
| GET /health/live   | Public                | Minimal process liveness                                                 |
| GET /health/ready  | Public                | Database and Redis readiness; 503 on failure                             |
| POST /auth/signup  | Allowed Origin        | Email and 12â€“128 character password; generic 201, including duplicates |
| POST /auth/signin  | Allowed Origin        | Generic 401 or HttpOnly session cookie and csrfToken                     |
| GET /auth/csrf     | Session               | Regenerate deterministic session-bound CSRF bootstrap                    |
| POST /auth/signout | Session, CSRF, Origin | 204 and session invalidation                                             |
| GET /users/me      | Session               | Safe profile and preferences                                             |

Additional endpoints: POST /users/me/onboarding, PATCH /users/me/preferences, GET /auth/sessions, DELETE /auth/sessions/:id, POST /auth/signout-all and POST /auth/password. See [accounts and preferences](accounts-and-preferences.md) for payloads and behavior.

All nonpublic endpoints deny anonymous requests. Unknown DTO fields are rejected. See [financial accounts](financial-accounts.md) for account endpoints, decimal precision, currencies, pagination, archiving, and restoration.

Browser mutations must send Origin matching one exact CORS_ORIGINS entry. Signin and signup require Origin to prevent signin CSRF; all authenticated mutations additionally require X-CSRF-Token from signin or /auth/csrf. Cookies are HttpOnly, host-only, path /api, SameSite lax by default, secure in production. SameSite none requires secure cookies. Requests from the frontend use credentials: include. Expired or revoked sessions return 401; the frontend should clear private query caches and request signin.

Errors use application/problem+json: {type:'about:blank',title,status,detail,code,requestId}. Validation details omit offending values; no stack or database message is exposed. Statuses include 400 validation, 401 authentication, 403 CSRF/origin, 404 route absent, 409 data conflict, 413 body limit, 429 rate limit, and 503 readiness/auth capacity.

Development Swagger at /docs and JSON at /openapi.json describe DTOs and cookies. Production validation disables public docs. Build then npm run openapi:generate for a machine-readable frontend contract. Generate frontend client types from this output instead of maintaining separate hand-written DTO copies. Swagger UI requires an allowed Origin for mutations; browser SameSite behavior still applies.

See [manual transactions](manual-transactions.md) for ledger create/update/delete, category allocations, request keys, revision history and balance rules.
