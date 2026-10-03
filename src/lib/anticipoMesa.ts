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
type VentaLike = { id: string; comanda_id?: string | null; referencia?: string | null; created_at?: string; movimientos?: Mov[] }

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

/**
 * Anticipo disponible de la mesa. `ventasMesa` son las ventas ligadas a
 * comandas de la mesa; solo cuentan las no anuladas, no divididas, cuya
 * comanda sigue abierta (`comandasOperativas`) o que ya tienen anticipo
 * aplicado de una cuenta anterior de la misma mesa. Así una venta vieja
 * cerrada antes de este esquema no reaparece como saldo a favor.
 */
export function calcularAnticipoMesa(ventasMesa: VentaLike[], comandasOperativas: Set<string>): AnticipoPool {
  const ventas = ventasMesa
    .filter(v => !(v.movimientos ?? []).some(m => m.tipo === 'anular' && !m.anulado))
    .filter(v => !esVentaDividida(v))
    .filter(v => (v.comanda_id && comandasOperativas.has(v.comanda_id)) || tieneAnticipoAplicado(v))
    .map(venta => ({ venta, disponible: disponibleVenta(venta) }))
    .filter(x => x.disponible > 0.001)
    .sort((a, b) => b.disponible - a.disponible)
  return { disponible: ventas.reduce((acc, x) => acc + x.disponible, 0), ventas }
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
