#!/usr/bin/env bash
# Prints the Nginx site config for this install: deploy/nginx-https.conf when
# HTTPS is on and its certificate exists, else deploy/nginx.conf; with the
# paths of this checkout and the TLS directory filled in.
#
#   scripts/nginx-site.sh > /etc/nginx/sites-available/project-manager
#
# Used by install.sh and scripts/update.sh. HTTPS is on unless
# $PM_CONF_DIR/no-https exists (PM_CONF_DIR defaults to /etc/project-manager).
set -euo pipefail

SRC_DIR="$(cd "$(dirname "$0")/.." && pwd)"   # templates come from this checkout
APP_DIR="${PM_APP_DIR:-$SRC_DIR}"              # paths in the config point here
CONF_DIR="${PM_CONF_DIR:-/etc/project-manager}"
TLS_DIR="${PM_TLS_DIR:-$CONF_DIR/tls}"

if [[ ! -e "$CONF_DIR/no-https" && -s "$TLS_DIR/server.crt" && -s "$TLS_DIR/server.key" ]]; then
  template="$SRC_DIR/deploy/nginx-https.conf"
else
  template="$SRC_DIR/deploy/nginx.conf"
fi
sed -e "s#/opt/project-manager/frontend/build#$APP_DIR/frontend/build#" \
    -e "s#/etc/project-manager/tls#$TLS_DIR#" "$template"
