// Anticipo de mesa: dinero ya cobrado (abono de una reserva, o un cobro
// registrado en la mesa) que queda a favor de la MESA, no de una comanda. Al
// cerrar una cuenta se decide si se usa como cobro o si se genera uno nuevo,
// siempre dentro de la misma venta de Centro de Ventas.
//
// El libro de la venta (ver useVentasConMovimientos): saldo = ajustes − pagos +
// reembolsos. Para que varias cuentas de la misma mesa compartan el anticipo
// sin tocar esos totales, cada vez que se usa se deja un movimiento
// 'comentario' (neutro en los cálculos) con el formato de MARCA_APLICADO, y el
// disponible se calcula como pagos − reembolsos − aplicado.

type Mov = { tipo: string; monto?: number; anulado?: boolean; motivo?: string }
type VentaLike = { id: string; comanda_id?: string | null; cliente_id?: string | null; cliente_nombre?: string | null; referencia?: string | null; created_at?: string; movimientos?: Mov[] }

export const MARCA_APLICADO = 'Anticipo aplicado'

export const textoAplicado = (monto: number, folio: number | string) =>
  `${MARCA_APLICADO}: $${monto.toFixed(2)} · Comanda #${folio}`

const reAplicado = /Anticipo aplicado: \$([\d.]+)/

export function esVentaDividida(v: VentaLike) {
  return typeof v.referencia === 'string' && v.referencia.includes('Dividido - ')
}

export function tieneAnticipoAplicado(v: VentaLike) {
  return (v.movimientos ?? []).some(m => m.tipo === 'comentario' && !m.anulado && !!m.motivo?.startsWith(MARCA_APLICADO))
}

/** Dinero a favor que le queda a una venta: pagos − reembolsos − anticipo ya aplicado. */
export function disponibleVenta(v: VentaLike) {
  let total = 0
  for (const m of v.movimientos ?? []) {
    if (m.anulado) continue
    if (m.tipo === 'pago') total += m.monto ?? 0
    else if (m.tipo === 'reembolso') total -= m.monto ?? 0
    else if (m.tipo === 'comentario' && m.motivo) {
      const hit = reAplicado.exec(m.motivo)
      if (hit) total -= Number(hit[1]) || 0
    }
  }
  return Math.max(0, total)
}

export interface AnticipoPool {
  disponible: number
  /** Ventas con saldo a favor, de mayor a menor disponible. */
  ventas: Array<{ venta: VentaLike; disponible: number }>
}

/** Quién está pagando: el anticipo es de la PERSONA que lo dejó, no de la mesa. */
export interface ContextoAnticipo {
  clienteId?: string | null
  clienteNombre?: string | null
  /** Comandas que comparten cuenta con la actual: ella misma y, en Mesa Múltiple, sus subcomandas hermanas. */
  grupoComandaIds: Set<string>
}

const NOMBRES_GENERICOS = new Set(['', 'consumidor final', 'publico general'])
const normalizarNombre = (t?: string | null) =>
  (t ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase()

/**
 * ¿El saldo de esta venta es de quien está pagando? Sí si la venta cuelga de la
 * propia cuenta (o de una subcomanda hermana de la misma Mesa Múltiple), o si
 * pertenece al mismo cliente: mismo cliente_id o, sin él, el mismo nombre
 * exacto. Un cliente sin identificar ("Consumidor Final") no hereda saldos.
 */
export function ventaEsDelCliente(v: VentaLike, ctx: ContextoAnticipo) {
  if (v.comanda_id && ctx.grupoComandaIds.has(v.comanda_id)) return true
  if (ctx.clienteId && v.cliente_id) return v.cliente_id === ctx.clienteId
  const nombre = normalizarNombre(ctx.clienteNombre)
  if (NOMBRES_GENERICOS.has(nombre)) return false
  return normalizarNombre(v.cliente_nombre) === nombre
}

/**
 * Anticipo disponible para quien está pagando. `ventas` son las candidatas (las
 * de las comandas de la mesa y las del mismo cliente en otras mesas); solo cuentan las no
 * anuladas, no divididas, de ese cliente, cuya comanda sigue abierta
 * (`comandasOperativas`) o que ya tienen anticipo aplicado de una cuenta
 * anterior. Así una venta vieja cerrada antes de este esquema no reaparece, y
 * el saldo que dejó un cliente nunca lo ve el siguiente en la misma mesa.
 */
export function calcularAnticipoMesa(ventas: VentaLike[], comandasOperativas: Set<string>, ctx: ContextoAnticipo): AnticipoPool {
  const candidatas = ventas
    .filter(v => !(v.movimientos ?? []).some(m => m.tipo === 'anular' && !m.anulado))
    .filter(v => !esVentaDividida(v))
    .filter(v => ventaEsDelCliente(v, ctx))
    .filter(v => (v.comanda_id && comandasOperativas.has(v.comanda_id)) || tieneAnticipoAplicado(v))
    .map(venta => ({ venta, disponible: disponibleVenta(venta) }))
    .filter(x => x.disponible > 0.001)
    .sort((a, b) => b.disponible - a.disponible)
  return { disponible: candidatas.reduce((acc, x) => acc + x.disponible, 0), ventas: candidatas }
}

/** Reparte `monto` entre las ventas del pool, de la de mayor saldo a la menor. */
export function repartirAnticipo(pool: AnticipoPool, monto: number) {
  let restante = monto
  const partes: Array<{ ventaId: string; monto: number }> = []
  for (const { venta, disponible } of pool.ventas) {
    if (restante <= 0.001) break
    const parte = Math.min(disponible, restante)
    partes.push({ ventaId: venta.id, monto: parte })
    restante -= parte
  }
  return partes
}

// ── Cargo de la venta ────────────────────────────────────────────────────────
// La venta de una reserva ya nace con su cargo (ajuste = lo que se espera
// consumir). Cerrar una cuenta o subcomanda de esa mesa NO debe sumar otro
// ajuste encima: ese consumo ya estaba en el cargo. Solo si el consumo
// acumulado de las cuentas cerradas contra la venta supera su cargo se agrega
// la diferencia. Cada cierre deja una marca neutra con lo que consumió.

export const MARCA_CERRADA = 'Cuenta cerrada'

export const textoCuentaCerrada = (monto: number, folio: number | string) =>
  `${MARCA_CERRADA}: $${monto.toFixed(2)} · Comanda #${folio}`

const reCerrada = /Cuenta cerrada: \$([\d.]+)/

/** Cargo actual de la venta: suma de sus ajustes vigentes. */
export function cargoVenta(v: VentaLike) {
  return (v.movimientos ?? []).reduce((acc, m) => (m.tipo === 'ajuste' && !m.anulado ? acc + (m.monto ?? 0) : acc), 0)
}

/** Consumo ya cerrado contra esta venta (suma de las marcas "Cuenta cerrada"). */
export function consumoCerrado(v: VentaLike) {
  return (v.movimientos ?? []).reduce((acc, m) => {
    if (m.anulado || m.tipo !== 'comentario' || !m.motivo) return acc
    const hit = reCerrada.exec(m.motivo)
    return hit ? acc + (Number(hit[1]) || 0) : acc
  }, 0)
}

/** Cuánto hay que subir el cargo de la venta al cerrar una cuenta de `consumo`. */
export function ajusteNecesario(v: VentaLike, consumo: number) {
  return Math.max(0, consumoCerrado(v) + consumo - cargoVenta(v))
}

// ── Liquidación de una comanda ───────────────────────────────────────────────
// Lo que dejaron las marcas al cerrar una cuenta contra una venta con anticipo:
// cuánto consumió, cuánto del anticipo se usó y cuánto quedó por cobrar (a
// anclar en Centro de Ventas). Se lee por folio, de cualquiera de las ventas
// de la mesa.

export interface LiquidacionComanda {
  /** Consumo cerrado ("Cuenta cerrada"). */
  consumo: number
  /** Anticipo aplicado a esta cuenta. */
  anticipoAplicado: number
  /** Lo que no cubrió el anticipo: queda por anclar/cobrar. */
  porCobrar: number
  /** Venta (Centro de Ventas) que guarda las marcas de esta cuenta. */
  ventaId: string
}

export function liquidacionComanda(ventas: VentaLike[], folio: number | string): LiquidacionComanda | null {
  const sufijo = `Comanda #${folio}`
  let consumo = 0
  let anticipoAplicado = 0
  let ventaId = ''
  for (const v of ventas) {
    for (const m of v.movimientos ?? []) {
      if (m.anulado || m.tipo !== 'comentario' || !m.motivo || !m.motivo.endsWith(sufijo)) continue
      const aplicado = reAplicado.exec(m.motivo)
      if (aplicado) { anticipoAplicado += Number(aplicado[1]) || 0; ventaId ||= v.id; continue }
      const cerrada = reCerrada.exec(m.motivo)
      if (cerrada) { consumo += Number(cerrada[1]) || 0; ventaId ||= v.id }
    }
  }
  if (!ventaId) return null
  return { consumo, anticipoAplicado, porCobrar: Math.max(0, consumo - anticipoAplicado), ventaId }
}
