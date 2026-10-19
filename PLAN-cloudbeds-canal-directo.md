# Plan: POS ↔ Cloudbeds (disponibilidad, tarifas y reservas)

Verificado contra la spec oficial `pms-v1.3-openapi.yaml` (github.com/cloudbeds/openapi-specs), 2026-10-17.

## 1. Objetivo y reparto de responsabilidades

Cloudbeds es la **fuente de verdad del calendario y de la reserva**. El POS es la fuente de verdad de todo lo operativo y financiero.

| Función | Dónde |
|---|---|
| Disponibilidad, tarifas, tipos de habitación | Se leen de Cloudbeds |
| Crear la reserva (bloquea calendario y canales) | El POS la sube a Cloudbeds (`postReservation`) |
| Cancelar / cambiar fechas | El POS lo propaga a Cloudbeds (`putReservation`) |
| Consumos, subcuentas, cobros, checkout, facturación | Solo en el POS |

Regla de oro: toda reserva de hotel del POS debe existir en Cloudbeds; si no, el calendario y los canales (Airbnb, Booking…) quedan desincronizados y hay sobreventa.

## 2. Fuera de alcance

- Editar tarifas (se hace en Cloudbeds).
- Procesar tarjetas por la API (no soportado).
- Quien crea reservas es **solo el personal desde el POS**. No hay motor de reservas público (sin Turnstile ni tokens de huésped). Si eso cambia, se revisa la sección 9.

## 3. Arquitectura

```
POS (navegador, sesión Supabase) → Worker /api/* → API Cloudbeds v1.3
                                        ↑
              webhooks de Cloudbeds (invalidan caché en KV)
```

- Base de la API: `https://api.cloudbeds.com/api/v1.3/`
- Auth hacia Cloudbeds: header `x-api-key` (key de nivel propiedad). La key vive solo como secreto del Worker, nunca en `VITE_*`.
- Auth desde el POS hacia el Worker: el JWT de Supabase (`Authorization: Bearer`). El Worker lo valida contra `GET {SUPABASE_URL}/auth/v1/user`.
- El Worker es un servicio aparte (dominio propio), por eso lleva CORS restringido a `ALLOWED_ORIGIN`.

## 4. Endpoints del Worker

| Endpoint del Worker | Cloudbeds | Scope |
|---|---|---|
| `GET /api/availability?start&end&adults&children` | `getRatePlans` (`detailedRates=true`) | `read:rate` |
| `POST /api/reservations` | `getRatePlans` en vivo + `postReservation` | `write:reservation` |
| `POST /api/reservations/:id/cancel` | `putReservation` con `status=canceled` | `write:reservation` |
| `PATCH /api/reservations/:id` | `putReservation` con `rooms[]` | `write:reservation` |
| `POST /api/webhooks/cloudbeds` | receptor | — |

Hallazgos de la spec (corrigen el plan anterior):

- **Modificar fechas NO es `putReservationNote`** (ese endpoint edita notas). Se usa `putReservation` con el arreglo `rooms[]`: `subReservationID?`, `roomTypeID`, `checkinDate`, `checkoutDate`, `adults`, `children`, `rateID?`, `adjustPrice` (por defecto `true`, re-calcula el precio). También existe `checkoutDate` para alargar o acortar toda la reserva.
- **`postReservation` acepta `roomID`** dentro de `rooms[]`, `adults[]` y `children[]` para reservar una cabaña concreta, pero requiere activar la opción en los ajustes de **MyBookings** de Cloudbeds. Si se activa, la limitación "solo por tipo de habitación" desaparece para crear reservas.
- `postReservation` también acepta `thirdPartyIdentifier` (usar el id de venta/reserva del POS), `sendEmailConfirmation` (poner `false` si el POS envía la suya), `sourceID` (`s-{id}` o `ss-{id}-0/1`), `paymentMethod` (`cash|credit|ebanking|pay_pal`) y `customFields`.
- Los webhooks soportan `authHeaderName` + `authHeaderValue`: Cloudbeds envía ese header en cada entrega. **Se usa eso en lugar de un secreto en la URL.**
- Los cuerpos de `postReservation` y `putReservation` son `application/x-www-form-urlencoded` (arreglos como `rooms[0][roomTypeID]=…`).
- Alternativa de lectura: `getAvailableRoomTypes` (`read:room`) con paginación y filtros de tarifa.

No exponer al POS más de lo necesario: devolver solo tipo de habitación, cupo, id de tarifa y total. Los nombres internos de planes se pueden filtrar en el Worker.

## 5. Reglas de integridad (lo que evita problemas)

1. **Re-consultar disponibilidad en vivo antes de `postReservation`.** Nunca confiar en el caché de 5 min para escribir.
2. **El precio sale de Cloudbeds**, elegido por el Worker (`rateID`/total de su propia consulta), nunca enviado por el cliente.
3. **Idempotencia.** El POS envía una `Idempotency-Key` (UUID de la venta/reserva). El Worker la guarda en KV ~24 h junto con el `reservationID` devuelto; un reintento devuelve el mismo resultado sin crear duplicado.
4. **Guardar `reservationID` de Cloudbeds en la reserva del POS** (campo nuevo, ver sección 8).
5. **Si falla la subida**, la reserva queda en el POS como `pendiente de sincronizar` y se reintenta. No se debe perder la reserva ni dejar fechas libres.
6. **Cancelar en el POS cancela también en Cloudbeds**, o el calendario queda bloqueado.
7. **Estado y pago.** `postReservation` devuelve `confirmed` o `not_confirmed`. El cobro real ocurre en el POS; en Cloudbeds el pago se puede dejar sin registrar o registrar con `postPayment` (decisión pendiente, ver sección 10).
8. **Fechas:** formato `YYYY-MM-DD`, check-out exclusivo, zona horaria de la propiedad.

## 6. Autenticación con Cloudbeds

- Key de nivel propiedad en `x-api-key`. Se muestra **una sola vez**: guardarla de inmediato con `wrangler secret put CLOUDBEDS_API_KEY`.
- Scopes mínimos al generarla: `read:rate`, `read:room`, `read:reservation`, `write:reservation`, `read:hotel`. Para suscribir webhooks, los scopes de lectura de los objetos que se suscriban (p. ej. `read:reservation`, y los de room block/availability). **Confirmar los nombres exactos en el panel de credenciales.**
- Verificar primero que la cuenta pueda generar credenciales (hay ruta de autoservicio y de partner).
- OAuth 2.0 es alternativa, pero el refresh token expira a los 365 días de inactividad.

## 7. Sincronización

- Sin copia del calendario: consulta en vivo + caché KV de 5 min. La clave incluye una versión: `avail:{version}:{start}:{end}:{adults}:{children}`.
- Los webhooks suben `avail:version` y eso invalida todo el caché.
- Eventos: `reservation/created`, `status_changed`, `dates_changed`, `deleted`, `accommodation_type_changed`; `roomblock/created`, `removed`, `details_changed`; `availability/closeout_changed`.
- Responder 2xx de inmediato (el procesamiento > ~2 s cuenta como timeout; hay hasta 5 reintentos). Orden no garantizado y duplicados posibles: no importa, porque solo se invalida.
- KV es eventualmente consistente (hasta ~60 s entre ubicaciones): aceptable porque las escrituras siempre re-consultan en vivo.
- Hay rate limiting en la API: el caché es obligatorio.

## 8. Cambios en el POS

- Migración/campo en la reserva de hotel (venta con `origen: 'reserva_hotel'`): `cloudbeds_reservation_id`, `cloudbeds_estado_sync` (`sincronizada` | `pendiente` | `error`), `cloudbeds_error?`. Revisar el esquema RxDB/Supabase antes (hay migraciones de esquema en `src/db/rxdb.ts`).
- Cliente tipado `src/lib/cloudbeds.ts` que llama al Worker con el JWT de Supabase.
- Permisos: usar la matriz de `usePermisos` para decidir quién puede crear/cancelar reservas; el Worker valida sesión, el rol se aplica en el POS (y opcionalmente en el Worker).
- Pantalla/selector de disponibilidad en el flujo de reserva de hotel.

## 9. Seguridad

- Todos los endpoints (salvo el webhook) exigen JWT de Supabase válido.
- CORS restringido a `ALLOWED_ORIGIN`. Validar todo en servidor: fechas, rangos máximos, huéspedes, email, país ISO-2.
- Webhook: validar el header (`authHeaderName`/`authHeaderValue`) en tiempo constante; no registrar el valor.
- No loguear datos personales de huéspedes.
- Secretos solo con `wrangler secret put`; en local `.dev.vars` (ignorado por git).
- Si algún día hay reservas públicas: Turnstile, Rate Limiting y tokens de gestión por huésped.

## 10. Decisiones pendientes

1. ¿Activar reserva por cabaña concreta (`roomID`, ajuste MyBookings de Cloudbeds)?
2. ¿Registrar el cobro también en Cloudbeds (`postPayment`) o solo en el POS?
3. ¿Estado inicial: `confirmed` o `not_confirmed`? ¿`sendEmailConfirmation` sí o no?
4. ¿Política de cancelación/penalidad?
5. ¿Quién tiene permiso de crear/cancelar/modificar (admin, cajero)?
6. ID de la fuente "POS / directo" (`getSources`) para `SOURCE_ID`.

## 10b. Decisiones tomadas (2026-10-17)

- **Alcance de la fase 1:** el POS crea, cambia fechas y cancela reservas en Cloudbeds. La sincronización de vuelta (cambios hechos en el calendario de Cloudbeds → POS) queda para una fase 2.
- **Tarifa de la estadía:** la de Cloudbeds (automática, no se escribe a mano). Los **extras** (spa, tours) se suman en el POS y se **anotan en Cloudbeds como notas de la reserva** (`postReservationNote`, scope `write:reservation`, ya concedido). No se cargan como cargos en el folio de Cloudbeds: el POS sigue siendo la fuente del cobro.
- **Fuente de la reserva:** `Aguacate` (`s-286267857948864`), ya configurada en el Worker.
- **Estado inicial:** `confirmed`, sin correo de Cloudbeds (`sendEmailConfirmation: false`).
- **Si falla la subida:** la venta se guarda en el POS con `cloudbeds_estado = 'pendiente'` y se reintenta. Un rechazo definitivo (sin cupo, datos inválidos) queda como `error` y no se reintenta igual.
- **Reservas existentes:** quedan sin vínculo con Cloudbeds.
- **Permisos:** admin y cajero pueden crear, cambiar o cancelar.
- **Cabaña concreta:** no hace falta `roomID`: cada cabaña es un tipo de habitación con una sola unidad.

- **Una sola organización por ahora.** El Worker usa una única API key (la de la propiedad) y solo acepta usuarios miembros activos de `ALLOWED_ORG_ID` (comprobado en la tabla `usuarios` con el token del usuario, memorizado 60 s). Conectar varias propiedades exigiría una tabla `cloudbeds_conexiones` por organización (key cifrada, fuente, webhook y secreto propios) y una pantalla en Ajustes.
- **CORS:** `ALLOWED_ORIGIN` admite varios orígenes separados por coma (dominio del POS y `http://localhost:5173`).

### Verificado contra la propiedad real
Crear (con fuente e ID externo), sin cupo (409), idempotencia (replay), cambio de fechas con `putReservation rooms[]` (el precio se mantuvo con la misma duración) y cancelar. `totalRate` de `getRatePlans` es el total de la estadía. Cloudbeds a veces responde 522; las lecturas se reintentan en el Worker, las escrituras no.

### Cambios hechos en el POS
- Migración `20261017000100_ventas_cloudbeds.sql` (columnas `cloudbeds_*` y huéspedes en `ventas`) — pendiente de aplicar en Supabase **antes** de desplegar el POS.
- Esquema RxDB de `ventas` v10 y cliente `src/lib/cloudbeds.ts`.

## 11. Verificar en sandbox

1. Forma real de la respuesta de `getRatePlans` con `detailedRates=true` (el mapeo del Worker es defensivo y hay que ajustarlo).
2. `postReservation` con `rooms[0][roomTypeID]`, `adults[0][…]`, `children[0][…]` en form-urlencoded.
3. `guestZip` y `guestCountry`: ¿se pueden omitir o hay valor por defecto aceptable?
4. `putReservation` con `rooms[]` para cambiar fechas, y el efecto de `adjustPrice`.
5. Qué devuelve `postReservation` cuando no hay cupo (mensaje de `success:false`).
6. Alta de webhooks con `authHeaderName`.

## 12. Orden de trabajo

1. **Tú:** generar la key en Cloudbeds con los scopes de la sección 6.
2. **Tú:** `wrangler login`, crear el KV y cargar secretos (README de `cloudbeds-worker/`).
3. Desplegar el Worker y probar `GET /api/availability` (paso de solo lectura).
4. Verificar los puntos 1 y 6 de la sección 11.
5. Registrar webhooks (`scripts/register-webhooks.sh`).
6. Probar `POST /api/reservations` en una propiedad de prueba/sandbox y ajustar.
7. Cancelar y modificar.
8. Cliente `src/lib/cloudbeds.ts`, campos nuevos en el POS y flujo de sincronización con reintentos.
9. UI de disponibilidad en la reserva de hotel.

## 13. Referencias

- Spec OpenAPI: https://github.com/cloudbeds/openapi-specs (`src/pms-v1.3-openapi.yaml`)
- API: https://developers.cloudbeds.com/reference/about-pms-api
- Booking Engine: https://developers.cloudbeds.com/docs/booking-engine
- Webhooks: https://developers.cloudbeds.com/docs/webhooks-1
- Auth con API key: https://developers.cloudbeds.com/docs/quickstart-guide-api-authentication-for-property-level-users
