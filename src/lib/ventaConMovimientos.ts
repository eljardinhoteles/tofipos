import type { RxVenta, RxVentaMovimiento } from '../db/rxdb'

// Cálculo puro de una venta a partir de su historial embebido de movimientos (sin React ni base de datos, para poder
// probarlo). El monto total, el saldo y los estados (facturado, anulado…) nunca son campos propios: siempre se
// recalculan sumando e inspeccionando el array `movimientos`. Lo consume useVentasConMovimientos.

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
  // true si ya se facturó y ningún pago es posterior a la última factura —
  // es decir, no hay dinero nuevo pendiente de facturar. Sin monto por
  // factura (no se registra cuánto cubre cada una), la fecha es la señal
  // disponible: un pago después de la última factura implica saldo sin
  // facturar, aunque `facturado` siga en true por haber facturado antes.
  facturaAlDia: boolean
  anulado: boolean       // existe al menos un movimiento 'anular'
  numeroFactura: string | null // del último movimiento anclar/facturar con numero_factura
  comprobanteUrl: string | null // del movimiento más reciente que tenga uno
  metodoPago: string | null // del movimiento 'pago' más reciente, o null
  // Todos los documentos de venta + comprobantes de movimientos
  documentosAdjuntos: Array<{ id: string; url: string; nombre: string; origen: string }>
  // Todos los comentarios concatenados — permite buscar la venta por
  // contenido de comentario desde la lista, sin abrir el detalle.
  textoComentarios: string
  cantidadComentarios: number
  fechaUltimoMovimiento: string
  motivoAnulacion: string | null
}

const NOMBRE_DE_ARCHIVO = /\.(pdf|png|jpe?g|webp|heic|gif)$/i

// Nombre legible del comprobante de un movimiento. El archivo original no guarda su nombre (se comprime y se sube con
// un identificador), así que se arma con los datos del movimiento: factura, pago con su método, etc.
function nombreComprobante(m: { tipo: string; monto?: number; metodo_pago?: string; numero_factura?: string; motivo?: string }): string {
  const monto = m.monto ? ` $${m.monto.toFixed(2)}` : ''
  switch (m.tipo) {
    case 'anclar': return m.numero_factura || 'Factura'
    case 'pago': return `Pago${m.metodo_pago ? ` ${m.metodo_pago}` : ''}${monto}`
    case 'reembolso': return `Reembolso${monto}`
    case 'ajuste': return `Ajuste${monto}`
    // Con documento sin texto, el motivo es el nombre del archivo; con texto, el motivo es el comentario (no un nombre).
    case 'comentario': return m.motivo && NOMBRE_DE_ARCHIVO.test(m.motivo) ? m.motivo : 'Documento adjunto'
    default: return m.motivo || `Comprobante ${m.tipo}`
  }
}

export function calcularVenta(venta: RxVenta): VentaConMovimientos {
  const ordenados = [...(venta.movimientos ?? [])].sort(
    (a, b) => new Date(a.fecha).getTime() - new Date(b.fecha).getTime()
  )

  let montoTotal = 0
  let totalPagado = 0
  let totalReembolsado = 0
  let facturado = false
  let anulado = false
  let ultimaFechaFactura: string | null = null
  let ultimaFechaPago: string | null = null
  let numeroFactura: string | null = null
  let comprobanteUrl: string | null = null
  let metodoPago: string | null = null
  let motivoAnulacion: string | null = null
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
    if (m.anulado) {
      // El movimiento no cuenta en los cálculos, pero su comprobante sigue siendo evidencia: se conserva en los archivos.
      if (m.comprobante_url && !urlsVistas.has(m.comprobante_url)) {
        urlsVistas.add(m.comprobante_url)
        documentosAdjuntos.push({ id: m.id, url: m.comprobante_url, nombre: `${nombreComprobante(m)} (anulado)`, origen: m.tipo })
      }
      continue
    }
    if (m.tipo === 'ajuste') montoTotal += m.monto ?? 0
    else if (m.tipo === 'pago') { totalPagado += m.monto ?? 0; metodoPago = m.metodo_pago ?? metodoPago; ultimaFechaPago = m.fecha }
    else if (m.tipo === 'reembolso') totalReembolsado += m.monto ?? 0
    else if (m.tipo === 'anclar' || m.tipo === 'facturar') {
      if (m.numero_factura) {
        facturado = true;
        numeroFactura = m.numero_factura;
        ultimaFechaFactura = m.fecha;
      }
    }
    else if (m.tipo === 'anular') {
      anulado = true
      if (m.motivo) motivoAnulacion = m.motivo
    }
    // Un documento adjuntado sin texto se guarda como 'comentario' con el nombre del archivo: no es una novedad.
    else if (m.tipo === 'comentario' && m.motivo && !(m.comprobante_url && NOMBRE_DE_ARCHIVO.test(m.motivo))) comentarios.push(m.motivo)
    
    if (m.comprobante_url && !urlsVistas.has(m.comprobante_url)) {
      urlsVistas.add(m.comprobante_url)
      comprobanteUrl = m.comprobante_url
      documentosAdjuntos.push({
        id: m.id,
        url: m.comprobante_url,
        nombre: nombreComprobante(m),
        origen: m.tipo
      })
    }
  }

  // Sin monto por factura, la fecha es la señal disponible: si el pago más
  // reciente es posterior a la última factura, ese pago aún no está cubierto
  // por ninguna factura, aunque la venta ya se haya facturado antes.
  const facturaAlDia = facturado && (
    !ultimaFechaPago || !ultimaFechaFactura ||
    new Date(ultimaFechaPago).getTime() <= new Date(ultimaFechaFactura).getTime()
  )

  return {
    venta,
    movimientos: ordenados,
    montoTotal,
    totalPagado,
    totalReembolsado,
    saldo: montoTotal - totalPagado + totalReembolsado,
    facturado,
    facturaAlDia,
    anulado,
    numeroFactura,
    comprobanteUrl,
    metodoPago,
    documentosAdjuntos,
    motivoAnulacion,
    textoComentarios: comentarios.join(' '),
    cantidadComentarios: comentarios.length,
    fechaUltimoMovimiento: ordenados[ordenados.length - 1]?.fecha ?? venta.created_at,
  }
}
