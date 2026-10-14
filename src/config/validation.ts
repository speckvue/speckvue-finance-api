import { z } from 'zod';

const flag = z.enum(['true', 'false']).transform((value) => value === 'true');

const positive = z.coerce.number().int().positive();

const schema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    APP_NAME: z.string().min(1),
    APP_HOST: z.string().min(1),
    APP_PORT: positive.max(65535),
    APP_URL: z.url(),
    API_PREFIX: z.string().regex(/^[a-z][a-z0-9-]*$/),
    API_VERSION: z.string().regex(/^[1-9][0-9]*$/),
    FRONTEND_URL: z.url(),
    CORS_ORIGINS: z.string().min(1),
    BODY_LIMIT: z.string().regex(/^[1-9][0-9]*(kb|mb)$/),
    REQUEST_TIMEOUT_MS: positive.max(120000),
    TRUST_PROXY_CIDRS: z.string().default(''),
    LOG_LEVEL: z.enum([
      'error',
      'warn',
      'info',
      'http',
      'verbose',
      'debug',
      'silly',
      'silent',
    ]),
    LOG_DIRECTORY: z.string().min(1),
    LOG_FILE_ENABLED: flag,
    LOG_MAX_SIZE: z.string().regex(/^[1-9][0-9]*[kmg]$/i),
    LOG_MAX_FILES: z.string().regex(/^[1-9][0-9]*d$/),
    REDIS_HOST: z.string().min(1),
    REDIS_PORT: positive.max(65535),
    REDIS_PASSWORD: z
      .string()
      .min(16)
      .refine((value) => !value.includes('replace_')),
    REDIS_DATABASE: z.coerce.number().int().min(0).max(15),
    REDIS_KEY_PREFIX: z.string().regex(/^[a-z][a-z0-9:_-]*$/),
    REDIS_TLS: flag,
    REDIS_CONNECT_TIMEOUT_MS: positive.max(30000),
    REDIS_COMMAND_TIMEOUT_MS: positive.max(30000),
    SWAGGER_ENABLED: flag,
    SIGNUP_ENABLED: flag,
    SESSION_SECRET: z
      .string()
      .min(48)
      .refine(
        (v) => !v.includes('replace_'),
        'Generate a random session secret',
      ),
    SESSION_COOKIE_NAME: z.string().regex(/^[A-Za-z0-9_-]+$/),
    SESSION_TTL_SECONDS: positive.max(604800),
    COOKIE_SECURE: flag,
    COOKIE_SAME_SITE: z.enum(['lax', 'strict', 'none']),
    THROTTLE_TTL_MS: positive,
    THROTTLE_LIMIT: positive,
    AUTH_THROTTLE_LIMIT: positive,
    ARGON_MEMORY_KIB: positive.min(19456).max(262144),
    ARGON_TIME_COST: positive.min(2).max(10),
    ARGON_PARALLELISM: positive.max(4),
    AUTH_CONCURRENCY: positive.max(16),
    POSTGRES_HOST: z.string().min(1),
    POSTGRES_PORT: positive.max(65535),
    POSTGRES_DB: z.string().regex(/^[a-z][a-z0-9_]*$/),
    POSTGRES_USER: z.string().regex(/^[a-z][a-z0-9_]*$/),
    POSTGRES_PASSWORD: z
      .string()
      .min(16)
      .refine((v) => !v.includes('replace_')),
    POSTGRES_MIGRATION_USER: z
      .string()
      .regex(/^[a-z][a-z0-9_]*$/)
      .optional(),
    POSTGRES_MIGRATION_PASSWORD: z
      .string()
      .min(16)
      .refine((v) => !v.includes('replace_'))
      .optional(),
    DATABASE_TLS: flag,
    DATABASE_CA_FILE: z.string().default(''),
    DATABASE_POOL_MAX: positive.max(50),
    DATABASE_CONNECTION_TIMEOUT_MS: positive,
    DATABASE_QUERY_TIMEOUT_MS: positive,
  })
  .superRefine((v, ctx) => {
    const fail = (key: string, message: string) =>
      ctx.addIssue({ code: 'custom', path: [key], message });
    for (const origin of v.CORS_ORIGINS.split(',')) {
      try {
        const u = new URL(origin.trim());
        if (
          !['http:', 'https:'].includes(u.protocol) ||
          u.origin !== origin.trim()
        )
          fail('CORS_ORIGINS', 'Use exact HTTP origins');
      } catch {
        fail('CORS_ORIGINS', 'Invalid origin');
      }
    }
    if (v.COOKIE_SAME_SITE === 'none' && !v.COOKIE_SECURE)
      fail('COOKIE_SECURE', 'SameSite none requires secure cookies');
    if (v.NODE_ENV === 'production') {
      if (!v.REDIS_TLS)
        fail('REDIS_TLS', 'Production requires verified Redis TLS');
      if (!v.COOKIE_SECURE)
        fail('COOKIE_SECURE', 'Production requires secure cookies');
      if (!v.DATABASE_TLS)
        fail('DATABASE_TLS', 'Production requires verified database TLS');
      if (v.SWAGGER_ENABLED)
        fail('SWAGGER_ENABLED', 'Production public Swagger must be disabled');
      if (
        !v.APP_URL.startsWith('https:') ||
        v.CORS_ORIGINS.split(',').some((o) => !o.trim().startsWith('https:'))
      )
        fail('APP_URL', 'Production requires HTTPS');
      if (v.POSTGRES_USER === v.POSTGRES_MIGRATION_USER)
        fail('POSTGRES_USER', 'Use separate runtime and migration roles');
    }
    for (const cidr of v.TRUST_PROXY_CIDRS.split(',').filter(Boolean))
      if (!/^[0-9a-fA-F:.]+\/\d+$/.test(cidr) || cidr.endsWith('/0'))
        fail('TRUST_PROXY_CIDRS', 'Use explicit trusted proxy CIDRs');
  });

type Settings = z.infer<typeof schema>;

type DatabaseSettings = Pick<
  Settings,
  | 'POSTGRES_HOST'
  | 'POSTGRES_PORT'
  | 'POSTGRES_DB'
  | 'POSTGRES_USER'
  | 'POSTGRES_PASSWORD'
  | 'POSTGRES_MIGRATION_USER'
  | 'POSTGRES_MIGRATION_PASSWORD'
  | 'DATABASE_TLS'
  | 'DATABASE_CA_FILE'
>;

const validate = (input: Record<string, unknown>): Settings => {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new Error(
      'Invalid configuration: ' +
        result.error.issues
          .map((i) => i.path.join('.') + ': ' + i.message)
          .join('; '),
    );
  return result.data;
};

export { validate };

export type { DatabaseSettings, Settings };

export default validate;
