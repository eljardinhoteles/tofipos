#!/usr/bin/env bash
# Solo LECTURA (GET): guarda cómo devuelve una cuenta de Cloudbeds sus tipos de habitación, unidades y reservas, para estudiar el
# modelo de inventario (un tipo con varias unidades). La API key se pasa por variable de entorno: NO la pegues en ningún chat.
# Los datos personales del huésped (nombre, correo, teléfono, dirección…) se enmascaran antes de escribir los archivos.
#
# Uso con API key de propiedad:   CLOUDBEDS_API_KEY=... ./scripts/explorar-cuenta.sh [carpeta_de_salida]
# Uso con credenciales OAuth (si Cloudbeds te dio Client ID + Client Secret en vez de una API key):
#   CLOUDBEDS_CLIENT_ID=... CLOUDBEDS_CLIENT_SECRET=... ./scripts/explorar-cuenta.sh [carpeta_de_salida]
#   Pide un token con grant_type=client_credentials (el token no se imprime ni se guarda).
set -euo pipefail
OUT="${1:-./cloudbeds-explorar}"
mkdir -p "$OUT"
BASE="https://api.cloudbeds.com/api/v1.3"

if [ -n "${CLOUDBEDS_CLIENT_ID:-}" ] && [ -n "${CLOUDBEDS_CLIENT_SECRET:-}" ]; then
  RESP=$(curl -sS -X POST "$BASE/access_token" \
    --data-urlencode "grant_type=client_credentials" \
    --data-urlencode "client_id=$CLOUDBEDS_CLIENT_ID" \
    --data-urlencode "client_secret=$CLOUDBEDS_CLIENT_SECRET")
  TOKEN=$(printf '%s' "$RESP" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("access_token",""))' 2>/dev/null || true)
  if [ -z "$TOKEN" ]; then
    echo "✘ No se obtuvo token. Respuesta de Cloudbeds (sin datos sensibles):"
    printf '%s' "$RESP" | python3 -c 'import json,sys; d=json.load(sys.stdin); print({k: d[k] for k in ("error","error_description","message","hint") if k in d})'
    exit 1
  fi
  CABECERA="Authorization: Bearer $TOKEN"
  echo "✔ Token OAuth obtenido"
else
  : "${CLOUDBEDS_API_KEY:?Define CLOUDBEDS_API_KEY (o CLOUDBEDS_CLIENT_ID y CLOUDBEDS_CLIENT_SECRET)}"
  CABECERA="x-api-key: $CLOUDBEDS_API_KEY"
fi

pedir() { # nombre, endpoint con query, [crudo]: sin enmascarar (solo para catálogos sin datos personales, como las fuentes)
  curl -sS -H "$CABECERA" "$BASE/$2" -o "$OUT/.$1.raw.json"
  python3 - "$OUT/.$1.raw.json" "$OUT/$1.json" "${3:-}" <<'PY'
import json, re, sys
src, dst = sys.argv[1], sys.argv[2]
SENSIBLE = re.compile(r'(first|last)name|^guestname$|email|phone|address|zip|document|birth|passport|^name$', re.I)
def limpiar(x, k=''):
    if isinstance(x, dict):
        return {a: ('***' if SENSIBLE.search(a) and not a.lower().startswith(('room', 'property', 'source')) and isinstance(b, (str, int)) else limpiar(b, a)) for a, b in x.items()}
    if isinstance(x, list):
        return [limpiar(i, k) for i in x]
    return x
d = json.load(open(src))
json.dump(d if len(sys.argv) > 3 and sys.argv[3] == 'crudo' else limpiar(d), open(dst, 'w'), ensure_ascii=False, indent=2)
PY
  rm -f "$OUT/.$1.raw.json"
  echo "✔ $1 → $OUT/$1.json"
}

pedir hotel      "getHotelDetails"
pedir fuentes    "getSources" crudo
pedir tipos      "getRoomTypes?pageSize=100"
pedir unidades   "getRooms?pageSize=100"
pedir reservas   "getReservations?pageSize=8&includeAllRooms=true&sortByRecent=true"

# Detalle completo de las 3 primeras reservas (para ver cómo trae la unidad asignada, tarifas por habitación, etc.)
for id in $(python3 - "$OUT/reservas.json" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
for r in (d.get('data') or [])[:3]:
    print(r.get('reservationID', ''))
PY
); do
  pedir "reserva_$id" "getReservation?reservationID=$id"
done
echo
echo "Listo. Avísale a Claude la carpeta: $OUT"
