#!/bin/sh
# Runs only when the corresponding empty development/test volume is initialized.
# These are database infrastructure accounts, not application business roles.
set -eu
: "${CAAU_APP_PASSWORD:?App password must be injected by the root entrypoint wrapper}"
psql --set=ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<'SQL'
\getenv app_user CAAU_APP_USER
\getenv app_password CAAU_APP_PASSWORD
\getenv owner POSTGRES_USER
\getenv database POSTGRES_DB
\getenv shadow CAAU_SHADOW_DB
SELECT format('CREATE ROLE %I LOGIN PASSWORD %L NOSUPERUSER NOCREATEDB NOCREATEROLE', :'app_user', :'app_password') \gexec
SELECT format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', :'database') \gexec
SELECT format('GRANT CONNECT ON DATABASE %I TO %I', :'database', :'app_user') \gexec
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
SELECT format('GRANT USAGE ON SCHEMA public TO %I', :'app_user') \gexec
-- No default table grants: do not let the runtime account edit migration metadata.
-- Future business table DML grants require an explicit, reviewed migration policy.
SELECT format('CREATE DATABASE %I OWNER %I', :'shadow', :'owner') \gexec
SELECT format('REVOKE CONNECT ON DATABASE %I FROM PUBLIC', :'shadow') \gexec
SQL
unset CAAU_APP_PASSWORD
