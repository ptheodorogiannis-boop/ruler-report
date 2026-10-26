#!/bin/sh
set -e
# create / migrate the schema, optionally load demo data, then start
npx prisma db push --skip-generate --accept-data-loss
if [ "$SEED_DEMO" = "1" ]; then npx tsx prisma/seed.ts || true; fi
exec npx next start -p "${PORT:-3100}"
