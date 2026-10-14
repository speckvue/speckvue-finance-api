#!/bin/sh
set -eu
psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set=ON_ERROR_STOP=1 \
 --set=runtime_user="$APP_DATABASE_USER" --set=runtime_password="$APP_DATABASE_PASSWORD" \
 --set=migration_user="$MIGRATION_DATABASE_USER" --set=migration_password="$MIGRATION_DATABASE_PASSWORD" <<'SQL'
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'runtime_user', :'runtime_password') \gexec
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L', :'migration_user', :'migration_password') \gexec
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SELECT format('GRANT CREATE ON DATABASE %I TO %I', current_database(), :'migration_user') \gexec
SELECT format('GRANT USAGE, CREATE ON SCHEMA public TO %I', :'migration_user') \gexec
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'runtime_user') \gexec
SQL
