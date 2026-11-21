#!/bin/sh
# Hosting platforms (Railway included) mount volumes owned by root. Make the data
# folders writable for the unprivileged "node" user, then drop root and start the app.
set -e

if [ "$(id -u)" = "0" ]; then
  for dir in "$(dirname "${DATABASE_PATH:-/data/app.db}")" "${BACKUP_DIR:-}"; do
    [ -n "$dir" ] || continue
    mkdir -p "$dir"
    chown -R node:node "$dir"
  done
  exec setpriv --reuid=node --regid=node --init-groups "$@"
fi

exec "$@"
