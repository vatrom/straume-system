#!/bin/sh
set -eu
cd /app
pnpm --filter @straume/db migrate
pnpm --filter @straume/db seed
exec pnpm --filter @straume/web start
