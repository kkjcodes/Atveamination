#!/bin/sh
echo "[startup] NODE_ENV=$NODE_ENV"
echo "[startup] DATABASE_URL set: $(test -n "$DATABASE_URL" && echo YES || echo NO)"
echo "[startup] Running prisma migrate deploy..."
node node_modules/prisma/build/index.js migrate deploy
MIGRATE_EXIT=$?
echo "[startup] prisma migrate deploy exited: $MIGRATE_EXIT"
if [ $MIGRATE_EXIT -ne 0 ]; then
  echo "[startup] Migration failed — aborting"
  exit 1
fi
echo "[startup] Starting Next.js server..."
node server.js
