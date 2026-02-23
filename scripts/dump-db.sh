#!/usr/bin/env bash
# Dump database to a SQL file (for backup before migrations).
# Uses DATABASE_URL from .env (loaded by Prisma when present in project root).
#
# If you see "server version mismatch": your local pg_dump is older than the DB.
# Options: (1) Use your provider's backup (e.g. Neon dashboard), (2) Run this from
# a container with matching Postgres client: docker run --rm -v $(pwd):/out -e DATABASE_URL
# postgres:17 pg_dump "$DATABASE_URL" --no-owner --no-acl -F p -f /out/prisma/backups/backup.sql
set -e
cd "$(dirname "$0")/.."
if [ -z "$DATABASE_URL" ]; then
  if [ -f .env ]; then
    set -a
    source .env
    set +a
  fi
fi
if [ -z "$DATABASE_URL" ]; then
  echo "ERROR: DATABASE_URL not set. Add it to .env or export it." >&2
  exit 1
fi
BACKUP_DIR="prisma/backups"
mkdir -p "$BACKUP_DIR"
STAMP=$(date +%Y%m%d_%H%M%S)
OUTPUT="$BACKUP_DIR/pre_migration_$STAMP.sql"
echo "Dumping database to $OUTPUT ..."
if ! pg_dump "$DATABASE_URL" --no-owner --no-acl -F p -f "$OUTPUT" 2>&1; then
  echo "Local pg_dump failed (often version mismatch). Trying with Docker postgres:17 ..."
  if command -v docker >/dev/null 2>&1; then
    if docker run --rm -v "$(pwd)/$BACKUP_DIR:/out" -e DATABASE_URL="$DATABASE_URL" postgres:17 sh -c 'pg_dump "$DATABASE_URL" --no-owner --no-acl -F p -f /out/dump.sql'; then
      mv "$BACKUP_DIR/dump.sql" "$OUTPUT"
      echo "Done (via Docker). Backup written to $OUTPUT"
      exit 0
    fi
  fi
  echo "" >&2
  echo "Dump failed. Options: (1) Use your DB provider's backup (e.g. Neon dashboard)," >&2
  echo "  (2) Install PostgreSQL 17 client, (3) Run with Docker: docker run --rm -v \$(pwd)/$BACKUP_DIR:/out -e DATABASE_URL=\"\$DATABASE_URL\" postgres:17 sh -c 'pg_dump \"\$DATABASE_URL\" --no-owner --no-acl -F p -f /out/backup.sql'" >&2
  exit 1
fi
echo "Done. Backup written to $OUTPUT"
