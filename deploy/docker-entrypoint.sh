#!/bin/sh
set -e

PORT="${PORT:-3000}"

echo "→ applying database migrations"
node ./node_modules/prisma/build/index.js migrate deploy

echo "→ starting Rehearsal Room on 0.0.0.0:${PORT}"
exec node ./node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port "${PORT}"
