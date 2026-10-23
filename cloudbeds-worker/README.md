# cloudbeds-worker

Worker de Cloudflare entre el POS y Cloudbeds. Plan completo: [../PLAN-cloudbeds-canal-directo.md](../PLAN-cloudbeds-canal-directo.md).

## Configuración (paso a paso)

1. **Key de Cloudbeds** (se muestra una sola vez). Scopes: `read:rate`, `read:room`, `read:reservation`, `write:reservation`, `read:hotel` (+ los de los objetos de webhook).
2. Instalar y entrar a Cloudflare:
   ```bash
   cd cloudbeds-worker && npm install && npx wrangler login
   ```
3. Crear el KV y pegar el `id` en `wrangler.jsonc`:
   ```bash
   npx wrangler kv namespace create CACHE
   ```
4. Editar en `wrangler.jsonc`: `ALLOWED_ORIGIN` (dominio del POS), `SUPABASE_URL`, `SOURCE_ID` (opcional; sale de `getSources`).
5. Secretos. Cada organización del POS (sucursal) se conecta a SU cuenta de Cloudbeds con un solo secreto JSON:
   ```bash
   npx wrangler secret put CLOUDBEDS_ORGS
   # {"<org_id_sucursal_1>": {"apiKey": "cbat_…", "sourceId": "s-…", "webhookSecret": "<openssl rand -hex 32>"},
   #  "<org_id_sucursal_2>": {"apiKey": "cbat_…", "sourceId": "s-…", "webhookSecret": "<otro>"}}
   # propertyId (opcional): solo si una misma clave da acceso a varias propiedades.
   npx wrangler secret put SUPABASE_ANON_KEY
   ```
   Formato anterior (una organización): `CLOUDBEDS_API_KEY` + `WEBHOOK_SECRET` + `ALLOWED_ORG_ID`/`SOURCE_ID` en `vars`.
   Solo se usa si no existe `CLOUDBEDS_ORGS`.
   **Conexión desde Ajustes (opcional, sin tocar secretos por organización):** un administrador puede pegar la API key de su
   propiedad en *Ajustes › Integraciones*. Se prueba contra Cloudbeds, se cifra con AES-GCM y se guarda en `hotel_integraciones`
   (migración `20261022000400`); la tabla solo la lee el Worker. Requiere dos secretos en el Worker:
   ```bash
   npx wrangler secret put SUPABASE_SERVICE_KEY      # clave de servicio de Supabase
   openssl rand -base64 32                           # genera la clave de cifrado…
   npx wrangler secret put CREDENCIALES_KEY          # …y pégala aquí (guárdala: sin ella no se pueden leer las claves guardadas)
   ```
   Una organización con clave guardada desde Ajustes usa esa; las demás siguen usando `CLOUDBEDS_ORGS`.
6. Local: copiar `.dev.vars.example` a `.dev.vars` y rellenar; `npm run dev`.
7. Desplegar: `npm run deploy`.
8. Registrar webhooks (después de desplegar), una vez por organización, con SU apiKey y SU webhookSecret:
   ```bash
   ORG_ID=<org_id> CLOUDBEDS_API_KEY=... WEBHOOK_SECRET=... WORKER_URL=https://<tu-worker>.workers.dev ./scripts/register-webhooks.sh
   ```

## Endpoints

Todos exigen `Authorization: Bearer <JWT de Supabase>` y `X-Org-Id: <organization_id>` salvo el webhook. El usuario debe ser
miembro activo de esa organización y la organización debe estar en `CLOUDBEDS_ORGS`. Cada organización tiene su propio
Durable Object (caché, idempotencia), así que los datos de una sucursal nunca se mezclan con los de otra.

| Método y ruta | Notas |
|---|---|
| `GET /api/availability?start&end&adults&children` | Caché KV 5 min |
| `POST /api/reservations` | Requiere header `Idempotency-Key` (UUID); re-consulta disponibilidad en vivo |
| `POST /api/reservations/:id/cancel` | `putReservation status=canceled` |
| `POST /api/reservations/:id/notes` | `postReservationNote` (extras: spa, tours) |
| `PATCH /api/reservations/:id` | `putReservation rooms[]` (cambio de fechas) |
| `POST /api/webhooks/cloudbeds/:orgId` | Header `X-Webhook-Secret` (el de esa organización). Sin `:orgId`: organización «legado» |

Los campos marcados `VERIFICAR` en `worker/index.ts` son supuestos a confirmar en sandbox (plan §11).
