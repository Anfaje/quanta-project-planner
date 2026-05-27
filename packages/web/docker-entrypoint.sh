#!/bin/sh
# Quanta web container entrypoint.
#
# Substitute ${API_INTERNAL_URL} (and any future ${...} vars) in the
# templated nginx config, write it into /etc/nginx/conf.d/, then exec
# whatever CMD was passed (`nginx -g 'daemon off;'` by default).
#
# Why a templated config rather than a static one: we want the same
# image to deploy unchanged across local-compose, staging, and prod,
# with only the upstream URL changing.

set -eu

: "${API_INTERNAL_URL:=http://quanta-api.internal:4000}"

# Render the template. envsubst only replaces variables we explicitly
# list, so accidental ${...} sequences elsewhere (in the future) won't
# disappear silently.
envsubst '${API_INTERNAL_URL}' \
    < /etc/nginx/templates/quanta.conf.template \
    > /etc/nginx/conf.d/quanta.conf

# Sanity-print at boot so deploy logs show which upstream is wired up.
echo "[entrypoint] nginx upstream: ${API_INTERNAL_URL}"

exec "$@"
