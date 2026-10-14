import 'dotenv/config';
import { defineConfig } from 'prisma/config';
import databaseUrl from './src/config/database-url';
import validate from './src/config/validation';

const config = defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: databaseUrl(validate(process.env), true) },
});

export default config;
