import { readFileSync } from 'node:fs';
import type { Settings } from './validation';

const databaseSsl = (s: Pick<Settings, 'DATABASE_TLS' | 'DATABASE_CA_FILE'>) =>
  s.DATABASE_TLS
    ? {
        rejectUnauthorized: true,
        ...(s.DATABASE_CA_FILE
          ? { ca: readFileSync(s.DATABASE_CA_FILE, 'utf8') }
          : {}),
      }
    : false;

export default databaseSsl;
