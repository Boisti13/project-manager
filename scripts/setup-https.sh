#!/usr/bin/env bash
# HTTPS with a local certificate authority (see DEPLOYMENT.md -> HTTPS).
#
#   scripts/setup-https.sh
#
# Creates, once, a small CA (ca.key / ca.crt, 10 years) and issues a server
# certificate signed by it for this machine's IP addresses and names. Import
# ca.crt on your devices once (it's served at http://<server>/ca.crt) and
# the browser trusts the site. Safe to run again: the server certificate is
# only re-issued when it's missing, expires within 30 days, or the names/IPs
# changed; the CA stays, so devices never need to import it again.
#
# Run by install.sh and scripts/update.sh when HTTPS is turned on
# (/etc/project-manager/https exists; off by default).
#
#   PM_TLS_DIR    where the files live         (/etc/project-manager/tls)
#   PM_TLS_NAMES  extra DNS names, space-separated (e.g. "pm.lan pm.example.com");
#                 remembered in $PM_TLS_DIR/names for later runs ("" clears them)
#   PM_TLS_IPS    IP addresses                 (all of `hostname -I`, plus 127.0.0.1)
set -euo pipefail
# Git Bash would turn "/CN=..." into a Windows path.
export MSYS_NO_PATHCONV=1

TLS_DIR="${PM_TLS_DIR:-/etc/project-manager/tls}"
SERVER_DAYS=800   # below Apple's 825-day limit for certificates from private CAs
RENEW_BEFORE_DAYS=30

command -v openssl >/dev/null || { echo "setup-https: openssl not found (apt install openssl)" >&2; exit 1; }

mkdir -p "$TLS_DIR"
# Extra names persist, so updates (which run this without PM_TLS_NAMES) keep them.
if [[ -n "${PM_TLS_NAMES+set}" ]]; then
  printf '%s\n' "$PM_TLS_NAMES" > "$TLS_DIR/names"
fi
EXTRA_NAMES="$(cat "$TLS_DIR/names" 2>/dev/null || true)"

HOST="$(hostname -s 2>/dev/null || hostname)"
FQDN="$(hostname -f 2>/dev/null || true)"
IPS="${PM_TLS_IPS:-$(hostname -I 2>/dev/null || true) 127.0.0.1}"

# Subject alternative names, deduplicated, in a stable order.
declare -A seen=()
SAN=""
add_san() {
  local entry="$1:$2"
  [[ -n "$2" && -z "${seen[$entry]:-}" ]] || return 0
  seen[$entry]=1
  SAN="${SAN:+$SAN,}$entry"
}
# shellcheck disable=SC2086  # EXTRA_NAMES is a space-separated list
for name in localhost "$HOST" "$HOST.local" "$FQDN" $EXTRA_NAMES; do
  [[ "$name" == *.* || "$name" == localhost || "$name" == "$HOST" ]] && add_san DNS "$name"
done
for ip in $IPS; do
  [[ "$ip" =~ ^[0-9.]+$ || "$ip" == *:* ]] && add_san IP "$ip"
done

chmod 755 "$TLS_DIR"   # nginx workers serve ca.crt; the keys themselves are 600
cd "$TLS_DIR"

if [[ ! -s ca.key || ! -s ca.crt ]]; then
  openssl req -x509 -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes \
    -keyout ca.key -out ca.crt -days 3650 \
    -subj "/CN=Project Manager local CA ($HOST)/O=Project Manager" \
    -addext "basicConstraints=critical,CA:TRUE,pathlen:0" \
    -addext "keyUsage=critical,keyCertSign,cRLSign" 2>/dev/null
  chmod 600 ca.key
  chmod 644 ca.crt
  echo "Created local CA: $TLS_DIR/ca.crt"
fi

reason=""
if [[ ! -s server.crt || ! -s server.key ]]; then
  reason="no certificate yet"
elif ! openssl x509 -checkend $((RENEW_BEFORE_DAYS * 86400)) -noout -in server.crt >/dev/null; then
  reason="expires within $RENEW_BEFORE_DAYS days"
elif [[ "$(cat san.txt 2>/dev/null)" != "$SAN" ]]; then
  reason="names/addresses changed"
elif ! openssl verify -CAfile ca.crt server.crt >/dev/null 2>&1; then
  reason="not signed by the current CA"
fi

if [[ -z "$reason" ]]; then
  echo "Server certificate is up to date ($SAN)"
  exit 0
fi

# Relative paths only: we're in $TLS_DIR (and native Windows openssl can't
# read MSYS paths like /tmp when path conversion is off).
ext=server.ext
trap 'rm -f -- "$ext" server.csr server.key.new server.crt.new' EXIT
printf '%s\n' "subjectAltName=$SAN" "basicConstraints=critical,CA:FALSE" \
  "keyUsage=critical,digitalSignature,keyEncipherment" "extendedKeyUsage=serverAuth" > "$ext"
openssl req -new -newkey ec -pkeyopt ec_paramgen_curve:P-256 -nodes \
  -keyout server.key.new -out server.csr -subj "/CN=$HOST" 2>/dev/null
openssl x509 -req -in server.csr -CA ca.crt -CAkey ca.key -CAserial ca.srl -CAcreateserial \
  -out server.crt.new -days "$SERVER_DAYS" -extfile "$ext" 2>/dev/null
chmod 600 server.key.new
chmod 644 server.crt.new
mv server.key.new server.key
mv server.crt.new server.crt
printf '%s' "$SAN" > san.txt
echo "Issued server certificate ($reason): $SAN"
