# PostgreSQL and Prisma

PostgreSQL 18 uses UTF-8/C.UTF-8 and UTC timestamps. Prisma 7 uses the prisma-client generator, explicit CommonJS output in src/generated/prisma, prisma.config.ts for the migration datasource, and PrismaPg for runtime pooling. prisma and @prisma/client are pinned to the same stable version; the registry latest CLI may be a release candidate.

POSTGRES_* is the single source for connection fields. The configuration utility percent-encodes username/password before assigning them to the URL. Native Prisma uses host-accessible POSTGRES_HOST/POSTGRES_PORT. Compose overrides only those fields with the db service host/internal port. Runtime uses POSTGRES_USER; migration tooling uses POSTGRES_MIGRATION_USER. Remote production requires certificate-verifying TLS; configure DATABASE_CA_FILE for a private CA. Do not log connection strings.

First Compose database startup creates a bootstrap administrator, a migration role with CREATE privileges inside the existing public schema, and a runtime role without DDL or superuser privileges. A controlled migration step grants access only to the application tables. Native installations must provision equivalent roles before migrations: migration role needs USAGE/CREATE on public; runtime needs USAGE on public, with per-table grants applied by db:deploy. Do not use the bootstrap administrator as the application user.

Commands: prisma:generate and prisma:validate need no database changes; db:migrate invokes migrate dev; db:deploy invokes migrate deploy and applies narrow runtime grants; db:studio opens Prisma Studio. Development migration diffing needs a separately managed shadow database or development-only CREATEDB on the migration role. Do not grant broad privileges in production. Run migrations once per deployment, not per API replica. No reset or db push is in normal startup.

UUIDs identify users and sessions. Unique email addresses and session digests, session ownership foreign keys, and expiry/user indexes protect identity integrity. Active models contain no financial examples.

For failed migrations, stop deployment, inspect prisma migrate status, restore/test against a backup, and use Prisma migrate resolve only after reconciling the actual database state. Prefer forward fixes; schema rollback is not implied by reverting code. Production recovery requires operator-approved backups and restore drills. No destructive synchronization commands are provided.

## Existing installations

The original migration remains immutable. A forward migration moves the former Account table into speckvue_archive, preserving its records and constraints without exposing it through Prisma or API routes. The runtime role has no access to this archive. Do not rewrite applied migration history or delete existing database volumes. Future product migrations should define their own real models.

For native PostgreSQL or an existing Docker volume, the database administrator must grant CREATE on the application database to POSTGRES_MIGRATION_USER before deployment. Use GRANT CREATE ON DATABASE your_database TO your_migration_role; substitute names from .env. This allows the migrator to create the archive schema and supports replay in development shadow databases. It does not grant CREATEDB or runtime privileges. Fresh Docker installations provision this through docker/init-database.sh.
