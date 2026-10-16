const { spawnSync } = require('node:child_process');

const { readFileSync } = require('node:fs');

const { Client } = require('pg');

require('dotenv').config({ path: '.env', quiet: true });

const migrate = async () => {
  const result = spawnSync(
    process.execPath,
    ['node_modules/prisma/build/index.js', 'migrate', 'deploy'],
    {
      stdio: 'inherit',
    },
  );
  if (result.status !== 0) throw new Error('Migration deployment failed');
  const role = process.env.POSTGRES_USER;
  if (!role || !/^[a-z][a-z0-9_]*$/.test(role))
    throw new Error('Invalid runtime role name');
  const client = new Client({
    host: process.env.POSTGRES_HOST,
    port: Number(process.env.POSTGRES_PORT),
    database: process.env.POSTGRES_DB,
    user: process.env.POSTGRES_MIGRATION_USER,
    password: process.env.POSTGRES_MIGRATION_PASSWORD,
    connectionTimeoutMillis: 5000,
    ssl:
      process.env.DATABASE_TLS === 'true'
        ? {
            rejectUnauthorized: true,
            ...(process.env.DATABASE_CA_FILE
              ? { ca: readFileSync(process.env.DATABASE_CA_FILE, 'utf8') }
              : {}),
          }
        : false,
  });
  await client.connect();
  try {
    await client.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "User", "Session", "FinancialAccount", "Category", "Payee", "ManualTransaction", "TransactionSplit" TO "${role}"`,
    );
    await client.query(
      `GRANT SELECT, INSERT ON TABLE "TransactionRevision" TO "${role}"`,
    );
    await client.query(
      `REVOKE ALL ON TABLE speckvue_archive."Account" FROM "${role}"`,
    );
    await client.query(`REVOKE ALL ON SCHEMA speckvue_archive FROM "${role}"`);
    await client.query(
      `REVOKE ALL ON TABLE "_prisma_migrations" FROM "${role}"`,
    );
  } finally {
    await client.end();
  }
};

void migrate().catch(() => {
  console.error(
    'Controlled migration failed; review database availability and role permissions.',
  );
  process.exitCode = 1;
});
