# Architecture

A modular NestJS monolith keeps infrastructure small enough for one operator. Controllers handle HTTP; services handle application logic; Prisma is shared through one lifecycle-managed provider. There are no redundant generic repositories or base services. Configuration, database lifecycle, default-deny sessions, CSRF, throttling, and structured logging are shared infrastructure.

Express is selected after evaluating Fastify: both are compatible with NestJS, but Express gives straightforward Supertest integration and mature Helmet/cookie middleware with no adapter-specific testing or authentication complexity. Performance is bounded through request limits, short transactions, Argon2 concurrency limits, finite PostgreSQL pools and timeouts, and bounded pagination. Measure before changing adapters.

Only users, sessions, and accounts have database models. Accounts demonstrate authorization and idempotency, not balance-changing transaction logic. Future modules: transactions own immutable financial events and atomic balance changes; categories own classification; budgets own period allocations; savings-goals own target tracking; reports own read-only aggregation. Add modules when real business behavior exists, with ownership constraints in every query. Do not add empty controllers or speculative tables.

Redis coordinates shared rate limits and provides explicit TTL cache operations; authenticated financial responses remain uncached. HTTP responses use no-store. Winston request IDs and duration logs provide a lightweight tracing extension point; introduce metrics through request lifecycle hooks without recording financial payloads. Shared Redis counters coordinate throttling across API replicas.
