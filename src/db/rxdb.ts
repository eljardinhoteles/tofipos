import { addRxPlugin, createRxDatabase, type RxCollection, type RxDatabase } from 'rxdb/plugins/core'
import { RxDBLeaderElectionPlugin } from 'rxdb/plugins/leader-election'
import { RxDBUpdatePlugin } from 'rxdb/plugins/update'
import { RxDBMigrationSchemaPlugin } from 'rxdb/plugins/migration-schema'
import { getRxStorageDexie } from 'rxdb/plugins/storage-dexie'
import { replicateSupabase } from 'rxdb/plugins/replication-supabase'
import { supabase } from '../lib/supabase'

function withSuppressedDexieWarning<T>(run: () => Promise<T>): Promise<T> {
  const originalWarn = console.warn;
  console.warn = (...args: any[]) => {
    const first = args[0];
    const message = typeof first === 'string' ? first : '';
    const isDexieRxdbWarning =
      message.includes('RxDB Open Core RxStorage') ||
      message.includes('free Dexie.js based RxStorage implementation') ||
      message.includes('rxdb-premium/plugins/shared');

    if (!isDexieRxdbWarning) {
      originalWarn(...args);
    }
  };

  return run().finally(() => {
    console.warn = originalWarn;
  });
}

addRxPlugin(RxDBUpdatePlugin)
addRxPlugin(RxDBLeaderElectionPlugin)
addRxPlugin(RxDBMigrationSchemaPlugin)

export type MesaEstado = 'libre' | 'ocupada' | 'cuenta'
export type ComandaEstado = 'pendiente' | 'en_cocina' | 'listo' | 'cuenta' | 'cerrado' | 'facturado' | 'anulada'
export type ComandaItemEstado = 'pendiente' | 'listo'

export interface RxMesa {
  id: string
  nombre: string
  estado: MesaEstado
  piso: string
  capacidad?: number
  organization_id: string
  _deleted: boolean
  _modified: string
}

export interface RxComanda {
  id: string
  folio: number
  mesa_id: string
  mesa_nombre?: string
  mesero: string
  cliente?: string
  cliente_id?: string
  estado: ComandaEstado
  habitacion_cuenta_id?: string
  nota?: string
  factura_nro?: string
  factura_nota?: string
  confirmada: boolean
  confirmada_at?: string
  total: number
  personas?: number
  created_at: string
  updated_at: string
  motivo_anulacion?: string
  organization_id: string
  _deleted: boolean
  _modified: string
  sincronizado?: boolean
}

export interface RxComandaItem {
  id: string
  comanda_id: string
  item_id: string
  nombre: string
  precio: number
  cantidad: number
  modificadores?: string[]
  nota?: string
  es_bebida?: boolean | null
  estado: ComandaItemEstado
  pagado_cantidad?: number
  created_at?: string
  updated_at: string
  organization_id: string
  _deleted: boolean
  _modified: string
}

export interface RxPiso {
  id: string
  nombre: string
  orden: number
  organization_id: string
  _deleted: boolean
  _modified: string
}

export interface RxHabitacionCuenta {
  id: string
  mesa_id: string
  huesped: string
  cliente_id?: string
  check_in: string
  check_out?: string
  estado: 'activa' | 'cerrada'
  notas?: string
  created_at: string
  updated_at: string
  organization_id: string
  _deleted: boolean
  _modified: string
}

export interface RxReserva {
  id: string
  nombre: string
  fecha: string
  hora: string
  personas: number
  zona_id?: string
  mesa_id?: string
  comanda_id?: string
  estado: 'pendiente' | 'confirmada' | 'cancelada' | 'completada'
  nota?: string
  abono?: number
  telefono?: string
  email?: string
  organization_id: string
  created_at: string
  updated_at: string
  _deleted: boolean
  _modified: string
}

export interface RxCategoria {
  id: string
  nombre: string
  es_comida_incluida?: boolean
  organization_id: string
  _deleted: boolean
  _modified: string
}

async function reconciliarMesasDeHabitacion(db: any) {
  const orgId = localStorage.getItem('pos_active_org_id') || ''
  if (!orgId) return

  const [cuentasActivas, comandasEnHabitacion] = await Promise.all([
    db.habitacion_cuentas.find({
      selector: { organization_id: orgId, estado: 'activa', _deleted: { $ne: true } }
    }).exec(),
    db.comandas.find({
      selector: {
        organization_id: orgId,
        habitacion_cuenta_id: { $ne: null },
        estado: { $nin: ['cerrado', 'facturado', 'anulada'] },
        _deleted: { $ne: true }
      }
    }).exec(),
  ])

  const mesasAReconciliar = new Set<string>()
  cuentasActivas.forEach((cuenta: any) => {
    if (cuenta?.mesa_id) mesasAReconciliar.add(String(cuenta.mesa_id))
  })
  comandasEnHabitacion.forEach((comanda: any) => {
    if (comanda?.mesa_id) mesasAReconciliar.add(String(comanda.mesa_id))
  })

  await Promise.all([...mesasAReconciliar].map(async (mesaId) => {
    const mesa = await db.mesas.findOne(mesaId).exec()
    if (!mesa) return
    if (mesa.toJSON().estado !== 'libre') {
      await mesa.update({
        $set: {
          estado: 'libre',
          _modified: new Date().toISOString()
        }
      } as any)
    }
  }))
}

export interface RxMenuItem {
  id: string
  nombre: string
  precio: number
  categoria_id: string
  categoria_nombre?: string
  activo: boolean
  es_bebida?: boolean
  modificadores: Array<{
    id: string
    nombre: string
    obligatorio: boolean
    multi: boolean
    opciones: string[]
  }>
  favorito?: boolean
  descripcion?: string
  imagen_url?: string
  iva_modalidad?: 'sistema' | 'especifico' | 'exento'
  iva_porcentaje?: number
  organization_id: string
  _deleted: boolean
  _modified: string
}

export interface RxCliente {
  id: string
  nombre: string
  telefono?: string
  email?: string
  direccion?: string
  dni?: string
  notas?: string
  created_at: string
  organization_id: string
  _deleted: boolean
  _modified: string
}

export interface RxPago {
  id: string
  comanda_id: string
  monto: number
  metodo_pago: 'efectivo' | 'tarjeta' | 'transferencia' | 'otros'
  fecha: string
  tipo_division?: string
  factura_nro?: string
  factura_nota?: string
  organization_id: string
  _deleted: boolean
  _modified: string
}

export interface RxAjusteIva {
  id: string
  porcentaje: number
  activo: boolean
  precios_con_iva?: boolean
  organization_id: string
  _deleted: boolean
  _modified: string
}

// Membresía de usuario en una organización. Las credenciales viven SOLO en Supabase Auth
// (user_id = auth.users.id; una misma cuenta puede tener membresías en varias organizaciones).
// Esta tabla es de solo lectura en el cliente y se muta vía la Edge Function manage-users.
export interface RxUsuario {
  id: string
  user_id: string
  nombre: string
  rol: 'admin' | 'mesero' | 'cajero'
  email?: string
  organization_id: string
  activo: boolean
  _deleted: boolean
  _modified: string
}

export interface RxAuditLog {
  id: string
  entity: string
  entity_id?: string
  action: 'create' | 'update' | 'delete' | 'status_change'
  summary: string
  before_state?: string
  after_state?: string
  actor_id?: string
  actor_name?: string
  actor_role?: string
  actor_email?: string
  source?: string
  created_at: string
  organization_id: string
  _deleted: boolean
  _modified: string
}

const mesaSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    nombre: { type: 'string' },
    estado: { type: 'string', enum: ['libre', 'ocupada', 'cuenta'] },
    piso: { type: 'string' },
    capacidad: { type: 'number' },
    organization_id: { type: 'string' },
    _deleted: { type: 'boolean' },
    _modified: { type: 'string' }
  },
  required: ['id', 'nombre', 'estado', 'piso', 'organization_id', '_deleted', '_modified'],
  indexes: ['estado', 'piso', 'organization_id', '_modified']
} as const

const comandaSchema = {
  version: 3,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    folio: { type: 'number' },
    mesa_id: { type: 'string' },
    mesa_nombre: { type: ['string', 'null'] },
    mesero: { type: 'string' },
    cliente: { type: ['string', 'null'] },
    cliente_id: { type: ['string', 'null'] },
    estado: { type: 'string', enum: ['pendiente', 'en_cocina', 'listo', 'cuenta', 'cerrado', 'facturado', 'anulada'] },
    habitacion_cuenta_id: { type: ['string', 'null'] },
    nota: { type: ['string', 'null'] },
    factura_nro: { type: ['string', 'null'] },
    factura_nota: { type: ['string', 'null'] },
    confirmada: { type: 'boolean' },
    confirmada_at: { type: ['string', 'null'] },
    cantidades_snapshot: { type: ['string', 'null'] }, // JSON: { [item_id]: cantidad } al momento de confirmar
    sincronizado: { type: ['boolean', 'null'] },
    total: { type: 'number' },
    personas: { type: ['number', 'null'] },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
    motivo_anulacion: { type: ['string', 'null'] },
    organization_id: { type: 'string' },
    _deleted: { type: 'boolean' },
    _modified: { type: 'string' }
  },
  required: ['id', 'folio', 'mesa_id', 'mesero', 'estado', 'confirmada', 'total', 'created_at', 'updated_at', 'organization_id', '_deleted', '_modified'],
  indexes: ['folio', 'mesa_id', 'estado', 'organization_id', 'updated_at', '_modified']
} as const

const comandaItemSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    comanda_id: { type: 'string' },
    item_id: { type: 'string' },
    nombre: { type: 'string' },
    precio: { type: 'number' },
    cantidad: { type: 'number' },
    modificadores: { type: 'array', items: { type: 'string' } },
    nota: { type: ['string', 'null'] },
    estado: { type: 'string', enum: ['pendiente', 'listo'] },
    pagado_cantidad: { type: ['number', 'null'] },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
    organization_id: { type: 'string' },
    _deleted: { type: 'boolean' },
    _modified: { type: 'string' }
  },
  required: ['id', 'comanda_id', 'item_id', 'nombre', 'precio', 'cantidad', 'estado', 'updated_at', 'organization_id', '_deleted', '_modified'],
  indexes: ['comanda_id', 'item_id', 'estado', 'organization_id', 'updated_at', '_modified']
} as const

const pisoSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    nombre: { type: 'string' },
    orden: { type: 'number' },
    organization_id: { type: 'string' },
    _deleted: { type: 'boolean' },
    _modified: { type: 'string' }
  },
  required: ['id', 'nombre', 'orden', 'organization_id', '_deleted', '_modified'],
  indexes: ['nombre', 'orden', 'organization_id', '_modified']
} as const

const habitacionCuentaSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    mesa_id: { type: 'string' },
    huesped: { type: 'string' },
    cliente_id: { type: 'string' },
    check_in: { type: 'string' },
    check_out: { type: 'string' },
    estado: { type: 'string', enum: ['activa', 'cerrada'] },
    notas: { type: 'string' },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
    organization_id: { type: 'string' },
    _deleted: { type: 'boolean' },
    _modified: { type: 'string' }
  },
  required: ['id', 'mesa_id', 'huesped', 'check_in', 'estado', 'created_at', 'updated_at', 'organization_id', '_deleted', '_modified'],
  indexes: ['mesa_id', 'estado', 'organization_id', 'updated_at', '_modified']
} as const

const reservaSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    nombre: { type: 'string' },
    fecha: { type: 'string' },
    hora: { type: 'string' },
    personas: { type: ['number', 'null'] },
    zona_id: { type: ['string', 'null'] },
    mesa_id: { type: ['string', 'null'] },
    comanda_id: { type: ['string', 'null'] },
    estado: { type: 'string', enum: ['pendiente', 'confirmada', 'cancelada', 'completada'] },
    nota: { type: ['string', 'null'] },
    abono: { type: ['number', 'null'] },
    telefono: { type: ['string', 'null'] },
    email: { type: ['string', 'null'] },
    organization_id: { type: 'string' },
    created_at: { type: 'string' },
    updated_at: { type: 'string' },
    _deleted: { type: 'boolean' },
    _modified: { type: 'string' }
  },
  required: ['id', 'nombre', 'fecha', 'hora', 'personas', 'estado', 'organization_id', 'created_at', 'updated_at', '_deleted', '_modified'],
  indexes: ['fecha', 'estado', 'organization_id', '_modified']
} as const

const categoriaSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    nombre: { type: 'string' },
    es_comida_incluida: { type: 'boolean' },
    organization_id: { type: 'string' },
    _deleted: { type: 'boolean' },
    _modified: { type: 'string' }
  },
  required: ['id', 'nombre', 'organization_id', '_deleted', '_modified'],
  indexes: ['nombre', 'organization_id', '_modified']
} as const

const menuItemSchema = {
  version: 1,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    nombre: { type: 'string' },
    precio: { type: 'number' },
    categoria_id: { type: 'string' },
    categoria_nombre: { type: 'string' },
    activo: { type: 'boolean' },
    es_bebida: { type: ['boolean', 'null'] },
    modificadores: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          nombre: { type: 'string' },
          obligatorio: { type: 'boolean' },
          multi: { type: 'boolean' },
          opciones: { type: 'array', items: { type: 'string' } }
        },
        required: ['id', 'nombre', 'obligatorio', 'multi', 'opciones']
      }
    },
    favorito: { type: ['boolean', 'null'] },
    descripcion: { type: ['string', 'null'] },
    imagen_url: { type: ['string', 'null'] },
    iva_modalidad: { type: ['string', 'null'], enum: ['sistema', 'especifico', 'exento'] },
    iva_porcentaje: { type: ['number', 'null'] },
    organization_id: { type: 'string' },
    _deleted: { type: 'boolean' },
    _modified: { type: 'string' }
  },
  required: ['id', 'nombre', 'precio', 'categoria_id', 'activo', 'modificadores', 'organization_id', '_deleted', '_modified'],
  indexes: ['categoria_id', 'activo', 'organization_id', '_modified']
} as const

const clienteSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    nombre: { type: 'string' },
    telefono: { type: ['string', 'null'] },
    email: { type: ['string', 'null'] },
    direccion: { type: ['string', 'null'] },
    dni: { type: ['string', 'null'] },
    notas: { type: ['string', 'null'] },
    created_at: { type: 'string' },
    organization_id: { type: 'string' },
    _deleted: { type: 'boolean' },
    _modified: { type: 'string' }
  },
  required: ['id', 'nombre', 'created_at', 'organization_id', '_deleted', '_modified'],
  indexes: ['nombre', 'organization_id', '_modified']
} as const

const pagoSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    comanda_id: { type: 'string' },
    monto: { type: 'number' },
    metodo_pago: { type: 'string', enum: ['efectivo', 'tarjeta', 'transferencia', 'otros'] },
    fecha: { type: 'string' },
    tipo_division: { type: 'string' },
    factura_nro: { type: 'string' },
    factura_nota: { type: 'string' },
    organization_id: { type: 'string' },
    _deleted: { type: 'boolean' },
    _modified: { type: 'string' }
  },
  required: ['id', 'comanda_id', 'monto', 'metodo_pago', 'fecha', 'organization_id', '_deleted', '_modified'],
  indexes: ['comanda_id', 'fecha', 'organization_id', '_modified']
} as const

const ajusteIvaSchema = {
  version: 0,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    porcentaje: { type: 'number' },
    activo: { type: 'boolean' },
    precios_con_iva: { type: 'boolean' },
    organization_id: { type: 'string' },
    _deleted: { type: 'boolean' },
    _modified: { type: 'string' }
  },
  required: ['id', 'porcentaje', 'activo', 'organization_id', '_deleted', '_modified'],
  indexes: ['activo', 'organization_id', '_modified']
} as const

const usuarioSchema = {
  version: 3,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    user_id: { type: 'string', maxLength: 100 },
    nombre: { type: 'string' },
    rol: { type: 'string', enum: ['admin', 'mesero', 'cajero'] },
    email: { type: 'string' },
    organization_id: { type: 'string' },
    activo: { type: 'boolean' },
    _deleted: { type: 'boolean' },
    _modified: { type: 'string' }
  },
  required: ['id', 'user_id', 'nombre', 'rol', 'organization_id', 'activo', '_deleted', '_modified'],
  indexes: ['rol', 'activo', 'organization_id', '_modified', 'user_id']
} as const

export type VerticalCollections = {
  clientes: RxCollection<RxCliente>
  categorias: RxCollection<RxCategoria>
  mesas: RxCollection<RxMesa>
  comandas: RxCollection<RxComanda>
  comanda_items: RxCollection<RxComandaItem>
  pisos: RxCollection<RxPiso>
  habitacion_cuentas: RxCollection<RxHabitacionCuenta>
  reservas: RxCollection<RxReserva>
  pagos: RxCollection<RxPago>
  ajustes_iva: RxCollection<RxAjusteIva>
  usuarios: RxCollection<RxUsuario>
  menu_items: RxCollection<RxMenuItem>
}

let verticalDbPromise: Promise<RxDatabase<VerticalCollections>> | null = null
let verticalReplicationState: ReturnType<typeof startVerticalReplication> | null = null
let verticalReplicationOrgId: string | null = null
let suspendHooks = false

function getActiveOrgIdStrict() {
  const orgId = localStorage.getItem('pos_active_org_id') || ''
  if (!orgId) {
    throw new Error('No hay una organización activa.')
  }
  return orgId
}

export function setSuspendHooks(val: boolean) {
  suspendHooks = val
}

type AuditAction = RxAuditLog['action']

function safeJson(value: unknown) {
  if (value === undefined) return null
  try {
    return JSON.stringify(value)
  } catch {
    return JSON.stringify({ error: 'unserializable' })
  }
}

async function getAuditActor() {
  const actorId = localStorage.getItem('pos_current_mesero_id') || null
  const actorEmail = localStorage.getItem('pos_admin_email') || null
  const orgId = localStorage.getItem('pos_active_org_id') || ''
  let actorName: string | null = null
  let actorRole: string | null = null

  if (actorId) {
    try {
      const db = await initVerticalRxDb()
      const user = await db.usuarios.findOne(actorId).exec()
      const json = user?.toJSON()
      if (json) {
        actorName = json.nombre || null
        actorRole = json.rol || null
      }
    } catch {
      // ignore
    }
  }

  if (!actorName && actorEmail) {
    actorName = actorEmail
    actorRole = 'admin'
  }

  return { actorId, actorName, actorRole, actorEmail, orgId }
}

async function createAuditLog(params: {
  entity: string
  action: AuditAction
  summary: string
  entityId?: string
  before?: unknown
  after?: unknown
  source?: string
}) {
  try {
    const now = new Date().toISOString()
    const { actorId, actorName, actorRole, actorEmail, orgId } = await getAuditActor()
    const payload = {
      id: crypto.randomUUID(),
      entity: params.entity,
      entity_id: params.entityId,
      action: params.action,
      summary: params.summary,
      before_state: safeJson(params.before),
      after_state: safeJson(params.after),
      actor_id: actorId || '',
      actor_name: actorName,
      actor_role: actorRole,
      actor_email: actorEmail,
      source: params.source,
      created_at: now,
      organization_id: orgId,
      _deleted: false,
      _modified: now
    } as RxAuditLog

    const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/audit-log`
    const res = await fetch(functionUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': import.meta.env.VITE_SUPABASE_ANON_KEY,
        'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify(payload),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.warn('[audit_logs] function HTTP error:', res.status, text)
      return
    }
  } catch (error) {
    console.warn('[audit_logs] audit logging skipped:', error)
  }
}

function diffSummary(entity: string, patch: Record<string, unknown>) {
  const keys = Object.keys(patch).filter(k => !['_modified', 'updated_at'].includes(k))
  if (keys.length === 0) return `Actualización de ${entity}`
  return `Actualizó ${entity}: ${keys.join(', ')}`
}

function itemChangeSummary(before: any, patch: Partial<RxComandaItem>) {
  if (patch._deleted) return `Eliminó el ítem ${before?.nombre || before?.id || 'desconocido'}`

  const changes: string[] = []
  if (typeof patch.cantidad === 'number' && patch.cantidad !== before?.cantidad) {
    changes.push(`cantidad ${before?.cantidad ?? 0} → ${patch.cantidad}`)
  }
  if (typeof patch.precio === 'number' && patch.precio !== before?.precio) {
    changes.push(`precio $${Number(before?.precio ?? 0).toFixed(2)} → $${patch.precio.toFixed(2)}`)
  }
  if (Array.isArray(patch.modificadores)) {
    const beforeMods = Array.isArray(before?.modificadores) ? before.modificadores.join(', ') : ''
    const afterMods = patch.modificadores.join(', ')
    if (beforeMods !== afterMods) {
      changes.push(`modificadores: ${afterMods || 'sin modificadores'}`)
    }
  }
  if (typeof patch.nota === 'string' && patch.nota !== (before?.nota ?? '')) {
    changes.push(`nota actualizada`)
  }
  if (changes.length === 0) {
    return `Actualizó el ítem ${before?.nombre || before?.id || 'desconocido'}`
  }
  return `Actualizó ${before?.nombre || before?.id || 'ítem'} (${changes.join('; ')})`
}

// Bump de nombre para cortar compatibilidad con el esquema anterior y arrancar limpio.
export async function createVerticalRxDb(name = 'pos_food_vertical_8') {
  const db = await withSuppressedDexieWarning(() => createRxDatabase({
    name,
    storage: getRxStorageDexie(),
    multiInstance: true
  }))

  const collectionsConfig: Record<string, any> = {
    clientes: { schema: clienteSchema },
    categorias: { schema: categoriaSchema },
    mesas: { schema: mesaSchema },
    comandas: {
      schema: comandaSchema,
      migrationStrategies: {
        // v0 → v1: agrega confirmada_at (nullable) a todas las comandas existentes
        1: (oldDoc: any) => ({ ...oldDoc, confirmada_at: null }),
        // v1 → v2: agrega cantidades_snapshot (nullable)
        2: (oldDoc: any) => ({ ...oldDoc, cantidades_snapshot: null }),
        // v2 → v3: agrega sincronizado para comandas vinculadas a habitación
        3: (oldDoc: any) => ({ ...oldDoc, sincronizado: oldDoc.habitacion_cuenta_id ? false : null })
      }
    },
    comanda_items: { schema: comandaItemSchema },
    pisos: { schema: pisoSchema },
    habitacion_cuentas: { schema: habitacionCuentaSchema },
    reservas: { schema: reservaSchema },
    pagos: { schema: pagoSchema },
    ajustes_iva: { schema: ajusteIvaSchema },
    usuarios: {
      schema: usuarioSchema,
      migrationStrategies: {
        // v0 → v1: elimina la contraseña en texto plano (credenciales migradas a Supabase Auth)
        1: (oldDoc: any) => { const { password: _password, ...rest } = oldDoc; return rest },
        // v1 → v2: membresías multi-organización (las filas antiguas usaban id = auth uid)
        2: (oldDoc: any) => ({ ...oldDoc, user_id: oldDoc.user_id ?? oldDoc.id }),
        // v2 → v3: sin cambios de datos; solo fuerza reconstrucción del esquema en cachés
        // locales que quedaron con una v2 previa a la definición final (user_id/indexes)
        3: (oldDoc: any) => oldDoc
      }
    },
    menu_items: {
      schema: menuItemSchema,
      migrationStrategies: {
        // v0 → v1: agrega es_bebida (nullable) a todos los items existentes
        1: (oldDoc: any) => ({ ...oldDoc, es_bebida: null })
      }
    },
  }

  await db.addCollections(collectionsConfig)

  return db as unknown as RxDatabase<VerticalCollections>
}

export function startVerticalReplication(db: RxDatabase<VerticalCollections>) {
  const orgId = localStorage.getItem('pos_active_org_id')
  if (!orgId) return null

  const queryBuilder = ({ query }: { query: any }) => query.eq('organization_id', orgId)

  // IDs sintéticos locales que no existen en la tabla mesas de Supabase
  const isSyntheticMesaId = (id: string) =>
    id.startsWith('reserva_') || id.startsWith('delivery_') || id.startsWith('local_')

  // Elimina undefined pero conserva null para campos opcionales
  const stripUndefined = <T extends Record<string, unknown>>(doc: T) => {
    const clean: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(doc)) {
      if (value !== undefined) clean[key] = value
    }
    return clean as T
  }

  // Para comanda_items: garantiza que campos requeridos no sean null
  const normalizeComandaItem = (doc: any) => {
    const clean = stripUndefined(doc)
    if (!clean.updated_at) clean.updated_at = clean.created_at || new Date().toISOString()
    if (!clean.estado) clean.estado = 'pendiente'
    if (clean.pagado_cantidad === null) clean.pagado_cantidad = 0
    return clean
  }

  // El plugin de Supabase ignora push.handler en las opciones; construye el suyo propio.
  // Para sobreescribirlo hay que mutar replicationPrimitivesPush.handler post-creación.
  const makePushHandler = (tableName: string, filterRow?: (doc: Record<string, unknown>) => boolean) =>
    async (rows: Array<{ newDocumentState: any; assumedMasterState: any }>) => {
      // Offline: no intentar push, lanzar para que RxDB reintente después
      if (!navigator.onLine) throw new Error('offline')

      const toUpsert = rows
        .map(r => ({ ...r.newDocumentState }))
        .filter(doc => !filterRow || filterRow(doc))
        .map(doc => stripUndefined(doc))

      if (toUpsert.length === 0) return []

      let maxRetries = 3;
      let retryDelay = 1000;

      while (maxRetries >= 0) {
        if (tableName === 'comanda_items') {
          const comandaIds = [...new Set(
            toUpsert
              .map(doc => String(doc.comanda_id || ''))
              .filter(Boolean)
          )]

          if (comandaIds.length > 0) {
            const { data: parents, error: parentsError } = await supabase
              .from('comandas')
              .select('id')
              .in('id', comandaIds)
              .eq('organization_id', orgId)

            if (parentsError) {
              if (parentsError.message?.includes('fetch') || parentsError.code === 'PGRST') {
                throw new Error(parentsError.message)
              }
              console.warn('[Push comanda_items] no se pudo verificar padre:', parentsError.message, parentsError.code)
              return []
            }

            const existingParentIds = new Set((parents || []).map((row: any) => row.id))
            const missingParentIds = comandaIds.filter(id => !existingParentIds.has(id))

            if (missingParentIds.length > 0) {
              const parentsToBootstrap = []
              for (const id of missingParentIds) {
                const localParent = await db.comandas.findOne(id).exec()
                const parentJson = localParent?.toJSON?.()
                if (parentJson && !parentJson._deleted) {
                  parentsToBootstrap.push(stripUndefined(parentJson))
                }
              }

              if (parentsToBootstrap.length > 0) {
                const { error: bootstrapError } = await supabase
                  .from('comandas')
                  .upsert(parentsToBootstrap.map(stripUndefined), { onConflict: 'id' })

                if (bootstrapError) {
                  if (bootstrapError.message?.includes('fetch') || bootstrapError.code === 'PGRST') {
                    throw new Error(bootstrapError.message)
                  }
                  console.warn('[Push comanda_items] no se pudo bootstrappear padre:', bootstrapError.message, bootstrapError.code)
                  return []
                }

                continue
              }

              if (maxRetries > 0) {
                await new Promise(r => setTimeout(r, retryDelay))
                retryDelay *= 2
                maxRetries--
                continue
              }

              console.warn('[Push comanda_items] parent comanda inexistente en local, se omite temporalmente:', missingParentIds)
              return []
            }
          }
        }

        if (tableName === 'comandas') {
          for (const doc of toUpsert) {
            const mId = String(doc.mesa_id ?? '');
            if (isSyntheticMesaId(mId)) {
              // Asegurar que existe la mesa en Supabase antes de insertar la comanda
              await supabase.from('mesas').upsert({
                id: mId,
                nombre: mId.startsWith('reserva_') ? 'Reserva' : (mId.startsWith('delivery_') ? 'Delivery' : 'Local'),
                estado: 'libre',
                piso: 'Reservas',
                capacidad: 0,
                organization_id: doc.organization_id || orgId || '',
                _deleted: false,
                _modified: new Date().toISOString()
              }, { onConflict: 'id' });
            }
          }
        }

        const { error } = await supabase
          .from(tableName)
          .upsert(toUpsert, { onConflict: 'id' })

        if (error) {
          if (error.code === '23503' && maxRetries > 0) {
            // Error de clave foránea. Probablemente el padre (ej. comanda) aún no se sincroniza.
            // Esperamos un momento y reintentamos sin lanzar error a RxDB para evitar spam.
            await new Promise(r => setTimeout(r, retryDelay));
            retryDelay *= 2;
            maxRetries--;
            continue;
          }

          // Errores de red o de clave foránea temporal (si agotó reintentos): lanzar para que RxDB reintente a nivel superior
          if (error.message?.includes('fetch') || error.code === 'PGRST' || error.code === '23503') {
            throw new Error(error.message)
          }
          // Errores de datos (validación, etc.): loguear y descartar para no bloquear
          console.warn(`[Push ${tableName}] descartado:`, error.message, error.code)
          return []
        }
        return []
      }
      return []
    }

  // El plugin llama this.push.handler internamente. Mutamos esa propiedad para
  // reemplazar el handler por nuestro upsert antes de que start() sea invocado.
  const patchPush = (state: any, handler: ReturnType<typeof makePushHandler>) => {
    if (state?.push) {
      state.push.handler = handler
    }
    return state
  }

  const replicaBase = { live: true, waitForLeadership: false }

  const mesas = patchPush(replicateSupabase({
    ...replicaBase,
    tableName: 'mesas',
    client: supabase,
    collection: db.mesas,
    replicationIdentifier: `mesas-supabase-${orgId}`,
    pull: { batchSize: 100, queryBuilder, modifier: stripUndefined },
    push: { batchSize: 100 }
  }), makePushHandler('mesas'))

  const comandas = patchPush(replicateSupabase({
    ...replicaBase,
    tableName: 'comandas',
    client: supabase,
    collection: db.comandas,
    replicationIdentifier: `comandas-supabase-${orgId}`,
    pull: { batchSize: 100, queryBuilder, modifier: stripUndefined },
    push: { batchSize: 100 }
  }), makePushHandler('comandas'))

  const items = patchPush(replicateSupabase({
    ...replicaBase,
    tableName: 'comanda_items',
    client: supabase,
    collection: db.comanda_items,
    replicationIdentifier: `comanda_items-supabase-${orgId}`,
    pull: { batchSize: 100, queryBuilder, modifier: normalizeComandaItem },
    push: { batchSize: 100 }
  }), makePushHandler('comanda_items'))

  const pisos = patchPush(replicateSupabase({
    ...replicaBase,
    tableName: 'pisos',
    client: supabase,
    collection: db.pisos,
    replicationIdentifier: `pisos-supabase-${orgId}`,
    pull: { batchSize: 100, queryBuilder, modifier: stripUndefined },
    push: { batchSize: 100 }
  }), makePushHandler('pisos'))

  const habitacionCuentas = patchPush(replicateSupabase({
    ...replicaBase,
    tableName: 'habitacion_cuentas',
    client: supabase,
    collection: db.habitacion_cuentas,
    replicationIdentifier: `habitacion_cuentas-supabase-${orgId}`,
    pull: { batchSize: 100, queryBuilder, modifier: stripUndefined },
    push: { batchSize: 100 }
  }), makePushHandler('habitacion_cuentas'))

  const reservas = patchPush(replicateSupabase({
    ...replicaBase,
    tableName: 'reservas',
    client: supabase,
    collection: db.reservas,
    replicationIdentifier: `reservas-supabase-${orgId}`,
    pull: { batchSize: 100, queryBuilder, modifier: stripUndefined },
    push: { batchSize: 100 }
  }), makePushHandler('reservas'))

  const pagos = patchPush(replicateSupabase({
    ...replicaBase,
    tableName: 'pagos',
    client: supabase,
    collection: db.pagos,
    replicationIdentifier: `pagos-supabase-${orgId}`,
    pull: { batchSize: 100, queryBuilder, modifier: stripUndefined },
    push: { batchSize: 100 }
  }), makePushHandler('pagos'))

  const ajustesIva = patchPush(replicateSupabase({
    ...replicaBase,
    tableName: 'ajustes_iva',
    client: supabase,
    collection: db.ajustes_iva,
    replicationIdentifier: `ajustes_iva-supabase-${orgId}`,
    pull: { batchSize: 100, queryBuilder, modifier: stripUndefined },
    push: { batchSize: 100 }
  }), makePushHandler('ajustes_iva'))

  // usuarios: SOLO pull. Las mutaciones van por la Edge Function manage-users
  // (RLS bloquea escrituras directas desde el cliente).
  const usuarios = replicateSupabase({
    ...replicaBase,
    tableName: 'usuarios',
    client: supabase,
    collection: db.usuarios,
    replicationIdentifier: `usuarios-supabase-${orgId}`,
    pull: { batchSize: 100, queryBuilder, modifier: stripUndefined }
  })

  const categorias = patchPush(replicateSupabase({
    ...replicaBase,
    tableName: 'categorias',
    client: supabase,
    collection: db.categorias,
    replicationIdentifier: `categorias-supabase-${orgId}`,
    pull: { batchSize: 100, queryBuilder, modifier: stripUndefined },
    push: { batchSize: 100 }
  }), makePushHandler('categorias'))

  const clientes = patchPush(replicateSupabase({
    ...replicaBase,
    tableName: 'clientes',
    client: supabase,
    collection: db.clientes,
    replicationIdentifier: `clientes-supabase-${orgId}`,
    pull: { batchSize: 100, queryBuilder, modifier: stripUndefined },
    push: { batchSize: 100 }
  }), makePushHandler('clientes'))

  const menuItems = patchPush(replicateSupabase({
    ...replicaBase,
    tableName: 'menu_items',
    client: supabase,
    collection: db.menu_items,
    replicationIdentifier: `menu_items-supabase-${orgId}`,
    pull: { batchSize: 100, queryBuilder, modifier: stripUndefined },
    push: { batchSize: 100 }
  }), makePushHandler('menu_items'))

  return { clientes, categorias, mesas, comandas, items, pisos, habitacionCuentas, reservas, pagos, ajustesIva, usuarios, menuItems }
}

function stopVerticalReplication() {
  if (verticalReplicationState) {
    try {
      Object.values(verticalReplicationState).forEach((state: any) => {
        state?.cancel?.()
      })
    } catch (err) {
      console.warn('Error al cancelar réplica vertical:', err)
    }
  }
  verticalReplicationState = null
  verticalReplicationOrgId = null
}

export async function initVerticalRxDb() {
  if (suspendHooks) {
    // compat flag para el reset viejo
  }
  if (!verticalDbPromise) {
    verticalDbPromise = createVerticalRxDb()
  }

  const db = await verticalDbPromise
  const currentOrgId = localStorage.getItem('pos_active_org_id') || null
  if (verticalReplicationOrgId !== currentOrgId) {
    stopVerticalReplication()
  }

  if (!verticalReplicationState && currentOrgId) {
    verticalReplicationState = startVerticalReplication(db)
    verticalReplicationOrgId = currentOrgId
    if (verticalReplicationState) {
      Object.entries(verticalReplicationState).forEach(([name, state]: [string, any]) => {
        state?.error$?.subscribe((err: any) => {
          const msg = err?.message || err?.parameters?.errors?.message || ''
          const isNetworkError = msg.includes('fetch') || msg.includes('offline') || msg.includes('network') || !navigator.onLine
          if (!isNetworkError) {
            console.error(`[RxDB Sync ERROR] ${name}:`, err)
            lastCollectionError[name] = msg || 'error'
          } else {
            // errores de red no son errores de datos — no los mostramos
            lastCollectionError[name] = null
          }
          refreshCollectionStatus()
        })
        state?.active$?.subscribe((isActive: boolean) => {
          // al volver a estar activo, limpiar error previo de red
          if (isActive) lastCollectionError[name] = null
          refreshCollectionStatus()
        })
        lastCollectionError[name] = null
        state?.reSync?.()
      })

      // Al recuperar conexión, forzar resync inmediato en todas las colecciones
      const handleOnline = () => {
        emitSyncStatus({ online: true, supabaseOk: null })
        if (verticalReplicationState) {
          Object.values(verticalReplicationState).forEach((state: any) => state?.reSync?.())
        }
        reconciliarMesasDeHabitacion(db).catch((err: unknown) => {
          console.warn('[RxDB] no se pudo reconciliar mesas de habitación:', err)
        })
        pingSyncStatus()
      }
      const handleOffline = () => emitSyncStatus({ online: false, supabaseOk: false })
      window.addEventListener('online', handleOnline)
      window.addEventListener('offline', handleOffline)
    }
  }

  return db
}

export function getVerticalRxDbPromise() {
  return verticalDbPromise
}

export async function getVerticalRxDb() {
  return initVerticalRxDb()
}

export type SyncStatus = {
  online: boolean
  supabaseOk: boolean | null  // null = no verificado todavía
  hasError: boolean
  errorCollections: string[]
  activePushQueue: number     // docs pendientes de push (estimado)
  collections: Record<string, { active: boolean; error: string | null; stopped: boolean }>
}

// Último error conocido por colección (Subject no guarda estado, lo guardamos aquí)
const lastCollectionError: Record<string, string | null> = {}

// Suscriptores externos al estado de sync
const syncStatusListeners = new Set<(s: SyncStatus) => void>()
let lastSyncStatus: SyncStatus = {
  online: navigator.onLine,
  supabaseOk: null,
  hasError: false,
  errorCollections: [],
  activePushQueue: 0,
  collections: {},
}

export function subscribeSyncStatus(fn: (s: SyncStatus) => void): () => void {
  syncStatusListeners.add(fn)
  fn(lastSyncStatus)
  return () => syncStatusListeners.delete(fn)
}

function emitSyncStatus(patch: Partial<SyncStatus>) {
  lastSyncStatus = { ...lastSyncStatus, ...patch }
  syncStatusListeners.forEach(fn => fn(lastSyncStatus))
}

// Actualiza el estado derivado de los replicationStates activos
function refreshCollectionStatus() {
  if (!verticalReplicationState) return
  const collections: SyncStatus['collections'] = {}
  const errorCollections: string[] = []
  for (const [name, state] of Object.entries(verticalReplicationState) as any) {
    const s = state as any
    // subjects.active es BehaviorSubject<boolean>
    const isActive = s?.subjects?.active?.getValue?.() ?? false
    // isStopped es función; canceled$ también indica parada
    const isStopped = typeof s?.isStopped === 'function' ? s.isStopped() : (s?.subjects?.canceled?.getValue?.() ?? false)
    const errMsg = lastCollectionError[name] ?? null
    if (errMsg) errorCollections.push(name)
    collections[name] = { active: isActive, error: errMsg, stopped: isStopped }
  }
  emitSyncStatus({ collections, hasError: errorCollections.length > 0, errorCollections })
}

export async function pingSyncStatus() {
  emitSyncStatus({ online: navigator.onLine })
  if (!navigator.onLine) {
    emitSyncStatus({ supabaseOk: false })
    refreshCollectionStatus()
    return
  }
  try {
    const orgId = localStorage.getItem('pos_active_org_id')
    const { error } = await supabase.from('mesas').select('id').eq('organization_id', orgId).limit(1)
    emitSyncStatus({ supabaseOk: !error })
  } catch {
    emitSyncStatus({ supabaseOk: false })
  }
  refreshCollectionStatus()
}

export async function forceSyncAll() {
  if (!verticalReplicationState) return
  Object.values(verticalReplicationState).forEach((state: any) => state?.reSync?.())
}

export async function diagnoseSyncState() {
  const orgId = localStorage.getItem('pos_active_org_id')
  console.group('[RxDB Sync Diagnostics]')
  console.log('orgId:', orgId)
  console.log('replicationState active:', !!verticalReplicationState)

  if (verticalReplicationState) {
    for (const [name, state] of Object.entries(verticalReplicationState) as any) {
      const s = state as any
      console.group(`  [${name}]`)
      console.log('  active:', s?.active)
      console.log('  error:', s?.error)
      console.log('  isStopped:', s?.isStopped)
      console.groupEnd()
    }
  }

  // Test directo a Supabase para mesas
  try {
    const { data, error } = await supabase.from('mesas').select('*').eq('organization_id', orgId).limit(3)
    console.log('Supabase mesas direct query:', { count: data?.length, error })
    if (data?.length) console.log('  sample row keys:', Object.keys(data[0]))
  } catch (e) {
    console.error('Supabase mesas query failed:', e)
  }

  // Test directo a Supabase para comanda_items
  try {
    const { data, error } = await supabase.from('comanda_items').select('*').eq('organization_id', orgId).limit(3)
    console.log('Supabase comanda_items direct query:', { count: data?.length, error })
    if (data?.length) console.log('  sample row keys:', Object.keys(data[0]))
  } catch (e) {
    console.error('Supabase comanda_items query failed:', e)
  }

  // Contar docs locales en RxDB
  const db = await initVerticalRxDb()
  const mesasCount = await db.mesas.count().exec()
  const comandasCount = await db.comandas.count().exec()
  const itemsCount = await db.comanda_items.count().exec()
  console.log('RxDB local counts:', { mesas: mesasCount, comandas: comandasCount, comanda_items: itemsCount })

  console.groupEnd()
}

export async function createRxComanda(input: Omit<RxComanda, '_deleted' | '_modified' | 'updated_at' | 'created_at' | 'total' | 'confirmada'> & {
  created_at?: string
  updated_at?: string
  total?: number
  confirmada?: boolean
}) {
  const db = await initVerticalRxDb()
  const now = new Date().toISOString()
  const orgId = input.organization_id || getActiveOrgIdStrict()
  const created = await db.comandas.insert({
    ...input,
    organization_id: orgId,
    confirmada: input.confirmada ?? false,
    total: input.total ?? 0,
    created_at: input.created_at ?? now,
    updated_at: input.updated_at ?? now,
    _deleted: false,
    _modified: now
  } as RxComanda)
  await createAuditLog({
    entity: 'comanda',
    entityId: created.id,
    action: 'create',
    summary: `Se creó la comanda #${created.folio}`,
    after: created.toJSON(),
    source: 'rxdb'
  })
  return created
}

export async function updateRxComanda(id: string, patch: Partial<RxComanda>) {
  const db = await initVerticalRxDb()
  getActiveOrgIdStrict()
  const doc = await db.comandas.findOne(id).exec(true)
  const before = doc?.toJSON()
  const result = await doc.update({
    $set: {
      ...patch,
      updated_at: new Date().toISOString(),
      _modified: new Date().toISOString()
    }
  } as any)
  const action: AuditAction = patch._deleted ? 'delete' : (patch.estado && ['anulada', 'cerrado', 'facturado'].includes(String(patch.estado)) ? 'status_change' : 'update')
  await createAuditLog({
    entity: 'comanda',
    entityId: id,
    action,
    summary: patch._deleted
      ? `Se eliminó la comanda #${before?.folio ?? id}`
      : patch.estado === 'anulada'
        ? `Se anuló la comanda #${before?.folio ?? id}`
        : diffSummary('comanda', patch as Record<string, unknown>),
    before,
    after: { ...before, ...patch },
    source: 'rxdb'
  })
  return result
}

export async function createRxComandaItem(input: Omit<RxComandaItem, '_deleted' | '_modified' | 'updated_at' | 'created_at'> & {
  created_at?: string
  updated_at?: string
}) {
  const db = await initVerticalRxDb()
  const now = new Date().toISOString()
  const orgId = input.organization_id || getActiveOrgIdStrict()
  const created = await db.comanda_items.insert({
    ...input,
    organization_id: orgId,
    nota: input.nota ?? null,
    pagado_cantidad: input.pagado_cantidad ?? 0,
    created_at: input.created_at ?? now,
    updated_at: input.updated_at ?? now,
    _deleted: false,
    _modified: now
  } as RxComandaItem)
  await createAuditLog({
    entity: 'comanda_item',
    entityId: created.id,
    action: 'create',
    summary: `Agregó el ítem ${created.nombre} x${created.cantidad}`,
    after: created.toJSON(),
    source: 'rxdb'
  })
  return created
}

export async function updateRxComandaItem(id: string, patch: Partial<RxComandaItem>) {
  const db = await initVerticalRxDb()
  getActiveOrgIdStrict()
  const doc = await db.comanda_items.findOne(id).exec(true)
  const before = doc?.toJSON()
  const result = await doc.update({
    $set: {
      ...patch,
      updated_at: new Date().toISOString(),
      _modified: new Date().toISOString()
    }
  } as any)
  await createAuditLog({
    entity: 'comanda_item',
    entityId: id,
    action: patch._deleted ? 'delete' : 'update',
    summary: itemChangeSummary(before, patch),
    before,
    after: { ...before, ...patch },
    source: 'rxdb'
  })
  return result
}

export async function updateRxMesa(id: string, patch: Partial<RxMesa>) {
  const db = await initVerticalRxDb()
  getActiveOrgIdStrict()
  const doc = await db.mesas.findOne(id).exec(true)
  const before = doc?.toJSON()
  const result = await doc.update({
    $set: {
      ...patch,
      _modified: new Date().toISOString()
    }
  } as any)
  await createAuditLog({
    entity: 'mesa',
    entityId: id,
    action: 'update',
    summary: diffSummary('mesa', patch as Record<string, unknown>),
    before,
    after: { ...before, ...patch },
    source: 'rxdb'
  })
  return result
}

export async function createRxPiso(input: Omit<RxPiso, '_deleted' | '_modified'>) {
  const db = await initVerticalRxDb()
  const now = new Date().toISOString()
  const orgId = input.organization_id || getActiveOrgIdStrict()
  const created = await db.pisos.insert({
    ...input,
    organization_id: orgId,
    _deleted: false,
    _modified: now
  } as RxPiso)
  await createAuditLog({
    entity: 'piso',
    entityId: created.id,
    action: 'create',
    summary: `Se creó el piso ${created.nombre}`,
    after: created.toJSON(),
    source: 'rxdb'
  })
  return created
}

export async function createRxReserva(input: Omit<RxReserva, '_deleted' | '_modified' | 'created_at' | 'updated_at'> & {
  created_at?: string
  updated_at?: string
}) {
  const db = await initVerticalRxDb()
  const now = new Date().toISOString()
  const orgId = input.organization_id || getActiveOrgIdStrict()
  const created = await db.reservas.insert({
    ...input,
    organization_id: orgId,
    created_at: input.created_at ?? now,
    updated_at: input.updated_at ?? now,
    _deleted: false,
    _modified: now
  } as RxReserva)
  await createAuditLog({
    entity: 'reserva',
    entityId: created.id,
    action: 'create',
    summary: `Se creó la reserva ${created.nombre}`,
    after: created.toJSON(),
    source: 'rxdb'
  })
  return created
}

export async function updateRxReserva(id: string, patch: Partial<RxReserva>) {
  const db = await initVerticalRxDb()
  getActiveOrgIdStrict()
  const doc = await db.reservas.findOne(id).exec(true)
  const before = doc?.toJSON()
  const result = await doc.update({
    $set: {
      ...patch,
      updated_at: new Date().toISOString(),
      _modified: new Date().toISOString()
    }
  } as any)
  await createAuditLog({
    entity: 'reserva',
    entityId: id,
    action: patch.estado === 'cancelada' ? 'status_change' : 'update',
    summary: patch.estado === 'cancelada' ? `Se canceló la reserva ${before?.nombre || id}` : diffSummary('reserva', patch as Record<string, unknown>),
    before,
    after: { ...before, ...patch },
    source: 'rxdb'
  })
  return result
}

export async function createRxAjusteIva(input: Omit<RxAjusteIva, '_deleted' | '_modified'>) {
  const db = await initVerticalRxDb()
  const now = new Date().toISOString()
  const orgId = input.organization_id || getActiveOrgIdStrict()
  const created = await db.ajustes_iva.insert({
    ...input,
    organization_id: orgId,
    _deleted: false,
    _modified: now
  } as RxAjusteIva)
  await createAuditLog({
    entity: 'ajuste_iva',
    entityId: created.id,
    action: 'create',
    summary: `Se creó un ajuste de IVA`,
    after: created.toJSON(),
    source: 'rxdb'
  })
  return created
}

export async function updateRxAjusteIva(id: string, patch: Partial<RxAjusteIva>) {
  const db = await initVerticalRxDb()
  getActiveOrgIdStrict()
  const doc = await db.ajustes_iva.findOne(id).exec(true)
  const before = doc?.toJSON()
  const result = await doc.update({
    $set: {
      ...patch,
      _modified: new Date().toISOString()
    }
  } as any)
  await createAuditLog({
    entity: 'ajuste_iva',
    entityId: id,
    action: 'update',
    summary: diffSummary('ajuste de IVA', patch as Record<string, unknown>),
    before,
    after: { ...before, ...patch },
    source: 'rxdb'
  })
  return result
}

// Nota: los usuarios ya no se crean/editan desde el cliente. Toda mutación pasa por
// la Edge Function `manage-users` (Supabase Auth + tabla usuarios) y llega aquí por pull.

export async function updateRxPiso(id: string, patch: Partial<RxPiso>) {
  const db = await initVerticalRxDb()
  getActiveOrgIdStrict()
  const doc = await db.pisos.findOne(id).exec(true)
  const before = doc?.toJSON()
  const result = await doc.update({
    $set: {
      ...patch,
      _modified: new Date().toISOString()
    }
  } as any)
  await createAuditLog({
    entity: 'piso',
    entityId: id,
    action: 'update',
    summary: diffSummary('piso', patch as Record<string, unknown>),
    before,
    after: { ...before, ...patch },
    source: 'rxdb'
  })
  return result
}

export async function createRxHabitacionCuenta(input: Omit<RxHabitacionCuenta, '_deleted' | '_modified' | 'updated_at' | 'created_at'> & {
  created_at?: string
  updated_at?: string
}) {
  const db = await initVerticalRxDb()
  const now = new Date().toISOString()
  const orgId = input.organization_id || getActiveOrgIdStrict()
  const created = await db.habitacion_cuentas.insert({
    ...input,
    organization_id: orgId,
    created_at: input.created_at ?? now,
    updated_at: input.updated_at ?? now,
    _deleted: false,
    _modified: now
  } as RxHabitacionCuenta)
  await createAuditLog({
    entity: 'habitacion_cuenta',
    entityId: created.id,
    action: 'create',
    summary: `Se abrió la cuenta de habitación ${created.huesped}`,
    after: created.toJSON(),
    source: 'rxdb'
  })
  return created
}

export async function updateRxHabitacionCuenta(id: string, patch: Partial<RxHabitacionCuenta>) {
  const db = await initVerticalRxDb()
  getActiveOrgIdStrict()
  const doc = await db.habitacion_cuentas.findOne(id).exec(true)
  const before = doc?.toJSON()
  const result = await doc.update({
    $set: {
      ...patch,
      updated_at: new Date().toISOString(),
      _modified: new Date().toISOString()
    }
  } as any)
  await createAuditLog({
    entity: 'habitacion_cuenta',
    entityId: id,
    action: patch.estado === 'cerrada' ? 'status_change' : 'update',
    summary: patch.estado === 'cerrada' ? `Se cerró la cuenta de habitación ${before?.huesped || id}` : diffSummary('cuenta de habitación', patch as Record<string, unknown>),
    before,
    after: { ...before, ...patch },
    source: 'rxdb'
  })
  return result
}

export async function createRxPago(input: Omit<RxPago, '_deleted' | '_modified'>) {
  const db = await initVerticalRxDb()
  const now = new Date().toISOString()
  const orgId = input.organization_id || getActiveOrgIdStrict()
  const created = await db.pagos.insert({
    ...input,
    organization_id: orgId,
    _deleted: false,
    _modified: now
  } as RxPago)
  await createAuditLog({
    entity: 'pago',
    entityId: created.id,
    action: 'create',
    summary: `Se registró un pago de $${created.monto.toFixed(2)}`,
    after: created.toJSON(),
    source: 'rxdb'
  })
  return created
}

export async function updateRxPago(id: string, patch: Partial<RxPago>) {
  const db = await initVerticalRxDb()
  getActiveOrgIdStrict()
  const doc = await db.pagos.findOne(id).exec(true)
  const before = doc?.toJSON()
  const result = await doc.update({
    $set: {
      ...patch,
      _modified: new Date().toISOString()
    }
  } as any)
  await createAuditLog({
    entity: 'pago',
    entityId: id,
    action: 'update',
    summary: diffSummary('pago', patch as Record<string, unknown>),
    before,
    after: { ...before, ...patch },
    source: 'rxdb'
  })
  return result
}

export async function createRxCategoria(input: Omit<RxCategoria, '_deleted' | '_modified'>) {
  const db = await initVerticalRxDb()
  const now = new Date().toISOString()
  const orgId = input.organization_id || getActiveOrgIdStrict()
  const created = await db.categorias.insert({
    ...input,
    organization_id: orgId,
    _deleted: false,
    _modified: now
  } as RxCategoria)
  await createAuditLog({
    entity: 'categoria',
    entityId: created.id,
    action: 'create',
    summary: `Se creó la categoría ${created.nombre}`,
    after: created.toJSON(),
    source: 'rxdb'
  })
  return created
}

export async function updateRxCategoria(id: string, patch: Partial<RxCategoria>) {
  const db = await initVerticalRxDb()
  getActiveOrgIdStrict()
  const doc = await db.categorias.findOne(id).exec(true)
  const before = doc?.toJSON()
  const result = await doc.update({
    $set: { ...patch, _modified: new Date().toISOString() }
  } as any)
  await createAuditLog({
    entity: 'categoria',
    entityId: id,
    action: 'update',
    summary: diffSummary('categoría', patch as Record<string, unknown>),
    before,
    after: { ...before, ...patch },
    source: 'rxdb'
  })
  return result
}

export async function createRxMenuItem(input: Omit<RxMenuItem, '_deleted' | '_modified'>) {
  const db = await initVerticalRxDb()
  const now = new Date().toISOString()
  const orgId = input.organization_id || getActiveOrgIdStrict()
  const created = await db.menu_items.insert({
    ...input,
    organization_id: orgId,
    _deleted: false,
    _modified: now
  } as RxMenuItem)
  await createAuditLog({
    entity: 'menu_item',
    entityId: created.id,
    action: 'create',
    summary: `Se creó el producto ${created.nombre}`,
    after: created.toJSON(),
    source: 'rxdb'
  })
  return created
}

export async function updateRxMenuItem(id: string, patch: Partial<RxMenuItem>) {
  const db = await initVerticalRxDb()
  getActiveOrgIdStrict()
  const doc = await db.menu_items.findOne(id).exec(true)
  const before = doc?.toJSON()
  const result = await doc.update({
    $set: { ...patch, _modified: new Date().toISOString() }
  } as any)
  await createAuditLog({
    entity: 'menu_item',
    entityId: id,
    action: patch._deleted ? 'delete' : 'update',
    summary: patch._deleted ? `Se eliminó el producto ${before?.nombre || id}` : diffSummary('producto', patch as Record<string, unknown>),
    before,
    after: { ...before, ...patch },
    source: 'rxdb'
  })
  return result
}

export async function createRxCliente(input: Omit<RxCliente, '_deleted' | '_modified' | 'created_at'> & { created_at?: string }) {
  const db = await initVerticalRxDb()
  const now = new Date().toISOString()
  const orgId = input.organization_id || getActiveOrgIdStrict()
  return db.clientes.insert({
    ...input,
    organization_id: orgId,
    created_at: input.created_at ?? now,
    _deleted: false,
    _modified: now
  } as RxCliente)
}

export async function updateRxCliente(id: string, patch: Partial<RxCliente>) {
  const db = await initVerticalRxDb()
  getActiveOrgIdStrict()
  const doc = await db.clientes.findOne(id).exec(true)
  return doc.update({
    $set: { ...patch, _modified: new Date().toISOString() }
  } as any)
}
