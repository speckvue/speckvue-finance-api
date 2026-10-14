# Code conventions

Both repositories use Prettier (two spaces, single quotes, semicolons, trailing commas, 80 columns, LF) and framework-specific ESLint rules. Imports are organized automatically. Package metadata, Node 24/npm requirements, shared tool versions, and check/test/format/audit scripts follow the same conventions. Frontend Tailwind formatting and Next lint rules complement the backend Nest rules.

Use focused modules and descriptive names. Use function declarations, arrow functions, classes, and named/default exports where they fit the framework and API. There is no one-function-per-file rule. Do not add decorative divider blocks or repetitive file headers. Add concise comments to explain intent, security boundaries, unexpected behavior, or a non-obvious tradeoff. Keep types near their use and let Prettier handle layout. Preserve vendor attribution and license notices.

Keep strict TypeScript and meaningful tests. Validate untrusted input at boundaries, narrow unknown errors, and keep financial amounts as exact decimal strings. Use signup, signin, and signout consistently in authentication code. Existing public frontend URL slugs /sign-in and /sign-up are retained for compatibility.

Use Conventional Commits. Staged files run ESLint and Prettier; CI runs static checks, tests, builds, and the runtime dependency audit. Run npm run check and npm run test:ci before review. Configuration lives in .env; never commit it or place secrets in NEXT_PUBLIC_* variables.

Nest controllers delegate business logic to services. Ownership comes from authenticated server context. Commit migrations; keep generated Prisma clients out of Git.
