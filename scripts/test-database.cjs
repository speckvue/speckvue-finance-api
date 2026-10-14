const { GenericContainer, Wait } = require('testcontainers');
const { PostgreSqlContainer } = require('@testcontainers/postgresql');

const { Client } = require('pg');

const { randomBytes } = require('node:crypto');

const { spawnSync } = require('node:child_process');

require('dotenv').config({ path: '.env', quiet: true });

(async () => {
  const container = await new PostgreSqlContainer(
    process.env.POSTGRES_IMAGE || 'postgres:18.6-bookworm',
  )
    .withDatabase('speckvue_test')
    .start();
  let redisContainer;
  try {
    const redisPassword = randomBytes(24).toString('base64url');
    redisContainer = await new GenericContainer(
      process.env.REDIS_IMAGE || 'redis:8.10.2-alpine',
    )
      .withExposedPorts(6379)
      .withCommand([
        'redis-server',
        '--requirepass',
        redisPassword,
        '--save',
        '',
        '--appendonly',
        'no',
      ])
      .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
      .start();
    const runtimePassword = randomBytes(24).toString('base64url');
    const migrationPassword = randomBytes(24).toString('base64url');
    const client = new Client({
      connectionString: container.getConnectionUri(),
    });
    await client.connect();
    await client.query(
      "CREATE ROLE test_app LOGIN PASSWORD '" +
        runtimePassword +
        "'; CREATE ROLE test_migrator LOGIN PASSWORD '" +
        migrationPassword +
        "'; GRANT CREATE ON DATABASE speckvue_test TO test_migrator; REVOKE CREATE ON SCHEMA public FROM PUBLIC; GRANT USAGE, CREATE ON SCHEMA public TO test_migrator; GRANT USAGE ON SCHEMA public TO test_app;",
    );
    await client.end();
    const env = {
      ...process.env,
      NODE_ENV: 'test',
      POSTGRES_HOST: container.getHost(),
      POSTGRES_PORT: String(container.getPort()),
      POSTGRES_DB: 'speckvue_test',
      POSTGRES_USER: 'test_app',
      POSTGRES_PASSWORD: runtimePassword,
      POSTGRES_MIGRATION_USER: 'test_migrator',
      POSTGRES_MIGRATION_PASSWORD: migrationPassword,
      SESSION_SECRET: randomBytes(48).toString('base64url'),
      DATABASE_TLS: 'false',
      LOG_LEVEL: 'silent',
      LOG_FILE_ENABLED: 'false',
      REDIS_HOST: redisContainer.getHost(),
      REDIS_PORT: String(redisContainer.getMappedPort(6379)),
      REDIS_PASSWORD: redisPassword,
      REDIS_TLS: 'false',
      REDIS_KEY_PREFIX: 'speckvue:test:' + randomBytes(8).toString('hex'),
      AUTH_THROTTLE_LIMIT: '100',
    };
    const run = (args) => {
      const result = spawnSync(process.execPath, args, {
        env,
        stdio: 'inherit',
      });
      if (result.status !== 0) throw Error('Isolated database check failed');
    };
    run(['scripts/migrate.cjs']);
    run([
      '--experimental-vm-modules',
      'node_modules/jest/bin/jest.js',
      '--selectProjects',
      'integration',
      'e2e',
      '--runInBand',
    ]);
  } finally {
    if (redisContainer) await redisContainer.stop();
    await container.stop();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
