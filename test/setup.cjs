const { config } = require('dotenv');

const { randomBytes } = require('node:crypto');

config({ path: '.env.example', override: false, quiet: true });

process.env.NODE_ENV = 'test';

process.env.LOG_LEVEL = 'silent';
process.env.LOG_FILE_ENABLED = 'false';

process.env.SESSION_SECRET = process.env.SESSION_SECRET?.includes('replace_')
  ? randomBytes(48).toString('base64url')
  : process.env.SESSION_SECRET;

for (const key of [
  'POSTGRES_PASSWORD',
  'POSTGRES_MIGRATION_PASSWORD',
  'REDIS_PASSWORD',
])
  if (process.env[key]?.includes('replace_'))
    process.env[key] = randomBytes(24).toString('base64url');

process.env.AUTH_THROTTLE_LIMIT = '100';
