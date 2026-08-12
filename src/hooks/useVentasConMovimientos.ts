import { useMemo } from 'react'
import { useRxVentas } from './useRxVentas'
import type { RxVenta, RxVentaMovimiento, VentaOrigen } from '../db/rxdb'

export interface VentaConMovimientos {
  venta: RxVenta
  movimientos: RxVentaMovimiento[] // orden cronológico ascendente
  montoTotal: number   // suma de movimientos tipo 'ajuste'
  totalPagado: number  // suma de movimientos tipo 'pago'
  totalReembolsado: number // suma de movimientos tipo 'reembolso'
  saldo: number         // montoTotal - totalPagado + totalReembolsado
  // 'anclar' y 'facturar' se fusionaron en una sola acción (vincular
  // número de factura) — facturado es true si existe cualquiera de los dos
  // con numero_factura, para leer también historiales previos a la fusión.
  facturado: boolean
  anulado: boolean       // existe al menos un movimiento 'anular'
  numeroFactura: string | null // del último movimiento anclar/facturar con numero_factura
  comprobanteUrl: string | null // del movimiento más reciente que tenga uno
  metodoPago: string | null // del movimiento 'pago' más reciente, o null
  // Todos los documentos de venta + comprobantes de movimientos
  documentosAdjuntos: Array<{ id: string; url: string; nombre: string; origen: string }>
  // Todos los comentarios concatenados — permite buscar la venta por
  // contenido de comentario desde la lista, sin abrir el detalle.
  textoComentarios: string
  fechaUltimoMovimiento: string
}

function calcular(venta: RxVenta): VentaConMovimientos {
  const ordenados = [...(venta.movimientos ?? [])].sort(
    (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
  )

  let montoTotal = 0
  let totalPagado = 0
  let totalReembolsado = 0
  let facturado = false
  let anulado = false
  let numeroFactura: string | null = null
  let comprobanteUrl: string | null = null
  let metodoPago: string | null = null
  const comentarios: string[] = []
  const documentosAdjuntos: Array<{ id: string; url: string; nombre: string; origen: string }> = []
  const urlsVistas = new Set<string>()

  // Documento principal a nivel de venta
  if (venta.documento_url && !urlsVistas.has(venta.documento_url)) {
    urlsVistas.add(venta.documento_url)
    documentosAdjuntos.push({
      id: `venta-doc-${venta.id}`,
      url: venta.documento_url,
      nombre: venta.documento_nombre || 'Documento de venta',
      origen: 'Venta'
    })
  }

  for (const m of ordenados) {
    // Un movimiento anulado (dato cargado mal) queda visible en el
    // historial pero se excluye por completo de los cálculos derivados —
    // como si nunca hubiera pasado, salvo por el registro en sí.
    if (m.anulado) continue
    if (m.tipo === 'ajuste') montoTotal += m.monto ?? 0
    else if (m.tipo === 'pago') { totalPagado += m.monto ?? 0; metodoPago = m.metodo_pago ?? metodoPago }
    else if (m.tipo === 'reembolso') totalReembolsado += m.monto ?? 0
    else if (m.tipo === 'anclar' || m.tipo === 'facturar') {
      if (m.numero_factura) {
        facturado = true;
        numeroFactura = m.numero_factura;
      }
    }
    else if (m.tipo === 'anular') anulado = true
    else if (m.tipo === 'comentario' && m.motivo) comentarios.push(m.motivo)
    
    if (m.comprobante_url && !urlsVistas.has(m.comprobante_url)) {
      urlsVistas.add(m.comprobante_url)
      comprobanteUrl = m.comprobante_url
      documentosAdjuntos.push({
        id: m.id,
        url: m.comprobante_url,
        nombre: m.motivo || `Comprobante ${m.tipo}`,
        origen: m.tipo
      })
    }
  }

  return {
    venta,
    movimientos: ordenados,
    montoTotal,
    totalPagado,
    totalReembolsado,
    saldo: montoTotal - totalPagado + totalReembolsado,
    facturado,
    anulado,
    numeroFactura,
    comprobanteUrl,
    metodoPago,
    documentosAdjuntos,
    textoComentarios: comentarios.join(' '),
    fechaUltimoMovimiento: ordenados[ordenados.length - 1]?.fecha ?? venta.created_at,
  }
}

/**
 * Fuente única de datos del Centro de Ventas v2: cada RxVenta ya trae su
 * historial embebido (`movimientos`) — este hook solo deriva monto total,
 * saldo y estado (anclado/facturado/anulado), nunca son campos propios,
 * siempre se recalculan sumando/inspeccionando el array.
 */
export function useVentasConMovimientos() {
  const { ventas } = useRxVentas()

  const items = useMemo<VentaConMovimientos[]>(() => {
    return (ventas as RxVenta[])
      .map(calcular)
      .sort((a, b) => new Date(b.fechaUltimoMovimiento).getTime() - new Date(a.fechaUltimoMovimiento).getTime())
  }, [ventas])

  return { items }
}

export type { VentaOrigen }
