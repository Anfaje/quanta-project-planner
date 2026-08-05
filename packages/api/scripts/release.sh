#!/bin/sh
# Release-time schema migration (runs in Fly's release machine before the new
# image goes live; a non-zero exit aborts the deploy).
#
# Normal path: `prisma migrate deploy` applies any pending migrations.
#
# One-time baseline: a database created via `prisma db push` (the
# pre-migrations alpha) has all the tables but no _prisma_migrations history,
# which makes `migrate deploy` fail with P3005 ("database schema is not
# empty"). Since the init migration is generated from the very schema that
# db push applied, the schemas are identical — so we mark init as already
# applied and retry. Fresh/empty databases never hit this branch.
set -u

OUT=$(npx prisma migrate deploy 2>&1)
CODE=$?
echo "$OUT"

if [ "$CODE" -ne 0 ]; then
  if echo "$OUT" | grep -q "P3005"; then
    echo "--- Pre-migrations database detected; baselining init migration ---"
    npx prisma migrate resolve --applied 20260805000000_init || exit 1
    npx prisma migrate deploy || exit 1
  else
    exit "$CODE"
  fi
fi

# Idempotent data backfill retained from the pre-migrations release command.
exec npx prisma db execute --schema prisma/schema.prisma --file prisma/backfill_business_unit.sql
