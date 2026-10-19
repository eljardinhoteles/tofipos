#!/usr/bin/env bash
# Uso (una vez por cada cuenta de Cloudbeds / organización del POS):
#   ORG_ID=<organization_id> CLOUDBEDS_API_KEY=... WEBHOOK_SECRET=... WORKER_URL=https://pos-cloudbeds.xxx.workers.dev ./scripts/register-webhooks.sh
# Usa la apiKey y el webhookSecret de ESA organización (los mismos que en CLOUDBEDS_ORGS). Los avisos llegan a
# /api/webhooks/cloudbeds/<ORG_ID>. Sin ORG_ID se registra la URL antigua (la de la organización «legado»).
# Cloudbeds enviará "X-Webhook-Secret: $WEBHOOK_SECRET" en cada entrega (postWebhook: authHeaderName/authHeaderValue).
set -euo pipefail
: "${CLOUDBEDS_API_KEY:?}" "${WEBHOOK_SECRET:?}" "${WORKER_URL:?}"
ENDPOINT="$WORKER_URL/api/webhooks/cloudbeds${ORG_ID:+/$ORG_ID}"
echo "Avisos hacia: $ENDPOINT"

events=(
  "reservation:created" "reservation:status_changed" "reservation:dates_changed"
  "reservation:deleted" "reservation:accommodation_type_changed"
  "roomblock:created" "roomblock:removed" "roomblock:details_changed"
  "availability:closeout_changed"
)

for ev in "${events[@]}"; do
  object="${ev%%:*}"; action="${ev##*:}"
  echo "→ $object/$action"
  curl -sS -X POST "https://api.cloudbeds.com/api/v1.3/postWebhook" \
    -H "x-api-key: $CLOUDBEDS_API_KEY" \
    --data-urlencode "object=$object" \
    --data-urlencode "action=$action" \
    --data-urlencode "endpointUrl=$ENDPOINT" \
    --data-urlencode "authHeaderName=X-Webhook-Secret" \
    --data-urlencode "authHeaderValue=$WEBHOOK_SECRET"
  echo
done
