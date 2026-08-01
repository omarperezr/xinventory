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

for bin in supabase vercel jq openssl; do
  command -v "$bin" >/dev/null || { echo "falta $bin en PATH"; exit 1; }
done

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

DB_PASSWORD=$(openssl rand -base64 24 | tr '+/' '-_')
echo "Creando proyecto Supabase «${CLIENT}»..."
supabase projects create "$CLIENT" --org-id "$ORG_ID" --db-password "$DB_PASSWORD" --region "$REGION" >/dev/null

REF=$(supabase projects list -o json | jq -r --arg n "$CLIENT" '.[] | select(.name==$n) | .id' | head -1)
[ -z "$REF" ] && { echo "no se pudo obtener el project ref"; exit 1; }
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

if [ -d supabase/migrations ] && [ -n "$(ls -A supabase/migrations 2>/dev/null)" ]; then
  echo "Aplicando migraciones..."
  supabase db push --db-url "postgresql://postgres:$DB_PASSWORD@db.$REF.supabase.co:5432/postgres"
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

# ── Vercel ──────────────────────────────────────────────────────────────────
PROJECT="xinventory-$CLIENT"
CRON_SECRET=$(openssl rand -hex 32)
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

# Per-client snapshot with every secret of this instance. Contains the
# service role key, the DB password and the account tokens — gitignored
# (.env.*) and readable only by you.
ENVFILE=".env.$CLIENT"
cat > "$ENVFILE" <<EOF
VITE_SUPABASE_URL=$SUPABASE_URL
VITE_SUPABASE_ANON_KEY=$ANON_KEY
POSTGRESQL_DIRECT=postgresql://postgres:$DB_PASSWORD@db.$REF.supabase.co:5432/postgres
SUPABASE_SERVICE_ROLE_KEY=$SERVICE_KEY
CRON_SECRET=$CRON_SECRET
SUPABASE_NEW_CLIENT=$SUPABASE_ACCESS_TOKEN
VERCEL_NEW_CLIENT=$VERCEL_TOKEN
VITE_MODULE_FINANZAS=$FINANZAS
VITE_MODULE_REPORTES=$REPORTES
VITE_MODULE_REDES=$REDES
MODULE_REDES=$REDES
ADMIN_EMAIL=$ADMIN_EMAIL
ADMIN_PASSWORD=$ADMIN_PASSWORD
EOF
chmod 600 "$ENVFILE"

echo
echo "── Listo ──────────────────────────────────────────"
echo "App:        $URL"
echo "Supabase:   $SUPABASE_URL  (ref $REF)"
echo "Credenciales completas en $ENVFILE (incluye DB pass y tokens; no lo subas a git)"
echo "Módulos:    finanzas=$FINANZAS reportes=$REPORTES redes=$REDES"
echo "Admin:      $ADMIN_EMAIL  (contraseña en $ENVFILE)"
