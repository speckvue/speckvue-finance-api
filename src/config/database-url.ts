import type { DatabaseSettings } from './validation';

const databaseUrl = (s: DatabaseSettings, migration = false): string => {
  const url = new URL('postgresql://localhost');
  url.hostname = s.POSTGRES_HOST;
  url.port = String(s.POSTGRES_PORT);
  url.pathname = '/' + s.POSTGRES_DB;
  if (
    migration &&
    (!s.POSTGRES_MIGRATION_USER || !s.POSTGRES_MIGRATION_PASSWORD)
  )
    throw new Error('Migration role credentials required');
  url.username = encodeURIComponent(
    migration ? s.POSTGRES_MIGRATION_USER! : s.POSTGRES_USER,
  );
  url.password = encodeURIComponent(
    migration ? s.POSTGRES_MIGRATION_PASSWORD! : s.POSTGRES_PASSWORD,
  );
  if (migration && s.DATABASE_TLS) {
    url.searchParams.set('sslmode', 'verify-full');
    if (s.DATABASE_CA_FILE)
      url.searchParams.set('sslrootcert', s.DATABASE_CA_FILE);
  }
  return url.toString();
};

export default databaseUrl;
