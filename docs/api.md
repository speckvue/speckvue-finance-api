# API contracts

The default base is http://localhost:4000/api/v1; prefix and URI version come from .env. Responses return useful resource objects directly; lists return {data, nextCursor}. Dates are ISO 8601 UTC. Monetary values are exact fixed-four-place decimal strings. No automatic currency conversion or balance updates are provided.

| Endpoint             | Access                | Behavior                                                               |
| -------------------- | --------------------- | ---------------------------------------------------------------------- |
| GET /health/live     | Public                | Minimal process liveness                                               |
| GET /health/ready    | Public                | Minimal database readiness; 503 on failure                             |
| POST /auth/signup    | Allowed Origin        | Email and 12–128 character password; generic 201, including duplicates |
| POST /auth/signin    | Allowed Origin        | Generic 401 or HttpOnly session cookie and csrfToken                   |
| GET /auth/csrf       | Session               | Regenerate deterministic session-bound CSRF bootstrap                  |
| POST /auth/signout   | Session, CSRF, Origin | 204 and session invalidation                                           |
| GET /users/me        | Session               | id, email, createdAt only                                              |
| GET /accounts        | Session               | limit 1–100 (default 20), opaque UUID cursor                           |
| POST /accounts       | Session, CSRF, Origin | name, currency, openingBalance; required UUID-v4 Idempotency-Key       |
| GET /accounts/:id    | Session               | Owned, active account only                                             |
| PATCH /accounts/:id  | Session, CSRF, Origin | Rename only                                                            |
| DELETE /accounts/:id | Session, CSRF, Origin | Archive, preserving historical record; 204                             |

All nonpublic endpoints deny anonymous requests. A foreign account id or cursor returns 404, including for update/delete. Reusing an idempotency key with different input returns 409; replaying equivalent monetary input reuses the existing resource. Unknown DTO fields are rejected. Decimal input accepts up to 16 integer and four fractional digits; exponents and binary numeric values are rejected.

Browser mutations must send Origin matching one exact CORS_ORIGINS entry. Signin and signup require Origin to prevent signin CSRF; all authenticated mutations additionally require X-CSRF-Token from signin or /auth/csrf. Cookies are HttpOnly, host-only, path /api, SameSite lax by default, secure in production. SameSite none requires secure cookies. Requests from the frontend use credentials: include. Expired or revoked sessions return 401; the frontend should clear private query caches and request signin.

Errors use application/problem+json: {type:'about:blank',title,status,detail,code,requestId}. Validation details omit offending values; no stack or database message is exposed. Statuses include 400 validation, 401 authentication, 403 CSRF/origin, 404 owned resource absent, 409 idempotency/data conflict, 413 body limit, 429 rate limit, and 503 readiness/auth capacity.

Development Swagger at /docs and JSON at /openapi.json describe DTOs and cookies. Production validation disables public docs. Build then npm run openapi:generate for a machine-readable frontend contract. Generate frontend client types from this output instead of maintaining separate hand-written DTO copies. Swagger UI requires an allowed Origin for mutations; browser SameSite behavior still applies.
