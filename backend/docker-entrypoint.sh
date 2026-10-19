#!/bin/sh
# Railway (and some other hosts) mount the volume over /app/data owned by root,
# hiding the directory the image prepared for the medly user — SQLite then
# fails with "unable to open database file". Fix the ownership while still
# root, then drop to the unprivileged user before the server starts, so the
# app itself never runs as root.
set -e

if [ "$(id -u)" = "0" ]; then
  mkdir -p /app/data
  chown -R medly:medly /app/data
  exec setpriv --reuid=medly --regid=medly --init-groups "$@"
fi

exec "$@"
