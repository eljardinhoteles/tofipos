// Worker intermediario POS ↔ Cloudbeds (API v1.3). Ver PLAN-cloudbeds-canal-directo.md.
// Los campos marcados "VERIFICAR" son supuestos a confirmar en sandbox (plan §11).

import { DurableObject } from 'cloudflare:workers'

interface Env {
  // Estado (caché, versión, claves de idempotencia, memo de sesión): un Durable Object con SQLite POR organización.
  ESTADO: DurableObjectNamespace<EstadoHotel>
  // Conexiones de cada organización con su cuenta de Cloudbeds (secreto, JSON). Ver `conexiones()`.
  CLOUDBEDS_ORGS?: string
  // Formato anterior (una sola organización). Se sigue aceptando si no hay CLOUDBEDS_ORGS.
  CLOUDBEDS_API_KEY?: string
  WEBHOOK_SECRET?: string
  ALLOWED_ORG_ID?: string
  SOURCE_ID?: string
  SUPABASE_ANON_KEY: string
  // Clave de servicio de Supabase (secreto, opcional): solo la usa la tarea programada que sube las reservas pendientes. Sin ella no se reintenta desde el servidor.
  SUPABASE_SERVICE_KEY?: string
  SUPABASE_URL: string
  CLOUDBEDS_BASE: string
  ALLOWED_ORIGIN: string
}

/**
 * Conexión de UNA organización del POS con su cuenta (o propiedad) de Cloudbeds. Cada sucursal es una organización.
 *   apiKey        clave de API de Cloudbeds de esa sucursal
 *   sourceId      fuente «Aguacate» creada en SU Cloudbeds (cada cuenta tiene su propio id)
 *   propertyId    solo si una misma clave da acceso a varias propiedades: se envía en cada llamada
 *   webhookSecret secreto de los avisos de esa cuenta (URL /api/webhooks/cloudbeds/<orgId>)
 */
interface Conexion { orgId: string; apiKey: string; sourceId?: string; propertyId?: string; webhookSecret: string }

/**
 * Contexto de una petición ya autorizada: el entorno y la conexión de la organización del usuario. `ec` (si hay) permite
 * dejar trabajo para después de responder (ver `enFondo`).
 */
interface Ctx { env: Env; c: Conexion; t: Record<string, number>; ec?: ExecutionContext }

const CACHE_TTL = 300
const MAX_NIGHTS = 30
// El calendario pide meses completos de una vez (misma latencia en Cloudbeds que una ventana corta).
const MAX_NIGHTS_CALENDARIO = 62
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

// ---------- conexiones por organización ----------

let cacheConexiones: { raw: string; mapa: Map<string, Conexion>; legado: string | null } | null = null

/**
 * CLOUDBEDS_ORGS = {"<orgId>": {"apiKey": "…", "sourceId": "s-…", "webhookSecret": "…", "propertyId": "…"}, …}
 * Sin ese secreto se usa el formato anterior de una sola organización (ALLOWED_ORG_ID + CLOUDBEDS_API_KEY…).
 * `legado` es la organización que atiende la URL de avisos antigua (sin orgId), ya registrada en Cloudbeds.
 */
function conexiones(env: Env): { mapa: Map<string, Conexion>; legado: string | null } {
  const raw = env.CLOUDBEDS_ORGS ?? ''
  if (cacheConexiones && cacheConexiones.raw === raw) return cacheConexiones
  const mapa = new Map<string, Conexion>()
  if (raw) {
    let datos: Record<string, Partial<Conexion>>
    try { datos = JSON.parse(raw) } catch { throw new HttpError(500, 'CLOUDBEDS_ORGS no es un JSON válido') }
    for (const [orgId, d] of Object.entries(datos)) {
      if (!d?.apiKey || !d.webhookSecret) throw new HttpError(500, `CLOUDBEDS_ORGS: a ${orgId} le falta apiKey o webhookSecret`)
      mapa.set(orgId, { orgId, apiKey: d.apiKey, sourceId: d.sourceId || undefined, propertyId: d.propertyId || undefined, webhookSecret: d.webhookSecret })
    }
  } else if (env.ALLOWED_ORG_ID && env.CLOUDBEDS_API_KEY && env.WEBHOOK_SECRET) {
    mapa.set(env.ALLOWED_ORG_ID, { orgId: env.ALLOWED_ORG_ID, apiKey: env.CLOUDBEDS_API_KEY, sourceId: env.SOURCE_ID || undefined, webhookSecret: env.WEBHOOK_SECRET })
  }
  const legado = env.ALLOWED_ORG_ID && mapa.has(env.ALLOWED_ORG_ID) ? env.ALLOWED_ORG_ID : mapa.size === 1 ? [...mapa.keys()][0] : null
  cacheConexiones = { raw, mapa, legado }
  return cacheConexiones
}

const ORG_RE = /^[A-Za-z0-9-]{8,64}$/

// ---------- utilidades ----------

// ALLOWED_ORIGIN admite varios orígenes separados por coma. Los manejadores usan el primero por defecto y el router
// reemplaza la cabecera por el origen real de cada petición (ver conCors): nada se guarda entre peticiones.
function cors(env: Env): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN.split(',')[0].trim(),
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type, Idempotency-Key, X-Reintento, X-Org-Id',
    Vary: 'Origin',
  }
}

function conCors(res: Response, env: Env, origen: string, tiempos: string): Response {
  const permitidos = env.ALLOWED_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean)
  if (permitidos.includes(origen)) res.headers.set('Access-Control-Allow-Origin', origen)
  // Permite ver en DevTools › Network › Timing cuánto tardó cada parte.
  res.headers.set('Server-Timing', tiempos)
  res.headers.set('Access-Control-Expose-Headers', 'Server-Timing, X-Cache, X-Idempotent')
  return res
}

function json(env: Env, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors(env), 'Content-Type': 'application/json' },
  })
}

function timingSafeEqual(a: string, b: string): boolean {
  const ea = new TextEncoder().encode(a)
  const eb = new TextEncoder().encode(b)
  if (ea.length !== eb.length) return false
  let diff = 0
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i]
  return diff === 0
}

function dayDiff(start: string, end: string): number {
  return Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86400000)
}

function parseRange(start: unknown, end: unknown, maxNights = MAX_NIGHTS) {
  if (typeof start !== 'string' || typeof end !== 'string' || !DATE_RE.test(start) || !DATE_RE.test(end)) {
    throw new HttpError(400, 'Fechas inválidas (YYYY-MM-DD)')
  }
  const nights = dayDiff(start, end)
  if (nights < 1 || nights > maxNights) throw new HttpError(400, `Rango inválido (1 a ${maxNights} noches)`)
  return { start, end }
}

function parseGuests(adults: unknown, children: unknown) {
  const a = Number(adults ?? 1)
  const c = Number(children ?? 0)
  if (!Number.isInteger(a) || a < 1 || a > 20) throw new HttpError(400, 'Adultos inválidos')
  if (!Number.isInteger(c) || c < 0 || c > 20) throw new HttpError(400, 'Niños inválidos')
  return { adults: a, children: c }
}

// ---------- autenticación del POS (JWT de Supabase) ----------

async function sha256(texto: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto))
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

// Un JWT ya validado se recuerda unos minutos (por su huella, nunca el token): evita dos consultas a Supabase en cada
// petición. Si se quita a alguien de la organización, pierde el acceso como máximo al vencer este memo.
const MEMO_AUTH_SEG = 300
const MEMO_AUTH_LOCAL_MS = 60_000
const memoAuth = new Map<string, { user: { id: string; email?: string }; exp: number }>()

/**
 * Almacén clave-valor con caducidad que reemplaza al KV de Cloudflare (cuyo plan gratuito limita las escrituras a
 * 1.000 por día). Es UN solo Durable Object con SQLite: lecturas/escrituras en milisegundos, consistente al instante y
 * con unas 100.000 escrituras de filas por día en el plan gratuito. Es de mejor esfuerzo: si falla, se sigue sin caché.
 */
export class EstadoHotel extends DurableObject {
  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env)
    ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL, exp INTEGER NOT NULL)')
  }

  leer(k: string): string | null {
    const fila = this.ctx.storage.sql.exec<{ v: string; exp: number }>('SELECT v, exp FROM kv WHERE k = ?', k).toArray()[0]
    return fila && fila.exp > Date.now() ? fila.v : null
  }

  /** Varias claves en una sola llamada (cada llamada al objeto es un viaje de red). */
  leerVarios(ks: string[]): Array<string | null> {
    return ks.map((k) => this.leer(k))
  }

  guardar(k: string, v: string, ttlSeg: number): void {
    const sql = this.ctx.storage.sql
    sql.exec('INSERT OR REPLACE INTO kv (k, v, exp) VALUES (?, ?, ?)', k, v, Date.now() + ttlSeg * 1000)
    // Limpieza de lo vencido, de vez en cuando (no en cada escritura).
    if (Math.random() < 0.02) sql.exec('DELETE FROM kv WHERE exp < ?', Date.now())
  }

  /**
   * Lee la versión de disponibilidad y la entrada `avail:<versión>:<sufijo>` en una sola llamada (la clave depende de la
   * versión, así que por separado serían dos viajes en serie).
   */
  leerVersionado(sufijo: string): { version: string; valor: string | null } {
    const version = this.leer('avail:version') ?? '0'
    return { version, valor: this.leer(`avail:${version}:${sufijo}`) }
  }

  /**
   * Guarda `v` solo si la clave no existe (o venció). Devuelve null si lo logró, o el valor que ya había. Es atómico: el
   * objeto atiende una llamada a la vez, así que dos peticiones simultáneas nunca «ganan» las dos (candados e idempotencia).
   */
  reclamarOPrevio(k: string, v: string, ttlSeg: number): string | null {
    const previo = this.leer(k)
    if (previo !== null) return previo
    this.guardar(k, v, ttlSeg)
    return null
  }

  reclamar(k: string, v: string, ttlSeg: number): boolean {
    return this.reclamarOPrevio(k, v, ttlSeg) === null
  }

  borrar(k: string): void {
    this.ctx.storage.sql.exec('DELETE FROM kv WHERE k = ?', k)
  }
}

const TIEMPO_LECTURA_MS = 6_000
const RESPALDO_LECTURA_MS = 2_000
const TIEMPO_ESCRITURA_MS = 20_000
const TIEMPO_ESTADO_MS = 4_000

/** El almacén es de mejor esfuerzo: si tarda, se sigue sin él en vez de colgar la petición. */
async function conTope<T>(op: string, p: Promise<T>): Promise<T> {
  const t0 = Date.now()
  let id: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([p, new Promise<never>((_, rej) => { id = setTimeout(() => rej(new Error(`Estado: ${op} tardó más de ${TIEMPO_ESTADO_MS} ms`)), TIEMPO_ESTADO_MS) })])
  } finally {
    if (id !== undefined) clearTimeout(id)
    const ms = Date.now() - t0
    if (ms > 1000) console.warn(JSON.stringify({ origen: 'estado', lento: op, ms }))
  }
}

const TTL_SIN_VENCER = 31_536_000 // un año: las claves sin caducidad (versión, último webhook)
const almacen = (x: Ctx) => x.env.ESTADO.get(x.env.ESTADO.idFromName(`org:${x.c.orgId}`))

async function leer(x: Ctx, key: string): Promise<string | null> {
  try { return await conTope('leer', almacen(x).leer(key)) } catch (e) { console.error('Estado: lectura falló:', key.split(':')[0], e instanceof Error ? e.message : e); return null }
}
async function leerVarios(x: Ctx, keys: string[]): Promise<Array<string | null>> {
  try { return await conTope('leerVarios', almacen(x).leerVarios(keys)) } catch (e) { console.error('Estado: lectura falló:', e instanceof Error ? e.message : e); return keys.map(() => null) }
}
async function guardar(x: Ctx, key: string, value: string, opts?: { expirationTtl?: number }): Promise<void> {
  try { await conTope('guardar', almacen(x).guardar(key, value, opts?.expirationTtl ?? TTL_SIN_VENCER)) } catch (e) { console.error('Estado: escritura falló:', key.split(':')[0], e instanceof Error ? e.message : e) }
}
async function borrar(x: Ctx, key: string): Promise<void> {
  try { await conTope('borrar', almacen(x).borrar(key)) } catch (e) { console.error('Estado: borrado falló:', key.split(':')[0], e instanceof Error ? e.message : e) }
}
/**
 * Escrituras de caché que la respuesta no necesita: se terminan después de responder (un viaje menos al almacén). Sin
 * contexto de ejecución (p. ej. la tarea programada) se esperan como siempre.
 */
async function enFondo(x: Ctx, p: Promise<unknown>): Promise<void> {
  if (x.ec) x.ec.waitUntil(p)
  else await p
}
async function leerVersionado(x: Ctx, sufijo: string): Promise<{ version: string; valor: string | null }> {
  try { return await conTope('leerVersionado', almacen(x).leerVersionado(sufijo)) } catch (e) { console.error('Estado: lectura falló: avail', e instanceof Error ? e.message : e); return { version: '0', valor: null } }
}
/** Reserva una clave o devuelve lo que ya tenía. Si el almacén no responde se lanza un 503: es para la idempotencia. */
async function reclamarOPrevio(x: Ctx, key: string, value: string, ttlSeg: number): Promise<string | null> {
  try { return await conTope('reclamarOPrevio', almacen(x).reclamarOPrevio(key, value, ttlSeg)) } catch (e) {
    console.error('Estado: candado falló:', key.split(':')[0], e instanceof Error ? e.message : e)
    throw new HttpError(503, 'Esta reserva ya se está subiendo a Cloudbeds; se comprobará en unos segundos')
  }
}
/** Candado o reserva de una clave. Si el almacén no responde se deja pasar (`true`): mejor un refresco de más que ninguno. */
async function reclamar(x: Ctx, key: string, value: string, ttlSeg: number): Promise<boolean> {
  try { return await conTope('reclamar', almacen(x).reclamar(key, value, ttlSeg)) } catch (e) { console.error('Estado: candado falló:', key.split(':')[0], e instanceof Error ? e.message : e); return true }
}

/**
 * Autoriza la petición y resuelve la conexión de Cloudbeds: el usuario debe ser miembro activo de la organización que
 * envía el POS (`X-Org-Id`) y esa organización debe tener una conexión configurada.
 */
async function autorizar(req: Request, env: Env, ec: ExecutionContext): Promise<Ctx> {
  const orgId = req.headers.get('X-Org-Id') || ''
  if (!ORG_RE.test(orgId)) throw new HttpError(401, 'Falta la organización activa')
  const c = conexiones(env).mapa.get(orgId)
  if (!c) throw new HttpError(403, 'Esta organización no tiene una cuenta de Cloudbeds conectada')
  const x: Ctx = { env, c, t: {}, ec }
  const t0 = Date.now()
  await requireUser(req, x)
  x.t.auth = Date.now() - t0
  return x
}

async function requireUser(req: Request, x: Ctx): Promise<{ id: string; email?: string }> {
  const env = x.env
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) throw new HttpError(401, 'No autorizado')

  // La organización va en la clave: un mismo usuario puede pertenecer a las dos sucursales.
  const memoKey = `auth:${x.c.orgId}:${await sha256(token)}`
  // Primero la memoria del isolate (sin viaje de red), luego el almacén compartido.
  const local = memoAuth.get(memoKey)
  if (local && local.exp > Date.now()) return local.user
  const memo = await leer(x, memoKey)
  if (memo) {
    const user = JSON.parse(memo) as { id: string; email?: string }
    memoAuth.set(memoKey, { user, exp: Date.now() + MEMO_AUTH_LOCAL_MS })
    return user
  }

  const headers = { Authorization: `Bearer ${token}`, apikey: env.SUPABASE_ANON_KEY }
  const t0 = Date.now()
  const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, { headers, signal: AbortSignal.timeout(8000) }).catch(() => { throw new HttpError(503, 'No se pudo validar la sesión (Supabase no respondió)') })
  if (!res.ok) throw new HttpError(401, 'Sesión inválida')
  const user = (await res.json()) as { id: string; email?: string }

  // La API key de Cloudbeds es de una sola propiedad: solo miembros activos de su organización pueden usarla.
  const q = new URLSearchParams({
    select: 'id',
    user_id: `eq.${user.id}`,
    organization_id: `eq.${x.c.orgId}`,
    activo: 'eq.true',
    limit: '1',
  })
  const m = await fetch(`${env.SUPABASE_URL}/rest/v1/usuarios?${q}`, { headers, signal: AbortSignal.timeout(8000) }).catch(() => { throw new HttpError(503, 'No se pudo validar la sesión (Supabase no respondió)') })
  if (Date.now() - t0 > 2000) console.warn(JSON.stringify({ origen: 'supabase', lento: 'auth', ms: Date.now() - t0 }))
  const filas = m.ok ? ((await m.json()) as unknown[]) : []
  if (!Array.isArray(filas) || filas.length === 0) throw new HttpError(403, 'No perteneces a esta organización')

  await enFondo(x, guardar(x, memoKey, JSON.stringify({ id: user.id, email: user.email }), { expirationTtl: MEMO_AUTH_SEG }))
  memoAuth.set(memoKey, { user: { id: user.id, email: user.email }, exp: Date.now() + MEMO_AUTH_LOCAL_MS })
  if (memoAuth.size > 500) memoAuth.clear()
  return user
}

// ---------- cliente Cloudbeds ----------

// Cloudbeds recibe form-urlencoded con arreglos tipo rooms[0][roomTypeID]=…
function toForm(params: Record<string, unknown>): URLSearchParams {
  const out = new URLSearchParams()
  const walk = (key: string, value: unknown) => {
    if (value === undefined || value === null) return
    if (Array.isArray(value)) value.forEach((v, i) => walk(`${key}[${i}]`, v))
    else if (typeof value === 'object') for (const [k, v] of Object.entries(value)) walk(`${key}[${k}]`, v)
    else out.append(key, String(value))
  }
  for (const [k, v] of Object.entries(params)) walk(k, v)
  return out
}

async function cloudbeds<T = any>(
  x: Ctx,
  method: 'GET' | 'POST' | 'PUT',
  path: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const headers: Record<string, string> = { 'x-api-key': x.c.apiKey, Accept: 'application/json' }
  // Una clave con acceso a varias propiedades necesita saber a cuál se refiere cada llamada.
  if (x.c.propertyId) params = { propertyID: x.c.propertyId, ...params }
  let url = `${x.env.CLOUDBEDS_BASE}/${path}`
  let body: URLSearchParams | undefined
  if (method === 'GET') url += `?${toForm(params).toString()}`
  else {
    body = toForm(params)
    headers['Content-Type'] = 'application/x-www-form-urlencoded'
  }
  // Cloudbeds a veces no responde (522/5xx) o limita las peticiones (429).
  //  - 429: no se procesó nada, así que repetir es seguro también en escrituras.
  //  - 5xx: solo las lecturas; repetir una escritura que quizá sí se aplicó podría duplicarla.
  // Sin tope, una llamada colgada retiene la petición hasta que Cloudflare la corta (~30 s) y el POS solo ve «tardó demasiado».
  const t0 = Date.now()
  // Una lectura colgada se corta pronto y se repite UNA vez (suele ser una conexión que Cloudbeds dejó sin responder).
  // Una escritura tiene más margen y nunca se repite a ciegas: podría haberse aplicado (el reintento del POS la busca).
  const pedirUna = (limite: number) => {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), limite)
    return { ctl, promesa: fetch(url, { method, headers, body, signal: ctl.signal }).finally(() => clearTimeout(timer)) }
  }
  // Lecturas con RESPALDO: si Cloudbeds no contesta en unos segundos se lanza la misma consulta otra vez en paralelo y
  // gana la primera que responda (la otra se cancela). Así una conexión atascada no hace esperar al usuario. Es seguro
  // porque una lectura no cambia nada. Las escrituras no se duplican nunca: una sola llamada, con más margen.
  const pedirLectura = () => new Promise<Response>((resolve, reject) => {
    const lanzadas: AbortController[] = []
    let pendientes = 0
    let resuelto = false
    let respaldoPendiente = true
    const lanzar = () => {
      const { ctl, promesa } = pedirUna(TIEMPO_LECTURA_MS)
      lanzadas.push(ctl)
      pendientes++
      promesa.then(
        (r) => { if (!resuelto) { resuelto = true; clearTimeout(respaldo); lanzadas.forEach((c) => { if (c !== ctl) c.abort() }); resolve(r) } },
        (e) => { pendientes--; if (!resuelto && pendientes === 0 && !respaldoPendiente) reject(e); if (!resuelto && pendientes === 0 && respaldoPendiente) { clearTimeout(respaldo); respaldoPendiente = false; reject(e) } },
      )
    }
    const respaldo = setTimeout(() => { respaldoPendiente = false; if (!resuelto) { x.t.respaldo = 1; lanzar() } }, RESPALDO_LECTURA_MS)
    lanzar()
  })
  const pedir = async () => {
    const intentos = method === 'GET' ? 2 : 1
    for (let i = 1; ; i++) {
      try {
        return method === 'GET' ? await pedirLectura() : await pedirUna(TIEMPO_ESCRITURA_MS).promesa
      } catch (e) {
        console.error(JSON.stringify({ origen: 'cloudbeds', ruta: path, error: e instanceof Error ? e.name : 'fetch', intento: i, ms: Date.now() - t0 }))
        if (i >= intentos) throw new HttpError(504, 'Cloudbeds no respondió a tiempo. Vuelve a intentarlo en unos segundos.')
      }
    }
  }
  let res = await pedir()
  for (let intento = 0; intento < 2 && (res.status === 429 || (method === 'GET' && res.status >= 500)); intento++) {
    await new Promise((r) => setTimeout(r, 600 * (intento + 1)))
    res = await pedir()
  }
  const ms = Date.now() - t0
  x.t.cloudbeds = (x.t.cloudbeds ?? 0) + ms
  if (ms > 3000) console.warn(JSON.stringify({ origen: 'cloudbeds', lento: path, ms, estado: res.status }))
  if (res.status === 429) throw new HttpError(503, 'Cloudbeds limitó las peticiones, reintenta en unos segundos')
  const text = await res.text()
  let data: any
  try {
    data = JSON.parse(text)
  } catch {
    throw new HttpError(502, `Respuesta inválida de Cloudbeds en ${path} (HTTP ${res.status}): ${text.slice(0, 200)}`)
  }
  if (!res.ok || data?.success === false) {
    console.error(JSON.stringify({ origen: 'cloudbeds', metodo: method, ruta: path, estado: res.status, mensaje: String(data?.message ?? '').slice(0, 160) }))
    // El mensaje de Cloudbeds es útil para el personal (p. ej. sin cupo); no se registran datos de huéspedes.
    throw new HttpError(res.ok ? 409 : 502, String(data?.message || `Cloudbeds respondió ${res.status}`))
  }
  return data as T
}

// ---------- disponibilidad ----------

interface Oferta {
  roomTypeID: string
  roomTypeName: string
  roomsAvailable: number
  rateID: string | null
  totalRate: number // total de la estadía (verificado en sandbox: 400/noche → 800 por 2 noches)
  noches: Array<{ date: string; rate: number; disponible: boolean }>
  reservable: boolean // hay cupo y ninguna restricción (minLos, cerrado a llegada/salida, bloqueo) lo impide
  motivo: string | null
  minNoches: number | null // estadía mínima que exigen las fechas pedidas (solo si no se cumple)
  nombrePlan: string | null
  derivada: boolean // plan derivado (paquetes como «Premium: almuerzo + cena»): no se ofrece por defecto
  // Otros planes de tarifa de la misma cabaña (solo en la fila principal).
  planes?: Array<{ rateID: string | null; nombrePlan: string | null; totalRate: number; reservable: boolean; motivo: string | null }>
}

// Forma verificada de getRatePlans con detailedRates=true: roomRateDetailed[] por noche.
function mapRatePlans(raw: any, start: string, end: string): Oferta[] {
  const rows: any[] = Array.isArray(raw?.data) ? raw.data : []
  const nights = dayDiff(start, end)
  return rows.map((r) => {
    const det: any[] = Array.isArray(r.roomRateDetailed) ? r.roomRateDetailed : []
    const primera = det[0]
    const ultima = det[det.length - 1]
    const roomsAvailable = Number(r.roomsAvailable ?? 0)
    let motivo: string | null = null
    if (roomsAvailable < 1 || det.some((d) => Number(d.roomsAvailable ?? 1) < 1)) motivo = 'Sin disponibilidad'
    else if (det.some((d) => d.blocked)) motivo = 'Bloqueada'
    else if (primera?.closedToArrival) motivo = 'Cerrada a la llegada'
    else if (ultima?.closedToDeparture) motivo = 'Cerrada a la salida'
    else if (det.some((d) => Number(d.minLos ?? 0) > nights)) motivo = 'No cumple la estadía mínima'
    else if (det.some((d) => Number(d.maxLos ?? 0) > 0 && nights > Number(d.maxLos))) motivo = 'Supera la estadía máxima'
    return {
      roomTypeID: String(r.roomTypeID),
      roomTypeName: String(r.roomTypeName ?? ''),
      roomsAvailable,
      rateID: r.rateID != null ? String(r.rateID) : r.ratePlanID != null ? String(r.ratePlanID) : null,
      totalRate: Number(r.totalRate ?? r.roomRate ?? 0),
      noches: det.map((d) => ({ date: String(d.date), rate: Number(d.rate ?? 0), disponible: Number(d.roomsAvailable ?? 1) > 0 && !d.blocked })),
      reservable: motivo === null,
      motivo,
      minNoches: motivo === 'No cumple la estadía mínima' ? Math.max(...det.map((d) => Number(d.minLos ?? 0))) : null,
      nombrePlan: r.ratePlanNamePublic ? String(r.ratePlanNamePublic) : null,
      derivada: Boolean(r.isDerived),
    }
  })
}

// Cloudbeds devuelve una fila por plan de tarifa: una cabaña puede salir varias veces. Se ordena para que el plan
// básico (no derivado) vaya primero: es el que se reserva si no se pide otro.
function ordenarPlanes(rows: Oferta[]): Oferta[] {
  return [...rows].sort((a, b) => Number(a.derivada) - Number(b.derivada))
}

// Una fila por cabaña, con el plan básico como principal y el resto en `planes`.
function agruparPorCabana(rows: Oferta[]): Oferta[] {
  const porCabana = new Map<string, Oferta[]>()
  for (const r of ordenarPlanes(rows)) porCabana.set(r.roomTypeID, [...(porCabana.get(r.roomTypeID) ?? []), r])
  return [...porCabana.values()].map(([principal, ...otros]) => ({
    ...principal,
    planes: otros.map((o) => ({ rateID: o.rateID, nombrePlan: o.nombrePlan, totalRate: o.totalRate, reservable: o.reservable, motivo: o.motivo })),
  }))
}

async function fetchOfertas(x: Ctx, start: string, end: string, adults: number, children: number, roomTypeIDs?: string[]): Promise<Oferta[]> {
  const raw = await cloudbeds(x, 'GET', 'getRatePlans', {
    startDate: start,
    endDate: end,
    adults,
    children,
    detailedRates: true,
    // Cloudbeds acepta una lista separada por comas: solo se pide lo que hace falta.
    roomTypeID: roomTypeIDs && roomTypeIDs.length > 0 ? roomTypeIDs.join(',') : undefined,
  })
  return mapRatePlans(raw, start, end)
}

async function getVersion(x: Ctx): Promise<string> {
  return (await leer(x, 'avail:version')) ?? '0'
}

/**
 * Disponibilidad. Dos usos:
 *  - Lista (`lista=1`): qué cabañas están libres, SIN tarifas (no viajan los precios ni las noches).
 *  - Cotización: la tarifa de unas cabañas concretas (`roomTypeIDs`) para una ocupación, solo de esas.
 */
async function availability(req: Request, x: Ctx): Promise<Response> {
  const q = new URL(req.url).searchParams
  const { start, end } = parseRange(q.get('start'), q.get('end'), MAX_NIGHTS_CALENDARIO)
  const { adults, children } = parseGuests(q.get('adults'), q.get('children'))
  const lista = q.get('lista') === '1'
  const ids = (q.get('roomTypeIDs') ?? '').split(',').map((v) => v.trim()).filter(Boolean)
  if (ids.length > 30 || !ids.every((id) => /^\d{3,30}$/.test(id))) throw new HttpError(400, 'Cabañas inválidas')

  const sufijo = `${start}:${end}:${adults}:${children}:${lista ? 'l' : ids.slice().sort().join('+') || 'todas'}`
  const { version, valor: cached } = await leerVersionado(x, sufijo)
  const key = `avail:${version}:${sufijo}`
  if (cached) return new Response(cached, { headers: { ...cors(x.env), 'Content-Type': 'application/json', 'X-Cache': 'HIT' } })

  const [crudas, tipos] = await Promise.all([fetchOfertas(x, start, end, adults, children, ids), obtenerTipos(x).catch(() => [] as TipoHab[])])
  const porTipo = new Map(tipos.map((t) => [t.roomTypeID, t]))
  // Capacidad máxima de cada cabaña (adultos + niños): permite repartir un grupo sin tener que probar a ciegas.
  const agrupadas = agruparPorCabana(crudas).map((o) => ({ ...o, capacidad: porTipo.get(o.roomTypeID)?.capacidad ?? null, adultosIncluidos: porTipo.get(o.roomTypeID)?.adultosIncluidos ?? null }))
  const ofertas = lista
    ? agrupadas.map((o) => ({ ...o, totalRate: 0, noches: [], planes: [], rateID: null, nombrePlan: null }))
    : agrupadas
  const body = JSON.stringify({ start, end, adults, children, ofertas })
  await enFondo(x, guardar(x, key, body, { expirationTtl: CACHE_TTL }))
  return new Response(body, { headers: { ...cors(x.env), 'Content-Type': 'application/json', 'X-Cache': 'MISS' } })
}

// ---------- reservas ----------

interface CrearReservaBody {
  start: string
  end: string
  adults: number
  children?: number
  roomTypeID: string
  roomID?: string
  rateID?: string
  guest: { firstName: string; lastName: string; email: string; phone?: string; country: string; zip?: string }
  externalId?: string // id de la venta/reserva del POS → thirdPartyIdentifier
  sendEmailConfirmation?: boolean
  paymentMethod?: 'cash' | 'credit' | 'ebanking' | 'pay_pal'
}

const str = (v: unknown, max: number) => typeof v === 'string' && v.trim().length > 0 && v.length <= max

const IDEM_SEG = 7 * 86400
const EN_CURSO = '__en_curso__'
const EN_CURSO_SEG = 120 // si el Worker se cae a mitad, la clave se libera sola

// ¿Ya existe en Cloudbeds una reserva con este identificador externo? (la creó un intento anterior cuyo resultado se perdió)
async function buscarPorExterno(x: Ctx, roomTypeID: string, start: string, end: string, externo: string) {
  const raw = await cloudbeds<{ data?: Array<Record<string, unknown>> }>(x, 'GET', 'getReservations', {
    checkInFrom: sumarDias(start, -60),
    checkInTo: sumarDias(end, 60),
    roomTypeID,
    pageSize: 100,
  })
  return (raw.data ?? []).find((r) => String(r.thirdPartyIdentifier ?? '') === externo)
}

async function crearReserva(req: Request, x: Ctx): Promise<Response> {
  const idem = req.headers.get('Idempotency-Key')
  if (!idem || !/^[A-Za-z0-9-]{16,64}$/.test(idem)) throw new HttpError(400, 'Falta Idempotency-Key (UUID)')
  const idemKey = `idem:${idem}`

  const b = (await req.json().catch(() => null)) as CrearReservaBody | null
  if (!b) throw new HttpError(400, 'JSON inválido')
  const { start, end } = parseRange(b.start, b.end)
  const { adults, children } = parseGuests(b.adults, b.children)
  const g = b.guest
  if (
    !g ||
    !str(g.firstName, 80) ||
    !str(g.lastName, 150) ||
    !str(g.email, 160) ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(g.email) ||
    !/^[A-Za-z]{2}$/.test(g.country ?? '') ||
    !str(b.roomTypeID, 20)
  ) {
    throw new HttpError(400, 'Datos de huésped o habitación inválidos')
  }

  // Dos envíos simultáneos de la misma reserva (reintento automático y manual a la vez) no pueden crearla dos veces:
  // el primero reserva la clave y el otro recibe 503 (el POS lo deja pendiente y vuelve a comprobar). Si ya se creó, se
  // devuelve la respuesta guardada. Todo en un solo viaje al almacén. Si no responde no se crea nada: duplicar una
  // reserva es peor que esperar.
  const previo = await reclamarOPrevio(x, idemKey, EN_CURSO, EN_CURSO_SEG)
  if (previo === EN_CURSO) throw new HttpError(503, 'Esta reserva ya se está subiendo a Cloudbeds; se comprobará en unos segundos')
  if (previo) return new Response(previo, { headers: { ...cors(x.env), 'Content-Type': 'application/json', 'X-Idempotent': 'replay' } })
  try {
    return await crearReservaReclamada(req, x, b, idemKey, start, end, adults, children, g)
  } catch (e) {
    // Si Cloudbeds la rechazó o no respondió, se libera la clave para poder reintentar. (Un 5xx en postReservation
    // pudo haberla creado igual: el reintento lleva X-Reintento y la busca antes de crear.)
    await borrar(x, idemKey)
    throw e
  }
}

async function crearReservaReclamada(
  req: Request, x: Ctx, b: CrearReservaBody, idemKey: string,
  start: string, end: string, adults: number, children: number, g: CrearReservaBody['guest'],
): Promise<Response> {
  // Un reintento (cabecera del POS) puede llegar cuando ya venció el registro de idempotencia: antes de crear de nuevo se
  // comprueba en Cloudbeds que no exista ya, para no duplicar.
  if (req.headers.get('X-Reintento') === '1' && b.externalId) {
    const previa = await buscarPorExterno(x, b.roomTypeID, start, end, b.externalId)
    if (previa) {
      if (['canceled', 'no_show'].includes(String(previa.status))) throw new HttpError(409, 'Esta reserva ya existe en Cloudbeds pero está cancelada')
      const out = JSON.stringify({ reservationID: String(previa.reservationID), status: String(previa.status), grandTotal: null })
      await guardar(x, idemKey, out, { expirationTtl: IDEM_SEG })
      return new Response(out, { status: 200, headers: { ...cors(x.env), 'Content-Type': 'application/json', 'X-Idempotent': 'existente' } })
    }
  }

  // Regla de integridad: disponibilidad EN VIVO (sin caché) antes de escribir.
  const ofertas = ordenarPlanes(await fetchOfertas(x, start, end, adults, children, [b.roomTypeID]))
  const oferta = ofertas.find((o) => o.roomTypeID === b.roomTypeID && (!b.rateID || o.rateID === b.rateID))
  if (!oferta || !oferta.reservable) throw new HttpError(409, oferta?.motivo || 'Sin disponibilidad para esas fechas')

  const roomEntry = { roomTypeID: b.roomTypeID, quantity: 1, roomID: b.roomID, roomRateID: oferta.rateID ?? undefined }
  const res = await cloudbeds<{ reservationID: string; status: string; grandTotal: number }>(x, 'POST', 'postReservation', {
    sourceID: x.c.sourceId || undefined,
    thirdPartyIdentifier: b.externalId,
    startDate: start,
    endDate: end,
    guestFirstName: g.firstName.trim(),
    guestLastName: g.lastName.trim(),
    guestEmail: g.email.trim(),
    guestPhone: g.phone,
    guestCountry: g.country.toUpperCase(),
    guestZip: g.zip || '000000', // VERIFICAR si se puede omitir
    rooms: [roomEntry],
    adults: [{ roomTypeID: b.roomTypeID, quantity: adults, roomID: b.roomID }],
    children: [{ roomTypeID: b.roomTypeID, quantity: children, roomID: b.roomID }],
    paymentMethod: b.paymentMethod ?? 'cash',
    sendEmailConfirmation: b.sendEmailConfirmation ?? false,
  })

  await Promise.all([bumpVersion(x), marcarPropio(x, String(res.reservationID))])
  const out = JSON.stringify({ reservationID: res.reservationID, status: res.status, grandTotal: res.grandTotal })
  await guardar(x, idemKey, out, { expirationTtl: IDEM_SEG })
  return new Response(out, { status: 201, headers: { ...cors(x.env), 'Content-Type': 'application/json' } })
}

function reservationId(path: string): string {
  const id = path.split('/')[3]
  if (!id || !/^[A-Za-z0-9-]{1,40}$/.test(id)) throw new HttpError(400, 'ID de reserva inválido')
  return id
}

async function cancelarReserva(req: Request, x: Ctx, id: string): Promise<Response> {
  // Se marca ANTES de escribir: el aviso de Cloudbeds puede llegar antes de que esto termine.
  await marcarPropio(x, id)
  await cloudbeds(x, 'PUT', 'putReservation', { reservationID: id, status: 'canceled' })
  await bumpVersion(x)
  return json(x.env, { ok: true })
}

interface ModificarBody {
  subReservationID?: string
  roomTypeID: string
  start: string
  end: string
  adults: number
  children?: number
  rateID?: string
  adjustPrice?: boolean
}

async function modificarReserva(req: Request, x: Ctx, id: string): Promise<Response> {
  const b = (await req.json().catch(() => null)) as ModificarBody | null
  if (!b || !str(b.roomTypeID, 20)) throw new HttpError(400, 'JSON inválido')
  const { start, end } = parseRange(b.start, b.end)
  const { adults, children } = parseGuests(b.adults, b.children)

  await marcarPropio(x, id)
  // VERIFICAR en sandbox (plan §11.4): la spec define rooms[] en putReservation.
  await cloudbeds(x, 'PUT', 'putReservation', {
    reservationID: id,
    rooms: [
      {
        subReservationID: b.subReservationID,
        roomTypeID: b.roomTypeID,
        checkinDate: start,
        checkoutDate: end,
        adults,
        children,
        rateID: b.rateID,
        adjustPrice: b.adjustPrice ?? true,
      },
    ],
  })
  await bumpVersion(x)
  // Cloudbeds recalcula su tarifa al cambiar las fechas: se devuelve para que el POS la tenga al día.
  let total: number | null = null
  try {
    const info = await cloudbeds<{ data?: Dict }>(x, 'GET', 'getReservation', { reservationID: id })
    // El total de Cloudbeds incluye los extras cargados allá; la tarifa de la estadía es el hospedaje (subTotal).
    const hospedaje = desgloseDe(info.data ?? {})?.hospedaje
    if (typeof hospedaje === 'number' && hospedaje > 0) total = hospedaje
    else if (typeof info.data?.total === 'number') total = info.data.total
  } catch { /* la tarifa es informativa: el cambio de fechas ya se hizo */ }
  return json(x.env, { ok: true, total })
}

interface TipoHab { roomTypeID: string; nombre: string; codigo: string | null; capacidad: number | null; adultosIncluidos: number | null }

// Tipos de habitación (cabañas) de Cloudbeds. Casi nunca cambian: caché 1 h.
async function obtenerTipos(x: Ctx): Promise<TipoHab[]> {
  const cached = await leer(x, 'room-types')
  if (cached) return (JSON.parse(cached) as { tipos: TipoHab[] }).tipos
  const raw = await cloudbeds<{ data?: Array<Record<string, unknown>> }>(x, 'GET', 'getRoomTypes', { pageSize: 100 })
  const tipos: TipoHab[] = (raw.data ?? []).map((t) => ({
    roomTypeID: String(t.roomTypeID),
    nombre: String(t.roomTypeName ?? ''),
    codigo: t.roomTypeNameShort ? String(t.roomTypeNameShort) : null,
    capacidad: t.maxGuests != null ? Number(t.maxGuests) : null,
    adultosIncluidos: t.adultsIncluded != null ? Number(t.adultsIncluded) : null,
  }))
  await enFondo(x, guardar(x, 'room-types', JSON.stringify({ tipos }), { expirationTtl: 3600 }))
  return tipos
}

async function tiposHabitacion(req: Request, x: Ctx): Promise<Response> {
  return json(x.env, { tipos: await obtenerTipos(x) })
}

// ---------- calendario (tarjetas de reservas y bloqueos) ----------

interface Tarjeta {
  tipo: 'reserva' | 'bloqueo'
  id: string
  roomTypeID: string
  nombre: string
  desde: string // primera noche
  hasta: string // día de salida (no incluido), igual que en Cloudbeds
  estado?: string
  fuente?: string | null
  // Saldo según Cloudbeds: solo de referencia. Los pagos se registran en el POS y los saldos NO se sincronizan.
  saldo?: number | null
  externo?: string | null // thirdPartyIdentifier: el id de la reserva del POS cuando la creó el POS
  adultos?: number
  ninos?: number
  creada?: string | null // cuándo se creó la reserva en Cloudbeds («AAAA-MM-DD HH:mm:ss»)
  motivo?: string | null // bloqueos: el motivo completo (puede tener varias líneas)
  tipoBloqueo?: string | null // 'blocked_dates' | 'out_of_service' | 'courtesy_hold'
}

const MAX_NOCHES_BLOQUEOS = 35 // límite de getRoomBlocks por consulta
const ESTADOS_FUERA = new Set(['canceled', 'no_show'])

const sumarDias = (f: string, n: number) => new Date(Date.parse(f + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10)

async function reservasDeCabana(x: Ctx, roomTypeID: string, start: string, end: string): Promise<Tarjeta[]> {
  // Una estadía que empezó antes de `start` también se ve: se busca hacia atrás (las estadías largas son raras).
  const raw = await cloudbeds<{ data?: Array<Record<string, unknown>> }>(x, 'GET', 'getReservations', {
    checkInFrom: sumarDias(start, -45),
    checkInTo: sumarDias(end, -1),
    roomTypeID,
    pageSize: 100,
  })
  return (raw.data ?? [])
    .filter((r) => !ESTADOS_FUERA.has(String(r.status)) && String(r.startDate) < end && String(r.endDate) > start)
    .map((r) => ({
      tipo: 'reserva' as const,
      id: String(r.reservationID),
      roomTypeID,
      nombre: String(r.guestName ?? ''),
      desde: String(r.startDate),
      hasta: String(r.endDate),
      estado: String(r.status),
      fuente: r.sourceName ? String(r.sourceName) : null,
      saldo: r.balance != null ? Number(r.balance) : null,
      externo: r.thirdPartyIdentifier ? String(r.thirdPartyIdentifier) : null,
      adultos: r.adults != null ? Number(r.adults) : undefined,
      ninos: r.children != null ? Number(r.children) : undefined,
      creada: r.dateCreated ? String(r.dateCreated) : null,
    }))
}

async function bloqueosDeRango(x: Ctx, start: string, end: string): Promise<Tarjeta[]> {
  // getRoomBlocks admite máximo 35 días: se parte el rango. startDate/endDate filtran "bloqueos que incluyan esa fecha".
  const tramos: Array<[string, string]> = []
  for (let d = start; d < end; d = sumarDias(d, MAX_NOCHES_BLOQUEOS)) {
    const hasta = sumarDias(d, MAX_NOCHES_BLOQUEOS - 1)
    tramos.push([d, hasta < sumarDias(end, -1) ? hasta : sumarDias(end, -1)])
  }
  const respuestas = await Promise.all(
    tramos.map(([a, b]) =>
      cloudbeds<{ data?: { roomBlocks?: Array<Record<string, unknown>> } }>(x, 'GET', 'getRoomBlocks', { startDate: a, endDate: b, pageSize: 100 }),
    ),
  )
  const vistos = new Set<string>()
  const out: Tarjeta[] = []
  for (const resp of respuestas) {
    for (const b of resp.data?.roomBlocks ?? []) {
      const rooms = (b.rooms as Array<Record<string, unknown>> | undefined) ?? []
      for (const room of rooms) {
        const roomTypeID = String(room.roomTypeID)
        const clave = `${b.roomBlockID}:${roomTypeID}`
        if (vistos.has(clave)) continue
        vistos.add(clave)
        out.push({
          tipo: 'bloqueo',
          id: String(b.roomBlockID),
          roomTypeID,
          // El motivo suele ser el nombre de la persona; solo se usa la primera línea.
          nombre: String(b.roomBlockReason ?? '').split('\n')[0].trim() || 'Bloqueada',
          desde: String(b.startDate),
          hasta: String(b.endDate),
          motivo: String(b.roomBlockReason ?? '').trim().slice(0, 300) || null,
          tipoBloqueo: b.roomBlockType ? String(b.roomBlockType) : null,
        })
      }
    }
  }
  return out.filter((t) => t.desde < end && t.hasta > start)
}

// El calendario se sirve SIEMPRE de lo guardado (rápido) y, si ya es viejo o Cloudbeds avisó de un cambio, se
// refresca por detrás: nadie espera a Cloudbeds salvo la primera vez. `obsoleto` le dice al navegador que vuelva a
// pedirlo en un instante. Lo guardado no se borra al invalidar: solo se marca como viejo.
const FRESCO_MS = 120_000 // los webhooks de Cloudbeds invalidan antes si algo cambia; este plazo es solo la red de seguridad
const GUARDADO_SEG = 86_400
const CANDADO_SEG = 60 // un solo refresco a la vez por ventana; se libera al terminar

interface EntradaCalendario { start: string; end: string; tarjetas: Tarjeta[]; t: number; v: string }

/** Reconstruye el calendario (reservas y bloqueos) consultando a Cloudbeds y lo guarda. */
async function refrescarCalendario(x: Ctx, key: string, start: string, end: string): Promise<EntradaCalendario> {
  const v = await getVersion(x)
  const tipos = await obtenerTipos(x)
  // Una consulta por cabaña, en paralelo (Cloudbeds las atiende juntas en ~1 s), más los bloqueos.
  const [porCabana, bloqueos] = await Promise.all([
    Promise.all(tipos.map((t) => reservasDeCabana(x, t.roomTypeID, start, end))),
    bloqueosDeRango(x, start, end),
  ])
  const entrada: EntradaCalendario = { start, end, tarjetas: [...porCabana.flat(), ...bloqueos], t: Date.now(), v }
  await enFondo(x, guardar(x, key, JSON.stringify(entrada), { expirationTtl: GUARDADO_SEG }))
  return entrada
}

async function calendario(req: Request, x: Ctx, ctx: ExecutionContext): Promise<Response> {
  const q = new URL(req.url).searchParams
  const { start, end } = parseRange(q.get('start'), q.get('end'), MAX_NIGHTS_CALENDARIO)
  const key = `cal3:${start}:${end}`
  const responder = (e: EntradaCalendario, obsoleto: boolean, cache: string) =>
    new Response(JSON.stringify({ start: e.start, end: e.end, tarjetas: e.tarjetas, actualizado: e.t, obsoleto }), {
      headers: { ...cors(x.env), 'Content-Type': 'application/json', 'X-Cache': cache },
    })

  const [raw, version] = await leerVarios(x, [key, 'avail:version'])
  const previa = raw ? (JSON.parse(raw) as EntradaCalendario) : null
  // Sin nada guardado (o actualización pedida a mano): hay que ir a Cloudbeds y esperar.
  if (!previa || q.get('fresh') === '1') return responder(await refrescarCalendario(x, key, start, end), false, 'MISS')

  const obsoleto = Date.now() - previa.t > FRESCO_MS || previa.v !== (version ?? '0')
  if (obsoleto) {
    const lock = `${key}:lock`
    if (await reclamar(x, lock, '1', CANDADO_SEG)) {
      ctx.waitUntil(
        refrescarCalendario(x, key, start, end)
          .catch(() => undefined)
          .finally(() => borrar(x, lock)),
      )
    }
  }
  return responder(previa, obsoleto, obsoleto ? 'STALE' : 'HIT')
}

async function anotarReserva(req: Request, x: Ctx, id: string): Promise<Response> {
  const b = (await req.json().catch(() => null)) as { nota?: string } | null
  const nota = typeof b?.nota === 'string' ? b.nota.trim() : ''
  if (!nota || nota.length > 500) throw new HttpError(400, 'La nota debe tener entre 1 y 500 caracteres')
  await cloudbeds(x, 'POST', 'postReservationNote', { reservationID: id, reservationNote: nota })
  return json(x.env, { ok: true }, 201)
}

// ---------- webhooks ----------

async function bumpVersion(x: Ctx): Promise<void> {
  await guardar(x, 'avail:version', String(Date.now()))
}

// Cada cuenta de Cloudbeds avisa a su propia URL: /api/webhooks/cloudbeds/<orgId>. La URL sin orgId (la primera que se
// registró) sigue sirviendo a la organización «legado».
async function webhook(req: Request, env: Env, ctx: ExecutionContext, orgId: string | null): Promise<Response> {
  const { mapa, legado } = conexiones(env)
  const c = mapa.get(orgId ?? legado ?? '')
  if (!c) return new Response('forbidden', { status: 403 })
  const x: Ctx = { env, c, t: {} }
  const secret = req.headers.get('X-Webhook-Secret') || ''
  if (!timingSafeEqual(secret, c.webhookSecret)) return new Response('forbidden', { status: 403 })
  // Responder 2xx de inmediato (Cloudbeds cuenta más de ~2 s como fallo): se invalida el caché y, si el aviso es de una
  // reserva, se sincroniza con el POS por detrás. Todo es idempotente: el orden y los duplicados no importan.
  const cuerpo = (await req.json().catch(() => null)) as Dict | null
  const reserva = cuerpo?.reservationID ?? cuerpo?.reservationId
  // Solo el nombre del evento y las claves (sin valores ni datos de huéspedes): sirve para comprobar el formato real.
  console.log(JSON.stringify({ origen: 'webhook', org: c.orgId, evento: cuerpo?.event ?? null, claves: Object.keys(cuerpo ?? {}) }))
  const sincronizar = reserva != null && env.SUPABASE_SERVICE_KEY
    ? sincronizarReserva(x, String(reserva)).then(
      (r) => { if (r !== 'sin-cambios' && r !== 'omitida') console.log(JSON.stringify({ origen: 'sync-cloudbeds', via: 'aviso', reserva: String(reserva), resultado: r })) },
      (e) => console.error(JSON.stringify({ origen: 'sync-cloudbeds', via: 'aviso', reserva: String(reserva), error: e instanceof Error ? e.message : 'desconocido' })),
    )
    : Promise.resolve()
  ctx.waitUntil(Promise.all([bumpVersion(x), guardar(x, 'webhook:ultimo', String(Date.now())), sincronizar]))
  return new Response('ok')
}

// ---------- bloqueos de habitación ----------

const MAX_NOCHES_BLOQUEO = 366

interface BloqueoBody { roomTypeIDs: string[]; start: string; end: string; motivo: string; tipo?: string }

function validarBloqueo(b: BloqueoBody | null) {
  if (!b || !Array.isArray(b.roomTypeIDs) || b.roomTypeIDs.length < 1 || b.roomTypeIDs.length > 20 || !b.roomTypeIDs.every((id) => /^\d{3,30}$/.test(String(id)))) {
    throw new HttpError(400, 'Elige al menos una cabaña')
  }
  const { start, end } = parseRange(b.start, b.end, MAX_NOCHES_BLOQUEO)
  if (!str(b.motivo, 200)) throw new HttpError(400, 'Indica el motivo del bloqueo (máx. 200 caracteres)')
  const tipo = b.tipo === 'out_of_service' ? 'out_of_service' : 'blocked_dates'
  return { ids: b.roomTypeIDs.map(String), start, end, motivo: b.motivo.trim(), tipo }
}

// Cada cabaña es un tipo de habitación con una sola unidad: su roomID es «<roomTypeID>-0».
async function crearBloqueo(req: Request, x: Ctx): Promise<Response> {
  const v = validarBloqueo((await req.json().catch(() => null)) as BloqueoBody | null)
  const res = await cloudbeds<{ roomBlockID?: string }>(x, 'POST', 'postRoomBlock', {
    roomBlockType: v.tipo,
    roomBlockReason: v.motivo,
    startDate: v.start,
    endDate: v.end,
    rooms: v.ids.map((id) => ({ roomID: `${id}-0`, roomTypeID: id })),
  })
  await bumpVersion(x)
  return json(x.env, { roomBlockID: res.roomBlockID ? String(res.roomBlockID) : null }, 201)
}

async function eliminarBloqueo(req: Request, x: Ctx, id: string): Promise<Response> {
  await cloudbeds(x, 'POST', 'deleteRoomBlock', { roomBlockID: id })
  await bumpVersion(x)
  return json(x.env, { ok: true })
}

// ---------- detalle de una reserva existente (para «adoptarla» en el POS) ----------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Dict = Record<string, any>

/** Desglose del total según `balanceDetailed` de Cloudbeds; null si la reserva no lo trae. */
function desgloseDe(d: Dict): { hospedaje: number; extras: number; impuestos: number; total: number; pagado: number } | null {
  const b = d.balanceDetailed
  if (!b || typeof b !== 'object') return null
  const n = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100
  return { hospedaje: n(b.subTotal), extras: n(b.additionalItems), impuestos: n(b.taxesFees), total: n(b.grandTotal ?? d.total), pagado: n(b.paid) }
}

async function detalleReserva(req: Request, x: Ctx, id: string): Promise<Response> {
  return json(x.env, await leerDetalleCloudbeds(x, id))
}

type DetalleCloudbeds = Awaited<ReturnType<typeof leerDetalleCloudbeds>>

/** Una reserva de Cloudbeds, ya traducida (la usan el detalle del POS y la sincronización de vuelta). */
async function leerDetalleCloudbeds(x: Ctx, id: string) {
  const raw = await cloudbeds<{ data?: Dict }>(x, 'GET', 'getReservation', { reservationID: id })
  const d: Dict = raw.data ?? {}
  const huespedes: Dict[] = Object.values(d.guestList ?? {})
  const p: Dict = huespedes.find((g) => g.isMainGuest) ?? huespedes[0] ?? {}
  const cuartos: Dict[] = [...(d.assigned ?? []), ...(d.unassigned ?? [])]
  return {
    // Para la sincronización: el id del POS si la creó el POS, y cuándo se creó en Cloudbeds.
    externo: d.thirdPartyIdentifier ? String(d.thirdPartyIdentifier) : null,
    creada: d.dateCreated ? String(d.dateCreated) : null,
    reservationID: String(d.reservationID ?? id),
    estado: String(d.status ?? ''),
    llegada: String(d.startDate ?? ''),
    salida: String(d.endDate ?? ''),
    total: Number(d.total) || 0,
    // Cómo se compone el total en Cloudbeds: hospedaje (las noches), extras cargados allá (actividades, spa…) e impuestos.
    desglose: desgloseDe(d),
    saldo: d.balance != null ? Number(d.balance) : null,
    fuente: typeof d.source === 'string' ? d.source : null,
    // En Cloudbeds las fuentes de canales externos (Booking, Expedia, OTA…) tienen un id que empieza por «ss-».
    fuenteExterna: String(d.sourceID ?? '').startsWith('ss-'),
    habitaciones: cuartos.map((r) => ({
      roomTypeID: String(r.roomTypeID),
      nombre: String(r.roomTypeName ?? ''),
      adultos: Number(r.adults) || 1,
      ninos: Number(r.children) || 0,
    })),
    huesped: {
      nombre: String(p.guestFirstName ?? ''),
      apellido: String(p.guestLastName ?? ''),
      email: String(p.guestEmail ?? d.guestEmail ?? ''),
      telefono: String(p.guestPhone || p.guestCellPhone || ''),
      pais: String(p.guestCountry ?? ''),
    },
  }
}

// ---------- salud de la integración ----------

// Para el panel «Estado» del POS: ¿responde Cloudbeds con la key actual (caduca si pasan 30 días sin uso)? ¿siguen
// llegando avisos? No usa caché: es una comprobación real.
async function salud(req: Request, x: Ctx): Promise<Response> {
  const t0 = Date.now()
  let cloudbedsOk = true
  let error: string | null = null
  let propiedad: string | null = null
  try {
    const d = await cloudbeds<{ data?: { propertyName?: string } }>(x, 'GET', 'getHotelDetails')
    propiedad = d.data?.propertyName ?? null
  } catch (e) {
    cloudbedsOk = false
    error = e instanceof HttpError ? e.message : 'No se pudo consultar Cloudbeds'
  }
  const [ultimo, reintento, sync] = await leerVarios(x, ['webhook:ultimo', 'reintento:ultimo', 'sync:ultimo'])
  return json(x.env, {
    cloudbeds: { ok: cloudbedsOk, ms: Date.now() - t0, error, propiedad },
    ultimoAvisoWebhook: ultimo ? Number(ultimo) : null,
    reintentoServidor: reintento ? JSON.parse(reintento) : null,
    // Sincronización de vuelta (Cloudbeds → POS): última ronda y si el servidor tiene con qué hacerla.
    sincronizacion: { activa: Boolean(x.env.SUPABASE_SERVICE_KEY), ultima: sync ? JSON.parse(sync) : null },
  })
}

// ---------- reintento de reservas pendientes (tarea programada) ----------

// Una reserva queda «pendiente» cuando se guardó en el POS pero Cloudbeds no respondió. El POS la reintenta mientras haya un
// equipo abierto; esta tarea (cada pocos minutos) lo hace desde el servidor para que una reserva no quede sin subir —y la
// cabaña libre en Cloudbeds— si nadie tiene el POS abierto. Usa la misma clave de idempotencia que el POS (el id de la reserva),
// así que nunca duplica una reserva aunque coincida con un reintento del POS.
const ESPERA_REINTENTO_MS = 3 * 60_000 // el POS tiene prioridad en los primeros minutos
const VIGENCIA_REINTENTO_MS = 7 * 86_400_000 // la clave de idempotencia dura 7 días
const MAX_REINTENTOS_POR_ORG = 10

interface FilaPendiente {
  id: string
  room_type_id: string
  llegada: string
  salida: string
  adultos: number
  ninos: number
  huesped_nombre: string
  huesped_apellido: string
  huesped_email: string
  huesped_telefono: string | null
  huesped_pais: string
  grupo_etiqueta: string | null
  tarifa_manual: boolean
}

function supabaseAdmin(env: Env, ruta: string, init: RequestInit = {}): Promise<Response> {
  const clave = env.SUPABASE_SERVICE_KEY as string
  return fetch(`${env.SUPABASE_URL}/rest/v1/${ruta}`, {
    ...init,
    headers: { apikey: clave, Authorization: `Bearer ${clave}`, 'Content-Type': 'application/json', Prefer: 'return=minimal', ...(init.headers ?? {}) },
    signal: AbortSignal.timeout(8000),
  })
}

async function reintentarPendientesDeOrg(x: Ctx): Promise<{ subidas: number; rechazadas: number; pendientes: number }> {
  const out = { subidas: 0, rechazadas: 0, pendientes: 0 }
  const q = new URLSearchParams({
    select: 'id,room_type_id,llegada,salida,adultos,ninos,huesped_nombre,huesped_apellido,huesped_email,huesped_telefono,huesped_pais,grupo_etiqueta,tarifa_manual',
    organization_id: `eq.${x.c.orgId}`,
    estado: 'eq.confirmada',
    sync_estado: 'eq.pendiente',
    cloudbeds_reservation_id: 'is.null',
    salida: `gte.${new Date().toISOString().slice(0, 10)}`,
    updated_at: `lt.${new Date(Date.now() - ESPERA_REINTENTO_MS).toISOString()}`,
    order: 'created_at.asc',
    limit: String(MAX_REINTENTOS_POR_ORG),
  })
  q.append('created_at', `gte.${new Date(Date.now() - VIGENCIA_REINTENTO_MS).toISOString()}`)
  const res = await supabaseAdmin(x.env, `hotel_reservas?${q}`, { headers: { Prefer: '' } })
  if (!res.ok) throw new Error(`No se pudo leer las pendientes (HTTP ${res.status})`)
  const filas = (await res.json()) as FilaPendiente[]

  for (const f of filas) {
    const cuerpo = {
      start: f.llegada, end: f.salida, adults: f.adultos, children: f.ninos, roomTypeID: f.room_type_id,
      guest: {
        firstName: f.huesped_nombre,
        lastName: f.grupo_etiqueta ? `${f.huesped_apellido} - ${f.grupo_etiqueta}` : f.huesped_apellido,
        email: f.huesped_email, phone: f.huesped_telefono ?? undefined, country: f.huesped_pais,
      },
      externalId: f.id,
      sendEmailConfirmation: false,
    }
    const peticion = new Request('https://interno/api/reservations', {
      method: 'POST',
      headers: { 'Idempotency-Key': f.id, 'X-Reintento': '1', 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    })
    try {
      const r = await crearReserva(peticion, x)
      const d = (await r.json()) as { reservationID?: string; grandTotal?: number | null }
      if (!d.reservationID) throw new HttpError(502, 'Cloudbeds no devolvió el código de la reserva')
      // Solo si nadie la subió mientras tanto (el POS pudo hacerlo a la vez): no se pisa un enlace ya guardado.
      const total = typeof d.grandTotal === 'number' ? { total_cloudbeds: d.grandTotal, ...(f.tarifa_manual ? {} : { total_estadia: d.grandTotal }) } : {}
      await supabaseAdmin(x.env, `hotel_reservas?id=eq.${f.id}&cloudbeds_reservation_id=is.null`, {
        method: 'PATCH',
        body: JSON.stringify({ cloudbeds_reservation_id: d.reservationID, sync_estado: 'sincronizada', sync_error: null, updated_at: new Date().toISOString(), ...total }),
      })
      out.subidas++
    } catch (e) {
      const estado = e instanceof HttpError ? e.status : 500
      const mensaje = e instanceof Error ? e.message : 'Error desconocido'
      // Igual que en el POS: solo un rechazo definitivo (sin cupo, datos inválidos) cancela la reserva local; lo pasajero sigue pendiente.
      if (estado < 500 && estado !== 429 && estado !== 401 && estado !== 403) {
        await supabaseAdmin(x.env, `hotel_reservas?id=eq.${f.id}&cloudbeds_reservation_id=is.null`, {
          method: 'PATCH',
          body: JSON.stringify({ sync_estado: 'error', sync_error: mensaje.slice(0, 300), estado: 'cancelada', updated_at: new Date().toISOString() }),
        })
        out.rechazadas++
      } else {
        out.pendientes++
      }
    }
  }
  return out
}

async function reintentarPendientesServidor(env: Env): Promise<void> {
  if (!env.SUPABASE_SERVICE_KEY) return
  let mapa: Map<string, Conexion>
  try { mapa = conexiones(env).mapa } catch (e) { console.error('Reintento: configuración inválida', e instanceof Error ? e.message : e); return }
  for (const c of mapa.values()) {
    const x: Ctx = { env, c, t: {} }
    try {
      const r = await reintentarPendientesDeOrg(x)
      if (r.subidas + r.rechazadas + r.pendientes > 0) console.log(JSON.stringify({ origen: 'reintento-servidor', org: c.orgId, ...r }))
      await guardar(x, 'reintento:ultimo', JSON.stringify({ t: Date.now(), ...r }))
    } catch (e) {
      console.error(JSON.stringify({ origen: 'reintento-servidor', org: c.orgId, error: e instanceof Error ? e.message : 'desconocido' }))
    }
    // Red de seguridad de la sincronización de vuelta (por si se perdió algún aviso de Cloudbeds).
    try {
      const s = await sincronizarDesdeCloudbeds(x)
      if (s.enlazada + s.cancelada + s.cambiada + s.creada + s.errores > 0) console.log(JSON.stringify({ origen: 'sync-cloudbeds', via: 'ronda', org: c.orgId, ...s }))
      await guardar(x, 'sync:ultimo', JSON.stringify({ t: Date.now(), ...s }))
    } catch (e) {
      console.error(JSON.stringify({ origen: 'sync-cloudbeds', via: 'ronda', org: c.orgId, error: e instanceof Error ? e.message : 'desconocido' }))
    }
  }
}

// ---------- sincronización de vuelta: Cloudbeds → POS (fase 2) ----------

// Lo que cambia en Cloudbeds (desde Booking, la extranet o el propio Cloudbeds) se aplica solo en el POS:
//  - Reserva ya enlazada: cancelación (o no presentado), fechas, cabaña y huéspedes, con la tarifa nueva de Cloudbeds
//    (salvo tarifa manual). Queda en el historial y en `aviso_cloudbeds` para que una persona revise lo que el servidor NO
//    toca: la venta del Centro de Ventas (el dinero nunca cambia solo) y el cargo del plan de alimentación.
//  - Reserva del POS que quedó sin enlazar (la respuesta al crearla se perdió): se enlaza.
//  - Reserva NUEVA de otro canal: se crea sola en el POS, ya enlazada, sin venta ni cliente.
// Entra por dos caminos: el aviso (webhook) de cada reserva y, como red de seguridad por si un aviso se pierde, la tarea
// programada, que revisa lo modificado en Cloudbeds desde la última vez. Todo es idempotente: aplicar dos veces no cambia nada.

// Lo que el propio POS acaba de escribir en Cloudbeds no se «sincroniza de vuelta»: el POS ya actualiza su registro.
const PROPIO_SEG = 180
const marcarPropio = (x: Ctx, id: string) => guardar(x, `propio:${id}`, '1', { expirationTtl: PROPIO_SEG })

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RESERVA_RE = /^[A-Za-z0-9-]{1,40}$/
const MAX_EVENTOS_HISTORIAL = 200
// Una reserva se considera NUEVA si se creó después de activar la sincronización (con margen por la zona horaria de las
// fechas de Cloudbeds). Las que ya existían se siguen enlazando a mano desde el calendario.
const MARGEN_CREADA_MS = 6 * 3600_000
const MAX_SINCRONIZAR_POR_RONDA = 20

interface FilaPos {
  id: string
  cloudbeds_reservation_id: string | null
  room_type_id: string
  cabana: string
  llegada: string
  salida: string
  adultos: number
  ninos: number
  estado: string
  tarifa_manual: boolean
  historial: unknown
  updated_at: string
}
const COLUMNAS_POS = 'id,cloudbeds_reservation_id,room_type_id,cabana,llegada,salida,adultos,ninos,estado,tarifa_manual,historial,updated_at'

type ResultadoSync = 'sin-cambios' | 'enlazada' | 'cancelada' | 'cambiada' | 'creada' | 'omitida'

const evento = (tipo: string, texto: string) => ({ id: crypto.randomUUID(), fecha: new Date().toISOString(), tipo, texto, usuario: 'Cloudbeds' })
const hoyUTC = () => new Date().toISOString().slice(0, 10)
const ddmm = (f: string) => f.split('-').reverse().slice(0, 2).join('/')
const hospedajeDe = (det: DetalleCloudbeds) => (det.desglose && det.desglose.hospedaje > 0 ? det.desglose.hospedaje : det.total)

/** Reservas del POS de esta organización enlazadas a esos códigos de Cloudbeds, o creadas por el POS con esos ids. */
async function filasPos(x: Ctx, codigos: string[], externos: string[]): Promise<FilaPos[]> {
  const partes: string[] = []
  const cods = codigos.filter((c) => RESERVA_RE.test(c))
  const ext = externos.filter((e) => UUID_RE.test(e))
  if (cods.length) partes.push(`cloudbeds_reservation_id.in.(${cods.map((c) => `"${c}"`).join(',')})`)
  if (ext.length) partes.push(`id.in.(${ext.join(',')})`)
  if (!partes.length) return []
  const q = new URLSearchParams({ select: COLUMNAS_POS, organization_id: `eq.${x.c.orgId}`, or: `(${partes.join(',')})` })
  const res = await supabaseAdmin(x.env, `hotel_reservas?${q}`, { headers: { Prefer: '' } })
  if (!res.ok) throw new Error(`No se pudieron leer las reservas del POS (HTTP ${res.status})`)
  return (await res.json()) as FilaPos[]
}

async function nombreCabanaPos(x: Ctx, roomTypeID: string): Promise<string | null> {
  const q = new URLSearchParams({ select: 'nombre', organization_id: `eq.${x.c.orgId}`, cloudbeds_room_type_id: `eq.${roomTypeID}`, limit: '1' })
  const res = await supabaseAdmin(x.env, `hotel_habitaciones?${q}`, { headers: { Prefer: '' } })
  const filas = res.ok ? ((await res.json()) as Array<{ nombre: string }>) : []
  return filas[0]?.nombre ?? null
}

/**
 * Aplica `patch` y agrega `eventos` al historial sin pisar lo que otro equipo guardó a la vez (se compara `updated_at`,
 * igual que el POS). Si la columna del aviso aún no existe (falta la migración), se guarda sin ella.
 */
async function actualizarFilaPos(x: Ctx, fila: FilaPos, patch: Dict, eventos: Dict[]): Promise<void> {
  let actual: FilaPos | undefined = fila
  let cuerpo = patch
  for (let intento = 0; intento < 3 && actual; intento++) {
    const historial = [...(Array.isArray(actual.historial) ? actual.historial : []), ...eventos].slice(-MAX_EVENTOS_HISTORIAL)
    const res = await supabaseAdmin(
      x.env,
      `hotel_reservas?id=eq.${actual.id}&organization_id=eq.${x.c.orgId}&updated_at=eq.${encodeURIComponent(actual.updated_at)}`,
      { method: 'PATCH', headers: { Prefer: 'return=representation' }, body: JSON.stringify({ ...cuerpo, historial, updated_at: new Date().toISOString() }) },
    )
    if (!res.ok) {
      const texto = await res.text()
      if ('aviso_cloudbeds' in cuerpo && /aviso_cloudbeds/.test(texto)) {
        console.warn('hotel_reservas sin columna aviso_cloudbeds: falta la migración 20261019000500')
        const { aviso_cloudbeds: _, ...resto } = cuerpo
        cuerpo = resto
        intento--
        continue
      }
      throw new Error(`No se pudo actualizar la reserva del POS (HTTP ${res.status})`)
    }
    if (((await res.json()) as unknown[]).length > 0) return
    // Otro equipo la cambió mientras tanto: se vuelve a leer y se reintenta.
    actual = (await filasPos(x, [], [fila.id]))[0]
  }
  if (actual) throw new Error('La reserva del POS cambió varias veces seguidas; se reintentará en la próxima ronda')
}

async function inicioSincronizacion(x: Ctx): Promise<number> {
  const guardado = Number(await leer(x, 'sync:inicio'))
  if (guardado > 0) return guardado
  const ahora = Date.now()
  await guardar(x, 'sync:inicio', String(ahora))
  return ahora
}

/** ¿Se creó en Cloudbeds después de activar la sincronización? (fechas de Cloudbeds «AAAA-MM-DD HH:mm:ss»). */
async function esNueva(x: Ctx, creada: string | null): Promise<boolean> {
  const ms = creada ? Date.parse(creada.replace(' ', 'T') + 'Z') : NaN
  return Number.isFinite(ms) && ms >= (await inicioSincronizacion(x)) - MARGEN_CREADA_MS
}

/** Crea en el POS una reserva nueva de otro canal (Booking, Expedia, web), ya enlazada y sin venta. */
async function crearDesdeCloudbeds(x: Ctx, det: DetalleCloudbeds): Promise<ResultadoSync> {
  if (ESTADOS_FUERA.has(det.estado) || det.salida < hoyUTC()) return 'omitida'
  // Varias cabañas en una reserva: el POS gestiona una por registro (se ve en el calendario y se maneja en Cloudbeds).
  if (det.habitaciones.length !== 1) return 'omitida'
  // La creó un POS (de otra organización, o se borró aquí): no se duplica.
  if (det.externo && UUID_RE.test(det.externo)) return 'omitida'
  if (!(await esNueva(x, det.creada))) return 'omitida'
  const hab = det.habitaciones[0]
  const d = det.desglose
  const fecha = new Date().toISOString()
  const extras = [
    ...(d && d.extras > 0.005 ? [{ id: 'cb-extras', descripcion: 'Extras cargados en Cloudbeds', monto: d.extras, fecha, origen: 'cloudbeds' }] : []),
    ...(d && d.impuestos > 0.005 ? [{ id: 'cb-impuestos', descripcion: 'Impuestos y cargos de Cloudbeds', monto: d.impuestos, fecha, origen: 'cloudbeds' }] : []),
  ]
  const hospedaje = hospedajeDe(det)
  const fila = {
    id: crypto.randomUUID(),
    organization_id: x.c.orgId,
    cloudbeds_reservation_id: det.reservationID,
    room_type_id: hab.roomTypeID,
    cabana: (await nombreCabanaPos(x, hab.roomTypeID)) ?? hab.nombre,
    llegada: det.llegada,
    salida: det.salida,
    adultos: Math.max(1, hab.adultos),
    ninos: Math.max(0, hab.ninos),
    huesped_nombre: det.huesped.nombre.trim() || 'Huésped',
    huesped_apellido: det.huesped.apellido.trim() || '—',
    huesped_email: det.huesped.email.trim(),
    huesped_telefono: det.huesped.telefono.trim() || null,
    huesped_pais: /^[A-Za-z]{2}$/.test(det.huesped.pais) ? det.huesped.pais.toUpperCase() : 'EC',
    total_cloudbeds: hospedaje,
    total_estadia: hospedaje,
    extras,
    tarifa_manual: false,
    estado: 'confirmada',
    sync_estado: 'sincronizada',
    adoptada: true,
    fuente_nombre: det.fuente,
    fuente_externa: det.fuenteExterna,
    usuario_nombre: 'Cloudbeds',
    historial: [evento('creada', `Creada automáticamente desde Cloudbeds${det.fuente ? ` (${det.fuente})` : ''}`)],
  }
  const res = await supabaseAdmin(x.env, 'hotel_reservas', { method: 'POST', body: JSON.stringify(fila) })
  if (res.status === 409) return 'sin-cambios' // ya se creó (otro aviso de la misma reserva llegó antes)
  if (!res.ok) throw new Error(`No se pudo crear la reserva en el POS (HTTP ${res.status}): ${(await res.text()).slice(0, 160)}`)
  return 'creada'
}

/** Trae la reserva de Cloudbeds y deja el POS igual. `filas`: las del POS ya leídas (la tarea programada las lee juntas). */
async function sincronizarReserva(x: Ctx, id: string, filas?: FilaPos[]): Promise<ResultadoSync> {
  if (!RESERVA_RE.test(id)) return 'omitida'
  if (await leer(x, `propio:${id}`)) return 'omitida'
  // Una sola sincronización a la vez por reserva (llegan varios avisos juntos); la siguiente ronda recoge lo que falte.
  const candado = `sync:${id}`
  if (!(await reclamar(x, candado, '1', 60))) return 'omitida'
  try {
    const det = await leerDetalleCloudbeds(x, id)
    const lista = filas ?? (await filasPos(x, [id], det.externo ? [det.externo] : []))
    const fila = lista.find((f) => f.cloudbeds_reservation_id === id) ?? lista.find((f) => !!det.externo && f.id === det.externo)
    if (!fila) return await crearDesdeCloudbeds(x, det)
    if (fila.estado !== 'confirmada') return 'sin-cambios'

    const patch: Dict = {}
    const eventos: Dict[] = []
    let resultado: ResultadoSync = 'sin-cambios'
    if (!fila.cloudbeds_reservation_id) {
      Object.assign(patch, { cloudbeds_reservation_id: id, sync_estado: 'sincronizada', sync_error: null })
      eventos.push(evento('sync', `Enlazada con Cloudbeds ${id} (la respuesta al crearla se había perdido)`))
      resultado = 'enlazada'
    }
    if (ESTADOS_FUERA.has(det.estado)) {
      const donde = det.fuenteExterna ? `en ${det.fuente ?? 'el canal'} / Cloudbeds` : 'en Cloudbeds'
      const que = det.estado === 'no_show' ? 'Marcada como no presentada' : 'Cancelada'
      Object.assign(patch, {
        estado: 'cancelada',
        sync_error: det.estado === 'no_show' ? 'No se presentó (Cloudbeds)' : 'Cancelada en Cloudbeds',
        aviso_cloudbeds: { tipo: 'cancelada', texto: `${que} ${donde}`, donde, fecha: new Date().toISOString() },
      })
      eventos.push(evento('cancelada', `${que} ${donde} (aplicado automáticamente)`))
      resultado = 'cancelada'
    } else if (det.habitaciones.length === 1) {
      const h = det.habitaciones[0]
      const cambios: string[] = []
      if (det.llegada !== fila.llegada || det.salida !== fila.salida) {
        Object.assign(patch, { llegada: det.llegada, salida: det.salida })
        cambios.push(`fechas ${ddmm(det.llegada)} → ${ddmm(det.salida)}`)
      }
      if (h.roomTypeID !== fila.room_type_id) {
        const cabana = (await nombreCabanaPos(x, h.roomTypeID)) ?? h.nombre
        Object.assign(patch, { room_type_id: h.roomTypeID, cabana })
        cambios.push(`cabaña ${cabana}`)
      }
      if (Math.max(1, h.adultos) !== fila.adultos || Math.max(0, h.ninos) !== fila.ninos) {
        Object.assign(patch, { adultos: Math.max(1, h.adultos), ninos: Math.max(0, h.ninos) })
        cambios.push(`${h.adultos} adulto${h.adultos === 1 ? '' : 's'}${h.ninos ? ` y ${h.ninos} niño${h.ninos === 1 ? '' : 's'}` : ''}`)
      }
      if (cambios.length > 0) {
        const hospedaje = hospedajeDe(det)
        Object.assign(patch, {
          total_cloudbeds: hospedaje,
          ...(fila.tarifa_manual ? {} : { total_estadia: hospedaje }),
          aviso_cloudbeds: { tipo: 'cambiada', texto: `En Cloudbeds cambió: ${cambios.join(' y ')}`, llegada: det.llegada, salida: det.salida, fecha: new Date().toISOString() },
        })
        eventos.push(evento('fechas', `Actualizada desde Cloudbeds: ${cambios.join(', ')} · tarifa $${hospedaje.toFixed(2)}${fila.tarifa_manual ? ' (se conserva la tarifa manual)' : ''}`))
        resultado = 'cambiada'
      }
    }
    if (Object.keys(patch).length === 0) return 'sin-cambios'
    await actualizarFilaPos(x, fila, patch, eventos)
    return resultado
  } finally {
    await borrar(x, candado)
  }
}

/** ¿Lo que dice la lista de Cloudbeds difiere del POS (o es una reserva nueva que crear)? Evita consultas de más. */
function hayQueSincronizar(r: Dict, fila: FilaPos | undefined): boolean {
  const rooms: Dict[] = Array.isArray(r.rooms) ? r.rooms : []
  if (!fila) return !ESTADOS_FUERA.has(String(r.status)) && String(r.endDate) >= hoyUTC() && rooms.length === 1 && !UUID_RE.test(String(r.thirdPartyIdentifier ?? ''))
  if (fila.estado !== 'confirmada') return false
  if (!fila.cloudbeds_reservation_id || ESTADOS_FUERA.has(String(r.status))) return true
  if (rooms.length !== 1) return false
  const h = rooms[0]
  return String(r.startDate) !== fila.llegada || String(r.endDate) !== fila.salida || String(h.roomTypeID) !== fila.room_type_id
    || Math.max(1, Number(h.adults) || 1) !== fila.adultos || Math.max(0, Number(h.children) || 0) !== fila.ninos
}

const fechaCloudbeds = (ms: number) => new Date(ms).toISOString().slice(0, 19).replace('T', ' ')

/**
 * Red de seguridad de los avisos: revisa lo modificado en Cloudbeds desde la última ronda (con margen: las fechas de
 * Cloudbeds pueden ir en la hora local) y sincroniza lo que difiera. Lo ya revisado con la misma fecha de modificación se salta.
 */
async function sincronizarDesdeCloudbeds(x: Ctx): Promise<Record<ResultadoSync | 'errores', number>> {
  const out: Record<ResultadoSync | 'errores', number> = { 'sin-cambios': 0, enlazada: 0, cancelada: 0, cambiada: 0, creada: 0, omitida: 0, errores: 0 }
  const ahora = Date.now()
  await inicioSincronizacion(x)
  const cursor = Number(await leer(x, 'sync:cursor')) || ahora - 3600_000
  const lista: Dict[] = []
  for (let pagina = 1; pagina <= 5; pagina++) {
    const raw = await cloudbeds<{ data?: Dict[] }>(x, 'GET', 'getReservations', {
      modifiedFrom: fechaCloudbeds(cursor - MARGEN_CREADA_MS),
      modifiedTo: fechaCloudbeds(ahora + 14 * 3600_000),
      includeAllRooms: true,
      pageSize: 100,
      pageNumber: pagina,
    })
    lista.push(...(raw.data ?? []))
    if ((raw.data ?? []).length < 100) break
  }
  const marcas = await leerVarios(x, lista.map((r) => `mod:${r.reservationID}`))
  const nuevas = lista.filter((r, i) => marcas[i] !== String(r.dateModified))
  if (nuevas.length > 0) {
    const filas = await filasPos(x, nuevas.map((r) => String(r.reservationID)), nuevas.map((r) => String(r.thirdPartyIdentifier ?? '')))
    let consultas = 0
    for (const r of nuevas) {
      const id = String(r.reservationID)
      const fila = filas.find((f) => f.cloudbeds_reservation_id === id) ?? filas.find((f) => f.id === String(r.thirdPartyIdentifier ?? ''))
      // Sin registro en el POS solo interesa si es NUEVA (la lista ya trae cuándo se creó: no hace falta consultarla).
      if (hayQueSincronizar(r, fila) && (fila || (await esNueva(x, r.dateCreated ? String(r.dateCreated) : null)))) {
        if (consultas >= MAX_SINCRONIZAR_POR_RONDA) continue // el resto, en la próxima ronda (límite de peticiones)
        consultas++
        try { out[await sincronizarReserva(x, id, filas)]++ } catch (e) {
          out.errores++
          console.error(JSON.stringify({ origen: 'sync-cloudbeds', reserva: id, error: e instanceof Error ? e.message : 'desconocido' }))
          continue
        }
      }
      await guardar(x, `mod:${id}`, String(r.dateModified), { expirationTtl: 2 * 86_400 })
    }
  }
  await guardar(x, 'sync:cursor', String(ahora))
  return out
}

// ---------- router ----------

export default {
  // Tarea programada (ver `triggers.crons` en wrangler.jsonc).
  async scheduled(_evento: ScheduledController, env: Env, ctx: ExecutionContext): Promise<void> {
    ctx.waitUntil(reintentarPendientesServidor(env))
  },

  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const origen = req.headers.get('Origin') || ''
    const t0 = Date.now()
    let medidas: Record<string, number> = {}
    // Server-Timing (visible en DevTools › Network › Timing y en el aviso «lento» del POS): dónde se fue el tiempo.
    const fin = (res: Response) => conCors(res, env, origen, [`total;dur=${Date.now() - t0}`, ...Object.entries(medidas).map(([k, v]) => `${k};dur=${v}`)].join(', '))
    if (req.method === 'OPTIONS') return fin(new Response(null, { status: 204, headers: cors(env) }))
    const { pathname } = new URL(req.url)
    try {
      const aviso = pathname.match(/^\/api\/webhooks\/cloudbeds(?:\/([A-Za-z0-9-]{8,64}))?$/)
      if (aviso && req.method === 'POST') return fin(await webhook(req, env, ctx, aviso[1] ?? null))
      if (!pathname.startsWith('/api/')) return fin(json(env, { error: 'No encontrado' }, 404))

      // Todo lo demás exige sesión del POS y resuelve la cuenta de Cloudbeds de la organización activa.
      const x = await autorizar(req, env, ctx)
      medidas = x.t
      if (pathname === '/api/room-types' && req.method === 'GET') return fin(await tiposHabitacion(req, x))
      if (pathname === '/api/blocks' && req.method === 'POST') return fin(await crearBloqueo(req, x))
      if (/^\/api\/blocks\/[^/]+\/delete$/.test(pathname) && req.method === 'POST') return fin(await eliminarBloqueo(req, x, reservationId(pathname)))
      if (/^\/api\/reservations\/[^/]+$/.test(pathname) && req.method === 'GET') return fin(await detalleReserva(req, x, reservationId(pathname)))
      if (pathname === '/api/health' && req.method === 'GET') return fin(await salud(req, x))
      if (pathname === '/api/calendar' && req.method === 'GET') return fin(await calendario(req, x, ctx))
      if (pathname === '/api/availability' && req.method === 'GET') return fin(await availability(req, x))
      if (pathname === '/api/reservations' && req.method === 'POST') return fin(await crearReserva(req, x))
      if (/^\/api\/reservations\/[^/]+\/cancel$/.test(pathname) && req.method === 'POST') {
        return fin(await cancelarReserva(req, x, reservationId(pathname)))
      }
      if (/^\/api\/reservations\/[^/]+\/notes$/.test(pathname) && req.method === 'POST') {
        return fin(await anotarReserva(req, x, reservationId(pathname)))
      }
      if (/^\/api\/reservations\/[^/]+$/.test(pathname) && req.method === 'PATCH') {
        return fin(await modificarReserva(req, x, reservationId(pathname)))
      }
      return fin(json(env, { error: 'No encontrado' }, 404))
    } catch (e) {
      if (e instanceof HttpError) return fin(json(env, { error: e.message }, e.status))
      console.error('Error no controlado', e instanceof Error ? e.message : 'desconocido')
      return fin(json(env, { error: 'Error interno' }, 500))
    }
  },
}
