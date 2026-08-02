#!/usr/bin/env bash
# Provision a new client instance: Supabase project + Vercel project + deploy.
#
#   ./scripts/new-client.sh <client-name> [--finanzas] [--reportes] [--redes] \
#       [--region us-east-1] [--supabase-token sbp_...] [--vercel-token ...] \
#       [--admin-email a@b.c] [--admin-name "Nombre"] [--admin-password ...]
#
# Creates the first admin user (Auth + profiles row). Email prompted if not
# given; password generated if not given. Both land in .env.<client-name>.
#
# Tokens, in order of precedence:
#   1. --supabase-token / --vercel-token arguments
#   2. SUPABASE_NEW_CLIENT / VERCEL_NEW_CLIENT exported in the environment
#   3. the same variables in .env.local or .env (both gitignored)
#   4. interactive prompt (hidden input)
# Requires: supabase CLI, vercel CLI, jq, openssl.
set -euo pipefail

CLIENT="${1:-}"
if [ -z "$CLIENT" ]; then
  echo "uso: $0 <client-name> [--finanzas] [--reportes] [--redes] [--region <id>] [--supabase-token <t>] [--vercel-token <t>]"
  exit 1
fi
shift
# Vercel project names must be lowercase; keep every derived name consistent.
CLIENT=$(printf '%s' "$CLIENT" | tr '[:upper:]' '[:lower:]')

FINANZAS=false; REPORTES=false; REDES=false; REGION="us-east-1"
SUPABASE_TOKEN_ARG=""; VERCEL_TOKEN_ARG=""
ADMIN_EMAIL=""; ADMIN_NAME="Admin"; ADMIN_PASSWORD=""
while [ $# -gt 0 ]; do
  case "$1" in
    --finanzas) FINANZAS=true ;;
    --reportes) REPORTES=true ;;
    --redes)    REDES=true ;;
    --region)   REGION="$2"; shift ;;
    --supabase-token) SUPABASE_TOKEN_ARG="$2"; shift ;;
    --vercel-token)   VERCEL_TOKEN_ARG="$2"; shift ;;
    --admin-email)    ADMIN_EMAIL="$2"; shift ;;
    --admin-name)     ADMIN_NAME="$2"; shift ;;
    --admin-password) ADMIN_PASSWORD="$2"; shift ;;
    *) echo "flag desconocido: $1"; exit 1 ;;
  esac
  shift
done

for bin in supabase vercel jq openssl curl; do
  command -v "$bin" >/dev/null || { echo "falta $bin en PATH"; exit 1; }
done

# An env file from an earlier attempt holds the only copy of that project's DB
# password; a re-run must never truncate it.
ENVFILE=".env.$CLIENT"
[ -e "$ENVFILE" ] && { echo "ya existe $ENVFILE de un intento anterior: guárdalo o muévelo antes de reintentar (contiene la única copia de esa contraseña)"; exit 1; }

# Reads one VAR=value line from the env files; tolerant of a missing match.
readenv() {
  local f v
  for f in .env.local .env; do
    if [ -f "$f" ]; then
      v=$(grep -m1 "^$1=" "$f" | cut -d= -f2-) || true
      if [ -n "$v" ]; then printf '%s' "$v"; return; fi
    fi
  done
}

SUPABASE_ACCESS_TOKEN="${SUPABASE_TOKEN_ARG:-${SUPABASE_NEW_CLIENT:-$(readenv SUPABASE_NEW_CLIENT)}}"
VERCEL_TOKEN="${VERCEL_TOKEN_ARG:-${VERCEL_NEW_CLIENT:-$(readenv VERCEL_NEW_CLIENT)}}"

echo "Cliente: $CLIENT  (finanzas=$FINANZAS reportes=$REPORTES redes=$REDES region=$REGION)"
if [ -z "$SUPABASE_ACCESS_TOKEN" ]; then
  read -r -s -p "Supabase access token (sbp_...): " SUPABASE_ACCESS_TOKEN; echo
fi
if [ -z "$VERCEL_TOKEN" ]; then
  read -r -s -p "Vercel token: " VERCEL_TOKEN; echo
fi
export SUPABASE_ACCESS_TOKEN

# ── Supabase ────────────────────────────────────────────────────────────────
ORGS_JSON=$(supabase orgs list -o json)
ORG_COUNT=$(jq 'length' <<<"$ORGS_JSON")
if [ "$ORG_COUNT" -eq 1 ]; then
  ORG_ID=$(jq -r '.[0].id' <<<"$ORGS_JSON")
else
  jq -r '.[] | "\(.id)  \(.name)"' <<<"$ORGS_JSON"
  read -r -p "org id a usar: " ORG_ID
fi

# Supabase does not enforce unique project names, so a second run would create
# a second «$CLIENT» and any lookup by name could then point migrations, keys
# and the admin user at the orphan from the failed attempt.
DUPES=$(supabase projects list -o json | jq -r --arg n "$CLIENT" '[.[] | select(.name==$n) | .id] | join(" ")')
[ -n "$DUPES" ] && { echo "ya existe un proyecto Supabase «${CLIENT}» (ref: $DUPES): bórralo o usa otro nombre antes de reintentar"; exit 1; }

DB_PASSWORD=$(openssl rand -base64 24 | tr '+/' '-_')
echo "Creando proyecto Supabase «${CLIENT}»..."
CREATE_JSON=$(supabase projects create "$CLIENT" --org-id "$ORG_ID" --db-password "$DB_PASSWORD" --region "$REGION" -o json)

# The password exists nowhere else and everything below can fail (the wait
# loop, the keys call): persist it before any of it, not after.
umask 077
cat > "$ENVFILE" <<EOF
SUPABASE_DB_PASSWORD=$DB_PASSWORD
EOF
chmod 600 "$ENVFILE"

# The ref comes from the create response; falling back to a name lookup only
# when the CLI printed nothing usable, and only if it matches exactly once.
REF=$(jq -r '.id // empty' <<<"$CREATE_JSON" 2>/dev/null || true)
[ -z "$REF" ] && REF=$(supabase projects list -o json | jq -r --arg n "$CLIENT" '[.[] | select(.name==$n) | .id] | if length == 1 then .[0] else empty end')
[ -z "$REF" ] && { echo "no se pudo obtener el project ref; búscalo en el dashboard (la contraseña está en $ENVFILE)"; exit 1; }
echo "SUPABASE_PROJECT_REF=$REF" >> "$ENVFILE"
echo "Project ref: $REF — esperando a que esté listo..."
for _ in $(seq 1 30); do
  STATUS=$(supabase projects list -o json | jq -r --arg r "$REF" '.[] | select(.id==$r) | .status')
  [ "$STATUS" = "ACTIVE_HEALTHY" ] && break
  sleep 10
done

KEYS_JSON=$(supabase projects api-keys --project-ref "$REF" -o json)
ANON_KEY=$(jq -r '.[] | select(.name=="anon") | .api_key' <<<"$KEYS_JSON")
SERVICE_KEY=$(jq -r '.[] | select(.name=="service_role") | .api_key' <<<"$KEYS_JSON")
SUPABASE_URL="https://$REF.supabase.co"

# db.$REF.supabase.co is IPv6-only unless the project pays for the IPv4 add-on,
# so from an IPv4-only ISP — most home and office ones — every migration failed
# to connect. Supavisor's session pooler (port 5432) speaks the same protocol
# over IPv4; its host prefix varies per project, so ask the API for it.
POOLER_HOST=$(curl -s "https://api.supabase.com/v1/projects/$REF/config/database/pooler" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  | jq -r 'if type=="array" then .[0] else . end | .db_host // empty' 2>/dev/null) || true
# ponytail: región → prefijo aws-0 como respaldo; si el proyecto vive en otro,
# el push falla con "no such host" y toca copiar el host del dashboard.
DB_URL="postgresql://postgres.$REF:$DB_PASSWORD@${POOLER_HOST:-aws-0-$REGION.pooler.supabase.com}:5432/postgres"

# Secrets first, deploy second: everything below can fail, and the DB password
# exists nowhere else. Losing it means the project is unreachable.
cat >> "$ENVFILE" <<EOF
VITE_SUPABASE_URL=$SUPABASE_URL
VITE_SUPABASE_ANON_KEY=$ANON_KEY
# Session pooler: la conexión directa db.<ref> exige el add-on IPv4.
POSTGRESQL_DIRECT=$DB_URL
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_KEY
SUPABASE_NEW_CLIENT=$SUPABASE_ACCESS_TOKEN
VERCEL_NEW_CLIENT=$VERCEL_TOKEN
VITE_MODULE_FINANZAS=$FINANZAS
VITE_MODULE_REPORTES=$REPORTES
VITE_MODULE_REDES=$REDES
MODULE_REDES=$REDES
EOF
chmod 600 "$ENVFILE"
echo "Credenciales guardadas en $ENVFILE"

# Public signup would let anyone with the anon key create their own account on
# this client's instance. The app creates users through the admin-users edge
# function, so signup is never needed.
curl -s -X PATCH "https://api.supabase.com/v1/projects/$REF/config/auth" \
  -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"disable_signup":true}' >/dev/null \
  || echo "AVISO: no se pudo desactivar el registro público; hazlo en Authentication > Providers."

if [ -d supabase/migrations ] && [ -n "$(ls -A supabase/migrations 2>/dev/null)" ]; then
  echo "Aplicando migraciones..."
  # A client only gets the schema for the modules they bought: an unpurchased
  # module whose tables exist is reachable straight through PostgREST with the
  # anon key, so build-time gating alone would not withhold it.
  HELD_DIR=$(mktemp -d)
  restore_migrations() {
    if [ -d "$HELD_DIR" ]; then
      find "$HELD_DIR" -name '*.sql' -exec mv {} supabase/migrations/ \; 2>/dev/null || true
      rmdir "$HELD_DIR" 2>/dev/null || true
    fi
  }
  trap restore_migrations EXIT
  [ "$FINANZAS" = true ] || find supabase/migrations -name '*_finanzas.sql' -exec mv {} "$HELD_DIR"/ \;
  [ "$REDES" = true ]    || find supabase/migrations -name '*_redes.sql'    -exec mv {} "$HELD_DIR"/ \;

  supabase db push --db-url "$DB_URL"

  restore_migrations
  trap - EXIT
else
  echo "AVISO: no hay supabase/migrations — aplica el esquema a mano (supabase db pull en el proyecto base primero)."
fi

echo "Desplegando edge function admin-users..."
supabase functions deploy admin-users --project-ref "$REF" \
  || echo "AVISO: fallo el deploy de admin-users; repítelo con: supabase functions deploy admin-users --project-ref $REF"

# ── Primer usuario admin ────────────────────────────────────────────────────
if [ -z "$ADMIN_EMAIL" ]; then
  read -r -p "email del admin inicial: " ADMIN_EMAIL
fi
if [ -z "$ADMIN_PASSWORD" ]; then
  ADMIN_PASSWORD=$(openssl rand -base64 18 | tr '+/' '-_')
fi
echo "Creando usuario admin ${ADMIN_EMAIL}..."
CREATE_RES=$(curl -s -X POST "$SUPABASE_URL/auth/v1/admin/users" \
  -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"email\":\"$ADMIN_EMAIL\",\"password\":\"$ADMIN_PASSWORD\",\"email_confirm\":true,\"user_metadata\":{\"name\":\"$ADMIN_NAME\",\"role\":\"admin\"}}")
ADMIN_ID=$(jq -r '.id // .user.id // empty' <<<"$CREATE_RES")
if [ -z "$ADMIN_ID" ]; then
  echo "AVISO: no se pudo crear el admin: $(jq -r '.msg // .message // .error_description // .' <<<"$CREATE_RES")"
else
  # Upsert the profiles row (a schema trigger may have inserted it already).
  # PostgREST answers with an empty body on success, JSON on error.
  PROFILE_RES=$(curl -s -X POST "$SUPABASE_URL/rest/v1/profiles" \
    -H "apikey: $SERVICE_KEY" -H "Authorization: Bearer $SERVICE_KEY" \
    -H "Content-Type: application/json" \
    -H "Prefer: resolution=merge-duplicates" \
    -d "{\"id\":\"$ADMIN_ID\",\"name\":\"$ADMIN_NAME\",\"email\":\"$ADMIN_EMAIL\",\"role\":\"admin\",\"can_edit_price\":true}")
  if [ -n "$PROFILE_RES" ]; then
    echo "AVISO: fila en profiles no confirmada (¿esquema sin aplicar?): $PROFILE_RES"
    echo "       El usuario de Auth existe; repite el insert en profiles al aplicar el esquema."
  fi
fi
# Persist the generated password now - it is not recoverable from anywhere.
cat >> "$ENVFILE" <<EOF
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD=$ADMIN_PASSWORD
EOF

# ── Vercel ──────────────────────────────────────────────────────────────────
PROJECT="xinventory-$CLIENT"
CRON_SECRET=$(openssl rand -hex 32)
echo "CRON_SECRET=$CRON_SECRET" >> "$ENVFILE"
echo "Creando proyecto Vercel «${PROJECT}»..."
vercel project add "$PROJECT" --token "$VERCEL_TOKEN" >/dev/null
# Relinks this checkout to the client's project (.vercel/ is per-run, gitignored).
rm -rf .vercel
vercel link --yes --project "$PROJECT" --token "$VERCEL_TOKEN" >/dev/null

setenv() { printf '%s' "$2" | vercel env add "$1" production --token "$VERCEL_TOKEN" >/dev/null; }
setenv VITE_SUPABASE_URL "$SUPABASE_URL"
setenv VITE_SUPABASE_ANON_KEY "$ANON_KEY"
setenv SUPABASE_SERVICE_ROLE_KEY "$SERVICE_KEY"
setenv CRON_SECRET "$CRON_SECRET"
setenv VITE_MODULE_FINANZAS "$FINANZAS"
setenv VITE_MODULE_REPORTES "$REPORTES"
setenv VITE_MODULE_REDES "$REDES"
setenv MODULE_REDES "$REDES"

echo "Desplegando..."
URL=$(vercel deploy --prod --yes --token "$VERCEL_TOKEN")

echo
echo "── Listo ──────────────────────────────────────────"
echo "App:        $URL"
echo "Supabase:   $SUPABASE_URL  (ref $REF)"
echo "Credenciales completas en $ENVFILE (incluye DB pass y tokens; no lo subas a git)"
echo "Módulos:    finanzas=$FINANZAS reportes=$REPORTES redes=$REDES"
echo "Admin:      $ADMIN_EMAIL  (contraseña en $ENVFILE)"
