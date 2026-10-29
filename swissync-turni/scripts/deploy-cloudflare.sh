#!/usr/bin/env bash
# Publishes Swissync Turni on Cloudflare (same account as the Swissync platform):
#   web app + API (Worker "swissync-turni"), accounts database (D1 "swissync-turni", EU),
#   custom domain turni.swissync.org.
# Safe to run again: it only creates what is missing.
#
# Optional environment (values are never printed):
#   XAI_API_KEY             xAI key for the analyses paid by the service
#   RESEND_API_KEY          Resend key to e-mail sign-up and password codes (domain swissync.org)
#   APPLE_SIGNIN_KEY_FILE   AuthKey_XXXXXXXXXX.p8 of a "Sign in with Apple" key (token revocation)
set -euo pipefail
cd "$(dirname "$0")/.."

WRANGLER=(npx --yes wrangler@4.150.0)
say() { printf '\n\033[1m▸ %s\033[0m\n' "$*"; }

say "Cloudflare account"
"${WRANGLER[@]}" whoami | grep -iE "logged in|account" | head -3 || { echo "Not logged in: run 'npx wrangler login' first."; exit 1; }

say "Database D1 swissync-turni (EU)"
find_db() { "${WRANGLER[@]}" d1 list --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const l=JSON.parse(s);const d=l.find(x=>x.name==="swissync-turni");process.stdout.write(d?d.uuid:"")}catch{}})'; }
DB_ID="$(find_db)"
if [ -z "$DB_ID" ]; then
  "${WRANGLER[@]}" d1 create swissync-turni --jurisdiction eu >/dev/null
  DB_ID="$(find_db)"
fi
[ -n "$DB_ID" ] || { echo "Could not create or find the D1 database."; exit 1; }
node -e 'const fs=require("fs");const f="wrangler.toml";fs.writeFileSync(f,fs.readFileSync(f,"utf8").replace(/database_id = "[^"]*"/,`database_id = "${process.argv[1]}"`))' "$DB_ID"
echo "database_id = $DB_ID"

say "Database schema"
"${WRANGLER[@]}" d1 migrations apply swissync-turni --remote

say "Build"
npm ci --no-audit --no-fund >/dev/null
npm run build >/dev/null
echo "dist/ ready"

say "Deploy"
"${WRANGLER[@]}" deploy

say "Secrets"
SECRETS="$("${WRANGLER[@]}" secret list --format json 2>/dev/null || echo '[]')"
has() { printf '%s' "$SECRETS" | grep -q "\"$1\""; }
put() { printf '%s' "$2" | "${WRANGLER[@]}" secret put "$1" >/dev/null && echo "$1 set"; }
has TOKEN_SECRET || put TOKEN_SECRET "$(openssl rand -base64 48 | tr -d '\n')"
[ -n "${XAI_API_KEY:-}" ] && put XAI_API_KEY "$XAI_API_KEY"
[ -n "${RESEND_API_KEY:-}" ] && put RESEND_API_KEY "$RESEND_API_KEY"
if [ -n "${APPLE_SIGNIN_KEY_FILE:-}" ] && [ -f "$APPLE_SIGNIN_KEY_FILE" ]; then
  put APPLE_KEY_ID "$(basename "$APPLE_SIGNIN_KEY_FILE" .p8 | sed 's/^AuthKey_//')"
  put APPLE_PRIVATE_KEY "$(cat "$APPLE_SIGNIN_KEY_FILE")"
fi

say "Check"
for url in "https://turni.swissync.org/api/auth/config" "https://turni.swissync.org/api/ai"; do
  printf '%s → ' "$url"; curl -s --max-time 20 "$url" || echo "(not reachable yet: the custom domain can take a few minutes)"; echo
done
