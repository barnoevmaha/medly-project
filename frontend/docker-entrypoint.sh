#!/bin/sh
# Writes the API URL into the served bundle at container start.
#
# Vite inlines import.meta.env at build time, which would tie each image to one
# backend URL. Emitting a tiny config file instead means one image works in
# every environment — set MEDLY_API_URL and restart.
set -e

cat > /usr/share/nginx/html/config.js <<EOF
window.__MEDLY_API_URL__ = "${MEDLY_API_URL}";
EOF

echo "medly: API URL set to '${MEDLY_API_URL:-(same origin fallback)}'"
