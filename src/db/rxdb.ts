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
  cantidades_snapshot?: string | null
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
  // Cantidad del item que se decidió no cobrar (cortesía / error de cocina /
  // descuento puntual), con motivo obligatorio para trazabilidad. Se resta
  // del total a cobrar en el checkout, pero el item sigue apareciendo en el
  // detalle de la comanda tal como se sirvió.
  cortesia_cantidad?: number | null
  cortesia_motivo?: string | null
  // Anulación puntual: el item ya fue confirmado/enviado a cocina, pero ya
  // no está disponible (se acabó, error de cocina). Nunca se borra — queda
  // visible tachado con su motivo, para trazabilidad. Mismo patrón que
  // RxPago/RxVentaMovimiento.anulado.
  anulado?: boolean
  anulado_motivo?: string | null
  anulado_at?: string | null
  anulado_por?: string | null
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

export type TipoCliente = 'persona_natural' | 'juridico' | 'extranjero' | 'agencia'

export interface RxCliente {
  id: string
  nombre: string
  telefono?: string
  email?: string
  direccion?: string
  dni?: string
  notas?: string
  tipo_cliente?: TipoCliente
  // Datos de facturación (pueden ser distintos al nombre del cliente)
  nombre_factura?: string
  tipo_doc?: 'cedula' | 'ruc' | 'pasaporte' | 'otro'
  numero_doc?: string
  direccion_fiscal?: string
  email_factura?: string
  created_at: string
  organization_id: string
  _deleted: boolean
  _modified: string
}

export interface RxPago {
  id: string
  comanda_id: string
  monto: number
  // Nullable: null/undefined mientras metodo_definido es false. Mesas ya no
  // elige método al cerrar — se define después, al anclar en Centro de Ventas.
  metodo_pago?: 'efectivo' | 'tarjeta' | 'transferencia' | 'otros' | null
  metodo_definido?: boolean
  fecha: string
  tipo_division?: string
  factura_nro?: string
  factura_nota?: string
  // Quién cobró (id de usuario/mesero) — capturado al momento del cobro rápido.
  usuario_id?: string
  // Detalle de comprobante: se completa después, en el anclaje desde Centro de
  // Ventas, no en el momento del cobro (para no interrumpir el servicio).
  tarjeta_red?: string
  transferencia_banco?: string
  transferencia_referencia?: string
  anclado?: boolean
  anclado_at?: string
  anclado_por?: string
  // Anulación: el cobro nunca debió contar (error, duplicado). Se excluye de
  // los totales pero NO se borra — sigue visible con su motivo.
  anulado?: boolean
  anulado_motivo?: string
  anulado_at?: string
  anulado_por?: string
  // Reembolso: el cobro fue real pero se devolvió total o parcialmente
  // después (cancelación/cambio de fecha en reservas de hotel). No anula la
  // transacción — solo resta del total efectivo. Una sola vez por cobro.
  monto_reembolsado?: number
  reembolso_motivo?: string
  reembolso_at?: string
  reembolso_por?: string
  // 3er check de estado en Centro de Ventas: conciliación con número de
  // factura del sistema contable externo. Independiente del anclaje.
  facturado?: boolean
  numero_factura?: string
  facturado_at?: string
  facturado_por?: string
  // Comprobante adjunto (foto/PDF) subido a Supabase Storage — solo se
  // guarda la URL pública, nunca el binario, en RxDB.
  comprobante_url?: string
  organization_id: string
  _deleted: boolean
  _modified: string
}

// 'pago_credito': liquidación (total o parcial) de un cobro tipo 'credito'
// existente — ver `credito_id`. Es un cobro_reserva más, con método de pago
// real (nunca 'credito_agencia'), que resta del saldo pendiente del crédito
// original sin modificarlo ni borrarlo (mismo espíritu que reembolso: se
// suma un movimiento nuevo, no se edita el histórico).
export type TipoCobroReserva = 'anticipo' | 'pago_total' | 'credito' | 'pago_credito'

// Cobro asociado a una reserva de hotel (anticipo, pago total o crédito de
// agencia). Separado de `pagos` porque las reservas no tienen comanda propia
// al momento de cobrar el anticipo. Mismo patrón de "registro rápido +
// anclaje" que RxPago.
export interface RxCobroReserva {
  id: string
  reserva_id: string
  cliente_id?: string
  monto: number
  metodo_pago: 'efectivo' | 'tarjeta' | 'transferencia' | 'credito_agencia' | 'otros'
  tipo: TipoCobroReserva
  // Solo presente cuando tipo='pago_credito': id del cobro_reserva
  // tipo='credito' que esta liquidación está pagando. Permite varias
  // liquidaciones parciales apuntando al mismo crédito.
  credito_id?: string
  tarjeta_red?: string
  transferencia_banco?: string
  transferencia_referencia?: string
  fecha: string
  usuario_id?: string
  // Metadatos opcionales de contexto (fechas de estadía y descripción libre),
  // visibles para cualquier tipo de transacción, no solo hotel.
  check_in?: string
  check_out?: string
  descripcion?: string
  anclado?: boolean
  anclado_at?: string
  anclado_por?: string
  // Ver comentario equivalente en RxPago: anular = nunca debió contar;
  // reembolsar = fue real pero se devolvió (común en cambios de fecha o
  // cancelaciones de reserva de hotel).
  anulado?: boolean
  anulado_motivo?: string
  anulado_at?: string
  anulado_por?: string
  monto_reembolsado?: number
  reembolso_motivo?: string
  reembolso_at?: string
  reembolso_por?: string
  // 3er check de estado en Centro de Ventas: conciliación con número de
  // factura del sistema contable externo. Independiente del anclaje.
  facturado?: boolean
  numero_factura?: string
  facturado_at?: string
  facturado_por?: string
  // Comprobante adjunto (foto/PDF) subido a Supabase Storage — solo se
  // guarda la URL pública, nunca el binario, en RxDB.
  comprobante_url?: string
  organization_id: string
  _deleted: boolean
  _modified: string
}

// Las 4 vías de cobro del negocio como origen fijo de una venta.
// De dónde sale la venta.
export type VentaOrigen = 'mesa' | 'reserva_restaurante' | 'reserva_hotel'
// Cómo se cobra — independiente del origen: cualquier origen puede ser
// directa (se cobra al momento) o crédito (queda pendiente, se liquida
// después contra una agencia/empresa corporativa).
export type VentaTipo = 'directa' | 'credito'

export type VentaMovimientoTipo = 'ajuste' | 'pago' | 'reembolso' | 'anclar' | 'facturar' | 'anular' | 'marcar_credito' | 'comentario'

// Un evento inmutable en el historial de una venta — nunca se edita, solo
// se agregan más. 'ajuste' con monto positivo es cómo nace el monto total
// de la venta (la creación inicial es su primer ajuste). 'marcar_credito'
// registra el paso de tipo='directa' a tipo='credito' (ej. una venta
// operativa que termina facturándose a una agencia/empresa) — de una sola
// vía, no existe el movimiento inverso: si se marcó por error, se anula la
// venta y se crea una nueva en vez de revertir el historial. Embebido
// dentro de RxVenta.movimientos (no colección propia): RxDB community
// limita a 13 colecciones locales simultáneas, así que el historial vive
// como array dentro del mismo documento en vez de una tabla de detalle
// separada.
export interface RxVentaMovimiento {
  id: string
  tipo: VentaMovimientoTipo
  // Presente en ajuste/pago/reembolso; ausente en anclar/facturar/anular.
  monto?: number
  metodo_pago?: 'efectivo' | 'tarjeta' | 'transferencia' | 'credito_agencia' | 'otros'
  tarjeta_red?: string
  transferencia_banco?: string
  transferencia_referencia?: string
  motivo?: string
  numero_factura?: string
  comprobante_url?: string
  fecha: string
  usuario_id?: string
  // Única excepción al "nunca se edita, solo se agrega": anular un
  // movimiento puntual (se cargó mal un dato) reescribe ESTE campo sobre el
  // movimiento existente — el registro nunca se borra ni se toca en nada
  // más (monto, motivo, fecha quedan intactos como evidencia), solo se
  // excluye de los cálculos derivados (ver useVentasConMovimientos).
  anulado?: boolean
  anulado_motivo?: string
  anulado_at?: string
  anulado_por?: string
}

// Venta: unidad de negocio (Centro de Ventas v2). Reemplaza el enfoque de
// RxPago/RxCobroReserva como "pago único inmutable" — la venta es identidad
// + origen + un array de movimientos embebidos. Su monto total, saldo y
// estado (anclado/facturado/anulado) se derivan sumando/inspeccionando
// `movimientos`, nunca son campos propios. Así una venta puede aumentar
// (ajuste), pagarse en partes (pago), reembolsarse (reembolso) o cambiar de
// estado — todo trazable con fecha, en vez de flags sueltos sobre un monto
// fijo. RxDB no soporta bien mutar sub-arrays vía update parcial con
// conflictos concurrentes, pero el volumen de movimientos por venta es bajo
// (decenas, no miles) así que reescribir el array completo en cada
// `agregarVentaMovimiento` es aceptable.
export interface RxVenta {
  id: string
  origen: VentaOrigen
  tipo: VentaTipo
  cliente_id?: string
  // Nombre libre cuando no hay cliente_id (comanda.cliente texto libre,
  // huésped de hotel escrito a mano, etc.)
  cliente_nombre?: string
  // Descripción visible en la lista: "Mesa 3 · #45", "Reserva de hotel — Juan Pérez"...
  referencia?: string
  // Vínculo opcional al origen real cuando existe (comanda_id de Mesas).
  comanda_id?: string
  // Documento de la venta en sí (factura, confirmación de reserva, etc.) —
  // distinto del comprobante de cada movimiento (RxVentaMovimiento.comprobante_url,
  // que es el respaldo de un pago/ajuste/reembolso puntual).
  documento_url?: string
  documento_nombre?: string
  movimientos: RxVentaMovimiento[]
  created_at: string
  usuario_id?: string
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
  version: 2,
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
    cortesia_cantidad: { type: ['number', 'null'] },
    cortesia_motivo: { type: ['string', 'null'] },
    anulado: { type: 'boolean' },
    anulado_motivo: { type: ['string', 'null'] },
    anulado_at: { type: ['string', 'null'] },
    anulado_por: { type: ['string', 'null'] },
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
  version: 1,
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
    tipo_cliente: { type: ['string', 'null'], enum: ['persona_natural', 'juridico', 'extranjero', 'agencia', null] },
    nombre_factura: { type: ['string', 'null'] },
    tipo_doc: { type: ['string', 'null'] },
    numero_doc: { type: ['string', 'null'] },
    direccion_fiscal: { type: ['string', 'null'] },
    email_factura: { type: ['string', 'null'] },
    created_at: { type: 'string' },
    organization_id: { type: 'string' },
    _deleted: { type: 'boolean' },
    _modified: { type: 'string' }
  },
  required: ['id', 'nombre', 'created_at', 'organization_id', '_deleted', '_modified'],
  indexes: ['nombre', 'organization_id', '_modified'],
} as const

const pagoSchema = {
  version: 6,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    comanda_id: { type: 'string' },
    monto: { type: 'number' },
    // Nullable: al cerrar la mesa en Mesas ya no se elige método — llega
    // "pendiente de definir" y se completa al anclar en Centro de Ventas.
    // No es un método más del enum, es la ausencia de definición.
    metodo_pago: { type: ['string', 'null'], enum: ['efectivo', 'tarjeta', 'transferencia', 'otros', null] },
    // No-nullable (indexable): true una vez que se eligió el método real.
    metodo_definido: { type: 'boolean' },
    fecha: { type: 'string' },
    tipo_division: { type: 'string' },
    factura_nro: { type: 'string' },
    factura_nota: { type: 'string' },
    usuario_id: { type: ['string', 'null'] },
    tarjeta_red: { type: ['string', 'null'] },
    transferencia_banco: { type: ['string', 'null'] },
    transferencia_referencia: { type: ['string', 'null'] },
    // No-nullable: RxDB no permite indexar campos con tipo ['boolean','null'].
    // Default false vía migrationStrategy para los pagos existentes.
    anclado: { type: 'boolean' },
    anclado_at: { type: ['string', 'null'] },
    anclado_por: { type: ['string', 'null'] },
    anulado: { type: 'boolean' },
    anulado_motivo: { type: ['string', 'null'] },
    anulado_at: { type: ['string', 'null'] },
    anulado_por: { type: ['string', 'null'] },
    monto_reembolsado: { type: 'number' },
    reembolso_motivo: { type: ['string', 'null'] },
    reembolso_at: { type: ['string', 'null'] },
    reembolso_por: { type: ['string', 'null'] },
    // 3er check de estado en Centro de Ventas: número de factura con el que
    // se concilió esta transacción contra el sistema contable externo.
    // No-nullable (indexable): true una vez que se registró la factura.
    facturado: { type: 'boolean' },
    numero_factura: { type: ['string', 'null'] },
    facturado_at: { type: ['string', 'null'] },
    facturado_por: { type: ['string', 'null'] },
    // Comprobante adjunto (foto/PDF), subido a Supabase Storage — solo se
    // guarda la URL pública. No se indexa: opcional y no se filtra por él.
    comprobante_url: { type: ['string', 'null'] },
    organization_id: { type: 'string' },
    _deleted: { type: 'boolean' },
    _modified: { type: 'string' }
  },
  required: ['id', 'comanda_id', 'monto', 'fecha', 'metodo_definido', 'anclado', 'anulado', 'monto_reembolsado', 'facturado', 'organization_id', '_deleted', '_modified'],
  // metodo_pago no se indexa: es nullable ahora (RxDB no permite indexar
  // campos nullable). Se filtra por metodo_definido en su lugar.
  indexes: ['comanda_id', 'fecha', 'organization_id', '_modified', 'metodo_definido', 'anclado', 'anulado', 'facturado']
} as const

export const cobroReservaSchema = {
  version: 6,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    reserva_id: { type: 'string' },
    cliente_id: { type: ['string', 'null'] },
    monto: { type: 'number' },
    metodo_pago: { type: 'string', enum: ['efectivo', 'tarjeta', 'transferencia', 'credito_agencia', 'otros'] },
    tipo: { type: 'string', enum: ['anticipo', 'pago_total', 'credito', 'pago_credito'] },
    // Solo en tipo='pago_credito': id del cobro_reserva tipo='credito' que
    // se está liquidando (total o parcialmente).
    credito_id: { type: ['string', 'null'] },
    tarjeta_red: { type: ['string', 'null'] },
    transferencia_banco: { type: ['string', 'null'] },
    transferencia_referencia: { type: ['string', 'null'] },
    fecha: { type: 'string' },
    usuario_id: { type: ['string', 'null'] },
    check_in: { type: ['string', 'null'] },
    check_out: { type: ['string', 'null'] },
    descripcion: { type: ['string', 'null'] },
    // No-nullable: mismo motivo que en pagoSchema (RxDB no indexa campos nullable).
    anclado: { type: 'boolean' },
    anclado_at: { type: ['string', 'null'] },
    anclado_por: { type: ['string', 'null'] },
    anulado: { type: 'boolean' },
    anulado_motivo: { type: ['string', 'null'] },
    anulado_at: { type: ['string', 'null'] },
    anulado_por: { type: ['string', 'null'] },
    monto_reembolsado: { type: 'number' },
    reembolso_motivo: { type: ['string', 'null'] },
    reembolso_at: { type: ['string', 'null'] },
    reembolso_por: { type: ['string', 'null'] },
    // 3er check de estado en Centro de Ventas: número de factura con el que
    // se concilió esta transacción contra el sistema contable externo.
    facturado: { type: 'boolean' },
    numero_factura: { type: ['string', 'null'] },
    facturado_at: { type: ['string', 'null'] },
    facturado_por: { type: ['string', 'null'] },
    // Comprobante adjunto (foto/PDF), subido a Supabase Storage — solo se
    // guarda la URL pública. No se indexa: opcional y no se filtra por él.
    comprobante_url: { type: ['string', 'null'] },
    organization_id: { type: 'string' },
    _deleted: { type: 'boolean' },
    _modified: { type: 'string' }
  },
  required: ['id', 'reserva_id', 'monto', 'metodo_pago', 'tipo', 'fecha', 'anclado', 'anulado', 'monto_reembolsado', 'facturado', 'organization_id', '_deleted', '_modified'],
  // cliente_id no se indexa: es opcional (['string','null']) y RxDB no permite
  // indexar campos nullable. El filtro por cliente se hace en memoria sobre
  // la suscripción completa (ver useRxCobrosReserva + CobrosTab).
  indexes: ['reserva_id', 'fecha', 'organization_id', '_modified', 'anclado', 'facturado']
} as const

// Sub-esquema embebido — un movimiento dentro de RxVenta.movimientos.
// No es colección propia (ver comentario en RxVentaMovimiento).
const ventaMovimientoSubSchema = {
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    tipo: { type: 'string', enum: ['ajuste', 'pago', 'reembolso', 'anclar', 'facturar', 'anular', 'marcar_credito', 'comentario'] },
    monto: { type: ['number', 'null'] },
    metodo_pago: { type: ['string', 'null'], enum: ['efectivo', 'tarjeta', 'transferencia', 'credito_agencia', 'otros', null] },
    tarjeta_red: { type: ['string', 'null'] },
    transferencia_banco: { type: ['string', 'null'] },
    transferencia_referencia: { type: ['string', 'null'] },
    motivo: { type: ['string', 'null'] },
    numero_factura: { type: ['string', 'null'] },
    comprobante_url: { type: ['string', 'null'] },
    fecha: { type: 'string' },
    usuario_id: { type: ['string', 'null'] },
    anulado: { type: ['boolean', 'null'] },
    anulado_motivo: { type: ['string', 'null'] },
    anulado_at: { type: ['string', 'null'] },
    anulado_por: { type: ['string', 'null'] }
  },
  required: ['id', 'tipo', 'fecha']
} as const

const ventaSchema = {
  version: 4,
  primaryKey: 'id',
  type: 'object',
  properties: {
    id: { type: 'string', maxLength: 100 },
    // De dónde sale la venta.
    origen: { type: 'string', enum: ['mesa', 'reserva_restaurante', 'reserva_hotel'] },
    // Cómo se cobra — independiente del origen (ver comentario en RxVenta).
    tipo: { type: 'string', enum: ['directa', 'credito'] },
    cliente_id: { type: ['string', 'null'] },
    cliente_nombre: { type: ['string', 'null'] },
    referencia: { type: ['string', 'null'] },
    comanda_id: { type: ['string', 'null'] },
    // Documento de la venta (factura, confirmación de reserva) — distinto
    // del comprobante por movimiento (ver ventaMovimientoSubSchema).
    documento_url: { type: ['string', 'null'] },
    documento_nombre: { type: ['string', 'null'] },
    movimientos: { type: 'array', items: ventaMovimientoSubSchema },
    created_at: { type: 'string' },
    usuario_id: { type: ['string', 'null'] },
    organization_id: { type: 'string' },
    _deleted: { type: 'boolean' },
    _modified: { type: 'string' }
  },
  required: ['id', 'origen', 'tipo', 'movimientos', 'created_at', 'organization_id', '_deleted', '_modified'],
  // cliente_id y comanda_id no se indexan: son opcionales (['string','null'])
  // y RxDB no permite indexar campos nullable. El filtro por cliente/comanda
  // se hace en memoria sobre la suscripción completa (ver useVentasConMovimientos).
  indexes: ['organization_id', '_modified', 'origen', 'tipo']
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
  ventas: RxCollection<RxVenta>
  ajustes_iva: RxCollection<RxAjusteIva>
  usuarios: RxCollection<RxUsuario>
  menu_items: RxCollection<RxMenuItem>
}

let verticalDbPromise: Promise<RxDatabase<VerticalCollections>> | null = null
let verticalReplicationState: ReturnType<typeof startVerticalReplication> | null = null
let verticalReplicationOrgId: string | null = null
// Lock de inicialización: si initVerticalRxDb() se llama dos veces casi al
// mismo tiempo (ej. un handler que la llama directo + un useEffect reactivo
// al mismo cambio de organización), sin este lock ambas pasan el chequeo
// `!verticalReplicationState` antes de que la primera termine de asignarlo,
// arrancando la replicación por duplicado y dejándola en un estado roto.
let initInFlight: Promise<RxDatabase<VerticalCollections>> | null = null
// Se resuelve cuando el primer pull de todas las colecciones de la
// replicación activa completó (ver startVerticalReplication). La UI puede
// esperar esta promesa tras vincular un dispositivo para no exponer una
// pantalla vacía mientras el pull inicial sigue en curso.
let initialSyncPromise: Promise<void> | null = null
let suspendHooks = false

/**
 * Epoch de la base de datos local. Sube cada vez que se recrea la DB
 * (desvincular → vincular). Los hooks de React deben incluirlo en su
 * array de dependencias para re-suscribirse a la nueva instancia de
 * colección en vez de quedar pegados a la instancia destruida.
 */
let _dbEpoch = 0
const _dbEpochListeners = new Set<() => void>()

export function getDbEpoch() { return _dbEpoch }

export function subscribeDbEpoch(fn: () => void): () => void {
  _dbEpochListeners.add(fn)
  return () => _dbEpochListeners.delete(fn)
}

function bumpDbEpoch() {
  _dbEpoch++
  _dbEpochListeners.forEach(fn => fn())
}


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
  if (typeof patch.cortesia_cantidad === 'number' && patch.cortesia_cantidad !== (before?.cortesia_cantidad ?? 0)) {
    changes.push(patch.cortesia_cantidad > 0
      ? `cortesía: ${patch.cortesia_cantidad} unidad(es) — ${patch.cortesia_motivo || 'sin motivo'}`
      : 'cortesía removida')
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
    clientes: {
      schema: clienteSchema,
      migrationStrategies: {
        1: (oldDoc: any) => ({
          ...oldDoc,
          tipo_cliente: oldDoc.tipo_cliente ?? 'persona_natural',
          nombre_factura: oldDoc.nombre_factura ?? null,
          tipo_doc: oldDoc.tipo_doc ?? null,
          numero_doc: oldDoc.numero_doc ?? null,
          direccion_fiscal: oldDoc.direccion_fiscal ?? null,
          email_factura: oldDoc.email_factura ?? null,
        }),
      },
    },
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
    comanda_items: {
      schema: comandaItemSchema,
      migrationStrategies: {
        // v0 → v1: agrega cortesía por item (cantidad no cobrada + motivo)
        1: (oldDoc: any) => ({ ...oldDoc, cortesia_cantidad: 0, cortesia_motivo: null }),
        // v1 → v2: agrega anulado/anulado_motivo/anulado_at/anulado_por —
        // anular un ítem puntual ya enviado a cocina sin borrarlo.
        2: (oldDoc: any) => ({
          ...oldDoc,
          anulado: oldDoc.anulado ?? false,
          anulado_motivo: oldDoc.anulado_motivo ?? null,
          anulado_at: oldDoc.anulado_at ?? null,
          anulado_por: oldDoc.anulado_por ?? null,
        }),
      }
    },
    pisos: { schema: pisoSchema },
    habitacion_cuentas: { schema: habitacionCuentaSchema },
    reservas: { schema: reservaSchema },
    pagos: {
      schema: pagoSchema,
      migrationStrategies: {
        // v0 → v1: agrega campos de detalle de comprobante + trazabilidad de anclaje.
        // Nulos por defecto: el registro rápido existente no los llenaba.
        1: (oldDoc: any) => ({
          ...oldDoc,
          usuario_id: oldDoc.usuario_id ?? null,
          tarjeta_red: oldDoc.tarjeta_red ?? null,
          transferencia_banco: oldDoc.transferencia_banco ?? null,
          transferencia_referencia: oldDoc.transferencia_referencia ?? null,
          anclado: oldDoc.anclado ?? false,
          anclado_at: oldDoc.anclado_at ?? null,
          anclado_por: oldDoc.anclado_por ?? null,
        }),
        // v1 → v2: agrega anulación y reembolso.
        2: (oldDoc: any) => ({
          ...oldDoc,
          anulado: oldDoc.anulado ?? false,
          anulado_motivo: oldDoc.anulado_motivo ?? null,
          anulado_at: oldDoc.anulado_at ?? null,
          anulado_por: oldDoc.anulado_por ?? null,
          monto_reembolsado: oldDoc.monto_reembolsado ?? 0,
          reembolso_motivo: oldDoc.reembolso_motivo ?? null,
          reembolso_at: oldDoc.reembolso_at ?? null,
          reembolso_por: oldDoc.reembolso_por ?? null,
        }),
        // v2 → v3: pagos existentes ya tenían método elegido en el momento
        // del cobro (flujo previo), así que quedan con metodo_definido=true
        // y su metodo_pago tal cual. Solo los pagos nuevos (creados desde el
        // checkout ya simplificado) nacen con metodo_definido=false.
        3: (oldDoc: any) => ({
          ...oldDoc,
          metodo_definido: oldDoc.metodo_definido ?? (oldDoc.metodo_pago != null),
        }),
        // v3 → v4: bump sin cambio de datos. Fuerza reconstrucción del
        // schema en cachés locales que quedaron con una v3 previa a la
        // definición final (mismo caso que usuarios v2→v3 más abajo).
        4: (oldDoc: any) => oldDoc,
        // v4 → v5: 3er check de estado — conciliación con número de factura.
        5: (oldDoc: any) => ({
          ...oldDoc,
          facturado: oldDoc.facturado ?? false,
          numero_factura: oldDoc.numero_factura ?? (oldDoc.factura_nro || null),
          facturado_at: oldDoc.facturado_at ?? null,
          facturado_por: oldDoc.facturado_por ?? null,
        }),
        // v5 → v6: adjunto de comprobante (Centro de Ventas).
        6: (oldDoc: any) => ({
          ...oldDoc,
          comprobante_url: oldDoc.comprobante_url ?? null,
        }),
      },
    },
    // cobros_reserva: retirada del registro activo de colecciones — RxDB
    // community limita a 13 colecciones locales simultáneas y ya no recibe
    // nuevos registros (reemplazada por `ventas`). Su tabla y datos en
    // Supabase NO se tocan ni se borran, solo dejamos de abrirla localmente.
    ventas: {
      schema: ventaSchema,
      migrationStrategies: {
        // v0 → v1: agrega 'marcar_credito' al enum de movimientos[].tipo —
        // passthrough, ningún documento existente usa ese valor todavía.
        1: (oldDoc: any) => oldDoc,
        // v1 → v2: documento de venta (factura/confirmación) — separado del
        // comprobante por movimiento, que ya vivía en cada RxVentaMovimiento.
        2: (oldDoc: any) => ({
          ...oldDoc,
          documento_url: oldDoc.documento_url ?? null,
          documento_nombre: oldDoc.documento_nombre ?? null,
        }),
        // v2 → v3: agrega 'comentario' al enum de movimientos[].tipo —
        // passthrough, ningún documento existente usa ese valor todavía.
        3: (oldDoc: any) => oldDoc,
        // v3 → v4: agrega anulado/anulado_motivo/anulado_at/anulado_por a
        // cada movimiento — permite anular un movimiento puntual (se cargó
        // mal) sin borrarlo, en vez de solo poder anular la venta entera.
        4: (oldDoc: any) => ({
          ...oldDoc,
          movimientos: (oldDoc.movimientos ?? []).map((m: any) => ({
            ...m,
            anulado: m.anulado ?? false,
            anulado_motivo: m.anulado_motivo ?? null,
            anulado_at: m.anulado_at ?? null,
            anulado_por: m.anulado_por ?? null,
          })),
        }),
      },
    },
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
    if (clean.cortesia_cantidad === null || clean.cortesia_cantidad === undefined) clean.cortesia_cantidad = 0
    if (clean.anulado === null || clean.anulado === undefined) clean.anulado = false
    return clean
  }

  // Para usuarios: garantiza que user_id nunca sea null (fallback al id legacy)
  // Algunas filas pueden llegar con user_id=null si el backfill en Supabase no las cubrió.
  // Sin este fallback RxDB rechaza el doc (user_id está en `required`) y el pull
  // de la colección falla, bloqueando awaitInitialReplication() para todos.
  const normalizeUsuario = (doc: any) => {
    const clean = stripUndefined(doc)
    if (!clean.user_id) clean.user_id = clean.id  // fallback: antes id == auth.uid()
    return clean
  }

  // El plugin de Supabase ignora push.handler en las opciones; construye el suyo propio.
  // Para sobreescribirlo hay que mutar replicationPrimitivesPush.handler post-creación.
  //
  // Un dispositivo recién vinculado arranca con RxDB local vacío. Con push y
  // pull corriendo en paralelo (live: true) desde el primer instante, cualquier
  // cambio local que ocurra antes de que el pull inicial complete podría
  // empujar hacia Supabase un estado incompleto, afectando a los demás
  // dispositivos ya sincronizados. `pushEnabled` bloquea todo push hasta que
  // `markInitialSyncDone()` confirme que el pull inicial de todas las
  // colecciones terminó (ver esperarSyncInicial más abajo).
  let pushEnabled = false
  const markInitialSyncDone = () => { pushEnabled = true }

  // Salvavidas contra deadlock: si al arrancar hay cambios locales
  // pendientes de push (ej. se editó algo justo antes de recargar), RxDB
  // intenta subirlos como parte de SU PROPIO ciclo de arranque, antes de
  // que awaitInitialReplication() resuelva. El guard de arriba rechaza ese
  // push con una excepción — pero esa misma excepción hace que RxDB nunca
  // termine de marcar el arranque como completo, así que
  // awaitInitialReplication() se queda colgada para siempre y el guard
  // nunca se libera solo. Este timeout rompe ese círculo: si el pull
  // inicial no logró desbloquear el push en un tiempo razonable, se
  // habilita de todas formas (mismo criterio que el catch() de abajo,
  // solo que sin depender de que la promesa llegue a resolver/rechazar).
  setTimeout(() => {
    if (!pushEnabled) {
      console.warn('[RxDB] timeout esperando sincronización inicial, habilitando push de todas formas')
      markInitialSyncDone()
    }
  }, 8000)

  const makePushHandler = (tableName: string, transformRow?: (doc: Record<string, unknown>) => Record<string, unknown>) =>
    async (rows: Array<{ newDocumentState: any; assumedMasterState: any }>) => {
      if (!pushEnabled) throw new Error('push suspendido: esperando sincronización inicial')
      // Offline: no intentar push, lanzar para que RxDB reintente después
      if (!navigator.onLine) throw new Error('offline')

      const toUpsert = rows
        .map(r => ({ ...r.newDocumentState }))
        .map(doc => transformRow ? transformRow(doc) : doc)
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
          // Errores de datos (validación, columna faltante, etc.): no se puede
          // reintentar sin intervención, pero descartar el doc en silencio deja
          // datos "atascados" para siempre en local sin que nadie se entere
          // (pasó con menu_items cuando faltaba la columna es_bebida). Se marca
          // como error de la colección para que quede visible en el panel de
          // sync de Ajustes, en vez de solo un console.warn.
          const dataErrorMsg = `${error.message} (código ${error.code || 's/c'})`
          console.warn(`[Push ${tableName}] descartado:`, dataErrorMsg)
          lastCollectionError[tableName] = dataErrorMsg
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

  const sanitizeVentaDoc = (doc: Record<string, unknown>) => {
    const clean = { ...doc }
    delete clean.documento_nombre
    delete clean.documento_url
    return clean
  }

  const ventas = patchPush(replicateSupabase({
    ...replicaBase,
    tableName: 'ventas',
    client: supabase,
    collection: db.ventas,
    replicationIdentifier: `ventas-supabase-${orgId}`,
    pull: { batchSize: 100, queryBuilder, modifier: stripUndefined },
    push: { batchSize: 100 }
  }), makePushHandler('ventas', sanitizeVentaDoc))

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
    pull: { batchSize: 100, queryBuilder, modifier: normalizeUsuario }
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

  const allReplications = [clientes, categorias, mesas, comandas, items, pisos, habitacionCuentas, reservas, pagos, ventas, ajustesIva, usuarios, menuItems]

  // Espera el primer pull de TODAS las colecciones antes de habilitar el push.
  // Si el dispositivo está offline o el pull inicial falla, no bloqueamos para
  // siempre: awaitInitialReplication() de RxDB se resuelve igual apenas hay
  // datos disponibles (vacíos si no hay red), así que el push se habilita en
  // cuanto la replicación logra completar un ciclo, con o sin conexión al
  // vincular. El objetivo es solo evitar la ventana de carrera del primer
  // instante, no exigir sincronización perfecta antes de operar.
  initialSyncPromise = Promise.all(allReplications.map((state: any) => state?.awaitInitialReplication?.()))
    .then(() => { markInitialSyncDone() })
    .catch((err: unknown) => {
      console.warn('[RxDB] error esperando sincronización inicial, habilitando push de todas formas:', err)
      markInitialSyncDone()
    })

  return { clientes, categorias, mesas, comandas, items, pisos, habitacionCuentas, reservas, pagos, ventas, ajustesIva, usuarios, menuItems }
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
  // Si ya hay una inicialización en curso, todas las llamadas concurrentes
  // esperan esa misma promesa en vez de correr el bloque de abajo en paralelo.
  if (initInFlight) return initInFlight
  initInFlight = initVerticalRxDbInner()
  try {
    return await initInFlight
  } finally {
    initInFlight = null
  }
}

async function initVerticalRxDbInner() {
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

export async function getVerticalRxDb() {
  return initVerticalRxDb()
}

/**
 * Destruye por completo la base de datos local (storage incluido), sin dejar
 * rastros replicables. Para usar al desvincular el dispositivo.
 *
 * IMPORTANTE: no usar `.find().remove()` por colección para "limpiar" — eso
 * crea borrados lógicos (_deleted: true) que la replicación interpreta como
 * cambios locales pendientes y los EMPUJA a Supabase al re-vincular,
 * borrando los datos reales de la organización para todos los dispositivos.
 * (Ese fue el bug que vació las organizaciones al vincular un dispositivo.)
 */
export async function resetLocalDatabase() {
  stopVerticalReplication()
  if (verticalDbPromise) {
    try {
      const db = await verticalDbPromise
      await db.remove()
    } catch (e) {
      console.warn('[RxDB] error destruyendo base local durante desvinculación:', e)
    }
  }
  verticalDbPromise = null
  initInFlight = null
  initialSyncPromise = null
  // Notifica a los hooks de React que la DB fue destruida y deben
  // re-suscribirse a la nueva instancia cuando se recree.
  bumpDbEpoch()
}

/**
 * Espera a que el primer pull de todas las colecciones complete (con datos
 * si hay red, o de inmediato si no la hay). Pensada para mostrar una
 * pantalla de "Sincronizando…" tras vincular un dispositivo nuevo, antes de
 * dejarlo operar — así nunca se ve la app vacía mientras el pull real sigue
 * en curso. Debe llamarse después de initVerticalRxDb().
 */
export async function waitForInitialSync(timeoutMs = 15_000): Promise<void> {
  if (!initialSyncPromise) return
  // Race: resolvemos en cuanto el pull termina O pasado el timeout, lo que ocurra
  // primero. Sin timeout, un error de red en una colección podría colgar la pantalla
  // de "Sincronizando..." para siempre.
  await Promise.race([
    initialSyncPromise,
    new Promise<void>(resolve => setTimeout(resolve, timeoutMs))
  ])
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
  const [mesasCount, comandasCount, itemsCount] = await Promise.all([
    db.mesas.count().exec(),
    db.comandas.count().exec(),
    db.comanda_items.count().exec()
  ])
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

// Anula un ítem puntual ya confirmado/enviado a cocina (se acabó el insumo,
// error de cocina). Nunca se borra — se marca `anulado` con motivo
// obligatorio, igual que anularVentaMovimiento. Función dedicada (no vía
// updateRxComandaItem) para que el audit log quede como 'status_change'
// inequívoco, no un 'update' genérico.
export async function anularComandaItem(itemId: string, motivo: string, usuarioId?: string) {
  const db = await initVerticalRxDb()
  getActiveOrgIdStrict()
  const doc = await db.comanda_items.findOne(itemId).exec(true)
  const before = doc?.toJSON()
  const now = new Date().toISOString()
  const result = await doc.update({
    $set: {
      anulado: true,
      anulado_motivo: motivo,
      anulado_at: now,
      anulado_por: usuarioId,
      updated_at: now,
      _modified: now
    }
  } as any)
  await createAuditLog({
    entity: 'comanda_item',
    entityId: itemId,
    action: 'status_change',
    summary: `Anuló el ítem ${before?.nombre || itemId}: ${motivo}`,
    before,
    after: result.toJSON(),
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
  // Si no se pasa metodo_pago, el cobro nace "pendiente de definir" (Mesas
  // ya no elige método al cerrar). Si sí se pasa (ej. split de cuenta que
  // aún fuerza 'efectivo'), queda como definido desde ya.
  const metodoDefinido = input.metodo_definido ?? (input.metodo_pago != null)
  const created = await db.pagos.insert({
    ...input,
    metodo_pago: input.metodo_pago ?? null,
    metodo_definido: metodoDefinido,
    anclado: input.anclado ?? false,
    anulado: input.anulado ?? false,
    monto_reembolsado: input.monto_reembolsado ?? 0,
    facturado: input.facturado ?? false,
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

// Borrado real (no anular) de un pago — SOLO dev mode. En producción un
// cobro nunca se elimina, se anula (ver updateRxPago con anulado=true) para
// conservar el rastro contable; esto es exclusivamente para limpiar
// transacciones de prueba durante desarrollo. doc.remove() marca
// _deleted=true, que sí se replica a Supabase (a diferencia de un remove
// masivo por colección — ver resetLocalDatabase más abajo, ese caso es
// distinto porque no queremos que se replique).
export async function deleteRxPago(id: string) {
  if (!import.meta.env.DEV) throw new Error('deleteRxPago solo está disponible en desarrollo')
  const db = await initVerticalRxDb()
  getActiveOrgIdStrict()
  const doc = await db.pagos.findOne(id).exec(true)
  const before = doc?.toJSON()
  await doc.remove()
  await createAuditLog({
    entity: 'pago',
    entityId: id,
    action: 'delete',
    summary: `[DEV] Se eliminó el pago ${id}`,
    before,
    source: 'rxdb'
  })
}

// Crea una venta junto con su primer movimiento: un 'ajuste' por el monto
// inicial, embebido directo en `movimientos`. Es el único punto de entrada
// para nacer una venta — nunca se inserta una venta sin al menos un
// movimiento, porque el monto total se deriva de los movimientos, no es un
// campo propio.
export async function createRxVenta(
  ventaInput: Omit<RxVenta, '_deleted' | '_modified' | 'created_at' | 'movimientos'> & { created_at?: string },
  montoInicial: number,
  movimientoExtra?: Partial<Omit<RxVentaMovimiento, 'id' | 'tipo' | 'monto'>>
) {
  const db = await initVerticalRxDb()
  const now = new Date().toISOString()
  const orgId = ventaInput.organization_id || getActiveOrgIdStrict()

  const primerMovimiento: RxVentaMovimiento = {
    id: crypto.randomUUID(),
    tipo: 'ajuste',
    monto: montoInicial,
    fecha: now,
    ...movimientoExtra,
  }

  const venta = await db.ventas.insert({
    ...ventaInput,
    movimientos: [primerMovimiento],
    created_at: ventaInput.created_at || now,
    organization_id: orgId,
    _deleted: false,
    _modified: now
  } as RxVenta)

  await createAuditLog({
    entity: 'venta',
    entityId: venta.id,
    action: 'create',
    summary: `Se registró una venta de $${montoInicial.toFixed(2)} (${venta.origen})`,
    after: venta.toJSON(),
    source: 'rxdb'
  })

  return venta
}

// Actualiza campos propios de la venta (no del historial) — documento de
// venta (factura, confirmación de reserva) y/o cliente asociado. Distinto
// de agregarVentaMovimiento: esto edita el documento directamente, no
// agrega un evento al historial (el cambio de cliente no es un movimiento
// de dinero, es una corrección de datos).
export async function updateRxVenta(id: string, patch: Partial<Pick<RxVenta, 'documento_url' | 'documento_nombre' | 'cliente_id' | 'cliente_nombre'>>) {
  const db = await initVerticalRxDb()
  getActiveOrgIdStrict()
  const doc = await db.ventas.findOne(id).exec(true)
  const before = doc?.toJSON()
  const result = await doc.update({
    $set: {
      ...patch,
      _modified: new Date().toISOString()
    }
  } as any)
  await createAuditLog({
    entity: 'venta',
    entityId: id,
    action: 'update',
    summary: `Se actualizó la venta ${id}`,
    before,
    after: result.toJSON(),
    source: 'rxdb'
  })
  return result
}

// Agrega un movimiento al historial de una venta existente — pago,
// reembolso, ajuste (aumentar/disminuir el monto), o cambio de estado
// (anclar/facturar/anular). Nunca edita movimientos previos, solo agrega al
// array `movimientos` del documento (ver comentario en RxVenta sobre por
// qué el historial vive embebido en vez de en colección propia).
export async function agregarVentaMovimiento(
  input: { venta_id: string } & Omit<RxVentaMovimiento, 'id' | 'fecha'> & { fecha?: string }
) {
  const db = await initVerticalRxDb()
  getActiveOrgIdStrict()
  const doc = await db.ventas.findOne(input.venta_id).exec(true)
  const before = doc?.toJSON()

  const movimiento: RxVentaMovimiento = {
    id: crypto.randomUUID(),
    tipo: input.tipo,
    monto: input.monto,
    metodo_pago: input.metodo_pago,
    tarjeta_red: input.tarjeta_red,
    transferencia_banco: input.transferencia_banco,
    transferencia_referencia: input.transferencia_referencia,
    motivo: input.motivo,
    numero_factura: input.numero_factura,
    comprobante_url: input.comprobante_url,
    fecha: input.fecha || new Date().toISOString(),
    usuario_id: input.usuario_id,
  }

  const result = await doc.update({
    $set: {
      movimientos: [...(before?.movimientos ?? []), movimiento],
      // 'marcar_credito' es de una sola vía: además de quedar en el
      // historial, actualiza el tipo de la venta para que el resto de la
      // UI (filtros, listados) la trate como crédito de ahí en adelante.
      ...(input.tipo === 'marcar_credito' ? { tipo: 'credito' as const } : {}),
      _modified: new Date().toISOString()
    }
  } as any)

  await createAuditLog({
    entity: 'venta',
    entityId: input.venta_id,
    action: ['anclar', 'facturar', 'anular', 'marcar_credito'].includes(input.tipo) ? 'status_change' : 'update',
    summary: `Movimiento '${input.tipo}' en venta ${input.venta_id}` + (input.monto != null ? ` por $${input.monto.toFixed(2)}` : ''),
    before,
    after: result.toJSON(),
    source: 'rxdb'
  })

  return result
}

// Anula un movimiento puntual del historial (se cargó un dato mal) sin
// borrarlo — única excepción al "nunca se edita, solo se agrega" del resto
// del modelo. El movimiento queda visible con su motivo de anulación, mismo
// espíritu que anular una venta completa: el registro nunca desaparece.
export async function anularVentaMovimiento(ventaId: string, movimientoId: string, motivo: string, usuarioId?: string) {
  const db = await initVerticalRxDb()
  getActiveOrgIdStrict()
  const doc = await db.ventas.findOne(ventaId).exec(true)
  const before = doc?.toJSON()
  const now = new Date().toISOString()

  const movimientos = (before?.movimientos ?? []).map((m: any) =>
    m.id === movimientoId
      ? { ...m, anulado: true, anulado_motivo: motivo, anulado_at: now, anulado_por: usuarioId }
      : m
  )

  const result = await doc.update({
    $set: {
      movimientos,
      _modified: now
    }
  } as any)

  await createAuditLog({
    entity: 'venta',
    entityId: ventaId,
    action: 'status_change',
    summary: `Se anuló el movimiento ${movimientoId} de la venta ${ventaId}: ${motivo}`,
    before,
    after: result.toJSON(),
    source: 'rxdb'
  })

  return result
}

// Adjunta, reemplaza o quita (comprobanteUrl=null) el comprobante de un
// movimiento ya existente — para cuando se olvidó subirlo al registrar el
// pago/ajuste/reembolso original, o hace falta cargarlo de nuevo. Igual que
// anularVentaMovimiento, es una excepción puntual al "solo agregar":
// únicamente toca comprobante_url, el resto del movimiento queda intacto.
// NOTA: hoy solo desvincula la URL guardada en RxDB — no borra el archivo
// del storage real (mockup con localStorage, ver src/lib/comprobantes.ts).
// Cuando haya un storage real, agregar aquí el borrado del objeto remoto.
export async function adjuntarComprobanteMovimiento(ventaId: string, movimientoId: string, comprobanteUrl: string | null) {
  const db = await initVerticalRxDb()
  getActiveOrgIdStrict()
  const doc = await db.ventas.findOne(ventaId).exec(true)
  const before = doc?.toJSON()
  const now = new Date().toISOString()

  const movimientos = (before?.movimientos ?? []).map((m: any) =>
    m.id === movimientoId ? { ...m, comprobante_url: comprobanteUrl } : m
  )

  const result = await doc.update({
    $set: {
      movimientos,
      _modified: now
    }
  } as any)

  await createAuditLog({
    entity: 'venta',
    entityId: ventaId,
    action: 'update',
    summary: comprobanteUrl
      ? `Se adjuntó comprobante al movimiento ${movimientoId} de la venta ${ventaId}`
      : `Se quitó el comprobante del movimiento ${movimientoId} de la venta ${ventaId}`,
    before,
    after: result.toJSON(),
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
