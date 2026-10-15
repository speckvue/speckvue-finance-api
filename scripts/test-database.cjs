const { GenericContainer, Wait } = require('testcontainers');
const { PostgreSqlContainer } = require('@testcontainers/postgresql');

const { Client } = require('pg');

const { randomBytes } = require('node:crypto');

const { spawn, spawnSync } = require('node:child_process');
const path = require('node:path');
const { readFileSync } = require('node:fs');
const { once } = require('node:events');

require('dotenv').config({ path: '.env', quiet: true });

(async () => {
  const container = await new PostgreSqlContainer(
    process.env.POSTGRES_IMAGE || 'postgres:18.6-bookworm',
  )
    .withDatabase('speckvue_test')
    .start();
  let redisContainer;
  let api;
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
      THROTTLE_LIMIT: '500',
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
    if (process.argv.includes('--browser')) {
      const port = Number(process.env.E2E_API_PORT);
      if (!Number.isInteger(port) || port < 1024 || port > 65535)
        throw Error('Configure E2E_API_PORT in .env');
      api = spawn(process.execPath, ['dist/src/main.js'], {
        env: {
          ...env,
          REDIS_KEY_PREFIX: env.REDIS_KEY_PREFIX + ':browser',
          APP_PORT: String(port),
          APP_HOST: '127.0.0.1',
          APP_URL: 'http://localhost:' + port,
          SIGNUP_ENABLED: 'true',
        },
        stdio: 'inherit',
        windowsHide: true,
      });
      api.on('error', () => {});
      let ready = false;
      for (let attempt = 0; attempt < 60; attempt++) {
        if (api.exitCode !== null) throw Error('Isolated browser API stopped');
        try {
          ready = (
            await fetch('http://localhost:' + port + '/api/v1/health/ready', {
              signal: AbortSignal.timeout(1000),
            })
          ).ok;
        } catch {
          /* Wait for the owned API startup. */
        }
        if (ready) break;
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
      if (!ready) throw Error('Isolated browser API did not become ready');
      const frontend = path.resolve(__dirname, '../../speckvue-finance-web');
      const local = require('dotenv').parse(
        readFileSync(path.join(frontend, '.env')),
      );
      const frontendRequire = require('node:module').createRequire(
        path.join(frontend, 'package.json'),
      );
      const browserEnv = {
        ...process.env,
        ...frontendRequire('dotenv-expand').expand({
          parsed: local,
          processEnv: {},
        }).parsed,
        API_INTERNAL_URL: 'http://localhost:' + port,
        E2E_AUTH_ENABLED: 'true',
      };
      // Use async spawn: blocking the parent would stall the owned API's stdout pipe.
      const browser = spawn(
        process.execPath,
        [path.join(frontend, 'node_modules/@playwright/test/cli.js'), 'test'],
        { cwd: frontend, env: browserEnv, stdio: 'inherit', windowsHide: true },
      );
      const [code] = await once(browser, 'exit');
      if (code !== 0) throw Error('Connected browser checks failed');
    }
  } finally {
    if (api && api.exitCode === null) {
      const stopped = once(api, 'exit');
      api.kill('SIGTERM');
      await stopped;
    }
    if (redisContainer) await redisContainer.stop();
    await container.stop();
  }
})().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
